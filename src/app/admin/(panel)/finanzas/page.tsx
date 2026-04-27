import { getFinanzasData } from './_data/finanzas.queries'
import { FinanzasKpis } from './_components/FinanzasKpis'
import { FinanzasCharts } from './_components/FinanzasCharts'
import { RevenueTable } from './_components/RevenueTable'

export const metadata = { title: 'Finanzas' }

export default async function AdminFinanzasPage() {
    const data = await getFinanzasData()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Finanzas</h1>
                <p className="text-xs text-[--admin-text-3]">Revenue, churn y eventos de suscripción.</p>
            </div>

            <FinanzasKpis
                mrrEstimate={data.mrrEstimate}
                arrEstimate={data.arrEstimate}
                paidCoachCount={data.paidCoachCount}
                arpc={data.arpc}
            />

            <FinanzasCharts
                mrrSeries={data.mrrSeries}
                churnSeries={data.churnSeries}
                revenueByCycle={data.revenueByCycle}
                revenueByTier={data.revenueByTier}
            />

            <RevenueTable events={data.recentEvents} />
        </div>
    )
}
