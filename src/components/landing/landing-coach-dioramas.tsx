'use client'

import {
    LayoutDashboard,
    Users,
    ClipboardList,
    Dumbbell,
    Apple,
    Settings,
    TrendingUp,
    Layers,
    TriangleAlert,
    Home,
    CheckCircle,
    Flame,
    Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassCard } from '@/components/ui/glass-card'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const NAV = [
    { href: 'dashboard', icon: LayoutDashboard },
    { href: 'clients', icon: Users },
    { href: 'programs', icon: ClipboardList },
    { href: 'exercises', icon: Dumbbell },
    { href: 'nutrition', icon: Apple },
    { href: 'brand', icon: Settings },
] as const

function MiniCoachShell({
    active,
    children,
    className,
}: {
    active: (typeof NAV)[number]['href']
    children: React.ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                'flex overflow-hidden rounded-2xl border border-border bg-white/90 shadow-2xl dark:bg-zinc-950',
                className
            )}
            style={{ '--theme-primary': '#007AFF' } as React.CSSProperties}
        >
            <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/50 py-2 dark:bg-zinc-900/80">
                {NAV.map((item) => {
                    const Icon = item.icon
                    const isOn = active === item.href
                    return (
                        <div
                            key={item.href}
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-lg border border-transparent',
                                isOn
                                    ? 'border-primary/25 bg-primary/15 text-primary'
                                    : 'text-muted-foreground'
                            )}
                            aria-hidden
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </div>
                    )
                })}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden p-2 sm:p-3">{children}</div>
        </div>
    )
}

const SPARK = [40, 65, 45, 80, 55, 90, 70]

export function DioramaDashboard() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="dashboard">
            <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-display text-[10px] font-black uppercase tracking-tight text-foreground sm:text-xs">
                            {t('landing.diorama.dashboard.title')}
                        </p>
                        <p className="text-[9px] text-muted-foreground sm:text-[10px]">{t('landing.diorama.dashboard.sub')}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[7px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                        Live
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {[
                        { label: t('landing.diorama.dashboard.mrr'), val: '$890k', icon: TrendingUp },
                        { label: t('landing.diorama.dashboard.clients'), val: '24', icon: Users },
                        { label: t('landing.diorama.dashboard.plans'), val: '18', icon: Layers },
                    ].map((s) => {
                        const Icon = s.icon
                        return (
                            <GlassCard key={s.label} className="!shadow-md p-2 !backdrop-blur-md">
                                <Icon className="mb-0.5 h-3 w-3 text-primary/80" aria-hidden />
                                <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                                <p className="font-display text-sm font-black text-primary">{s.val}</p>
                            </GlassCard>
                        )
                    })}
                </div>
                <GlassCard className="p-2 !shadow-md">
                    <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                            {t('landing.diorama.dashboard.spark')}
                        </span>
                        <span className="text-[8px] font-semibold text-primary">+12%</span>
                    </div>
                    <div className="flex h-7 items-end gap-0.5 rounded-md bg-muted/30 px-1 pb-0.5 pt-1">
                        {SPARK.map((h, i) => (
                            <div
                                key={i}
                                className="flex-1 rounded-sm bg-gradient-to-t from-primary/50 to-sky-400/80"
                                style={{ height: `${h}%` }}
                            />
                        ))}
                    </div>
                </GlassCard>
                <div className="grid grid-cols-2 gap-1.5">
                    <GlassCard className="p-2 !shadow-md">
                        <p className="text-[8px] font-bold uppercase text-muted-foreground">{t('landing.diorama.dashboard.adherenceMini')}</p>
                        <p className="mt-0.5 font-display text-lg font-black text-emerald-600 dark:text-emerald-400">87%</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-[87%] rounded-full bg-emerald-500" />
                        </div>
                    </GlassCard>
                    <GlassCard className="p-2 !shadow-md">
                        <div className="mb-1 flex items-center gap-1">
                            <TriangleAlert className="h-3 w-3 shrink-0 text-rose-500" />
                            <span className="text-[8px] font-bold uppercase tracking-widest text-foreground">
                                {t('landing.diorama.dashboard.alerts')}
                            </span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-1 rounded-md bg-rose-500/10 px-1 py-0.5">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                <div className="h-1.5 flex-1 rounded bg-rose-500/25" />
                            </div>
                            <div className="flex items-center gap-1 rounded-md bg-amber-500/10 px-1 py-0.5">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                <div className="h-1.5 flex-1 rounded bg-amber-500/20" />
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </MiniCoachShell>
    )
}

