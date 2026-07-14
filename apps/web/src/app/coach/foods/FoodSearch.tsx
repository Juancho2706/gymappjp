'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatFoodReference, normalizeFoodSearchText } from '@eva/nutrition-engine'

export interface Food {
  id: string
  name: string
  brand: string | null
  serving_size: number
  serving_unit: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  is_liquid: boolean
  coach_id: string | null
  category: string | null
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'proteina', label: 'Proteína' },
  { value: 'carbohidrato', label: 'Carbohidrato' },
  { value: 'verdura', label: 'Verdura' },
  { value: 'fruta', label: 'Fruta' },
  { value: 'lacteo', label: 'Lácteo' },
  { value: 'grasa', label: 'Grasa' },
  { value: 'legumbre', label: 'Legumbre' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'snack', label: 'Snack' },
]

interface Props {
  onFoodSelected?: (food: Food) => void
}

/** Búsqueda para modales (meal groups, recetas, etc.). */
export function FoodSearch({ onFoodSelected }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const normalized = normalizeFoodSearchText(searchTerm)
    const timer = setTimeout(async () => {
      if (normalized.length < 2 && selectedCategory === '') {
        setResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      let query = supabase
        .from('foods')
        .select('id, name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fats_g, fiber_g, is_liquid, coach_id, category')
        .order('name')
        .limit(40)

      if (normalized.length >= 2) {
        query = query.ilike('name_search', `%${normalized}%`)
      }
      if (selectedCategory !== '') {
        query = query.eq('category', selectedCategory)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error searching foods:', error)
        setResults([])
      } else {
        setResults((data as Food[]) ?? [])
      }
      setLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, selectedCategory, supabase])

  const normalizedTerm = normalizeFoodSearchText(searchTerm)
  const showEmpty = !loading && results.length === 0 && (normalizedTerm.length >= 2 || selectedCategory !== '')

  return (
    <div>
      <div className="flex w-full items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar pollo, marraqueta, yogur…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 rounded-control border-default bg-surface-card pl-9 text-strong placeholder:text-muted"
            autoFocus
            aria-label="Buscar alimento"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setSelectedCategory(cat.value)}
            className={cn(
              'h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[11px] font-bold transition-colors',
              selectedCategory === cat.value
                ? 'bg-ember-500 text-white shadow-sm'
                : 'bg-surface-sunken text-muted hover:text-strong',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-subtle bg-surface-card">
        {loading && (
          <p className="py-8 text-center text-sm text-muted">Buscando alimentos…</p>
        )}
        {showEmpty && (
          <p className="py-8 text-center text-sm text-muted">
            {normalizedTerm.length >= 2
              ? `No encontramos “${searchTerm.trim()}”${selectedCategory ? ` en ${CATEGORIES.find((c) => c.value === selectedCategory)?.label}` : ''}.`
              : `No hay alimentos en ${CATEGORIES.find((c) => c.value === selectedCategory)?.label}.`}
          </p>
        )}
        {!loading && results.map((food, index) => (
          <div
            key={food.id}
            className={cn(
              'flex min-h-16 flex-col justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/60 sm:flex-row sm:items-center',
              index > 0 && 'border-t border-subtle',
            )}
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-strong">{food.name}</h3>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">
                {food.brand ? `${food.brand} · ` : ''}{formatFoodReference(food)}
              </p>
              <p className="eva-mono mt-1 text-[10.5px] text-subtle tabular-nums">
                P {food.protein_g}g · C {food.carbs_g}g · G {food.fats_g}g / 100 {food.is_liquid || food.serving_unit === 'ml' ? 'ml' : 'g'}
              </p>
            </div>
            {onFoodSelected && (
              <Button
                type="button"
                size="sm"
                className="h-10 w-full rounded-control border-transparent bg-ember-500 font-bold text-white hover:bg-ember-600 sm:h-9 sm:w-auto"
                onClick={() => onFoodSelected(food)}
              >
                Seleccionar
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
