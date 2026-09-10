'use client'

/**
 * Preview de la conversion SMAE → set chileno en WEB (tren «Porciones a la chilena», W3.5/W3.6).
 * Espejo exacto del `PortionConversionSheet` de RN sobre `QeBottomSheet size="lg"` (bottom sheet
 * en movil, dialogo centrado en desktop): mismo motor puro, mismo diff, mismos copys.
 *
 * TRES PROMESAS DURAS, y las tres se leen en este archivo:
 *
 * 1. **Solo el borrador** (S4/T-05). Lo unico que sale de aca es un `REPLACE_PORTION_GROUPS`
 *    contra el reducer en memoria. Ni una server action, ni un `UPDATE portions`, ni un publish
 *    encubierto: publicar sigue siendo un paso aparte que el coach da a mano, y el pie del
 *    dialogo (`convert.footer`) se lo promete con esas palabras.
 * 2. **Nada se decide aca**. El colapso `ARL` + `G` → `AG`, el factor del eje lacteo, el orden de
 *    la franja y el delta del dia son de `convertPortionsToCl` (`packages/nutrition-v2`). Este
 *    componente elige DOS cosas —el lacteo por franja y los reemplazos de grupos propios— y
 *    vuelve a preguntarle al motor. Si el preview y el borrador aplicado divergieran, seria
 *    porque alguien recalculo algo aca.
 * 3. **Ningun grupo propio se borra** (S5). Un reemplazo aceptado hace que el borrador deje de
 *    USAR ese grupo en esta franja; el grupo sigue en el catalogo del coach y en cualquier otro
 *    plan que lo use.
 *
 * El banner que abre el dialogo (`PortionConversionBanner`) vive ACA y se monta UNA vez, en
 * `QuickEditPlanView`. En W2 la carcasa estaba dentro de `EditablePortionsCard`, que se monta una
 * vez POR FRANJA: el banner se habria repetido en cada comida y «Ahora no» habria apagado solo
 * una (SPEC §7.2 lo quiere una vez por PLAN).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import {
  applyCatalogMetaToPickerGroups,
  convertPortionsToCl,
  formatMacroEsCl,
  formatPortionsEsCl,
  isClGroup,
  isDairy,
  systemOf,
  type ClConversionResult,
  type ClConversionRow,
  type ClConversionUnresolved,
  type ClDairyCode,
  type PortionSystem,
  type QePortionGroup,
  type QeVariant,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import {
  useCaptureNutritionPortionConversionApplied,
  useCaptureNutritionPortionConversionPreviewed,
} from '@/lib/posthog/events'
import { useQuickEdit } from './QuickEditProvider'
import { QeBottomSheet } from './QeBottomSheet'
import { QE_COPY } from './microcopy'

/** Orden del selector segmentado del eje lacteo (R3): Descremado preseleccionado. */
const DAIRY_ORDER: readonly ClDairyCode[] = ['LD', 'LS', 'LE']

/** Duracion del toast con Deshacer, la misma que usa el resto del quick-edit. */
const UNDO_TOAST_MS = 8000

/** Resultado vacio: el dialogo cerrado no le pide nada al motor. */
const EMPTY_RESULT: ClConversionResult = { variants: [], diff: [], unresolved: [], dayDeltas: [] }

// ---------------------------------------------------------------------------
// Insumos del contexto
// ---------------------------------------------------------------------------

/**
 * Lista de grupos que consume el conversor: la del picker (plan + catalogo vivo) ENRIQUECIDA por
 * id con los metadatos del catalogo (`applyCatalogMetaToPickerGroups`, remate de W2).
 *
 * Las dos mitades hacen falta. Del CATALOGO vivo salen los 13 destinos chilenos y el
 * `portionSystem` real de cada grupo —sin el, `isClGroup` no puede decidir con el fallback
 * conservador del motor—. Del PLAN salen los grupos ORIGEN que el catalogo ya no tiene (un grupo
 * borrado sigue congelado en el snapshot del plan): sin ellos `refOf` no encontraria sus refs y
 * el preview imprimiria «0 → 140 kcal».
 *
 * Sin catalogo (`portionCatalog === null`) el overlay no superpone nada (R18: nadie inventa un
 * set que no se leyo) y la conversion no encuentra destinos ⇒ todo cae a `unresolved`.
 */
