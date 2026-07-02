'use client'

import { useMemo } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Flame } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import type { DayAdherence } from './AdherenceStrip'

interface Props {
  adherenceData: DayAdherence[]
  planMeals: { id: string; day_of_week?: number | null }[]
}

interface StreakResult {
  /** Días consecutivos cumplidos contando desde hoy hacia atrás. */
  count: number
  /** Se rompió por exactamente un día (ayer falló) pero antes había racha viva. */
  atRisk: boolean
  /** Largo de la racha previa que quedó en riesgo (para encuadrar "X de 7 días"). */
  priorCount: number
}

export function NutritionStreakBanner({ adherenceData, planMeals }: Props) {
  const reduceMotion = useReducedMotion()
  const { iso: today } = getTodayInSantiago()

  const { count, atRisk, priorCount } = useMemo<StreakResult>(() => {
    const map = new Map(adherenceData.map((d) => [d.log_date, d]))
    const todayNoon = parseISO(`${today}T12:00:00`)

    // Devuelve true/false si el día aplica (>=50% comidas), o null si no había comidas planificadas (se salta).
    const dayMet = (iso: string): boolean | null => {
      const applicable = planMeals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, iso))
      if (applicable.length === 0) return null
      const applicableIds = new Set(applicable.map((m) => m.id))
      const log = map.get(iso)
      const completed =
        log?.nutrition_meal_logs.filter((m) => m.is_completed && applicableIds.has(m.meal_id)).length ?? 0
      return completed / applicable.length >= 0.5
    }

    // Cuenta una racha consecutiva empezando en startOffset días atrás (saltando días sin plan).
    const countFrom = (startOffset: number): { count: number; brokeOffset: number | null } => {
      let c = 0
      for (let i = startOffset; i < 365; i++) {
        const iso = format(subDays(todayNoon, i), 'yyyy-MM-dd')
        const met = dayMet(iso)
        if (met === null) continue
        if (met) c++
        else return { count: c, brokeOffset: i }
      }
      return { count: c, brokeOffset: null }
    }

    const live = countFrom(0)
    if (live.count > 0) {
      return { count: live.count, atRisk: false, priorCount: live.count }
    }

    // Hoy no cuenta (aún). Solo es "en riesgo" si la racha se rompió por exactamente un día:
    // el día que rompió fue ayer y antes de ayer había racha viva.
    if (live.brokeOffset === 1) {
      const prior = countFrom(2)
      if (prior.count >= 2) {
        return { count: 0, atRisk: true, priorCount: prior.count }
      }
    }

    return { count: 0, atRisk: false, priorCount: 0 }
  }, [adherenceData, today, planMeals])

  // Estado de riesgo: racha previa de >=2 conservada (grace day), un solo pulse ámbar, sin reset duro.
  if (atRisk) {
    const riskFrame = priorCount <= 7 ? `${priorCount} de 7 días` : `${priorCount} días`
    return (
      <AnimatePresence>
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, scale: [1, 1.025, 1] }
          }
          transition={reduceMotion ? { duration: 0.2 } : { duration: 0.55, ease: 'easeOut', times: [0, 0.5, 1] }}
          className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-card px-4 py-3"
        >
          <Flame className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1 text-sm font-black text-amber-600 dark:text-amber-400">
              <span>Tu racha sigue viva · {riskFrame}</span>
              <InfoTooltip
                title="Tu racha sigue viva por hoy"
                content="Ayer no alcanzaste la mitad de tus comidas, pero tu racha no se reinicia todavía. Si registras al menos la mitad de las comidas de hoy, la recuperas."
                className="shrink-0"
                iconClassName="text-amber-600/80 dark:text-amber-300/90"
              />
            </p>
            <p className="text-[11px] text-muted-foreground">
              Registra tus comidas de hoy para mantenerla.
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (count < 2) return null

  const streakFrame = count <= 7 ? `${count} de 7 días` : `${count} días`

  return (
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-card border border-ember-200 bg-ember-100 px-4 py-3"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember-500 text-white">
          <Flame className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-sm font-black text-ember-700">
            <span>{streakFrame} de racha</span>
            <InfoTooltip
              title="Cómo se calcula la racha"
              content="Se cuenta un día si marcaste como completada al menos la mitad de las comidas que aplican a ese día según tu plan (mismo criterio que la barra de adherencia). Si te saltas un día completo, tienes un día de gracia antes de volver a empezar."
              className="shrink-0"
              iconClassName="text-ember-700/80"
            />
          </p>
          <p className="text-[11px] text-ember-700/80">
            {count >= 7
              ? '¡Semana perfecta! Sigue así.'
              : count >= 3
                ? 'Vas muy bien, sigue así.'
                : 'Buen comienzo, mantén el ritmo.'}
          </p>
        </div>
        <span className="font-display text-2xl font-black tabular-nums text-ember-700">{count}</span>
      </motion.div>
    </AnimatePresence>
  )
}
