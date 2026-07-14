const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const defaultConfigDir = path.join(projectRoot, "config");
const defaultFontsConfigPath = path.join(defaultConfigDir, "fonts.conf");

function isInsideDirectory(candidate, directory) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedDirectory = path.resolve(directory);
  return (
    resolvedCandidate === resolvedDirectory ||
    resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

function assertTrustedPath(candidate, trustedRoots, label) {
  if (!trustedRoots.some((root) => isInsideDirectory(candidate, root))) {
    throw new Error(`${label} must be inside a trusted worker directory`);
  }
}

function getWindowsFontconfigEnv({
  env = process.env,
  fontsConfigPath = defaultFontsConfigPath,
  platform = process.platform,
} = {}) {
  if (platform !== "win32") return {};

  const resolvedFontsConfigPath = path.resolve(fontsConfigPath);
  const fontsConfigDir = path.dirname(resolvedFontsConfigPath);
  const workerRoot = path.resolve(env.WORKER_ROOT || projectRoot);
  const cacheDir = path.join(workerRoot, "fontconfig-cache");
  const trustedRoots = [...new Set([projectRoot, workerRoot].map((root) => path.resolve(root)))];

  if (!fs.existsSync(resolvedFontsConfigPath)) {
    throw new Error(`Windows Fontconfig config missing: ${resolvedFontsConfigPath}`);
  }

  assertTrustedPath(resolvedFontsConfigPath, trustedRoots, "FONTCONFIG_FILE");
  assertTrustedPath(fontsConfigDir, trustedRoots, "FONTCONFIG_PATH");
  assertTrustedPath(cacheDir, trustedRoots, "FONTCONFIG_CACHE");

  fs.mkdirSync(cacheDir, { recursive: true });

  return {
    FONTCONFIG_FILE: resolvedFontsConfigPath,
    FONTCONFIG_PATH: fontsConfigDir,
    FONTCONFIG_CACHE: cacheDir,
  };
}

module.exports = {
  getWindowsFontconfigEnv,
  isInsideDirectory,
  _defaults: {
    projectRoot,
    defaultFontsConfigPath,
  },
};
