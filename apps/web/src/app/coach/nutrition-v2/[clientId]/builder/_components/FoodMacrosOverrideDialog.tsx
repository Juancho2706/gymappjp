'use client'

import { useMemo, useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  restoreFoodMacrosAction,
  saveFoodOverrideAction,
} from '@/app/coach/nutrition-v2/_actions/food-overrides.actions'
import type { BuilderFood, BuilderFoodMacrosPatch } from '../_lib/draft-builder'
import { inputClass } from '../_lib/builder-ui-classes'

/**
 * Corregir los macros de un alimento del catálogo (T2.2 — specs/nutrition-food-overrides).
 *
 * La corrección es del ALIMENTO, no de la fila: vale para este plan, para los que vengan y para
 * el buscador del coach. Por eso el diálogo dice en voz alta las dos consecuencias que nadie
 * adivina — que el número corregido queda para siempre asociado a ese alimento, y que los planes
 * YA publicados conservan el número viejo hasta que se republiquen.
 *
 * LA BASE NO SE PREGUNTA. El catálogo tiene dos convenciones vivas (`per_100` y `per_serving`) y
 * pedirle al coach que elija entre ellas es el camino directo a un plan congelado con la mitad
 * de las calorías. El diálogo hereda la base del alimento y la enuncia en la cabecera: "Macros
 * por 100 g" o "por porción de 50 g". El coach edita números, no convenciones.
 */

type MacroField = 'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG'

const FIELDS: Array<{ key: MacroField; label: string; unit: string }> = [
  { key: 'calories', label: 'Calorías', unit: 'kcal' },
  { key: 'proteinG', label: 'Proteína', unit: 'g' },
  { key: 'carbsG', label: 'Carbohidratos', unit: 'g' },
  { key: 'fatsG', label: 'Grasas', unit: 'g' },
  { key: 'fiberG', label: 'Fibra', unit: 'g' },
]

function toInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(Number(value))
}

