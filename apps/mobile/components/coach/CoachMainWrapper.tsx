import type { ReactElement, ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'

interface CoachMainWrapperProps {
  children: ReactNode
  scroll?: boolean
  refreshControl?: ReactElement<RefreshControlProps>
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Faint grid pattern (web parity — the "líneas bonitas" backdrop). Cheap single SVG pattern. */
function GridBackground({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="grid" width={28} height={28} patternUnits="userSpaceOnUse">
          <Path d="M28 0 L0 0 0 28" fill="none" stroke={color} strokeWidth={0.5} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#grid)" />
    </Svg>
  )
}

export function CoachMainWrapper({ children, scroll = true, refreshControl }: CoachMainWrapperProps) {
  const { theme, mode } = useTheme()
  const insets = useSafeAreaInsets()
  const isDark = mode !== 'light'
  // Clear the translucent blur tab bar + iPhone home indicator.
  const bottomPad = insets.bottom + 84
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'

  const content = (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 260 }}
      style={styles.content}
    >
      {children}
    </MotiView>
  )

  return (
    <View style={[styles.shell, { backgroundColor: theme.background }]}>
      {/* Layered, dark-first backdrop (grid + two soft washes) — matches the web dashboard depth. */}
      <GridBackground color={gridColor} />
      <LinearGradient
        pointerEvents="none"
        colors={[hexToRgba(theme.primary, 0.16), hexToRgba(theme.primary, 0.04), 'transparent']}
        locations={[0, 0.4, 0.8]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.7, y: 0.55 }}
        style={styles.topWash}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', hexToRgba('#22D3EE', isDark ? 0.07 : 0.05)]}
        start={{ x: 1, y: 0.2 }}
        end={{ x: 0.3, y: 1 }}
        style={styles.cornerWash}
      />
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 90,
  },
  content: {
    width: '100%',
    gap: 16,
  },
  topWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  cornerWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '70%',
  },
})
