'use client'

/**
 * Vista del modo edicion in-place (§1.2.B): overlay a pantalla completa sobre la ficha
 * (misma ruta, estado cliente). Movil-first: header compacto sticky, cards editables,
 * barra de publicacion en la thumb-zone. Plan flexible sin franjas → SOLO la card de
 * metas (targets-only, F1 #6). Estrategia, notas y permisos quedan read-only con hint
 * (F1 §1.2.B.4). Light/dark y white-label via tokens del DS.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CopyPlus,
  History,
  Info,
  MoreVertical,
  NotebookPen,
  PencilLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  NUTRITION_WEEK_ORDER,
  formatNutritionDayOfWeek,
  resolveNutritionDayVariantForDate,
  sortNutritionDayVariantsForDisplay,
} from '@eva/nutrition-v2'
import { DayVariantWeekStrip, StrategyBadge } from '@/components/nutrition-v2'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { EditorMetaCard } from './EditorMetaCard'
import { AddDayPopover } from '../builder/_components/AddDayPopover'
import { COPY_PRESETS, daysForCopyPreset } from '../builder/_lib/copy-presets'
import {
  NEXT_DAYS_QUICK_PICKS,
  copyPlanWarning,
  nextDaysFrom,
  planCopy,
  type CopyMode,
} from '../builder/_lib/copy-plan'
import { MAX_DAY_VARIANTS } from '../builder/_lib/draft-builder'
import { QeBottomSheet } from './QeBottomSheet'
import { EditableSlotCard } from './EditableSlotCard'
import { TargetsEditorCard } from './TargetsEditorCard'
import { PublishBar } from './PublishBar'
import { PublishConfirmSheet } from './PublishConfirmSheet'
import { StaleBaseDialog } from './StaleBaseDialog'
import {
  buildDayVariantKey,
  defaultQeVariant,
  qeDaysMissingBasePortions,
  qeVariantTotalWithPortions,
  takenDayVariantDows,
  VARIANT_LABEL_MAX,
  type QeVariant,
} from './quick-edit-state'
import { EditorPalette } from './EditorPalette'
import type { PublishBarDayTotals } from './PublishBar'
import { QE_COPY } from './microcopy'

/**
 * Id del bloque de un dia dentro del overlay: destino de las anclas del indice (P1-1). Se
 * deriva de la POSICION y no de `variant.key` (las keys del estado son uuid/claves libres,
 * no ids de DOM seguros); el indice y la pila se pintan del mismo arreglo ordenado.
 */
function qeDaySectionId(index: number): string {
  return `qe-day-section-${index}`
}

