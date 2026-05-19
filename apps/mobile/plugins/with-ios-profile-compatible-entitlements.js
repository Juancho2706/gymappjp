const { withEntitlementsPlist } = require('@expo/config-plugins')

module.exports = function withIosProfileCompatibleEntitlements(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment']
    delete config.modResults['com.apple.developer.associated-domains']
    return config
  })
}
