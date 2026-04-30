import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const baselinePath = join(OUTPUT_DIR, 'nutrition-empty-meals-audit-baseline.json')
const currentPath = join(OUTPUT_DIR, 'nutrition-empty-meals-audit.json')
const outPath = join(OUTPUT_DIR, 'nutrition-empty-meals-delta.md')

if (!existsSync(baselinePath)) {
  console.error('No existe baseline. Ejecuta: npm run audit:nutrition-empty-meals:baseline')
  process.exit(1)
}
if (!existsSync(currentPath)) {
  console.error('No existe audit actual. Ejecuta auditoria primero.')
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const current = JSON.parse(readFileSync(currentPath, 'utf8'))

const bRows = Array.isArray(baseline?.rows) ? baseline.rows : []
const cRows = Array.isArray(current?.rows) ? current.rows : []

const keyOf = (r) => `${r.plan_id}|${r.meal_name}`
const bSet = new Set(bRows.map(keyOf))
const cSet = new Set(cRows.map(keyOf))

const resolved = [...bSet].filter((k) => !cSet.has(k))
const newOnes = [...cSet].filter((k) => !bSet.has(k))

let md = ''
md += '# Delta Saneamiento Nutricion (Baseline vs Actual)\n\n'
md += `Generado: ${new Date().toISOString()}\n\n`
md += `Baseline filas: **${bRows.length}**\n\n`
md += `Actual filas: **${cRows.length}**\n\n`
md += `Resueltas desde baseline: **${resolved.length}**\n\n`
md += `Nuevas desde baseline: **${newOnes.length}**\n\n`

if (resolved.length > 0) {
  md += '## Resueltas\n\n'
  resolved.slice(0, 100).forEach((k) => {
    const [planId, mealName] = k.split('|')
    md += `- ${planId} :: ${mealName}\n`
  })
  md += '\n'
}

if (newOnes.length > 0) {
  md += '## Nuevas\n\n'
  newOnes.slice(0, 100).forEach((k) => {
    const [planId, mealName] = k.split('|')
    md += `- ${planId} :: ${mealName}\n`
  })
  md += '\n'
}

if (resolved.length === 0 && newOnes.length === 0) {
  md += 'Sin cambios respecto al baseline.\n'
}

writeFileSync(outPath, md, 'utf8')
console.log(`Delta generado: ${outPath}`)
