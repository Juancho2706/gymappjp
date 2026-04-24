'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Search, X, ChevronLeft, Plus } from 'lucide-react'
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
  { id: 'carbohidrato', label: 'Carbos' },
  { id: 'verdura', label: 'Verdura' },
  { id: 'fruta', label: 'Fruta' },
  { id: 'grasa', label: 'Grasa' },
  { id: 'lacteo', label: 'Lácteo' },
  { id: 'legumbre', label: 'Legumbre' },
  { id: 'bebida', label: 'Bebida' },
  { id: 'snack', label: 'Snack' },
  { id: 'otro', label: 'Otro' },
]

function normalizeUnit(raw: string | null | undefined): 'g' | 'ml' | 'un' {
  const u = (raw ?? 'g').toLowerCase().trim()
  if (u === 'un' || u === 'unidades' || u === 'unidad' || u === 'porción' || u === 'porciones') return 'un'
  if (u === 'ml') return 'ml'
  return 'g'
}

function normalizeCategory(raw: string | null | undefined): string {
  const value = (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!value) return 'otro'
  if (value.startsWith('prote')) return 'proteina'
  if (value.startsWith('carb') || value.includes('cereal')) return 'carbohidrato'
  if (value.startsWith('gras')) return 'grasa'
  if (value.startsWith('lact') || value.startsWith('leche')) return 'lacteo'
  if (value.startsWith('frut')) return 'fruta'
  if (value.startsWith('verd') || value.startsWith('vegetal')) return 'verdura'
  if (value.startsWith('legum') || value.startsWith('porot')) return 'legumbre'
  if (value.startsWith('bebid') || value.startsWith('liquid') || value === 'agua' || value === 'jugo') return 'bebida'
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

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold', color)}>
      {label}<span className="font-normal opacity-75">{value}g</span>
    </span>
  )
}

