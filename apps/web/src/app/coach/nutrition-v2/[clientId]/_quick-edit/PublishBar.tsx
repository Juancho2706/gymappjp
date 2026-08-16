'use client'

/**
 * Barra de publicacion sticky inferior (§1.2.C, movil-first, thumb-zone): aparece al
 * primer cambio con "{n} cambios sin publicar" + Descartar / Publicar cambios. En error
 * muestra "No se pudo publicar. Reintentar" (el draft NO se pierde; el reintento reusa la
 * misma clave de idempotencia). Safe-area inset para no chocar con el home indicator.
 */

import Link from 'next/link'
import { AlertTriangle, Loader2, LockKeyhole, RefreshCcw } from 'lucide-react'
import { useQuickEdit } from './QuickEditProvider'
import { QE_COPY } from './microcopy'

// Ruta canonica de upgrade de plan (inlineada: _lib/nutrition-pro.ts es server-only).
// Nutricion Pro viene incluido en los planes pagos — el CTA apunta al cambio de plan.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'

/** Totales EN VIVO del dia activo (W3b, solo editor): items + porciones a eleccion. */
export interface PublishBarDayTotals {
  /** Etiqueta del dia (multi-dia); null = plan de un solo dia (no se nombra). */
  label: string | null
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  /** Meta de calorias del dia, si el coach la fijo. */
  targetCalories: number | null
}

export function PublishBar({ dayTotals = null }: { dayTotals?: PublishBarDayTotals | null }) {
  const {
    changeCount,
    isPending,
    publishError,
    upgradeRequired,
    substitutionsFailed,
    retrySubstitutions,
    openConfirm,
    retryPublish,
    discardChanges,
    surface,
    state,
  } = useQuickEdit()

  // Modo plantilla (T3.2b): no se publica nada — se guarda material del coach.
  const isTemplate = surface === 'template'
  // Creacion: la vigencia elegible existe solo ahi (ver `QeMeta.effectiveFrom`).
  const isCreation = state.meta?.effectiveFrom !== undefined
  const dirtyLabel = isTemplate ? QE_COPY.templateDirtyBar(changeCount) : QE_COPY.dirtyBar(changeCount)
  const ctaLabel = isTemplate
    ? QE_COPY.templateSave
    : isCreation
      ? QE_COPY.createPublish
      : QE_COPY.publish

  const hasActions = changeCount > 0 || publishError !== null || upgradeRequired || substitutionsFailed
  // En el editor (dayTotals presente) la barra vive SIEMPRE: totales fijos abajo (W3b).
  const visible = dayTotals !== null || hasActions
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-card border border-border-default bg-surface-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
        {upgradeRequired ? (
          <div className="mb-2 flex items-start gap-2 rounded-control border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-body">
            <LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              {QE_COPY.upgradeRequired}{' '}
              <Link href={NUTRITION_PRO_UPGRADE_HREF} className="font-semibold text-primary underline underline-offset-2">
                Ver planes
              </Link>
            </p>
          </div>
        ) : null}
        {/* NUT-008: la lectura de los reemplazos autorizados fallo. Publicar los borraria
            (la publicacion reescribe el plan completo), asi que se bloquea con reintento. */}
        {substitutionsFailed ? (
          <div
            data-testid="qe-substitutions-error"
            className="mb-2 flex flex-col gap-2 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{QE_COPY.substitutionsFailed}</p>
            </div>
            <button
              type="button"
              onClick={retrySubstitutions}
              disabled={isPending}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-control border border-amber-400 bg-surface-card px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-950/60"
            >
              <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {QE_COPY.substitutionsRetry}
            </button>
          </div>
        ) : null}
        {publishError ? (
          <button
            type="button"
            onClick={retryPublish}
            disabled={isPending}
            className="mb-2 flex w-full items-center gap-2 rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
          >
            {publishError === QE_COPY.publishFailed || publishError === QE_COPY.offline ? (
              <RefreshCcw aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0">{publishError}</span>
          </button>
        ) : null}
        {/* W3b: totales del dia activo, siempre a la vista mientras se edita. */}
        {dayTotals ? (
          <p
            className={
              'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs font-semibold tabular-nums text-body ' +
              (hasActions ? 'mb-2' : '')
            }
          >
            {dayTotals.label ? <span className="text-muted">{dayTotals.label} ·</span> : null}
            <span className="text-strong">
              {Math.round(dayTotals.calories)}
              {dayTotals.targetCalories != null ? ` / ${Math.round(dayTotals.targetCalories)}` : ''} kcal
            </span>
            <span>P {Math.round(dayTotals.proteinG)}</span>
            <span>C {Math.round(dayTotals.carbsG)}</span>
            <span>G {Math.round(dayTotals.fatsG)}</span>
          </p>
        ) : null}
        {hasActions ? (
        /* Pasada visual: en 390 px el contador se truncaba ("3 cambios sin p…") porque compartia
           fila con los dos botones — justo el feedback principal del modo edicion. Debajo de sm
           el contador toma su propia linea (mismo criterio que la barra RN, H-18/QW-12). */
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-strong" aria-live="polite">
            {dirtyLabel}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              disabled={isPending}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-border-default bg-surface-card px-3.5 text-sm font-semibold text-strong sm:flex-none transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {QE_COPY.discard}
            </button>
            <button
              type="button"
              onClick={openConfirm}
              disabled={isPending || changeCount === 0 || substitutionsFailed}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white sm:flex-none transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {ctaLabel}
            </button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  )
}
