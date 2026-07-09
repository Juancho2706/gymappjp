import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { PHASE_COLORS, type Phase } from './ProgramConfigSheet'

// Fallback cuando una fase no tiene color asignado: primer tono de la paleta DS (sport-500).
const PHASE_FALLBACK = PHASE_COLORS[0]

/** Timeline de fases 1:1 con ProgramPhasesBar web: barra segmentada por color + leyenda. */
export function ProgramPhasesBar({ phases, weeks }: { phases: Phase[]; weeks: number }) {
  const { theme } = useTheme()
  if (!phases.length) return null
  const total = phases.reduce((s, p) => s + Math.max(1, p.weeks), 0) || 1
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: theme.muted, borderColor: theme.border }]}>
        {phases.map((p, i) => (
          <View key={`${p.name}-${i}`} style={{ width: `${(Math.max(1, p.weeks) / total) * 100}%`, height: '100%', backgroundColor: p.color || PHASE_FALLBACK }} />
        ))}
      </View>
      <View style={styles.legend}>
        {phases.map((p, i) => (
          <View key={`${p.name}-l-${i}`} style={styles.legItem}>
            <View style={[styles.dot, { backgroundColor: p.color || PHASE_FALLBACK }]} />
            <Text style={[styles.legName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{p.name || 'Fase'}</Text>
            <Text style={[styles.legWk, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>({p.weeks}s)</Text>
          </View>
        ))}
        <Text style={[styles.total, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{weeks} sem.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', borderWidth: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legName: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  legWk: { fontSize: 9 },
  total: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 'auto' },
})
