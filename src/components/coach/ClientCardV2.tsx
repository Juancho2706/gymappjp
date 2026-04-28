'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    Star,
    Smartphone,
    Eye,
    Dumbbell,
    Apple,
    MoreHorizontal,
    Calendar,
    Activity,
    AlertTriangle,
    Trash2,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ResetPasswordButton } from '@/app/coach/clients/ResetPasswordButton'
import { ToggleStatusButton } from '@/app/coach/clients/ToggleStatusButton'
import { deleteClientAction } from '@/app/coach/clients/actions'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { cn } from '@/lib/utils'

interface ClientCardV2Props {
    client: any
    loginUrl: string
    whatsappLink: string
    subscriptionDaysRemaining: number | null
    remainingDays: number | null
    activeProgramName: string | null
    pulse: DirectoryPulseRow | null | undefined
}

function SparkArea({
    data,
    color,
    gradId,
}: {
    data: { value: number }[]
    color: string
    gradId: string
}) {
    if (!data.length) {
        return (
            <div className="flex h-8 items-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Sin datos
            </div>
        )
    }
    return (
        <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#${gradId})`}
                    dot={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    )
}

function lastLogMeta(dateStr: string | null | undefined) {
    if (!dateStr) return { label: 'Sin datos', days: 999 }
    const days = differenceInDays(new Date(), new Date(dateStr))
    if (days <= 0) return { label: 'Hoy', days: 0 }
    if (days === 1) return { label: 'Ayer', days: 1 }
    return { label: `Hace ${days}d`, days }
}

function dotClass(days: number) {
    if (days < 3) return 'bg-emerald-500'
    if (days < 7) return 'bg-amber-500'
    return 'bg-red-500 animate-pulse'
}

function ClientCardV2AttentionBadge({ score, streak }: { score: number; streak: number }) {
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

export function ClientCardV2({
    client,
    loginUrl,
    whatsappLink,
    subscriptionDaysRemaining,
    remainingDays,
    activeProgramName,
    pulse,
}: ClientCardV2Props) {
    const router = useRouter()
    const gradW = `spark-w-${client.id?.slice(0, 8) ?? 'x'}`
    const gradA = `spark-a-${client.id?.slice(0, 8) ?? 'x'}`

    const adherencePct = pulse?.percentage ?? 0
    const weightSeries =
        pulse?.weightHistory30d?.length ?
            pulse.weightHistory30d.map((d) => ({ value: d.value }))
        :   []
    const adherenceSeries =
        pulse?.adherenceHistory4w?.length ?
            pulse.adherenceHistory4w.map((v) => ({ value: v }))
        :   []

    const currentWeight = pulse?.currentWeight
    const weightDelta = pulse?.weightDelta7d
    const score = pulse?.attentionScore ?? 0
    const streak = pulse?.streak ?? 0
    const energy = pulse?.latestEnergyLevel
    const stars =
        energy != null ? Math.min(5, Math.max(0, Math.round(energy / 2))) : 0

    const lastLog = lastLogMeta(pulse?.lastWorkoutDate)
    const nutritionPct = pulse?.nutritionPercentage ?? 0
    const hasNutritionData = nutritionPct > 0
    const nutritionRisk = pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false
    const weekCur = pulse?.planCurrentWeek
    const weekTot = pulse?.planTotalWeeks
    const weekPct =
        weekCur && weekTot && weekTot > 0 ?
            Math.min(100, Math.round((weekCur / weekTot) * 100))
        :   0

    const ringColor =
        adherencePct > 80 ? '#10B981' : adherencePct > 50 ? '#F59E0B' : '#EF4444'

    const [deleteOpen, setDeleteOpen] = useState(false)
    const [delErr, setDelErr] = useState<string>()
    const [isDel, startDel] = useTransition()

    function runDelete() {
        startDel(async () => {
            const r = await deleteClientAction(client.id)
            if (r.error) setDelErr(r.error)
            else setDeleteOpen(false)
        })
    }

    const profileHref = `/coach/clients/${client.id}`
    const builderHref = `/coach/builder/${client.id}`
    const nutritionHref = `/coach/nutrition-plans/client/${client.id}`

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 24, scale: 0.96 },
                show: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: 'spring', stiffness: 300, damping: 24 },
                },
            }}
            whileHover={{
                y: -6,
                boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
                transition: { type: 'spring', stiffness: 350, damping: 28 },
            }}
        >
            <GlassCard
                hoverEffect
                className="group relative overflow-visible border-border bg-white/80 p-0 dark:border-white/5 dark:bg-zinc-950/40"
            >
                <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--theme-primary),transparent_97%),transparent_70%)] dark:bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--theme-primary),transparent_85%),transparent_75%)] pointer-events-none" />

                <div className="relative z-10 space-y-4 p-5 md:p-6">
                    <div className="flex gap-4">
                        <div className="relative h-[72px] w-[72px] shrink-0">
                            <CircularProgressbar
                                value={adherencePct}
                                strokeWidth={6}
                                styles={buildStyles({
                                    pathColor: ringColor,
                                    trailColor: 'rgba(255,255,255,0.08)',
                                    strokeLinecap: 'round',
                                })}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="font-display text-xl font-black uppercase text-foreground">
                                    {client.full_name?.[0] ?? '?'}
                                </span>
                            </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={profileHref}
                                            className="font-display text-base font-black uppercase tracking-tighter text-foreground hover:text-primary"
                                        >
                                            {client.full_name}
                                        </Link>
                                        {pulse ? <ClientCardV2AttentionBadge score={score} streak={streak} /> : null}
                                    </div>
                                    <p className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        {client.email}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    <ResetPasswordButton
                                        clientId={client.id}
                                        clientName={client.full_name}
                                    />
                                    <ToggleStatusButton
                                        clientId={client.id}
                                        clientName={client.full_name}
                                        isActive={client.is_active !== false}
                                    />
                                    <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger
                                            type="button"
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/50 px-0 text-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/[0.14]"
                                            aria-label="Más opciones"
                                        >
                                            <MoreHorizontal
                                                className="pointer-events-none h-5 w-5 shrink-0 text-foreground dark:text-foreground"
                                                strokeWidth={2.5}
                                                aria-hidden
                                            />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[200px] rounded-xl">
                                            <DropdownMenuItem
                                                onClick={() => router.push(profileHref)}
                                            >
                                                <Eye className="mr-2 h-4 w-4" />
                                                Ver perfil
                                            </DropdownMenuItem>
                                            {client.phone && loginUrl ?
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        window.open(whatsappLink, '_blank', 'noopener,noreferrer')
                                                    }
                                                >
                                                    <Smartphone className="mr-2 h-4 w-4" />
                                                    Enviar WhatsApp
                                                </DropdownMenuItem>
                                            : null}
                                            <DropdownMenuItem onClick={() => router.push(builderHref)}>
                                                <Dumbbell className="mr-2 h-4 w-4" />
                                                Entrenamiento
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(nutritionHref)}>
                                                <Apple className="mr-2 h-4 w-4" />
                                                Nutrición
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onClick={() => setDeleteOpen(true)}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Eliminar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border border-border/50 bg-white/40 p-2 dark:border-white/5 dark:bg-white/[0.02]">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
                                Adherencia
                            </p>
                            <p className="font-display text-lg font-black text-foreground">{adherencePct}%</p>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${adherencePct}%`,
                                        backgroundColor: 'var(--theme-primary, #007AFF)',
                                    }}
                                />
                            </div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-white/40 p-2 dark:border-white/5 dark:bg-white/[0.02]">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
                                Peso hoy
                            </p>
                            <p className="font-display text-lg font-black text-foreground">
                                {currentWeight != null ? `${currentWeight} kg` : '—'}
                            </p>
                            <p className="text-[9px] font-bold text-muted-foreground">
                                {weightDelta != null ?
                                    `${weightDelta > 0 ? '↑' : weightDelta < 0 ? '↓' : ''}${Math.abs(weightDelta)} (7d)`
                                :   ''}
                            </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-white/40 p-2 dark:border-white/5 dark:bg-white/[0.02]">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
                                Energía
                            </p>
                            <div className="mt-1 flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                        key={i}
                                        className={cn(
                                            'h-3.5 w-3.5',
                                            i <= stars ?
                                                'fill-amber-400 text-amber-400'
                                            :   'text-zinc-300 dark:text-zinc-600'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-white/40 p-2 dark:border-white/5 dark:bg-white/[0.02]">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
                                Último log
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                                <span
                                    className={cn('h-2 w-2 rounded-full', dotClass(lastLog.days))}
                                />
                                <span className="text-xs font-bold text-foreground">{lastLog.label}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                            Peso (30d)
                        </p>
                        <SparkArea data={weightSeries} color="#007AFF" gradId={gradW} />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                            Adherencia (4 sem)
                        </p>
                        <SparkArea data={adherenceSeries} color="#10B981" gradId={gradA} />
                    </div>

                    {hasNutritionData && (
                        <div className={cn(
                            'flex items-center gap-3 rounded-xl border p-3',
                            nutritionRisk
                                ? 'border-rose-500/25 bg-rose-500/5 dark:border-rose-500/20'
                                : 'border-emerald-500/20 bg-emerald-500/5 dark:border-emerald-500/15'
                        )}>
                            <Apple className={cn('h-4 w-4 shrink-0', nutritionRisk ? 'text-rose-500' : 'text-emerald-500')} />
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className={cn(
                                        'text-[9px] font-bold uppercase tracking-widest',
                                        nutritionRisk ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
                                    )}>
                                        {nutritionRisk ? 'Baja adherencia nutricional' : 'Nutrición'}
                                    </p>
                                    <span className={cn(
                                        'text-[10px] font-black tabular-nums',
                                        nutritionRisk ? 'text-rose-500' : 'text-foreground'
                                    )}>
                                        {nutritionPct}%
                                    </span>
                                </div>
                                <div className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${Math.min(100, nutritionPct)}%`,
                                            backgroundColor: nutritionRisk ? '#ef4444' : '#10b981',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeProgramName ?
                        <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-3 dark:border-primary/20">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-primary">
                                            Programa
                                        </p>
                                        <p className="truncate text-xs font-bold text-foreground">
                                            {activeProgramName}
                                        </p>
                                    </div>
                                </div>
                                <span className="shrink-0 text-[10px] font-black text-foreground">
                                    Sem {weekCur ?? '—'}/{weekTot ?? '—'}
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{
                                        width: `${weekPct}%`,
                                        backgroundColor: 'var(--theme-primary, #007AFF)',
                                    }}
                                />
                            </div>
                            <p className="text-[10px] font-medium text-muted-foreground">
                                {remainingDays != null ?
                                    `${remainingDays > 0 ? remainingDays : 0} días restantes`
                                :   'Sin fechas de programa'}
                                {weekTot ? ` · ${weekTot} semanas totales` : ''}
                            </p>
                        </div>
                    :   <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 opacity-70 dark:border-white/10">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Sin programa asignado
                            </span>
                        </div>
                    }

                    {subscriptionDaysRemaining !== null && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                            Suscripción:{' '}
                            <span
                                className={
                                    subscriptionDaysRemaining <= 5 ?
                                        'text-rose-500'
                                    :   'text-primary'
                                }
                            >
                                {subscriptionDaysRemaining > 0 ?
                                    `${subscriptionDaysRemaining} días`
                                :   'Vencida'}
                            </span>
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4 dark:border-white/10">
                        {client.phone && loginUrl ?
                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 active:scale-[0.98]"
                            >
                                <Smartphone className="h-3.5 w-3.5" /> WA
                            </a>
                        : null}
                        <Link
                            href={profileHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border border-border bg-white/50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                            <Eye className="h-3.5 w-3.5" /> Perfil
                        </Link>
                        <Link
                            href={builderHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border border-border bg-white/50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                            <Dumbbell className="h-3.5 w-3.5" /> Workout
                        </Link>
                        <Link
                            href={nutritionHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border border-border bg-white/50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                            <Apple className="h-3.5 w-3.5" /> Nutri
                        </Link>
                    </div>
                </div>
            </GlassCard>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent className="rounded-2xl border border-border bg-card text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Eliminar alumno
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Eliminar a <span className="font-medium text-foreground">{client.full_name}</span>? No se
                            puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {delErr ? <p className="text-sm text-destructive">{delErr}</p> : null}
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={runDelete}
                            disabled={isDel}
                            className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                        >
                            {isDel ? 'Eliminando…' : 'Sí, eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
