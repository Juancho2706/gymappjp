import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Rect, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../../context/ThemeContext'
import type { ProfileCalendarActivity } from '../../../lib/profile-analytics'

const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const TOP = 16 // espacio para etiquetas de mes
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function weekday(dateKey: string): number {
  // Lunes = 0
  const d = new Date(`${dateKey}T12:00:00`)
  return (d.getDay() + 6) % 7
}

const LEVEL_OPACITY = [0, 0.28, 0.5, 0.72, 1]

/** Calendar-heatmap 371d (svg) — 1:1 con react-activity-calendar de la web. */
export function CalendarHeatmap({ data, color }: { data: ProfileCalendarActivity[]; color?: string }) {
  const { theme } = useTheme()
  const accent = color ?? theme.primary

  const { cells, cols, monthLabels } = useMemo(() => {
    let col = 0
    const out = data.map((d, idx) => {
      const wd = weekday(d.date)
      if (idx > 0 && wd === 0) col++
      return { date: d.date, level: d.level, count: d.count, row: wd, col }
    })
    const labels: { col: number; text: string }[] = []
    let lastMonth = -1
    for (const c of out) {
      const m = Number(c.date.slice(5, 7)) - 1
      if (m !== lastMonth) { labels.push({ col: c.col, text: MONTHS[m] ?? '' }); lastMonth = m }
    }
    return { cells: out, cols: col + 1, monthLabels: labels }
  }, [data])

  const width = cols * STEP + GAP
  const height = TOP + 7 * STEP

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Svg width={width} height={height}>
          {monthLabels.map((l, i) => (
            <SvgText key={`m${i}`} x={l.col * STEP} y={10} fill={theme.mutedForeground} fontSize={9} fontWeight="600">
              {l.text}
            </SvgText>
          ))}
          {cells.map((c, i) => (
            <Rect
              key={i}
              x={c.col * STEP}
              y={TOP + c.row * STEP}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={c.level === 0 ? theme.muted : accent}
              fillOpacity={c.level === 0 ? 0.5 : LEVEL_OPACITY[c.level]}
            />
          ))}
        </Svg>
      </ScrollView>
      <View style={styles.legend}>
        <Text style={[styles.legendTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Menos</Text>
        <Svg width={5 * STEP} height={CELL}>
          {[0, 1, 2, 3, 4].map((lv) => (
            <Rect key={lv} x={lv * STEP} y={0} width={CELL} height={CELL} rx={2.5} fill={lv === 0 ? theme.muted : accent} fillOpacity={lv === 0 ? 0.5 : LEVEL_OPACITY[lv]} />
          ))}
        </Svg>
        <Text style={[styles.legendTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Más</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  scroll: { paddingVertical: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-end' },
  legendTxt: { fontSize: 10 },
})
