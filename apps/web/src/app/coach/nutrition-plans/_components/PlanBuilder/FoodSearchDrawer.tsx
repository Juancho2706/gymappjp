'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Loader2, Search, X, ChevronLeft, Plus, PenLine, Heart, AlertTriangle, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { previewMacrosForQuantity } from './MacroCalculator'
import type { FoodItemDraft } from './types'
import { searchCoachFoodLibrary } from '../../_actions/food-library.actions'
import { addCoachCustomFood } from '../../_actions/nutrition-coach.actions'
import { listCoachMealGroups } from '../../../meal-groups/_actions/meal-groups.actions'

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
  selectionMode?: 'add-food' | 'add-swap'
  onConfirmSwapFood?: (food: FoodRow) => void
  excludedFoodIds?: string[]
  /** food_ids the current client has marked as favorite — shows ❤️ badge */
  clientFavoriteIds?: Set<string>
  /** food_ids marcados como ALERGIA — badge rojo + confirmacion bloqueante al elegir (A3). */
  clientAllergyIds?: Set<string>
  /** food_ids marcados como INTOLERANCIA — badge ambar de aviso (A3, distinto de dislike). */
  clientIntoleranceIds?: Set<string>
  /** food_ids marcados como "no le gusta" — badge gris de aviso blando (A3). */
  clientDislikeIds?: Set<string>
  /** Habilita el tab "Grupos" (oculto en modo porciones/intercambios y en add-swap). */
  groupsEnabled?: boolean
  /** Inserta TODOS los alimentos de un grupo como ítems normales de la comida activa. */
  onInsertGroup?: (items: FoodItemDraft[]) => void
}

/** Fila de item de un grupo (`saved_meal_items` + `food:foods(*)`). */
type MealGroupItemRow = {
  id: string
  quantity: number
  unit: string | null
  food: FoodRow | null
}

/** Grupo del coach (`saved_meals` + items). */
type MealGroupRow = {
  id: string
  name: string
  items: MealGroupItemRow[] | null
}

/**
 * Normaliza la unidad guardada en el grupo a la convención del builder de comidas.
 * El modal de grupos guarda 'g' | 'u'; el drawer usa 'g' | 'ml' | 'un'. Para que el
 * plan quede byte-idéntico a un alimento agregado a mano, los líquidos usan 'ml'|'un'
 * y los sólidos 'g'|'un' (espejo del toggle de FoodSearchDrawer).
 */
function mealGroupUnitToMealUnit(raw: string | null | undefined, isLiquid: boolean): 'g' | 'ml' | 'un' {
  const u = (raw ?? 'g').toLowerCase().trim()
  if (u === 'un' || u === 'u' || u === 'unidad' || u === 'unidades') return 'un'
  return isLiquid ? 'ml' : 'g'
}

