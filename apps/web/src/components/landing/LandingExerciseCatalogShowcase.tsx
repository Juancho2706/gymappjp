'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Check, Dumbbell } from 'lucide-react'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const } },
}

const CATALOG_DEMO = [
    { id: 'bulgarian', name: { es: 'Sentadilla búlgara', en: 'Bulgarian split squat' }, muscle: { es: 'Cuádriceps', en: 'Quads' }, reps: '10', color: '#007AFF' },
    { id: 'pullups', name: { es: 'Dominadas', en: 'Pull-ups' }, muscle: { es: 'Dorsales', en: 'Lats' }, reps: '12', color: '#00E5FF' },
    { id: 'bench', name: { es: 'Press banca', en: 'Bench press' }, muscle: { es: 'Pectorales', en: 'Chest' }, reps: '8', color: '#00C7BE' },
    { id: 'plank', name: { es: 'Plancha', en: 'Plank' }, muscle: { es: 'Abdominales', en: 'Core' }, reps: '60s', color: '#5856D6' },
    { id: 'rdl', name: { es: 'Peso muerto rumano', en: 'Romanian deadlift' }, muscle: { es: 'Isquiotibiales', en: 'Hamstrings' }, reps: '10', color: '#FF9500' },
    { id: 'ohp', name: { es: 'Press militar', en: 'Overhead press' }, muscle: { es: 'Hombros', en: 'Shoulders' }, reps: '8', color: '#AF52DE' },
    { id: 'row', name: { es: 'Remo con barra', en: 'Barbell row' }, muscle: { es: 'Espalda alta', en: 'Upper back' }, reps: '10', color: '#34C759' },
    { id: 'lunge', name: { es: 'Zancadas caminando', en: 'Walking lunges' }, muscle: { es: 'Glúteos', en: 'Glutes' }, reps: '12', color: '#FF2D55' },
    { id: 'curl', name: { es: 'Curl martillo', en: 'Hammer curl' }, muscle: { es: 'Bíceps', en: 'Biceps' }, reps: '12', color: '#5AC8FA' },
    { id: 'dip', name: { es: 'Fondos en paralelas', en: 'Dips' }, muscle: { es: 'Tríceps', en: 'Triceps' }, reps: '10', color: '#FFCC00' },
    { id: 'latraise', name: { es: 'Elevación lateral', en: 'Lateral raise' }, muscle: { es: 'Hombros', en: 'Shoulders' }, reps: '15', color: '#64D2FF' },
    { id: 'farmer', name: { es: 'Farmer carry', en: 'Farmer carry' }, muscle: { es: 'Antebrazos', en: 'Forearms' }, reps: '40m', color: '#A2845E' },
] as const

function parseLeadingNumberTitle(title: string): { num: string; rest: string } | null {
    const m = title.trim().match(/^([\d.,]+)\s+(.+)$/)
    if (!m) return null
    return { num: m[1]!, rest: m[2]! }
}

function ExerciseTile({
    name,
    muscle,
    reps,
    color,
}: {
    name: string
    muscle: string
    reps: string
    color: string
}) {
    return (
        <div
            className={cn(
                'flex w-[min(88vw,15.5rem)] shrink-0 items-center gap-2.5 rounded-xl border border-border/80 bg-card/95 p-2.5 shadow-sm backdrop-blur-sm sm:w-[min(90vw,15rem)] sm:gap-3 sm:p-3 md:w-[240px]',
                'transition-transform duration-300 hover:scale-[1.02] hover:border-primary/25 hover:shadow-md'
            )}
        >
            <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background"
                style={{ boxShadow: `inset 0 0 0 1px ${color}33` }}
            >
                <Dumbbell className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground sm:text-sm">{name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:mt-1 sm:gap-2">
                    <span
                        className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase sm:px-2 sm:text-[10px]"
                        style={{ backgroundColor: `${color}22`, color }}
                    >
                        {muscle}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{reps}</span>
                </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
        </div>
    )
}

export function LandingExerciseCatalogShowcase({ exerciseCount }: { exerciseCount: number }) {
    const { t, language } = useTranslation()
    const lang = language === 'en' ? 'en' : 'es'
    const exerciseTitle = t('landing.exercises.title').replace('{{count}}', String(exerciseCount))
    const exerciseBullets = [
        t('landing.exercises.bullet1'),
        t('landing.exercises.bullet2'),
        t('landing.exercises.bullet3'),
        t('landing.exercises.bullet4'),
    ]
    const titleParts = parseLeadingNumberTitle(exerciseTitle)
    const titleLead = t('landing.exercises.titleLead')

    const rowA = CATALOG_DEMO.filter((_, i) => i % 2 === 0)
    const rowB = CATALOG_DEMO.filter((_, i) => i % 2 === 1)

    const mapTile = (ex: (typeof CATALOG_DEMO)[number]) => (
        <ExerciseTile name={ex.name[lang]} muscle={ex.muscle[lang]} reps={ex.reps} color={ex.color} />
    )

    return (
        <section
            id="catalogo"
            className="landing-section-catalog relative scroll-mt-28 overflow-x-clip border-t border-border/40 py-16 sm:py-24"
        >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.04] to-transparent" />
            <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-primary/[0.07] blur-[100px]" />

            <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
                <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:mb-3">
                            {t('landing.exercises.eyebrow')}
                        </span>
                        <h2 className="mb-4 hyphens-none text-balance font-display text-2xl font-black leading-[1.15] tracking-tight sm:mb-5 sm:text-3xl md:mb-6 md:text-5xl">
                            <span className="text-foreground">
                                {titleParts ? (
                                    <>
                                        <span className="tabular-nums tracking-tight">{titleParts.num}</span>{' '}
                                        <span>{titleParts.rest}</span>
                                    </>
                                ) : (
                                    exerciseTitle
                                )}
                            </span>
                            <br className="md:hidden" />
                            <span className="mt-1 block text-muted-foreground md:mt-0 md:inline md:pl-1.5">{titleLead}</span>
                        </h2>
                        <p className="mb-6 max-w-md text-sm leading-relaxed text-muted-foreground sm:mb-8 sm:text-base">
                            {t('landing.exercises.intro')}
                        </p>

                        <ul className="space-y-2.5 sm:space-y-3">
                            {exerciseBullets.map((item) => (
                                <li key={item} className="flex items-start gap-2.5 sm:items-center sm:gap-3">
                                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 sm:mt-0">
                                        <Check className="h-3 w-3 text-primary" aria-hidden />
                                    </div>
                                    <span className="text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-normal">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true, margin: '-60px' }}
                        transition={{ duration: 0.65, ease: [0.25, 0.4, 0.25, 1] }}
                        className="relative min-w-0"
                    >
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-sky-500/10 blur-2xl" />
                        <div className="relative space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 shadow-xl backdrop-blur-md dark:bg-zinc-950/40 sm:space-y-4 sm:rounded-3xl sm:p-4 md:p-5">
                            <InfiniteSlider gap={14} duration={38} className="py-1">
                                {rowA.map(mapTile)}
                            </InfiniteSlider>
                            <InfiniteSlider gap={14} duration={44} reverse className="py-1">
                                {rowB.map(mapTile)}
                            </InfiniteSlider>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
