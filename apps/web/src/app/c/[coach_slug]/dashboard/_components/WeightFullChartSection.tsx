import { getCheckInHistory30Days } from '../_data/dashboard.queries'
import { WeightProgressChart } from './weight/WeightProgressChart'

export async function WeightFullChartSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const rows = await getCheckInHistory30Days(userId)
    const data = rows
        .filter((r) => r.weight != null)
        // Eje X por el dia de medicion (`date`), no por el instante UTC de inserción (corrige off-by-one TZ).
        // `date` puede traer componente horario (timestamp) -> normalizar a YYYY-MM-DD y anclar a mediodía
        // local (`T12:00:00`) para que el chart no corra el día al parsear (`new Date`).
        .map((r) => ({ date: `${r.date.slice(0, 10)}T12:00:00`, weight: r.weight as number }))
        .reverse()
    // El color del trazo lo resuelve el chart vía `var(--theme-primary)` (branding por coach del layout).
    return <WeightProgressChart data={data} coachSlug={coachSlug} />
}
