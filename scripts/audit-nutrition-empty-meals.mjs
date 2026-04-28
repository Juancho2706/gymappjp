/**
 * audit-nutrition-empty-meals.mjs
 *
 * Reporta planes nutricionales activos con comidas vacías (sin food_items),
 * agrupados por coach y alumno.
 *
 * Uso:
 *   node scripts/audit-nutrition-empty-meals.mjs
 *
 * Variables de entorno requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
mkdirSync(OUTPUT_DIR, { recursive: true })

async function fetchActivePlans(supabase) {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select('id, name, client_id')
    .eq('is_active', true)
  if (error) throw error
  return data ?? []
}

async function fetchClients(supabase, clientIds) {
  if (clientIds.length === 0) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, coach_id')
    .in('id', clientIds)
  if (error) throw error
  return data ?? []
}

async function fetchCoaches(supabase, coachIds) {
  if (coachIds.length === 0) return []
  const { data, error } = await supabase
    .from('coaches')
    .select('id, full_name, slug')
    .in('id', coachIds)
  if (error) throw error
  return data ?? []
}

async function fetchMeals(supabase, planIds) {
  if (planIds.length === 0) return []
  const { data, error } = await supabase
    .from('nutrition_meals')
    .select('id, plan_id, name, order_index')
    .in('plan_id', planIds)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function fetchFoodItems(supabase, mealIds) {
  if (mealIds.length === 0) return []
  const { data, error } = await supabase
    .from('food_items')
    .select('id, meal_id')
    .in('meal_id', mealIds)
  if (error) throw error
  return data ?? []
}

async function fetchLogs(supabase, planIds) {
  if (planIds.length === 0) return []
  const { data, error } = await supabase
    .from('daily_nutrition_logs')
    .select('id, plan_id, log_date, nutrition_meal_logs ( is_completed )')
    .in('plan_id', planIds)
  if (error) throw error
  return data ?? []
}

function groupByCoachAndPlan(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const coachKey = `${row.coach_name ?? 'Coach sin nombre'}|${row.coach_slug ?? 'sin-slug'}`
    if (!grouped.has(coachKey)) grouped.set(coachKey, new Map())
    const planKey = `${row.client_name}|${row.plan_name}|${row.plan_id}`
    if (!grouped.get(coachKey).has(planKey)) grouped.get(coachKey).set(planKey, [])
    grouped.get(coachKey).get(planKey).push(row)
  }
  return grouped
}

function renderMarkdown(rows) {
  const now = new Date().toISOString()
  let md = `# Auditoria Planes Nutricionales con Comidas Vacias\n\n`
  md += `Generado: ${now}\n\n`
  md += `Total comidas vacias detectadas: **${rows.length}**\n\n`

  const grouped = groupByCoachAndPlan(rows)
  for (const [coachKey, plans] of grouped.entries()) {
    const [coachName, coachSlug] = coachKey.split('|')
    md += `## Coach: ${coachName} (${coachSlug})\n\n`
    for (const [planKey, mealRows] of plans.entries()) {
      const [clientName, planName, planId] = planKey.split('|')
      const first = mealRows[0]
      md += `### Alumno: ${clientName}\n`
      md += `- Plan: ${planName}\n`
      md += `- Plan ID: \`${planId}\`\n`
      md += `- Logs: ${first.daily_logs_count} | Completadas: ${first.completed_marks} | Ultimo log: ${first.last_log_date ?? 'N/A'}\n`
      md += `- Comidas vacias (${mealRows.length}): ${mealRows.map((m) => m.meal_name).join(', ')}\n\n`
    }
  }
  return md
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const plans = await fetchActivePlans(supabase)
  const planIds = plans.map((p) => p.id)
  const clientIds = [...new Set(plans.map((p) => p.client_id))]

  const [clients, meals, logs] = await Promise.all([
    fetchClients(supabase, clientIds),
    fetchMeals(supabase, planIds),
    fetchLogs(supabase, planIds),
  ])
  const mealIds = meals.map((m) => m.id)
  const foodItems = await fetchFoodItems(supabase, mealIds)
  const coachIds = [...new Set(clients.map((c) => c.coach_id).filter(Boolean))]
  const coaches = await fetchCoaches(supabase, coachIds)

  const planById = new Map(plans.map((p) => [p.id, p]))
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const coachById = new Map(coaches.map((c) => [c.id, c]))
  const foodCountByMeal = new Map()
  for (const fi of foodItems) {
    foodCountByMeal.set(fi.meal_id, (foodCountByMeal.get(fi.meal_id) ?? 0) + 1)
  }

  const logsByPlan = new Map()
  for (const log of logs) {
    if (!logsByPlan.has(log.plan_id)) logsByPlan.set(log.plan_id, [])
    logsByPlan.get(log.plan_id).push(log)
  }

  const rows = []
  for (const meal of meals) {
    if ((foodCountByMeal.get(meal.id) ?? 0) > 0) continue
    const plan = planById.get(meal.plan_id)
    if (!plan) continue
    const client = clientById.get(plan.client_id)
    const coach = client ? coachById.get(client.coach_id) : null
    const planLogs = logsByPlan.get(plan.id) ?? []
    const dailyLogsCount = planLogs.length
    const completedMarks = planLogs.reduce(
      (acc, l) => acc + (l.nutrition_meal_logs ?? []).filter((x) => x.is_completed).length,
      0
    )
    const lastLogDate = planLogs.reduce(
      (acc, l) => (!acc || (l.log_date ?? '') > acc ? l.log_date : acc),
      null
    )

    rows.push({
      coach_name: coach?.full_name ?? 'Coach sin nombre',
      coach_slug: coach?.slug ?? 'sin-slug',
      client_name: client?.full_name ?? 'Cliente sin nombre',
      plan_name: plan.name,
      plan_id: plan.id,
      meal_name: meal.name,
      order_index: meal.order_index,
      daily_logs_count: dailyLogsCount,
      completed_marks: completedMarks,
      last_log_date: lastLogDate,
    })
  }

  rows.sort((a, b) => {
    if (a.coach_name !== b.coach_name) return a.coach_name.localeCompare(b.coach_name)
    if (a.client_name !== b.client_name) return a.client_name.localeCompare(b.client_name)
    if (a.plan_name !== b.plan_name) return a.plan_name.localeCompare(b.plan_name)
    return a.order_index - b.order_index
  })

  const md = renderMarkdown(rows)
  const outputFile = join(OUTPUT_DIR, 'nutrition-empty-meals-audit.md')
  writeFileSync(outputFile, md, 'utf8')
  console.log(`Reporte generado: ${outputFile}`)
}

main().catch((err) => {
  console.error('Error ejecutando auditoria:', err.message)
  process.exit(1)
})
