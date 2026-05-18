'use client'

import { AdminKpiCard } from '../../_components/AdminKpiCard'

interface Props {
    mrrEstimate: number
    arrEstimate: number
    paidCoachCount: number
    arpc: number
}

function clp(n: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export function FinanzasKpis({ mrrEstimate, arrEstimate, paidCoachCount, arpc }: Props) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AdminKpiCard
                label="MRR"
                value={clp(mrrEstimate)}
                tooltip="Ingresos mensuales recurrentes estimados. Suma coaches con status=active × precio de su tier. Coaches beta no cuentan."
            />
            <AdminKpiCard
                label="ARR"
                value={clp(arrEstimate)}
                tooltip="Ingresos anuales proyectados si el MRR actual se mantiene (MRR × 12)."
            />
            <AdminKpiCard
                label="Coaches pagando"
                value={String(paidCoachCount)}
                tooltip="Coaches con status=active y suscripción de pago real (excluye beta)."
            />
            <AdminKpiCard
                label="ARPC"
                value={clp(arpc)}
                tooltip="Average Revenue Per Coach. MRR dividido entre coaches pagando activos."
            />
        </div>
    )
}