export function DioramaClients() {
    const { t } = useTranslation()
    const rows = [
        { name: 'María G.', pulse: 82, program: 'Fuerza A', tag: 'active' as const },
        { name: 'Lucas P.', pulse: 45, program: 'Hipertrofia', tag: 'watch' as const },
        { name: 'Ana R.', pulse: 91, program: 'Definición', tag: 'active' as const },
    ]
    return (
        <MiniCoachShell active="clients">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                    {t('landing.diorama.clients.title')}
                </p>
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1.5">
                {rows.map((row) => (
                    <div
                        key={row.name}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5"
                    >
                        <div className="relative h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-violet-500/30 ring-2 ring-primary/20" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                                <p className="truncate text-[10px] font-bold text-foreground">{row.name}</p>
                                <span
                                    className={cn(
                                        'shrink-0 rounded px-1 py-px text-[6px] font-bold uppercase',
                                        row.tag === 'active'
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                    )}
                                >
                                    {row.tag === 'active' ? t('landing.diorama.clients.tagActive') : t('landing.diorama.clients.tagWatch')}
                                </span>
                            </div>
                            <p className="truncate text-[8px] text-muted-foreground">{row.program}</p>
                        </div>
                        <span
                            className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold',
                                row.pulse >= 70
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                            )}
                        >
                            {row.pulse}
                        </span>
                    </div>
                ))}
            </div>
        </MiniCoachShell>
    )
}

