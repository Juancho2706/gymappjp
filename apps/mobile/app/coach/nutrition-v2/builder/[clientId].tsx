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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, History, Lock, Minus, Plus, RefreshCw, Repeat, Search, Sparkles, Trash2, X } from 'lucide-react-native'
import {
  BuilderStepList,
  FoodThumbnail,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  SelectableStrategyCard,
  StrategyBadge,
  StudentPreview,
} from '../../../../components/nutrition-v2'
// Import por ruta directa (no via el barrel index.ts): respeta el contrato de MacroChipRow.
import { MacroChipRow } from '../../../../components/nutrition-v2/MacroChipRow'
import {
  NUTRITION_STRATEGIES,
  type FoodCatalogItem,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import {
  exchangeGroupColor,
  hasUnconfirmedMacros,
  portionsSummaryLabel,
  type ExchangeGroup,
} from '@eva/nutrition-engine'
import { Sheet } from '../../../../components/Sheet'
import { useTheme } from '../../../../context/ThemeContext'
import { isEnabled } from '../../../../lib/flags'
import { fetchCoachExchangeGroups } from '../../../../lib/nutrition-exchanges.coach'
import { PORTIONS_COPY } from '../../../../lib/nutrition-portions-copy'
import {
  PORTIONS_MAX,
  PORTIONS_MIN,
  addPortionGroup,
  combineSubtotals,
  derivePortionTotals,
  esDecimal,
  formatPortionsEs,
  hasAnyPortions,
  removePortionGroup,
  slotPortionTargets,
  slotPortionTotals,
  sortGroupsForPicker,
  stepPortionValue,
  type PortionsBySlot,
} from '../../../../lib/nutrition-v2-builder-portions'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import { archiveNutritionPlan, getNutritionClientDetailV2, nutritionV2CoachScope } from '../../../../lib/nutrition-v2.api'
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
  BUILDER_UNITS,
  CoachFoodInputSchema,
  MAX_ITEM_SUBSTITUTIONS,
  NUTRITION_PRO_MODULE_KEY,
  assembleAndValidateDraft,
  buildPublishIdempotencyKey,
  builderHasSignificantContent,
  builderReducer,
  canProceedToPublishAfterArchive,
  createCoachFoodV2,
  createEmptyBuilderState,
  customMacrosOf,
  dayTotals,
  effectiveDateConflicts,
  itemMacros,
  macroEnergyMismatch,
  mapFoodCatalogItemToBuilderFood,
  publishDraftRN,
  slotSubtotal,
  strategyUsesSlots,
  validateStep,
  type BuilderItem,
  type BuilderPermissions,
  type BuilderSlot,
  type BuilderState,
  type BuilderUnit,
  type NutritionV2WriteClient,
} from '../../../../lib/nutrition-v2-builder'
import { foodCategoryEmoji, foodMediaThumbnailUrl } from '../../../../lib/nutrition-v2-food-media'

const STRATEGY_ORDER: NutritionStrategy[] = ['structured', 'flexible', 'hybrid']

const STEP_META: Array<{ id: string; label: string }> = [
  { id: 'strategy', label: 'Estrategia' },
  { id: 'targets', label: 'Objetivos' },
  { id: 'construction', label: 'Construcción' },
  { id: 'review', label: 'Revisión' },
]

let keySeq = 0
function genKey(prefix: string): string {
  keySeq += 1
  return prefix + '-' + Date.now().toString(36) + '-' + keySeq
}

// Target del buscador de catalogo (un solo modal reusado). 'item' = agregar alimento a una
// franja (flujo original); 'substitution' = agregar un reemplazo autorizado a un item (F-02).
// Espejo del patron ya sancionado en el quick-edit RN (SearchTarget mode 'add' | 'swap').
type SearchTarget =
  | { mode: 'item'; slotKey: string }
  | { mode: 'substitution'; slotKey: string; itemKey: string }

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

// Plan vigente del alumno (sub-delta c): habilita la rama "Archivar y reemplazar". Se lee LOCAL
// con getNutritionClientDetailV2 (no llega por nav params — decision del juez, evita tocar la
// ficha/href de otras unidades). Espejo del `existingPlan` server-provisto del web.
type ExistingPlan = { id: string; effectiveFrom: string; versionNumber: number; name: string }

// Respaldo local del wizard (4B-13): DOS piezas de estado independientes viajan juntas — el arbol
// del reducer (BuilderState) y el mapa hermano de porciones (PortionsBySlot). Sin `portionsBySlot`
// un plan structured/hybrid restauraria incompleto (las porciones a eleccion se perderian). Espejo
// del web PlanBuilderClient.tsx:1024-1029.
interface BuilderDraftPayload {
  clientId: string
  planId: string | null
  state: BuilderState
  portionsBySlot: PortionsBySlot
}

// Copy LITERAL del aviso de salida (web PlanBuilderClient.tsx:1040). Warn-only: "Salir" deja la
// pantalla pero NO borra el borrador (el autosave ya lo persistio; solo publish OK / X del banner
// lo borran). El texto dice "descartarlo?" por fidelidad, pero el borrador siempre sobrevive (igual
// que el `beforeunload` web, que tampoco toca localStorage).
const LEAVE_GUARD_COPY = 'Tienes un borrador sin publicar. ¿Salir y descartarlo?'

// Fieldset "Permisos del alumno" (sub-delta a): orden y copys LITERALES del web
// (PlanBuilderClient.tsx:773-776). El estado ya fluye de punta a punta (SET_PERMISSION +
// assembleDraft); esto solo lo puebla con la eleccion del coach en vez del default.
const PERMISSION_FIELDS: Array<[keyof BuilderPermissions, string]> = [
  ['canRegisterFreely', 'Puede registrar alimentos libremente'],
  ['canAdjustPrescribedQuantity', 'Puede ajustar la cantidad prescrita'],
  ['canSubstitute', 'Puede sustituir alimentos'],
]

