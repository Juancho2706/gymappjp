import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { ChevronRight, Trophy } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import type { WeeklyWeightPR } from '../../../lib/profile-analytics'

const CONFETTI_COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4']
const PIECES = Array.from({ length: 16 }, (_, i) => i)

function Confetti({ burstKey }: { burstKey: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PIECES.map((i) => {
        const angle = (i / PIECES.length) * Math.PI * 2
        const dist = 60 + (i % 4) * 22
        const dx = Math.cos(angle) * dist
        const dy = Math.sin(angle) * dist - 20
        return (
          <MotiView
            key={`${burstKey}-${i}`}
            from={{ opacity: 1, translateX: 0, translateY: 0, scale: 0.4, rotate: '0deg' }}
            animate={{ opacity: 0, translateX: dx, translateY: dy, scale: 1, rotate: `${(i % 2 ? 1 : -1) * 220}deg` }}
            transition={{ type: 'timing', duration: 900, delay: (i % 5) * 40 }}
            style={[
              styles.piece,
              { backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length], borderRadius: i % 3 === 0 ? 6 : 2 },
            ]}
          />
        )
      })}
    </View>
  )
}

/** Banner de PR 1RM semanal con animación celebratoria — 1:1 con WeeklyPRBanner web. */
export function WeeklyPRBanner({ prs }: { prs: WeeklyWeightPR[] }) {
  const { theme } = useTheme()
  const [idx, setIdx] = useState(0)
  const [burstKey, setBurstKey] = useState(0)

  useEffect(() => {
    if (prs.length > 0) {
      setBurstKey((k) => k + 1)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    }
  }, [prs.length])

  if (prs.length === 0) return null
  const pr = prs[Math.min(idx, prs.length - 1)]!

  function next() {
    setIdx((i) => (i + 1) % prs.length)
    setBurstKey((k) => k + 1)
    Haptics.selectionAsync().catch(() => {})
  }

  return (
    <View style={styles.outer}>
      <MotiView
        key={burstKey}
        from={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 160 }}
        style={[styles.card, { backgroundColor: '#F59E0B', borderRadius: theme.radius.xl }]}
      >
        <View style={styles.headRow}>
          <View style={styles.iconWrap}>
            <Trophy size={22} color="#F59E0B" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>¡NUEVO RÉCORD ESTA SEMANA!</Text>
            <Text numberOfLines={1} style={styles.exercise}>{pr.exerciseName}</Text>
            <Text style={styles.muscle}>{pr.muscleGroup}</Text>
          </View>
          {prs.length > 1 ? (
            <TouchableOpacity onPress={next} hitSlop={10} style={styles.nextBtn}>
              <Text style={styles.nextTxt}>{idx + 1}/{prs.length}</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{pr.newWeightKg} kg × {pr.newReps}</Text>
            <Text style={styles.statLabel}>Mejor serie</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{pr.newOneRm} kg</Text>
            <Text style={styles.statLabel}>1RM estimado</Text>
          </View>
          {pr.pctChange != null ? (
            <View style={styles.statBox}>
              <Text style={styles.statVal}>▲ {pr.pctChange}%</Text>
              <Text style={styles.statLabel}>vs {pr.prevOneRm} kg</Text>
            </View>
          ) : null}
        </View>
        <Confetti burstKey={burstKey} />
      </MotiView>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: { overflow: 'visible' },
  card: { padding: 16, gap: 14, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.9)', fontFamily: 'HankenGrotesk_700Bold' },
  exercise: { fontSize: 18, color: '#FFFFFF', fontFamily: 'Archivo_900Black', letterSpacing: -0.3, marginTop: 2 },
  muscle: { fontSize: 12, color: 'rgba(255,255,255,0.82)', fontFamily: 'HankenGrotesk_600SemiBold' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  nextTxt: { fontSize: 11, color: '#FFFFFF', fontFamily: 'HankenGrotesk_700Bold' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, gap: 2 },
  statVal: { fontSize: 15, color: '#FFFFFF', fontFamily: 'Archivo_900Black' },
  statLabel: { fontSize: 9.5, color: 'rgba(255,255,255,0.82)', fontFamily: 'HankenGrotesk_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  piece: { position: 'absolute', top: '50%', left: '50%', width: 9, height: 9 },
})
