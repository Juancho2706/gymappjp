import { View, Text, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useTheme } from '../context/ThemeContext'
import { AppBackground } from './AppBackground'
import { EvaFigure, evaFigureHeight } from './entry/EvaFigure'

// EVA brand loader — la FIGURA blanca de EVA con respiración sutil (QA2 2026-07-29:
// muere el wordmark tricolor "EVA" viejo; el sistema actual es la figura — misma marca
// que el splash nativo y la familia de entrada). En tema claro la figura se tiñe con la
// tinta del tema (el PNG es blanco puro; sin tinte sería invisible sobre claro).
type Size = 'sm' | 'md' | 'lg'
const FIGURE: Record<Size, number> = { sm: 44, md: 66, lg: 96 }
const FONT: Record<Size, number> = { sm: 30, md: 44, lg: 60 }
const LOGO: Record<Size, number> = { sm: 40, md: 60, lg: 84 }

export function EvaLoader({ size = 'lg', subtitle }: { size?: Size; subtitle?: string }) {
  const { theme, branding } = useTheme()
  // Mismo hook que el resto del repo (Walkthrough, selector): Reanimated ya sigue
  // el ajuste del SO vía `<ReducedMotionConfig>` (auditoría a1 §5.2).
  const reduceMotion = useReducedMotion()
  const fontSize = FONT[size]

  // M-F1: loader personalizado del coach. Si está activo, honra texto/color/icon-mode/logo.
  const custom = branding?.useCustomLoader
  const iconMode = branding?.loaderIconMode ?? 'eva'
  const customText = (branding?.loaderText ?? '').trim()
  const textColor = branding?.loaderTextColor || theme.primary

  const pulse = reduceMotion
    ? { type: 'timing' as const, duration: 1 }
    : { type: 'timing' as const, duration: 900, loop: true, repeatReverse: true }

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {custom ? (
        <View style={styles.customWrap}>
          {iconMode === 'coach' && branding?.logoUrl ? (
            <MotiView from={{ opacity: 0.5, scale: 0.92 }} animate={{ opacity: 1, scale: reduceMotion ? 0.92 : 1.04 }} transition={pulse}>
              <Image source={{ uri: branding.logoUrl }} style={{ width: LOGO[size], height: LOGO[size] }} contentFit="contain" transition={150} />
            </MotiView>
          ) : iconMode === 'eva' ? (
            <DefaultEvaFigure size={size} reduceMotion={reduceMotion} />
          ) : null}
          {customText ? (
            <MotiView from={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={pulse}>
              <Text style={{ fontSize: fontSize * 0.62, lineHeight: fontSize * 0.72, color: textColor, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -0.5 }}>
                {customText}
              </Text>
            </MotiView>
          ) : null}
        </View>
      ) : (
        <DefaultEvaFigure size={size} reduceMotion={reduceMotion} />
      )}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

function DefaultEvaFigure({ size, reduceMotion }: { size: Size; reduceMotion: boolean }) {
  const { resolvedScheme, theme } = useTheme()
  const width = FIGURE[size]
  return (
    <MotiView
      from={{ opacity: 0.55, scale: 0.96 }}
      animate={{ opacity: 1, scale: reduceMotion ? 0.96 : 1.02 }}
      transition={reduceMotion
        ? { type: 'timing', duration: 1 }
        : { type: 'timing', duration: 820, loop: true, repeatReverse: true }}
      style={{ height: evaFigureHeight(width) }}
    >
      <EvaFigure
        size={width}
        // El asset es blanco puro: sobre tema claro se tiñe con la tinta del tema.
        style={resolvedScheme === 'dark' ? null : { tintColor: theme.foreground }}
      />
    </MotiView>
  )
}

/**
 * Loader a sección completa. Usa `absoluteFill` + fondo opaco + AppBackground propio,
 * así CUBRE toda la pantalla aunque se monte como hermano tras un header (antes
 * quedaba chico debajo del título). Sirve para arranque y para estados loading.
 */
export function EvaLoaderScreen({ subtitle }: { subtitle?: string }) {
  const { theme } = useTheme()
  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: theme.background }]}>
      <AppBackground />
      <EvaLoader subtitle={subtitle} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  customWrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  subtitle: { fontSize: 13, letterSpacing: 0.3 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
