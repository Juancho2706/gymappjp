'use client'

/**
 * Barra de publicacion sticky inferior (§1.2.C, movil-first, thumb-zone): aparece al
 * primer cambio con "{n} cambios sin publicar" + Descartar / Publicar cambios. En error
 * muestra "No se pudo publicar. Reintentar" (el draft NO se pierde; el reintento reusa la
 * misma clave de idempotencia). Safe-area inset para no chocar con el home indicator.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Loader2, LockKeyhole, RefreshCcw } from 'lucide-react'
import { MacroSparkPopover } from '@/components/nutrition-v2'
import { MACRO_META, macroPct, type MacroKey } from '@/components/nutrition/macro-tokens'
import { ImplausibleNotice } from '@/components/nutrition-v2/ImplausibleNotice'
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
  /** Metas de gramos por macro del dia (steppers de "Metas ▾"/`TargetsEditorCard`), si el coach las fijo. */
  targetProteinG: number | null
  targetCarbsG: number | null
  targetFatsG: number | null
}

/**
 * T3.v Cabina: fila macro→campo de `PublishBarDayTotals`, en el orden de pintado P·C·G
 * (mismo orden que la leyenda y que `MacroSpark`). El color del fill es SIEMPRE el token de la
 * macro — SIN semantica ok/warn nueva acá (esa vive en el anillo de la cinta, W2 EditorRibbon).
 *
 * Exportada para que la cinta (`EditorRibbon`, V2.1) pinte las MISMAS tres micro-barras con el
 * mismo mapeo: dos tablas paralelas serían dos verdades sobre qué meta le toca a cada macro.
 */
export const DAY_MACRO_ROWS: ReadonlyArray<{
  key: MacroKey
  actual: keyof Pick<PublishBarDayTotals, 'proteinG' | 'carbsG' | 'fatsG'>
  target: keyof Pick<PublishBarDayTotals, 'targetProteinG' | 'targetCarbsG' | 'targetFatsG'>
}> = [
  { key: 'protein', actual: 'proteinG', target: 'targetProteinG' },
  { key: 'carbs', actual: 'carbsG', target: 'targetCarbsG' },
  { key: 'fats', actual: 'fatsG', target: 'targetFatsG' },
]