export function useConversionGroups(): QePortionGroup[] {
  const { portionGroupChoices, portionCatalog } = useQuickEdit()
  return useMemo(
    () => applyCatalogMetaToPickerGroups(portionGroupChoices, portionCatalog),
    [portionGroupChoices, portionCatalog],
  )
}

/**
 * ¿El BORRADOR todavia prescribe con el set viejo? Se pregunta grupo por grupo con `systemOf`
 * (la misma funcion que parte el picker), sobre la lista ya enriquecida.
 *
 * Un target cuyo grupo no esta en la lista se resuelve por su `groupCode` congelado, que es lo
 * unico que quedo de el. Y sin catalogo `systemOf` cae al set del COACH: para un coach 'cl' eso
 * da 'cl' y el banner no aparece — correcto, R18: sin dato no se afirma que el plan es legado.
 */
export function draftUsesSmae(
  variants: readonly QeVariant[],
  groups: readonly QePortionGroup[],
  coachSystem: PortionSystem,
): boolean {
  const byId = new Map(groups.map((group) => [group.exchangeGroupId, group]))
  return variants.some((variant) =>
    variant.slots.some((slot) =>
      slot.portionTargets.some((target) => {
        const group = byId.get(target.exchangeGroupId)
        return systemOf(group ?? { groupCode: target.groupCode }, coachSystem) === 'smae'
      }),
    ),
  )
}

/**
 * Fallback conservador de `isClGroup` para PREGUNTAR SI HAY DESTINO, el mismo que usa el motor
 * (`exchange-conversion.ts:305`, `NO_CLAIM_SYSTEM`): sin `portionSystem` explicito y sin codigo
 * chileno, el grupo NO cuenta. Con el set del COACH ('cl') cualquier grupo propio sin dato se
 * haria pasar por destino y el guard de abajo no filtraria nada.
 */
const NO_CLAIM_SYSTEM: PortionSystem = 'smae'

/**
 * ¿La lista trae al menos UN destino chileno vivo?
 *
 * Entre el deploy y W6.8 los 13 grupos `cl` nacen con `deleted_at` (TASKS W0.3), asi que el
 * catalogo no los trae: `convertPortionsToCl` no puede emitir ni una fila y el preview solo sabe
 * decir «su equivalente chileno todavia no esta disponible» con el boton primario apagado.
 * Prometer «Puedes convertir el borrador» para abrir un callejon sin salida es peor que callar,
 * asi que en ese estado el banner no se pinta.
 */
export function hasClDestinations(groups: readonly QePortionGroup[]): boolean {
  return groups.some((group) => isClGroup(group, NO_CLAIM_SYSTEM))
}

// ---------------------------------------------------------------------------
// Banner del plan legado (W3.6)
// ---------------------------------------------------------------------------

/** Clave del «Ahora no», por PLAN (SPEC §7.2). Guarda el instante, no un booleano: vence solo. */
const DISMISS_PREFIX = 'nutrition-v2:portion-conversion-dismissed:'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000

function readDismissedAt(planId: string | null): boolean {
  if (planId == null || typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(DISMISS_PREFIX + planId)
    if (raw == null) return false
    const at = Number.parseInt(raw, 10)
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS
  } catch {
    // Modo privado / storage bloqueado: el banner se muestra. Es la degradacion segura —
    // mostrar un aviso de mas es mucho menos grave que esconder la unica salida del set viejo.
    return false
  }
}

function writeDismissedAt(planId: string | null): void {
  if (planId == null || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISS_PREFIX + planId, String(Date.now()))
  } catch {
    // Sin storage el «Ahora no» dura lo que la sesion. No se avisa: no es un error del coach.
  }
}

