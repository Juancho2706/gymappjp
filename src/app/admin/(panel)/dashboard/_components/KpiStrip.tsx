'use client'

import { motion } from 'framer-motion'
import { Users, UserCheck, TrendingUp, Zap } from 'lucide-react'
import type { PlatformOverview } from '../_data/types'
import { GlassCard } from '@/components/ui/glass-card'

interface Props {
    data: PlatformOverview
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
}

const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
}

export function KpiStrip({ data }: Props) {
    const kpiCards = [
        {
            label: 'Total Coaches',
            value: data.totalCoaches,
            sub: `${data.activeCoaches} activos`,
            icon: Users,
            color: 'text-blue-400',
        },
        {
            label: 'Total Alumnos',
            value: data.totalClients,
            sub: `registrados por coaches`,
            icon: UserCheck,
            color: 'text-emerald-400',
        },
        {
            label: 'MRR Estimado',
            value: `$${data.mrrEstimate.toLocaleString('es-CL')}`,
            sub: data.mrrDeltaPct !== null ? `${data.mrrDeltaPct > 0 ? '+' : ''}${data.mrrDeltaPct}% vs mes ant.` : 'solo pagos MercadoPago',
            icon: TrendingUp,
            color: 'text-violet-400',
            delta: data.mrrDeltaPct,
        },
        {
            label: 'Beta Invites',
            value: data.betaInvitesCount,
            sub: 'coaches sin pago',
            icon: Zap,
            color: 'text-amber-400',
        },
    ]

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
            {kpiCards.map((kpi) => (
                <motion.div key={kpi.label} variants={item}>
                    <GlassCard className="flex items-center gap-4 p-4">
                        <div className={`rounded-lg bg-neutral-800/50 p-2.5 ${kpi.color}`}>
                            <kpi.icon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-neutral-400">{kpi.label}</p>
                            <p className="text-lg font-semibold text-white">{kpi.value}</p>
                            <p className={`text-xs ${kpi.delta !== undefined && kpi.delta !== null ? (kpi.delta >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-neutral-500'}`}>
                                {kpi.sub}
                            </p>
                        </div>
                    </GlassCard>
                </motion.div>
            ))}
        </motion.div>
    )
}
