'use client'

import { useMemo } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Flame } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { motion, AnimatePresence } from 'framer-motion'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import type { DayAdherence } from './AdherenceStrip'

interface Props {
  adherenceData: DayAdherence[]
  planMeals: { id: string; day_of_week?: number | null }[]
}

export function NutritionStreakBanner({ adherenceData, planMeals }: Props) {
  const { iso: today } = getTodayInSantiago()

  const streak = useMemo(() => {
    const map = new Map(adherenceData.map((d) => [d.log_date, d]))
    let count = 0
    const todayNoon = parseISO(`${today}T12:00:00`)
    for (let i = 0; i < 365; i++) {
      const iso = format(subDays(todayNoon, i), 'yyyy-MM-dd')
      const log = map.get(iso)
      const planned = planMeals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, iso)).length
      if (planned === 0) continue
      const applicableIds = new Set(
        planMeals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, iso)).map((m) => m.id)
      )
      const completed =
        log?.nutrition_meal_logs.filter((m) => m.is_completed && applicableIds.has(m.meal_id)).length ?? 0
      if (completed / planned >= 0.5) {
        count++
      } else {
        break
      }
    }
    return count
  }, [adherenceData, today, planMeals])

  if (streak < 2) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3"
      >
        <Flame className="w-5 h-5 text-orange-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-sm font-black text-orange-600 dark:text-orange-400">
            <span>{streak} días de racha</span>
            <InfoTooltip
              title="Cómo se calcula la racha"
              content="Se cuenta un día si marcaste como completada al menos la mitad de las comidas que aplican a ese día según tu plan (mismo criterio que la barra de adherencia). Si un día no alcanza ese umbral, la racha se reinicia desde ahí."
              className="shrink-0"
              iconClassName="text-orange-600/80 dark:text-orange-300/90"
            />
          </p>
          <p className="text-[11px] text-muted-foreground">
            {streak >= 7
              ? '¡Semana perfecta! Sigue así.'
              : streak >= 3
                ? 'Vas muy bien, no lo rompas.'
                : 'Buen comienzo, mantén el ritmo.'}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
