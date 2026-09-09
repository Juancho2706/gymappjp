'use client'

/**
 * Seccion "Porciones a eleccion" del quick-edit (SPEC UX-a, T1.2): hermana de la lista de
 * alimentos DENTRO de la card de franja (EditableSlotCard la monta bajo "+ Agregar
 * alimento"). Misma fila grupo+stepper del builder: circulito con el codigo del grupo
 * (color de identidad `exchangeGroupColor`, letra blanca) + nombre + StepperField adaptado
 * a paso 0,5 (minimo 0,5) + eliminar con snackbar Deshacer. Altas via picker (bottom sheet en
 * movil, dialogo centrado en desktop) con los grupos del plan MAS el catalogo vivo del coach
 * (`portionGroupChoices`): hasta 08-04 solo ofrecia los del plan y el coach que queria sumar
 * otro grupo veia una lista donde todo decia "Ya está en esta comida".
 *
 * F4: el conteo de equivalencias (`portionFoodCounts` del provider) SI viene del catalogo
 * vivo — es la unica lectura viva de esta seccion, y es informativa: dice cuantos alimentos
 * vera el alumno en "1 porción equivale a" y avisa el grupo vacio, que es el defecto real
 * (el alumno abre el sheet y no encuentra ningun ejemplo). Si no llega, se calla.
 *
 * Tren «Porciones a la chilena» (W2.7/W2.8): el picker se parte en tres secciones —set del
 * coach, propios y «Legado (SMAE)» colapsable— SOBRE la lista ya mergeada (`mergePortionGroupChoices`
 * NO se toca: su orden «plan primero, catalogo despues» esta fijado por test), la fila ya usada
 * deja de estar `disabled` y sumar media porcion (D2-A), y la etiqueta «1 porción =» expande los
 * grupos compuestos con `qeGroupRefPerPortion` (Legumbres decia «0 kcal»).
 *
 * Los cambios cuentan en la barra "N cambios sin publicar" y publican por el pipeline
 * existente (persistAndPublishDraft congela snapshots server-side; cero RPC nuevo).
 * Plan sin porciones => la seccion NO se pinta (capa invisible, SPEC UX-c).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import { AddActionButton, useBrandPrimaryHex } from '@/components/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { useCaptureNutritionPortionGroupBumped } from '@/lib/posthog/events'
import {
  PORTION_MAX,
  PORTION_NOTES_MAX,
  PORTION_STEP,
  SYSTEM_EXCHANGE_CODES,
  comparePickerGroups,
  findPortionTargetByGroup,
  formatPortionsEsCl,
  parsePortionsValue,
  portionsAfterBump,
  qeExchangeGroups,
  qeGroupRefLabel,
  qeGroupRefPerPortionFromDict,
  systemOf,
  visibleExchangeGroupsForCoach,
  type PortionSystem,
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
} from '@eva/nutrition-v2'
import { useQuickEdit, genQuickEditKey, type PortionCatalogMeta } from './QuickEditProvider'
import { QeBottomSheet } from './QeBottomSheet'
import { QeNoteButton } from './QeNoteButton'
import { StepperField } from './StepperField'
import { QE_COPY } from './microcopy'

/**
 * Linea de apoyo con las equivalencias del grupo. `undefined` = el conteo no viajo y NO se
 * pinta nada: mejor callar que mentir un cero (misma semantica que `foodsHint` del picker del
 * builder, `PortionsGroupPicker`).
 */
function foodsHint(count: number | undefined): { text: string; empty: boolean } | null {
  if (count == null) return null
  if (count === 0) return { text: PORTIONS_COPY.builder.groupFoodsEmpty, empty: true }
  return { text: PORTIONS_COPY.builder.groupFoodCount(count), empty: false }
}

/** Circulito de identidad del grupo: color del catalogo SOLO aqui, letra blanca (SPEC UX). */
function GroupDot({ group, sortOrder }: { group: { groupCode: string; color: string | null }; sortOrder: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
      style={{ backgroundColor: exchangeGroupColor({ color: group.color, sortOrder }) }}
    >
      {group.groupCode.slice(0, 3)}
    </span>
  )
}

