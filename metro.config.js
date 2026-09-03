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

// Fix zustand@5 ESM `import.meta` on web: forza i build CJS che non usano import.meta
// vedi dist/_expo/.../entry-*.js SyntaxError: Cannot use 'import.meta' outside a module
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false,
};

module.exports = config;

