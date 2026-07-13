const fs = require("fs");
const path = require("path");
const ffmpeg = require("./ffmpegCore");

/**
 * Executes the render pipeline.
 *
 * @param {Object} manifest
 * @param {string} manifest.focusVideoPath
 * @param {string} manifest.breakVideoPath
 * @param {string} manifest.timerTextColor
 * @param {boolean} manifest.isPreview
 * @param {number} manifest.sessionCount
 * @param {Array} manifest.audioPlan
 * @param {string|null} manifest.bellPath
 * @param {string} manifest.fontItalicPath
 * @param {string} manifest.tempDir
 * @param {string} manifest.outDir
 * @param {string} manifest.finalFilename
 * @param {boolean} manifest.keepTempFiles
 * @param {Function} onProgress - (progressPercentage, stepDescription) => void
 * @returns {Promise<string>} The path to the final rendered video.
 */
async function executeRenderPipeline(manifest, onProgress) {
  const {
    focusVideoPath,
    breakVideoPath,
    timerTextColor,
    isPreview,
    sessionCount,
    audioPlan,
    bellPath,
    fontItalicPath,
    tempDir,
    outDir,
    finalFilename,
    keepTempFiles,
    ffmpegProgress,
  } = manifest;
  let lastProgress = 0;
  let lastStep = "Starting";
  const report = (progress, step, extra = {}) => {
    lastProgress = progress;
    lastStep = step;
    if (onProgress) onProgress(progress, step, extra);
  };
  const ffmpegOptions = ffmpegProgress ? {
    onProgress: ({ currentTimeSeconds }) => report(lastProgress, lastStep, { currentTimeSeconds }),
  } : {};

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    // Step 2: Normalize
    report(20, "Normalizing video clips");
    const focusNormPath = path.join(tempDir, "focus-normalized.mp4");
    const breakNormPath = path.join(tempDir, "break-normalized.mp4");

    await ffmpeg.normalizeVideo(focusVideoPath, focusNormPath, ffmpegOptions);
    await ffmpeg.normalizeVideo(breakVideoPath, breakNormPath, ffmpegOptions);

    // Step 3: Render Segments
    report(40, "Rendering segments");
    const segmentFiles = [];
    let segmentsDone = 0;
    const actualSessionCount = isPreview ? 1 : sessionCount;

    for (const segment of audioPlan) {
      const segmentVideoPath = path.join(tempDir, `${segment.type}-${segment.sessionIndex}-video.mp4`);
      const segmentPath = path.join(tempDir, `${segment.type}-${segment.sessionIndex}.mp4`);
      
      await ffmpeg.createSegment(
        segment.type === 'focus' ? focusNormPath : breakNormPath,
        segmentVideoPath,
        segment.durationSeconds,
        `${segment.type === 'focus' ? 'Focus' : 'Break'} ${segment.sessionIndex}/${actualSessionCount}`,
        segment.type === 'focus',
        timerTextColor || "0x7D6556",
        fontItalicPath,
        ffmpegOptions
      );

      await ffmpeg.attachAudioToSegment(
        segmentVideoPath,
        segment.audioPath,
        segmentPath,
        segment.durationSeconds,
        bellPath || null,
        ffmpegOptions
      );
      
      segmentFiles.push(segmentPath);
      segmentsDone++;
      if (onProgress) {
        report(40 + Math.floor((segmentsDone / audioPlan.length) * 45), `Rendered ${segment.type} ${segment.sessionIndex}`);
      }
    }

    // Step 6: Concatenate
    report(90, "Concatenating segments");
    const listPath = path.join(tempDir, "segments.txt");
    const listContent = segmentFiles
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    const finalPath = path.join(outDir, finalFilename);

    await ffmpeg.concatSegments(listPath, finalPath, ffmpegOptions);

    if (!keepTempFiles) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error("Failed to clean up temp files:", err);
      }
    }

    report(100, "Completed");
    return finalPath;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  executeRenderPipeline,
};
