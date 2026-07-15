'use client'

import { useState, useMemo, useActionState, useEffect, useTransition, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Search, Plus, Loader2, Save, SlidersHorizontal, Layers, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveCustomFood, deleteCoachCustomFood } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'
import { useFormStatus } from 'react-dom'
import { searchCoachFoodLibrary } from '../_actions/food-library.actions'
import { FoodListCompact, type FoodListItem } from '@/components/coach/FoodListCompact'
import { FoodDetailSheet } from '@/components/coach/FoodDetailSheet'
import { getCoachFoodDetail } from '../_actions/food-detail.actions'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  type FoodDetailData,
} from '@/lib/food-detail'

type Food = FoodListItem

type Props = {
  initialFoods: Food[]
  totalFoods: number
  coachId: string
}

type SortKey = 'name' | 'calories' | 'protein'

function macroPreviewPct(calories: number, p: number, c: number, f: number) {
  const cals = Number(calories) || 0
  const denom = cals > 0 ? cals : p * 4 + c * 4 + f * 9
  if (denom <= 0) return { p: 0, c: 0, f: 0 }
  return {
    p: Math.round(((p * 4) / denom) * 100),
    c: Math.round(((c * 4) / denom) * 100),
    f: Math.round(((f * 9) / denom) * 100),
  }
}

const PAGE_SIZE = 80

