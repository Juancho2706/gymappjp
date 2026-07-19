'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

interface CheckIn {
    date: string
    weight: number
}

interface Props {
    data: CheckIn[]
    coachSlug?: string
}

/**
 * Difiere recharts (~85 KB gz) fuera del First Load del dashboard: el chart real vive en
 * `WeightProgressChartInner` y se carga con `next/dynamic({ ssr: false })`. El skeleton replica el
 * Card + header + alto exacto (`h-64`) para no mover el layout al montar (light/dark via tokens).
 */
const WeightProgressChartInner = dynamic(
    () => import('./WeightProgressChartInner').then((m) => ({ default: m.WeightProgressChartInner })),
    {
        ssr: false,
        loading: () => (
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2 font-display">
                        <TrendingUp className="w-4 h-4 text-sport-500" />
                        Evolución de Peso
                    </CardTitle>
                </CardHeader>
                <CardContent className="h-64 animate-pulse bg-surface-sunken/40" />
            </Card>
        ),
    }
)

export function WeightProgressChart({ data, coachSlug }: Props) {
    return <WeightProgressChartInner data={data} coachSlug={coachSlug} />
}
