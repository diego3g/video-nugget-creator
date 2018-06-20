const fs = require("fs");
const parser = require("subtitles-parser");
const youtubedl = require("youtube-dl");
const ffmpeg = require("fluent-ffmpeg");
const { promisify } = require("util");
const { union } = require("underscore");

const utils = require("./utils");

module.exports = {
  /**
   * Parse subtitle file into array
   *
   * @param {String} file
   * @return {Array}
   */
  parseFile(file) {
    const subtitleContent = fs.readFileSync(file, "UTF-8");
    return parser.fromSrt(subtitleContent);
  },

  /**
   * Convert subtitle file format
   *
   * @param {String} fromFile
   * @param {String} toFile
   * @return {Promise}
   */
  convert(fromFile, toFile) {
    return new Promise((resolve, reject) => {
      ffmpeg(fromFile)
        .output(toFile)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });
  },

  /**
   * Remove unwanted information from parsed content
   *
   * @param {Array} parsedContent
   * @returns {Array}
   */
  clean(parsedContent) {
    /**
     * 1. Remove duplicates
     * 2. Remove line breaks
     */
    let cleanData = parsedContent
      .filter(
        (item, index) =>
          !parsedContent[index - 1]
            ? true
            : parsedContent[index - 1].text.indexOf(item.text) === -1
      )
      .map(item => {
        const hasNewLine = item.text.indexOf("\n");

        if (hasNewLine !== -1) {
          const [, after] = item.text.split("\n");

          return { ...item, text: after };
        }

        return item;
      });

    /**
     * Adjust endTime to next item startTime
     */
    cleanData = cleanData.map(
      (item, index) =>
        cleanData[index + 1]
          ? { ...item, endTime: cleanData[index + 1].startTime }
          : item
    );

    /**
     * Convert time format
     */
    cleanData = cleanData.map(item => ({
      ...item,
      startTime: utils.srtTimeToSeconds(item.startTime),
      endTime: utils.srtTimeToSeconds(item.endTime)
    }));

    return cleanData;
  },

  /**
   * Return parsed subtitle intervals
   *
   * Example intevals:
   * [
   *   ['00:01:19', '00:01:40'],
   *   ['00:04:30', '00:05:00']
   * ]
   *
   * @param {Array} parsedContent
   * @param {Array} intervals
   * @return {Array}
   */
  cutSubtitle(parsedContent, intervals) {
    return intervals.map(([from, to], index) => {
      const parsedFrom = utils.srtTimeToSeconds(from);
      const parsedTo = utils.srtTimeToSeconds(to);

      return parsedContent
        .filter(
          item =>
            parseFloat(item.startTime) >= parseFloat(parsedFrom) &&
            parseFloat(item.endTime) <= parseFloat(parsedTo)
        )
        .map(item => {
          const sum = intervals[index - 1]
            ? parseFloat(utils.srtTimeToSeconds(intervals[index - 1][1])) -
              parseFloat(utils.srtTimeToSeconds(intervals[index - 1][0]))
            : 0;

          return {
            ...item,
            startTime: parseFloat(
              parseFloat(item.startTime) - parseFloat(parsedFrom) + sum
            ).toFixed(1),
            endTime: parseFloat(
              parseFloat(item.endTime) - parseFloat(parsedFrom) + sum
            ).toFixed(1)
          };
        });
    });
  },

  /**
   * Get subtitle from Youtube
   *
   * @param {String} url
   * @param {String} from
   * @param {Array} intervals
   * @return {Array}
   */
  async get(url, intervals) {
    try {
      const getSubtitle = promisify(youtubedl.getSubs).bind(youtubedl);
      const unlink = promisify(fs.unlink);

      const [file] = await getSubtitle(url, {
        auto: true,
        lang: "pt",
        cwd: utils.tmpPath()
      });

      const fromFile = utils.tmpPath(file);
      const subFileName = utils.tmpPath(`${Date.now()}.srt`);

      await this.convert(fromFile, subFileName);
      const parsedSubtitle = this.parseFile(subFileName);

      await unlink(fromFile);
      await unlink(subFileName);

      const cleanedContent = this.clean(parsedSubtitle);

      const subtitles = this.cutSubtitle(cleanedContent, intervals);

      return union(...subtitles);
    } catch (err) {
      console.log("Erro ao gerar legendas: ", err);
      return false;
    }
  }
};
