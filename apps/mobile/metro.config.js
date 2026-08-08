const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, 'app')

const config = getDefaultConfig(projectRoot)

// Vigilar la raiz entera del monorepo deja al watcher de Windows caminando `.git`,
// `apps/web` y los worktrees; alcanza con lo que el bundle nativo resuelve.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Los worktrees de agentes viven bajo `.claude/worktrees` con su propio node_modules:
// vigilar el monorepo entero los incluye y el watcher de Metro nunca llega a arrancar.
const previousBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(previousBlockList)
    ? previousBlockList
    : previousBlockList
      ? [previousBlockList]
      : []),
  /[\\/]\.claude[\\/]worktrees[\\/].*/,
]

module.exports = withNativeWind(config, { input: './global.css' })
