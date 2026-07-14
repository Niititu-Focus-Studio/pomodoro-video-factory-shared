const assert = require("assert");
const { escapeFfmpegFilterPath } = require("./ffmpegUtils");

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

  console.log("All escapeFfmpegFilterPath tests passed successfully!");
}

runTests();
