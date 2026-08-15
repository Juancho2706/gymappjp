'use client'

/**
 * Franja editable del modo edicion (§1.2.B.2): nombre y hora inline en el header,
 * "+ Agregar alimento" al pie (bottom sheet con catalogo + alimento libre), eliminar
 * franja via menu "..." (QeBottomSheet, igual que el menu de dia: el overlay del
 * quick-edit vive en z-[60] y tapa cualquier popup portaleado en z-50) con confirm
 * inline + snackbar Deshacer, y copia de la franja a otros dias (P0-4) desde el mismo menu:
 * multi-select de dias destino o "Aplicar a todos los dias". Subtotal en vivo.
 * Una franja sin items es VALIDA (el RPC exige >= 1 franja, no >= 1 item): se muestra
 * "Franja sin alimentos" en vez de romperse (QA #4).
 */

import { useContext, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, CopyCheck, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatNutritionDayOfWeek } from '@eva/nutrition-v2'
import { NutritionCard } from '@/components/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  qeSlotCopyTargets,
  qeSlotPortionTotals,
  qeSlotSubtotal,
  qeCombineSubtotals,
  qeVariantTotalWithPortions,
  type QeSlot,
} from './quick-edit-state'
import type { FoodPickerSummary } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { RememberedQuantitiesContext } from '../builder/_components/RememberedQuantitiesContext'
import { QeBottomSheet } from './QeBottomSheet'
import { EditableItemRow } from './EditableItemRow'
import { EditablePortionsCard } from './EditablePortionsCard'
import { FoodPickerSheet } from './FoodPickerSheet'
import { QE_COPY } from './microcopy'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

/** Ventana del Deshacer, la misma de `EditableItemRow` y del wizard: una sola gramática. */
const UNDO_TOAST_MS = 8000

