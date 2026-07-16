'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Barcode, CheckCircle2, Link2, Loader2, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { NutritionStatePanel } from '@/components/nutrition-v2'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  createCoachFoodForCurationAction,
  listMissingFoodCodesHubAction,
  resolveMissingFoodCodeHubAction,
  type MissingCodeRow,
} from '../_actions/curation.actions'
import { searchFoodCatalogHubAction } from '../_actions/food-catalog.actions'

// Cola de curacion integrada al Centro V2. Los codigos escaneados sin match local se
// listan paginados (20) via listMissingFoodCodesHubAction. Resolver = buscar en el
// catalogo y vincular, o crear un alimento coach y vincular en un paso. Toda escritura
// pasa por acciones gated + Zod (ver _actions/curation.actions.ts).

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000))
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days} dias`
}

export function CurationQueue({ countryCode = 'CL' }: { countryCode?: string }) {
  const [rows, setRows] = useState<MissingCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MissingCodeRow | null>(null)

  useEffect(() => {
    let active = true
    void listMissingFoodCodesHubAction({ offset: 0 }).then((res) => {
      if (!active) return
      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }
      setRows(res.items)
      setNextOffset(res.nextOffset)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    const res = await listMissingFoodCodesHubAction({ offset: nextOffset })
    if (!res.ok) {
      toast.error(res.error)
      setLoadingMore(false)
      return
    }
    setRows((prev) => [...prev, ...res.items])
    setNextOffset(res.nextOffset)
    setLoadingMore(false)
  }, [nextOffset, loadingMore])

  const handleResolved = useCallback((id: string, message: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
    setSelected(null)
    toast.success(message)
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-card border border-border-default bg-surface-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <NutritionStatePanel icon="error" tone="danger" illustration="error-amable" title="No se pudo cargar la cola" description={error} />
    )
  }

  if (rows.length === 0) {
    return (
      <NutritionStatePanel
        icon="empty"
        illustration="catalogo-vacio"
        title="Sin codigos por revisar"
        description="Cuando tus alumnos escaneen productos que aun no existen en el catalogo local, apareceran aqui para que los vincules."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-card border border-amber-300/60 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Barcode className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-strong">Codigos por revisar</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Productos escaneados que aun no existen en el catalogo local. Vincular no inventa
            nutrientes: solo ensena a EVA que fila local corresponde a ese codigo.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-3 rounded-control border border-border-default bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <p className="eva-mono text-sm font-black tracking-wide tabular-nums text-strong">
                {row.barcode}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted">
                {row.countryCode} · {row.sightings} {row.sightings === 1 ? 'escaneo' : 'escaneos'} ·{' '}
                {formatRelativeDate(row.lastSeenAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(row)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong hover:bg-surface-sunken"
            >
              <Link2 className="h-4 w-4" />
              Vincular alimento
            </button>
          </li>
        ))}
      </ul>

      {nextOffset != null ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loadingMore ? 'Cargando…' : 'Ver mas codigos'}
        </button>
      ) : null}

      {selected ? (
        <ResolveDialog
          row={selected}
          countryCode={countryCode}
          onClose={() => setSelected(null)}
          onResolved={handleResolved}
        />
      ) : null}
    </div>
  )
}

type Mode = 'search' | 'create'

function ResolveDialog({
  row,
  countryCode,
  onClose,
  onResolved,
}: {
  row: MissingCodeRow
  countryCode: string
  onClose: () => void
  onResolved: (id: string, message: string) => void
}) {
  const [mode, setMode] = useState<Mode>('search')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function linkExisting(food: FoodCatalogItem) {
    if (busy) return
    setBusy(true)
    const res = await resolveMissingFoodCodeHubAction({
      missingCodeId: row.id,
      resolvedFoodId: food.id,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    onResolved(row.id, `${row.barcode} vinculado con ${food.name}`)
  }

  async function createAndLink(input: {
    name: string
    brand: string | null
    unit: 'g' | 'ml'
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
  }) {
    if (busy) return
    setBusy(true)
    const res = await createCoachFoodForCurationAction({ missingCodeId: row.id, ...input })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    onResolved(row.id, `${row.barcode} vinculado con ${input.name}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 pt-safe sm:items-center sm:p-4"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Vincular codigo ${row.barcode}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-card border border-border-default bg-surface-card p-4 shadow-lg outline-none sm:max-w-lg sm:rounded-card"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-strong">Vincular codigo</h3>
            <p className="eva-mono mt-0.5 text-sm font-black tabular-nums text-muted">{row.barcode}</p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Cerrar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted hover:text-strong"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-control border border-border-default bg-surface-sunken p-1">
          {(['search', 'create'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              className={
                mode === key
                  ? 'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-ember-500 px-3 text-sm font-semibold text-white'
                  : 'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold text-muted hover:text-strong'
              }
            >
              {key === 'search' ? <Search className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {key === 'search' ? 'Buscar existente' : 'Crear nuevo'}
            </button>
          ))}
        </div>

        <div className={busy ? 'pointer-events-none opacity-60' : ''}>
          {mode === 'search' ? (
            <CatalogPicker countryCode={countryCode} onPick={linkExisting} />
          ) : (
            <CreateFoodForm onSubmit={createAndLink} />
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-control bg-surface-sunken px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Vincular no cambia el alimento ni inventa nutrientes: solo asocia ese codigo a una fila del
          catalogo.
        </div>
      </div>
    </div>
  )
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 400

function CatalogPicker({
  countryCode,
  onPick,
}: {
  countryCode: string
  onPick: (food: FoodCatalogItem) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const latestQuery = useRef('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      latestQuery.current = debounced
      setItems([])
      setSearchError(null)
      setLoading(false)
      return
    }
    let active = true
    latestQuery.current = debounced
    setLoading(true)
    setSearchError(null)
    void searchFoodCatalogHubAction({ query: debounced, countryCode }).then((res) => {
      if (!active || latestQuery.current !== debounced) return
      if (!res.ok) {
        setSearchError(res.error)
        setItems([])
        setLoading(false)
        return
      }
      setItems(res.items)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [debounced, countryCode])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar el producto exacto…"
          aria-label="Buscar alimento en el catalogo"
          className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-4 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : null}
      </div>

      {searchError ? (
        <p className="rounded-control bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {searchError}
        </p>
      ) : debounced.length < MIN_QUERY ? (
        <p className="px-1 text-xs text-muted">Escribe al menos 2 caracteres para buscar.</p>
      ) : !loading && items.length === 0 ? (
        <p className="px-1 text-xs text-muted">
          Sin resultados. Prueba con otro nombre o crea el alimento en la pestana Crear nuevo.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {items.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => onPick(food)}
                className="flex w-full items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 py-2 text-left hover:bg-surface-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-strong">{food.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {[food.brand, `${Math.round(food.calories)} kcal / ${food.servingSize}${food.servingUnit}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Link2 className="h-4 w-4 shrink-0 text-ember-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface CreateFormState {
  name: string
  brand: string
  unit: 'g' | 'ml'
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  brand: '',
  unit: 'g',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatsG: '',
}

function toNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function CreateFoodForm({
  onSubmit,
}: {
  onSubmit: (input: {
    name: string
    brand: string | null
    unit: 'g' | 'ml'
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
  }) => void
}) {
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const set = (key: keyof CreateFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const calories = toNumber(form.calories)
  const proteinG = toNumber(form.proteinG)
  const carbsG = toNumber(form.carbsG)
  const fatsG = toNumber(form.fatsG)
  const valid =
    form.name.trim().length > 0 &&
    calories !== null &&
    proteinG !== null &&
    carbsG !== null &&
    fatsG !== null

  function submit() {
    if (!valid || calories === null || proteinG === null || carbsG === null || fatsG === null) return
    onSubmit({
      name: form.name.trim(),
      brand: form.brand.trim() === '' ? null : form.brand.trim(),
      unit: form.unit,
      calories,
      proteinG,
      carbsG,
      fatsG,
    })
  }

  const inputClass =
    'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm'

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="space-y-2.5"
    >
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Ingresa las macros por 100 {form.unit}. Se crea como alimento tuyo (coach) y se vincula al codigo.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-semibold text-muted">Nombre</span>
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Yogur natural" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Marca (opcional)</span>
          <input className={inputClass} value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Ej: Soprole" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Unidad</span>
          <select
            className={inputClass}
            value={form.unit}
            onChange={(e) => set('unit', e.target.value === 'ml' ? 'ml' : 'g')}
          >
            <option value="g">Solido (g)</option>
            <option value="ml">Liquido (ml)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Calorias / 100{form.unit}</span>
          <input className={inputClass} inputMode="decimal" value={form.calories} onChange={(e) => set('calories', e.target.value)} placeholder="0" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Proteina (g)</span>
          <input className={inputClass} inputMode="decimal" value={form.proteinG} onChange={(e) => set('proteinG', e.target.value)} placeholder="0" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Carbohidratos (g)</span>
          <input className={inputClass} inputMode="decimal" value={form.carbsG} onChange={(e) => set('carbsG', e.target.value)} placeholder="0" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Grasas (g)</span>
          <input className={inputClass} inputMode="decimal" value={form.fatsG} onChange={(e) => set('fatsG', e.target.value)} placeholder="0" />
        </label>
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Crear y vincular
      </button>
    </form>
  )
}
