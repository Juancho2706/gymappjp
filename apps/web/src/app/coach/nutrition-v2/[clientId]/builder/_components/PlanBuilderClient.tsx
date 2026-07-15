'use client'

import { useMemo, useReducer, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { BuilderStepList, MacroBudget, NutritionCard, StrategyBadge } from '@/components/nutrition-v2'
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
  type ItemMacros,
} from '../_lib/draft-builder'
import {
  createCoachFoodAction,
  publishPlanAction,
  searchFoodCatalogCoachAction,
} from '../_actions/builder.actions'
import { FoodResultCard } from './FoodResultCard'
import { foodCategoryIconUrlFromName } from './food-card-presentation'
import { FoodThumb } from './FoodImage'

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
  'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm text-strong outline-none transition-colors focus:border-ember-500 focus:ring-2 focus:ring-ember-500/25'
const macroInputClass =
  'min-h-9 w-full rounded-control border border-border-default bg-surface-card px-2 text-sm tabular-nums text-strong outline-none transition-colors focus:border-ember-500 focus:ring-2 focus:ring-ember-500/25'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'
const primaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control bg-ember-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-app disabled:opacity-60'
const secondaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
const iconButtonClass =
  'rounded-control p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function macroLine(m: { calories: number; proteinG: number; carbsG: number; fatsG: number }): string {
  return Math.round(m.calories) + ' kcal | P ' + Math.round(m.proteinG) + ' | C ' + Math.round(m.carbsG) + ' | G ' + Math.round(m.fatsG)
}

function numOr0(value: string): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
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
          type="search"
          inputMode="search"
          aria-label="Buscar alimento del catalogo"
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
          className={primaryButtonClass + ' shrink-0 px-3'}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">
          <ul className="grid max-h-[30rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <FoodResultCard item={item} onPick={() => pick(item)} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={secondaryButtonClass + ' min-h-9 w-full justify-center text-xs'}
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CUSTOM_MACRO_FIELDS.map(({ field, label }) => (
          <div key={field}>
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-subtle" htmlFor={`cm-${item.key}-${field}`}>
              {label}
            </label>
            <input
              id={`cm-${item.key}-${field}`}
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
          className={secondaryButtonClass + ' min-h-9 px-3 text-xs'}
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
  const displayName = item.food ? item.food.name : item.customName
  const iconUrl = foodCategoryIconUrlFromName(displayName)
  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-2.5">
      <div className="flex items-start gap-2.5">
        <FoodThumb imageUrl={null} iconUrl={iconUrl} alt={displayName || 'Alimento'} />
        <div className="min-w-0 flex-1">
          {item.food ? (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-strong">{item.food.name}</p>
              {item.food.brand ? <p className="mt-0.5 truncate text-xs text-muted">{item.food.brand}</p> : null}
            </>
          ) : (
            <input
              className={inputClass}
              aria-label="Nombre del alimento libre"
              placeholder="Nombre del alimento libre"
              value={item.customName ?? ''}
              onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { customName: e.target.value } })}
            />
          )}
        </div>
        <PortionMacros item={item} />
        <button
          type="button"
          aria-label={`Quitar ${displayName || 'alimento'}`}
          onClick={() => dispatch({ type: 'REMOVE_ITEM', slotKey, itemKey: item.key })}
          className={iconButtonClass}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          className={inputClass + ' max-w-32'}
          inputMode="decimal"
          aria-label="Cantidad"
          placeholder="Cantidad"
          value={item.quantity}
          onChange={(e) => dispatch({ type: 'UPDATE_ITEM', slotKey, itemKey: item.key, patch: { quantity: e.target.value } })}
        />
        <select
          className={inputClass + ' max-w-24'}
          aria-label="Unidad"
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
          <label className={labelClass} htmlFor={`slot-name-${slot.key}`}>Nombre de la franja</label>
          <input
            id={`slot-name-${slot.key}`}
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
          <label className={labelClass} htmlFor={`slot-time-${slot.key}`}>Hora</label>
          <input
            id={`slot-time-${slot.key}`}
            className={inputClass}
            type="time"
            value={slot.startTime}
            onChange={(e) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { startTime: e.target.value } })}
          />
        </div>
        <button
          type="button"
          aria-label={`Quitar franja ${slot.name || 'sin nombre'}`}
          onClick={() => dispatch({ type: 'REMOVE_SLOT', slotKey: slot.key })}
          className={iconButtonClass + ' mt-6'}
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
          className={secondaryButtonClass + ' mt-2'}
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

