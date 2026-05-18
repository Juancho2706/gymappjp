import { getCheckInHistory30Days } from '../_data/dashboard.queries'
import { getClientProfile } from '../_data/dashboard.queries'
import { WeightProgressChart } from './weight/WeightProgressChart'

export async function WeightFullChartSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const [rows, { client }] = await Promise.all([getCheckInHistory30Days(userId), getClientProfile(userId)])
    const coach = client?.coaches
    const branding = Array.isArray(coach) ? coach[0] : coach
    const data = rows
        .filter((r) => r.weight != null)
        .map((r) => ({ date: r.created_at, weight: r.weight as number }))
        .reverse()
    return <WeightProgressChart data={data} primaryColor={branding?.primary_color ?? undefined} coachSlug={coachSlug} />
}
