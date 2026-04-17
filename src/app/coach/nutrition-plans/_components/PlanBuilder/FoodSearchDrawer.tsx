'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { previewMacrosForQuantity } from './MacroCalculator'
import type { FoodItemDraft } from './types'
import { searchCoachFoodLibrary } from '../../_actions/food-library.actions'

type FoodRow = {
  id: string
  name: string
  serving_size: number
  serving_unit: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  coach_id: string | null
  category?: string | null
  is_liquid?: boolean | null
  brand?: string | null
}

interface Props {
  open: boolean
  coachId: string
  onClose: () => void
  onConfirm: (item: FoodItemDraft) => void
}

const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'proteina', label: 'Proteína' },
  { id: 'carbohidrato', label: 'Carbohidrato' },
  { id: 'grasa', label: 'Grasa' },
  { id: 'lacteo', label: 'Lácteo' },
  { id: 'fruta', label: 'Fruta' },
  { id: 'verdura', label: 'Verdura' },
  { id: 'snack', label: 'Snack' },
]

/** Normaliza unidades legacy a las tres unidades canónicas: 'g', 'ml' o 'un' */
function normalizeUnit(raw: string | null | undefined): 'g' | 'ml' | 'un' {
  const u = (raw ?? 'g').toLowerCase().trim()
  if (u === 'un' || u === 'unidades' || u === 'unidad' || u === 'porción' || u === 'porciones') return 'un'
  if (u === 'ml') return 'ml'
  return 'g' // g, gr, cda, cdta, taza → gramos
}

function normalizeCategory(raw: string | null | undefined): string {
  const value = (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (!value) return 'otro'
  if (value.startsWith('prote')) return 'proteina'
  if (value.startsWith('carb') || value.includes('cereal')) return 'carbohidrato'
  if (value.startsWith('gras')) return 'grasa'
  if (value.startsWith('lact')) return 'lacteo'
  if (value.startsWith('frut')) return 'fruta'
  if (value.startsWith('verd')) return 'verdura'
  if (value.startsWith('snack')) return 'snack'
  return value
}

function toFoodDraftShape(f: FoodRow): FoodItemDraft['food'] {
  return {
    name: f.name,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fats_g: f.fats_g,
    serving_size: f.serving_size,
    serving_unit: f.serving_unit ?? 'g',
    is_liquid: f.is_liquid ?? false,
    brand: f.brand ?? null,
  }
}

export function FoodSearchDrawer({ open, coachId, onClose, onConfirm }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('todos')
  const [picked, setPicked] = useState<FoodRow | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState<'g' | 'ml' | 'un'>('g')

  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setResults([])
      setLoading(false)
      setPicked(null)
      setQuantity('100')
      setUnit('g' as 'g' | 'ml' | 'un')
      setCategory('todos')
    }
  }, [open])

  useEffect(() => {
    if (!open || !coachId) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const q = searchTerm.trim()
        const { foods } = await searchCoachFoodLibrary(coachId, {
          search: q || undefined,
          pageSize: 200,
          page: 0,
        })
        if (!cancelled) setResults((foods as FoodRow[]) ?? [])
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          toast.error('Error al cargar alimentos')
          setResults([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchTerm, open, coachId])

  const filtered = results.filter((f) => {
    if (category === 'todos') return true
    return normalizeCategory(f.category) === category
  })

  const parsedQuantity = parseFloat(quantity) || 0

  const preview = picked
    ? previewMacrosForQuantity(toFoodDraftShape(picked), parsedQuantity, unit)
    : null

  const handleAdd = useCallback(() => {
    if (!picked) return
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Ingresa una cantidad válida mayor a 0')
      return
    }
    onConfirm({
      food_id: picked.id,
      food: toFoodDraftShape(picked),
      quantity: qty,
      unit,
    })
  }, [picked, quantity, unit, onConfirm])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar alimento
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!picked ? (
            <>
              <Input
                placeholder="Buscar por nombre (opcional)…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11"
              />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors',
                      category === c.id
                        ? 'bg-[color:var(--theme-primary)] text-primary-foreground border-transparent'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {loading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                  </div>
                )}
                {!loading && filtered.length === 0 && results.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    {searchTerm.trim()
                      ? 'Sin resultados para tu búsqueda.'
                      : 'No hay alimentos en el catálogo.'}
                  </p>
                )}
                {!loading && filtered.length === 0 && results.length > 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    Ningún alimento en esta categoría. Prueba otro filtro o la búsqueda.
                  </p>
                )}
                {!loading &&
                  filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setPicked(f)
                      const defaultUnit = f.is_liquid ? 'ml' : normalizeUnit(f.serving_unit)
                      setUnit(defaultUnit)
                      setQuantity(String(f.serving_size || (f.is_liquid ? 200 : 100)))
                    }}
                    className="w-full text-left rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors"
                  >
                    <p className="font-bold text-sm">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {f.brand && <span className="font-medium">{f.brand} · </span>}
                      {f.calories} kcal · P{f.protein_g} C{f.carbs_g} G{f.fats_g}
                      {f.is_liquid && <span className="ml-1 text-blue-500">· ml</span>}
                    </p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="font-bold text-base">{picked.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className="mt-1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Unidad</Label>
                  <div className="flex rounded-lg border border-border overflow-hidden mt-1">
                    {(picked?.is_liquid ? (['ml', 'un'] as const) : (['g', 'un'] as const)).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnit(u)}
                        className={cn(
                          'flex-1 px-3 py-2 text-sm font-medium transition-colors',
                          unit === u
                            ? 'bg-[color:var(--theme-primary)] text-primary-foreground'
                            : 'bg-transparent text-muted-foreground hover:bg-muted/40'
                        )}
                      >
                        {u === 'un' && picked?.is_liquid ? `un (${picked.serving_size ?? 200}ml)` : u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {preview && (
                <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-3">
                  Aporte: <span className="font-bold text-foreground">{preview.calories} kcal</span> · P{' '}
                  {preview.protein}g · C {preview.carbs}g · G {preview.fats}g
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setPicked(null)}>
                  Volver
                </Button>
                <Button type="button" className="flex-1" onClick={handleAdd}>
                  Agregar
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
