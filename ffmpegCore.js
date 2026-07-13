const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function parseProgressLine(line) {
  const [key, value] = line.split('=');
  if (key === 'out_time_ms') return Number(value) / 1000000;
  if (key === 'out_time') {
    const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value);
    if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return null;
}

function withProgressArgs(command, args, onProgress) {
  if (command !== 'ffmpeg' || !onProgress) return args;
  const insertAt = args[0] === '-y' ? 1 : 0;
  return [...args.slice(0, insertAt), '-progress', 'pipe:1', '-nostats', ...args.slice(insertAt)];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, withProgressArgs(command, args, options.onProgress));
    let stdout = "";
    let stderr = "";
    let progressBuffer = "";

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      if (!options.onProgress) return;
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const currentTimeSeconds = parseProgressLine(line);
        if (currentTimeSeconds !== null && Number.isFinite(currentTimeSeconds)) options.onProgress({ currentTimeSeconds });
      }
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(`Command failed with code ${code}\nStderr: ${stderr}`),
        );
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

async function probeMedia(filePath) {
  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ];
  try {
    const { stdout } = await runCommand("ffprobe", args);
    return JSON.parse(stdout);
  } catch (error) {
    console.error("Failed to probe media:", error.message);
    throw new Error("Failed to probe media: " + error.message);
  }
}

async function normalizeVideo(inputPath, outputPath, options = {}) {
  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
    "-r",
    "30",
    "-an", // remove audio
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    outputPath,
  ];
  await runCommand("ffmpeg", args, options);
  return outputPath;
}

async function createSegment(
  inputPath,
  outputPath,
  durationSeconds,
  label,
  isFocus,
  timerTextColor = "0x7D6556",
  fontItalicPath = null,
  options = {},
) {
  const formatColorForFFmpeg = (color) => {
    if (!color) return "0x7D6556";
    const rgbaMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
    );
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
      const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
      const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
      let a = "";
      if (rgbaMatch[4]) {
        a = Math.round(parseFloat(rgbaMatch[4]) * 255)
          .toString(16)
          .padStart(2, "0");
      }
      return `0x${r}${g}${b}${a}`;
    }
    if (color.startsWith("#")) {
      return `0x${color.slice(1)}`;
    }
    return color;
  };

  const safeColor = formatColorForFFmpeg(timerTextColor);

  // Build drawtext filters
  const timerExpr = `%{eif\\:trunc((${durationSeconds}-t)/60)\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t\\,60)\\:d\\:2}`;

  if (!fontItalicPath) {
    fontItalicPath = path.join(__dirname, "../be/src/assets/fonts/CormorantGaramond-Italic.ttf");
  }

  const drawtextFilter = `drawtext=text='${label}':fontfile='${fontItalicPath.replace(/\\/g, '/')}':x=(w/2-tw)/2:y=(h-th)/2-120:fontsize=56:fontcolor=${safeColor},drawtext=text='${timerExpr}':x=(w/2-tw)/2:y=(h-th)/2+40:fontsize=180:fontcolor=${safeColor}`;

  const args = [
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    inputPath,
    "-t",
    String(durationSeconds),
    "-vf",
    drawtextFilter,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    outputPath,
  ];
  await runCommand("ffmpeg", args, options);
  return outputPath;
}

async function concatSegments(segmentsListFile, outputPath, options = {}) {
  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    segmentsListFile,
    "-c",
    "copy",
    outputPath,
  ];
  await runCommand("ffmpeg", args, options);
  return outputPath;
}

async function attachAudio(videoPath, audioPath, outputPath, durationSeconds, options = {}) {
  const args = [
    "-y",
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    audioPath,
    "-t",
    String(durationSeconds),
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-shortest",
    outputPath,
  ];
  await runCommand("ffmpeg", args, options);
  return outputPath;
}

async function attachAudioToSegment(
  videoPath,
  audioPath,
  outputPath,
  durationSeconds,
  bellPath = null,
  options = {},
) {
  const fadeOutStart = Math.max(0, durationSeconds - 1);
  const args = [
    "-y",
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(durationSeconds),
    "-map",
    "0:v:0",
    "-shortest",
  ];
  if (bellPath) {
    args.splice(7, 0, "-i", bellPath);
    args.push(
      "-filter_complex",
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=1[music];[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.35[bell];[music][bell]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]`,
      "-map",
      "[a]",
    );
  } else {
    args.push(
      "-af",
      `aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=1`,
      "-map",
      "1:a:0",
    );
  }
  args.push(outputPath);
  await runCommand("ffmpeg", args, options);
  return outputPath;
}

async function reformatVideo(
  inputPath,
  outputPath,
  { zoom = 1.0, x = 0, y = 0, topBar = 0, bottomBar = 0 },
) {
  const metadata = await probeMedia(inputPath);
  const videoStream = metadata.streams.find((s) => s.codec_type === "video");
  const hasAudio = metadata.streams.some((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("No video stream found in the input file.");
  }

  const win = parseInt(videoStream.width);
  const hin = parseInt(videoStream.height);

  const scale = Math.min(1920 / win, 1080 / hin);
  const ws = Math.round((win * scale * zoom) / 2) * 2;
  const hs = Math.round((hin * scale * zoom) / 2) * 2;
  const px = Math.round((1920 - ws) / 2 + x);
  const py = Math.round((1080 - hs) / 2 + y);

  let drawboxes = [];
  if (topBar > 0) {
    drawboxes.push(`drawbox=x=0:y=0:w=1920:h=${topBar}:color=black:t=fill`);
  }
  if (bottomBar > 0) {
    drawboxes.push(`drawbox=x=0:y=1080-${bottomBar}:w=1920:h=${bottomBar}:color=black:t=fill`);
  }

  const filterComplexArr = [
    `[0:v]scale=${ws}:${hs}:force_original_aspect_ratio=disable[vscaled]`,
    `color=c=black:s=1920x1080[bg]`,
    `[bg][vscaled]overlay=x=${px}:y=${py}:shortest=1${drawboxes.length > 0 ? '[vover]' : '[vout]'}`,
  ];

  if (drawboxes.length > 0) {
    filterComplexArr.push(`[vover]${drawboxes.join(',')}[vout]`);
  }
  
  const filterComplex = filterComplexArr.join(';');

  const args = [
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
  ];

  if (hasAudio) {
    args.push("-map", "0:a:0");
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  );

  if (hasAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push(outputPath);

  await runCommand("ffmpeg", args);
  return outputPath;
}

module.exports = {
  probeMedia,
  normalizeVideo,
  createSegment,
  concatSegments,
  attachAudio,
  attachAudioToSegment,
  reformatVideo,
};