/**
 * Grupo del picker con lo que la particion resolvio para ESTE coach.
 *
 * Dos ordenes que NO son el mismo, y por eso son dos campos:
 * - `sortOrder`: el `sort_order` REAL del catalogo (210-330 en el set chileno). Es lo que ordena
 *   las filas dentro de cada seccion via `comparePickerGroups`, para que «Sistema chileno» salga
 *   en el orden del catalogo (PCT, CB…) del mockup y no en «plan primero, catalogo despues».
 * - `colorIndex`: la posicion en la lista YA mergeada. Solo alimenta el color del `GroupDot`
 *   (`exchangeGroupColor` cae a una paleta por indice cuando el grupo no tiene color propio):
 *   se conserva tal cual estaba para que ningun circulito cambie de color con este fix.
 */
type PickerGroup = QePortionGroup & {
  sortOrder: number
  colorIndex: number
  isSystem: boolean
  legacy: boolean
}

/**
 * Parte la lista YA mergeada en las tres secciones del picker (W1.7(b) / W2.7). Se hace ACA, en
 * el consumidor, y no en `mergePortionGroupChoices` (`editor-state.ts:641-650`), cuyo orden
 * «plan primero, catalogo despues» esta fijado por `quick-edit-state.test.ts:578` y no se toca.
 *
 * La REGLA de visibilidad no se reescribe: se reusa `visibleExchangeGroupsForCoach`, la misma
 * funcion pura que aplican la ruta movil y RN. Como esa funcion opera sobre `ExchangeGroup` y el
 * picker recibe `QePortionGroup` (sin `isSystem` ni `sortOrder`: el snapshot congelado no los
 * guarda), se le pasa un shim y se vuelve al objeto original por id.
 *
 * `isSystem` y `sortOrder` salen del CATALOGO VIVO (`portionCatalogMeta` del provider), no del
 * codigo: `exchange_groups_system_code_uq` es un indice PARCIAL (solo `is_system`), asi que un
 * grupo PROPIO del coach puede llamarse 'C' o 'FR'; darlo por system lo dejaria fuera del picker
 * de un coach 'cl' sin legado vivo —el coach perderia su propio grupo—. `SYSTEM_EXCHANGE_CODES`
 * queda solo como fallback para los grupos que no estan en el catalogo (snapshot de un grupo
 * borrado) o cuando el catalogo no llego: es el MISMO criterio que usa `reconstructExchangeGroups`
 * (`read-models.ts:718`).
 */
export function partitionPickerGroups(
  groups: readonly QePortionGroup[],
  coachSystem: PortionSystem,
  usedSystems: readonly PortionSystem[] | undefined,
  catalogMeta?: PortionCatalogMeta | null,
): { own: PickerGroup[]; custom: PickerGroup[]; legacy: PickerGroup[] } {
  const byId = new Map<string, { group: QePortionGroup; index: number }>()
  groups.forEach((group, index) => {
    if (!byId.has(group.exchangeGroupId)) byId.set(group.exchangeGroupId, { group, index })
  })

  const shims = [...byId.values()].map(({ group, index }) => {
    const meta = catalogMeta?.get(group.exchangeGroupId)
    return {
      id: group.exchangeGroupId,
      slug: group.groupCode.toLowerCase(),
      code: group.groupCode,
      name: group.groupName,
      coachId: null,
      teamId: null,
      isSystem: meta?.isSystem ?? SYSTEM_EXCHANGE_CODES.has(group.groupCode),
      refCalories: group.ref.calories,
      refProteinG: group.ref.proteinG,
      refCarbsG: group.ref.carbsG,
      refFatsG: group.ref.fatsG,
      color: group.color,
      // Sin catalogo no hay orden que respetar y se conserva el de la lista mergeada; con
      // catalogo, el grupo que no esta en el (borrado, pero congelado en el plan) va al final
      // de su seccion y desempata por codigo, en vez de colarse entre los del catalogo.
      sortOrder: meta?.sortOrder ?? (catalogMeta == null ? index : Number.MAX_SAFE_INTEGER),
      composedOf: null,
      macrosConfirmed: group.macrosConfirmed,
      portionSystem: group.portionSystem,
    }
  })

  const own: PickerGroup[] = []
  const custom: PickerGroup[] = []
  const legacy: PickerGroup[] = []
  for (const visible of visibleExchangeGroupsForCoach({ groups: shims, coachSystem, usedSystems })) {
    const entry = byId.get(visible.id)
    if (!entry) continue
    const row: PickerGroup = {
      ...entry.group,
      sortOrder: visible.sortOrder,
      colorIndex: entry.index,
      isSystem: visible.isSystem,
      legacy: visible.legacy,
    }
    if (visible.legacy) legacy.push(row)
    else if (!visible.isSystem) custom.push(row)
    else own.push(row)
  }
  own.sort(comparePickerGroups)
  custom.sort(comparePickerGroups)
  legacy.sort(comparePickerGroups)
  return { own, custom, legacy }
}

