import { type ReactNode, useState } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import { FONT } from '../../../../lib/typography'
import type { ExecTheme } from './exec-theme'

/**
 * Botón "juicy" del ejecutor V3 — traducción RN del `.a3a-juicy` del mockup concepto-a-v3-core:
 *  · cara de acento con borde del acento oscurecido (mezcla 55% con negro, = `color-mix(accent 55%, #000)`);
 *  · SOMBRA INFERIOR DURA de ~5px del mismo acento oscurecido (no un blur: una barra sólida detrás,
 *    desplazada hacia abajo `DEPTH`px);
 *  · al presionar la cara BAJA `DEPTH`px y tapa la barra → efecto de "hundido" (`:active { translateY(5) }`).
 *
 * `breathing` hace latir la cara (scale 1↔1.035 en loop) para el CTA principal ("EMPEZAR" / "Completar").
 * Todo el movimiento se apaga con `reducedMotion` (la cara queda fija, sin latido; el hundido al presionar
 * se conserva porque es feedback directo, no decoración).
 */

const DEPTH = 5

/** Mezcla un hex hacia negro (mix(hex, #000, `keep`)) — `keep`=0.55 ⇒ 55% del color, 45% negro.
 *  Espeja `color-mix(in srgb, accent 55%, #000)` del mockup (borde + sombra dura del juicy). */
function mixToBlack(hex: string, keep: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const int = parseInt(m[1], 16)
  const r = Math.round(((int >> 16) & 0xff) * keep)
  const g = Math.round(((int >> 8) & 0xff) * keep)
  const b = Math.round((int & 0xff) * keep)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export function JuicyButton({
  label,
  onPress,
  exec,
  icon,
  height = 56,
  fontSize = 17,
  breathing = false,
  reducedMotion = false,
  disabled = false,
  testID,
  accessibilityLabel,
  style,
}: {
  label: string
  onPress: () => void
  exec: ExecTheme
  /** Icono/adorno a la izquierda del label (ya coloreado por el consumidor). */
  icon?: ReactNode
  height?: number
  fontSize?: number
  /** Latido sutil del CTA principal (apagado con reduced-motion). */
  breathing?: boolean
  reducedMotion?: boolean
  disabled?: boolean
  testID?: string
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}) {
  const [pressed, setPressed] = useState(false)
  const dark = mixToBlack(exec.accent, 0.55)
  const beats = breathing && !reducedMotion && !disabled

  return (
    <View style={[{ height: height + DEPTH, justifyContent: 'flex-start' }, style]}>
      {/* Barra de sombra dura (5px del acento oscurecido) — fija al fondo; la cara la tapa al hundirse. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: DEPTH, height, borderRadius: 15, backgroundColor: dark }}
      />
      <MotiView
        // Latido del CTA (scale) — envuelve la cara para no interferir con el translate de presión.
        from={{ scale: 1 }}
        animate={{ scale: beats ? 1.035 : 1 }}
        transition={beats ? { type: 'timing', duration: 1300, loop: true, repeatReverse: true } : { type: 'timing', duration: 0 }}
      >
        <MotiView
          animate={{ translateY: pressed ? DEPTH : 0 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 90 }}
        >
          <Pressable
            testID={testID}
            onPress={disabled ? undefined : onPress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled }}
            style={{
              height,
              borderRadius: 15,
              borderWidth: 2,
              borderColor: dark,
              backgroundColor: exec.accent,
              opacity: disabled ? 0.55 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingHorizontal: 18,
            }}
          >
            {icon}
            <Text
              style={{ fontFamily: FONT.uiExtra, fontSize, letterSpacing: 0.3, color: exec.accentText }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        </MotiView>
      </MotiView>
    </View>
  )
}
