import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { AlertTriangle, BookOpen, CalendarClock, Check, Copy, CopyCheck, History, Lock, Minus, MoreVertical, Pencil, Plus, RefreshCw, Repeat, Search, Sparkles, Trash2, X } from 'lucide-react-native'
import {
  BuilderDayStrip,
  BuilderStepList,
  DuplicateGroupSheet,
  ExchangeGroupFormSheet,
  FoodThumbnail,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  SelectableStrategyCard,
  variantDayBadge,
  type BuilderDayStripHandlers,
  type ExchangeGroupFormInitial,
} from '../../../../components/nutrition-v2'
// Stepper táctil del quick-edit (H-07): el patrón correcto en móvil ya estaba resuelto ahí y el
// builder seguía con TextInput crudo. Se ADOPTA tal cual — no se copia ni se re-escribe.
import { QuantityStepper } from '../../../../components/nutrition-v2/quick-edit/QuantityStepper'
// Import por ruta directa (no via el barrel index.ts): respeta el contrato de MacroChipRow.
import { MacroChipRow } from '../../../../components/nutrition-v2/MacroChipRow'
import {
  foodCategoryFromName,
  parsePlanBuilderOrigin,
  type FoodCatalogItem,
  type NutritionStrategy,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { exchangeGroupColor, hasUnconfirmedMacros, type ExchangeGroup } from '@eva/nutrition-engine'
import { foodExchangeEquivalenceIssue } from '@eva/schemas'
import { Sheet } from '../../../../components/Sheet'
import { FoodMacrosOverrideSheet } from '../../../../components/nutrition-v2/FoodMacrosOverrideSheet'
import { UndoSnackbar } from '../../../../components/nutrition-v2/quick-edit/PublishBar'
import { toast } from '../../../../components/Toast'
import { useTheme } from '../../../../context/ThemeContext'
import { formatNutritionShortDate } from '../../../../lib/date-utils'
import { isUuid, reportInvalidRouteUuid } from '../../../../lib/safe-uuid'
import { nutritionV2EditorHref } from '../../../../lib/nutrition-v2-hub'
import { fetchNutritionV2ExchangeGroups } from '../../../../lib/nutrition-v2-exchange-groups.api'
import { PORTIONS_COPY } from '../../../../lib/nutrition-portions-copy'
import {
  PORTIONS_MAX,
  PORTIONS_MIN,
  addPortionGroup,
  clonePortionsForVariant,
  combineSubtotals,
  copySlotPortionsToVariants,
  derivePortionTotals,
  dropVariantPortions,
  formatPortionsEs,
  hasAnyPortions,
  portionsFoodsHint,
  portionsKey,
  removePortionGroup,
  slotPortionTargets,
  slotPortionTotals,
  sortGroupsForPicker,
  stepPortionValue,
  type PortionsBySlot,
} from '../../../../lib/nutrition-v2-builder-portions'
import {
  loadBuilderSubstitutionsForVersion,
  rehydrateBuilderState,
} from '../../../../lib/nutrition-v2-builder-rehydrate'
import {
  builderStateFromTemplateDraft,
  templateBuilderDraft,
} from '../../../../lib/nutrition-v2-builder-template'
import { fetchNutritionV2PlanTemplate } from '../../../../lib/nutrition-v2-plan-templates.api'
import { useEntitlements } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import {
  archiveNutritionPlan,
  createCoachFoodRN,
  getNutritionClientDetailV2,
  nutritionV2CoachScope,
  publishDraftRN,
} from '../../../../lib/nutrition-v2.api'
import { searchFoodCatalogV2 } from '../../../../lib/nutrition-v2-catalog.api'
import {
  builderDraftKey,
  clearNutritionDraft,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} from '../../../../lib/nutrition-coach-draft-store'
import { supabase } from '../../../../lib/supabase'
import {
  BUILDER_STEP_COUNT,
  BUILDER_STEP_DAYS,
  BUILDER_STEP_PLAN,
  BUILDER_UNITS,
  CoachFoodInputSchema,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  VISIBLE_NOTES_MAX,
  NUTRITION_PRO_MODULE_KEY,
  assembleAndValidateDraft,
  baseVariantOf,
  buildPublishIdempotencyKey,
  builderDayCells,
  builderHasSignificantContent,
  builderItemPlausibility,
  builderReducer,
  builderVariantForDayOfWeek,
  canProceedToPublishAfterArchive,
  clonedKey,
  createEmptyBuilderState,
  customMacrosOf,
  effectiveDateConflicts,
  inheritedDayOfWeeks,
  itemMacros,
  macroEnergyMismatch,
  mapFoodCatalogItemToBuilderFood,
  resolveSlotCopyTargets,
  slotsLostIfFlexible,
  slotSubtotal,
  strategyUsesSlots,
  takenDayOfWeeks,
  validateStep,
  variantEffectiveTargets,
  variantTotals,
  type BuilderDayCell,
  type BuilderItem,
  type BuilderPermissions,
  type BuilderSlot,
  type BuilderState,
  type BuilderUnit,
  type BuilderVariant,
  type NutritionV2WriteClient,
} from '../../../../lib/nutrition-v2-builder'
// H-07: mismo paso del stepper que el quick-edit (5 para g/ml, 0,5 para unidad/porción). El
// helper vive en la gramatica compartida (@eva/nutrition-v2) desde T3.3a.
import {
  convertQuantityTextOnUnitChange,
  dayWarningCopy,
  foodMagnitudeUnit,
  implausibleItemCopy,
  kcalBucket,
  normalizeIntakeUnit,
  quantityStep,
  reinterpretUnitActionLabel,
  unitEquivalenceCaption,
} from '@eva/nutrition-v2'
import { captureNutritionItemImplausible } from '../../../../lib/analytics'
import { ImplausibleNotice } from '../../../../components/nutrition-v2/quick-edit/ImplausibleNotice'
import { foodCategoryEmoji, foodMediaThumbnailUrl } from '../../../../lib/nutrition-v2-food-media'

const STRATEGY_ORDER: NutritionStrategy[] = ['structured', 'flexible', 'hybrid']

// T2.6 F1: ventana unica del Deshacer destructivo, la misma del web (UNDO_TOAST_MS) y del
// quick-edit RN — una sola gramatica en todo el modulo.
const UNDO_TOAST_MS = 8000

// Wizard de DOS pasos (SPEC nutrition-ui-poda punto 11). "Estrategia" y "Objetivos" caben en una
// pantalla —el primero tenía un solo control— y "Revisión" era eco de lo que "Los días" ya muestra
// en vivo, con `vigente-desde` como único campo editable (en RN siempre vivió en el primer paso).
const STEP_META: Array<{ id: string; label: string }> = [
  { id: 'plan', label: 'El plan' },
  { id: 'days', label: 'Los días' },
]

let keySeq = 0
function genKey(prefix: string): string {
  keySeq += 1
  return prefix + '-' + Date.now().toString(36) + '-' + keySeq
}

/**
 * Avisos de plausibilidad ya reportados a PostHog desde el WIZARD RN (W1.6): `<clave>|<motivo>`.
 * Sets de MODULO ⇒ una vez por ítem/día mientras viva el proceso de la app. Sin esto cada tap de
 * un stepper re-renderiza la fila y mandaría decenas de eventos del mismo aviso.
 */
const REPORTED_IMPLAUSIBLE_ITEMS = new Set<string>()
const REPORTED_IMPLAUSIBLE_DAYS = new Set<string>()

// Target del buscador de catalogo (un solo modal reusado). 'item' = agregar alimento a una
// franja (flujo original); 'substitution' = agregar un reemplazo autorizado a un item (F-02).
// Espejo del patron ya sancionado en el quick-edit RN (SearchTarget mode 'add' | 'swap').
// Multi-dia: TODA mutacion viaja scoped al dia (`variantKey`), nunca al plan entero.
type SearchTarget =
  | { mode: 'item'; variantKey: string; slotKey: string }
  | { mode: 'substitution'; variantKey: string; slotKey: string; itemKey: string }

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Dia calendario siguiente a una fecha ISO (YYYY-MM-DD), en UTC para no depender de la zona
// del dispositivo. Usado por "Empezar manana" cuando la fecha choca con el plan vigente.
function nextDayIso(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts.map((p) => Number(p))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * QW-4 (H-09) — máscara de la hora de franja. El campo era texto libre con teclado alfanumérico y
 * el error ("Hora inválida (usa HH:MM)") recién aparecía al tocar "Siguiente", multiplicado por
 * franjas × días. Acá se escriben SOLO dígitos y los dos puntos se ponen solos.
 *
 * Se queda con los primeros 4 dígitos y separa después del segundo: escribir "0930" da "09:30".
 * El borrado funciona sin re-inyectar el separador ("09:3" → dígitos "093" → "09:3"; "09:" →
 * dígitos "09" → "09"). No valida rangos: eso sigue siendo del validador del reducer, que exige
 * hora de DOS dígitos — la misma forma que produce esta máscara.
 */
function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/**
 * FD6b — bloque opcional "Equivalencia de porciones" del alta de alimento libre (P-B). Vive como
 * estado LOCAL del `ItemEditor` (texto crudo) y sube al `handleSaveCustomFood` de la pantalla, que
 * lo normaliza a las 3 columnas `exchange_*`. `null` = el coach no abrio el bloque.
 */
interface FoodEquivalenceDraft {
  exchangeGroupId: string | null
  /** Texto libre del input (acepta coma decimal es-CL). */
  exchangePortionGrams: string
  exchangePortionLabel: string
}

/** Gramos por porcion: texto -> numero > 0, o `null` (campo vacio / invalido). */
function parseEquivalenceGrams(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

// FD4 — el wizard RN ya construye N dias y la rehidratacion abre el plan vigente COMPLETO, asi
// que el guard anti-perdida de dias dejo de ser la regla: ahora es el FALLBACK del unico caso
// peligroso que sobrevive — la rehidratacion FALLO (lectura de reemplazos caida) y publicar en
// blanco reduciria el plan a un dia. Espejo del `multiDayLocked` web (rehydrationFailed && >1 dia).
function multiDayBlockCopy(dayCount: number): string {
  return `No pudimos cargar los ${dayCount} días de este plan; rehacerlo aquí lo reduciría a uno. Usa Edición rápida.`
}

// H-01 — enumeracion es-CL para el aviso "Revisa Sábado y Domingo" (los dias con error que no
// estan montados). Solo formatea: no decide nada sobre la validacion.
function joinDayLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

/**
 * Dia que el strip abre al restaurar un arbol (plan rehidratado o borrador local): el del dia en
 * edicion que traia el estado, o el primero que hereda el base. `null` solo si los 7 dias son
 * propios y el foco venia en el base (la puerta explicita del dia base huerfano).
 */
function initialDowFor(state: BuilderState): number | null {
  const active = state.variants.find((variant) => variant.key === state.activeVariantKey)
  if (active != null && !active.isDefault && active.dayOfWeek != null) return active.dayOfWeek
  return inheritedDayOfWeeks(state)[0] ?? null
}

// Plan vigente del alumno (sub-delta c): habilita la rama "Archivar y reemplazar". Se lee LOCAL
// con getNutritionClientDetailV2 (no llega por nav params — decision del juez, evita tocar la
// ficha/href de otras unidades). Espejo del `existingPlan` server-provisto del web.
type ExistingPlan = {
  id: string
  /** Version vigente al abrir el wizard: viaja como CAS al publicar (NUT-011). */
  versionId: string
  effectiveFrom: string
  versionNumber: number
  name: string
  /** Dias distintos del plan vigente: >1 dispara el guard anti-perdida (el wizard solo hace uno). */
  dayVariantCount: number
}

// Respaldo local del wizard (4B-13): DOS piezas de estado independientes viajan juntas — el arbol
// del reducer (BuilderState) y el mapa hermano de porciones (PortionsBySlot). Sin `portionsBySlot`
// un plan structured/hybrid restauraria incompleto (las porciones a eleccion se perderian). Espejo
// del web PlanBuilderClient.tsx:1024-1029.
interface BuilderDraftPayload {
  clientId: string
  planId: string | null
  state: BuilderState
  portionsBySlot: PortionsBySlot
  /**
   * Clave de idempotencia del intento de publicacion en curso + firma del contenido con el que se
   * acuño (NUT-011, espejo del web PlanBuilderClient). Restaurar el borrador restaura tambien la
   * clave: si el publish se corto (red / app matada) el reintento con el MISMO contenido reusa la
   * clave y el servidor devuelve la version YA publicada en vez de crear una segunda. Ausente en
   * borradores viejos => se acuña una clave nueva (comportamiento anterior).
   */
  publishKey?: string | null
  publishSignature?: string | null
}

// Copy LITERAL del aviso de salida (web PlanBuilderClient.tsx:1040). Warn-only: "Salir" deja la
// pantalla pero NO borra el borrador (el autosave ya lo persistio; solo publish OK / X del banner
// lo borran). El texto dice "descartarlo?" por fidelidad, pero el borrador siempre sobrevive (igual
// que el `beforeunload` web, que tampoco toca localStorage).
const LEAVE_GUARD_COPY = 'Tienes un borrador sin publicar. ¿Salir y descartarlo?'

// Fieldset "Permisos del alumno" (poda ola 3, SPEC nutrition-ui-poda punto 1): quedan los 2
// permisos reales de punta a punta (UI alumno + servicio + guard SQL); `canSubstitute` era
// decorativo (solo pintaba una pastilla; los reemplazos se muestran al alumno SIEMPRE, con o
// sin el flag) y se retira de esta UI — el campo sigue viviendo en el estado/contrato con su
// default (`assembleDraft` no cambia). Copy corto + explicacion propia (punto 2 del SPEC).
const PERMISSION_FIELDS: Array<[keyof BuilderPermissions, string, string]> = [
  ['canRegisterFreely', 'Registro libre', 'Puede anotar alimentos fuera de lo prescrito.'],
  ['canAdjustPrescribedQuantity', 'Ajustar cantidades', 'Puede cambiar la cantidad de un alimento prescrito.'],
]

// ---------------------------------------------------------------------------
// Controlador de porciones a elección (4B-11) — espejo RN de `usePortionsBuilder` web.
// Estado hermano del reducer del wizard: el mapa slot→targets + el catálogo COMPLETO del
// coach (system + propios) con carga perezosa/error/reintento. Se instancia una vez en la
// pantalla y baja por props a "El plan" (card de derivar) y "Los días" (sección por franja +
// aviso de macros sin confirmar). Sin `commitValue` (stepper de botones, afirmación 7) ni server action:
// la lectura es coach-scoped por RLS (`fetchCoachExchangeGroups`).
// ---------------------------------------------------------------------------

interface PortionsController {
  scope: NutritionV2CoachScope | null
  bySlot: PortionsBySlot
  groups: ExchangeGroup[] | null
  /**
   * Cuántas equivalencias vivas tiene cada grupo (`groupId -> n`), con el mismo alcance que verá
   * el alumno. Un grupo en 0 no muestra NINGÚN ejemplo en el sheet "1 porción equivale a": la UI
   * lo dice en voz alta (picker + aviso por franja) en vez de dejar que lo descubra el alumno.
   * Clave ausente = el conteo no viajó ⇒ no se pinta nada (ver `portionsFoodsHint`).
   */
  groupFoodCounts: Record<string, number>
  groupsLoading: boolean
  groupsError: string | null
  /** Carga el catálogo si aún no está (el picker la dispara al abrirse). */
  ensureGroupsLoaded: () => void
  /** Reintento explícito tras un error de carga. */
  retryGroups: () => void
  addGroup: (slotKey: string, exchangeGroupId: string) => void
  removeGroup: (slotKey: string, exchangeGroupId: string) => void
  step: (slotKey: string, exchangeGroupId: string, direction: 1 | -1) => void
  /** Rehidrata el mapa completo de porciones desde un borrador restaurado (4B-13). */
  restoreBySlot: (map: PortionsBySlot) => void
  /** Multi-día (FD4): copia las porciones de un día al clonarlo (keys derivadas). */
  cloneVariant: (params: {
    sourceVariantKey: string
    targetVariantKey: string
    slotKeyPairs: ReadonlyArray<{ from: string; to: string }>
  }) => void
  /** Multi-día (FD4): descarta las porciones de un día eliminado. */
  dropVariant: (variantKey: string) => void
  /**
   * CE-5: copia las porciones de UNA franja a los días destino de `COPY_SLOT_TO_VARIANTS`. Los
   * `targets` los resuelve `resolveSlotCopyTargets` con el MISMO estado previo que usa el reducer,
   * así que la franja destino puede ser una existente (merge por nombre) o la recién clonada.
   */
  copySlotToVariants: (params: {
    sourceVariantKey: string
    sourceSlotKey: string
    targets: ReadonlyArray<{ variantKey: string; slotKey: string }>
  }) => void
  /**
   * Porciones propias (FD6a): grupo recién creado/editado -> catálogo en memoria, SIN refetch.
   * `foodCount` registra el conteo conocido del grupo (0 en un alta, lo copiado al duplicar);
   * omitirlo deja intacto el conteo previo (edición de un grupo que ya tenía su lista).
   */
  upsertCatalogGroup: (group: ExchangeGroup, foodCount?: number) => void
  /**
   * Porciones propias (FD6a): grupo eliminado -> fuera del catálogo Y de las franjas en edición.
   * Dejarlo colgando en el borrador rompería el publish (`EXCHANGE_GROUP_NOT_FOUND` al congelar).
   */
  dropCatalogGroup: (exchangeGroupId: string) => void
}

function usePortionsBuilder(scope: NutritionV2CoachScope | null): PortionsController {
  const [bySlot, setBySlot] = useState<PortionsBySlot>({})
  const [groups, setGroups] = useState<ExchangeGroup[] | null>(null)
  const [groupFoodCounts, setGroupFoodCounts] = useState<Record<string, number>>({})
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!scope) {
      setGroupsError(PORTIONS_COPY.builder.pickerError)
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    setGroupsLoading(true)
    setGroupsError(null)
    try {
      const res = await fetchNutritionV2ExchangeGroups(scope)
      if (mountedRef.current) {
        setGroups(sortGroupsForPicker(res.groups))
        // Degradación silenciosa server-side: sin conteo el mapa queda vacío y la UI no pinta
        // ninguna línea de apoyo (jamás un 0 inventado).
        setGroupFoodCounts(res.foodCounts ?? {})
      }
    } catch {
      if (mountedRef.current) setGroupsError(PORTIONS_COPY.builder.pickerError)
    } finally {
      loadingRef.current = false
      if (mountedRef.current) setGroupsLoading(false)
    }
  }, [scope])

  const ensureGroupsLoaded = useCallback(() => {
    if (groups == null && !loadingRef.current) void load()
  }, [groups, load])

  const retryGroups = useCallback(() => void load(), [load])
  const addGroup = useCallback(
    (slotKey: string, id: string) => setBySlot((prev) => addPortionGroup(prev, slotKey, id)),
    [],
  )
  const removeGroup = useCallback(
    (slotKey: string, id: string) => setBySlot((prev) => removePortionGroup(prev, slotKey, id)),
    [],
  )
  const step = useCallback(
    (slotKey: string, id: string, direction: 1 | -1) =>
      setBySlot((prev) => stepPortionValue(prev, slotKey, id, direction)),
    [],
  )
  // Restauracion (4B-13): reemplaza el mapa entero de porciones de una. Par obligado del `RESTORE`
  // del reducer — persistir solo `state` perderia silenciosamente las porciones a eleccion.
  const restoreBySlot = useCallback((map: PortionsBySlot) => setBySlot(map), [])

  // Multi-dia (FD4): las porciones viven FUERA del reducer, asi que crear/duplicar/eliminar un dia
  // mueve DOS piezas. Las keys de las franjas clonadas son deterministas (`clonedKey`), asi que el
  // mapa se re-etiqueta sin adivinar. Espejo del web `portions.cloneVariant`/`dropVariant`.
  const cloneVariant = useCallback(
    (params: {
      sourceVariantKey: string
      targetVariantKey: string
      slotKeyPairs: ReadonlyArray<{ from: string; to: string }>
    }) => setBySlot((prev) => clonePortionsForVariant(prev, params)),
    [],
  )
  const dropVariant = useCallback(
    (variantKey: string) => setBySlot((prev) => dropVariantPortions(prev, variantKey)),
    [],
  )
  // CE-5: la franja copiada arrastra sus porciones a elección. Semántica de REEMPLAZO total (si
  // el origen no tiene porciones, las del destino se borran) — espejo exacto de lo que el reducer
  // hace con los items, para que la franja destino quede igual al origen y no mezclada.
  const copySlotToVariants = useCallback(
    (params: {
      sourceVariantKey: string
      sourceSlotKey: string
      targets: ReadonlyArray<{ variantKey: string; slotKey: string }>
    }) => setBySlot((prev) => copySlotPortionsToVariants(prev, params)),
    [],
  )

  // Porciones propias (FD6a): tras un POST/PATCH exitoso el catalogo en memoria se actualiza en el
  // acto (el picker sigue abierto y el grupo ya se puede asignar), sin un refetch de red.
  const upsertCatalogGroup = useCallback((group: ExchangeGroup, foodCount?: number) => {
    setGroups((prev) => {
      const next = prev == null ? [group] : [...prev.filter((g) => g.id !== group.id), group]
      return sortGroupsForPicker(next)
    })
    // Un grupo recién creado nace VACÍO: se registra el 0 EXPLÍCITO para que la fila avise en el
    // acto. Sin la clave, la UI no podría distinguir "vacío" de "conteo no cargado". Al duplicar
    // copiando la lista el caller pasa cuántas equivalencias entraron.
    if (foodCount != null) setGroupFoodCounts((prev) => ({ ...prev, [group.id]: foodCount }))
  }, [])
  const dropCatalogGroup = useCallback((exchangeGroupId: string) => {
    setGroups((prev) => (prev == null ? prev : prev.filter((g) => g.id !== exchangeGroupId)))
    setGroupFoodCounts((prev) => {
      if (!(exchangeGroupId in prev)) return prev
      const next = { ...prev }
      delete next[exchangeGroupId]
      return next
    })
    setBySlot((prev) => {
      let changed = false
      const next: PortionsBySlot = {}
      for (const [key, targets] of Object.entries(prev)) {
        const kept = targets.filter((t) => t.exchangeGroupId !== exchangeGroupId)
        if (kept.length !== targets.length) changed = true
        next[key] = kept
      }
      return changed ? next : prev
    })
  }, [])

  return {
    scope,
    bySlot,
    groups,
    groupFoodCounts,
    groupsLoading,
    groupsError,
    ensureGroupsLoaded,
    retryGroups,
    addGroup,
    removeGroup,
    step,
    restoreBySlot,
    cloneVariant,
    dropVariant,
    copySlotToVariants,
    upsertCatalogGroup,
    dropCatalogGroup,
  }
}

/**
 * RETIRO del par viejo (R2, ventana hasta 2026-08-30): la ruta del wizard queda solo como alias
 * de deep-link y REDIRIGE al editor unico, preservando la puerta `?from=` (misma gramatica).
 * El componente del wizard (`CoachNutritionV2BuilderScreen`, abajo) se conserva integro y queda
 * exportado por nombre: muere el acceso, no el codigo. `planId` no viaja — el editor resuelve
 * solo la raiz vigente del alumno (NUT-004 queda cubierto por esa resolucion).
 */
export default function LegacyCoachNutritionV2BuilderRoute() {
  const params = useLocalSearchParams<{ clientId: string; from?: string }>()
  const clientId = first(params.clientId) ?? ''
  const from = first(params.from) ?? null

  // Telemetria de uuid invalido (mismo canal que tenia el wizard); el destino del rebote es el
  // hub de nutricion, igual que el alias legacy `coach/nutrition-builder`.
  useEffect(() => {
    if (!isUuid(clientId)) reportInvalidRouteUuid('coach/nutrition-v2/builder/[clientId]', clientId)
  }, [clientId])

  if (!isUuid(clientId)) return <Redirect href="/coach/nutricion" />
  return <Redirect href={nutritionV2EditorHref(clientId, { from })} />
}

export function CoachNutritionV2BuilderScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    clientId: string
    planId?: string
    versionNumber?: string
    clientName?: string
    /** ORIGEN del plan (F4, AD-3): `template:<uuid>` — la MISMA puerta que usa la web (`?from=`). */
    from?: string
  }>()
  const clientId = first(params.clientId) ?? ''
  // `?? null` NO alcanza: `?planId=null` entrega el STRING 'null', que sobrevive al `??` y viajaba
  // a un filtro uuid de PostgREST. `planId` es OPCIONAL (sin él el builder crea un plan nuevo) ⇒
  // un valor inválido se degrada a `null` en silencio, sin redirigir.
  const planIdParam = first(params.planId)
  const planId = isUuid(planIdParam) ? planIdParam : null
  const clientName = first(params.clientName) ?? ''
  const versionNumber = Number(first(params.versionNumber) ?? '0') || 0
  const fromParam = first(params.from) ?? null
  /**
   * Plantilla de origen. Solo se soporta `kind: 'template'` en esta ola: `plan:<clientId>` (copiar
   * el plan vigente de OTRO alumno, que la web ya resuelve server-side) exige leer el read-model de
   * un alumno distinto al de la pantalla y queda fuera de alcance — si llega, se ignora y el
   * builder sigue su flujo normal.
   */
  const templateOriginId = useMemo(() => {
    const origin = parsePlanBuilderOrigin(fromParam)
    return origin?.kind === 'template' ? origin.id : null
  }, [fromParam])

  // Guard de entrada: el `clientId` de la ruta SÍ es obligatorio — con `null`/basura no hay plan
  // que construir. `replace` al dashboard del coach (nunca `back()`: puede rebotar en loop).
  useEffect(() => {
    if (isUuid(clientId)) return
    reportInvalidRouteUuid('coach/nutrition-v2/builder/[clientId]', clientId)
    router.replace('/coach/home')
  }, [clientId, router])

  const entitlements = useEntitlements()
  const { ready: workspaceReady, kind, teamId, orgId } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)

  const today = useMemo(todayInSantiago, [])
  const scope = useMemo(
    () => (workspaceReady ? nutritionV2CoachScope({ kind, teamId, orgId }) : null),
    [workspaceReady, kind, teamId, orgId],
  )
  const enabled = entitlements.ready && scope !== null
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)

  const [state, dispatch] = useReducer(builderReducer, today, createEmptyBuilderState)
  // Controlador de porciones a elección (4B-11): estado hermano del wizard, threadeado por el árbol.
  const portions = usePortionsBuilder(scope)
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [dateConflict, setDateConflict] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [blockedFeatureNote, setBlockedFeatureNote] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  /**
   * Selector de día (SPEC punto 10): el coach elige un DÍA de semana, no una variante. Vive en la
   * pantalla y no en el reducer a propósito — es foco de UI, no contenido del plan, y el árbol del
   * borrador no cambia de forma. `null` = el Día base explícito (única puerta cuando los 7 días ya
   * tienen contenido propio). Arranca en lunes: es la primera celda del orden de lectura.
   */
  const [selectedDow, setSelectedDow] = useState<number | null>(1)
  // Plan vigente del alumno (sub-delta c): null hasta resolver la lectura local. `canReplace`
  // se deriva de su presencia, espejo del web (PlanBuilderClient.tsx:1439).
  const [existingPlan, setExistingPlan] = useState<ExistingPlan | null>(null)
  // Respaldo local (4B-13): el fetch de `existingPlan` es ASINCRONO en RN (arranca null y se setea
  // en el .then/.catch), asi que la key del borrador `…:<id>` mutaria a mitad de sesion. Este flag
  // (seteado en AMBAS ramas del fetch) fija la key ANTES de leer/escribir: nada de read+banner ni
  // autosave hasta que resuelva. Sin homologo web (alli `existingPlan` es server-provisto sincrono).
  const [existingPlanResolved, setExistingPlanResolved] = useState(false)
  // FD4 — rehidratacion del plan vigente: `true` cuando el alumno TIENE plan pero no pudimos
  // reconstruirlo (lectura de reemplazos caida). Publicar desde un wizard en blanco reescribiria
  // el arbol completo, asi que ese —y solo ese— caso mantiene el guard anti-perdida de dias.
  const [rehydrationFailed, setRehydrationFailed] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const draftPayloadRef = useRef<BuilderDraftPayload | null>(null)
  const isFirstRenderRef = useRef(true)
  // La rehidratacion (FD4) empuja el plan vigente al reducer + al mapa de porciones. Ese cambio NO
  // es una edicion del coach: se salta UN ciclo de autosave para no dejar un "borrador" que es un
  // clon del plan publicado (y el banner ofreciendolo la proxima vez).
  const skipAutosaveOnceRef = useRef(false)
  const { theme } = useTheme()
  const operationId = useRef(genKey('op'))
  // Reemplazo "archivar->publicar" reanudable (sub-delta c): clave de idempotencia ESTABLE por
  // operacion (fijada una sola vez) + guard "archivado una sola vez", para que un reintento tras
  // archivar reintente SOLO la publicacion sin duplicar el plan ni re-archivar. Espejo del web.
  const replaceKeyRef = useRef<string | null>(null)
  const replaceArchivedRef = useRef(false)
  // Idempotencia ESTABLE del publish normal (NUT-011, espejo del web PlanBuilderClient): clave +
  // firma del draft con el que se acuño. Mismo contenido => misma clave en todos los reintentos;
  // contenido editado => clave nueva (otra intencion). Se persisten con el borrador local.
  const publishKeyRef = useRef<string | null>(null)
  const publishSignatureRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  // Plan vigente del alumno (sub-delta c): lectura LOCAL coach-scoped (RLS) para habilitar la rama
  // "Archivar y reemplazar" y el pre-chequeo de fecha. No-bloqueante: si falla, degrada a null
  // (sin segunda opcion, igual que un alumno sin plan) — el RPC sigue siendo la barrera real.
  useEffect(() => {
    if (!isUuid(clientId) || !scope) return
    let active = true
    void (async () => {
      try {
        const detail = await getNutritionClientDetailV2({ clientId, scope, date: today })
        if (!active) return
        const p = detail.plan.plan
        setExistingPlan(
          p
            ? {
                id: p.id,
                versionId: p.versionId,
                effectiveFrom: p.effectiveFrom,
                versionNumber: p.versionNumber,
                name: p.name,
                dayVariantCount: detail.plan.dayVariants.length,
              }
            : null,
        )
        // FD4 — REHIDRATACION: "Rehacer con el asistente" abre el wizard con los N dias, franjas,
        // items, reemplazos y porciones del plan, para que publicar sin tocar nada produzca el
        // MISMO plan. Los reemplazos NO viajan en el read-model (misma clase del bug
        // private_notes): se leen aparte, RLS-scoped. Si esa lectura falla NO rehidratamos a
        // medias — el guard anti-colapso es preferible a un wizard mutilado.
        //
        // F4 — el ORIGEN GANA (misma regla que el web `builder/page.tsx:157-159`): si el coach
        // entro por "Reutilizar", eso es lo que pidio explicitamente y no se rehidrata el plan
        // vigente encima. `existingPlan` SI se conserva: sigue gobernando la raiz del publish
        // (NUT-004/NUT-011) y la rama "Archivar y reemplazar".
        if (p && !templateOriginId) {
          const subs = await loadBuilderSubstitutionsForVersion(
            supabase as unknown as NutritionV2WriteClient,
            p.versionId,
          )
          if (!active || !mountedRef.current) return
          const rehydrated =
            subs.status === 'loaded'
              ? rehydrateBuilderState({
                  planModel: detail.plan,
                  substitutionsByItemId: subs.byItemId,
                  // Version nueva: arranca vigente hoy (igual que un wizard en blanco).
                  effectiveFrom: today,
                })
              : null
          if (rehydrated) {
            skipAutosaveOnceRef.current = true
            dispatch({ type: 'RESTORE', state: rehydrated.state })
            portions.restoreBySlot(rehydrated.portionsBySlot)
            setSelectedDow(initialDowFor(rehydrated.state))
            if (strategyUsesSlots(rehydrated.state.strategy)) portions.ensureGroupsLoaded()
            setRehydrationFailed(false)
          } else {
            setRehydrationFailed(true)
          }
        } else {
          setRehydrationFailed(false)
        }
        setExistingPlanResolved(true)
      } catch {
        if (!active) return
        setExistingPlan(null)
        setRehydrationFailed(false)
        setExistingPlanResolved(true)
      }
    })()
    return () => {
      active = false
    }
    // `portions` es un controlador estable por callbacks; se omite a proposito para no re-disparar
    // la lectura del plan en cada cambio del mapa de porciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, scope, today, templateOriginId])

  // ── F4: aplicar la PLANTILLA de origen ──────────────────────────────────────────────────────
  //
  // Espejo de la rama `?from=template:` del web (`builder/page.tsx:161-186`), con la unica
  // diferencia de transporte: RN nunca lee la tabla de plantillas por Supabase directo, sino por la
  // API movil (que ademas resuelve los alimentos del catalogo y marca el uso).
  //
  //  a. La plantilla nacio del wizard (trae su `builder`) ⇒ se abre EXACTA, con las macros de los
  //     items libres que el contrato del draft no lleva.
  //  b. Solo trae el `draft` (las importadas de V1) ⇒ se reconstruye con el adaptador, usando los
  //     alimentos que resolvio el servidor. Si esa lectura fallo (`foodsComplete: false`) NO se
  //     aplica: cada item de catalogo quedaria como item libre SIN macros.
  //
  // Una sola vez por plantilla (ref): re-ejecutar volveria a marcar el uso y pisaria las ediciones
  // que el coach ya hizo sobre el wizard.
  const appliedTemplateRef = useRef<string | null>(null)
  useEffect(() => {
    if (!templateOriginId || !scope) return
    if (appliedTemplateRef.current === templateOriginId) return
    appliedTemplateRef.current = templateOriginId
    void (async () => {
      try {
        const template = await fetchNutritionV2PlanTemplate(templateOriginId, { scope })
        if (!mountedRef.current) return
        const applied = template
          ? templateBuilderDraft(template.builder, today) ??
            (template.foodsComplete
              ? builderStateFromTemplateDraft({
                  draft: template.draft as never,
                  foods: template.foods,
                  clientTimezoneToday: today,
                })
              : null)
          : null
        if (!applied) {
          toast.error('No pudimos abrir esa plantilla. Puedes armar el plan desde cero.')
          return
        }
        // Aplicar la plantilla NO es una edicion del coach: se salta UN ciclo de autosave para no
        // dejar un "borrador" que es un clon de la plantilla recien abierta.
        skipAutosaveOnceRef.current = true
        dispatch({ type: 'RESTORE', state: applied.state })
        portions.restoreBySlot(applied.portionsBySlot)
        setSelectedDow(initialDowFor(applied.state))
        if (strategyUsesSlots(applied.state.strategy)) portions.ensureGroupsLoaded()
        // El nombre queda el de la plantilla: el coach lo cambia en el paso "El plan" si quiere.
        toast.success('Plantilla aplicada', { description: template?.name || undefined })
      } catch {
        if (!mountedRef.current) return
        toast.error('No pudimos abrir esa plantilla. Puedes armar el plan desde cero.')
      }
    })()
    // `portions` es un controlador estable por callbacks (misma omision que la lectura del plan).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateOriginId, scope, today])

  // Respaldo local — higiene (4B-13): barre borradores vencidos de AMBOS prefijos (TTL 7d). No
  // depende de la key, asi que corre al montar sin esperar a `existingPlanResolved`. Best-effort.
  useEffect(() => {
    void sweepStaleNutritionDrafts(Date.now())
  }, [])

  // Respaldo local — key estable por alumno+plan (4B-13). Se recalcula cuando resuelve `existingPlan`;
  // hasta entonces vale `…:new`, pero read/write estan gateados por `existingPlanResolved` para no
  // tocar la key inestable.
  const draftKey = useMemo(() => builderDraftKey(clientId, existingPlan?.id ?? null), [clientId, existingPlan?.id])

  // Lectura del respaldo: SOLO tras resolver `existingPlan` (la key ya es estable). Si hay un borrador
  // vigente para ESTE alumno lo guarda en el ref (sin re-render hasta tocar Restaurar) y ofrece el
  // banner. AsyncStorage es async: `active`/`mountedRef` evitan tocar estado tras el desmonte (sin flash).
  //
  // F4 — con ORIGEN el borrador NO se ofrece: el coach acaba de pedir explicitamente partir de una
  // plantilla, y un banner "Restaurar borrador" encima de ella es exactamente la ambiguedad que la
  // regla "el origen gana" existe para evitar (misma decision que en web, donde el origen pisa la
  // rehidratacion). El borrador sigue en AsyncStorage: nada se borra, solo no se propone.
  useEffect(() => {
    if (!existingPlanResolved || templateOriginId) return
    let active = true
    void (async () => {
      const record = await readNutritionDraft<BuilderDraftPayload>(draftKey, Date.now())
      if (!active || !mountedRef.current) return
      if (record != null && record.payload.clientId === clientId) {
        draftPayloadRef.current = record.payload
        setShowDraftBanner(true)
      }
    })()
    return () => {
      active = false
    }
  }, [existingPlanResolved, draftKey, clientId, templateOriginId])

  // Autosave debounced (2000 ms — distinto de los 1500 ms del quick-edit) del arbol del wizard + las
  // porciones. Salta el primer render (la hidratacion inicial no es un cambio del coach) y solo corre
  // con la key estable (`existingPlanResolved`). Si el borrador deja de tener contenido significativo
  // (el coach vacio todo) limpia la key en vez de guardar vacio. AsyncStorage async: `void` sin bloquear.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (skipAutosaveOnceRef.current) {
      skipAutosaveOnceRef.current = false
      return
    }
    if (!existingPlanResolved) return
    const timer = setTimeout(() => {
      if (builderHasSignificantContent(state)) {
        void writeNutritionDraft<BuilderDraftPayload>(
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
        void clearNutritionDraft(draftKey)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [state, portions.bySlot, draftKey, existingPlanResolved, clientId, existingPlan?.id])

  const validation = useMemo(() => validateStep(state, state.step), [state])

  // Selector de dia: el DIA elegido resuelve la variante que se edita — la propia si el coach la
  // personalizo, el dia base si la hereda (misma regla del snapshot). TODA la UI de "Los días"
  // trabaja scoped a esa variante, igual que antes con el chip activo.
  const inheritedDays = useMemo(() => inheritedDayOfWeeks(state), [state])
  const activeVariant = builderVariantForDayOfWeek(state, selectedDow)
  const baseVariant = baseVariantOf(state)

  // El reducer sigue llevando `activeVariantKey` (lo persiste el borrador y lo usa `validateStep`
  // para el alias del error de franjas): se mantiene en lockstep con el dia elegido, una sola
  // fuente de verdad visible (el strip) y cero drift.
  useEffect(() => {
    if (state.activeVariantKey !== activeVariant.key) {
      dispatch({ type: 'SET_ACTIVE_VARIANT', variantKey: activeVariant.key })
    }
  }, [state.activeVariantKey, activeVariant.key])

  // FD4: el guard solo sobrevive para la rehidratacion FALLIDA de un plan de varios dias — ahi
  // publicar en blanco los reduciria a uno. Con rehidratacion OK el wizard los edita todos.
  const multiDayBlocked = rehydrationFailed && (existingPlan?.dayVariantCount ?? 0) > 1

  // OB3 (regla D1 del owner): darle contenido propio a un dia esta incluido en todos los planes
  // — el candado del CTA "Personalizar" se retiro. La barrera real la sigue poniendo el servidor
  // (`multi_variant` -> UPGRADE_REQUIRED), que solo dispara con la cuenta sin acceso vigente.

  // kcal por dia para las celdas del strip (items fijos + porciones a eleccion del MISMO dia), y
  // el conteo de porciones prescritas del dia (vive fuera del reducer, en el mapa hermano).
  const kcalByVariantKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (const variant of state.variants) {
      const keys = variant.slots.map((slot) => portionsKey(variant.key, slot.key))
      const derived = portions.groups ? derivePortionTotals(keys, portions.bySlot, portions.groups) : null
      out[variant.key] = combineSubtotals(variantTotals(variant), derived).calories
    }
    return out
  }, [state.variants, portions.bySlot, portions.groups])

  const portionsByVariantKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (const variant of state.variants) {
      out[variant.key] = variant.slots.reduce(
        (total, slot) =>
          total +
          slotPortionTargets(portions.bySlot, portionsKey(variant.key, slot.key)).reduce(
            (sum, target) => sum + target.portions,
            0,
          ),
        0,
      )
    }
    return out
  }, [state.variants, portions.bySlot])

  const dayCells = useMemo(
    () => builderDayCells(state, { kcalByVariantKey, portionsByVariantKey, todayIso: today }),
    [state, kcalByVariantKey, portionsByVariantKey, today],
  )

  // H-01 (P0) — dias con error de validacion. `validateStep` valida TODOS los dias (publicar emite
  // las N variantes) pero el paso "Los días" solo monta las franjas del dia ELEGIDO: los errores por
  // franja/item de otro dia viven en editores desmontados y "Publicar" quedaba muerto sin ningun
  // mensaje. Aca se PROYECTA el mismo `validation.errors` sobre las variantes (las claves ya son
  // keyables por dia); la validacion no cambia, solo se expone.
  const variantErrorKeys = useMemo(() => {
    if (!showErrors || state.step !== BUILDER_STEP_DAYS || validation.ok) return []
    const stepErrors = validation.errors
    return state.variants
      .filter(
        (variant) =>
          stepErrors['variant.' + variant.key + '.slots'] != null ||
          variant.slots.some(
            (slot) =>
              stepErrors['slot.' + slot.key + '.name'] != null ||
              stepErrors['slot.' + slot.key + '.startTime'] != null ||
              slot.items.some(
                (item) =>
                  stepErrors['item.' + item.key + '.food'] != null ||
                  stepErrors['item.' + item.key + '.quantity'] != null,
              ),
          ),
      )
      .map((variant) => variant.key)
  }, [showErrors, state.step, state.variants, validation])

  // Los mismos errores traducidos a DIAS: el strip marca celdas, no variantes. Un error del dia
  // base pinta todos los dias que lo heredan, que es exactamente a quienes afecta.
  const errorDays = useMemo(() => {
    if (variantErrorKeys.length === 0) return []
    const keys = new Set(variantErrorKeys)
    return dayCells.filter((cell) => keys.has(cell.variant.id)).map((cell) => cell.dayOfWeek)
  }, [variantErrorKeys, dayCells])

  // QW-6 (H-14) — el buscador del builder es UN modal reusado por dos intenciones (agregar el
  // alimento prescrito / agregar un reemplazo autorizado) y no decía cuál: agregar por error un
  // reemplazo como item prescrito cambia el plan del alumno. El título lo dice ahora, con el
  // nombre del item que se está reemplazando (el quick-edit ya lo hacía en su sheet).
  const searchModalTitle = useMemo(() => {
    if (searchTarget == null || searchTarget.mode === 'item') return 'Agregar alimento'
    const variant = state.variants.find((candidate) => candidate.key === searchTarget.variantKey)
    const slot = variant?.slots.find((candidate) => candidate.key === searchTarget.slotKey)
    const item = slot?.items.find((candidate) => candidate.key === searchTarget.itemKey)
    const name = item?.food?.name ?? (item?.customName || '').trim()
    return name ? `Reemplazo de ${name}` : 'Reemplazo autorizado'
  }, [searchTarget, state.variants])

  // Copy del encabezado: la raiz puede venir por query (CTA del hub/ficha) o del plan vigente ya
  // resuelto (deep link viejo). El numero de version sale del param cuando viaja y si no del plan.
  const headerPlanId = planId ?? existingPlan?.id ?? null
  const headerVersionNumber = versionNumber || existingPlan?.versionNumber || 0

  const steps = STEP_META.map((meta, index) => {
    let stepState: 'upcoming' | 'current' | 'complete' | 'error' = 'upcoming'
    if (index === state.step) stepState = showErrors && !validation.ok ? 'error' : 'current'
    else if (index < state.step) stepState = 'complete'
    const description =
      index === BUILDER_STEP_DAYS && !strategyUsesSlots(state.strategy) ? 'Plan flexible: sin franjas' : undefined
    return { id: meta.id, label: meta.label, description, state: stepState }
  })

  const handleNext = useCallback(() => {
    if (!validation.ok) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    dispatch({ type: 'NEXT_STEP' })
  }, [validation.ok])

  const handlePrev = useCallback(() => {
    setShowErrors(false)
    setPublishError(null)
    dispatch({ type: 'PREV_STEP' })
  }, [])

  const handlePickStrategy = useCallback(
    (strategy: NutritionStrategy) => {
      // No-op: re-tocar la MISMA estrategia no hace nada (el reducer tambien lo corta; ver
      // builderReducer). Se corta aca ademas para no disparar el candado Pro sin necesidad.
      if (strategy === state.strategy) return
      if (strategy === 'hybrid' && !hasNutritionPro) {
        setBlockedFeatureNote(
          'El plan híbrido combina franjas guiadas con libertad de registro en el mismo plan. Ahora no está habilitado en esta cuenta.',
        )
        return
      }
      // Confirmacion antes de perder franjas (bug 2.3.5 de la auditoria): "flexible" con
      // contenido en cualquier dia BORRABA todas las franjas sin aviso ni deshacer.
      if (strategy === 'flexible') {
        const slotsAtRisk = slotsLostIfFlexible(state)
        if (slotsAtRisk > 0) {
          const article = slotsAtRisk === 1 ? 'la' : 'las'
          const noun = slotsAtRisk === 1 ? 'franja' : 'franjas'
          Alert.alert(
            'Cambiar a flexible',
            `Cambiar a flexible elimina ${article} ${slotsAtRisk} ${noun} de tus días. ¿Continuar?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Continuar',
                style: 'destructive',
                onPress: () => dispatch({ type: 'SET_STRATEGY', strategy, firstSlotKey: genKey('slot') }),
              },
            ],
          )
          return
        }
      }
      dispatch({ type: 'SET_STRATEGY', strategy, firstSlotKey: genKey('slot') })
    },
    [hasNutritionPro, state],
  )

  // ── Multi-dia: handlers de la barra de dias (espejo 1:1 del web PlanBuilderClient) ─────────
  // Las porciones viven FUERA del reducer, asi que crear/duplicar/eliminar un dia mueve DOS
  // piezas: el arbol (dispatch) y el mapa de porciones (controlador). Las keys de las franjas
  // clonadas son deterministas (`clonedKey`), asi que el mapa se re-etiqueta sin adivinar.

  function cloneVariantPortions(sourceVariant: BuilderVariant, targetVariantKey: string) {
    portions.cloneVariant({
      sourceVariantKey: sourceVariant.key,
      targetVariantKey,
      slotKeyPairs: sourceVariant.slots.map((slot) => ({ from: slot.key, to: clonedKey(targetVariantKey, slot.key) })),
    })
  }

  /**
   * "Personalizar el {día}" / "Copiar a otros días": UNA sola primitiva, la que ya existía
   * (`DUPLICATE_VARIANT_AS` + el clon del mapa de porciones). Personalizar = duplicar el DÍA BASE
   * al día elegido; copiar = duplicar el día propio a los días que todavía heredan. Se filtra aca
   * lo mismo que rechaza el reducer (día ocupado / tope) para que las keys generadas queden
   * alineadas con los días que SÍ se crean y el clon de porciones no apunte a una variante
   * inexistente. "+ Agregar día" ya no existe como concepto (SPEC punto 10).
   */
  function handleDuplicateVariantToDays(sourceVariantKey: string, days: readonly number[]) {
    const source = state.variants.find((variant) => variant.key === sourceVariantKey)
    if (!source) return
    const taken = new Set(takenDayOfWeeks(state))
    for (const day of days) {
      if (taken.has(day) || taken.size >= MAX_DAY_VARIANTS) continue
      taken.add(day)
      const key = genKey('variant')
      dispatch({ type: 'DUPLICATE_VARIANT_AS', sourceVariantKey, key, dayOfWeek: day })
      cloneVariantPortions(source, key)
    }
  }

  // Eliminar un día = ese día vuelve a HEREDAR el día base (el reducer también reapunta
  // `activeVariantKey`). La selección del strip no se mueve: el mismo día sigue elegido y ahora
  // resuelve al base, que es exactamente lo que el coach acaba de pedir.
  function handleRemoveVariant(variantKey: string) {
    dispatch({ type: 'REMOVE_VARIANT', variantKey })
    portions.dropVariant(variantKey)
  }

  // T2.6 F1 — gramatica destructiva unificada: quitar una franja OCURRE en el acto y hay
  // Deshacer de 8 s (espejo del SlotEditor web y del quick-edit RN). Hasta aca el tacho borraba
  // la franja entera —alimentos y porciones— sin confirmacion ni vuelta atras. Las porciones NO
  // se tocan al borrar (viven keyed por `variantKey::slot.key` fuera del reducer), asi que el
  // RESTORE_SLOT las recupera solo.
  const [slotUndo, setSlotUndo] = useState<{ message: string; restore: () => void } | null>(null)
  const slotUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (slotUndoTimerRef.current) clearTimeout(slotUndoTimerRef.current)
    },
    [],
  )

  function handleRemoveSlot(variantKey: string, slotKey: string) {
    const variant = state.variants.find((candidate) => candidate.key === variantKey)
    const index = variant?.slots.findIndex((candidate) => candidate.key === slotKey) ?? -1
    const removed = index >= 0 ? variant?.slots[index] : undefined
    if (!variant || !removed) return
    dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey })
    if (slotUndoTimerRef.current) clearTimeout(slotUndoTimerRef.current)
    setSlotUndo({
      message: `${removed.name.trim() || 'La franja'} se quitó`,
      restore: () => dispatch({ type: 'RESTORE_SLOT', variantKey, index, slot: removed }),
    })
    slotUndoTimerRef.current = setTimeout(() => setSlotUndo(null), UNDO_TOAST_MS)
  }

  function handleSlotUndo() {
    if (slotUndoTimerRef.current) clearTimeout(slotUndoTimerRef.current)
    slotUndo?.restore()
    setSlotUndo(null)
  }

  // CE-5 (H-12) — copiar UNA franja a otros días ya existentes. Antes solo se podía DUPLICAR el
  // día entero al crearlo: cambiar el desayuno de 5 días era repetir el cambio 5 veces a mano.
  //
  // Dos piezas se mueven en el mismo gesto y con el MISMO estado previo: el árbol (reducer) y el
  // mapa de porciones (vive fuera del reducer). `resolveSlotCopyTargets` es la función PURA que
  // ambos consultan, así que la franja que el reducer pisa es exactamente la que recibe las
  // porciones — resolverlo dos veces con estados distintos las desalinearía.
  function handleCopySlotToVariants(sourceVariantKey: string, slotKey: string, targetVariantKeys: string[]) {
    if (targetVariantKeys.length === 0) return
    const targets = resolveSlotCopyTargets(state, { sourceVariantKey, slotKey, targetVariantKeys })
    if (targets.length === 0) return
    dispatch({ type: 'COPY_SLOT_TO_VARIANTS', sourceVariantKey, slotKey, targetVariantKeys })
    portions.copySlotToVariants({
      sourceVariantKey,
      sourceSlotKey: slotKey,
      targets: targets.map((target) => ({ variantKey: target.variantKey, slotKey: target.slotKey })),
    })
  }

  const dayHandlers: BuilderDayStripHandlers = {
    onSelectDay: (dayOfWeek) => setSelectedDow(dayOfWeek),
    onPersonalize: (dayOfWeek) => handleDuplicateVariantToDays(baseVariant.key, [dayOfWeek]),
    onRename: (variantKey, label) => dispatch({ type: 'SET_VARIANT_LABEL', variantKey, value: label }),
    onSetTargetsMode: (variantKey, mode) => dispatch({ type: 'SET_VARIANT_TARGETS_MODE', variantKey, mode }),
    onSetVariantTarget: (variantKey, field, value) =>
      dispatch({ type: 'SET_VARIANT_TARGETS', variantKey, field, value }),
    onCopyDayTo: handleDuplicateVariantToDays,
    onRemove: handleRemoveVariant,
  }

  /**
   * Un día con error que NO está montado se abre tocando "Revisa {día}". El strip selecciona DÍAS,
   * así que la variante con el error se traduce a su día: los días propios tienen el suyo, el día
   * base cae al primer día que lo hereda (o a la puerta explícita `null` si ya no rige ninguno).
   */
  const selectVariant = useCallback(
    (variantKey: string) => {
      const target = state.variants.find((variant) => variant.key === variantKey)
      if (!target) return
      if (!target.isDefault && target.dayOfWeek != null) {
        setSelectedDow(target.dayOfWeek)
        return
      }
      setSelectedDow(inheritedDays[0] ?? null)
    },
    [state.variants, inheritedDays],
  )

  // Punto comun de exito de las DOS ramas de publicacion (normal / "Archivar y reemplazar"): limpia
  // el respaldo local antes de navegar — el plan ya esta en el servidor. Best-effort sin await (la
  // pantalla se desmonta al navegar). Espejo del web goToPublished (PlanBuilderClient.tsx:1159-1162).
  const goToPublished = useCallback(() => {
    void clearNutritionDraft(draftKey)
    router.replace(`/coach/nutrition-v2/${clientId}?published=1`)
  }, [draftKey, clientId, router])

  // Restaurar borrador: rehidrata el arbol del reducer Y el mapa de porciones (dos piezas). El
  // catalogo de grupos NO se persiste; si el plan usa franjas lo precargamos para que las filas de
  // porciones muestren nombre/color en vez del fallback. Espejo del web handleRestoreDraft.
  const handleRestoreDraft = useCallback(() => {
    const payload = draftPayloadRef.current
    if (payload != null) {
      dispatch({ type: 'RESTORE', state: payload.state })
      portions.restoreBySlot(payload.portionsBySlot ?? {})
      setSelectedDow(initialDowFor(payload.state))
      // Idempotencia (NUT-011): recuperar la clave del intento interrumpido es lo que hace que
      // reintentar tras matar la app no publique una segunda version del mismo contenido.
      publishKeyRef.current = payload.publishKey ?? null
      publishSignatureRef.current = payload.publishSignature ?? null
      if (strategyUsesSlots(payload.state.strategy)) portions.ensureGroupsLoaded()
    }
    setShowDraftBanner(false)
  }, [portions])

  // X del banner: borra la key y baja el banner. Junto con `goToPublished` (publish OK) son los DOS
  // unicos borrados; el guard de salida NO borra (el borrador debe sobrevivir para la proxima sesion).
  const handleDiscardDraft = useCallback(() => {
    void clearNutritionDraft(draftKey)
    draftPayloadRef.current = null
    setShowDraftBanner(false)
  }, [draftKey])

  // Clave de idempotencia ESTABLE por "intento logico" (NUT-011): se acuña una vez para un
  // contenido dado y se REUSA en todos los reintentos de ese contenido, para que un retry tras una
  // respuesta perdida devuelva la version YA publicada en vez de crear otra. Solo rota cuando el
  // coach cambia el draft o la fecha (otra intencion). Se persiste de inmediato junto al borrador
  // local para sobrevivir a que la app muera a mitad del publish. Espejo del web.
  const stableIdempotencyKey = useCallback(
    (draft: unknown, effectiveFrom: string): string => {
      const signature = effectiveFrom + '|' + JSON.stringify(draft)
      if (publishKeyRef.current && publishSignatureRef.current === signature) {
        return publishKeyRef.current
      }
      operationId.current = genKey('op')
      publishKeyRef.current = buildPublishIdempotencyKey({ clientId, operationId: operationId.current })
      publishSignatureRef.current = signature
      if (builderHasSignificantContent(state)) {
        void writeNutritionDraft<BuilderDraftPayload>(
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
    },
    [clientId, draftKey, existingPlan?.id, portions.bySlot, state],
  )

  const handlePublish = useCallback(
    async (effectiveFromOverride?: string) => {
      if (!userId || !clientId || !scope) return
      const chosenFrom = effectiveFromOverride ?? state.effectiveFrom ?? today
      // Pre-chequeo sin round-trip: si la fecha elegida choca con el plan que ya rige, abrimos la
      // card de decision directo. Solo en el submit normal — "Empezar manana" ya trae fecha avanzada
      // y no debe re-disparar el pre-chequeo. El RPC sigue siendo la barrera real (ver abajo).
      if (
        effectiveFromOverride === undefined &&
        existingPlan &&
        effectiveDateConflicts(chosenFrom, existingPlan.effectiveFrom)
      ) {
        setPublishError(null)
        setConflictError(null)
        setDateConflict(true)
        return
      }
      setPublishError(null)
      setConflictError(null)
      setDateConflict(false)
      // NUT-004: publicar SIN la raiz del alumno inserta OTRA raiz activa (la DB no tiene invariante
      // de una-raiz-por-alumno) y reinicia el versionado en v1. La ruta puede no traer `planId`
      // (deep link viejo / borrador restaurado), asi que caemos al plan vigente ya resuelto. Y si la
      // lectura aun no resolvio, NO publicamos: hacerlo por carrera de carga crearia la raiz extra.
      if (!existingPlanResolved) {
        setPublishError('Estamos verificando si el alumno ya tiene un plan. Espera un segundo y vuelve a intentar.')
        return
      }
      // F0 — perdida silenciosa de dias: el wizard RN construye UN solo dia. Republicar sobre un
      // plan con varias variantes reescribe el arbol completo y las reduciria a una. Hasta que el
      // constructor sepa crear variantes, se corta aqui (la UI ya lo avisa y deshabilita el CTA).
      if (multiDayBlocked) {
        setPublishError(multiDayBlockCopy(existingPlan?.dayVariantCount ?? 2))
        return
      }
      const effectivePlanId = planId ?? existingPlan?.id ?? null
      let draft
      try {
        draft = assembleAndValidateDraft(state, { clientId, planId: effectivePlanId, portionsBySlot: portions.bySlot })
      } catch {
        setShowErrors(true)
        setPublishError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
        return
      }
      const idempotencyKey = stableIdempotencyKey(draft, chosenFrom)
      setPublishing(true)
        // NUT-005: la publicacion pasa por la API movil (workspace + entitlement + RLS server-side).
      // CAS (NUT-011): al publicar una version NUEVA del plan vigente mandamos la version base que
      // el wizard tenia en pantalla; si otra sesion publico entremedio, el servidor corta con
      // STALE_BASE en vez de superponer una version calculada sobre datos viejos.
      const res = await publishDraftRN({
        scope,
        draft,
        idempotencyKey,
        effectiveFrom: chosenFrom,
        hasNutritionPro,
        expectedCurrentVersionId: effectivePlanId && existingPlan ? existingPlan.versionId : null,
      })
      if (!mountedRef.current) return
      setPublishing(false)
      if (res.ok) {
        goToPublished()
        return
      }
      if (res.code === 'UPGRADE_REQUIRED') {
        setBlockedFeatureNote(res.error)
        return
      }
      // Red de seguridad: si el pre-chequeo no disparo (plan vigente aun sin cargar, o carrera con
      // otra pestana/web) el RPC igual rechaza la fecha => abre la misma card en vez del error crudo.
      if (res.code === 'EFFECTIVE_DATE') {
        setDateConflict(true)
        return
      }
      setPublishError(res.error)
    },
    [
      userId,
      clientId,
      planId,
      state,
      today,
      hasNutritionPro,
      portions.bySlot,
      portions.groups,
      existingPlan,
      existingPlanResolved,
      // FD4: `multiDayBlocked` deriva de este flag — sin él, un publish disparado con la
      // rehidratación ya fallada usaría el guard desactualizado.
      rehydrationFailed,
      goToPublished,
    ],
  )

  // "Empezar manana": mueve la vigencia al dia siguiente al del plan vigente (garantiza que el RPC
  // la acepte) y republica. Con `existingPlan` disponible (sub-delta c) avanzamos desde su fecha,
  // cayendo a la elegida/hoy si aun no cargo. Reusa `nextDayIso` (inline).
  const handleStartTomorrow = useCallback(() => {
    const base = existingPlan?.effectiveFrom || state.effectiveFrom || today
    const nextFrom = nextDayIso(base)
    dispatch({ type: 'SET_EFFECTIVE_FROM', value: nextFrom })
    setDateConflict(false)
    void handlePublish(nextFrom)
  }, [existingPlan, state.effectiveFrom, today, handlePublish])

  // "Archivar el actual y reemplazar" (sub-delta c): archiva el plan vigente y publica el draft como
  // PLAN NUEVO (planId null) con la MISMA fecha. Orden archivar-primero + key estable + guard
  // archivado-una-vez para reintento seguro. Espejo 1:1 del web handleReplaceToday.
  const handleReplaceToday = useCallback(async () => {
    if (!userId || !clientId || !scope || !existingPlan) return
    setConflictError(null)
    // Validamos el draft del plan NUEVO (planId null) ANTES de archivar nada: si esta incompleto, no
    // tocamos el plan vigente del alumno.
    let draft
    try {
      draft = assembleAndValidateDraft(state, { clientId, planId: null, portionsBySlot: portions.bySlot })
    } catch {
      setConflictError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
      return
    }
    // Clave de idempotencia ESTABLE por operacion de reemplazo (se fija una sola vez y se reusa en los
    // reintentos): re-publicar con la misma clave devuelve el mismo plan/version, nunca un duplicado.
    if (!replaceKeyRef.current) {
      replaceKeyRef.current = buildPublishIdempotencyKey({ clientId, operationId: genKey('replace') })
    }
    const idempotencyKey = replaceKeyRef.current
    const effectiveFrom = state.effectiveFrom || today
    setPublishing(true)
    // PASO 1 — archivar el plan vigente PRIMERO (no invertir el orden). El RPC re-deriva el snapshot
    // del dia recorriendo TODOS los planes activos y desempata por (effective_from desc, version_number
    // desc); como el reemplazo usa la MISMA fecha (hoy), publicar primero dejaria dos activos empatados
    // y el viejo (mayor version) podria ganar y congelar el snapshot equivocado. Archivar primero lo
    // saca de la seleccion. Idempotente: gateado por replaceArchivedRef, se salta en reintentos.
    if (!replaceArchivedRef.current) {
      const archived = await archiveNutritionPlan({
        scope,
        clientId,
        planId: existingPlan.id,
      })
      if (archived.code !== 'OK' && !canProceedToPublishAfterArchive(archived)) {
        if (!mountedRef.current) return
        setPublishing(false)
        setConflictError(archived.error)
        return
      }
      replaceArchivedRef.current = true
    }
    // PASO 2 — publicar el draft como plan NUEVO con la key estable + la fecha elegida (hoy). Si falla,
    // el alumno quedo momentaneamente sin plan vigente: ofrecemos reintentar SOLO la publicacion (sin
    // re-archivar, gracias a replaceArchivedRef) con un mensaje honesto.
    // Plan NUEVO: sin CAS (no hay version base con la que comparar).
    const res = await publishDraftRN({
      scope,
      draft,
      idempotencyKey,
      effectiveFrom,
      hasNutritionPro,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    if (res.ok) {
      goToPublished()
      return
    }
    setConflictError(
      'Archivamos el plan anterior, pero no pudimos publicar el nuevo, así que el alumno quedó sin plan vigente. Vuelve a tocar "Archivar el actual y reemplazar" para reintentar solo la publicación (no se archivará de nuevo).',
    )
  }, [userId, clientId, scope, existingPlan, state, today, hasNutritionPro, portions.bySlot, goToPublished])

  // "Cancelar" la card de conflicto: la cierra y arranca limpia la proxima decision (nuevo archivado
  // + nueva clave). Espejo del web handleConflictOpenChange al cerrar el modal.
  const handleCancelConflict = useCallback(() => {
    setDateConflict(false)
    setConflictError(null)
    replaceArchivedRef.current = false
    replaceKeyRef.current = null
  }, [])

  // "Guardar en mi catálogo" (sub-delta b): crea el alimento coach-scoped desde el "alimento libre"
  // y, al OK, despacha UPDATE_ITEM para que el item pase a referenciarlo (deja de ser libre). El
  // componente profundo (ItemEditor) no toca la red: recibe este callback (patron de onSearch).
  // NUT-005: el alta pasa por la API móvil (acción `createFood`), NO por un insert directo en
  // `foods` — así el gate del workspace también cubre este camino.
  const handleSaveCustomFood = useCallback(
    async (
      item: BuilderItem,
      variantKey: string,
      slotKey: string,
      equivalence: FoodEquivalenceDraft | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!clientId || !scope) return { ok: false, error: 'Sesión no disponible. Reintenta.' }
      const unit = item.unit === 'ml' ? 'ml' : 'g'
      const macros = customMacrosOf(item)
      // FD6b — "Equivalencia de porciones" (P-B): el trio `exchange_*` viaja en el MISMO payload
      // del alta. Regla junto-o-nada (grupo ⇔ gramos) validada con el helper compartido para dar
      // el mensaje exacto antes de gastar un round-trip; el servidor la re-valida igual y ademas
      // verifica que el grupo sea VISIBLE para el coach.
      const equivalencePayload = equivalence
        ? {
            exchangeGroupId: equivalence.exchangeGroupId,
            exchangePortionGrams: parseEquivalenceGrams(equivalence.exchangePortionGrams),
            exchangePortionLabel: equivalence.exchangePortionLabel.trim() || null,
          }
        : {}
      const issue = equivalence ? foodExchangeEquivalenceIssue(equivalencePayload) : null
      if (issue) {
        return {
          ok: false,
          error:
            issue.path === 'exchangeGroupId'
              ? PORTIONS_COPY.foodEquivalence.groupRequired
              : PORTIONS_COPY.foodEquivalence.gramsRequired,
        }
      }
      const parsed = CoachFoodInputSchema.safeParse({
        clientId,
        name: (item.customName ?? '').trim(),
        brand: null,
        unit,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatsG: macros.fatsG,
        ...equivalencePayload,
      })
      if (!parsed.success) {
        return { ok: false, error: 'Completa el nombre y macros validas (no negativas) antes de guardar.' }
      }
      const res = await createCoachFoodRN({ scope, input: parsed.data })
      if (!res.ok) return { ok: false, error: res.error }
      dispatch({
        type: 'UPDATE_ITEM',
        variantKey,
        slotKey,
        itemKey: item.key,
        patch: {
          food: res.food,
          customName: null,
          customCalories: '',
          customProteinG: '',
          customCarbsG: '',
          customFatsG: '',
        },
      })
      return { ok: true }
    },
    [clientId, scope],
  )

  const handleSelectFood = useCallback(
    (food: FoodCatalogItem) => {
      if (!searchTarget) return
      const builderFood = mapFoodCatalogItemToBuilderFood(food)
      if (searchTarget.mode === 'item') {
        dispatch({
          type: 'ADD_ITEM',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          key: genKey('item'),
          food: builderFood,
        })
      } else {
        dispatch({
          type: 'ADD_ITEM_SUBSTITUTION',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
          key: genKey('sub'),
          food: builderFood,
        })
      }
      setSearchTarget(null)
    },
    [searchTarget],
  )

  // Guard de salida por back de hardware (Android) — espejo WARN-ONLY del beforeunload web. Solo con
  // contenido significativo muestra el aviso; "Salir" deja la pantalla pero NO borra el borrador (el
  // autosave ya lo persistio y el banner lo ofrecera al volver, igual que web). Sin contenido, deja
  // pasar el back nativo. Solo publish OK y la X del banner borran el borrador.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!builderHasSignificantContent(state)) return false
      Alert.alert(LEAVE_GUARD_COPY, undefined, [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => router.back() },
      ])
      return true
    })
    return () => sub.remove()
  }, [state, router])

  if (!entitlements.ready || !workspaceReady) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-app">
        <View className="flex-1 px-4 pt-6">
          <NutritionSkeleton variant="coach" />
        </View>
      </SafeAreaView>
    )
  }

  if (!enabled || !clientId || !scope) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-app">
        <View className="flex-1 px-4 pt-6">
          <NutritionStatePanel
            icon="permission"
            title="Constructor no habilitado"
            description="El constructor de planes requiere un workspace compatible y un alumno válido."
            action={
              <NutritionMotionButton accessibilityLabel="Volver" tone="neutral" onPress={() => router.back()}>
                Volver
              </NutritionMotionButton>
            }
          />
        </View>
      </SafeAreaView>
    )
  }

  const errors = showErrors ? validation.errors : {}

  // Dias con error que NO estan en pantalla (el paso 2 solo monta el activo). Su aviso va al pie,
  // junto a "Siguiente": es donde mira el coach cuando el boton parece no responder.
  const hiddenErrorVariants = state.variants.filter(
    (variant) => variant.key !== activeVariant.key && variantErrorKeys.includes(variant.key),
  )

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 px-4 pb-6 pt-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Respaldo local (4B-13): borrador sin publicar de una sesion anterior para ESTE
              alumno/plan. Espejo del banner web PlanBuilderClient.tsx:1344-1364 — tokens EVA DS
              (primary), icono History, Restaurar (rehidrata arbol + porciones) + X (descarta). */}
          {showDraftBanner ? (
            <View className="flex-row items-center gap-3 rounded-card border border-primary/25 bg-primary/10 p-3">
              <History color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-xs font-semibold leading-5 text-primary">
                Tienes un borrador sin guardar de esta sesión.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restaurar"
                onPress={handleRestoreDraft}
                className="min-h-11 items-center justify-center rounded-control bg-primary px-3"
              >
                <Text className="text-xs font-bold text-white">Restaurar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Descartar borrador"
                onPress={handleDiscardDraft}
                className="h-11 w-11 items-center justify-center rounded-control"
              >
                <X color={theme.primary} size={16} />
              </Pressable>
            </View>
          ) : null}

          {/* F0 — plan con varios días: el wizard solo construye uno y la publicación reescribe el
              árbol completo, así que rehacerlo aquí borraría los demás días. Se avisa desde el
              paso 1 (no al final) y el CTA de publicar queda deshabilitado. */}
          {multiDayBlocked ? (
            <View className="flex-row items-start gap-3 rounded-card border border-warning-500/30 bg-warning-500/10 p-3">
              <AlertTriangle color={theme.warning} size={16} />
              <Text className="min-w-0 flex-1 text-xs font-semibold leading-5 text-warning-700">
                {multiDayBlockCopy(existingPlan?.dayVariantCount ?? 2)}
              </Text>
            </View>
          ) : null}

          <NutritionHeader
            eyebrow={headerPlanId ? 'Nueva versión' : 'Nuevo plan'}
            title={clientName || 'Constructor de nutrición'}
            description={
              headerPlanId
                ? `Al publicar se creará la versión v${headerVersionNumber + 1} y la actual pasará a anterior.`
                : 'Define el plan, arma sus días y publícalo.'
            }
          />

          {/* H-04: stepper compacto y navegable HACIA ATRÁS (solo pasos completados: volver a uno
              equivale a pulsar "Atrás" N veces, nunca esquiva la validación de "Siguiente"). */}
          <BuilderStepList
            steps={steps}
            onSelectStep={(index) => {
              if (index >= state.step) return
              setShowErrors(false)
              setPublishError(null)
              dispatch({ type: 'SET_STEP', step: index })
            }}
          />

          {state.step === BUILDER_STEP_PLAN ? (
            <PlanStep
              state={state}
              dispatch={dispatch}
              errors={errors}
              hasNutritionPro={hasNutritionPro}
              onPickStrategy={handlePickStrategy}
              portions={portions}
            />
          ) : null}
          {state.step === BUILDER_STEP_DAYS ? (
            <DaysStep
              state={state}
              variant={activeVariant}
              dayCells={dayCells}
              selectedDow={selectedDow}
              inheritedDays={inheritedDays}
              activeKcal={kcalByVariantKey[activeVariant.key] ?? 0}
              errorDays={errorDays}
              dayHandlers={dayHandlers}
              onSelectVariant={selectVariant}
              dispatch={dispatch}
              errors={errors}
              variantErrorKeys={variantErrorKeys}
              onSearch={(target) => setSearchTarget(target)}
              onSaveCustomFood={handleSaveCustomFood}
              onCopySlotToVariants={handleCopySlotToVariants}
              onRemoveSlot={handleRemoveSlot}
              portions={portions}
              publishError={publishError}
              dateConflict={dateConflict}
              conflictError={conflictError}
              canReplace={existingPlan !== null}
              existingPlanName={existingPlan?.name ?? null}
              publishing={publishing}
              onStartTomorrow={handleStartTomorrow}
              onReplaceToday={() => void handleReplaceToday()}
              onCancelConflict={handleCancelConflict}
            />
          ) : null}
        </ScrollView>

        {slotUndo ? <UndoSnackbar message={slotUndo.message} onUndo={handleSlotUndo} /> : null}

        <View className="border-t border-subtle bg-surface-app">
          {/* H-01 (P0): "Publicar" no avanza por un error que vive en un dia NO montado. Sin esta
              linea el boton parece muerto: el unico rastro era la fila roja del BuilderStepList. */}
          {hiddenErrorVariants.length > 0 ? (
            <View className="flex-row items-start gap-2 px-4 pt-3">
              <AlertTriangle color={theme.destructive} size={14} />
              <Text className="min-w-0 flex-1 text-xs font-medium leading-snug text-danger-600">
                Revisa {joinDayLabels(hiddenErrorVariants.map((variant) => variant.label))} para continuar.
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-center justify-between gap-3 px-4 py-3">
            <NutritionMotionButton
              accessibilityLabel="Paso anterior"
              tone="neutral"
              disabled={state.step === BUILDER_STEP_PLAN || publishing}
              onPress={handlePrev}
            >
              Atrás
            </NutritionMotionButton>
            {state.step < BUILDER_STEP_COUNT - 1 ? (
              <NutritionMotionButton accessibilityLabel="Siguiente paso" onPress={handleNext}>
                Siguiente
              </NutritionMotionButton>
            ) : (
              <NutritionMotionButton
                accessibilityLabel="Publicar plan"
                pending={publishing || !existingPlanResolved}
                disabled={publishing || !existingPlanResolved || multiDayBlocked}
                onPress={() => void handlePublish()}
              >
                Publicar plan
              </NutritionMotionButton>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <FoodSearchModal
        visible={searchTarget !== null}
        title={searchModalTitle}
        onClose={() => setSearchTarget(null)}
        onSelect={handleSelectFood}
      />
      <FeatureUnavailableSheet reason={blockedFeatureNote} onClose={() => setBlockedFeatureNote(null)} />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Campos reutilizables
// ---------------------------------------------------------------------------

function ErrorText({ message }: { message?: string }) {
  if (!message) return null
  return <Text className="mt-1 text-xs font-medium text-danger-600">{message}</Text>
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  hint,
  autoFocus,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad'
  error?: string
  hint?: string
  autoFocus?: boolean
}) {
  const { theme } = useTheme()
  return (
    <View>
      <Text className="mb-1.5 text-sm font-semibold text-strong">{label}</Text>
      <TextInput
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboardType ?? 'default'}
        className="min-h-11 rounded-control border border-default bg-surface-card px-3 py-2 text-base text-strong"
      />
      {hint && !error ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
      <ErrorText message={error} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Paso 0 — "El plan": estrategia + nombre + metas + permisos + vigencia
//
// Fusión de los pasos "Estrategia" y "Objetivos" del wizard de cuatro (SPEC nutrition-ui-poda
// punto 11). El primero tenía UN control y el segundo seis: juntos caben en una pantalla, y de
// paso elegir estrategia deja de ser un gesto de navegación repetible (raíz del bug 2.3.5).
// ---------------------------------------------------------------------------

function PlanStep({
  state,
  dispatch,
  errors,
  hasNutritionPro,
  onPickStrategy,
  portions,
}: {
  state: BuilderState
  dispatch: BuilderDispatch
  errors: Record<string, string>
  hasNutritionPro: boolean
  onPickStrategy: (strategy: NutritionStrategy) => void
  portions: PortionsController
}) {
  // El candado usaba un hex (`#8A94A6`): en dark/white-label el gris quedaba fuera del sistema.
  const { theme } = useTheme()
  const router = useRouter()
  return (
    <View className="gap-4">
      <View className="gap-3">
        <Text className="font-display text-lg font-semibold text-strong">¿Cómo se estructura el plan?</Text>
        <ErrorText message={errors.strategy} />
        <View className="gap-3">
          {STRATEGY_ORDER.map((strategy) => {
            const locked = strategy === 'hybrid' && !hasNutritionPro
            return (
              <View key={strategy}>
                <SelectableStrategyCard
                  strategy={strategy}
                  selected={state.strategy === strategy}
                  onSelect={onPickStrategy}
                />
                {locked ? (
                  <View className="mt-1.5 flex-row items-center gap-1.5 px-1">
                    <Lock color={theme.mutedForeground} size={13} />
                    <Text className="text-xs font-medium text-muted">No disponible en esta cuenta</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      </View>

      <PortionsDeriveCard state={state} portions={portions} dispatch={dispatch} />
      <LabeledInput
        label="Nombre del plan"
        value={state.planName}
        onChangeText={(value) => dispatch({ type: 'SET_PLAN_NAME', value })}
        placeholder="Ej: Plan de definición"
        error={errors.planName}
      />

      <NutritionCard>
        <Text className="font-display text-base font-semibold text-strong">
          {state.variants.length > 1 ? 'Metas del día base' : 'Metas diarias'}
        </Text>
        <Text className="mt-1 text-xs text-muted">
          {state.variants.length > 1
            ? 'Los días específicos las heredan salvo que les pongas objetivos propios.'
            : 'Define al menos una meta (kcal o un macro).'}
        </Text>
        {/* QW-3 (H-08): `decimal-pad`, no `number-pad`. En iOS el teclado numérico puro no trae
            separador decimal y el modelo SÍ acepta decimales (coma es-CL incluida): el coach
            escribía 35 donde quería 3,5 y el aviso de mismatch de energía saltaba sin motivo
            visible. La cantidad del item ya usaba decimal-pad: la inconsistencia era interna. */}
        <View className="mt-3 gap-3">
          <LabeledInput
            label="Energía (kcal)"
            value={state.targets.calories}
            onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'calories', value })}
            placeholder="2000"
            keyboardType="decimal-pad"
            error={errors.calories}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <LabeledInput
                label="Proteína (g)"
                value={state.targets.proteinG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'proteinG', value })}
                placeholder="150"
                keyboardType="decimal-pad"
                error={errors.proteinG}
              />
            </View>
            <View className="flex-1">
              <LabeledInput
                label="Carbos (g)"
                value={state.targets.carbsG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'carbsG', value })}
                placeholder="200"
                keyboardType="decimal-pad"
                error={errors.carbsG}
              />
            </View>
            <View className="flex-1">
              <LabeledInput
                label="Grasas (g)"
                value={state.targets.fatsG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'fatsG', value })}
                placeholder="60"
                keyboardType="decimal-pad"
                error={errors.fatsG}
              />
            </View>
          </View>
        </View>
        {/* Citas de la información de salud (App Review 1.4.1): las metas que el coach escribe acá
            son las que el alumno ve como recomendación. El método y sus referencias tienen que ser
            alcanzables desde donde se definen. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ver las fuentes y el método de cálculo de calorías y macronutrientes"
          onPress={() => router.push('/fuentes')}
          className="mt-3 flex-row items-center gap-2 self-start"
          hitSlop={6}
        >
          <BookOpen color={theme.textSecondary} size={13} />
          <Text className="text-xs font-semibold text-muted underline">
            Fuentes y método de cálculo
          </Text>
        </Pressable>
      </NutritionCard>

      <NutritionCard>
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Permisos del alumno</Text>
        <Text className="mt-1 text-xs text-muted">Qué puede hacer el alumno con este plan, más allá de seguirlo.</Text>
        <View className="mt-2 gap-1">
          {PERMISSION_FIELDS.map(([field, label, hint]) => (
            <PermissionRow
              key={field}
              label={label}
              hint={hint}
              checked={state.permissions[field]}
              onToggle={() => dispatch({ type: 'SET_PERMISSION', field, value: !state.permissions[field] })}
            />
          ))}
        </View>
      </NutritionCard>

      {/* Notas visibles para el alumno (T2.6 F5, espejo web/quick-edit: mismo limite y copy).
          Hasta ahora el builder RN solo las ARRASTRABA del plan vigente. */}
      <View>
        <Text className="mb-1.5 text-sm font-semibold text-strong">Notas para tu alumno</Text>
        <TextInput
          value={state.visibleNotes ?? ''}
          onChangeText={(value) => dispatch({ type: 'SET_VISIBLE_NOTES', value })}
          placeholder="Escribe indicaciones visibles para tu alumno (bienvenida, comida libre, recordatorios…)."
          placeholderTextColor={theme.mutedForeground}
          multiline
          maxLength={VISIBLE_NOTES_MAX}
          textAlignVertical="top"
          className="min-h-24 rounded-control border border-default bg-surface-card px-3 py-2 text-base leading-6 text-strong"
        />
        <ErrorText message={errors.visibleNotes} />
      </View>

      {/* Vigencia: en RN siempre vivió acá (en la web estaba en el paso "Revisar" que se elimina).
          QW-10: el hint lee la fecha en voz humana, no la ISO cruda que el coach acaba de escribir. */}
      <LabeledInput
        label="Vigente desde"
        value={state.effectiveFrom}
        onChangeText={(value) => dispatch({ type: 'SET_EFFECTIVE_FROM', value })}
        placeholder="YYYY-MM-DD"
        hint={
          /^\d{4}-\d{2}-\d{2}$/.test(state.effectiveFrom.trim())
            ? `Empieza a regir ${formatNutritionShortDate(state.effectiveFrom.trim(), { relative: true })}. Debe ser posterior a la versión vigente.`
            : 'Formato AAAA-MM-DD. Debe ser posterior a la versión vigente.'
        }
      />
    </View>
  )
}

// Fila-checkbox de permiso (sub-delta a): afordancia de casilla nativa (RN no tiene
// <input type=checkbox>). Casilla cuadrada con `Check` visible SOLO al estar activo, tintada con
// `theme.primary` (nunca un hex — white-label). La UI NO autoriza: los permisos son metadatos del
// plan; el enforcement real vive en el read-model del alumno y en el RPC. Patron de checkbox ya
// sancionado (AssignClientsSheet / modal de asignar 4B-08): Pressable + accessibilityRole="checkbox".
function PermissionRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint?: string
  checked: boolean
  onToggle: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="min-h-11 flex-row items-start gap-2.5 rounded-control px-1 py-1.5"
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded-control border ${
          checked ? 'border-transparent' : 'border-default bg-surface-card'
        }`}
        style={checked ? { backgroundColor: theme.primary } : undefined}
      >
        {checked ? <Check color={theme.primaryForeground} size={14} /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm text-body">{label}</Text>
        {hint ? <Text className="mt-0.5 text-xs text-muted">{hint}</Text> : null}
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Porciones a elección (4B-11) — sección por franja, card de derivar, chips de revisión.
// Patrón visual del quick-edit (EditablePortionsSection) adaptado: SIN notes (el
// PortionTargetDraft del builder no las tiene) y con el picker del CATÁLOGO COMPLETO
// (loading/error/reintento) en vez del dict del plan. El circulito usa `exchangeGroupColor`
// SOLO como identidad (letra blanca; nunca colorea texto sobre superficie — white-label safe).
// ---------------------------------------------------------------------------

/** Circulito de identidad del grupo: color del catálogo SOLO aquí, letra blanca. */
function PortionsGroupDot({ code, color, sortOrder }: { code: string; color: string | null; sortOrder: number }) {
  return (
    <View
      accessible={false}
      className="h-5 w-5 items-center justify-center rounded-full"
      style={{ backgroundColor: exchangeGroupColor({ color, sortOrder }) }}
    >
      <Text className="text-[10px] font-bold leading-none text-white">{code.slice(0, 3)}</Text>
    </View>
  )
}

/**
 * Stepper de porciones SOLO botones (paso 0,5; mínimo 0,5; máximo 99). El valor es un Text
 * — sin TextInput no hay teclado numérico posible (adaptación nativa sancionada, afirmación 7).
 * Con clamp por construcción el valor siempre es un múltiplo válido; no se porta el input
 * libre del web (`parsePortionsInput`/`commitValue`).
 */
function PortionsStepper({
  groupName,
  portions,
  onStep,
}: {
  groupName: string
  portions: number
  onStep: (direction: 1 | -1) => void
}) {
  const { theme } = useTheme()
  const canDecrement = portions > PORTIONS_MIN
  const canIncrement = portions < PORTIONS_MAX
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.stepDownAria(groupName)}
        disabled={!canDecrement}
        onPress={() => onStep(-1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-default bg-surface-card ${canDecrement ? '' : 'opacity-40'}`}
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <Text
        accessibilityLabel={`Porciones de ${groupName}: ${formatPortionsEs(portions)}`}
        className="w-12 text-center text-base font-semibold text-strong"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatPortionsEs(portions)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.stepUpAria(groupName)}
        disabled={!canIncrement}
        onPress={() => onStep(1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-default bg-surface-card ${canIncrement ? '' : 'opacity-40'}`}
      >
        <Plus color={theme.foreground} size={16} />
      </Pressable>
    </View>
  )
}

/**
 * Bottom sheet de altas (nativeModal, gorhom vetado bajo reanimated 4): el CATÁLOGO COMPLETO
 * del coach con estados loading/error/reintento (afirmación 5/6). Los grupos ya presentes en
 * la franja quedan deshabilitados (UNIQUE franja+grupo).
 *
 * Porciones propias (FD6a): al final de la lista va "+ Crear grupo nuevo", y cada fila PROPIA
 * (`!isSystem`) lleva su afordancia de opciones. Ambas abren el `ExchangeGroupFormSheet`, que se
 * monta DENTRO de este sheet a propósito: en RN dos `Modal` hermanos no apilan de forma confiable
 * en iOS, y anidarlo mantiene el picker abierto debajo — al guardar, la lista se refresca en el
 * acto (`controller.upsertCatalogGroup`) sin cerrar nada ni volver a pegarle a la red. El menú
 * "Editar/Eliminar" del web se colapsa en una sola entrada: el formulario de edición ya expone
 * Guardar y Eliminar (adaptación nativa, mismas dos acciones).
 *
 * T4.3: las filas del SISTEMA ya no son callejones sin salida — llevan "Duplicar y ajustar", que
 * crea un grupo PROPIO con los macros precargados Y (por defecto) copia su lista de equivalencias
 * reescalada. Es la respuesta al pedido real del coach ("el cereal aporta 15 g de carbos y yo
 * trabajo con 20") sin tocar el grupo compartido ni los planes que ya lo usan.
 */
function PortionsGroupPickerSheet({
  open,
  onClose,
  controller,
  usedGroupIds,
  onPick,
}: {
  open: boolean
  onClose: () => void
  controller: PortionsController
  usedGroupIds: ReadonlySet<string>
  onPick: (exchangeGroupId: string) => void
}) {
  const { theme } = useTheme()
  const groups = controller.groups
  const [formOpen, setFormOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ExchangeGroupFormInitial | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<ExchangeGroup | null>(null)

  function openCreate() {
    setEditingGroup(null)
    setFormOpen(true)
  }
  function openEdit(group: ExchangeGroup) {
    setEditingGroup({
      id: group.id,
      name: group.name,
      code: group.code,
      refCalories: group.refCalories,
      refProteinG: group.refProteinG,
      refCarbsG: group.refCarbsG,
      refFatsG: group.refFatsG,
      color: group.color,
    })
    setFormOpen(true)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['70%']}
      title={PORTIONS_COPY.builder.addGroup}
      accessibilityLabel={PORTIONS_COPY.builder.addGroup}
    >
      {groups == null && controller.groupsLoading ? (
        <View className="items-center gap-2 py-8">
          <ActivityIndicator color={theme.primary} />
          <Text className="text-sm text-muted">{PORTIONS_COPY.builder.pickerLoading}</Text>
        </View>
      ) : groups == null && controller.groupsError ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-sm text-muted">{controller.groupsError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PORTIONS_COPY.builder.pickerRetry}
            onPress={() => controller.retryGroups()}
            className="min-h-11 flex-row items-center justify-center rounded-control border border-primary/30 bg-primary/10 px-4"
          >
            <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.builder.pickerRetry}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-1 pb-2">
          {(groups ?? []).map((group) => {
            const used = usedGroupIds.has(group.id)
            // Tercera línea (F1): cuántas equivalencias verá el alumno. Solo cuando el grupo es
            // elegible — si ya está en la franja, la segunda línea dice eso y no hay nada que elegir.
            const foods = used ? null : portionsFoodsHint(controller.groupFoodCounts[group.id])
            return (
              <View key={group.id} className="flex-row items-center gap-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    used
                      ? `${group.name}: ${PORTIONS_COPY.builder.groupUsed}`
                      : foods
                        ? `Agregar ${group.name}. ${foods.text}`
                        : `Agregar ${group.name}`
                  }
                  disabled={used}
                  onPress={() => onPick(group.id)}
                  className={`min-h-12 min-w-0 flex-1 flex-row items-center gap-3 rounded-control px-2 py-2 ${used ? 'opacity-50' : 'active:bg-surface-sunken'}`}
                >
                  <PortionsGroupDot code={group.code} color={group.color} sortOrder={group.sortOrder} />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="shrink text-sm font-semibold text-strong" numberOfLines={1}>
                        {group.name}
                      </Text>
                      {!group.macrosConfirmed ? (
                        <View className="shrink-0 rounded-pill border border-warning-500/30 bg-warning-500/10 px-1.5 py-px">
                          <Text className="text-[10px] font-semibold text-warning-700">
                            {PORTIONS_COPY.builder.referentialBadge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {used
                        ? PORTIONS_COPY.builder.groupUsed
                        : `1 porción ≈ ${Math.round(group.refCalories)} kcal · ${Math.round(group.refCarbsG)} C · ${Math.round(group.refProteinG)} P`}
                    </Text>
                    {foods ? (
                      <Text
                        className={`text-[11px] ${foods.empty ? 'font-medium text-warning-700' : 'text-subtle'}`}
                        numberOfLines={1}
                      >
                        {foods.text}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
                {/* Grupos PROPIOS del coach: editar/eliminar. Los del SISTEMA no se editan (la
                    RLS `xg_update`/`xg_delete` los niega igual) pero sí se duplican: es su única
                    salida cuando los macros del catálogo no son los que usa el coach. */}
                {!group.isSystem ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={PORTIONS_COPY.groupEditor.manageAria(group.name)}
                    onPress={() => openEdit(group)}
                    hitSlop={4}
                    className="h-11 w-11 items-center justify-center rounded-control"
                  >
                    <Pencil color={theme.mutedForeground} size={16} />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={PORTIONS_COPY.groupEditor.duplicateAria(group.name)}
                    onPress={() => setDuplicateSource(group)}
                    hitSlop={4}
                    className="h-11 w-11 items-center justify-center rounded-control"
                  >
                    <Copy color={theme.mutedForeground} size={16} />
                  </Pressable>
                )}
              </View>
            )
          })}

          {/* Porciones propias (FD6a): alta sin salir del picker. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PORTIONS_COPY.groupEditor.createRow}
            onPress={openCreate}
            className="mt-1 min-h-12 flex-row items-center gap-3 rounded-control border border-dashed border-default px-2 py-2 active:bg-surface-sunken"
          >
            <View className="h-5 w-5 items-center justify-center rounded-full border border-dashed border-primary/60">
              <Plus color={theme.primary} size={12} />
            </View>
            <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.groupEditor.createRow}</Text>
          </Pressable>
        </View>
      )}

      {/* Anidado DENTRO del picker a propósito (dos Modal hermanos no apilan bien en iOS). */}
      {controller.scope ? (
        <ExchangeGroupFormSheet
          open={formOpen}
          initial={editingGroup}
          scope={controller.scope}
          onClose={() => setFormOpen(false)}
          // Alta ⇒ el grupo nace con 0 equivalencias y la fila lo avisa en el acto. Edición ⇒ el
          // conteo previo se conserva (editar macros no toca la lista).
          onSaved={(group) => controller.upsertCatalogGroup(group, editingGroup ? undefined : 0)}
          onDeleted={(groupId) => controller.dropCatalogGroup(groupId)}
        />
      ) : null}

      {/* Duplicar y ajustar (T4.3), también anidado. DIVERGENCIA deliberada con la web: al
          terminar, el grupo nuevo se AGREGA a la franja y el picker se cierra (`onPick`), en vez
          de volver a la lista con el picker abierto. Dos razones nativas: (1) el coach entró por
          "Agregar grupo", así que el grupo recién hecho es exactamente lo que venía a poner; (2)
          los toasts del kit viven en la raíz y un `Modal` nativo los tapa — dejando el picker
          abierto, el aviso de cuántas equivalencias se copiaron no se vería nunca. */}
      {duplicateSource ? (
        <DuplicateGroupSheet
          open
          source={duplicateSource}
          takenCodes={(groups ?? []).map((entry) => entry.code)}
          onClose={() => setDuplicateSource(null)}
          onDuplicated={(created, copied) => {
            controller.upsertCatalogGroup(created, copied)
            setDuplicateSource(null)
            onPick(created.id)
          }}
        />
      ) : null}
    </Sheet>
  )
}

/**
 * Sección "Porciones a elección" de una franja (dentro de SlotEditor, bajo el buscador).
 * `slotKey` YA viene compuesto (`variantKey::slotKey`): dos días con una franja homónima
 * ("Almuerzo" clonado del base) no comparten porciones.
 */
function BuilderPortionsSection({
  slotKey,
  controller,
}: {
  slotKey: string
  controller: PortionsController
}) {
  const { theme } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)
  const targets = slotPortionTargets(controller.bySlot, slotKey)
  const groupById = useMemo(
    () => new Map((controller.groups ?? []).map((g) => [g.id, g])),
    [controller.groups],
  )
  const usedGroupIds = useMemo(() => new Set(targets.map((t) => t.exchangeGroupId)), [targets])

  const openPicker = () => {
    controller.ensureGroupsLoaded()
    setPickerOpen(true)
  }

  return (
    <View className="mt-3 border-t border-subtle pt-3">
      <Text className="text-sm font-medium text-strong">{PORTIONS_COPY.builder.sectionTitle}</Text>
      <Text className="mt-0.5 text-xs text-muted">{PORTIONS_COPY.builder.sectionHint}</Text>

      {targets.length > 0 ? (
        <View className="mt-2 gap-2">
          {targets.map((target) => {
            const group = groupById.get(target.exchangeGroupId)
            // El builder siempre agrega grupos desde el picker (catálogo cargado); el fallback
            // cubre re-renders raros sin romper la fila.
            const name = group?.name ?? 'Grupo'
            // PORCIONES HUÉRFANAS: el grupo está prescrito pero no tiene ni una equivalencia. El
            // alumno verá el chip y podrá marcar la porción, pero el sheet "1 porción equivale a"
            // le sale VACÍO. Se avisa acá, donde el coach ya decidió usarlo, y no solo en el
            // picker (de donde ya salió). Clave ausente = conteo no cargado ⇒ no se avisa nada.
            const sinAlimentos = controller.groupFoodCounts[target.exchangeGroupId] === 0
            return (
              <View key={target.exchangeGroupId} className="gap-1.5">
                <View className="flex-row items-center gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    {group ? (
                      <PortionsGroupDot code={group.code} color={group.color} sortOrder={group.sortOrder} />
                    ) : (
                      <View accessible={false} className="h-5 w-5 rounded-full bg-border-subtle" />
                    )}
                    <Text className="min-w-0 flex-1 text-sm font-medium text-strong" numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                  {/* Stepper de ancho fijo: el nombre trunca, el stepper nunca se comprime. */}
                  <PortionsStepper
                    groupName={name}
                    portions={target.portions}
                    onStep={(direction) => controller.step(slotKey, target.exchangeGroupId, direction)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${name}`}
                    onPress={() => controller.removeGroup(slotKey, target.exchangeGroupId)}
                    hitSlop={6}
                    className="h-11 w-8 items-center justify-center rounded-control"
                  >
                    <Trash2 color={theme.destructive} size={16} />
                  </Pressable>
                </View>
                {sinAlimentos ? (
                  <View className="rounded-control border border-warning-500/30 bg-warning-500/10 p-2.5">
                    <Text className="text-[11px] font-medium leading-5 text-warning-700">
                      {PORTIONS_COPY.builder.groupFoodsEmpty}
                    </Text>
                    <Text className="text-[11px] leading-5 text-muted">
                      {PORTIONS_COPY.builder.groupFoodsEmptyHint}
                    </Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.addGroup}
        onPress={openPicker}
        className="mt-2 min-h-11 flex-row items-center gap-1.5 self-start rounded-control px-2 active:bg-primary/10"
      >
        <Plus color={theme.primary} size={16} />
        <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.builder.addGroup}</Text>
      </Pressable>

      <PortionsGroupPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        controller={controller}
        usedGroupIds={usedGroupIds}
        onPick={(id) => {
          setPickerOpen(false)
          controller.addGroup(slotKey, id)
        }}
      />
    </View>
  )
}

