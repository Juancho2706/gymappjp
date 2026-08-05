'use client'

import { Plus } from 'lucide-react'
import { NutritionCard } from '@/components/nutrition-v2'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import { sortNutritionDayVariantsForDisplay } from '@eva/nutrition-v2'
import type { ExchangeMacroTotals } from '@eva/nutrition-engine'
import {
  builderDayCells,
  builderVariantForDayOfWeek,
  inheritedDayOfWeeks,
  strategyUsesSlots,
  variantEffectiveTargets,
  variantTotals,
  type BuilderState,
} from '../_lib/draft-builder'
import { genId, variantErrorsOf, type Dispatch, type SlotCopyRequest } from '../_lib/builder-view-model'
import { secondaryButtonClass } from '../_lib/builder-ui-classes'
import { combineSubtotals, derivePortionTotals, portionsKey } from './portions-state'
import type { PortionsController } from './PortionsSection'
import { PortionsDeriveCard } from './PortionsDeriveCard'
// Selector de dia (SPEC nutrition-ui-poda, punto 10): strip Lu-Do + barra de contexto. Reemplaza
// la barra de chips de variantes, el popover "Agregar dia" y la tira "Se aplica en".
import { DayPlanStrip, type DayPlanStripHandlers } from './DayPlanStrip'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { DaySummary } from './DaySummary'
import { SlotEditor } from './SlotEditor'
import { useIsTemplateMode } from './TemplateModeContext'

/**
 * Paso 2 — "Los dias" (SPEC nutrition-ui-poda, puntos 10-11): el selector de dia + las franjas
 * del dia en pantalla. Publicar vive aca (ya no hay paso "Revisar").
 *
 * "Tocas el dia, no la variante": el dia elegido (`selectedDow`) manda, y lo que se edita es la
 * variante que ESE dia recibe — la propia si la tiene, el dia base si la hereda (y la barra de
 * contexto lo dice, con el CTA para personalizarlo).
 */
