import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { Check, ChevronLeft, ChevronRight, Lock, Plus, Repeat, Search, Trash2, X } from 'lucide-react-native'
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
import { useTheme } from '../../../../context/ThemeContext'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import { nutritionV2CoachScope } from '../../../../lib/nutrition-v2.api'
import { searchFoodCatalogV2 } from '../../../../lib/nutrition-v2-catalog.api'
import { supabase } from '../../../../lib/supabase'
import {
  BUILDER_UNITS,
  MAX_ITEM_SUBSTITUTIONS,
  NUTRITION_PRO_MODULE_KEY,
  assembleAndValidateDraft,
  buildPublishIdempotencyKey,
  builderReducer,
  createEmptyBuilderState,
  dayTotals,
  itemMacros,
  mapFoodCatalogItemToBuilderFood,
  publishDraftRN,
  slotSubtotal,
  strategyUsesSlots,
  validateStep,
  type BuilderItem,
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
  const [showErrors, setShowErrors] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [dateConflict, setDateConflict] = useState(false)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const operationId = useRef(genKey('op'))
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

  const handlePublish = useCallback(
    async (effectiveFromOverride?: string) => {
      if (!userId || !clientId) return
      setPublishError(null)
      setDateConflict(false)
      let draft
      try {
        draft = assembleAndValidateDraft(state, { clientId, planId })
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
        effectiveFrom: effectiveFromOverride ?? state.effectiveFrom ?? today,
        hasNutritionPro,
      })
      if (!mountedRef.current) return
      setPublishing(false)
      if (res.ok) {
        router.replace(`/coach/nutrition-v2/${clientId}?published=1`)
        return
      }
      if (res.code === 'UPGRADE_REQUIRED') {
        setUpsell(res.error)
        return
      }
      // Choque de fecha con el plan vigente: en vez del error criptico, ofrecemos "Empezar manana".
      if (res.code === 'EFFECTIVE_DATE') {
        setDateConflict(true)
        return
      }
      setPublishError(res.error)
    },
    [userId, clientId, planId, state, today, hasNutritionPro, router],
  )

  // "Empezar manana": mueve la vigencia al dia siguiente y reintenta la publicacion. El plan
  // vigente del alumno no esta disponible en esta pantalla, asi que avanzamos desde la fecha
  // elegida (por defecto hoy) — suficiente para el caso reproducible (plan vigente desde hoy).
  const handleStartTomorrow = useCallback(() => {
    const nextFrom = nextDayIso(state.effectiveFrom || today)
    dispatch({ type: 'SET_EFFECTIVE_FROM', value: nextFrom })
    setDateConflict(false)
    void handlePublish(nextFrom)
  }, [state.effectiveFrom, today, handlePublish])

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
          {state.step === 1 ? <TargetsStep state={state} dispatch={dispatch} errors={errors} /> : null}
          {state.step === 2 ? (
            <ConstructionStep
              state={state}
              dispatch={dispatch}
              errors={errors}
              onSearch={(target) => setSearchTarget(target)}
            />
          ) : null}
          {state.step === 3 ? (
            <ReviewStep
              state={state}
              publishError={publishError}
              dateConflict={dateConflict}
              publishing={publishing}
              onStartTomorrow={handleStartTomorrow}
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
}: {
  state: BuilderState
  dispatch: React.Dispatch<import('../../../../lib/nutrition-v2-builder').BuilderAction>
  errors: Record<string, string>
}) {
  return (
    <View className="gap-4">
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
}: {
  slotKey: string
  item: BuilderItem
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
}) {
  const { theme } = useTheme()
  const macros = itemMacros(item)
  const isCustom = item.food === null
  const patch = (p: Partial<Omit<BuilderItem, 'key'>>) =>
    dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: p })

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
}: {
  slot: BuilderSlot
  index: number
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
}) {
  const { theme } = useTheme()
  const subtotal = slotSubtotal(slot)
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
          <ItemEditor key={item.key} slotKey={slot.key} item={item} dispatch={dispatch} errors={errors} onSearch={onSearch} />
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

      {slot.items.length > 0 ? (
        <View className="mt-3 border-t border-border-subtle pt-2">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Subtotal franja</Text>
          <MacroChipRow size="sm" calories={subtotal.calories} proteinG={subtotal.proteinG} carbsG={subtotal.carbsG} fatsG={subtotal.fatsG} />
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
}: {
  state: BuilderState
  dispatch: BuilderDispatch
  errors: Record<string, string>
  onSearch: (target: SearchTarget) => void
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

  const totals = dayTotals(state)
  return (
    <View className="gap-3">
      <ErrorText message={errors.slots} />
      {state.slots.map((slot, index) => (
        <SlotEditor key={slot.key} slot={slot} index={index} dispatch={dispatch} errors={errors} onSearch={onSearch} />
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

function ReviewStep({
  state,
  publishError,
  dateConflict,
  publishing,
  onStartTomorrow,
}: {
  state: BuilderState
  publishError: string | null
  dateConflict: boolean
  publishing: boolean
  onStartTomorrow: () => void
}) {
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

      {dateConflict ? (
        <View className="gap-3 rounded-card border border-border-default bg-surface-card p-4">
          <View className="gap-1">
            <Text className="font-display text-base font-semibold text-text-strong">Ya hay un plan vigente desde hoy</Text>
            <Text className="text-sm leading-5 text-text-muted">
              Para no pisar el plan actual, empieza el nuevo mañana. El de hoy sigue activo hasta entonces.
            </Text>
          </View>
          <NutritionMotionButton
            accessibilityLabel="Empezar el plan nuevo mañana"
            pending={publishing}
            disabled={publishing}
            onPress={onStartTomorrow}
          >
            Empezar mañana
          </NutritionMotionButton>
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
