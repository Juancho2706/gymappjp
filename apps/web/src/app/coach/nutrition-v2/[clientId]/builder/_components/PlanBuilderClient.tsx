'use client'

import { useMemo, useReducer, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { BuilderStepList, MacroBudget, NutritionCard, StrategyBadge } from '@/components/nutrition-v2'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  NUTRITION_STRATEGIES,
  buildNutritionIdempotencyKey,
  type FoodCatalogCursor,
  type FoodCatalogItem,
  type NutritionBuilderStepModel,
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
import { archivePlanAction } from '@/app/coach/nutrition-v2/_actions/nutrition-archive.actions'
import { canProceedToPublishAfterArchive, effectiveDateConflicts, nextDayIso } from '../_lib/publish-conflict'
import { FoodResultCard } from './FoodResultCard'
import { PublishConflictDialog } from './PublishConflictDialog'
// Porciones a elección (T1.1): capa opcional sobre structured/hybrid (SPEC R1). El estado
// vive en un controller hermano del reducer (no se toca _lib/draft-builder) y se inyecta
// al draft canónico justo antes de publicar (attachPortionsAndValidate).
import { PortionsSection, usePortionsBuilder, type PortionsController } from './PortionsSection'
import { PortionsDeriveCard } from './PortionsDeriveCard'
import { PortionsReviewSection } from './PortionsReviewChips'
import { attachPortionsAndValidate, combineSubtotals, slotPortionTotals } from './portions-state'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { foodCategoryIconUrlFromName, resolveFoodImageUrl } from './food-card-presentation'
import { foodCategoryIconUrl } from '@/lib/food-image'
import { FoodThumb } from './FoodImage'

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

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
    category: item.category,
    media: item.media,
  }
}

const inputClass =
  'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
const macroInputClass =
  'min-h-9 w-full rounded-control border border-border-default bg-surface-card px-2 text-sm tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'
const primaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control bg-primary/100 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-app disabled:opacity-60'
const secondaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
const iconButtonClass =
  'rounded-control p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function numOr0(value: string): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// Convierte una meta escrita (string) a numero, o null cuando esta vacia/invalida — asi
