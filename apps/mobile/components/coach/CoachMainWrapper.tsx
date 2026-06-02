import type { ReactElement, ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
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

export function CoachMainWrapper({ children, scroll = true, refreshControl }: CoachMainWrapperProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  // Clear the translucent blur tab bar + iPhone home indicator.
  const bottomPad = insets.bottom + 84

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
      {/* Subtle top brand wash (replaces the hard colored circles — luminance shift, not a disc). */}
      <LinearGradient
        pointerEvents="none"
        colors={[hexToRgba(theme.primary, 0.1), 'transparent']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 0.5 }}
        style={styles.topWash}
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
    height: 220,
  },
})