export function EditablePortionsCard({
  variantKey,
  slot,
  tourTarget = false,
  onConvertClick,
}: {
  variantKey: string
  slot: QeSlot
  /**
   * Guía Viva: esta sección es la que ilumina el paso «Porciones a elección». Solo agrega el
   * atributo `data-tour` — cero cambios de estilo o comportamiento. Lo decide `EditableSlotCard`,
   * que sabe cuál de sus franjas es la primera. En un plan SIN capa de porciones esta card no se
   * pinta y el paso queda sin recorte (el motor centra la tarjeta): es correcto, no hay nada que
   * enseñar ahí.
   */
  tourTarget?: boolean
  /**
   * CARCASA del banner del plan legado (W2.7; el cableado es de W3.6). Sin este handler el banner
   * NO se monta: antes de que exista el conversor no hay nada que ofrecer y un banner con un CTA
   * muerto es peor que ningún banner.
   */
  onConvertClick?: () => void
}) {
  const {
    portionGroups,
    portionGroupChoices,
    portionCatalogMeta,
    portionSystem,
    portionLegacySystems,
    portionSystemsDegraded,
  } = useQuickEdit()
  const [pickerOpen, setPickerOpen] = useState(false)
  // Resalte de la fila que acaba de recibir el bump (M3). El `nonce` existe para que dos bumps
  // seguidos al MISMO grupo vuelvan a disparar el resalte y el scroll.
  const [bump, setBump] = useState<{ groupId: string; nonce: number } | null>(null)
  // Antes del early-return de abajo: los hooks no pueden quedar detrás de un `return null`.
  const brandHex = useBrandPrimaryHex()
  const reduceMotion = useReducedMotion()
  /**
   * «Ahora no» apaga el banner SOLO en esta instancia y en esta vida del componente.
   *
   * TODO(W3.6) — dos deudas, no una, y las dos se pagan cuando el conversor exista (en W2 nadie
   * pasa `onConvertClick`: esto es carcasa muerta, por eso no se resuelve antes):
   *  1. `EditablePortionsCard` se monta UNA VEZ POR FRANJA (`EditableSlotCard`), asi que apenas
   *     llegue el handler el banner se repetiria en cada comida y «Ahora no» apagaria solo esa.
   *     SPEC §7.2 lo quiere UNA sola vez por plan ⇒ el banner tiene que subir a la superficie que
   *     conoce el plan entero, o al menos su estado tiene que vivir arriba de las franjas.
   *  2. SPEC §7.2 pide esconderlo 30 dias por `planId` en `localStorage`; el `planId` no esta en
   *     este contexto. Sin (1) resuelto, persistir por franja seria una persistencia a medias.
   */
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    if (!bump) return
    const timer = window.setTimeout(() => setBump(null), 1200)
    return () => window.clearTimeout(timer)
  }, [bump])

  // Plan sin capa de porciones: CERO UI nueva (SPEC UX-c). Los grupos elegibles derivan
  // del read model, asi que un plan sin targets nunca pinta esta seccion.
  if (portionGroups.length === 0 && slot.portionTargets.length === 0) return null

  const groupOrder = new Map(portionGroups.map((group, index) => [group.exchangeGroupId, index]))
  const showBanner = onConvertClick != null && !bannerDismissed

  return (
    <section
      aria-label={PORTIONS_COPY.builder.sectionTitle}
      data-tour={tourTarget ? 'porciones' : undefined}
      className="mt-3 border-t border-border-subtle pt-3"
    >
      <p className="text-sm font-medium text-strong">{PORTIONS_COPY.builder.sectionTitle}</p>
      <p className="mt-0.5 text-xs text-muted">{PORTIONS_COPY.builder.sectionHint}</p>

      {showBanner ? (
        <div className="mt-2 rounded-card border border-border-subtle bg-surface-card p-3">
          <p className="text-sm font-semibold text-strong">{PORTIONS_COPY.convert.bannerTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{PORTIONS_COPY.convert.bannerBody}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onConvertClick}
              className="inline-flex h-11 items-center justify-center rounded-control bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PORTIONS_COPY.convert.bannerCta}
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="inline-flex h-11 items-center justify-center rounded-control px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PORTIONS_COPY.convert.bannerDismiss}
            </button>
          </div>
        </div>
      ) : null}

      {slot.portionTargets.length > 0 ? (
        <div className="mt-2 space-y-2">
          {slot.portionTargets.map((target, index) => (
            <PortionTargetRow
              key={target.key}
              variantKey={variantKey}
              slotKey={slot.key}
              target={target}
              index={index}
              sortOrder={groupOrder.get(target.exchangeGroupId) ?? 0}
              highlighted={bump?.groupId === target.exchangeGroupId}
              highlightNonce={bump?.groupId === target.exchangeGroupId ? bump.nonce : 0}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      ) : null}

      {portionGroupChoices.length > 0 ? (
        // Familia N: el alta de un grupo de porciones comparte silueta con el resto de las altas
        // del editor (ícono ilustrado + «+» en el acento de marca). Mismo handler: abre el picker
        // de grupos del catálogo del coach.
        <div className="mt-2">
          <AddActionButton
            icon="porciones"
            label={PORTIONS_COPY.builder.addGroup}
            brandColor={brandHex}
            onClick={() => setPickerOpen(true)}
            data-testid="qe-add-portion-group"
          />
        </div>
      ) : null}

      {/* Una sola vez por seccion (no por fila): que pasa con lo que ya esta publicado. */}
      <p className="mt-2 rounded-control bg-surface-sunken px-2 py-1.5 text-[11px] leading-relaxed text-muted">
        {QE_COPY.portionsPublishNotice}
      </p>

      <GroupPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        groups={portionGroupChoices}
        slot={slot}
        onPicked={() => setPickerOpen(false)}
        onBumped={(groupId) => setBump((prev) => ({ groupId, nonce: (prev?.nonce ?? 0) + 1 }))}
        variantKey={variantKey}
        coachSystem={portionSystem}
        legacySystems={portionLegacySystems}
        degraded={portionSystemsDegraded}
        catalogMeta={portionCatalogMeta}
      />
    </section>
  )
}

function PortionTargetRow({
  variantKey,
  slotKey,
  target,
  index,
  sortOrder,
  highlighted,
  highlightNonce,
  reduceMotion,
}: {
  variantKey: string
  slotKey: string
  target: QePortionTarget
  index: number
  sortOrder: number
  /** La fila acaba de recibir un bump desde el picker: anillo de marca + scroll a la vista. */
  highlighted: boolean
  highlightNonce: number
  reduceMotion: boolean
}) {
  const { dispatch, errors, showErrors, isPending, portionFoodCounts } = useQuickEdit()
  const portionsError = showErrors ? errors[`portion.${target.key}.portions`] : undefined
  // Grupo sin equivalencias: el alumno vera el chip y podra marcar porciones, pero el sheet
  // "1 porción equivale a" le sale vacio. Se avisa ACA, donde el coach ya decidio usarlo.
  const sinAlimentos = portionFoodCounts?.[target.exchangeGroupId] === 0
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!highlighted) return
    const node = rowRef.current
    // jsdom no implementa `scrollIntoView`: sin el guard el test del bump reventaria.
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }, [highlighted, highlightNonce, reduceMotion])

  function handleRemove() {
    const removed = target
    dispatch({ type: 'REMOVE_PORTION_TARGET', variantKey, slotKey, targetKey: target.key })
    toast(PORTIONS_COPY.builder.groupRemoved(removed.groupName), {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_PORTION_TARGET', variantKey, slotKey, index, target: removed }),
      },
    })
  }

  return (
    <div
      ref={rowRef}
      data-portion-group-id={target.exchangeGroupId}
      data-highlighted={highlighted ? 'true' : undefined}
      className={
        'rounded-control ' +
        (highlighted ? 'ring-2 ring-primary/60 ' : '') +
        (reduceMotion ? '' : 'transition-[box-shadow] duration-700')
      }
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GroupDot group={target} sortOrder={sortOrder} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-strong">{target.groupName}</span>
            {!target.macrosConfirmed ? (
              <span className="block truncate text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                {PORTIONS_COPY.builder.referentialBadge}
              </span>
            ) : null}
          </span>
        </div>
        {/* Stepper de ancho fijo (SPEC UX-a: en <380px trunca el nombre, nunca el stepper). */}
        <div className="w-36 shrink-0">
          <StepperField
            label={`Porciones de ${target.groupName}`}
            value={target.portions}
            invalid={Boolean(portionsError)}
            disabled={isPending}
            onChange={(value) =>
              dispatch({ type: 'SET_PORTION_TARGET', variantKey, slotKey, targetKey: target.key, value })
            }
            onStep={(direction) =>
              dispatch({ type: 'STEP_PORTION_TARGET', variantKey, slotKey, targetKey: target.key, direction })
            }
          />
        </div>
        {/* Nota del coach del grupo (N-B, `docs/specs/nutrition-coach-notes`): mismo 📝 de la
            franja, sobre `target.notes` (≤1000). En <380px el que trunca sigue siendo el nombre
            (SPEC UX-a): stepper, nota y basurero son de ancho fijo. */}
        <QeNoteButton
          subject={target.groupName}
          value={target.notes}
          maxLength={PORTION_NOTES_MAX}
          placeholder={QE_COPY.notePlaceholderGroup}
          disabled={isPending}
          error={showErrors ? errors[`portion.${target.key}.notes`] : undefined}
          onChange={(value) =>
            dispatch({ type: 'SET_PORTION_NOTES', variantKey, slotKey, targetKey: target.key, value })
          }
        />
        <button
          type="button"
          aria-label={`Quitar porciones de ${target.groupName}`}
          title="Quitar grupo"
          disabled={isPending}
          onClick={handleRemove}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-rose-400"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {sinAlimentos ? (
        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {PORTIONS_COPY.builder.groupFoodsEmpty}.{' '}
          <span className="font-normal text-muted">{PORTIONS_COPY.builder.groupFoodsEmptyHint}</span>
        </p>
      ) : null}
      {portionsError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{portionsError}</p> : null}
    </div>
  )
}

