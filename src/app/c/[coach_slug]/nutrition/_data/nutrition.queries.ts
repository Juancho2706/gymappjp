import { cache } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'

/**
 * Plan activo completo con toda la jerarquía de comidas + alimentos.
 * Cacheado: el plan no cambia durante el día.
 */
export const getActiveNutritionPlan = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nutrition_plans')
    .select(
      `
      *,
      nutrition_meals (
        *,
        food_items (
          *,
          foods (*)
        )
      )
    `
    )
    .eq('client_id', userId)
    .eq('is_active', true)
    .order('order_index', { referencedTable: 'nutrition_meals' })
    .maybeSingle()
  return data
})

/**
 * Log de un día específico. Parametrizado para soportar navegación.
 * Devuelve null si no hay log para ese día.
 */
export const getNutritionLogForDate = cache(
  async (userId: string, planId: string, date: string) => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('daily_nutrition_logs')
      .select(
        `
      *,
      nutrition_meal_logs (
        meal_id,
        is_completed
      )
    `
      )
      .eq('client_id', userId)
      .eq('plan_id', planId)
      .eq('log_date', date)
      .maybeSingle()
    return data
  }
)

/**
 * Adherencia de los últimos 30 días (ventana calendario desde hoy en America/Santiago).
 */
export const getNutritionAdherence30d = cache(async (userId: string, planId: string) => {
  const supabase = await createClient()
  const { iso: todayIso } = getTodayInSantiago()
  const dateFrom = format(subDays(parseISO(`${todayIso}T12:00:00`), 30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('daily_nutrition_logs')
    .select(
      `
      log_date,
      nutrition_meal_logs (
        is_completed
      )
    `
    )
    .eq('client_id', userId)
    .eq('plan_id', planId)
    .gte('log_date', dateFrom)
    .order('log_date', { ascending: true })

  return data ?? []
})
