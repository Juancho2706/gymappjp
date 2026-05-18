import Link from 'next/link'
import { Scale } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { WeightQuickLog } from './WeightQuickLog'
import { getCheckInHistory30Days } from '../../_data/dashboard.queries'
import { formatRelativeDate, getTodayInSantiago } from '@/lib/date-utils'
import { WeightSparkline } from './WeightSparkline'
import { TrendArrow, type Trend } from './TrendArrow'

function computeTrend(weights: { created_at: string; weight: number | null }[]): { trend: Trend; delta: number } {
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
    const rows = await getCheckInHistory30Days(userId)
    const withW = rows.filter((r) => r.weight != null)
    const { iso: todayIso } = getTodayInSantiago()

    if (withW.length === 0) {
        return (
            <GlassCard className="p-5 text-center">
                <Scale className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Aún sin registros de peso</p>
                <Link
                    href={`/c/${coachSlug}/check-in`}
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-xs font-semibold text-[color:var(--theme-primary)]"
                >
                    Check-in completo →
                </Link>
                <WeightQuickLog coachSlug={coachSlug} />
            </GlassCard>
        )
    }

    const last = withW[withW.length - 1]
    const current = last.weight as number
    const lastDay = last.created_at.split('T')[0]
    const { trend, delta } = computeTrend(withW)
    const spark = withW.slice(-14).map((r) => ({
        iso: r.created_at.split('T')[0],
        weight: r.weight as number,
    }))

    return (
        <GlassCard className="p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Peso</span>
                <Link
                    href={`/c/${coachSlug}/check-in`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-[10px] font-semibold text-[color:var(--theme-primary)]"
                >
                    Registrar
                </Link>
            </div>
            <div className="flex items-end gap-2">
                <span className="font-display text-3xl font-black tabular-nums text-foreground">{current.toFixed(1)} kg</span>
                <TrendArrow trend={trend} deltaKg={delta} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatRelativeDate(lastDay, todayIso)}</p>
            <WeightSparkline data={spark} />
            <WeightQuickLog coachSlug={coachSlug} />
        </GlassCard>
    )
}