// Ruta canonica de compra del addon. Se inlinea aca porque el modulo _lib/nutrition-pro.ts
// es server-only (import 'server-only') y no puede importarse en un client component.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/settings/modules'
// Estrategias que exigen el addon Nutricion Pro (frontera CEO): solo 'hybrid'. La UI marca
// y deshabilita estas opciones sin addon; el servidor (publishPlanAction) es la barrera real.
const PRO_STRATEGIES: readonly NutritionStrategy[] = ['hybrid']

function ProBadge() {
  return (
    <span className="shrink-0 rounded-pill border border-ember-300/60 bg-ember-100/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ember-700 dark:border-ember-600/40 dark:bg-ember-100/20 dark:text-ember-300">
      Pro
    </span>
  )
}

function StrategyStep({
  state,
  dispatch,
  nutritionProEnabled,
}: {
  state: BuilderState
  dispatch: Dispatch
  nutritionProEnabled: boolean
}) {
  const options: NutritionStrategy[] = ['structured', 'flexible', 'hybrid']
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((key) => {
          const meta = NUTRITION_STRATEGIES[key]
          const active = state.strategy === key
          const isPro = PRO_STRATEGIES.includes(key)
          const locked = isPro && !nutritionProEnabled
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-disabled={locked}
              disabled={locked}
              title={locked ? 'Disponible con Nutricion Pro' : meta.description}
              onClick={() => {
                if (locked) return
                dispatch({ type: 'SET_STRATEGY', strategy: key, firstSlotKey: genId() })
              }}
              className={
                'flex h-full flex-col rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (locked
                  ? 'cursor-not-allowed border-border-subtle bg-surface-sunken opacity-90'
                  : active
                    ? 'border-ember-500 bg-ember-100/60 dark:bg-ember-100/10'
                    : 'border-border-default bg-surface-card hover:border-ember-300')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-base font-semibold text-strong">
                  {meta.label}
                  {isPro ? <ProBadge /> : null}
                </span>
                {active && !locked ? <Check className="h-5 w-5 shrink-0 text-ember-600 dark:text-ember-300" /> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{meta.description}</p>
              {locked ? (
                <span className="mt-2 text-xs font-medium text-ember-700 dark:text-ember-300">
                  Disponible con Nutricion Pro
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {!nutritionProEnabled ? (
        <p className="text-xs text-muted">
          La estrategia hibrida es parte de Nutricion Pro.{' '}
          <Link
            href={NUTRITION_PRO_UPGRADE_HREF}
            className="font-semibold text-ember-700 underline underline-offset-2 dark:text-ember-300"
          >
            Ver modulos
          </Link>
        </p>
      ) : null}
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
    <div className="max-w-4xl space-y-5">
      <div>
        <label className={labelClass} htmlFor="plan-name">Nombre del plan</label>
        <input
          id="plan-name"
          className={inputClass}
          placeholder="Plan de definicion"
          value={state.planName}
          onChange={(e) => dispatch({ type: 'SET_PLAN_NAME', value: e.target.value })}
        />
        {errors.planName ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.planName}</p> : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className={labelClass}>Metas diarias</legend>
          <div className="grid grid-cols-2 gap-3">
            {macroFields.map(({ field, label }) => (
              <div key={field}>
                <label className={labelClass} htmlFor={`target-${field}`}>{label}</label>
                <input
                  id={`target-${field}`}
                  className={inputClass}
                  inputMode="decimal"
                  value={state.targets[field]}
                  onChange={(e) => dispatch({ type: 'SET_TARGET', field, value: e.target.value })}
                />
                {errors[field] ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors[field]}</p> : null}
              </div>
            ))}
          </div>
        </fieldset>
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
                className="h-4 w-4 accent-ember-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                checked={state.permissions[field]}
                onChange={(e) => dispatch({ type: 'SET_PERMISSION', field, value: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

function DaySummary({ state, totals }: { state: BuilderState; totals: ItemMacros }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-semibold text-strong">Resumen del dia</h3>
      <MacroBudget
        calories={{ consumed: totals.calories, target: numOr0(state.targets.calories) }}
        macros={[
          { macro: 'protein', consumed: totals.proteinG, target: numOr0(state.targets.proteinG) },
          { macro: 'carbs', consumed: totals.carbsG, target: numOr0(state.targets.carbsG) },
          { macro: 'fats', consumed: totals.fatsG, target: numOr0(state.targets.fatsG) },
        ]}
      />
      <NutritionCard>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Por franja</p>
        {state.slots.length === 0 ? (
          <p className="text-sm text-muted">Agrega una franja para ver el desglose del dia.</p>
        ) : (
          <ul className="space-y-2">
            {state.slots.map((slot) => {
              const s = slotSubtotal(slot)
              return (
                <li key={slot.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-body">
                    {slot.name.trim() || 'Sin nombre'}
                    <span className="text-subtle"> · {slot.items.length} item{slot.items.length === 1 ? '' : 's'}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-strong">{Math.round(s.calories)} kcal</span>
                </li>
              )
            })}
          </ul>
        )}
      </NutritionCard>
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
  const totals = dayTotals(state)
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
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {errors.slots ? <p className="text-sm text-rose-600 dark:text-rose-300">{errors.slots}</p> : null}
        {state.slots.map((slot) => (
          <SlotEditor key={slot.key} slot={slot} clientId={clientId} dispatch={dispatch} errors={errors} />
        ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SLOT', key: genId() })}
          className={secondaryButtonClass + ' border-dashed px-4'}
        >
          <Plus className="h-4 w-4" />
          Agregar franja
        </button>

        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-2 rounded-control border border-border-default bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface-card/80 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total del dia</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-strong">{macroLine(totals)}</span>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="lg:sticky lg:top-6">
          <DaySummary state={state} totals={totals} />
        </div>
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
    <div className="max-w-3xl space-y-4">
      <NutritionCard>
        <div className="flex flex-wrap items-center gap-2">
          {state.strategy ? <StrategyBadge strategy={state.strategy} /> : null}
          <span className="font-display text-lg font-semibold text-strong">{state.planName || 'Sin nombre'}</span>
        </div>
        {meta ? <p className="mt-1 text-sm text-muted">{meta.description}</p> : null}
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
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

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div>
          <label className={labelClass} htmlFor="effective-from">Vigente desde</label>
          <input
            id="effective-from"
            className={inputClass}
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
      </div>

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
  nutritionProEnabled,
}: {
  clientId: string
  existingPlan: { id: string; versionNumber: number; strategy: NutritionStrategy } | null
  today: string
  nutritionProEnabled: boolean
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
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <BuilderStepList steps={steps} />
        {existingPlan ? (
          <p className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs text-muted">
            Al publicar se creara la version v{existingPlan.versionNumber + 1} y la actual pasara a anterior.
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {state.step === 0 ? (
          <StrategyStep state={state} dispatch={dispatch} nutritionProEnabled={nutritionProEnabled} />
        ) : null}
        {state.step === 1 ? (
          <TargetsStep state={state} dispatch={dispatch} errors={showErrors ? validation.errors : {}} />
        ) : null}
        {state.step === 2 ? (
          <ConstructionStep state={state} clientId={clientId} dispatch={dispatch} errors={showErrors ? validation.errors : {}} />
        ) : null}
        {state.step === 3 ? <ReviewStep state={state} dispatch={dispatch} publishError={publishError} /> : null}

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <button type="button" onClick={handlePrev} disabled={state.step === 0 || isPending} className={secondaryButtonClass}>
            <ChevronLeft className="h-4 w-4" />
            Atras
          </button>
          {state.step < 3 ? (
            <button type="button" onClick={handleNext} className={primaryButtonClass}>
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={handlePublish} disabled={isPending} className={primaryButtonClass + ' gap-2'}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Publicar plan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
