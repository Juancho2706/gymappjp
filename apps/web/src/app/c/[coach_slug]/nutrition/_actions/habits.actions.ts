'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UpsertHabitsSchema, type UpsertHabitsInput } from '@eva/schemas'
export type { UpsertHabitsInput } from '@eva/schemas'

export async function upsertDailyHabits(
  raw: UpsertHabitsInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpsertHabitsSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { clientId, logDate, coachSlug, waterMl, steps, sleepHours, fastingHours, supplements, notes } = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.from('daily_habits').upsert(
    {
      client_id: clientId,
      log_date: logDate,
      water_ml: waterMl,
      steps,
      sleep_hours: sleepHours,
      fasting_hours: fastingHours,
      supplements: supplements ?? null,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,log_date' }
  )

  if (error) return { success: false, error: error.message }

  revalidatePath(`/c/${coachSlug}/nutrition`)
  return { success: true }
}

export async function getDailyHabits(
  clientId: string,
  logDate: string
): Promise<{
  water_ml: number | null
  steps: number | null
  sleep_hours: number | null
  fasting_hours: number | null
  supplements: string[] | null
  notes: string | null
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== clientId) return null

  const { data } = await supabase
    .from('daily_habits')
    .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .maybeSingle()

  return data ?? null
}
