'use client'

/**
 * Fila editable de un alimento prescrito — nucleo del quick-edit (§1.2.B.1).
 *
 * Cantidad HIBRIDA por unidad (BD6, `ItemQuantityField` compartido con el creador): input libre
 * en g/ml, steppers ±0,5 con fracciones (½, 1, 1½) en porciones. La unidad solo es editable
 * cuando el item tiene macros por 100 en mano (item.food, tras un swap/alta); para items
 * hidratados queda bloqueada para no inventar conversiones — el swap la desbloquea.
 *
 * Las acciones de la fila viven en UN menu ⋮ (BD7) en vez de repartidas en botones sueltos:
 * Reemplazar · Mover a otra franja · Guardar en mi catalogo (solo alimentos libres) · Quitar.
 * Quitar y mover son optimistas con snackbar "Deshacer" (8s): cero confirms.
 */

import { useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  ListPlus,
  Loader2,
  MoreVertical,
  MoveRight,
  Repeat2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { foodCategoryIconUrl } from '@/lib/food-image'
import { BUILDER_UNITS, MAX_ITEM_SUBSTITUTIONS } from '../builder/_lib/draft-builder'
import { stepCountedQuantity } from '../builder/_lib/quantity-format'
import { foodCategoryIconUrlFromName, resolveFoodImageUrl } from '../builder/_components/food-card-presentation'
import { FoodThumb } from '../builder/_components/FoodImage'
import { ItemQuantityField } from '../builder/_components/ItemQuantityField'
import { FoodMacrosOverrideDialog } from '../builder/_components/FoodMacrosOverrideDialog'
import { createCoachFoodAction } from '../builder/_actions/builder.actions'
import { rememberFoodQuantityAction } from '../builder/_actions/last-quantity.actions'
import {
  qeCoachFoodCandidate,
  qeItemMacros,
  type QeItem,
  type QeItemSubstitution,
  type QeSlot,
} from './quick-edit-state'
import { useQuickEdit } from './QuickEditProvider'
import { FoodPickerSheet } from './FoodPickerSheet'
import { QeBottomSheet } from './QeBottomSheet'
import { QE_COPY } from './microcopy'

/** Ventana del Deshacer de las acciones optimistas de la fila (quitar, mover). */
const UNDO_TOAST_MS = 8000

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

const menuItemClass =
  'inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-left text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/** "Almuerzo · 13:30" — como se lee una franja destino en "Mover a otra franja". */
function slotOptionLabel(slot: QeSlot): string {
  const name = slot.name.trim() || 'Franja sin nombre'
  return slot.startTime ? `${name} · ${slot.startTime}` : name
}

/** Tipo MIME propio del drag de items del editor (W3b): jamas interpretar drops ajenos. */
const QE_ITEM_DRAG_MIME = 'application/x-eva-qe-item'

interface QeItemDragPayload {
  variantKey: string
  slotKey: string
  itemKey: string
}

export function EditableItemRow({
  variantKey,
  slotKey,
  item,
  index,
  count,
}: {
  variantKey: string
  slotKey: string
  item: QeItem
  index: number
  /** Total de items de la franja (habilita Subir/Bajar del editor; ausente = sin reorden). */
  count?: number
}) {
  const { clientId, state, dispatch, errors, showErrors, isPending, surface } = useQuickEdit()
  const [swapOpen, setSwapOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // W2 (solo editor unico, `state.meta`): reemplazos autorizados editables + editar macros.
  const [subsOpen, setSubsOpen] = useState(false)
  const [subsPickerOpen, setSubsPickerOpen] = useState(false)
  const [macrosOpen, setMacrosOpen] = useState(false)
  const isEditor = state.meta !== undefined
  const substitutions = item.substitutions ?? []
  // Porcion pegajosa (T2.6 F4, write-side; solo editor): firma del ultimo commit para no
  // pegarle al server en cada blur sin edicion — mismo guard que el wizard (ItemRow).
  const lastRememberedRef = useRef<string | null>(null)
  const macros = qeItemMacros(item)
  const quantityError = showErrors ? errors[`item.${item.key}.quantity`] : undefined
  const nameError = showErrors ? errors[`item.${item.key}.name`] : undefined
  const itemLabel = item.displayName || 'alimento'
  // Franjas hermanas del MISMO dia: destinos de "Mover a otra franja".
  const daySlots = state.variants.find((variant) => variant.key === variantKey)?.slots ?? []
  const moveTargets = daySlots.filter((slot) => slot.key !== slotKey)
  // Promocion al catalogo: solo para alimentos LIBRES. En los del catalogo la opcion ni aparece
  // (ya estan guardados); en los libres aparece siempre, con hint cuando no se puede.
  const saveCandidate = qeCoachFoodCandidate(item)
  const canOfferSave = saveCandidate.ok || saveCandidate.reason !== 'not-custom'
  const saveBlockedHint = saveCandidate.ok
    ? null
    : saveCandidate.reason === 'no-name'
      ? QE_COPY.saveFoodNoName
      : saveCandidate.reason === 'bad-unit'
        ? QE_COPY.saveFoodBadUnit
        : QE_COPY.saveFoodNoMacros
  // Miniatura SIEMPRE (regla transversal del owner): foto del producto si el read model o el
  // swap la traen; icono por categoria si no, derivada del nombre como ultimo recurso.
  const media = item.food?.media ?? item.media
  const imageUrl = resolveFoodImageUrl(media as FoodCatalogItem['media'], SUPABASE_BASE)
  const category = item.food?.category ?? item.category
  const iconUrl = category ? foodCategoryIconUrl(category) : foodCategoryIconUrlFromName(item.displayName)

  function handleRemove() {
    const removed = item
    const removedIndex = index
    setMenuOpen(false)
    dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })
    toast(QE_COPY.deletedUndo, {
      duration: UNDO_TOAST_MS,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_ITEM', variantKey, slotKey, index: removedIndex, item: removed }),
      },
    })
  }

  /** Mueve el item a otra franja del dia; el Deshacer lo devuelve a su posicion exacta. */
  function handleMove(target: QeSlot) {
    const fromIndex = index
    setMoveOpen(false)
    setMenuOpen(false)
    dispatch({ type: 'MOVE_ITEM', variantKey, fromSlotKey: slotKey, toSlotKey: target.key, itemKey: item.key })
    toast(QE_COPY.moveFoodDone(target.name.trim() || 'la otra franja'), {
      duration: UNDO_TOAST_MS,
      action: {
        label: QE_COPY.undo,
        onClick: () =>
          dispatch({
            type: 'MOVE_ITEM',
            variantKey,
            fromSlotKey: target.key,
            toSlotKey: slotKey,
            itemKey: item.key,
            toIndex: fromIndex,
          }),
      },
    })
  }

  /** Reorden dentro de la franja (W3b): gesto no destructivo, sin confirm ni undo. */
  function handleReorder(toIndex: number) {
    setMenuOpen(false)
    dispatch({ type: 'REORDER_ITEM', variantKey, slotKey, itemKey: item.key, toIndex })
  }

  /** Drop de otro item del editor sobre ESTA fila: mismo slot = reorden; otro slot del mismo dia = mover. */
  function handleItemDrop(event: React.DragEvent) {
    const raw = event.dataTransfer.getData(QE_ITEM_DRAG_MIME)
    if (!raw) return
    event.preventDefault()
    let payload: QeItemDragPayload
    try {
      payload = JSON.parse(raw) as QeItemDragPayload
    } catch {
      return
    }
    // Cruce de dias por drag no existe (la capsula muestra un dia a la vez).
    if (payload.variantKey !== variantKey || payload.itemKey === item.key) return
    if (payload.slotKey === slotKey) {
      dispatch({ type: 'REORDER_ITEM', variantKey, slotKey, itemKey: payload.itemKey, toIndex: index })
      return
    }
    dispatch({
      type: 'MOVE_ITEM',
      variantKey,
      fromSlotKey: payload.slotKey,
      toSlotKey: slotKey,
      itemKey: payload.itemKey,
      toIndex: index,
    })
  }

  /** Quitar un reemplazo autorizado: optimista + Deshacer que restituye en su indice (T2.6 F1). */
  function handleRemoveSubstitution(sub: QeItemSubstitution, subIndex: number) {
    dispatch({ type: 'REMOVE_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: item.key, index: subIndex })
    toast(QE_COPY.substitutionRemovedUndo, {
      duration: UNDO_TOAST_MS,
      action: {
        label: QE_COPY.undo,
        onClick: () =>
          dispatch({
            type: 'RESTORE_ITEM_SUBSTITUTION',
            variantKey,
            slotKey,
            itemKey: item.key,
            index: subIndex,
            sub,
          }),
      },
    })
  }

  /**
   * Promueve el alimento libre al catalogo del coach y deja el item apuntando al alimento creado
   * (`SWAP_ITEM_FOOD` conserva cantidad y unidad). No publica nada: el plan sigue con cambios sin
   * publicar, y el alimento ya queda disponible para el proximo plan.
   */
  async function handleSaveToCatalog() {
    if (!saveCandidate.ok || saving) return
    setSaving(true)
    const res = await createCoachFoodAction({ clientId, brand: null, ...saveCandidate.payload })
    setSaving(false)
    setMenuOpen(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    dispatch({ type: 'SWAP_ITEM_FOOD', variantKey, slotKey, itemKey: item.key, food: res.food })
    toast.success(QE_COPY.saveFoodDone)
  }

  return (
    <div
      className="rounded-control border border-border-subtle bg-surface-card p-2.5"
      onDragOver={
        isEditor
          ? (event) => {
              if (event.dataTransfer.types.includes(QE_ITEM_DRAG_MIME)) event.preventDefault()
            }
          : undefined
      }
      onDrop={isEditor ? handleItemDrop : undefined}
    >
      <div className="flex items-start gap-2.5">
        {/* W3b: manija de drag (desktop; en touch el reorden vive en el menu Subir/Bajar). */}
        {isEditor ? (
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                QE_ITEM_DRAG_MIME,
                JSON.stringify({ variantKey, slotKey, itemKey: item.key } satisfies QeItemDragPayload),
              )
              event.dataTransfer.effectAllowed = 'move'
            }}
            aria-hidden="true"
            title="Arrastra para reordenar o mover de franja"
            className="hidden shrink-0 cursor-grab select-none items-center self-stretch text-muted hover:text-strong lg:flex"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        ) : null}
        <FoodThumb imageUrl={imageUrl} iconUrl={iconUrl} alt={item.displayName || 'Alimento'} />
        <div className="min-w-0 flex-1">
          {item.isCustom ? (
            <>
              <input
                aria-label="Nombre del alimento libre"
                placeholder="Nombre del alimento libre"
                value={item.displayName}
                disabled={isPending}
                onChange={(event) =>
                  dispatch({ type: 'SET_ITEM_NAME', variantKey, slotKey, itemKey: item.key, value: event.target.value })
                }
                className={
                  'min-h-11 w-full rounded-control border bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm ' +
                  (nameError ? 'border-rose-400 dark:border-rose-700' : 'border-border-default')
                }
              />
              {nameError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{nameError}</p> : null}
            </>
          ) : (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-strong">{item.displayName}</p>
              {item.brand ? <p className="mt-0.5 truncate text-xs text-muted">{item.brand}</p> : null}
            </>
          )}
          <div className="mt-1">
            <MacroChipRow
              size="sm"
              calories={macros.calories}
              proteinG={macros.proteinG}
              carbsG={macros.carbsG}
              fatsG={macros.fatsG}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label={QE_COPY.itemMenu(itemLabel)}
          disabled={isPending}
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <MoreVertical aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ItemQuantityField
            label={`Cantidad de ${itemLabel}`}
            value={item.quantity}
            unit={item.unit}
            invalid={Boolean(quantityError)}
            disabled={isPending}
            onChange={(value) => dispatch({ type: 'SET_ITEM_QUANTITY', variantKey, slotKey, itemKey: item.key, value })}
            onCommit={() => {
              // Porcion pegajosa (T2.6 F4): al fijar la cantidad se recuerda para la proxima,
              // en este alumno y en general. Solo en el EDITOR (el quick-edit clasico no
              // escribe memoria) y solo con alimento de catalogo en mano. Fire-and-forget.
              // En PLANTILLA (T3.2b) no hay alumno: el clientId es un relleno y la memoria
              // por-alumno seria ruido — no se escribe.
              if (!isEditor || surface === 'template' || item.food == null) return
              const signature = `${item.food.id}:${item.quantity}:${item.unit}`
              if (lastRememberedRef.current === signature) return
              lastRememberedRef.current = signature
              void rememberFoodQuantityAction({
                clientId,
                foodId: item.food.id,
                quantity: item.quantity,
                unit: item.unit,
              })
            }}
            onStep={(direction) =>
              dispatch({
                type: 'SET_ITEM_QUANTITY',
                variantKey,
                slotKey,
                itemKey: item.key,
                value: stepCountedQuantity(item.quantity, direction),
              })
            }
          />
        </div>
        {item.food ? (
          <select
            aria-label="Unidad"
            value={item.unit}
            disabled={isPending}
            onChange={(event) =>
              dispatch({ type: 'SET_ITEM_UNIT', variantKey, slotKey, itemKey: item.key, unit: event.target.value })
            }
            className="h-11 w-20 shrink-0 rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            {BUILDER_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        ) : (
          <span
            title="Reemplaza el alimento desde el catalogo para cambiar la unidad"
            className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-sm font-semibold text-muted"
          >
            {item.unit}
          </span>
        )}
      </div>
      {quantityError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{quantityError}</p> : null}

      <QeBottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={item.displayName || 'Alimento'} busy={saving}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setMenuOpen(false)
            setSwapOpen(true)
          }}
          className={menuItemClass}
        >
          <ArrowLeftRight aria-hidden="true" className="h-4 w-4 text-muted" />
          {QE_COPY.replaceFood}
        </button>

        <div>
          <button
            type="button"
            disabled={isPending || moveTargets.length === 0}
            onClick={() => {
              setMenuOpen(false)
              setMoveOpen(true)
            }}
            className={menuItemClass}
          >
            <MoveRight aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.moveFood}
          </button>
          {moveTargets.length === 0 ? (
            <p className="mt-1 px-1 text-xs leading-5 text-muted">{QE_COPY.moveFoodSingleSlot}</p>
          ) : null}
        </div>

        {isEditor && typeof count === 'number' && count > 1 ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || index === 0}
              onClick={() => handleReorder(index - 1)}
              className={menuItemClass + ' flex-1'}
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4 text-muted" />
              {QE_COPY.moveItemUp}
            </button>
            <button
              type="button"
              disabled={isPending || index === count - 1}
              onClick={() => handleReorder(index + 1)}
              className={menuItemClass + ' flex-1'}
            >
              <ArrowDown aria-hidden="true" className="h-4 w-4 text-muted" />
              {QE_COPY.moveItemDown}
            </button>
          </div>
        ) : null}

        {isEditor ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setMenuOpen(false)
              setSubsOpen(true)
            }}
            className={menuItemClass}
          >
            <Repeat2 aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.substitutionsMenu(substitutions.length)}
          </button>
        ) : null}

        {isEditor && item.food ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setMenuOpen(false)
              setMacrosOpen(true)
            }}
            className={menuItemClass}
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-muted" />
            {QE_COPY.editMacros}
          </button>
        ) : null}

        {canOfferSave ? (
          <div>
            <button
              type="button"
              disabled={isPending || saving || !saveCandidate.ok}
              onClick={() => void handleSaveToCatalog()}
              className={menuItemClass}
            >
              {saving ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted" />
              ) : (
                <BookmarkPlus aria-hidden="true" className="h-4 w-4 text-muted" />
              )}
              {QE_COPY.saveFood}
            </button>
            {saveBlockedHint ? (
              <p className="mt-1 px-1 text-xs leading-5 text-muted">{saveBlockedHint}</p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isPending}
          onClick={handleRemove}
          className="inline-flex min-h-12 w-full items-center gap-2 rounded-control border border-rose-300 bg-surface-card px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {QE_COPY.removeFood}
        </button>
      </QeBottomSheet>

      <QeBottomSheet open={moveOpen} onOpenChange={setMoveOpen} title={QE_COPY.moveFood}>
        <p className="text-xs leading-5 text-muted">{QE_COPY.moveFoodHint}</p>
        <ul className="-mx-1 max-h-[46vh] space-y-2 overflow-y-auto px-1">
          {moveTargets.map((target) => (
            <li key={target.key}>
              <button type="button" disabled={isPending} onClick={() => handleMove(target)} className={menuItemClass}>
                <MoveRight aria-hidden="true" className="h-4 w-4 text-muted" />
                <span className="min-w-0 flex-1 truncate">{slotOptionLabel(target)}</span>
              </button>
            </li>
          ))}
        </ul>
      </QeBottomSheet>

      <FoodPickerSheet
        open={swapOpen}
        title={`Reemplazar ${itemLabel}`}
        clientId={clientId}
        onOpenChange={setSwapOpen}
        onPick={(food) => dispatch({ type: 'SWAP_ITEM_FOOD', variantKey, slotKey, itemKey: item.key, food })}
      />

      {/* W2 (editor): lista editable de reemplazos autorizados del item. */}
      {isEditor ? (
        <>
          <QeBottomSheet open={subsOpen} onOpenChange={setSubsOpen} title={QE_COPY.substitutionsTitle(itemLabel)}>
            <p className="text-xs leading-5 text-muted">{QE_COPY.substitutionsHint}</p>
            {substitutions.length === 0 ? (
              <p className="rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-body">
                {QE_COPY.substitutionsEmpty}
              </p>
            ) : (
              <ul className="-mx-1 max-h-[46vh] space-y-2 overflow-y-auto px-1">
                {substitutions.map((sub, subIndex) => (
                  <li
                    key={`${sub.foodId ?? sub.customName ?? 'sub'}-${subIndex}`}
                    className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-card p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-5 text-strong">
                        {sub.displayName ?? sub.customName ?? 'Alimento'}
                      </p>
                      {sub.quantity != null && sub.unit ? (
                        <p className="text-xs leading-5 text-muted">{`${sub.quantity} ${sub.unit}`}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar reemplazo ${sub.displayName ?? sub.customName ?? ''}`}
                      disabled={isPending}
                      onClick={() => handleRemoveSubstitution(sub, subIndex)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border-subtle text-muted transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <button
                type="button"
                disabled={isPending || substitutions.length >= MAX_ITEM_SUBSTITUTIONS}
                onClick={() => {
                  setSubsOpen(false)
                  setSubsPickerOpen(true)
                }}
                className={menuItemClass}
              >
                <ListPlus aria-hidden="true" className="h-4 w-4 text-muted" />
                {QE_COPY.addSubstitution}
              </button>
              {substitutions.length >= MAX_ITEM_SUBSTITUTIONS ? (
                <p className="mt-1 px-1 text-xs leading-5 text-muted">
                  {QE_COPY.substitutionLimit(MAX_ITEM_SUBSTITUTIONS)}
                </p>
              ) : null}
            </div>
          </QeBottomSheet>

          <FoodPickerSheet
            open={subsPickerOpen}
            title={`${QE_COPY.addSubstitution} para ${itemLabel}`}
            clientId={clientId}
            onOpenChange={(open) => {
              setSubsPickerOpen(open)
              if (!open) setSubsOpen(true)
            }}
            onPick={(food) => {
              if (food.id === item.foodId || substitutions.some((sub) => sub.foodId === food.id)) {
                toast.info(QE_COPY.substitutionDuplicate)
                return
              }
              dispatch({ type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: item.key, food })
            }}
          />

          {item.food ? (
            <FoodMacrosOverrideDialog
              food={item.food}
              clientId={clientId}
              open={macrosOpen}
              onOpenChange={setMacrosOpen}
              onApplied={(patch) =>
                dispatch({ type: 'APPLY_FOOD_OVERRIDE', foodId: item.food!.id, macros: patch })
              }
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
