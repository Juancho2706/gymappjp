import { Pressable, TextInput, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'

/**
 * Stepper numerico tactil del quick-edit: input decimal tap-to-edit (selecciona el
 * valor completo al enfocar — nunca borrar a mano) + botones −/+ de 44pt.
 *
 * ANTI-PATRON Fabric respetado: arbol 100% ESTABLE — el TextInput esta SIEMPRE
 * montado y ni el wrapper ni el input cambian estilos/clases por focus. NUNCA slider
 * (qe-benchmark §NN/g).
 */
export function QuantityStepper({
  value,
  onChange,
  step,
  accessibilityLabel,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  step: number
  accessibilityLabel: string
  disabled?: boolean
}) {
  const { theme } = useTheme()

  const bump = (direction: 1 | -1) => {
    const parsed = Number(String(value).trim())
    const base = Number.isFinite(parsed) ? parsed : 0
    const next = Math.max(0, Math.round((base + direction * step) * 10) / 10)
    onChange(String(next))
  }

  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restar ${step} a ${accessibilityLabel}`}
        disabled={disabled}
        onPress={() => bump(-1)}
        className="h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card"
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType="decimal-pad"
        selectTextOnFocus
        className="h-11 w-16 rounded-control border border-border-default bg-surface-card text-center text-base font-semibold text-text-strong"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sumar ${step} a ${accessibilityLabel}`}
        disabled={disabled}
        onPress={() => bump(1)}
        className="h-11 w-11 items-center justify-center rounded-control border border-border-default bg-surface-card"
      >
        <Plus color={theme.foreground} size={16} />
      </Pressable>
    </View>
  )
}
