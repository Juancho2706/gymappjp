import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface HabitsData {
  water_ml: number | null
  steps: number | null
  sleep_hours: number | null
  fasting_hours: number | null
  supplements: string[] | null
  notes: string | null
}

export interface NutritionGuidanceData {
  hydration_target_ml: number | null
  steps_target: number | null
  sleep_target_hours: number | null
  fasting_target_hours: number | null
  supplement_guidance: string[]
  protocol_notes: string | null
}

export async function getDailyHabits(clientId: string, date: string): Promise<HabitsData | null> {
  const { data } = await supabase
    .from('daily_habits')
    .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
    .eq('client_id', clientId)
    .eq('log_date', date)
    .maybeSingle()
  return data ?? null
}

export async function getActiveNutritionGuidance(
  clientId: string,
): Promise<NutritionGuidanceData | null> {
  const loose = supabase as unknown as SupabaseClient
  const { data, error } = await loose
    .from('nutrition_plans')
    .select('hydration_target_ml, steps_target, sleep_target_hours, fasting_target_hours, supplement_guidance, protocol_notes')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return {
    hydration_target_ml: data.hydration_target_ml == null ? null : Number(data.hydration_target_ml),
    steps_target: data.steps_target == null ? null : Number(data.steps_target),
    sleep_target_hours: data.sleep_target_hours == null ? null : Number(data.sleep_target_hours),
    fasting_target_hours: data.fasting_target_hours == null ? null : Number(data.fasting_target_hours),
    supplement_guidance: Array.isArray(data.supplement_guidance)
      ? data.supplement_guidance.map(String)
      : [],
    protocol_notes: data.protocol_notes == null ? null : String(data.protocol_notes),
  }
}

export async function upsertDailyHabits(
  clientId: string,
  date: string,
  payload: Partial<HabitsData>
) {
  return supabase.from('daily_habits').upsert(
    { client_id: clientId, log_date: date, ...payload, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,log_date' }
  )
}