// ---------------------------------------------------------------------------
// Controlador de porciones a elección (4B-11) — espejo RN de `usePortionsBuilder` web.
// Estado hermano del reducer del wizard: el mapa slot→targets + el catálogo COMPLETO del
// coach (system + propios) con carga perezosa/error/reintento. Se instancia una vez en la
// pantalla y baja por props a Objetivos (card de derivar), Construcción (sección por franja)
// y Revisión (chips). Sin `commitValue` (stepper de botones, afirmación 7) ni server action:
// la lectura es coach-scoped por RLS (`fetchCoachExchangeGroups`).
// ---------------------------------------------------------------------------

interface PortionsController {
  bySlot: PortionsBySlot
  groups: ExchangeGroup[] | null
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
}

function usePortionsBuilder(): PortionsController {
  const [bySlot, setBySlot] = useState<PortionsBySlot>({})
  const [groups, setGroups] = useState<ExchangeGroup[] | null>(null)
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
    if (loadingRef.current) return
    loadingRef.current = true
    setGroupsLoading(true)
    setGroupsError(null)
    try {
      const res = await fetchCoachExchangeGroups()
      if (mountedRef.current) setGroups(sortGroupsForPicker(res))
    } catch {
      if (mountedRef.current) setGroupsError(PORTIONS_COPY.builder.pickerError)
    } finally {
      loadingRef.current = false
      if (mountedRef.current) setGroupsLoading(false)
    }
  }, [])

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

  return { bySlot, groups, groupsLoading, groupsError, ensureGroupsLoaded, retryGroups, addGroup, removeGroup, step, restoreBySlot }
}

