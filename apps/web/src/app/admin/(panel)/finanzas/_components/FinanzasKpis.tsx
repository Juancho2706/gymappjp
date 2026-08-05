'use client'

import { AdminKpiCard } from '../../_components/AdminKpiCard'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'

interface Props {
    mrrEstimate: number
    arrEstimate: number
    mrrGross: number
    mrrDiscountClp: number
    byProvider: { provider: string; mrrClp: number; coachCount: number }[]
    paidCoachCount: number
    arpc: number
    /** Cobrado REAL 30d (billing_snapshots recurring) — evidencia de pasarela. */
    charged30dClp: number
    charged30dCount: number
    /** Serie mensual COMPLETA de MRR: el delta sale de las 2 ultimas entradas. */
    mrrSeries: { ym: string; mrr_clp: number }[]
}

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

const PROVIDER_LABELS: Record<string, string> = {
    mercadopago: 'MercadoPago',
    flow: 'Flow',
}

/** Umbral de reconciliacion: sobre 5% de diferencia entre cobrado real y MRR teorico hay un
 *  problema de COBRO (pasarela), no de reporte. */
const DIVERGENCE_THRESHOLD = 0.05

/** Variacion % mes a mes del MRR (ultimas 2 entradas de la serie del RPC). */
function mrrDeltaPct(series: { mrr_clp: number }[]): number | null {
    if (series.length < 2) return null
    const prev = series[series.length - 2]?.mrr_clp ?? 0
    const curr = series[series.length - 1]?.mrr_clp ?? 0
    if (prev <= 0) return null
    return ((curr - prev) / prev) * 100
}

// Escala del valor por largo — mismo idiom que AdminKpiCard (ver AdminKpiCard.tsx:20).
function valueSizeClass(value: string): string {
    const len = value.length
    if (len <= 6) return 'text-[26px]'
    if (len <= 9) return 'text-[22px]'
    if (len <= 12) return 'text-xl'
    return 'text-lg'
}

/**
 * Clon local de AdminKpiCard con `sub` coloreable. AdminKpiCard pinta el sub siempre en
 * text-muted y no expone tono; acá el color del sub ES la señal (divergencia de cobro).
 * Si AdminKpiCard gana un prop `subTone`, esta card se borra y se vuelve al compartido.
 */
function KpiCardWithSubTone({
    label, value, sub, subWarning, tooltip,
}: { label: string; value: string; sub: string; subWarning: boolean; tooltip?: string }) {
    return (
        <div className="h-full rounded-card border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
            <div className="flex h-full flex-col gap-1.5 px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    {label}
                    {tooltip && <InfoTooltip content={tooltip} />}
                </span>
                <span className={cn(
                    'block max-w-full truncate font-display font-black leading-none tracking-[-0.03em] tabular-nums text-strong',
                    valueSizeClass(value)
                )}>
                    {value}
                </span>
                <p className={cn(
                    'text-[11px] leading-snug',
                    subWarning ? 'font-medium text-[var(--warning-500)]' : 'text-muted'
                )}>
                    {sub}
                </p>
            </div>
        </div>
    )
}

export function FinanzasKpis({
    mrrEstimate, arrEstimate, mrrGross, mrrDiscountClp, byProvider,
    paidCoachCount, arpc, charged30dClp, charged30dCount, mrrSeries,
}: Props) {
    const providerSub = byProvider
        .map((p) => `${PROVIDER_LABELS[p.provider] ?? p.provider} ${clp(p.mrrClp)} (${p.coachCount})`)
        .join(' · ')

    const delta = mrrDeltaPct(mrrSeries)

    const divergence = Math.abs(charged30dClp - mrrEstimate) / Math.max(mrrEstimate, 1)
    const diverges = divergence > DIVERGENCE_THRESHOLD
    const chargedSub = `${charged30dCount} cobros · teórico ${clp(mrrEstimate)}${diverges ? ' · ⚠ diverge del teórico' : ''}`

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <AdminKpiCard
                label="MRR neto"
                value={clp(mrrEstimate)}
                delta={delta}
                sub={mrrDiscountClp > 0 ? `bruto ${clp(mrrGross)} − cupones ${clp(mrrDiscountClp)}` : 'sin descuentos vivos'}
                tooltip="Lo que de verdad entra al mes: precio de lista mensualizado menos cupones vivos. Incluye MercadoPago y Flow; excluye beta/internal/cortesias. El delta compara el último mes de la serie contra el anterior."
            />
            <AdminKpiCard
                label="ARR"
                value={clp(arrEstimate)}
                tooltip="Ingresos anuales proyectados si el MRR neto actual se mantiene (MRR × 12)."
            />
            <AdminKpiCard
                label="Coaches pagando"
                value={String(paidCoachCount)}
                sub={providerSub || undefined}
                tooltip="Coaches con status=active y suscripción real en su gateway (MP con mp_id, Flow con external_id)."
            />
            <AdminKpiCard
                label="ARPC"
                value={clp(arpc)}
                tooltip="Average Revenue Per Coach. MRR neto dividido entre coaches pagando activos."
            />
            <KpiCardWithSubTone
                label="Cobrado 30d real"
                value={clp(charged30dClp)}
                sub={chargedSub}
                subWarning={diverges}
                tooltip="Evidencia de pasarela: suma de billing_snapshots recurring de los últimos 30 días (excluye cuentas de prueba). Si diverge más de 5% del MRR teórico hay un problema de COBRO, no de reporte."
            />
        </div>
    )
}