// MacroChipRow oculta la pastilla en vez de mostrar un cero enganoso.
function numOrNull(value: string): number | null {
  const t = String(value).trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
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
          <ul className="grid max-h-[30rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    <div className="shrink-0">
      <MacroChipRow
        size="sm"
        calories={m.calories}
        proteinG={m.proteinG}
        carbsG={m.carbsG}
        fatsG={m.fatsG}
      />
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
  const imageUrl = item.food ? resolveFoodImageUrl(item.food.media as FoodCatalogItem['media'], SUPABASE_BASE) : null
  const iconUrl = item.food ? foodCategoryIconUrl(item.food.category) : foodCategoryIconUrlFromName(item.customName)
  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-2.5">
      <div className="flex items-start gap-2.5">
        <FoodThumb imageUrl={imageUrl} iconUrl={iconUrl} alt={displayName || 'Alimento'} />
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
  portions,
}: {
  slot: BuilderSlot
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
}) {
  // Fix QA F1-2: el subtotal de franja combina items fijos + derivado de porciones
  // (Σ porciones × ref del grupo, catálogo VIVO del picker). Catálogo sin cargar o
  // franja sin porciones ⇒ solo items, idéntico a antes (sin NaN jamás).
  const itemsSubtotal = slotSubtotal(slot)
  const portionTotals = slotPortionTotals(portions.bySlot, slot.key, portions.groups)
  const subtotal = combineSubtotals(itemsSubtotal, portionTotals)
  return (
    <NutritionCard>
      {/* Fix QA F1-2: grid con filas label/control — los dos labels comparten la fila 1
          (bottom-aligned) y los controles la fila 2, así HORA queda alineada con NOMBRE
          aunque el label largo envuelva a dos líneas en 360 px. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-2">
        <label className={labelClass} htmlFor={`slot-name-${slot.key}`}>Nombre de la franja</label>
        <label className={labelClass} htmlFor={`slot-time-${slot.key}`}>Hora</label>
        <span aria-hidden="true" />
        <input
          id={`slot-name-${slot.key}`}
          className={inputClass}
          placeholder="Desayuno, Almuerzo..."
          value={slot.name}
          onChange={(e) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { name: e.target.value } })}
        />
        <input
          id={`slot-time-${slot.key}`}
          className={inputClass + ' w-28'}
          type="time"
          value={slot.startTime}
          onChange={(e) => dispatch({ type: 'UPDATE_SLOT', slotKey: slot.key, patch: { startTime: e.target.value } })}
        />
        <button
          type="button"
          aria-label={`Quitar franja ${slot.name || 'sin nombre'}`}
          onClick={() => dispatch({ type: 'REMOVE_SLOT', slotKey: slot.key })}
          className={iconButtonClass + ' inline-flex h-11 w-11 items-center justify-center self-center'}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {errors['slot.' + slot.key + '.name'] ? (
          <p className="col-span-full mt-1 text-xs text-rose-600 dark:text-rose-300">{errors['slot.' + slot.key + '.name']}</p>
        ) : null}
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

      {/* NUEVO (SPEC UX-a): sección "Porciones a elección", hermana de la lista de
          alimentos, debajo de "+ Alimento". Solo existe en structured/hybrid (SlotEditor
          no se monta en planes flexibles — R1). */}
      <PortionsSection slotKey={slot.key} slotName={slot.name} controller={portions} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotal franja</span>
        <MacroChipRow
          size="sm"
          calories={subtotal.calories}
          proteinG={subtotal.proteinG}
          carbsG={subtotal.carbsG}
          fatsG={subtotal.fatsG}
        />
        {portionTotals ? (
          // Redondeo entero + prefijo ~: valor referencial (coherente con el banner
          // de macros referenciales del paso Revisión).
          <p className="w-full text-xs text-muted">
            {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
          </p>
        ) : null}
      </div>
    </NutritionCard>
  )
}

// Ruta canonica de upgrade de plan. Se inlinea aca porque el modulo _lib/nutrition-pro.ts
// es server-only (import 'server-only') y no puede importarse en un client component.
// Nutricion Pro viene incluido en los planes pagos — el CTA apunta al cambio de plan.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'
// Estrategias que exigen el addon Nutricion Pro (frontera CEO): solo 'hybrid'. La UI marca
// y deshabilita estas opciones sin addon; el servidor (publishPlanAction) es la barrera real.
const PRO_STRATEGIES: readonly NutritionStrategy[] = ['hybrid']

function ProBadge() {
  return (
    <span className="shrink-0 rounded-pill border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary">
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
                    ? 'border-primary bg-primary/10 dark:bg-primary/10'
                    : 'border-border-default bg-surface-card hover:border-primary/40')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-base font-semibold text-strong">
                  {meta.label}
                  {isPro ? <ProBadge /> : null}
                </span>
                {active && !locked ? <Check className="h-5 w-5 shrink-0 text-primary dark:text-primary" /> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{meta.description}</p>
              {locked ? (
                <span className="mt-2 text-xs font-medium text-primary dark:text-primary">
                  Disponible con Nutricion Pro
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {!nutritionProEnabled ? (
        <div className="flex items-center gap-2.5 rounded-card border border-primary/30 bg-primary/10 p-3 dark:border-primary/30 dark:bg-primary/10">
          {/* Ícono del módulo Nutrición Pro (asset del CEO, estático @2x). */}
          <Image
            src="/module-icons/nutrition-pro@2x.webp"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 shrink-0 object-contain"
          />
          <p className="text-xs text-muted">
            La estrategia hibrida es parte de Nutricion Pro, incluido en los planes pagos.{' '}
            <Link
              href={NUTRITION_PRO_UPGRADE_HREF}
              className="font-semibold text-primary underline underline-offset-2 dark:text-primary"
            >
              Mejorar mi plan
            </Link>
          </p>
        </div>
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
                className="h-4 w-4 accent-[var(--theme-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  portions,
}: {
  state: BuilderState
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
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
          <SlotEditor key={slot.key} slot={slot} clientId={clientId} dispatch={dispatch} errors={errors} portions={portions} />
        ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SLOT', key: genId() })}
          className={secondaryButtonClass + ' border-dashed px-4'}
        >
          <Plus className="h-4 w-4" />
          Agregar franja
        </button>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-default bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface-card/80 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total del dia</span>
          <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
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
  portions,
}: {
  state: BuilderState
  dispatch: Dispatch
  publishError: string | null
  portions: PortionsController
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
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted">Metas diarias</dt>
            <dd className="text-body">
              <MacroChipRow
                calories={numOrNull(state.targets.calories)}
                proteinG={numOrNull(state.targets.proteinG)}
                carbsG={numOrNull(state.targets.carbsG)}
                fatsG={numOrNull(state.targets.fatsG)}
              />
            </dd>
          </div>
          {usesSlots ? (
            <div>
              <dt className="mb-1 text-xs uppercase tracking-wide text-muted">
                Total prescrito · {state.slots.length} {state.slots.length === 1 ? 'franja' : 'franjas'}
              </dt>
              <dd className="text-body">
                <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
              </dd>
            </div>
          ) : null}
        </dl>
      </NutritionCard>

      {/* NUEVO (SPEC UX-a): chips read-only portionsSummaryLabel por franja + banner de
          macros referenciales. El MacroBudget/totales existentes no se duplican. */}
      {usesSlots ? <PortionsReviewSection slots={state.slots} controller={portions} /> : null}

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
            Para copiar este plan a otros alumnos, usa &quot;Asignar a otros alumnos&quot; desde la ficha después de publicar.
            Cada cambio publica una versión nueva y la anterior queda en el historial. Las plantillas reutilizables todavía
            no están disponibles.
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

// Stepper compacto para movil (patron "text stepper" de wizards 2026: "Paso X de N" + barra
// segmentada de progreso). Muestra SOLO el paso actual para no empujar el contenido hacia abajo
// en pantallas angostas; la lista completa de pasos vive en BuilderStepList (desktop, lg+).
// Presentacional puro: consume el mismo modelo de pasos que BuilderStepList.
function MobileBuilderStepper({ steps }: { steps: NutritionBuilderStepModel[] }) {
  const activeIndex = steps.findIndex((s) => s.state === 'current' || s.state === 'error')
  const currentIndex = activeIndex === -1 ? 0 : activeIndex
  const current = steps[currentIndex]
  const next = steps[currentIndex + 1]
  const hasError = current?.state === 'error'
  return (
    <div
      data-testid="nutrition-v2-builder-stepper-mobile"
      aria-label="Progreso del constructor"
      className="rounded-card border border-border-subtle bg-surface-card p-3 lg:hidden"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-sm font-semibold text-strong">
          {current?.label}
          {current?.description ? (
            <span className="font-sans text-xs font-normal text-muted"> · {current.description}</span>
          ) : null}
        </p>
        <p className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Paso {currentIndex + 1} de {steps.length}
        </p>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s.id}
            className={
              'h-1 flex-1 rounded-pill transition-colors ' +
              (i === currentIndex && hasError
                ? 'bg-rose-500'
                : i <= currentIndex
                  ? 'bg-primary/100'
                  : 'bg-border-subtle')
            }
          />
        ))}
      </div>
      {next ? <p className="mt-1.5 truncate text-[11px] text-subtle">Siguiente: {next.label}</p> : null}
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
  existingPlan: {
    id: string
    versionNumber: number
    strategy: NutritionStrategy
    effectiveFrom: string
    name: string
  } | null
  today: string
  nutritionProEnabled: boolean
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(builderReducer, today, createEmptyBuilderState)
  // Porciones a elección: controller hermano del reducer (mapa slot.key → targets +
  // catálogo de grupos con carga perezosa). Claves de franjas borradas quedan huérfanas
  // sin efecto: attach/derive filtran por las franjas vivas de state.slots.
  const portions = usePortionsBuilder(clientId)
  const [showErrors, setShowErrors] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const operationId = useRef(genId())
  // Estado de recuperacion del "Archivar y reemplazar" (ver handleReplaceToday). Sobreviven a un
  // fallo parcial para que el REINTENTO no repita el paso ya cumplido ni cree planes duplicados:
  // - replaceArchivedRef: el plan viejo YA se archivo -> el reintento salta directo a publicar.
  // - replaceKeyRef: clave de idempotencia ESTABLE del reemplazo -> re-publicar devuelve el MISMO
  //   plan/version en vez de crear un duplicado. Se resetean al cerrar el modal (fresh open limpio).
  const replaceArchivedRef = useRef(false)
  const replaceKeyRef = useRef<string | null>(null)

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

  const goToPublished = () => router.push('/coach/nutrition-v2/' + clientId + '?published=1')

  // Clave de idempotencia FRESCA por cada intento real: cambia el destino (misma version vs
  // plan nuevo) y evita reutilizar la clave de un intento fallido (riesgo de versiones draft
  // huerfanas). El bloqueo de doble-submit lo da isPending + botones deshabilitados.
  function freshIdempotencyKey(): string {
    operationId.current = genId()
    return buildNutritionIdempotencyKey({
      clientId,
      deviceId: 'web-builder',
      operationId: operationId.current,
      kind: 'publish',
    })
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
      draft = attachPortionsAndValidate(draft, state.slots.map((s) => s.key), portions.bySlot)
    } catch {
      setShowErrors(true)
      setError('El plan tiene datos incompletos. Revisa los pasos marcados y vuelve a intentar.')
      if (inModal) setConflictOpen(false)
      return
    }

    const idempotencyKey = freshIdempotencyKey()
    startTransition(async () => {
      const res = await publishPlanAction({ draft, idempotencyKey, effectiveFrom })
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
      draft = attachPortionsAndValidate(draft, state.slots.map((s) => s.key), portions.bySlot)
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

  return (
    <>
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
              Al publicar se creará la versión {existingPlan.versionNumber + 1} y la actual pasará a histórico.
            </span>
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {state.step === 0 ? (
          <StrategyStep state={state} dispatch={dispatch} nutritionProEnabled={nutritionProEnabled} />
        ) : null}
        {state.step === 1 ? (
          <>
            {/* NUEVO (SPEC UX-a / R6): con porciones en el draft, ofrece precargar los
                target_* derivados. Solo precarga tras el tap; nunca sobrescribe sola. */}
            <PortionsDeriveCard
              liveSlotKeys={state.slots.map((s) => s.key)}
              controller={portions}
              onApply={(totals) => {
                dispatch({ type: 'SET_TARGET', field: 'calories', value: String(Math.round(totals.calories)) })
                dispatch({ type: 'SET_TARGET', field: 'proteinG', value: String(Math.round(totals.proteinG)) })
                dispatch({ type: 'SET_TARGET', field: 'carbsG', value: String(Math.round(totals.carbsG)) })
                dispatch({ type: 'SET_TARGET', field: 'fatsG', value: String(Math.round(totals.fatsG)) })
              }}
            />
            <TargetsStep state={state} dispatch={dispatch} errors={showErrors ? validation.errors : {}} />
          </>
        ) : null}
        {state.step === 2 ? (
          <ConstructionStep state={state} clientId={clientId} dispatch={dispatch} errors={showErrors ? validation.errors : {}} portions={portions} />
        ) : null}
        {state.step === 3 ? <ReviewStep state={state} dispatch={dispatch} publishError={publishError} portions={portions} /> : null}

        {/* Controles del wizard: en movil la CTA primaria crece (target grande en la thumb zone);
            en sm+ vuelve a su ancho natural. "Atras" siempre visible (navegacion libre). */}
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <button type="button" onClick={handlePrev} disabled={state.step === 0 || isPending} className={secondaryButtonClass + ' shrink-0'}>
            <ChevronLeft className="h-4 w-4" />
            Atras
          </button>
          {state.step < 3 ? (
            <button type="button" onClick={handleNext} className={primaryButtonClass + ' flex-1 justify-center sm:flex-none'}>
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPending}
              className={primaryButtonClass + ' flex-1 justify-center gap-2 sm:flex-none'}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Publicar plan
            </button>
          )}
        </div>
      </div>
    </div>

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
    </>
  )
}
