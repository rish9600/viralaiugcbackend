/**
 * Gets the duration of a video file using ffprobe
 * @param {string} videoUrl URL of the video
 * @returns {Promise<number>} Duration in seconds or null if it cannot be determined
 */
async function getVideoDuration(videoUrl, execPromise) {
  if (!videoUrl) return null;

  try {
    const ffprobeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoUrl}"`;
    const { stdout } = await execPromise(ffprobeCommand);

    const duration = parseFloat(stdout.trim());
    if (isNaN(duration)) {
      console.warn(`Could not parse video duration from: ${stdout}`);
      return null;
    }

    const roundedDuration = Math.floor(duration);

    console.log(
      `Detected video duration: ${duration} > ${roundedDuration} secs for ${videoUrl}`
    );
    return roundedDuration;
  } catch (err) {
    console.warn(`Could not detect video duration: ${err.message}`);
    return null;
  }
}

module.exports = getVideoDuration;
