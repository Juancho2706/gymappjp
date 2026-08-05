import { getAddonMetrics, getCoachAddonsDetail, getFinanzasData } from './_data/finanzas.queries'
import { FinanzasKpis } from './_components/FinanzasKpis'
import { FinanzasCharts } from './_components/FinanzasCharts'
import { RevenueTable } from './_components/RevenueTable'
import { LegacyTierCard } from './_components/LegacyTierCard'
import { AddonMetricsSection } from './_components/AddonMetricsSection'
import { AddonsByCoachSection } from './_components/AddonsByCoachSection'
import { LiveDiscountsSection } from './_components/LiveDiscountsSection'

export const metadata = { title: 'Finanzas' }

export default async function AdminFinanzasPage() {
    const [data, addonMetrics, coachAddons] = await Promise.all([
        getFinanzasData(),
        getAddonMetrics(),
        getCoachAddonsDetail(),
    ])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-strong">Finanzas</h1>
                <p className="text-xs text-muted">Revenue, churn y eventos de suscripción.</p>
            </div>

            <FinanzasKpis
                mrrEstimate={data.mrrEstimate}
                arrEstimate={data.arrEstimate}
                mrrGross={data.mrrGross}
                mrrDiscountClp={data.mrrDiscountClp}
                byProvider={data.byProvider}
                paidCoachCount={data.paidCoachCount}
                arpc={data.arpc}
            />

            <LiveDiscountsSection rows={data.liveDiscounts} />

            <FinanzasCharts
                mrrSeries={data.mrrSeries}
                churnSeries={data.churnSeries}
                revenueByCycle={data.revenueByCycle}
                revenueByTier={data.revenueByTier}
            />

            <AddonMetricsSection metrics={addonMetrics} />

            <AddonsByCoachSection rows={coachAddons} />

            <LegacyTierCard rows={data.legacyTierCounts} />

            <RevenueTable events={data.recentEvents} />
        </div>
    )
}