/**
 * Picker de altas (sheet en movil / dialogo en desktop), partido en tres secciones: el set del
 * coach, los grupos propios y «Legado (SMAE)» colapsado (solo si el coach todavia prescribe con
 * el set viejo). La fila que YA esta en la franja dejo de estar deshabilitada: tocarla suma media
 * porcion con toast deshacible (D2-A). El unico estado que sigue `disabled` es el tope 99.
 */
function GroupPickerSheet({
  open,
  onOpenChange,
  groups,
  slot,
  variantKey,
  onPicked,
  onBumped,
  coachSystem,
  legacySystems,
  degraded,
  catalogMeta,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: QePortionGroup[]
  slot: QeSlot
  variantKey: string
  onPicked: () => void
  onBumped: (exchangeGroupId: string) => void
  coachSystem: PortionSystem
  legacySystems: PortionSystem[]
  /** Modo degradado del loader: `usedSystems` viaja `undefined` ⇒ se muestra todo sin marcar. */
  degraded: boolean
  /** `isSystem` y `sort_order` reales del catalogo vivo; `null` = no llego (ver la particion). */
  catalogMeta: PortionCatalogMeta | null
}) {
  const { dispatch, portionFoodCounts } = useQuickEdit()
  const captureBump = useCaptureNutritionPortionGroupBumped()
  const [legacyOpen, setLegacyOpen] = useState(false)
  /**
   * Valor PREVIO capturado al CREAR el toast, por `id` de toast (SPEC §7.4). Mientras ese toast
   * siga vivo los bumps siguientes NO vuelven a capturar: dos taps + un «Deshacer» devuelven al
   * valor inicial de la interaccion, no al intermedio. Al expirar o cerrarse, la clave se borra y
   * el proximo bump abre una interaccion nueva.
   */
  const undoCapturesRef = useRef<Map<string, string>>(new Map())

  /**
   * `usedSystems` se REARMA acá como `[coachSystem, ...legacySystems]` porque el loader
   * (`portions-groups.actions.ts`, W1) no devuelve la lista cruda: devuelve `legacySystems`, que
   * es exactamente `usedSystems` MENOS el set del coach. La union es equivalente para lo unico
   * que `visibleExchangeGroupsForCoach` mira del arreglo (`includes(otherSystem)`), y el
   * `undefined` del modo degradado —el que de verdad cambia el resultado— viaja aparte en
   * `degraded`. Si algun dia la regla pasara a mirar el set propio, el arreglo tiene que salir
   * del loader tal cual se leyo, no reconstruirse acá.
   */
  const sections = useMemo(
    () =>
      partitionPickerGroups(
        groups,
        coachSystem,
        degraded ? undefined : [coachSystem, ...legacySystems],
        catalogMeta,
      ),
    [groups, coachSystem, legacySystems, degraded, catalogMeta],
  )

  /**
   * Diccionario del motor armado UNA vez por apertura del picker: `qeGroupRefPerPortion` lo
   * reconstruia entero en cada fila (22 veces con el set chileno completo). `renderRow` llama a
   * la variante `…FromDict`, que existe justamente para esto.
   */
  const refDict = useMemo(() => qeExchangeGroups(groups), [groups])

  /**
   * «Ya elegi en esta apertura» (PLAN §W2, riesgo (a)). El sheet tarda en desmontarse, asi que un
   * doble clic rapido alcanzaba a despachar DOS `BUMP_PORTION_TARGET` (+1 porcion entera) bajo un
   * solo toast: el coach veia +1 sin explicacion y el «Deshacer» —que restaura el valor capturado—
   * tapaba el sintoma sin explicarlo. Se resetea al cerrar, asi que reabrir vuelve a habilitar.
   */
  const pickedRef = useRef(false)
  useEffect(() => {
    if (!open) pickedRef.current = false
  }, [open])

  function handlePick(group: PickerGroup) {
    if (pickedRef.current) return
    pickedRef.current = true
    const existing = findPortionTargetByGroup(slot, group.exchangeGroupId)
    if (!existing) {
      dispatch({ type: 'ADD_PORTION_TARGET', variantKey, slotKey: slot.key, key: genQuickEditKey(), group })
      onPicked()
      return
    }

    const current = parsePortionsValue(existing.portions) ?? 0
    const next = portionsAfterBump(current, PORTION_STEP)
    const toastId = `portion-bump:${slot.key}:${group.exchangeGroupId}`
    const captures = undoCapturesRef.current
    if (!captures.has(toastId)) captures.set(toastId, existing.portions)
    const previous = captures.get(toastId) ?? existing.portions

    dispatch({ type: 'BUMP_PORTION_TARGET', variantKey, slotKey: slot.key, exchangeGroupId: group.exchangeGroupId })
    onBumped(group.exchangeGroupId)
    captureBump({
      groupCode: group.groupCode,
      portionSystem: systemOf(group, coachSystem),
      from: 'picker',
      undone: false,
    })

    // Mismo canal que el «quitar grupo» de la fila (sonner), con `id` estable: dos taps
    // ACTUALIZAN un solo toast en vez de apilar dos.
    toast(PORTIONS_COPY.builder.groupBumped(group.groupName, formatPortionsEsCl(next), slot.name), {
      id: toastId,
      duration: 5000,
      onDismiss: () => captures.delete(toastId),
      onAutoClose: () => captures.delete(toastId),
      action: {
        label: PORTIONS_COPY.builder.groupBumpedUndo,
        onClick: () => {
          dispatch({
            type: 'SET_PORTION_TARGET',
            variantKey,
            slotKey: slot.key,
            targetKey: existing.key,
            value: previous,
          })
          captures.delete(toastId)
          captureBump({
            groupCode: group.groupCode,
            portionSystem: systemOf(group, coachSystem),
            from: 'picker',
            undone: true,
          })
        },
      },
    })
    onPicked()
  }

  function renderRow(group: PickerGroup) {
    const target = findPortionTargetByGroup(slot, group.exchangeGroupId)
    const current = target ? (parsePortionsValue(target.portions) ?? 0) : null
    const atMax = current != null && current >= PORTION_MAX
    const foods = foodsHint(portionFoodCounts?.[group.exchangeGroupId])
    const subtitle =
      current == null
        ? qeGroupRefLabel(qeGroupRefPerPortionFromDict(group, refDict), { confirmed: group.macrosConfirmed })
        : atMax
          ? PORTIONS_COPY.builder.groupAtMax(slot.name)
          : PORTIONS_COPY.builder.groupUsedBump(slot.name, formatPortionsEsCl(current), 'web')

    return (
      <li key={group.exchangeGroupId}>
        <button
          type="button"
          disabled={atMax}
          data-legacy={group.legacy ? 'true' : undefined}
          onClick={() => handlePick(group)}
          className={
            'flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ' +
            (current != null ? 'bg-primary/10' : '')
          }
        >
          <GroupDot group={group} sortOrder={group.colorIndex} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-strong">{group.groupName}</span>
              {group.legacy ? (
                <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  {PORTIONS_COPY.builder.legacyBadge}
                </span>
              ) : !group.macrosConfirmed ? (
                <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  {PORTIONS_COPY.builder.referentialBadge}
                </span>
              ) : null}
            </span>
            <span
              className={
                'block truncate text-xs ' + (current != null ? 'font-medium text-primary' : 'text-muted')
              }
            >
              {subtitle}
            </span>
            {current == null && foods ? (
              <span
                className={
                  'block truncate text-[11px] ' +
                  (foods.empty ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-subtle')
                }
              >
                {foods.text}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    )
  }

  return (
    <QeBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={PORTIONS_COPY.builder.addGroup}
      bodyClassName="space-y-2"
    >
      <p className="text-xs leading-5 text-muted">{QE_COPY.portionsPickerHint}</p>
      <div className="-mx-1 space-y-3 px-1">
        {sections.own.length > 0 ? (
          // El nombre accesible SOLO cuando el set del coach es el chileno: para un coach 'smae'
          // esta seccion contiene los 9 grupos SMAE y el lector de pantalla los anunciaba como
          // «Sistema chileno · INTA 1999 · UDD 2019». Sin eyebrow visible no hay etiqueta que
          // poner —el set propio no necesita presentarse—, asi que la region queda sin nombre.
          <section aria-label={coachSystem === 'cl' ? PORTIONS_COPY.builder.setChile : undefined}>
            {coachSystem === 'cl' ? (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {PORTIONS_COPY.builder.setChile}
              </p>
            ) : null}
            <ul className="space-y-1">{sections.own.map(renderRow)}</ul>
          </section>
        ) : null}

        {sections.custom.length > 0 ? (
          // Mismo rotulo que RN (`EditablePortionsSection`): sale de la tabla canonica, no de
          // `QE_COPY` — el copy de las tres secciones del picker es uno solo para las dos
          // superficies.
          <section aria-label={PORTIONS_COPY.builder.setOwn}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              {PORTIONS_COPY.builder.setOwn}
            </p>
            <ul className="space-y-1">{sections.custom.map(renderRow)}</ul>
          </section>
        ) : null}

        {/* La sección legado SOLO existe si hay grupos legado, y nace colapsada. El encabezado es
            `builder.setLegacy()` SIN `n` —«Legado (SMAE) · Toca para ver»—, el mismo que pinta RN:
            el conteo de planes no viaja (el loader del picker devuelve `{groups, foodCounts,
            portionSystem, legacySystems, degraded}`) y la firma es opcional justamente para no
            inventar el número. `legacyBadge` queda solo para el chip de la fila. */}
        {sections.legacy.length > 0 ? (
          <section aria-label={PORTIONS_COPY.builder.setLegacy()}>
            <button
              type="button"
              aria-expanded={legacyOpen}
              onClick={() => setLegacyOpen((prev) => !prev)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-subtle transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PORTIONS_COPY.builder.setLegacy()}
              <ChevronDown
                aria-hidden="true"
                className={'h-4 w-4 shrink-0 transition-transform ' + (legacyOpen ? 'rotate-180' : '')}
              />
            </button>
            {legacyOpen ? <ul className="space-y-1">{sections.legacy.map(renderRow)}</ul> : null}
          </section>
        ) : null}
      </div>
    </QeBottomSheet>
  )
}
