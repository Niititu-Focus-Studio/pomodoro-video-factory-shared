function escapeFfmpegFilterPath(filePath) {
  if (typeof filePath !== "string") return filePath;

  // Prevent double escaping by first removing existing escape on the drive letter
  let normalized = filePath.replace(/^([A-Za-z])\\:/, "$1:");

  // Convert all Windows backslashes to forward slashes
  normalized = normalized.replace(/\\/g, "/");

  // Escape the Windows drive colon for FFmpeg filter parsing
  normalized = normalized.replace(/^([A-Za-z]):/, "$1\\:");

  return normalized;
}

module.exports = {
  escapeFfmpegFilterPath,
};
