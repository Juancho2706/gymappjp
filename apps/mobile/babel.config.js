const path = require('path')

// Set EXPO_ROUTER_APP_ROOT in the Babel worker process (monorepo fix)
// The env var must be available in the transform worker, not just the main process.
process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT ||
  path.resolve(__dirname, 'app')

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
