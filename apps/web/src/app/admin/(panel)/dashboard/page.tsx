import { getPlatformOverview } from './_data/admin.queries'
import { KpiStrip } from './_components/KpiStrip'
import { ChartSection } from './_components/ChartSection'
import { RecentActivity } from './_components/RecentActivity'
import { PageInfoButton } from '../_components/PageInfoButton'

export const metadata = { title: 'Dashboard' }

const DASHBOARD_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'Vista ejecutiva de la plataforma EVA en tiempo (casi) real. KPIs financieros y operacionales, evolución del MRR, distribución de tiers y actividad reciente de coaches y alumnos.',
    },
    {
        heading: 'KPIs financieros (fila 1)',
        body: 'MRR — ingresos mensuales recurrentes estimados. Suma coaches activos × precio de su tier. Los coaches beta (sin pago) no cuentan.\nARR — proyección anual (MRR × 12).\nMRR Delta — cambio porcentual vs el mes anterior.\nChurn 30d — coaches que pasaron a cancelado o expirado en los últimos 30 días.',
    },
    {
        heading: 'KPIs operacionales (fila 2)',
        body: 'Coaches activos — coaches con acceso habilitado (status active + trialing).\nTotal alumnos — todos los alumnos registrados, sin importar estado o coach.\nSessions 7d — sesiones de entrenamiento completadas en la última semana.\nCheck-ins 7d — registros de peso y fotos de alumnos en la última semana.',
    },
    {
        heading: 'Gráficos',
        body: 'MRR 12 meses — área azul = ingresos, barras = coaches nuevos por mes.\nDistribución tiers — donut con % de coaches por plan actual.\nCoaches por tier (6 meses) — barras apiladas, evolución mensual.\nActividad plataforma (30d) — sesiones de entrenamiento diarias.',
    },
    {
        heading: 'Actividad reciente',
        body: 'Tab Signups — últimos 10 coaches registrados, con su status y tier. Click en cada uno para ir a coaches.\nTab Auditoría — últimas 10 acciones administrativas del panel CEO.',
    },
    {
        heading: 'Fuente y actualización',
        body: 'KPIs y gráficos: cache de 60 segundos (se actualiza automáticamente).\nActividad reciente: sin cache, siempre fresca.\nBase de datos: Supabase, RPCs get_platform_mrr_12_months, get_platform_coaches_by_tier_monthly, get_platform_workout_sessions_30d.',
    },
]

export default async function AdminDashboardPage() {
    const data = await getPlatformOverview()

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Dashboard CEO</h1>
                    <p className="text-xs text-[--admin-text-3]">Visión global de la plataforma EVA.</p>
                </div>
                <PageInfoButton title="Dashboard — Guía completa" sections={DASHBOARD_INFO} />
            </div>

            <KpiStrip data={data} />

            <ChartSection
                mrrSeries={data.mrrSeries}
                tierSeries={data.tierMonthlySeries}
                sessions={data.workoutSessionsSeries}
                coachesByTier={data.coachesByTier}
            />

            <RecentActivity
                signups={data.recentCoachSignups}
                auditEvents={data.recentAuditEvents}
                expiringSoon={data.expiringSoon}
                pendingPayment={data.pendingPaymentCoaches}
            />
        </div>
    )
}
