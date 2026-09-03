// Force Babel to use a local config inside this repo.
// This prevents Babel from walking up to parent directories
// (e.g. ../Documents/tmp) where reading package.json can fail with EPERM.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

