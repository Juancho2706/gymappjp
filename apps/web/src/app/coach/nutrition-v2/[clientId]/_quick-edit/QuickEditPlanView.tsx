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
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { EditorMetaCard } from './EditorMetaCard'
import { AddDayPopover } from '../builder/_components/AddDayPopover'
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
  takenDayVariantDows,
  VARIANT_LABEL_MAX,
  type QeVariant,
} from './quick-edit-state'
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
  } = useQuickEdit()
  const usesSlots = strategy === 'structured' || strategy === 'hybrid'
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${QE_COPY.enter} de ${clientName}`}
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
              {QE_COPY.enter}
            </p>
            <h1 className="truncate font-display text-lg font-bold leading-tight tracking-[-0.02em] text-strong">
              {clientName}
            </h1>
          </div>
          <div className="shrink-0">
            <StrategyBadge strategy={strategy} compact />
          </div>
        </div>
      </header>

      <div className={'mx-auto w-full max-w-3xl space-y-4 px-3 py-4 ' + (isPending ? 'pointer-events-none opacity-70' : '')}>
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

        {/* Editor unico (T3.x): cabecera de metadatos del plan. Solo existe con `state.meta`
            (ruta /editor); en el quick-edit clasico este bloque no se pinta. */}
        {state.meta ? <EditorMetaCard /> : null}

        {/* Índice de días (P1-1): ancla por día arriba de la pila. Con un solo día no aporta. */}
        {multiDay ? <DayAnchorNav variants={orderedVariants} todayVariantKey={todayVariantKey} /> : null}

        {orderedVariants.map((variant, dayIndex) => (
          // `scroll-mt-20` deja el título del día por debajo del header sticky al saltar acá.
          <section key={variant.key} id={qeDaySectionId(dayIndex)} className="scroll-mt-20 space-y-4">
            {multiDay ? <DayVariantHeader variant={variant} /> : null}
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

      <PublishBar />
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
