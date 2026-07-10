import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native'
import { useEffect, useState } from 'react'
import { MotiView } from 'moti'
import { Image } from 'expo-image'
import { useTheme } from '../context/ThemeContext'
import { AppBackground } from './AppBackground'

// EVA brand loader — the multicolor "EVA" letters with a staggered wave.
// Default in-app loading indicator (replaces ActivityIndicator). EVA gradient
// stops: violet / cyan / emerald (same as the web shine loader).
const LETTERS: { c: string; color: string }[] = [
  { c: 'E', color: '#8B5CF6' },
  { c: 'V', color: '#06B6D4' },
  { c: 'A', color: '#10B981' },
]

type Size = 'sm' | 'md' | 'lg'
const FONT: Record<Size, number> = { sm: 30, md: 44, lg: 60 }
const LOGO: Record<Size, number> = { sm: 40, md: 60, lg: 84 }

export function EvaLoader({ size = 'lg', subtitle }: { size?: Size; subtitle?: string }) {
  const { theme, branding } = useTheme()
  const [reduceMotion, setReduceMotion] = useState(false)
  const fontSize = FONT[size]

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {})
  }, [])

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
            <DefaultEvaLetters fontSize={fontSize} reduceMotion={reduceMotion} />
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
        <DefaultEvaLetters fontSize={fontSize} reduceMotion={reduceMotion} />
      )}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

function DefaultEvaLetters({ fontSize, reduceMotion }: { fontSize: number; reduceMotion: boolean }) {
  return (
    <View style={styles.row}>
      {LETTERS.map((l, i) => (
        <MotiView
          key={l.c}
          from={{ translateY: 0, opacity: 0.45 }}
          animate={{ translateY: reduceMotion ? 0 : -6, opacity: 1 }}
          transition={reduceMotion
            ? { type: 'timing', duration: 1 }
            : { type: 'timing', duration: 520, loop: true, repeatReverse: true, delay: i * 150 }}
        >
          <Text style={{ fontSize, lineHeight: fontSize * 1.05, color: l.color, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -1 }}>
            {l.c}
          </Text>
        </MotiView>
      ))}
    </View>
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
