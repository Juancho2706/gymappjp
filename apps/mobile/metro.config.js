const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, 'app')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

module.exports = config
