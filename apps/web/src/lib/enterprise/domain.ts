/**
 * Returns the enterprise subdomain.
 * Reads ENTERPRISE_DOMAIN env var with fallback so tests and
 * local dev can override without touching middleware.
 */
export function getEnterpriseDomain(): string {
  return process.env.ENTERPRISE_DOMAIN ?? 'enterprise.eva-app.cl'
}

export function getEnterpriseUrl(): string {
  const domain = getEnterpriseDomain()
  return `https://${domain}`
}

export function isEnterpriseDomain(host: string): boolean {
  return host === getEnterpriseDomain()
}
