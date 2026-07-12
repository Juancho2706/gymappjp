import type { ReactElement, ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { AppBackground } from '../AppBackground'
import { useCoachTabbarScroll } from './CoachTabbarScroll'

interface CoachMainWrapperProps {
  children: ReactNode
  scroll?: boolean
  refreshControl?: ReactElement<RefreshControlProps>
}

export function CoachMainWrapper({ children, scroll = true, refreshControl }: CoachMainWrapperProps) {
  const { theme } = useTheme()
  const { onScroll } = useCoachTabbarScroll()
  const insets = useSafeAreaInsets()
  // Clear the translucent blur tab bar + iPhone home indicator.
  const bottomPad = insets.bottom + 88
  // Sin header global: el wrapper paga el inset superior (status bar / notch).
  const topPad = insets.top + 16

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
      <AppBackground />
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          onScroll={onScroll}
          scrollEventThrottle={16}
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 90,
  },
  content: {
    width: '100%',
    gap: 16,
  },
})
