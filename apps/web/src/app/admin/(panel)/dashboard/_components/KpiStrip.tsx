import Link from 'next/link'
import { AdminKpiCard } from '../../_components/AdminKpiCard'
import type { PlatformOverview } from '../_data/types'

function formatClp(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n.toLocaleString('es-CL')}`
}

export function KpiStrip({ data }: { data: PlatformOverview }) {
    const sessions7d = data.workoutSessionsSeries
        .slice(-7)
        .reduce((s, d) => s + ((d as any).sessions ?? 0), 0)

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Row 1 — Financial */}
            <AdminKpiCard
                label="MRR"
                value={formatClp(data.mrrEstimate)}
                sub="ingresos recurrentes mensuales"
                delta={data.mrrDeltaPct}
                tooltip="Ingresos mensuales recurrentes estimados. Suma coaches con status=active × precio de su tier. Coaches beta no cuentan."
            />
            <AdminKpiCard
                label="ARR"
                value={formatClp(data.arrEstimate)}
                sub="proyección anual"
                tooltip="Ingresos anuales proyectados si el MRR actual se mantiene (MRR × 12)."
            />
            {/* Row 2 — Operational */}
            <AdminKpiCard
                label="Coaches activos"
                value={data.activeCoaches}
                sub={`de ${data.totalCoaches} total`}
                tooltip="Total de coaches con acceso habilitado (activos + en trial)."
            />
            <AdminKpiCard
                label="Total alumnos"
                value={data.totalClients}
                sub="en toda la plataforma"
                tooltip="Todos los alumnos registrados en la plataforma, sin importar coach o estado."
            />
            <AdminKpiCard
                label="Sessions 7d"
                value={sessions7d}
                sub="entrenamientos completados"
                tooltip="Sesiones de entrenamiento completadas en la plataforma en los últimos 7 días."
            />
            <AdminKpiCard
                label="Check-ins 7d"
                value={data.checkinsLast7d}
                sub="registros de peso y fotos"
                tooltip="Registros de peso y fotos de alumnos en los últimos 7 días. Indica engagement con seguimiento."
            />

            {/* Row 3 — Lifecycle */}
            <AdminKpiCard
                label="Beta activos"
                value={data.betaInvitesCount}
                sub="coaches sin pago"
                tooltip="Coaches con payment_provider=beta y status active/trialing. No generan MRR."
            />
            <div className="col-span-1">
                <Link href="/admin/coaches?status=pending_payment" className="block h-full">
                    <AdminKpiCard
                        label="Pago pendiente"
                        value={data.pendingPaymentCoaches.length}
                        sub={data.pendingPaymentCoaches.length > 0 ? 'requieren atención' : 'sin bloqueos'}
                        tooltip="Coaches atascados en pending_payment — eligieron un plan pero no completaron el pago. Requieren intervención manual o seguimiento."
                    />
                </Link>
            </div>
            <AdminKpiCard
                label="Churn 30d"
                value={data.churnLast30d}
                sub="coaches cancelados/expirados"
                tooltip="Coaches que pasaron a cancelado o expirado en los últimos 30 días. Alta tasa indica problema de retención."
            />
            <AdminKpiCard
                label="Conversión trial (90d)"
                value={data.trialConversion.pct !== null
                    ? `${data.trialConversion.pct}%`
                    : '—'}
                sub={`${data.trialConversion.converted} / ${data.trialConversion.total_trials} coaches`}
                tooltip="Porcentaje de coaches registrados en los últimos 90 días que convirtieron de trial a plan pago. Excluye beta/internal."
            />
        </div>
    )
}
