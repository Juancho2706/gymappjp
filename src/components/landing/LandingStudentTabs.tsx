'use client'

import type { ComponentType } from 'react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Apple,
    Camera,
    CheckCircle2,
    ChevronRight,
    Dumbbell,
    Flame,
    Home,
    Search,
    Target,
    Zap,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

type StudentTabValue = 'home' | 'nutrition' | 'learn' | 'checkin'

type StudentPanelConfig = {
    value: StudentTabValue
    tabKey: string
    eyebrowKey: string
    titleKey: string
    bodyKey: string
    bullets: string[]
    Mockup: ComponentType
}

/* -------------------------------- Helpers -------------------------------- */

function Ring({
    label,
    value,
    tone = 'primary',
    delay = 0,
}: {
    label: string
    value: number
    tone?: 'primary' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose'
    delay?: number
}) {
    const size = 64
    const stroke = 7
    const radius = (size - stroke) / 2
    const circ = 2 * Math.PI * radius
    const colors: Record<string, string> = {
        primary: 'stroke-primary',
        emerald: 'stroke-emerald-500',
        amber: 'stroke-amber-500',
        sky: 'stroke-sky-500',
        violet: 'stroke-violet-500',
        rose: 'stroke-rose-500',
    }
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                        className="stroke-muted"
                        fill="none"
                    />
                    <motion.circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="none"
                        className={colors[tone]}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        initial={{ strokeDasharray: circ, strokeDashoffset: circ }}
                        whileInView={{ strokeDashoffset: circ * (1 - value / 100) }}
                        viewport={{ once: true, margin: '-30px' }}
                        transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-sm font-black tabular-nums text-foreground">
                        {value}%
                    </span>
                </div>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
        </div>
    )
}

function Bar({
    label,
    value,
    tone,
    delay = 0,
}: {
    label: string
    value: number
    tone: string
    delay?: number
}) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums text-foreground">{value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                    className={cn('h-full rounded-full', tone)}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${value}%` }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
                />
            </div>
        </div>
    )
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto w-full max-w-[300px]">
            <div className="relative rounded-[2rem] border-[8px] border-zinc-900 bg-zinc-900 p-0 shadow-2xl dark:border-zinc-100 dark:bg-zinc-100">
                <div className="absolute left-1/2 top-1 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-zinc-700 dark:bg-zinc-300" />
                <div
                    className="relative overflow-hidden rounded-[1.5rem] bg-background"
                    style={{ aspectRatio: '9/18.5' }}
                >
                    <div className="absolute inset-0 flex flex-col">{children}</div>
                </div>
            </div>
        </div>
    )
}

function PhoneHeader({
    title,
    right,
}: {
    title: string
    right?: React.ReactNode
}) {
    return (
        <div className="shrink-0 border-b border-border/60 bg-background/95 px-3 pb-2 pt-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <p className="font-display text-sm font-black tracking-tight text-foreground">
                    {title}
                </p>
                {right}
            </div>
        </div>
    )
}

const STUDENT_NAV = [
    { value: 'home' as const, icon: Home },
    { value: 'nutrition' as const, icon: Apple },
    { value: 'learn' as const, icon: Dumbbell },
    { value: 'checkin' as const, icon: CheckCircle2 },
]

