import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  CalendarDays,
  History,
  Info,
  Lock,
  MoreVertical,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native'
import {
  NUTRITION_WEEK_ORDER,
  formatNutritionDayOfWeek,
  type FoodCatalogItem,
  type NutritionItemSubstitution,
  type NutritionPlanReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { NutritionHeader, NutritionMotionButton, NutritionStatePanel, StrategyBadge } from '../NutritionV2Kit'
import { Sheet } from '../../Sheet'
import { useTheme } from '../../../context/ThemeContext'
import { supabase } from '../../../lib/supabase'
import {
  mapFoodCatalogItemToBuilderFood,
  strategyUsesSlots,
  type BuilderFood,
  type NutritionV2WriteClient,
} from '../../../lib/nutrition-v2-builder'
import {
  buildQuickEditBaseline,
  buildQuickEditIdempotencyKey,
  collectQuickEditFoodIds,
  countQuickEditChanges,
  loadQuickEditFoods,
  loadQuickEditSubstitutions,
  planDayVariantAdditions,
  planModelToQuickEditState,
  quickEditReducer,
  quickEditUsesSlots,
  sortQuickEditVariantsForDisplay,
  takenDayVariantDows,
  validateQuickEditState,
  VARIANT_LABEL_MAX,
  type QuickEditState,
  type QuickEditVariant,
} from '../../../lib/nutrition-v2-quick-edit'
import {
  countPortionsChanges,
  hydrateQuickEditPortions,
  portionsReducer,
  type QuickEditPortionGroup,
  type QuickEditPortionsState,
  type QuickEditPortionTarget,
} from './portions-state'
import type { QuickEditGroupAdmin } from './EditablePortionsSection'
import { fetchCoachExchangeGroups } from '../../../lib/nutrition-exchanges.coach'
import { toQuickEditPortionGroup } from '../../../lib/nutrition-v2-builder-portions'
import { publishQuickEditRN } from '../../../lib/nutrition-v2.api'
import {
  clearNutritionDraft,
  quickEditDraftKey,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} from '../../../lib/nutrition-coach-draft-store'
import { EditableSlotCard } from './EditableSlotCard'
import { TargetsEditorCard } from './TargetsEditorCard'
import { FoodSearchSheet, type FoodSearchMode } from './FoodSearchSheet'
import { PublishBar, UndoSnackbar } from './PublishBar'
import { ProUpsellSheet, PublishConfirmSheet, StaleBaseSheet } from './QuickEditSheets'
import { QUICK_EDIT_COPY, addDayCta, discardConfirmBody, removeDayConfirmBody } from './microcopy'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'

let keySeq = 0
function genKey(prefix: string): string {
  keySeq += 1
  return prefix + '-' + Date.now().toString(36) + '-' + keySeq
}

const UNDO_TIMEOUT_MS = 5000

interface SearchTarget {
  mode: FoodSearchMode
  variantKey: string
  slotKey: string
  itemKey: string | null
}

interface UndoEntry {
  message: string
  /** Undo LOCAL del draft (despacha al reducer que corresponda; nunca toca backend). */
  restore: () => void
}

/**
 * Payload del respaldo local del quick-edit (AsyncStorage): identifica plan + version base y
 * persiste los DOS reducers de RN (el arbol principal `state` Y las porciones `portions`, que en
 * RN viven en un reducer SEPARADO — web las pliega dentro de `state`). Persistir solo `state`
 * perderia en silencio los cambios de porciones (regresion respecto a web).
 */
interface QuickEditDraftPayload {
  clientId: string
  planId: string
  baseVersionId: string
  state: QuickEditState
  portions: QuickEditPortionsState
}

/**
 * Modo edicion in-place del plan vigente — espejo RN del quick-edit web (qe-design
 * §1.3): editar = tocar el plan donde se ve; draft local (dirty) + UN boton "Publicar
 * cambios". El draft y su baseline viven en dos reducers locales (sobreviven re-renders) y
 * ademas se respaldan en AsyncStorage (autosave debounced) para ofrecer "Restaurar" tras
 * matar la app (F2). Publicar exige red; en fallo el draft NO se pierde y el reintento reusa
 * la MISMA idempotency key.
 */
export function QuickEditMode({
  clientId,
  clientName,
  planModel,
  scope,
  todayIso,
  hasNutritionPro = false,
  onExit,
  onPublished,
  onStaleReload,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  /** Workspace coach activo: viaja al endpoint de mutaciones (gate de rollout + scope). */
  scope: NutritionV2CoachScope
  todayIso: string
  /**
   * Entitlement Nutricion Pro del coach. Gobierna SOLO la afordancia de los dias
   * especificos (candado + upsell en vez del selector). El gate real es server-side
   * (`multi_variant` -> UPGRADE_REQUIRED en el endpoint de mutaciones). Default fail-closed.
   */
  hasNutritionPro?: boolean
  onExit: () => void
  onPublished: () => void
  onStaleReload: () => void
}) {
  const { theme } = useTheme()
  const router = useRouter()
  // Baseline CONGELADO al montar: se hidrata UNA vez al entrar al modo edicion (el
  // componente se monta al entrar y se desmonta al salir; una re-entrada re-hidrata
  // fresco). Si la ficha recibe un read model mas nuevo mientras se edita (carrera
  // cache→fresh), el diff NO se corrompe y el guard optimista del publish detecta la
  // base obsoleta (STALE_BASE) — la salida segura es Recargar.
  const [frozen] = useState(() => {
    const initial = planModelToQuickEditState(planModel, genKey)
    return {
      baseline: buildQuickEditBaseline(planModel),
      initial,
      // Capa de porciones (T1.4): estado paralelo por slot.key + dict de grupos del
      // plan (snapshots congelados del read model; catalogo vivo jamas).
      portions: hydrateQuickEditPortions(planModel, initial),
    }
  })
  const baseline = frozen.baseline
  const initialState = frozen.initial
  const [state, dispatch] = useReducer(quickEditReducer, initialState)
  const [portionsState, dispatchPortions] = useReducer(portionsReducer, frozen.portions.initial)

  // Porciones propias (FD6a): la lista del picker es el dict CONGELADO del plan. Crear un grupo
  // agrega una entrada; editarlo reemplaza la suya en el sitio; eliminarlo lo saca de la lista
  // (los targets ya publicados conservan su snapshot congelado — el grupo borrado no los mueve).
  const [groupOverrides, setGroupOverrides] = useState<QuickEditPortionGroup[]>([])
  const [removedGroupIds, setRemovedGroupIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  // Ids de grupos PROPIOS del coach: el dict congelado no distingue system de propios, así que se
  // resuelven con UNA lectura perezosa del catálogo (RLS coach-scoped) al abrir el picker. Si falla,
  // simplemente no aparece la afordancia de editar (crear sigue funcionando).
  const [ownGroupIds, setOwnGroupIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  const ownGroupsRequestedRef = useRef(false)

  const portionGroups = useMemo(() => {
    const overrides = new Map(groupOverrides.map((group) => [group.exchangeGroupId, group]))
    const merged = frozen.portions.groups.map((group) => overrides.get(group.exchangeGroupId) ?? group)
    const known = new Set(merged.map((group) => group.exchangeGroupId))
    for (const group of groupOverrides) {
      if (!known.has(group.exchangeGroupId)) merged.push(group)
    }
    return merged.filter((group) => !removedGroupIds.has(group.exchangeGroupId))
  }, [frozen.portions.groups, groupOverrides, removedGroupIds])

  const [foodsById, setFoodsById] = useState<ReadonlyMap<string, BuilderFood>>(new Map())
  // Reemplazos autorizados (F-02) de la version base, por prescriptionItemId. Carry-over PURO:
  // el read-model no los trae; se fetchean al entrar y se re-inyectan al publicar para que
  // republicar NO los pierda (misma clase del bug private_notes). No son editables en F1.
  // TODO(F-02 P3): editor coach RN — afordancia por item para agregar/quitar reemplazos (reusar
  // FoodSearchSheet, max 8, solo structured/hybrid). Hoy solo se preservan y se muestran al alumno.
  const [carryOverSubs, setCarryOverSubs] = useState<ReadonlyMap<string, NutritionItemSubstitution[]>>(new Map())
  // NUT-008: estado HONESTO del carry-over. 'loading' = el fetch sigue en vuelo (publicar
  // ahora borraria los reemplazos por carrera); 'error' = no se pudo leer (mismo dano). Solo
  // 'loaded' habilita publicar. Antes el mapa arrancaba vacio y nada distinguia los tres casos.
  const [subsStatus, setSubsStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [subsReloadNonce, setSubsReloadNonce] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stale, setStale] = useState(false)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [undo, setUndo] = useState<UndoEntry | null>(null)
  // FD5 (multi-dia): sheets del alta de dias y del menu por dia (renombrar / cambiar dia).
  const [addDayOpen, setAddDayOpen] = useState(false)
  const [addDays, setAddDays] = useState<number[]>([])
  const [addSource, setAddSource] = useState<'clone' | 'empty'>('clone')
  const [dayMenuKey, setDayMenuKey] = useState<string | null>(null)
  const [changeDayKey, setChangeDayKey] = useState<string | null>(null)
  const [renameKey, setRenameKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // Respaldo local (F2) de una sesion anterior recuperado de AsyncStorage; alimenta el banner
  // "Restaurar". Guarda el payload completo (state + portions) hasta que el coach decida.
  const [pendingRestore, setPendingRestore] = useState<QuickEditDraftPayload | null>(null)

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard para no escribir el respaldo local en la hidratacion inicial (evita un borrador vacio).
  const isFirstRenderRef = useRef(true)
  // Key del respaldo local: una sesion de quick-edit por alumno; el clientId va SIEMPRE en la
  // key (gotcha PR #148) para no cruzar borradores entre alumnos.
  const draftKey = quickEditDraftKey(clientId)
  // Idempotency key por INTENCION de publicar: fresca al abrir el confirm, reutilizada
  // en todos los reintentos de esa intencion (qe-design §2.5).
  const intentKeyRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  // Hidrata los foods referenciados para recomputo de macros en vivo (best-effort).
  useEffect(() => {
    let active = true
    const ids = collectQuickEditFoodIds(initialState)
    if (ids.length === 0) return
    void loadQuickEditFoods(supabase as unknown as NutritionV2WriteClient, ids).then((map) => {
      if (active && mountedRef.current) setFoodsById(map)
    })
    return () => {
      active = false
    }
  }, [initialState])

  // Carry-over de reemplazos autorizados (F-02): fetch de la version base congelada. El
  // estado del fetch gobierna el publish (ver `doPublish`): mientras no este 'loaded' no se
  // puede publicar, porque el publish reescribe el arbol completo y borraria lo no leido.
  useEffect(() => {
    if (!baseline) return
    let active = true
    setSubsStatus('loading')
    void loadQuickEditSubstitutions(
      supabase as unknown as NutritionV2WriteClient,
      baseline.baseVersionId,
    ).then((res) => {
      if (!active || !mountedRef.current) return
      setCarryOverSubs(res.byItem)
      setSubsStatus(res.status)
    })
    return () => {
      active = false
    }
  }, [baseline, subsReloadNonce])

  // Reintento explicito del fetch de reemplazos (boton del banner de error).
  const retrySubstitutions = useCallback(() => {
    setPublishError(null)
    setSubsReloadNonce((nonce) => nonce + 1)
  }, [])

  // Franjas VIVAS del estado principal: las porciones de franjas eliminadas no cuentan
  // ni publican (la baja de la franja ya cuenta 1 y arrastra sus targets).
  const liveSlotKeys = useMemo(
    () => new Set(state.variants.flatMap((variant) => variant.slots.map((slot) => slot.key))),
    [state],
  )
  const count = useMemo(
    () =>
      countQuickEditChanges(initialState, state) +
      countPortionsChanges(frozen.portions.initial, portionsState, liveSlotKeys),
    [initialState, state, frozen.portions.initial, portionsState, liveSlotKeys],
  )
  const validation = useMemo(() => validateQuickEditState(state), [state])
  const errors = showErrors ? validation.errors : {}

  // Al montar el modo edicion: barre borradores vencidos (TTL 7d, ambos prefijos) y evalua si hay
  // un respaldo local restaurable para ESTE plan y version base. Si el borrador es de otra version
  // (alguien publico entremedio via otra sesion / web / builder) se descarta: restaurar contra una
  // base obsoleta seria peor que nada — mismo espiritu que el guard STALE_BASE del publish.
  // AsyncStorage es async: `mountedRef`/`active` evitan tocar estado tras el desmonte (sin flash).
  useEffect(() => {
    if (!baseline) return
    let active = true
    const now = Date.now()
    void (async () => {
      await sweepStaleNutritionDrafts(now)
      const record = await readNutritionDraft<QuickEditDraftPayload>(draftKey, now)
      if (!active || !mountedRef.current) return
      if (!record) return
      const { payload } = record
      if (
        payload.planId === baseline.planId &&
        payload.baseVersionId === baseline.baseVersionId &&
        Array.isArray(payload.state?.variants)
      ) {
        setPendingRestore(payload)
      } else {
        void clearNutritionDraft(draftKey)
      }
    })()
    return () => {
      active = false
    }
  }, [baseline, draftKey])

  // Autosave debounced del arbol editable + porciones: escribe el respaldo local solo si hay
  // cambios reales; si el coach vuelve al baseline (0 cambios) borra el borrador (ya no aporta).
  // El guard de primer render evita crear un borrador vacio al hidratar. 1500 ms como en web.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (!baseline) return
    const timer = setTimeout(() => {
      if (count > 0) {
        void writeNutritionDraft<QuickEditDraftPayload>(
          draftKey,
          {
            clientId,
            planId: baseline.planId,
            baseVersionId: baseline.baseVersionId,
            state,
            portions: portionsState,
          },
          Date.now(),
        )
      } else {
        void clearNutritionDraft(draftKey)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [state, portionsState, count, baseline, draftKey, clientId])

  // Aplica el respaldo local rehidratando los DOS reducers (arbol principal + porciones) y baja el
  // banner. Persistir/restaurar solo `state` perderia los cambios de porciones (regresion vs web).
  const restoreDraft = useCallback(() => {
    if (!pendingRestore) return
    dispatch({ type: 'RESTORE_DRAFT', state: pendingRestore.state })
    dispatchPortions({ type: 'RESTORE_PORTIONS', state: pendingRestore.portions })
    setPendingRestore(null)
  }, [pendingRestore])

  // Descarta el respaldo local ofrecido y baja el banner sin tocar el estado actual.
  const dismissRestore = useCallback(() => {
    void clearNutritionDraft(draftKey)
    setPendingRestore(null)
  }, [draftKey])

  // Al salir, el respaldo local solo se borra si el coach descarto ediciones PROPIAS (count > 0) o
  // si no queda un respaldo anterior sin restaurar: salir limpio con el banner "Restaurar" todavia
  // pendiente NO debe destruir ese respaldo en silencio (mismo guard que web). Best-effort sin await.
  const doExit = useCallback(() => {
    if (count > 0 || pendingRestore === null) void clearNutritionDraft(draftKey)
    onExit()
  }, [count, pendingRestore, draftKey, onExit])

  const requestExit = useCallback(() => {
    if (count > 0) {
      Alert.alert(QUICK_EDIT_COPY.leaveGuardTitle, QUICK_EDIT_COPY.leaveGuard, [
        { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: doExit },
      ])
      return
    }
    doExit()
  }, [count, doExit])

  // Guard de salida por back de hardware (Android) — espejo del beforeunload web.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit()
      return true
    })
    return () => sub.remove()
  }, [requestExit])

  const pushUndo = useCallback((entry: UndoEntry) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndo(entry)
    undoTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setUndo(null)
    }, UNDO_TIMEOUT_MS)
  }, [])

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    if (undo) undo.restore()
    setUndo(null)
  }, [undo])

  const handleRemoveItem = useCallback(
    (variantKey: string, slotKey: string, itemKey: string) => {
      const variant = state.variants.find((v) => v.key === variantKey)
      const slot = variant?.slots.find((s) => s.key === slotKey)
      const index = slot?.items.findIndex((i) => i.key === itemKey) ?? -1
      const item = index >= 0 ? slot?.items[index] : undefined
      if (!slot || !item) return
      dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey })
      pushUndo({
        message: QUICK_EDIT_COPY.deletedUndo,
        restore: () => dispatch({ type: 'RESTORE_ITEM', variantKey, slotKey, index, item }),
      })
    },
    [state, pushUndo],
  )

  // Baja de un target de porciones con Deshacer (mismo snackbar de 5 s de los items).
  const handleRemovePortion = useCallback(
    (slotKey: string, target: QuickEditPortionTarget, index: number) => {
      dispatchPortions({ type: 'REMOVE_TARGET', slotKey, targetKey: target.key })
      pushUndo({
        message: PORTIONS_COPY.builder.groupRemoved(target.groupName),
        restore: () => dispatchPortions({ type: 'RESTORE_TARGET', slotKey, index, target }),
      })
    },
    [pushUndo],
  )

  const handleAddPortion = useCallback((slotKey: string, group: QuickEditPortionGroup) => {
    dispatchPortions({ type: 'ADD_TARGET', slotKey, key: genKey('ptarget'), group })
  }, [])

  // Porciones propias (FD6a): administración de grupos desde el picker del quick-edit. La
  // ESCRITURA vive en `ExchangeGroupFormSheet` (endpoint mobile, nunca Supabase directo); acá solo
  // se refleja el resultado en la lista y —al eliminar— se quitan los targets que quedarían
  // apuntando a un grupo borrado (publicar así rompería el freeze con EXCHANGE_GROUP_NOT_FOUND).
  const portionGroupAdmin: QuickEditGroupAdmin = useMemo(
    () => ({
      ownGroupIds,
      ensureLoaded: () => {
        if (ownGroupsRequestedRef.current) return
        ownGroupsRequestedRef.current = true
        void fetchCoachExchangeGroups()
          .then((groups) => {
            if (!mountedRef.current) return
            setOwnGroupIds(new Set(groups.filter((group) => !group.isSystem).map((group) => group.id)))
          })
          .catch(() => {
            // Best-effort: sin catálogo no hay afordancia de editar, pero crear sigue disponible.
          })
      },
      onSaved: (group) => {
        setGroupOverrides((prev) => [
          ...prev.filter((g) => g.exchangeGroupId !== group.id),
          toQuickEditPortionGroup(group),
        ])
        setRemovedGroupIds((prev) => {
          if (!prev.has(group.id)) return prev
          const next = new Set(prev)
          next.delete(group.id)
          return next
        })
        setOwnGroupIds((prev) => (prev.has(group.id) ? prev : new Set(prev).add(group.id)))
      },
      onDeleted: (groupId) => {
        setRemovedGroupIds((prev) => new Set(prev).add(groupId))
        setGroupOverrides((prev) => prev.filter((g) => g.exchangeGroupId !== groupId))
        for (const [slotKey, slotTargets] of Object.entries(portionsState.bySlot)) {
          for (const target of slotTargets) {
            if (target.exchangeGroupId === groupId) {
              dispatchPortions({ type: 'REMOVE_TARGET', slotKey, targetKey: target.key })
            }
          }
        }
      },
    }),
    [ownGroupIds, portionsState.bySlot],
  )

  const handleRemoveSlot = useCallback(
    (variantKey: string, slotKey: string) => {
      const variant = state.variants.find((v) => v.key === variantKey)
      if (!variant) return
      if (strategyUsesSlots(baseline?.strategy ?? null) && variant.slots.length <= 1) {
        Alert.alert(QUICK_EDIT_COPY.addSlot, QUICK_EDIT_COPY.lastSlotBlocked)
        return
      }
      const index = variant.slots.findIndex((s) => s.key === slotKey)
      const slot = index >= 0 ? variant.slots[index] : undefined
      if (!slot) return
      Alert.alert(
        '¿Eliminar la franja?',
        slot.name.trim() ? `Se quitará "${slot.name.trim()}" con sus alimentos.` : 'Se quitará la franja con sus alimentos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => {
              dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey })
              // Las porciones de la franja quedan intactas en su estado paralelo
              // (keyed por slot.key): el RESTORE_SLOT las recupera solo.
              pushUndo({
                message: QUICK_EDIT_COPY.slotDeletedUndo,
                restore: () => dispatch({ type: 'RESTORE_SLOT', variantKey, index, slot }),
              })
            },
          },
        ],
      )
    },
    [state, baseline, pushUndo],
  )

  // ── Multi-dia (FD5) ────────────────────────────────────────────────────────────────
  // Dias ya reclamados por una variante especifica (el picker los deshabilita).
  const takenDays = useMemo(() => takenDayVariantDows(state), [state])
  // Orden de lectura: dia base primero, despues los especificos Lu→Do (espejo web).
  const orderedVariants = useMemo(() => sortQuickEditVariantsForDisplay(state.variants), [state.variants])
  const showVariantHeader = state.variants.length > 1

  function openAddDay() {
    setAddDays([])
    setAddSource('clone')
    setAddDayOpen(true)
  }

  /**
   * Alta de uno o varios dias. Ademas del arbol principal hay que clonar la capa de
   * PORCIONES, que en RN vive en un reducer aparte keyed por `slot.key`: sin esto el dia
   * clonado perderia sus grupos a eleccion. El mapeo `from -> to` sale de la MISMA funcion
   * pura que usa el reducer, asi que pantalla y estado no pueden divergir.
   */
  const handleAddDays = useCallback(() => {
    if (addDays.length === 0) return
    const plan = planDayVariantAdditions(state, addDays, addSource)
    if (plan.variants.length === 0) {
      setAddDayOpen(false)
      return
    }
    dispatch({ type: 'ADD_VARIANT', days: addDays, source: addSource })
    if (plan.slotKeyClones.length > 0) {
      const bySlot = { ...portionsState.bySlot }
      let cloned = false
      for (const { from, to } of plan.slotKeyClones) {
        const targets = portionsState.bySlot[from] ?? []
        if (targets.length === 0) continue
        // Keys de UI propias (prefijadas por la franja nueva); el `id` de la version base se
        // conserva igual que en los items: la persistencia lo ignora e inserta filas nuevas.
        bySlot[to] = targets.map((target) => ({ ...target, key: to + ':' + target.key }))
        cloned = true
      }
      if (cloned) dispatchPortions({ type: 'RESTORE_PORTIONS', state: { bySlot } })
    }
    setAddDayOpen(false)
  }, [addDays, addSource, state, portionsState])

  const handleRemoveDay = useCallback(
    (variant: QuickEditVariant) => {
      const index = state.variants.findIndex((candidate) => candidate.key === variant.key)
      if (index < 0 || variant.default) return
      const removed = state.variants[index]
      setDayMenuKey(null)
      Alert.alert(QUICK_EDIT_COPY.removeDayTitle, removeDayConfirmBody(variant.label.trim() || 'este día'), [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'REMOVE_VARIANT', variantKey: variant.key })
            // Las porciones de sus franjas quedan intactas en el estado paralelo (keyed por
            // slot.key): el RESTORE_VARIANT las recupera solo, igual que con las franjas.
            pushUndo({
              message: QUICK_EDIT_COPY.dayRemovedUndo,
              restore: () => dispatch({ type: 'RESTORE_VARIANT', index, variant: removed }),
            })
          },
        },
      ])
    },
    [state, pushUndo],
  )

  const handleSelectFood = useCallback(
    (food: FoodCatalogItem) => {
      if (!searchTarget) return
      const builderFood = mapFoodCatalogItemToBuilderFood(food)
      if (searchTarget.mode === 'swap' && searchTarget.itemKey) {
        dispatch({
          type: 'SWAP_ITEM',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
          food: builderFood,
        })
      } else {
        dispatch({
          type: 'ADD_ITEM',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          key: genKey('item'),
          food: builderFood,
        })
      }
      setSearchTarget(null)
    },
    [searchTarget],
  )

  const handleFreeItem = useCallback(() => {
    if (!searchTarget || searchTarget.mode !== 'add') return
    dispatch({
      type: 'ADD_ITEM',
      variantKey: searchTarget.variantKey,
      slotKey: searchTarget.slotKey,
      key: genKey('item'),
      food: null,
    })
    setSearchTarget(null)
  }, [searchTarget])

  const doPublish = useCallback(async () => {
    if (!baseline || !intentKeyRef.current) return
    // NUT-008 (fail-closed): sin los reemplazos autorizados de la version base, publicar los
    // BORRA (el publish reescribe el arbol completo y solo escribe lo que trae el draft).
    // Cubre las dos vias: fetch en vuelo (carrera) y fetch fallido.
    if (subsStatus !== 'loaded') {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(
        subsStatus === 'loading'
          ? QUICK_EDIT_COPY.substitutionsLoading
          : QUICK_EDIT_COPY.substitutionsFailed,
      )
      return
    }
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(QUICK_EDIT_COPY.offline)
      return
    }
    setPublishing(true)
    setPublishError(null)
    // Publish canonico de la lib CON capa de porciones (targets con snapshot congelado
    // por el MISMO pipeline: tablas versionadas + publish_nutrition_plan_v2).
    // NUT-005: la publicacion pasa por la API movil (rollout + delta-gate Pro + CAS server-side).
    const res = await publishQuickEditRN({
      scope,
      clientId,
      baseline,
      state,
      portions: { state: portionsState },
      carryOverSubstitutions: carryOverSubs,
      idempotencyKey: intentKeyRef.current,
      todayIso,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    setConfirmOpen(false)
    if (res.ok) {
      intentKeyRef.current = null
      // Publicado: el respaldo local ya no aporta (best-effort, sin bloquear la salida).
      void clearNutritionDraft(draftKey)
      onPublished()
      return
    }
    if (res.code === 'STALE_BASE' || res.code === 'EFFECTIVE_DATE') {
      // Con la migracion same-day, EFFECTIVE_DATE residual = carrera contra otra sesion
      // (fecha < vigente) → mismo tratamiento que STALE_BASE: recargar (qe-design §1.2.D).
      setStale(true)
      return
    }
    if (res.code === 'UPGRADE_REQUIRED') {
      setUpsell(res.message)
      return
    }
    setPublishError(res.message)
  }, [baseline, scope, clientId, state, portionsState, carryOverSubs, subsStatus, todayIso, onPublished, draftKey])

  const handlePublishRequest = useCallback(() => {
    if (count === 0 || publishing) return
    // Guard NUT-008 antes de abrir el confirm: no se ofrece publicar si el carry-over de
    // reemplazos no esta resuelto (misma razon que en doPublish).
    if (subsStatus !== 'loaded') {
      setPublishError(
        subsStatus === 'loading'
          ? QUICK_EDIT_COPY.substitutionsLoading
          : QUICK_EDIT_COPY.substitutionsFailed,
      )
      return
    }
    if (!validation.ok) {
      setShowErrors(true)
      setPublishError('Revisa los campos marcados antes de publicar.')
      return
    }
    setShowErrors(false)
    setPublishError(null)
    // Key FRESCA por intencion (abrir el confirm); los reintentos de esta intencion la reusan.
    intentKeyRef.current = buildQuickEditIdempotencyKey({ clientId, operationId: genKey('qe') })
    setConfirmOpen(true)
  }, [count, publishing, validation.ok, clientId, subsStatus])

  const handleRetry = useCallback(() => {
    // Con el carry-over sin resolver, "Reintentar" reintenta la LECTURA de reemplazos (es
    // lo que bloquea), no el publish: republicar sin ellos los borraria (NUT-008).
    if (subsStatus !== 'loaded') {
      retrySubstitutions()
      return
    }
    if (!intentKeyRef.current) {
      handlePublishRequest()
      return
    }
    void doPublish()
  }, [doPublish, handlePublishRequest, subsStatus, retrySubstitutions])

  const handleDiscard = useCallback(() => {
    if (count === 0) {
      doExit()
      return
    }
    Alert.alert(QUICK_EDIT_COPY.discardTitle, discardConfirmBody(count), [
      { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
      { text: QUICK_EDIT_COPY.discard, style: 'destructive', onPress: doExit },
    ])
  }, [count, doExit])

  if (!baseline) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          title="Sin plan vigente"
          description="No hay un plan publicado para editar."
        />
      </View>
    )
  }

  const usesSlots = quickEditUsesSlots(baseline, state)
  const futureDate = baseline.effectiveFrom > todayIso ? baseline.effectiveFrom : null
  const dayMenuVariant = state.variants.find((variant) => variant.key === dayMenuKey) ?? null
  const changeDayVariant = state.variants.find((variant) => variant.key === changeDayKey) ?? null

  return (
    <View className="flex-1 bg-surface-app">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pb-8 pt-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Salir del modo edición"
              onPress={requestExit}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center rounded-control border border-border-subtle bg-surface-card"
            >
              <ArrowLeft color={theme.textSecondary} size={20} />
            </Pressable>
            <View className="min-w-0 flex-1">
              <NutritionHeader
                eyebrow={QUICK_EDIT_COPY.editingEyebrow}
                title={clientName}
                description={QUICK_EDIT_COPY.editingHint}
              />
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-2">
            <StrategyBadge strategy={baseline.strategy} />
            <Text className="text-sm font-semibold text-text-strong" numberOfLines={1}>
              {baseline.name}
            </Text>
          </View>

          {!usesSlots ? (
            <View className="flex-row items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3">
              <Info color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-text-body">
                {QUICK_EDIT_COPY.flexibleHint}
              </Text>
            </View>
          ) : null}

          {/* Respaldo local (F2): hay un borrador de una sesion anterior (mismo plan/version) sin
              publicar. Espejo del banner web QuickEditPlanView.tsx:73-98 — tokens EVA DS (primary),
              icono History, Restaurar (rehidrata ambos reducers) + X (descarta el borrador). */}
          {pendingRestore ? (
            <View className="flex-row items-center gap-3 rounded-card border border-primary/25 bg-primary/10 p-3">
              <History color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-xs font-semibold leading-5 text-primary">
                {QUICK_EDIT_COPY.restoreBanner}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={QUICK_EDIT_COPY.restoreCta}
                onPress={restoreDraft}
                className="h-8 items-center justify-center rounded-control bg-primary px-3"
              >
                <Text className="text-xs font-bold text-white">{QUICK_EDIT_COPY.restoreCta}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={QUICK_EDIT_COPY.restoreDismiss}
                onPress={dismissRestore}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-control"
              >
                <X color={theme.primary} size={16} />
              </Pressable>
            </View>
          ) : null}

          {orderedVariants.map((variant) => (
            <View key={variant.key} className="gap-3">
              {/* FD5: encabezado del día + menú (Cambiar día / Renombrar / Eliminar). El día
                  base no cambia de día ni se elimina; solo se puede renombrar. */}
              {showVariantHeader ? (
                <View className="flex-row items-start gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      {variant.default ? QUICK_EDIT_COPY.baseDayEyebrow : QUICK_EDIT_COPY.specificDayEyebrow}
                    </Text>
                    <Text className="font-display text-base font-semibold text-text-strong" numberOfLines={1}>
                      {variant.label}
                    </Text>
                    {variant.default ? (
                      <Text className="mt-0.5 text-xs leading-5 text-text-muted">
                        {QUICK_EDIT_COPY.baseDayHint}
                      </Text>
                    ) : null}
                    {errors['variant.' + variant.key + '.label'] ? (
                      <Text className="mt-1 text-xs font-medium text-danger-600">
                        {errors['variant.' + variant.key + '.label']}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={QUICK_EDIT_COPY.dayMenuTitle + ' ' + variant.label}
                    disabled={publishing}
                    onPress={() => setDayMenuKey(variant.key)}
                    hitSlop={8}
                    className="h-11 w-11 items-center justify-center rounded-control border border-border-subtle bg-surface-card"
                  >
                    <MoreVertical color={theme.textSecondary} size={18} />
                  </Pressable>
                </View>
              ) : null}
              <TargetsEditorCard
                variant={variant}
                showVariantLabel={false}
                errors={errors}
                disabled={publishing}
                onTargetChange={(field, value) =>
                  dispatch({ type: 'SET_TARGET', variantKey: variant.key, field, value })
                }
              />

              {usesSlots
                ? variant.slots.map((slot, slotIndex) => (
                    <EditableSlotCard
                      key={slot.key}
                      slot={slot}
                      index={slotIndex}
                      foodsById={foodsById}
                      errors={errors}
                      disabled={publishing}
                      portionTargets={portionsState.bySlot[slot.key] ?? []}
                      portionGroups={portionGroups}
                      portionGroupAdmin={portionGroupAdmin}
                      onPortionStep={(targetKey, direction) =>
                        dispatchPortions({ type: 'STEP_PORTIONS', slotKey: slot.key, targetKey, direction })
                      }
                      onPortionNotes={(targetKey, value) =>
                        dispatchPortions({ type: 'SET_NOTES', slotKey: slot.key, targetKey, value })
                      }
                      onPortionRemove={(target, targetIndex) =>
                        handleRemovePortion(slot.key, target, targetIndex)
                      }
                      onPortionAdd={(group) => handleAddPortion(slot.key, group)}
                      onSlotPatch={(patch) =>
                        dispatch({ type: 'UPDATE_SLOT', variantKey: variant.key, slotKey: slot.key, patch })
                      }
                      onRemoveSlot={() => handleRemoveSlot(variant.key, slot.key)}
                      onSearchFood={() =>
                        setSearchTarget({ mode: 'add', variantKey: variant.key, slotKey: slot.key, itemKey: null })
                      }
                      onAddFreeItem={() =>
                        dispatch({
                          type: 'ADD_ITEM',
                          variantKey: variant.key,
                          slotKey: slot.key,
                          key: genKey('item'),
                          food: null,
                        })
                      }
                      onItemQuantity={(itemKey, value) =>
                        dispatch({ type: 'SET_ITEM_QUANTITY', variantKey: variant.key, slotKey: slot.key, itemKey, value })
                      }
                      onItemUnit={(itemKey, unit) =>
                        dispatch({ type: 'SET_ITEM_UNIT', variantKey: variant.key, slotKey: slot.key, itemKey, unit })
                      }
                      onItemName={(itemKey, value) =>
                        dispatch({ type: 'SET_ITEM_NAME', variantKey: variant.key, slotKey: slot.key, itemKey, value })
                      }
                      onSwapItem={(itemKey) =>
                        setSearchTarget({ mode: 'swap', variantKey: variant.key, slotKey: slot.key, itemKey })
                      }
                      onRemoveItem={(itemKey) => handleRemoveItem(variant.key, slot.key, itemKey)}
                    />
                  ))
                : null}

              {usesSlots && strategyUsesSlots(baseline.strategy) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={QUICK_EDIT_COPY.addSlot}
                  disabled={publishing}
                  onPress={() => dispatch({ type: 'ADD_SLOT', variantKey: variant.key, key: genKey('slot') })}
                  className="min-h-12 flex-row items-center justify-center gap-1.5 rounded-card border border-dashed border-border-default bg-surface-card px-3"
                >
                  <Text className="text-sm font-semibold text-text-muted">+ {QUICK_EDIT_COPY.addSlot}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}

          {/* FD5: "+ Agregar día" al final de la lista de días. Sin Nutrición Pro el CTA lleva
              candado y el sheet muestra el upsell (el server rechaza igual: multi_variant). */}
          {takenDays.length < NUTRITION_WEEK_ORDER.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.addDay}
              disabled={publishing}
              onPress={openAddDay}
              className="min-h-12 flex-row items-center justify-center gap-1.5 rounded-card border border-dashed border-border-default bg-surface-card px-3"
            >
              {hasNutritionPro ? (
                <Plus color={theme.textSecondary} size={16} />
              ) : (
                <Lock color={theme.primary} size={16} />
              )}
              <Text className="text-sm font-semibold text-text-muted">{QUICK_EDIT_COPY.addDay}</Text>
            </Pressable>
          ) : null}

          {/* Notas visibles EDITABLES (visible_notes, espejo web QuickEditPlanView); permisos
              siguen read-only con hint. protocolNotes read-only (carry-over del publish). */}
          <NutritionCard>
            <View className="flex-row items-center gap-2">
              <NotebookPen color={theme.textSecondary} size={16} />
              <Text className="font-display text-base font-semibold text-text-strong">
                {QUICK_EDIT_COPY.notesPermissionsTitle}
              </Text>
            </View>
            <Text className="mt-3 text-xs font-semibold text-text-muted">
              {QUICK_EDIT_COPY.notesLabel}
            </Text>
            <TextInput
              accessibilityLabel={QUICK_EDIT_COPY.notesLabel}
              value={state.visibleNotes}
              onChangeText={(value) => dispatch({ type: 'SET_VISIBLE_NOTES', value })}
              editable={!publishing}
              multiline
              maxLength={8000}
              textAlignVertical="top"
              placeholder={QUICK_EDIT_COPY.notesPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              className="mt-1.5 min-h-28 rounded-control border border-border-default bg-surface-card px-2.5 py-2 text-sm leading-6 text-text-body"
            />
            {errors['plan.visibleNotes'] ? (
              <Text className="mt-1 text-xs font-medium text-danger-600">
                {errors['plan.visibleNotes']}
              </Text>
            ) : null}
            {planModel.protocolNotes ? (
              <Text className="mt-2 text-xs leading-5 text-text-muted">{planModel.protocolNotes}</Text>
            ) : null}
            <View className="mt-3 flex-row flex-wrap gap-1.5">
              {(
                [
                  [planModel.permissions.canRegisterFreely, QUICK_EDIT_COPY.permRegisterFreely],
                  [planModel.permissions.canAdjustPrescribedQuantity, QUICK_EDIT_COPY.permAdjustQuantity],
                  [planModel.permissions.canSubstitute, QUICK_EDIT_COPY.permSubstitute],
                ] as const
              ).map(([enabled, label]) => (
                <View
                  key={label}
                  className={
                    'rounded-pill border px-2 py-0.5 ' +
                    (enabled ? 'border-primary/30 bg-primary/10' : 'border-border-subtle bg-surface-sunken')
                  }
                >
                  <Text
                    className={'text-[11px] font-semibold ' + (enabled ? 'text-primary' : 'text-text-muted')}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            <View className="mt-3 flex-row items-start gap-1.5">
              <Info color={theme.textSecondary} size={14} />
              <Text className="min-w-0 flex-1 text-xs leading-5 text-text-muted">
                {QUICK_EDIT_COPY.readonlyHint}
              </Text>
            </View>
          </NutritionCard>
        </ScrollView>

        {undo ? <UndoSnackbar message={undo.message} onUndo={handleUndo} /> : null}

        <PublishBar
          count={count}
          publishing={publishing}
          errorMessage={publishError}
          onDiscard={handleDiscard}
          onPublish={handlePublishRequest}
          onRetry={handleRetry}
        />
      </KeyboardAvoidingView>

      <FoodSearchSheet
        open={searchTarget !== null}
        mode={searchTarget?.mode ?? 'add'}
        onClose={() => setSearchTarget(null)}
        onSelect={handleSelectFood}
        onFreeItem={handleFreeItem}
      />
      <PublishConfirmSheet
        open={confirmOpen}
        publishing={publishing}
        studentName={clientName}
        futureDate={futureDate}
        onConfirm={() => void doPublish()}
        onClose={() => setConfirmOpen(false)}
      />
      <StaleBaseSheet
        open={stale}
        onReload={() => {
          setStale(false)
          onStaleReload()
        }}
      />
      <ProUpsellSheet message={upsell} onClose={() => setUpsell(null)} />

      {/* FD5 — alta de días: multi-select Lu-Do + origen del contenido. Sin Pro, upsell. */}
      <Sheet
        open={addDayOpen}
        onClose={() => setAddDayOpen(false)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.addDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.addDayTitle}
      >
        {!hasNutritionPro ? (
          <View className="gap-3">
            <View className="flex-row items-start gap-2">
              <Lock color={theme.primary} size={18} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-text-body">
                {QUICK_EDIT_COPY.multiDayLocked}
              </Text>
            </View>
            <NutritionMotionButton
              accessibilityLabel="Ver módulos"
              onPress={() => {
                setAddDayOpen(false)
                router.push('/coach/modules')
              }}
            >
              Ver módulos
            </NutritionMotionButton>
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-xs leading-5 text-text-muted">{QUICK_EDIT_COPY.addDayHint}</Text>
            <DayPickerRow
              selected={addDays}
              taken={takenDays}
              onToggle={(dayOfWeek) =>
                setAddDays((current) =>
                  current.includes(dayOfWeek)
                    ? current.filter((day) => day !== dayOfWeek)
                    : [...current, dayOfWeek],
                )
              }
            />
            <View className="gap-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {QUICK_EDIT_COPY.addDaySourceLabel}
              </Text>
              {(
                [
                  ['clone', QUICK_EDIT_COPY.addDaySourceClone],
                  ['empty', QUICK_EDIT_COPY.addDaySourceEmpty],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: addSource === value }}
                  accessibilityLabel={label}
                  onPress={() => setAddSource(value)}
                  className={
                    'min-h-12 flex-row items-center justify-center rounded-control border px-3 ' +
                    (addSource === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border-default bg-surface-card')
                  }
                >
                  <Text
                    className={
                      'text-sm font-semibold ' + (addSource === value ? 'text-primary' : 'text-text-strong')
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <NutritionMotionButton
              accessibilityLabel={addDayCta(addDays.length)}
              disabled={addDays.length === 0}
              onPress={handleAddDays}
            >
              {addDayCta(addDays.length)}
            </NutritionMotionButton>
            {addDays.length === 0 ? (
              <Text className="text-xs leading-5 text-text-muted">
                {QUICK_EDIT_COPY.addDayEmptySelection}
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>

      {/* FD5 — menú del día: cambiar día / renombrar / eliminar (el base solo se renombra). */}
      <Sheet
        open={dayMenuVariant !== null}
        onClose={() => setDayMenuKey(null)}
        nativeModal
        dynamicSizing
        title={dayMenuVariant?.label ?? QUICK_EDIT_COPY.dayMenuTitle}
        accessibilityLabel={QUICK_EDIT_COPY.dayMenuTitle}
      >
        <View className="gap-3">
          {dayMenuVariant && !dayMenuVariant.default ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.changeDay}
              onPress={() => {
                setChangeDayKey(dayMenuVariant.key)
                setDayMenuKey(null)
              }}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3"
            >
              <CalendarDays color={theme.textSecondary} size={16} />
              <Text className="text-sm font-semibold text-text-strong">{QUICK_EDIT_COPY.changeDay}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUICK_EDIT_COPY.renameDay}
            onPress={() => {
              if (!dayMenuVariant) return
              setRenameDraft(dayMenuVariant.label)
              setRenameKey(dayMenuVariant.key)
              setDayMenuKey(null)
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3"
          >
            <Pencil color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-text-strong">{QUICK_EDIT_COPY.renameDay}</Text>
          </Pressable>
          {dayMenuVariant && !dayMenuVariant.default ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.removeDay}
              onPress={() => handleRemoveDay(dayMenuVariant)}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-danger-500/40 bg-surface-card px-3"
            >
              <Trash2 color={theme.destructive} size={16} />
              <Text className="text-sm font-semibold text-danger-600">{QUICK_EDIT_COPY.removeDay}</Text>
            </Pressable>
          ) : null}
          {dayMenuVariant?.default ? (
            <View className="flex-row items-start gap-1.5">
              <Info color={theme.textSecondary} size={14} />
              <Text className="min-w-0 flex-1 text-xs leading-5 text-text-muted">
                {QUICK_EDIT_COPY.baseDayHint}
              </Text>
            </View>
          ) : null}
        </View>
      </Sheet>

      {/* FD5 — cambiar el día de una variante específica (días ocupados deshabilitados). */}
      <Sheet
        open={changeDayVariant !== null}
        onClose={() => setChangeDayKey(null)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.changeDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.changeDayTitle}
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-text-muted">{QUICK_EDIT_COPY.changeDayHint}</Text>
          <DayPickerRow
            selected={changeDayVariant?.dayOfWeek == null ? [] : [changeDayVariant.dayOfWeek]}
            taken={takenDays}
            onToggle={(dayOfWeek) => {
              if (!changeDayVariant) return
              dispatch({ type: 'SET_VARIANT_DAY', variantKey: changeDayVariant.key, dayOfWeek })
              setChangeDayKey(null)
            }}
          />
        </View>
      </Sheet>

      {/* FD5 — renombrar el día (el nombre manual gana sobre la etiqueta automática). */}
      <Sheet
        open={renameKey !== null}
        onClose={() => setRenameKey(null)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.renameDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.renameDayTitle}
      >
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {QUICK_EDIT_COPY.dayNameLabel}
          </Text>
          <TextInput
            accessibilityLabel={QUICK_EDIT_COPY.dayNameLabel}
            value={renameDraft}
            onChangeText={setRenameDraft}
            maxLength={VARIANT_LABEL_MAX}
            placeholder={QUICK_EDIT_COPY.dayNamePlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-12 rounded-control border border-border-default bg-surface-card px-3 text-base text-text-strong"
          />
          <NutritionMotionButton
            accessibilityLabel={QUICK_EDIT_COPY.renameDay}
            disabled={renameDraft.trim().length === 0}
            onPress={() => {
              if (renameKey === null || renameDraft.trim().length === 0) return
              dispatch({ type: 'SET_VARIANT_LABEL', variantKey: renameKey, value: renameDraft.trim() })
              setRenameKey(null)
            }}
          >
            {QUICK_EDIT_COPY.renameDay}
          </NutritionMotionButton>
        </View>
      </Sheet>
    </View>
  )
}

/**
 * Tira Lu-Do seleccionable (FD5), espejo del `DayPicker` web. `taken` = días que ya tienen
 * su propia variante: quedan deshabilitados salvo que sean el día actualmente seleccionado
 * (caso "Cambiar día", donde el propio día de la variante se muestra activo).
 */
function DayPickerRow({
  selected,
  taken,
  onToggle,
}: {
  selected: readonly number[]
  taken: readonly number[]
  onToggle: (dayOfWeek: number) => void
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
        const isSelected = selected.includes(dayOfWeek)
        const isTaken = taken.includes(dayOfWeek) && !isSelected
        return (
          <Pressable
            key={dayOfWeek}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isTaken }}
            accessibilityLabel={
              (formatNutritionDayOfWeek(dayOfWeek) ?? '') +
              (isTaken ? ' — ' + QUICK_EDIT_COPY.dayTaken : '')
            }
            disabled={isTaken}
            onPress={() => onToggle(dayOfWeek)}
            className={
              'h-12 min-w-12 flex-1 items-center justify-center rounded-control border px-2 ' +
              (isSelected
                ? 'border-primary bg-primary/15'
                : isTaken
                  ? 'border-border-subtle bg-surface-sunken opacity-60'
                  : 'border-border-default bg-surface-card')
            }
          >
            <Text
              className={
                'text-sm font-semibold ' +
                (isSelected ? 'text-primary' : isTaken ? 'text-text-muted' : 'text-text-strong')
              }
            >
              {formatNutritionDayOfWeek(dayOfWeek, { short: true })}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
