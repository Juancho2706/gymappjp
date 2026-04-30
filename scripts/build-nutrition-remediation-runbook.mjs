import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const inputPath = join(OUTPUT_DIR, 'nutrition-empty-meals-audit.json')
const outPath = join(OUTPUT_DIR, 'nutrition-empty-meals-remediation-runbook.md')

const raw = readFileSync(inputPath, 'utf8')
const parsed = JSON.parse(raw)
const rows = Array.isArray(parsed?.rows) ? parsed.rows : []

const groups = new Map()
for (const r of rows) {
  const coachKey = `${r.coach_slug}|${r.coach_name}`
  const planKey = `${r.plan_id}|${r.client_name}|${r.plan_name}`
  if (!groups.has(coachKey)) groups.set(coachKey, new Map())
  const plans = groups.get(coachKey)
  if (!plans.has(planKey)) plans.set(planKey, [])
  plans.get(planKey).push(r)
}

let md = ''
md += '# Runbook Saneamiento Nutricion - Planes con Comidas Vacias\n\n'
md += `Generado: ${new Date().toISOString()}\n\n`
md += `Casos detectados: **${rows.length}** filas de comida vacia\n\n`
md += '## Reglas de seguridad\n\n'
md += '- No borrar `daily_nutrition_logs` ni `nutrition_meal_logs`.\n'
md += '- No borrar planes activos en produccion para corregir vacios.\n'
md += '- Correccion in-place en builder (agregar >= 1 alimento por comida vacia).\n\n'
md += '## Checklist operativo por caso\n\n'
md += '- [ ] Abrir plan en builder del coach.\n'
md += '- [ ] Completar cada comida vacia con al menos 1 alimento.\n'
md += '- [ ] Guardar y verificar vista alumno (checks/anillos).\n'
md += '- [ ] Verificar vista coach (historial y macros).\n'
md += '- [ ] Marcar caso como resuelto en este runbook.\n\n'

for (const [coachKey, plans] of groups.entries()) {
  const [coachSlug, coachName] = coachKey.split('|')
  md += `## Coach ${coachName} (${coachSlug})\n\n`
  for (const [planKey, mealRows] of plans.entries()) {
    const [planId, clientName, planName] = planKey.split('|')
    const first = mealRows[0]
    const meals = mealRows
      .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
      .map((m) => `\`${m.meal_name}\``)
      .join(', ')
    md += `### Alumno: ${clientName}\n`
    md += `- Plan: ${planName}\n`
    md += `- Plan ID: \`${planId}\`\n`
    md += `- Ultimo log: ${first.last_log_date ?? 'N/A'}\n`
    md += `- Logs: ${first.daily_logs_count ?? 0} | Completadas: ${first.completed_marks ?? 0}\n`
    md += `- Comidas vacias: ${meals}\n`
    md += '- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto\n\n'
  }
}

if (rows.length === 0) {
  md += '## Estado\n\nSin hallazgos para saneamiento en este corte.\n'
}

writeFileSync(outPath, md, 'utf8')
console.log(`Runbook generado: ${outPath}`)
