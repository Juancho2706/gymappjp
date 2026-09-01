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
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  Loader2,
  MoreVertical,
  MoveRight,
  Repeat2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
// Import DIRECTO (no por el barrel `components/nutrition-v2`): el barrel arrastra el kit entero
// a este bundle de cliente y acá solo hace falta el spark (y, desde la Familia N, la pastilla de
// alta con su lector de marca).
import { MacroSparkPopover } from '@/components/nutrition-v2/MacroSparkPopover'
import { AddActionButton } from '@/components/nutrition-v2/AddActionButton'
import { useBrandPrimaryHex } from '@/components/nutrition-v2/useBrandPrimaryHex'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { foodCategoryIconUrl } from '@/lib/food-image'
import { BUILDER_UNITS, MAX_ITEM_SUBSTITUTIONS } from '@eva/nutrition-v2'
import { stepCountedQuantity } from '@/app/coach/nutrition-v2/_lib/quantity-format'
import { foodCategoryIconUrlFromName, resolveFoodImageUrl } from '@/app/coach/nutrition-v2/_components/food-card-presentation'
import { FoodThumb } from '@/app/coach/nutrition-v2/_components/FoodImage'
import { useRememberedQuantity } from '@/app/coach/nutrition-v2/_components/RememberedQuantitiesContext'
import { ItemQuantityField } from '@/app/coach/nutrition-v2/_components/ItemQuantityField'
import { FoodMacrosOverrideDialog } from '@/app/coach/nutrition-v2/_components/FoodMacrosOverrideDialog'
import { createCoachFoodAction } from '@/app/coach/nutrition-v2/_actions/plan-publish.actions'
import { rememberFoodQuantityAction } from '@/app/coach/nutrition-v2/_actions/last-quantity.actions'
import {
  qeCoachFoodCandidate,
  qeItemMacros,
  qeSubstitutionEquivalence,
  type QeItem,
  type QeItemSubstitution,
  type QeSlot,
} from '@eva/nutrition-v2'
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

/** Badge inline del nombre (⇄ n / macros editadas / libre): pill chica, sin peso visual. */
const badgeClass =
  'inline-flex shrink-0 items-center rounded-pill border px-1.5 py-px text-[9.5px] font-semibold leading-4'

/**
 * "402 kcal / 100 g" — la DENSIDAD del alimento, que es lo que el coach compara entre productos
 * (el aporte de ESTA cantidad ya lo dice el spark de la derecha). T3.v Cabina, mockup A·1.
 *
 * Dos fuentes, ninguna inventada:
 *  - `item.food` (alimento del catalogo en mano, tras un swap o un alta): sus macros vienen por
 *    100 g/ml salvo que declare `per_serving` (NUT-001), y ahi se imprime la base declarada —
 *    imprimir "por 100" sobre una fila `per_serving` seria una mentira visual.
 *  - `item.macroBase` (item hidratado del read model: solo trae las macros de la cantidad
 *    prescrita): se reescala a 100 SOLO en g/ml, que son las unidades donde "por 100" significa
 *    algo. En unidades contadas (porcion/unidad) no hay densidad que mostrar y devuelve null.
 */
function itemDensityLabel(item: QeItem): string | null {
  const food = item.food
  if (food) {
    const unitLabel = food.servingUnit === 'ml' ? 'ml' : 'g'
    const basis = food.macrosBasis === 'per_serving' ? food.servingSize : 100
    if (!Number.isFinite(basis) || basis <= 0) return null
    const amount = Number.isInteger(basis) ? String(basis) : basis.toFixed(1)
    return QE_COPY.itemDensity(Math.round(food.calories), amount, unitLabel)
  }
  const base = item.macroBase
  const unit = (item.unit || '').toLowerCase()
  if (!base || base.quantity <= 0 || (unit !== 'g' && unit !== 'ml')) return null
  return QE_COPY.itemDensity(Math.round((base.macros.calories / base.quantity) * 100), '100', unit)
}

