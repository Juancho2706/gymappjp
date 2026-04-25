import { DashboardShell } from './DashboardShell'
import { getCoachDashboardDataV2 } from '../_data/dashboard.queries'

export async function DashboardContent({ userId, coachName }: { userId: string; coachName: string }) {
    const data = await getCoachDashboardDataV2(userId)
    return <DashboardShell data={data} coachName={coachName} />
}
