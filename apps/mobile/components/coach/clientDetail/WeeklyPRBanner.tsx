import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Confetti } from 'react-native-fast-confetti'
import { useReducedMotion } from 'react-native-reanimated'
import { Trophy } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge } from '../../../components'
import { SHADOWS } from '../../../lib/shadows'
import { FONT } from '../../../lib/typography'
import { resolveCelebrationSurfaceRamp } from '../../../lib/theme'
import { PHASE_COLORS } from '../ProgramConfigSheet'
import type { WeeklyWeightPR } from '../../../lib/profile-analytics'

// Contrato DS de ProgramConfigSheet: sport · violet · success · warning · ember · aqua.
const VIOLET = PHASE_COLORS[1]

/**
 * Banner del primer PR semanal — espejo de `TrainingTabB4Panels.WeeklyPRBanner`.
 * Es estático: el resto se resume en “+N ejercicios más”; no hay pager ni gestos RN extra.
 */
export function WeeklyPRBanner({ prs }: { prs: WeeklyWeightPR[] }) {
  const { theme, branding } = useTheme()
  const reduceMotion = useReducedMotion()
  const fired = useRef(false)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    if (prs.length === 0 || reduceMotion || fired.current) return
    fired.current = true
    const timer = setTimeout(() => setShowConfetti(true), 280)
    return () => clearTimeout(timer)
  }, [prs.length, reduceMotion])

  if (prs.length === 0) return null

  const top = prs[0]!
  const more = prs.length - 1
  const { ember100, sport100 } = resolveCelebrationSurfaceRamp(branding?.primaryColor, theme.scheme)
  const confettiColors = [theme.primary, theme.success, theme.warning, VIOLET, theme.primaryForeground]

  return (
    <View style={styles.root}>
      <View
        className="border-ember-200"
        style={[
          styles.frame,
          SHADOWS[theme.scheme].sm,
          { backgroundColor: theme.card, borderRadius: theme.radius.card },
        ]}
      >
        <LinearGradient
          colors={[ember100, sport100]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.header}>
            <Trophy size={20} className="text-ember-700" />
            <Text className="text-ember-700" style={styles.kicker}>
              Récord de la semana
            </Text>
          </View>

          <View style={styles.mainLine}>
            <Text className="text-strong" style={styles.exercise}>
              {top.exerciseName}
            </Text>
            <Text className="text-strong" style={styles.bestSet}>
              {top.newWeightKg} kg × {top.newReps}
            </Text>
            {top.pctChange != null ? (
              <Badge tone="success" size="sm">+{top.pctChange}% 1RM</Badge>
            ) : null}
          </View>

          <Text className="text-muted" style={styles.beforeLine}>
            Antes: {top.prevWeightKg} kg × {top.prevReps} · e1RM {top.prevOneRm} → {top.newOneRm} kg
            {more > 0 ? ` · +${more} ejercicio${more === 1 ? '' : 's'} más` : ''}
          </Text>
        </LinearGradient>
      </View>

      {showConfetti && !reduceMotion ? (
        <View pointerEvents="none" style={styles.confettiLayer}>
          <Confetti
            autoplay
            isInfinite={false}
            fadeOutOnEnd
            count={90}
            autoStartDelay={0}
            fallDuration={2600}
            blastDuration={300}
            colors={confettiColors}
            onAnimationEnd={() => setShowConfetti(false)}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'visible' },
  frame: { borderWidth: 1, overflow: 'hidden' },
  card: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  kicker: {
    fontSize: 13,
    fontFamily: FONT.uiExtra,
    textTransform: 'uppercase',
    letterSpacing: 0.26,
  },
  mainLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 },
  exercise: { fontSize: 16, fontFamily: FONT.uiExtra },
  bestSet: {
    fontSize: 20,
    fontFamily: FONT.displayBlack,
    fontVariant: ['tabular-nums', 'lining-nums'],
  },
  beforeLine: { marginTop: 4, fontSize: 12, lineHeight: 17, fontFamily: FONT.uiSemibold },
  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20, overflow: 'visible' },
})
