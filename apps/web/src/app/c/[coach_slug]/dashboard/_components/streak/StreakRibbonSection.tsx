import { getDashboardStreak } from '../../_data/dashboard.queries'
import { StreakRibbon } from './StreakRibbon'

/** Carga la racha real (RPC) y renderiza el ribbon prominente del diseño. */
export async function StreakRibbonSection({ userId }: { userId: string }) {
    const streak = await getDashboardStreak(userId)
    return <StreakRibbon streak={streak} />
}
