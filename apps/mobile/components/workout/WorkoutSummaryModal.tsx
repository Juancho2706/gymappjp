import { useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check, Share2, Trophy, X, Zap } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { Confetti } from 'react-native-fast-confetti'
import { useTheme } from '../../context/ThemeContext'
import { useEvaMotion } from '../../lib/motion'
import { haptics } from '../../lib/haptics'
import { epleyOneRM } from '../../lib/profile-analytics'
import { AnimatedNumber } from '../AnimatedNumber'

interface LogEntry {
  blockId: string
  setNumber: number
  weightKg: string
  repsDone: string
}

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
}

interface Block {
  id: string
  sets: number
  exercises: Exercise | null
}

export interface WorkoutSummaryModalProps {
  visible: boolean
  planTitle: string
  blocks: Block[]
  logs: Record<string, LogEntry[]>
  /** Máximos históricos por ejercicio (kg) — para detectar récords (espejo web). */
  exerciseMaxes?: Record<string, number>
  onDone: () => void
  onClose?: () => void
}

export function WorkoutSummaryModal({
  visible,
  planTitle,
  blocks,
  logs,
  exerciseMaxes = {},
  onDone,
  onClose,
}: WorkoutSummaryModalProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const [shared, setShared] = useState(false)

  // Deleite: al abrirse el resumen, celebrar (haptic de éxito). Confetti se renderiza abajo.
  useEffect(() => { if (visible) haptics.success() }, [visible])

  const allLogs = useMemo(() => Object.values(logs).flat(), [logs])

  const stats = useMemo(() => {
    const completedSets = allLogs.length
    const totalReps = allLogs.reduce((acc, l) => acc + (parseInt(l.repsDone) || 0), 0)
    const totalVolume = allLogs.reduce(
      (acc, l) => acc + (parseFloat(l.weightKg) || 0) * (parseInt(l.repsDone) || 0),
      0,
    )
    return { completedSets, totalReps, totalVolume }
  }, [allLogs])

  const exerciseBreakdown = useMemo(() => {
    const result: Array<{
      exerciseId: string
      name: string
      muscleGroup: string
      sets: number
      volume: number
      maxWeight: number
    }> = []
    for (const block of blocks) {
      const blockLogs = logs[block.id] ?? []
      if (!blockLogs.length || !block.exercises) continue
      let volume = 0
      let maxWeight = 0
      for (const l of blockLogs) {
        const w = parseFloat(l.weightKg) || 0
        const r = parseInt(l.repsDone) || 0
        volume += w * r
        if (w > maxWeight) maxWeight = w
      }
      result.push({
        exerciseId: block.exercises.id,
        name: block.exercises.name,
        muscleGroup: block.exercises.muscle_group ?? 'General',
        sets: blockLogs.length,
        volume,
        maxWeight,
      })
    }
    return result
  }, [blocks, logs])

  // Récords personales: peso máximo de hoy supera el máximo histórico (espejo WorkoutSummaryOverlay web).
  const detectedPRs = useMemo(() => {
    return exerciseBreakdown
      .filter((ex) => {
        const historicMax = exerciseMaxes[ex.exerciseId]
        return historicMax != null && ex.maxWeight > historicMax
      })
      .map((ex) => {
        const blockLogs = blocks
          .filter((b) => b.exercises?.id === ex.exerciseId)
          .flatMap((b) => logs[b.id] ?? [])
        const setAtMax = blockLogs.reduce(
          (best, cur) => ((parseFloat(cur.weightKg) || 0) > (parseFloat(best.weightKg) || 0) ? cur : best),
          blockLogs[0],
        )
        const repsAtMax = parseInt(setAtMax?.repsDone ?? '') || 1
        const prevKg = exerciseMaxes[ex.exerciseId]!
        const pct = prevKg > 0 ? Math.round(((ex.maxWeight - prevKg) / prevKg) * 1000) / 10 : 100
        return {
          exerciseName: ex.name,
          newWeightKg: ex.maxWeight,
          prevWeightKg: prevKg,
          pct,
          estimated1RM: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
        }
      })
  }, [exerciseBreakdown, exerciseMaxes, blocks, logs])

  const muscleGroupVolume = useMemo(() => {
    const map = new Map<string, number>()
    for (const ex of exerciseBreakdown) {
      map.set(ex.muscleGroup, (map.get(ex.muscleGroup) ?? 0) + ex.volume)
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const maxVol = entries[0]?.[1] ?? 1
    return entries.map(([group, vol]) => ({ group, vol, pct: Math.round((vol / maxVol) * 100) }))
  }, [exerciseBreakdown])

  async function handleShare() {
    const prText = detectedPRs.length > 0 ? ` 🏆 ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''
    const text = `¡Completé "${planTitle}"! 💪 ${stats.completedSets} series · ${stats.totalReps} reps · ${Math.round(stats.totalVolume)} kg${prText}`
    try {
      await Share.share({ message: text })
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch {
      // user cancelled share
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        {/* Deleite: ráfaga de confetti del color de marca (respeta reduce-motion). */}
        {visible && !motion.reduced ? (
          <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} />
        ) : null}

        {/* Sheet close handle */}
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        {/* Dismiss button */}
        {onClose && (
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.secondary }]} onPress={onClose} activeOpacity={0.7}>
            <X size={16} color={theme.mutedForeground} />
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconRow}>
              <View style={[styles.iconWrap, { backgroundColor: '#F59E0B22', borderRadius: 40 }]}>
                <Trophy size={28} color="#F59E0B" />
              </View>
              <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18', borderRadius: 40 }]}>
                <Zap size={28} color={theme.primary} />
              </View>
            </View>
            <Text style={[styles.headline, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
              ¡Sesión completada!
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {planTitle}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard label="Sets" value={stats.completedSets} theme={theme} />
            <StatCard label="Reps" value={stats.totalReps} theme={theme} />
            <StatCard label="Volumen" value={Math.round(stats.totalVolume)} suffix=" kg" theme={theme} />
          </View>

          {/* Récords personales */}
          {detectedPRs.length > 0 && (
            <View style={[styles.prCard, { borderColor: '#FACC1566', backgroundColor: '#F59E0B1F', borderRadius: theme.radius.xl }]}>
              <Text style={[styles.prHeading, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                🏆 {detectedPRs.length} {detectedPRs.length === 1 ? 'récord personal' : 'récords personales'}
              </Text>
              {detectedPRs.map((pr) => (
                <View key={pr.exerciseName} style={[styles.prRow, { borderColor: '#FACC154D', backgroundColor: theme.background + '99', borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.prName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{pr.exerciseName}</Text>
                  <Text style={[styles.prDelta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {pr.prevWeightKg} kg → {pr.newWeightKg} kg{pr.pct > 0 ? ` (+${pr.pct}%)` : ''}
                  </Text>
                  <Text style={[styles.prOneRm, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    1RM estimado:{' '}
                    <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>{pr.estimated1RM} kg</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Exercise breakdown */}
          {exerciseBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Por ejercicio
              </Text>
              {exerciseBreakdown.map((ex, i) => (
                <View key={`${ex.name}-${i}`} style={[styles.exRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.exName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                      {ex.name}
                    </Text>
                    <Text style={[styles.exMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {ex.muscleGroup}
                    </Text>
                  </View>
                  <Text style={[styles.exMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>{ex.sets}</Text>
                    {' series'}
                    {ex.volume > 0 ? (
                      <>
                        {' · '}
                        <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>
                          {Math.round(ex.volume)}
                        </Text>
                        {' kg'}
                      </>
                    ) : null}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Muscle group bars */}
          {muscleGroupVolume.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Volumen por grupo
              </Text>
              {muscleGroupVolume.map(({ group, vol, pct }) => (
                <View key={group} style={styles.barRow}>
                  <View style={styles.barHeader}>
                    <Text style={[styles.barLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>{group}</Text>
                    <Text style={[styles.barValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {Math.round(vol)} kg
                    </Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
                    <View style={[styles.barFill, { backgroundColor: theme.primary, width: `${pct}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={[styles.actions, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[styles.shareBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            {shared ? (
              <>
                <Check size={16} color={theme.success} />
                <Text style={[styles.shareBtnLabel, { color: theme.success, fontFamily: theme.fontSans }]}>Copiado</Text>
              </>
            ) : (
              <>
                <Share2 size={16} color={theme.foreground} />
                <Text style={[styles.shareBtnLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Compartir logro</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: theme.primary }]}
            onPress={onDone}
            activeOpacity={0.85}
          >
            <Text style={[styles.doneBtnLabel, { fontFamily: 'Montserrat_700Bold' }]}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function StatCard({ label, value, suffix, theme }: { label: string; value: number; suffix?: string; theme: any }) {
  return (
    <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Text style={[styles.statLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <AnimatedNumber
        value={value}
        format={(n) => `${Math.round(n)}${suffix ?? ''}`}
        style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scroll: { padding: 24, paddingBottom: 16, gap: 20 },
  header: { alignItems: 'center', gap: 10, paddingTop: 8 },
  iconRow: { flexDirection: 'row', gap: 10 },
  iconWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 22, letterSpacing: -0.3, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', opacity: 0.8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 3 },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  prCard: { borderWidth: 1, padding: 14, gap: 10 },
  prHeading: { fontSize: 14, letterSpacing: -0.2 },
  prRow: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
  prName: { fontSize: 13 },
  prDelta: { fontSize: 12 },
  prOneRm: { fontSize: 11, marginTop: 2 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  exName: { fontSize: 13 },
  exMuscle: { fontSize: 11 },
  exMeta: { fontSize: 12 },
  barRow: { gap: 5 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 13 },
  barValue: { fontSize: 12 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  actions: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
    borderTopWidth: 1,
  },
  shareBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareBtnLabel: { fontSize: 14 },
  doneBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  doneBtnLabel: { fontSize: 16, color: '#fff' },
})
