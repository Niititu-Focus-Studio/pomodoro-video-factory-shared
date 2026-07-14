const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { escapeFfmpegFilterPath } = require("./ffmpegUtils");
const { _internals } = require("./ffmpegCore");

function makeFontsConfig(root) {
  const configDir = path.join(root, "config");
  fs.mkdirSync(configDir, { recursive: true });
  const fontsConfigPath = path.join(configDir, "fonts.conf");
  fs.writeFileSync(
    fontsConfigPath,
    '<?xml version="1.0"?><fontconfig><dir>C:/Windows/Fonts</dir></fontconfig>',
  );
  return fontsConfigPath;
}

function runTests() {
  // Test 1: Windows path
  assert.strictEqual(
    escapeFfmpegFilterPath("D:\\Projects\\worker\\assets\\font.ttf"),
    "D\\:/Projects/worker/assets/font.ttf",
    "Should convert backslashes and escape Windows drive colon",
  );

  // Test 2: Windows path already using forward slashes
  assert.strictEqual(
    escapeFfmpegFilterPath("D:/Projects/worker/assets/font.ttf"),
    "D\\:/Projects/worker/assets/font.ttf",
    "Should escape Windows drive colon even if using forward slashes",
  );

  // Test 3: macOS path
  assert.strictEqual(
    escapeFfmpegFilterPath("/Users/restu/project/assets/font.ttf"),
    "/Users/restu/project/assets/font.ttf",
    "Should not modify standard macOS paths",
  );

  // Test 4: Paths containing spaces
  assert.strictEqual(
    escapeFfmpegFilterPath("D:\\Projects\\My Worker\\assets\\my font.ttf"),
    "D\\:/Projects/My Worker/assets/my font.ttf",
    "Should handle paths with spaces correctly",
  );

  // Test 5: Prevention of double escaping
  assert.strictEqual(
    escapeFfmpegFilterPath("D\\:/Projects/worker/assets/font.ttf"),
    "D\\:/Projects/worker/assets/font.ttf",
    "Should prevent double escaping of already escaped paths",
  );

  // Test 6: Prevention of double escaping with backslashes
  assert.strictEqual(
    escapeFfmpegFilterPath("D\\:\\Projects\\worker\\assets\\font.ttf"),
    "D\\:/Projects/worker/assets/font.ttf",
    "Should prevent double escaping and normalize backslashes",
  );

  const workerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fontconfig-worker-"));
  try {
    const fontsConfigPath = makeFontsConfig(workerRoot);
    const windowsSpawnOptions = _internals.buildSpawnOptions("ffmpeg", {
      platform: "win32",
      env: { WORKER_ROOT: workerRoot, EXISTING_VALUE: "kept" },
      fontsConfigPath,
    });
    assert.strictEqual(windowsSpawnOptions.env.EXISTING_VALUE, "kept");
    assert.strictEqual(windowsSpawnOptions.env.FONTCONFIG_FILE, fontsConfigPath);
    assert.strictEqual(windowsSpawnOptions.env.FONTCONFIG_PATH, path.dirname(fontsConfigPath));
    assert.strictEqual(
      windowsSpawnOptions.env.FONTCONFIG_CACHE,
      path.join(workerRoot, "fontconfig-cache"),
    );
    assert.strictEqual(fs.existsSync(windowsSpawnOptions.env.FONTCONFIG_CACHE), true);

    const macSpawnOptions = _internals.buildSpawnOptions("ffmpeg", {
      platform: "darwin",
      env: { WORKER_ROOT: workerRoot },
      fontsConfigPath: path.join(workerRoot, "missing.conf"),
    });
    assert.strictEqual(macSpawnOptions, undefined);

    assert.throws(
      () =>
        _internals.buildSpawnOptions("ffmpeg", {
          platform: "win32",
          env: { WORKER_ROOT: workerRoot },
          fontsConfigPath: path.join(workerRoot, "missing.conf"),
        }),
      /Windows Fontconfig config missing/,
    );
  } finally {
    fs.rmSync(workerRoot, { recursive: true, force: true });
  }

  const fontPath = "D:\\Projects\\worker\\uploads\\job\\assets\\CormorantGaramond-Italic.ttf";
  const segmentArgs = _internals.buildCreateSegmentArgs({
    inputPath: "input.mp4",
    outputPath: "output.mp4",
    durationSeconds: 15,
    label: "Focus 1/1",
    timerTextColor: "0x7D6556",
    fontItalicPath: fontPath,
  });
  const drawtextFilter = segmentArgs[segmentArgs.indexOf("-vf") + 1];
  assert.match(drawtextFilter, /fontfile='D\\:\/Projects\/worker\/uploads\/job\/assets\/CormorantGaramond-Italic\.ttf'/);
  assert.deepStrictEqual(segmentArgs.slice(-7), [
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "output.mp4",
  ]);

  assert.deepStrictEqual(
    _internals.buildNormalizeVideoArgs("input.mp4", "output.mp4"),
    [
      "-y",
      "-i",
      "input.mp4",
      "-vf",
      "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
      "-r",
      "30",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "output.mp4",
    ],
  );

  console.log("All escapeFfmpegFilterPath tests passed successfully!");
}

runTests();
