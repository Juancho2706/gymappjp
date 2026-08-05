'use client'

import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, History, Info, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { BuilderStepList } from '@/components/nutrition-v2'
import { buildNutritionIdempotencyKey, type NutritionStrategy } from '@eva/nutrition-v2'
import {
  BUILDER_STEP_DAYS,
  BUILDER_STEP_PLAN,
  MAX_DAY_VARIANTS,
  assembleAndValidateDraft,
  autoVariantLabel,
  baseVariantOf,
  builderDowForVariant,
  builderReducer,
  builderVariantForDayOfWeek,
  clonedKey,
  createEmptyBuilderState,
  initialBuilderDow,
  resolveSlotCopyTargets,
  strategyUsesSlots,
  takenDayOfWeeks,
  validateStep,
  type BuilderState,
  type BuilderVariant,
} from '../_lib/draft-builder'
import { genId, type SlotCopyRequest } from '../_lib/builder-view-model'
import { primaryButtonClass, secondaryButtonClass } from '../_lib/builder-ui-classes'
import { publishPlanAction } from '../_actions/builder.actions'
import { archivePlanAction } from '@/app/coach/nutrition-v2/_actions/nutrition-archive.actions'
// Guardar el BORRADOR en pantalla como plantilla (F3): mismo action que usa la biblioteca del
// hub, pero con `source: 'builder'` — aca todavia no hay plan publicado que copiar.
import {
  savePlanTemplateAction,
  updatePlanTemplateDraftAction,
} from '@/app/coach/nutrition-v2/_actions/plan-templates.actions'
import { canProceedToPublishAfterArchive, effectiveDateConflicts, nextDayIso } from '../_lib/publish-conflict'
import { PublishConflictDialog } from './PublishConflictDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
// Porciones a elección (T1.1): capa opcional sobre structured/hybrid (SPEC R1). El estado
// vive en un controller hermano del reducer (no se toca _lib/draft-builder) y se inyecta
// al draft canónico justo antes de publicar (attachPortionsAndValidate).
import { usePortionsBuilder } from './PortionsSection'
import {
  attachPortionsAndValidate,
  portionsKey,
  variantPortionKeys,
  type PortionsBySlot,
} from './portions-state'
import type { DayPlanStripHandlers } from './DayPlanStrip'
// Respaldo LOCAL del wizard (W3b): store puro versionado en localStorage. El coach retoma un
// plan a medio construir si cerró la PWA / mató la pestaña. La key incluye clientId + planId.
import {
  builderDraftKey,
  clearNutritionDraft,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} from '@/lib/nutrition-coach-draft-store'
// Pasos y avisos del wizard: cada pieza vive en su archivo (mismo directorio) desde que este
// componente dejo de ser un monolito. Aca queda SOLO el shell: estado, autosave, publish.
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import type { FoodPickerRestriction } from '@/app/coach/nutrition-v2/_components/food-picker/food-picker-grouping'
import { TemplateModeContext } from './TemplateModeContext'
import { PlanStep } from './PlanStep'
import { ConstructionStep } from './ConstructionStep'
import { MobileBuilderStepper } from './MobileBuilderStepper'
import { PortionsDayGapNotice } from './PortionsDayGapNotice'

// El contrato de "copiar franja a otros dias" nacio en este archivo y lo consumen SlotEditor y
// ConstructionStep; vive en `_lib/builder-view-model` y se re-exporta aca para no mover la ruta
// publica del simbolo.
export type { SlotCopyRequest }

// Wizard de DOS pasos (SPEC nutrition-ui-poda, punto 11). "Revisar" desaparecio: su unico
// control editable (`Vigente desde`) subio a "El plan" y su lectura ya estaba en pantalla.
const STEP_META = [
  { id: 'plan', label: 'El plan' },
  { id: 'dias', label: 'Los días' },
]

// Respaldo local (W3b): DOS piezas de estado independientes viajan juntas — el árbol del
// reducer (BuilderState) y el mapa hermano de porciones (PortionsBySlot). Sin portionsBySlot
// un plan structured/hybrid restauraría incompleto (las porciones a elección se perderían).
interface BuilderDraftPayload {
  clientId: string
  planId: string | null
  state: BuilderState
  portionsBySlot: PortionsBySlot
  /**
   * Clave de idempotencia del intento de publicacion en curso + firma del contenido con el
   * que se acuño (NUT-011). Restaurar el borrador restaura tambien la clave: si el publish
   * se corto (red/reload) el reintento con el MISMO contenido reusa la clave y el servidor
   * devuelve la version ya publicada en vez de crear una segunda. Ausente en borradores
   * viejos (pre-deploy) => se acuña una clave nueva, comportamiento anterior.
   */
  publishKey?: string | null
  publishSignature?: string | null
}

// ¿El borrador tiene contenido que valga la pena respaldar? Evita escribir (y avisar al salir)
// por un wizard recién abierto o vaciado. Espeja el guard "dirty" del quick-edit.
function builderHasSignificantContent(state: BuilderState): boolean {
  if (state.strategy !== null) return true
  if (state.planName.trim() !== '') return true
  if (state.variants.some((variant) => variant.slots.length > 0)) return true
  return (['calories', 'proteinG', 'carbsG', 'fatsG'] as const).some((f) => state.targets[f].trim() !== '')
}

/**
 * Version del formato del borrador local. v1 = `{ slots }` (un solo dia); v2 = `{ variants }`
 * (multi-dia). La KEY se versiona (sufijo) y al montar se migra el borrador v1 si existe: los
 * borradores guardados de coaches reales NO se pierden al desplegar multi-dia.
 */
const BUILDER_DRAFT_KEY_V2_SUFFIX = ':v2'

const LEAVE_GUARD_COPY = 'Tienes un borrador sin publicar. ¿Salir y descartarlo?'

const MULTI_DAY_LOCK_COPY =
  'No pudimos cargar los días de este plan. Rehacerlo aquí lo reduciría a uno: usa Edición rápida.'

// Copy de "Guardar como plantilla". Inline en el componente igual que la biblioteca del hub
// (PlanTemplatesLibrary): no hay archivo canónico de microcopy para plantillas todavía.
const SAVE_TEMPLATE_LABEL = 'Guardar como plantilla'
const SAVE_TEMPLATE_EMPTY_COPY = 'Arma el plan primero: todavía no hay nada que guardar como plantilla.'
const SAVE_TEMPLATE_DEFAULT_NAME = 'Mi plantilla'
const DRAFT_INCOMPLETE_COPY =
  'El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.'

