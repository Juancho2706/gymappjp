import { Text, View } from 'react-native'
import { NutritionCard } from '../NutritionCard'
import {
  stepForTargetField,
  type QuickEditTargetField,
  type QuickEditVariant,
} from '../../../lib/nutrition-v2-quick-edit'
import { QuantityStepper } from './QuantityStepper'
import { QUICK_EDIT_COPY } from './microcopy'

const TARGET_ROWS: Array<{ field: QuickEditTargetField; label: string }> = [
  { field: 'calories', label: 'Energía (kcal)' },
  { field: 'proteinG', label: 'Proteína (g)' },
  { field: 'carbsG', label: 'Carbos (g)' },
  { field: 'fatsG', label: 'Grasas (g)' },
]

/**
 * Card de metas de la variante (qe-design §1.2.B.3): los 4 campos tap-to-edit con los
 * mismos steppers de cantidades. En plan flexible sin franjas ESTA card es el
 * quick-edit completo.
 */
export function TargetsEditorCard({
  variant,
  showVariantLabel,
  errors,
  disabled = false,
  onTargetChange,
}: {
  variant: QuickEditVariant
  showVariantLabel: boolean
  errors: Record<string, string>
  disabled?: boolean
  onTargetChange: (field: QuickEditTargetField, value: string) => void
}) {
  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-text-strong">
        {QUICK_EDIT_COPY.targetsTitle}
        {showVariantLabel ? ` · ${variant.label}` : ''}
      </Text>
      <View className="mt-3 gap-3">
        {TARGET_ROWS.map(({ field, label }) => {
          const error = errors['targets.' + variant.key + '.' + field]
          return (
            <View key={field}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-text-strong">{label}</Text>
                <QuantityStepper
                  value={variant.targets[field]}
                  onChange={(value) => onTargetChange(field, value)}
                  step={stepForTargetField(field)}
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
