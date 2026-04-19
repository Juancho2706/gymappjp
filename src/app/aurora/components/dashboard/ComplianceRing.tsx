/**
 * Copia del módulo alumno `ComplianceRing` / `ComplianceRingCluster` para Aurora.
 * Usa `GlassCard` de la copia local `../ui/glass-card`.
 */
'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { useTheme } from 'next-themes'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { GlassCard } from '@/app/aurora/components/ui/glass-card'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

interface ComplianceRingProps {
  value: number
  label: string
  color: 'brand' | 'emerald' | 'violet'
  empty?: boolean
  /**
   * Tema fijo (p. ej. interruptor Aurora). Evita hydration mismatch: `useTheme()` no está
   * alineado entre SSR y primer paint con `ThemeProvider` anidado.
   */
  resolvedThemeOverride?: 'light' | 'dark'
}

const stroke: Record<ComplianceRingProps['color'], string> = {
  brand: 'var(--theme-primary)',
  emerald: '#10b981',
  violet: '#8b5cf6',
}

const emptyStroke = '#9ca3af'

export function ComplianceRing({ value, label, color, empty, resolvedThemeOverride }: ComplianceRingProps) {
  const { resolvedTheme } = useTheme()
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const themeFixed = resolvedThemeOverride ?? resolvedTheme
  const isDark = themeFixed === 'dark'

  /** En Aurora usamos valor estático: spring + SSR dan distinto primer paint. */
  const staticPreview = resolvedThemeOverride != null

  const [animated, setAnimated] = useState(() => (reduce || staticPreview ? value : 0))
  const mv = useMotionValue(staticPreview ? value : 0)
  const spring = useSpring(mv, { stiffness: 60, damping: 20 })

  useEffect(() => {
    if (staticPreview) return
    if (empty) {
      mv.set(0)
      setAnimated(0)
      return
    }
    mv.set(value)
  }, [value, mv, empty, staticPreview])

  useMotionValueEvent(spring, 'change', (v) => {
    if (staticPreview) return
    setAnimated(Math.round(v))
  })

  const trail = isDark ? '#374151' : '#e5e7eb'
  const displayPct = empty ? 0 : reduce || staticPreview ? value : animated
  const pathColor = empty ? emptyStroke : stroke[color]
  const centerText = empty ? '—' : `${displayPct}%`
  const textSize = empty ? '22px' : '28px'

  const textColor = empty
    ? isDark
      ? '#9ca3af'
      : '#6b7280'
    : isDark
      ? '#f9fafb'
      : '#111827'

  /** Evita mismatch SSR: CircularProgressbar calcula dasharray con floats distintos en servidor vs cliente. */
  if (!mounted) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full border border-border/50 bg-muted/20 sm:h-24 sm:w-24"
          aria-hidden
        />
        <span className="text-center text-[10px] font-medium text-muted-foreground sm:text-xs">{label}</span>
        {empty ? <span className="text-center text-[9px] text-muted-foreground/80">Sin datos</span> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-20 w-20 sm:h-24 sm:w-24">
        <CircularProgressbar
          value={displayPct}
          text={centerText}
          styles={buildStyles({
            pathColor,
            trailColor: trail,
            textColor,
            textSize,
          })}
        />
      </div>
      <span className="text-center text-[10px] font-medium text-muted-foreground sm:text-xs">{label}</span>
      {empty ? <span className="text-center text-[9px] text-muted-foreground/80">Sin datos</span> : null}
    </div>
  )
}

export function ComplianceRingCluster({
  workoutScore,
  nutritionScore,
  checkInScore,
  nutritionHasLogs,
  resolvedThemeOverride,
}: {
  workoutScore: number
  nutritionScore: number
  checkInScore: number
  nutritionHasLogs: boolean
  resolvedThemeOverride?: 'light' | 'dark'
}) {
  const { t } = useTranslation()
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-center gap-1.5">
        <p className="text-center text-xs font-semibold text-muted-foreground">Últimos 30 días</p>
        <InfoTooltip content={t('section.compliance')} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ComplianceRing
          value={workoutScore}
          label="Entrenos"
          color="brand"
          resolvedThemeOverride={resolvedThemeOverride}
        />
        <ComplianceRing
          value={nutritionScore}
          label="Nutrición"
          color="emerald"
          empty={!nutritionHasLogs}
          resolvedThemeOverride={resolvedThemeOverride}
        />
        <ComplianceRing
          value={checkInScore}
          label="Check-ins"
          color="violet"
          resolvedThemeOverride={resolvedThemeOverride}
        />
      </div>
    </GlassCard>
  )
}
