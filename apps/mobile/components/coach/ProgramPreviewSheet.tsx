import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Moon } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { getMuscleColor } from '../../lib/muscle-colors'
import { buildDayPreviewSections } from '../../lib/workout-areas-grouping'
import type { WorkoutArea } from '../../lib/areas'
import type { DayState } from '../../lib/plan-builder/types'

interface Props {
  days: DayState[]
  name: string
  /** Áreas visibles del coach — resuelve nombres de áreas custom/extra (fallback legacy si falta). */
  areas?: WorkoutArea[]
}

/** Resumen del programa (día → ÁREAS → superseries → bloques) antes de guardar/asignar. 1:1 con la
 *  web (ProgramPreviewDialog): agrupa por área con fallback legacy + runs de superserie contiguas. */
export const ProgramPreviewSheet = forwardRef<BottomSheetModal, Props>(function ProgramPreviewSheet({ days, name, areas = [] }, ref) {
  const { theme } = useTheme()
  const { active, totalEx, totalSets } = useMemo(() => {
    const active = days.filter((d) => !d.is_rest && d.blocks.length > 0)
    const totalEx = active.reduce((s, d) => s + d.blocks.length, 0)
    const totalSets = active.reduce((s, d) => s + d.blocks.reduce((ss, b) => ss + (b.sets ?? 0), 0), 0)
    return { active, totalEx, totalSets }
  }, [days])

  return (
    <BottomSheetModal ref={ref} index={0} snapPoints={['85%']} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{name || 'Programa'}</Text>

        {/* stat-cards (días activos / ejercicios / series) */}
        <View style={styles.statRow}>
          {[{ v: active.length, l: 'Días' }, { v: totalEx, l: 'Ejercicios' }, { v: totalSets, l: 'Series' }].map((s) => (
            <View key={s.l} style={[styles.statCard, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
              <Text style={[styles.statVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{s.v}</Text>
              <Text style={[styles.statLbl, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{s.l}</Text>
            </View>
          ))}
        </View>

        {active.length === 0 ? (
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 16 }]}>Sin ejercicios todavía.</Text>
        ) : null}

        {/* Recorre TODOS los días (incl. descanso) en orden */}
        {[...days].map((d) => {
          if (d.is_rest || d.blocks.length === 0) {
            if (!d.is_rest) return null
            return (
              <View key={d.id} style={[styles.restCard, { borderColor: theme.border }]}>
                <Moon size={13} color={theme.mutedForeground} />
                <Text style={[styles.restText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{d.title ? `${d.name} — ${d.title}` : d.name} · Descanso</Text>
              </View>
            )
          }
          const muscles = [...new Set(d.blocks.map((b) => b.muscle_group).filter(Boolean) as string[])].slice(0, 6)
          const sections = buildDayPreviewSections(d.blocks, areas)
          return (
            <View key={d.id} style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                  {d.name}
                  {d.title ? <Text style={[styles.dayTitleSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}> — {d.title}</Text> : null}
                </Text>
                <View style={styles.dayDots}>
                  {muscles.map((m) => <View key={m} style={[styles.dayDot, { backgroundColor: getMuscleColor(m) }]} />)}
                </View>
              </View>

              {sections.map((sec) => (
                <View key={sec.key} style={{ gap: 6, marginTop: 8 }}>
                  <Text style={[styles.secLabel, { color: theme.mutedForeground, borderBottomColor: theme.border, fontFamily: 'Inter_700Bold' }]}>{sec.label.toUpperCase()}</Text>
                  <View style={{ gap: 6 }}>
                    {sec.groups.map((group) => (
                      <View
                        key={group.key}
                        style={group.type === 'superset' ? [styles.ssGroup, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '10' }] : undefined}
                      >
                        {group.type === 'superset' ? (
                          <Text style={[styles.ssLabel, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Superserie · grupo {group.supersetLetter ?? '?'}</Text>
                        ) : null}
                        <View style={{ gap: 4, paddingLeft: group.type === 'superset' ? 4 : 0 }}>
                          {group.blocks.map((b) => (
                            <View key={b.uid} style={styles.blockRow}>
                              <View style={[styles.blockDot, { backgroundColor: getMuscleColor(b.muscle_group) }]} />
                              <Text style={[styles.blockName, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{b.exercise_name}</Text>
                              {b.sets && b.reps ? (
                                <Text style={[styles.blockMeta, { color: theme.mutedForeground, backgroundColor: theme.card, fontFamily: 'Inter_700Bold' }]}>{b.sets}×{b.reps}</Text>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 10 },
  title: { fontSize: 19 },
  sub: { fontSize: 12, marginTop: -4 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 18, letterSpacing: -0.3 },
  statLbl: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  restCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderStyle: 'dashed' },
  restText: { fontSize: 12.5, flex: 1 },
  dayCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTitle: { fontSize: 15, flex: 1 },
  dayTitleSub: { fontSize: 12.5 },
  dayDots: { flexDirection: 'row', gap: 4 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  secLabel: { fontSize: 9.5, letterSpacing: 0.8, borderBottomWidth: 1, paddingBottom: 3 },
  ssGroup: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 4 },
  ssLabel: { fontSize: 8.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  blockDot: { width: 6, height: 6, borderRadius: 3 },
  blockName: { fontSize: 13, flex: 1 },
  blockMeta: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
})
