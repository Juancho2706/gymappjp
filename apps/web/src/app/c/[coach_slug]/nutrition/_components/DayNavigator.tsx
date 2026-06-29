'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, format, parseISO } from 'date-fns'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { easings } from '@/lib/animation-presets'
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

// Umbrales para considerar un swipe horizontal intencional (offset en px o flick por velocidad).
const SWIPE_OFFSET = 60
const SWIPE_VELOCITY = 400

export function DayNavigator({ selectedDate, onDateChange, adherenceDates, isLoading }: Props) {
  const reduceMotion = useReducedMotion()
  const { iso: today } = getTodayInSantiago()
  const isToday = selectedDate === today

  const prevDay = () => {
    onDateChange(format(addDays(noon(selectedDate), -1), 'yyyy-MM-dd'))
  }

  const nextDay = () => {
    if (isToday) return
    onDateChange(format(addDays(noon(selectedDate), 1), 'yyyy-MM-dd'))
  }

  // Swipe izquierda → día siguiente; swipe derecha → día anterior.
  const onDragEnd = (_e: unknown, info: PanInfo) => {
    const { offset, velocity } = info
    const goNext = offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY
    const goPrev = offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY
    if (goNext) nextDay()
    else if (goPrev) prevDay()
  }

  const formatDate = (dateStr: string) => {
    if (dateStr === today) return 'Hoy'
    const yesterdayIso = format(addDays(noon(today), -1), 'yyyy-MM-dd')
    if (dateStr === yesterdayIso) return 'Ayer'
    const d = noon(dateStr)
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  const hasDot = adherenceDates.has(selectedDate)

  // reduced-motion: crossfade puro (sin slide). Default: deslizamiento direccional.
  const labelTransition = reduceMotion
    ? { duration: 0.15, ease: 'linear' as const }
    : { duration: 0.28, ease: easings.dirSlide }

  return (
    <motion.div
      className="sticky top-0 z-20 flex items-center justify-between px-1 py-1 bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70"
      drag={reduceMotion ? false : 'x'}
      dragSnapToOrigin
      dragElastic={0.12}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={reduceMotion ? undefined : onDragEnd}
    >
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
        <span className="relative block h-5 overflow-hidden">
          {isLoading ? (
            <span className="animate-pulse bg-muted rounded w-24 h-5 inline-block" />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={selectedDate}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                transition={labelTransition}
                className={cn(
                  'block whitespace-nowrap text-base font-black capitalize tracking-tight',
                  isToday ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {formatDate(selectedDate)}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
        {hasDot && !isToday && <span className="w-1.5 h-1.5 rounded-full bg-ember-500" />}
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
    </motion.div>
  )
}
