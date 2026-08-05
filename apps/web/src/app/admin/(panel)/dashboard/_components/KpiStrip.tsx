import Link from 'next/link'
import {
    Activity,
    Camera,
    Clock,
    DollarSign,
    FlaskConical,
    Percent,
    TrendingDown,
    UserCheck,
    Users,
} from 'lucide-react'
import { AdminKpiCard } from '../../_components/AdminKpiCard'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'
import type { PlatformOverview } from '../_data/types'

function formatClp(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n.toLocaleString('es-CL')}`
}

// Eyebrow de grupo: separa "Operacion" de "Ciclo de vida" dentro del mismo grid.
const GROUP_EYEBROW = 'self-end pb-1 text-[10px] font-bold uppercase tracking-widest text-muted'

const SPARK_W = 100
const SPARK_H = 36

/**
 * Sparkline del MRR (12 meses). El SVG se estira horizontalmente
 * (preserveAspectRatio="none" + non-scaling-stroke para que el trazo no engorde);
 * el punto final va como marcador posicionado en % encima del SVG para que siga
 * siendo un circulo y no un elipse deformado por el estiramiento.
 */
function MrrSparkline({ series }: { series: PlatformOverview['mrrSeries'] }) {
    const points = series.slice(-12)
    if (points.length < 2) return null

    const values = points.map(p => p.mrr_clp ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    // 2px de aire arriba/abajo para que el stroke no se corte contra el borde.
    const coords = values.map((v, i) => ({
        x: (i / (values.length - 1)) * SPARK_W,
        y: SPARK_H - 2 - ((v - min) / range) * (SPARK_H - 4),
    }))
    const line = coords.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
    const area = `0,${SPARK_H} ${line} ${SPARK_W},${SPARK_H}`
    const last = coords[coords.length - 1]

    return (
        <div className="relative mt-3 h-12 w-full">
            <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                role="img"
                aria-label="MRR últimos 12 meses"
            >
                <polygon points={area} fill="var(--sport-500)" fillOpacity={0.12} />
                <polyline
                    points={line}
                    fill="none"
                    stroke="var(--sport-500)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <span
                aria-hidden
                className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--sport-500)] ring-2 ring-surface-card"
                style={{
                    left: `${(last.x / SPARK_W) * 100}%`,
                    top: `${(last.y / SPARK_H) * 100}%`,
                }}
            />
        </div>
    )
}

function formatAbsDelta(n: number): string {
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`
}

