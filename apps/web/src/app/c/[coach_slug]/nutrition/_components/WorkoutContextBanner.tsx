'use client'

import { Dumbbell } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'

/**
 * Mensaje informativo (no prescripción médica): contexto entreno + nutrición.
 */
export function WorkoutContextBanner({ hasTodayWorkout }: { hasTodayWorkout: boolean }) {
  if (!hasTodayWorkout) return null

  return (
    <div
      role="status"
      className="flex gap-2 rounded-2xl border border-sport-500/25 bg-sport-500/10 px-3 py-2.5 text-[11px] leading-snug text-sport-700 dark:text-sport-200"
    >
      <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-sport-600 dark:text-sport-300" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="font-bold">Hoy tienes entreno en tu plan.</span>
          <InfoTooltip
            title="Contexto entreno"
            content="Recordatorio educativo según tu calendario de entrenos en EVA. No sustituye indicación médica ni nutricional personalizada: hidratación, timing de comidas y macros los define tu coach contigo."
            className="shrink-0 align-middle"
            iconClassName="text-sport-600/70 dark:text-sport-300/80"
          />
        </span>{' '}
        Hidrátate y distribuye carbohidratos alrededor de la sesión según lo que acordaste con tu coach.
      </p>
    </div>
  )
}
