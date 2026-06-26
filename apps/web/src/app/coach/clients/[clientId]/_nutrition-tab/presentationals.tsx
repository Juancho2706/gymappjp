'use client'

// Componentes hoja presentacionales + el mapa de colores macro, extraídos VERBATIM de
// NutritionTabB5.tsx (Fase 2 — split de god-file, behavior-preserving). El import CSS de
// react-circular-progressbar viaja con MacroShareRing (su único consumidor) para que el ring
// conserve sus estilos.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

export const MACRO_COLORS = {
  cal: '#007AFF',
  prot: 'var(--color-macro-protein)',
  carb: 'var(--color-macro-carbs)',
  fat: 'var(--color-macro-fats)',
}

export function MacroShareRing({
  label,
  grams,
  kcalSharePct,
  color,
  unit = 'g',
}: {
  label: string
  grams: number
  kcalSharePct: number
  color: string
  unit?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(kcalSharePct)))
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-[72px] w-[72px]">
        <CircularProgressbar
          value={pct}
          text={`${grams}${unit === 'g' ? 'g' : ''}`}
          strokeWidth={10}
          styles={buildStyles({
            pathColor: color,
            trailColor: 'rgba(128,128,128,0.12)',
            textColor: 'var(--foreground)',
            textSize: '22px',
          })}
        />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center leading-tight">
        {label}
      </span>
      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{pct}% kcal</span>
    </div>
  )
}

export function HeatmapCell({
  day,
  reduceMotion,
}: {
  day: {
    dateKey: string
    label: string
    compliancePct: number | null
    mealsDone: number
    mealsTotal: number
    hasLog: boolean
  }
  reduceMotion: boolean | null
}) {
  const bg = !day.hasLog
    ? 'bg-muted/60 border-border/40'
    : day.compliancePct == null
      ? 'bg-muted/60 border-border/40'
      : day.compliancePct >= 80
        ? 'bg-emerald-500/35 border-emerald-500/50'
        : day.compliancePct >= 60
          ? 'bg-amber-500/35 border-amber-500/45'
          : 'bg-rose-500/30 border-rose-500/45'

  const title = day.hasLog
    ? `${day.dateKey}: ${day.mealsDone}/${day.mealsTotal} comidas · ${day.compliancePct ?? 0}%`
    : `${day.dateKey}: sin registro`

  return (
    <motion.div
      role="gridcell"
      aria-label={title}
      className={cn(
        'aspect-square rounded-md border text-[0] min-h-[26px]',
        bg,
        'cursor-default'
      )}
      whileHover={reduceMotion ? undefined : { scale: 1.08 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    />
  )
}

export function ZoneHeader({
  letter,
  title,
  subtitle,
}: {
  letter: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
        {letter}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">{title}</h2>
        {subtitle ? (
          <p className="text-[11px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

/** Collapsible "Detalle" accordion — collapsed by default. Reuses the file's
 *  framer-motion expand pattern so heavy charts stay out of the default view. */
export function DetailAccordion({
  title,
  defaultOpen = false,
  reduceMotion,
  children,
}: {
  title: string
  defaultOpen?: boolean
  reduceMotion: boolean | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard className="overflow-hidden border-dashed border-border/50 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-primary/5"
        aria-expanded={open}
      >
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="overflow-hidden border-t border-border/30 dark:border-white/10"
          >
            <div className="space-y-6 p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
