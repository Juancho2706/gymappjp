import { useCallback, useEffect, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Check, MailCheck, Send } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { Button, Card } from '../../components'
import { ApiError, resendCoachConfirmation } from '../../lib/api'
import { freePlanBenefits, storePlanChangeCaption } from '../../lib/client-cap'
import {
  isResendDisabled,
  resendButtonLabel,
  resendHint,
  resendStateFromRateLimit,
  RESEND_COOLDOWN_SECONDS,
  tickCooldown,
  type ResendPhase,
} from '../../lib/resend-confirmation'

// Espejo mobile de la web `(auth)/verify-email/page.tsx`: pantalla post-registro coach free.
// El cupo se deriva del catálogo (histórico QA 17-08: 3 → pricing v2: 2 → pricing v3 2026-08-21: 1).
//
// W6.6 (embudo Free→Pro): «Upgrade cuando quieras» era jerga de venta. La app dice el hecho —
// puedes cambiar de plan — y ese beneficio es IDÉNTICO en las dos plataformas. El dónde (que solo
// Android puede nombrar) NO se fusiona con el beneficio: baja como caption aparte, con el literal
// canónico de `lib/client-cap.ts`, para que exista UNA sola línea de compliance en toda la app en
// vez de una variante por pantalla. En iOS ese nodo no se monta (guideline 3.1.1: cero texto que
// lleve a pagar). El split va por `Platform.OS`, jamás por storefront.
const BENEFITS = freePlanBenefits()
const STORE_CAPTION = storePlanChangeCaption(Platform.OS)

export default function VerifyEmailScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  // `uid` lo devuelve el alta (`registerCoachFree`) y viaja por la ruta, igual que el `?uid=` que el
  // registro web pone en `/verify-email`. No se persiste: si el coach mata la app, al reabrirla cae
  // en el login, no acá. Sin `uid` (server anterior a W4) la pantalla degrada al texto de siempre.
  const { email, uid } = useLocalSearchParams<{ email?: string; uid?: string }>()

  const [phase, setPhase] = useState<ResendPhase>('idle')
  const [cooldown, setCooldown] = useState(0)
  const [cappedToday, setCappedToday] = useState(false)
  const resendState = { phase, cooldown, cappedToday }

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(tickCooldown), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const handleResend = useCallback(async () => {
    if (!uid || isResendDisabled({ phase, cooldown })) return
    setPhase('sending')
    try {
      await resendCoachConfirmation(uid)
      // El server contesta 200 neutro AUNQUE no haya reenviado (uid desconocido, cuenta ya
      // confirmada, Resend caido): la pantalla pinta "Listo, te lo reenviamos" igual, A PROPOSITO.
      // Distinguir los casos convertiria esta pantalla en un oraculo de que cuentas existen.
      setPhase('sent')
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setCappedToday(false)
    } catch (err) {
      // 429 = el server ya tiene un freno corriendo para este uid. No es un error del coach ni hay
      // nada que reintentar: se le muestra el contador, no una alarma roja. Y se respeta SU numero
      // (`retryAfterSeconds`): el tope diario pide horas, no los 60 s del cooldown.
      if (err instanceof ApiError && err.status === 429) {
        const next = resendStateFromRateLimit(err.retryAfterSeconds)
        setPhase(next.phase)
        setCooldown(next.cooldown)
        setCappedToday(next.cappedToday === true)
        return
      }
      setPhase('error')
    }
  }, [uid, phase, cooldown])

  const hint = uid ? resendHint(resendState) : '¿No te llegó? Revisa spam o espera un minuto.'

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

          {/* Android: única línea admitida sobre dónde se cambia el plan (texto plano, sin link,
              sin `Linking`). En iOS `STORE_CAPTION` es undefined y este nodo no existe. */}
          {STORE_CAPTION ? (
            <Text testID="verify-email-store-note" className="text-subtle font-sans" style={styles.storeNote}>
              {STORE_CAPTION}
            </Text>
          ) : null}

          {/* Sin esto, un correo caído en spam mataba la cuenta: el login rechaza hasta confirmar y
              el email ya está tomado para volver a registrarse (W4 del embudo Free→Pro). */}
          {/* El hint cambia solo (envio, 429, fallo) sin que nadie lo toque: sin live region,
              TalkBack/VoiceOver no anuncian nada y el lector se queda con el texto viejo. */}
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={phase === 'error' ? 'alert' : 'text'}
            className={phase === 'error' ? 'text-destructive font-sans' : 'text-subtle font-sans'}
            style={styles.hint}
          >
            {hint}
          </Text>

          {uid ? (
            <Button
              testID="verify-email-resend"
              label={resendButtonLabel(resendState)}
              variant="secondary"
              size="md"
              leftIcon={phase === 'sent' && cooldown > 0 ? Check : Send}
              loading={phase === 'sending'}
              disabled={isResendDisabled(resendState)}
              onPress={handleResend}
              full
              style={{ marginTop: 12 }}
            />
          ) : null}

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
  storeNote: { fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 10 },
  hint: { fontSize: 12.5, textAlign: 'center', marginTop: 18 },
})
