'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface Food {
  id: string
  name: string
  serving_size: number
  serving_unit: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
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

/** Búsqueda para modales (meal groups, etc.). La página `/coach/foods` usa `FoodBrowser`. */
export function FoodSearch({ onFoodSelected }: Props) {
  const supabase = createClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [results, setResults] = useState<Food[]>([])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = searchTerm.trim()

      // Need either a search term (≥3 chars) or a category filter to fetch
      if (trimmed.length < 3 && selectedCategory === '') {
        setResults([])
        return
      }

      let query = supabase
        .from('foods')
        .select('id, name, serving_size, serving_unit, calories, protein_g, carbs_g, fats_g, coach_id, category')
        .order('name')
        .limit(40)

      if (trimmed.length >= 3) {
        // Use normalized name_search column for accent-insensitive matching
        query = query.ilike('name_search', `%${trimmed}%`)
      }

      if (selectedCategory !== '') {
        query = query.eq('category', selectedCategory)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error searching foods:', error)
        return
      }

      setResults((data as Food[]) ?? [])
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, selectedCategory, supabase])

  const showEmpty =
    results.length === 0 && (searchTerm.length >= 3 || selectedCategory !== '')

  return (
    <div>
      {/* Search input */}
      <div className="flex w-full items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar alimento (ej: Pollo, Arroz...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-11 bg-white dark:bg-background text-slate-900 dark:text-foreground border-emerald-200 dark:border-emerald-500/20"
            autoFocus
          />
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setSelectedCategory(cat.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors whitespace-nowrap',
              selectedCategory === cat.value
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mt-3 space-y-2">
        {showEmpty && (
          <p className="text-center py-8 text-muted-foreground text-sm italic">
            {searchTerm.length >= 3
              ? `No se encontraron alimentos con "${searchTerm}"${selectedCategory ? ` en ${CATEGORIES.find(c => c.value === selectedCategory)?.label}` : ''}`
              : `No hay alimentos en ${CATEGORIES.find(c => c.value === selectedCategory)?.label}`}
          </p>
        )}
        {results.map((food) => (
          <div
            key={food.id}
            className="bg-white dark:bg-card border border-emerald-100 dark:border-border/60 hover:border-emerald-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-foreground group-hover:text-emerald-600 transition-colors line-clamp-2 sm:line-clamp-1 leading-tight">
                {food.name}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
                <span className="text-[10px] bg-slate-100 dark:bg-muted px-1.5 py-0.5 rounded text-slate-600 dark:text-muted-foreground font-medium whitespace-nowrap">
                  {food.serving_size}
                  {food.serving_unit} base
                </span>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-muted-foreground/80">
                  <span className="font-bold text-slate-700 dark:text-foreground/90">{food.calories} kcal</span>
                  <span className="opacity-30">|</span>
                  <span className="whitespace-nowrap">
                    P:{' '}
                    <span className="font-medium text-slate-700 dark:text-foreground/80">{food.protein_g}g</span>
                  </span>
                  <span className="opacity-30">|</span>
                  <span className="whitespace-nowrap">
                    C:{' '}
                    <span className="font-medium text-slate-700 dark:text-foreground/80">{food.carbs_g}g</span>
                  </span>
                  <span className="opacity-30">|</span>
                  <span className="whitespace-nowrap">
                    G:{' '}
                    <span className="font-medium text-slate-700 dark:text-foreground/80">{food.fats_g}g</span>
                  </span>
                </div>
              </div>
            </div>
            {onFoodSelected && (
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto h-9 sm:h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold shadow-sm"
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