export function DioramaPrograms() {
    const { t } = useTranslation()
    const programs = [
        { name: t('landing.diorama.programs.p1'), color: 'from-sky-500/40 to-primary/30' },
        { name: t('landing.diorama.programs.p2'), color: 'from-violet-500/40 to-rose-400/30' },
        { name: t('landing.diorama.programs.p3'), color: 'from-emerald-500/35 to-sky-400/25' },
    ]
    return (
        <MiniCoachShell active="programs">
            <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                    {t('landing.diorama.programs.title')}
                </p>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[7px] font-bold uppercase text-muted-foreground">
                    {t('landing.diorama.programs.weekChip')}
                </span>
            </div>
            <div className="space-y-1.5">
                {programs.map((row) => (
                    <div
                        key={row.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/80 px-2 py-2"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <div className={cn('h-8 w-1 shrink-0 rounded-full bg-gradient-to-b', row.color)} />
                            <span className="min-w-0 truncate text-[10px] font-semibold text-foreground">{row.name}</span>
                        </div>
                        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" />
                    </div>
                ))}
            </div>
        </MiniCoachShell>
    )
}

export function DioramaExercises() {
    const { t } = useTranslation()
    const exThumb = [
        { bg: 'bg-rose-500/25', border: 'border-rose-500/30', labelKey: 'landing.diorama.exercises.m1' as const },
        { bg: 'bg-sky-500/25', border: 'border-sky-500/35', labelKey: 'landing.diorama.exercises.m2' as const },
        { bg: 'bg-violet-500/25', border: 'border-violet-500/35', labelKey: 'landing.diorama.exercises.m3' as const },
        { bg: 'bg-amber-500/25', border: 'border-amber-500/35', labelKey: 'landing.diorama.exercises.m4' as const },
    ]
    return (
        <MiniCoachShell active="exercises">
            <div className="mb-2 flex flex-wrap items-center gap-1">
                <p className="font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                    {t('landing.diorama.exercises.title')}
                </p>
                <span className="rounded bg-primary/15 px-1 py-px text-[7px] font-bold text-primary">GIF</span>
                <span className="rounded bg-muted px-1 py-px text-[7px] font-semibold text-muted-foreground">1240+</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                {exThumb.map((ex) => (
                    <div key={ex.labelKey} className={cn('rounded-lg border bg-card/80 p-1.5', ex.border)}>
                        <div className={cn('mb-1 flex aspect-square items-end justify-center rounded-md', ex.bg)}>
                            <Dumbbell className="mb-1 h-6 w-6 text-foreground/50" aria-hidden />
                        </div>
                        <div className="h-1.5 w-2/3 rounded bg-muted-foreground/20" />
                        <p className="mt-0.5 text-[7px] font-semibold text-primary">{t(ex.labelKey)}</p>
                    </div>
                ))}
            </div>
        </MiniCoachShell>
    )
}

export function DioramaNutrition() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="nutrition">
            <p className="mb-2 font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                {t('landing.diorama.nutrition.title')}
            </p>
            <GlassCard className="p-3 !shadow-md">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-foreground">{t('landing.diorama.nutrition.day')}</span>
                    <span className="text-[8px] text-primary">{t('landing.diorama.nutrition.ring')}</span>
                </div>
                <div className="mb-2 flex items-center justify-center gap-3">
                    <div className="relative h-14 w-14 rounded-full border-4 border-primary/30 border-t-primary">
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">72%</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center gap-1 text-[7px] font-bold uppercase text-primary">
                            <span className="w-10 shrink-0 truncate">{t('landing.diorama.nutrition.macroP')}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary/20">
                                <div className="h-full w-[70%] rounded-full bg-primary" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-[7px] font-bold uppercase text-sky-600 dark:text-sky-400">
                            <span className="w-10 shrink-0 truncate">{t('landing.diorama.nutrition.macroC')}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-sky-500/20">
                                <div className="h-full w-[55%] rounded-full bg-sky-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-[7px] font-bold uppercase text-amber-700 dark:text-amber-400">
                            <span className="w-10 shrink-0 truncate">{t('landing.diorama.nutrition.macroF')}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-amber-500/20">
                                <div className="h-full w-[40%] rounded-full bg-amber-500" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-1 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between rounded-md bg-emerald-500/10 px-2 py-1">
                        <span className="text-[8px] font-semibold text-foreground">{t('landing.diorama.nutrition.meal1')}</span>
                        <span className="text-[8px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">420 {t('landing.diorama.nutrition.kcal')}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-sky-500/10 px-2 py-1">
                        <span className="text-[8px] font-semibold text-foreground">{t('landing.diorama.nutrition.meal2')}</span>
                        <span className="text-[8px] font-bold tabular-nums text-sky-700 dark:text-sky-300">610 {t('landing.diorama.nutrition.kcal')}</span>
                    </div>
                </div>
            </GlassCard>
        </MiniCoachShell>
    )
}

export function DioramaBrand() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="brand">
            <p className="mb-2 font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                {t('landing.diorama.brand.title')}
            </p>
            <div className="space-y-2 rounded-lg border border-border bg-card/80 p-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/20 to-violet-500/20 text-[8px] font-black text-primary">
                        LOGO
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="h-2 w-full rounded bg-muted" />
                        <div className="h-2 w-2/3 rounded bg-muted" />
                    </div>
                </div>
                <div>
                    <p className="mb-1 text-[7px] font-bold uppercase text-muted-foreground">{t('landing.diorama.brand.primary')}</p>
                    <div className="flex gap-1">
                        {['#007AFF', '#34C759', '#FF9500', '#AF52DE'].map((c) => (
                            <div key={c} className="h-5 w-7 rounded-md border border-border shadow-sm" style={{ backgroundColor: c }} />
                        ))}
                    </div>
                </div>
                <div className="h-6 w-full rounded-md bg-primary/25 ring-1 ring-primary/30" />
                <p className="text-[8px] text-muted-foreground">{t('landing.diorama.brand.urlHint')}</p>
            </div>
        </MiniCoachShell>
    )
}

