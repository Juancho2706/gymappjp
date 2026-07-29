import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
import {
  NUTRITION_WEB_TONE_CLASSES,
  createNutritionMacroValue,
  formatNutritionCalories,
  type NutritionWeekCell,
  type NutritionWeekVariantLike,
} from '@eva/nutrition-v2'
import { MacroChipRow, MacroProgress, NutritionCard } from '@/components/nutrition-v2'
import { formatRelativeDate } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import {
  formatNutritionDayAndMonth,
  resolveCoachDayAdherence,
  type CoachDayAdherence,
} from './_lib/week-nav'

/**
 * Indicador de adherencia de un día cerrado (QW-6 de la auditoría): energía consumida sobre la
 * meta CONGELADA del snapshot. Tonos semánticos del DS (nada de hex de marca) y sin `danger`:
 * el coach necesita ver el desvío, no un reproche en rojo sobre un día que ya pasó.
 */
export function DayAdherenceChip({
  adherence,
  className,
}: {
  adherence: CoachDayAdherence
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        adherence.tone === 'neutral'
          ? 'border-border-subtle bg-surface-sunken text-muted'
          : NUTRITION_WEB_TONE_CLASSES[adherence.tone],
        className,
      )}
      title="Energía consumida sobre la meta del día"
    >
      {adherence.percent} % de la meta
    </span>
  )
}

/** Variante con etiqueta visible: `plan.dayVariants[number]` del read-model la cumple. */
export type LabeledWeekVariant = NutritionWeekVariantLike & { label: string }

/** Celda de la semana tal como la compone la ficha del coach (variantes con `label`). */
export type CoachWeekCell = NutritionWeekCell<LabeledWeekVariant>

/**
 * Panel del día visto cuando NO es hoy (la ficha de hoy sigue siendo la de siempre).
 *
 * - **Pasado**: resultado congelado. Consumido vs metas del snapshot (la fila del historial
 *   siempre gana sobre la proyección del plan vigente), % de adherencia y, si el día no tuvo
 *   registro, se dice así — `consumed = null` es "sin registro", nunca "registró cero". Los días
 *   del sistema anterior (V1) se describen con sus frases legacy para no pintar "0 kcal" falsos.
 * - **Futuro**: solo el plan proyectado (`resolveNutritionDayVariantForDow`, misma regla que el
 *   snapshot congelará). Cero controles de registro y cero consumo: ese día todavía no existe.
 *   El detalle no se duplica acá: se ancla a la card de "Estructura prescrita" que ya lo pinta.
 *
 * Todo sale de datos ya descargados: este panel no pide nada (ver `_lib/week-nav.ts`).
 */
