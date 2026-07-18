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
import { ArrowLeft, Info } from 'lucide-react-native'
import type { FoodCatalogItem, NutritionPlanReadModel } from '@eva/nutrition-v2'
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
  type QuickEditPortionTarget,
} from './portions-state'
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
 * Modo edicion in-place del plan vigente — espejo RN del quick-edit web (qe-design
 * §1.3): editar = tocar el plan donde se ve; draft local (dirty) + UN boton "Publicar
 * cambios". El draft y su baseline viven en un reducer local (sobrevive re-renders;
 * respaldo persistente = F2). Publicar exige red; en fallo el draft NO se pierde y el
 * reintento reusa la MISMA idempotency key.
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
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stale, setStale] = useState(false)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [undo, setUndo] = useState<UndoEntry | null>(null)

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const requestExit = useCallback(() => {
    if (count > 0) {
      Alert.alert(QUICK_EDIT_COPY.leaveGuardTitle, QUICK_EDIT_COPY.leaveGuard, [
        { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: onExit },
      ])
      return
    }
    onExit()
  }, [count, onExit])

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
      idempotencyKey: intentKeyRef.current,
      todayIso,
      hasNutritionPro,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    setConfirmOpen(false)
    if (res.ok) {
      intentKeyRef.current = null
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
  }, [baseline, userId, clientId, state, portionsState, portionGroupsById, todayIso, hasNutritionPro, onPublished])

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
      onExit()
      return
    }
    Alert.alert(QUICK_EDIT_COPY.discardTitle, discardConfirmBody(count), [
      { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
      { text: QUICK_EDIT_COPY.discard, style: 'destructive', onPress: onExit },
    ])
  }, [count, onExit])

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

          <NutritionCard>
            <View className="flex-row items-start gap-2">
              <Info color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-text-muted">
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
