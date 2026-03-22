// Explicit Metro config to prevent metro-config from walking up parent directories
// (which can fail with EPERM on this machine).
//
// Expo provides a default Metro config generator that we can reuse.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Babel from doing an additional upward lookup for `.babelrc` / `package.json` config.
// This avoids crashes when it reaches parent directories where `package.json` is unreadable.
config.transformer = {
  ...config.transformer,
  enableBabelRCLookup: false,
};

module.exports = config;

