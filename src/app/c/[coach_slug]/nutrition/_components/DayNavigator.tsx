'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { getTodayInSantiago } from '@/lib/date-utils'

interface Props {
  selectedDate: string
  onDateChange: (date: string) => void
  adherenceDates: Set<string>
  isLoading?: boolean
}

function noon(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

export function DayNavigator({ selectedDate, onDateChange, adherenceDates, isLoading }: Props) {
  const { iso: today } = getTodayInSantiago()
  const isToday = selectedDate === today

  const prevDay = () => {
    onDateChange(format(addDays(noon(selectedDate), -1), 'yyyy-MM-dd'))
  }

  const nextDay = () => {
    if (isToday) return
    onDateChange(format(addDays(noon(selectedDate), 1), 'yyyy-MM-dd'))
  }

  const formatDate = (dateStr: string) => {
    if (dateStr === today) return 'Hoy'
    const yesterdayIso = format(addDays(noon(today), -1), 'yyyy-MM-dd')
    if (dateStr === yesterdayIso) return 'Ayer'
    const d = noon(dateStr)
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  const hasDot = adherenceDates.has(selectedDate)

  return (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={prevDay}
        className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95 touch-manipulation"
        aria-label="Día anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={() => !isToday && onDateChange(today)}
        className="flex flex-col items-center gap-1 min-w-0 px-4 touch-manipulation"
      >
        <span
          className={cn(
            'text-base font-black capitalize tracking-tight transition-colors',
            isToday ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {isLoading ? (
            <span className="animate-pulse bg-muted rounded w-24 h-5 inline-block" />
          ) : (
            formatDate(selectedDate)
          )}
        </span>
        {hasDot && !isToday && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        {!isToday && (
          <span className="text-[10px] font-semibold text-[color:var(--theme-primary)] uppercase tracking-wider">
            Volver a hoy
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={nextDay}
        disabled={isToday}
        className={cn(
          'w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-95 touch-manipulation',
          isToday
            ? 'text-muted-foreground/20 cursor-default'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        aria-label="Día siguiente"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}
