import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Minus, Plus, StickyNote, Trash2 } from 'lucide-react-native'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import { Sheet } from '../../Sheet'
import { useTheme } from '../../../context/ThemeContext'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  PORTION_MAX,
  PORTION_MIN,
  formatPortionsEsCl,
  type QuickEditPortionGroup,
  type QuickEditPortionTarget,
} from './portions-state'

/**
 * Seccion "Porciones a eleccion" del quick-edit RN (SPEC UX-a, T1.4) — espejo movil de
 * `EditablePortionsCard` web, DENTRO de la card de franja bajo "+ Agregar alimento":
 * fila grupo (circulito `exchangeGroupColor` con letra blanca + nombre + stepper 0,5
 * SOLO de botones — jamas teclado numerico, hallazgo M4 — + eliminar con Deshacer via
 * snackbar del orquestador) + nota opcional del target (TextInput inline: el
 * KeyboardAvoidingView del QuickEditMode lo mantiene visible) + altas via Sheet
 * nativeModal (gorhom vetado bajo reanimated 4) con los grupos que el plan YA usa.
 * Plan sin porciones => la seccion NO se pinta (capa invisible, SPEC UX-c).
 */

/** Circulito de identidad del grupo: color del catalogo SOLO aqui, letra blanca (SPEC UX). */
function GroupDot({
  group,
  sortOrder,
}: {
  group: { groupCode: string; color: string | null }
  sortOrder: number
}) {
  return (
    <View
      accessible={false}
      className="h-5 w-5 items-center justify-center rounded-full"
      style={{ backgroundColor: exchangeGroupColor({ color: group.color, sortOrder }) }}
    >
      <Text className="text-[10px] font-bold leading-none text-white">
        {group.groupCode.slice(0, 3)}
      </Text>
    </View>
  )
}

/**
 * Stepper de porciones SOLO botones (paso 0,5; minimo 0,5; maximo 99). El valor es un
 * Text — sin TextInput no hay teclado numerico posible (hallazgo M4). Botones 44pt.
 */
function PortionsStepper({
  groupName,
  portions,
  disabled,
  onStep,
}: {
  groupName: string
  portions: number
  disabled: boolean
  onStep: (direction: 1 | -1) => void
}) {
  const { theme } = useTheme()
  const canDecrement = !disabled && portions > PORTION_MIN
  const canIncrement = !disabled && portions < PORTION_MAX
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restar media porción de ${groupName}`}
        disabled={!canDecrement}
        onPress={() => onStep(-1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card ${canDecrement ? '' : 'opacity-40'}`}
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <Text
        accessibilityLabel={`Porciones de ${groupName}: ${formatPortionsEsCl(portions)}`}
        className="w-12 text-center text-base font-semibold text-text-strong"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatPortionsEsCl(portions)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sumar media porción de ${groupName}`}
        disabled={!canIncrement}
        onPress={() => onStep(1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card ${canIncrement ? '' : 'opacity-40'}`}
      >
        <Plus color={theme.foreground} size={16} />
      </Pressable>
    </View>
  )
}

function PortionTargetRow({
  target,
  index,
  sortOrder,
  disabled,
  onStep,
  onSetNotes,
  onRemove,
}: {
  target: QuickEditPortionTarget
  index: number
  sortOrder: number
  disabled: boolean
  onStep: (targetKey: string, direction: 1 | -1) => void
  onSetNotes: (targetKey: string, value: string) => void
  onRemove: (target: QuickEditPortionTarget, index: number) => void
}) {
  const { theme } = useTheme()
  // La nota abre con boton y queda abierta (arbol estable mientras se tipea); si el
  // target ya trae nota, arranca visible.
  const [notesOpen, setNotesOpen] = useState(target.notes.trim() !== '')
  const showNotes = notesOpen || target.notes.trim() !== ''

  return (
    <View>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <GroupDot group={target} sortOrder={sortOrder} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-text-strong" numberOfLines={1}>
              {target.groupName}
            </Text>
            {!target.macrosConfirmed ? (
              <Text className="text-[10px] font-semibold text-warning-700" numberOfLines={1}>
                {PORTIONS_COPY.builder.referentialBadge}
              </Text>
            ) : null}
          </View>
        </View>
        {/* Stepper de ancho fijo (SPEC UX-a: el nombre trunca, el stepper nunca se comprime). */}
        <PortionsStepper
          groupName={target.groupName}
          portions={target.portions}
          disabled={disabled}
          onStep={(direction) => onStep(target.key, direction)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Nota para ${target.groupName}`}
          disabled={disabled}
          onPress={() => setNotesOpen((open) => !open || target.notes.trim() !== '')}
          hitSlop={6}
          className="h-11 w-8 items-center justify-center rounded-control"
        >
          <StickyNote color={showNotes ? theme.primary : theme.mutedForeground} size={16} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Quitar porciones de ${target.groupName}`}
          disabled={disabled}
          onPress={() => onRemove(target, index)}
          hitSlop={6}
          className="h-11 w-8 items-center justify-center rounded-control"
        >
          <Trash2 color={theme.destructive} size={16} />
        </Pressable>
      </View>
      {showNotes ? (
        <TextInput
          accessibilityLabel={`Nota para ${target.groupName}`}
          value={target.notes}
          onChangeText={(value) => onSetNotes(target.key, value)}
          editable={!disabled}
          placeholder="Nota (opcional)"
          placeholderTextColor={theme.mutedForeground}
          maxLength={1000}
          className="mt-1 min-h-11 rounded-control border border-border-default bg-surface-card px-2.5 py-2 text-sm text-text-strong"
        />
      ) : null}
    </View>
  )
}

