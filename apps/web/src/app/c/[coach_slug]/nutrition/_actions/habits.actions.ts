'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const upsertHabitsSchema = z.object({
  clientId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coachSlug: z.string().min(1),
  waterMl: z.number().int().min(0).max(10000).nullable(),
  steps: z.number().int().min(0).max(100000).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  fastingHours: z.number().int().min(0).max(72).nullable(),
  supplements: z.array(z.string().max(50)).max(20).nullable(),
  notes: z.string().max(500).nullable(),
})

export type UpsertHabitsInput = z.infer<typeof upsertHabitsSchema>

export async function upsertDailyHabits(
  raw: UpsertHabitsInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = upsertHabitsSchema.safeParse(raw)
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
