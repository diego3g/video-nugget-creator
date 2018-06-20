const path = require("path");

module.exports = {
  /**
   * Return temp folder path
   *
   * @param {String} fileName
   * @returns {String}
   */
  tmpPath(fileName = "") {
    return path.resolve(__dirname, "..", "tmp", fileName);
  },

  /**
   * Convert SRT time to seconds
   *
   * Example: 00:01:30,330 => 90.3
   *
   * @param {String} time
   * @returns {Number}
   */
  srtTimeToSeconds(time) {
    const [hours, minutes, seconds] = time.split(":");
    return parseFloat(
      hours * 60 * 60 + minutes * 60 + parseFloat(seconds.replace(",", "."))
    ).toFixed(1);
  }
};
