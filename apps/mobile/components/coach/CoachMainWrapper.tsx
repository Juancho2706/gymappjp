import type { ReactElement, ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
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
      <View
        pointerEvents="none"
        style={[
          styles.glowTop,
          {
            backgroundColor: hexToRgba(theme.primary, 0.18),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowBottom,
          {
            backgroundColor: hexToRgba(theme.primary, 0.1),
          },
        ]}
      />
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
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
    paddingBottom: 28,
  },
  content: {
    width: '100%',
    gap: 16,
  },
  glowTop: {
    position: 'absolute',
    top: -170,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.8,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
})
