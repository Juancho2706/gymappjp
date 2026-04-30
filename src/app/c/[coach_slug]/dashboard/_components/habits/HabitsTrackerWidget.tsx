import { createClient } from '@/lib/supabase/server'
import { getTodayInSantiago } from '@/lib/date-utils'
import { HabitsTracker } from '@/app/c/[coach_slug]/nutrition/_components/HabitsTracker'

export async function HabitsTrackerWidget({ userId, coachSlug }: { userId: string; coachSlug: string }) {
  const { iso: today } = getTodayInSantiago()
  const supabase = await createClient()

  const { data } = await supabase
    .from('daily_habits')
    .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
    .eq('client_id', userId)
    .eq('log_date', today)
    .maybeSingle()

  return (
    <HabitsTracker
      clientId={userId}
      coachSlug={coachSlug}
      logDate={today}
      isToday={true}
      initialData={data ?? null}
    />
  )
}
