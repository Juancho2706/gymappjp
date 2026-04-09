import Link from 'next/link'
import { GlassCard } from '@/components/ui/glass-card'
import { getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { WorkoutLogItems } from './WorkoutLogItem'

export async function RecentWorkoutsSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const logs = await getRecentWorkoutLogs(userId)
    if (logs.length === 0) return null

    const byDay = new Map<string, typeof logs>()
    for (const log of logs) {
        const d = log.logged_at.split('T')[0]
        if (!byDay.has(d)) byDay.set(d, [])
        byDay.get(d)!.push(log)
    }

    const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 5)

    const items = days.map((d) => {
        const dayLogs = byDay.get(d) ?? []
        const sets = dayLogs.length
        const dateLabel = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
        })
        return {
            dateLabel,
            sets,
            subtitle: `${sets} series registradas`,
        }
    })

    return (
        <GlassCard className="overflow-hidden">
            <div className="border-b border-border/40 px-4 py-3">
                <h2 className="text-sm font-bold text-foreground">Actividad reciente</h2>
            </div>
            <WorkoutLogItems items={items} />
            <Link href={`/c/${coachSlug}/dashboard`} className="block border-t border-border/40 py-3 text-center text-[10px] font-semibold text-[color:var(--theme-primary)]">
                Ver historial completo →
            </Link>
        </GlassCard>
    )
}
