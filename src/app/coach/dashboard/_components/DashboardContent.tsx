import CoachDashboardClient from '../CoachDashboardClient'
import { DashboardShell } from './DashboardShell'
import { getCoachDashboardData, getCoachDashboardDataV2 } from '../_data/dashboard.queries'

const V2_ENABLED = process.env.NEXT_PUBLIC_COACH_DASHBOARD_V2 === '1'

export async function DashboardContent({ userId, coachName }: { userId: string; coachName: string }) {
    if (V2_ENABLED) {
        const data = await getCoachDashboardDataV2(userId)
        return <DashboardShell data={data} coachName={coachName} />
    }
    const data = await getCoachDashboardData(userId)
    return <CoachDashboardClient {...data} />
}
