'use client'

import { useState, useMemo, useActionState, useEffect, useTransition, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Loader2, Save, SlidersHorizontal } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveCustomFood } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'
import { useFormStatus } from 'react-dom'
import { searchCoachFoodLibrary } from '../_actions/food-library.actions'
import { FoodListCompact, type FoodListItem } from '@/components/coach/FoodListCompact'

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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loadingMore, setLoadingMore] = useState(false)
  const [state, formAction] = useActionState(saveCustomFood.bind(null, coachId), { error: undefined, success: false })
  const skipNextFetch = useRef(true)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const refresh = useCallback(
    (searchTerm: string, cat: string) => {
      startTransition(async () => {
        const { foods: next, total: count } = await searchCoachFoodLibrary(coachId, {
          search: searchTerm || undefined,
          category: cat !== 'todos' ? cat : undefined,
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

  const loadMore = useCallback(
    (currentPage: number, searchTerm: string, cat: string) => {
      setLoadingMore(true)
      startTransition(async () => {
        const nextPage = currentPage + 1
        const { foods: next } = await searchCoachFoodLibrary(coachId, {
          search: searchTerm || undefined,
          category: cat !== 'todos' ? cat : undefined,
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
    refresh(debouncedSearch, category)
  }, [debouncedSearch, category, refresh])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !pending && !loadingMore && foods.length < total) {
          loadMore(page, debouncedSearch, category)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [pending, loadingMore, foods.length, total, loadMore, page, debouncedSearch, category])

  useEffect(() => {
    if (state.success) {
      setIsModalOpen(false)
      toast.success('Alimento guardado')
      refresh(debouncedSearch, category)
    }
  }, [state.success, refresh, debouncedSearch, category])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const f of foods) {
      if (f.category?.trim()) set.add(f.category.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [foods])

  const displayed = useMemo(() => {
    let list = [...foods]
    if (scope === 'mine') list = list.filter((f) => f.coach_id === coachId)
    list.sort((a, b) => {
      if (sort === 'calories') return b.calories - a.calories
      if (sort === 'protein') return b.protein_g - a.protein_g
      return a.name.localeCompare(b.name)
    })
    return list
  }, [foods, scope, sort, coachId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alimento…"
            className="pl-12 h-12 rounded-2xl bg-muted/30 border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {pending && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger className="h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] gap-2 px-6 shadow-lg shadow-primary/20 flex items-center justify-center w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nuevo alimento
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border-border/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tighter">Crear alimento custom</DialogTitle>
            </DialogHeader>
            <CustomFoodForm formAction={formAction} state={state} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <SlidersHorizontal className="w-3 h-3" />
          Orden
        </span>
        {(['name', 'calories', 'protein'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={sort === k ? 'default' : 'outline'}
            className="h-8 text-[10px] font-bold uppercase"
            onClick={() => setSort(k)}
          >
            {k === 'name' ? 'Nombre' : k === 'calories' ? 'Kcal' : 'Proteína'}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto tabular-nums w-full sm:w-auto text-right">
          Mostrando {displayed.length} · Total catálogo {total}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Alcance</span>
        <Button
          type="button"
          size="sm"
          variant={scope === 'all' ? 'default' : 'outline'}
          className="h-8 text-[10px] font-black uppercase"
          onClick={() => setScope('all')}
        >
          Todos
        </Button>
        <Button
          type="button"
          size="sm"
          variant={scope === 'mine' ? 'default' : 'outline'}
          className="h-8 text-[10px] font-black uppercase"
          onClick={() => setScope('mine')}
        >
          Mis alimentos
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Badge
          variant={category === 'todos' ? 'default' : 'outline'}
          className="cursor-pointer shrink-0 rounded-lg px-3 py-1"
          onClick={() => setCategory('todos')}
        >
          Todas
        </Badge>
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={category === cat ? 'default' : 'outline'}
            className="cursor-pointer shrink-0 rounded-lg px-3 py-1"
            onClick={() => setCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {pending && displayed.length === 0 ?
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      : <FoodListCompact items={displayed} coachId={coachId} />}

      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loadingMore && foods.length >= total && total > 0 && (
        <p className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground py-2">
          Todos los alimentos cargados
        </p>
      )}
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

      <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cómo cargar los datos</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ingresá calorías y macros <span className="font-semibold text-foreground">por cada 100 g</span> del alimento. Podés usar decimales (ej. <code className="bg-muted px-1 rounded">6.5</code>) — se guardan redondeados al entero más cercano. Si no tenés el dato exacto de un macro, dejalo en 0.
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
          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            <div className="h-full bg-blue-500/90" style={{ width: `${pct.p}%` }} />
            <div className="h-full bg-emerald-500/90" style={{ width: `${pct.c}%` }} />
            <div className="h-full bg-purple-500/90" style={{ width: `${pct.f}%` }} />
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
      {state.error && <p className="text-xs text-rose-500 font-bold text-center">{state.error}</p>}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
      {pending ? 'Guardando…' : 'Guardar alimento'}
    </Button>
  )
}
