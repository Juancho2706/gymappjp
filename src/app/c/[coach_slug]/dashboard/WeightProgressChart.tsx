'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TrendingUp, Scale } from 'lucide-react'

interface CheckIn {
    date: string
    weight: number
}

interface Props {
    data: CheckIn[]
    primaryColor?: string
}

export function WeightProgressChart({ data, primaryColor = '#10B981' }: Props) {
    if (!data || data.length === 0) {
        return (
            <Card className="bg-card border-border shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        Progreso de Peso
                    </CardTitle>
                    <CardDescription>Aún no hay datos suficientes</CardDescription>
                </CardHeader>
                <CardContent className="h-48 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                        <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Realiza check-ins para ver tu progreso</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Format dates for display
    const formattedData = [...data].reverse().map(item => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }))

    const minWeight = Math.min(...data.map(d => d.weight))
    const maxWeight = Math.max(...data.map(d => d.weight))
    const domainPadding = (maxWeight - minWeight) * 0.2 || 5

    return (
        <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" style={{ color: primaryColor }} />
                    Evolución de Peso
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="h-64 w-full pr-4 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
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
                                stroke={primaryColor}
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorWeight)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}