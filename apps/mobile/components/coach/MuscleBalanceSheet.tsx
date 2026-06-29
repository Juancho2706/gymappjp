import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../context/ThemeContext'
import { getMuscleColor } from '../../lib/muscle-colors'
import type { DayState } from '../../lib/plan-builder/types'

interface Props { days: DayState[] }

const SIZE = 240
const C = SIZE / 2
const R = 88

function axisPoint(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

/** Balance muscular 1:1 web: radar (react-native-svg) + barras por músculo + ratio push/pull. */
export const MuscleBalanceSheet = forwardRef<BottomSheetModal, Props>(function MuscleBalanceSheet({ days }, ref) {
  const { theme } = useTheme()
  const data = useMemo(() => {
    const setMap = new Map<string, number>()
    const exMap = new Map<string, number>()
    for (const d of days) {
      if (d.is_rest) continue
      for (const b of d.blocks) {
        const m = b.muscle_group || 'General'
        setMap.set(m, (setMap.get(m) ?? 0) + (b.sets ?? 0))
        exMap.set(m, (exMap.get(m) ?? 0) + 1)
      }
    }
    const arr = [...setMap].map(([muscle, sets]) => ({ muscle, sets, ex: exMap.get(muscle) ?? 0 })).sort((a, b) => b.sets - a.sets)
    const max = arr.reduce((mx, x) => Math.max(mx, x.sets), 0) || 1
    const total = arr.reduce((s, x) => s + x.sets, 0)
    const push = (setMap.get('Pectorales') ?? 0) + Math.round((setMap.get('Hombros') ?? 0) / 2)
    const pull = (setMap.get('Dorsales') ?? 0) + (setMap.get('Espalda Alta') ?? 0)
    return { arr, max, total, radar: arr.slice(0, 8), push, pull }
  }, [days])

  const n = data.radar.length
  const ringColor = theme.mutedForeground
  const dataPts = data.radar.map((x, i) => axisPoint(i, n, R * (x.sets / data.max)))
  const ratio = data.pull > 0 ? data.push / data.pull : data.push > 0 ? 99 : 1
  const balanced = ratio >= 0.65 && ratio <= 1.5

  return (
    <BottomSheetModal ref={ref} index={0} snapPoints={['85%']} enableDynamicSizing={false} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>Balance muscular</Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{data.total} series totales · {data.arr.length} grupos activos</Text>

        {data.arr.length === 0 ? (
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 24, textAlign: 'center' }]}>Agregá ejercicios para ver el balance.</Text>
        ) : (
          <>
            {n >= 3 ? (
              <View style={styles.radarWrap}>
                <Svg width={SIZE} height={SIZE}>
                  {[0.25, 0.5, 0.75, 1].map((ring, ri) => (
                    <Polygon key={ri} points={data.radar.map((_, i) => { const p = axisPoint(i, n, R * ring); return `${p.x},${p.y}` }).join(' ')} fill="none" stroke={ringColor} strokeOpacity={0.15} strokeWidth={1} />
                  ))}
                  {data.radar.map((_, i) => { const p = axisPoint(i, n, R); return <Line key={i} x1={C} y1={C} x2={p.x} y2={p.y} stroke={ringColor} strokeOpacity={0.15} strokeWidth={1} /> })}
                  <Polygon points={dataPts.map((p) => `${p.x},${p.y}`).join(' ')} fill={theme.primary} fillOpacity={0.22} stroke={theme.primary} strokeWidth={2} />
                  {data.radar.map((x, i) => { const p = axisPoint(i, n, R + 12); return <SvgText key={i} x={p.x} y={p.y} fill={theme.mutedForeground} fontSize={8} fontWeight="700" textAnchor="middle" alignmentBaseline="middle">{x.muscle.slice(0, 8)}</SvgText> })}
                </Svg>
              </View>
            ) : null}

            <View style={styles.bars}>
              {data.arr.map((x) => {
                const color = getMuscleColor(x.muscle)
                return (
                  <View key={x.muscle} style={styles.row}>
                    <View style={[styles.mDot, { backgroundColor: color }]} />
                    <Text style={[styles.muscle, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]} numberOfLines={1}>{x.muscle}</Text>
                    <View style={[styles.track, { backgroundColor: theme.muted }]}>
                      <View style={{ height: '100%', borderRadius: 5, width: `${Math.round((x.sets / data.max) * 100)}%`, backgroundColor: color }} />
                    </View>
                    <Text style={[styles.sets, { color: theme.mutedForeground, fontFamily: 'JetBrainsMono_700Bold' }]}>{x.sets}s · {x.ex}ej</Text>
                  </View>
                )
              })}
            </View>

            {data.push > 0 && data.pull > 0 ? (
              <View style={[styles.warn, { borderColor: balanced ? theme.success + '33' : '#F5A52433', backgroundColor: balanced ? theme.success + '14' : '#F5A52414' }]}>
                <Text style={[styles.warnTxt, { color: balanced ? theme.success : '#F5A524', fontFamily: 'HankenGrotesk_700Bold' }]}>
                  {balanced ? `✓ Ratio empuje/jale equilibrado (${data.push}s / ${data.pull}s)` : ratio > 1.5 ? '⚠ Empuje/jale desequilibrado — sumá más espalda' : '⚠ Jale/empuje desequilibrado — sumá más pecho y hombros'}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 10 },
  title: { fontSize: 18 },
  sub: { fontSize: 12, marginTop: -4 },
  radarWrap: { alignItems: 'center', marginVertical: 6 },
  bars: { gap: 9, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mDot: { width: 8, height: 8, borderRadius: 4 },
  muscle: { width: 84, fontSize: 12 },
  track: { flex: 1, height: 9, borderRadius: 5, overflow: 'hidden' },
  sets: { width: 56, textAlign: 'right', fontSize: 11 },
  warn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  warnTxt: { fontSize: 11, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 0.3 },
})
