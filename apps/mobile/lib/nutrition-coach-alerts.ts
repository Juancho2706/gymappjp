// Alertas de coach para nutrición — port 1:1 de la web (lib/nutrition-coach-alerts), sin date-fns.

export type NutritionCoachAlertVariant = 'danger' | 'warning' | 'info'
export type NutritionCoachAlert = { id: string; variant: NutritionCoachAlertVariant; title: string; description: string }
type TimelineRow = { log_date: string; mealsDone?: number; mealsTotal?: number }

function parseYmd(s: string): Date { return new Date(`${s.slice(0, 10)}T12:00:00`) }
function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function subDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() - n); return x }

export function deriveNutritionCoachAlerts(input: {
  hasActivePlan: boolean
  kcalTarget: number
  weeklyAvgPct: number
  prevWeeklyAvgPct: number
  monthlyAvgPct: number | null | undefined
  nutritionTimeline: TimelineRow[]
  santiagoTodayIso: string
}): NutritionCoachAlert[] {
  const out: NutritionCoachAlert[] = []
  if (!input.hasActivePlan || !input.santiagoTodayIso) return out

  const kcal = input.kcalTarget
  const w = Number(input.weeklyAvgPct) || 0
  const pw = Number(input.prevWeeklyAvgPct) || 0
  const monthly = input.monthlyAvgPct

  if (kcal > 0 && kcal < 1200) {
    out.push({ id: 'over_restriction', variant: 'danger', title: 'Meta calórica muy baja', description: `El plan marca ${kcal} kcal/día. Por debajo de ~1200 kcal suele ser difícil cubrir micronutrientes; revisá si es intencional y seguro.` })
  }
  if (pw > 60 && w < 30) {
    out.push({ id: 'adherence_drop', variant: 'warning', title: 'Caída brusca de adherencia', description: `La semana pasada ~${Math.round(pw)}% de comidas registradas; esta semana ~${Math.round(w)}%. Conviene contactar y ajustar.` })
  }

  const anchor = parseYmd(`${input.santiagoTodayIso}T12:00:00`)
  const windowStart = subDays(anchor, 29)
  const recentRows = (input.nutritionTimeline ?? []).filter((r) => {
    const d = parseYmd(r.log_date)
    return isFinite(d.getTime()) && d >= windowStart && d <= anchor
  })
  const distinctDaysLast30 = new Set(recentRows.map((r) => r.log_date)).size

  if (monthly != null && !Number.isNaN(Number(monthly)) && Number(monthly) < 45 && distinctDaysLast30 >= 14) {
    out.push({ id: 'stagnation', variant: 'info', title: 'Adherencia mensual plana', description: `Promedio ~30 días ${Math.round(Number(monthly))}%. Con ${distinctDaysLast30} días con registro, conviene revisar si el plan es realista.` })
  }

  const last5 = new Set<string>()
  for (let i = 0; i < 5; i++) last5.add(ymd(subDays(anchor, i)))
  const byDate = new Map<string, TimelineRow>()
  for (const row of input.nutritionTimeline ?? []) byDate.set(row.log_date, row)
  let anyDone = false
  for (const d of last5) { const row = byDate.get(d); if (row && (row.mealsDone ?? 0) > 0) { anyDone = true; break } }
  if (!anyDone && distinctDaysLast30 >= 3) {
    out.push({ id: 'silent_recent', variant: 'warning', title: 'Sin comidas registradas (últimos 5 días)', description: 'No hay comidas marcadas en la app en los últimos 5 días. El alumno puede estar desconectado o el plan ser difícil.' })
  }
  return out
}