export function KpiStrip({ data }: { data: PlatformOverview }) {
    const mrrDelta = data.mrrDeltaPct
    const hasMrrDelta = typeof mrrDelta === 'number' && !Number.isNaN(mrrDelta)
    const mrrUp = hasMrrDelta && (mrrDelta as number) >= 0

    const coachesDelta = data.activeCoachesDeltaMoM
    const coachesSub = typeof coachesDelta === 'number' && !Number.isNaN(coachesDelta)
        ? `${formatAbsDelta(coachesDelta)} vs mes pasado · de ${data.totalCoaches} total`
        : `de ${data.totalCoaches} total`

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {/* HERO — MRR manda: ocupa 2×2 y se lleva el sparkline. */}
            <div className="col-span-2 row-span-2 flex flex-col rounded-card border border-border-subtle bg-surface-card p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                        MRR
                        <InfoTooltip content="Ingresos mensuales recurrentes estimados. Suma coaches con status=active × precio de su tier. Coaches beta no cuentan." />
                    </span>
                    <DollarSign className="size-4 text-sport-500" />
                </div>

                <div className="mt-2 flex items-end gap-2">
                    <span className="font-display text-[30px] font-black leading-none tracking-[-0.03em] tabular-nums text-strong">
                        {formatClp(data.mrrEstimate)}
                    </span>
                    {hasMrrDelta && (
                        <span className={cn(
                            'mb-0.5 inline-flex w-fit shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[11px] font-bold',
                            mrrUp
                                ? 'bg-[var(--success-100)] text-[var(--success-600)]'
                                : 'bg-[var(--danger-100)] text-[var(--danger-600)]'
                        )}>
                            <span aria-hidden className="text-[10px] leading-none">{mrrUp ? '▲' : '▼'}</span>
                            {Math.abs(mrrDelta as number).toFixed(1)}%
                        </span>
                    )}
                </div>

                <p className="mt-1 text-[11px] leading-snug text-muted">
                    ARR proyectado {formatClp(data.arrEstimate)}
                </p>

                <MrrSparkline series={data.mrrSeries} />

                <Link
                    href="/admin/finanzas"
                    className="mt-auto pt-3 text-[11px] font-bold text-sport-500 hover:underline"
                >
                    Ver Finanzas →
                </Link>
            </div>

            {/* Grupo 1 — Operacion. El eyebrow toma solo las columnas libres al lado del
                hero para no dejar el hueco de 2×2 que generaria un col-span-full aqui. */}
            <p className={cn(GROUP_EYEBROW, 'col-span-2 md:col-span-1 xl:col-span-2')}>
                Operación
            </p>
            <AdminKpiCard
                label="Coaches activos"
                value={data.activeCoaches}
                sub={coachesSub}
                icon={Users}
                tooltip="Total de coaches con acceso habilitado (activos + en trial). El delta es el cambio absoluto de coaches activos mes contra mes."
            />
            <AdminKpiCard
                label="Total alumnos"
                value={data.totalClients}
                sub="en toda la plataforma"
                icon={UserCheck}
                tooltip="Todos los alumnos registrados en la plataforma, sin importar coach o estado."
            />
            <AdminKpiCard
                label="Sesiones 7d"
                value={data.sessionsLast7d}
                sub="entrenamientos completados"
                delta={data.sessions7dDeltaPct}
                icon={Activity}
                tooltip="Sesiones de entrenamiento completadas en la plataforma en los últimos 7 días. El delta compara contra los 7 días previos."
            />
            <AdminKpiCard
                label="Check-ins 7d"
                value={data.checkinsLast7d}
                sub="registros de peso y fotos"
                icon={Camera}
                tooltip="Registros de peso y fotos de alumnos en los últimos 7 días. Indica engagement con seguimiento."
            />

            {/* Grupo 2 — Ciclo de vida */}
            <p className={cn(GROUP_EYEBROW, 'col-span-full')}>
                Ciclo de vida
            </p>
            <AdminKpiCard
                label="Beta activos"
                value={data.betaInvitesCount}
                sub="coaches sin pago"
                icon={FlaskConical}
                tooltip="Coaches con payment_provider=beta y status active/trialing. No generan MRR."
            />
            <AdminKpiCard
                label="Pago pendiente"
                value={data.pendingPaymentCoaches.length}
                sub={data.pendingPaymentCoaches.length > 0 ? 'requieren atención' : 'sin bloqueos'}
                icon={Clock}
                href="/admin/coaches?status=pending_payment"
                tooltip="Coaches atascados en pending_payment — eligieron un plan pero no completaron el pago. Requieren intervención manual o seguimiento."
            />
            <AdminKpiCard
                label="Churn 30d"
                value={data.churnLast30d}
                sub="coaches cancelados/expirados"
                icon={TrendingDown}
                href="/admin/coaches?status=expired"
                tooltip="Coaches que pasaron a cancelado o expirado en los últimos 30 días. Alta tasa indica problema de retención."
            />
            <AdminKpiCard
                label="Conversión trial (90d)"
                value={data.trialConversion.pct !== null
                    ? `${data.trialConversion.pct}%`
                    : '—'}
                sub={`${data.trialConversion.converted} / ${data.trialConversion.total_trials} coaches`}
                icon={Percent}
                tooltip="Porcentaje de coaches registrados en los últimos 90 días que convirtieron de trial a plan pago. Excluye beta/internal."
            />
        </div>
    )
}
