'use client'

import { useState, useEffect } from 'react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { BarChart3, TrendingUp } from 'lucide-react'

interface DashboardChartsProps {
    areaData: any[]
    barData: any[]
}

export function DashboardCharts({ areaData, barData }: DashboardChartsProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <GlassCard className="h-[400px] animate-pulse bg-card/50" />
                <GlassCard className="h-[400px] animate-pulse bg-card/50" />
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <GlassCard className="h-full flex flex-col bg-card dark:bg-zinc-950">
                    <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-blue-500/10">
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                            </div>
                            <h2 className="text-xs font-bold text-foreground uppercase tracking-[0.2em] font-display">
                                Crecimiento de Alumnos
                            </h2>
                        </div>
                    </div>
                    <div className="p-6 h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorAlumnos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-[0.05] dark:opacity-[0.1]" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.4 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.4 }}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        color: '#fff'
                                    }}
                                    itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="alumnos" 
                                    stroke="#3b82f6" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorAlumnos)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
            >
                <GlassCard className="h-full flex flex-col bg-card dark:bg-zinc-950">
                    <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-cyan-400/10">
                                <BarChart3 className="w-4 h-4 text-cyan-400" />
                            </div>
                            <h2 className="text-xs font-bold text-foreground uppercase tracking-[0.2em] font-display">
                                Check-ins Semanales
                            </h2>
                        </div>
                    </div>
                    <div className="p-6 h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-[0.05] dark:opacity-[0.1]" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.4 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.4 }}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        color: '#fff'
                                    }}
                                    itemStyle={{ color: '#22d3ee', fontWeight: 'bold' }}
                                />
                                <Bar 
                                    dataKey="checkins" 
                                    fill="#22d3ee" 
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    )
}