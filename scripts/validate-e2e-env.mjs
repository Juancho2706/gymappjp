import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'E2E_COACH_SLUG',
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
]

const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim().length === 0)

if (missing.length > 0) {
  console.error('Faltan variables E2E requeridas:')
  for (const key of missing) console.error(`- ${key}`)
  process.exit(1)
}

const mask = (value) => {
  const s = String(value ?? '')
  if (s.length <= 6) return '***'
  return `${s.slice(0, 2)}***${s.slice(-2)}`
}

console.log('E2E env check OK:')
console.log(`- E2E_COACH_SLUG: ${process.env.E2E_COACH_SLUG}`)
console.log(`- E2E_CLIENT_EMAIL: ${mask(process.env.E2E_CLIENT_EMAIL)}`)
console.log(`- E2E_CLIENT_PASSWORD: ${mask(process.env.E2E_CLIENT_PASSWORD)}`)
console.log(`- NEXT_PUBLIC_SUPABASE_URL: ${mask(process.env.NEXT_PUBLIC_SUPABASE_URL)}`)

// Opcionales del spec del hold (tests/exec-hold-superset.spec.ts, W6.10). NO entran a `required`:
// sin ellas ese spec se omite solo, y el resto de la suite no las necesita. Ver
// docs/testing/E2E_PERSONAS.md, seccion "Plan canonico del hold".
const optional = [
  // Id del plan sintetico que imprime `pnpm seed:e2e-personas`. No es un secreto.
  { key: 'E2E_HOLD_PLAN_ID', secret: false },
  // Assert de DB de solo lectura: anon key + login del propio alumno. NUNCA la service_role.
  { key: 'E2E_SUPABASE_URL', secret: true },
  { key: 'E2E_SUPABASE_ANON_KEY', secret: true },
]

console.log('Opcionales (spec del hold; ausentes = ese spec se omite):')
for (const { key, secret } of optional) {
  const value = process.env[key]
  const present = !!value && String(value).trim().length > 0
  if (!present) console.log(`- ${key}: ausente`)
  else console.log(`- ${key}: ${secret ? mask(value) : value}`)
}
