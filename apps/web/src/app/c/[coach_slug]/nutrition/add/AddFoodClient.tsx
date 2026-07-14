'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Barcode, ChevronLeft, Clock3, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  NUTRITION_INTAKE_ACTIONS,
  NUTRITION_MEAL_SLOT_IDS,
  NUTRITION_MEAL_SLOT_LABELS,
  calculateFoodItemMacros,
  formatFoodReference,
  normalizeFoodSearchText,
  parseGtin,
  preferredFoodIntakeQuantity,
  preferredFoodIntakeUnit,
  type NutritionIntakeActionId,
  type NutritionMealSlot,
} from '@eva/nutrition-engine'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { addIntakeEntryAction } from '../_actions/intake.actions'

const UNITS = ['g', 'ml', 'un'] as const
type IntakeUnit = (typeof UNITS)[number]
type IntakeSource = 'offplan' | 'quickadd' | 'recent' | 'copy'

type Food = {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
  is_liquid: boolean | null
}

type SelectedFood = { food: Food; source: IntakeSource }

interface Props {
  coachSlug: string
  backHref: string
  today: string
  recents: Food[]
}

const FOOD_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid'

function allowedUnits(food: Food): readonly IntakeUnit[] {
  return food.is_liquid || food.serving_unit === 'ml' ? ['ml', 'un'] : ['g', 'un']
}

function defaultMealSlot(): NutritionMealSlot {
  const hour = new Date().getHours()
  if (hour < 10) return 'breakfast'
  if (hour < 12) return 'morning_snack'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'afternoon_snack'
  return 'dinner'
}

function captureMethod(source: IntakeSource): 'search' | 'barcode' | 'recent' | 'copy' {
  if (source === 'quickadd') return 'barcode'
  if (source === 'recent') return 'recent'
  if (source === 'copy') return 'copy'
  return 'search'
}

