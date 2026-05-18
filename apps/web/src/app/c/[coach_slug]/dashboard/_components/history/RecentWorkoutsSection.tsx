import Link from 'next/link'
import { GlassCard } from '@/components/ui/glass-card'
import { buildWorkoutLogDaySummaries, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { WorkoutLogItems } from './WorkoutLogItem'

export async function RecentWorkoutsSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const logs = await getRecentWorkoutLogs(userId)
    if (logs.length === 0) return null

    const items = buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })

    return (
        <GlassCard className="overflow-hidden">
            <div className="border-b border-border/40 px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Actividad reciente</h2>
            </div>
            <WorkoutLogItems items={items} />
            <Link
                href={`/c/${coachSlug}/workout-history`}
                prefetch
                className="block border-t border-border/40 py-3 text-center text-[10px] font-semibold text-[color:var(--theme-primary)]"
            >
                Ver historial completo →
            </Link>
        </GlassCard>
    )
}
