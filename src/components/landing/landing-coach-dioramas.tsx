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

export function DioramaDashboard() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="dashboard">
            <div className="space-y-2">
                <div>
                    <p className="font-display text-[10px] font-black uppercase tracking-tight text-foreground sm:text-xs">
                        {t('landing.diorama.dashboard.title')}
                    </p>
                    <p className="text-[9px] text-muted-foreground sm:text-[10px]">{t('landing.diorama.dashboard.sub')}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {[
                        { label: t('landing.diorama.dashboard.mrr'), val: '$890k', icon: TrendingUp },
                        { label: t('landing.diorama.dashboard.clients'), val: '24', icon: Users },
                        { label: t('landing.diorama.dashboard.plans'), val: '18', icon: Layers },
                    ].map((s) => (
                        <GlassCard key={s.label} className="!shadow-md p-2 !backdrop-blur-md">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                            <p className="font-display text-sm font-black text-primary">{s.val}</p>
                        </GlassCard>
                    ))}
                </div>
                <GlassCard className="p-2 !shadow-md">
                    <div className="mb-1 flex items-center gap-1">
                        <TriangleAlert className="h-3 w-3 text-rose-500" />
                        <span className="text-[8px] font-bold uppercase tracking-widest text-foreground">
                            {t('landing.diorama.dashboard.alerts')}
                        </span>
                    </div>
                    <div className="h-8 rounded-md bg-muted/50" />
                </GlassCard>
            </div>
        </MiniCoachShell>
    )
}

export function DioramaClients() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="clients">
            <p className="mb-2 font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                {t('landing.diorama.clients.title')}
            </p>
            <div className="space-y-1.5">
                {[
                    { name: 'María G.', pulse: 82, program: 'Fuerza A' },
                    { name: 'Lucas P.', pulse: 45, program: 'Hipertrofia' },
                    { name: 'Ana R.', pulse: 91, program: 'Definición' },
                ].map((row) => (
                    <div
                        key={row.name}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-2 py-1.5"
                    >
                        <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[10px] font-bold text-foreground">{row.name}</p>
                            <p className="truncate text-[8px] text-muted-foreground">{row.program}</p>
                        </div>
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[8px] font-bold text-primary">
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
    return (
        <MiniCoachShell active="programs">
            <p className="mb-2 font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                {t('landing.diorama.programs.title')}
            </p>
            <div className="space-y-1.5">
                {[
                    t('landing.diorama.programs.p1'),
                    t('landing.diorama.programs.p2'),
                    t('landing.diorama.programs.p3'),
                ].map((name) => (
                    <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-2 py-2"
                    >
                        <span className="text-[10px] font-semibold text-foreground">{name}</span>
                        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                ))}
            </div>
        </MiniCoachShell>
    )
}

export function DioramaExercises() {
    const { t } = useTranslation()
    return (
        <MiniCoachShell active="exercises">
            <p className="mb-2 font-display text-[10px] font-black uppercase tracking-tight text-foreground">
                {t('landing.diorama.exercises.title')}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-lg border border-border bg-card/80 p-1.5">
                        <div className="mb-1 aspect-square rounded-md bg-muted animate-pulse" />
                        <div className="h-1.5 w-3/4 rounded bg-muted" />
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
                <div className="flex items-center justify-center gap-3">
                    <div className="relative h-14 w-14 rounded-full border-4 border-primary/30 border-t-primary">
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">72%</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                        <div className="h-2 rounded-full bg-primary/30" />
                        <div className="h-2 rounded-full bg-sky-500/30" />
                        <div className="h-2 rounded-full bg-amber-500/30" />
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
                    <div className="h-10 w-10 shrink-0 rounded-lg border border-dashed border-border bg-muted/40" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="h-2 w-full rounded bg-muted" />
                        <div className="h-2 w-2/3 rounded bg-muted" />
                    </div>
                </div>
                <div className="h-6 w-full rounded-md bg-primary/20" />
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
            className="mx-auto w-[min(100%,200px)] min-h-[320px] overflow-hidden rounded-[1.75rem] border-4 border-zinc-800 bg-zinc-950 shadow-2xl dark:border-zinc-700"
            style={{ aspectRatio: '9/18' }}
        >
            <div className="mx-auto mt-2 h-4 w-16 rounded-full bg-zinc-800" />
            <div className="flex h-[calc(100%-2rem)] flex-col bg-background p-2 pt-3">
                <p className="text-center text-[9px] font-bold text-foreground">{t('landing.diorama.phone.greeting')}</p>
                <div className="mt-2 flex-1 rounded-xl border border-border bg-card/90 p-2">
                    <div className="mb-2 h-16 rounded-lg bg-primary/10" />
                    <div className="space-y-1">
                        <div className="h-2 w-full rounded bg-muted" />
                        <div className="h-2 w-4/5 rounded bg-muted" />
                    </div>
                </div>
                <div className="mt-auto flex justify-around border-t border-border pt-2">
                    {nav.map((n, i) => {
                        const Icon = n.icon
                        return (
                            <div
                                key={i}
                                className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-lg',
                                    n.on ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
