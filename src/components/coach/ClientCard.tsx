'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
    TrendingUp,
    TrendingDown,
    Smartphone,
    Calendar,
    Activity,
    ChevronDown,
    ChevronUp,
    Star,
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { MiniSparkline } from './MiniSparkline'
import { ResetPasswordButton } from '@/app/coach/clients/ResetPasswordButton'
import { ToggleStatusButton } from '@/app/coach/clients/ToggleStatusButton'
import { DeleteClientButton } from '@/app/coach/clients/DeleteClientButton'
import { useState } from 'react'
import type { DirectoryPulseRow } from '@/services/dashboard.service'

function ClientCardAttentionBadge({ score, streak }: { score: number; streak: number }) {
    if (score >= 50) {
        return (
            <span className="inline-flex shrink-0 animate-pulse items-center rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-500">
                Atención urgente
            </span>
        )
    }
    if (score >= 25) {
        return (
            <span className="inline-flex shrink-0 items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-500">
                Revisar
            </span>
        )
    }
    if (score === 0 && streak > 10) {
        return (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                Destacado
            </span>
        )
    }
    return (
        <span className="inline-flex shrink-0 items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            On track
        </span>
    )
}

function ClientCardStatusBadge({ forceChange, isActive }: { forceChange: boolean; isActive?: boolean | null }) {
    if (isActive === false) {
        return (
            <span className="inline-flex items-center rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-500">
                Pausado
            </span>
        )
    }
    if (forceChange) {
        return (
            <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-500">
                Pendiente Sync
            </span>
        )
    }
    return (
        <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
            Activo
        </span>
    )
}

interface ClientCardProps {
    client: any
    loginUrl: string
    whatsappLink: string
    subscriptionDaysRemaining: number | null
    remainingDays: number | null
    activeProgramName: string | null
    pulse?: DirectoryPulseRow | null
}

