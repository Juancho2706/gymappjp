'use client'

import { useState, useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TrendingUp, Scale, Plus } from 'lucide-react'
import Link from 'next/link'
import { useBasePath } from '@/components/client/BasePathProvider'

/** Brand-themed chart color: per-coach DS sport ramp (white-label override), never a hardcoded hex. */
const THEME_PRIMARY = 'var(--sport-500)'

interface CheckIn {
    date: string
    weight: number
}

interface Props {
    data: CheckIn[]
    coachSlug?: string
}

/**
 * Render recharts de la evolucion de peso. Se carga con `next/dynamic({ ssr: false })` desde
 * `WeightProgressChart` para mantener recharts+d3 fuera del First Load del dashboard.
 */
export function WeightProgressChartInner({ data, coachSlug }: Props) {
    const base = useBasePath(`/c/${coachSlug}`)
    const reduce = useReducedMotion()
    const [mounted, setMounted] = useState(false)
    const chartRef = useRef<HTMLDivElement>(null)
    const [chartWidth, setChartWidth] = useState(0)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!chartRef.current) return
        const updateWidth = () => setChartWidth(Math.max(0, Math.floor(chartRef.current?.clientWidth ?? 0)))
        updateWidth()
        const observer = new ResizeObserver(updateWidth)
        observer.observe(chartRef.current)
        return () => observer.disconnect()
    }, [])

    if (!mounted) {
        return (
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2 font-display">
                        <TrendingUp className="w-4 h-4 text-sport-500" />
                        Evolución de Peso
                    </CardTitle>
                </CardHeader>
                <CardContent className="h-64 animate-pulse bg-surface-sunken/40" />
            </Card>
        )
    }

    if (!data || data.length === 0) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 font-display">
                        <TrendingUp className="w-4 h-4 text-muted" />
                        Progreso de Peso
                    </CardTitle>
                    <CardDescription>Aún no hay datos suficientes</CardDescription>
                </CardHeader>
                <CardContent className="h-48 flex flex-col items-center justify-center gap-3">
                    <div className="text-center text-muted">
                        <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Realiza tu primer check-in para medir tu progreso.</p>
                    </div>
                    {coachSlug && (
                        <Link
                            href={`${base}/check-in`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-control text-sm font-bold transition-all hover:opacity-90 active:scale-95 text-on-sport"
                            style={{ backgroundColor: 'var(--cta-fill)' }}
                        >
                            <Plus className="w-4 h-4" />
                            Registrar Peso Hoy
                        </Link>
                    )}
                </CardContent>
            </Card>
        )
    }

    const formattedData = [...data].reverse().map((item) => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    }))

    const minWeight = Math.min(...data.map((d) => d.weight))
    const maxWeight = Math.max(...data.map((d) => d.weight))
    const domainPadding = (maxWeight - minWeight) * 0.2 || 5

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2 font-display">
                    <TrendingUp className="w-4 h-4 text-sport-500" />
                    Evolución de Peso
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div ref={chartRef} className="h-64 w-full min-w-px pr-4 pb-2">
                    {chartWidth > 0 && (
                        <AreaChart
                            width={chartWidth}
                            height={256}
                            data={formattedData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={THEME_PRIMARY} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={THEME_PRIMARY} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                            <XAxis
                                dataKey="displayDate"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                                dy={10}
                            />
                            <YAxis
                                domain={[minWeight - domainPadding, maxWeight + domainPadding]}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                                tickFormatter={(val) => `${val.toFixed(1)}kg`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--card)',
                                    borderColor: 'var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                }}
                                itemStyle={{ color: 'var(--foreground)' }}
                                labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="weight"
                                stroke={THEME_PRIMARY}
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorWeight)"
                                isAnimationActive={!reduce}
                            />
                        </AreaChart>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
