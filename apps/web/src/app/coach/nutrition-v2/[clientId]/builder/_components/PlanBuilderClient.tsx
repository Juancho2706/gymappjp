'use client'

import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, CopyCheck, History, Info, Loader2, Plus, Repeat, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { BuilderStepList, DayVariantWeekStrip, MacroBudget, NutritionCard, StrategyBadge } from '@/components/nutrition-v2'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  NUTRITION_STRATEGIES,
  buildNutritionIdempotencyKey,
  sortNutritionDayVariantsForDisplay,
  type FoodCatalogCursor,
  type FoodCatalogItem,
  type NutritionBuilderStepModel,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import {
  BUILDER_UNITS,
  CoachFoodInputSchema,
  MAX_DAY_VARIANTS,
  MAX_ITEM_SUBSTITUTIONS,
  activeVariantOf,
  assembleAndValidateDraft,
  autoVariantLabel,
  baseVariantOf,
  builderReducer,
  clonedKey,
  createEmptyBuilderState,
  customMacrosOf,
  itemMacros,
  macroEnergyMismatch,
  resolveSlotCopyTargets,
  slotsLostIfFlexible,
  slotSubtotal,
  strategyUsesSlots,
  takenDayOfWeeks,
  validateStep,
  variantEffectiveTargets,
  variantTotals,
  type BuilderFood,
  type BuilderItem,
  type BuilderSlot,
  type BuilderState,
  type BuilderTargets,
  type BuilderVariant,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
// Porciones a elección (T1.1): capa opcional sobre structured/hybrid (SPEC R1). El estado
// vive en un controller hermano del reducer (no se toca _lib/draft-builder) y se inyecta
// al draft canónico justo antes de publicar (attachPortionsAndValidate).
import { PortionsSection, usePortionsBuilder, type PortionsController } from './PortionsSection'
import { PortionsDeriveCard } from './PortionsDeriveCard'
import { PortionsReviewSection } from './PortionsReviewChips'
import {
  attachPortionsAndValidate,
  combineSubtotals,
  derivePortionTotals,
  portionsKey,
  slotPortionTotals,
  variantPortionKeys,
  type PortionsBySlot,
} from './portions-state'
// Multi-dia (SPEC nutrition-multiday): barra de chips de dias + popover "Agregar dia".
import { DayVariantBar, type DayVariantBarHandlers } from './DayVariantBar'
// El menu "Copiar a otros dias" de la franja usa el MISMO patron responsive del "Agregar dia"
// (popover en desktop / bottom sheet en movil), asi que reusa su hook en vez de copiarlo.
import { useIsDesktopMd } from './AddDayPopover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
// Respaldo LOCAL del wizard (W3b): store puro versionado en localStorage. El coach retoma un
// plan a medio construir si cerró la PWA / mató la pestaña. La key incluye clientId + planId.
import {
  builderDraftKey,
  clearNutritionDraft,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} from '@/lib/nutrition-coach-draft-store'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { loadExchangeGroupsForBuilderAction } from './PortionsGroupsAction'
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
  // Apilado debajo del nombre (dentro del contenedor flex-1), en su propia fila:
  // las macros ocupan el ancho completo y no compiten horizontalmente con el nombre.
  return (
    <div className="mt-1">
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

/**
 * Bloque opcional "Equivalencia de porciones" del alta rapida del builder (P-B). Colapsado
 * por defecto; el catalogo de grupos se carga PEREZOSAMENTE al expandir, con la MISMA server
 * action del picker de porciones (`loadExchangeGroupsForBuilderAction`): los services de
 * intercambios jamas entran al bundle cliente.
 */
function FreeFoodEquivalenceBlock({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: { groupId: string; grams: string; label: string }
  onChange: (next: { groupId: string; grams: string; label: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<ExchangeGroup[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function expand() {
    setExpanded(true)
    if (groups || loading) return
    setLoading(true)
    setLoadError(null)
    const res = await loadExchangeGroupsForBuilderAction({ clientId })
    setLoading(false)
    if (!res.ok) {
      setLoadError(PORTIONS_COPY.foodEquivalence.groupsError)
      return
    }
    setGroups(res.groups)
  }

  function collapse() {
    setExpanded(false)
    onChange({ groupId: '', grams: '', label: '' })
  }

  const copy = PORTIONS_COPY.foodEquivalence

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => (expanded ? collapse() : void expand())}
        aria-expanded={expanded}
        className="text-xs font-semibold text-primary transition-colors hover:underline min-h-9"
      >
        {expanded ? copy.collapse : copy.expand}
      </button>
      {expanded ? (
        <div className="mt-1.5 space-y-2">
          <p className="text-[11px] text-muted">{copy.sectionHint}</p>
          {loading ? (
            <p className="text-[11px] text-muted">{copy.groupsLoading}</p>
          ) : loadError ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-300">{loadError}</p>
          ) : (groups ?? []).length === 0 ? (
            <p className="text-[11px] text-muted">{copy.groupsEmpty}</p>
          ) : (
            <>
              <label className="block">
                <span className={labelClass}>{copy.groupLabel}</span>
                <select
                  className={macroInputClass}
                  value={value.groupId}
                  onChange={(e) => onChange({ ...value, groupId: e.target.value })}
                >
                  <option value="">{copy.groupPlaceholder}</option>
                  {(groups ?? []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.code} · {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={labelClass}>{copy.gramsLabel}</span>
                  <input
                    className={macroInputClass}
                    inputMode="numeric"
                    placeholder={copy.gramsPlaceholder}
                    value={value.grams}
                    onChange={(e) => onChange({ ...value, grams: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>{copy.labelLabel}</span>
                  <input
                    className={macroInputClass}
                    maxLength={40}
                    placeholder={copy.labelPlaceholder}
                    value={value.label}
                    onChange={(e) => onChange({ ...value, label: e.target.value })}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function FreeFoodFields({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
}: {
  item: BuilderItem
  variantKey: string
  slotKey: string
  clientId: string
  dispatch: Dispatch
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [equivalence, setEquivalence] = useState({ groupId: '', grams: '', label: '' })
  const macros = customMacrosOf(item)
  const showWarning = macroEnergyMismatch(macros)
  const unit = item.unit === 'ml' ? 'ml' : 'g'

  async function handleSave() {
    setSaveError(null)
    const gramsRaw = equivalence.grams.trim().replace(',', '.')
    const parsed = CoachFoodInputSchema.safeParse({
      clientId,
      name: (item.customName ?? '').trim(),
      brand: null,
      unit,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatsG: macros.fatsG,
      exchangeGroupId: equivalence.groupId === '' ? null : equivalence.groupId,
      exchangePortionGrams: gramsRaw === '' ? null : Number(gramsRaw),
      exchangePortionLabel: equivalence.label.trim() === '' ? null : equivalence.label.trim(),
    })
    if (!parsed.success) {
      // El trio de equivalencia tiene mensajes propios (grupo sin gramos y viceversa); el
      // resto cae al copy generico de macros.
      const equivalenceIssue = parsed.error.issues.find((issue) =>
        String(issue.path[0] ?? '').startsWith('exchange'),
      )
      setSaveError(
        equivalenceIssue?.message ??
          'Completa el nombre y macros validas (no negativas) antes de guardar.',
      )
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
    setEquivalence({ groupId: '', grams: '', label: '' })
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
              onChange={(e) =>
                dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { [field]: e.target.value } })
              }
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
      <FreeFoodEquivalenceBlock clientId={clientId} value={equivalence} onChange={setEquivalence} />
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

// Reemplazos autorizados por el coach (F-02): afordancia compacta bajo cada item prescrito.
// "+ Reemplazo" abre el MISMO buscador de catalogo del builder (FoodSearch) y agrega el
// alimento elegido como chip removible (tope MAX_ITEM_SUBSTITUTIONS). Solo se monta dentro
// de ItemRow, que a su vez solo existe en structured/hybrid (SlotEditor). El alumno vera
// estas opciones; el server congela el snapshot de cada reemplazo al publicar.
function SubstitutionsField({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
}: {
  item: BuilderItem
  variantKey: string
  slotKey: string
  clientId: string
  dispatch: Dispatch
}) {
  const [open, setOpen] = useState(false)
  const subs = item.substitutions ?? []
  const atCap = subs.length >= MAX_ITEM_SUBSTITUTIONS
  const prescribedName = item.food ? item.food.name : (item.customName?.trim() || 'este alimento')

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Repeat aria-hidden="true" className="h-3.5 w-3.5" />
          Reemplazos autorizados
        </span>
        {subs.length > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-subtle">
            {subs.length}/{MAX_ITEM_SUBSTITUTIONS}
          </span>
        ) : null}
      </div>

      {subs.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {subs.map((sub) => (
            <li
              key={sub.key}
              className="inline-flex max-w-full items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken py-0.5 pl-2.5 pr-1 text-xs text-body"
            >
              <span className="min-w-0 truncate">{sub.food.name}</span>
              <button
                type="button"
                aria-label={`Quitar reemplazo ${sub.food.name}`}
                onClick={() => dispatch({ type: 'REMOVE_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: item.key, subKey: sub.key })}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-card hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] leading-snug text-subtle">
          Alimentos que el alumno puede usar en lugar de {prescribedName}.
        </p>
      )}

      {atCap ? (
        <p className="mt-1.5 text-[11px] text-subtle">Alcanzaste el maximo de {MAX_ITEM_SUBSTITUTIONS} reemplazos.</p>
      ) : open ? (
        <div className="mt-2 space-y-2">
          <FoodSearch
            clientId={clientId}
            onPick={(food) =>
              dispatch({ type: 'ADD_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: item.key, key: genId(), food })
            }
          />
          <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass + ' min-h-9 px-3 text-xs'}>
            Listo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={secondaryButtonClass + ' mt-1.5 min-h-9 px-3 text-xs'}
        >
          <Plus className="h-3.5 w-3.5" />
          Reemplazo
        </button>
      )}
    </div>
  )
}

function ItemRow({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
  error,
}: {
  item: BuilderItem
  variantKey: string
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
              onChange={(e) =>
                dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { customName: e.target.value } })
              }
            />
          )}
          <PortionMacros item={item} />
        </div>
        <button
          type="button"
          aria-label={`Quitar ${displayName || 'alimento'}`}
          onClick={() => dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })}
          className={iconButtonClass + ' shrink-0'}
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
          onChange={(e) =>
            dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { quantity: e.target.value } })
          }
        />
        <select
          className={inputClass + ' max-w-24'}
          aria-label="Unidad"
          value={item.unit}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_ITEM',
              variantKey,
              slotKey,
              itemKey: item.key,
              patch: { unit: e.target.value as BuilderItem['unit'] },
            })
          }
        >
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {!item.food ? (
        <FreeFoodFields item={item} variantKey={variantKey} slotKey={slotKey} clientId={clientId} dispatch={dispatch} />
      ) : null}

      <SubstitutionsField item={item} variantKey={variantKey} slotKey={slotKey} clientId={clientId} dispatch={dispatch} />

      {error?.food ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.food}</p> : null}
      {error?.quantity ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.quantity}</p> : null}
    </div>
  )
}

/** Copia de UNA franja a otros días: lo que el menú de la franja le pide al wizard (P0-4). */
export interface SlotCopyRequest {
  sourceVariantKey: string
  slotKey: string
  targetVariantKeys: string[]
}

/**
 * Menú de la franja: "Copiar a otros días" (P0-4). El flujo real del coach es "el sábado es
 * igual pero cambia el almuerzo": sin esto había que duplicar el día entero o retipear cada
 * alimento buscándolo de nuevo en el catálogo.
 *
 * Un solo panel (popover en desktop / bottom sheet en móvil, mismo patrón que "Agregar día"):
 * atajo "Aplicar a todos los días" + multi-select de días destino. La copia lleva alimentos,
 * reemplazos y porciones, y REEMPLAZA la franja del mismo nombre del destino (merge por
 * nombre del reducer) — se dice explícito en el panel, no se descubre después.
 */
function CopySlotMenu({
  slot,
  variantKey,
  variants,
  onCopySlot,
}: {
  slot: BuilderSlot
  variantKey: string
  variants: BuilderVariant[]
  onCopySlot: (request: SlotCopyRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const isDesktop = useIsDesktopMd()
  // Días destino en el orden canónico de lectura (base + Lu→Do), sin el día de origen.
  const targets = useMemo(
    () => sortNutritionDayVariantsForDisplay(variants).filter((variant) => variant.key !== variantKey),
    [variants, variantKey],
  )
  const slotLabel = slot.name.trim() || 'esta franja'

  function handleOpenChange(next: boolean) {
    if (next) setSelected([])
    setOpen(next)
  }

  function copyTo(targetVariantKeys: string[]) {
    if (targetVariantKeys.length === 0) return
    onCopySlot({ sourceVariantKey: variantKey, slotKey: slot.key, targetVariantKeys })
    setOpen(false)
  }

  const body = (
    <div className="space-y-3 p-1">
      <p className="text-xs leading-relaxed text-muted">
        Copia <span className="font-semibold text-strong">{slotLabel}</span> con sus alimentos y porciones. Reemplaza
        la franja del mismo nombre en el día destino.
      </p>
      <button
        type="button"
        onClick={() => copyTo(targets.map((variant) => variant.key))}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CopyCheck aria-hidden="true" className="h-4 w-4 text-muted" />
        Aplicar a todos los días
      </button>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">O elige los días</p>
        <div className="flex flex-wrap gap-1.5">
          {targets.map((variant) => {
            const isOn = selected.includes(variant.key)
            return (
              <button
                key={variant.key}
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(variant.key) ? prev.filter((key) => key !== variant.key) : [...prev, variant.key],
                  )
                }
                className={
                  'inline-flex min-h-11 items-center rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isOn
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-default bg-surface-card text-strong hover:border-primary/40')
                }
              >
                {variant.label}
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => copyTo(selected)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
        {selected.length <= 1 ? 'Copiar al día elegido' : `Copiar a ${selected.length} días`}
      </button>
    </div>
  )

  // El nombre accesible empieza con el texto visible (WCAG 2.5.3) y agrega de qué franja habla.
  const triggerLabel = `Copiar a otros días: ${slot.name.trim() || 'franja sin nombre'}`
  const trigger = (
    <>
      <Copy aria-hidden="true" className="h-4 w-4" />
      Copiar a otros días
    </>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger aria-label={triggerLabel} className={secondaryButtonClass}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 rounded-card border border-border-subtle bg-surface-card p-2 text-body shadow-lg"
        >
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <button type="button" aria-label={triggerLabel} onClick={() => handleOpenChange(true)} className={secondaryButtonClass}>
        {trigger}
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
              Copiar a otros días
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function SlotEditor({
  slot,
  variantKey,
  variants,
  clientId,
  dispatch,
  errors,
  portions,
  onCopySlot,
}: {
  slot: BuilderSlot
  /** Día (variante) al que pertenece la franja: toda mutación viaja scoped a él. */
  variantKey: string
  /** Días del plan: con más de uno aparece el menú "Copiar a otros días". */
  variants: BuilderVariant[]
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
  onCopySlot: (request: SlotCopyRequest) => void
}) {
  // Fix QA F1-2: el subtotal de franja combina items fijos + derivado de porciones
  // (Σ porciones × ref del grupo, catálogo VIVO del picker). Catálogo sin cargar o
  // franja sin porciones ⇒ solo items, idéntico a antes (sin NaN jamás).
  // Multi-día: la clave de porciones es `variantKey::slotKey` — dos días con una franja
  // homónima ("Almuerzo" clonado) ya no comparten porciones.
  const portionsSlotKey = portionsKey(variantKey, slot.key)
  const itemsSubtotal = slotSubtotal(slot)
  const portionTotals = slotPortionTotals(portions.bySlot, portionsSlotKey, portions.groups)
  const subtotal = combineSubtotals(itemsSubtotal, portionTotals)
  // El menú de copia solo tiene sentido con más de un día en el plan.
  const canCopyToOtherDays = variants.length > 1
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
          onChange={(e) => dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { name: e.target.value } })}
        />
        <input
          id={`slot-time-${slot.key}`}
          className={inputClass + ' w-28'}
          type="time"
          value={slot.startTime}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { startTime: e.target.value } })
          }
        />
        <button
          type="button"
          aria-label={`Quitar franja ${slot.name || 'sin nombre'}`}
          onClick={() => dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey: slot.key })}
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
            variantKey={variantKey}
            slotKey={slot.key}
            clientId={clientId}
            dispatch={dispatch}
            error={{ food: errors['item.' + item.key + '.food'], quantity: errors['item.' + item.key + '.quantity'] }}
          />
        ))}
      </div>

      <div className="mt-3">
        <FoodSearch
          clientId={clientId}
          onPick={(food) => dispatch({ type: 'ADD_ITEM', variantKey, slotKey: slot.key, key: genId(), food })}
        />
        {/* Acciones de la franja. "Copiar a otros días" vive acá —visible, con etiqueta— y no
            escondida tras un ⋯: es la acción que hoy obliga a retipear medio plan (P0-4), y el
            header ya está al límite de ancho en 360 px. Solo aparece en planes multi-día. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_ITEM', variantKey, slotKey: slot.key, key: genId(), food: null })}
            className={secondaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Alimento libre (con macros)
          </button>
          {canCopyToOtherDays ? (
            <CopySlotMenu slot={slot} variantKey={variantKey} variants={variants} onCopySlot={onCopySlot} />
          ) : null}
        </div>
      </div>

      {/* NUEVO (SPEC UX-a): sección "Porciones a elección", hermana de la lista de
          alimentos, debajo de "+ Alimento". Solo existe en structured/hybrid (SlotEditor
          no se monta en planes flexibles — R1). */}
      <PortionsSection slotKey={portionsSlotKey} slotName={slot.name} controller={portions} />

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
  // Confirmacion antes de perder franjas (bug 2.3.5 de la auditoria): elegir "flexible"
  // con contenido en cualquier dia BORRABA todas las franjas sin aviso ni deshacer. El
  // reducer sigue ejecutando el borrado tal cual (es puro, no pregunta); esta UI decide
  // si hace falta preguntar antes de despachar.
  const [confirmFlexible, setConfirmFlexible] = useState(false)
  const slotsAtRisk = slotsLostIfFlexible(state)

  function pickStrategy(key: NutritionStrategy) {
    dispatch({ type: 'SET_STRATEGY', strategy: key, firstSlotKey: genId() })
  }

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
                // No-op: re-tocar la MISMA estrategia no hace nada (el reducer tambien lo
                // corta; cortar aca evita ademas disparar el candado Pro sin necesidad).
                if (locked || active) return
                if (key === 'flexible' && slotsAtRisk > 0) {
                  setConfirmFlexible(true)
                  return
                }
                pickStrategy(key)
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
      <AlertDialog open={confirmFlexible} onOpenChange={setConfirmFlexible}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="normal-case tracking-tight">Cambiar a flexible</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiar a flexible elimina {slotsAtRisk === 1 ? 'la' : 'las'} {slotsAtRisk}{' '}
              {slotsAtRisk === 1 ? 'franja' : 'franjas'} de tus días. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmFlexible(false)
                pickStrategy('flexible')
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <p className="px-1 pb-2 text-xs text-muted">Qué puede hacer el alumno con este plan, más allá de seguirlo.</p>
          {([
            ['canRegisterFreely', 'Registro libre', 'Puede anotar alimentos fuera de lo prescrito.'],
            ['canAdjustPrescribedQuantity', 'Ajustar cantidades', 'Puede cambiar la cantidad de un alimento prescrito.'],
          ] as const).map(([field, label, hint]) => (
            <label key={field} className="flex min-h-11 items-start gap-2 py-1 text-sm text-body">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--theme-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                checked={state.permissions[field]}
                onChange={(e) => dispatch({ type: 'SET_PERMISSION', field, value: e.target.checked })}
              />
              <span>
                <span className="block font-medium text-strong">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

function DaySummary({
  state,
  variant,
  totals,
  portions,
}: {
  state: BuilderState
  /** Dia en edicion: el resumen es SIEMPRE del dia que el coach tiene en pantalla. */
  variant: BuilderVariant
  totals: ItemMacros
  portions: PortionsController
}) {
  // Metas contra las que se compara: las propias del dia si las personalizo, si no las del base.
  const targets = variantEffectiveTargets(state, variant)
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-semibold text-strong">
        {variant.isDefault ? 'Resumen del día base' : 'Resumen de ' + variant.label}
      </h3>
      <MacroBudget
        calories={{ consumed: totals.calories, target: numOr0(targets.calories) }}
        macros={[
          { macro: 'protein', consumed: totals.proteinG, target: numOr0(targets.proteinG) },
          { macro: 'carbs', consumed: totals.carbsG, target: numOr0(targets.carbsG) },
          { macro: 'fats', consumed: totals.fatsG, target: numOr0(targets.fatsG) },
        ]}
      />
      <NutritionCard>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Por franja</p>
        {variant.slots.length === 0 ? (
          <p className="text-sm text-muted">Agrega una franja para ver el desglose del dia.</p>
        ) : (
          <ul className="space-y-2">
            {variant.slots.map((slot) => {
              // El desglose "Por franja" combina items + porciones a eleccion, igual que el
              // subtotal de la card de la franja (antes mostraba solo los items).
              const s = combineSubtotals(
                slotSubtotal(slot),
                slotPortionTotals(portions.bySlot, portionsKey(variant.key, slot.key), portions.groups),
              )
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

/**
 * Errores de validación agrupados POR DÍA (P2-1). `validateStep` valida TODOS los días, pero
 * sus claves son de franja/item: sin este mapeo el coach veía "Cantidad invalida" sin saber en
 * qué día está. Devuelve el PRIMER problema de cada día, que es lo que se pinta en el chip y
 * en el aviso con enlace al día.
 */
function variantErrorsOf(state: BuilderState, errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (Object.keys(errors).length === 0) return out
  for (const variant of state.variants) {
    const missingSlots = errors['variant.' + variant.key + '.slots']
    if (missingSlots) {
      out[variant.key] = missingSlots
      continue
    }
    for (const slot of variant.slots) {
      const slotError = errors['slot.' + slot.key + '.name'] ?? errors['slot.' + slot.key + '.startTime']
      if (slotError) {
        out[variant.key] = slotError
        break
      }
      const itemError = slot.items
        .map((item) => errors['item.' + item.key + '.food'] ?? errors['item.' + item.key + '.quantity'])
        .find((message) => Boolean(message))
      if (itemError) {
        out[variant.key] = itemError
        break
      }
    }
  }
  return out
}

function ConstructionStep({
  state,
  clientId,
  dispatch,
  errors,
  portions,
  dayHandlers,
  addDayLocked,
  onCopySlot,
}: {
  state: BuilderState
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
  dayHandlers: DayVariantBarHandlers
  addDayLocked: boolean
  onCopySlot: (request: SlotCopyRequest) => void
}) {
  // Multi-dia: se edita SIEMPRE el dia activo de la barra de chips; los totales, el resumen
  // lateral y las porciones son de ese dia.
  const variant = activeVariantOf(state)
  // "Total del dia" = items fijos + porciones a eleccion de TODAS las franjas vivas del dia
  // (paridad con RN y con el subtotal de cada franja). Antes solo sumaba items: la misma
  // pantalla mostraba "Subtotal franja 620 kcal" y "Total del dia 180 kcal" (queja del coach).
  const portionDay = portions.groups
    ? derivePortionTotals(
        variant.slots.map((slot) => portionsKey(variant.key, slot.key)),
        portions.bySlot,
        portions.groups,
      )
    : null
  const totals = combineSubtotals(variantTotals(variant), portionDay)
  // kcal por dia para los chips (items + porciones, mismo criterio que el total del dia).
  const kcalByVariantKey: Record<string, number> = {}
  for (const v of state.variants) {
    const vPortions = portions.groups
      ? derivePortionTotals(v.slots.map((slot) => portionsKey(v.key, slot.key)), portions.bySlot, portions.groups)
      : null
    kcalByVariantKey[v.key] = combineSubtotals(variantTotals(v), vPortions).calories
  }
  const slotsError = errors['variant.' + variant.key + '.slots'] ?? errors.slots
  // P2-1: qué día tiene el problema, y un atajo para saltar ahí. Con un solo día del plan el
  // aviso sigue siendo el texto de siempre (no hay a dónde saltar).
  const dayErrors = variantErrorsOf(state, errors)
  const daysWithErrors = sortNutritionDayVariantsForDisplay(state.variants).filter(
    (candidate) => dayErrors[candidate.key],
  )
  const showDayErrorNav = state.variants.length > 1 && daysWithErrors.length > 0
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
        {/* Barra de dias (multi-dia): chips + "Agregar dia" + menu de dia + banner de herencia. */}
        <DayVariantBar
          variants={state.variants}
          activeVariantKey={variant.key}
          kcalByVariantKey={kcalByVariantKey}
          baseTargets={state.targets}
          addDayLocked={addDayLocked}
          errorByVariantKey={dayErrors}
          handlers={dayHandlers}
        />
        {showDayErrorNav ? (
          <div
            role="alert"
            className="rounded-control border border-rose-300 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/40"
          >
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {daysWithErrors.length === 1 ? 'Revisa este día antes de continuar:' : 'Revisa estos días antes de continuar:'}
            </p>
            <ul className="mt-1.5 space-y-1">
              {daysWithErrors.map((candidate) => (
                <li key={candidate.key}>
                  <button
                    type="button"
                    onClick={() => dayHandlers.onSelect(candidate.key)}
                    className="inline-flex min-h-9 w-full items-center gap-1.5 rounded-control px-1 text-left text-xs text-rose-700 transition-colors hover:bg-rose-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <span className="font-semibold underline underline-offset-2">{candidate.label}</span>
                    <span className="min-w-0 flex-1 truncate">{dayErrors[candidate.key]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : slotsError ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">{slotsError}</p>
        ) : null}
        {variant.slots.map((slot) => (
          <SlotEditor
            key={slot.key}
            slot={slot}
            variantKey={variant.key}
            variants={state.variants}
            clientId={clientId}
            dispatch={dispatch}
            errors={errors}
            portions={portions}
            onCopySlot={onCopySlot}
          />
        ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SLOT', variantKey: variant.key, key: genId() })}
          className={secondaryButtonClass + ' border-dashed px-4'}
        >
          <Plus className="h-4 w-4" />
          Agregar franja
        </button>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-default bg-surface-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface-card/80 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {variant.isDefault ? 'Total del día base' : 'Total de ' + variant.label}
          </span>
          <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
          {portionDay ? (
            <p className="w-full text-xs text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionDay.calories)))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="lg:sticky lg:top-6">
          <DaySummary state={state} variant={variant} totals={totals} portions={portions} />
        </div>
      </div>
    </div>
  )
}

const REVIEW_TARGET_FIELDS: Array<{ field: keyof BuilderTargets; label: string }> = [
  { field: 'calories', label: 'kcal' },
  { field: 'proteinG', label: 'P' },
  { field: 'carbsG', label: 'C' },
  { field: 'fatsG', label: 'G' },
]

/** Nombre visible de un item prescrito en la lectura compacta del paso Revisar. */
function itemDisplayName(item: BuilderItem): string {
  if (item.food) return item.food.name
  const custom = (item.customName ?? '').trim()
  return custom === '' ? 'Alimento sin nombre' : custom
}

/**
 * Lectura compacta del contenido de un dia en el paso Revisar (P1-6): franjas con su hora y,
 * bajo cada una, sus alimentos en UNA linea (nombre con ellipsis + cantidad tabular). Antes la
 * revision solo mostraba numeros abstractos: el coach tenia que volver al paso 3 y navegar por
 * chips para saber que iba a publicar. No edita nada; el detalle fino sigue en Construccion.
 */
function ReviewSlotList({ slots }: { slots: BuilderSlot[] }) {
  if (slots.length === 0) return null
  return (
    <ul className="mt-3 space-y-2 border-t border-border-subtle pt-3">
      {slots.map((slot) => (
        <li key={slot.key}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-strong">{slot.name.trim() || 'Franja sin nombre'}</p>
            {slot.startTime.trim() !== '' ? (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{slot.startTime}</span>
            ) : null}
          </div>
          {slot.items.length === 0 ? (
            <p className="text-xs text-subtle">Sin alimentos fijos</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {slot.items.map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-body">
                    {itemDisplayName(item)}
                    {item.optional ? <span className="text-subtle"> · opcional</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                    {item.quantity.trim() === '' ? '—' : item.quantity + ' ' + item.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Card de UN dia en el paso Revisar (multi-dia): tira Lu-Do de los dias que le tocan,
 * objetivos efectivos con las DIFERENCIAS vs el dia base resaltadas, total prescrito del dia,
 * la lectura compacta de sus franjas/alimentos y sus chips de porciones. Solo se monta cuando
 * el plan tiene mas de un dia.
 */
function ReviewDayCard({
  state,
  variant,
  portions,
}: {
  state: BuilderState
  variant: BuilderVariant
  portions: PortionsController
}) {
  const keys = variant.slots.map((slot) => portionsKey(variant.key, slot.key))
  const dayPortions = portions.groups ? derivePortionTotals(keys, portions.bySlot, portions.groups) : null
  const totals = combineSubtotals(variantTotals(variant), dayPortions)
  const targets = variantEffectiveTargets(state, variant)
  const diffs = variant.isDefault
    ? []
    : REVIEW_TARGET_FIELDS.filter(({ field }) => targets[field].trim() !== state.targets[field].trim())

  return (
    <NutritionCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base font-semibold text-strong">{variant.label}</p>
        <span className="font-mono text-xs tabular-nums text-muted">
          {variant.slots.length} {variant.slots.length === 1 ? 'franja' : 'franjas'}
        </span>
      </div>
      <DayVariantWeekStrip variants={state.variants} variant={variant} />

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="mb-1 text-xs uppercase tracking-wide text-muted">Objetivos del dia</dt>
          <dd className="text-body">
            <MacroChipRow
              calories={numOrNull(targets.calories)}
              proteinG={numOrNull(targets.proteinG)}
              carbsG={numOrNull(targets.carbsG)}
              fatsG={numOrNull(targets.fatsG)}
            />
            {diffs.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {diffs.map(({ field, label }) => (
                  <li
                    key={field}
                    className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    {label}: {targets[field].trim() === '' ? 'sin meta' : targets[field]} (base{' '}
                    {state.targets[field].trim() === '' ? 'sin meta' : state.targets[field]})
                  </li>
                ))}
              </ul>
            ) : variant.isDefault ? null : (
              <p className="mt-1 text-xs text-subtle">Usa los objetivos del dia base.</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs uppercase tracking-wide text-muted">Total prescrito</dt>
          <dd className="text-body">
            <MacroChipRow
              calories={totals.calories}
              proteinG={totals.proteinG}
              carbsG={totals.carbsG}
              fatsG={totals.fatsG}
            />
            {dayPortions ? (
              <p className="mt-1 text-xs text-muted">
                {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(dayPortions.calories)))}
              </p>
            ) : null}
          </dd>
        </div>
      </dl>

      <ReviewSlotList slots={variant.slots} />

      <PortionsReviewSection
        slots={variant.slots.map((slot) => ({ key: portionsKey(variant.key, slot.key), name: slot.name }))}
        controller={portions}
      />
    </NutritionCard>
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
  const multiDay = state.variants.length > 1
  const base = baseVariantOf(state)
  const baseKeys = base.slots.map((slot) => portionsKey(base.key, slot.key))
  // "Total prescrito" combinado (items + porciones a eleccion): mismo criterio que el paso
  // Construccion; antes la revision mostraba un total menor al que el coach acababa de ver.
  const portionDay = portions.groups ? derivePortionTotals(baseKeys, portions.bySlot, portions.groups) : null
  const totals = combineSubtotals(variantTotals(base), portionDay)
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
            <dt className="mb-1 text-xs uppercase tracking-wide text-muted">
              {multiDay ? 'Metas del dia base' : 'Metas diarias'}
            </dt>
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
                Total prescrito · {base.slots.length} {base.slots.length === 1 ? 'franja' : 'franjas'}
              </dt>
              <dd className="text-body">
                <MacroChipRow calories={totals.calories} proteinG={totals.proteinG} carbsG={totals.carbsG} fatsG={totals.fatsG} />
                {portionDay ? (
                  <p className="mt-1 text-xs text-muted">
                    {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionDay.calories)))}
                  </p>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {/* P1-6: plan de un solo dia => la lectura del contenido va en esta misma card (con
            varios dias, cada ReviewDayCard trae la suya). */}
        {usesSlots && !multiDay ? <ReviewSlotList slots={base.slots} /> : null}
      </NutritionCard>

      {/* Multi-dia: la revision se agrupa POR DIA (totales del dia + diferencias vs el base).
          Un plan de un solo dia conserva la revision de siempre. */}
      {usesSlots && multiDay ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Dias del plan</p>
          {state.variants.map((variant) => (
            <ReviewDayCard key={variant.key} state={state} variant={variant} portions={portions} />
          ))}
        </div>
      ) : null}

      {/* NUEVO (SPEC UX-a): chips read-only portionsSummaryLabel por franja + banner de
          macros referenciales. El MacroBudget/totales existentes no se duplican. */}
      {usesSlots && !multiDay ? (
        <PortionsReviewSection
          slots={base.slots.map((slot) => ({ key: portionsKey(base.key, slot.key), name: slot.name }))}
          controller={portions}
        />
      ) : null}

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

export function PlanBuilderClient({
  clientId,
  existingPlan,
  initialDraft,
  today,
  nutritionProEnabled,
}: {
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
}) {
  const router = useRouter()
  // Estado inicial: el plan vigente rehidratado si lo hay; si no, el wizard vacío de siempre.
  const [state, dispatch] = useReducer(builderReducer, initialDraft, (draft) =>
    draft ? draft.state : createEmptyBuilderState(today),
  )
  // Porciones a elección: controller hermano del reducer (mapa `variantKey::slotKey` → targets
  // + catálogo de grupos con carga perezosa). Claves de franjas/días borrados quedan huérfanas
  // sin efecto: attach/derive filtran por las franjas vivas de state.variants.
  const portions = usePortionsBuilder(clientId, initialDraft?.portionsBySlot)
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
  const legacyDraftKey = useMemo(
    () => builderDraftKey(clientId, existingPlan?.id ?? null),
    [clientId, existingPlan?.id],
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
  // Gate comercial (espejo de UI): mas de un dia exige Nutricion Pro. El servidor
  // (`publishPlanAction`) responde UPGRADE_REQUIRED con feature `multi_variant` — esta bandera
  // solo evita el callejon sin salida y muestra el upsell.
  const addDayLocked = !nutritionProEnabled

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
      // Borrador del formato viejo: ya migrado en memoria por `RESTORE`. Se borra la key v1
      // para que el proximo autosave (que escribe en la v2) no deje dos copias divergentes.
      if (migratedDraftRef.current) {
        clearNutritionDraft(legacyDraftKey)
        migratedDraftRef.current = false
      }
    }
    setShowDraftBanner(false)
  }

  // ── Multi-dia: handlers de la barra de dias ───────────────────────────────────────────────
  // Las porciones viven FUERA del reducer, asi que crear/duplicar/eliminar un dia mueve DOS
  // piezas: el arbol (dispatch) y el mapa de porciones (controller). Las keys de las franjas
  // clonadas son deterministas (`clonedKey`), asi que el mapa se re-etiqueta sin adivinar.

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

  function handleAddDays(days: number[], origin: 'copy-base' | 'empty') {
    // Se filtra aca lo mismo que rechaza el reducer (dia ocupado / tope), para que las keys
    // generadas queden alineadas con los dias que SI se crean y el clon de porciones no
    // apunte a una variante inexistente.
    const taken = new Set(takenDayOfWeeks(state))
    const accepted: number[] = []
    for (const day of days) {
      if (taken.has(day) || accepted.length + taken.size >= MAX_DAY_VARIANTS) continue
      accepted.push(day)
    }
    if (accepted.length === 0) return
    const keys = accepted.map(() => genId())
    dispatch({ type: 'ADD_VARIANTS', days: accepted, keys, origin })
    if (origin === 'copy-base') {
      const base = baseVariantOf(state)
      for (const key of keys) cloneVariantPortions(base, key)
    }
    // El reducer deja activo el PRIMER dia creado: eso es lo que se anuncia.
    const firstLabel = autoVariantLabel(accepted[0])
    announce(
      accepted.length === 1
        ? `Se creó ${firstLabel} — ahora estás editando ${firstLabel}`
        : `Se crearon ${accepted.length} días — ahora estás editando ${firstLabel}`,
    )
  }

  function handleDuplicateVariant(sourceVariantKey: string, dayOfWeek: number) {
    const source = state.variants.find((variant) => variant.key === sourceVariantKey)
    if (!source || takenDayOfWeeks(state).includes(dayOfWeek)) return
    const key = genId()
    dispatch({ type: 'DUPLICATE_VARIANT_AS', sourceVariantKey, key, dayOfWeek })
    cloneVariantPortions(source, key)
    const label = autoVariantLabel(dayOfWeek)
    announce(`Se creó ${label} con una copia de ${source.label} — ahora estás editando ${label}`)
  }

  // Eliminar un dia con DESHACER (paridad con la edicion rapida). Al deshacer se reinserta la
  // variante en su posicion sobre el estado VIGENTE (no se revierte lo editado entremedio) y
  // se reponen SUS porciones, que viven en el mapa hermano.
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
    setLiveMessage(`Se eliminó ${removed.label}`)
    toast(`Se eliminó ${removed.label}.`, {
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

  const dayHandlers: DayVariantBarHandlers = {
    onSelect: (variantKey) => dispatch({ type: 'SET_ACTIVE_VARIANT', variantKey }),
    onAddDays: handleAddDays,
    onRename: (variantKey, label) => dispatch({ type: 'SET_VARIANT_LABEL', variantKey, value: label }),
    onChangeDay: (variantKey, dayOfWeek) => dispatch({ type: 'SET_VARIANT_DAY', variantKey, dayOfWeek }),
    onDuplicate: handleDuplicateVariant,
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

  return (
    <>
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
              /* Las metas del paso "Objetivos" son las del dia BASE: la derivacion mira sus franjas. */
              liveSlotKeys={baseVariantOf(state).slots.map((slot) => portionsKey(baseVariantOf(state).key, slot.key))}
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
          <ConstructionStep
            state={state}
            clientId={clientId}
            dispatch={dispatch}
            errors={showErrors ? validation.errors : {}}
            portions={portions}
            dayHandlers={dayHandlers}
            addDayLocked={addDayLocked}
            onCopySlot={handleCopySlot}
          />
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
