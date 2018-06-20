const youtubedl = require("youtube-dl");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { sortBy, max, union } = require("underscore");
const unlink = promisify(fs.unlink);

const utils = require("./utils");

module.exports = {
  /**
   * List available video formats
   *
   * @param {String} url
   * @return {Object}
   */
  async formats(url) {
    const getInfo = promisify(youtubedl.getInfo);

    const video = await getInfo(url);

    const formats = video.formats.map(item => ({
      id: item.format_id,
      type: item.ext,
      width: item.width,
      height: item.height,
      video: !!item.resolution,
      audio: item.acodec !== "none" ? item.acodec : false,
      resolution:
        item.resolution ||
        (item.width ? item.width + "x" + item.height : "audio only")
    }));

    return {
      formats: sortBy(formats, "width"),
      best:
        formats.find(
          item => item.type === "mp4" && item.width >= 1280 && item.audio
        ) || max(formats.filter(item => item.audio), item => item.width)
    };
  },

  download(url, format) {
    return new Promise(resolve => {
      const video = youtubedl(url, [`--format=${format.id}`]);
      const filePath = utils.tmpPath(`${Date.now()}.${format.type}`);

      const stream = fs.createWriteStream(filePath);
      video.pipe(stream);

      let totalSize = null;
      let currentPos = null;

      video.on("info", info => {
        console.log("Download started:");
        totalSize = info.size;
      });

      video.on("data", chunk => {
        currentPos += chunk.length;
        if (totalSize) {
          progress = ((currentPos / totalSize) * 100).toFixed(2);

          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          process.stdout.write(`${progress}%`);
        }
      });

      stream.on("finish", () => resolve(filePath));
    });
  },

  /**
   * Parse intervals to ffmpeg format
   *
   * @param {Array} intervals
   * @returns {Array}
   */
  parseIntervals(intervals) {
    return intervals.map(([from, to]) => {
      const parsedFrom = utils.srtTimeToSeconds(from);
      const duration = utils.srtTimeToSeconds(to) - parsedFrom;

      return [from, duration];
    });
  },

  /**
   * Create each part of video interval to merge
   *
   * @param {String} file
   * @param {Array} intervals
   */
  async getVideoParts(file, intervals) {
    const tmpPrefix = Date.now();

    return await Promise.all(
      intervals.map(([from, duration], i) => {
        const partFileName = utils.tmpPath(`${tmpPrefix}-part-${i}.mp4`);

        return new Promise((resolve, reject) => {
          ffmpeg(file)
            .seekInput(from)
            .duration(duration)
            .output(partFileName)
            .on("end", () => resolve(partFileName))
            .on("error", reject)
            .run();
        });
      })
    );
  },

  /**
   * Merge multiple videos
   *
   * @param {Array} parts
   * @returns {String}
   */
  mergeVideos(parts) {
    return new Promise(resolve => {
      const final = parts.reduce(
        (result, inputItem) => result.addInput(inputItem),
        ffmpeg()
      );

      const fileName = utils.tmpPath(`${Date.now()}.mp4`);

      final.mergeToFile(fileName).on("end", async () => {
        await Promise.all(
          parts.map(async part => {
            await unlink(part);
          })
        );
        resolve(fileName);
      });
    });
  },

  /**
   * Generate video filters for subtitle
   *
   * @param {Array} subtitles
   * @returns {Array}
   */
  generateSubtitleFilters(subtitles) {
    const filters = subtitles.map(item => {
      const isMultiline = item.text.length > 30;

      const filter = [];

      let options = {
        enable: `between(t,${item.startTime},${item.endTime})`,
        fontfile: path.resolve(__dirname, "../assets/source_sans_bold.ttf"),
        fontcolor: "white",
        x: "(main_w/2-text_w/2)",
        text: item.text,
        fontsize: 48,
        y: "(main_h-70)"
      };

      if (isMultiline) {
        const pos = item.text.substr(0, 24).lastIndexOf(" ");

        options = {
          ...options,
          text: item.text.substr(0, pos),
          fontsize: 36,
          y: "(main_h-86)"
        };

        additional = {
          ...options,
          text: item.text.substr(pos),
          fontsize: 36,
          y: "(main_h-44)"
        };
      }

      filter.push({
        filter: "drawtext",
        options
      });

      if (additional) {
        filter.push({
          filter: "drawtext",
          options: additional
        });
      }

      return filter;
    });

    return union(...filters);
  },
  /**
   * Generate video nugget
   *
   * @param {String} url
   * @param {Number} format
   */
  async generate(url, format, intervals, subtitles) {
    // const file = await this.download(url, format);
    const file = utils.tmpPath("1529519279001.mp4");

    const parsedIntervals = this.parseIntervals(intervals);
    const parts = await this.getVideoParts(file, parsedIntervals);
    const merged = await this.mergeVideos(parts);

    const subFilters = this.generateSubtitleFilters(subtitles);

    ffmpeg(merged)
      .videoFilters([
        "crop=800:720:240:0",
        "pad=iw:ih+200:0:100:#7159C1",
        ...subFilters
      ])
      .output("final.mp4")
      .on("end", () => unlink(merged))
      .on("error", err => console.log(err))
      .run();
  }
};