export function PublishBar({
  dayTotals = null,
  dayWarning = null,
  hideActions = false,
  leading = null,
  validationMessage = null,
  validationAction = null,
}: {
  dayTotals?: PublishBarDayTotals | null
  /**
   * Aviso de plausibilidad del DIA activo, ya redactado por el lienzo (`dayWarningCopy`, W1.3):
   * «El día suma 4.906 kcal, 3,2× la meta de 1.556 · 2 ítems con cantidades poco plausibles».
   * La barra no lo deriva —no conoce el dia activo ni sus items— y sobre todo NO bloquea:
   * publicar sigue siendo un tap, igual que con el mismatch de Atwater. `null` = nada que decir.
   */
  dayWarning?: string | null
  /**
   * Aviso de la validacion LOCAL que corto el publish, ya redactado por la superficie que sabe
   * que dia se esta viendo (`qePublishBlockedBar`). La barra no lo deriva: en el editor unico el
   * mensaje depende del dia activo, y eso vive en el lienzo. `null` = no hay nada que avisar.
   */
  validationMessage?: string | null
  /**
   * Salida del aviso: llevar al coach al dia donde vive el error. `null` cuando los errores ya
   * estan a la vista (viven en el dia activo o fuera de los dias) — un boton que no mueve nada
   * es peor que ninguno.
   */
  validationAction?: { label: string; onClick: () => void } | null
  /**
   * Ranura al principio de la fila de totales. Existe por UNA razón: el «?» de la Guía Viva, que en
   * <1024 la SPEC ubica «flotante sobre la PublishBar, lado IZQUIERDO» (D2).
   *
   * Es una ranura y no un botón `fixed` porque D2 es un invariante BLOQUEANTE de geometría —el rect
   * del «?» no puede intersectar NINGÚN control— y un elemento flotante sobre una pantalla que
   * scrollea no lo puede garantizar: cualquier botón del lienzo termina pasando por debajo, y con
   * cambios sin publicar los CTA de esta barra ocupan el ancho completo en <640 (`flex-1`). Como
   * hijo de un flex, en cambio, la no-superposición es una propiedad del layout, no una coincidencia.
   * (Verificado: con el «?» flotante a 390 px el smoke lo cazaba encima de «Agregar grupo».)
   */
  leading?: ReactNode
  /**
   * T3.v Cabina (V2.1; umbral bajado a ≥768 en V2.5): con la cinta viva (`EditorRibbon`, compacta
   * 768–1023 / completa desde 1024) el contador, Descartar y Publicar viven ARRIBA y acá se apagan
   * para no duplicar CTAs. La barra se queda con la zona de totales del día. Los avisos de error
   * (upgrade, NUT-008, reintento de publicación) NO se apagan: la cinta no los tiene, y esconderlos
   * sí sería perder una afordancia.
   */
  hideActions?: boolean
}) {
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

  const hasActions =
    changeCount > 0 ||
    publishError !== null ||
    upgradeRequired ||
    substitutionsFailed ||
    validationMessage != null
  // Contador + Descartar + Publicar: solo cuando la cinta NO los está mostrando (ver `hideActions`).
  const showActions = hasActions && !hideActions
  // En el editor (dayTotals presente) la barra vive SIEMPRE: totales fijos abajo (W3b).
  const visible = dayTotals !== null || hasActions
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">
      <div
        data-testid="qe-publish-bar"
        /* Guía Viva, guion CORTO (<768): ahí no hay cinta, y esta barra es a la vez el «tablero de
           vuelo» (sus totales, ver más abajo) y el lugar donde se publica. El ancla de publicar va
           en la BARRA y no en el botón «Publicar cambios» porque el botón solo existe con cambios
           pendientes (`showActions`) — un coach que abre la guía sobre un plan intacto se quedaría
           sin el último paso. La barra, en el editor, está siempre.

           Condicionado a `!hideActions` para que nunca haya DOS `publicar` en pantalla: desde 768
           el ancla la lleva el botón de la cinta (`EditorRibbon`), que es donde el coach publica. */
        data-tour={hideActions ? undefined : 'publicar'}
        className="pointer-events-auto mx-auto w-full max-w-3xl rounded-card border border-border-default bg-surface-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-card/85"
      >
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
        {/* Validacion LOCAL: el publish ni siquiera salio. No es un boton de reintento (reintentar
            no arregla un dia sin comidas) sino un aviso con una salida: ir al dia culpable. Misma
            caja rosa que el error de publicacion para que el coach lea "esto bloquea" igual. */}
        {validationMessage ? (
          <div
            role="alert"
            data-testid="qe-validation-error"
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <span className="flex min-w-0 items-center gap-2">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{validationMessage}</span>
            </span>
            {validationAction ? (
              <button
                type="button"
                onClick={validationAction.onClick}
                className="inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
              >
                {validationAction.label}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        {/* W1.3 — aviso de plausibilidad del día (mockup M1). Va DEBAJO de la validación que
            bloquea y ENCIMA de los totales: es una advertencia, no un impedimento, y el coach
            tiene que leerla junto a las kcal que la provocan. */}
        {dayWarning ? (
          <ImplausibleNotice
            variant="box"
            className="mb-2 w-full"
            testId="qe-day-implausible"
            message={dayWarning}
          />
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
        {/* W3b: totales del dia activo, siempre a la vista mientras se edita.
            T3.v Cabina (V1.3): kcal "x / meta" + spark del reparto calorico del dia (popover con
            los gramos exactos) + tres micro-metas P/C/G "actual/meta" con su propia barra —
            SIN semantica ok/warn nueva, el fill es siempre el token de esa macro.
            V2.5 (contrato responsive de la SPEC, fila <768): el spark de esta barra —el
            "mini-cinta móvil" del PLAN §3, misma superficie con otro nombre— achica a `sm` bajo
            768 px; desde `md:` sigue en `md` (el tamaño que ya tenía). Dos instancias con
            visibilidad CSS por breakpoint en vez de leer el viewport por JS: cero riesgo de
            mismatch de hidratación (mismo criterio que `EditorRibbon`/`MacroSparkPopover`, que sí
            necesitan JS por el contrato de interacción, pero acá el tamaño es puro CSS. */}
        {dayTotals ? (
          <div
            /* Guía Viva, primer paso del guion corto: la «mini-cinta móvil» es este bloque de
               totales (kcal + spark + micro-metas), el equivalente exacto de lo que en ≥768 muestra
               la cinta. Mismo criterio que el ancla de publicar: solo cuando la cinta no está. */
            data-tour={hideActions ? undefined : 'ribbon'}
            className={showActions ? 'mb-2.5' : ''}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {/* La ranura y el rótulo van juntos en un grupo para que el `justify-between` de la
                  fila siga repartiendo DOS bloques (rótulo a la izquierda, spark a la derecha): con
                  el «?» suelto como tercer hijo, el reparto habría corrido las kcal al centro. Con
                  la ranura vacía este div no cambia nada de lo que ya había. */}
              <div className="flex min-w-0 items-center gap-2">
                {leading}
                <p className="min-w-0 truncate text-xs font-semibold tabular-nums text-body">
                  {dayTotals.label ? <span className="text-muted">{dayTotals.label} · </span> : null}
                  <span className="text-strong">
                    {Math.round(dayTotals.calories)}
                    {dayTotals.targetCalories != null ? ` / ${Math.round(dayTotals.targetCalories)}` : ''} kcal
                  </span>
                </p>
              </div>
              <MacroSparkPopover
                size="sm"
                className="md:hidden"
                calories={dayTotals.calories}
                proteinG={dayTotals.proteinG}
                carbsG={dayTotals.carbsG}
                fatsG={dayTotals.fatsG}
                targetCalories={dayTotals.targetCalories}
                ariaContext={dayTotals.label ?? undefined}
              />
              <MacroSparkPopover
                size="md"
                className="hidden md:inline-flex"
                calories={dayTotals.calories}
                proteinG={dayTotals.proteinG}
                carbsG={dayTotals.carbsG}
                fatsG={dayTotals.fatsG}
                targetCalories={dayTotals.targetCalories}
                ariaContext={dayTotals.label ?? undefined}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3">
              {DAY_MACRO_ROWS.map(({ key, actual, target }) => {
                const meta = MACRO_META[key]
                const actualValue = dayTotals[actual]
                const targetValue = dayTotals[target]
                const pct = targetValue != null ? macroPct(actualValue, targetValue) : 0
                return (
                  <div key={key} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span
                        className="font-mono text-[10px] font-semibold"
                        style={{ color: meta.color }}
                      >
                        {meta.short}
                      </span>
                      <span className="truncate font-mono text-[10px] font-semibold tabular-nums text-strong">
                        {Math.round(actualValue)}
                        {targetValue != null ? `/${Math.round(targetValue)}` : ''}
                      </span>
                    </div>
                    {/* Barra decorativa: los numeros de arriba ya son el texto accesible. */}
                    <div
                      aria-hidden
                      className="mt-1 flex h-1 overflow-hidden rounded-pill bg-surface-sunken"
                    >
                      <div
                        className="h-full rounded-pill"
                        style={{ width: `${pct}%`, backgroundColor: meta.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        {showActions ? (
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
