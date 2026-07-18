import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Check, MailCheck } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { Button, Card } from '../../components'

// Espejo mobile de la web `(auth)/verify-email/page.tsx`: pantalla post-registro coach free.
const BENEFITS = [
  '3 alumnos sin costo',
  'Planes de entrenamiento ilimitados',
  'Tu propia app para alumnos',
  'Upgrade cuando quieras',
]

export default function VerifyEmailScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { email } = useLocalSearchParams<{ email?: string }>()

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MotiView
          from={{ opacity: 0, translateY: 18 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 460 }}
          style={styles.inner}
        >
          <View className="bg-sport-100" style={[styles.icon, { borderRadius: theme.radius['2xl'] }]}>
            <MailCheck size={34} color={theme.primary} strokeWidth={1.75} />
          </View>

          <Text className="text-strong font-display-black" style={styles.title}>
            Revisa tu email
          </Text>
          <Text className="text-muted font-sans" style={styles.subtitle}>
            Te enviamos un enlace de confirmación a{' '}
            <Text className="text-strong font-sans-semibold">{email || 'tu correo'}</Text>. Clickéalo para
            activar tu cuenta gratuita.
          </Text>

          <Card padding={18} style={styles.benefitsCard}>
            <Text className="text-subtle font-sans-bold" style={styles.benefitsTitle}>
              INCLUIDO EN TU PLAN FREE
            </Text>
            <View style={styles.benefitsList}>
              {BENEFITS.map((item) => (
                <View key={item} style={styles.benefitRow}>
                  <View className="bg-success-100" style={styles.benefitCheck}>
                    <Check size={13} color={theme.success} strokeWidth={2.5} />
                  </View>
                  <Text className="text-body font-sans" style={styles.benefitText}>{item}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Text className="text-subtle font-sans" style={styles.hint}>
            ¿No te llegó? Revisa spam o espera un minuto.
          </Text>

          <Button
            testID="verify-email-continue"
            label="Ya confirmé · Ir al panel"
            variant="sport"
            rightIcon={ArrowRight}
            onPress={() => router.replace('/(auth)/login?role=coach')}
            full
            size="lg"
            style={{ marginTop: 20 }}
          />
        </MotiView>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  inner: { alignItems: 'center' },
  icon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 25, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  benefitsCard: { width: '100%', marginTop: 24, gap: 12 },
  benefitsTitle: { fontSize: 11, letterSpacing: 0.5 },
  benefitsList: { gap: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 13.5 },
  hint: { fontSize: 12.5, textAlign: 'center', marginTop: 18 },
})
