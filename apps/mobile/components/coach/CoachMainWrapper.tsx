import { useEffect, type ReactElement, type ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { AppBackground } from '../AppBackground'
import { useCoachTabbarScroll } from './CoachTabbarScroll'
import { bootstrapOwnCoachBranding } from '../../lib/branding'

interface CoachMainWrapperProps {
  children: ReactNode
  scroll?: boolean
  refreshControl?: ReactElement<RefreshControlProps>
}

export function CoachMainWrapper({ children, scroll = true, refreshControl }: CoachMainWrapperProps) {
  const { theme, setBranding } = useTheme()
  const { onScroll } = useCoachTabbarScroll()
  const insets = useSafeAreaInsets()

  // QA4 (P1-3/P1-4) — el coach ES la marca: al entrar a su panel se resuelve y cachea SU PROPIA
  // marca. Antes la cache solo la escribia el flujo del alumno o el Guardar de Mi Marca, asi que
  // un coach en un device limpio veia EVA y uno que habia usado el enlace de OTRO coach veia la
  // marca ajena. `bootstrapOwnCoachBranding` es idempotente (memo por usuario), best-effort y no
  // bloquea el render; si el coach apago "usar mi marca en mi panel" devuelve null (panel neutro,
  // paridad con BrandCoachLoadingShell en web).
  useEffect(() => {
    let alive = true
    bootstrapOwnCoachBranding()
      .then((result) => {
        if (alive && result.handled) setBranding(result.branding)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [setBranding])
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