export function ClientCard({
    client,
    loginUrl,
    whatsappLink,
    subscriptionDaysRemaining,
    remainingDays,
    activeProgramName,
    pulse,
}: ClientCardProps) {
    const weightData =
        pulse?.weightHistory30d?.length ?
            pulse.weightHistory30d.map((d) => ({ value: d.value }))
        :   [
                { value: 75.0 },
                { value: 74.8 },
                { value: 74.5 },
            ]

    const adherenceData =
        pulse?.adherenceHistory4w?.length ?
            pulse.adherenceHistory4w.map((v) => ({ value: v }))
        :   [{ value: 80 }, { value: 90 }, { value: 75 }, { value: 84 }]

    const adherencePct = pulse?.percentage ?? 84
    const nutritionPct = pulse?.nutritionPercentage ?? 0
    const currentWeight = pulse?.currentWeight
    const weightDelta = pulse?.weightDelta7d
    const score = pulse?.attentionScore ?? 0
    const streak = pulse?.streak ?? 0

    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
        >
            <GlassCard 
                hoverEffect
                className="group relative bg-white/80 dark:bg-zinc-950/40 p-0 overflow-visible border-border dark:border-white/5 transition-all duration-500 shadow-xl dark:shadow-[0_0_20px_-5px_var(--theme-primary,rgba(0,122,255,0.2))]"
            >
                {/* Hover Light Effect */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_97%),transparent_70%)] dark:bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_85%),transparent_75%)] pointer-events-none rounded-2xl" />
                
                <div className="p-6 md:p-8 space-y-8 relative z-10">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-5 w-full">
                            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/30 transition-all duration-500 shadow-inner group-hover:scale-110">
                                <span className="text-2xl font-black text-foreground uppercase font-display">
                                    {client.full_name[0]}
                                </span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <a href={`/coach/clients/${client.id}`} className="group/name min-w-0">
                                        <h3 className="text-lg font-black text-foreground uppercase tracking-tighter truncate font-display group-hover/name:text-primary transition-colors leading-none">
                                            {client.full_name}
                                        </h3>
                                    </a>
                                    {pulse ? <ClientCardAttentionBadge score={score} streak={streak} /> : null}
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate mt-2">
                                    {client.email}
                                </p>
                            </div>
                            <GlassButton 
                                size="icon" 
                                variant="ghost" 
                                className="h-10 w-10 rounded-xl shrink-0"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                )}
                            </GlassButton>
                        </div>
                    </div>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-8 overflow-hidden"
                            >
                                {/* Analytics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/40 dark:bg-white/[0.02] border border-border/50 dark:border-white/5 rounded-2xl p-4 flex flex-col gap-3 transition-colors group-hover:bg-white/60 dark:group-hover:bg-white/[0.05]">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Adherencia</span>
                                <div
                                className={`flex items-center gap-0.5 ${
                                    adherencePct >= 70 ? 'text-emerald-500' : 'text-amber-500'
                                }`}
                            >
                                <TrendingUp className="w-3 h-3" />
                                <span className="text-[9px] font-black">rutina</span>
                            </div>
                            </div>
                            <div className="flex items-end gap-1.5 mb-1">
                                <span className="text-xl font-black text-foreground leading-none">
                                    {adherencePct}%
                                </span>
                            </div>
                            <MiniSparkline data={adherenceData} color="#10B981" />
                            <p className="text-[9px] text-muted-foreground font-medium">
                                Nutrición (7d): {nutritionPct}%
                            </p>
                        </div>
                        <div className="bg-white/40 dark:bg-white/[0.02] border border-border/50 dark:border-white/5 rounded-2xl p-4 flex flex-col gap-3 transition-colors group-hover:bg-white/60 dark:group-hover:bg-white/[0.05]">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Peso Actual</span>
                                <div
                                    className={`flex items-center gap-0.5 ${
                                        weightDelta != null && weightDelta < 0 ?
                                            'text-emerald-500'
                                        : weightDelta != null && weightDelta > 0 ? 'text-rose-500'
                                        : 'text-muted-foreground'
                                    }`}
                                >
                                    {weightDelta != null && weightDelta < 0 ?
                                        <TrendingDown className="w-3 h-3" />
                                    : weightDelta != null && weightDelta > 0 ?
                                        <TrendingUp className="w-3 h-3" />
                                    : null}
                                    <span className="text-[9px] font-black">
                                        {weightDelta != null ?
                                            `${weightDelta > 0 ? '+' : ''}${weightDelta} kg (7d)`
                                        :   '—'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-end gap-1.5 mb-1">
                                <span className="text-xl font-black text-foreground leading-none">
                                    {currentWeight != null ? currentWeight : '—'}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground mb-0.5">KG</span>
                            </div>
                            <MiniSparkline data={weightData} color="#007AFF" />
                        </div>
                    </div>

                    {/* Protocols & Status */}
                    <div className="space-y-4">
                        <div className="flex items-center flex-wrap gap-2">
                            <ClientCardStatusBadge forceChange={client.force_password_change} isActive={client.is_active} />
                            {subscriptionDaysRemaining !== null && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${subscriptionDaysRemaining <= 5 ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                    {subscriptionDaysRemaining > 0 ? `${subscriptionDaysRemaining} Días Restantes` : 'Vencido'}
                                </span>
                            )}
                        </div>

                        {activeProgramName ? (
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/10 transition-all group-hover:bg-primary/10">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                        <Calendar className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">Protocolo Activo</p>
                                        <p className="text-xs font-bold text-foreground truncate max-w-[120px]">{activeProgramName}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-foreground leading-none">
                                        {remainingDays !== null ?
                                            remainingDays > 0 ?
                                                remainingDays
                                            :   0
                                        :   '—'}
                                    </p>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                        Días prog.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/50 dark:bg-white/[0.02] border border-dashed border-border dark:border-white/10 opacity-60">
                                <Activity className="w-4 h-4 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sin Protocolo Asignado</span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4 border-t border-border dark:border-white/5">
                        {client.phone && loginUrl ? (
                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-4 h-11 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                            >
                                <Smartphone className="w-3.5 h-3.5" />
                                Enviar Link Login
                            </a>
                        ) : (
                            <div className="flex-1 h-11 flex items-center justify-center bg-muted/50 rounded-xl text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                                Sin Teléfono
                            </div>
                        )}

                        <div className="flex items-center gap-1.5">
                            <ResetPasswordButton
                                clientId={client.id}
                                clientName={client.full_name}
                            />
                            <ToggleStatusButton
                                clientId={client.id}
                                clientName={client.full_name}
                                isActive={client.is_active !== false}
                            />
                            <DeleteClientButton
                                clientId={client.id}
                                clientName={client.full_name}
                            />
                        </div>
                    </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </GlassCard>
        </motion.div>
    )
}
