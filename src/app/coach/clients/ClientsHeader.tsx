'use client'

import { useState } from 'react'
import { UserPlus, Copy, Check, Users, ShieldCheck, AlertCircle } from 'lucide-react'
import { CreateClientModal } from './CreateClientModal'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'

interface ClientsHeaderProps {
    coachSlug?: string
    appUrl?: string
    stats?: {
        total: number
        active: number
        pending: number
    }
}

export function ClientsHeader({ coachSlug, appUrl, stats }: ClientsHeaderProps) {
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    const loginUrl = coachSlug && appUrl ? `${appUrl}/c/${coachSlug}/login` : ''

    const handleCopy = () => {
        if (loginUrl) {
            navigator.clipboard.writeText(loginUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <>
            <div className="space-y-8 mb-12">
                {/* Top Section: Title and Primary CTA */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
                    <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none z-0" />
                    
                    <div className="relative z-10">
                        <h1 className="text-4xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display">
                            Directorio de Unidades
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium mt-2 max-w-md leading-relaxed">
                            Gestión centralizada de activos, seguimiento de protocolos y métricas de despliegue.
                        </p>
                        
                        {loginUrl && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 inline-flex items-center gap-3 bg-white/50 dark:bg-white/[0.03] backdrop-blur-md border border-border dark:border-white/10 rounded-full px-4 py-2 cursor-pointer hover:bg-white/80 dark:hover:bg-white/[0.06] transition-all group" 
                                onClick={handleCopy}
                            >
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Portal alumnos:</span>
                                <span className="text-xs text-primary font-bold truncate max-w-[200px]">{loginUrl}</span>
                                <div className="p-1 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </div>
                            </motion.div>
                        )}
                    </div>
                    
                    <div className="relative z-10 w-full md:w-auto">
                        <GlassButton 
                            onClick={() => setOpen(true)}
                            className="w-full md:w-auto px-8 h-14 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(0,122,255,0.5)] border-none"
                        >
                            <UserPlus className="w-5 h-5 mr-2" />
                            <span className="font-bold uppercase tracking-widest text-xs">Nueva Alta</span>
                        </GlassButton>
                    </div>
                </div>

                {/* Stats Grid - Integrated into Header */}
                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 relative z-10">
                        {[
                            {
                                label: 'Total Alumnos',
                                value: stats.total,
                                icon: Users,
                                color: 'text-zinc-400',
                                gradient: 'from-zinc-500/10 to-transparent'
                            },
                            {
                                label: 'Despliegues Activos',
                                value: stats.active,
                                icon: ShieldCheck,
                                color: 'text-primary',
                                gradient: 'from-primary/10 to-transparent'
                            },
                            {
                                label: 'Pendientes Sync',
                                value: stats.pending,
                                icon: AlertCircle,
                                color: 'text-amber-500',
                                gradient: 'from-amber-500/10 to-transparent'
                            },
                        ].map((stat, i) => (
                            <GlassCard key={i} className="group relative overflow-hidden bg-white/80 dark:bg-zinc-950/50">
                                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-50`} />
                                <div className="relative z-10 p-6 flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-xl bg-white/50 dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-3xl font-black text-foreground tracking-tighter font-display leading-none">
                                            {stat.value}
                                        </p>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-2">{stat.label}</p>
                                    </div>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                )}
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
