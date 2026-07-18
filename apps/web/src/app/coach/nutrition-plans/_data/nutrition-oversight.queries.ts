import { createClient } from '@/lib/supabase/server'
import {
  calculateIntakeEntriesTotals,
  nutritionTargetPercent,
} from '@eva/nutrition-engine'
import type { ActivePlanBoardRow } from './nutrition-coach.queries'

export type NutritionOversightRow = {
  clientId: string
  clientName: string
  planId: string
  planName: string
  adherence7d: number
  targetCalories: number
  planCaloriesConsumed: number
  extraCaloriesConsumed: number
  totalCaloriesConsumed: number
  caloriePercent: number
  extraProtein: number
  extraCarbs: number
  extraFats: number
  intakeCount: number
  status: 'ok' | 'review' | 'missing'
  reason: string
}

export type NutritionOversight = {
  rows: NutritionOversightRow[]
  summary: {
    activeClients: number
    clientsWithIntake: number
    clientsToReview: number
    averageAdherence: number
  }
}

type IntakeRow = {
  client_id: string
  quantity: number
  unit: string
  snapshot_calories?: number | null
  snapshot_protein_g?: number | null
  snapshot_carbs_g?: number | null
  snapshot_fats_g?: number | null
  snapshot_fiber_g?: number | null
  snapshot_serving_size?: number | null
  snapshot_serving_unit?: string | null
  food?: {
    name?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
    fiber_g?: number | null
    serving_size?: number | null
    serving_unit?: string | null
  } | null
}

export async function getNutritionOversight(
  activePlans: ActivePlanBoardRow[],
  todayIso: string,
): Promise<NutritionOversight> {
  if (activePlans.length === 0) {
    return {
      rows: [],
      summary: { activeClients: 0, clientsWithIntake: 0, clientsToReview: 0, averageAdherence: 0 },
    }
  }

  const supabase = await createClient()
  const clientIds = [...new Set(activePlans.map((plan) => plan.client_id))]
  const loose = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
  }

  const { data } = await loose
    .from('nutrition_intake_entries')
    .select(`
      client_id,
      quantity,
      unit,
      snapshot_calories,
      snapshot_protein_g,
      snapshot_carbs_g,
      snapshot_fats_g,
      snapshot_fiber_g,
      snapshot_serving_size,
      snapshot_serving_unit,
      food:foods(name, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit)
    `)
    .in('client_id', clientIds)
    .eq('log_date', todayIso)

  const entriesByClient = new Map<string, IntakeRow[]>()
  for (const row of (data ?? []) as IntakeRow[]) {
    const list = entriesByClient.get(row.client_id) ?? []
    list.push(row)
    entriesByClient.set(row.client_id, list)
  }

  const rows = activePlans.map<NutritionOversightRow>((plan) => {
    const intakeEntries = entriesByClient.get(plan.client_id) ?? []
    const intake = calculateIntakeEntriesTotals(intakeEntries)
    const target = Number(plan.dailyTargetCalories) || 0
    const planConsumed = Number(plan.todayCaloriesConsumed) || 0
    const total = planConsumed + intake.calories
    const adherence = plan.sparkline7d.length
      ? Math.round(plan.sparkline7d.reduce((sum, value) => sum + value, 0) / plan.sparkline7d.length)
      : 0
    const caloriePercent = nutritionTargetPercent(total, target)

    let status: NutritionOversightRow['status'] = 'ok'
    let reason = 'Dentro del rango esperado'
    if (planConsumed === 0 && intakeEntries.length === 0) {
      status = 'missing'
      reason = 'Sin registros de hoy'
    } else if (adherence < 50) {
      status = 'review'
      reason = 'Adherencia semanal baja'
    } else if (target > 0 && (caloriePercent < 70 || caloriePercent > 125)) {
      status = 'review'
      reason = caloriePercent < 70 ? 'Consumo bajo frente al objetivo' : 'Consumo sobre el objetivo'
    } else if (intake.calories > Math.max(300, target * 0.25)) {
      status = 'review'
      reason = 'Consumo adicional relevante'
    }

    return {
      clientId: plan.client_id,
      clientName: plan.clients?.full_name ?? 'Alumno',
      planId: plan.id,
      planName: plan.name,
      adherence7d: adherence,
      targetCalories: target,
      planCaloriesConsumed: Math.round(planConsumed),
      extraCaloriesConsumed: Math.round(intake.calories),
      totalCaloriesConsumed: Math.round(total),
      caloriePercent,
      extraProtein: Math.round(intake.protein),
      extraCarbs: Math.round(intake.carbs),
      extraFats: Math.round(intake.fats),
      intakeCount: intakeEntries.length,
      status,
      reason,
    }
  }).sort((a, b) => {
    const priority = { review: 0, missing: 1, ok: 2 }
    return priority[a.status] - priority[b.status] || a.adherence7d - b.adherence7d
  })

  const adherenceValues = rows.map((row) => row.adherence7d)
  return {
    rows,
    summary: {
      activeClients: rows.length,
      clientsWithIntake: rows.filter((row) => row.intakeCount > 0).length,
      clientsToReview: rows.filter((row) => row.status !== 'ok').length,
      averageAdherence: adherenceValues.length
        ? Math.round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length)
        : 0,
    },
  }
}