/**
 * Bottom sheet de altas (nativeModal): grupos que el plan YA usa, con circulito + nombre
 * + referencia por porcion; los presentes en la franja quedan deshabilitados.
 */
function GroupPickerSheet({
  open,
  onClose,
  groups,
  usedGroupIds,
  onPick,
}: {
  open: boolean
  onClose: () => void
  groups: QuickEditPortionGroup[]
  usedGroupIds: ReadonlySet<string>
  onPick: (group: QuickEditPortionGroup) => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['70%']}
      title={PORTIONS_COPY.builder.addGroup}
      accessibilityLabel={PORTIONS_COPY.builder.addGroup}
    >
      <View className="gap-1 pb-2">
        {groups.map((group) => {
          const used = usedGroupIds.has(group.exchangeGroupId)
          return (
            <Pressable
              key={group.exchangeGroupId}
              accessibilityRole="button"
              accessibilityLabel={
                used ? `${group.groupName}: ${PORTIONS_COPY.builder.groupUsed}` : `Agregar ${group.groupName}`
              }
              disabled={used}
              onPress={() => onPick(group)}
              className={`min-h-12 flex-row items-center gap-3 rounded-control px-2 py-2 ${used ? 'opacity-50' : 'active:bg-surface-sunken'}`}
            >
              <GroupDot group={group} sortOrder={group.sortOrder} />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="shrink text-sm font-semibold text-text-strong" numberOfLines={1}>
                    {group.groupName}
                  </Text>
                  {!group.macrosConfirmed ? (
                    <View className="shrink-0 rounded-pill border border-warning-500/30 bg-warning-500/10 px-1.5 py-px">
                      <Text className="text-[10px] font-semibold text-warning-700">
                        {PORTIONS_COPY.builder.referentialBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-xs text-text-muted" numberOfLines={1}>
                  {used
                    ? PORTIONS_COPY.builder.groupUsed
                    : `1 porción ≈ ${Math.round(group.ref.calories)} kcal · ${Math.round(group.ref.carbsG)} C · ${Math.round(group.ref.proteinG)} P`}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </Sheet>
  )
}

export function EditablePortionsSection({
  targets,
  groups,
  disabled = false,
  onStep,
  onSetNotes,
  onRemove,
  onAdd,
}: {
  targets: QuickEditPortionTarget[]
  groups: QuickEditPortionGroup[]
  disabled?: boolean
  onStep: (targetKey: string, direction: 1 | -1) => void
  onSetNotes: (targetKey: string, value: string) => void
  onRemove: (target: QuickEditPortionTarget, index: number) => void
  onAdd: (group: QuickEditPortionGroup) => void
}) {
  const { theme } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Plan sin capa de porciones: CERO UI nueva (SPEC UX-c). Los grupos elegibles derivan
  // del read model, asi que un plan sin targets nunca pinta esta seccion.
  if (groups.length === 0 && targets.length === 0) return null

  const usedGroupIds = new Set(targets.map((target) => target.exchangeGroupId))
  const groupOrder = new Map(groups.map((group) => [group.exchangeGroupId, group.sortOrder]))

  return (
    <View className="mt-3 border-t border-border-subtle pt-3">
      <Text className="text-sm font-medium text-text-strong">{PORTIONS_COPY.builder.sectionTitle}</Text>
      <Text className="mt-0.5 text-xs text-text-muted">{PORTIONS_COPY.builder.sectionHint}</Text>

      {targets.length > 0 ? (
        <View className="mt-2 gap-2">
          {targets.map((target, index) => (
            <PortionTargetRow
              key={target.key}
              target={target}
              index={index}
              sortOrder={groupOrder.get(target.exchangeGroupId) ?? 0}
              disabled={disabled}
              onStep={onStep}
              onSetNotes={onSetNotes}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}

      {groups.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PORTIONS_COPY.builder.addGroup}
          disabled={disabled}
          onPress={() => setPickerOpen(true)}
          className="mt-2 min-h-11 flex-row items-center gap-1.5 self-start rounded-control px-2 active:bg-primary/10"
        >
          <Plus color={theme.primary} size={16} />
          <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.builder.addGroup}</Text>
        </Pressable>
      ) : null}

      <GroupPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        groups={groups}
        usedGroupIds={usedGroupIds}
        onPick={(group) => {
          setPickerOpen(false)
          onAdd(group)
        }}
      />
    </View>
  )
}
