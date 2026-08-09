import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { RotateCcw } from 'lucide-react-native'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { useTheme } from '../../context/ThemeContext'
import {
  restoreNutritionV2FoodMacros,
  saveNutritionV2FoodOverride,
} from '../../lib/nutrition-v2-food-overrides.api'
import type { BuilderFood, BuilderFoodMacrosPatch } from '../../lib/nutrition-v2-builder'

/**
 * Corregir los macros de un alimento del catalogo desde el builder movil (T2.2).
 * Espejo del dialogo web `FoodMacrosOverrideDialog`: mismos campos, mismas dos advertencias y
 * la MISMA regla de oro — la base declarada (`per_100` / `per_serving`) NO se pregunta. Se
 * hereda del alimento y se enuncia en la cabecera; pedirle al coach que elija entre dos
 * convenciones es el camino directo a un plan congelado con la mitad de las calorias.
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

function basisLabel(food: BuilderFood): string {
  if (food.macrosBasis === 'per_serving') {
    const size = Number(food.servingSize)
    const unit = food.servingUnit || 'g'
    return Number.isFinite(size) && size > 0 ? `por porción de ${size} ${unit}` : 'por porción'
  }
  return 'por 100 g'
}

/** Aviso suave (nunca bloquea): 4P + 4C + 9G deberia parecerse a las calorias declaradas. */
function atwaterWarning(values: Record<MacroField, string>): string | null {
  const kcal = toNumber(values.calories)
  const derived = 4 * toNumber(values.proteinG) + 4 * toNumber(values.carbsG) + 9 * toNumber(values.fatsG)
  if (kcal <= 0 || derived <= 0) return null
  const diff = Math.abs(kcal - derived)
  if (diff <= Math.max(20, kcal * 0.2)) return null
  return `Los macros suman ~${Math.round(derived)} kcal y escribiste ${Math.round(kcal)}. Revisa por las dudas.`
}

