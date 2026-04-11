import CoachDashboardClient from '../CoachDashboardClient'
import { getCoachDashboardData } from '../_data/dashboard.queries'

export async function DashboardContent({ userId }: { userId: string }) {
    const data = await getCoachDashboardData(userId)
    return <CoachDashboardClient {...data} />
}
