import { Pressable, Text, TextInput, View } from 'react-native'
import { MoreVertical, Plus, Search, Trash2 } from 'lucide-react-native'
import {
  qeItemMacros,
  qeSlotSubtotal,
  type NutritionV2CoachScope,
  type QePortionTarget,
  type QeSlot,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { MacroChipRow } from '../MacroChipRow'
import { useTheme } from '../../../context/ThemeContext'
import type { BuilderFoodMacrosPatch, ItemMacros } from '../../../lib/nutrition-v2-builder'
import { EditableItemRow } from './EditableItemRow'
import {
  EditablePortionsSection,
  type PortionPickerGroup,
  type QuickEditGroupAdmin,
} from './EditablePortionsSection'
import { QUICK_EDIT_COPY } from './microcopy'

/**
 * Franja editable (qe-design §1.2.B.2): nombre y hora inline en el header, filas de
 * alimentos editables, "+ Agregar alimento" (buscador en sheet) y "Libre" al pie,
 * eliminar franja con confirmacion (la maneja el orquestador). Franja vacia es un
 * estado VALIDO ("Franja sin alimentos") — el RPC exige ≥1 franja, no ≥1 item.
 */
export function EditableSlotCard({
  slot,
  index,
  errors,
  disabled = false,
  portionGroups,
  scope = null,
  onFoodOverrideApplied,
  onSlotPatch,
  onRemoveSlot,
  onOpenMenu,
  onSearchFood,
  onAddFreeItem,
  onItemQuantity,
  onItemUnit,
  onItemName,
  onSwapItem,
  onRemoveItem,
  onOpenItemMenu,
  onPortionStep,
  onPortionNotes,
  onPortionRemove,
  onPortionAdd,
  portionGroupAdmin,
}: {
  slot: QeSlot
  index: number
  errors: Record<string, string>
  disabled?: boolean
  /** Grupos elegibles del picker; [] + franja sin targets = seccion invisible (SPEC UX-c). */
  portionGroups: PortionPickerGroup[]
  onSlotPatch: (patch: { name?: string; startTime?: string }) => void
  onRemoveSlot: () => void
  /**
   * Menú de la franja (CE-5): copiar a otros días / aplicar a todos. Ausente = plan de un
   * solo día, donde copiar no tiene destino y la afordancia sería ruido.
   */
  onOpenMenu?: () => void
  onSearchFood: () => void
  onAddFreeItem: () => void
  onItemQuantity: (itemKey: string, value: string) => void
  onItemUnit: (itemKey: string, unit: string) => void
  onItemName: (itemKey: string, value: string) => void
  onSwapItem: (itemKey: string) => void
  onRemoveItem: (itemKey: string) => void
  /** Menu por item (solo editor unico): reemplazos autorizados + reorden. */
  onOpenItemMenu?: (itemKey: string) => void
  onPortionStep: (targetKey: string, direction: 1 | -1) => void
  onPortionNotes: (targetKey: string, value: string) => void
  onPortionRemove: (target: QePortionTarget, index: number) => void
  onPortionAdd: (group: PortionPickerGroup) => void
  /** Porciones propias (FD6a): altas/edición de grupos desde el picker. Ausente = sin esa UI. */
  portionGroupAdmin?: QuickEditGroupAdmin
  /** Workspace del coach: habilita el lápiz de corrección de macros (T2.2). */
  scope?: NutritionV2CoachScope | null
  /** La corrección es del ALIMENTO: la pantalla la propaga a todas sus apariciones. */
  onFoodOverrideApplied?: (foodId: string, macros: BuilderFoodMacrosPatch, message: string) => void
}) {
  const { theme } = useTheme()
  const subtotal: ItemMacros = qeSlotSubtotal(slot)
  const nameError = errors['slot.' + slot.key + '.name']
  const timeError = errors['slot.' + slot.key + '.startTime']

  return (
    <NutritionCard>
      <View className="flex-row items-start justify-between gap-2">
        <Text className="font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
          Franja {index + 1}
        </Text>
        <View className="flex-row items-center">
          {onOpenMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${QUICK_EDIT_COPY.slotMenuTitle} ${slot.name || index + 1}`}
              disabled={disabled}
              onPress={onOpenMenu}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <MoreVertical color={theme.textSecondary} size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar franja ${slot.name || index + 1}`}
            disabled={disabled}
            onPress={onRemoveSlot}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <Trash2 color={theme.destructive} size={17} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextInput
            accessibilityLabel="Nombre de la franja"
            value={slot.name}
            onChangeText={(value) => onSlotPatch({ name: value })}
            editable={!disabled}
            placeholder="Nombre (ej: Desayuno)"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm font-semibold text-strong"
          />
        </View>
        <View className="w-24">
          <TextInput
            accessibilityLabel="Hora de la franja"
            value={slot.startTime}
            onChangeText={(value) => onSlotPatch({ startTime: value })}
            editable={!disabled}
            placeholder="HH:MM"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm text-strong"
          />
        </View>
      </View>
      {nameError || timeError ? (
        <Text className="mt-1 text-xs font-medium text-danger-600">{nameError ?? timeError}</Text>
      ) : null}

      {slot.items.length === 0 ? (
        <Text className="mt-3 text-sm text-muted">{QUICK_EDIT_COPY.emptySlot}</Text>
      ) : (
        <View className="mt-3 gap-2">
          {slot.items.map((item) => (
            <EditableItemRow
              key={item.key}
              item={item}
              macros={qeItemMacros(item)}
              errors={errors}
              disabled={disabled}
              scope={scope}
              onOverrideApplied={onFoodOverrideApplied}
              onQuantityChange={(value) => onItemQuantity(item.key, value)}
              onUnitChange={(unit) => onItemUnit(item.key, unit)}
              onNameChange={(value) => onItemName(item.key, value)}
              onSwap={() => onSwapItem(item.key)}
              onRemove={() => onRemoveItem(item.key)}
              onOpenMenu={onOpenItemMenu ? () => onOpenItemMenu(item.key) : undefined}
            />
          ))}
        </View>
      )}

      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${QUICK_EDIT_COPY.addFood} en ${slot.name || 'la franja'}`}
          disabled={disabled}
          onPress={onSearchFood}
          className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control border border-primary/30 bg-primary/10 px-3"
        >
          <Search color={theme.primary} size={15} />
          <Text className="text-sm font-semibold text-primary">{QUICK_EDIT_COPY.addFood}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={QUICK_EDIT_COPY.freeFood}
          disabled={disabled}
          onPress={onAddFreeItem}
          className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
        >
          <Plus color={theme.foreground} size={15} />
          <Text className="text-sm font-semibold text-strong">Libre</Text>
        </Pressable>
      </View>

      {/* Seccion "Porciones a eleccion" (SPEC UX-a): hermana de los items, bajo
          "+ Agregar alimento". Se pinta sola solo si el plan usa porciones. */}
      <EditablePortionsSection
        targets={slot.portionTargets}
        groups={portionGroups}
        disabled={disabled}
        onStep={onPortionStep}
        onSetNotes={onPortionNotes}
        onRemove={onPortionRemove}
        onAdd={onPortionAdd}
        groupAdmin={portionGroupAdmin}
      />

      {slot.items.length > 0 ? (
        <View className="mt-3 border-t border-subtle pt-2">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Subtotal franja
          </Text>
          <MacroChipRow
            size="sm"
            calories={subtotal.calories}
            proteinG={subtotal.proteinG}
            carbsG={subtotal.carbsG}
            fatsG={subtotal.fatsG}
          />
        </View>
      ) : null}
    </NutritionCard>
  )
}
