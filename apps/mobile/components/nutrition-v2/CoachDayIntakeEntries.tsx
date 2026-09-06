import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Pencil, Trash2 } from 'lucide-react-native'
import type { CoachDayIntakeRow, NutritionIntakeReadItem } from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { FoodRow, NutritionMotionButton } from './NutritionV2Kit'
import { useTheme } from '../../context/ThemeContext'

/**
 * Registros de HOY del alumno dentro de la card «Hoy» de la ficha del coach RN (tren «Cantidades
 * honestas», W4.1, mockup M4). Espejo del `DayIntakeEntries` web: mismas filas que ve el alumno
 * (`FoodRow` del kit), **Retirar** con confirmación inline (nada de `Alert`) y **Editar cantidad**
 * en una `Sheet` nativa con la unidad fija. Presentacional: el padre arma las filas
 * (`buildCoachDayIntakeRows`) y ejecuta las mutaciones por la API móvil.
 *
 * Solo hoy (SPEC §5.7 R3). Con 0 registros no pinta nada. Botones de 44 pt (regla del repo).
 */
const INITIAL_VISIBLE = 5

export function CoachDayIntakeEntries({
  rows,
  ratioChipLabel,
  pendingEntryId,
  error,
  onVoid,
  onEditQuantity,
}: {
  rows: CoachDayIntakeRow[]
  /** «4× la meta» (`consumedRatioChipLabel`); `null` = sin chip. */
  ratioChipLabel: string | null
  pendingEntryId: string | null
  error?: string | null
  onVoid: (entry: NutritionIntakeReadItem) => void
  onEditQuantity: (entry: NutritionIntakeReadItem, quantity: number) => void
}) {
  const { theme } = useTheme()
  const [showAll, setShowAll] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ entry: NutritionIntakeReadItem; value: string } | null>(null)

  if (rows.length === 0) return null
  const visible = showAll ? rows : rows.slice(0, INITIAL_VISIBLE)
  const hidden = rows.length - visible.length

  const submitEdit = () => {
    if (!editing) return
    const quantity = Number(editing.value.replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0) return
    onEditQuantity(editing.entry, quantity)
    setEditing(null)
  }

  return (
    <View className="mt-3 border-t border-subtle pt-1" testID="coach-day-intake-entries">
      {ratioChipLabel ? (
        <View className="flex-row justify-end pt-2">
          <View className="rounded-pill border border-warning-500/30 bg-warning-500/10 px-2 py-px">
            <Text className="text-[11px] font-semibold text-warning-700">{ratioChipLabel}</Text>
          </View>
        </View>
      ) : null}
      {visible.map(({ entry, row, slotName, clock, priorVersion }, index) => {
        const isPending = pendingEntryId === entry.id
        const isConfirming = confirmingId === entry.id
        const detail = [slotName ?? 'Fuera del plan', clock].filter(Boolean).join(' · ')
        return (
          <View key={entry.id} className={index > 0 ? 'border-t border-subtle' : undefined} style={isPending ? { opacity: 0.6 } : undefined}>
            <FoodRow
              food={{ ...row, detail }}
              fallbackCategory={entry.category}
              note={priorVersion ? 'De una versión anterior del plan' : null}
              actions={
                isConfirming ? null : (
                  <View className="flex-row items-center gap-1">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar cantidad de ${row.name}`}
                      hitSlop={8}
                      disabled={isPending}
                      onPress={() => {
                        setConfirmingId(null)
                        setEditing({ entry, value: String(entry.quantity) })
                      }}
                      className="h-11 w-11 items-center justify-center rounded-control"
                    >
                      <Pencil color={theme.textSecondary} size={16} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retirar registro de ${row.name}`}
                      hitSlop={8}
                      disabled={isPending}
                      onPress={() => {
                        setEditing(null)
                        setConfirmingId(entry.id)
                      }}
                      className="h-11 w-11 items-center justify-center rounded-control"
                    >
                      <Trash2 color={theme.destructive} size={16} />
                    </Pressable>
                  </View>
                )
              }
            />
            {isConfirming ? (
              <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
                <Text className="text-xs text-body">¿Retirar este registro del día del alumno?</Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar"
                    onPress={() => setConfirmingId(null)}
                    className="min-h-11 items-center justify-center rounded-control border border-default bg-surface-card px-3"
                  >
                    <Text className="text-xs font-semibold text-strong">Cancelar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirmar retiro de ${row.name}`}
                    disabled={isPending}
                    onPress={() => {
                      setConfirmingId(null)
                      onVoid(entry)
                    }}
                    className="min-h-11 items-center justify-center rounded-control bg-destructive px-3"
                  >
                    <Text className="text-xs font-semibold text-white">Retirar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        )
      })}
      {hidden > 0 ? (
        <View className="mt-2">
          <NutritionMotionButton accessibilityLabel={`Ver los ${rows.length} registros`} tone="neutral" onPress={() => setShowAll(true)}>
            {`y ${hidden} más · Ver todos`}
          </NutritionMotionButton>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </Text>
      ) : null}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        nativeModal
        dynamicSizing
        title="Editar cantidad"
        accessibilityLabel="Editar cantidad del registro"
      >
        {editing ? (
          <>
            <Text className="text-sm leading-5 text-body">
              {editing.entry.snapshot.name} · la unidad ({editing.entry.unit}) no cambia.
            </Text>
            <View className="mt-3 flex-row items-center gap-2">
              <TextInput
                value={editing.value}
                onChangeText={(value) => setEditing({ entry: editing.entry, value })}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel="Cantidad"
                placeholderTextColor={theme.mutedForeground}
                className="min-h-11 flex-1 rounded-control border border-default bg-surface-card px-3 text-base font-semibold text-strong"
              />
              <Text className="text-sm font-semibold text-muted">{editing.entry.unit}</Text>
            </View>
            <View className="mt-3 gap-3">
              <NutritionMotionButton accessibilityLabel="Guardar cantidad" pending={pendingEntryId === editing.entry.id} onPress={submitEdit}>
                Guardar
              </NutritionMotionButton>
              <NutritionMotionButton accessibilityLabel="Cancelar" tone="neutral" onPress={() => setEditing(null)}>
                Cancelar
              </NutritionMotionButton>
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  )
}
