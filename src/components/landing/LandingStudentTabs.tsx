'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
    Apple,
    Camera,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Dumbbell,
    Info,
    Search,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StudentHomeMockup } from '@/components/landing/LandingStudentHomeMockup'
import {
    PhoneBottomNav,
    PhoneFrame,
    PhoneHeader,
    RingValue,
    type StudentTabValue,
    useLoopPhase,
} from '@/components/landing/landing-student-mockup-shared'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

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

const MACRO_P = '#f97316'
const MACRO_C = '#3b82f6'
const MACRO_G = '#eab308'

/* -------------------------- Mockups por pestaña -------------------------- */

function StudentNutritionMockup() {
    const { t } = useTranslation()
    const reduce = useReducedMotion()
    const phase = useLoopPhase(12000, 80)
    const pCons = 120 + Math.round(30 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI)))
    const cCons = 180 + Math.round(40 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI + 0.8)))
    const fCons = 45 + Math.round(18 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI + 1.6)))
    const pT = 160
    const cT = 220
    const fT = 60
    const kcalGoal = 2200
    const kcal = Math.min(
        kcalGoal,
        Math.round(1500 + 320 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI * 0.3)))
    )
    const kcalPct = kcalGoal > 0 ? Math.min(100, (kcal / kcalGoal) * 100) : 0
    const [mealStep, setMealStep] = useState(0)
    useEffect(() => {
        if (reduce) return
        const id = window.setInterval(() => setMealStep((p) => (p + 1) % 4), 1200)
        return () => clearInterval(id)
    }, [reduce])
    const n = reduce ? 3 : mealStep
    const mealDone = [n >= 1, n >= 2, n >= 3] as const
    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.nutrition.headerTitle')}
                right={
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        {kcal.toLocaleString('es-CL')} kcal
                    </span>
                }
            />
            <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3">
                <div className="flex items-center justify-between px-0.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground">
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="flex min-w-0 flex-col items-center">
                        <span className="text-sm font-black capitalize leading-tight text-foreground">
                            Hoy
                        </span>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/25">
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                    <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                    Energía diaria
                                </p>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black tabular-nums leading-none tracking-tight text-foreground">
                                        {kcal}
                                    </span>
                                    <span className="text-xs font-bold text-muted-foreground/50">
                                        / {kcalGoal} kcal
                                    </span>
                                </div>
                            </div>
                            <span className="text-xl font-black tabular-nums text-emerald-500">
                                {Math.round(kcalPct)}%
                            </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <motion.div
                                className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                initial={false}
                                animate={{ width: `${kcalPct}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                            />
                        </div>
                    </div>

                    <p className="text-[9px] font-bold uppercase text-muted-foreground">
                        {t('landing.studentTabs.nutrition.macros')}
                    </p>
                    <div className="grid grid-cols-3 gap-1 pt-0.5">
                        <RingValue
                            label="Proteína"
                            value={pT > 0 ? (pCons / pT) * 100 : 0}
                            displayValue={String(pCons)}
                            strokeHex={MACRO_P}
                            subLabel={`/ ${pT}g`}
                        />
                        <RingValue
                            label="Carbos"
                            value={cT > 0 ? (cCons / cT) * 100 : 0}
                            displayValue={String(cCons)}
                            strokeHex={MACRO_C}
                            subLabel={`/ ${cT}g`}
                        />
                        <RingValue
                            label="Grasas"
                            value={fT > 0 ? (fCons / fT) * 100 : 0}
                            displayValue={String(fCons)}
                            strokeHex={MACRO_G}
                            subLabel={`/ ${fT}g`}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    {(
                        [
                            { key: 'meal1' as const, kcal: 420 },
                            { key: 'meal2' as const, kcal: 610 },
                            { key: 'meal3' as const, kcal: 520 },
                        ] as const
                    ).map((m, i) => (
                        <motion.div
                            key={m.key}
                            layout
                            className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-2.5 py-2"
                        >
                            <div
                                className={cn(
                                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                    mealDone[i]
                                        ? 'border-emerald-500 bg-emerald-500/15'
                                        : 'border-muted-foreground/40'
                                )}
                            >
                                {mealDone[i] ? (
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                ) : null}
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
    const reduce = useReducedMotion()
    const chips = ['Pecho', 'Espalda', 'Pierna', 'Brazo', 'Hombro', 'Core'] as const
    const [chipIdx, setChipIdx] = useState(0)
    useEffect(() => {
        if (reduce) return
        const n = 6
        const id = window.setInterval(() => setChipIdx((i) => (i + 1) % n), 2600)
        return () => clearInterval(id)
    }, [reduce])
    const active = reduce ? 0 : chipIdx
    const cards = [
        { key: 'a', bg: 'from-rose-500/20 to-rose-600/5', label: t('landing.studentTabs.learn.ex1') },
        { key: 'b', bg: 'from-sky-500/20 to-sky-600/5', label: t('landing.studentTabs.learn.ex2') },
        { key: 'c', bg: 'from-violet-500/20 to-violet-600/5', label: t('landing.studentTabs.learn.ex3') },
        { key: 'd', bg: 'from-amber-500/20 to-amber-600/5', label: t('landing.studentTabs.learn.ex4') },
    ] as const
    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.learn.headerTitle')}
                right={<Search className="h-4 w-4 text-muted-foreground" aria-hidden />}
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {chips.map((c, i) => {
                        const on = i === active
                        return (
                            <span
                                key={c}
                                className={cn(
                                    'shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold transition-colors',
                                    on
                                        ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                                        : 'border-border bg-card text-muted-foreground'
                                )}
                            >
                                {c}
                            </span>
                        )
                    })}
                </div>

                <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0.85 }}
                    animate={{ opacity: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.2 }}
                    className="space-y-2"
                >
                    {cards.map((c, i) => (
                        <motion.div
                            key={`${c.key}-${active}`}
                            initial={reduce ? false : { opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={
                                reduce
                                    ? { duration: 0 }
                                    : { delay: 0.06 * i, duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                            }
                            className="flex cursor-default items-stretch gap-2.5 rounded-2xl border border-border bg-card p-2 pr-2.5 shadow-sm"
                        >
                            <div
                                className={cn(
                                    'relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br',
                                    c.bg
                                )}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Dumbbell className="h-5 w-5 text-foreground/50" aria-hidden />
                                </div>
                            </div>
                            <div className="min-w-0 flex-1 py-0.5">
                                <p className="line-clamp-1 text-xs font-bold text-foreground">
                                    {c.label}
                                </p>
                                <p className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">
                                    {t('landing.studentTabs.learn.tip')}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center self-center text-muted-foreground">
                                <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
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
    const { t, language } = useTranslation()
    const reduce = useReducedMotion()
    const [step, setStep] = useState(0)
    const energy = useLoopPhase(4000, 50)
    const eVal = 5 + Math.round(4.5 * (0.5 + 0.5 * Math.sin(energy * 2 * Math.PI)))

    useEffect(() => {
        if (reduce) return
        const id = window.setInterval(() => setStep((s) => (s + 1) % 3), 2500)
        return () => clearInterval(id)
    }, [reduce])

    const review =
        language === 'es'
            ? { w: 'Peso', e: 'Energía', p: 'Fotos', a: 'adjuntas' }
            : { w: 'Weight', e: 'Energy', p: 'Photos', a: 'attached' }

    const s = step
    const checkinCopy =
        s === 0
            ? { title: t('landing.studentTabs.checkin.step1Title'), body: t('landing.studentTabs.checkin.step1Body') }
            : s === 1
              ? { title: t('landing.studentTabs.checkin.step3Title'), body: t('landing.studentTabs.checkin.step3Body') }
              : {
                    title: language === 'es' ? 'Revisar' : 'Review',
                    body:
                        language === 'es'
                            ? 'Resumen antes de enviar: peso, energía y fotos adjuntas.'
                            : 'Summary before sending: weight, energy, and attached photos.',
                }

    return (
        <PhoneFrame>
            <PhoneHeader
                title={t('landing.studentTabs.checkin.headerTitle')}
                right={
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {s + 1} / 3
                    </span>
                }
            />
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
                <div className="flex items-center justify-center gap-1.5 px-0.5">
                    {(['a', 'b', 'c'] as const).map((id, i) => (
                        <motion.div
                            key={id}
                            animate={{
                                width: s === i ? 24 : 8,
                            }}
                            className="h-2 rounded-full"
                            style={{
                                backgroundColor: s >= i ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                            }}
                            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
                            aria-hidden
                        />
                    ))}
                </div>

                <div className="rounded-xl border border-border bg-card p-3">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={s}
                            initial={reduce ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduce ? undefined : { opacity: 0, y: -6 }}
                            transition={{ duration: 0.22 }}
                            className="space-y-2.5"
                        >
                            <p className="text-[11px] font-black uppercase text-foreground">
                                {checkinCopy.title}
                            </p>
                            <p className="text-[10px] leading-relaxed text-muted-foreground">
                                {checkinCopy.body}
                            </p>

                            {s === 0 ? (
                                <div className="space-y-2.5 pt-1">
                                    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
                                        <p className="text-[9px] font-semibold text-muted-foreground">
                                            {t('landing.studentTabs.checkin.weightLabel')}
                                        </p>
                                        <p className="font-display text-lg font-black tabular-nums text-foreground">
                                            78.4{' '}
                                            <span className="text-[10px] font-bold text-muted-foreground">kg</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-medium text-muted-foreground">
                                            {language === 'es' ? 'Nivel de energía (1–10)' : 'Energy level (1–10)'}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <motion.div
                                                    className="h-full rounded-full bg-primary"
                                                    initial={false}
                                                    animate={{ width: `${(eVal / 10) * 100}%` }}
                                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                                />
                                            </div>
                                            <span className="w-4 text-center text-xs font-black tabular-nums text-foreground">
                                                {eVal}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {s === 1 ? (
                                <div className="space-y-2 pt-1">
                                    <p className="text-[9px] font-medium text-muted-foreground">
                                        {language === 'es' ? 'Foto frontal' : 'Front photo'}
                                    </p>
                                    <div className="flex aspect-[5/2] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                                        <Camera className="h-5 w-5 text-muted-foreground" aria-hidden />
                                    </div>
                                    <p className="text-[9px] font-medium text-muted-foreground">
                                        {language === 'es' ? 'Foto de espalda' : 'Back photo'}
                                    </p>
                                    <div className="flex aspect-[5/2] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                                        <Camera className="h-5 w-5 text-muted-foreground" aria-hidden />
                                    </div>
                                </div>
                            ) : null}

                            {s === 2 ? (
                                <div className="space-y-1.5 rounded-lg border border-border p-2.5 text-[10px] text-foreground/90">
                                    <p>
                                        {review.w}: <strong>78.4 kg</strong>
                                    </p>
                                    <p>
                                        {review.e}: <strong>
                                            {eVal}/10
                                        </strong>
                                    </p>
                                    <p>
                                        {review.p}: <strong>2 {review.a}</strong>
                                    </p>
                                </div>
                            ) : null}
                        </motion.div>
                    </AnimatePresence>
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
                            {STUDENT_PANELS.map((panel) => (
                                <TabsContent
                                    key={panel.value}
                                    value={panel.value}
                                    className="mt-0 w-full min-w-0 outline-none"
                                >
                                    <StudentPanelBody panel={panel} />
                                </TabsContent>
                            ))}
                        </div>
                    </Tabs>
                </div>
            </div>
        </section>
    )
}
