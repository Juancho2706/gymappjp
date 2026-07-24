import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { ArrowLeft, History, Info, LockKeyhole, X } from 'lucide-react-native'
import type { FoodCatalogItem, NutritionItemSubstitution, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { NutritionHeader, NutritionStatePanel, StrategyBadge } from '../NutritionV2Kit'
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
  planModelToQuickEditState,
  publishQuickEditRN,
  quickEditReducer,
  quickEditUsesSlots,
  validateQuickEditState,
  type QuickEditState,
} from '../../../lib/nutrition-v2-quick-edit'
import {
  countPortionsChanges,
  hydrateQuickEditPortions,
  portionsReducer,
  type QuickEditPortionGroup,
  type QuickEditPortionsState,
  type QuickEditPortionTarget,
} from './portions-state'
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
import { QUICK_EDIT_COPY, discardConfirmBody } from './microcopy'
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
  hasNutritionPro,
  userId,
  todayIso,
  onExit,
  onPublished,
  onStaleReload,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  hasNutritionPro: boolean
  userId: string
  todayIso: string
  onExit: () => void
  onPublished: () => void
  onStaleReload: () => void
}) {
  const { theme } = useTheme()
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
  const portionGroups = frozen.portions.groups

  const [foodsById, setFoodsById] = useState<ReadonlyMap<string, BuilderFood>>(new Map())
  // Reemplazos autorizados (F-02) de la version base, por prescriptionItemId. Carry-over PURO:
  // el read-model no los trae; se fetchean al entrar y se re-inyectan al publicar para que
  // republicar NO los pierda (misma clase del bug private_notes). No son editables en F1.
  // TODO(F-02 P3): editor coach RN — afordancia por item para agregar/quitar reemplazos (reusar
  // FoodSearchSheet, max 8, solo structured/hybrid). Hoy solo se preservan y se muestran al alumno.
  const [carryOverSubs, setCarryOverSubs] = useState<ReadonlyMap<string, NutritionItemSubstitution[]>>(new Map())
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stale, setStale] = useState(false)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [undo, setUndo] = useState<UndoEntry | null>(null)
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

  // Carry-over de reemplazos autorizados (F-02): fetch UNA vez de la version base congelada.
  useEffect(() => {
    if (!baseline) return
    let active = true
    void loadQuickEditSubstitutions(
      supabase as unknown as NutritionV2WriteClient,
      baseline.baseVersionId,
    ).then((map) => {
      if (active && mountedRef.current) setCarryOverSubs(map)
    })
    return () => {
      active = false
    }
  }, [baseline])

  const portionGroupsById = useMemo(
    () => new Map(portionGroups.map((group) => [group.exchangeGroupId, group])),
    [portionGroups],
  )
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
    const res = await publishQuickEditRN({
      db: supabase as unknown as NutritionV2WriteClient,
      userId,
      clientId,
      baseline,
      state,
      portions: { state: portionsState, groupsById: portionGroupsById },
      carryOverSubstitutions: carryOverSubs,
      idempotencyKey: intentKeyRef.current,
      todayIso,
      hasNutritionPro,
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
  }, [baseline, userId, clientId, state, portionsState, portionGroupsById, carryOverSubs, todayIso, hasNutritionPro, onPublished, draftKey])

  const handlePublishRequest = useCallback(() => {
    if (count === 0 || publishing) return
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
  }, [count, publishing, validation.ok, clientId])

  const handleRetry = useCallback(() => {
    if (!intentKeyRef.current) {
      handlePublishRequest()
      return
    }
    void doPublish()
  }, [doPublish, handlePublishRequest])

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
  const showVariantLabel = state.variants.length > 1
  const futureDate = baseline.effectiveFrom > todayIso ? baseline.effectiveFrom : null

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

          {state.variants.map((variant) => (
            <View key={variant.key} className="gap-3">
              <TargetsEditorCard
                variant={variant}
                showVariantLabel={showVariantLabel}
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

          {/* Fuera de alcance en modo edicion (F1): notas y permisos read-only con hint.
              Espejo de QuickEditPlanView.tsx:123-159 — visibleNotes, protocolNotes, 3 pills
              de permisos y hint, en ese orden y jerarquia. Datos ya presentes en el read-model. */}
          <NutritionCard>
            <View className="flex-row items-center gap-2">
              <LockKeyhole color={theme.textSecondary} size={16} />
              <Text className="font-display text-base font-semibold text-text-strong">
                {QUICK_EDIT_COPY.notesPermissionsTitle}
              </Text>
            </View>
            <Text className="mt-2 text-sm leading-6 text-text-body">
              {planModel.visibleNotes || QUICK_EDIT_COPY.notesEmpty}
            </Text>
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
    </View>
  )
}