export function AddFoodClient({ coachSlug, backHref, today, recents }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<NutritionIntakeActionId>('search')
  const [mealSlot, setMealSlot] = useState<NutritionMealSlot>('other')
  const [term, setTerm] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [selected, setSelected] = useState<SelectedFood | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState<IntakeUnit>('g')
  const [searching, setSearching] = useState(false)
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => setMealSlot(defaultMealSlot()), [])

  useEffect(() => {
    if (mode !== 'search' || selected) return
    const normalized = normalizeFoodSearchText(term)
    if (normalized.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('foods')
        .select(FOOD_SELECT)
        .ilike('name_search', `%${normalized}%`)
        .order('name')
        .limit(40)

      if (!cancelled) {
        setResults((data as unknown as Food[]) ?? [])
        setSearching(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, selected, supabase, term])

  function pickFood(food: Food, source: IntakeSource) {
    const preferredUnit = preferredFoodIntakeUnit(food) as IntakeUnit
    setSelected({ food, source })
    setUnit(preferredUnit)
    setQuantity(String(preferredFoodIntakeQuantity(food)))
  }

  function changeUnit(nextUnit: IntakeUnit) {
    if (!selected) return
    const currentQuantity = Number(quantity.replace(',', '.'))
    const previousDefault = unit === 'un' ? 1 : preferredFoodIntakeQuantity(selected.food)
    setUnit(nextUnit)
    if (!Number.isFinite(currentQuantity) || currentQuantity === previousDefault) {
      setQuantity(nextUnit === 'un' ? '1' : String(preferredFoodIntakeQuantity({
        ...selected.food,
        serving_unit: nextUnit,
        is_liquid: nextUnit === 'ml',
      })))
    }
  }

  async function lookupBarcode() {
    const barcode = parseGtin(barcodeInput)
    if (!barcode) {
      toast.error('Código inválido. Revisa los dígitos del EAN/GTIN.')
      return
    }

    setLookingUpBarcode(true)
    try {
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              limit: (count: number) => {
                maybeSingle: () => Promise<{ data: unknown; error: { code?: string } | null }>
              }
            }
          }
        }
      }
      const { data, error } = await client
        .from('foods')
        .select(`${FOOD_SELECT}, barcode`)
        .eq('barcode', barcode)
        .limit(1)
        .maybeSingle()

      if (error) {
        toast.error('No se pudo consultar el catálogo local. Prueba buscando por nombre.')
        return
      }
      if (!data) {
        toast.info('Producto no encontrado en el catálogo chileno. Prueba buscándolo por nombre.')
        setMode('search')
        setTerm('')
        return
      }
      pickFood(data as Food, 'quickadd')
    } finally {
      setLookingUpBarcode(false)
    }
  }

  function save() {
    if (!selected || isPending) return
    const parsedQuantity = Number(quantity.replace(',', '.'))
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Indica una cantidad mayor a cero.')
      return
    }

    startTransition(async () => {
      const result = await addIntakeEntryAction({
        coachSlug,
        logDate: today,
        foodId: selected.food.id,
        quantity: parsedQuantity,
        unit,
        source: selected.source,
        mealSlot,
        captureMethod: captureMethod(selected.source),
      })

      if (!result.success) {
        toast.error(result.error ?? 'No se pudo registrar el alimento.')
        return
      }

      toast.success(`${selected.food.name} agregado a ${NUTRITION_MEAL_SLOT_LABELS[mealSlot].toLowerCase()}`)
      router.push(backHref)
      router.refresh()
    })
  }

  const preview = useMemo(() => {
    if (!selected) return null
    const parsed = Number(quantity.replace(',', '.'))
    return calculateFoodItemMacros({
      quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      unit,
      foods: selected.food,
    })
  }, [quantity, selected, unit])

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex h-11 w-11 items-center justify-center rounded-control bg-muted text-foreground transition-transform active:scale-[.97]"
            aria-label="Volver a nutrición"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground">Registrar alimento</h1>
            <p className="text-[11px] font-semibold text-muted-foreground">Consumo real · Hoy</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-28 md:max-w-5xl">
        <section className="rounded-card border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">¿En qué comida?</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {NUTRITION_MEAL_SLOT_IDS.map((slot) => (
              <button
                type="button"
                key={slot}
                onClick={() => setMealSlot(slot)}
                aria-pressed={mealSlot === slot}
                className={cn(
                  'h-10 shrink-0 rounded-full border px-3 text-xs font-extrabold transition-colors',
                  mealSlot === slot
                    ? 'border-ember-500 bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300'
                    : 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {NUTRITION_MEAL_SLOT_LABELS[slot]}
              </button>
            ))}
          </div>
        </section>

        {!selected ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {NUTRITION_INTAKE_ACTIONS.map((action) => {
                const active = action.id === mode
                const Icon = action.id === 'search' ? Search : action.id === 'barcode' ? Barcode : Clock3
                return (
                  <button
                    type="button"
                    key={action.id}
                    onClick={() => setMode(action.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-card border px-2 text-center transition-all active:scale-[.97]',
                      active
                        ? 'border-ember-500 bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-extrabold">{action.shortLabel}</span>
                  </button>
                )
              })}
            </div>

            {mode === 'search' && (
              <section className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    autoFocus
                    placeholder="Buscar pollo, marraqueta, yogur…"
                    className="h-13 w-full rounded-control border border-border bg-card pl-12 pr-12 text-sm font-semibold text-foreground outline-none transition focus:border-ember-500 focus:ring-4 focus:ring-ember-500/10"
                  />
                  {searching && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                {term.trim().length < 2 ? (
                  <Hint>Escribe al menos dos letras. EVA consulta el catálogo local guardado en Supabase.</Hint>
                ) : results.length === 0 && !searching ? (
                  <Hint>No encontramos “{term.trim()}”. Prueba con otra palabra o una marca.</Hint>
                ) : (
                  <FoodList foods={results} onPick={(food) => pickFood(food, 'offplan')} />
                )}
              </section>
            )}

            {mode === 'barcode' && (
              <section className="space-y-3">
                <div className="rounded-card border border-border bg-card p-5 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-control bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
                    <Barcode className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 font-display text-xl font-extrabold tracking-tight text-foreground">Buscar por código</h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Escribe el EAN/GTIN del envase. EVA consulta su catálogo local, sin llamadas externas por búsqueda.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    inputMode="numeric"
                    placeholder="EAN / GTIN"
                    className="h-13 min-w-0 flex-1 rounded-control border border-border bg-card px-4 font-mono text-sm font-bold text-foreground outline-none focus:border-ember-500 focus:ring-4 focus:ring-ember-500/10"
                  />
                  <button
                    type="button"
                    onClick={lookupBarcode}
                    disabled={lookingUpBarcode}
                    className="flex h-13 w-14 items-center justify-center rounded-control bg-foreground text-background transition-transform active:scale-[.97] disabled:opacity-50"
                    aria-label="Buscar código"
                  >
                    {lookingUpBarcode ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                  </button>
                </div>
                <Hint>En React Native este flujo usa la cámara. En web y PWA la entrada manual queda disponible.</Hint>
              </section>
            )}

            {mode === 'recent' && (
              recents.length > 0
                ? <FoodList foods={recents} onPick={(food) => pickFood(food, 'recent')} />
                : <Hint>Tus alimentos recientes aparecerán aquí después del primer registro.</Hint>
            )}
          </>
        ) : (
          <section className="space-y-4">
            <div className="rounded-card border border-border bg-card p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-ember-700 dark:text-ember-300">
                {NUTRITION_MEAL_SLOT_LABELS[mealSlot]}
              </p>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground">{selected.food.name}</h2>
              {selected.food.brand && <p className="mt-1 text-sm font-semibold text-muted-foreground">{selected.food.brand}</p>}
              <p className="mt-2 font-mono text-[11px] font-semibold text-muted-foreground">
                Base nutricional: {formatFoodReference(selected.food)}
              </p>

              <div className="mt-5 flex gap-2">
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  inputMode="decimal"
                  className="h-13 w-28 rounded-control border border-border bg-muted px-4 font-mono text-base font-bold text-foreground outline-none focus:border-ember-500"
                  aria-label="Cantidad"
                />
                <div className={cn('grid min-w-0 flex-1 gap-2', allowedUnits(selected.food).length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                  {allowedUnits(selected.food).map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => changeUnit(value)}
                      className={cn(
                        'h-13 rounded-control border text-sm font-extrabold transition-transform active:scale-[.97]',
                        unit === value
                          ? 'border-ember-500 bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300'
                          : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {unit === 'un' && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  1 unidad equivale aproximadamente a {selected.food.serving_size || 100} g.
                </p>
              )}

              {preview && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Metric label="kcal" value={preview.calories} className="bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300" />
                  <Metric label="P" value={preview.protein} className="bg-sport-100 text-sport-700 dark:bg-sport-500/15 dark:text-sport-300" />
                  <Metric label="C" value={preview.carbs} className="bg-aqua-100 text-aqua-700 dark:bg-aqua-500/15 dark:text-aqua-300" />
                  <Metric label="G" value={preview.fats} className="bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-13 rounded-control border border-border bg-card text-sm font-extrabold text-foreground transition-transform active:scale-[.97]"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="flex h-13 items-center justify-center gap-2 rounded-control bg-ember-500 text-sm font-extrabold text-white transition-transform active:scale-[.97] disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                Agregar al día
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function FoodList({ foods, onPick }: { foods: Food[]; onPick: (food: Food) => void }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
      {foods.map((food, index) => (
        <button
          type="button"
          key={food.id}
          onClick={() => onPick(food)}
          className={cn(
            'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45 active:bg-muted',
            index > 0 && 'border-t border-border/70',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-foreground">{food.name}</span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
              {food.brand ? `${food.brand} · ` : ''}{formatFoodReference(food)}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
            <Plus className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card px-5 py-6 text-center text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

function Metric({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5', className)}>
      <span className="font-mono text-xs font-black tabular-nums">{Math.round(value)}</span>
      <span className="text-[11px] font-black">{label}</span>
    </span>
  )
}
