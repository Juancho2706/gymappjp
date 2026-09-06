import { format, parseISO, subDays } from 'date-fns'
import { deriveNutritionV2Alerts, type NutritionV2AlertsInput } from '@eva/nutrition-v2'

export type NutritionCoachAlertVariant = 'danger' | 'warning' | 'info'

export type NutritionCoachAlert = {
  id: string
  variant: NutritionCoachAlertVariant
  title: string
  description: string
}

type TimelineRow = {
  log_date: string
  mealsDone?: number
  mealsTotal?: number
}

/**
 * Alertas deterministas para la ficha nutrición del coach (Fase D doc).
 * Sin nuevas queries: solo props ya agregadas al tab.
 *
 * `v2` (opcional, W4.2 del tren «Cantidades honestas», SPEC §7.2): las señales del read model V2
 * —sobreconsumo del día y registros de una versión anterior del plan— que este motor, nacido sobre
 * datos V1 (meta del plan, adherencia semanal, timeline de comidas marcadas), no podía ver. Van al
 * FINAL y solo si el llamador tiene el `today` a mano; sin el bloque, el resultado es byte-idéntico
 * al de antes. La derivación es la compartida con RN (`deriveNutritionV2Alerts`), no una copia.
 */
export function deriveNutritionCoachAlerts(input: {
  hasActivePlan: boolean
  kcalTarget: number
  weeklyAvgPct: number
  prevWeeklyAvgPct: number
  monthlyAvgPct: number | null | undefined
  nutritionTimeline: TimelineRow[]
  santiagoTodayIso: string
  v2?: NutritionV2AlertsInput | null
}): NutritionCoachAlert[] {
  const out: NutritionCoachAlert[] = []
  if (!input.hasActivePlan || !input.santiagoTodayIso) return out

  const kcal = input.kcalTarget
  const w = Number(input.weeklyAvgPct) || 0
  const pw = Number(input.prevWeeklyAvgPct) || 0
  const monthly = input.monthlyAvgPct

  /** Meta calórica muy baja (riesgo; revisión profesional). */
  if (kcal > 0 && kcal < 1200) {
    out.push({
      id: 'over_restriction',
      variant: 'danger',
      title: 'Meta calórica muy baja',
      description: `El plan marca ${kcal} kcal/día. Por debajo de ~1200 kcal suele ser difícil cubrir micronutrientes; revisa si es intencional y seguro para este alumno.`,
    })
  }

  /** Caída fuerte vs semana anterior (señal de abandono de registro). */
  if (pw > 60 && w < 30) {
    out.push({
      id: 'adherence_drop',
      variant: 'warning',
      title: 'Caída brusca de adherencia',
      description: `La semana pasada el alumno ~${Math.round(pw)}% de comidas registradas; esta semana ~${Math.round(w)}%. Conviene contactar y ajustar el plan o recordatorios.`,
    })
  }

  const anchor = parseISO(`${input.santiagoTodayIso}T12:00:00`)
  const windowStart = subDays(anchor, 29)
  const recentRows = (input.nutritionTimeline ?? []).filter((r) => {
    try {
      const d = parseISO(`${r.log_date}T12:00:00`)
      return d >= windowStart && d <= anchor
    } catch {
      return false
    }
  })
  const distinctDaysLast30 = new Set(recentRows.map((r) => r.log_date)).size

  if (monthly != null && !Number.isNaN(Number(monthly)) && Number(monthly) < 45 && distinctDaysLast30 >= 14) {
    out.push({
      id: 'stagnation',
      variant: 'info',
      title: 'Adherencia mensual plana',
      description: `Promedio ~30 días ${Math.round(Number(monthly))}%. Con ${distinctDaysLast30} días con registro, conviene revisar si el plan es realista o si el alumno necesita apoyo.`,
    })
  }

  const last5Dates: string[] = []
  for (let i = 0; i < 5; i++) {
    last5Dates.push(format(subDays(anchor, i), 'yyyy-MM-dd'))
  }
  const byDate = new Map<string, TimelineRow>()
  for (const row of input.nutritionTimeline ?? []) {
    byDate.set(row.log_date, row)
  }
  let anyMealDoneLast5 = false
  for (const d of last5Dates) {
    const row = byDate.get(d)
    if (row && (row.mealsDone ?? 0) > 0) {
      anyMealDoneLast5 = true
      break
    }
  }
  if (!anyMealDoneLast5 && distinctDaysLast30 >= 3) {
    out.push({
      id: 'silent_recent',
      variant: 'warning',
      title: 'Sin comidas registradas (últimos 5 días)',
      description:
        'No hay comidas marcadas en la app en los últimos 5 días. El alumno puede estar desconectado o el plan ser difícil de cumplir.',
    })
  }

  if (input.v2) out.push(...deriveNutritionV2Alerts(input.v2))

  return out
}
