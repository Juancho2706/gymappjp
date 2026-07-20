const { withGradleProperties } = require('expo/config-plugins')

const JVMARGS_KEY = 'org.gradle.jvmargs'
const KOTLIN_DAEMON_JVMARGS_KEY = 'kotlin.daemon.jvmargs'
const PARALLEL_KEY = 'org.gradle.parallel'
const CONFIGUREONDEMAND_KEY = 'org.gradle.configureondemand'

const DEFAULT_JVMARGS = '-Xmx5g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8'
const DEFAULT_KOTLIN_DAEMON_JVMARGS = '-Xmx2g -XX:MaxMetaspaceSize=1g'

function upsert(items, key, value) {
  const idx = items.findIndex((item) => item.type === 'property' && item.key === key)
  const entry = { type: 'property', key, value }
  if (idx >= 0) {
    items[idx] = entry
  } else {
    items.push(entry)
  }
}

module.exports = function withGradleJvmArgs(config, props = {}) {
  return withGradleProperties(config, (config) => {
    upsert(config.modResults, JVMARGS_KEY, props.jvmArgs || DEFAULT_JVMARGS)
    upsert(config.modResults, KOTLIN_DAEMON_JVMARGS_KEY, props.kotlinDaemonJvmArgs || DEFAULT_KOTLIN_DAEMON_JVMARGS)
    upsert(config.modResults, PARALLEL_KEY, 'true')
    upsert(config.modResults, CONFIGUREONDEMAND_KEY, 'true')
    return config
  })
}
