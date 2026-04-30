import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const inputPath = join(OUTPUT_DIR, 'nutrition-empty-meals-audit.json')
const outPath = join(OUTPUT_DIR, 'nutrition-empty-meals-priority.md')

const raw = readFileSync(inputPath, 'utf8')
const parsed = JSON.parse(raw)
const rows = Array.isArray(parsed?.rows) ? parsed.rows : []

const byPlan = new Map()
for (const r of rows) {
  const key = `${r.plan_id}|${r.client_name}|${r.plan_name}|${r.coach_slug}|${r.coach_name}`
  if (!byPlan.has(key)) byPlan.set(key, [])
  byPlan.get(key).push(r)
}

const plans = []
for (const [key, mealRows] of byPlan.entries()) {
  const [planId, clientName, planName, coachSlug, coachName] = key.split('|')
  const first = mealRows[0]
  const emptyMeals = mealRows.length
  const logs = Number(first.daily_logs_count ?? 0)
  const completed = Number(first.completed_marks ?? 0)
  const score = logs * 10 + emptyMeals * 4 + Math.min(completed, 20)
  plans.push({
    planId,
    clientName,
    planName,
    coachSlug,
    coachName,
    emptyMeals,
    logs,
    completed,
    lastLogDate: first.last_log_date ?? 'N/A',
    score,
  })
}

plans.sort((a, b) => b.score - a.score)

let md = ''
md += '# Priorizacion Saneamiento Nutricion\n\n'
md += `Generado: ${new Date().toISOString()}\n\n`
md += `Planes afectados: **${plans.length}**\n\n`
md += 'Regla de priorizacion (score): `logs*10 + comidas_vacias*4 + min(completadas,20)`\n\n'
md += '| Prioridad | Coach | Alumno | Plan | Vacias | Logs | Completadas | Ultimo log | Score |\n'
md += '|---|---|---|---|---:|---:|---:|---|---:|\n'
plans.forEach((p, i) => {
  md += `| ${i + 1} | ${p.coachSlug} | ${p.clientName} | ${p.planName} | ${p.emptyMeals} | ${p.logs} | ${p.completed} | ${p.lastLogDate} | ${p.score} |\n`
})

writeFileSync(outPath, md, 'utf8')
console.log(`Priorizacion generada: ${outPath}`)
