'use client'

import type { ComponentProps } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { tryLoadNutritionRecoveryBundle } from '@/lib/nutrition-plan-local-cache'
import { EmptyNutritionState } from './EmptyNutritionState'
import { NutritionShell } from './NutritionShell'
import type { DayAdherence } from './AdherenceStrip'

type Mode = 'loading' | 'empty' | 'cached'

type CachedPlan = {
  id: string
  coach_id?: string | null
  name?: string | null
  instructions?: string | null
  nutrition_meals?: unknown[]
  daily_calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fats_g?: number | null
}

/**
 * Cuando el servidor no encuentra plan activo: intenta mostrar copia local del mismo alumno y slug (solo sin red o fallo transitorio típico).
 * Si no hay copia válida, estado vacío habitual.
 */
export function NutritionNoPlanFromServer({ coachSlug, userId }: { coachSlug: string; userId: string }) {
  const router = useRouter()
  const hadCachedRef = useRef(false)
  const [mode, setMode] = useState<Mode>('loading')
  const [bundle, setBundle] = useState<ReturnType<typeof tryLoadNutritionRecoveryBundle>>(null)

  useEffect(() => {
    const apply = () => {
      const online = typeof navigator === 'undefined' || navigator.onLine
      if (online) {
        if (hadCachedRef.current) {
          router.refresh()
        }
        setBundle(null)
        setMode('empty')
        return
      }
      const b = tryLoadNutritionRecoveryBundle(coachSlug, userId)
      if (!b) {
        setBundle(null)
        setMode('empty')
        return
      }
      hadCachedRef.current = true
      setBundle(b)
      setMode('cached')
    }
    apply()
    window.addEventListener('online', apply)
    window.addEventListener('offline', apply)
    return () => {
      window.removeEventListener('online', apply)
      window.removeEventListener('offline', apply)
    }
  }, [coachSlug, userId, router])

  if (mode === 'loading') {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6">
        <p className="text-sm text-muted-foreground text-center">Buscando copia local del plan en este dispositivo…</p>
      </div>
    )
  }

  if (mode === 'empty' || !bundle) {
    return <EmptyNutritionState coachSlug={coachSlug} />
  }

  const plan = bundle.plan as CachedPlan
  const adherence = (Array.isArray(bundle.adherence) ? bundle.adherence : []) as DayAdherence[]
  const initialLog = (bundle.dailyLog as Record<string, unknown> | null) ?? null
  const { todayIso, cachedAt, cacheLogDate } = bundle
  const staleDay = cacheLogDate !== todayIso

  return (
    <div className="min-h-dvh bg-background">
      <div
        className="fixed top-0 right-0 w-72 h-72 opacity-[0.06] blur-3xl rounded-full pointer-events-none"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 px-4 py-3.5 pt-safe flex items-center gap-3">
        <Link
          href={`/c/${coachSlug}/dashboard`}
          className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black tracking-tight text-foreground">Plan Nutricional</h1>
            <p className="text-[10px] text-muted-foreground font-medium">{plan.name ?? 'Copia local'}</p>
          </div>
          <InfoTooltip content="Vista desde copia guardada en este dispositivo. Reconéctate para confirmar el plan con el servidor." />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5 relative z-0">
        <div
          role="status"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-snug text-amber-950 dark:text-amber-50"
        >
          <span className="font-semibold">Copia local.</span> El servidor no devolvió un plan activo; mostramos la última
          copia guardada aquí ({new Date(cachedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}).
          No sustituye la asignación oficial de tu coach: al volver la conexión se actualiza solo.
          {staleDay ? (
            <span className="block mt-1">
              Registros del día en cache: {cacheLogDate}. Hoy en tu zona: {todayIso}.
            </span>
          ) : null}
        </div>

        {plan.instructions && typeof plan.instructions === 'string' && plan.instructions.trim().length > 0 && (
          <details className="bg-muted/30 border border-border rounded-2xl">
            <summary className="px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground cursor-pointer list-none flex items-center justify-between">
              Indicaciones del coach
              <span className="text-muted-foreground/50">▼</span>
            </summary>
            <div className="px-4 pb-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{plan.instructions.trim()}</p>
            </div>
          </details>
        )}

        <NutritionShell
          hasTodayWorkout={false}
          plan={plan as ComponentProps<typeof NutritionShell>['plan']}
          initialLog={initialLog}
          adherence={adherence}
          userId={userId}
          coachSlug={coachSlug}
          today={todayIso}
        />
      </main>
    </div>
  )
}
