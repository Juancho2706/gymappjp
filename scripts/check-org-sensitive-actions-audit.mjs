import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const ORG_APP_DIR = join(ROOT, 'apps', 'web', 'src', 'app', 'org', '[slug]')
const ACTION_FILE_PATTERN = /(?:_actions[\\/].*\.actions\.ts|actions\.ts|route\.ts)$/
const MUTATION_PATTERN = /\.(insert|update|upsert|delete)\s*\(|\.rpc\s*\(|admin\.auth\.admin\.updateUserById\s*\(/
const AUDIT_PATTERN = /writeOrgAuditEvent\s*\(/
const ALLOWLIST = new Set([
  'apps/web/src/app/org/[slug]/setup-mfa/mfa.actions.ts',
])

function walk(dir) {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const offenders = []

for (const file of walk(ORG_APP_DIR)) {
  const normalized = relative(ROOT, file).replaceAll('\\', '/')
  if (!ACTION_FILE_PATTERN.test(normalized)) continue
  if (ALLOWLIST.has(normalized)) continue

  const source = readFileSync(file, 'utf8')
  if (!MUTATION_PATTERN.test(source)) continue
  if (AUDIT_PATTERN.test(source)) continue

  offenders.push(normalized)
}

if (offenders.length > 0) {
  console.error('Enterprise org mutation files missing writeOrgAuditEvent():')
  for (const offender of offenders) console.error(`- ${offender}`)
  process.exit(1)
}

console.log('OK: enterprise org mutation files include audit coverage.')