/** Tipo MIME propio del drag de items del editor (W3b): jamas interpretar drops ajenos. */
const QE_ITEM_DRAG_MIME = 'application/x-eva-qe-item'

/**
 * Monedas del botón «Agregar reemplazo» (Familia N): DOS íconos de categoría —proteína y
 * carbohidrato—, los mismos assets estáticos que ya usa la fila. Dos y no tres a propósito: un
 * reemplazo es un par (lo prescrito ⇄ lo que lo sustituye), no un surtido.
 */
const SUBSTITUTION_STACK = [
  foodCategoryIconUrl('proteina'),
  foodCategoryIconUrl('carbohidrato'),
] as const

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
  tourMenuTarget = false,
}: {
  variantKey: string
  slotKey: string
  item: QeItem
  index: number
  /** Total de items de la franja (habilita Subir/Bajar del editor; ausente = sin reorden). */
  count?: number
  /**
   * Guía Viva: esta fila es la que el tour usa para enseñar el ⋮ («El ⋮ guarda los superpoderes»).
   * Solo agrega el atributo `data-tour` al botón del menú — cero cambios de estilo o comportamiento.
   * Quién es «la» fila lo decide `EditableSlotCard`, que sí sabe si su franja es la primera.
   */
  tourMenuTarget?: boolean
}) {
  const { clientId, state, dispatch, errors, showErrors, isPending, surface } = useQuickEdit()
  const brandHex = useBrandPrimaryHex()
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
  // Subtitulo de la fila v2 (mockup A·1): "marca · 402 kcal / 100 g · la sueles usar aquí".
  // La porcion pegajosa (T2.6 F4) ya viaja por contexto resuelta desde el servidor; en el
  // quick-edit clasico el mapa es {} y la señal simplemente no aparece.
  const rememberedQuantity = useRememberedQuantity(item.foodId)
  const subtitle = [
    item.brand,
    itemDensityLabel(item),
    rememberedQuantity ? QE_COPY.itemUsualHere : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
    /**
     * Fila v2 (T3.v Cabina, mockup A·1): grid `34px 1fr auto auto 26px` en una sola linea, SIN
     * card por fila — la comida se lee como una lista, separada por un pelo de 1 px, y la caja la
     * pone la franja. Debajo de `md` la fila se parte en dos renglones (identidad arriba,
     * cantidad + spark abajo) porque los 44 px del campo de cantidad no entran al lado del nombre
     * en 390 px; el envoltorio de la segunda linea es `md:contents`, asi que de md para arriba sus
     * hijos vuelven a ser celdas del MISMO grid y no queda ni un div de mas en el layout.
     *
     * En desktop (`lg`, solo modo editor) se antepone la columna de la manija de drag: es una
     * afordancia existente (W3b) y esta pasada es VISUAL, no le quita capacidades a nadie.
     */
    <div
      className={
        'grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 border-t border-border-subtle py-2.5 first:border-t-0 md:grid-cols-[34px_minmax(0,1fr)_auto_auto_44px] ' +
        (isEditor
          ? 'lg:grid-cols-[16px_34px_minmax(0,1fr)_auto_auto_26px]'
          : 'lg:grid-cols-[34px_minmax(0,1fr)_auto_auto_26px]')
      }
      onDragOver={
        isEditor
          ? (event) => {
              if (event.dataTransfer.types.includes(QE_ITEM_DRAG_MIME)) event.preventDefault()
            }
          : undefined
      }
      onDrop={isEditor ? handleItemDrop : undefined}
    >
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
          className="hidden cursor-grab select-none items-center justify-center text-muted hover:text-strong lg:flex"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      ) : null}

      {/* col 1 — foto real del producto (34×34 reservados: cero layout shift). El alimento LIBRE
          no tiene producto que fotografiar: tile punteado con sus iniciales. */}
      <span className="col-start-1 row-start-1 md:col-start-auto md:row-start-auto">
        {item.isCustom ? (
          <span
            aria-hidden="true"
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-control border border-dashed border-border-default bg-surface-sunken font-mono text-[10px] font-semibold uppercase text-muted"
          >
            {item.displayName.trim().slice(0, 2)}
          </span>
        ) : (
          <FoodThumb
            size="sm"
            imageUrl={imageUrl}
            iconUrl={iconUrl}
            alt={item.displayName || 'Alimento'}
          />
        )}
      </span>

      {/* col 2 — nombre con sus badges inline + subtitulo "marca · densidad · porcion pegajosa". */}
      <div className="col-start-2 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
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
                'min-h-11 w-full rounded-control border bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm lg:min-h-9 ' +
                (nameError ? 'border-rose-400 dark:border-rose-700' : 'border-border-default')
              }
            />
            {nameError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{nameError}</p> : null}
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span className={badgeClass + ' border-border-subtle bg-surface-sunken text-muted'}>
                {QE_COPY.itemBadgeFree}
              </span>
              <span className="truncate text-[10.5px] leading-4 text-muted">
                {subtitle || QE_COPY.itemFreeHint}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-tight text-strong">
                {item.displayName}
              </span>
              {substitutions.length > 0 ? (
                <span
                  title={QE_COPY.substitutionsMenu(substitutions.length)}
                  aria-label={QE_COPY.substitutionsMenu(substitutions.length)}
                  className={badgeClass + ' border-sport-500/30 bg-sport-100 text-sport-700'}
                >
                  {QE_COPY.itemBadgeSubstitutions(substitutions.length)}
                </span>
              ) : null}
              {item.food?.hasOverride ? (
                <span className={badgeClass + ' border-warning-500/30 bg-warning-100 text-warning-700'}>
                  {QE_COPY.itemBadgeMacrosEdited}
                </span>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[10.5px] leading-4 text-muted">{subtitle}</p>
            ) : null}
          </>
        )}
      </div>

      {/* cols 3 y 4 (una sola linea bajo `md`) — cantidad + unidad, y el spark de macros.
          Pasada 2 (hallazgo 2 del owner): cantidad y unidad tienen que leerse como UN control partido
          en dos. Las dos cajas miden 44 px (`h-11`) y el contenedor las centra (`items-center`); el
          envoltorio de la cantidad se declara `flex items-center` para que su alto sea EXACTAMENTE el
          del campo — un div de bloque con un input adentro suma el hueco de la línea base de la fuente
          y bajaría el centro del campo un par de píxeles respecto del de la unidad. */}
      <div className="col-start-2 col-span-2 row-start-2 flex items-center gap-2 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center md:w-[148px] md:flex-none">
            <ItemQuantityField
              // El envoltorio es flex: sin `w-full` la variante con steppers (unidades contadas)
              // dejaría de llenar los 148 px de la columna y se encogería a su contenido.
              className="w-full"
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
                }).catch(() => {
                  // best-effort: sin red o respuesta no-RSC no rompe nada (EVA-NEXTJS-19)
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
              /* 44×64 — el mismo cajón que la caja de solo lectura de abajo (las unidades son de dos
                 letras: g · ml · un), para que la columna no se corra entre filas con y sin catálogo. */
              className="h-11 w-16 shrink-0 rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
            >
              {BUILDER_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          ) : (
            /* Mismo alto (44 px) y el MISMO ancho que el select de al lado: en un día se mezclan filas
               hidratadas (esta caja) con filas recién agregadas o intercambiadas (el select), y con
               anchos distintos la columna de cantidad de cada fila arrancaba en una x diferente —
               la escalera que reportó el owner en la fila «100 | ml». */
            <span
              title="Reemplaza el alimento desde el catalogo para cambiar la unidad"
              className="inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-sm font-semibold text-muted"
            >
              {item.unit}
            </span>
          )}
        </div>

        {/* Los gramos exactos NO desaparecen: viven a un hover/tap del spark (SPEC D3). Item sin
            macros = track vacio + «Sin macros registrados» en el panel, que lo resuelve el propio
            componente. `hideUnit`: el "kcal" ya lo dice el header de la franja una vez. */}
        <MacroSparkPopover
          size="sm"
          hideUnit
          // `xl:min-w-[5.25rem]`: cada fila es su PROPIA grilla, así que una fila con 4 dígitos de kcal
          // ensancha su columna del spark y corre la cantidad y la unidad unos píxeles a la izquierda
          // respecto de la fila de arriba. Un piso de ancho que cubre hasta 4 dígitos deja la columna
          // quieta (el contenido sigue alineado a la derecha). Solo desde `xl:`: entre 1024 y 1279 el
          // lienzo es la columna más angosta del editor y esos píxeles le hacen falta al NOMBRE.
          className="shrink-0 justify-self-end xl:min-w-[5.25rem]"
          ariaContext={itemLabel}
          calories={macros.calories}
          proteinG={macros.proteinG}
          carbsG={macros.carbsG}
          fatsG={macros.fatsG}
          fiberG={macros.fiberG > 0 ? macros.fiberG : null}
        />
      </div>

      {/* col 5 — el menu ⋮ con TODAS las acciones de la fila, sin tocar nada. */}
      <button
        type="button"
        aria-label={QE_COPY.itemMenu(itemLabel)}
        data-tour={tourMenuTarget ? 'item-menu' : undefined}
        disabled={isPending}
        onClick={() => setMenuOpen(true)}
        className="col-start-3 row-start-1 inline-flex h-11 w-11 shrink-0 items-center justify-center justify-self-end rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:col-start-auto md:row-start-auto lg:h-[26px] lg:w-[26px]"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </button>

      {quantityError ? (
        <p className="col-span-full text-xs text-rose-600 dark:text-rose-300">{quantityError}</p>
      ) : null}

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
                {substitutions.map((sub, subIndex) => {
                  // La cantidad que el ALUMNO va a ver: un reemplazo sin cantidad propia (hoy
                  // todos) se le muestra ya resuelto en la porción que iguala las kcal de lo
                  // prescrito. Hasta acá el coach autorizaba a ciegas. `null` = no hay macros
                  // vigentes con qué calcular ⇒ se cae al dato crudo de la fila, jamás a un 0.
                  const equivalence = qeSubstitutionEquivalence(item, sub)
                  return (
                    <li
                      key={`${sub.foodId ?? sub.customName ?? 'sub'}-${subIndex}`}
                      className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-card p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-5 text-strong">
                          {sub.displayName ?? sub.customName ?? 'Alimento'}
                        </p>
                        {equivalence ? (
                          <>
                            <p className="text-xs font-semibold leading-5 text-body">
                              {equivalence.label}
                            </p>
                            {equivalence.note ? (
                              <p className="text-xs leading-5 text-muted">{equivalence.note}</p>
                            ) : null}
                            {equivalence.warning ? (
                              <p className="mt-0.5 flex items-start gap-1 text-xs font-medium leading-5 text-amber-700 dark:text-amber-300">
                                <AlertTriangle aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1">{equivalence.warning}</span>
                              </p>
                            ) : null}
                          </>
                        ) : sub.quantity != null && sub.unit ? (
                          <p className="text-xs leading-5 text-muted">{`${sub.quantity} ${sub.unit}`}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar reemplazo ${sub.displayName ?? sub.customName ?? ''}`}
                        disabled={isPending}
                        onClick={() => handleRemoveSubstitution(sub, subIndex)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-control border border-border-subtle text-muted transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div>
              {/* Familia N: el alta de un reemplazo es un alta de ALIMENTO (abre el mismo picker
                  del catálogo), así que lleva monedas de categoría y no un ícono suelto — dos y
                  no tres, que es la cuenta de un reemplazo: lo prescrito y lo que lo sustituye.
                  Handler, límite y flujo del sheet, idénticos. */}
              <AddActionButton
                stack={SUBSTITUTION_STACK}
                label={QE_COPY.addSubstitution}
                brandColor={brandHex}
                disabled={isPending || substitutions.length >= MAX_ITEM_SUBSTITUTIONS}
                onClick={() => {
                  setSubsOpen(false)
                  setSubsPickerOpen(true)
                }}
                className="w-full justify-center"
                data-testid="qe-add-substitution"
              />
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
