'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Dumbbell } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { springs } from '@/lib/animation-presets'
import { QuickLogSheet } from './QuickLogSheet'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export interface HeroBlock {
    id: string
    sets: number
    reps: string
    exercise: { name: string }
}

interface WorkoutHeroCardProps {
    planId: string
    title: string
    blocks: HeroBlock[]
    isAlreadyLogged: boolean
    totalSetsTarget: number
    totalSetsLogged: number
    baseLoggedPerBlock: Record<string, number>
    coachSlug: string
}

export function WorkoutHeroCard({
    planId,
    title,
    blocks,
    isAlreadyLogged,
    totalSetsTarget,
    totalSetsLogged,
    baseLoggedPerBlock,
    coachSlug,
}: WorkoutHeroCardProps) {
    const { t } = useTranslation()
    const pct = totalSetsTarget > 0 ? Math.min(100, (totalSetsLogged / totalSetsTarget) * 100) : 0
    const show = blocks.slice(0, 4)
    const more = blocks.length - show.length

    return (
        <GlassCard className="relative overflow-hidden p-5">
            {isAlreadyLogged ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 backdrop-blur-sm">
                    <Check className="h-10 w-10 text-emerald-500" />
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Entrenamiento completado</p>
                </div>
            ) : null}
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl border"
                        style={{
                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                        }}
                    >
                        <Dumbbell className="h-5 w-5" style={{ color: 'var(--theme-primary)' }} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hoy</p>
                        <p className="truncate font-display text-lg font-bold text-foreground">{title}</p>
                    </div>
                </div>
                <InfoTooltip content={t('section.workoutHero')} />
            </div>
            <ul className="mb-4 space-y-1.5 text-sm text-muted-foreground">
                {show.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate text-foreground">• {b.exercise.name}</span>
                        <span className="shrink-0 tabular-nums">
                            {b.sets} × {b.reps}
                        </span>
                    </li>
                ))}
                {more > 0 ? <li className="text-xs text-muted-foreground">+ {more} ejercicios más</li> : null}
            </ul>
            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${pct}%` }}
                    transition={springs.lazy}
                />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
                {totalSetsLogged}/{totalSetsTarget} series
            </p>
            <div className="flex flex-wrap gap-2">
                <GlassButton variant="brand" size="sm" asChild>
                    <Link href={`/c/${coachSlug}/workout/${planId}`}>{isAlreadyLogged ? 'Ver registro' : 'Empezar entrenamiento'}</Link>
                </GlassButton>
                {!isAlreadyLogged && blocks.length > 0 ? (
                    <QuickLogSheet
                        blocks={blocks}
                        coachSlug={coachSlug}
                        baseLoggedPerBlock={baseLoggedPerBlock}
                        totalSetsTarget={totalSetsTarget}
                    />
                ) : null}
            </div>
        </GlassCard>
    )
}