export function QuickEditPlanView() {
  const {
    state,
    dispatch,
    clientName,
    today,
    strategy,
    protocolNotes,
    permissions,
    errors,
    showErrors,
    isPending,
    requestExit,
    pendingRestore,
    restoreDraft,
    dismissRestore,
    exchangeGroups,
    surface,
  } = useQuickEdit()
  const usesSlots = strategy === 'structured' || strategy === 'hybrid'
  // T3.2b: en plantilla el "cliente" es un relleno — el titulo sale del nombre de la
  // plantilla (vivo, editable en la cabecera) y el banner recuerda que nada llega a nadie.
  const isTemplate = surface === 'template'
  const overlayTitle = isTemplate
    ? state.meta?.name.trim() || QE_COPY.templateUntitled
    : clientName
  const overlayEyebrow = isTemplate ? QE_COPY.templateEyebrow : QE_COPY.enter
  // FD5: orden de lectura del multi-dia (base primero, luego Lu→Do). El estado conserva el
  // orden de alta; la presentacion usa el MISMO helper que la ficha y el alumno.
  const orderedVariants = useMemo(() => sortNutritionDayVariantsForDisplay(state.variants), [state.variants])
  const multiDay = orderedVariants.length > 1
  // Dia del plan que aplica HOY (misma regla que el snapshot del alumno): el indice lo marca
  // con anillo para que el coach entre orientado.
  const todayVariantKey = useMemo(
    () => resolveNutritionDayVariantForDate(orderedVariants, today)?.key ?? null,
    [orderedVariants, today],
  )

  // ── W3b (solo editor, `state.meta`): capsula de DIA ACTIVO — se edita un dia a la vez.
  // El quick-edit clasico conserva la pila completa con anclas (cero cambios de comportamiento).
  const isEditor = state.meta !== undefined
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null)
  // Fallback en cadena: eleccion del coach → dia que aplica HOY → primero en orden de lectura.
  // Si el dia activo se elimina, la cadena resuelve sola al siguiente.
  const activeVariant = useMemo(() => {
    if (!isEditor) return null
    return (
      orderedVariants.find((variant) => variant.key === activeDayKey) ??
      orderedVariants.find((variant) => variant.key === todayVariantKey) ??
      orderedVariants[0] ??
      null
    )
  }, [isEditor, orderedVariants, activeDayKey, todayVariantKey])
  const visibleVariants = isEditor && activeVariant ? [activeVariant] : orderedVariants
  // Totales EN VIVO del dia activo (items + porciones) para la barra fija de abajo.
  const dayTotals = useMemo((): PublishBarDayTotals | null => {
    if (!activeVariant) return null
    const totals = qeVariantTotalWithPortions(activeVariant, exchangeGroups)
    const target = Number(activeVariant.targets.calories.trim())
    return {
      label: multiDay ? activeVariant.label : null,
      calories: totals.calories,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatsG: totals.fatsG,
      targetCalories: Number.isFinite(target) && target > 0 ? target : null,
    }
  }, [activeVariant, exchangeGroups, multiDay])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${overlayEyebrow}: ${overlayTitle}`}
      aria-busy={isPending}
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface-app"
    >
      {/* Header compacto sticky: salir + titulo. */}
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface-app/95 backdrop-blur supports-[backdrop-filter]:bg-surface-app/85">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-3 py-2 pt-[max(env(safe-area-inset-top,0px),0.5rem)]">
          <button
            type="button"
            aria-label="Salir del modo edición"
            onClick={requestExit}
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-strong transition-colors hover:bg-surface-card active:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-primary">
              {overlayEyebrow}
            </p>
            <h1 className="truncate font-display text-lg font-bold leading-tight tracking-[-0.02em] text-strong">
              {overlayTitle}
            </h1>
          </div>
          <div className="shrink-0">
            <StrategyBadge strategy={strategy} compact />
          </div>
        </div>
      </header>

      <div
        className={
          'mx-auto w-full px-3 py-4 ' +
          // W3b: en el editor desktop el lienzo convive con la paleta lateral (grid 2 col).
          (isEditor ? 'max-w-3xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 ' : 'max-w-3xl ') +
          (isPending ? 'pointer-events-none opacity-70' : '')
        }
      >
        <div className="min-w-0 space-y-4">
        {/* Respaldo local: hay un borrador de una sesion anterior (mismo plan/version) sin publicar. */}
        {pendingRestore ? (
          <div className="animate-in slide-in-from-top-1 rounded-card border border-primary/25 bg-primary/10 p-3">
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <History aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
              <p className="flex-1 text-xs font-semibold leading-5 text-primary">{QE_COPY.restoreBanner}</p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="inline-flex h-8 items-center justify-center rounded-control bg-primary/100 px-3 text-xs font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {QE_COPY.restoreCta}
                </button>
                <button
                  type="button"
                  onClick={dismissRestore}
                  aria-label={QE_COPY.restoreDismiss}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* T3.2b: recordatorio permanente del modo plantilla (lo que confundio al coach JP,
            2026-08-11 — esta pantalla es casi identica a editar el plan de un alumno). */}
        {isTemplate ? (
          <div className="rounded-card border border-primary/25 bg-primary/10 px-3 py-2">
            <p className="text-xs font-semibold leading-relaxed text-primary">{QE_COPY.templateBanner}</p>
          </div>
        ) : null}

        {/* Editor unico (T3.x): cabecera de metadatos del plan. Solo existe con `state.meta`
            (ruta /editor); en el quick-edit clasico este bloque no se pinta. */}
        {state.meta ? <EditorMetaCard /> : null}

        {/* Capsula de dia activo (W3b, editor): UN dia a la vez; los chips CAMBIAN el dia en
            edicion. Clasico: indice de anclas de siempre (P1-1) sobre la pila completa. */}
        {isEditor && multiDay && activeVariant ? (
          <EditorDayCapsule
            variants={orderedVariants}
            activeKey={activeVariant.key}
            todayVariantKey={todayVariantKey}
            onSelect={setActiveDayKey}
          />
        ) : null}
        {!isEditor && multiDay ? (
          <DayAnchorNav variants={orderedVariants} todayVariantKey={todayVariantKey} />
        ) : null}

        {visibleVariants.map((variant, dayIndex) => (
          // `scroll-mt-20` deja el título del día por debajo del header sticky al saltar acá.
          <section key={variant.key} id={qeDaySectionId(dayIndex)} className="scroll-mt-20 space-y-4">
            {/* En el editor el encabezado del dia vive SIEMPRE (su menu: duplicar/copiar/
                renombrar); en el clasico solo con multi-dia, como siempre. */}
            {multiDay || isEditor ? <DayVariantHeader variant={variant} /> : null}
            <TargetsEditorCard variant={variant} />
            {usesSlots || variant.slots.length > 0 ? (
              <>
                {variant.slots.map((slot, index) => (
                  <EditableSlotCard key={slot.key} variantKey={variant.key} slot={slot} index={index} />
                ))}
                {/* Día sin ninguna comida: el servidor lo rechaza y hasta ahora eso llegaba como
                    "No se pudo publicar" a secas. Se marca el día culpable tras el intento. */}
                {showErrors && errors[`variant.${variant.key}.slots`] ? (
                  <p
                    role="alert"
                    className="rounded-control border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm font-semibold leading-6 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    {errors[`variant.${variant.key}.slots`]}
                  </p>
                ) : null}
                <AddSlotButton variantKey={variant.key} />
              </>
            ) : (
              <p className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-body">
                <Info aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted" />
                {QE_COPY.flexibleTargetsOnly}
              </p>
            )}
          </section>
        ))}

        {/* FD5: "+ Agregar día" al final de la lista de días (multi-select Lu-Do + origen). */}
        <AddDayButton />

        {/* Defecto B4: las porciones se quedaron solo en el día base (con un día no aplica). */}
        {multiDay ? <PortionsDayGapNotice /> : null}

        {/* Notas visibles EDITABLES (visible_notes); permisos siguen read-only con hint. */}
        <section className="rounded-card border border-border-subtle bg-surface-card p-4">
          <div className="flex items-center gap-2">
            <NotebookPen aria-hidden="true" className="h-4 w-4 text-muted" />
            <h2 className="font-display text-base font-semibold text-strong">Notas y permisos</h2>
          </div>
          <label htmlFor="qe-visible-notes" className="mt-3 block text-xs font-semibold text-muted">
            {QE_COPY.notesLabel}
          </label>
          <textarea
            id="qe-visible-notes"
            value={state.visibleNotes}
            onChange={(event) => dispatch({ type: 'SET_VISIBLE_NOTES', value: event.target.value })}
            placeholder={QE_COPY.notesPlaceholder}
            rows={5}
            maxLength={8000}
            disabled={isPending}
            aria-invalid={showErrors && Boolean(errors['plan.visibleNotes'])}
            className="mt-1.5 w-full resize-y rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {showErrors && errors['plan.visibleNotes'] ? (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors['plan.visibleNotes']}</p>
          ) : null}
          {protocolNotes ? (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted">{protocolNotes}</p>
          ) : null}
          {/* En el editor unico los permisos son EDITABLES en la cabecera (EditorMetaCard);
              repetir aca los chips read-only pareceria un bug. Solo quick-edit clasico. */}
          {state.meta ? null : (
            <>
              <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                {/*
                  "Puede sustituir" (`canSubstitute`) NO se pinta: desde T2.4 no lo lee ningun camino
                  de autorizacion, y desde T2.5 el intercambio dentro del grupo es equivalencia
                  nutricional, no un permiso. Mostrarlo le decia al coach que habia bloqueado algo que
                  nunca estuvo bloqueado. El veto real por alimento es `exchange_group_foods.is_excluded`.
                  Decision D4, `docs/specs/nutrition-exchange-swap/SPEC.md`.
                */}
                {(
                  [
                    [permissions.canRegisterFreely, 'Registro libre'],
                    [permissions.canAdjustPrescribedQuantity, 'Ajusta cantidades'],
                  ] as const
                ).map(([enabled, label]) => (
                  <li
                    key={label}
                    className={
                      'rounded-pill border px-2 py-0.5 ' +
                      (enabled
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border-subtle bg-surface-sunken text-muted')
                    }
                  >
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted">
                <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {QE_COPY.readonlyHint}
              </p>
            </>
          )}
        </section>

        {/* Espacio para que la barra sticky no tape la ultima card. */}
        <div aria-hidden="true" className="h-24" />
        </div>

        {/* Paleta lateral (W3b, editor desktop): picker siempre a la vista sobre el dia activo. */}
        {isEditor && activeVariant ? <EditorPalette variant={activeVariant} /> : null}
      </div>

      <PublishBar dayTotals={dayTotals} />
      <PublishConfirmSheet />
      <StaleBaseDialog />
    </div>
  )
}

/**
 * Índice de días (P1-1): fila de anclas arriba de la pila para saltar a un día sin scrollear
 * a ciegas. NO reestructura el overlay (la convergencia a "un día activo" es de otra ola):
 * solo mueve el scroll del propio overlay con `scrollIntoView`, y cada bloque de día lleva
 * `scroll-mt` para no quedar tapado por el header sticky.
 *
 * Cada chip lleva la inicial del día (o "Base") + la etiqueta libre del coach truncada, así
 * que sirve igual con nombres tipo "Día de entrenamiento". El día que aplica HOY va con
 * anillo de acento, mismo patrón que `DayVariantWeekStrip` y `WeekDayNav`.
 */
/**
 * Capsula de DIA ACTIVO (W3b, solo editor): mismos chips del indice, pero en vez de scrollear
 * la pila CAMBIAN que dia se edita (un dia a la vez). El dia que aplica HOY conserva su anillo.
 */
function EditorDayCapsule({
  variants,
  activeKey,
  todayVariantKey,
  onSelect,
}: {
  variants: readonly QeVariant[]
  activeKey: string
  todayVariantKey: string | null
  onSelect: (key: string) => void
}) {
  return (
    <nav aria-label={QE_COPY.daySwitcherLabel} className="-mx-3 overflow-x-auto px-3 pb-1">
      <ul className="flex w-max min-w-full items-center gap-1.5">
        {variants.map((variant) => {
          const isActive = variant.key === activeKey
          const isToday = todayVariantKey != null && variant.key === todayVariantKey
          const short = variant.isDefault
            ? QE_COPY.baseDayShort
            : formatNutritionDayOfWeek(variant.dayOfWeek, { short: true })
          return (
            <li key={variant.key}>
              <button
                type="button"
                aria-pressed={isActive}
                aria-label={variant.label + (isToday ? ` — ${QE_COPY.dayAppliesToday}` : '')}
                title={variant.label}
                onClick={() => onSelect(variant.key)}
                className={
                  'inline-flex min-h-11 max-w-[13rem] items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isActive
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border-subtle bg-surface-card text-body hover:bg-surface-sunken hover:text-strong') +
                  (isToday && !isActive ? ' ring-1 ring-primary/60' : '')
                }
              >
                {short ? (
                  <span
                    className={
                      'shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ' +
                      (isActive ? 'text-primary' : 'text-primary')
                    }
                  >
                    {short}
                  </span>
                ) : null}
                <span className="truncate">{variant.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function DayAnchorNav({
  variants,
  todayVariantKey,
}: {
  variants: readonly QeVariant[]
  todayVariantKey: string | null
}) {
  return (
    <nav aria-label={QE_COPY.dayIndexLabel} className="-mx-3 overflow-x-auto px-3 pb-1">
      <ul className="flex w-max min-w-full items-center gap-1.5">
        {variants.map((variant, index) => {
          const isToday = todayVariantKey != null && variant.key === todayVariantKey
          // Sin dia fijo y sin ser la base (dato invalido, tolerado en lectura) el chip se
          // queda solo con la etiqueta: no se inventa un dia de semana.
          const short = variant.isDefault
            ? QE_COPY.baseDayShort
            : formatNutritionDayOfWeek(variant.dayOfWeek, { short: true })
          return (
            <li key={variant.key}>
              <button
                type="button"
                aria-controls={qeDaySectionId(index)}
                aria-label={
                  QE_COPY.dayIndexJump(variant.label) + (isToday ? ` — ${QE_COPY.dayAppliesToday}` : '')
                }
                title={variant.label}
                onClick={() =>
                  document
                    .getElementById(qeDaySectionId(index))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className={
                  'inline-flex min-h-11 max-w-[13rem] items-center gap-1.5 rounded-pill border bg-surface-card px-3 text-xs font-semibold text-body transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isToday ? 'border-primary/40 ring-1 ring-primary/60' : 'border-border-subtle')
                }
              >
                {short ? (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                    {short}
                  </span>
                ) : null}
                <span className="truncate">{variant.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Tira Lu-Do seleccionable. `taken` = dias que YA tienen plan propio (deshabilitados, salvo
 * el dia actual de la variante que se esta cambiando, que se muestra como seleccionado).
 */
function DayPicker({
  selected,
  taken,
  onToggle,
}: {
  selected: readonly number[]
  taken: ReadonlySet<number>
  onToggle: (dayOfWeek: number) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
        const isSelected = selected.includes(dayOfWeek)
        const isTaken = taken.has(dayOfWeek) && !isSelected
        return (
          <button
            key={dayOfWeek}
            type="button"
            disabled={isTaken}
            aria-pressed={isSelected}
            aria-label={
              formatNutritionDayOfWeek(dayOfWeek) + (isTaken ? ` — ${QE_COPY.dayTaken}` : '')
            }
            title={isTaken ? QE_COPY.dayTaken : undefined}
            onClick={() => onToggle(dayOfWeek)}
            className={
              'min-h-11 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (isSelected
                ? 'border-primary bg-primary/15 text-primary'
                : isTaken
                  ? 'cursor-not-allowed border-border-subtle bg-surface-sunken text-muted opacity-60'
                  : 'border-border-default bg-surface-card text-strong hover:bg-surface-sunken')
            }
          >
            {formatNutritionDayOfWeek(dayOfWeek, { short: true })}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Encabezado de un dia del plan (FD5): etiqueta + tira Lu-Do read-only + menu (Cambiar día /
 * Renombrar / Eliminar). El dia base es intocable — no cambia de dia ni se elimina — asi que
 * solo ofrece renombrar.
 *
 * QW-4 / P1-2: la tira Lu-Do es la MISMA de la ficha, el builder y el alumno. Sin ella, con
 * etiquetas libres ("Día de entrenamiento", "Descarga"), el coach no podia saber que dia de
 * la semana estaba editando sin abrir "Cambiar día".
 */
function DayVariantHeader({ variant }: { variant: QeVariant }) {
  const { state, dispatch, isPending, errors, showErrors, today } = useQuickEdit()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(variant.label)
  const labelError = showErrors ? errors[`variant.${variant.key}.label`] : undefined
  const taken = takenDayVariantDows(state)
  // W2 (solo editor unico): duplicar ESTE dia —con sus metas y franjas— como otro dia.
  const canDuplicate = state.meta !== undefined

  function openRename() {
    setNameDraft(variant.label)
    setMenuOpen(false)
    setRenameOpen(true)
  }

  function handleRename() {
    if (nameDraft.trim().length === 0) return
    dispatch({ type: 'SET_VARIANT_LABEL', variantKey: variant.key, value: nameDraft.trim() })
    setRenameOpen(false)
  }

  function handlePickDay(dayOfWeek: number) {
    dispatch({ type: 'SET_VARIANT_DAY', variantKey: variant.key, dayOfWeek })
    setDayOpen(false)
  }

  /** Duplica este dia como `dayOfWeek`; el Deshacer elimina el dia recien creado. */
  function handleDuplicateAs(dayOfWeek: number) {
    const variantKey = buildDayVariantKey(
      new Set(state.variants.map((candidate) => candidate.variantKey)),
      dayOfWeek,
    )
    setDuplicateOpen(false)
    dispatch({ type: 'DUPLICATE_VARIANT_AS', sourceVariantKey: variant.key, dayOfWeek, variantKey })
    toast(QE_COPY.duplicateDayDone(formatNutritionDayOfWeek(dayOfWeek) ?? 'otro día'), {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'REMOVE_VARIANT', variantKey }),
      },
    })
  }

  function handleRemove() {
    const index = state.variants.findIndex((candidate) => candidate.key === variant.key)
    if (index < 0) return
    const removed = state.variants[index]
    setMenuOpen(false)
    dispatch({ type: 'REMOVE_VARIANT', variantKey: variant.key })
    toast(QE_COPY.dayRemovedUndo, {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_VARIANT', index, variant: removed }),
      },
    })
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-muted">
            {variant.isDefault ? QE_COPY.baseDayEyebrow : QE_COPY.specificDayEyebrow}
          </p>
          <h2 className="truncate font-display text-base font-semibold text-strong">{variant.label}</h2>
          {variant.isDefault ? (
            <p className="mt-0.5 text-xs leading-5 text-muted">{QE_COPY.baseDayHint}</p>
          ) : null}
          {labelError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{labelError}</p> : null}
        </div>
        <button
          type="button"
          aria-label={QE_COPY.dayMenu(variant.label)}
          disabled={isPending}
          onClick={() => setMenuOpen(true)}
          className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <MoreVertical aria-hidden="true" className="mx-auto h-4 w-4" />
        </button>
      </div>

      {/* QW-4: qué días de la semana cubre ESTE bloque (read-only, hoy con anillo). */}
      <DayVariantWeekStrip variants={state.variants} variant={variant} todayIso={today} />

      <QeBottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={variant.label}>
        {!variant.isDefault ? (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setDayOpen(true)
            }}
            className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.changeDay}
          </button>
        ) : null}
        {canDuplicate ? (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setDuplicateOpen(true)
            }}
            className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CopyPlus aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.duplicateDay}
          </button>
        ) : null}
        {canDuplicate && variant.slots.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setCopyOpen(true)
            }}
            className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarRange aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.copyDayMenu}
          </button>
        ) : null}
        <button
          type="button"
          onClick={openRename}
          className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PencilLine aria-hidden="true" className="h-4 w-4 text-muted" />
          {QE_COPY.renameDay}
        </button>
        {!variant.isDefault ? (
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-rose-300 bg-surface-card px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {QE_COPY.removeDay}
          </button>
        ) : null}
        {variant.isDefault ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-muted">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {QE_COPY.baseDayHint}
          </p>
        ) : null}
      </QeBottomSheet>

      <QeBottomSheet open={dayOpen} onOpenChange={setDayOpen} title={QE_COPY.changeDayTitle}>
        <p className="text-xs leading-5 text-muted">{QE_COPY.changeDayHint}</p>
        <DayPicker
          selected={variant.dayOfWeek == null ? [] : [variant.dayOfWeek]}
          taken={taken}
          onToggle={handlePickDay}
        />
      </QeBottomSheet>

      {canDuplicate ? (
        <QeBottomSheet open={duplicateOpen} onOpenChange={setDuplicateOpen} title={QE_COPY.duplicateDayTitle}>
          <p className="text-xs leading-5 text-muted">{QE_COPY.duplicateDayHint}</p>
          <DayPicker selected={[]} taken={taken} onToggle={handleDuplicateAs} />
        </QeBottomSheet>
      ) : null}

      {canDuplicate ? (
        <EditorCopyDaySheet variant={variant} open={copyOpen} onOpenChange={setCopyOpen} />
      ) : null}

      <QeBottomSheet open={renameOpen} onOpenChange={setRenameOpen} title={QE_COPY.renameDayTitle}>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor={`qe-day-name-${variant.key}`}>
            {QE_COPY.dayNameLabel}
          </label>
          <input
            id={`qe-day-name-${variant.key}`}
            value={nameDraft}
            maxLength={VARIANT_LABEL_MAX}
            placeholder={QE_COPY.dayNamePlaceholder}
            onChange={(event) => setNameDraft(event.target.value)}
            className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleRename}
          disabled={nameDraft.trim().length === 0}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {QE_COPY.renameDay}
        </button>
      </QeBottomSheet>
    </div>
  )
}

/**
 * "+ Agregar día" (FD5): REUSA el `AddDayPopover` del builder multi-día (popover en desktop
 * / bottom sheet en móvil, multi-select Lu-Do con los días ocupados deshabilitados y origen
 * copiar-el-base / vacío). El import es limpio — el componente solo recibe props y no
 * conoce el estado del builder — así que ambas superficies comparten UNA afordancia.
 *
 * Gate Pro: `locked` pinta candado + upsell en vez del selector. La barrera REAL es el
 * servidor (`multi_variant` → UPGRADE_REQUIRED al publicar); esto solo evita el viaje.
 */
function AddDayButton() {
  const { state, dispatch, hasNutritionPro } = useQuickEdit()
  const takenDays = useMemo(() => [...takenDayVariantDows(state)], [state])
  const base = useMemo(() => defaultQeVariant(state), [state])

  return (
    <div className="flex justify-center">
      <AddDayPopover
        takenDays={takenDays}
        canCopyBase={(base?.slots.length ?? 0) > 0}
        locked={!hasNutritionPro}
        onCreate={(days, origin) =>
          dispatch({ type: 'ADD_VARIANT', days, source: origin === 'copy-base' ? 'clone' : 'empty' })
        }
      />
    </div>
  )
}

/**
 * Aviso "tus porciones se quedaron en el día base" (defecto B4), hermano del que ya pinta el
 * builder. Las porciones pertenecen a la franja de UN día: el coach las carga en el base,
 * agrega días con "+ Agregar día" y publica sin que nada le diga que esos días no las
 * heredaron — el alumno no ve ninguna. "Aplicar a todos los días" las baja franja homónima
 * por franja homónima (`APPLY_BASE_PORTIONS`), sin pisar las que el día ya tenga.
 *
 * Un día SIN franjas homónimas (`unmatched`) no se arregla copiando: se nombra aparte porque
 * ahí el alumno ve el día entero vacío, no solo sin porciones.
 */
function PortionsDayGapNotice() {
  const { state, dispatch, isPending } = useQuickEdit()
  const gaps = useMemo(() => qeDaysMissingBasePortions(state.variants), [state.variants])
  if (gaps.length === 0) return null

  const copiables = gaps.filter((gap) => gap.slotKeyPairs.length > 0)
  const sinFranjas = gaps.filter((gap) => gap.unmatched)
  const labelsOf = (list: typeof gaps) =>
    list
      .map((gap) => state.variants.find((variant) => variant.key === gap.variantKey)?.label ?? 'ese día')
      .join(', ')

  return (
    <div
      role="status"
      className="rounded-card border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{QE_COPY.portionsGapTitle}</p>
          {copiables.length > 0 ? (
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              {QE_COPY.portionsGapDays(labelsOf(copiables), copiables.length)}
            </p>
          ) : null}
          {sinFranjas.length > 0 ? (
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              {QE_COPY.portionsGapUnmatched(labelsOf(sinFranjas), sinFranjas.length)}
            </p>
          ) : null}
          {copiables.length > 0 ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                dispatch({ type: 'APPLY_BASE_PORTIONS' })
                toast(QE_COPY.portionsGapApplied, { duration: 4000 })
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-amber-400/70 bg-white/70 px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200"
            >
              {QE_COPY.portionsGapApply}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** "+ Agregar franja" (§1.2.B.2): nombre + hora en un bottom sheet. */
function AddSlotButton({ variantKey }: { variantKey: string }) {
  const { dispatch, isPending } = useQuickEdit()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setStartTime('')
    }
    setOpen(next)
  }

  function handleAdd() {
    if (name.trim().length === 0) return
    dispatch({ type: 'ADD_SLOT', variantKey, key: genQuickEditKey(), name: name.trim(), startTime })
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleOpenChange(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
        {QE_COPY.addSlot}
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-lg font-semibold normal-case tracking-tight text-strong">
              {QE_COPY.addSlot}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="qe-new-slot-name">
                Nombre de la franja
              </label>
              <input
                id="qe-new-slot-name"
                value={name}
                placeholder="Colación, Cena..."
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="qe-new-slot-time">
                Hora (opcional)
              </label>
              <input
                id="qe-new-slot-time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={name.trim().length === 0}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {QE_COPY.addSlot}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * W3a (editor unico): copiar UN dia a varios dias en un gesto — T2.6 F2 con quick-select
 * (presets con nombre + "proximos N") y modo Reemplazar/Sumar (D2). Toda la descripcion
 * previa sale de los modulos PUROS del wizard (`copy-presets` / `copy-plan`): el aviso dice
 * exactamente que se pisa, que se suma y que nombres quedan duplicados ANTES de confirmar.
 * La ejecucion es UNA accion atomica (`COPY_VARIANT_TO_DAYS`); Deshacer repone el arbol
 * previo completo (`RESTORE_DRAFT`).
 */
function EditorCopyDaySheet({
  variant,
  open,
  onOpenChange,
}: {
  variant: QeVariant
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch, isPending } = useQuickEdit()
  const [mode, setMode] = useState<CopyMode>('replace')
  const [selected, setSelected] = useState<number[]>([])

  const takenDows = takenDayVariantDows(state)
  const sourceDow = variant.dayOfWeek

  function toggleDay(dayOfWeek: number) {
    setSelected((prev) =>
      prev.includes(dayOfWeek) ? prev.filter((day) => day !== dayOfWeek) : [...prev, dayOfWeek],
    )
  }

  /** Chips de seleccion rapida: fijan la seleccion completa (mismo criterio que el wizard). */
  function applyDays(days: readonly number[]) {
    setSelected(days.filter((day) => day !== sourceDow))
  }

  const occupantByDay = new Map<number, QeVariant>()
  for (const candidate of state.variants) {
    if (!candidate.isDefault && candidate.dayOfWeek != null) occupantByDay.set(candidate.dayOfWeek, candidate)
  }

  const plan = planCopy({
    mode,
    sourceSlotNames: variant.slots.map((slot) => slot.name),
    destinations: selected.map((dayOfWeek) => {
      const occupant = occupantByDay.get(dayOfWeek)
      return {
        dayOfWeek,
        occupied: occupant != null,
        slotNames: occupant ? occupant.slots.map((slot) => slot.name) : [],
      }
    }),
    room: MAX_DAY_VARIANTS - takenDows.size,
  })
  const warning = copyPlanWarning(plan)
  const effectiveCount = plan.entries.filter((entry) => !entry.skippedNoRoom).length

  function handleCopy() {
    if (selected.length === 0) {
      toast.info(QE_COPY.copyDayNothing)
      return
    }
    const previous = state
    dispatch({
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: variant.key,
      days: selected,
      mode,
      keySeed: genQuickEditKey(),
    })
    onOpenChange(false)
    setSelected([])
    toast(QE_COPY.copyDayDone(effectiveCount), {
      duration: 8000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_DRAFT', state: previous }),
      },
    })
  }

  return (
    <QeBottomSheet open={open} onOpenChange={onOpenChange} title={QE_COPY.copyDayTitle(variant.label)}>
      <p className="text-xs leading-5 text-muted">{QE_COPY.copyDayHint}</p>

      <SegmentedControl
        size="sm"
        options={[
          { value: 'replace', label: QE_COPY.copyDayModeReplace },
          { value: 'append', label: QE_COPY.copyDayModeAppend },
        ]}
        value={mode}
        onChange={(value) => setMode(value as CopyMode)}
      />

      {/* Quick-select: presets con nombre + "proximos N" relativo (solo con dia de origen). */}
      <div className="flex flex-wrap gap-1.5">
        {COPY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() =>
              applyDays(
                daysForCopyPreset(preset, { takenDays: takenDows, sourceDayOfWeek: sourceDow }).map(
                  (day) => day.dayOfWeek,
                ),
              )
            }
            className="rounded-pill border border-border-default bg-surface-card px-2.5 py-1 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {preset.label}
          </button>
        ))}
        {sourceDow != null
          ? NEXT_DAYS_QUICK_PICKS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => applyDays(nextDaysFrom(sourceDow, count))}
                className="rounded-pill border border-border-default bg-surface-card px-2.5 py-1 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {QE_COPY.copyDayNextDays(count)}
              </button>
            ))
          : null}
      </div>

      <DayPicker
        selected={selected}
        taken={new Set(sourceDow != null ? [sourceDow] : [])}
        onToggle={toggleDay}
      />

      {warning ? (
        <p className="flex items-start gap-1.5 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      ) : null}

      <button
        type="button"
        disabled={isPending || selected.length === 0 || effectiveCount === 0}
        onClick={handleCopy}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <CalendarRange aria-hidden="true" className="h-4 w-4" />
        {QE_COPY.copyDayCta(Math.max(effectiveCount, 1))}
      </button>
    </QeBottomSheet>
  )
}
