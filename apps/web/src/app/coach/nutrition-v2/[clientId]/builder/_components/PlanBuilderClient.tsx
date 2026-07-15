'use client'

import { useMemo, useReducer, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { BuilderStepList, NutritionCard, StrategyBadge } from '@/components/nutrition-v2'
import {
  NUTRITION_STRATEGIES,
  buildNutritionIdempotencyKey,
  type FoodCatalogCursor,
  type FoodCatalogItem,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import {
  BUILDER_UNITS,
  CoachFoodInputSchema,
  assembleAndValidateDraft,
  builderReducer,
  createEmptyBuilderState,
  customMacrosOf,
  dayTotals,
  itemMacros,
  macroEnergyMismatch,
  slotSubtotal,
  strategyUsesSlots,
  validateStep,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
} from '../_lib/draft-builder'
import {
  createCoachFoodAction,
  publishPlanAction,
  searchFoodCatalogCoachAction,
} from '../_actions/builder.actions'
import { FoodResultCard } from './FoodResultCard'

type Dispatch = (action: import('../_lib/draft-builder').BuilderAction) => void

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function mapCatalogItemToFood(item: FoodCatalogItem): BuilderFood {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatsG: item.fatsG,
    fiberG: item.fiberG,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
  }
}

const inputClass =
  'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm text-strong outline-none focus:border-ember-500'
const macroInputClass =
  'min-h-9 w-full rounded-control border border-border-default bg-surface-card px-2 text-sm tabular-nums text-strong outline-none focus:border-ember-500'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'

function macroLine(m: { calories: number; proteinG: number; carbsG: number; fatsG: number }): string {
  return Math.round(m.calories) + ' kcal | P ' + Math.round(m.proteinG) + ' | C ' + Math.round(m.carbsG) + ' | G ' + Math.round(m.fatsG)
}

function FoodSearch({ clientId, onPick }: { clientId: string; onPick: (food: BuilderFood) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const activeQuery = useRef('')

  async function run() {
    const q = query.trim()
    if (q.length === 0) return
    setLoading(true)
    setError(null)
    activeQuery.current = q
    const res = await searchFoodCatalogCoachAction({ clientId, query: q })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      setItems([])
      setCursor(null)
      setHasMore(false)
      return
    }
    setItems(res.result.items)
    setCursor(res.result.nextCursor)
    setHasMore(res.result.hasMore)
  }

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const res = await searchFoodCatalogCoachAction({ clientId, query: activeQuery.current, cursor })
    setLoadingMore(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setItems((prev) => [...prev, ...res.result.items])
    setCursor(res.result.nextCursor)
    setHasMore(res.result.hasMore)
  }

  function pick(item: FoodCatalogItem) {
    onPick(mapCatalogItemToFood(item))
    setItems([])
    setCursor(null)
    setHasMore(false)
    setQuery('')
  }

  return (
    <div className="rounded-control border border-border-subtle bg-surface-sunken p-3">
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Buscar alimento del catalogo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void run()
            }
          }}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-1 rounded-control bg-ember-500 px-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
      {items.length > 0 ? (
        <div className="mt-2 space-y-2">
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <FoodResultCard item={item} onPick={() => pick(item)} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mas resultados
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function PortionMacros({ item }: { item: BuilderItem }) {
  const m = itemMacros(item)
  return (
    <div className="shrink-0 text-right">
      <p className="font-mono text-sm font-semibold tabular-nums text-strong">{Math.round(m.calories)} kcal</p>
      <p className="font-mono text-[11px] tabular-nums text-muted">
        P {Math.round(m.proteinG)} · C {Math.round(m.carbsG)} · G {Math.round(m.fatsG)}
      </p>
    </div>
  )
}

const CUSTOM_MACRO_FIELDS: Array<{ field: keyof Pick<BuilderItem, 'customCalories' | 'customProteinG' | 'customCarbsG' | 'customFatsG'>; label: string }> = [
  { field: 'customCalories', label: 'kcal' },
  { field: 'customProteinG', label: 'P (g)' },
  { field: 'customCarbsG', label: 'C (g)' },
  { field: 'customFatsG', label: 'G (g)' },
]

function FreeFoodFields({
  item,
  slotKey,
  clientId,
  dispatch,
}: {
  item: BuilderItem
  slotKey: string
  clientId: string
  dispatch: Dispatch
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const macros = customMacrosOf(item)
  const showWarning = macroEnergyMismatch(macros)
  const unit = item.unit === 'ml' ? 'ml' : 'g'

  async function handleSave() {
    setSaveError(null)
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
      setSaveError('Completa el nombre y macros validas (no negativas) antes de guardar.')
      return
    }
    setSaving(true)
    const res = await createCoachFoodAction(parsed.data)
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return
    }
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
  }

  return (
    <div className="mt-2 rounded-control border border-border-subtle bg-surface-sunken p-2.5">
      <p className={labelClass}>Macros por 100 {unit}</p>
      <div className="grid grid-cols-4 gap-2">
        {CUSTOM_MACRO_FIELDS.map(({ field, label }) => (
          <div key={field}>
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-subtle">{label}</label>
            <input
              className={macroInputClass}
              inputMode="decimal"
              placeholder="0"
              value={item[field]}
              onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { [field]: e.target.value } })}
            />
          </div>
        ))}
      </div>
      {showWarning ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Las kcal no cuadran con las macros (4P + 4C + 9G). Puedes guardar igual, pero revisa los valores.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Guardar en mi catalogo
        </button>
        {saveError ? <span className="text-[11px] text-rose-600 dark:text-rose-300">{saveError}</span> : null}
      </div>
    </div>
  )
}

