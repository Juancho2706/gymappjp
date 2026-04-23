'use client'

import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import {
    PhoneBottomNav,
    PhoneFrame,
    PhoneHeader,
    RingValue,
    useLoopPhase,
} from '@/components/landing/landing-student-mockup-shared'

function BarValue({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums text-foreground">{Math.round(value)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                    className={cn('h-full rounded-full', tone)}
                    initial={false}
                    animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                />
            </div>
        </div>
    )
}

/** Static snapshot for hero (M2: no timers). Mid-range “good” demo values. */
const HERO_STATIC = {
    vTrain: 78,
    vNutri: 72,
    vCheck: 85,
    series: 58,
    /** index 0–6 for subtle weekday highlight */
    weekHighlight: 4,
} as const

export type LandingStudentHomeMockupProps = {
    /**
     * `hero`: tighter frame to fit device showcase (~previous phone footprint).
     * `section`: default student tabs layout.
     */
    variant?: 'section' | 'hero'
    /**
     * When false, no phase loop: rings/bar/week stay static (hero + battery).
     * Section uses true by default.
     */
    loops?: boolean
    className?: string
}

/**
 * Student app “home” mockup: shared between hero device showcase and
 * “Experiencia del alumno” tab. See plan: hero uses `loops={false}` (M2).
 */
export function LandingStudentHomeMockup({
    variant = 'section',
    loops = true,
    className,
}: LandingStudentHomeMockupProps) {
    const { t } = useTranslation()
    const phase = useLoopPhase(10000, 50, loops)
    const twoPi = 2 * Math.PI

    const useMotion = loops
    const p = useMotion ? phase : 0.42
    const pTrain = 0.5 + 0.5 * Math.sin(p * twoPi)
    const pNutri = 0.5 + 0.5 * Math.sin(p * twoPi + 1.1)
    const pCheck = 0.5 + 0.5 * Math.sin(p * twoPi + 2.2)
    const vTrain = useMotion ? Math.round(55 + 32 * pTrain) : HERO_STATIC.vTrain
    const vNutri = useMotion ? Math.round(50 + 38 * pNutri) : HERO_STATIC.vNutri
    const vCheck = useMotion ? Math.round(65 + 35 * pCheck) : HERO_STATIC.vCheck
    const series = useMotion
        ? Math.round(45 + 35 * (0.5 + 0.5 * Math.sin(phase * twoPi * 0.4)))
        : HERO_STATIC.series
    const weekPulse = useMotion ? (Math.floor(phase * 7) % 7) : HERO_STATIC.weekHighlight

    const frameClass =
        variant === 'hero' ? cn('max-w-[min(100%,236px)]', className) : className
    const isHero = variant === 'hero'

    return (
        <PhoneFrame className={frameClass} bezel={isHero ? 'heroChrome' : 'default'}>
            <PhoneHeader
                className={isHero ? 'px-2.5' : undefined}
                title={t('landing.studentTabs.home.headerTitle')}
                right={
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500/15 font-bold text-orange-700 dark:text-orange-300',
                            isHero
                                ? 'px-1.5 py-0.5 text-[9px]'
                                : 'px-2 py-0.5 text-[10px]'
                        )}
                    >
                        <Flame className={cn('shrink-0', isHero ? 'h-2.5 w-2.5' : 'h-3 w-3')} aria-hidden />
                        12d
                    </span>
                }
            />
            <div
                className={cn(
                    'flex-1 space-y-3 overflow-x-hidden overflow-y-hidden px-3 py-3',
                    isHero && 'space-y-2 px-2.5 py-2'
                )}
            >
                <div
                    className={cn(
                        'flex items-center gap-3 rounded-xl border border-border bg-card',
                        isHero ? 'gap-2 p-2' : 'p-2.5'
                    )}
                >
                    <div
                        className={cn(
                            'shrink-0 rounded-full bg-gradient-to-br from-primary/40 to-violet-500/40 ring-2 ring-primary/20',
                            isHero ? 'h-8 w-8' : 'h-9 w-9'
                        )}
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">
                            {t('landing.studentTabs.home.greetingLabel')}
                        </p>
                        <p className="truncate text-xs font-bold text-foreground">
                            {t('landing.studentTabs.home.greetingName')}
                        </p>
                    </div>
                </div>

                <div className={cn('rounded-xl border border-border bg-card', isHero ? 'p-2' : 'p-3')}>
                    <div className={cn('flex items-center justify-between gap-2', isHero ? 'mb-2' : 'mb-3')}>
                        <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-wide text-foreground">
                            {t('landing.studentTabs.home.compliance')}
                        </p>
                        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
                            {t('landing.studentTabs.home.thisWeek')}
                        </span>
                    </div>
                    <div
                        className={cn(
                            'flex min-w-0 items-end',
                            isHero ? 'justify-between gap-1' : 'justify-around'
                        )}
                    >
                        <RingValue
                            label={t('landing.studentTabs.home.ringTrain')}
                            value={vTrain}
                            displayValue={`${vTrain}%`}
                            tone="primary"
                            compact={isHero}
                        />
                        <RingValue
                            label={t('landing.studentTabs.home.ringNutri')}
                            value={vNutri}
                            displayValue={`${vNutri}%`}
                            tone="emerald"
                            compact={isHero}
                        />
                        <RingValue
                            label={t('landing.studentTabs.home.ringCheck')}
                            value={vCheck}
                            displayValue={`${vCheck}%`}
                            tone="violet"
                            compact={isHero}
                        />
                    </div>
                </div>

                <div className={cn('rounded-xl border border-border bg-card', isHero ? 'p-2' : 'p-2.5')}>
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {t('landing.studentTabs.home.series')}
                        </span>
                        <span className="text-[10px] font-bold text-foreground">18 / 24</span>
                    </div>
                    <BarValue
                        label={t('landing.studentTabs.home.seriesLabel')}
                        value={series}
                        tone="bg-primary"
                    />
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
                        const done = [true, true, false, true, true, false, false][i]
                        const highlight = weekPulse === i
                        return (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <span className="text-[8px] font-semibold uppercase text-muted-foreground">
                                    {d}
                                </span>
                                <motion.span
                                    animate={
                                        useMotion
                                            ? {
                                                  scale: highlight ? 1.35 : 1,
                                                  opacity: done ? 1 : 0.45,
                                              }
                                            : { scale: highlight ? 1.12 : 1, opacity: done ? 1 : 0.45 }
                                    }
                                    transition={
                                        useMotion
                                            ? { type: 'spring', stiffness: 400, damping: 22 }
                                            : { duration: 0 }
                                    }
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

/** Default panel mockup for student tabs (full motion). */
export function StudentHomeMockup() {
    return <LandingStudentHomeMockup variant="section" loops />
}
