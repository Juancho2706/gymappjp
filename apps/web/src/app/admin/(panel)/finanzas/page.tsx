import Link from 'next/link'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAddonMetrics, getCoachAddonsDetail, getFinanzasData } from './_data/finanzas.queries'
import { FinanzasKpis } from './_components/FinanzasKpis'
import { FinanzasCharts } from './_components/FinanzasCharts'
import { RevenueTable } from './_components/RevenueTable'
import { LegacyTierCard } from './_components/LegacyTierCard'
import { AddonMetricsSection } from './_components/AddonMetricsSection'
import { AddonsByCoachSection } from './_components/AddonsByCoachSection'
import { LiveDiscountsSection } from './_components/LiveDiscountsSection'
import { PageInfoButton } from '../_components/PageInfoButton'

export const metadata = { title: 'Finanzas' }

const FINANZAS_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'La foto del dinero de la plataforma: cuánto entra al mes, de qué pasarela viene, cuánto se regala en cupones, cuánto se cobró de verdad y cómo evoluciona todo eso. Excluye cuentas de prueba en todas las métricas agregadas.',
    },
    {
        heading: 'MRR neto vs MRR bruto',
        body: 'MRR bruto = precio de LISTA de cada suscripción activa, mensualizado (un plan anual se divide entre 12).\nMRR neto = ese bruto menos los cupones vivos. Es lo que de verdad entra al mes.\nLa diferencia entre ambos es lo que estás regalando en descuentos ahora mismo.',
    },
    {
        heading: 'ARPC',
        body: 'Average Revenue Per Coach: MRR neto dividido entre los coaches que pagan. Sube cuando la gente migra a planes más altos o contrata add-ons; baja cuando entran cupones o planes chicos.',
    },
    {
        heading: 'Cupones forever',
        body: 'Un cupón con ciclos restantes en "forever" no vence: descuenta el mismo porcentaje mientras la suscripción siga viva. En la tabla de descuentos vivos aparecen sin fecha de término — son los que más pesan en el MRR neto a largo plazo.',
    },
    {
        heading: 'Cortesías admin_grant (no facturan)',
        body: 'Módulos regalados desde el panel (source=admin_grant, precio 0). NO entran al MRR ni al ARR: se reportan aparte en "Adopción por módulo" como "(+N cortesía)". Si un número de add-ons no cuadra con lo cobrado, casi siempre son cortesías.',
    },
    {
        heading: 'Add-on facturable',
        body: 'Un add-on cuenta al MRR solo si es self_service Y facturable: status active, o cancel_pending que ya tuvo su primer cobro. Un add-on activo sin primer cobro todavía no factura y aparece marcado en "Add-ons por coach".',
    },
    {
        heading: 'Legacy grandfathered',
        body: 'Cuentas en tiers viejos (growth, scale) que quedaron con su precio congelado tras la consolidación de planes. Siguen facturando su tarifa antigua; la tarjeta de legacy es el tablero de extinción — cuando llegue a cero el grandfather se terminó.',
    },
    {
        heading: '"Cobrado 30d real" = evidencia de pasarela',
        body: 'Suma de los billing_snapshots de tipo recurring de los últimos 30 días: plata que MercadoPago o Flow efectivamente cobraron. El MRR es teórico (lo que DEBERÍA entrar); esto es lo que entró.\nSi divergen más de 5% el KPI se pinta ámbar: eso es un problema de COBRO (cobros fallidos, suscripciones caídas, renovaciones fuera de ventana), no un error del reporte.',
    },
    {
        heading: 'Rango de los gráficos y exportación',
        body: 'Las píldoras 3M / 6M / 12M recortan la serie de MRR y de churn en el servidor (no filtran las tarjetas ni las tablas, que siempre muestran el estado actual).\n"Exportar CSV" descarga un archivo con resumen, MRR por pasarela, descuentos vivos, revenue por tier y por ciclo — el mismo dato que ves acá, con BOM UTF-8 para que Excel no rompa los acentos.',
    },
]

const RANGE_MONTHS = { '3m': 3, '6m': 6, '12m': 12 } as const
type RangeKey = keyof typeof RANGE_MONTHS

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
    { key: '3m', label: '3 meses' },
    { key: '6m', label: '6 meses' },
    { key: '12m', label: '12 meses' },
]

interface Props {
    searchParams: Promise<{ range?: string }>
}

export default async function AdminFinanzasPage({ searchParams }: Props) {
    const sp = await searchParams
    const range: RangeKey = sp.range === '3m' || sp.range === '6m' ? sp.range : '12m'
    const months = RANGE_MONTHS[range]

    const [data, addonMetrics, coachAddons] = await Promise.all([
        getFinanzasData(),
        getAddonMetrics(),
        getCoachAddonsDetail(),
    ])

    // El recorte va server-side: los charts reciben solo los meses pedidos, sin JS de filtrado
    // en cliente ni series completas viajando al bundle. Ojo: a FinanzasKpis se le pasa la serie
    // COMPLETA a propósito — el delta mes-a-mes del MRR no debe cambiar según el rango elegido.
    const mrrSeries = data.mrrSeries.slice(-months)
    const churnSeries = data.churnSeries.slice(-months)

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Finanzas</h1>
                    <p className="text-xs text-muted">Revenue, churn y eventos de suscripción.</p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/admin/finanzas/export"
                        download
                        className="flex items-center gap-1.5 rounded border border-subtle bg-surface-sunken px-3 py-1.5 text-xs text-body transition-colors hover:border-[var(--sport-500)] hover:text-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Exportar CSV
                    </a>
                    <PageInfoButton title="Finanzas — Guía completa" sections={FINANZAS_INFO} />
                </div>
            </div>

            <FinanzasKpis
                mrrEstimate={data.mrrEstimate}
                arrEstimate={data.arrEstimate}
                mrrGross={data.mrrGross}
                mrrDiscountClp={data.mrrDiscountClp}
                byProvider={data.byProvider}
                paidCoachCount={data.paidCoachCount}
                arpc={data.arpc}
                charged30dClp={data.charged30dClp}
                charged30dCount={data.charged30dCount}
                mrrSeries={data.mrrSeries}
            />

            <LiveDiscountsSection rows={data.liveDiscounts} />

            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-strong">Evolución</h2>
                    <nav aria-label="Rango de los gráficos" className="flex items-center gap-1 rounded-pill border border-subtle bg-surface-sunken p-1">
                        {RANGE_OPTIONS.map((opt) => {
                            const active = opt.key === range
                            return (
                                <Link
                                    key={opt.key}
                                    href={`/admin/finanzas?range=${opt.key}`}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'rounded-pill px-3 py-1 text-xs font-bold transition-colors',
                                        active
                                            ? 'bg-sport-500/10 text-[var(--sport-500)]'
                                            : 'text-muted hover:text-strong'
                                    )}
                                >
                                    {opt.label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                <FinanzasCharts
                    mrrSeries={mrrSeries}
                    churnSeries={churnSeries}
                    revenueByCycle={data.revenueByCycle}
                    revenueByTier={data.revenueByTier}
                />
            </div>

            <AddonMetricsSection metrics={addonMetrics} />

            <AddonsByCoachSection rows={coachAddons} />

            <LegacyTierCard rows={data.legacyTierCounts} />

            <RevenueTable events={data.recentEvents} />
        </div>
    )
}
