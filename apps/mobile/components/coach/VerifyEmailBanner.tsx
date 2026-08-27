import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { cssInterop } from 'nativewind'
import { MailWarning } from 'lucide-react-native'
import { apiFetch, ApiError } from '../../lib/api'
import { getCoachEmailVerification } from '../../lib/coach'

/**
 * «Verificación blanda» de D1 = A, en la APP (FCN W3.11, puerta RN). Port del banner de la web
 * (`apps/web/src/app/coach/dashboard/_components/banners/VerifyEmailBanner.tsx`): mismo copy, mismos
 * tres estados y las mismas tres reglas.
 *
 * D1 = A promete «el correo sigue saliendo, no bloquea». Con `email_confirm: true` y un dominio mal
 * tipeado (la cohorte ya tiene un `gmail.` + `con`) la cuenta queda VIVA e IRRECUPERABLE: sin correo
 * no hay reset de clave. Este banner es lo único que se lo dice al coach —y en el teléfono, que es
 * donde muchos viven— y le da el botón para arreglarlo.
 *
 * TRES REGLAS que no se tocan:
 * · Se pinta mientras `coaches.email_verified_at IS NULL` — NUNCA contra
 *   `auth.users.email_confirmed_at`, que bajo D1 = A nace seteada para todos (regla 11 del SPEC).
 * · NO BLOQUEA NADA: es un aviso arriba del panel, sin modal, sin gate y sin cortar ninguna acción.
 * · CERO CTA DE PAGO. El único botón manda un correo. (Regla de tiendas: en iOS no puede haber
 *   ningún camino a comprar; acá directamente no hay ninguno en ninguna plataforma.)
 *
 * FAIL-CLOSED AL SILENCIO: si la lectura de la señal falla (sin red, RLS, columna fuera del schema
 * cache) `getCoachEmailVerification()` devuelve `unknown` y el banner NO se monta. Decirle «verifica
 * tu correo» a quien ya lo verificó es peor que callarse con quien no.
 *
 * Colores: tokens de estado `warning-*` (NO white-label — la marca del coach no pinta un aviso). El
 * icono de lucide toma su color por `className` gracias al `cssInterop` de abajo, así que el flip de
 * dark mode se resuelve en runtime igual que en el resto del panel.
 */

cssInterop(MailWarning, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/** Fallback suave: un 404 de un server viejo o un timeout jamás se le pone crudo al coach. */
const SOFT_ERROR = 'No pudimos reenviarlo ahora. Intenta de nuevo en un minuto.'

type Phase = 'idle' | 'sending' | 'sent'

export function VerifyEmailBanner() {
  const [needed, setNeeded] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  // El envío en vuelo sobrevive a un cambio de foco: sin esto, volver al tab mientras el POST corre
  // dispararía otra lectura y el estado podría rebotar a `idle`.
  const sendingRef = useRef(false)

  /**
   * Se relee en cada foco del panel. El coach verifica su correo FUERA de la app (toca el link en
   * su casilla y vuelve), así que una lectura única al montar dejaría el aviso pegado hasta el
   * próximo arranque. Es una fila por su propio id: barata.
   */
  useFocusEffect(
    useCallback(() => {
      let alive = true
      const read = () => {
        void getCoachEmailVerification().then((status) => {
          if (!alive) return
          if (status === 'verified') {
            setNeeded(false)
            setPhase('idle')
            return
          }
          if (status === 'unverified') setNeeded(true)
          // `unknown` conserva lo que ya había: un refresco fallido no puede ni encender ni apagar.
        })
      }
      read()
      // El camino real de verificación pasa por el NAVEGADOR (el link del correo abre la web): al
      // volver a la app eso es un cambio de AppState, no un evento de foco del router, así que sin
      // esta suscripción el aviso quedaba pegado hasta el próximo arranque (QA owner 26-08).
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') read()
      })
      return () => {
        alive = false
        appState.remove()
      }
    }, []),
  )

  const resend = useCallback(() => {
    if (sendingRef.current) return
    sendingRef.current = true
    setError(null)
    setPhase('sending')
    void apiFetch<{ ok: true }>('/api/mobile/auth/resend-verification', {
      method: 'POST',
      authenticated: true,
    })
      .then(() => {
        setPhase('sent')
      })
      .catch((err: unknown) => {
        setPhase('idle')
        // El correo se verificó en otra pantalla: el banner ya no tiene nada que decir.
        if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') {
          setNeeded(false)
          return
        }
        // El 429 trae un mensaje redactado por el servidor («espera un momento»): ése sí se muestra.
        setError(err instanceof ApiError && err.status === 429 ? err.message : SOFT_ERROR)
      })
      .finally(() => {
        sendingRef.current = false
      })
  }, [])

  if (!needed) return null

  return (
    <View
      testID="verify-email-banner"
      accessibilityRole="alert"
      className="rounded-card border border-warning-500/30 bg-warning-100 dark:bg-warning-100/[0.16]"
      style={{ gap: 10, padding: 13, marginBottom: 12 }}
    >
      <View className="flex-row items-start" style={{ gap: 9 }}>
        <MailWarning size={17} strokeWidth={2} className="text-warning-700" style={{ marginTop: 1 }} />
        <Text
          className="font-sans text-warning-700"
          style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 }}
        >
          Verifica tu correo para poder recuperar tu clave.
        </Text>
      </View>

      {phase === 'sent' ? (
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans-bold text-warning-700"
          style={{ fontSize: 12, lineHeight: 17, opacity: 0.9 }}
        >
          Listo, te lo reenviamos. Revisa tu bandeja (y el spam).
        </Text>
      ) : (
        <Pressable
          testID="verify-email-resend"
          accessibilityRole="button"
          accessibilityLabel="Reenviar correo"
          accessibilityState={{ disabled: phase === 'sending', busy: phase === 'sending' }}
          disabled={phase === 'sending'}
          onPress={resend}
          className="flex-row items-center self-start rounded-control border border-warning-500/40"
          style={{ gap: 7, minHeight: 40, paddingHorizontal: 13, opacity: phase === 'sending' ? 0.6 : 1 }}
        >
          {phase === 'sending' ? <ActivityIndicator size="small" /> : null}
          <Text className="font-sans-bold text-warning-700" style={{ fontSize: 12.5 }}>
            Reenviar correo
          </Text>
        </Pressable>
      )}

      {error == null ? null : (
        <Text
          accessibilityLiveRegion="assertive"
          className="font-sans text-warning-700"
          style={{ fontSize: 12, lineHeight: 17, opacity: 0.9 }}
        >
          {error}
        </Text>
      )}
    </View>
  )
}
