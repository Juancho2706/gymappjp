'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Moon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useBasePath } from '@/components/client/BasePathProvider'

interface RestDayCardProps {
    coachSlug: string
    nextWorkoutTitle: string | null
    nextWorkoutDayLabel: string | null
    /** Master switch del dominio Nutricion: `false` => oculta el link "Ver nutrición →". */
    showNutritionLink?: boolean
}

export function RestDayCard({ coachSlug, nextWorkoutTitle, nextWorkoutDayLabel, showNutritionLink = true }: RestDayCardProps) {
    const base = useBasePath(`/c/${coachSlug}`)
    return (
        <Card variant="sunken" padding="lg" className="items-center gap-0 text-center">
            <motion.div
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-aqua-100 text-aqua-700"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
            >
                <Moon className="h-7 w-7" />
            </motion.div>
            <h2 className="font-display text-xl font-black tracking-[-0.02em] text-strong">Día de descanso</h2>
            {nextWorkoutTitle ? (
                <p className="mt-1.5 max-w-[280px] text-[13.5px] leading-relaxed text-muted">
                    Próximo: <span className="font-semibold text-body">{nextWorkoutTitle}</span>
                    {nextWorkoutDayLabel ? ` · ${nextWorkoutDayLabel}` : null}
                </p>
            ) : (
                <p className="mt-1.5 max-w-[280px] text-[13.5px] leading-relaxed text-muted">Recupera bien para la próxima sesión.</p>
            )}
            {showNutritionLink && (
                <Link href={`${base}/nutrition`} className="mt-4 inline-block text-[13px] font-bold text-sport-600">
                    Ver nutrición →
                </Link>
            )}
        </Card>
    )
}