function ItemRow({
  item,
  slotKey,
  clientId,
  dispatch,
  error,
}: {
  item: BuilderItem
  slotKey: string
  clientId: string
  dispatch: Dispatch
  error?: { food?: string; quantity?: string }
}) {
  const unitOptions = item.food ? BUILDER_UNITS : (['g', 'ml'] as const)
  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {item.food ? (
            <>
              <p className="truncate text-sm font-semibold text-strong">{item.food.name}</p>
              {item.food.brand ? <p className="truncate text-xs text-muted">{item.food.brand}</p> : null}
            </>
          ) : (
            <input
              className={inputClass}
              placeholder="Nombre del alimento libre"
              value={item.customName ?? ''}
              onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { customName: e.target.value } })}
            />
          )}
        </div>
        <PortionMacros item={item} />
        <button
          type="button"
          aria-label="Quitar item"
          onClick={() => dispatch({ type: 'REMOVE_ITEM', slotKey, itemKey: item.key })}
          className="rounded-control p-2 text-muted hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          className={inputClass + ' max-w-32'}
          inputMode="decimal"
          placeholder="Cantidad"
          value={item.quantity}
          onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { quantity: e.target.value } })}
        />
        <select
          className={inputClass + ' max-w-24'}
          value={item.unit}
          onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { unit: e.target.value as BuilderItem['unit'] } })}
        >
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {!item.food ? <FreeFoodFields item={item} slotKey={slotKey} clientId={clientId} dispatch={dispatch} /> : null}

      {error?.food ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.food}</p> : null}
      {error?.quantity ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.quantity}</p> : null}
    </div>
  )
}

function SlotEditor({
  slot,
  clientId,
  dispatch,
  errors,
}: {
  slot: BuilderSlot
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
}) {
  const subtotal = slotSubtotal(slot)
  return (
    <NutritionCard>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className={labelClass}>Nombre de la franja</label>
          <input
            className={inputClass}
            placeholder="Desayuno, Almuerzo..."
            value={slot.name}
            onChange={(e) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { name: e.target.value } })}
          />
          {errors['slot.' + slot.key + '.name'] ? (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors['slot.' + slot.key + '.name']}</p>
          ) : null}
        </div>
        <div className="w-28">
          <label className={labelClass}>Hora</label>
          <input
            className={inputClass}
            type="time"
            value={slot.startTime}
            onChange={(e) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { startTime: e.target.value } })}
          />
        </div>
        <button
          type="button"
          aria-label="Quitar franja"
          onClick={() => dispatch({ type: 'REMOVE_SLOT', slotKey: slot.key })}
          className="mt-6 rounded-control p-2 text-muted hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {slot.items.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            slotKey={slot.key}
            clientId={clientId}
            dispatch={dispatch}
            error={{ food: errors['item.' + item.key + '.food'], quantity: errors['item.' + item.key + '.quantity'] }}
          />
        ))}
      </div>

      <div className="mt-3">
        <FoodSearch clientId={clientId} onPick={(food) => dispatch({ type: 'ADD_ITEM', slotKey: slot.key, key: genId(), food })} />
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_ITEM', slotKey: slot.key, key: genId(), food: null })}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
        >
          <Plus className="h-4 w-4" />
          Alimento libre (con macros)
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotal franja</span>
        <span className="font-mono text-xs tabular-nums text-strong">{macroLine(subtotal)}</span>
      </div>
    </NutritionCard>
  )
}

