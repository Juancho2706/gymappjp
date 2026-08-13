import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  Check,
  Flame,
  Footprints,
  HeartPulse,
  Lock,
  Moon,
  Route,
  Timer,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button, Card } from '../../components'
import { HEALTH_APP_NAME, useHealthConnection } from '../../lib/use-health-connection'

/**
 * "Apple Salud / Health Connect" — pantalla dedicada al agregador de salud del alumno.
 *
 * POR QUE EXISTE: App Review rechazó la app por guideline 2.5.1 (usa las APIs de HealthKit sin
 * identificar claramente esa funcionalidad en la UI). Hasta ahora el único punto de entrada era una
 * fila dentro del card de Hábitos del inicio, y solo cuando la fecha seleccionada era HOY: el
 * revisor no podía encontrarla. Esta pantalla es una superficie PERMANENTE, alcanzable desde
 * Perfil → "{HEALTH_APP_NAME}", que nombra la integración, enumera exactamente qué se lee y ofrece
 * conectar/desconectar.
 *
 * CONTRATO: solo lectura, nunca escritura; la preferencia vive en el dispositivo y es revocable.
 * La lógica de opt-in es la MISMA que consume `HabitsCard` (hook `useHealthConnection`).
 */

const READ_ITEMS = [
  { Icon: Footprints, label: 'Pasos de hoy', detail: 'Autocompleta tu hábito de pasos en el inicio.' },
  { Icon: Moon, label: 'Sueño de anoche', detail: 'Autocompleta tus horas de sueño en el inicio.' },
  {
    Icon: Timer,
    label: 'Entrenamientos registrados',
    detail: 'Duración de las sesiones que tu reloj ya guardó, para importarlas al cerrar el cardio.',
  },
  { Icon: HeartPulse, label: 'Frecuencia cardiaca', detail: 'La curva de pulso del entrenamiento importado.' },
  { Icon: Route, label: 'Distancia', detail: 'Kilómetros de caminata, trote o bicicleta del entrenamiento.' },
  { Icon: Flame, label: 'Calorías activas', detail: 'Gasto energético que tu reloj asoció a la sesión.' },
]

export default function SaludScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const health = useHealthConnection()

  const systemAppName = Platform.OS === 'ios' ? 'Salud de Apple' : 'Health Connect'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/alumno/(tabs)/perfil'))}
        >
          <ArrowLeft size={22} color={theme.foreground} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_900Black' }]}>
            {HEALTH_APP_NAME}
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Conecta tu reloj o teléfono para no anotar a mano
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padding={16} radius="card" style={{ gap: 10 }}>
          <View style={styles.statusRow}>
            <HeartPulse size={18} color={theme.primary} strokeWidth={2.2} />
            <Text style={[styles.statusText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {health.optIn ? `Conectado a ${HEALTH_APP_NAME}` : `Sin conectar a ${HEALTH_APP_NAME}`}
            </Text>
          </View>
          <Text style={[styles.body, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            EVA puede leer, con tu permiso, los datos que tu reloj o tu teléfono ya guardan en{' '}
            {systemAppName}, y usarlos para completar tus hábitos y tus entrenamientos sin que los
            escribas de nuevo.
          </Text>

          {health.available ? (
            health.optIn ? (
              <Button
                label="Desconectar"
                variant="secondary"
                testID="salud-disconnect"
                onPress={() => {
                  void health.disconnect()
                }}
              />
            ) : (
              <Button
                label={health.connecting ? 'Conectando…' : `Conectar con ${HEALTH_APP_NAME}`}
                testID="salud-connect"
                loading={health.connecting}
                onPress={() => {
                  void health.connect()
                }}
              />
            )
          ) : (
            // Sin módulo nativo (Expo Go / binario viejo) la acción no existe, pero la pantalla
            // sigue describiendo la integración: nunca se queda en blanco.
            <View style={styles.unavailable}>
              <ActivityIndicator size="small" color={theme.mutedForeground} />
              <Text style={[styles.body, { flex: 1, color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Esta versión de EVA no puede conectarse a {systemAppName} en este dispositivo.
                Actualiza EVA desde la tienda para habilitarlo.
              </Text>
            </View>
          )}
        </Card>

        <View style={{ gap: 10 }}>
          <Text style={[styles.groupTitle, { color: theme.foreground, fontFamily: theme.fontSans }]}>
            Qué lee EVA
          </Text>
          <Card padding={0} radius="card">
            {READ_ITEMS.map(({ Icon, label, detail }, i) => (
              <View
                key={label}
                style={[
                  styles.readRow,
                  i < READ_ITEMS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                <Icon size={16} color={theme.primary} strokeWidth={2} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[styles.readLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                    {label}
                  </Text>
                  <Text style={[styles.readDetail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {detail}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[styles.groupTitle, { color: theme.foreground, fontFamily: theme.fontSans }]}>
            Tu privacidad
          </Text>
          <Card padding={16} variant="sunken" radius="card" style={{ gap: 12 }}>
            {[
              `EVA nunca escribe datos en ${systemAppName}. El acceso es de solo lectura.`,
              'Los datos de salud se leen en tu dispositivo y solo se guardan los hábitos y entrenamientos que tú confirmas.',
              'Puedes desconectar cuando quieras desde esta pantalla, y revocar el permiso desde los ajustes del sistema.',
              'EVA nunca usa tus datos de salud para publicidad ni los vende a terceros.',
            ].map((line) => (
              <View key={line} style={styles.privacyRow}>
                {line.startsWith('EVA nunca escribe') ? (
                  <Lock size={14} color={theme.mutedForeground} strokeWidth={2} style={{ marginTop: 2 }} />
                ) : (
                  <Check size={14} color={theme.mutedForeground} strokeWidth={2.4} style={{ marginTop: 2 }} />
                )}
                <Text style={[styles.body, { flex: 1, color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {line}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: { fontSize: 21, letterSpacing: -0.42 },
  subtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12.5, lineHeight: 18 },
  unavailable: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  groupTitle: { fontSize: 13, letterSpacing: 0.2, textTransform: 'uppercase' },
  readRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readLabel: { fontSize: 13.5, fontWeight: '600' },
  readDetail: { fontSize: 11.5, lineHeight: 16 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
})
