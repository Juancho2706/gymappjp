import { StyleSheet, Switch, Text, View } from 'react-native'
import { BellRing } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

interface WorkoutTimerSettingsPanelProps {
  autoTimerEnabled: boolean
  onToggleAutoTimer: () => void
}

/**
 * Panel de ajustes del entrenamiento (tuerca) — espejo de WorkoutTimerSettingsPanel (web).
 * Web: cronómetro automático + alarma (sonido/volumen) + permisos de notificación.
 * Native: el cronómetro automático es el control load-bearing (idéntico). La "alarma" es
 * háptica/visual (sin motor de audio en mobile), por eso el bloque de sonido es informativo.
 */
export function WorkoutTimerSettingsPanel({
  autoTimerEnabled,
  onToggleAutoTimer,
}: WorkoutTimerSettingsPanelProps) {
  const { theme } = useTheme()

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
          Cronómetro automático
        </Text>
        <Text style={[styles.sectionDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Si está activado, el descanso empieza solo al guardar cada serie.
        </Text>
        <View style={[styles.toggleRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.xl }]}>
          <Text style={[styles.toggleLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {autoTimerEnabled ? 'Activado' : 'Desactivado'}
          </Text>
          <Switch
            value={autoTimerEnabled}
            onValueChange={onToggleAutoTimer}
            trackColor={{ false: theme.mutedForeground + '4D', true: theme.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Alarma</Text>
        <Text style={[styles.sectionDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Aviso háptico y visual cuando termina el descanso.
        </Text>
        <View style={[styles.noteBox, { borderColor: '#F59E0B40', backgroundColor: '#F59E0B14', borderRadius: theme.radius.xl }]}>
          <BellRing size={16} color="#F59E0B" />
          <Text style={[styles.noteText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
            Mantén la app abierta para sentir la vibración al terminar el descanso.
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 22 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionDesc: { fontSize: 13, lineHeight: 18 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleLabel: { fontSize: 14 },
  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, padding: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
})
