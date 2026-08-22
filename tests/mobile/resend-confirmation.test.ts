import { describe, expect, it } from 'vitest'
import {
  formatResendWait,
  isResendDisabled,
  resendButtonLabel,
  resendHint,
  resendStateFromRateLimit,
  RESEND_COOLDOWN_SECONDS,
  RESEND_DAILY_CAP_MIN_SECONDS,
  tickCooldown,
  type ResendUiState,
} from '../../apps/mobile/lib/resend-confirmation'

/**
 * Boton "Reenviar correo" de `(auth)/verify-email` (W4 del embudo Free→Pro).
 *
 * La pantalla no se puede montar en la suite (moti + expo-router + lucide-react-native), asi que se
 * pinea la maquina de estados, que es donde vive el riesgo real: un boton que sigue habilitado
 * durante el cooldown manda al coach directo al 429 del server.
 */

const IDLE: ResendUiState = { phase: 'idle', cooldown: 0 }

describe('boton de reenvio', () => {
  it('arranca disponible y con el copy que pide el spam', () => {
    expect(resendButtonLabel(IDLE)).toBe('Reenviar correo')
    expect(isResendDisabled(IDLE)).toBe(false)
    expect(resendHint(IDLE)).toBe('¿No te llegó? Revisa spam o reenvíalo.')
  })

  it('mientras vuela la request queda apagado', () => {
    const sending: ResendUiState = { phase: 'sending', cooldown: 0 }
    expect(isResendDisabled(sending)).toBe(true)
    expect(resendButtonLabel(sending)).toBe('Reenviando…')
  })

  it('recien enviado: cuenta atras visible, apagado, y un copy que no promete entrega', () => {
    const sent: ResendUiState = { phase: 'sent', cooldown: RESEND_COOLDOWN_SECONDS }
    expect(resendButtonLabel(sent)).toBe('Reenviar en 60s')
    expect(isResendDisabled(sent)).toBe(true)
    expect(resendHint(sent)).toBe('Listo, te lo reenviamos. Revisa también la carpeta de spam.')
  })

  it('el cooldown manda por encima de la fase: un 429 tambien apaga el boton', () => {
    const throttled: ResendUiState = { phase: 'idle', cooldown: 43 }
    expect(resendButtonLabel(throttled)).toBe('Reenviar en 43s')
    expect(isResendDisabled(throttled)).toBe(true)
  })

  it('agotado el cooldown vuelve a estar disponible y ofrece repetir', () => {
    const ready: ResendUiState = { phase: 'sent', cooldown: 0 }
    expect(resendButtonLabel(ready)).toBe('Reenviar de nuevo')
    expect(isResendDisabled(ready)).toBe(false)
  })

  it('un fallo real deja el boton usable y lo dice sin alarmismo', () => {
    const failed: ResendUiState = { phase: 'error', cooldown: 0 }
    expect(isResendDisabled(failed)).toBe(false)
    expect(resendHint(failed)).toBe('No pudimos reenviarlo ahora. Intenta de nuevo en un minuto.')
  })

  it('el reloj baja de a uno y se planta en 0 (nunca negativo)', () => {
    expect(tickCooldown(2)).toBe(1)
    expect(tickCooldown(1)).toBe(0)
    expect(tickCooldown(0)).toBe(0)
    expect(tickCooldown(-5)).toBe(0)
  })

  it('el cooldown de la app es el mismo que aplica el server por uid', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60)
  })
})

describe('429 del server: retryAfter manda', () => {
  it('un cooldown corto se respeta tal cual y NO se pinta como tope diario', () => {
    const state = resendStateFromRateLimit(45)
    expect(state).toEqual({ phase: 'idle', cooldown: 45, cappedToday: false })
    expect(resendButtonLabel(state)).toBe('Reenviar en 45s')
    expect(isResendDisabled(state)).toBe(true)
    // Sigue siendo el copy neutro: esperar 45 s no es haber agotado el dia.
    expect(resendHint(state)).toBe('¿No te llegó? Revisa spam o reenvíalo.')
  })

  it('sin `retryAfter` (server viejo o proxy que come el header) cae a los 60 s de siempre', () => {
    expect(resendStateFromRateLimit(undefined)).toEqual({
      phase: 'idle',
      cooldown: 60,
      cappedToday: false,
    })
    for (const basura of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resendStateFromRateLimit(basura).cooldown).toBe(RESEND_COOLDOWN_SECONDS)
    }
  })

  it('el tope diario (horas) no se disfraza de cooldown: otro copy y el boton sigue apagado', () => {
    const state = resendStateFromRateLimit(4 * 60 * 60)

    expect(state).toEqual({ phase: 'idle', cooldown: 4 * 60 * 60, cappedToday: true })
    expect(resendButtonLabel(state)).toBe('Reenviar en 4 h')
    expect(isResendDisabled(state)).toBe(true)
    expect(resendHint(state)).toBe(
      'Ya reenviamos varias veces hoy. Revisa spam o escríbenos a soporte@eva-app.cl'
    )
  })

  it('un 429 JAMAS deja la pantalla en rojo: la fase queda `idle`, no `error`', () => {
    expect(resendStateFromRateLimit(30).phase).toBe('idle')
    expect(resendStateFromRateLimit(9 * 60 * 60).phase).toBe('idle')
  })

  it('la frontera entre los dos frenos esta en 5 min', () => {
    expect(resendStateFromRateLimit(RESEND_DAILY_CAP_MIN_SECONDS - 1).cappedToday).toBe(false)
    expect(resendStateFromRateLimit(RESEND_DAILY_CAP_MIN_SECONDS).cappedToday).toBe(true)
  })

  it('un `retryAfter` absurdo se recorta a la ventana real del server (24 h)', () => {
    expect(resendStateFromRateLimit(999_999).cooldown).toBe(24 * 60 * 60)
  })

  it('el fraccionario del server se redondea HACIA ARRIBA (nunca pedir de menos)', () => {
    expect(resendStateFromRateLimit(44.2).cooldown).toBe(45)
  })

  it('agotado el tope, el copy vuelve al neutro (no queda pegado)', () => {
    expect(resendHint({ phase: 'idle', cooldown: 0, cappedToday: true })).toBe(
      '¿No te llegó? Revisa spam o reenvíalo.'
    )
    expect(isResendDisabled({ phase: 'idle', cooldown: 0, cappedToday: true })).toBe(false)
  })
})

describe('formatResendWait', () => {
  it('segundos exactos mientras la espera es corta', () => {
    expect(formatResendWait(1)).toBe('1s')
    expect(formatResendWait(60)).toBe('60s')
    expect(formatResendWait(119)).toBe('119s')
  })

  it('minutos redondeados hacia arriba en la franja media', () => {
    expect(formatResendWait(120)).toBe('2 min')
    expect(formatResendWait(121)).toBe('3 min')
    expect(formatResendWait(3599)).toBe('60 min')
  })

  it('horas cuando el freno es el tope diario', () => {
    expect(formatResendWait(3600)).toBe('1 h')
    expect(formatResendWait(3601)).toBe('2 h')
    expect(formatResendWait(24 * 60 * 60)).toBe('24 h')
  })
})
