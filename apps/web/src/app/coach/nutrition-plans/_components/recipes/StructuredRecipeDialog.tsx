'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChefHat, Clock3, Loader2, Plus, Scale, Trash2, X } from 'lucide-react'
import {
  calculateStructuredRecipePerServing,
  preferredFoodIntakeQuantity,
  preferredFoodIntakeUnit,
  type RecipeIngredientUnit,
} from '@eva/nutrition-engine'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearch, type Food } from '@/app/coach/foods/FoodSearch'
import {
  getStructuredRecipeAction,
  saveStructuredRecipeAction,
} from '../../_actions/recipes.actions'
import type { RecipeIngredientRow, RecipeRow } from '@/services/nutrition-recipes.service'
import { toast } from 'sonner'

const CATEGORIES = [
  'Desayuno',
  'Almuerzo',
  'Cena',
  'Colación',
  'Postre',
  'Bebida',
  'Preparación base',
] as const

type IngredientDraft = {
  key: string
  food: Food
  quantity: number
  unit: RecipeIngredientUnit
  note: string
}

type Props = {
  recipe?: RecipeRow | null
  trigger?: ReactNode
}

function ingredientFood(row: RecipeIngredientRow): Food {
  return {
    id: row.food_id ?? '',
    name: row.name_snapshot,
    brand: row.brand_snapshot,
    serving_size: Number(row.serving_size_snapshot) || 100,
    serving_unit: row.serving_unit_snapshot,
    calories: Number(row.calories_snapshot) || 0,
    protein_g: Number(row.protein_g_snapshot) || 0,
    carbs_g: Number(row.carbs_g_snapshot) || 0,
    fats_g: Number(row.fats_g_snapshot) || 0,
    fiber_g: row.fiber_g_snapshot == null ? null : Number(row.fiber_g_snapshot),
    is_liquid: row.serving_unit_snapshot === 'ml',
    coach_id: null,
    category: null,
  }
}

function asEngineIngredient(item: IngredientDraft, orderIndex: number) {
  return {
    food_id: item.food.id,
    name_snapshot: item.food.name,
    brand_snapshot: item.food.brand,
    quantity: item.quantity,
    unit: item.unit,
    calories_snapshot: item.food.calories,
    protein_g_snapshot: item.food.protein_g,
    carbs_g_snapshot: item.food.carbs_g,
    fats_g_snapshot: item.food.fats_g,
    fiber_g_snapshot: item.food.fiber_g,
    serving_size_snapshot: item.food.serving_size,
    serving_unit_snapshot: item.food.serving_unit,
    order_index: orderIndex,
    note: item.note || null,
  }
}

function allowedUnits(food: Food): RecipeIngredientUnit[] {
  return food.is_liquid || food.serving_unit === 'ml' ? ['ml', 'un'] : ['g', 'un']
}

