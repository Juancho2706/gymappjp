import { Pressable, View } from 'react-native'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'

/** Rojo de advertencia de la tuerca (apagado peligroso). Compartido con `ExecSettingsSheet`. */
export const EXEC_DANGER = '#f87171'

/**
 * Toggle del ejecutor V3 — el mismo switch 48×28 de la tuerca (`ExecSettingsSheet`), extraído para que
 * el modal de primera vez de la preferencia «Pasar solo al descanso» (`AutoRestModalV3`, D5) pinte
 * EXACTAMENTE el mismo control que la fila que lo espeja. Espejo RN del `.exec-v3-tog` web.
 *  · reposo: pista `surface.border` + knob neutro claro (`#c9c9d2`, mockup);
 *  · activo: pista del acento + knob con la tinta legible sobre el acento;
 *  · `danger` (solo apagado): pista/borde rojos — lo usa la tuerca para los apagados peligrosos.
 */
export function ExecToggle({
  value,
  onChange,
  exec,
  disabled = false,
  danger = false,
  testID,
  accessibilityLabel,
}: {
  value: boolean
  onChange: (v: boolean) => void
  exec: ExecTheme
  disabled?: boolean
  /** Estado de advertencia (apagado peligroso): tiñe el toggle de rojo. */
  danger?: boolean
  testID?: string
  accessibilityLabel?: string
}) {
  const s = exec.surface
  const warn = danger && !value
  return (
    <Pressable
      testID={testID}
      onPress={() => { if (!disabled) onChange(!value) }}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        borderWidth: 2,
        justifyContent: 'center',
        paddingHorizontal: 3,
        backgroundColor: warn ? hexToRgba(EXEC_DANGER, 0.18) : value ? exec.accent : s.border,
        borderColor: warn ? hexToRgba(EXEC_DANGER, 0.7) : value ? hexToRgba(exec.accent, 0.6) : s.borderStrong,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          // Reposo: neutro claro del mockup (`#c9c9d2`); activo: tinta legible sobre el acento.
          backgroundColor: value ? exec.accentText : '#c9c9d2',
          alignSelf: value ? 'flex-end' : 'flex-start',
        }}
      />
    </Pressable>
  )
}
