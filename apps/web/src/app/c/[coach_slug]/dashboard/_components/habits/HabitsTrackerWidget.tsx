import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'
import { HabitsTracker } from '@/app/c/[coach_slug]/nutrition/_components/HabitsTracker'

const getTodayHabits = cache(async (clientId: string, today: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_habits')
    .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
    .eq('client_id', clientId)
    .eq('log_date', today)
    .maybeSingle()
  return data ?? null
})

export async function HabitsTrackerWidget({ userId, coachSlug }: { userId: string; coachSlug: string }) {
  const { iso: today } = getTodayInSantiago()
  const data = await getTodayHabits(userId, today)

  return (
    <HabitsTracker
      clientId={userId}
      coachSlug={coachSlug}
      logDate={today}
      isToday={true}
      initialData={data}
    />
  )
}
