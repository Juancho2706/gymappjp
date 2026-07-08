import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useId } from 'react'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

/**
 * AmbientBrandGlow — halo radial full-bleed, sutil, en color de MARCA del coach,
 * pensado para vivir DETRAS del contenido de una vista hero (mirror del
 * `AmbientBrandGlow` de la web, `apps/web/src/components/coach/AmbientBrandGlow.tsx`).
 *
 * Paridad visual con la web:
 *  - La web pinta 3 elipses radiales de marca (wash primario central-arriba, uno
 *    secundario arriba-derecha, uno terciario abajo-izquierda MUY tenue) con el
 *    falloff dado por los stops del radial-gradient (SIN blur → barato). Acá se
 *    replica con 3 RadialGradient de react-native-svg (misma técnica que el
 *    cornerGlow de GlassCard; svg radial es estatico y barato — no usamos Skia
 *    porque no hay animacion ni blur gaussiano que replicar).
 *  - Color desde el theming white-label runtime: `theme.primary` (que
 *    `applyCoachBranding` ya resolvio al accent del coach). Espeja el consumo web
 *    de `--theme-primary-rgb`; el gotcha de comas de CSS no aplica en RN — acá el
 *    color se compone numericamente (hexToRgba), no via `var()`.
 *  - light/dark: se sube la presencia en dark (igual que los `dark:opacity-*` de
 *    la web). resolvedScheme del ThemeContext decide.
 *
 * Uso: montar como PRIMER hijo de un contenedor `relative` (position por defecto
 * en RN); rellena al padre con `StyleSheet.absoluteFill` y el contenido en flujo
 * pinta encima. Decorativo puro: `pointerEvents="none"` + `accessibilityElementsHidden`.
 *
 * Las alfas de pico ya incorporan la opacidad de contenedor de la web
 * (containerOpacity × innerAlpha), porque svg no tiene un wrapper con opacity.
 */

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(38,128,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface AmbientBrandGlowProps {
  /** Override del color de marca (default: theme.primary resuelto por branding). */
  accent?: string
}

export function AmbientBrandGlow({ accent }: AmbientBrandGlowProps) {
  const { theme, resolvedScheme } = useTheme()
  const { width } = useWindowDimensions()
  const isDark = resolvedScheme === 'dark'
  const tint = accent ?? theme.primary

  // ids unicos por instancia → sin colision de gradientes svg entre montajes.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  // Alfas de pico (containerOpacity × innerAlpha de la web, redondeadas):
  //  primario  ≈ 0.12·0.55 / 0.18·0.55, secundario ≈ 0.09·0.35 / 0.10·0.35,
  //  terciario ≈ 0.04·0.30 / 0.05·0.30. Se mantienen sutiles para no competir
  //  con el contenido; el radial cae a 0 antes del borde → sin lineas duras.
  const aPrimary = isDark ? 0.1 : 0.07
  const aSecondary = isDark ? 0.035 : 0.03
  const aTertiary = isDark ? 0.016 : 0.012

  // El radio en % del bounding box; en pantallas anchas (tablet) se achica un
  // pelo para que el bloom no se estire de lado a lado.
  const wide = width > 640

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          {/* Wash primario — bloom central sobre el area hero (arriba-centro). */}
          <RadialGradient id={`abg-p-${uid}`} cx="50%" cy="6%" r={wide ? '65%' : '80%'}>
            <Stop offset="0" stopColor={hexToRgba(tint, aPrimary)} />
            <Stop offset="0.7" stopColor={hexToRgba(tint, 0)} />
          </RadialGradient>
          {/* Wash secundario — sesgado al borde superior derecho, mas tenue. */}
          <RadialGradient id={`abg-s-${uid}`} cx="92%" cy="12%" r={wide ? '48%' : '62%'}>
            <Stop offset="0" stopColor={hexToRgba(tint, aSecondary)} />
            <Stop offset="0.68" stopColor={hexToRgba(tint, 0)} />
          </RadialGradient>
          {/* Wash terciario — abajo-izquierda, MUY tenue: da vida al area inferior
              sin robarle protagonismo al hero. */}
          <RadialGradient id={`abg-t-${uid}`} cx="6%" cy="100%" r={wide ? '52%' : '66%'}>
            <Stop offset="0" stopColor={hexToRgba(tint, aTertiary)} />
            <Stop offset="0.7" stopColor={hexToRgba(tint, 0)} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#abg-p-${uid})`} />
        <Rect width="100%" height="100%" fill={`url(#abg-s-${uid})`} />
        <Rect width="100%" height="100%" fill={`url(#abg-t-${uid})`} />
      </Svg>
    </View>
  )
}
