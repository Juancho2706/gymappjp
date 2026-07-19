'use client'

import dynamic from 'next/dynamic'

interface Point {
    iso: string
    weight: number
}

/**
 * Difiere recharts (~86 KB gz) fuera del First Load del dashboard: el chart real vive en
 * `WeightSparklineChart` y se carga con `next/dynamic({ ssr: false })`. El skeleton respeta el alto
 * exacto (`mt-3 h-[72px]`) para no mover el layout al montar.
 */
const WeightSparklineChart = dynamic(
    () => import('./WeightSparklineChart').then((m) => ({ default: m.WeightSparklineChart })),
    {
        ssr: false,
        loading: () => <div className="mt-3 h-[72px] w-full min-w-px" aria-hidden />,
    }
)

export function WeightSparkline({ data }: { data: Point[] }) {
    if (data.length === 0) return null
    return <WeightSparklineChart data={data} />
}