/** ~kcal y P del grupo — mismo cálculo que la biblioteca /coach/meal-groups (label aprox). */
function mealGroupTotals(items: MealGroupItemRow[]) {
  return items.reduce(
    (acc, item) => {
      if (!item.food) return acc
      const quantity = Number(item.quantity) || 0
      const unit = (item.unit ?? 'g').toLowerCase()
      const factor = unit === 'g' || unit === 'ml' ? quantity / 100 : quantity
      return {
        calories: acc.calories + (Number(item.food.calories) || 0) * factor,
        protein: acc.protein + (Number(item.food.protein_g) || 0) * factor,
      }
    },
    { calories: 0, protein: 0 }
  )
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
  if (u === 'un' || u === 'unidades' || u === 'unidad') return 'un'
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

function VirtualFoodList({
  items,
  clientFavoriteIds,
  clientAllergyIds,
  clientIntoleranceIds,
  clientDislikeIds,
  onPickFood,
  onGoCreate,
  scrollRef,
}: {
  items: FoodRow[]
  clientFavoriteIds?: Set<string>
  clientAllergyIds?: Set<string>
  clientIntoleranceIds?: Set<string>
  clientDislikeIds?: Set<string>
  onPickFood: (f: FoodRow) => void
  onGoCreate: () => void
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const parentRef = scrollRef
  const totalCount = items.length + 1 // +1 for create button at end

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 5,
  })

  return (
    <div ref={parentRef} className="space-y-0" style={{ overflow: 'visible' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const isCreateBtn = vItem.index === items.length
          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vItem.start}px)` }}
              className={vItem.index < items.length ? 'pb-1.5' : 'pb-0'}
            >
              {isCreateBtn ? (
                <button
                  type="button"
                  onClick={onGoCreate}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-default py-2.5 text-xs font-bold text-sport-600 transition-colors hover:bg-surface-sunken"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  ¿No está? Crear alimento
                </button>
              ) : (() => {
                const f = items[vItem.index]!
                const isAllergy = clientAllergyIds?.has(f.id) ?? false
                const isIntolerance = !isAllergy && (clientIntoleranceIds?.has(f.id) ?? false)
                const isDislike = !isAllergy && !isIntolerance && (clientDislikeIds?.has(f.id) ?? false)
                return (
                  <button
                    type="button"
                    onClick={() => onPickFood(f)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-colors active:scale-[0.99]',
                      isAllergy
                        ? 'border-[var(--danger-500)]/40 bg-[var(--danger-500)]/[0.06] hover:bg-[var(--danger-500)]/10'
                        : 'border-subtle bg-surface-card hover:border-default hover:bg-surface-sunken'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="flex-1 text-sm font-semibold text-strong leading-tight">
                        {f.name}
                        {f.brand && <span className="ml-1.5 text-[10px] font-normal text-subtle">{f.brand}</span>}
                      </p>
                      {isAllergy && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--danger-500)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--danger-600)]">
                          <AlertTriangle className="h-3 w-3" /> Alergia
                        </span>
                      )}
                      {isIntolerance && (
                        <span className="inline-flex shrink-0 items-center rounded-md bg-[var(--warning-500)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--warning-600)]">
                          Intolerancia
                        </span>
                      )}
                      {isDislike && (
                        <span className="inline-flex shrink-0 items-center rounded-md bg-[var(--ink-100)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                          No le gusta
                        </span>
                      )}
                      {clientFavoriteIds?.has(f.id) && (
                        <Heart role="img" className="h-3.5 w-3.5 shrink-0 fill-[var(--ember-500)] text-[var(--ember-500)]" aria-label="Favorito del cliente" />
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-xs font-bold text-body">{f.calories} kcal</span>
                      <span className="text-subtle">·</span>
                      <MacroPill label="P " value={f.protein_g} color="text-[var(--ember-600)] bg-[var(--ember-100)]" />
                      <MacroPill label="C " value={f.carbs_g} color="text-[var(--sport-600)] bg-[var(--sport-100)]" />
                      <MacroPill label="G " value={f.fats_g} color="text-[var(--aqua-700)] bg-[var(--aqua-100)]" />
                      {f.is_liquid && (
                        <span className="rounded-md bg-[var(--aqua-500)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--aqua-600)]">ml</span>
                      )}
                    </div>
                  </button>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type View = 'search' | 'create' | 'quantity'

export function FoodSearchDrawer({
  open,
  coachId,
  onClose,
  onConfirm,
  selectionMode = 'add-food',
  onConfirmSwapFood,
  excludedFoodIds = [],
  clientFavoriteIds,
  clientAllergyIds,
  clientIntoleranceIds,
  clientDislikeIds,
  groupsEnabled = false,
  onInsertGroup,
}: Props) {
  const [view, setView] = useState<View>('search')
  // Tab del search view: alimentos individuales vs grupos guardados del coach.
  const showGroupsTab = groupsEnabled && selectionMode === 'add-food'
  const [tab, setTab] = useState<'foods' | 'groups'>('foods')
  const [groups, setGroups] = useState<MealGroupRow[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  // Alimento alergeno pendiente de confirmacion (A3): bloquea el pick hasta override deliberado.
  const [allergyConfirm, setAllergyConfirm] = useState<FoodRow | null>(null)
  const allergyCancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('todos')
  const [picked, setPicked] = useState<FoodRow | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState<'g' | 'ml' | 'un'>('g')
  const [isCreating, setIsCreating] = useState(false)
  // Inline create form state
  const [newName, setNewName] = useState('')
  const [newCalories, setNewCalories] = useState('')
  const [newProtein, setNewProtein] = useState('')
  const [newCarbs, setNewCarbs] = useState('')
  const [newFats, setNewFats] = useState('')
  const [newUnit, setNewUnit] = useState<'g' | 'un'>('g')
  const [newServing, setNewServing] = useState('100')
  const [newCategory, setNewCategory] = useState('otro')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setView('search')
      setTab('foods')
      setSearchTerm('')
      setResults([])
      setLoading(false)
      setPicked(null)
      setAllergyConfirm(null)
      setQuantity('100')
      setUnit('g')
      setCategory('todos')
      setNewName('')
      setNewCalories('')
      setNewProtein('')
      setNewCarbs('')
      setNewFats('')
      setNewUnit('g')
      setNewServing('100')
      setNewCategory('otro')
    } else {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll list to top when category changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [category])

  // A11y del confirm de alergeno (A3): Escape cierra (accion segura) + foco al boton Cancelar.
  useEffect(() => {
    if (!allergyConfirm) return
    allergyCancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAllergyConfirm(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [allergyConfirm])

  // A11y del drawer (modal): Escape cierra + Tab atrapado dentro del panel. Cuando el confirm de
  // alergeno esta abierto, ese dialogo maneja su propio foco/Escape (no atrapamos aqui).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (allergyConfirm) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, allergyConfirm, onClose])

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

  // Carga los grupos del coach al abrir (solo cuando el tab Grupos está disponible).
  useEffect(() => {
    if (!open || !coachId || !showGroupsTab) return
    let cancelled = false
    setGroupsLoading(true)
    listCoachMealGroups(coachId)
      .then((data) => {
        if (!cancelled) setGroups((data as unknown as MealGroupRow[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false)
      })
    return () => { cancelled = true }
  }, [open, coachId, showGroupsTab])

  // Inserta un grupo = expande sus alimentos como ítems normales de la comida (copia).
  const handleInsertGroup = useCallback(
    (group: MealGroupRow) => {
      const items: FoodItemDraft[] = (group.items ?? [])
        .filter((it): it is MealGroupItemRow & { food: FoodRow } => !!it.food)
        .map((it) => ({
          food_id: it.food.id,
          food: toFoodDraftShape(it.food),
          quantity: Number(it.quantity) || 0,
          unit: mealGroupUnitToMealUnit(it.unit, it.food.is_liquid ?? false),
        }))
      if (items.length === 0) {
        toast.error('Este grupo no tiene alimentos')
        return
      }
      onInsertGroup?.(items)
      toast.success(`«${group.name}» agregado a la comida`)
    },
    [onInsertGroup]
  )

  // Rank de afinidad: favorito arriba, alergia/dislike abajo (favorito +2 · dislike -1 · alergia -2).
  const affinityRank = (id: string): number => {
    if (clientAllergyIds?.has(id)) return -2
    if (clientFavoriteIds?.has(id)) return 2
    if (clientIntoleranceIds?.has(id) || clientDislikeIds?.has(id)) return -1
    return 0
  }
  const filtered = results
    .filter((f) => !excludedFoodIds.includes(f.id))
    .filter((f) => category === 'todos' ? true : normalizeCategory(f.category) === category)
    .sort((a, b) => affinityRank(b.id) - affinityRank(a.id))

  const parsedQuantity = parseFloat(quantity) || 0
  const preview = picked ? previewMacrosForQuantity(toFoodDraftShape(picked), parsedQuantity, unit) : null

  const handlePickFood = useCallback((f: FoodRow) => {
    if (selectionMode === 'add-swap') {
      onConfirmSwapFood?.(f)
      onClose()
      return
    }
    setPicked(f)
    setView('quantity')
    const defaultUnit = f.is_liquid ? 'ml' : normalizeUnit(f.serving_unit)
    setUnit(defaultUnit)
    setQuantity(String(f.serving_size || (f.is_liquid ? 200 : 100)))
  }, [selectionMode, onConfirmSwapFood, onClose])

  // Intercepta el pick: si el alimento es alergeno del alumno, exige confirmacion deliberada (A3).
  const handleListPick = useCallback(
    (f: FoodRow) => {
      if (clientAllergyIds?.has(f.id)) {
        setAllergyConfirm(f)
        return
      }
      handlePickFood(f)
    },
    [clientAllergyIds, handlePickFood]
  )

  const handleGoCreate = useCallback(() => {
    setNewName(searchTerm.trim())
    setView('create')
  }, [searchTerm])

  const handleCreateFood = useCallback(async () => {
    const name = newName.trim()
    const calories = Math.round(parseFloat(newCalories) || 0)
    const protein_g = Math.round(parseFloat(newProtein) || 0)
    const carbs_g = Math.round(parseFloat(newCarbs) || 0)
    const fats_g = Math.round(parseFloat(newFats) || 0)
    const serving_size = parseFloat(newServing) || (newUnit === 'un' ? 60 : 100)

    if (!name) { toast.error('El nombre es obligatorio'); return }
    if (!newCalories) { toast.error('Las calorías son obligatorias'); return }

    setIsCreating(true)
    try {
      const res = await addCoachCustomFood(coachId, {
        name,
        calories,
        protein_g,
        carbs_g,
        fats_g,
        serving_size,
        serving_unit: newUnit,
        category: newCategory,
      })
      if (!res.success) {
        toast.error(res.error ?? 'Error al crear alimento')
        return
      }
      toast.success('Alimento creado')
      // Build synthetic FoodRow and auto-select it
      const synthetic: FoodRow = {
        id: res.foodId!,
        name,
        calories,
        protein_g,
        carbs_g,
        fats_g,
        serving_size,
        serving_unit: newUnit,
        coach_id: coachId,
        category: newCategory,
        is_liquid: false,
        brand: null,
      }
      // Add to results so it's visible if user goes back
      setResults((prev) => [synthetic, ...prev])
      handlePickFood(synthetic)
    } finally {
      setIsCreating(false)
    }
  }, [coachId, newName, newCalories, newProtein, newCarbs, newFats, newUnit, newServing, newCategory, handlePickFood])

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
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="Buscar alimento"
        className={cn(
          // Mobile: bottom sheet
          'fixed inset-x-0 bottom-0 z-[71] flex flex-col',
          'h-[92dvh] rounded-t-sheet',
          // Desktop: centered modal — reset inset, use transform centering
          'sm:inset-auto sm:bottom-auto',
          'sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:h-[82vh] sm:max-h-[780px] sm:w-[520px] sm:rounded-card',
          // Theming
          'bg-surface-card',
          'border border-subtle',
          'shadow-2xl',
          'overflow-hidden'
        )}
      >
        {/* ── HEADER ── fixed, never scrolls */}
        <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-3">
          {view !== 'search' ? (
            <button
              type="button"
              onClick={() => {
                if (view === 'quantity') { setPicked(null); setView('search') }
                else setView('search')
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-sunken"
              aria-label="Volver"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <Search className="h-4 w-4 shrink-0 text-subtle" />
          )}
          <span className="flex-1 font-display text-[17px] font-extrabold text-strong">
            {view === 'quantity' ? picked?.name : view === 'create' ? 'Nuevo alimento' : 'Buscar alimento'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-sunken"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── SEARCH VIEW ── */}
        {view === 'search' && (
          <>
            {showGroupsTab && (
              <div className="shrink-0 px-4 pt-3 pb-1">
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'foods', label: 'Alimentos' },
                    { value: 'groups', label: 'Grupos' },
                  ]}
                  value={tab}
                  onChange={(v) => setTab(v as 'foods' | 'groups')}
                />
              </div>
            )}
            {tab === 'foods' ? (
              <>
            {/* Search input — fixed below header */}
            <div className="shrink-0 px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <Input
                  ref={searchRef}
                  placeholder="Buscar por nombre (opcional)…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 pl-9 bg-surface-sunken border-default text-strong placeholder:text-subtle"
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
                        ? 'bg-[var(--text-strong)] text-[var(--surface-card)] shadow-sm'
                        : 'bg-surface-sunken text-muted hover:text-strong'
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
                  <Loader2 className="h-7 w-7 animate-spin text-subtle" />
                </div>
              )}

              {!loading && filtered.length === 0 && (
                <div className="py-10 text-center space-y-3">
                  <p className="text-sm text-muted">
                    {results.length > 0
                      ? 'Sin alimentos en esta categoría.'
                      : searchTerm.trim()
                      ? `Sin resultados para "${searchTerm}".`
                      : 'No hay alimentos en el catálogo.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleGoCreate}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-default px-4 py-2 text-xs font-bold text-sport-600 transition-colors hover:bg-surface-sunken"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    {searchTerm.trim() ? `Crear "${searchTerm.trim()}"` : 'Crear alimento'}
                  </button>
                </div>
              )}

              {!loading && filtered.length > 0 && (
                <VirtualFoodList
                  items={filtered}
                  clientFavoriteIds={clientFavoriteIds}
                  clientAllergyIds={clientAllergyIds}
                  clientIntoleranceIds={clientIntoleranceIds}
                  clientDislikeIds={clientDislikeIds}
                  onPickFood={handleListPick}
                  onGoCreate={handleGoCreate}
                  scrollRef={listRef}
                />
              )}
            </div>
              </>
            ) : (
              /* ── GROUPS LIST — insertar un grupo expande sus alimentos como ítems normales ── */
              <div
                className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {groupsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-7 w-7 animate-spin text-subtle" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="space-y-3 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sport-100)] text-[var(--sport-600)]">
                      <Layers className="h-6 w-6" />
                    </div>
                    <p className="text-sm text-muted">Aún no tenés grupos de comidas.</p>
                    <Link
                      href="/coach/meal-groups"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-default px-4 py-2 text-xs font-bold text-sport-600 transition-colors hover:bg-surface-sunken"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Creá tu primer grupo
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {groups.map((group) => {
                      const items = group.items ?? []
                      const totals = mealGroupTotals(items)
                      return (
                        <div key={group.id} className="rounded-2xl border border-subtle bg-surface-card p-3.5">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-strong">{group.name}</p>
                              <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                                {items.length} ingrediente{items.length === 1 ? '' : 's'} · ~{Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P
                              </p>
                            </div>
                            <Button
                              type="button"
                              onClick={() => handleInsertGroup(group)}
                              disabled={items.length === 0}
                              className="h-11 shrink-0 gap-1.5 rounded-xl bg-[color:var(--theme-primary,#007AFF)] px-3.5 text-xs font-black text-white hover:opacity-90 disabled:opacity-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Insertar
                            </Button>
                          </div>
                          {items.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {items.slice(0, 3).map((it) => (
                                <span
                                  key={it.id}
                                  className="whitespace-nowrap rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-body"
                                >
                                  {it.food?.name ?? '—'}
                                </span>
                              ))}
                              {items.length > 3 && (
                                <span className="px-1 py-0.5 text-[11px] font-bold text-subtle">+{items.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── CREATE VIEW — inline food form ── */}
        {view === 'create' && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Nombre</Label>
              <Input
                autoFocus
                placeholder="Ej: Pechuga de pollo"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-11 bg-surface-card border-default"
              />
            </div>

            <p className="rounded-xl bg-surface-sunken px-3 py-2 text-[11px] text-muted">
              Macros <strong className="text-body">por cada 100 gramos</strong>
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">
                  Kcal (100g)<span className="text-[var(--danger-500)] ml-0.5">*</span>
                </Label>
                <Input type="number" step="0.1" min={0} value={newCalories} onChange={(e) => setNewCalories(e.target.value)} className="h-10 bg-surface-card border-default" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Proteína (g)</Label>
                <Input type="number" step="0.1" min={0} value={newProtein} onChange={(e) => setNewProtein(e.target.value)} className="h-10 bg-surface-card border-default" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Carbos (g)</Label>
                <Input type="number" step="0.1" min={0} value={newCarbs} onChange={(e) => setNewCarbs(e.target.value)} className="h-10 bg-surface-card border-default" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Grasas (g)</Label>
                <Input type="number" step="0.1" min={0} value={newFats} onChange={(e) => setNewFats(e.target.value)} className="h-10 bg-surface-card border-default" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Unidad</Label>
                <Select value={newUnit} onValueChange={(v) => {
                  setNewUnit(v as 'g' | 'un')
                  setNewServing(v === 'un' ? '60' : '100')
                }}>
                  <SelectTrigger className="h-10 bg-surface-card border-default">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g — gramos</SelectItem>
                    <SelectItem value="un">un — unidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">
                  {newUnit === 'un' ? 'Gramos / 1 un' : 'Porción ref. (g)'}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={newServing}
                  onChange={(e) => setNewServing(e.target.value)}
                  className="h-10 bg-surface-card border-default"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-wide text-subtle">Categoría</Label>
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v ?? 'otro')}>
                <SelectTrigger className="h-10 bg-surface-card border-default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.id !== 'todos').map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-auto pt-2 pb-safe">
              <Button
                type="button"
                onClick={handleCreateFood}
                disabled={isCreating || !newName.trim() || !newCalories}
                className="h-12 w-full gap-2 rounded-xl bg-[color:var(--theme-primary,#007AFF)] text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isCreating ? 'Creando…' : 'Crear y agregar'}
              </Button>
            </div>
          </div>
        )}

        {/* ── QUANTITY VIEW — shown after picking a food ── */}
        {view === 'quantity' && picked && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-4">
            {/* Food summary card */}
            <div className="rounded-2xl border border-subtle bg-surface-sunken p-4">
              <p className="text-base font-bold text-strong">{picked.name}</p>
              {picked.brand && (
                <p className="text-xs text-subtle">{picked.brand}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-surface-card border border-subtle px-2 py-1 text-xs font-bold text-body">
                  {picked.calories} kcal / {picked.serving_size}{picked.serving_unit ?? 'g'}
                </span>
                <MacroPill label="P " value={picked.protein_g} color="text-[var(--ember-600)] bg-[var(--ember-100)]" />
                <MacroPill label="C " value={picked.carbs_g} color="text-[var(--sport-600)] bg-[var(--sport-100)]" />
                <MacroPill label="G " value={picked.fats_g} color="text-[var(--aqua-700)] bg-[var(--aqua-100)]" />
              </div>
            </div>

            {/* Quantity + unit inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-subtle">
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
                  className="h-12 text-center text-lg font-bold bg-surface-card border-default"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide text-subtle">
                  Unidad
                </Label>
                <div className="flex h-12 overflow-hidden rounded-xl border border-default">
                  {(picked.is_liquid ? (['ml', 'un'] as const) : (['g', 'un'] as const)).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={cn(
                        'flex-1 text-sm font-bold transition-colors',
                        unit === u
                          ? 'bg-[color:var(--theme-primary,#007AFF)] text-white'
                          : 'bg-surface-sunken text-muted hover:text-strong'
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
              <div className="rounded-2xl border border-subtle bg-surface-sunken p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-subtle">
                  Aporte estimado
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-strong">
                    {preview.calories}
                  </span>
                  <span className="text-sm text-muted">kcal</span>
                </div>
                <div className="mt-2 flex gap-3 text-xs">
                  <span>
                    <span className="font-bold text-[var(--ember-500)]">{preview.protein}g</span>
                    <span className="text-muted"> P</span>
                  </span>
                  <span>
                    <span className="font-bold text-[var(--sport-500)]">{preview.carbs}g</span>
                    <span className="text-muted"> C</span>
                  </span>
                  <span>
                    <span className="font-bold text-[var(--aqua-600)]">{preview.fats}g</span>
                    <span className="text-muted"> G</span>
                  </span>
                </div>
              </div>
            )}

            <div className="mt-auto pb-safe">
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

      {/* ── CONFIRMACIÓN DE ALÉRGENO (A3) — bloquea hasta override deliberado ── */}
      {allergyConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setAllergyConfirm(null)}
            aria-hidden
          />
          <div
            role="alertdialog"
            aria-modal
            aria-label="Confirmar alérgeno"
            aria-describedby="allergy-confirm-desc"
            className="relative w-full max-w-sm rounded-2xl border border-[var(--danger-500)]/40 bg-surface-card p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-[var(--danger-600)]">
              <AlertTriangle aria-hidden="true" className="h-5 w-5" />
              <p className="text-sm font-black uppercase tracking-widest">Posible alérgeno</p>
            </div>
            <p id="allergy-confirm-desc" className="mt-3 text-sm text-body">
              Este alumno marcó <span className="font-bold">{allergyConfirm.name}</span> como{' '}
              <span className="font-bold text-[var(--danger-600)]">alergia</span>. Agregarlo a
              su plan puede ser peligroso.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                ref={allergyCancelRef}
                type="button"
                variant="outline"
                onClick={() => setAllergyConfirm(null)}
                className="h-11 flex-1 rounded-xl font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const f = allergyConfirm
                  setAllergyConfirm(null)
                  handlePickFood(f)
                }}
                className="h-11 flex-1 rounded-xl bg-[var(--danger-600)] font-bold text-white hover:bg-[var(--danger-700)]"
              >
                Agregar igual
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // Portal to body to avoid stacking context issues
  if (typeof window === 'undefined') return null
  return createPortal(modal, document.body)
}