export function FoodSearchDrawer({ open, coachId, onClose, onConfirm }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('todos')
  const [picked, setPicked] = useState<FoodRow | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState<'g' | 'ml' | 'un'>('g')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setResults([])
      setLoading(false)
      setPicked(null)
      setQuantity('100')
      setUnit('g')
      setCategory('todos')
    } else {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll list to top when category changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [category])

  // Fetch foods
  useEffect(() => {
    if (!open || !coachId) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const q = searchTerm.trim()
        const { foods } = await searchCoachFoodLibrary(coachId, {
          search: q || undefined,
          pageSize: 300,
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
    return () => { cancelled = true; clearTimeout(t) }
  }, [searchTerm, open, coachId])

  const filtered = results.filter((f) =>
    category === 'todos' ? true : normalizeCategory(f.category) === category
  )

  const parsedQuantity = parseFloat(quantity) || 0
  const preview = picked ? previewMacrosForQuantity(toFoodDraftShape(picked), parsedQuantity, unit) : null

  const handlePickFood = (f: FoodRow) => {
    setPicked(f)
    const defaultUnit = f.is_liquid ? 'ml' : normalizeUnit(f.serving_unit)
    setUnit(defaultUnit)
    setQuantity(String(f.serving_size || (f.is_liquid ? 200 : 100)))
  }

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

  if (!open) return null

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal panel — full screen on mobile, centered card on desktop */}
      <div
        role="dialog"
        aria-modal
        aria-label="Buscar alimento"
        className={cn(
          // Mobile: bottom sheet
          'fixed inset-x-0 bottom-0 z-[71] flex flex-col',
          'h-[92dvh] rounded-t-2xl',
          // Desktop: centered modal — reset inset, use transform centering
          'sm:inset-auto sm:bottom-auto',
          'sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:h-[82vh] sm:max-h-[780px] sm:w-[520px] sm:rounded-2xl',
          // Theming
          'bg-white dark:bg-zinc-900',
          'border border-zinc-200 dark:border-white/10',
          'shadow-2xl',
          'overflow-hidden'
        )}
      >
        {/* ── HEADER ── fixed, never scrolls */}
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
          {picked ? (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
              aria-label="Volver"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
          <span className="flex-1 text-sm font-black uppercase tracking-widest text-zinc-800 dark:text-white">
            {picked ? picked.name : 'Buscar alimento'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── SEARCH VIEW ── */}
        {!picked && (
          <>
            {/* Search input — fixed below header */}
            <div className="shrink-0 px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  ref={searchRef}
                  placeholder="Buscar por nombre (opcional)…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 pl-9 bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            {/* Category pills — horizontal scroll, fixed */}
            <div className="shrink-0 overflow-x-auto px-4 pb-2 scrollbar-none">
              <div className="flex gap-1.5 w-max">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap transition-colors',
                      category === c.id
                        ? 'bg-[color:var(--theme-primary,#007AFF)] text-white shadow-sm'
                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── FOOD LIST — this is the ONLY scrollable area ── */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {loading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
                </div>
              )}

              {!loading && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-zinc-400">
                  {results.length > 0
                    ? 'Sin alimentos en esta categoría.'
                    : searchTerm.trim()
                    ? `Sin resultados para "${searchTerm}".`
                    : 'No hay alimentos en el catálogo.'}
                </p>
              )}

              {!loading && filtered.length > 0 && (
                <div className="space-y-1.5">
                  {filtered.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handlePickFood(f)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                        'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
                        'dark:border-white/8 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:hover:border-white/15',
                        'active:scale-[0.99]'
                      )}
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">
                        {f.name}
                        {f.brand && (
                          <span className="ml-1.5 text-[10px] font-normal text-zinc-400">{f.brand}</span>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {f.calories} kcal
                        </span>
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        <MacroPill label="P " value={f.protein_g} color="text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10" />
                        <MacroPill label="C " value={f.carbs_g} color="text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10" />
                        <MacroPill label="G " value={f.fats_g} color="text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10" />
                        {f.is_liquid && (
                          <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-500 dark:bg-sky-500/10">
                            ml
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── QUANTITY VIEW — shown after picking a food ── */}
        {picked && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-4">
            {/* Food summary card */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-base font-bold text-zinc-900 dark:text-white">{picked.name}</p>
              {picked.brand && (
                <p className="text-xs text-zinc-400">{picked.brand}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-white/10 dark:border-white/10 dark:text-white">
                  {picked.calories} kcal / {picked.serving_size}{picked.serving_unit ?? 'g'}
                </span>
                <MacroPill label="P " value={picked.protein_g} color="text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10" />
                <MacroPill label="C " value={picked.carbs_g} color="text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10" />
                <MacroPill label="G " value={picked.fats_g} color="text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10" />
              </div>
            </div>

            {/* Quantity + unit inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Cantidad
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  autoFocus
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-12 text-center text-lg font-bold bg-zinc-100 border-zinc-200 dark:bg-white/5 dark:border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Unidad
                </Label>
                <div className="flex h-12 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
                  {(picked.is_liquid ? (['ml', 'un'] as const) : (['g', 'un'] as const)).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={cn(
                        'flex-1 text-sm font-bold transition-colors',
                        unit === u
                          ? 'bg-[color:var(--theme-primary,#007AFF)] text-white'
                          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                      )}
                    >
                      {u === 'un' && picked.is_liquid ? `un` : u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Macro preview */}
            {preview && parsedQuantity > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Aporte estimado
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white">
                    {preview.calories}
                  </span>
                  <span className="text-sm text-zinc-400">kcal</span>
                </div>
                <div className="mt-2 flex gap-3 text-xs">
                  <span>
                    <span className="font-bold text-blue-500">{preview.protein}g</span>
                    <span className="text-zinc-400"> P</span>
                  </span>
                  <span>
                    <span className="font-bold text-amber-500">{preview.carbs}g</span>
                    <span className="text-zinc-400"> C</span>
                  </span>
                  <span>
                    <span className="font-bold text-rose-500">{preview.fats}g</span>
                    <span className="text-zinc-400"> G</span>
                  </span>
                </div>
              </div>
            )}

            <div className="mt-auto">
              <Button
                type="button"
                onClick={handleAdd}
                className="h-12 w-full gap-2 rounded-xl bg-[color:var(--theme-primary,#007AFF)] text-sm font-black text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Agregar a la comida
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )

  // Portal to body to avoid stacking context issues
  if (typeof window === 'undefined') return null
  return createPortal(modal, document.body)
}
