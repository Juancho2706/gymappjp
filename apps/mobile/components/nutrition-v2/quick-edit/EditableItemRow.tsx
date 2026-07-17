import { Pressable, Text, TextInput, View } from 'react-native'
import { ArrowLeftRight, Trash2 } from 'lucide-react-native'
import { MacroChipRow } from '../MacroChipRow'
import { useTheme } from '../../../context/ThemeContext'
import { BUILDER_UNITS, type ItemMacros } from '../../../lib/nutrition-v2-builder'
import { stepForUnit, type QuickEditItem } from '../../../lib/nutrition-v2-quick-edit'
import { QuantityStepper } from './QuantityStepper'

/**
 * Fila editable de un alimento prescrito — nucleo del quick-edit (qe-design §1.2.B.1):
 * cantidad tap-to-edit con steppers, swap explicito (nunca drag), eliminar con
 * Deshacer (el snackbar vive en el orquestador). Macros de la fila en vivo.
 * Targets tactiles ≥44pt en todos los controles.
 */

function UnitToggle({
  unit,
  onChange,
  disabled,
}: {
  unit: string
  onChange: (unit: string) => void
  disabled?: boolean
}) {
  // Cicla las unidades del builder; si la fila trae una unidad fuera del set (p.ej.
  // 'porcion' heredada de la conversion V1→V2), se conserva en el ciclo para que el
  // coach pueda VOLVER a ella (nunca quedar atrapado fuera de su unidad original).
  const cycle: string[] = BUILDER_UNITS.includes(unit as (typeof BUILDER_UNITS)[number])
    ? [...BUILDER_UNITS]
    : [unit, ...BUILDER_UNITS]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Unidad: ${unit}. Toca para cambiar.`}
      disabled={disabled}
      onPress={() => {
        const index = cycle.indexOf(unit)
        onChange(cycle[(index + 1) % cycle.length])
      }}
      className="h-11 min-w-14 items-center justify-center rounded-control border border-border-default bg-surface-sunken px-2"
    >
      <Text className="text-sm font-semibold text-text-strong">{unit}</Text>
    </Pressable>
  )
}

export function EditableItemRow({
  item,
  macros,
  errors,
  disabled = false,
  onQuantityChange,
  onUnitChange,
  onNameChange,
  onSwap,
  onRemove,
}: {
  item: QuickEditItem
  macros: ItemMacros
  errors: Record<string, string>
  disabled?: boolean
  onQuantityChange: (value: string) => void
  onUnitChange: (unit: string) => void
  onNameChange: (value: string) => void
  onSwap: () => void
  onRemove: () => void
}) {
  const { theme } = useTheme()
  const isCustom = !item.foodId && !item.recipeId
  const quantityError = errors['item.' + item.key + '.quantity']
  const nameError = errors['item.' + item.key + '.name']

  return (
    <View className="rounded-control border border-border-subtle bg-surface-sunken p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          {isCustom ? (
            <TextInput
              accessibilityLabel="Nombre del alimento"
              value={item.customName ?? ''}
              onChangeText={onNameChange}
              editable={!disabled}
              placeholder="Nombre del alimento"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 rounded-control border border-border-default bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-text-strong"
            />
          ) : (
            <Text className="text-sm font-semibold text-text-strong" numberOfLines={2}>
              {item.displayName}
            </Text>
          )}
          {!isCustom && item.brand ? (
            <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
              {item.brand}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reemplazar ${item.displayName || 'alimento'}`}
            disabled={disabled}
            onPress={onSwap}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <ArrowLeftRight color={theme.primary} size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${item.displayName || 'alimento'}`}
            disabled={disabled}
            onPress={onRemove}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <Trash2 color={theme.destructive} size={18} />
          </Pressable>
        </View>
      </View>
      {nameError ? <Text className="mt-1 text-xs font-medium text-danger-600">{nameError}</Text> : null}

      <View className="mt-2 flex-row items-center justify-between gap-2">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantityChange}
          step={stepForUnit(item.unit)}
          accessibilityLabel={`Cantidad de ${item.displayName || 'alimento'}`}
          disabled={disabled}
        />
        <UnitToggle unit={item.unit} onChange={onUnitChange} disabled={disabled} />
      </View>
      {quantityError ? (
        <Text className="mt-1 text-xs font-medium text-danger-600">{quantityError}</Text>
      ) : null}

      <View className="mt-2">
        <MacroChipRow
          size="sm"
          calories={macros.calories}
          proteinG={macros.proteinG}
          carbsG={macros.carbsG}
          fatsG={macros.fatsG}
        />
      </View>
    </View>
  )
}
