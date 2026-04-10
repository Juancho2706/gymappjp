'use client'

import { useMemo } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { getTodayInSantiago } from '@/lib/date-utils'

export interface DayAdherence {
  log_date: string
  nutrition_meal_logs: { is_completed: boolean }[]
}

interface Props {
  data: DayAdherence[]
  totalMeals: number
}

export function AdherenceStrip({ data, totalMeals }: Props) {
  const { iso: today } = getTodayInSantiago()

  const days = useMemo(() => {
    const map = new Map(data.map((d) => [d.log_date, d]))
    const result: { iso: string; pct: number; completed: number; isToday: boolean }[] = []
    const todayNoon = parseISO(`${today}T12:00:00`)
    for (let i = 29; i >= 0; i--) {
      const iso = format(subDays(todayNoon, i), 'yyyy-MM-dd')
      const log = map.get(iso)
      const completed = log?.nutrition_meal_logs.filter((m) => m.is_completed).length ?? 0
      const pct = totalMeals > 0 ? completed / totalMeals : 0
      result.push({ iso, pct, completed, isToday: iso === today })
    }
    return result
  }, [data, today, totalMeals])

  const registeredDays = days.filter((d) => d.completed > 0).length

  const getColor = (pct: number) => {
    if (pct === 0) return 'bg-muted/60'
    if (pct >= 0.8) return 'bg-emerald-500'
    if (pct >= 0.5) return 'bg-amber-400'
    return 'bg-red-400'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Adherencia — 30 días</p>
        <span className="text-xs font-bold text-foreground">
          {registeredDays}/30 días
        </span>
      </div>

      <div className="grid grid-cols-10 gap-0.5 sm:gap-1">
        {days.map((day) => (
          <div
            key={day.iso}
            className={cn(
              'h-2 w-full rounded-sm transition-all sm:aspect-square sm:h-auto',
              getColor(day.pct),
              day.isToday && 'ring-2 ring-[color:var(--theme-primary)] ring-offset-1 ring-offset-background'
            )}
            title={`${day.iso}: ${Math.round(day.pct * 100)}%`}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> 80%+
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> 50–79%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> 1–49%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted/60" /> Sin reg.
        </span>
      </div>
    </div>
  )
}