/**
 * Card "Usar como objetivos" (paso Objetivos): si el plan tiene porciones y el catálogo
 * cargó, muestra los totales derivados y precarga las 4 metas con un tap (nunca sobrescribe
 * sin acción; las metas quedan editables). Espejo de `PortionsDeriveCard` web.
 */
function PortionsDeriveCard({
  state,
  portions,
  dispatch,
}: {
  state: BuilderState
  portions: PortionsController
  dispatch: BuilderDispatch
}) {
  const { theme } = useTheme()
  // Multi-dia: los objetivos del paso son los del DIA BASE, asi que la card deriva desde las
  // porciones del dia base (no de todo el plan: sumar los 7 dias daria una semana, no un dia).
  const base = baseVariantOf(state)
  const liveKeys = base.slots.map((slot) => portionsKey(base.key, slot.key))
  if (portions.groups == null || !hasAnyPortions(portions.bySlot, liveKeys)) return null
  const totals = derivePortionTotals(liveKeys, portions.bySlot, portions.groups)
  const kcal = String(Math.round(totals.calories))
  const p = String(Math.round(totals.proteinG))
  const c = String(Math.round(totals.carbsG))
  const g = String(Math.round(totals.fatsG))
  return (
    <View className="gap-3 rounded-card border border-primary/20 bg-primary/10 p-4">
      <View className="flex-row items-start gap-2">
        <Sparkles color={theme.primary} size={18} />
        <Text className="flex-1 text-sm leading-5 text-body">
          {PORTIONS_COPY.builder.deriveCard(kcal, p, c, g)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.deriveCta}
        onPress={() => {
          dispatch({ type: 'SET_TARGET', field: 'calories', value: kcal })
          dispatch({ type: 'SET_TARGET', field: 'proteinG', value: p })
          dispatch({ type: 'SET_TARGET', field: 'carbsG', value: c })
          dispatch({ type: 'SET_TARGET', field: 'fatsG', value: g })
        }}
        className="min-h-11 flex-row items-center justify-center gap-1.5 self-start rounded-control border border-primary/30 bg-surface-card px-4"
      >
        <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.builder.deriveCta}</Text>
      </Pressable>
    </View>
  )
}