export function FoodLibrary({ initialFoods, totalFoods, coachId }: Props) {
  const [foods, setFoods] = useState<Food[]>(initialFoods)
  const [total, setTotal] = useState(totalFoods)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState<string>('todos')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [filterOpen, setFilterOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loadingMore, setLoadingMore] = useState(false)
  const [state, formAction] = useActionState(saveCustomFood.bind(null, coachId), { error: undefined, success: false })
  const skipNextFetch = useRef(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingDeletes = useRef<Map<string, { food: Food; timer: ReturnType<typeof setTimeout> }>>(new Map())
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<FoodDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = useCallback((foodId: string) => {
    setDetail(null)
    setDetailLoading(true)
    setDetailOpen(true)
    getCoachFoodDetail(foodId)
      .then((d) => {
        setDetail(d)
        setDetailLoading(false)
      })
      .catch(() => {
        setDetail(null)
        setDetailLoading(false)
      })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const refresh = useCallback(
    (searchTerm: string, cat: string, scopeVal: 'all' | 'mine') => {
      startTransition(async () => {
        const { foods: next, total: count } = await searchCoachFoodLibrary(coachId, {
          search: searchTerm || undefined,
          category: cat !== 'todos' ? cat : undefined,
          mine: scopeVal === 'mine',
          page: 0,
          pageSize: PAGE_SIZE,
        })
        setFoods((next as Food[]) ?? [])
        setTotal(count ?? 0)
        setPage(0)
      })
    },
    [coachId]
  )

  const handleDelete = useCallback(
    (foodId: string) => {
      const food = foods.find((f) => f.id === foodId)
      if (!food) return

      setFoods((prev) => prev.filter((f) => f.id !== foodId))
      setTotal((prev) => prev - 1)

      const timer = setTimeout(async () => {
        pendingDeletes.current.delete(foodId)
        const result = await deleteCoachCustomFood(coachId, foodId)
        if (!result.success) {
          toast.error(result.error ?? 'No se pudo eliminar el alimento.')
          setFoods((prev) => [...prev, food])
          setTotal((prev) => prev + 1)
        }
      }, 5000)

      pendingDeletes.current.set(foodId, { food, timer })

      toast.success('Alimento eliminado', {
        duration: 5000,
        action: {
          label: 'Deshacer',
          onClick: () => {
            const entry = pendingDeletes.current.get(foodId)
            if (!entry) return
            clearTimeout(entry.timer)
            pendingDeletes.current.delete(foodId)
            setFoods((prev) => [...prev, entry.food])
            setTotal((prev) => prev + 1)
          },
        },
      })
    },
    [foods, coachId]
  )

  const loadMore = useCallback(
    (currentPage: number, searchTerm: string, cat: string, scopeVal: 'all' | 'mine') => {
      setLoadingMore(true)
      startTransition(async () => {
        const nextPage = currentPage + 1
        const { foods: next } = await searchCoachFoodLibrary(coachId, {
          search: searchTerm || undefined,
          category: cat !== 'todos' ? cat : undefined,
          mine: scopeVal === 'mine',
          page: nextPage,
          pageSize: PAGE_SIZE,
        })
        setFoods((prev) => [...prev, ...((next as Food[]) ?? [])])
        setPage(nextPage)
        setLoadingMore(false)
      })
    },
    [coachId]
  )

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    refresh(debouncedSearch, category, scope)
  }, [debouncedSearch, category, scope, refresh])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !pending && !loadingMore && foods.length < total) {
          loadMore(page, debouncedSearch, category, scope)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [pending, loadingMore, foods.length, total, loadMore, page, debouncedSearch, category, scope])

  useEffect(() => {
    if (state.success) {
      setIsModalOpen(false)
      toast.success('Alimento guardado')
      refresh(debouncedSearch, category, scope)
    }
  }, [state.success, refresh, debouncedSearch, category, scope])

  const displayed = useMemo(() => {
    const list = [...foods]
    list.sort((a, b) => {
      if (sort === 'calories') return b.calories - a.calories
      if (sort === 'protein') return b.protein_g - a.protein_g
      return a.name.localeCompare(b.name)
    })
    return list
  }, [foods, sort])

  const filtersActive = scope !== 'all' || sort !== 'name'
  const resetFilters = () => {
    setScope('all')
    setSort('name')
  }
  const SORT_LABELS: Record<SortKey, string> = { name: 'Nombre', calories: 'Kcal', protein: 'Proteína' }

  return (
    <div className="space-y-3">
      {/* Entry-card — Grupos de comidas (kit FoodLibraryTab) */}
      <Link
        href="/coach/meal-groups"
        className="eva-press flex w-full items-center gap-3 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 py-3 transition-colors hover:bg-surface-sunken"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--sport-100)] text-[var(--sport-600)]">
          <Layers className="h-[17px] w-[17px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-strong">Grupos de comidas</span>
          <span className="block text-[11.5px] text-subtle">Combos de alimentos reutilizables</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-subtle" />
      </Link>

      {/* Buscador + botón Filtros y orden (patrón CD, espejo del board Alumnos) */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            placeholder="Buscar alimento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-control border-default bg-surface-card pl-10 pr-10 text-base shadow-sm placeholder:text-muted md:text-sm"
            aria-label="Buscar alimento"
          />
          {pending ? (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
          ) : search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="eva-press absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-[var(--text-muted)]"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filtros y orden"
          className="eva-press relative flex size-11 shrink-0 items-center justify-center rounded-control border-[1.5px] shadow-sm transition-colors"
          style={{
            borderColor: filtersActive ? 'var(--sport-300)' : 'var(--border-default)',
            backgroundColor: filtersActive ? 'var(--sport-100)' : 'var(--surface-card)',
            color: filtersActive ? 'var(--sport-600)' : 'var(--text-strong)',
          }}
        >
          <SlidersHorizontal className="size-[18px]" />
          {filtersActive && (
            <span
              className="absolute -right-1 -top-1 size-2.5 rounded-full border-2"
              style={{ backgroundColor: 'var(--sport-500)', borderColor: 'var(--surface-card)' }}
            />
          )}
        </button>
      </div>

      {/* Chips de filtros activos (removibles) */}
      {filtersActive && (
        <div className="flex flex-wrap gap-1.5">
          {scope !== 'all' && (
            <button
              type="button"
              onClick={() => setScope('all')}
              className="eva-press inline-flex h-7 items-center gap-1.5 rounded-pill pl-2.5 pr-2 text-xs font-bold"
              style={{ backgroundColor: 'var(--sport-100)', color: 'var(--sport-700)' }}
            >
              Mis alimentos
              <X className="size-3" />
            </button>
          )}
          {sort !== 'name' && (
            <button
              type="button"
              onClick={() => setSort('name')}
              className="eva-press inline-flex h-7 items-center gap-1.5 rounded-pill pl-2.5 pr-2 text-xs font-bold"
              style={{ backgroundColor: 'var(--sport-100)', color: 'var(--sport-700)' }}
            >
              Orden: {SORT_LABELS[sort]}
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {/* Pills de categoría (kit nutriSelPill) */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[{ value: 'todos', label: 'Todas' }, ...FOOD_CATEGORIES].map((cat) => {
          const on = category === cat.value
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={
                on
                  ? 'eva-press inline-flex h-8 shrink-0 items-center rounded-pill border-[1.5px] border-transparent bg-[var(--sport-500)] px-3 text-xs font-bold text-[var(--text-on-sport)]'
                  : 'eva-press inline-flex h-8 shrink-0 items-center rounded-pill border-[1.5px] border-default bg-surface-card px-3 text-xs font-bold text-muted hover:bg-surface-sunken'
              }
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Conteo + Nuevo (kit: línea mono + botón sport chico) */}
      <div className="flex items-center justify-between gap-2">
        <span className="eva-mono text-[11px] text-subtle tabular-nums">
          {search.trim()
            ? `${displayed.length} ${displayed.length === 1 ? 'resultado' : 'resultados'}`
            : `${displayed.length} visibles · ${total} en catálogo`}
        </span>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger
            className="eva-press inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[10px] px-2.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            <Plus className="size-3.5" />
            Nuevo
          </DialogTrigger>
          <DialogContent className="sm:max-w-md border-subtle bg-surface-card">
            <DialogHeader>
              <DialogTitle className="font-display text-[19px] font-extrabold normal-case tracking-[-0.01em] text-strong">
                Crear alimento custom
              </DialogTitle>
            </DialogHeader>
            <CustomFoodForm formAction={formAction} state={state} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom-sheet de filtros/orden — 1:1 patrón CD NutriFilterSheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="max-h-[min(85dvh,520px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
        >
          <SheetHeader className="flex-row items-center justify-between border-0 bg-surface-card px-6 pt-2">
            <SheetTitle className="font-display font-extrabold normal-case tracking-[-0.02em] text-strong">
              Filtros y orden
            </SheetTitle>
            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="eva-press text-[13px] font-bold text-[var(--sport-600)]"
              >
                Restablecer
              </button>
            )}
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2">
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Mostrar</span>
              <div className="flex flex-wrap gap-2">
                {([['all', 'Catálogo'], ['mine', 'Mis alimentos']] as const).map(([key, label]) => {
                  const selected = scope === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setScope(key)}
                      className="eva-press rounded-pill border-[1.5px] px-4 py-2 text-[13px] font-semibold transition-colors"
                      style={{
                        borderColor: selected ? 'var(--sport-300)' : 'var(--border-default)',
                        backgroundColor: selected ? 'var(--sport-100)' : 'var(--surface-card)',
                        color: selected ? 'var(--sport-700)' : 'var(--text-body)',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Ordenar por</span>
              <div className="flex flex-wrap gap-2">
                {(['name', 'calories', 'protein'] as const).map((key) => {
                  const selected = sort === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSort(key)}
                      className="eva-press rounded-pill border-[1.5px] px-4 py-2 text-[13px] font-semibold transition-colors"
                      style={{
                        borderColor: selected ? 'var(--sport-300)' : 'var(--border-default)',
                        backgroundColor: selected ? 'var(--sport-100)' : 'var(--surface-card)',
                        color: selected ? 'var(--sport-700)' : 'var(--text-body)',
                      }}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <SheetFooter className="border-subtle bg-surface-card">
            <Button type="button" variant="sport" className="w-full" onClick={() => setFilterOpen(false)}>
              Ver resultados
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {pending && displayed.length === 0 ?
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      : <FoodListCompact items={displayed} coachId={coachId} onDelete={handleDelete} onSelectFood={openDetail} />}

      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loadingMore && foods.length >= total && total > 0 && (
        <p className="eva-mono py-2 text-center text-[11px] text-subtle">
          Todos los alimentos cargados
        </p>
      )}

      {/* Atribución OFF a nivel de catálogo (obligación de licencia ODbL). */}
      <p className="px-1 pt-1 text-center text-[10.5px] leading-relaxed text-subtle">
        {OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION}{' '}
        <a
          href={OPEN_FOOD_FACTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-muted"
        >
          Ver Open Food Facts
        </a>
      </p>

      <FoodDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
        loading={detailLoading}
      />
    </div>
  )
}

const FOOD_CATEGORIES = [
  { value: 'proteina', label: 'Proteína' },
  { value: 'carbohidrato', label: 'Carbohidrato' },
  { value: 'grasa', label: 'Grasa' },
  { value: 'lacteo', label: 'Lácteo' },
  { value: 'fruta', label: 'Fruta' },
  { value: 'verdura', label: 'Verdura' },
  { value: 'legumbre', label: 'Legumbre' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'snack', label: 'Snack' },
  { value: 'otro', label: 'Otro' },
]

const UNIT_OPTIONS = [
  { value: 'g', label: 'Gramos (g)', hint: 'Usa gramos en el plan (ej. 150 g de pollo).' },
  { value: 'ml', label: 'Mililitros (ml)', hint: 'Usa mililitros en el plan (ej. 200 ml de leche).' },
  { value: 'un', label: 'Unidad (un)', hint: 'Usa unidades en el plan (ej. 2 huevos). Define cuántos gramos pesa 1 unidad abajo.' },
]

function MacroInput({
  name,
  label,
  hint,
  value,
  onChange,
}: {
  name: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input
        name={name}
        type="number"
        step="0.1"
        min="0"
        placeholder="0"
        className="h-11 rounded-xl"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function CustomFoodForm({
  formAction,
  state,
}: {
  formAction: (payload: FormData) => void
  state: { error?: string; success?: boolean }
}) {
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('g')
  const [servingSize, setServingSize] = useState('100')

  const c = calories === '' ? 0 : Number(calories)
  const p = protein === '' ? 0 : Number(protein)
  const cb = carbs === '' ? 0 : Number(carbs)
  const f = fats === '' ? 0 : Number(fats)
  const pct = macroPreviewPct(c, p, cb, f)

  const selectedUnit = UNIT_OPTIONS.find((u) => u.value === unit) ?? UNIT_OPTIONS[0]
  const isUnitMode = unit === 'un'

  return (
    <form action={formAction} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</Label>
        <Input name="name" placeholder="Ej: Avena cocida" required className="h-11 rounded-xl" />
      </div>

      <div className="rounded-control bg-surface-sunken px-3.5 py-3 space-y-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-subtle">Cómo cargar los datos</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ingresa calorías y macros <span className="font-semibold text-foreground">por cada 100 g</span> del alimento. Puedes usar decimales (ej. <code className="bg-muted px-1 rounded">6.5</code>) — se guardan redondeados al entero más cercano. Si no tienes el dato exacto de un macro, déjalo en 0.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MacroInput
          name="calories"
          label="Kcal (por 100 g)"
          hint="Energía total. Ej: pollo = 165"
          value={calories}
          onChange={setCalories}
        />
        <MacroInput
          name="protein"
          label="Proteína g (por 100 g)"
          hint="Gramos de proteína. Ej: pollo = 31"
          value={protein}
          onChange={setProtein}
        />
        <MacroInput
          name="carbs"
          label="Carbos g (por 100 g)"
          hint="Hidratos totales. Ej: arroz = 28"
          value={carbs}
          onChange={setCarbs}
        />
        <MacroInput
          name="fats"
          label="Grasas g (por 100 g)"
          hint="Grasas totales. Ej: aceite = 100"
          value={fats}
          onChange={setFats}
        />
      </div>

      {(c > 0 || p > 0 || cb > 0 || f > 0) && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">% calorías aprox.</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-surface-sunken">
            <div className="h-full bg-[var(--ember-500)]" style={{ width: `${pct.p}%` }} />
            <div className="h-full bg-[var(--sport-600)]" style={{ width: `${pct.c}%` }} />
            <div className="h-full bg-[var(--aqua-500)]" style={{ width: `${pct.f}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            P {pct.p}% · C {pct.c}% · G {pct.f}%
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</Label>
          <input type="hidden" name="category" value={category} />
          <Select value={category} onValueChange={(v) => setCategory(v ?? '')}>
            <SelectTrigger className="h-11 rounded-xl bg-background border-input">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {FOOD_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidad en el plan</Label>
          <input type="hidden" name="unit" value={unit} />
          <Select value={unit} onValueChange={(v) => setUnit(v ?? 'g')}>
            <SelectTrigger className="h-11 rounded-xl bg-background border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">{selectedUnit.hint}</p>
        </div>
      </div>

      {isUnitMode && (
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Gramos por 1 unidad
          </Label>
          <Input
            name="serving_size"
            type="number"
            min={1}
            step="1"
            value={servingSize}
            onChange={(e) => setServingSize(e.target.value)}
            className="h-11 rounded-xl"
            placeholder="Ej: 60 (para un huevo grande)"
          />
          <p className="text-[10px] text-muted-foreground">
            ¿Cuántos gramos pesa 1 {category || 'unidad'}? Ej: huevo = 60 g, banana = 120 g.
          </p>
        </div>
      )}
      {!isUnitMode && <input type="hidden" name="serving_size" value="100" />}

      <SubmitButton />
      {state.error && <p className="text-xs text-[var(--cta-danger)] font-bold text-center">{state.error}</p>}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="sport" disabled={pending} className="w-full">
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
      {pending ? 'Guardando…' : 'Guardar alimento'}
    </Button>
  )
}
