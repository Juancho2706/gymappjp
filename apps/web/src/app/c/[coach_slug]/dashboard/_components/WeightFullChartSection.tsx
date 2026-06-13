import { getCheckInHistory30Days } from '../_data/dashboard.queries'
import { WeightProgressChart } from './weight/WeightProgressChart'

export async function WeightFullChartSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const rows = await getCheckInHistory30Days(userId)
    const data = rows
        .filter((r) => r.weight != null)
        .map((r) => ({ date: r.created_at, weight: r.weight as number }))
        .reverse()
    // El color del trazo lo resuelve el chart vía `var(--theme-primary)` (branding por coach del layout).
    return <WeightProgressChart data={data} coachSlug={coachSlug} />
}
