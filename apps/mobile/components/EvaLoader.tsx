import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native'
import { useEffect, useState } from 'react'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

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

export function EvaLoader({ size = 'lg', subtitle }: { size?: Size; subtitle?: string }) {
  const { theme } = useTheme()
  const [reduceMotion, setReduceMotion] = useState(false)
  const fontSize = FONT[size]

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {})
  }, [])

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Cargando">
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
            <Text style={{ fontSize, lineHeight: fontSize * 1.05, color: l.color, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -1 }}>
              {l.c}
            </Text>
          </MotiView>
        ))}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

/** Full-screen centered loader (use for initial screen loads). */
export function EvaLoaderScreen({ subtitle }: { subtitle?: string }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <EvaLoader subtitle={subtitle} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  subtitle: { fontSize: 13, letterSpacing: 0.3 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
