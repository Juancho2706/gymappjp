import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useTheme } from '../../context/ThemeContext'
import type { DayState } from '../../lib/plan-builder/types'

interface Props { days: DayState[] }

/** Balance muscular del programa: series por grupo muscular (client-side, sin query). */
export const MuscleBalanceSheet = forwardRef<BottomSheetModal, Props>(function MuscleBalanceSheet({ days }, ref) {
  const { theme } = useTheme()
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of days) for (const b of d.blocks) {
      const m = b.muscle_group || 'General'
      map.set(m, (map.get(m) ?? 0) + (b.sets ?? 0))
    }
    const arr = [...map].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets)
    const max = arr.reduce((mx, x) => Math.max(mx, x.sets), 0) || 1
    return { arr, max, total: arr.reduce((s, x) => s + x.sets, 0) }
  }, [days])

  return (
    <BottomSheetModal ref={ref} index={0} snapPoints={['70%']} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Balance muscular</Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{data.total} series · {data.arr.length} grupos</Text>
        {data.arr.length === 0 ? (
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 16 }]}>Agregá ejercicios para ver el balance.</Text>
        ) : null}
        {data.arr.map((x) => (
          <View key={x.muscle} style={styles.row}>
            <Text style={[styles.muscle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{x.muscle}</Text>
            <View style={[styles.track, { backgroundColor: theme.muted }]}>
              <View style={[styles.fill, { width: `${Math.round((x.sets / data.max) * 100)}%`, backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.sets, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{x.sets}</Text>
          </View>
        ))}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 10 },
  title: { fontSize: 18 },
  sub: { fontSize: 12, marginTop: -4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muscle: { width: 96, fontSize: 13 },
  track: { flex: 1, height: 9, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 9, borderRadius: 5 },
  sets: { width: 26, textAlign: 'right', fontSize: 12 },
})
