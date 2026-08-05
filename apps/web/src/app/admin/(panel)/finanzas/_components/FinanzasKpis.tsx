'use client'

import { AdminKpiCard } from '../../_components/AdminKpiCard'

interface Props {
    mrrEstimate: number
    arrEstimate: number
    mrrGross: number
    mrrDiscountClp: number
    byProvider: { provider: string; mrrClp: number; coachCount: number }[]
    paidCoachCount: number
    arpc: number
}

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

const PROVIDER_LABELS: Record<string, string> = {
    mercadopago: 'MercadoPago',
    flow: 'Flow',
}

export function FinanzasKpis({ mrrEstimate, arrEstimate, mrrGross, mrrDiscountClp, byProvider, paidCoachCount, arpc }: Props) {
    const providerSub = byProvider
        .map((p) => `${PROVIDER_LABELS[p.provider] ?? p.provider} ${clp(p.mrrClp)} (${p.coachCount})`)
        .join(' · ')
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AdminKpiCard
                label="MRR neto"
                value={clp(mrrEstimate)}
                sub={mrrDiscountClp > 0 ? `bruto ${clp(mrrGross)} − cupones ${clp(mrrDiscountClp)}` : 'sin descuentos vivos'}
                tooltip="Lo que de verdad entra al mes: precio de lista mensualizado menos cupones vivos. Incluye MercadoPago y Flow; excluye beta/internal/cortesias."
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
        </div>
    )
}
