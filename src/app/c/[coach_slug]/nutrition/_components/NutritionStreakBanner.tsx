'use client'

import { useMemo } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Flame } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getTodayInSantiago } from '@/lib/date-utils'
import type { DayAdherence } from './AdherenceStrip'

interface Props {
  adherenceData: DayAdherence[]
  totalMeals: number
}

export function NutritionStreakBanner({ adherenceData, totalMeals }: Props) {
  const { iso: today } = getTodayInSantiago()

  const streak = useMemo(() => {
    const map = new Map(
      adherenceData.map((d) => [
        d.log_date,
        d.nutrition_meal_logs.filter((m) => m.is_completed).length,
      ])
    )
    let count = 0
    const todayNoon = parseISO(`${today}T12:00:00`)
    for (let i = 0; i < 365; i++) {
      const iso = format(subDays(todayNoon, i), 'yyyy-MM-dd')
      const completed = map.get(iso) ?? 0
      if (totalMeals > 0 && completed / totalMeals >= 0.5) {
        count++
      } else {
        break
      }
    }
    return count
  }, [adherenceData, today, totalMeals])

  if (streak < 2) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3"
      >
        <Flame className="w-5 h-5 text-orange-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-black text-orange-600 dark:text-orange-400">{streak} días de racha</p>
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
