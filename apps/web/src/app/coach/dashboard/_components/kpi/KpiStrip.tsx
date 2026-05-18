'use client'

import { TrendingUp, Users, TriangleAlert, Activity } from 'lucide-react'
import { KpiTile } from './KpiTile'
import type { KpiSummary } from '../../_data/types'

interface Props {
    kpi: KpiSummary
    onAdherenceClick: () => void
    onMrrClick: () => void
}

function formatCurrency(n: number): string {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export function KpiStrip({ kpi, onAdherenceClick, onMrrClick }: Props) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiTile
                label="Ingresos del mes"
                value={formatCurrency(kpi.mrrCurrentMonth)}
                icon={TrendingUp}
                deltaPct={kpi.mrrDeltaPct}
                hint={`Mes anterior: ${formatCurrency(kpi.mrrPreviousMonth)}`}
                onClick={onMrrClick}
            />
            <KpiTile
                label="Alumnos activos"
                value={String(kpi.totalClients)}
                icon={Users}
                href="/coach/clients"
            />
            <KpiTile
                label="En riesgo"
                value={String(kpi.riskCount)}
                icon={TriangleAlert}
                hint={kpi.riskCount > 0 ? 'Requieren atencion inmediata' : 'Todos al dia'}
                href="#focus-list"
            />
            <KpiTile
                label="Adherencia"
                value={`${kpi.avgAdherence}%`}
                icon={Activity}
                hint={`Nutricion: ${kpi.avgNutrition}%`}
                onClick={onAdherenceClick}
            />
        </div>
    )
}
