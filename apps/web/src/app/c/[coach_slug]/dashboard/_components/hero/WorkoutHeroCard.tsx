'use client'

import Link from 'next/link'
import { Check, Play } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useBasePath } from '@/components/client/BasePathProvider'
import { cn } from '@/lib/utils'

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
    const base = useBasePath(`/c/${coachSlug}`)

    const show = blocks.slice(0, 4)
    const more = blocks.length - show.length

    const liveLogged = totalSetsLogged
    const pct = totalSetsTarget > 0 ? Math.min(100, (liveLogged / totalSetsTarget) * 100) : 0

    return (
        <Card variant="inverse" padding="lg" className="relative gap-0 shadow-[var(--shadow-lg)]">
            {isAlreadyLogged ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-card bg-[color-mix(in_srgb,var(--success-500)_22%,var(--surface-inverse))] backdrop-blur-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-500)] text-white shadow-[0_0_24px_rgba(31,184,119,0.5)]">
                        <Check className="h-7 w-7" />
                    </span>
                    <p className="font-display text-sm font-black text-on-dark">Entrenamiento completado</p>
                </div>
            ) : null}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-sport-400">Hoy entrenas</span>
                        <InfoTooltip content={t('section.workoutHero')} />
                    </div>
                    <h2 className="mt-1.5 truncate font-display text-[23px] font-black leading-tight tracking-[-0.02em] text-on-dark">
                        {title}
                    </h2>
                    <p className="mt-1 text-[13px] text-on-dark-muted">
                        {blocks.length} {blocks.length === 1 ? 'ejercicio' : 'ejercicios'} · {totalSetsTarget} series
                    </p>
                </div>
                <ProgressRing
                    value={pct}
                    size={64}
                    stroke={7}
                    color="var(--sport-500)"
                    track="rgba(255,255,255,0.12)"
                    label={
                        <span className="font-display text-[15px] font-black tabular-nums text-on-dark">
                            {liveLogged}/{totalSetsTarget}
                        </span>
                    }
                />
            </div>

            <ul className="mt-4 mb-4 flex flex-col gap-px overflow-hidden rounded-control bg-white/[0.04]">
                {show.map((b) => {
                    const logged = baseLoggedPerBlock[b.id] ?? 0
                    const full = logged >= b.sets
                    return (
                        <li key={b.id} className="relative flex min-h-[52px] w-full items-center gap-2.5 overflow-hidden px-3 py-2.5">
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute inset-y-0 left-0',
                                    full ? 'bg-[rgba(76,201,164,0.12)]' : 'bg-white/[0.07]'
                                )}
                                style={{ width: `${b.sets ? (logged / b.sets) * 100 : 0}%` }}
                            />
                            <div className="relative min-w-0 flex-1">
                                <div className="truncate text-[13.5px] font-semibold text-on-dark">{b.exercise.name}</div>
                                <div className="text-[11px] text-on-dark-muted">
                                    {b.sets} × {b.reps}
                                </div>
                            </div>
                            <span
                                className={cn(
                                    'relative flex items-center gap-1 text-[11.5px] font-bold tabular-nums',
                                    full ? 'text-sport-500' : 'text-on-dark-muted'
                                )}
                            >
                                {logged}/{b.sets}
                                {full ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                        </li>
                    )
                })}
                {more > 0 ? (
                    <li className="px-3 py-2 text-[11px] font-semibold text-on-dark-muted">+ {more} ejercicios más</li>
                ) : null}
            </ul>

            <div className="flex gap-2.5">
                <Link
                    href={`${base}/workout/${planId}`}
                    className={cn(buttonVariants({ variant: 'sport', size: 'lg' }), 'flex-1')}
                >
                    <Play className="h-5 w-5" />
                    {isAlreadyLogged ? 'Ver registro' : liveLogged > 0 ? 'Continuar' : 'Empezar entrenamiento'}
                </Link>
            </div>
        </Card>
    )
}