export default function CoachNutritionV2BuilderScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ clientId: string; planId?: string; versionNumber?: string; clientName?: string }>()
  const clientId = first(params.clientId) ?? ''
  const planId = first(params.planId) ?? null
  const clientName = first(params.clientName) ?? ''
  const versionNumber = Number(first(params.versionNumber) ?? '0') || 0

  const entitlements = useEntitlements()
  const { ready: workspaceReady, kind, teamId, orgId } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)

  const today = useMemo(todayInSantiago, [])
  const scope = useMemo(
    () => (workspaceReady ? nutritionV2CoachScope({ kind, teamId, orgId }) : null),
    [workspaceReady, kind, teamId, orgId],
  )
  // Canary por alumno: alcanza el constructor aunque el flag global del coach esté apagado; el flag
  // global sigue prendiendo V2 por sí solo (OR) sin esperar esta consulta.
  const clientCanaryV2 = useNutritionV2CoachFlagForClient(clientId)
  const enabled = entitlements.ready && (isEnabled('nutritionV2Coach') || clientCanaryV2)
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)

  const [state, dispatch] = useReducer(builderReducer, today, createEmptyBuilderState)
  // Controlador de porciones a elección (4B-11): estado hermano del wizard, threadeado por el árbol.
  const portions = usePortionsBuilder()
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [dateConflict, setDateConflict] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  // Plan vigente del alumno (sub-delta c): null hasta resolver la lectura local. `canReplace`
  // se deriva de su presencia, espejo del web (PlanBuilderClient.tsx:1439).
  const [existingPlan, setExistingPlan] = useState<ExistingPlan | null>(null)
  // Respaldo local (4B-13): el fetch de `existingPlan` es ASINCRONO en RN (arranca null y se setea
  // en el .then/.catch), asi que la key del borrador `…:<id>` mutaria a mitad de sesion. Este flag
  // (seteado en AMBAS ramas del fetch) fija la key ANTES de leer/escribir: nada de read+banner ni
  // autosave hasta que resuelva. Sin homologo web (alli `existingPlan` es server-provisto sincrono).
  const [existingPlanResolved, setExistingPlanResolved] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const draftPayloadRef = useRef<BuilderDraftPayload | null>(null)
  const isFirstRenderRef = useRef(true)
  const { theme } = useTheme()
  const operationId = useRef(genKey('op'))
  // Reemplazo "archivar->publicar" reanudable (sub-delta c): clave de idempotencia ESTABLE por
  // operacion (fijada una sola vez) + guard "archivado una sola vez", para que un reintento tras
  // archivar reintente SOLO la publicacion sin duplicar el plan ni re-archivar. Espejo del web.
  const replaceKeyRef = useRef<string | null>(null)
  const replaceArchivedRef = useRef(false)
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
    if (!clientId || !scope) return
    let active = true
    void getNutritionClientDetailV2({ clientId, scope, date: today })
      .then((detail) => {
        if (!active) return
        const p = detail.plan.plan
        setExistingPlan(
          p ? { id: p.id, effectiveFrom: p.effectiveFrom, versionNumber: p.versionNumber, name: p.name } : null,
        )
        setExistingPlanResolved(true)
      })
      .catch(() => {
        if (!active) return
        setExistingPlan(null)
        setExistingPlanResolved(true)
      })
    return () => {
      active = false
    }
  }, [clientId, scope, today])

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
  useEffect(() => {
    if (!existingPlanResolved) return
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
  }, [existingPlanResolved, draftKey, clientId])

  // Autosave debounced (2000 ms — distinto de los 1500 ms del quick-edit) del arbol del wizard + las
  // porciones. Salta el primer render (la hidratacion inicial no es un cambio del coach) y solo corre
  // con la key estable (`existingPlanResolved`). Si el borrador deja de tener contenido significativo
  // (el coach vacio todo) limpia la key en vez de guardar vacio. AsyncStorage async: `void` sin bloquear.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (!existingPlanResolved) return
    const timer = setTimeout(() => {
      if (builderHasSignificantContent(state)) {
        void writeNutritionDraft<BuilderDraftPayload>(
          draftKey,
          { clientId, planId: existingPlan?.id ?? null, state, portionsBySlot: portions.bySlot },
          Date.now(),
        )
      } else {
        void clearNutritionDraft(draftKey)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [state, portions.bySlot, draftKey, existingPlanResolved, clientId, existingPlan?.id])

  const validation = useMemo(() => validateStep(state, state.step), [state])

  const steps = STEP_META.map((meta, index) => {
    let stepState: 'upcoming' | 'current' | 'complete' | 'error' = 'upcoming'
    if (index === state.step) stepState = showErrors && !validation.ok ? 'error' : 'current'
    else if (index < state.step) stepState = 'complete'
    const description = index === 2 && !strategyUsesSlots(state.strategy) ? 'No aplica (plan flexible)' : undefined
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
      if (strategy === 'hybrid' && !hasNutritionPro) {
        setUpsell('la estrategia hibrida')
        return
      }
      dispatch({ type: 'SET_STRATEGY', strategy, firstSlotKey: genKey('slot') })
    },
    [hasNutritionPro],
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

  const handlePublish = useCallback(
    async (effectiveFromOverride?: string) => {
      if (!userId || !clientId) return
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
      let draft
      try {
        draft = assembleAndValidateDraft(state, { clientId, planId, portionsBySlot: portions.bySlot })
      } catch {
        setShowErrors(true)
        setPublishError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
        return
      }
      // Clave fresca por intento: evita reutilizar la de un intento fallido (versiones huerfanas).
      operationId.current = genKey('op')
      const idempotencyKey = buildPublishIdempotencyKey({ clientId, operationId: operationId.current })
      setPublishing(true)
      const res = await publishDraftRN({
        db: supabase as unknown as NutritionV2WriteClient,
        userId,
        draft,
        idempotencyKey,
        effectiveFrom: chosenFrom,
        hasNutritionPro,
        // Catálogo para congelar el snapshot de las porciones (4B-11); sin porciones es inocuo.
        portionGroups: portions.groups ?? undefined,
      })
      if (!mountedRef.current) return
      setPublishing(false)
      if (res.ok) {
        goToPublished()
        return
      }
      if (res.code === 'UPGRADE_REQUIRED') {
        setUpsell(res.error)
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
    [userId, clientId, planId, state, today, hasNutritionPro, portions.bySlot, portions.groups, existingPlan, goToPublished],
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
    if (!userId || !clientId || !existingPlan) return
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
        db: supabase as unknown as NutritionV2WriteClient,
        userId,
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
    const res = await publishDraftRN({
      db: supabase as unknown as NutritionV2WriteClient,
      userId,
      draft,
      idempotencyKey,
      effectiveFrom,
      hasNutritionPro,
      portionGroups: portions.groups ?? undefined,
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
  }, [userId, clientId, existingPlan, state, today, hasNutritionPro, portions.bySlot, portions.groups, goToPublished])

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
  const handleSaveCustomFood = useCallback(
    async (item: BuilderItem, slotKey: string): Promise<{ ok: boolean; error?: string }> => {
      if (!userId || !clientId) return { ok: false, error: 'Sesión no disponible. Reintenta.' }
      const unit = item.unit === 'ml' ? 'ml' : 'g'
      const macros = customMacrosOf(item)
      const parsed = CoachFoodInputSchema.safeParse({
        clientId,
        name: (item.customName ?? '').trim(),
        brand: null,
        unit,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatsG: macros.fatsG,
      })
      if (!parsed.success) {
        return { ok: false, error: 'Completa el nombre y macros validas (no negativas) antes de guardar.' }
      }
      const res = await createCoachFoodV2({
        db: supabase as unknown as NutritionV2WriteClient,
        userId,
        input: parsed.data,
      })
      if (!res.ok) return { ok: false, error: res.error }
      dispatch({
        type: 'UPDATE_ITEM',
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
    [userId, clientId],
  )

  const handleSelectFood = useCallback(
    (food: FoodCatalogItem) => {
      if (!searchTarget) return
      const builderFood = mapFoodCatalogItemToBuilderFood(food)
      if (searchTarget.mode === 'item') {
        dispatch({ type: 'ADD_ITEM', slotKey: searchTarget.slotKey, key: genKey('item'), food: builderFood })
      } else {
        dispatch({
          type: 'ADD_ITEM_SUBSTITUTION',
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
            description="El constructor de planes requiere rollout de coach y un alumno válido."
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

          <NutritionHeader
            eyebrow={planId ? 'Nueva version' : 'Nuevo plan'}
            title={clientName || 'Constructor de nutrición'}
            description={
              planId
                ? `Al publicar se creará la versión v${versionNumber + 1} y la actual pasará a anterior.`
                : 'Arma el plan en cuatro pasos y publícalo.'
            }
          />

          <BuilderStepList steps={steps} />

          {state.step === 0 ? (
            <StrategyStep state={state} onPick={handlePickStrategy} hasNutritionPro={hasNutritionPro} error={errors.strategy} />
          ) : null}
          {state.step === 1 ? (
            <TargetsStep state={state} dispatch={dispatch} errors={errors} portions={portions} />
          ) : null}
          {state.step === 2 ? (
            <ConstructionStep
              state={state}
              dispatch={dispatch}
              errors={errors}
              onSearch={(target) => setSearchTarget(target)}
              onSaveCustomFood={handleSaveCustomFood}
              portions={portions}
            />
          ) : null}
          {state.step === 3 ? (
            <ReviewStep
              state={state}
              publishError={publishError}
              dateConflict={dateConflict}
              conflictError={conflictError}
              canReplace={existingPlan !== null}
              existingPlanName={existingPlan?.name ?? null}
              publishing={publishing}
              onStartTomorrow={handleStartTomorrow}
              onReplaceToday={() => void handleReplaceToday()}
              onCancelConflict={handleCancelConflict}
              portions={portions}
            />
          ) : null}
        </ScrollView>

        <View className="flex-row items-center justify-between gap-3 border-t border-border-subtle bg-surface-app px-4 py-3">
          <NutritionMotionButton
            accessibilityLabel="Paso anterior"
            tone="neutral"
            disabled={state.step === 0 || publishing}
            onPress={handlePrev}
          >
            Atrás
          </NutritionMotionButton>
          {state.step < 3 ? (
            <NutritionMotionButton accessibilityLabel="Siguiente paso" onPress={handleNext}>
              Siguiente
            </NutritionMotionButton>
          ) : (
            <NutritionMotionButton
              accessibilityLabel="Publicar plan"
              pending={publishing}
              disabled={publishing}
              onPress={() => void handlePublish()}
            >
              Publicar plan
            </NutritionMotionButton>
          )}
        </View>
      </KeyboardAvoidingView>

      <FoodSearchModal
        visible={searchTarget !== null}
        onClose={() => setSearchTarget(null)}
        onSelect={handleSelectFood}
      />
      <UpsellSheet reason={upsell} onClose={() => setUpsell(null)} />
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
      <Text className="mb-1.5 text-sm font-semibold text-text-strong">{label}</Text>
      <TextInput
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboardType ?? 'default'}
        className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-text-strong"
      />
      {hint && !error ? <Text className="mt-1 text-xs text-text-muted">{hint}</Text> : null}
      <ErrorText message={error} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Paso 0 — Estrategia
// ---------------------------------------------------------------------------

function StrategyStep({
  state,
  onPick,
  hasNutritionPro,
  error,
}: {
  state: BuilderState
  onPick: (strategy: NutritionStrategy) => void
  hasNutritionPro: boolean
  error?: string
}) {
  return (
    <View className="gap-3">
      <Text className="font-display text-lg font-semibold text-text-strong">¿Cómo se estructura el plan?</Text>
      <ErrorText message={error} />
      <View className="gap-3">
        {STRATEGY_ORDER.map((strategy) => {
          const locked = strategy === 'hybrid' && !hasNutritionPro
          return (
            <View key={strategy}>
              <SelectableStrategyCard
                strategy={strategy}
                selected={state.strategy === strategy}
                onSelect={onPick}
              />
              {locked ? (
                <View className="mt-1.5 flex-row items-center gap-1.5 px-1">
                  <Lock color="#8A94A6" size={13} />
                  <Text className="text-xs font-medium text-text-muted">Incluido en Nutrición Pro</Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Paso 1 — Objetivos
// ---------------------------------------------------------------------------

function TargetsStep({
  state,
  dispatch,
  errors,
  portions,
}: {
  state: BuilderState
  dispatch: React.Dispatch<import('../../../../lib/nutrition-v2-builder').BuilderAction>
  errors: Record<string, string>
  portions: PortionsController
}) {
  return (
    <View className="gap-4">
      <PortionsDeriveCard state={state} portions={portions} dispatch={dispatch} />
      <LabeledInput
        label="Nombre del plan"
        value={state.planName}
        onChangeText={(value) => dispatch({ type: 'SET_PLAN_NAME', value })}
        placeholder="Ej: Plan de definición"
        error={errors.planName}
      />

      <NutritionCard>
        <Text className="font-display text-base font-semibold text-text-strong">Metas diarias</Text>
        <Text className="mt-1 text-xs text-text-muted">Define al menos una meta (kcal o un macro).</Text>
        <View className="mt-3 gap-3">
          <LabeledInput
            label="Energía (kcal)"
            value={state.targets.calories}
            onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'calories', value })}
            placeholder="2000"
            keyboardType="number-pad"
            error={errors.calories}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <LabeledInput
                label="Proteína (g)"
                value={state.targets.proteinG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'proteinG', value })}
                placeholder="150"
                keyboardType="number-pad"
                error={errors.proteinG}
              />
            </View>
            <View className="flex-1">
              <LabeledInput
                label="Carbos (g)"
                value={state.targets.carbsG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'carbsG', value })}
                placeholder="200"
                keyboardType="number-pad"
                error={errors.carbsG}
              />
            </View>
            <View className="flex-1">
              <LabeledInput
                label="Grasas (g)"
                value={state.targets.fatsG}
                onChangeText={(value) => dispatch({ type: 'SET_TARGET', field: 'fatsG', value })}
                placeholder="60"
                keyboardType="number-pad"
                error={errors.fatsG}
              />
            </View>
          </View>
        </View>
      </NutritionCard>

      <NutritionCard>
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Permisos del alumno</Text>
        <View className="mt-2 gap-1">
          {PERMISSION_FIELDS.map(([field, label]) => (
            <PermissionRow
              key={field}
              label={label}
              checked={state.permissions[field]}
              onToggle={() => dispatch({ type: 'SET_PERMISSION', field, value: !state.permissions[field] })}
            />
          ))}
        </View>
      </NutritionCard>

      <LabeledInput
        label="Vigente desde"
        value={state.effectiveFrom}
        onChangeText={(value) => dispatch({ type: 'SET_EFFECTIVE_FROM', value })}
        placeholder="YYYY-MM-DD"
        hint="Formato AAAA-MM-DD. Debe ser posterior a la versión vigente."
      />
    </View>
  )
}

// Fila-checkbox de permiso (sub-delta a): afordancia de casilla nativa (RN no tiene
// <input type=checkbox>). Casilla cuadrada con `Check` visible SOLO al estar activo, tintada con
// `theme.primary` (nunca un hex — white-label). La UI NO autoriza: los permisos son metadatos del
// plan; el enforcement real vive en el read-model del alumno y en el RPC. Patron de checkbox ya
// sancionado (AssignClientsSheet / modal de asignar 4B-08): Pressable + accessibilityRole="checkbox".
function PermissionRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="min-h-11 flex-row items-center gap-2.5 rounded-control px-1"
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded-control border ${
          checked ? 'border-transparent' : 'border-border-default bg-surface-card'
        }`}
        style={checked ? { backgroundColor: theme.primary } : undefined}
      >
        {checked ? <Check color={theme.primaryForeground} size={14} /> : null}
      </View>
      <Text className="flex-1 text-sm text-text-body">{label}</Text>
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
        className={`h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card ${canDecrement ? '' : 'opacity-40'}`}
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <Text
        accessibilityLabel={`Porciones de ${groupName}: ${formatPortionsEs(portions)}`}
        className="w-12 text-center text-base font-semibold text-text-strong"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatPortionsEs(portions)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.stepUpAria(groupName)}
        disabled={!canIncrement}
        onPress={() => onStep(1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card ${canIncrement ? '' : 'opacity-40'}`}
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
          <Text className="text-sm text-text-muted">{PORTIONS_COPY.builder.pickerLoading}</Text>
        </View>
      ) : groups == null && controller.groupsError ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-sm text-text-muted">{controller.groupsError}</Text>
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
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityLabel={
                  used ? `${group.name}: ${PORTIONS_COPY.builder.groupUsed}` : `Agregar ${group.name}`
                }
                disabled={used}
                onPress={() => onPick(group.id)}
                className={`min-h-12 flex-row items-center gap-3 rounded-control px-2 py-2 ${used ? 'opacity-50' : 'active:bg-surface-sunken'}`}
              >
                <PortionsGroupDot code={group.code} color={group.color} sortOrder={group.sortOrder} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="shrink text-sm font-semibold text-text-strong" numberOfLines={1}>
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
                  <Text className="text-xs text-text-muted" numberOfLines={1}>
                    {used
                      ? PORTIONS_COPY.builder.groupUsed
                      : `1 porción ≈ ${Math.round(group.refCalories)} kcal · ${Math.round(group.refCarbsG)} C · ${Math.round(group.refProteinG)} P`}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </Sheet>
  )
}

/** Sección "Porciones a elección" de una franja (dentro de SlotEditor, bajo el buscador). */
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
    <View className="mt-3 border-t border-border-subtle pt-3">
      <Text className="text-sm font-medium text-text-strong">{PORTIONS_COPY.builder.sectionTitle}</Text>
      <Text className="mt-0.5 text-xs text-text-muted">{PORTIONS_COPY.builder.sectionHint}</Text>

      {targets.length > 0 ? (
        <View className="mt-2 gap-2">
          {targets.map((target) => {
            const group = groupById.get(target.exchangeGroupId)
            // El builder siempre agrega grupos desde el picker (catálogo cargado); el fallback
            // cubre re-renders raros sin romper la fila.
            const name = group?.name ?? 'Grupo'
            return (
              <View key={target.exchangeGroupId} className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  {group ? (
                    <PortionsGroupDot code={group.code} color={group.color} sortOrder={group.sortOrder} />
                  ) : (
                    <View accessible={false} className="h-5 w-5 rounded-full bg-border-subtle" />
                  )}
                  <Text className="min-w-0 flex-1 text-sm font-medium text-text-strong" numberOfLines={1}>
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
  const liveKeys = state.slots.map((s) => s.key)
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
        <Text className="flex-1 text-sm leading-5 text-text-body">
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
 * Chips read-only + banner referencial en Revisión (solo structured/hybrid con porciones).
 * `portionsSummaryLabel` ("2C · 1,5V") con coma decimal es-CL; el banner aparece si algún
 * grupo usado tiene `macros_confirmed=false`. No duplica totales. Espejo de `PortionsReviewSection` web.
 */
function PortionsReviewSection({
  state,
  portions,
}: {
  state: BuilderState
  portions: PortionsController
}) {
  const usesSlots = strategyUsesSlots(state.strategy)
  const liveKeys = state.slots.map((s) => s.key)
  const groups = portions.groups
  if (!usesSlots || groups == null || !hasAnyPortions(portions.bySlot, liveKeys)) return null
  const rows = state.slots
    .map((slot, index) => ({
      slot,
      index,
      targets: slotPortionTargets(portions.bySlot, slot.key).filter((t) => t.portions > 0),
    }))
    .filter((r) => r.targets.length > 0)
  const anyUnconfirmed = rows.some((r) => hasUnconfirmedMacros(r.targets, groups))
  return (
    <View className="gap-2 rounded-card border border-border-subtle bg-surface-card p-4">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {PORTIONS_COPY.builder.sectionTitle}
      </Text>
      {anyUnconfirmed ? (
        <View className="rounded-control border border-warning-500/30 bg-warning-500/10 p-2.5">
          <Text className="text-xs text-warning-700">{PORTIONS_COPY.builder.unconfirmedBanner}</Text>
        </View>
      ) : null}
      <View className="gap-1.5">
        {rows.map(({ slot, index, targets }) => (
          <View key={slot.key} className="flex-row items-center gap-2">
            <Text className="min-w-0 flex-1 text-xs text-text-body" numberOfLines={1}>
              {slot.name || `Franja ${index + 1}`}
            </Text>
            <Text
              className="font-mono text-xs text-text-strong"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {esDecimal(portionsSummaryLabel(targets, groups))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Paso 2 — Construcción (franjas + items)
// ---------------------------------------------------------------------------

type BuilderDispatch = React.Dispatch<import('../../../../lib/nutrition-v2-builder').BuilderAction>

function UnitToggle({ unit, onChange }: { unit: BuilderUnit; onChange: (unit: BuilderUnit) => void }) {
  return (
    <Pressable
      accessibilityLabel={`Unidad: ${unit}. Toca para cambiar.`}
      accessibilityRole="button"
      className="min-h-11 min-w-14 items-center justify-center rounded-control border border-border-default bg-surface-sunken px-2"
      onPress={() => {
        const idx = BUILDER_UNITS.indexOf(unit)
        onChange(BUILDER_UNITS[(idx + 1) % BUILDER_UNITS.length])
      }}
    >
      <Text className="text-sm font-semibold text-text-strong">{unit}</Text>
    </Pressable>
  )
}

function ItemEditor({
  slotKey,
  item,
  dispatch,
  errors,
  onSearch,
  onSaveCustomFood,
}: {
  slotKey: string
  item: BuilderItem
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (item: BuilderItem, slotKey: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const { theme } = useTheme()
  const macros = itemMacros(item)
  const isCustom = item.food === null
  const patch = (p: Partial<Omit<BuilderItem, 'key'>>) =>
    dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: p })
  // "Guardar en mi catálogo" (sub-delta b): estado local del alta + aviso de mismatch de energia
  // (macroEnergyMismatch, umbral 40% Atwater). Solo aplica al bloque custom (isCustom).
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const showMismatch = isCustom && macroEnergyMismatch(customMacrosOf(item))

  async function handleSaveCustom() {
    setSaveError(null)
    setSaving(true)
    const res = await onSaveCustomFood(item, slotKey)
    setSaving(false)
    if (!res.ok) setSaveError(res.error ?? 'No se pudo guardar el alimento.')
  }

  return (
    <View className="rounded-control border border-border-subtle bg-surface-sunken p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
          <FoodThumbnail
            alt={item.food?.name ?? item.customName ?? 'Alimento'}
            src={item.food ? foodMediaThumbnailUrl(item.food.media) : null}
            fallbackEmoji={item.food ? foodCategoryEmoji(item.food.category) : null}
            size="sm"
          />
          <View className="min-w-0 flex-1">
            {isCustom ? (
              <TextInput
                value={item.customName ?? ''}
                onChangeText={(value) => patch({ customName: value })}
                placeholder="Nombre del alimento"
                placeholderTextColor={theme.mutedForeground}
                className="min-h-10 rounded-control border border-border-default bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-text-strong"
              />
            ) : (
              <Text className="text-sm font-semibold text-text-strong" numberOfLines={2}>
                {item.food?.name}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          accessibilityLabel="Quitar alimento"
          accessibilityRole="button"
          className="min-h-10 min-w-10 items-center justify-center rounded-control"
          onPress={() => dispatch({ type: 'REMOVE_ITEM', slotKey, itemKey: item.key })}
        >
          <Trash2 color={theme.destructive} size={17} />
        </Pressable>
      </View>

      <View className="mt-2 flex-row items-center gap-2">
        <View className="flex-1">
          <TextInput
            value={item.quantity}
            onChangeText={(value) => patch({ quantity: value })}
            placeholder="Cantidad"
            placeholderTextColor={theme.mutedForeground}
            keyboardType="decimal-pad"
            className="min-h-11 rounded-control border border-border-default bg-surface-card px-2.5 py-2 text-sm text-text-strong"
          />
        </View>
        <UnitToggle unit={item.unit} onChange={(unit) => patch({ unit })} />
      </View>
      <ErrorText message={errors['item.' + item.key + '.quantity'] ?? errors['item.' + item.key + '.food']} />

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
                <Text className="mb-1 text-[10px] font-medium text-text-muted">{label}</Text>
                <TextInput
                  value={item[field]}
                  onChangeText={(value) => patch({ [field]: value } as Partial<Omit<BuilderItem, 'key'>>)}
                  placeholder="0"
                  placeholderTextColor={theme.mutedForeground}
                  keyboardType="number-pad"
                  className="min-h-10 rounded-control border border-border-default bg-surface-card px-2 py-1.5 text-sm text-text-strong"
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
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar en mi catálogo"
              disabled={saving}
              onPress={() => void handleSaveCustom()}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 ${saving ? 'opacity-60' : ''}`}
            >
              {saving ? (
                <ActivityIndicator color={theme.foreground} size="small" />
              ) : (
                <Plus color={theme.foreground} size={14} />
              )}
              <Text className="text-xs font-semibold text-text-strong">Guardar en mi catálogo</Text>
            </Pressable>
            {saveError ? <Text className="text-[11px] text-danger-600">{saveError}</Text> : null}
          </View>
        </>
      ) : null}

      <View className="mt-2">
        <MacroChipRow size="sm" calories={macros.calories} proteinG={macros.proteinG} carbsG={macros.carbsG} fatsG={macros.fatsG} />
      </View>

      <SubstitutionsField slotKey={slotKey} item={item} dispatch={dispatch} onSearch={onSearch} />
    </View>
  )
}

// Reemplazos autorizados por el coach (F-02): afordancia compacta bajo cada item prescrito.
// "Reemplazo" abre el MISMO buscador de catalogo del builder (FoodSearchModal) y agrega el
// alimento elegido como chip removible (tope MAX_ITEM_SUBSTITUTIONS). Solo se monta dentro
// de ItemEditor, que a su vez solo existe en structured/hybrid (SlotEditor -> ConstructionStep).
// El alumno vera estas opciones; el server congela el snapshot de cada reemplazo al publicar.
// Espejo del SubstitutionsField de la web (PlanBuilderClient.tsx).
function SubstitutionsField({
  slotKey,
  item,
  dispatch,
  onSearch,
}: {
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
    <View className="mt-2 border-t border-border-subtle pt-2">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <View className="flex-row items-center gap-1">
          <Repeat color={theme.mutedForeground} size={14} />
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Reemplazos autorizados</Text>
        </View>
        {subs.length > 0 ? (
          <Text className="font-mono text-[11px] tabular-nums text-text-subtle">
            {subs.length}/{MAX_ITEM_SUBSTITUTIONS}
          </Text>
        ) : null}
      </View>

      {subs.length > 0 ? (
        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {subs.map((sub) => (
            <View
              key={sub.key}
              className="max-w-full flex-row items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken py-0.5 pl-2.5 pr-1"
            >
              <Text className="min-w-0 shrink text-xs text-text-body" numberOfLines={1}>
                {sub.food.name}
              </Text>
              <Pressable
                accessibilityLabel={`Quitar reemplazo ${sub.food.name}`}
                accessibilityRole="button"
                className="min-h-11 min-w-11 items-center justify-center rounded-full"
                onPress={() =>
                  dispatch({ type: 'REMOVE_ITEM_SUBSTITUTION', slotKey, itemKey: item.key, subKey: sub.key })
                }
              >
                <X color={theme.mutedForeground} size={13} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-1 text-[11px] leading-snug text-text-subtle">
          Alimentos que el alumno puede usar en lugar de {prescribedName}.
        </Text>
      )}

      {atCap ? (
        <Text className="mt-1.5 text-[11px] text-text-subtle">
          Alcanzaste el maximo de {MAX_ITEM_SUBSTITUTIONS} reemplazos.
        </Text>
      ) : (
        <Pressable
          accessibilityLabel="Agregar reemplazo autorizado"
          accessibilityRole="button"
          className="mt-1.5 min-h-11 flex-row items-center justify-center gap-1.5 self-start rounded-control border border-border-default bg-surface-card px-3"
          onPress={() => onSearch({ mode: 'substitution', slotKey, itemKey: item.key })}
        >
          <Plus color={theme.foreground} size={14} />
          <Text className="text-xs font-semibold text-text-strong">Reemplazo</Text>
        </Pressable>
      )}
    </View>
  )
}

function SlotEditor({
  slot,
  index,
  dispatch,
  errors,
  onSearch,
  onSaveCustomFood,
  portions,
}: {
  slot: BuilderSlot
  index: number
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (item: BuilderItem, slotKey: string) => Promise<{ ok: boolean; error?: string }>
  portions: PortionsController
}) {
  const { theme } = useTheme()
  // Subtotal combinado (items fijos + derivado de porciones, 4B-11). Sin porciones (o catálogo
  // sin cargar) `slotPortionTotals` devuelve null y `combineSubtotals` deja el objeto de items intacto.
  const portionTotals = slotPortionTotals(portions.bySlot, slot.key, portions.groups)
  const subtotal = combineSubtotals(slotSubtotal(slot), portionTotals)
  const showSubtotal = slot.items.length > 0 || portionTotals != null
  return (
    <NutritionCard>
      <View className="flex-row items-start justify-between gap-2">
        <Text className="font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
          Franja {index + 1}
        </Text>
        <Pressable
          accessibilityLabel="Quitar franja"
          accessibilityRole="button"
          className="min-h-9 min-w-9 items-center justify-center rounded-control"
          onPress={() => dispatch({ type: 'REMOVE_SLOT', slotKey: slot.key })}
        >
          <Trash2 color={theme.destructive} size={16} />
        </Pressable>
      </View>

      <View className="mt-2 flex-row gap-2">
        <View className="flex-1">
          <TextInput
            value={slot.name}
            onChangeText={(value) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { name: value } })}
            placeholder="Nombre (ej: Desayuno)"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-border-default bg-surface-card px-2.5 py-2 text-sm font-semibold text-text-strong"
          />
        </View>
        <View className="w-24">
          <TextInput
            value={slot.startTime}
            onChangeText={(value) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { startTime: value } })}
            placeholder="HH:MM"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-border-default bg-surface-card px-2.5 py-2 text-sm text-text-strong"
          />
        </View>
      </View>
      <ErrorText message={errors['slot.' + slot.key + '.name'] ?? errors['slot.' + slot.key + '.startTime']} />

      <View className="mt-3 gap-2">
        {slot.items.map((item) => (
          <ItemEditor
            key={item.key}
            slotKey={slot.key}
            item={item}
            dispatch={dispatch}
            errors={errors}
            onSearch={onSearch}
            onSaveCustomFood={onSaveCustomFood}
          />
        ))}
      </View>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityLabel="Buscar alimento del catálogo"
          accessibilityRole="button"
          className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control border border-primary/30 bg-primary/10 px-3"
          onPress={() => onSearch({ mode: 'item', slotKey: slot.key })}
        >
          <Search color={theme.primary} size={15} />
          <Text className="text-sm font-semibold text-primary">Buscar alimento</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Agregar alimento libre"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3"
          onPress={() => dispatch({ type: 'ADD_ITEM', slotKey: slot.key, key: genKey('item'), food: null })}
        >
          <Plus color={theme.foreground} size={15} />
          <Text className="text-sm font-semibold text-text-strong">Libre</Text>
        </Pressable>
      </View>

      <BuilderPortionsSection slotKey={slot.key} controller={portions} />

      {showSubtotal ? (
        <View className="mt-3 border-t border-border-subtle pt-2">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Subtotal franja</Text>
          <MacroChipRow size="sm" calories={subtotal.calories} proteinG={subtotal.proteinG} carbsG={subtotal.carbsG} fatsG={subtotal.fatsG} />
          {portionTotals != null ? (
            <Text className="mt-1 text-[11px] text-text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
            </Text>
          ) : null}
        </View>
      ) : null}
    </NutritionCard>
  )
}

function ConstructionStep({
  state,
  dispatch,
  errors,
  onSearch,
  onSaveCustomFood,
  portions,
}: {
  state: BuilderState
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
  onSaveCustomFood: (item: BuilderItem, slotKey: string) => Promise<{ ok: boolean; error?: string }>
  portions: PortionsController
}) {
  if (!strategyUsesSlots(state.strategy)) {
    return (
      <NutritionCard>
        <Text className="font-display text-base font-semibold text-text-strong">Plan flexible</Text>
        <Text className="mt-2 text-sm leading-5 text-text-muted">
          Este plan no usa franjas prescritas: el alumno registra sus comidas libremente contra las metas
          diarias del paso anterior. Continúa a la revisión.
        </Text>
      </NutritionCard>
    )
  }

  // Total del día combinado (items + porciones a elección, 4B-11). Sin catálogo cargado el
  // derivado es null y `combineSubtotals` devuelve los totales de items intactos (jamás NaN).
  const liveKeys = state.slots.map((s) => s.key)
  const portionDay = portions.groups ? derivePortionTotals(liveKeys, portions.bySlot, portions.groups) : null
  const totals = combineSubtotals(dayTotals(state), portionDay)
  return (
    <View className="gap-3">
      <ErrorText message={errors.slots} />
      {state.slots.map((slot, index) => (
        <SlotEditor
          key={slot.key}
          slot={slot}
          index={index}
          dispatch={dispatch}
          errors={errors}
          onSearch={onSearch}
          onSaveCustomFood={onSaveCustomFood}
          portions={portions}
        />
      ))}
      <Pressable
        accessibilityLabel="Agregar franja"
        accessibilityRole="button"
        className="min-h-12 flex-row items-center justify-center gap-1.5 rounded-card border border-dashed border-border-default bg-surface-card px-3"
        onPress={() => dispatch({ type: 'ADD_SLOT', key: genKey('slot') })}
      >
        <Plus color="#8A94A6" size={16} />
        <Text className="text-sm font-semibold text-text-muted">Agregar franja</Text>
      </Pressable>
      {state.slots.length > 0 ? (
        <View className="px-1">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Total del día</Text>
          <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Paso 3 — Revisión y publicar
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
      className={`min-h-11 flex-row items-start gap-3 rounded-control border border-border-default bg-surface-card px-3 py-3 ${disabled ? 'opacity-50' : 'active:bg-surface-sunken'}`}
    >
      <View className="mt-0.5">
        <Icon color={theme.primary} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-text-strong">{title}</Text>
        <Text className="mt-0.5 text-xs leading-snug text-text-muted">{hint}</Text>
      </View>
    </Pressable>
  )
}

function ReviewStep({
  state,
  publishError,
  dateConflict,
  conflictError,
  canReplace,
  existingPlanName,
  publishing,
  onStartTomorrow,
  onReplaceToday,
  onCancelConflict,
  portions,
}: {
  state: BuilderState
  publishError: string | null
  dateConflict: boolean
  conflictError: string | null
  canReplace: boolean
  existingPlanName: string | null
  publishing: boolean
  onStartTomorrow: () => void
  onReplaceToday: () => void
  onCancelConflict: () => void
  portions: PortionsController
}) {
  const { theme } = useTheme()
  const strategy = state.strategy ?? 'flexible'
  const totals = dayTotals(state)
  const usesSlots = strategyUsesSlots(state.strategy)
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <StrategyBadge strategy={strategy} />
      </View>

      <StudentPreview title="Vista del alumno" themeLabel={NUTRITION_STRATEGIES[strategy].shortLabel}>
        <View className="gap-3">
          <View>
            <Text className="font-display text-lg font-semibold text-text-strong">{state.planName || 'Plan sin nombre'}</Text>
            <Text className="mt-0.5 text-xs text-text-muted">Vigente desde {state.effectiveFrom || 'hoy'}</Text>
          </View>

          <View className="rounded-control border border-border-subtle bg-surface-sunken p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Metas diarias</Text>
            <Text className="mt-1 font-mono text-sm text-text-strong">
              {[
                state.targets.calories ? `${state.targets.calories} kcal` : null,
                state.targets.proteinG ? `P ${state.targets.proteinG}` : null,
                state.targets.carbsG ? `C ${state.targets.carbsG}` : null,
                state.targets.fatsG ? `G ${state.targets.fatsG}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Sin metas definidas'}
            </Text>
          </View>

          {usesSlots ? (
            <View className="gap-2">
              {state.slots.map((slot, index) => (
                <View key={slot.key} className="rounded-control border border-border-subtle bg-surface-card p-3">
                  <Text className="text-sm font-semibold text-text-strong">
                    {slot.name || `Franja ${index + 1}`}
                    {slot.startTime ? ` · ${slot.startTime}` : ''}
                  </Text>
                  {slot.items.length === 0 ? (
                    <Text className="mt-1 text-xs text-text-muted">Sin alimentos</Text>
                  ) : (
                    slot.items.map((item) => (
                      <Text key={item.key} className="mt-1 text-xs text-text-body">
                        {(item.food?.name ?? item.customName ?? 'Alimento') + ` · ${item.quantity || '0'} ${item.unit}`}
                      </Text>
                    ))
                  )}
                </View>
              ))}
              <View className="px-1">
                <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Total prescrito</Text>
                <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
              </View>
            </View>
          ) : (
            <Text className="text-sm text-text-muted">Registro libre del alumno contra las metas diarias.</Text>
          )}
        </View>
      </StudentPreview>

      <PortionsReviewSection state={state} portions={portions} />

      {dateConflict ? (
        <View className="gap-3 rounded-card border border-border-default bg-surface-card p-4">
          <View className="gap-1">
            <Text className="font-display text-base font-semibold text-text-strong">Ya hay un plan vigente desde hoy</Text>
            <Text className="text-sm leading-5 text-text-muted">
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
              <Text className="text-xs text-text-muted">Procesando…</Text>
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
  onClose,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  onSelect: (food: FoodCatalogItem) => void
}) {
  const { theme } = useTheme()
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
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
        <View className="flex-row items-center gap-2 border-b border-border-subtle px-4 py-3">
          <View className="flex-1 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
            <Search color={theme.mutedForeground} size={16} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar alimento…"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 flex-1 py-2 text-base text-text-strong"
            />
          </View>
          <Pressable
            accessibilityLabel="Cerrar búsqueda"
            accessibilityRole="button"
            className="min-h-11 min-w-11 items-center justify-center rounded-control"
            onPress={onClose}
          >
            <X color={theme.foreground} size={20} />
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-2 px-4 py-3" keyboardShouldPersistTaps="handled">
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : items.length === 0 ? (
            <Text className="px-1 py-6 text-center text-sm text-text-muted">
              {touched && query.trim().length >= 2 ? 'Sin resultados.' : 'Escribe al menos 2 letras para buscar.'}
            </Text>
          ) : (
            items.map((food) => (
              <Pressable
                key={food.id}
                accessibilityLabel={`Agregar ${food.name}`}
                accessibilityRole="button"
                className="min-h-14 flex-row items-center gap-3 rounded-control border border-border-subtle bg-surface-card px-3 py-2.5"
                onPress={() => onSelect(food)}
              >
                <FoodThumbnail
                  alt={food.name}
                  src={foodMediaThumbnailUrl(food.media)}
                  fallbackEmoji={foodCategoryEmoji(food.category)}
                  size="sm"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-text-strong" numberOfLines={2}>
                    {food.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                    {[food.brand, `${Math.round(food.calories)} kcal / ${food.servingSize}${food.servingUnit}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Upsell suave (gate Pro)
// ---------------------------------------------------------------------------

function UpsellSheet({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  const router = useRouter()
  const { theme } = useTheme()
  return (
    <Modal visible={reason !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="rounded-t-sheet border-t border-border-subtle bg-surface-app px-5 pb-8 pt-5" onPress={() => {}}>
          <View className="mb-3 h-1.5 w-12 self-center rounded-pill bg-border-default" />
          <View className="mb-2 flex-row items-center gap-2">
            <Lock color={theme.primary} size={18} />
            <Text className="font-display text-lg font-bold text-text-strong">Nutrición Pro</Text>
          </View>
          <Text className="text-sm leading-5 text-text-body">
            {reason ?? 'Esta función requiere el complemento Nutrición Pro.'}
          </Text>
          <View className="mt-5 flex-row gap-3">
            <NutritionMotionButton accessibilityLabel="Cerrar" tone="neutral" onPress={onClose}>
              Ahora no
            </NutritionMotionButton>
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Ver módulos"
                onPress={() => {
                  onClose()
                  router.push('/coach/modules')
                }}
              >
                Ver módulos
              </NutritionMotionButton>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
