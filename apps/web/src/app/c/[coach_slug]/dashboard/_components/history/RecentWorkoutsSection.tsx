import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { buildWorkoutLogDaySummaries, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { WorkoutLogItems } from './WorkoutLogItem'
import { getClientBasePath } from '@/lib/client/base-path'

export async function RecentWorkoutsSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const base = await getClientBasePath(coachSlug)
    const logs = await getRecentWorkoutLogs(userId)
    if (logs.length === 0) return null

    const items = buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })

    return (
        <Card padding="none">
            <div className="border-b border-subtle px-4 py-3">
                <h2 className="font-display text-sm font-bold text-strong">Actividad reciente</h2>
            </div>
            <WorkoutLogItems items={items} />
            <Link
                href={`${base}/workout-history`}
                prefetch
                className="block border-t border-subtle py-3 text-center text-[11px] font-bold text-sport-600"
            >
                Ver historial completo →
            </Link>
        </Card>
    )
}
