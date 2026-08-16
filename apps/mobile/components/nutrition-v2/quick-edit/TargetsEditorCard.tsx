import { Text, View } from 'react-native'
import { targetStep, type QeTargetsText, type QeVariant } from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { QuantityStepper } from './QuantityStepper'
import { QUICK_EDIT_COPY } from './microcopy'

const TARGET_ROWS: Array<{ field: keyof QeTargetsText; label: string }> = [
  { field: 'calories', label: 'Energía (kcal)' },
  { field: 'proteinG', label: 'Proteína (g)' },
  { field: 'carbsG', label: 'Carbos (g)' },
  { field: 'fatsG', label: 'Grasas (g)' },
]

/**
 * Card de metas de la variante (qe-design §1.2.B.3): los 4 campos tap-to-edit con los
 * mismos steppers de cantidades. En plan flexible sin franjas ESTA card es el
 * quick-edit completo. T3.3a: variante y llaves de error de la gramatica compartida
 * (`target.<variantKey>.<field>`, la misma tabla que el editor web).
 */
export function TargetsEditorCard({
  variant,
  showVariantLabel,
  errors,
  disabled = false,
  onTargetChange,
}: {
  variant: QeVariant
  showVariantLabel: boolean
  errors: Record<string, string>
  disabled?: boolean
  onTargetChange: (field: keyof QeTargetsText, value: string) => void
}) {
  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-strong">
        {QUICK_EDIT_COPY.targetsTitle}
        {showVariantLabel ? ` · ${variant.label}` : ''}
      </Text>
      <View className="mt-3 gap-3">
        {TARGET_ROWS.map(({ field, label }) => {
          const error = errors['target.' + variant.key + '.' + field]
          return (
            <View key={field}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-strong">{label}</Text>
                <QuantityStepper
                  value={variant.targets[field]}
                  onChange={(value) => onTargetChange(field, value)}
                  step={targetStep(field)}
                  accessibilityLabel={label}
                  disabled={disabled}
                />
              </View>
              {error ? <Text className="mt-1 text-xs font-medium text-danger-600">{error}</Text> : null}
            </View>
          )
        })}
      </View>
    </NutritionCard>
  )
}
