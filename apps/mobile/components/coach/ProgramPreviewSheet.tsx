import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Link2, Moon } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { getMuscleColor } from '../../lib/muscle-colors'
import type { BuilderSection, DayState } from '../../lib/plan-builder/types'

interface Props { days: DayState[]; name: string }

const SECTION_ORDER: BuilderSection[] = ['warmup', 'main', 'cooldown']
const SECTION_LABEL: Record<BuilderSection, string> = { warmup: 'Calentamiento', main: 'Principal', cooldown: 'Enfriamiento' }

/** Resumen del programa (día → secciones → bloques) antes de guardar/asignar. */
export const ProgramPreviewSheet = forwardRef<BottomSheetModal, Props>(function ProgramPreviewSheet({ days, name }, ref) {
  const { theme } = useTheme()
  const { active, totalEx, totalSets } = useMemo(() => {
    const active = days.filter((d) => d.blocks.length > 0)
    const totalEx = active.reduce((s, d) => s + d.blocks.length, 0)
    const totalSets = active.reduce((s, d) => s + d.blocks.reduce((ss, b) => ss + (b.sets ?? 0), 0), 0)
    return { active, totalEx, totalSets }
  }, [days])

  return (
    <BottomSheetModal ref={ref} index={0} snapPoints={['85%']} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: FONT.display }]}>{name || 'Programa'}</Text>

        {/* P-F9: stat-cards (días / ejercicios / series) */}
        <View style={styles.statRow}>
          {[{ v: active.length, l: 'Días' }, { v: totalEx, l: 'Ejercicios' }, { v: totalSets, l: 'Series' }].map((s) => (
            <View key={s.l} style={[styles.statCard, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
              <Text style={[styles.statVal, { color: theme.foreground, fontFamily: FONT.displayBold }]}>{s.v}</Text>
              <Text style={[styles.statLbl, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{s.l}</Text>
            </View>
          ))}
        </View>

        {active.length === 0 ? (
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 16 }]}>Sin ejercicios todavía.</Text>
        ) : null}

        {/* P-F9: recorrer TODOS los días (incl. descanso) en orden */}
        {[...days].map((d) => {
          if (d.blocks.length === 0) {
            return (
              <View key={d.id} style={[styles.restCard, { borderColor: theme.border }]}>
                <Moon size={13} color={theme.mutedForeground} />
                <Text style={[styles.restText, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>{d.title || d.name} · Descanso</Text>
              </View>
            )
          }
          const muscles = [...new Set(d.blocks.map((b) => b.muscle_group).filter(Boolean) as string[])].slice(0, 6)
          return (
          <View key={d.id} style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            <Text style={[styles.dayTitle, { color: theme.foreground, fontFamily: FONT.display }]}>{d.title || d.name}</Text>
            {muscles.length ? (
              <View style={styles.muscleRow}>
                {muscles.map((m) => (
                  <View key={m} style={[styles.muscleChip, { backgroundColor: getMuscleColor(m) + '22', borderColor: getMuscleColor(m) + '55' }]}>
                    <Text style={[styles.muscleTxt, { color: getMuscleColor(m), fontFamily: FONT.uiBold }]}>{m}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {SECTION_ORDER.map((section) => {
              const inSec = d.blocks.filter((b) => (b.section ?? 'main') === section)
              if (inSec.length === 0) return null
              return (
                <View key={section} style={{ gap: 4, marginTop: 8 }}>
                  <Text style={[styles.secLabel, { color: theme.primary, fontFamily: FONT.uiBold }]}>{SECTION_LABEL[section].toUpperCase()}</Text>
                  {inSec.map((b) => (
                    <View key={b.uid} style={styles.blockRow}>
                      {b.superset_group ? <Link2 size={11} color={theme.primary} /> : null}
                      <Text style={[styles.blockName, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{b.exercise_name}</Text>
                      <Text style={[styles.blockMeta, { color: theme.mutedForeground, fontFamily: FONT.monoBold }]}>{b.sets}×{b.reps}{b.target_weight_kg ? ` · ${b.target_weight_kg}kg` : ''}</Text>
                    </View>
                  ))}
                </View>
              )
            })}
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
  restText: { fontSize: 12.5 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  muscleChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  muscleTxt: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3 },
  dayCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  dayTitle: { fontSize: 15 },
  secLabel: { fontSize: 10, letterSpacing: 0.6 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockName: { fontSize: 13, flex: 1 },
  blockMeta: { fontSize: 12 },
})
