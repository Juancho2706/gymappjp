import { useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check, Share2 } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { Confetti } from 'react-native-fast-confetti'
import { useTheme } from '../../context/ThemeContext'
import { useEvaMotion } from '../../lib/motion'
import { haptics } from '../../lib/haptics'
import { AnimatedNumber } from '../AnimatedNumber'

// Immersive "gym mode" palette — the summary is always-dark (1:1 with web
// WorkoutSummaryOverlay on ink-950). Brand accent stays white-label aware.
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const BORDER_INV = 'rgba(255,255,255,0.10)'
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const W08 = 'rgba(255,255,255,0.08)'
const W10 = 'rgba(255,255,255,0.10)'

const FONT_DISPLAY = 'Archivo_900Black'
const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_MONO = 'JetBrainsMono_700Bold'

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
  onDone: () => void
  onClose?: () => void
}

export function WorkoutSummaryModal({
  visible,
  planTitle,
  blocks,
  logs,
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
    const result: Array<{ name: string; muscleGroup: string; sets: number; volume: number }> = []
    for (const block of blocks) {
      const blockLogs = logs[block.id] ?? []
      if (!blockLogs.length || !block.exercises) continue
      const volume = blockLogs.reduce(
        (acc, l) => acc + (parseFloat(l.weightKg) || 0) * (parseInt(l.repsDone) || 0),
        0,
      )
      result.push({
        name: block.exercises.name,
        muscleGroup: block.exercises.muscle_group ?? 'General',
        sets: blockLogs.length,
        volume,
      })
    }
    return result
  }, [blocks, logs])

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
    const text = `¡Completé "${planTitle}"! 💪 ${stats.completedSets} series · ${stats.totalReps} reps · ${Math.round(stats.totalVolume)} kg`
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
      <View style={[styles.root, { backgroundColor: INK_950 }]}>
        {/* Deleite: ráfaga de confetti del color de marca (respeta reduce-motion). */}
        {visible && !motion.reduced ? (
          <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} />
        ) : null}

        {/* Sheet close handle */}
        <View style={[styles.handle, { backgroundColor: W10 }]} />

        {/* Dismiss button */}
        {onClose && (
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: W08 }]} onPress={onClose} activeOpacity={0.7}>
            <Text style={[styles.closeGlyph, { color: ON_DARK }]}>✕</Text>
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}>
              <Check size={38} color={theme.primaryForeground} strokeWidth={2.5} />
            </View>
            <Text style={[styles.headline, { color: ON_DARK, fontFamily: FONT_DISPLAY }]}>
              ¡Sesión completada!
            </Text>
            <Text style={[styles.subtitle, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>
              {planTitle}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard label="Series" value={stats.completedSets} theme={theme} />
            <StatCard label="Reps" value={stats.totalReps} theme={theme} />
            <StatCard label="Volumen kg" value={Math.round(stats.totalVolume)} theme={theme} />
          </View>

          {/* Exercise breakdown */}
          {exerciseBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: ON_DARK_MUTED, fontFamily: FONT_BOLD }]}>
                Por ejercicio
              </Text>
              {exerciseBreakdown.map((ex, i) => (
                <View key={`${ex.name}-${i}`} style={[styles.exRow, { borderColor: BORDER_INV, backgroundColor: INK_900 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.exName, { color: ON_DARK, fontFamily: FONT_BOLD }]}>
                      {ex.name}
                    </Text>
                    <Text style={[styles.exMuscle, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>
                      {ex.muscleGroup}
                    </Text>
                  </View>
                  <Text style={[styles.exMeta, { color: ON_DARK_MUTED, fontFamily: FONT_MONO }]}>
                    <Text style={{ color: ON_DARK, fontFamily: FONT_MONO }}>{ex.sets}</Text>
                    {' series'}
                    {ex.volume > 0 ? (
                      <>
                        {' · '}
                        <Text style={{ color: ON_DARK, fontFamily: FONT_MONO }}>
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
            <View style={[styles.section, styles.muscleCard, { backgroundColor: INK_900, borderColor: BORDER_INV }]}>
              <Text style={[styles.sectionTitle, { color: ON_DARK_MUTED, fontFamily: FONT_BOLD }]}>
                Volumen por grupo
              </Text>
              {muscleGroupVolume.map(({ group, vol, pct }) => (
                <View key={group} style={styles.barRow}>
                  <View style={styles.barHeader}>
                    <Text style={[styles.barLabel, { color: ON_DARK, fontFamily: theme.fontSans }]}>{group}</Text>
                    <Text style={[styles.barValue, { color: ON_DARK_MUTED, fontFamily: FONT_MONO }]}>
                      {Math.round(vol)} kg
                    </Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: W10 }]}>
                    <View style={[styles.barFill, { backgroundColor: theme.primary, width: `${pct}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={[styles.actions, { borderTopColor: BORDER_INV, backgroundColor: INK_950 }]}>
          <TouchableOpacity
            style={[styles.shareBtn, { borderColor: BORDER_INV, backgroundColor: W08 }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            {shared ? (
              <>
                <Check size={16} color={theme.primary} />
                <Text style={[styles.shareBtnLabel, { color: ON_DARK, fontFamily: FONT_BOLD }]}>Copiado</Text>
              </>
            ) : (
              <>
                <Share2 size={16} color={ON_DARK} />
                <Text style={[styles.shareBtnLabel, { color: ON_DARK, fontFamily: FONT_BOLD }]}>Compartir</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
            onPress={onDone}
            activeOpacity={0.85}
          >
            <Text style={[styles.doneBtnLabel, { color: theme.primaryForeground, fontFamily: FONT_BOLD }]}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function StatCard({ label, value, theme }: { label: string; value: number; theme: any }) {
  return (
    <View style={[styles.statCard, { borderColor: BORDER_INV, backgroundColor: INK_900 }]}>
      <AnimatedNumber
        value={value}
        format={(n) => `${Math.round(n)}`}
        style={[styles.statValue, { color: theme.primary, fontFamily: FONT_MONO }]}
      />
      <Text style={[styles.statLabel, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>{label}</Text>
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeGlyph: { fontSize: 16, fontFamily: 'HankenGrotesk_700Bold' },
  scroll: { padding: 20, paddingBottom: 16, gap: 16 },
  header: { alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 8 },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  headline: { fontSize: 27, letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 14.5, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', gap: 3 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  muscleCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  exName: { fontSize: 14 },
  exMuscle: { fontSize: 11.5 },
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
    flexDirection: 'row',
  },
  shareBtn: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareBtnLabel: { fontSize: 15 },
  doneBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  doneBtnLabel: { fontSize: 16 },
})