/**
 * Aviso de porciones con macros SIN confirmar del día en pantalla. Era lo único no-redundante del
 * viejo paso "Revisar" (`PortionsReviewSection` apilaba además una tarjeta por día con las mismas
 * chips que cada franja ya muestra): la advertencia sube al paso "Los días", donde el coach todavía
 * puede cambiar el grupo, en vez de aparecer al final cuando ya iba a publicar.
 */
function PortionsUnconfirmedNotice({
  strategy,
  variant,
  portions,
}: {
  strategy: BuilderState['strategy']
  variant: BuilderVariant
  portions: PortionsController
}) {
  const liveKeys = variant.slots.map((slot) => portionsKey(variant.key, slot.key))
  const groups = portions.groups
  if (!strategyUsesSlots(strategy) || groups == null || !hasAnyPortions(portions.bySlot, liveKeys)) return null
  const anyUnconfirmed = variant.slots.some((slot) =>
    hasUnconfirmedMacros(
      slotPortionTargets(portions.bySlot, portionsKey(variant.key, slot.key)).filter((t) => t.portions > 0),
      groups,
    ),
  )
  if (!anyUnconfirmed) return null
  return (
    <View className="rounded-control border border-warning-500/30 bg-warning-500/10 p-2.5">
      <Text className="text-xs leading-5 text-warning-700">{PORTIONS_COPY.builder.unconfirmedBanner}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Editores de franja e item (viven dentro del paso "Los días")
// ---------------------------------------------------------------------------

type BuilderDispatch = React.Dispatch<import('../../../../lib/nutrition-v2-builder').BuilderAction>

function UnitToggle({ unit, onChange }: { unit: BuilderUnit; onChange: (unit: BuilderUnit) => void }) {
  return (
    <Pressable
      accessibilityLabel={`Unidad: ${unit}. Toca para cambiar.`}
      accessibilityRole="button"
      className="min-h-11 min-w-14 items-center justify-center rounded-control border border-default bg-surface-sunken px-2"
      onPress={() => {
        const idx = BUILDER_UNITS.indexOf(unit)
        onChange(BUILDER_UNITS[(idx + 1) % BUILDER_UNITS.length])
      }}
    >
      <Text className="text-sm font-semibold text-strong">{unit}</Text>
    </Pressable>
  )
}

function ItemEditor({
  variantKey,
  slotKey,
  item,
  dispatch,
  errors,
  onSearch,
  onSaveCustomFood,
  portions,
  scope,
}: {
  variantKey: string
  slotKey: string
  item: BuilderItem
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (
    item: BuilderItem,
    variantKey: string,
    slotKey: string,
    equivalence: FoodEquivalenceDraft | null,
  ) => Promise<{ ok: boolean; error?: string }>
  portions: PortionsController
  /** Workspace del coach: lo necesita la correccion de macros (T2.2). */
  scope: NutritionV2CoachScope | null
}) {
  const { theme } = useTheme()
  const macros = itemMacros(item)
  const isCustom = item.food === null
  // Sheet de correccion de macros (T2.2). Solo existe para alimentos del catalogo: un alimento
  // libre ya tiene sus macros editables en la propia fila.
  const [macrosSheetOpen, setMacrosSheetOpen] = useState(false)
  const patch = (p: Partial<Omit<BuilderItem, 'key'>>) =>
    dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: p })
  // ── Cantidades honestas (W1.2 + W1.3) en el wizard RN: mismo rótulo y mismo aviso que la web.
  const plausibility = builderItemPlausibility(item)
  const implausibleReason = plausibility.reasons[0] ?? null
  const unitCaption = item.food
    ? unitEquivalenceCaption({
        unit: item.unit,
        servingSize: item.food.servingSize,
        servingUnit: item.food.servingUnit,
      })
    : null
  useEffect(() => {
    if (implausibleReason === null) return
    const key = item.key + '|' + implausibleReason
    if (REPORTED_IMPLAUSIBLE_ITEMS.has(key)) return
    REPORTED_IMPLAUSIBLE_ITEMS.add(key)
    captureNutritionItemImplausible({
      surface: 'wizard',
      unit: item.unit,
      reason: implausibleReason,
      kcalBucket: kcalBucket(plausibility.calories),
    })
  }, [implausibleReason, item.key, item.unit, plausibility.calories])
  // "Guardar en mi catálogo" (sub-delta b): estado local del alta + aviso de mismatch de energia
  // (macroEnergyMismatch, umbral 40% Atwater). Solo aplica al bloque custom (isCustom).
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // FD6b — bloque opcional "Equivalencia de porciones" (P-B), colapsado por defecto: la enorme
  // mayoría de las altas no clasifica nada. `null` = cerrado (no viaja nada en el payload).
  const [equivalence, setEquivalence] = useState<FoodEquivalenceDraft | null>(null)
  const showMismatch = isCustom && macroEnergyMismatch(customMacrosOf(item))

  async function handleSaveCustom() {
    setSaveError(null)
    setSaving(true)
    const res = await onSaveCustomFood(item, variantKey, slotKey, equivalence)
    setSaving(false)
    if (!res.ok) setSaveError(res.error ?? 'No se pudo guardar el alimento.')
  }

  return (
    <View className="rounded-control border border-subtle bg-surface-sunken p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
          {/* QA2-B3a: fallback 1:1 con el builder web (`ItemRow.tsx:89-95`) — webp estatico
              de la categoria del catalogo; sin `category` (plantilla, snapshot viejo) o item
              libre => categoria derivada del NOMBRE. Antes un catalogo con `category` nula caia
              al icono generico «otro». El emoji queda deprecado. */}
          <FoodThumbnail
            alt={item.food?.name ?? item.customName ?? 'Alimento'}
            src={item.food ? foodMediaThumbnailUrl(item.food.media) : null}
            fallbackCategory={
              item.food
                ? item.food.category ?? foodCategoryFromName(item.food.name)
                : foodCategoryFromName(item.customName)
            }
            size="sm"
          />
          <View className="min-w-0 flex-1">
            {isCustom ? (
              <TextInput
                value={item.customName ?? ''}
                onChangeText={(value) => patch({ customName: value })}
                placeholder="Nombre del alimento"
                placeholderTextColor={theme.mutedForeground}
                className="min-h-10 rounded-control border border-default bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-strong"
              />
            ) : (
              <View className="flex-row items-center gap-1.5">
                <Text className="flex-1 text-sm font-semibold text-strong" numberOfLines={2}>
                  {item.food?.name}
                </Text>
                {/* Badge ✎: este alimento lleva TUS macros, no los del catalogo. */}
                {item.food?.hasOverride ? (
                  <Pencil color={theme.primary} size={12} accessibilityLabel="Macros corregidos por ti" />
                ) : null}
              </View>
            )}
          </View>
        </View>
        <View className="flex-row items-center">
          {/* Corregir macros: solo alimentos del catalogo y solo con workspace resuelto. */}
          {item.food && scope ? (
            <Pressable
              accessibilityLabel={`Corregir macros de ${item.food.name}`}
              accessibilityRole="button"
              className="min-h-10 min-w-10 items-center justify-center rounded-control"
              onPress={() => setMacrosSheetOpen(true)}
            >
              <Pencil color={theme.mutedForeground} size={16} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Quitar alimento"
            accessibilityRole="button"
            className="min-h-10 min-w-10 items-center justify-center rounded-control"
            onPress={() => dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })}
          >
            <Trash2 color={theme.destructive} size={17} />
          </Pressable>
        </View>
      </View>

      {item.food && scope && macrosSheetOpen ? (
        <FoodMacrosOverrideSheet
          food={item.food}
          scope={scope}
          open={macrosSheetOpen}
          onClose={() => setMacrosSheetOpen(false)}
          onApplied={(macros, message) => {
            // La correccion es del ALIMENTO: alcanza todas sus apariciones del borrador.
            dispatch({ type: 'APPLY_FOOD_OVERRIDE', foodId: item.food!.id, macros })
            toast.success(message)
          }}
        />
      ) : null}

      {/* H-07 — el mismo coach editaba "200 g de arroz" con teclado en el builder y con steppers
          en el quick-edit: dos modelos de interacción para lo mismo. Se adopta el `QuantityStepper`
          del quick-edit (−/+ de 44 pt + input central `selectTextOnFocus`, árbol estable, jamás
          slider). El paso por unidad sale del helper compartido, no de una regla nueva. */}
      <View className="mt-2 flex-row items-center justify-between gap-2">
        <QuantityStepper
          value={item.quantity}
          onChange={(value) => patch({ quantity: value })}
          step={quantityStep(item.unit)}
          accessibilityLabel={`Cantidad de ${item.food?.name ?? item.customName ?? 'alimento'}`}
        />
        {/* W1.1 «Cantidades honestas»: cambiar la unidad CONVIERTE la cantidad con el mismo
            helper puro que el editor único y el wizard web. Dejar "30" y pasar de g a `un`
            publicaba 30 porciones de 100 g. Si la conversión no es representable el número
            queda intacto (SPEC §4.1). */}
        <UnitToggle
          unit={item.unit}
          onChange={(unit) =>
            patch({
              unit,
              quantity: convertQuantityTextOnUnitChange({
                quantity: item.quantity,
                fromUnit: item.unit,
                toUnit: unit,
                food: item.food,
              }),
            })
          }
        />
      </View>
      <ErrorText message={errors['item.' + item.key + '.quantity'] ?? errors['item.' + item.key + '.food']} />

      {/* W1.2 — «1 un = 100 g»: la equivalencia que nadie decía, bajo los controles. */}
      {unitCaption ? <Text className="mt-1 text-xs text-muted">{unitCaption}</Text> : null}

      {/* W1.3 — aviso de plausibilidad (mockup M1). Avisa, NO bloquea. La acción «keep the
          number» patchea la unidad SIN tocar la cantidad (no pasa por el `onChange` del toggle,
          que sí convierte). */}
      {plausibility.implausible ? (
        <View className="mt-2">
          <ImplausibleNotice
            variant="box"
            testID="builder-item-implausible"
            message={implausibleItemCopy({
              quantity: Number(item.quantity),
              unit: item.unit,
              foodName: item.food?.name ?? item.customName ?? 'este alimento',
              grams: plausibility.grams,
              calories: plausibility.calories,
              servingSize: item.food?.servingSize ?? null,
              servingUnit: item.food?.servingUnit ?? null,
            })}
            actions={
              item.food && normalizeIntakeUnit(item.unit) === 'un'
                ? [
                    {
                      label: reinterpretUnitActionLabel({
                        quantity: Number(item.quantity),
                        servingUnit: item.food.servingUnit,
                      }),
                      onPress: () => patch({ unit: foodMagnitudeUnit(item.food?.servingUnit) }),
                    },
                  ]
                : []
            }
          />
        </View>
      ) : null}

      {isCustom ? (
        <>
          <View className="mt-2 flex-row gap-2">
            {(
              [
                ['customCalories', 'kcal/100'],
                ['customProteinG', 'P/100'],
                ['customCarbsG', 'C/100'],
                ['customFatsG', 'G/100'],
              ] as const
            ).map(([field, label]) => (
              <View className="flex-1" key={field}>
                <Text className="mb-1 text-[10px] font-medium text-muted">{label}</Text>
                <TextInput
                  value={item[field]}
                  onChangeText={(value) => patch({ [field]: value } as Partial<Omit<BuilderItem, 'key'>>)}
                  placeholder="0"
                  placeholderTextColor={theme.mutedForeground}
                  keyboardType="decimal-pad"
                  className="min-h-10 rounded-control border border-default bg-surface-card px-2 py-1.5 text-sm text-strong"
                />
              </View>
            ))}
          </View>
          {showMismatch ? (
            <View className="mt-2 flex-row items-start gap-1.5">
              <AlertTriangle color={theme.warning} size={14} style={{ marginTop: 1 }} />
              <Text className="flex-1 text-[11px] leading-snug text-warning-700">
                Las kcal no cuadran con las macros (4P + 4C + 9G). Puedes guardar igual, pero revisa los valores.
              </Text>
            </View>
          ) : null}
          <FoodEquivalenceField value={equivalence} onChange={setEquivalence} portions={portions} />
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar en mi catálogo"
              disabled={saving}
              onPress={() => void handleSaveCustom()}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-control border border-default bg-surface-card px-3 ${saving ? 'opacity-60' : ''}`}
            >
              {saving ? (
                <ActivityIndicator color={theme.foreground} size="small" />
              ) : (
                <Plus color={theme.foreground} size={14} />
              )}
              <Text className="text-xs font-semibold text-strong">Guardar en mi catálogo</Text>
            </Pressable>
            {saveError ? <Text className="text-[11px] text-danger-600">{saveError}</Text> : null}
          </View>
        </>
      ) : null}

      <View className="mt-2">
        <MacroChipRow size="sm" calories={macros.calories} proteinG={macros.proteinG} carbsG={macros.carbsG} fatsG={macros.fatsG} />
      </View>

      <SubstitutionsField
        variantKey={variantKey}
        slotKey={slotKey}
        item={item}
        dispatch={dispatch}
        onSearch={onSearch}
      />
    </View>
  )
}

/**
 * FD6b — bloque opcional "Equivalencia de porciones" del alta de alimento libre (P-B).
 *
 * Colapsado por defecto ("Agregar equivalencia"): abrirlo declara la intención de clasificar el
 * alimento dentro de un grupo ("1 porción de C = 120 g de arroz"). Reusa el CATÁLOGO ya cargado
 * del controlador de porciones (mismos grupos del picker, con loading/error/reintento) en vez de
 * un fetch propio. La regla junto-o-nada (grupo ⇔ gramos) la valida `handleSaveCustomFood` con el
 * helper compartido y la RE-valida el servidor, que además verifica visibilidad del grupo.
 */
function FoodEquivalenceField({
  value,
  onChange,
  portions,
}: {
  value: FoodEquivalenceDraft | null
  onChange: (value: FoodEquivalenceDraft | null) => void
  portions: PortionsController
}) {
  const { theme } = useTheme()
  const COPY = PORTIONS_COPY.foodEquivalence
  const groups = portions.groups
  const selected = value?.exchangeGroupId ? (groups ?? []).find((g) => g.id === value.exchangeGroupId) : null
  const grams = value ? parseEquivalenceGrams(value.exchangePortionGrams) : null

  if (value == null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.expand}
        onPress={() => {
          portions.ensureGroupsLoaded()
          onChange({ exchangeGroupId: null, exchangePortionGrams: '', exchangePortionLabel: '' })
        }}
        className="mt-2 min-h-11 flex-row items-center gap-1.5 self-start rounded-control px-2 active:bg-primary/10"
      >
        <Plus color={theme.primary} size={14} />
        <Text className="text-xs font-semibold text-primary">{COPY.expand}</Text>
      </Pressable>
    )
  }

  return (
    <View className="mt-2 gap-2 rounded-control border border-subtle bg-surface-card p-2.5">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold text-strong">{COPY.sectionTitle}</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-muted">{COPY.sectionHint}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.collapse}
          onPress={() => onChange(null)}
          hitSlop={6}
          className="h-11 w-8 items-center justify-center rounded-control"
        >
          <X color={theme.mutedForeground} size={14} />
        </Pressable>
      </View>

      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted">{COPY.groupLabel}</Text>
      {groups == null && portions.groupsLoading ? (
        <Text className="text-xs text-muted">{COPY.groupsLoading}</Text>
      ) : groups == null && portions.groupsError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PORTIONS_COPY.builder.pickerRetry}
          onPress={() => portions.retryGroups()}
          className="min-h-11 justify-center"
        >
          <Text className="text-xs font-semibold text-primary underline">{COPY.groupsError}</Text>
        </Pressable>
      ) : (groups ?? []).length === 0 ? (
        <Text className="text-xs text-muted">{COPY.groupsEmpty}</Text>
      ) : (
        <View className="flex-row flex-wrap gap-1.5">
          {(groups ?? []).map((group) => {
            const on = value.exchangeGroupId === group.id
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={group.name}
                onPress={() => onChange({ ...value, exchangeGroupId: on ? null : group.id })}
                className={`min-h-11 flex-row items-center gap-1.5 rounded-pill border px-2.5 ${
                  on ? 'border-primary bg-primary/10' : 'border-default bg-surface-sunken'
                }`}
              >
                <PortionsGroupDot code={group.code} color={group.color} sortOrder={group.sortOrder} />
                <Text
                  className={`shrink text-xs font-semibold ${on ? 'text-primary' : 'text-strong'}`}
                  numberOfLines={1}
                >
                  {group.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Text className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            {COPY.gramsLabel}
          </Text>
          <TextInput
            accessibilityLabel={COPY.gramsLabel}
            value={value.exchangePortionGrams}
            onChangeText={(text) => onChange({ ...value, exchangePortionGrams: text })}
            keyboardType="decimal-pad"
            placeholder={COPY.gramsPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2 py-1.5 text-sm text-strong"
            style={{ fontVariant: ['tabular-nums'] }}
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            {COPY.labelLabel}
          </Text>
          <TextInput
            accessibilityLabel={COPY.labelLabel}
            value={value.exchangePortionLabel}
            onChangeText={(text) => onChange({ ...value, exchangePortionLabel: text })}
            maxLength={40}
            placeholder={COPY.labelPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2 py-1.5 text-sm text-strong"
          />
        </View>
      </View>

      {selected && grams != null ? (
        <Text className="text-[11px] text-muted">
          {COPY.preview(selected.name, String(grams), value.exchangePortionLabel.trim() || null)}
        </Text>
      ) : null}
    </View>
  )
}

// Reemplazos autorizados por el coach (F-02): afordancia compacta bajo cada item prescrito.
// "Reemplazo" abre el MISMO buscador de catalogo del builder (FoodSearchModal) y agrega el
// alimento elegido como chip removible (tope MAX_ITEM_SUBSTITUTIONS). Solo se monta dentro
// de ItemEditor, que a su vez solo existe en structured/hybrid (SlotEditor -> DaysStep).
// El alumno vera estas opciones; el server congela el snapshot de cada reemplazo al publicar.
// Espejo del SubstitutionsField de la web (PlanBuilderClient.tsx).
function SubstitutionsField({
  variantKey,
  slotKey,
  item,
  dispatch,
  onSearch,
}: {
  variantKey: string
  slotKey: string
  item: BuilderItem
  dispatch: BuilderDispatch
  onSearch: (target: SearchTarget) => void
}) {
  const { theme } = useTheme()
  const subs = item.substitutions ?? []
  const atCap = subs.length >= MAX_ITEM_SUBSTITUTIONS
  const prescribedName = item.food ? item.food.name : (item.customName?.trim() || 'este alimento')

  return (
    <View className="mt-2 border-t border-subtle pt-2">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <View className="flex-row items-center gap-1">
          <Repeat color={theme.mutedForeground} size={14} />
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reemplazos autorizados</Text>
        </View>
        {subs.length > 0 ? (
          <Text className="font-mono text-[11px] tabular-nums text-subtle">
            {subs.length}/{MAX_ITEM_SUBSTITUTIONS}
          </Text>
        ) : null}
      </View>

      {subs.length > 0 ? (
        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {subs.map((sub) => (
            <View
              key={sub.key}
              className="max-w-full flex-row items-center gap-1 rounded-pill border border-subtle bg-surface-sunken py-0.5 pl-2.5 pr-1"
            >
              <Text className="min-w-0 shrink text-xs text-body" numberOfLines={1}>
                {sub.food.name}
              </Text>
              <Pressable
                accessibilityLabel={`Quitar reemplazo ${sub.food.name}`}
                accessibilityRole="button"
                className="min-h-11 min-w-11 items-center justify-center rounded-full"
                onPress={() =>
                  dispatch({
                    type: 'REMOVE_ITEM_SUBSTITUTION',
                    variantKey,
                    slotKey,
                    itemKey: item.key,
                    subKey: sub.key,
                  })
                }
              >
                <X color={theme.mutedForeground} size={13} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-1 text-[11px] leading-snug text-subtle">
          Alimentos que el alumno puede usar en lugar de {prescribedName}.
        </Text>
      )}

      {atCap ? (
        <Text className="mt-1.5 text-[11px] text-subtle">
          Alcanzaste el maximo de {MAX_ITEM_SUBSTITUTIONS} reemplazos.
        </Text>
      ) : (
        <Pressable
          accessibilityLabel="Agregar reemplazo autorizado"
          accessibilityRole="button"
          className="mt-1.5 min-h-11 flex-row items-center justify-center gap-1.5 self-start rounded-control border border-default bg-surface-card px-3"
          onPress={() => onSearch({ mode: 'substitution', variantKey, slotKey, itemKey: item.key })}
        >
          <Plus color={theme.foreground} size={14} />
          <Text className="text-xs font-semibold text-strong">Reemplazo</Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * CE-5 (H-12) — menú de la franja: copiarla a otros días del plan.
 *
 * El flujo real del coach es armar 5 días copiando el base y después cambiar el desayuno: sin
 * esto hay que repetir el cambio día por día, cambiando de chip cada vez (y con los chips fuera
 * de pantalla). "Duplicar como otro día" no servía: CREA un día nuevo, no toca uno existente.
 *
 * Dos caminos, mismo despacho: elegir días a mano o aplicar a todos. La nota dice explícitamente
 * qué pasa en el destino, porque la semántica es de REEMPLAZO por nombre de franja (no de mezcla).
 */
function SlotCopySheet({
  open,
  onClose,
  slotName,
  targets,
  onApply,
}: {
  open: boolean
  onClose: () => void
  slotName: string
  /** Días destino posibles: todos menos el de origen. */
  targets: BuilderVariant[]
  onApply: (variantKeys: string[]) => void
}) {
  const { theme } = useTheme()
  const [panel, setPanel] = useState<'menu' | 'pick'>('menu')
  const [selected, setSelected] = useState<string[]>([])

  // Cada apertura arranca limpia (el sheet no se desmonta entre aperturas).
  useEffect(() => {
    if (open) {
      setPanel('menu')
      setSelected([])
    }
  }, [open])

  const title = slotName.trim() === '' ? 'Franja' : slotName.trim()
  // Copy alineado con el mismo gesto en la edición rápida: la semántica es de REEMPLAZO por
  // nombre de franja, no de mezcla, y hay que decirlo antes de tocar 6 días de una.
  const replaceNote =
    'Reemplaza la franja del mismo nombre en los días que elijas; si ese día no la tiene, se agrega al final. Viajan los alimentos, la hora, los reemplazos autorizados y las porciones a elección.'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['65%']}
      title={panel === 'pick' ? 'Copiar la franja' : `Franja: ${title}`}
      accessibilityLabel={`Opciones de la franja ${title}`}
    >
      {panel === 'menu' ? (
        <View className="gap-0.5 pb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copiar a otros días"
            onPress={() => setPanel('pick')}
            className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-surface-sunken"
          >
            <Copy color={theme.foreground} size={18} />
            <Text className="flex-1 text-sm font-medium text-strong">Copiar a otros días…</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Aplicar esta franja a los ${targets.length} días restantes`}
            onPress={() => {
              onApply(targets.map((target) => target.key))
              onClose()
            }}
            className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-surface-sunken"
          >
            <CopyCheck color={theme.foreground} size={18} />
            <Text className="flex-1 text-sm font-medium text-strong">Aplicar a todos los días</Text>
          </Pressable>
          <Text className="mt-1 px-2 text-xs leading-5 text-muted">{replaceNote}</Text>
        </View>
      ) : (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Días destino</Text>
          <View className="gap-0.5">
            {targets.map((target) => {
              const checked = selected.includes(target.key)
              const badge = variantDayBadge(target)
              // Con el selector nuevo el coach piensa en días: la variante por defecto se nombra
              // "Día base" (lo que dice el strip), no "Todos los días" — que ya es falso en cuanto
              // un día tiene contenido propio. La etiqueta del contrato no cambia.
              const targetLabel = target.isDefault ? 'Día base' : target.label
              return (
                <Pressable
                  key={target.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={badge ? `${targetLabel}, ${badge.long}` : targetLabel}
                  onPress={() =>
                    setSelected((prev) =>
                      prev.includes(target.key) ? prev.filter((key) => key !== target.key) : [...prev, target.key],
                    )
                  }
                  className="min-h-12 flex-row items-center gap-2.5 rounded-control px-2"
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-control border ${
                      checked ? 'border-transparent' : 'border-default bg-surface-card'
                    }`}
                    style={checked ? { backgroundColor: theme.primary } : undefined}
                  >
                    {checked ? <Check color={theme.primaryForeground} size={13} /> : null}
                  </View>
                  <Text className="min-w-0 flex-1 text-sm text-body">{targetLabel}</Text>
                  {badge ? (
                    <Text className="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                      {badge.short}
                    </Text>
                  ) : null}
                </Pressable>
              )
            })}
          </View>
          <Text className="text-xs leading-5 text-muted">{replaceNote}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selected.length <= 1 ? 'Copiar la franja al día elegido' : `Copiar la franja a ${selected.length} días`}
            accessibilityState={{ disabled: selected.length === 0 }}
            disabled={selected.length === 0}
            onPress={() => {
              onApply(selected)
              onClose()
            }}
            className={`min-h-12 flex-row items-center justify-center gap-1.5 rounded-control px-4 ${
              selected.length === 0 ? 'opacity-50' : ''
            }`}
            style={{ backgroundColor: theme.primary }}
          >
            <Copy color={theme.primaryForeground} size={16} />
            <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
              {selected.length <= 1 ? 'Copiar al día' : `Copiar a ${selected.length} días`}
            </Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  )
}

function SlotEditor({
  variantKey,
  slot,
  index,
  variants,
  dispatch,
  errors,
  onSearch,
  onSaveCustomFood,
  onCopyToVariants,
  onRemoveSlot,
  portions,
}: {
  /** Día (variante) al que pertenece la franja: toda mutación viaja scoped a él. */
  variantKey: string
  slot: BuilderSlot
  index: number
  /** Todos los días del plan: el menú "Copiar a otros días" ofrece los que NO son el origen. */
  variants: BuilderVariant[]
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (
    item: BuilderItem,
    variantKey: string,
    slotKey: string,
    equivalence: FoodEquivalenceDraft | null,
  ) => Promise<{ ok: boolean; error?: string }>
  /** CE-5: despacha la copia de ESTA franja (árbol + porciones) a los días elegidos. */
  onCopyToVariants: (slotKey: string, targetVariantKeys: string[]) => void
  /** T2.6 F1: quitar ESTA franja, optimista + Deshacer (lo orquesta la pantalla). */
  onRemoveSlot: () => void
  portions: PortionsController
}) {
  const { theme } = useTheme()
  const [copyOpen, setCopyOpen] = useState(false)
  // Días destino: todos menos el propio. Con un solo día el menú no tiene nada que ofrecer.
  const copyTargets = variants.filter((candidate) => candidate.key !== variantKey)
  // Subtotal combinado (items fijos + derivado de porciones, 4B-11). Sin porciones (o catálogo
  // sin cargar) `slotPortionTotals` devuelve null y `combineSubtotals` deja el objeto de items intacto.
  // Multi-día: la clave de porciones es `variantKey::slotKey` — dos días con una franja homónima
  // ("Almuerzo" clonado) ya no comparten porciones.
  const portionsSlotKey = portionsKey(variantKey, slot.key)
  const portionTotals = slotPortionTotals(portions.bySlot, portionsSlotKey, portions.groups)
  const subtotal = combineSubtotals(slotSubtotal(slot), portionTotals)
  const showSubtotal = slot.items.length > 0 || portionTotals != null
  return (
    <NutritionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
          Franja {index + 1}
        </Text>
        <View className="flex-row items-center">
          {/* CE-5: solo con más de un día hay adónde copiar. */}
          {copyTargets.length > 0 ? (
            <Pressable
              accessibilityLabel={`Opciones de la franja ${slot.name || index + 1}`}
              accessibilityRole="button"
              className="h-11 w-9 items-center justify-center rounded-control"
              onPress={() => setCopyOpen(true)}
            >
              <MoreVertical color={theme.mutedForeground} size={16} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Quitar franja"
            accessibilityRole="button"
            className="h-11 w-9 items-center justify-center rounded-control"
            onPress={onRemoveSlot}
          >
            <Trash2 color={theme.destructive} size={16} />
          </Pressable>
        </View>
      </View>

      <View className="mt-2 flex-row gap-2">
        <View className="flex-1">
          <TextInput
            value={slot.name}
            onChangeText={(value) =>
              dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { name: value } })
            }
            placeholder="Nombre (ej: Desayuno)"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm font-semibold text-strong"
          />
        </View>
        <View className="w-24">
          <TextInput
            accessibilityLabel={`Hora de ${slot.name || `la franja ${index + 1}`}`}
            value={slot.startTime}
            onChangeText={(value) =>
              dispatch({
                type: 'UPDATE_SLOT',
                variantKey,
                slotKey: slot.key,
                patch: { startTime: maskTimeInput(value) },
              })
            }
            placeholder="HH:MM"
            placeholderTextColor={theme.mutedForeground}
            keyboardType="number-pad"
            maxLength={5}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm text-strong"
            style={{ fontVariant: ['tabular-nums'] }}
          />
        </View>
      </View>
      <ErrorText message={errors['slot.' + slot.key + '.name'] ?? errors['slot.' + slot.key + '.startTime']} />

      <View className="mt-3 gap-2">
        {slot.items.map((item) => (
          <ItemEditor
            key={item.key}
            variantKey={variantKey}
            slotKey={slot.key}
            item={item}
            dispatch={dispatch}
            errors={errors}
            onSearch={onSearch}
            onSaveCustomFood={onSaveCustomFood}
            portions={portions}
            scope={portions.scope}
          />
        ))}
      </View>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityLabel="Buscar alimento del catálogo"
          accessibilityRole="button"
          className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control border border-primary/30 bg-primary/10 px-3"
          onPress={() => onSearch({ mode: 'item', variantKey, slotKey: slot.key })}
        >
          <Search color={theme.primary} size={15} />
          <Text className="text-sm font-semibold text-primary">Buscar alimento</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Agregar alimento libre"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
          onPress={() =>
            dispatch({ type: 'ADD_ITEM', variantKey, slotKey: slot.key, key: genKey('item'), food: null })
          }
        >
          <Plus color={theme.foreground} size={15} />
          <Text className="text-sm font-semibold text-strong">Libre</Text>
        </Pressable>
      </View>

      <BuilderPortionsSection slotKey={portionsSlotKey} controller={portions} />

      {showSubtotal ? (
        <View className="mt-3 border-t border-subtle pt-2">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Subtotal franja</Text>
          <MacroChipRow size="sm" calories={subtotal.calories} proteinG={subtotal.proteinG} carbsG={subtotal.carbsG} fatsG={subtotal.fatsG} />
          {portionTotals != null ? (
            <Text className="mt-1 text-[11px] text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
            </Text>
          ) : null}
        </View>
      ) : null}

      {copyTargets.length > 0 ? (
        <SlotCopySheet
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          slotName={slot.name || `Franja ${index + 1}`}
          targets={copyTargets}
          onApply={(variantKeys) => onCopyToVariants(slot.key, variantKeys)}
        />
      ) : null}
    </NutritionCard>
  )
}

// ---------------------------------------------------------------------------
// Paso 1 — "Los días": selector de día + franjas del día elegido + publicar
//
// El viejo paso "Construcción" con el selector nuevo (SPEC punto 10) y la publicación adentro
// (punto 11): el paso "Revisar" era eco de estas mismas cifras y su único campo editable
// (`vigente-desde`) siempre vivió en "El plan".
// ---------------------------------------------------------------------------

function DaysStep({
  state,
  variant,
  dayCells,
  selectedDow,
  inheritedDays,
  activeKcal,
  errorDays,
  dayHandlers,
  onSelectVariant,
  dispatch,
  errors,
  variantErrorKeys,
  onSearch,
  onSaveCustomFood,
  onCopySlotToVariants,
  onRemoveSlot,
  portions,
  publishError,
  dateConflict,
  conflictError,
  canReplace,
  existingPlanName,
  publishing,
  onStartTomorrow,
  onReplaceToday,
  onCancelConflict,
}: {
  state: BuilderState
  /** Variante que recibe el día elegido. TODA la sección trabaja scoped a ella. */
  variant: BuilderVariant
  dayCells: readonly BuilderDayCell[]
  selectedDow: number | null
  inheritedDays: readonly number[]
  activeKcal: number
  errorDays: readonly number[]
  dayHandlers: BuilderDayStripHandlers
  /** "Revisa {día}": abre el día de una variante con error (traduce variante → día). */
  onSelectVariant: (variantKey: string) => void
  dispatch: BuilderDispatch
  errors: Record<string, string>
  /** Días con error (H-01), incluido el elegido: marca sus celdas y ofrece "Revisa {día}". */
  variantErrorKeys: readonly string[]
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (
    item: BuilderItem,
    variantKey: string,
    slotKey: string,
    equivalence: FoodEquivalenceDraft | null,
  ) => Promise<{ ok: boolean; error?: string }>
  /** CE-5: copia de una franja del día elegido hacia otros días (árbol + porciones). */
  onCopySlotToVariants: (sourceVariantKey: string, slotKey: string, targetVariantKeys: string[]) => void
  /** T2.6 F1: quitar franja optimista + Deshacer (el snackbar vive en la pantalla). */
  onRemoveSlot: (variantKey: string, slotKey: string) => void
  portions: PortionsController
  publishError: string | null
  dateConflict: boolean
  conflictError: string | null
  canReplace: boolean
  existingPlanName: string | null
  publishing: boolean
  onStartTomorrow: () => void
  onReplaceToday: () => void
  onCancelConflict: () => void
}) {
  // Total del día ACTIVO combinado (items + porciones a elección, 4B-11). Sin catálogo cargado el
  // derivado es null y `combineSubtotals` devuelve los totales de items intactos (jamás NaN).
  // Se calcula ANTES del corte del plan flexible porque el aviso de plausibilidad de abajo usa un
  // hook, y un hook no puede vivir después de un `return` condicional.
  const liveKeys = variant.slots.map((slot) => portionsKey(variant.key, slot.key))
  const portionDay = portions.groups ? derivePortionTotals(liveKeys, portions.bySlot, portions.groups) : null
  const totals = combineSubtotals(variantTotals(variant), portionDay)
  // ── Aviso de plausibilidad del DÍA en el wizard (W1.3 «Cantidades honestas») ─────────────
  // Mismo copy puro que el editor único y que la barra web: una sola voz para las cuatro barras.
  const dayTargetCalories = Number(variantEffectiveTargets(state, variant).calories.trim())
  const dayWarning = dayWarningCopy({
    prescribedCalories: totals.calories,
    targetCalories: Number.isFinite(dayTargetCalories) && dayTargetCalories > 0 ? dayTargetCalories : null,
    implausibleItemCount: variant.slots.reduce(
      (count, slot) => count + slot.items.filter((item) => builderItemPlausibility(item).implausible).length,
      0,
    ),
  })
  useEffect(() => {
    if (dayWarning === null) return
    const key = variant.key + '|day'
    if (REPORTED_IMPLAUSIBLE_DAYS.has(key)) return
    REPORTED_IMPLAUSIBLE_DAYS.add(key)
    // `unit: null`: el aviso del día no acusa a ninguna unidad. Sin kcal exactas (Ley 21.719).
    captureNutritionItemImplausible({
      surface: 'wizard',
      unit: null,
      reason: 'day',
      kcalBucket: kcalBucket(totals.calories),
    })
  }, [dayWarning, totals.calories, variant.key])
  const publishPanel = (
    <PublishPanel
      publishError={publishError}
      dateConflict={dateConflict}
      conflictError={conflictError}
      canReplace={canReplace}
      existingPlanName={existingPlanName}
      publishing={publishing}
      onStartTomorrow={onStartTomorrow}
      onReplaceToday={onReplaceToday}
      onCancelConflict={onCancelConflict}
    />
  )

  if (!strategyUsesSlots(state.strategy)) {
    return (
      <View className="gap-4">
        <NutritionCard>
          <Text className="font-display text-base font-semibold text-strong">Plan flexible</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Este plan no usa franjas prescritas: el alumno registra sus comidas libremente contra las metas
            diarias de “El plan”, iguales los siete días. Ya puedes publicarlo.
          </Text>
        </NutritionCard>
        {publishPanel}
      </View>
    )
  }

  // H-01: días con error que NO están montados. Tocarlos cambia de día (`onSelect`), que es donde
  // sí se pintan los errores por franja/item.
  const hiddenErrorVariants = state.variants.filter(
    (other) => other.key !== variant.key && variantErrorKeys.includes(other.key),
  )
  const activeBadge = variantDayBadge(variant)
  return (
    <View className="gap-3">
      {/* Selector de día: strip Lu-Do + barra de contexto + menú del día. */}
      <BuilderDayStrip
        cells={dayCells}
        selectedDayOfWeek={selectedDow}
        activeVariant={variant}
        inheritedDays={inheritedDays}
        activeKcal={activeKcal}
        baseTargets={state.targets}
        activeTargetCalories={variantEffectiveTargets(state, variant).calories}
        errorDays={errorDays}
        handlers={dayHandlers}
      />
      {hiddenErrorVariants.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-3">
          {hiddenErrorVariants.map((other) => (
            <Pressable
              key={other.key}
              accessibilityRole="button"
              accessibilityLabel={`Revisa ${other.label}: tiene datos por corregir`}
              onPress={() => onSelectVariant(other.key)}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-danger-600 underline">Revisa {other.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {/* Error de franjas del día ELEGIDO (clave scoped). Los otros días salen arriba y en su celda. */}
      <ErrorText message={errors['variant.' + variant.key + '.slots']} />
      <PortionsUnconfirmedNotice strategy={state.strategy} variant={variant} portions={portions} />
      {variant.slots.map((slot, index) => (
        <SlotEditor
          key={slot.key}
          variantKey={variant.key}
          slot={slot}
          index={index}
          variants={state.variants}
          dispatch={dispatch}
          errors={errors}
          onSearch={onSearch}
          onSaveCustomFood={onSaveCustomFood}
          onCopyToVariants={(slotKey, targetVariantKeys) =>
            onCopySlotToVariants(variant.key, slotKey, targetVariantKeys)
          }
          onRemoveSlot={() => onRemoveSlot(variant.key, slot.key)}
          portions={portions}
        />
      ))}
      <Pressable
        accessibilityLabel="Agregar franja"
        accessibilityRole="button"
        className="min-h-12 flex-row items-center justify-center gap-1.5 rounded-card border border-dashed border-default bg-surface-card px-3"
        onPress={() => dispatch({ type: 'ADD_SLOT', variantKey: variant.key, key: genKey('slot') })}
      >
        <AddSlotIcon />
        <Text className="text-sm font-semibold text-muted">Agregar franja</Text>
      </Pressable>
      {variant.slots.length > 0 ? (
        <View className="px-1">
          {/* QW-2: con etiqueta personalizada el total tampoco decía a qué día pertenece. Es el
              ÚNICO bloque de totales del día: la barra sticky y el eco del paso "Revisar" que
              repetían la misma cifra se retiraron con la poda. */}
          {/* W1.3 — aviso de plausibilidad del día, arriba de los totales que lo provocan. */}
          {dayWarning ? (
            <View className="mb-2">
              <ImplausibleNotice variant="box" message={dayWarning} testID="builder-day-implausible" />
            </View>
          ) : null}
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {variant.isDefault ? 'Total del Día base' : `Total de ${activeBadge ? `${variant.label} (${activeBadge.long})` : variant.label}`}
          </Text>
          <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
        </View>
      ) : null}
      {publishPanel}
    </View>
  )
}

/** Icono del CTA "Agregar franja": tinte del theme, nunca el hex `#8A94A6` que estaba hardcodeado. */
function AddSlotIcon() {
  const { theme } = useTheme()
  return <Plus color={theme.mutedForeground} size={16} />
}

// ---------------------------------------------------------------------------
// Publicar (vive dentro de "Los días", SPEC punto 11): conflicto de fecha + error de publicación.
// El CTA "Publicar plan" es el del pie de pantalla; acá van las decisiones y los errores.
// ---------------------------------------------------------------------------

// Boton-opcion de la card de conflicto de fecha (sub-delta c): adaptacion nativa del Dialog web
// (PublishConflictDialog) — Pressable ≥44px con icono en `theme.primary` (white-label), titulo +
// hint. `disabled` durante la operacion. NO es un modal nuevo: vive dentro de la card inline.
function ConflictOptionButton({
  icon: Icon,
  title,
  hint,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ color?: string; size?: number }>
  title: string
  hint: string
  disabled: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-start gap-3 rounded-control border border-default bg-surface-card px-3 py-3 ${disabled ? 'opacity-50' : 'active:bg-surface-sunken'}`}
    >
      <View className="mt-0.5">
        <Icon color={theme.primary} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-strong">{title}</Text>
        <Text className="mt-0.5 text-xs leading-snug text-muted">{hint}</Text>
      </View>
    </Pressable>
  )
}

/**
 * Decisiones y errores de la publicación, dentro del paso "Los días" (SPEC punto 11). El eco de
 * solo lectura del viejo paso "Revisar" (badge de estrategia, vista del alumno, metas y franjas
 * repetidas por día, totales por cuarta y quinta vez) se retiró: TODO eso está en pantalla en vivo
 * dos scrolls más arriba. Lo que no estaba en ninguna otra parte —el conflicto de fecha de vigencia
 * y el error del publish— vive acá, pegado al CTA del pie.
 */
function PublishPanel({
  publishError,
  dateConflict,
  conflictError,
  canReplace,
  existingPlanName,
  publishing,
  onStartTomorrow,
  onReplaceToday,
  onCancelConflict,
}: {
  publishError: string | null
  dateConflict: boolean
  conflictError: string | null
  canReplace: boolean
  existingPlanName: string | null
  publishing: boolean
  onStartTomorrow: () => void
  onReplaceToday: () => void
  onCancelConflict: () => void
}) {
  const { theme } = useTheme()
  if (!dateConflict && publishError == null) return null
  return (
    <View className="gap-3">
      {dateConflict ? (
        <View className="gap-3 rounded-card border border-default bg-surface-card p-4">
          <View className="gap-1">
            <Text className="font-display text-base font-semibold text-strong">Ya hay un plan vigente desde hoy</Text>
            <Text className="text-sm leading-5 text-muted">
              {existingPlanName
                ? `${existingPlanName} empieza a regir hoy. Elige cómo seguir con el plan nuevo.`
                : 'El plan actual empieza a regir hoy. Elige cómo seguir con el plan nuevo.'}
            </Text>
          </View>

          <View className="gap-2.5">
            <ConflictOptionButton
              icon={CalendarClock}
              title="Empezar mañana"
              hint="El plan nuevo entra en vigencia mañana; el de hoy sigue activo hasta entonces."
              disabled={publishing}
              onPress={onStartTomorrow}
            />
            {canReplace ? (
              <ConflictOptionButton
                icon={RefreshCw}
                title="Archivar el actual y reemplazar"
                hint="El plan de hoy se archiva ahora y este pasa a regir desde hoy. El historial del alumno se conserva."
                disabled={publishing}
                onPress={onReplaceToday}
              />
            ) : null}
          </View>

          {publishing ? (
            <View className="flex-row items-center gap-2" accessibilityRole="text">
              <ActivityIndicator color={theme.mutedForeground} size="small" />
              <Text className="text-xs text-muted">Procesando…</Text>
            </View>
          ) : null}

          {conflictError ? (
            <View className="rounded-control border border-danger-500/30 bg-danger-500/10 p-3">
              <Text className="text-sm font-medium text-danger-600">{conflictError}</Text>
            </View>
          ) : null}

          <View className="flex-row justify-end">
            <NutritionMotionButton
              accessibilityLabel="Cancelar"
              tone="neutral"
              disabled={publishing}
              onPress={onCancelConflict}
            >
              Cancelar
            </NutritionMotionButton>
          </View>
        </View>
      ) : null}

      {publishError ? (
        <View className="rounded-control border border-danger-500/30 bg-danger-500/10 p-3">
          <Text className="text-sm font-medium text-danger-600">{publishError}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Modal de búsqueda del catálogo
// ---------------------------------------------------------------------------

function FoodSearchModal({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean
  /** QW-6: "Agregar alimento" o "Reemplazo de {item}" — el mismo modal sirve a dos intenciones. */
  title: string
  onClose: () => void
  onSelect: (food: FoodCatalogItem) => void
}) {
  const { theme } = useTheme()
  // Insets leídos ACÁ, fuera del `<Modal>`: dentro de la ventana nativa del Modal el `SafeAreaView`
  // de safe-area-context mide 0 en iOS y la X del header queda bajo la Dynamic Island.
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      setQuery('')
      setItems([])
      setTouched(false)
    }
  }, [visible])

  useEffect(() => {
    const trimmed = query.trim()
    if (!visible || trimmed.length < 2) {
      setItems([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTouched(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchFoodCatalogV2({ query: trimmed, surface: 'coach', signal: controller.signal })
          if (mountedRef.current) setItems(res.items)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          if (mountedRef.current) setItems([])
        } finally {
          if (mountedRef.current) setLoading(false)
        }
      })()
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, visible])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        className="flex-1 bg-surface-app"
        style={{ paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View className="gap-2 border-b border-subtle px-4 py-3">
          <View className="min-h-11 flex-row items-center gap-2">
            <Text
              accessibilityRole="header"
              className="min-w-0 flex-1 font-display text-base font-semibold text-strong"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-control"
              hitSlop={12}
              onPress={onClose}
            >
              <X color={theme.foreground} size={20} />
            </Pressable>
          </View>
          <View className="flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
            <Search color={theme.mutedForeground} size={16} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar alimento…"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 flex-1 py-2 text-base text-strong"
            />
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-2 px-4 py-3" keyboardShouldPersistTaps="handled">
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : items.length === 0 ? (
            <Text className="px-1 py-6 text-center text-sm text-muted">
              {touched && query.trim().length >= 2 ? 'Sin resultados.' : 'Escribe al menos 2 letras para buscar.'}
            </Text>
          ) : (
            items.map((food) => (
              <Pressable
                key={food.id}
                accessibilityLabel={`Agregar ${food.name}`}
                accessibilityRole="button"
                className="min-h-14 flex-row items-center gap-3 rounded-control border border-subtle bg-surface-card px-3 py-2.5"
                onPress={() => onSelect(food)}
              >
                <FoodThumbnail
                  alt={food.name}
                  src={foodMediaThumbnailUrl(food.media)}
                  fallbackEmoji={foodCategoryEmoji(food.category)}
                  size="sm"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-strong" numberOfLines={2}>
                    {food.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                    {[food.brand, `${Math.round(food.calories)} kcal / ${food.servingSize}${food.servingUnit}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Hoja de función no disponible (espejo del gate server-side)
// ---------------------------------------------------------------------------
// OB3 (regla D1 del owner): Nutrición V2 es el estándar de TODOS los planes y lo único
// que se cobra es el cupo de alumnos, así que esta hoja ya no vende nada: solo explica
// qué hace la función y avisa que la cuenta no la tiene habilitada ahora (cuenta
// expirada/bloqueada o kill-switch de operador — ver services/entitlements.service.ts).
// Sin nombre de plan, sin «Pro» y sin CTA de upgrade (además del lado seguro del
// anti-steering Apple 3.1.1 / Google).

function FeatureUnavailableSheet({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  const router = useRouter()
  const { theme } = useTheme()
  return (
    <Modal visible={reason !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="rounded-t-sheet border-t border-subtle bg-surface-app px-5 pb-8 pt-5" onPress={() => {}}>
          <View className="mb-3 h-1.5 w-12 self-center rounded-pill bg-border-default" />
          <View className="mb-2 flex-row items-center gap-2">
            <Lock color={theme.primary} size={18} />
            <Text className="font-display text-lg font-bold text-strong">Función no disponible</Text>
          </View>
          <Text className="text-sm leading-5 text-body">
            {reason ?? 'Esta función no está habilitada en esta cuenta ahora mismo.'}
          </Text>
          <View className="mt-5 flex-row gap-3">
            <NutritionMotionButton accessibilityLabel="Cerrar" tone="neutral" onPress={onClose}>
              Cerrar
            </NutritionMotionButton>
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Ver funciones"
                onPress={() => {
                  // W3.7: destino directo a Funciones (`/coach/modules` es solo un redirect).
                  onClose()
                  router.push('/coach/settings/funciones')
                }}
              >
                Ver funciones
              </NutritionMotionButton>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
