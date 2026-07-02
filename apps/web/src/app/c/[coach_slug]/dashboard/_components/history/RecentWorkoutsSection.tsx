import { Card } from '@/components/ui/card'
import { buildWorkoutLogDaySummaries, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { WorkoutLogItems } from './WorkoutLogItem'
import { SectionTitle } from '../shared/SectionTitle'
import { getClientBasePath } from '@/lib/client/base-path'

export async function RecentWorkoutsSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const base = await getClientBasePath(coachSlug)
    const logs = await getRecentWorkoutLogs(userId)
    if (logs.length === 0) return null

    const items = buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })

    // SectionTitle (barra de acento + "Historial") como el resto de secciones (kit alumno-dashboard.jsx:472).
    return (
        <div>
            <SectionTitle action="Historial" actionHref={`${base}/workout-history`}>
                Actividad reciente
            </SectionTitle>
            <Card padding="none" className="border border-subtle bg-transparent shadow-none">
                <WorkoutLogItems items={items} />
            </Card>
        </div>
    )
}
