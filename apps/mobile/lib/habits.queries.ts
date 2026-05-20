import { supabase } from './supabase'

export interface HabitsData {
  water_ml: number | null
  steps: number | null
  sleep_hours: number | null
  fasting_hours: number | null
  supplements: string[] | null
  notes: string | null
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
