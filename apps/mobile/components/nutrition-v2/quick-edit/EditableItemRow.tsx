import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ArrowLeftRight, MoreVertical, Pencil, Trash2 } from 'lucide-react-native'
import {
  foodCategoryFromName,
  quantityStep,
  type NutritionV2CoachScope,
  type QeItem,
} from '@eva/nutrition-v2'
import { MacroChipRow } from '../MacroChipRow'
import { FoodThumbnail } from '../NutritionV2Kit'
import { FoodMacrosOverrideSheet } from '../FoodMacrosOverrideSheet'
import { useTheme } from '../../../context/ThemeContext'
import {
  BUILDER_UNITS,
  type BuilderFoodMacrosPatch,
  type ItemMacros,
} from '../../../lib/nutrition-v2-builder'
import { foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import { QuantityStepper } from './QuantityStepper'

/**
 * Fila editable de un alimento prescrito — nucleo del quick-edit (qe-design §1.2.B.1):
 * cantidad tap-to-edit con steppers, swap explicito (nunca drag), eliminar con
 * Deshacer (el snackbar vive en el orquestador). Macros de la fila en vivo.
 * Targets tactiles ≥44pt en todos los controles.
 *
 * T3.3a: la fila consume el `QeItem` de la gramatica compartida. El lapiz de correccion de
 * macros (T2.2) sigue el criterio del editor web (W2): SOLO con `item.food` en mano (swap o
 * alta de esta sesion) — los items base viven de su `macroBase` congelado, igual que en web.
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
      className="h-11 min-w-14 items-center justify-center rounded-control border border-default bg-surface-sunken px-2"
    >
      <Text className="text-sm font-semibold text-strong">{unit}</Text>
    </Pressable>
  )
}

export function EditableItemRow({
  item,
  macros,
  errors,
  disabled = false,
  scope = null,
  onQuantityChange,
  onQuantityCommit,
  onUnitChange,
  onNameChange,
  onSwap,
  onRemove,
  onOpenMenu,
  onOverrideApplied,
}: {
  item: QeItem
  macros: ItemMacros
  errors: Record<string, string>
  disabled?: boolean
  /** Workspace del coach; sin el no hay a donde escribir la correccion. */
  scope?: NutritionV2CoachScope | null
  onQuantityChange: (value: string) => void
  /** Cantidad fijada (blur): la porcion pegajosa del editor la recuerda. */
  onQuantityCommit?: () => void
  onUnitChange: (unit: string) => void
  onNameChange: (value: string) => void
  onSwap: () => void
  onRemove: () => void
  /**
   * Menu del item (solo EDITOR unico): reemplazos autorizados y reorden dentro de la franja.
   * Ausente = quick-edit clasico, que no ofrece ninguna de las dos.
   */
  onOpenMenu?: () => void
  /** La correccion es del ALIMENTO: la pantalla la propaga a todas sus apariciones. */
  onOverrideApplied?: (foodId: string, macros: BuilderFoodMacrosPatch, message: string) => void
}) {
  const { theme } = useTheme()
  const isCustom = item.isCustom
  // Sheet de correccion de macros (T2.2), mismo componente que el wizard. Criterio W2 del
  // editor: solo con alimento del catalogo hidratado en la fila (swap/alta de esta sesion).
  const [macrosSheetOpen, setMacrosSheetOpen] = useState(false)
  const food = item.food
  const canCorrectMacros = !isCustom && !!food && !!scope && !!onOverrideApplied
  const quantityError = errors['item.' + item.key + '.quantity']
  const nameError = errors['item.' + item.key + '.name']
  // QA2-B3a: icono del producto a la izquierda del nombre — espejo del builder web:
  // foto del catalogo si existe, y si no el webp estatico de la categoria (item libre =>
  // categoria derivada del nombre).
  const thumbAlt = item.displayName || 'Alimento'
  const thumbSrc = foodMediaThumbnailUrl(food?.media ?? item.media)
  const thumbCategory = isCustom ? foodCategoryFromName(item.displayName) : (food?.category ?? item.category)

  return (
    <View className="rounded-control border border-subtle bg-surface-sunken p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
          <FoodThumbnail alt={thumbAlt} src={thumbSrc} fallbackCategory={thumbCategory} size="sm" />
          <View className="min-w-0 flex-1">
            {isCustom ? (
              <TextInput
                accessibilityLabel="Nombre del alimento"
                value={item.displayName}
                onChangeText={onNameChange}
                editable={!disabled}
                placeholder="Nombre del alimento"
                placeholderTextColor={theme.mutedForeground}
                className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-strong"
              />
            ) : (
              <View className="flex-row items-center gap-1.5">
                <Text className="flex-1 text-sm font-semibold text-strong" numberOfLines={2}>
                  {item.displayName}
                </Text>
                {/* Badge ✎: este alimento lleva TUS macros, no los del catalogo. */}
                {food?.hasOverride ? (
                  <Pencil color={theme.primary} size={12} accessibilityLabel="Macros corregidos por ti" />
                ) : null}
              </View>
            )}
            {!isCustom && item.brand ? (
              <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                {item.brand}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center">
          {canCorrectMacros ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Corregir macros de ${item.displayName || 'alimento'}`}
              disabled={disabled}
              onPress={() => setMacrosSheetOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <Pencil color={theme.mutedForeground} size={17} />
            </Pressable>
          ) : null}
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
          {onOpenMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Opciones de ${item.displayName || 'alimento'}`}
              disabled={disabled}
              onPress={onOpenMenu}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <MoreVertical color={theme.textSecondary} size={17} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {nameError ? <Text className="mt-1 text-xs font-medium text-danger-600">{nameError}</Text> : null}

      <View className="mt-2 flex-row items-center justify-between gap-2">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantityChange}
          onCommit={onQuantityCommit}
          step={quantityStep(item.unit)}
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

      {canCorrectMacros && macrosSheetOpen && food && scope ? (
        <FoodMacrosOverrideSheet
          food={food}
          scope={scope}
          open={macrosSheetOpen}
          onClose={() => setMacrosSheetOpen(false)}
          onApplied={(patch, message) => onOverrideApplied?.(food.id, patch, message)}
        />
      ) : null}
    </View>
  )
}
