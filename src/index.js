const subtitle = require("./lib/subtitle");
const video = require("./lib/video");

const url = "https://www.youtube.com/watch?v=gBmnB7BwSRA";
const intervals = [["00:01:19", "00:01:40"], ["00:04:30", "00:05:00"]];

(async () => {
  const subtitles = await subtitle.get(url, intervals);
  const { best: format } = await video.formats(url);

  const fileName = video.generate(url, format, intervals, subtitles);
})();
