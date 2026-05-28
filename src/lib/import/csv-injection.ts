const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

export type SanitizationResult = {
  value: string
  sanitized: boolean
}

// Prevents CSV injection (CVE-2014-3524 class). A spreadsheet cell starting
// with these characters can be interpreted as a formula by Excel/Sheets when
// the data round-trips through CSV. Prefixing with a single quote forces
// text rendering.
export function sanitizeCell(input: unknown): SanitizationResult {
  if (input === null || input === undefined) {
    return { value: '', sanitized: false }
  }
  const value = typeof input === 'string' ? input : String(input)
  if (value.length === 0) {
    return { value, sanitized: false }
  }
  const first = value[0]
  if (DANGEROUS_PREFIXES.includes(first)) {
    return { value: `'${value}`, sanitized: true }
  }
  return { value, sanitized: false }
}

export function isDangerousCell(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false
  return DANGEROUS_PREFIXES.includes(input[0])
}
