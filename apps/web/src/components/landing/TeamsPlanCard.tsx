'use client'

import { Check, Users2 } from 'lucide-react'
import { motion } from 'framer-motion'

import { SALES_EMAIL } from '@/lib/brand-assets'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

/**
 * Card "EVA Teams" del pricing preview (D8 del plan 02). NO es un tier comprable
 * — componente dedicado, fuera del union `SubscriptionTier` y de `TIER_CONFIG`.
 *
 * REGLA DURA (memoria project-movida-commercial): CERO numeros de precio aqui
 * hasta cerrar la negociacion Movida. Solo capacidades + CTA "conversemos".
 *
 * Variantes:
 * - `grid` (default, desktop): en `lg` ocupa la fila a lo ancho (col-span-2) con
 *   layout horizontal (capacidades a la izquierda, CTA a la derecha); en `xl`
 *   vuelve a columna vertical para entrar como 5ta card de la fila. La conmutacion
 *   es por clases Tailwind responsive (un prop boolean no puede ser responsive).
 * - `carousel` (mobile): siempre vertical, mismo ancho/alto que las tier cards.
 */
type TeamsPlanCardProps = {
    variant?: 'grid' | 'carousel'
    /** Suprime la animacion de entrada (el carousel mobile la maneja aparte). */
    suppressEntrance?: boolean
}

const CAP_KEYS = [
    'landing.pricing.teamsCard.cap1',
    'landing.pricing.teamsCard.cap2',
    'landing.pricing.teamsCard.cap3',
] as const

export function TeamsPlanCard({ variant = 'grid', suppressEntrance = false }: TeamsPlanCardProps) {
    const { t } = useTranslation()
    const isGrid = variant === 'grid'

    return (
        <motion.div
            initial={suppressEntrance ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            whileInView={suppressEntrance ? undefined : { opacity: 1, y: 0 }}
            viewport={suppressEntrance ? undefined : { once: true, margin: '-20px' }}
            transition={{ duration: 0.35 }}
            data-plan-card="teams"
            className={cn(
                'relative flex flex-col rounded-2xl border border-t-[3px] border-border border-t-emerald-500/70 bg-card p-3.5 shadow-sm shadow-black/5 dark:border-t-emerald-400/60 dark:shadow-black/20',
                isGrid
                    ? // lg: a lo ancho (col-span-2) en fila horizontal; xl: columna vertical (5ta card)
                      'lg:flex-row lg:items-center lg:justify-between lg:gap-6 xl:flex-col xl:items-stretch xl:justify-start xl:gap-0'
                    : 'h-full'
            )}
        >
            {/* Eyebrow + (en grid horizontal) titulo */}
            <div className={cn('min-w-0', isGrid && 'lg:flex-1')}>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        <Users2 className="h-3 w-3 shrink-0" aria-hidden />
                        {t('landing.pricing.teamsCard.eyebrow')}
                    </span>
                    {/* Titulo visible solo en el layout horizontal de lg */}
                    {isGrid && (
                        <span className="hidden text-sm font-bold text-foreground lg:inline xl:hidden">
                            {t('landing.teams.title')}
                        </span>
                    )}
                </div>

                <ul
                    className={cn(
                        'mt-3 space-y-2',
                        isGrid && 'lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0 xl:block xl:space-y-2'
                    )}
                >
                    {CAP_KEYS.map((key) => (
                        <li key={key} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            <span className="leading-snug">{t(key)}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* CTA + correo */}
            <div className={cn('mt-3', isGrid && 'lg:mt-0 lg:w-44 lg:shrink-0 xl:mt-3 xl:w-auto')}>
                <a
                    href="/api/contact-teams?src=pricing-callout"
                    className="block w-full rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                    {t('landing.pricing.teamsCard.cta')}
                </a>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{SALES_EMAIL}</p>
            </div>
        </motion.div>
    )
}