/**
 * Aviso «este plan usa las porciones anteriores» + el dialogo que abre. Se monta UNA sola vez, al
 * inicio del lienzo (`QuickEditPlanView`), y no por franja.
 *
 * No se pinta en dos casos: si el BORRADOR no usa SMAE (al plan que ya migro esta pantalla no le
 * existe) y si no hay ni un destino chileno vivo al que convertir (`hasClDestinations`).
 */
export function PortionConversionBanner() {
  const { state, planId, portionSystem } = useQuickEdit()
  const groups = useConversionGroups()
  const [open, setOpen] = useState(false)
  // Se lee en un efecto y no en el `useState` inicial: `localStorage` no existe en el render del
  // servidor y leerlo ahi rompe la hidratacion (el banner parpadearia).
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    setDismissed(readDismissedAt(planId))
  }, [planId])

  /**
   * La pregunta es por ESTE plan, y por eso la contesta el BORRADOR y nadie mas.
   *
   * Antes se aceptaba tambien `portionLegacySystems.includes('smae')`, que es del COACH (todos
   * sus planes, W1.6) y no se mueve al convertir: (a) despues de «Convertir borrador» el aviso
   * seguia ahi hasta recargar, y (b) un plan 100 % chileno de un coach con OTRO plan SMAE veia
   * el banner y abria un dialogo con «no hay nada que convertir». El aviso es del plan que se
   * esta editando, asi que la fuente es `state.variants`.
   */
  const usesSmae = useMemo(
    () => draftUsesSmae(state.variants, groups, portionSystem),
    [state.variants, groups, portionSystem],
  )
  // Memoizado igual que el de arriba: los dos recorren el arbol en CADA render del provider, y el
  // provider re-renderiza en cada tecla del editor.
  const hasDestinations = useMemo(() => hasClDestinations(groups), [groups])

  if (!usesSmae || !hasDestinations) return null

  return (
    <>
      {dismissed ? null : (
        <div className="rounded-card border border-border-subtle bg-surface-card p-3">
          <p className="text-sm font-semibold text-strong">{PORTIONS_COPY.convert.bannerTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{PORTIONS_COPY.convert.bannerBody}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 items-center justify-center rounded-control bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PORTIONS_COPY.convert.bannerCta}
            </button>
            <button
              type="button"
              onClick={() => {
                writeDismissedAt(planId)
                setDismissed(true)
              }}
              className="inline-flex h-11 items-center justify-center rounded-control px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PORTIONS_COPY.convert.bannerDismiss}
            </button>
          </div>
        </div>
      )}
      <PortionConversionDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Dialogo del preview (W3.5)
// ---------------------------------------------------------------------------

/**
 * Nombre del grupo DESTINO de una propuesta de reemplazo.
 *
 * El `find` corre solo sobre los grupos del set chileno (`isClGroup`, importado de
 * `exchange-visibility.ts` como manda el tren): `suggestedCode` siempre es un codigo `cl`, pero
 * la lista trae plan + catalogo y ahi puede haber un grupo propio —o uno congelado en el
 * snapshot— con el mismo `code`. Sin el filtro, la propuesta mostraria el nombre equivocado y el
 * coach aceptaria un reemplazo que no es el que leyo.
 */
function destinationNameOf(
  suggestedCode: string | undefined,
  groups: readonly QePortionGroup[],
  coachSystem: PortionSystem,
): string | null {
  if (suggestedCode == null) return null
  const found = groups.find(
    (group) => group.groupCode === suggestedCode && isClGroup(group, coachSystem),
  )
  return found?.groupName ?? null
}

type SlotSection = {
  slotKey: string
  slotName: string
  rows: ClConversionRow[]
  kept: ClConversionUnresolved[]
}

type DaySection = {
  variantKey: string
  label: string
  slots: SlotSection[]
}

export function PortionConversionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const { state, dispatch, portionSystem } = useQuickEdit()
  const groups = useConversionGroups()
  const capturePreviewed = useCaptureNutritionPortionConversionPreviewed()
  const captureApplied = useCaptureNutritionPortionConversionApplied()

  /** Eje lacteo POR FRANJA (R3). La ausencia ES el default 'LD': el motor lo resuelve. */
  const [dairyBySlot, setDairyBySlot] = useState<Record<string, ClDairyCode>>({})
  /** Reemplazos de grupos propios ACEPTADOS por el coach (S5): `exchangeGroupId` → codigo cl. */
  const [replacements, setReplacements] = useState<Record<string, string>>({})

  // Cerrado, el motor no corre: el borrador cambia en cada tecla del editor y recalcular la
  // conversion entera en cada una seria trabajo tirado.
  const result = useMemo(
    () =>
      open
        ? convertPortionsToCl({
            variants: state.variants,
            catalog: groups,
            coachSystem: portionSystem,
            dairyChoiceBySlot: dairyBySlot,
            customReplacements: replacements,
          })
        : EMPTY_RESULT,
    [open, state.variants, groups, portionSystem, dairyBySlot, replacements],
  )

  const slotCount = useMemo(
    () => new Set(result.diff.map((row) => row.slotKey)).size,
    [result.diff],
  )
  const rowsReview = useMemo(() => result.diff.filter((row) => row.review).length, [result.diff])

  /**
   * `nutrition_portion_conversion_previewed` UNA vez por apertura, y SOLO si hubo algo que
   * ofrecer. Las elecciones de lacteo y los reemplazos mueven los conteos, pero no abren un
   * preview nuevo: el ref evita que cada clic en «Entero» dispare otro evento y el embudo cuente
   * cinco aperturas donde hubo una.
   *
   * Un diff VACIO no se cuenta: abrir un dialogo que dice «no hay nada que convertir» no es un
   * preview de conversion, y entre el deploy y W6.8 (los 13 chilenos nacen con `deleted_at`) ese
   * caso seria la mayoria — el embudo mediria el bug, no el uso. Si el coach acepta un reemplazo
   * y el diff deja de estar vacio, ahi si se cuenta: el ref sube solo cuando el evento sale.
   */
  const previewedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      previewedRef.current = false
      return
    }
    if (previewedRef.current || result.diff.length === 0) return
    previewedRef.current = true
    capturePreviewed(slotCount, rowsReview)
  }, [open, result.diff.length, slotCount, rowsReview, capturePreviewed])

  // Al cerrar se olvidan las elecciones: reabrir el preview empieza de cero (el borrador pudo
  // cambiar entremedio y una eleccion vieja apuntaria a una franja que ya no existe).
  useEffect(() => {
    if (open) return
    setDairyBySlot({})
    setReplacements({})
  }, [open])

  /** Diff agrupado en el ORDEN del borrador (dia → franja), no en el de llegada del motor. */
  const sections = useMemo((): DaySection[] => {
    const days: DaySection[] = []
    for (const variant of state.variants) {
      const slots: SlotSection[] = []
      for (const slot of variant.slots) {
        const rows = result.diff.filter(
          (row) => row.variantKey === variant.variantKey && row.slotKey === slot.key,
        )
        const kept = result.unresolved.filter(
          (row) => row.variantKey === variant.variantKey && row.slotKey === slot.key,
        )
        if (rows.length === 0 && kept.length === 0) continue
        slots.push({ slotKey: slot.key, slotName: slot.name, rows, kept })
      }
      if (slots.length > 0) days.push({ variantKey: variant.variantKey, label: variant.label, slots })
    }
    return days
  }, [state.variants, result])

  /**
   * El preview vacio tiene DOS causas y solo una es «ya migraste». La otra: un target SMAE cuyo
   * `portions` quedo vacio o ilegible («» mientras el coach tipea, «abc») sale INTACTO del motor
   * y no entra ni a `diff` ni a `unresolved` (`exchange-conversion.ts:453-468`), asi que un
   * borrador 100 % SMAE puede llegar aca sin una sola seccion. Se vuelve a preguntar por el SET
   * del borrador —lo mismo que decide el banner— para no felicitarlo por una migracion que no hizo.
   */
  const usesSmae = useMemo(
    () => draftUsesSmae(state.variants, groups, portionSystem),
    [state.variants, groups, portionSystem],
  )

  const touchedVariantKeys = useMemo(
    () => new Set(sections.map((day) => day.variantKey)),
    [sections],
  )
  const multiDay = sections.length > 1

  const setDairy = useCallback((slotKey: string, code: ClDairyCode) => {
    setDairyBySlot((prev) => ({ ...prev, [slotKey]: code }))
  }, [])

  const toggleReplacement = useCallback((exchangeGroupId: string, code: string, accepted: boolean) => {
    setReplacements((prev) => {
      const next = { ...prev }
      if (accepted) next[exchangeGroupId] = code
      else delete next[exchangeGroupId]
      return next
    })
  }, [])

  /**
   * UNICA escritura de esta pantalla, y va al reducer en memoria. `REPLACE_PORTION_GROUPS` aplica
   * el arbol completo que devolvio el motor —con el colapso y las posiciones ya resueltos— en un
   * solo dispatch, asi el contador «N cambios sin publicar» lo cuenta como una edicion mas.
   */
  function handleApply() {
    // Foto del arbol ANTES del dispatch: es la edicion mas grande que el coach hace de un clic
    // (N dias × N franjas), y el reducer solo sabe deshacerla entera con `RESTORE_DRAFT`.
    const before = state
    dispatch({ type: 'REPLACE_PORTION_GROUPS', variants: result.variants })
    captureApplied(slotCount)
    onOpenChange(false)
    toast(PORTIONS_COPY.convert.applied, {
      duration: UNDO_TOAST_MS,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_DRAFT', state: before }),
      },
    })
  }

  return (
    <QeBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={PORTIONS_COPY.convert.title}
      size="lg"
      bodyClassName="space-y-3"
    >
      <p className="text-xs leading-5 text-muted">{PORTIONS_COPY.convert.intro}</p>

      {sections.length === 0 ? (
        <p className="rounded-control bg-surface-sunken px-2 py-1.5 text-xs leading-relaxed text-muted">
          {usesSmae ? PORTIONS_COPY.convert.emptyNoAmount : PORTIONS_COPY.convert.empty}
        </p>
      ) : null}

      {sections.map((day) => (
        <div key={day.variantKey} className="space-y-2">
          {multiDay ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{day.label}</p>
          ) : null}
          {day.slots.map((slot) => (
            <section key={slot.slotKey} aria-label={slot.slotName} className="space-y-1">
              <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {slot.slotName}
              </p>
              {slot.rows.length > 0 ? (
                <ul className="space-y-1">
                  {slot.rows.map((row) => (
                    <ConversionRowView
                      key={`${row.slotKey}:${row.toCode}`}
                      row={row}
                      dairy={dairyBySlot[row.slotKey] ?? 'LD'}
                      onDairy={(code) => setDairy(row.slotKey, code)}
                    />
                  ))}
                </ul>
              ) : null}
              {slot.kept.length > 0 ? (
                <div className="rounded-control bg-surface-sunken px-2 py-1.5">
                  <p className="text-[11px] font-semibold text-strong">{PORTIONS_COPY.convert.keptTitle}</p>
                  <ul className="mt-1 space-y-1">
                    {slot.kept.map((kept) => (
                      <KeptRowView
                        key={`${kept.slotKey}:${kept.exchangeGroupId}`}
                        kept={kept}
                        destinationName={destinationNameOf(kept.suggestedCode, groups, portionSystem)}
                        accepted={replacements[kept.exchangeGroupId] === kept.suggestedCode}
                        onToggle={(accepted) => {
                          if (kept.suggestedCode == null) return
                          toggleReplacement(kept.exchangeGroupId, kept.suggestedCode, accepted)
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ))}

      {/* Delta del dia: lo unico que le dice a la nutricionista si el redondeo la movio del
          objetivo. Solo de los dias que la conversion toca — en un plan de siete dias, seis
          lineas «620 → 620» son ruido. */}
      {result.dayDeltas.filter((delta) => touchedVariantKeys.has(delta.variantKey)).length > 0 ? (
        <div className="space-y-1 border-t border-border-subtle pt-2">
          {result.dayDeltas
            .filter((delta) => touchedVariantKeys.has(delta.variantKey))
            .map((delta) => (
              <p key={delta.variantKey} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted">{delta.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-strong">
                  {formatMacroEsCl(Math.round(delta.before.calories))} →{' '}
                  {formatMacroEsCl(Math.round(delta.after.calories))} kcal
                </span>
              </p>
            ))}
        </div>
      ) : null}

      <p className="rounded-control bg-surface-sunken px-2 py-1.5 text-[11px] leading-relaxed text-muted">
        {PORTIONS_COPY.convert.footer}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-11 items-center justify-center rounded-control border border-border-subtle bg-surface-card px-3 text-sm font-medium text-body transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PORTIONS_COPY.groupEditor.cancel}
        </button>
        <button
          type="button"
          disabled={result.diff.length === 0}
          onClick={handleApply}
          className="inline-flex h-11 items-center justify-center rounded-control bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {PORTIONS_COPY.convert.cta}
        </button>
      </div>
    </QeBottomSheet>
  )
}

/**
 * Una fila del diff: origen(es) → destino, con cantidades y kcal antes/despues.
 *
 * La fila COLAPSADA (R2) no es un caso aparte: `row.from` trae los dos origenes y se imprimen en
 * la misma linea unidos por «+». Nunca hay dos filas al mismo destino, porque el motor colapsa
 * antes de emitir (dos targets al mismo grupo abortarian el RPC entero con un 23505).
 */
function ConversionRowView({
  row,
  dairy,
  onDairy,
}: {
  row: ClConversionRow
  dairy: ClDairyCode
  onDairy: (code: ClDairyCode) => void
}) {
  const origins = row.from
    .map((origin) => `${origin.name} ${formatPortionsEsCl(origin.portions)}`)
    .join(' + ')

  return (
    <li className="rounded-control bg-surface-sunken px-2 py-1.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm leading-6">
        <span className="text-body">{origins}</span>
        <span aria-hidden="true" className="text-muted">
          →
        </span>{' '}
        {/* El espacio explícito NO es cosmético: sin él el nombre y la cantidad quedan pegados en
            el texto accesible («Lácteos enteros5») y el lector de pantalla los lee como una sola
            palabra. El hueco visual lo pone el `gap-x`; este es el del DOM. */}
        <span className="font-semibold text-strong">{row.toName}</span>{' '}
        <span className="font-semibold tabular-nums text-strong">{formatPortionsEsCl(row.toPortions)}</span>
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
        {row.review ? (
          <span className="rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {PORTIONS_COPY.convert.review}
          </span>
        ) : null}
        <span className="tabular-nums text-muted">
          {formatMacroEsCl(Math.round(row.kcalBefore))} → {formatMacroEsCl(Math.round(row.kcalAfter))} kcal
        </span>
      </p>
      {isDairy(row.toCode) ? <DairyPicker value={dairy} onChange={onDairy} /> : null}
    </li>
  )
}

/**
 * Selector segmentado de tres del eje lacteo, POR FRANJA (R3). Descremado preseleccionado; al
 * cambiar, el motor recalcula el factor por kcal y la fila SIGUE marcada «Revisar»: el reescalado
 * por energia no conserva ni la proteina ni la grasa, y eso lo tiene que mirar el coach.
 *
 * `role="radiogroup"` con tres `role="radio"`: son tres opciones excluyentes, no tres botones. Y
 * el patron ARIA va COMPLETO, no a medias: un solo tab stop (`tabIndex` rotativo sobre el
 * elegido) y ←/→ ↑/↓ + Inicio/Fin para moverse, que es lo que un lector de pantalla anuncia y
 * espera. Con tres `<button>` tabulables y sin flechas, el teclado quedaba prometiendo un
 * comportamiento que no existia.
 */
function DairyPicker({
  value,
  onChange,
}: {
  value: ClDairyCode
  onChange: (code: ClDairyCode) => void
}) {
  const labelId = useId()
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])

  /** Mover el foco ES elegir (patron de radiogroup): el motor recalcula en el acto. */
  function focusAt(index: number) {
    const next = (index + DAIRY_ORDER.length) % DAIRY_ORDER.length
    onChange(DAIRY_ORDER[next])
    buttonsRef.current[next]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') focusAt(index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') focusAt(index - 1)
    else if (event.key === 'Home') focusAt(0)
    else if (event.key === 'End') focusAt(DAIRY_ORDER.length - 1)
    else return
    event.preventDefault()
  }

  return (
    <div className="mt-1.5">
      <span id={labelId} className="sr-only">
        {PORTIONS_COPY.convert.dairyLabel}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex flex-wrap gap-0.5 rounded-control border border-border-subtle bg-surface-card p-0.5"
      >
        {DAIRY_ORDER.map((code, index) => {
          const active = value === code
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              ref={(node) => {
                buttonsRef.current[index] = node
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => onChange(code)}
              className={
                'inline-flex h-9 items-center justify-center rounded-control px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (active ? 'bg-primary text-white' : 'text-muted hover:bg-surface-sunken hover:text-strong')
              }
            >
              {PORTIONS_COPY.convert.dairyChoice[code]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Grupo que la conversion NO toca: propio del coach, sin regla y sin match unico. Se conserva tal
 * cual y en su lugar dentro de la franja.
 *
 * Con match unico (±5 kcal / ±1 g) se ofrece el reemplazo, y la oferta exige CONFIRMACION: un
 * checkbox que el coach tiene que marcar. Nada se reemplaza por defecto — el que sabe si su
 * «Carbohidratos 140/30» es de verdad un `PCT` es el, no una tolerancia.
 */
/**
 * La linea de «se conserva» depende de la RAZON, y son tres distintas (`ClConversionUnresolvedReason`).
 *
 * Decirle «es tuyo y no tiene equivalente chileno» a las tres era mentir en dos: entre el deploy
 * y W6.8 los 13 grupos chilenos viven con `deleted_at` (TASKS W0.3), asi que «Cereales (SMAE)» y
 * «Lácteo» —del SISTEMA, con regla escrita— caen a `destino_ausente_en_catalogo` y el coach leia
 * que eran grupos suyos. Y `sin_regla` es el grupo que ya no esta en el catalogo, congelado en el
 * snapshot del plan: tampoco es «tuyo sin equivalente».
 */
function keptReasonLine(kept: ClConversionUnresolved): string {
  switch (kept.reason) {
    case 'custom_sin_match':
      return PORTIONS_COPY.convert.keptCustom(kept.groupName)
    case 'destino_ausente_en_catalogo':
      return PORTIONS_COPY.convert.keptMissingTarget(kept.groupName)
    case 'sin_regla':
      return PORTIONS_COPY.convert.keptUnknown(kept.groupName)
  }
}

function KeptRowView({
  kept,
  destinationName,
  accepted,
  onToggle,
}: {
  kept: ClConversionUnresolved
  destinationName: string | null
  accepted: boolean
  onToggle: (accepted: boolean) => void
}) {
  const offersReplacement = kept.suggestedCode != null && destinationName != null

  return (
    <li className="text-xs leading-relaxed">
      {offersReplacement ? (
        <>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => onToggle(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-default text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="min-w-0 text-body">
              {PORTIONS_COPY.convert.replace(kept.groupName, destinationName ?? '')}
            </span>
          </label>
          <p className="ml-6 mt-0.5 text-[11px] text-muted">{PORTIONS_COPY.convert.replaceHint}</p>
        </>
      ) : (
        <p className="text-muted">{keptReasonLine(kept)}</p>
      )}
    </li>
  )
}
