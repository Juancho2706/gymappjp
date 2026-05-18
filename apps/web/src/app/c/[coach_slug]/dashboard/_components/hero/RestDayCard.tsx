'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { GlassCard } from '@/components/ui/glass-card'

interface RestDayCardProps {
    coachSlug: string
    nextWorkoutTitle: string | null
    nextWorkoutDayLabel: string | null
}

export function RestDayCard({ coachSlug, nextWorkoutTitle, nextWorkoutDayLabel }: RestDayCardProps) {
    return (
        <GlassCard className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-purple-50/30 p-6 text-center dark:from-gray-900 dark:to-slate-900">
            <motion.div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
            >
                🌙
            </motion.div>
            <h2 className="font-display text-xl font-bold text-foreground">Día de descanso</h2>
            {nextWorkoutTitle ? (
                <p className="mt-2 text-sm text-muted-foreground">
                    Próximo: <span className="font-medium text-foreground">{nextWorkoutTitle}</span>
                    {nextWorkoutDayLabel ? ` · ${nextWorkoutDayLabel}` : null}
                </p>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">Recupera bien para la próxima sesión.</p>
            )}
            <Link href={`/c/${coachSlug}/nutrition`} className="mt-4 inline-block text-xs font-semibold text-[color:var(--theme-primary)]">
                Ver nutrición →
            </Link>
        </GlassCard>
    )
}
