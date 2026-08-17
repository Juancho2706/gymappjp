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
import Image from 'next/image'
import { Check, ChevronDown, Copy, CopyCheck, MoreVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import { formatNutritionDayOfWeek } from '@eva/nutrition-v2'
import { AddActionButton, NutritionCard, useBrandPrimaryHex } from '@/components/nutrition-v2'
import { MacroSparkPopover } from '@/components/nutrition-v2/MacroSparkPopover'
import { foodCategoryIconUrl } from '@/lib/food-image'
import {
  foodCategoryIconUrlFromName,
  resolveFoodImageUrl,
} from '@/app/coach/nutrition-v2/_components/food-card-presentation'
import {
  qeSlotCopyTargets,
  qeSlotPortionTotals,
  qeSlotSubtotal,
  qeCombineSubtotals,
  qeVariantTotalWithPortions,
  SLOT_INSTRUCTIONS_MAX,
  type FoodCatalogItem,
  type QeItem,
  type QePortionTarget,
  type QeSlot,
} from '@eva/nutrition-v2'
import type { FoodPickerSummary } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { RememberedQuantitiesContext } from '../../_components/RememberedQuantitiesContext'
import { QeBottomSheet } from './QeBottomSheet'
import { QeNoteButton } from './QeNoteButton'
import { EditableItemRow } from './EditableItemRow'
import { EditablePortionsCard } from './EditablePortionsCard'
import { FoodPickerSheet } from './FoodPickerSheet'
import { QE_COPY } from './microcopy'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

/** Ventana del Deshacer, la misma de `EditableItemRow` y del wizard: una sola gramática. */
const UNDO_TOAST_MS = 8000

/** Base publica del bucket de fotos (mismo camino que la fila y el picker: URL directa, cero transformaciones). */
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

/** Fotos que entran en el stack de la franja contraida antes del «+n» (mockup «Cabina v2» A·1/A·2). */
const STACK_MAX_THUMBS = 4

/**
 * Las tres monedas del botón «Agregar alimento» (Familia N): carbohidrato · proteína · verdura.
 * Son los MISMOS íconos estáticos de categoría que ya usa la fila y el picker (`/food-icons/*`,
 * parte del build), no assets nuevos. El trío no describe lo que hay en la franja: es la firma
 * visual de «acá se agrega comida».
 */
const ADD_FOOD_STACK = [
  foodCategoryIconUrl('carbohidrato'),
  foodCategoryIconUrl('proteina'),
  foodCategoryIconUrl('verdura'),
] as const

export function EditableSlotCard({
  variantKey,
  slot,
  index,
}: {
  variantKey: string
  slot: QeSlot
  index: number
}) {
  const { clientId, state, dispatch, errors, showErrors, isPending, exchangeGroups, portionGroups } =
    useQuickEdit()
  // Porcion pegajosa (T2.6 F4): mapa foodId → ultima cantidad, resuelto server-side. Solo el
  // editor unico monta el provider; en el quick-edit clasico esto es {} (sin cambios).
  const rememberedQuantities = useContext(RememberedQuantitiesContext)
  // Marca del coach de ESTA pantalla (white-label): pinta el «+» de las pastillas de alta. Fuera
  // del panel (harness) es null y la Familia N cae al primary de EVA.
  const brandHex = useBrandPrimaryHex()
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
  // Meta de kcal del DÍA (no de la franja): habilita el «{n}% de la meta» del popover del
  // subtotal. Sin meta cargada (texto vacío o no numérico) el popover simplemente no lo dice.
  const dayTargetCalories =
    Number.isFinite(summaryTargetCalories) && summaryTargetCalories > 0 ? summaryTargetCalories : null
  // Orden del catálogo del plan: es el `sortOrder` con el que `exchangeGroupColor` elige el color
  // de identidad de cada grupo. Misma fuente y mismo criterio que `EditablePortionsCard`, para que
  // el punto de la pill y el de la fila con stepper nunca tengan colores distintos.
  const portionGroupOrder = useMemo(
    () => new Map(portionGroups.map((group, groupIndex) => [group.exchangeGroupId, groupIndex])),
    [portionGroups],
  )
  // Las pills de grupo son el sustituto de la sección de porciones mientras está escondida: con la
  // franja abierta, `EditablePortionsCard` ya la muestra entera (y editable) tres píxeles más
  // arriba. Sin pills ni nota, el strip no se pinta: nada de filetes punteados vacíos.
  const showPortionPills = collapsed && slot.portionTargets.length > 0
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

  /**
   * Alta de alimento LIBRE desde el pie de la franja: la misma acción que ya despachaba el picker
   * en `onPickCustom` (`ADD_CUSTOM_ITEM`), sin nombre precargado porque acá no hubo búsqueda que
   * reusar — la fila entra vacía y el coach le escribe el nombre encima.
   */
  function handleAddFreeFood() {
    dispatch({ type: 'ADD_CUSTOM_ITEM', variantKey, slotKey: slot.key, key: genQuickEditKey() })
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
    <NutritionCard
      /* Guía Viva: la PRIMERA franja del día es el paso «Franjas que se leen solas», y de ella
         cuelgan los otros dos anclas que viven adentro (el ⋮ del primer alimento y la sección de
         porciones). Se ancla una sola franja —la primera— porque el recorte del tour ilumina UN
         elemento: con el atributo en todas, el paso apuntaría a la que el DOM devuelva primero
         igual, pero cualquier reordenamiento cambiaría a cuál. `undefined` no renderiza atributo:
         las demás franjas quedan exactamente como estaban. */
      data-tour={index === 0 ? 'slot' : undefined}
    >
      {/* Header v2 (mockup «Cabina v2» A·1): nombre · hora · [stack de fotos si esta contraida] ·
          spark del subtotal · contraer · ⋮. Envuelve (`flex-wrap`) en vez de comprimir: en 390 px
          el nombre y la hora quedan en la primera linea y el bloque de la derecha baja entero.
          Fix F4 del QA visual: a 1024 el lienzo es la columna MAS angosta de todo el editor (rail +
          paleta se llevan los costados) y la base de 12rem del nombre alcanzaba para tirar el spark
          y los dos botones a una segunda linea casi vacia. Desde `md:` la base baja a 8rem — como
          el input igual es `flex-1`, su ancho RENDERIZADO no cambia cuando entra en una linea: lo
          unico que cambia es la decision de wrap. Y si igual llega a envolver (nombre larguisimo,
          zoom), `justify-end` en vez de `ml-auto` hace que la segunda linea se pegue entera a la
          derecha en lugar de dejar el hueco muerto que reporto el owner. */}
      <div className="flex flex-wrap items-start justify-end gap-2">
        <div className="min-w-0 flex-1 basis-48 md:basis-32">
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
        {/* QA owner 17-08 (2ª ronda): cuando este bloque envuelve a su propia línea (<md), pegado
            entero a la derecha dejaba un hueco muerto gigante a la izquierda del kcal. En esa
            línea ahora ocupa todo el ancho y el spark (con el stack) se va a la izquierda
            (`mr-auto`) mientras los botones quedan a la derecha. En ≥md no cambia nada. */}
        <div className="flex min-h-11 shrink-0 items-center gap-2 max-md:w-full">
          {/* Contraída: qué lleva la franja SIN abrirla. El stack de fotos es la versión de un
              vistazo de la lista que el body esconde; decorativo (`aria-hidden`) porque el spark
              de al lado ya anuncia el subtotal y el botón de contraer nombra la franja. La franja
              solo-porciones no tiene fotos que apilar: sus grupos se leen en el strip del pie. */}
          {collapsed && slot.items.length > 0 ? <SlotItemStack items={slot.items} /> : null}

          {/* Subtotal de la franja (items + porciones: el MISMO número de antes): una cifra y la
              barra apilada. Los gramos exactos viven en el popover (SPEC D3), que además dice qué
              porcentaje de la meta de kcal del día se lleva esta franja. */}
          <span className="inline-flex min-w-0 items-center max-md:mr-auto">
            <MacroSparkPopover
              size="md"
              calories={subtotal.calories}
              proteinG={subtotal.proteinG}
              carbsG={subtotal.carbsG}
              fatsG={subtotal.fatsG}
              fiberG={subtotal.fiberG > 0 ? subtotal.fiberG : null}
              targetCalories={dayTargetCalories}
              ariaContext={`Subtotal de ${slotLabel}`}
            />
          </span>

          {/* Contraer/expandir: con 5-6 comidas por día la pila obliga a scrollear a ciegas.
              Contraída, la card sigue diciendo lo único que importa de un vistazo: nombre, hora,
              su subtotal con las macros completas y el stack de fotos.

              Pasada 2 (hallazgo 3 del owner: «el chevron es un fantasma»). El botón tenía el MISMO
              traje que el ⋮ de al lado —fondo de card sobre card— así que no se leía como algo que se
              pueda apretar. Ahora arranca hundido (`bg-surface-sunken`) con borde de contorno, que es
              como el DS pinta un control disponible sobre una card, y el hover lo ENCIENDE: sube al
              plano de la card y toma el color de marca. Los 44 px y el contrato aria no se tocan. */}
          <button
            type="button"
            aria-label={collapsed ? QE_COPY.expandSlot(slotLabel) : QE_COPY.collapseSlot(slotLabel)}
            aria-expanded={!collapsed}
            aria-controls={slotBodyId}
            onClick={() => setCollapsed((previous) => !previous)}
            className="h-11 w-11 shrink-0 rounded-control border border-border-default bg-surface-sunken text-body transition-colors hover:border-primary/40 hover:bg-surface-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* Media vuelta al abrir/cerrar: la punta señala hacia dónde va el cuerpo (abajo = «se
                abre», arriba = «se cierra»). `motion-reduce` la deja instantánea. */}
            <ChevronDown
              aria-hidden="true"
              className={
                'mx-auto h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ' +
                (collapsed ? 'rotate-0' : 'rotate-180')
              }
            />
          </button>
          {/* Nota del coach de la franja (N-B, `docs/specs/nutrition-coach-notes`): el 📝 vive
              en la fila de controles EXISTENTE (invariante «cero solapes nuevos») y ningún ancla
              del tour se mueve — `data-tour="slot"` sigue en la card. SIN nota lleva el traje del
              ⋮ de al lado; CON nota se tiñe de la marca (ese tinte es el indicador: la banda con
              el texto es del alumno, acá el coach la lee en el sheet). */}
          <QeNoteButton
            subject={slotLabel}
            value={slot.instructions}
            maxLength={SLOT_INSTRUCTIONS_MAX}
            placeholder={QE_COPY.notePlaceholderSlot}
            disabled={isPending}
            error={showErrors ? errors[`slot.${slot.key}.instructions`] : undefined}
            onChange={(value) =>
              dispatch({ type: 'SET_SLOT_INSTRUCTIONS', variantKey, slotKey: slot.key, value })
            }
          />
          <button
            type="button"
            aria-label={`Opciones de la franja ${slot.name || 'sin nombre'}`}
            disabled={isPending}
            onClick={() => setMenuOpen(true)}
            className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <MoreVertical aria-hidden="true" className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sheets del header (menú ⋮ y copia a otros días): fuera de la fila flex — se portalean,
          así que como hijos de un contenedor `flex-wrap` solo aportaban ítems vacíos al wrap. */}
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

      {/* Cuerpo de la franja con colapso ANIMADO (hallazgo 3): el patrón `grid-template-rows` de
          `0fr` a `1fr` sobre un envoltorio con `overflow-hidden` adentro — la misma técnica que ya usa
          el ejecutor (`.exec-v3-ss-body` en globals.css). Anima la altura REAL sin medirla en JS, así
          que no hay ni un `useEffect` ni un ResizeObserver de por medio y la card puede crecer o
          encogerse (agregar un alimento, abrir porciones) sin recalcular nada.

          Contraída sigue siendo invisible Y fuera de alcance: `inert` la saca del tab-order y de la
          accesibilidad —lo que hacía `hidden`—, mientras el `id`/`aria-controls`/`aria-expanded` del
          botón quedan intactos. `prefers-reduced-motion` desactiva la transición (`motion-reduce`). */}
      <div
        className={
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ' +
          (collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')
        }
      >
      <div id={slotBodyId} inert={collapsed} className="min-h-0 overflow-hidden">
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
                /* Guía Viva: el paso «El ⋮ guarda los superpoderes» ilumina el menú del PRIMER
                   alimento de la PRIMERA franja. La fila no puede saber sola que es esa (no conoce
                   el índice de su franja), así que la decisión baja desde acá como bandera. */
                tourMenuTarget={index === 0 && itemIndex === 0}
              />
            ))
          )}
        </div>

        {/* Pie de la franja (Familia N): las dos altas de alimento, una al lado de la otra.
            «Agregar alimento» lleva el STACK de tres monedas de categoría —la silueta que dice
            «esto agrega comida» sin leer— y «Alimento libre» va punteado (hueco por llenar), el
            mismo idioma que «Agregar día». Los handlers son los de siempre: el primero abre el
            picker (que además ofrece el alta libre con el texto buscado precargado) y el segundo
            despacha el alta libre en seco, la misma acción que `onPickCustom` sin nombre. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AddActionButton
            stack={ADD_FOOD_STACK}
            label={QE_COPY.addFood}
            brandColor={brandHex}
            disabled={isPending}
            onClick={() => setAddOpen(true)}
            data-testid="qe-add-food"
            /* Guía Viva, guion CORTO (<768 y RN): ahí no hay paleta lateral y el paso del catálogo
               apunta a esta alta (`EDITOR_TOUR_STEPS_COMPACT`, target `agregar`). En ≥768 el guion
               largo usa `paleta` y este ancla queda sin consultar. */
            data-tour={index === 0 ? 'agregar' : undefined}
          />
          <AddActionButton
            icon="libre"
            variant="dashed"
            label={QE_COPY.freeFood}
            brandColor={brandHex}
            disabled={isPending}
            onClick={handleAddFreeFood}
            data-testid="qe-add-free-food"
          />
        </div>

        {/* Seccion "Porciones a eleccion" (SPEC UX-a): hermana de los items, bajo "+ Alimento".
            Se pinta sola solo si el plan usa porciones (capa invisible si no). */}
        {/* `tourTarget`: la sección de porciones de la PRIMERA franja es la que ilumina el paso
            «Porciones a elección» (mismo criterio que el ⋮ de arriba). */}
        <EditablePortionsCard variantKey={variantKey} slot={slot} tourTarget={index === 0} />
      </div>
      </div>

      {/* Pie v2 (mockup A·1, `q-portions`): la fila «Subtotal franja + chips» ya no existe — el
          subtotal vive en el spark del header, con sus gramos a un hover/tap. Lo que queda es el
          strip de porciones: filete punteado, pills con el color de identidad del grupo y el
          aporte referencial. Las pills solo aparecen CONTRAÍDA (expandida, `EditablePortionsCard`
          ya muestra los mismos grupos con sus steppers justo arriba: repetirlos sería ruido). */}
      {showPortionPills || portionTotals ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-border-subtle pt-2.5">
          {showPortionPills ? (
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {PORTIONS_COPY.builder.sectionTitle}
              </span>
              {slot.portionTargets.map((target) => (
                <PortionGroupPill
                  key={target.key}
                  target={target}
                  sortOrder={portionGroupOrder.get(target.exchangeGroupId) ?? 0}
                />
              ))}
            </>
          ) : null}
          {portionTotals ? (
            // Redondeo entero + prefijo ~: valor referencial (mismo copy que el builder). Lo que
            // se LEE es la forma corta del mockup («≈ 118 kcal»); la nota completa de siempre
            // viaja igual en el DOM para lector de pantalla y como `title` al pasar el mouse.
            <span
              className="ml-auto font-mono text-[11px] tabular-nums text-muted"
              title={PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
            >
              <span aria-hidden="true">{`≈ ${Math.round(portionTotals.calories)} kcal`}</span>
              <span className="sr-only">
                {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

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

/**
 * Stack de fotos de la franja contraída (mockup «Cabina v2» A·1/A·2): hasta cuatro miniaturas de
 * 22 px solapadas, con anillo del color de la card para que se lean como una baraja, y «+n» si
 * quedan más. Mismo camino de imagen que la fila (`EditableItemRow`) y el picker: URL pública
 * directa del bucket y respaldo garantizado al ícono de categoría — cero Image Transformations
 * (cuota) y cero huecos vacíos.
 *
 * Decorativo a propósito (`aria-hidden`): la lista real vive en el body de la card, y cuando está
 * contraída el subtotal ya se anuncia por el `aria-label` del spark de al lado.
 */
function SlotItemStack({ items }: { items: QeItem[] }) {
  const shown = items.slice(0, STACK_MAX_THUMBS)
  const rest = items.length - shown.length

  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {shown.map((item, thumbIndex) => {
        const media = item.food?.media ?? item.media
        const imageUrl = resolveFoodImageUrl(media as FoodCatalogItem['media'], SUPABASE_BASE)
        const category = item.food?.category ?? item.category
        const iconUrl = category
          ? foodCategoryIconUrl(category)
          : foodCategoryIconUrlFromName(item.displayName)
        return (
          <span
            key={item.key}
            className={
              'relative grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-md bg-surface-sunken ring-2 ring-surface-card ' +
              (thumbIndex > 0 ? '-ml-2' : '')
            }
          >
            {imageUrl ? (
              <Image
                alt=""
                src={imageUrl}
                width={22}
                height={22}
                unoptimized
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center bg-primary/10">
                <Image
                  alt=""
                  src={iconUrl}
                  width={14}
                  height={14}
                  unoptimized
                  loading="lazy"
                  className="h-3.5 w-3.5 object-contain"
                />
              </span>
            )}
          </span>
        )
      })}
      {rest > 0 ? (
        <span className="-ml-2 grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-md bg-surface-sunken px-1 font-mono text-[9px] font-bold tabular-nums text-muted ring-2 ring-surface-card">
          {`+${rest}`}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Pill de un grupo de porciones en el strip del pie: punto con el color de identidad del grupo
 * (el del catálogo, vía `exchangeGroupColor` — NO es un color de macro) + nombre + «×n».
 * Presentación pura: quien edita las porciones sigue siendo `EditablePortionsCard`.
 */
function PortionGroupPill({ target, sortOrder }: { target: QePortionTarget; sortOrder: number }) {
  const portions = target.portions.trim()
  return (
    <span className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-card px-2 py-0.5 text-[11px] font-semibold text-body">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
        style={{ backgroundColor: exchangeGroupColor({ color: target.color, sortOrder }) }}
      />
      <span className="truncate">{target.groupName}</span>
      {portions !== '' ? <span className="shrink-0 font-mono tabular-nums">{`×${portions}`}</span> : null}
    </span>
  )
}
