'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { searchCoachFoodLibrary } from '@/app/coach/nutrition-plans/_actions/food-library.actions'
import { FoodListCompact, type FoodListItem } from '@/components/coach/FoodListCompact'

type Food = FoodListItem

type SortKey = 'name' | 'calories' | 'protein'

type Props = {
  coachId: string
  initialFoods: Food[]
  totalFoods: number
}

export function FoodBrowser({ coachId, initialFoods, totalFoods }: Props) {
  const [foods, setFoods] = useState<Food[]>(initialFoods)
  const [total, setTotal] = useState(totalFoods)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('todos')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [pending, startTransition] = useTransition()
  const skipFirst = useRef(true)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const refresh = useCallback(
    (q: string, cat: string) => {
      startTransition(async () => {
        const { foods: next, total: count } = await searchCoachFoodLibrary(coachId, {
          search: q || undefined,
          category: cat !== 'todos' ? cat : undefined,
          page: 0,
          pageSize: 150,
        })
        setFoods((next as Food[]) ?? [])
        setTotal(count ?? 0)
      })
    },
    [coachId]
  )

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    refresh(debounced, category)
  }, [debounced, category, refresh])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const f of foods) {
      if (f.category?.trim()) s.add(f.category.trim())
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
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
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en catálogo (global + tuyos)…"
            className="pl-10 h-11 rounded-2xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {pending && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums shrink-0">
          {displayed.length} visibles · {total} en catálogo
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
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
            {k === 'name' ? 'Nombre' : k === 'calories' ? 'Kcal' : 'Prot'}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-black uppercase text-muted-foreground">Alcance</span>
        <Button
          type="button"
          size="sm"
          variant={scope === 'mine' ? 'default' : 'outline'}
          className="h-8 text-[10px] font-black uppercase"
          onClick={() => setScope('mine')}
        >
          Solo mis alimentos
        </Button>
        <Button
          type="button"
          size="sm"
          variant={scope === 'all' ? 'default' : 'outline'}
          className="h-8 text-[10px] font-black uppercase"
          onClick={() => setScope('all')}
        >
          Catálogo completo
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
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

      <FoodListCompact items={displayed} coachId={coachId} />
    </div>
  )
}