// Copy del builder de PLANTILLAS (sin alumno). La CTA primaria deja de ser "Publicar plan":
// aquí no hay nada que publicar ni nadie a quien le llegue.
const TEMPLATE_SAVE_LABEL = 'Guardar plantilla'
const TEMPLATE_UPDATE_LABEL = 'Guardar cambios'
const TEMPLATE_EMPTY_COPY = 'Arma la plantilla primero: todavía no hay nada que guardar.'
const TEMPLATE_DIALOG_HINT =
  'Se guarda tal cual la tienes en pantalla. No se publica nada: la aplicas cuando quieras, al alumno que quieras.'

/**
 * MODO PLANTILLA (CEO 2026-08-04). Hasta ahora una plantilla solo podía nacer del borrador o
 * del plan publicado de un ALUMNO: un coach sin alumnos —o que quiere material genérico— no
 * tenía puerta. Con esta prop el MISMO wizard se monta sin ficha: nada de publicar, de
 * conflictos de vigencia ni de archivar, y la CTA primaria guarda en la biblioteca.
 */
export interface PlanBuilderTemplateMode {
  /** Plantilla que se está EDITANDO; `null` = plantilla nueva. */
  templateId: string | null
  /** Descripción guardada: precarga el diálogo para que guardar no la borre. */
  description?: string | null
}

/**
 * Señales que el picker de alimentos necesita en cada fila (quién es el coach, cómo se llama el
 * alumno, qué tiene declarado y qué marcó como favorito). Se resuelven SERVER-SIDE en la page y
 * bajan por contexto; el wizard solo hace de plumbing (no las lee).
 */
export interface PlanBuilderFoodPickerPrefs {
  viewerCoachId: string | null
  clientName: string | null
  restrictions: readonly FoodPickerRestriction[]
  favoriteIds: readonly string[]
}

