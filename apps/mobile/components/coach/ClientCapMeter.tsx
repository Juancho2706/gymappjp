import { StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ViewProps, ViewStyle } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { ProgressBar } from '../ProgressBar'
import { ProgressRing } from '../ProgressRing'
import { FONT } from '../../lib/typography'
// El ámbar de estado (excepción documentada de TOKENS.md §1: la rampa de marca NO pisa los
// semáforos) sale de `lib/client-cap`, el mismo módulo que define el umbral — así el banner del
// home y este medidor no pueden pintar dos ámbares distintos.
import { CAP_FULL_LABEL, WARNING_500, capMeterLabel, capRatio, capTone } from '../../lib/client-cap'

export interface ClientCapMeterProps {
  /** Alumnos activos (no archivados) del coach. */
  active: number
  /** Cupo real del coach (`coaches.max_clients`; la COLUMNA gana sobre la escalera del catálogo). */
  max: number
  /** `bar` para banners y filas; `ring` para cards de resumen. */
  variant: 'bar' | 'ring'
  /** Trazo más delgado / anillo más chico. El estado se sigue anunciando igual. */
  compact?: boolean
  /**
   * El medidor va sobre una superficie oscura fija (card inverse de «Mi plan»): el texto usa la
   * rampa on-dark en vez de `theme.foreground`, que en tema CLARO es tinta oscura y ahí no se lee.
   */
  onDark?: boolean
  /**
   * Etiqueta visible propia («3 de 25 alumnos activos»). Default: `true` en `bar`, `false` en
   * `ring` — el anillo ya lleva «x/N» al centro y sus llamadores imprimen la frase completa al
   * lado. La etiqueta accesible existe SIEMPRE, la pinte o no.
   */
  showLabel?: boolean
  /**
   * `false` cuando el medidor vive DENTRO de otro nodo accesible (una fila tocable que ya anuncia
   * el cupo y su destino): dos nodos seguidos leyendo lo mismo es ruido para el lector. El default
   * es `true` — el medidor suelto sí tiene que anunciarse.
   */
  accessible?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Medidor de cupo (embudo Free→Pro, W6.3). Dice la verdad del plan PROPIO y la hace visible:
 * cuánto cupo hay y cuánto queda, con color semántico (marca <80 %, ámbar ≥80 %, lleno al 100 %).
 *
 * NO es un CTA de compra: no hay precios, ni tiers ajenos, ni links. El color «brand» sale de
 * `theme.primary` (marca del coach en white-label), nunca de un verde a mano. La lógica (umbral,
 * tono, plural) vive en `lib/client-cap.ts` y está pinneada por `tests/mobile/client-cap.test.ts`.
 */
export function ClientCapMeter({
  active,
  max,
  variant,
  compact = false,
  onDark = false,
  showLabel = variant === 'bar',
  accessible = true,
  style,
}: ClientCapMeterProps) {
  const { theme } = useTheme()
  const tone = capTone(active, max)
  const color = tone === 'brand' ? theme.primary : WARNING_500
  const ratio = capRatio(active, max)
  const label = capMeterLabel(active, max)
  const safeMax = Math.max(0, Number.isFinite(max) ? Math.floor(max) : 0)
  const shown = Math.max(0, Math.min(Number.isFinite(active) ? Math.floor(active) : 0, safeMax))
  // `onDark` pinta por CLASE (`text-on-dark`, la rampa del DS) y no con un blanco a mano; el
  // `style` solo lleva color cuando NO es on-dark, porque un color inline le gana a la clase.
  const textClass = onDark ? 'text-on-dark' : undefined
  const textColorStyle = onDark ? null : { color: theme.foreground }

  // Un solo nodo accesible: el lector anuncia «barra de progreso, 1 de 1 alumno activo, cupo
  // completo» en vez de leer la etiqueta y la barra por separado. Dentro de una fila tocable que ya
  // dice el cupo (`accessible={false}`) el medidor desaparece del lector y no duplica el anuncio.
  const a11y: ViewProps = accessible
    ? {
        accessible: true,
        accessibilityRole: 'progressbar' as const,
        accessibilityLabel: tone === 'full' ? `${label}. ${CAP_FULL_LABEL}` : label,
        accessibilityValue: { min: 0, max: Math.max(1, safeMax), now: shown, text: label },
      }
    : { accessible: false as const }

  if (variant === 'ring') {
    const size = compact ? 56 : 72
    return (
      <View {...a11y} style={[styles.ringWrap, style]}>
        <ProgressRing
          value={ratio * 100}
          size={size}
          stroke={compact ? 6 : 8}
          color={color}
          label={
            <Text
              className={textClass}
              style={[styles.ringValue, textColorStyle, { fontSize: size * 0.24 }]}
              numberOfLines={1}
            >
              {shown}/{safeMax}
            </Text>
          }
        />
        {showLabel ? (
          <View style={styles.ringText}>
            <Text className={textClass} style={[styles.label, textColorStyle, { fontFamily: FONT.uiSemibold }]}>
              {label}
            </Text>
            {tone === 'full' ? (
              <Text style={[styles.fullTag, { color: WARNING_500, fontFamily: FONT.uiBold }]}>{CAP_FULL_LABEL}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View {...a11y} style={[styles.barWrap, style]}>
      {showLabel ? (
        <View style={styles.labelRow}>
          <Text
            className={textClass}
            style={[styles.label, textColorStyle, { fontFamily: FONT.uiSemibold }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {tone === 'full' ? (
            <Text style={[styles.fullTag, { color: WARNING_500, fontFamily: FONT.uiBold }]}>{CAP_FULL_LABEL}</Text>
          ) : null}
        </View>
      ) : null}
      <ProgressBar value={ratio} color={color} height={compact ? 6 : 8} />
    </View>
  )
}

const styles = StyleSheet.create({
  barWrap: { width: '100%', gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  fullTag: { fontSize: 11, lineHeight: 15, flexShrink: 0 },
  ringWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ringText: { flexShrink: 1, gap: 2 },
  ringValue: { fontFamily: FONT.display, fontVariant: ['tabular-nums'], textAlign: 'center' },
})