export function ConstructionStep({
  state,
  clientId,
  dispatch,
  errors,
  portions,
  selectedDow,
  todayIso,
  dayHandlers,
  personalizeLocked,
  onCopySlot,
  onApplyDerivedTargets,
}: {
  state: BuilderState
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
  /** Dia en pantalla; `null` = el dia base cuando los siete dias tienen contenido propio. */
  selectedDow: number | null
  /** Fecha local del coach: solo marca "hoy" en el strip (no decide que variante aplica). */
  todayIso: string
  dayHandlers: DayPlanStripHandlers
  personalizeLocked: boolean
  onCopySlot: (request: SlotCopyRequest) => void
  /** Precarga las metas del dia base con los totales derivados de sus porciones. */
  onApplyDerivedTargets: (totals: ExchangeMacroTotals) => void
}) {
  // Modo plantilla: no hay nada que publicar, asi que el cierre del plan flexible no puede
  // prometerlo.
  const templateMode = useIsTemplateMode()
  // El dia en pantalla resuelve a UNA variante (regla del snapshot); los totales, el resumen
  // lateral y las porciones son de ella.
  const variant = builderVariantForDayOfWeek(state, selectedDow)
  // "Total del dia" = items fijos + porciones a eleccion de TODAS las franjas vivas del dia
  // (paridad con RN y con el subtotal de cada franja). Antes solo sumaba items: la misma
  // pantalla mostraba "Subtotal franja 620 kcal" y "Total del dia 180 kcal" (queja del coach).
  const portionDay = portions.groups
    ? derivePortionTotals(
        variant.slots.map((slot) => portionsKey(variant.key, slot.key)),
        portions.bySlot,
        portions.groups,
      )
    : null
  const totals = combineSubtotals(variantTotals(variant), portionDay)
  // "Restan del día" de la barra viva del picker de alimentos: metas EFECTIVAS del día en
  // pantalla (propias o heredadas del base) menos lo que ya lleva. Sin metas cargadas viaja
  // `null` y el picker no inventa un restante.
  const effectiveTargets = variantEffectiveTargets(state, variant)
  const targetCalories = Number(effectiveTargets.calories.trim())
  const targetProtein = Number(effectiveTargets.proteinG.trim())
  const dayRemaining =
    effectiveTargets.calories.trim() !== '' &&
    Number.isFinite(targetCalories) &&
    Number.isFinite(targetProtein)
      ? { calories: targetCalories - totals.calories, proteinG: targetProtein - totals.proteinG }
      : null
  // kcal por dia para las celdas del strip (items + porciones, mismo criterio que el total del
  // dia y que el subtotal de cada franja: el strip nunca contradice al editor).
  const kcalByVariantKey: Record<string, number> = {}
  const portionsByVariantKey: Record<string, number> = {}
  for (const v of state.variants) {
    const keys = v.slots.map((slot) => portionsKey(v.key, slot.key))
    const vPortions = portions.groups ? derivePortionTotals(keys, portions.bySlot, portions.groups) : null
    kcalByVariantKey[v.key] = combineSubtotals(variantTotals(v), vPortions).calories
    portionsByVariantKey[v.key] = keys.reduce(
      (total, key) => total + (portions.bySlot[key] ?? []).reduce((sum, target) => sum + (target.portions ?? 0), 0),
      0,
    )
  }
  const cells = builderDayCells(state, { kcalByVariantKey, portionsByVariantKey, todayIso })
  const inheritedDays = inheritedDayOfWeeks(state)
  const slotsError = errors['variant.' + variant.key + '.slots'] ?? errors.slots
  // P2-1: qué día tiene el problema, y un atajo para saltar ahí. Con un solo día del plan el
  // aviso sigue siendo el texto de siempre (no hay a dónde saltar).
  const dayErrors = variantErrorsOf(state, errors)
  const daysWithErrors = sortNutritionDayVariantsForDisplay(state.variants).filter(
    (candidate) => dayErrors[candidate.key],
  )
  const showDayErrorNav = state.variants.length > 1 && daysWithErrors.length > 0
  if (!strategyUsesSlots(state.strategy)) {
    return (
      <NutritionCard tone="neutral">
        <p className="text-sm text-body">
          Los planes flexibles no definen franjas ni alimentos prescritos: el alumno registra libremente contra las
          metas del paso anterior. {templateMode ? 'Ya puedes guardar la plantilla.' : 'Ya puedes publicar.'}
        </p>
      </NutritionCard>
    )
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* Selector de dia: strip Lu-Do + barra de contexto (que se edita y a quien le llega). */}
        <DayPlanStrip
          state={state}
          cells={cells}
          selectedDow={selectedDow}
          inheritedDays={inheritedDays}
          selectedKcal={totals.calories}
          personalizeLocked={personalizeLocked}
          errorByVariantKey={dayErrors}
          handlers={dayHandlers}
        />
        {showDayErrorNav ? (
          <div
            role="alert"
            className="rounded-control border border-rose-300 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/40"
          >
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {daysWithErrors.length === 1 ? 'Revisa este día antes de publicar:' : 'Revisa estos días antes de publicar:'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {daysWithErrors.map((candidate) => (
                <li key={candidate.key}>
                  <button
                    type="button"
                    onClick={() => dayHandlers.onSelectVariant(candidate.key)}
                    className="inline-flex min-h-9 w-full items-center gap-1.5 rounded-control px-1 text-left text-xs text-rose-700 transition-colors hover:bg-rose-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <span className="font-semibold underline underline-offset-2">
                      {candidate.isDefault ? 'Día base' : candidate.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{dayErrors[candidate.key]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : slotsError ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">{slotsError}</p>
        ) : null}
        {variant.slots.map((slot) => (
          <SlotEditor
            key={slot.key}
            slot={slot}
            variantKey={variant.key}
            variants={state.variants}
            clientId={clientId}
            dispatch={dispatch}
            errors={errors}
            portions={portions}
            dayRemaining={dayRemaining}
            onCopySlot={onCopySlot}
          />
        ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SLOT', variantKey: variant.key, key: genId() })}
          className={secondaryButtonClass + ' border-dashed px-4'}
        >
          <Plus className="h-4 w-4" />
          Agregar franja
        </button>

        {/* "Usar como objetivos" (SPEC UX-a / R6): vive PEGADA al total del dia base, que es
            donde las porciones ya existen — en el paso anterior nunca podia aparecer en la
            primera pasada del coach (hallazgo 7 de la auditoria). Deriva del dia base, asi que
            solo se monta con el dia base en pantalla; precarga las metas del paso "El plan". */}
        {variant.isDefault ? (
          <PortionsDeriveCard
            liveSlotKeys={variant.slots.map((slot) => portionsKey(variant.key, slot.key))}
            controller={portions}
            onApply={onApplyDerivedTargets}
          />
        ) : null}

        {/* En movil (<md) la capsula de navegacion del coach flota fija abajo (z-50,
            ~62px + 16px de aire + safe-area): sin este offset la tapaba por completo
            (QA CEO 08-04). En md+ la capsula no existe y el total vuelve a bottom-0. */}
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-default bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface-card/80 md:bottom-0 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {variant.isDefault ? 'Total del día base' : 'Total de ' + variant.label}
          </span>
          <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
          {portionDay ? (
            <p className="w-full text-xs text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionDay.calories)))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="lg:sticky lg:top-6">
          <DaySummary state={state} variant={variant} totals={totals} portions={portions} />
        </div>
      </div>
    </div>
  )
}