export function StructuredRecipeDialog({ recipe, trigger }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [servings, setServings] = useState('2')
  const [prepTime, setPrepTime] = useState('20')
  const [category, setCategory] = useState('')
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([])
  const [pending, startTransition] = useTransition()

  const editing = recipe?.recipe_mode === 'structured'

  function reset() {
    setName('')
    setDescription('')
    setInstructions('')
    setServings('2')
    setPrepTime('20')
    setCategory('')
    setIngredients([])
    setShowSearch(false)
  }

  useEffect(() => {
    if (!open) return
    if (!editing || !recipe) {
      reset()
      return
    }

    let active = true
    setLoadingRecipe(true)
    void getStructuredRecipeAction({ recipeId: recipe.id })
      .then((result) => {
        if (!active) return
        if (!result.success || !result.recipe) {
          toast.error(result.error ?? 'No se pudo cargar la receta.')
          setOpen(false)
          return
        }
        const full = result.recipe
        setName(full.name)
        setDescription(full.description ?? '')
        setInstructions(full.instructions ?? '')
        setServings(String(full.servings || 1))
        setPrepTime(full.prep_time_minutes == null ? '' : String(full.prep_time_minutes))
        setCategory(full.category ?? '')
        setIngredients(
          (full.ingredients ?? []).map((row) => ({
            key: row.id,
            food: ingredientFood(row),
            quantity: Number(row.quantity),
            unit: row.unit,
            note: row.note ?? '',
          })),
        )
      })
      .finally(() => {
        if (active) setLoadingRecipe(false)
      })

    return () => {
      active = false
    }
  }, [editing, open, recipe])

  const parsedServings = Number(servings.replace(',', '.'))
  const perServing = useMemo(
    () => calculateStructuredRecipePerServing(
      ingredients.map(asEngineIngredient),
      parsedServings,
    ),
    [ingredients, parsedServings],
  )

  function addFood(food: Food) {
    const unit = preferredFoodIntakeUnit(food)
    setIngredients((current) => [
      ...current,
      {
        key: `${food.id}-${Date.now()}-${current.length}`,
        food,
        quantity: preferredFoodIntakeQuantity(food),
        unit,
        note: '',
      },
    ])
    setShowSearch(false)
  }

  function updateIngredient(index: number, patch: Partial<IngredientDraft>) {
    setIngredients((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )))
  }

  function changeUnit(index: number, nextUnit: RecipeIngredientUnit) {
    const item = ingredients[index]
    if (!item) return
    const previousDefault = item.unit === 'un' ? 1 : preferredFoodIntakeQuantity(item.food)
    const nextQuantity = item.quantity === previousDefault
      ? (nextUnit === 'un' ? 1 : preferredFoodIntakeQuantity({
          ...item.food,
          serving_unit: nextUnit,
          is_liquid: nextUnit === 'ml',
        }))
      : item.quantity
    updateIngredient(index, { unit: nextUnit, quantity: nextQuantity })
  }

  function save() {
    const servingsValue = Number(servings.replace(',', '.'))
    const prepValue = prepTime.trim() === '' ? null : Number(prepTime)
    if (!name.trim()) {
      toast.error('Escribe un nombre para la receta.')
      return
    }
    if (!Number.isFinite(servingsValue) || servingsValue <= 0) {
      toast.error('Las porciones deben ser mayores a cero.')
      return
    }
    if (ingredients.length === 0) {
      toast.error('Agrega al menos un ingrediente del catálogo.')
      return
    }
    if (ingredients.some((item) => !item.food.id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error('Revisa las cantidades y alimentos de la receta.')
      return
    }

    startTransition(async () => {
      const result = await saveStructuredRecipeAction({
        recipe_id: editing ? recipe?.id : null,
        name: name.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        image_url: null,
        servings: servingsValue,
        prep_time_minutes: prepValue,
        category: category || null,
        ingredients: ingredients.map((item, index) => ({
          food_id: item.food.id,
          quantity: item.quantity,
          unit: item.unit,
          note: item.note.trim() || null,
          order_index: index,
        })),
      })

      if (!result.success) {
        toast.error(result.error ?? 'No se pudo guardar la receta profesional.')
        return
      }

      toast.success(editing ? 'Receta profesional actualizada' : 'Receta profesional creada')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="h-11 gap-2 border-ember-300 text-ember-700 dark:text-ember-300"
        >
          <Scale className="h-4 w-4" />
          Receta Pro
        </Button>
      )}

      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden border-subtle bg-surface-card p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-control bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
              <Scale className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-xl font-extrabold normal-case tracking-tight text-strong">
                {editing ? 'Editar receta profesional' : 'Nueva receta profesional'}
              </DialogTitle>
              <p className="mt-0.5 text-xs font-semibold text-muted">
                Ingredientes cuantificables · macros por porción
              </p>
            </div>
          </div>
        </DialogHeader>

        {loadingRecipe ? (
          <div className="flex min-h-72 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ember-500" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="structured-recipe-name">Nombre</Label>
                <Input
                  id="structured-recipe-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej: Bowl de pollo y quinoa"
                  maxLength={160}
                  className="h-11 rounded-control border-default bg-surface-card"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="structured-recipe-description">Descripción breve</Label>
                <Input
                  id="structured-recipe-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Cuándo usarla o qué objetivo cumple"
                  maxLength={1000}
                  className="h-11 rounded-control border-default bg-surface-card"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="structured-recipe-servings">Porciones</Label>
                <Input
                  id="structured-recipe-servings"
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                  inputMode="decimal"
                  className="eva-mono h-11 rounded-control border-default bg-surface-card"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="structured-recipe-time">Preparación (min)</Label>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    id="structured-recipe-time"
                    value={prepTime}
                    onChange={(event) => setPrepTime(event.target.value)}
                    inputMode="numeric"
                    className="eva-mono h-11 rounded-control border-default bg-surface-card pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="structured-recipe-category">Categoría</Label>
                <select
                  id="structured-recipe-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-control border border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
            </div>

            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-extrabold text-strong">Ingredientes</h3>
                  <p className="text-xs text-muted">Los nutrientes se derivan del catálogo EVA.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSearch((value) => !value)}
                  className="gap-1.5"
                >
                  {showSearch ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showSearch ? 'Cerrar' : 'Agregar'}
                </Button>
              </div>

              {showSearch && (
                <div className="rounded-card border border-subtle bg-surface-sunken p-4">
                  <FoodSearch onFoodSelected={addFood} />
                </div>
              )}

              {ingredients.length === 0 ? (
                <div className="rounded-card border border-dashed border-default bg-surface-sunken px-5 py-10 text-center">
                  <ChefHat className="mx-auto h-7 w-7 text-ember-400" />
                  <p className="mt-3 text-sm font-bold text-strong">Agrega ingredientes del catálogo</p>
                  <p className="mt-1 text-xs text-muted">Así EVA puede calcular porciones y macros confiables.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ingredients.map((item, index) => (
                    <div key={item.key} className="rounded-control border border-subtle bg-surface-card p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-strong">{item.food.name}</p>
                          {item.food.brand && <p className="truncate text-[11px] text-muted">{item.food.brand}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          aria-label={`Quitar ${item.food.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:bg-danger-100 hover:text-danger-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          value={String(item.quantity)}
                          onChange={(event) => updateIngredient(index, { quantity: Number(event.target.value) })}
                          inputMode="decimal"
                          aria-label={`Cantidad de ${item.food.name}`}
                          className="eva-mono h-10 w-full rounded-control border-default sm:w-28"
                        />
                        <div className="flex gap-1.5">
                          {allowedUnits(item.food).map((unit) => (
                            <button
                              type="button"
                              key={unit}
                              onClick={() => changeUnit(index, unit)}
                              aria-pressed={item.unit === unit}
                              className={`h-10 min-w-14 rounded-control border px-3 text-xs font-extrabold ${
                                item.unit === unit
                                  ? 'border-ember-500 bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300'
                                  : 'border-default bg-surface-card text-muted'
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={item.note}
                          onChange={(event) => updateIngredient(index, { note: event.target.value })}
                          placeholder="Nota opcional"
                          maxLength={500}
                          className="h-10 min-w-0 flex-1 rounded-control border-default"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-card border border-ember-200 bg-ember-50 p-4 dark:border-ember-500/20 dark:bg-ember-500/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ember-700 dark:text-ember-300">Por porción</p>
                  <p className="eva-mono mt-1 text-2xl font-black tabular-nums text-strong">
                    {Math.round(perServing.calories)} kcal
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs font-bold text-muted sm:grid-cols-4">
                  <span>P {Math.round(perServing.protein)}g</span>
                  <span>C {Math.round(perServing.carbs)}g</span>
                  <span>G {Math.round(perServing.fats)}g</span>
                  <span>Fibra {Math.round(perServing.fiber)}g</span>
                </div>
              </div>
            </section>

            <div className="mt-6 space-y-2">
              <Label htmlFor="structured-recipe-instructions">Preparación</Label>
              <textarea
                id="structured-recipe-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Describe los pasos de preparación…"
                maxLength={8000}
                rows={5}
                className="w-full resize-y rounded-control border border-default bg-surface-card px-3 py-3 text-sm text-strong outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-subtle bg-surface-sunken/50 px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={pending || loadingRecipe} className="min-w-40 bg-ember-500 text-white hover:bg-ember-600">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            {editing ? 'Guardar cambios' : 'Crear receta Pro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