function PhoneBottomNav({ active }: { active: StudentTabValue }) {
    return (
        <div className="mt-auto shrink-0 border-t border-border/60 bg-background/95 px-1 pb-2 pt-1.5">
            <div className="flex items-stretch justify-around gap-0.5">
                {STUDENT_NAV.map((n) => {
                    const Icon = n.icon
                    const on = n.value === active
                    return (
                        <div
                            key={n.value}
                            className={cn(
                                'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-0.5 transition-colors',
                                on ? 'text-primary' : 'text-zinc-500 dark:text-zinc-400'
                            )}
                        >
                            {on ? (
                                <span
                                    className="absolute -top-1.5 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-primary"
                                    aria-hidden
                                />
                            ) : null}
                            <span
                                className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-full',
                                    on && 'bg-primary/12 dark:bg-primary/20'
                                )}
                            >
                                <Icon
                                    className="h-[18px] w-[18px]"
                                    strokeWidth={on ? 2.4 : 2}
                                />
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/* -------------------------- Mockups por pestaña -------------------------- */

function StudentHomeMockup() {
    const { t } = useTranslation()
    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.home.headerTitle')}
                right={
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-300">
                        <Flame className="h-3 w-3" aria-hidden />
                        12d
                    </span>
                }
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
                >
                    <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary/40 to-violet-500/40 ring-2 ring-primary/20" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">
                            {t('landing.studentTabs.home.greetingLabel')}
                        </p>
                        <p className="truncate text-xs font-bold text-foreground">
                            {t('landing.studentTabs.home.greetingName')}
                        </p>
                    </div>
                </motion.div>

                <div className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-wide text-foreground">
                            {t('landing.studentTabs.home.compliance')}
                        </p>
                        <span className="text-[9px] font-semibold text-muted-foreground">
                            {t('landing.studentTabs.home.thisWeek')}
                        </span>
                    </div>
                    <div className="flex items-center justify-around">
                        <Ring
                            label={t('landing.studentTabs.home.ringTrain')}
                            value={82}
                            tone="primary"
                            delay={0}
                        />
                        <Ring
                            label={t('landing.studentTabs.home.ringNutri')}
                            value={71}
                            tone="emerald"
                            delay={0.15}
                        />
                        <Ring
                            label={t('landing.studentTabs.home.ringCheck')}
                            value={100}
                            tone="violet"
                            delay={0.3}
                        />
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {t('landing.studentTabs.home.series')}
                        </span>
                        <span className="text-[10px] font-bold text-foreground">18 / 24</span>
                    </div>
                    <Bar
                        label={t('landing.studentTabs.home.seriesLabel')}
                        value={75}
                        tone="bg-primary"
                        delay={0.2}
                    />
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
                        const done = [true, true, false, true, true, false, false][i]
                        return (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <span className="text-[8px] font-semibold uppercase text-muted-foreground">
                                    {d}
                                </span>
                                <motion.span
                                    initial={{ scale: 0 }}
                                    whileInView={{ scale: 1 }}
                                    viewport={{ once: true, margin: '-30px' }}
                                    transition={{ delay: 0.5 + i * 0.05, type: 'spring', stiffness: 300, damping: 20 }}
                                    className={cn(
                                        'h-2 w-2 rounded-full',
                                        done ? 'bg-primary' : 'bg-muted'
                                    )}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
            <PhoneBottomNav active="home" />
        </PhoneFrame>
    )
}

function StudentNutritionMockup() {
    const { t } = useTranslation()
    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.nutrition.headerTitle')}
                right={
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        1.850 kcal
                    </span>
                }
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <div className="rounded-xl border border-border bg-card p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">
                        {t('landing.studentTabs.nutrition.macros')}
                    </p>
                    <div className="flex items-center justify-around">
                        <Ring label="P" value={78} tone="sky" delay={0} />
                        <Ring label="C" value={62} tone="amber" delay={0.15} />
                        <Ring label="G" value={54} tone="rose" delay={0.3} />
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {t('landing.studentTabs.nutrition.kcal')}
                        </span>
                        <span className="text-[10px] font-bold text-foreground">1.850 / 2.200</span>
                    </div>
                    <Bar label="kcal" value={84} tone="bg-emerald-500" delay={0.2} />
                </div>

                <div className="space-y-1.5">
                    {[
                        { key: 'meal1', done: true, kcal: 420 },
                        { key: 'meal2', done: true, kcal: 610 },
                        { key: 'meal3', done: false, kcal: 520 },
                    ].map((m, i) => (
                        <motion.div
                            key={m.key}
                            initial={{ opacity: 0, x: -8 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: '-30px' }}
                            transition={{ delay: 0.4 + i * 0.08 }}
                            className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-2.5 py-2"
                        >
                            <div
                                className={cn(
                                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                                    m.done
                                        ? 'border-emerald-500 bg-emerald-500/15'
                                        : 'border-muted-foreground/40'
                                )}
                            >
                                {m.done ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-semibold text-foreground">
                                    {t(`landing.studentTabs.nutrition.${m.key}`)}
                                </p>
                                <p className="text-[9px] text-muted-foreground">{m.kcal} kcal</p>
                            </div>
                            <ChevronRight
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                aria-hidden
                            />
                        </motion.div>
                    ))}
                </div>
            </div>
            <PhoneBottomNav active="nutrition" />
        </PhoneFrame>
    )
}

function StudentLearnMockup() {
    const { t } = useTranslation()
    const chips = ['Pecho', 'Espalda', 'Pierna', 'Brazo', 'Hombro', 'Core']
    const cards = [
        { bg: 'bg-rose-500/25', label: t('landing.studentTabs.learn.ex1') },
        { bg: 'bg-sky-500/25', label: t('landing.studentTabs.learn.ex2') },
        { bg: 'bg-violet-500/25', label: t('landing.studentTabs.learn.ex3') },
        { bg: 'bg-amber-500/25', label: t('landing.studentTabs.learn.ex4') },
    ]
    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.learn.headerTitle')}
                right={<Search className="h-4 w-4 text-muted-foreground" aria-hidden />}
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {chips.map((c, i) => (
                        <motion.span
                            key={c}
                            initial={{ opacity: 0, y: 6 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-30px' }}
                            transition={{ delay: 0.1 + i * 0.05 }}
                            className={cn(
                                'shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold',
                                i === 0
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border bg-card text-muted-foreground'
                            )}
                        >
                            {c}
                        </motion.span>
                    ))}
                </div>

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-30px' }}
                    variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } },
                    }}
                    className="grid grid-cols-2 gap-2"
                >
                    {cards.map((c, i) => (
                        <motion.div
                            key={i}
                            variants={{
                                hidden: { opacity: 0, y: 10 },
                                visible: { opacity: 1, y: 0 },
                            }}
                            className="overflow-hidden rounded-xl border border-border bg-card"
                        >
                            <div
                                className={cn(
                                    'flex aspect-square items-end justify-center p-2',
                                    c.bg
                                )}
                            >
                                <Dumbbell className="h-6 w-6 text-foreground/60" aria-hidden />
                            </div>
                            <div className="px-2 py-1.5">
                                <p className="truncate text-[10px] font-bold text-foreground">
                                    {c.label}
                                </p>
                                <p className="truncate text-[9px] text-muted-foreground">
                                    {t('landing.studentTabs.learn.tip')}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
            <PhoneBottomNav active="learn" />
        </PhoneFrame>
    )
}

function StudentCheckInMockup() {
    const { t } = useTranslation()
    const [step, setStep] = useState(0)
    const steps = [
        { key: 'step1', icon: Target },
        { key: 'step2', icon: Zap },
        { key: 'step3', icon: Camera },
    ]

    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.checkin.headerTitle')}
                right={
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {step + 1} / 3
                    </span>
                }
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <div className="flex items-center gap-2">
                    {steps.map((s, i) => (
                        <div key={s.key} className="flex flex-1 items-center gap-2">
                            <motion.div
                                animate={{
                                    scale: step === i ? 1.05 : 1,
                                    backgroundColor:
                                        step >= i ? 'rgb(var(--primary-rgb, 0 122 255))' : 'transparent',
                                }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                className={cn(
                                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                                    step >= i
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-muted-foreground/40 text-muted-foreground'
                                )}
                            >
                                {i + 1}
                            </motion.div>
                            {i < steps.length - 1 ? (
                                <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-muted">
                                    <motion.div
                                        className="h-full bg-primary"
                                        initial={{ width: 0 }}
                                        animate={{ width: step > i ? '100%' : '0%' }}
                                        transition={{ duration: 0.4 }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div className="rounded-xl border border-border bg-card p-3">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-2"
                        >
                            <div className="mb-2 flex items-center gap-2">
                                {(() => {
                                    const Icon = steps[step]!.icon
                                    return <Icon className="h-4 w-4 text-primary" aria-hidden />
                                })()}
                                <p className="text-[11px] font-black uppercase text-foreground">
                                    {t(`landing.studentTabs.checkin.${steps[step]!.key}Title`)}
                                </p>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground">
                                {t(`landing.studentTabs.checkin.${steps[step]!.key}Body`)}
                            </p>
                            {step === 0 ? (
                                <div className="rounded-lg border border-border bg-background px-2.5 py-2">
                                    <p className="text-[9px] font-semibold text-muted-foreground">
                                        {t('landing.studentTabs.checkin.weightLabel')}
                                    </p>
                                    <p className="font-display text-lg font-black tabular-nums text-foreground">
                                        78.4 <span className="text-[10px] font-bold text-muted-foreground">kg</span>
                                    </p>
                                </div>
                            ) : null}
                            {step === 1 ? (
                                <div className="space-y-2">
                                    <Bar label="Energía" value={72} tone="bg-primary" />
                                    <Bar label="Sueño" value={84} tone="bg-violet-500" />
                                </div>
                            ) : null}
                            {step === 2 ? (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-border bg-muted/40"
                                        >
                                            <Camera
                                                className="h-4 w-4 text-muted-foreground"
                                                aria-hidden
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                        disabled={step === 0}
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                        {t('landing.studentTabs.checkin.prev')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep((s) => Math.min(2, s + 1))}
                        disabled={step === 2}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                        {t('landing.studentTabs.checkin.next')}
                    </button>
                </div>
            </div>
            <PhoneBottomNav active="checkin" />
        </PhoneFrame>
    )
}

/* ------------------------------- Component ------------------------------- */

const STUDENT_PANELS: StudentPanelConfig[] = [
    {
        value: 'home',
        tabKey: 'landing.studentTabs.tab.home',
        eyebrowKey: 'landing.studentTabs.home.eyebrow',
        titleKey: 'landing.studentTabs.home.title',
        bodyKey: 'landing.studentTabs.home.body',
        bullets: [
            'landing.studentTabs.home.b1',
            'landing.studentTabs.home.b2',
            'landing.studentTabs.home.b3',
        ],
        Mockup: StudentHomeMockup,
    },
    {
        value: 'nutrition',
        tabKey: 'landing.studentTabs.tab.nutrition',
        eyebrowKey: 'landing.studentTabs.nutrition.eyebrow',
        titleKey: 'landing.studentTabs.nutrition.title',
        bodyKey: 'landing.studentTabs.nutrition.body',
        bullets: [
            'landing.studentTabs.nutrition.b1',
            'landing.studentTabs.nutrition.b2',
            'landing.studentTabs.nutrition.b3',
        ],
        Mockup: StudentNutritionMockup,
    },
    {
        value: 'learn',
        tabKey: 'landing.studentTabs.tab.learn',
        eyebrowKey: 'landing.studentTabs.learn.eyebrow',
        titleKey: 'landing.studentTabs.learn.title',
        bodyKey: 'landing.studentTabs.learn.body',
        bullets: [
            'landing.studentTabs.learn.b1',
            'landing.studentTabs.learn.b2',
            'landing.studentTabs.learn.b3',
        ],
        Mockup: StudentLearnMockup,
    },
    {
        value: 'checkin',
        tabKey: 'landing.studentTabs.tab.checkin',
        eyebrowKey: 'landing.studentTabs.checkin.eyebrow',
        titleKey: 'landing.studentTabs.checkin.title',
        bodyKey: 'landing.studentTabs.checkin.body',
        bullets: [
            'landing.studentTabs.checkin.b1',
            'landing.studentTabs.checkin.b2',
            'landing.studentTabs.checkin.b3',
        ],
        Mockup: StudentCheckInMockup,
    },
]

function StudentPanelBody({ panel }: { panel: StudentPanelConfig }) {
    const { t } = useTranslation()
    const MockupCmp = panel.Mockup
    return (
        <motion.div
            key={panel.value}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12"
        >
            <div className="order-2 max-w-xl lg:order-1">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {t(panel.eyebrowKey)}
                </span>
                <h3 className="font-display text-xl font-black leading-tight tracking-tight text-foreground sm:text-2xl md:text-3xl">
                    {t(panel.titleKey)}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {t(panel.bodyKey)}
                </p>
                <ul className="mt-5 space-y-2.5">
                    {panel.bullets.map((b) => (
                        <li
                            key={b}
                            className="flex items-start gap-2.5 text-sm text-foreground/90"
                        >
                            <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                                <CheckCircle2 className="h-3 w-3" aria-hidden />
                            </span>
                            <span>{t(b)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="order-1 lg:order-2">
                <MockupCmp />
            </div>
        </motion.div>
    )
}

export function LandingStudentTabs() {
    const { t } = useTranslation()
    const [tab, setTab] = useState<StudentTabValue>('home')

    return (
        <section
            id="panel-alumno"
            className="w-full scroll-mt-28 border-t border-border/50 py-14 sm:py-16 lg:py-20"
        >
            <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">
                <motion.header
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    className="mx-auto max-w-2xl text-center"
                >
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.studentTabs.eyebrow')}
                    </span>
                    <h2 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl md:text-4xl">
                        {t('landing.studentTabs.title')}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {t('landing.studentTabs.subtitle')}
                    </p>
                </motion.header>

                <div
                    role="region"
                    aria-label={t('landing.studentTabs.regionAria')}
                >
                    <Tabs
                        value={tab}
                        onValueChange={(v) => setTab(v as StudentTabValue)}
                        className="mt-8 flex w-full flex-col gap-0 lg:gap-1"
                    >
                        <div className="w-full min-w-0 lg:flex lg:justify-center">
                            <TabsList
                                variant="line"
                                className={cn(
                                    '!h-auto min-h-11 w-full min-w-0 flex-nowrap justify-start gap-0 border-b border-border bg-transparent p-0',
                                    'overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch] snap-x snap-mandatory',
                                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                                    'lg:inline-flex lg:w-auto lg:max-w-[min(100%,48rem)] lg:flex-wrap lg:justify-center lg:gap-x-1 lg:overflow-x-visible'
                                )}
                            >
                                {STUDENT_PANELS.map((p) => {
                                    const isActive = tab === p.value
                                    return (
                                        <TabsTrigger
                                            key={p.value}
                                            value={p.value}
                                            className={cn(
                                                'relative min-h-11 shrink-0 !flex-none snap-start rounded-none px-3 py-2.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm',
                                                'after:!hidden',
                                                isActive
                                                    ? '!text-foreground !font-bold'
                                                    : '!text-muted-foreground hover:!text-foreground'
                                            )}
                                        >
                                            <span className="relative z-10">{t(p.tabKey)}</span>
                                            {isActive ? (
                                                <motion.span
                                                    layoutId="student-tabs-underline"
                                                    className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-primary"
                                                    transition={{
                                                        type: 'spring',
                                                        stiffness: 420,
                                                        damping: 36,
                                                    }}
                                                    aria-hidden
                                                />
                                            ) : null}
                                        </TabsTrigger>
                                    )
                                })}
                            </TabsList>
                        </div>

                        <div className="min-w-0 pt-8">
                            <AnimatePresence mode="wait" initial={false}>
                                {STUDENT_PANELS.map((panel) =>
                                    panel.value === tab ? (
                                        <TabsContent
                                            key={panel.value}
                                            value={panel.value}
                                            className="mt-0 outline-none"
                                        >
                                            <StudentPanelBody panel={panel} />
                                        </TabsContent>
                                    ) : null
                                )}
                            </AnimatePresence>
                        </div>
                    </Tabs>
                </div>
            </div>
        </section>
    )
}