export function EditableSlotCard({
  variantKey,
  slot,
  index,
}: {
  variantKey: string
  slot: QeSlot
  index: number
}) {
  const { clientId, state, dispatch, errors, showErrors, isPending, exchangeGroups } = useQuickEdit()
  // Porcion pegajosa (T2.6 F4): mapa foodId → ultima cantidad, resuelto server-side. Solo el
  // editor unico monta el provider; en el quick-edit clasico esto es {} (sin cambios).
  const rememberedQuantities = useContext(RememberedQuantitiesContext)
  const [addOpen, setAddOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copySelection, setCopySelection] = useState<readonly string[]>([])
  /**
   * Franja contraida (chevron). Estado LOCAL y sin persistencia a proposito: un plan de 6
   * comidas obliga a scrollear a ciegas para llegar a la de abajo, pero cual dejo abierta el
   * coach no es una preferencia que valga la pena recordar entre sesiones. Arranca expandida.
   */
  const [collapsed, setCollapsed] = useState(false)
  // Dias destino de la copia (P0-4): todos menos el propio, en orden de lectura, con el aviso
  // por fila de si la franja homonima se va a REEMPLAZAR. Plan de un solo dia ⇒ [] (sin CTA).
  const copyTargets = useMemo(() => qeSlotCopyTargets(state, variantKey, slot.key), [state, variantKey, slot.key])
  // El subtotal SUMA las porciones a eleccion de la franja (macros congelados del plan),
  // igual que el builder: la card de porciones se edita justo arriba y antes no contaba.
  const portionTotals = qeSlotPortionTotals(slot, exchangeGroups)
  const subtotal = qeCombineSubtotals(qeSlotSubtotal(slot), portionTotals)
  const nameError = showErrors ? errors[`slot.${slot.key}.name`] : undefined
  // Barra viva del picker (multi-add): lo que lleva la franja y lo que resta del dia contra las
  // metas de ESTE dia. Deriva del estado, asi que se recalcula solo en cada alta (sin useMemo:
  // el React Compiler ya memoiza y la lista de dependencias no aportaba nada).
  const summaryVariant = state.variants.find((candidate) => candidate.key === variantKey)
  const summaryDayTotals = summaryVariant
    ? qeVariantTotalWithPortions(summaryVariant, exchangeGroups)
    : null
  const summaryTargetCalories = Number((summaryVariant?.targets.calories ?? '').trim())
  const summaryTargetProtein = Number((summaryVariant?.targets.proteinG ?? '').trim())
  const summaryHasTargets =
    summaryVariant != null &&
    summaryVariant.targets.calories.trim() !== '' &&
    Number.isFinite(summaryTargetCalories) &&
    Number.isFinite(summaryTargetProtein)
  const slotLabel = slot.name.trim() || 'la franja'
  const slotBodyId = `qe-slot-body-${slot.key}`
  const pickerSummary: FoodPickerSummary = {
    slotLabel: slot.name.trim() || 'Franja',
    slot: { calories: subtotal.calories, proteinG: subtotal.proteinG },
    remainingDay:
      summaryHasTargets && summaryDayTotals
        ? {
            calories: summaryTargetCalories - summaryDayTotals.calories,
            proteinG: summaryTargetProtein - summaryDayTotals.proteinG,
          }
        : null,
  }

  /**
   * T2.6 F1 — una sola gramatica destructiva en todo el modulo: la accion OCURRE y hay Deshacer.
   * Antes esto pedia ademas una confirmacion inline ("¿Eliminar la franja X?"), que es la unica del
   * modulo: el item de al lado ya se quitaba con undo y sin preguntar. Dos gestos distintos para dos
   * cosas igual de reversibles ensenan al coach a leer el aviso rojo y a apretar "Eliminar" sin
   * mirar. La ventana pasa a `UNDO_TOAST_MS`, la misma del item.
   */
  function handleRemoveSlot() {
    const removed = slot
    setMenuOpen(false)
    dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey: slot.key })
    toast(QE_COPY.slotDeletedUndo, {
      duration: UNDO_TOAST_MS,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_SLOT', variantKey, index, slot: removed }),
      },
    })
  }

  /**
   * Copia la franja a los dias elegidos. El deshacer restaura el ARBOL PREVIO completo
   * (`RESTORE_DRAFT`): una copia toca N dias y ningun `RESTORE_*` puntual la cubre, tal como
   * lo declara el reducer. El contador de "cambios sin publicar" se recalcula solo (deriva
   * del estado), asi que la barra refleja la copia y su deshacer sin nada extra.
   */
  function handleCopy(targetVariantKeys: readonly string[]) {
    if (targetVariantKeys.length === 0) return
    const previous = state
    setMenuOpen(false)
    setCopyOpen(false)
    dispatch({ type: 'COPY_SLOT_TO_VARIANTS', sourceVariantKey: variantKey, slotKey: slot.key, targetVariantKeys })
    toast(QE_COPY.copySlotDone(targetVariantKeys.length), {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_DRAFT', state: previous }),
      },
    })
  }

  function openCopySheet() {
    setCopySelection([])
    setMenuOpen(false)
    setCopyOpen(true)
  }

  function toggleCopyTarget(variantKeyToToggle: string) {
    setCopySelection((prev) =>
      prev.includes(variantKeyToToggle)
        ? prev.filter((key) => key !== variantKeyToToggle)
        : [...prev, variantKeyToToggle],
    )
  }

  return (
    <NutritionCard>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`qe-slot-name-${slot.key}`}>
            Nombre de la franja
          </label>
          <input
            id={`qe-slot-name-${slot.key}`}
            value={slot.name}
            disabled={isPending}
            placeholder="Desayuno, Almuerzo..."
            onChange={(event) =>
              dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { name: event.target.value } })
            }
            className={
              'min-h-11 w-full rounded-control border bg-surface-card px-3 font-display text-base font-semibold text-strong outline-none transition-colors placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
              (nameError ? 'border-rose-400 dark:border-rose-700' : 'border-transparent hover:border-border-default')
            }
          />
          {nameError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{nameError}</p> : null}
        </div>
        <div className="shrink-0">
          <label className="sr-only" htmlFor={`qe-slot-time-${slot.key}`}>
            Hora de la franja
          </label>
          <input
            id={`qe-slot-time-${slot.key}`}
            type="time"
            value={slot.startTime}
            disabled={isPending}
            onChange={(event) =>
              dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { startTime: event.target.value } })
            }
            className="h-11 w-[6.5rem] rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        {/* Contraer/expandir: con 5-6 comidas por día la pila obliga a scrollear a ciegas.
            Contraída, la card sigue diciendo lo único que importa de un vistazo: nombre, hora
            y su subtotal con las macros completas. */}
        <button
          type="button"
          aria-label={collapsed ? QE_COPY.expandSlot(slotLabel) : QE_COPY.collapseSlot(slotLabel)}
          aria-expanded={!collapsed}
          aria-controls={slotBodyId}
          onClick={() => setCollapsed((previous) => !previous)}
          className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            aria-hidden="true"
            className={'mx-auto h-4 w-4 transition-transform ' + (collapsed ? '-rotate-90' : '')}
          />
        </button>
        <button
          type="button"
          aria-label={`Opciones de la franja ${slot.name || 'sin nombre'}`}
          disabled={isPending}
          onClick={() => setMenuOpen(true)}
          className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <MoreVertical aria-hidden="true" className="mx-auto h-4 w-4" />
        </button>

        <QeBottomSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          title={slot.name.trim() || 'Franja sin nombre'}
        >
          {/* Copiar entre dias: solo con multi-dia (con un dia no hay destino posible). */}
          {copyTargets.length > 0 ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={openCopySheet}
                className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Copy aria-hidden="true" className="h-4 w-4 text-muted" />
                {QE_COPY.copySlot}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleCopy(copyTargets.map((target) => target.variantKey))}
                className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <CopyCheck aria-hidden="true" className="h-4 w-4 text-muted" />
                {QE_COPY.copySlotAll}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={handleRemoveSlot}
            className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-rose-300 bg-surface-card px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {QE_COPY.removeSlot}
          </button>
        </QeBottomSheet>

        {/* Multi-select de dias destino: etiqueta libre del coach + dia de semana real. */}
        <QeBottomSheet open={copyOpen} onOpenChange={setCopyOpen} title={QE_COPY.copySlotTitle}>
          <p className="text-xs leading-5 text-muted">{QE_COPY.copySlotHint}</p>
          {/* El bottom sheet crece con el contenido (h-auto): con 6 destinos la lista scrollea
              sola en vez de empujar el CTA fuera de pantalla. */}
          <ul className="-mx-1 max-h-[46vh] space-y-2 overflow-y-auto px-1">
            {copyTargets.map((target) => {
              const checked = copySelection.includes(target.variantKey)
              const dayCaption = target.isDefault
                ? QE_COPY.baseDayEyebrow
                : (formatNutritionDayOfWeek(target.dayOfWeek) ?? QE_COPY.specificDayEyebrow)
              return (
                <li key={target.variantKey}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleCopyTarget(target.variantKey)}
                    className={
                      'flex min-h-12 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                      (checked
                        ? 'border-primary bg-primary/10'
                        : 'border-border-default bg-surface-card hover:bg-surface-sunken')
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ' +
                        (checked
                          ? 'border-primary bg-primary/100 text-white'
                          : 'border-border-default bg-surface-card text-transparent')
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-strong">{target.label}</span>
                      <span className="block truncate text-xs text-muted">{dayCaption}</span>
                    </span>
                    {target.replaces ? (
                      <span className="shrink-0 rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {QE_COPY.copySlotReplaces}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            disabled={isPending || copySelection.length === 0}
            onClick={() => handleCopy(copySelection)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            {QE_COPY.copySlotCta(copySelection.length)}
          </button>
        </QeBottomSheet>
      </div>


      <div id={slotBodyId} hidden={collapsed}>
        <div className="mt-3 space-y-2">
          {slot.items.length === 0 ? (
            <p className="rounded-control border border-dashed border-border-subtle bg-surface-sunken px-3 py-3 text-center text-sm text-muted">
              {QE_COPY.emptySlot}
            </p>
          ) : (
            slot.items.map((item, itemIndex) => (
              <EditableItemRow
                key={item.key}
                variantKey={variantKey}
                slotKey={slot.key}
                item={item}
                index={itemIndex}
                count={slot.items.length}
              />
            ))
          )}
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={() => setAddOpen(true)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
          {QE_COPY.addFood}
        </button>

        {/* Seccion "Porciones a eleccion" (SPEC UX-a): hermana de los items, bajo "+ Alimento".
            Se pinta sola solo si el plan usa porciones (capa invisible si no). */}
        <EditablePortionsCard variantKey={variantKey} slot={slot} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotal franja</span>
        <MacroChipRow
          size="sm"
          calories={subtotal.calories}
          proteinG={subtotal.proteinG}
          carbsG={subtotal.carbsG}
          fatsG={subtotal.fatsG}
        />
        {portionTotals ? (
          // Redondeo entero + prefijo ~: valor referencial (mismo copy que el builder).
          <p className="w-full text-xs text-muted">
            {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
          </p>
        ) : null}
      </div>

      <FoodPickerSheet
        open={addOpen}
        title={`Agregar a ${slot.name.trim() || 'la franja'}`}
        clientId={clientId}
        allowCustom
        multiAdd
        slotName={slot.name.trim() || null}
        summary={pickerSummary}
        onOpenChange={setAddOpen}
        onPick={(food) =>
          dispatch({
            type: 'ADD_CATALOG_ITEM',
            variantKey,
            slotKey: slot.key,
            key: genQuickEditKey(),
            food,
            // Porcion pegajosa (T2.6 F4): solo el editor monta el provider con memoria; en el
            // quick-edit clasico el contexto es {} y el prefill queda undefined (todo igual).
            prefill: rememberedQuantities[food.id],
          })
        }
        onPickCustom={(query) => {
          // Alta de alimento libre CON el texto buscado precargado: el coach escribio
          // "pan amasado", no lo encontro y no tiene por que volver a tipearlo.
          const key = genQuickEditKey()
          dispatch({ type: 'ADD_CUSTOM_ITEM', variantKey, slotKey: slot.key, key })
          const name = query.trim()
          if (name !== '') {
            dispatch({ type: 'SET_ITEM_NAME', variantKey, slotKey: slot.key, itemKey: key, value: name })
          }
        }}
      />
    </NutritionCard>
  )
}
