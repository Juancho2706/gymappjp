import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { WeightQuickLog } from './WeightQuickLog'
import { getCheckInHistory30Days } from '../../_data/dashboard.queries'
import { formatRelativeDate, getTodayInSantiago } from '@/lib/date-utils'
import { WeightSparkline } from './WeightSparkline'
import { TrendArrow, type Trend } from './TrendArrow'
import { WeightHeadline } from './WeightHeadline'
import { getClientBasePath } from '@/lib/client/base-path'

function computeTrend(weights: { date: string; weight: number | null }[]): { trend: Trend; delta: number } {
    const pts = weights.filter((w) => w.weight != null).map((w) => ({ ...w, weight: w.weight as number }))
    if (pts.length < 2) return { trend: 'stable', delta: 0 }
    const last7 = pts.slice(-7)
    const prev7 = pts.slice(-14, -7)
    if (last7.length === 0) return { trend: 'stable', delta: 0 }
    const avgLast = last7.reduce((s, p) => s + p.weight, 0) / last7.length
    if (prev7.length === 0) return { trend: 'stable', delta: 0 }
    const avgPrev = prev7.reduce((s, p) => s + p.weight, 0) / prev7.length
    const delta = avgLast - avgPrev
    if (delta > 0.3) return { trend: 'up', delta }
    if (delta < -0.3) return { trend: 'down', delta: Math.abs(delta) }
    return { trend: 'stable', delta: 0 }
}

export async function WeightWidget({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const base = await getClientBasePath(coachSlug)
    const rows = await getCheckInHistory30Days(userId)
    const withW = rows.filter((r) => r.weight != null)
    const { iso: todayIso } = getTodayInSantiago()

    if (withW.length === 0) {
        return (
            <Card padding="lg" className="text-center">
                <Scale className="mx-auto h-10 w-10 text-muted" />
                <p className="text-sm font-bold text-strong">Aún sin registros de peso</p>
                <Link
                    href={`${base}/check-in`}
                    className="inline-flex min-h-11 items-center justify-center rounded-control px-3 text-xs font-bold text-sport-600"
                >
                    Check-in completo →
                </Link>
                <WeightQuickLog coachSlug={coachSlug} />
            </Card>
        )
    }

    const last = withW[withW.length - 1]
    const current = last.weight as number
    // Etiqueta por el dia de medicion (`date`), no por el instante UTC de inserción (corrige off-by-one TZ).
    // `date` puede venir con componente horario (timestamp); se normaliza a YYYY-MM-DD para los helpers de fecha.
    const lastDay = last.date.slice(0, 10)
    const { trend, delta } = computeTrend(withW)
    const spark = withW.slice(-14).map((r) => ({
        iso: r.date.slice(0, 10),
        weight: r.weight as number,
    }))

    return (
        <Card padding="md" className="gap-0">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Peso actual</span>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
                <WeightHeadline value={current} />
                <TrendArrow trend={trend} deltaKg={delta} />
            </div>
            <p className="mt-1 text-xs text-muted">{formatRelativeDate(lastDay, todayIso)}</p>
            <WeightSparkline data={spark} />
            <WeightQuickLog coachSlug={coachSlug} />
        </Card>
    )
}