function toNumber(value: string): number {
  const n = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** "por 100 g" / "por porción de 50 g" — lo que significan los números que se están editando. */
function basisLabel(food: BuilderFood): string {
  if (food.macrosBasis === 'per_serving') {
    const size = Number(food.servingSize)
    const unit = food.servingUnit || 'g'
    return Number.isFinite(size) && size > 0 ? `por porción de ${size} ${unit}` : 'por porción'
  }
  return 'por 100 g'
}

/**
 * Aviso suave, nunca bloqueante: 4·P + 4·C + 9·G debería parecerse a las calorías declaradas.
 * Una diferencia grande casi siempre es un dígito de más en un macro, y es el error que el coach
 * no ve hasta que el plan no cuadra. Se avisa y se deja guardar igual: hay alimentos reales que
 * no cierran por Atwater y el coach manda.
 */
function atwaterWarning(values: Record<MacroField, string>): string | null {
  const kcal = toNumber(values.calories)
  const derived = 4 * toNumber(values.proteinG) + 4 * toNumber(values.carbsG) + 9 * toNumber(values.fatsG)
  if (kcal <= 0 || derived <= 0) return null
  const diff = Math.abs(kcal - derived)
  if (diff <= Math.max(20, kcal * 0.2)) return null
  return `Los macros suman ~${Math.round(derived)} kcal y escribiste ${Math.round(kcal)}. Revisa por las dudas.`
}

export function FoodMacrosOverrideDialog({
  food,
  clientId,
  open,
  onOpenChange,
  onApplied,
}: {
  food: BuilderFood
  /** Pista de revalidación (puede ser null en el builder de plantillas). */
  clientId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** El borrador aplica el cambio a TODAS las apariciones del alimento. */
  onApplied: (patch: BuilderFoodMacrosPatch) => void
}) {
  const [values, setValues] = useState<Record<MacroField, string>>({
    calories: toInput(food.calories),
    proteinG: toInput(food.proteinG),
    carbsG: toInput(food.carbsG),
    fatsG: toInput(food.fatsG),
    fiberG: toInput(food.fiberG ?? 0),
  })
  const [householdLabel, setHouseholdLabel] = useState('')
  const [householdGrams, setHouseholdGrams] = useState('')
  const [pending, startTransition] = useTransition()

  const warning = useMemo(() => atwaterWarning(values), [values])
  const original = food.originalMacros ?? null

  function set(key: MacroField, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    const label = householdLabel.trim()
    const grams = toNumber(householdGrams)
    if ((label.length > 0) !== (grams > 0)) {
      toast.error('La medida casera necesita el nombre y los gramos juntos.')
      return
    }

    startTransition(async () => {
      const res = await saveFoodOverrideAction({
        foodId: food.id,
        clientId,
        values: {
          calories: toNumber(values.calories),
          proteinG: toNumber(values.proteinG),
          carbsG: toNumber(values.carbsG),
          fatsG: toNumber(values.fatsG),
          fiberG: toNumber(values.fiberG),
          // Hereda la base del alimento: el coach editó los números que estaba viendo.
          macrosBasis: food.macrosBasis === 'per_serving' ? 'per_serving' : 'per_100',
          householdLabel: label.length > 0 ? label : null,
          householdGrams: grams > 0 ? grams : null,
        },
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onApplied({
        calories: toNumber(values.calories),
        proteinG: toNumber(values.proteinG),
        carbsG: toNumber(values.carbsG),
        fatsG: toNumber(values.fatsG),
        fiberG: toNumber(values.fiberG),
        macrosBasis: food.macrosBasis ?? null,
        hasOverride: true,
        // El original es el del CATÁLOGO: si ya había una corrección, se conserva el valor
        // de partida en vez de guardar la corrección anterior como si fuera el catálogo.
        originalMacros: original ?? {
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatsG: food.fatsG,
          fiberG: food.fiberG,
        },
      })
      onOpenChange(false)
      toast.success('Macros corregidos', {
        description: 'Los planes ya publicados conservan los números anteriores: republica para propagarlos.',
      })
    })
  }

  function handleRestore() {
    if (original == null) return
    startTransition(async () => {
      const res = await restoreFoodMacrosAction({ foodId: food.id, clientId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onApplied({
        calories: original.calories,
        proteinG: original.proteinG,
        carbsG: original.carbsG,
        fatsG: original.fatsG,
        fiberG: original.fiberG,
        macrosBasis: food.macrosBasis ?? null,
        hasOverride: false,
        originalMacros: null,
      })
      onOpenChange(false)
      toast.success('Alimento restaurado al catálogo')
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir macros de {food.name}</DialogTitle>
          <DialogDescription>
            Valores {basisLabel(food)}. La corrección es tuya y vale para todos tus planes nuevos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <label className="w-32 shrink-0 text-sm text-muted" htmlFor={`macro-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`macro-${field.key}`}
                className={inputClass}
                inputMode="decimal"
                value={values[field.key]}
                onChange={(e) => set(field.key, e.target.value)}
              />
              <span className="w-10 shrink-0 text-xs text-muted">{field.unit}</span>
            </div>
          ))}

          <div className="mt-1 border-t border-border-subtle pt-3">
            <p className="mb-2 text-xs text-muted">
              Medida casera (opcional). Van juntas: “1 pocillo” y cuántos gramos pesa.
            </p>
            <div className="flex items-center gap-3">
              <input
                className={inputClass}
                aria-label="Nombre de la medida casera"
                placeholder="1 pocillo"
                maxLength={40}
                value={householdLabel}
                onChange={(e) => setHouseholdLabel(e.target.value)}
              />
              <input
                className={inputClass}
                aria-label="Gramos de la medida casera"
                placeholder="90"
                inputMode="decimal"
                value={householdGrams}
                onChange={(e) => setHouseholdGrams(e.target.value)}
              />
              <span className="w-10 shrink-0 text-xs text-muted">g</span>
            </div>
          </div>

          {warning ? (
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-muted">{warning}</p>
          ) : null}

          {original ? (
            <p className="text-xs text-muted">
              Catálogo: <span className="line-through">{Math.round(original.calories)} kcal</span> ·{' '}
              {Math.round(original.proteinG)}P · {Math.round(original.carbsG)}C · {Math.round(original.fatsG)}G
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          {original ? (
            <Button type="button" variant="ghost" onClick={handleRestore} disabled={pending}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Restaurar catálogo
            </Button>
          ) : null}
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar corrección'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
