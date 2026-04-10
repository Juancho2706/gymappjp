'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { previewMacrosForQuantity } from './MacroCalculator'
import type { FoodItemDraft } from './types'

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
}

interface Props {
  open: boolean
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

const UNITS = ['g', 'ml', 'un', 'cda', 'cdta', 'taza', 'porción']

function toFoodDraftShape(f: FoodRow): FoodItemDraft['food'] {
  return {
    name: f.name,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fats_g: f.fats_g,
    serving_size: f.serving_size,
    serving_unit: f.serving_unit ?? 'g',
  }
}

export function FoodSearchDrawer({ open, onClose, onConfirm }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [category, setCategory] = useState('todos')
  const [picked, setPicked] = useState<FoodRow | null>(null)
  const [quantity, setQuantity] = useState(100)
  const [unit, setUnit] = useState('g')

  const supabase = createClient()

  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setResults([])
      setPicked(null)
      setQuantity(100)
      setUnit('g')
      setCategory('todos')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      if (searchTerm.trim().length < 2) {
        setResults([])
        return
      }
      const { data, error } = await supabase.rpc('search_foods', { search_term: searchTerm.trim() })
      if (error) {
        console.error(error)
        toast.error('Error al buscar alimentos')
        setResults([])
        return
      }
      setResults((data as FoodRow[]) ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [searchTerm, open, supabase])

  const filtered = results.filter((f) => {
    if (category === 'todos') return true
    return (f.category ?? 'otro') === category
  })

  const preview = picked
    ? previewMacrosForQuantity(toFoodDraftShape(picked), quantity, unit)
    : null

  const handleAdd = useCallback(() => {
    if (!picked) return
    onConfirm({
      food_id: picked.id,
      food: toFoodDraftShape(picked),
      quantity,
      unit,
    })
  }, [picked, quantity, unit, onConfirm])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar alimento
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!picked ? (
            <>
              <Input
                placeholder="Escribe al menos 2 caracteres…"
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
                {filtered.length === 0 && searchTerm.trim().length >= 2 && (
                  <p className="text-center text-sm text-muted-foreground py-6">Sin resultados.</p>
                )}
                {filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setPicked(f)
                      setUnit((f.serving_unit || 'g').toLowerCase())
                      setQuantity(f.serving_size || 100)
                    }}
                    className="w-full text-left rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors"
                  >
                    <p className="font-bold text-sm">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {f.calories} kcal · P{f.protein_g} C{f.carbs_g} G{f.fats_g}
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
                    className="mt-1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Unidad</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v ?? 'g')}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