function StrategyStep({ state, dispatch }: { state: BuilderState; dispatch: Dispatch }) {
  const options: NutritionStrategy[] = ['structured', 'flexible', 'hybrid']
  return (
    <div className="space-y-3">
      {options.map((key) => {
        const meta = NUTRITION_STRATEGIES[key]
        const active = state.strategy === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => dispatch({ type: 'SET_STRATEGY', strategy: key, firstSlotKey: genId() })}
            className={
              'block w-full rounded-card border p-4 text-left transition ' +
              (active ? 'border-ember-500 bg-ember-100/60 dark:bg-ember-100/10' : 'border-border-default bg-surface-card hover:border-ember-300')
            }
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-semibold text-strong">{meta.label}</span>
              {active ? <Check className="h-5 w-5 text-ember-600" /> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{meta.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function TargetsStep({
  state,
  dispatch,
  errors,
}: {
  state: BuilderState
  dispatch: Dispatch
  errors: Record<string, string>
}) {
  const macroFields: Array<{ field: 'calories' | 'proteinG' | 'carbsG' | 'fatsG'; label: string }> = [
    { field: 'calories', label: 'Calorias (kcal)' },
    { field: 'proteinG', label: 'Proteina (g)' },
    { field: 'carbsG', label: 'Carbohidratos (g)' },
    { field: 'fatsG', label: 'Grasas (g)' },
  ]
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Nombre del plan</label>
        <input
          className={inputClass}
          placeholder="Plan de definicion"
          value={state.planName}
          onChange={(e) => dispatch({ type: 'SET_PLAN_NAME', value: e.target.value })}
        />
        {errors.planName ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.planName}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {macroFields.map(({ field, label }) => (
          <div key={field}>
            <label className={labelClass}>{label}</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={state.targets[field]}
              onChange={(e) => dispatch({ type: 'SET_TARGET', field, value: e.target.value })}
            />
            {errors[field] ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors[field]}</p> : null}
          </div>
        ))}
      </div>
      <fieldset className="rounded-card border border-border-subtle p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Permisos del alumno</legend>
        {([
          ['canRegisterFreely', 'Puede registrar alimentos libremente'],
          ['canAdjustPrescribedQuantity', 'Puede ajustar la cantidad prescrita'],
          ['canSubstitute', 'Puede sustituir alimentos'],
        ] as const).map(([field, label]) => (
          <label key={field} className="flex min-h-11 items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={state.permissions[field]}
              onChange={(e) => dispatch({ type: 'SET_PERMISSION', field, value: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  )
}

function ConstructionStep({
  state,
  clientId,
  dispatch,
  errors,
}: {
  state: BuilderState
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
}) {
  if (!strategyUsesSlots(state.strategy)) {
    return (
      <NutritionCard tone="neutral">
        <p className="text-sm text-body">
          Los planes flexibles no definen franjas ni alimentos prescritos: el alumno registra libremente contra las
          metas del paso anterior. Continua para revisar y publicar.
        </p>
      </NutritionCard>
    )
  }
  const totals = dayTotals(state)
  return (
    <div className="space-y-4">
      {errors.slots ? <p className="text-sm text-rose-600 dark:text-rose-300">{errors.slots}</p> : null}
      {state.slots.map((slot) => (
        <SlotEditor key={slot.key} slot={slot} clientId={clientId} dispatch={dispatch} errors={errors} />
      ))}
      <button
        type="button"
        onClick={() => dispatch({ type: 'ADD_SLOT', key: genId() })}
        className="inline-flex min-h-11 items-center gap-1 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong"
      >
        <Plus className="h-4 w-4" />
        Agregar franja
      </button>
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-2 rounded-control border border-border-default bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface-card/80">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total del dia</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-strong">{macroLine(totals)}</span>
      </div>
    </div>
  )
}

function ReviewStep({
  state,
  dispatch,
  publishError,
}: {
  state: BuilderState
  dispatch: Dispatch
  publishError: string | null
}) {
  const usesSlots = strategyUsesSlots(state.strategy)
  const totals = dayTotals(state)
  const meta = state.strategy ? NUTRITION_STRATEGIES[state.strategy] : null
  return (
    <div className="space-y-4">
      <NutritionCard>
        <div className="flex flex-wrap items-center gap-2">
          {state.strategy ? <StrategyBadge strategy={state.strategy} /> : null}
          <span className="font-display text-lg font-semibold text-strong">{state.planName || 'Sin nombre'}</span>
        </div>
        {meta ? <p className="mt-1 text-sm text-muted">{meta.description}</p> : null}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Metas diarias</dt>
            <dd className="text-body">
              {state.targets.calories || '-'} kcal | P {state.targets.proteinG || '-'} | C {state.targets.carbsG || '-'} | G{' '}
              {state.targets.fatsG || '-'}
            </dd>
          </div>
          {usesSlots ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Franjas / total prescrito</dt>
              <dd className="text-body">
                {state.slots.length} franjas | {macroLine(totals)}
              </dd>
            </div>
          ) : null}
        </dl>
      </NutritionCard>

      <div>
        <label className={labelClass}>Vigente desde</label>
        <input
          className={inputClass + ' max-w-56'}
          type="date"
          value={state.effectiveFrom}
          onChange={(e) => dispatch({ type: 'SET_EFFECTIVE_FROM', value: e.target.value })}
        />
      </div>

      <NutritionCard tone="neutral">
        <p className="text-xs text-muted">
          Fuera de este MVP: plantillas y asignacion multiple, editar una version ya publicada (para cambios crea una
          nueva version), variantes por dia de la semana y fecha de vigencia programada.
        </p>
      </NutritionCard>

      {publishError ? (
        <p className="rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {publishError}
        </p>
      ) : null}
    </div>
  )
}

const STEP_META = [
  { id: 'estrategia', label: 'Estrategia' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'construccion', label: 'Construccion' },
  { id: 'revision', label: 'Revisar y publicar' },
]

export function PlanBuilderClient({
  clientId,
  existingPlan,
  today,
}: {
  clientId: string
  existingPlan: { id: string; versionNumber: number; strategy: NutritionStrategy } | null
  today: string
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(builderReducer, today, createEmptyBuilderState)
  const [showErrors, setShowErrors] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const operationId = useRef(genId())

  const validation = useMemo(() => validateStep(state, state.step), [state])

  const steps = STEP_META.map((meta, index) => {
    let stepState: 'upcoming' | 'current' | 'complete' | 'error' = 'upcoming'
    if (index === state.step) stepState = showErrors && !validation.ok ? 'error' : 'current'
    else if (index < state.step) stepState = 'complete'
    const description = index === 2 && !strategyUsesSlots(state.strategy) ? 'No aplica (plan flexible)' : undefined
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

  function handlePublish() {
    setPublishError(null)
    let draft
    try {
      draft = assembleAndValidateDraft(state, { clientId, planId: existingPlan?.id ?? null })
    } catch {
      setShowErrors(true)
      setPublishError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
      return
    }
    const idempotencyKey = buildNutritionIdempotencyKey({
      clientId,
      deviceId: 'web-builder',
      operationId: operationId.current,
      kind: 'publish',
    })
    startTransition(async () => {
      const res = await publishPlanAction({ draft, idempotencyKey, effectiveFrom: state.effectiveFrom })
      if (res.ok) {
        router.push('/coach/nutrition-v2/' + clientId + '?published=1')
      } else {
        setPublishError(res.error)
      }
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <div className="space-y-3">
        <BuilderStepList steps={steps} />
        {existingPlan ? (
          <p className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs text-muted">
            Al publicar se creara la version v{existingPlan.versionNumber + 1} y la actual pasara a anterior.
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        {state.step === 0 ? <StrategyStep state={state} dispatch={dispatch} /> : null}
        {state.step === 1 ? (
          <TargetsStep state={state} dispatch={dispatch} errors={showErrors ? validation.errors : {}} />
        ) : null}
        {state.step === 2 ? (
          <ConstructionStep state={state} clientId={clientId} dispatch={dispatch} errors={showErrors ? validation.errors : {}} />
        ) : null}
        {state.step === 3 ? <ReviewStep state={state} dispatch={dispatch} publishError={publishError} /> : null}

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={state.step === 0 || isPending}
            className="inline-flex min-h-11 items-center gap-1 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Atras
          </button>
          {state.step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex min-h-11 items-center gap-1 rounded-control bg-ember-500 px-5 text-sm font-semibold text-white"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Publicar plan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