export function SelectedDayPanel({
  cell,
  todayIso,
  variantAnchorId,
}: {
  cell: CoachWeekCell
  todayIso: string
  /** Ancla de la card de la variante que aplica (solo días futuros: el pasado no se proyecta). */
  variantAnchorId?: string | null
}) {
  const isFuture = cell.state === 'future'
  const dayAndMonth = formatNutritionDayAndMonth(cell.isoDate)
  const targets = cell.targets
  const consumed = cell.consumed
  const legacyOnly = cell.legacy?.legacyOnly === true
  const adherence = isFuture
    ? null
    : resolveCoachDayAdherence(consumed?.calories ?? null, targets?.calories ?? null)
  const hasMacroTargets =
    targets != null && targets.proteinG != null && targets.carbsG != null && targets.fatsG != null
  const entryCount = cell.historyDay?.activeEntryCount ?? consumed?.entryCount ?? 0

  return (
    <NutritionCard className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-strong">{cell.longLabel}</h2>
          <p className="mt-0.5 text-xs tabular-nums text-muted">
            {dayAndMonth}
            {isFuture ? ' · aún no ocurre' : ` · ${formatRelativeDate(cell.isoDate, todayIso)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {adherence ? <DayAdherenceChip adherence={adherence} /> : null}
          {cell.isLegacy ? (
            <span className="rounded-pill border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
              Historial anterior
            </span>
          ) : null}
          <span className="rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {isFuture ? 'Vista previa' : 'Día cerrado'}
          </span>
        </div>
      </header>

      {isFuture ? (
        <div className="space-y-3">
          {cell.variant ? (
            <>
              <p className="text-sm text-body">
                Le toca <span className="font-semibold text-strong">{cell.variant.label}</span>
                {targets?.calories != null ? (
                  <span className="tabular-nums"> · {formatNutritionCalories(targets.calories)} de objetivo</span>
                ) : null}
                .
              </p>
              {targets != null ? (
                <MacroChipRow
                  calories={targets.calories}
                  carbsG={targets.carbsG}
                  fatsG={targets.fatsG}
                  per="metas del día"
                  proteinG={targets.proteinG}
                />
              ) : null}
              {variantAnchorId ? (
                <Link
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  href={`#${variantAnchorId}`}
                >
                  Ver la estructura de {cell.variant.label}
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">El plan vigente no prescribe nada para este día.</p>
          )}
          <p className="text-xs text-subtle">
            Proyección del plan vigente. El alumno solo registra el día en curso.
          </p>
        </div>
      ) : legacyOnly ? (
        <div className="space-y-1">
          {cell.legacy?.hasMacros && cell.legacy.consumed ? (
            <MacroChipRow
              calories={cell.legacy.consumed.calories}
              carbsG={cell.legacy.consumed.carbsG}
              fatsG={cell.legacy.consumed.fatsG}
              per="registrado en el sistema anterior"
              proteinG={cell.legacy.consumed.proteinG}
            />
          ) : (
            <p className="text-sm text-body">
              {cell.legacy != null && cell.legacy.completionCount > 0
                ? cell.legacy.completionsLabel
                : 'Registrado en el sistema anterior.'}
            </p>
          )}
          {cell.legacy?.mealsLabel ? (
            <p className="line-clamp-2 text-xs text-subtle">{cell.legacy.mealsLabel}</p>
          ) : null}
        </div>
      ) : consumed != null ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border-subtle pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Energía</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-strong">
                {formatNutritionCalories(consumed.calories)}
                {targets?.calories != null ? (
                  <span className="ml-1 text-sm font-medium text-muted">
                    / {formatNutritionCalories(targets.calories)}
                  </span>
                ) : null}
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted">
              {entryCount} registro{entryCount === 1 ? '' : 's'}
            </p>
          </div>
          {hasMacroTargets && targets != null ? (
            <div className="grid grid-cols-3 gap-3">
              <MacroProgress
                {...createNutritionMacroValue('protein', {
                  consumed: consumed.proteinG,
                  target: targets.proteinG ?? 0,
                })}
                compact
              />
              <MacroProgress
                {...createNutritionMacroValue('carbs', {
                  consumed: consumed.carbsG,
                  target: targets.carbsG ?? 0,
                })}
                compact
              />
              <MacroProgress
                {...createNutritionMacroValue('fats', {
                  consumed: consumed.fatsG,
                  target: targets.fatsG ?? 0,
                })}
                compact
              />
            </div>
          ) : (
            <MacroChipRow
              carbsG={consumed.carbsG}
              fatsG={consumed.fatsG}
              per="consumido"
              proteinG={consumed.proteinG}
            />
          )}
          {/* Con consumo SIEMPRE hay fila de historial, así que la fuente es el snapshot salvo
              que ese día no haya congelado metas (`targetsSource: 'none'`). */}
          <p className="text-xs text-subtle">
            {cell.targetsSource === 'snapshot'
              ? 'Metas congeladas de ese día. Los días cerrados son solo lectura.'
              : 'Ese día no dejó metas congeladas. Los días cerrados son solo lectura.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-body">Sin registro ese día.</p>
          {targets?.calories != null ? (
            <p className="text-xs tabular-nums text-muted">
              {cell.targetsSource === 'snapshot' ? 'Tenía' : 'Le correspondía'}{' '}
              {formatNutritionCalories(targets.calories)} de objetivo
              {/* La variante solo se nombra sobre una proyección: si hubo snapshot, pudo congelar
                  otra versión del plan y nombrar la variante vigente sería mentir. */}
              {cell.targetsSource === 'projected' && cell.variant != null
                ? ` · ${cell.variant.label}`
                : ''}
              .
            </p>
          ) : (
            <p className="text-xs text-muted">El plan no prescribía metas para ese día.</p>
          )}
        </div>
      )}
    </NutritionCard>
  )
}