/** Vista alumno móvil (ClientNav) */
export function DioramaClientPhone() {
    const { t } = useTranslation()
    const nav = [
        { icon: Home, on: true },
        { icon: Apple, on: false },
        { icon: Dumbbell, on: false },
        { icon: CheckCircle, on: false },
    ]
    return (
        <div
            className="mx-auto w-[min(100%,200px)] min-h-[320px] overflow-hidden rounded-[1.75rem] border-4 border-zinc-300 bg-zinc-100 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
            style={{ aspectRatio: '9/18' }}
        >
            <div className="mx-auto mt-2 h-4 w-16 rounded-full bg-zinc-400/80 dark:bg-zinc-800" />
            <div className="flex h-[calc(100%-2rem)] flex-col bg-gradient-to-b from-zinc-50 via-zinc-100/90 to-zinc-200/30 p-2 pt-3 dark:from-zinc-900 dark:via-zinc-950/95 dark:to-zinc-950">
                <div className="mb-2 flex items-center justify-between gap-1 px-0.5">
                    <div className="flex items-center gap-1.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/40 to-violet-500/40 ring-2 ring-primary/25" />
                        <div>
                            <p className="text-left text-[9px] font-bold leading-tight text-foreground">{t('landing.diorama.phone.greeting')}</p>
                        </div>
                    </div>
                    <span className="flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[7px] font-bold text-orange-700 dark:text-orange-300">
                        <Flame className="h-2.5 w-2.5" aria-hidden />
                        {t('landing.diorama.phone.streak')}
                    </span>
                </div>
                <div className="mt-1 flex-1 rounded-xl border border-border bg-card/95 p-2 shadow-inner">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[8px] font-black uppercase tracking-wide text-primary">{t('landing.diorama.phone.routineTitle')}</span>
                        <span className="rounded bg-violet-500/15 px-1 py-px text-[7px] font-bold text-violet-700 dark:text-violet-300">
                            {t('landing.diorama.phone.focusTag')}
                        </span>
                    </div>
                    <div className="mb-2 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/15 via-sky-500/10 to-transparent p-2">
                        <p className="text-[9px] font-bold text-foreground">{t('landing.diorama.phone.exercise')}</p>
                        <p className="mt-0.5 text-[8px] text-muted-foreground">{t('landing.diorama.phone.sets')}</p>
                        <div className="mt-2 flex gap-1">
                            <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[7px] font-bold text-primary">RPE 8</span>
                            <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[7px] font-bold text-emerald-700 dark:text-emerald-400">
                                {t('landing.diorama.phone.doneBadge')}
                            </span>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5">
                            <div className="h-8 w-8 shrink-0 rounded-md bg-sky-500/20" />
                            <div className="min-w-0 flex-1">
                                <div className="h-1.5 w-3/4 rounded bg-muted-foreground/25" />
                                <div className="mt-1 h-1 w-1/2 rounded bg-muted-foreground/15" />
                            </div>
                            <span className="text-[8px] font-bold text-primary">3×10</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/20 px-2 py-1.5 opacity-80">
                            <div className="h-8 w-8 shrink-0 rounded-md bg-rose-500/20" />
                            <div className="min-w-0 flex-1">
                                <div className="h-1.5 w-2/3 rounded bg-muted-foreground/20" />
                            </div>
                            <span className="text-[8px] font-semibold text-muted-foreground">—</span>
                        </div>
                    </div>
                </div>
                <div className="mt-auto flex justify-around gap-0.5 border-t border-zinc-200/90 bg-white/95 px-0.5 pt-2 pb-1 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_-6px_20px_rgba(0,0,0,0.45)]">
                    {nav.map((n, i) => {
                        const Icon = n.icon
                        return (
                            <div
                                key={i}
                                className={cn(
                                    'flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                                    n.on
                                        ? 'border-primary/35 bg-primary/12 text-primary shadow-sm dark:border-primary/40 dark:bg-primary/20'
                                        : 'border-transparent text-zinc-600 dark:text-zinc-400'
                                )}
                            >
                                <Icon className="h-4 w-4" strokeWidth={2.25} />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