export function PlanBuilderClient({
  clientId,
  existingPlan,
  initialDraft,
  today,
  nutritionProEnabled,
  templateMode,
  foodPickerPrefs,
}: {
  /**
   * Alumno dueño del plan. En modo plantilla llega `TEMPLATE_MODE_CLIENT_ID` (uuid NIL): el
   * wizard lo necesita para armar el draft, pero no viaja a la base ni autoriza nada.
   */
  clientId: string
  existingPlan: {
    id: string
    /** Version vigente al abrir el wizard: viaja como CAS al publicar (NUT-011). */
    versionId: string
    versionNumber: number
    strategy: NutritionStrategy
    effectiveFrom: string
    name: string
    /** Variantes de día del plan vigente (para el guard de respaldo si falla la rehidratación). */
    dayVariantCount: number
  } | null
  /**
   * Plan vigente REHIDRATADO al estado del wizard (FD1c): días, franjas, items, reemplazos y
   * porciones. `null` con plan vigente = la rehidratación falló (lectura de reemplazos caída,
   * read-model inesperado) y entra el guard anti-colapso de respaldo.
   */
  initialDraft: { state: BuilderState; portionsBySlot: PortionsBySlot } | null
  today: string
  nutritionProEnabled: boolean
  /** Presente ⇒ el wizard arma una PLANTILLA, sin alumno. Ausente ⇒ builder de siempre. */
  templateMode?: PlanBuilderTemplateMode
  /** Solo plumbing del picker de alimentos (ver `PlanBuilderFoodPickerPrefs`). */
  foodPickerPrefs?: PlanBuilderFoodPickerPrefs
}) {
  const router = useRouter()
  const isTemplateMode = templateMode != null
  // Estado inicial: el plan vigente rehidratado si lo hay; si no, el wizard vacío de siempre.
  const [state, dispatch] = useReducer(builderReducer, initialDraft, (draft) =>
    draft ? draft.state : createEmptyBuilderState(today),
  )
  // Porciones a elección: controller hermano del reducer (mapa `variantKey::slotKey` → targets
  // + catálogo de grupos con carga perezosa). Claves de franjas/días borrados quedan huérfanas
  // sin efecto: attach/derive filtran por las franjas vivas de state.variants.
  const portions = usePortionsBuilder(isTemplateMode ? null : clientId, initialDraft?.portionsBySlot)
  /**
   * Día del strip que el coach tiene en pantalla (`null` = el día base cuando ya no le aplica a
   * ningún día). Es estado de UI a propósito: el MODELO sigue siendo "día base + días propios"
   * y la variante en edición sigue viviendo en el reducer (`activeVariantKey`). Cada gesto que
   * mueve el día mueve las dos cosas juntas, así que no divergen.
   */
  const [selectedDow, setSelectedDow] = useState<number | null>(() => initialBuilderDow(state, today))
  const [showErrors, setShowErrors] = useState(false)
  // Anuncio para lectores de pantalla de lo que acaba de pasar con los dias (crear, duplicar,
  // eliminar, copiar una franja). Se pinta en una region `aria-live` visualmente oculta.
  const [liveMessage, setLiveMessage] = useState('')
  // Estado VIGENTE para acciones diferidas (el "Deshacer" del toast se toca segundos despues
  // del render que lo creo): sin esto se restauraria un arbol viejo y se perderia lo editado
  // entremedio. Se sincronizan en efecto, nunca durante el render.
  const stateRef = useRef(state)
  const portionsRef = useRef<PortionsBySlot>(portions.bySlot)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // "Guardar como plantilla" (F3): estado LOCAL, fuera del `startTransition` del publish. Guardar
  // una plantilla no toca el plan del alumno, así que no tiene por qué bloquear la CTA de publicar
  // ni compartir su spinner.
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  /**
   * Id de la plantilla que se está editando en el builder de plantillas. Arranca en el de la
   * URL (`?template=<id>`) y se FIJA al guardar una nueva: sin esto, tocar "Guardar" dos veces
   * dejaría dos plantillas idénticas en la biblioteca.
   */
  const [templateId, setTemplateId] = useState<string | null>(templateMode?.templateId ?? null)
  const operationId = useRef(genId())
  // Estado de recuperacion del "Archivar y reemplazar" (ver handleReplaceToday). Sobreviven a un
  // fallo parcial para que el REINTENTO no repita el paso ya cumplido ni cree planes duplicados:
  // - replaceArchivedRef: el plan viejo YA se archivo -> el reintento salta directo a publicar.
  // - replaceKeyRef: clave de idempotencia ESTABLE del reemplazo -> re-publicar devuelve el MISMO
  //   plan/version en vez de crear un duplicado. Se resetean al cerrar el modal (fresh open limpio).
  const replaceArchivedRef = useRef(false)
  const replaceKeyRef = useRef<string | null>(null)
  // Idempotencia estable del publish normal (NUT-011): clave + firma del draft con el que se
  // acuño. Mismo contenido => misma clave en todos los reintentos; contenido editado => clave
  // nueva (intencion nueva). Ver `stableIdempotencyKey`.
  const publishKeyRef = useRef<string | null>(null)
  const publishSignatureRef = useRef<string | null>(null)

  // Respaldo local del wizard (W3b): key estable por alumno+plan, banner de restauración y
  // el payload leído al montar (guardado en un ref para no re-renderizar hasta tocar Restaurar).
  // La key va versionada (`:v2`) desde multi-día; `legacyDraftKey` es la del formato viejo.
  // Modo plantilla: key propia (`template:<id|new>`), NUNCA la del alumno — el clientId de
  // relleno es el mismo para todas las plantillas y compartirían un solo borrador. Se ancla al
  // id INICIAL (no al `templateId` que se fija al guardar) para que la key no cambie a mitad
  // de sesión y deje un borrador huérfano en la key vieja.
  const legacyDraftKey = useMemo(
    () =>
      isTemplateMode
        ? builderDraftKey('template', templateMode?.templateId ?? null)
        : builderDraftKey(clientId, existingPlan?.id ?? null),
    [isTemplateMode, templateMode?.templateId, clientId, existingPlan?.id],
  )
  const draftKey = legacyDraftKey + BUILDER_DRAFT_KEY_V2_SUFFIX
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const draftPayloadRef = useRef<BuilderDraftPayload | null>(null)
  const migratedDraftRef = useRef(false)
  const isFirstRender = useRef(true)
  const [dirty, setDirty] = useState(false)

  // Espejo del estado vigente para las acciones diferidas (ver `stateRef`/`portionsRef`).
  useEffect(() => {
    stateRef.current = state
    portionsRef.current = portions.bySlot
  }, [state, portions.bySlot])

  // Al montar: barre borradores vencidos (higiene global) y, si hay uno vigente para ESTE
  // alumno/plan, ofrece restaurarlo. Best-effort (SSR / modo privado degradan a "sin borrador").
  // MIGRACIÓN v1 → v2: si no hay borrador nuevo pero sí uno del formato viejo (`{ slots }`), se
  // levanta igual — el reducer lo normaliza a un día base en `RESTORE` (`migrateBuilderState`).
  useEffect(() => {
    sweepStaleNutritionDrafts(Date.now())
    const record = readNutritionDraft<BuilderDraftPayload>(draftKey, Date.now())
    if (record != null && record.payload.clientId === clientId) {
      draftPayloadRef.current = record.payload
      setShowDraftBanner(true)
      return
    }
    const legacy = readNutritionDraft<BuilderDraftPayload>(legacyDraftKey, Date.now())
    if (legacy != null && legacy.payload.clientId === clientId) {
      draftPayloadRef.current = legacy.payload
      migratedDraftRef.current = true
      setShowDraftBanner(true)
    }
  }, [draftKey, legacyDraftKey, clientId])

  // Autosave con debounce (~2s) sobre el árbol del wizard + las porciones. Salta el primer
  // render (la hidratación inicial no es un cambio del coach). Si el borrador deja de tener
  // contenido significativo (el coach vació todo) limpia la key en vez de guardar vacío.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setDirty(true)
    const timer = setTimeout(() => {
      if (builderHasSignificantContent(state)) {
        writeNutritionDraft<BuilderDraftPayload>(
          draftKey,
          {
            clientId,
            planId: existingPlan?.id ?? null,
            state,
            portionsBySlot: portions.bySlot,
            publishKey: publishKeyRef.current,
            publishSignature: publishSignatureRef.current,
          },
          Date.now(),
        )
      } else {
        clearNutritionDraft(draftKey)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [state, portions.bySlot, draftKey, clientId, existingPlan?.id])

  // Guard de salida del navegador (cerrar pestaña / recargar) con un borrador sin publicar.
  // Espeja el leaveGuard del quick-edit: solo el aviso nativo; el respaldo real lo hace el
  // autosave de arriba.
  useEffect(() => {
    // `dirty`: con el plan rehidratado el wizard nace lleno; avisar al salir sin haber tocado
    // nada seria puro ruido. Solo se avisa cuando hubo una edicion real.
    if (!dirty || !builderHasSignificantContent(state)) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = LEAVE_GUARD_COPY
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state, dirty])

  // Guard multi-dia — AHORA SOLO DE RESPALDO. El wizard ya edita N dias y la rehidratacion
  // (FD1c) los carga completos, asi que el camino normal ya no colapsa nada. El guard queda
  // vivo para el unico caso peligroso que sobrevive: la rehidratacion FALLO (`initialDraft`
  // null con plan vigente) y el plan tiene mas de un dia — publicar desde un wizard en blanco
  // los borraria en silencio. Ahi se bloquea y se empuja a "Edicion rapida".
  const multiDayVariantCount = existingPlan?.dayVariantCount ?? 0
  const rehydrationFailed = existingPlan != null && initialDraft == null
  const multiDayLocked = rehydrationFailed && multiDayVariantCount > 1
  // Gate comercial (espejo de UI): que un dia tenga contenido PROPIO exige Nutricion Pro (el
  // plan pasa a tener 2 variantes). El servidor (`publishPlanAction`) responde UPGRADE_REQUIRED
  // con feature `multi_variant` — esta bandera solo evita el callejon sin salida y muestra el
  // upsell al tocar "Personalizar".
  const personalizeLocked = !nutritionProEnabled

  const validation = useMemo(() => validateStep(state, state.step), [state])

  const steps = STEP_META.map((meta, index) => {
    let stepState: 'upcoming' | 'current' | 'complete' | 'error' = 'upcoming'
    if (index === state.step) stepState = showErrors && !validation.ok ? 'error' : 'current'
    else if (index < state.step) stepState = 'complete'
    const description =
      index === BUILDER_STEP_DAYS && !strategyUsesSlots(state.strategy) ? 'Plan flexible: sin franjas' : undefined
    return { id: meta.id, label: meta.label, description, state: stepState }
  })

  function handleNext() {
    if (!validation.ok) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    dispatch({ type: 'NEXT_STEP' })
  }

  function handlePrev() {
    setShowErrors(false)
    setPublishError(null)
    dispatch({ type: 'PREV_STEP' })
  }

  // Punto común de éxito de las DOS ramas de publicación (normal / "Archivar y reemplazar"):
  // limpia el respaldo local antes de navegar — el plan ya está en el servidor.
  const goToPublished = () => {
    clearNutritionDraft(draftKey)
    clearNutritionDraft(legacyDraftKey)
    router.push('/coach/nutrition-v2/' + clientId + '?published=1')
  }

  // Restaurar borrador: reemplaza el árbol del reducer Y el mapa de porciones (dos piezas).
  function handleRestoreDraft() {
    const payload = draftPayloadRef.current
    if (payload != null) {
      dispatch({ type: 'RESTORE', state: payload.state })
      portions.restoreBySlot(payload.portionsBySlot ?? {})
      // Idempotencia (NUT-011): recuperar la clave del intento interrumpido es lo que hace
      // que reintentar tras un reload no publique una segunda version del mismo contenido.
      publishKeyRef.current = payload.publishKey ?? null
      publishSignatureRef.current = payload.publishSignature ?? null
      // El catálogo de grupos (portions.groups) NO se persiste: si el plan restaurado usa
      // franjas (structured/hybrid) lo precargamos para que las filas de porciones muestren
      // nombre/color en vez del fallback (mismo camino que el flujo normal del picker).
      if (strategyUsesSlots(payload.state.strategy)) portions.ensureGroupsLoaded()
      // El día del strip no viaja en el borrador (es estado de UI): se re-deriva del día que el
      // borrador tenía en edición para que el strip y el reducer no queden apuntando distinto.
      setSelectedDow(initialBuilderDow(payload.state, today))
      // Borrador del formato viejo: ya migrado en memoria por `RESTORE`. Se borra la key v1
      // para que el proximo autosave (que escribe en la v2) no deje dos copias divergentes.
      if (migratedDraftRef.current) {
        clearNutritionDraft(legacyDraftKey)
        migratedDraftRef.current = false
      }
    }
    setShowDraftBanner(false)
  }

  // ── Handlers del selector de dia ──────────────────────────────────────────────────────────
  // Las porciones viven FUERA del reducer, asi que personalizar/copiar/eliminar un dia mueve DOS
  // piezas: el arbol (dispatch) y el mapa de porciones (controller). Las keys de las franjas
  // clonadas son deterministas (`clonedKey`), asi que el mapa se re-etiqueta sin adivinar.
  //
  // TERCERA pieza, del selector nuevo: `selectedDow`. Todo gesto que cambie de dia la mueve en el
  // MISMO handler que el dispatch (React agrupa el render), asi que el dia del strip y la
  // variante activa del reducer nunca quedan apuntando a cosas distintas.

  function cloneVariantPortions(sourceVariant: BuilderVariant, targetVariantKey: string) {
    portions.cloneVariant({
      sourceVariantKey: sourceVariant.key,
      targetVariantKey,
      slotKeyPairs: sourceVariant.slots.map((slot) => ({ from: slot.key, to: clonedKey(targetVariantKey, slot.key) })),
    })
  }

  // Aviso de lo que acaba de pasar (P1-4): crear/duplicar un dia MUEVE el foco de edicion, asi
  // que se dice en voz alta. El toast lo ve el coach; la region `aria-live` de mas abajo lo
  // anuncia a un lector de pantalla aunque el toast no llegue a montarse.
  function announce(message: string) {
    setLiveMessage(message)
    toast(message, { duration: 4000 })
  }

  /** Elegir un dia del strip: mueve el dia visible Y la variante en edicion del reducer. */
  function handleSelectDay(dayOfWeek: number | null) {
    setSelectedDow(dayOfWeek)
    const variant = builderVariantForDayOfWeek(state, dayOfWeek)
    if (variant.key !== state.activeVariantKey) dispatch({ type: 'SET_ACTIVE_VARIANT', variantKey: variant.key })
  }

  /**
   * Saltar a un DIA por su variante (aviso "Revisa este día"): el strip habla de dias, asi que
   * la variante se traduce al dia que la representa.
   */
  function handleSelectVariant(variantKey: string) {
    setSelectedDow(builderDowForVariant(state, variantKey, selectedDow))
    if (variantKey !== state.activeVariantKey) dispatch({ type: 'SET_ACTIVE_VARIANT', variantKey })
  }

  /**
   * "Personalizar {dia}": el dia deja de heredar y pasa a tener contenido PROPIO, copiado del dia
   * base (es lo que el coach ve en pantalla, asi que copiar es lo unico que no sorprende). Reusa
   * la primitiva de alta de siempre (`ADD_VARIANTS` con origen `copy-base`), asi que el modelo,
   * las keys clonadas y las porciones se mueven exactamente como antes.
   */
  function handlePersonalizeDay(dayOfWeek: number) {
    // Cinturon: mismo filtro que el reducer (dia ya propio / tope de dias), para que la key
    // generada no quede apuntando a una variante que no se creo.
    const taken = takenDayOfWeeks(state)
    if (taken.includes(dayOfWeek) || taken.length >= MAX_DAY_VARIANTS) return
    const key = genId()
    dispatch({ type: 'ADD_VARIANTS', days: [dayOfWeek], keys: [key], origin: 'copy-base' })
    cloneVariantPortions(baseVariantOf(state), key)
    setSelectedDow(dayOfWeek)
    const label = autoVariantLabel(dayOfWeek)
    announce(`${label} ahora es un día propio — lo que edites acá solo le llega a ese día`)
  }

  /** "Copiar a otros días" del menú del día: crea el día destino con este contenido. */
  function handleCopyDayTo(sourceVariantKey: string, dayOfWeek: number) {
    const source = state.variants.find((variant) => variant.key === sourceVariantKey)
    if (!source || takenDayOfWeeks(state).includes(dayOfWeek)) return
    const key = genId()
    dispatch({ type: 'DUPLICATE_VARIANT_AS', sourceVariantKey, key, dayOfWeek })
    cloneVariantPortions(source, key)
    setSelectedDow(dayOfWeek)
    const label = autoVariantLabel(dayOfWeek)
    announce(`${label} quedó con una copia de ${source.label} — ahora estás editando ${label}`)
  }

  /** "Cambiar día": la variante se muda de dia y el strip sigue al dia nuevo. */
  function handleChangeVariantDay(variantKey: string, dayOfWeek: number) {
    if (takenDayOfWeeks(state, variantKey).includes(dayOfWeek)) return
    dispatch({ type: 'SET_VARIANT_DAY', variantKey, dayOfWeek })
    setSelectedDow(dayOfWeek)
  }

  // "Eliminar dia" = ese dia VUELVE A HEREDAR el dia base, con DESHACER (paridad con la edicion
  // rapida). Al deshacer se reinserta la variante en su posicion sobre el estado VIGENTE (no se
  // revierte lo editado entremedio) y se reponen SUS porciones, que viven en el mapa hermano.
  function handleRemoveVariant(variantKey: string) {
    const index = state.variants.findIndex((variant) => variant.key === variantKey)
    const removed = index < 0 ? null : state.variants[index]
    if (!removed || removed.isDefault) return
    const removedPortions: PortionsBySlot = {}
    for (const slot of removed.slots) {
      const key = portionsKey(variantKey, slot.key)
      const targets = portions.bySlot[key]
      if (targets != null && targets.length > 0) removedPortions[key] = targets
    }
    dispatch({ type: 'REMOVE_VARIANT', variantKey })
    portions.dropVariant(variantKey)
    // El dia sigue en pantalla: ahora muestra el dia base (que es lo que va a recibir).
    if (removed.dayOfWeek != null) setSelectedDow(removed.dayOfWeek)
    setLiveMessage(`${removed.label} volvió a seguir el día base`)
    toast(`${removed.label} volvió a seguir el día base.`, {
      duration: 5000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          const current = stateRef.current
          if (current.variants.some((variant) => variant.key === removed.key)) return
          const variants = [...current.variants]
          variants.splice(Math.min(index, variants.length), 0, removed)
          dispatch({ type: 'RESTORE', state: { ...current, variants, activeVariantKey: removed.key } })
          portions.restoreBySlot({ ...portionsRef.current, ...removedPortions })
          if (removed.dayOfWeek != null) setSelectedDow(removed.dayOfWeek)
          setLiveMessage(`Se restauró ${removed.label}`)
        },
      },
    })
  }

  /**
   * Copia de UNA franja a otros dias (P0-4). Dos piezas en el MISMO gesto: el arbol (reducer)
   * y el mapa de porciones (controller hermano). Los destinos se resuelven ANTES del dispatch
   * con `resolveSlotCopyTargets` sobre el estado previo — exactamente el que usa el reducer —
   * asi que las porciones aterrizan en la franja correcta (la existente si hubo merge por
   * nombre, la clonada si se agrego).
   */
  function handleCopySlot({ sourceVariantKey, slotKey, targetVariantKeys }: SlotCopyRequest) {
    const targets = resolveSlotCopyTargets(state, { sourceVariantKey, slotKey, targetVariantKeys })
    if (targets.length === 0) return
    dispatch({ type: 'COPY_SLOT_TO_VARIANTS', sourceVariantKey, slotKey, targetVariantKeys })
    portions.copySlotToVariants({ sourceVariantKey, sourceSlotKey: slotKey, targets })
    const source = state.variants.find((variant) => variant.key === sourceVariantKey)
    const slotName = source?.slots.find((slot) => slot.key === slotKey)?.name.trim() || 'La franja'
    const onlyTarget =
      targets.length === 1 ? state.variants.find((variant) => variant.key === targets[0].variantKey) : null
    const replaced = targets.filter((target) => target.replaced).length
    announce(
      `${slotName} se copió a ${onlyTarget ? onlyTarget.label : targets.length + ' días'}` +
        (replaced > 0 ? ` (se reemplazó la franja del mismo nombre en ${replaced === 1 ? '1 día' : replaced + ' días'})` : ''),
    )
  }

  const dayHandlers: DayPlanStripHandlers = {
    onSelectDay: handleSelectDay,
    onSelectVariant: handleSelectVariant,
    onPersonalize: handlePersonalizeDay,
    onRename: (variantKey, label) => dispatch({ type: 'SET_VARIANT_LABEL', variantKey, value: label }),
    onChangeDay: handleChangeVariantDay,
    onCopyToDay: handleCopyDayTo,
    onSetTargetsMode: (variantKey, mode) => dispatch({ type: 'SET_VARIANT_TARGETS_MODE', variantKey, mode }),
    onSetVariantTarget: (variantKey, field, value) =>
      dispatch({ type: 'SET_VARIANT_TARGETS', variantKey, field, value }),
    onRemove: handleRemoveVariant,
  }

  function handleDiscardDraft() {
    clearNutritionDraft(draftKey)
    clearNutritionDraft(legacyDraftKey)
    draftPayloadRef.current = null
    setShowDraftBanner(false)
  }

  // Clave de idempotencia ESTABLE por "intento logico" (NUT-011): se fija una vez para un
  // contenido de draft dado y se REUSA en todos los reintentos de ese mismo contenido, para
  // que un retry tras una respuesta perdida devuelva la version YA publicada en vez de crear
  // una segunda version/plan. Solo rota cuando el coach cambia el draft (o la fecha/destino):
  // ahi es otra intencion y merece clave nueva. La firma + la clave se persisten junto al
  // borrador local, asi que sobreviven a un reload y el reintento sigue siendo idempotente.
  // El bloqueo de doble-submit lo sigue dando isPending + botones deshabilitados.
  function draftSignature(draft: unknown, effectiveFrom: string): string {
    return effectiveFrom + '|' + JSON.stringify(draft)
  }

  function stableIdempotencyKey(draft: unknown, effectiveFrom: string): string {
    const signature = draftSignature(draft, effectiveFrom)
    if (publishKeyRef.current && publishSignatureRef.current === signature) {
      return publishKeyRef.current
    }
    operationId.current = genId()
    publishKeyRef.current = buildNutritionIdempotencyKey({
      clientId,
      deviceId: 'web-builder',
      operationId: operationId.current,
      kind: 'publish',
    })
    publishSignatureRef.current = signature
    // Persistencia inmediata (no espera al autosave): si el publish se corta y el coach
    // recarga, "Restaurar" recupera la MISMA clave y el reintento no duplica la version.
    if (builderHasSignificantContent(state)) {
      writeNutritionDraft<BuilderDraftPayload>(
        draftKey,
        {
          clientId,
          planId: existingPlan?.id ?? null,
          state,
          portionsBySlot: portions.bySlot,
          publishKey: publishKeyRef.current,
          publishSignature: signature,
        },
        Date.now(),
      )
    }
    return publishKeyRef.current
  }

  // Publica el draft. `forceNewPlan` fuerza planId null => persistAndPublishDraft crea un plan
  // nuevo (rama "Reemplazar"); si no, publica una nueva version del plan vigente. `inModal`
  // enruta los errores al modal de conflicto en vez del error de la revision.
  function runPublish(opts: { forceNewPlan?: boolean; effectiveFrom?: string; inModal?: boolean } = {}) {
    const { forceNewPlan = false, inModal = false } = opts
    const effectiveFrom = opts.effectiveFrom ?? state.effectiveFrom
    const setError = inModal ? setConflictError : setPublishError
    setPublishError(null)
    setConflictError(null)

    let draft
    try {
      draft = assembleAndValidateDraft(state, {
        clientId,
        planId: forceNewPlan ? null : (existingPlan?.id ?? null),
      })
      // Inyecta los targets de porciones al draft canónico (capa opcional R1): sin
      // porciones (o plan flexible, sin franjas) el draft queda byte-idéntico al de hoy.
      // Multi-día: las claves viajan POR DÍA, alineadas con `draft.dayVariants`.
      draft = attachPortionsAndValidate(draft, variantPortionKeys(state.variants), portions.bySlot)
    } catch {
      setShowErrors(true)
      setError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
      if (inModal) setConflictOpen(false)
      return
    }

    const idempotencyKey = stableIdempotencyKey(draft, effectiveFrom)
    // CAS (NUT-011): al publicar una version NUEVA del plan vigente mandamos la version base
    // que el wizard tenia en pantalla. Si otra sesion publico entremedio, el RPC responde
    // STALE_BASE en vez de superponer una version calculada sobre datos viejos. La rama
    // "Reemplazar" (plan nuevo) no manda CAS: no hay version base que comparar.
    const expectedCurrentVersionId = forceNewPlan ? undefined : existingPlan?.versionId
    startTransition(async () => {
      const res = await publishPlanAction({
        draft,
        idempotencyKey,
        effectiveFrom,
        ...(expectedCurrentVersionId ? { expectedCurrentVersionId } : {}),
      })
      if (res.ok) {
        goToPublished()
        return
      }
      // Red de seguridad: si el pre-chequeo no disparo (carrera con otra pestana/RN) el RPC
      // igual rechaza la fecha => abre el mismo modal en vez del texto rojo crudo.
      if (res.code === 'EFFECTIVE_DATE' && !inModal) {
        setConflictError(null)
        setConflictOpen(true)
        return
      }
      setError(res.error)
    })
  }

  function handlePublish() {
    // Guard multi-dia (F0): este wizard solo sabe emitir UNA variante, asi que republicar
    // sobre un plan con varios dias los borra en silencio. Bloqueo duro; la ruta viva es
    // "Edicion rapida", que si respeta las variantes existentes.
    if (multiDayLocked) {
      setPublishError(MULTI_DAY_LOCK_COPY)
      return
    }
    // Pre-chequeo sin ida y vuelta: si la fecha elegida choca con el plan que ya rige, abre el
    // modal de decision directo. El RPC sigue siendo la barrera real (ver runPublish).
    if (existingPlan && effectiveDateConflicts(state.effectiveFrom, existingPlan.effectiveFrom)) {
      setConflictError(null)
      setConflictOpen(true)
      return
    }
    runPublish()
  }

  function handleConflictOpenChange(next: boolean) {
    if (isPending) return
    setConflictOpen(next)
    if (!next) {
      setConflictError(null)
      // Cada apertura del modal arranca limpia: el proximo "Archivar y reemplazar" es una
      // operacion nueva (nuevo archivado + nueva clave de idempotencia).
      replaceArchivedRef.current = false
      replaceKeyRef.current = null
    }
  }

  // "Empezar manana": mueve la vigencia al dia siguiente a la del plan vigente (garantiza que el
  // RPC la acepte) y republica como nueva version del mismo plan.
  function handleStartTomorrow() {
    const base = existingPlan?.effectiveFrom || state.effectiveFrom || today
    const nextFrom = nextDayIso(base)
    dispatch({ type: 'SET_EFFECTIVE_FROM', value: nextFrom })
    runPublish({ effectiveFrom: nextFrom, inModal: true })
  }

  // "Archivar el actual y reemplazar": archiva el plan vigente y publica el draft como PLAN
  // NUEVO (planId null) con la misma fecha. Encadena dos mutaciones bajo un solo isPending.
  //
  // ORDEN: archivar PRIMERO, publicar despues (no al reves). El RPC de publicacion re-deriva el
  // snapshot del dia EN CURSO del alumno recorriendo TODOS sus planes activos y desempatando por
  // (effective_from desc, version_number desc). Como el reemplazo usa la MISMA fecha de vigencia
  // (hoy), publicar primero dejaria dos planes activos empatados en fecha y el plan VIEJO (mayor
  // version_number) podria ganar y congelar el snapshot equivocado —y archivar despues NO vuelve a
  // re-derivarlo—. Archivar primero saca al plan viejo de la seleccion antes de que el publish
  // re-derive, garantizando que el snapshot de hoy tome el plan nuevo.
  //
  // RECUPERACION (el riesgo del orden archivar-primero es que si el publish falla, el alumno queda
  // sin plan vigente): la operacion es reanudable. Si el archivado ya ocurrio, un reintento lo
  // SALTA (replaceArchivedRef) y solo reintenta el publish; la clave de idempotencia es ESTABLE
  // (replaceKeyRef) para no crear un plan duplicado al reintentar.
  function handleReplaceToday() {
    if (!existingPlan) return
    setConflictError(null)

    // Validamos el draft del plan NUEVO ANTES de archivar nada: si esta incompleto, no tocamos el
    // plan vigente del alumno.
    let draft
    try {
      draft = assembleAndValidateDraft(state, { clientId, planId: null })
      draft = attachPortionsAndValidate(draft, variantPortionKeys(state.variants), portions.bySlot)
    } catch {
      setConflictError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
      return
    }

    // Clave de idempotencia ESTABLE por operacion de reemplazo (se fija una sola vez y se reusa en
    // los reintentos): re-publicar con la misma clave devuelve el mismo plan/version, nunca un duplicado.
    if (!replaceKeyRef.current) {
      operationId.current = genId()
      replaceKeyRef.current = buildNutritionIdempotencyKey({
        clientId,
        deviceId: 'web-builder',
        operationId: operationId.current,
        kind: 'publish',
      })
    }
    const idempotencyKey = replaceKeyRef.current

    startTransition(async () => {
      // PASO 1 — archivar el plan vigente (idempotente; se salta si ya se hizo en un intento previo).
      if (!replaceArchivedRef.current) {
        const archived = await archivePlanAction({ clientId, planId: existingPlan.id })
        if (!archived.ok && !canProceedToPublishAfterArchive(archived)) {
          setConflictError(archived.error)
          return
        }
        replaceArchivedRef.current = true
      }

      // PASO 2 — publicar el draft como plan NUEVO. Si falla, el alumno quedo momentaneamente sin
      // plan vigente; ofrecemos reintentar SOLO la publicacion (sin re-archivar) con un mensaje honesto.
      const res = await publishPlanAction({ draft, idempotencyKey, effectiveFrom: state.effectiveFrom })
      if (res.ok) {
        goToPublished()
        return
      }
      setConflictError(
        'Archivamos el plan anterior, pero no pudimos publicar el nuevo, así que el alumno quedó sin plan vigente. Vuelve a tocar "Archivar el actual y reemplazar" para reintentar solo la publicación (no se archivará de nuevo).',
      )
    })
  }

  /**
   * "Guardar como plantilla" (F3): congela el BORRADOR que el coach tiene en pantalla como
   * material reutilizable. No publica, no toca el plan del alumno y no mueve el respaldo local
   * del wizard: el coach sigue exactamente donde estaba. La biblioteca del hub ya sabía guardar
   * planes PUBLICADOS; esta es la otra mitad (`source: 'builder'`).
   */
  const canSaveTemplate = builderHasSignificantContent(state)

  function handleOpenSaveTemplate() {
    setTemplateName(state.planName.trim() || SAVE_TEMPLATE_DEFAULT_NAME)
    // Editando una plantilla: la descripción guardada se precarga. El guardado reescribe la
    // fila entera, así que abrir el diálogo en blanco la borraría sin que el coach lo pidiera.
    setTemplateDescription(templateId ? (templateMode?.description ?? '') : '')
    setTemplateError(null)
    setTemplateOpen(true)
  }

  function handleTemplateOpenChange(next: boolean) {
    // Cerrar a mitad del guardado dejaría al coach sin saber si quedó guardada.
    if (templateSaving) return
    setTemplateOpen(next)
    if (!next) setTemplateError(null)
  }

  async function handleSaveTemplate() {
    const name = templateName.trim()
    if (name === '' || templateSaving) return
    setTemplateError(null)

    // MISMO ensamblado canónico del publish (draft del contrato + porciones inyectadas), pero
    // con `planId: null`: una plantilla no pertenece a ningún plan. El envoltorio versionado lo
    // arma el servidor (stripDraftIdentity), acá viaja el draft crudo.
    let draft
    try {
      draft = assembleAndValidateDraft(state, { clientId, planId: null })
      draft = attachPortionsAndValidate(draft, variantPortionKeys(state.variants), portions.bySlot)
    } catch {
      setShowErrors(true)
      setTemplateOpen(false)
      toast.error(DRAFT_INCOMPLETE_COPY)
      return
    }

    setTemplateSaving(true)
    // Reabrir la plantilla en el wizard necesita las DOS piezas (árbol del reducer + mapa
    // hermano de porciones); ver `isUsableBuilderPayload` en la page del builder.
    const builder = { state, portionsBySlot: portions.bySlot }
    const description = templateDescription.trim() || null
    // Plantilla ya existente ⇒ se REESCRIBE. Guardar de nuevo tiene que dejar UNA plantilla,
    // no una copia por cada vez que el coach tocó el botón.
    const res = templateId
      ? await updatePlanTemplateDraftAction({ id: templateId, name, description, draft, builder })
      : await savePlanTemplateAction({
          name,
          description,
          draft,
          builder,
          source: 'builder',
          sourcePlanId: existingPlan?.id ?? null,
        })
    setTemplateSaving(false)
    if (!res.ok) {
      // Errores legibles del servidor (tope de 100 plantillas, nombre repetido, permisos): se
      // muestran DENTRO del diálogo para que el coach corrija sin perder lo que escribió.
      setTemplateError(res.error)
      return
    }
    setTemplateOpen(false)

    if (!isTemplateMode) {
      // Builder de un alumno: guardar una plantilla es una acción lateral — el coach sigue
      // exactamente donde estaba, con su borrador intacto.
      toast.success('Plantilla guardada')
      return
    }

    // Builder de plantillas: lo guardado YA vive en el servidor, así que el respaldo local
    // deja de tener sentido (y arrastrarlo haría aparecer el banner "tienes un borrador" sobre
    // una plantilla que acaba de guardarse).
    const created = templateId == null
    setTemplateId(res.template.id)
    clearNutritionDraft(draftKey)
    clearNutritionDraft(legacyDraftKey)
    setDirty(false)
    if (created && typeof window !== 'undefined') {
      // La URL pasa a apuntar a la plantilla recién creada: recargar vuelve a EDITARLA en vez
      // de abrir un builder en blanco (y de crear una segunda al guardar).
      window.history.replaceState(null, '', `${window.location.pathname}?template=${res.template.id}`)
    }
    toast.success(created ? 'Plantilla creada' : 'Plantilla actualizada')
  }

  return (
    <FoodPickerPrefsProvider
      viewerCoachId={foodPickerPrefs?.viewerCoachId ?? null}
      clientName={foodPickerPrefs?.clientName ?? null}
      restrictions={foodPickerPrefs?.restrictions}
      favoriteIds={foodPickerPrefs?.favoriteIds}
    >
    <TemplateModeContext.Provider value={isTemplateMode}>
    {/* Anuncio de los cambios de día/franja para lectores de pantalla (P1-4): el toast es el
        canal visual; esto es el auditivo. `sr-only` para no ocupar layout. */}
    <p aria-live="polite" role="status" className="sr-only">
      {liveMessage}
    </p>
    {/* Respaldo local (W3b): banner de restauración al tope del wizard. Molde tomado de
        WeeklyPlanBuilder (builder de entrenamiento), adaptado a los tokens de este archivo. */}
    {showDraftBanner ? (
      <div className="mb-4 rounded-card border border-primary/25 bg-primary/10 p-3">
        <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:gap-3">
          <History aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
          <p className="flex-1 text-xs font-semibold text-primary">Tienes un borrador sin guardar de esta sesión.</p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={handleRestoreDraft} className={primaryButtonClass + ' min-h-9 px-3 text-xs'}>
              Restaurar
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              aria-label="Descartar borrador"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {/* Guard multi-dia DE RESPALDO: solo si la rehidratacion fallo y el plan tiene varios
        dias. El camino normal ya carga y edita los N dias (FD1c); esto cubre el caso en que
        no pudimos leerlos y publicar los borraria. */}
    {multiDayLocked ? (
      <div
        role="alert"
        className="mb-4 rounded-card border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              No pudimos cargar los {multiDayVariantCount} días de este plan; rehacerlo aquí lo reduciría a uno.
              Usa Edición rápida.
            </p>
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              Vuelve a la ficha del alumno y abre <span className="font-semibold">Edición rápida</span>, que conserva
              cada día con sus comidas y metas. Si prefieres el asistente, recarga la página e inténtalo de nuevo.
            </p>
            <Link
              href={'/coach/nutrition-v2/' + clientId}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-amber-400/70 bg-white/70 px-3 text-xs font-semibold text-amber-900 hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200"
            >
              Volver a la ficha del alumno
            </Link>
          </div>
        </div>
      </div>
    ) : null}
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <MobileBuilderStepper steps={steps} />
        <div className="hidden lg:block">
          <BuilderStepList steps={steps} />
        </div>
        {existingPlan ? (
          // Aviso de versionado: informativo, jerarquia menor que el stepper (icono + texto
          // secundario sobre fondo hundido, sin competir con las cards de contenido).
          <p className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-muted">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Al publicar, este plan reemplaza al vigente para el alumno.
            </span>
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {state.step === BUILDER_STEP_PLAN ? (
          <PlanStep
            state={state}
            dispatch={dispatch}
            errors={showErrors ? validation.errors : {}}
            nutritionProEnabled={nutritionProEnabled}
          />
        ) : null}
        {state.step === BUILDER_STEP_DAYS ? (
          <ConstructionStep
            state={state}
            clientId={clientId}
            dispatch={dispatch}
            errors={showErrors ? validation.errors : {}}
            portions={portions}
            selectedDow={selectedDow}
            todayIso={today}
            dayHandlers={dayHandlers}
            personalizeLocked={personalizeLocked}
            onCopySlot={handleCopySlot}
            onApplyDerivedTargets={(totals) => {
              dispatch({ type: 'SET_TARGET', field: 'calories', value: String(Math.round(totals.calories)) })
              dispatch({ type: 'SET_TARGET', field: 'proteinG', value: String(Math.round(totals.proteinG)) })
              dispatch({ type: 'SET_TARGET', field: 'carbsG', value: String(Math.round(totals.carbsG)) })
              dispatch({ type: 'SET_TARGET', field: 'fatsG', value: String(Math.round(totals.fatsG)) })
              toast('Metas del plan actualizadas con las porciones del día base.', { duration: 4000 })
            }}
          />
        ) : null}

        {/* Porciones que se quedaron en el dia base (defecto B4): sin esto el coach publica
            creyendo que sus porciones rigen toda la semana y al alumno no le llega ninguna. */}
        {state.step === BUILDER_STEP_DAYS ? (
          <PortionsDayGapNotice state={state} portions={portions} />
        ) : null}

        {/* El error de publicacion se pinta junto a la CTA (antes vivia en el paso "Revisar"). */}
        {publishError ? (
          <p
            role="alert"
            className="rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {publishError}
          </p>
        ) : null}

        {/* Controles del wizard: en movil la CTA primaria crece (target grande en la thumb zone);
            en sm+ vuelve a su ancho natural. "Atras" siempre visible (navegacion libre). */}
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <button type="button" onClick={handlePrev} disabled={state.step === 0 || isPending} className={secondaryButtonClass + ' shrink-0'}>
            <ChevronLeft className="h-4 w-4" />
            Atras
          </button>
          {/* Par de la derecha: en móvil el bloque toma el ancho sobrante y la CTA primaria
              crece dentro (el botón de plantilla queda como icono, sin robarle thumb zone);
              en sm+ el par vuelve a su ancho natural, alineado al borde. */}
          <div className="flex flex-1 items-center justify-end gap-3 sm:flex-none">
            {/* Guardar el borrador como plantilla: solo en el paso de días, que es donde el plan
                ya tiene forma. Antes esto solo se podía desde un plan PUBLICADO.
                En el builder de PLANTILLAS esto no es una acción lateral sino LA acción, así
                que sube a CTA primaria (abajo) y este botón secundario no se monta. */}
            {state.step === BUILDER_STEP_DAYS && !isTemplateMode ? (
              <button
                type="button"
                onClick={handleOpenSaveTemplate}
                disabled={!canSaveTemplate || isPending}
                aria-label={SAVE_TEMPLATE_LABEL}
                title={canSaveTemplate ? SAVE_TEMPLATE_LABEL : SAVE_TEMPLATE_EMPTY_COPY}
                className={secondaryButtonClass + ' shrink-0'}
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">{SAVE_TEMPLATE_LABEL}</span>
              </button>
            ) : null}
            {state.step < BUILDER_STEP_DAYS ? (
              <button type="button" onClick={handleNext} className={primaryButtonClass + ' flex-1 justify-center sm:flex-none'}>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : isTemplateMode ? (
              <button
                type="button"
                onClick={handleOpenSaveTemplate}
                disabled={!canSaveTemplate || templateSaving}
                title={canSaveTemplate ? undefined : TEMPLATE_EMPTY_COPY}
                className={primaryButtonClass + ' flex-1 justify-center gap-2 sm:flex-none'}
              >
                {templateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {templateId ? TEMPLATE_UPDATE_LABEL : TEMPLATE_SAVE_LABEL}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending || multiDayLocked}
                title={multiDayLocked ? MULTI_DAY_LOCK_COPY : undefined}
                className={primaryButtonClass + ' flex-1 justify-center gap-2 sm:flex-none'}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Publicar plan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Conflicto de vigencia / "archivar y reemplazar": no existen sin alumno — una plantilla
        no rige para nadie ni desplaza a ningún plan. */}
    {isTemplateMode ? null : (
      <PublishConflictDialog
        open={conflictOpen}
        planName={existingPlan?.name ?? ''}
        canReplace={existingPlan != null}
        isPending={isPending}
        error={conflictError}
        onOpenChange={handleConflictOpenChange}
        onStartTomorrow={handleStartTomorrow}
        onReplaceToday={handleReplaceToday}
      />
    )}

    {/* Nombre de la plantilla. Molde tomado de la biblioteca del hub (PlanTemplatesLibrary)
        para que guardar desde el builder y desde un plan publicado se vean igual. */}
    <Dialog open={templateOpen} onOpenChange={handleTemplateOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">
            {isTemplateMode
              ? templateId
                ? TEMPLATE_UPDATE_LABEL
                : TEMPLATE_SAVE_LABEL
              : SAVE_TEMPLATE_LABEL}
          </DialogTitle>
          <DialogDescription>
            {isTemplateMode
              ? TEMPLATE_DIALOG_HINT
              : 'Se guarda lo que tienes en pantalla, tal cual. No se publica nada y el alumno no se entera.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Nombre de la plantilla
            </span>
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value.slice(0, 180))}
              placeholder={SAVE_TEMPLATE_DEFAULT_NAME}
              className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Descripción (opcional)
            </span>
            <textarea
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Para quién te sirve o cuándo la usas"
              className="w-full rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSaveTemplate()}
            disabled={templateSaving || templateName.trim() === ''}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {templateSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {templateSaving ? 'Guardando…' : templateId ? TEMPLATE_UPDATE_LABEL : TEMPLATE_SAVE_LABEL}
          </button>
        </div>

        {templateError ? (
          <p
            role="alert"
            className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          >
            {templateError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
    </TemplateModeContext.Provider>
    </FoodPickerPrefsProvider>
  )
}