export function FoodMacrosOverrideSheet({
  food,
  scope,
  open,
  onClose,
  onApplied,
}: {
  food: BuilderFood
  scope: NutritionV2CoachScope
  open: boolean
  onClose: () => void
  onApplied: (patch: BuilderFoodMacrosPatch, message: string) => void
}) {
  const { theme } = useTheme()
  const [values, setValues] = useState<Record<MacroField, string>>({
    calories: toInput(food.calories),
    proteinG: toInput(food.proteinG),
    carbsG: toInput(food.carbsG),
    fatsG: toInput(food.fatsG),
    fiberG: toInput(food.fiberG ?? 0),
  })
  const [householdLabel, setHouseholdLabel] = useState('')
  const [householdGrams, setHouseholdGrams] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const warning = useMemo(() => atwaterWarning(values), [values])
  const original = food.originalMacros ?? null

  // El error de validacion es del INTENTO anterior: al tocar cualquier campo deja de describir lo
  // que hay en pantalla. Sin esto, completar los gramos que faltaban dejaba el reclamo en rojo
  // hasta volver a apretar Guardar, y parecia que el sheet seguia bloqueado.
  function edit(fn: () => void) {
    setError(null)
    fn()
  }

  async function handleSave() {
    const label = householdLabel.trim()
    const grams = toNumber(householdGrams)
    if ((label.length > 0) !== (grams > 0)) {
      setError('La medida casera necesita el nombre y los gramos juntos.')
      return
    }
    setError(null)
    setBusy(true)
    const res = await saveNutritionV2FoodOverride(scope, {
      foodId: food.id,
      values: {
        calories: toNumber(values.calories),
        proteinG: toNumber(values.proteinG),
        carbsG: toNumber(values.carbsG),
        fatsG: toNumber(values.fatsG),
        fiberG: toNumber(values.fiberG),
        macrosBasis: food.macrosBasis === 'per_serving' ? 'per_serving' : 'per_100',
        householdLabel: label.length > 0 ? label : null,
        householdGrams: grams > 0 ? grams : null,
      },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onApplied(
      {
        calories: toNumber(values.calories),
        proteinG: toNumber(values.proteinG),
        carbsG: toNumber(values.carbsG),
        fatsG: toNumber(values.fatsG),
        fiberG: toNumber(values.fiberG),
        macrosBasis: food.macrosBasis ?? null,
        hasOverride: true,
        // El original es el del CATALOGO: si ya habia correccion, se conserva el de partida.
        originalMacros: original ?? {
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatsG: food.fatsG,
          fiberG: food.fiberG,
        },
      },
      'Macros corregidos. Los planes ya publicados conservan los números anteriores.',
    )
    onClose()
  }

  async function handleRestore() {
    if (original == null) return
    setError(null)
    setBusy(true)
    const res = await restoreNutritionV2FoodMacros(scope, food.id)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onApplied(
      {
        calories: original.calories,
        proteinG: original.proteinG,
        carbsG: original.carbsG,
        fatsG: original.fatsG,
        fiberG: original.fiberG,
        macrosBasis: food.macrosBasis ?? null,
        hasOverride: false,
        originalMacros: null,
      },
      'Alimento restaurado al catálogo.',
    )
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      title={`Corregir macros de ${food.name}`}
      description={`Valores ${basisLabel(food)}. La corrección es tuya y vale para todos tus planes nuevos.`}
      accessibilityLabel="Corregir macros del alimento"
    >
      <View className="gap-3">
        {FIELDS.map((field) => (
          <View key={field.key} className="flex-row items-center gap-3">
            <Text className="w-28 shrink-0 text-sm text-muted">{field.label}</Text>
            <TextInput
              accessibilityLabel={field.label}
              value={values[field.key]}
              onChangeText={(value) => edit(() => setValues((prev) => ({ ...prev, [field.key]: value })))}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 flex-1 rounded-control border border-default bg-surface-card px-3 text-sm font-semibold text-strong"
            />
            <Text className="w-10 shrink-0 text-xs text-muted">{field.unit}</Text>
          </View>
        ))}

        <View className="mt-1 border-t border-subtle pt-3">
          <Text className="mb-2 text-xs text-muted">
            Medida casera (opcional). Van juntas: “1 pocillo” y cuántos gramos pesa.
          </Text>
          <View className="flex-row items-center gap-3">
            <TextInput
              accessibilityLabel="Nombre de la medida casera"
              value={householdLabel}
              onChangeText={(value) => edit(() => setHouseholdLabel(value))}
              placeholder="1 pocillo"
              maxLength={40}
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 flex-1 rounded-control border border-default bg-surface-card px-3 text-sm text-strong"
            />
            <TextInput
              accessibilityLabel="Gramos de la medida casera"
              value={householdGrams}
              onChangeText={(value) => edit(() => setHouseholdGrams(value))}
              placeholder="90"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 w-24 rounded-control border border-default bg-surface-card px-3 text-sm text-strong"
            />
            <Text className="w-4 shrink-0 text-xs text-muted">g</Text>
          </View>
        </View>

        {warning ? (
          <Text className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-muted">{warning}</Text>
        ) : null}

        {original ? (
          <Text className="text-xs text-muted">
            Catálogo: <Text className="line-through">{Math.round(original.calories)} kcal</Text> ·{' '}
            {Math.round(original.proteinG)}P · {Math.round(original.carbsG)}C · {Math.round(original.fatsG)}G
          </Text>
        ) : null}

        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}

        <View className="mt-2 gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Guardar corrección"
            disabled={busy}
            onPress={handleSave}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-control bg-primary px-4"
          >
            {busy ? <ActivityIndicator color={theme.primaryForeground} /> : null}
            <Text className="text-sm font-semibold text-primary-foreground">Guardar corrección</Text>
          </Pressable>

          {original ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restaurar los macros del catálogo"
              disabled={busy}
              onPress={handleRestore}
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-control border border-default px-4"
            >
              <RotateCcw color={theme.mutedForeground} size={16} />
              <Text className="text-sm font-semibold text-strong">Restaurar catálogo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Sheet>
  )
}
