import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Link2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
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
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{name || 'Programa'}</Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{active.length} días · {totalEx} ejercicios · {totalSets} series</Text>

        {active.length === 0 ? (
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 16 }]}>Sin ejercicios todavía.</Text>
        ) : null}

        {active.map((d) => (
          <View key={d.id} style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            <Text style={[styles.dayTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{d.title || d.name}</Text>
            {SECTION_ORDER.map((section) => {
              const inSec = d.blocks.filter((b) => (b.section ?? 'main') === section)
              if (inSec.length === 0) return null
              return (
                <View key={section} style={{ gap: 4, marginTop: 8 }}>
                  <Text style={[styles.secLabel, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{SECTION_LABEL[section].toUpperCase()}</Text>
                  {inSec.map((b) => (
                    <View key={b.uid} style={styles.blockRow}>
                      {b.superset_group ? <Link2 size={11} color={theme.primary} /> : null}
                      <Text style={[styles.blockName, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{b.exercise_name}</Text>
                      <Text style={[styles.blockMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{b.sets}×{b.reps}{b.target_weight_kg ? ` · ${b.target_weight_kg}kg` : ''}</Text>
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        ))}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 10 },
  title: { fontSize: 19 },
  sub: { fontSize: 12, marginTop: -4 },
  dayCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  dayTitle: { fontSize: 15 },
  secLabel: { fontSize: 10, letterSpacing: 0.6 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockName: { fontSize: 13, flex: 1 },
  blockMeta: { fontSize: 12 },
})
