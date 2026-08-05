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
        heading: 'Card MRR (hero)',
        body: 'MRR — ingresos mensuales recurrentes estimados. Suma coaches activos × precio de su tier. Los coaches beta (sin pago) no cuentan.\nDelta — cambio porcentual vs el mes anterior.\nARR proyectado — MRR × 12.\nSparkline — evolución del MRR en los últimos 12 meses.',
    },
    {
        heading: 'Operación',
        body: 'Coaches activos — coaches con acceso habilitado (status active + trialing); el sub muestra el cambio absoluto vs el mes pasado.\nTotal alumnos — todos los alumnos registrados, sin importar estado o coach.\nSesiones 7d — entrenamientos completados en la última semana (delta vs los 7 días previos).\nCheck-ins 7d — registros de peso y fotos de alumnos en la última semana.',
    },
    {
        heading: 'Ciclo de vida',
        body: 'Beta activos — coaches con payment_provider=beta; no generan MRR.\nPago pendiente — eligieron plan pero no completaron el pago (click abre la lista filtrada).\nChurn 30d — coaches cancelados o expirados en los últimos 30 días.\nConversión trial (90d) — % de coaches registrados en 90 días que pasaron a plan pago.',
    },
    {
        heading: 'Gráficos',
        body: 'MRR 12 meses — área azul = ingresos, barras = coaches nuevos por mes.\nDistribución tiers — donut con % de coaches por plan actual.\nCoaches por tier (6 meses) — barras apiladas, evolución mensual.\nActividad plataforma (30d) — sesiones de entrenamiento diarias.',
    },
    {
        heading: 'Actividad reciente',
        body: 'Requieren atención — siempre visible: coaches por vencer (rojo si quedan 2 días o menos) y coaches en pago pendiente, ordenados por urgencia.\nTab Registros — últimos coaches registrados, con status y tier.\nTab Churn 30d — quién canceló o expiró en el último mes.\nTab Auditoría — últimas acciones administrativas del panel CEO.',
    },
    {
        heading: 'Fuente y actualización',
        body: 'Datos en vivo: cada carga de la página consulta la base directamente, sin cache. Si sospechas datos viejos, recarga la página.\nBase de datos: Supabase, RPCs get_platform_mrr_12_months, get_platform_coaches_by_tier_monthly, get_platform_workout_sessions_30d.',
    },
]

export default async function AdminDashboardPage() {
    const data = await getPlatformOverview()

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Dashboard CEO</h1>
                    <p className="text-xs text-muted">Visión global de la plataforma EVA.</p>
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
                churnRecent={data.churnRecent}
            />
        </div>
    )
}
