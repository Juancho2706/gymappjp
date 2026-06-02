const path = require('path')

process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT ||
  path.resolve(__dirname, 'app')

module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_ROUTER_APP_ROOT)
  return {
    presets: [
      // NativeWind: jsxImportSource lets className flow through JSX.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Reanimated v4 uses the worklets plugin; must be the last entry.
    plugins: ['react-native-worklets/plugin'],
  }
}
