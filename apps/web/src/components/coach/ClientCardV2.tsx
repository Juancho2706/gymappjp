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
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { deleteClientAction } from '@/app/coach/clients/_actions/clients.actions'
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
            <div className="flex h-8 items-center text-[9px] font-bold uppercase tracking-widest text-muted">
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
    if (days < 3) return 'bg-[var(--success-500)]'
    if (days < 7) return 'bg-[var(--warning-500)]'
    return 'bg-[var(--danger-500)] animate-pulse'
}

function ClientCardV2AttentionBadge({ score, streak }: { score: number; streak: number }) {
    if (score >= 50) {
        return (
            <Badge tone="danger" variant="soft" size="sm" className="animate-pulse uppercase tracking-widest">
                Atención urgente
            </Badge>
        )
    }
    if (score >= 25) {
        return (
            <Badge tone="warning" variant="soft" size="sm" className="uppercase tracking-widest">
                Revisar
            </Badge>
        )
    }
    if (score === 0 && streak > 10) {
        return (
            <Badge
                tone="success"
                variant="soft"
                size="sm"
                className="uppercase tracking-widest"
                icon={<Star className="fill-[var(--warning-500)] text-[var(--warning-500)]" />}
            >
                Destacado
            </Badge>
        )
    }
    return (
        <Badge tone="success" variant="soft" size="sm" className="uppercase tracking-widest">
            On track
        </Badge>
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
        adherencePct > 80
            ? 'var(--success-500)'
            : adherencePct > 50
              ? 'var(--warning-500)'
              : 'var(--danger-500)'

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
            <Card
                interactive
                padding="none"
                className="group relative overflow-visible"
            >
                <div className="absolute inset-0 rounded-card bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--sport-500),transparent_94%),transparent_70%)] pointer-events-none" />

                <div className="relative z-10 space-y-4 p-5 md:p-6">
                    <div className="flex gap-4">
                        <div className="relative h-[72px] w-[72px] shrink-0">
                            {nutritionRisk && hasNutritionData ?
                                <span
                                    className="absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full border border-rose-700 bg-rose-500 px-1 text-[9px] font-black leading-none text-white shadow-md"
                                    title={`Nutrición baja: ${nutritionPct}%`}
                                    aria-label={`Nutrición baja, adherencia ${nutritionPct} por ciento`}
                                >
                                    !
                                </span>
                            : null}
                            <CircularProgressbar
                                value={adherencePct}
                                strokeWidth={6}
                                styles={buildStyles({
                                    pathColor: ringColor,
                                    trailColor: 'var(--track)',
                                    strokeLinecap: 'round',
                                })}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="font-display text-xl font-black uppercase text-strong">
                                    {client.full_name?.[0] ?? '?'}
                                </span>
                            </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={profileHref}
                                            className="font-display text-base font-black uppercase tracking-tighter text-strong hover:text-sport-600 truncate"
                                        >
                                            {client.full_name}
                                        </Link>
                                        {pulse ? <ClientCardV2AttentionBadge score={score} streak={streak} /> : null}
                                    </div>
                                    <p className="truncate text-[10px] font-bold uppercase tracking-widest text-subtle">
                                        {client.email}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5 self-end sm:self-start">
                                    <ResetPasswordButton
                                        clientId={client.id}
                                        clientName={client.full_name}
                                    />
                                    <ToggleStatusButton
                                        clientId={client.id}
                                        clientName={client.full_name}
                                        isActive={client.is_active !== false}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setDeleteOpen(true)}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-[color:var(--danger-500)]/30 bg-[var(--danger-100)] px-0 text-[var(--danger-600)] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--danger-500)] hover:text-white"
                                        aria-label="Eliminar alumno"
                                        title="Eliminar alumno"
                                    >
                                        <Trash2 className="h-5 w-5" strokeWidth={2.5} />
                                    </button>
                                    <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger
                                            type="button"
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-subtle bg-surface-sunken px-0 text-strong shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-card"
                                            aria-label="Más opciones"
                                        >
                                            <MoreHorizontal
                                                className="pointer-events-none h-5 w-5 shrink-0 text-strong"
                                                strokeWidth={2.5}
                                                aria-hidden
                                            />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[200px] rounded-card">
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

                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-control border border-subtle bg-surface-sunken p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted">
                                Adherencia
                            </p>
                            <p className="font-display text-lg font-black text-strong">{adherencePct}%</p>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--track)]">
                                <div
                                    className="h-full rounded-full bg-sport-500 transition-all"
                                    style={{ width: `${adherencePct}%` }}
                                />
                            </div>
                        </div>
                        <div className="rounded-control border border-subtle bg-surface-sunken p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted">
                                Peso hoy
                            </p>
                            <p className="font-display text-lg font-black text-strong">
                                {currentWeight != null ? `${currentWeight} kg` : '—'}
                            </p>
                            <p className="text-[9px] font-bold text-muted">
                                {weightDelta != null ?
                                    `${weightDelta > 0 ? '↑' : weightDelta < 0 ? '↓' : ''}${Math.abs(weightDelta)} (7d)`
                                :   ''}
                            </p>
                        </div>
                        <div className="rounded-control border border-subtle bg-surface-sunken p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted">
                                Energía
                            </p>
                            <div className="mt-1 flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                        key={i}
                                        className={cn(
                                            'h-3.5 w-3.5',
                                            i <= stars ?
                                                'fill-[var(--warning-500)] text-[var(--warning-500)]'
                                            :   'text-[var(--ink-300)]'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="rounded-control border border-subtle bg-surface-sunken p-2">
                            <p className="text-[8px] font-bold uppercase tracking-widest text-muted">
                                Último log
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                                <span
                                    className={cn('h-2 w-2 rounded-full', dotClass(lastLog.days))}
                                />
                                <span className="text-xs font-bold text-strong">{lastLog.label}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted">
                            Peso (30d)
                        </p>
                        {/* recharts aplica color como atributo SVG → no resuelve var(); usamos los
                            valores literales de la paleta DS (sport signature / success). */}
                        <SparkArea data={weightSeries} color="#2680FF" gradId={gradW} />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted">
                            Adherencia (4 sem)
                        </p>
                        <SparkArea data={adherenceSeries} color="#1FB877" gradId={gradA} />
                    </div>

                    {hasNutritionData && (
                        <div className={cn(
                            'flex items-center gap-3 rounded-control border p-3',
                            nutritionRisk
                                ? 'border-[color:var(--danger-500)]/25 bg-[var(--danger-100)]'
                                : 'border-[color:var(--ember-500)]/20 bg-[var(--ember-100)]'
                        )}>
                            <Apple className={cn('h-4 w-4 shrink-0', nutritionRisk ? 'text-[var(--danger-600)]' : 'text-[var(--ember-600)]')} />
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className={cn(
                                        'text-[9px] font-bold uppercase tracking-widest',
                                        nutritionRisk ? 'text-[var(--danger-700)]' : 'text-[var(--ember-700)]'
                                    )}>
                                        {nutritionRisk ? 'Baja adherencia nutricional' : 'Nutrición'}
                                    </p>
                                    <span className={cn(
                                        'text-[10px] font-black tabular-nums',
                                        nutritionRisk ? 'text-[var(--danger-700)]' : 'text-strong'
                                    )}>
                                        {nutritionPct}%
                                    </span>
                                </div>
                                <div className="h-1 overflow-hidden rounded-full bg-[var(--track)]">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            nutritionRisk ? 'bg-[var(--danger-500)]' : 'bg-[var(--ember-500)]'
                                        )}
                                        style={{ width: `${Math.min(100, nutritionPct)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeProgramName ?
                        <div className="space-y-2 rounded-control border border-[color:var(--sport-500)]/15 bg-sport-500/5 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Calendar className="h-4 w-4 shrink-0 text-sport-600" />
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-sport-600">
                                            Programa
                                        </p>
                                        <p className="truncate text-xs font-bold text-strong">
                                            {activeProgramName}
                                        </p>
                                    </div>
                                </div>
                                <span className="shrink-0 text-[10px] font-black text-strong">
                                    Sem {weekCur ?? '—'}/{weekTot ?? '—'}
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                                <div
                                    className="h-full rounded-full bg-sport-500 transition-all"
                                    style={{ width: `${weekPct}%` }}
                                />
                            </div>
                            <p className="text-[10px] font-medium text-muted">
                                {remainingDays != null ?
                                    `${remainingDays > 0 ? remainingDays : 0} días restantes`
                                :   'Sin fechas de programa'}
                                {weekTot ? ` · ${weekTot} semanas totales` : ''}
                            </p>
                        </div>
                    :   <div className="flex items-center gap-2 rounded-control border border-dashed border-default p-3 opacity-70">
                            <Activity className="h-4 w-4 text-muted" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                                Sin programa asignado
                            </span>
                        </div>
                    }

                    {subscriptionDaysRemaining !== null && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted">
                            Suscripción:{' '}
                            <span
                                className={
                                    subscriptionDaysRemaining <= 5 ?
                                        'text-[var(--danger-600)]'
                                    :   'text-sport-600'
                                }
                            >
                                {subscriptionDaysRemaining > 0 ?
                                    `${subscriptionDaysRemaining} días`
                                :   'Vencida'}
                            </span>
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
                        {client.phone && loginUrl ?
                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-control bg-[#25D366] px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[var(--shadow-sm)] transition hover:bg-[#1ebe5d] active:scale-[0.98]"
                            >
                                <Smartphone className="h-3.5 w-3.5" /> WA
                            </a>
                        : null}
                        <Link
                            href={profileHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-strong transition hover:bg-surface-sunken"
                        >
                            <Eye className="h-3.5 w-3.5" /> Perfil
                        </Link>
                        <Link
                            href={builderHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-strong transition hover:bg-surface-sunken"
                        >
                            <Dumbbell className="h-3.5 w-3.5" /> Workout
                        </Link>
                        <Link
                            href={nutritionHref}
                            className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-strong transition hover:bg-surface-sunken"
                        >
                            <Apple className="h-3.5 w-3.5" /> Nutri
                        </Link>
                    </div>
                </div>
            </Card>

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
