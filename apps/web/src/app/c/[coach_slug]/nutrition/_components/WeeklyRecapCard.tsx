'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Share2, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WeeklyRecap, WeeklyRecapTone } from '../_data/recap.queries'

/**
 * Recap semanal motivacional del alumno (feature K). Cifra auditable (mismo motor que el resto),
 * tono ADAPTATIVO — gentil en semana floja, SIN culpa ni presión. Comparte a WhatsApp. Read-only.
 */

const TONE: Record<
  WeeklyRecapTone,
  { title: string; sub: string; ring: string; bg: string }
> = {
  great: {
    title: '¡Semana sólida! 🔥',
    sub: 'Gran consistencia. Seguí con este ritmo.',
    ring: 'text-emerald-500',
    bg: 'from-emerald-500/10',
  },
  good: {
    title: 'Buen ritmo 💪',
    sub: 'Vas en camino — un poco más y la cierras redonda.',
    ring: 'text-primary',
    bg: 'from-primary/10',
  },
  gentle: {
    title: 'Semana tranquila',
    sub: 'Sin dramas. La próxima sumás unos días más y listo.',
    ring: 'text-amber-500',
    bg: 'from-amber-500/10',
  },
  start: {
    title: 'Arranca tu semana',
    sub: 'Registra tu primera comida para ver tu progreso aquí.',
    ring: 'text-muted-foreground',
    bg: 'from-muted/40',
  },
}

function shareText(recap: WeeklyRecap): string {
  const parts = [`Mi semana en nutrición: ${recap.thisWeekPct}% de adherencia`]
  parts.push(`${recap.daysLoggedThisWeek}/7 días registrados`)
  if (recap.deltaPct != null && recap.deltaPct > 0) parts.push(`+${recap.deltaPct}% vs la semana pasada 📈`)
  return `${parts.join(' · ')} 💪`
}

export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap }) {
  const reduceMotion = useReducedMotion()
  const tone = TONE[recap.tone]
  const isStart = recap.tone === 'start'

  const deltaIcon =
    recap.deltaPct == null || recap.deltaPct === 0
      ? Minus
      : recap.deltaPct > 0
        ? TrendingUp
        : TrendingDown
  const DeltaIcon = deltaIcon
  const deltaColor =
    recap.deltaPct == null || recap.deltaPct === 0
      ? 'text-muted-foreground'
      : recap.deltaPct > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-400'

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-gradient-to-br to-transparent p-5 shadow-sm',
        tone.bg
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground">{tone.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tone.sub}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Tu semana
        </span>
      </div>

      {!isStart && (
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Adherencia · 7 días</p>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-4xl font-black tabular-nums', tone.ring)}>{recap.thisWeekPct}%</span>
              {recap.deltaPct != null && (
                <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold tabular-nums', deltaColor)}>
                  <DeltaIcon className="h-3.5 w-3.5" />
                  {recap.deltaPct > 0 ? '+' : ''}
                  {recap.deltaPct}% vs ant.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold tabular-nums text-foreground">{recap.daysLoggedThisWeek}</span>
            <span className="text-muted-foreground">de 7 días registrados</span>
          </div>
        </div>
      )}

      {!isStart && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText(recap))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background/70 px-3 text-xs font-bold text-foreground transition-colors hover:bg-background"
        >
          <Share2 className="h-3.5 w-3.5" /> Compartir mi semana
        </a>
      )}
    </motion.section>
  )
}
