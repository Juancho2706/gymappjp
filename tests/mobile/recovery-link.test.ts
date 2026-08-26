import { describe, expect, it } from 'vitest'
import { parseRecoveryLink, recoveryLinkFromParams } from '../../apps/mobile/lib/recovery-link'

/**
 * Lectura del enlace de recuperación en RN (W4.2 de `docs/specs/flujo-coach-nuevo`).
 *
 * La pantalla (`app/(auth)/reset-password.tsx`) no se puede montar en la suite (moti +
 * expo-router + lucide-react-native), pero acá vive el riesgo real: de esta lectura depende que
 * el formulario de contraseña nueva se pinte o no. Un falso positivo (leer «hay token» donde no
 * lo hay) devuelve el agujero que W4.2 vino a tapar: con una sesión de coach viva,
 * `updateUser({ password })` cambiaría su propia clave sin pedir la anterior.
 */

describe('parseRecoveryLink — flujo implícito (reset pedido DESDE la app)', () => {
  it('lee el par access/refresh del fragmento de `eva://reset-password`', () => {
    const url =
      'eva://reset-password#access_token=eyJhbGciOi.abc&expires_at=1756200000&refresh_token=rt_9f2&token_type=bearer&type=recovery'
    expect(parseRecoveryLink(url)).toEqual({
      kind: 'tokens',
      accessToken: 'eyJhbGciOi.abc',
      refreshToken: 'rt_9f2',
    })
  })

  it('también lo lee en la URL de desarrollo (`exp://…/--/reset-password#…`)', () => {
    const url =
      'exp://192.168.0.20:8081/--/reset-password#access_token=at_1&refresh_token=rt_1&type=recovery'
    expect(parseRecoveryLink(url)).toEqual({
      kind: 'tokens',
      accessToken: 'at_1',
      refreshToken: 'rt_1',
    })
  })

  it('un fragmento truncado (sin refresh_token) NO habilita el formulario', () => {
    expect(parseRecoveryLink('eva://reset-password#access_token=at_1&type=recovery')).toEqual({
      kind: 'error',
      reason: 'invalid',
    })
  })
})

describe('parseRecoveryLink — App Link con token_hash (reset pedido desde la web)', () => {
  it('lee el token_hash de la query en los cuatro hosts reclamados', () => {
    for (const host of ['https://eva-app.cl', 'https://www.eva-app.cl']) {
      expect(parseRecoveryLink(`${host}/reset-password?token_hash=pkce_a1b2&type=recovery`)).toEqual({
        kind: 'token_hash',
        tokenHash: 'pkce_a1b2',
      })
    }
  })

  it('acepta el token_hash sin `type` (esta pantalla solo canjea recovery)', () => {
    expect(parseRecoveryLink('https://eva-app.cl/reset-password?token_hash=pkce_a1b2')).toEqual({
      kind: 'token_hash',
      tokenHash: 'pkce_a1b2',
    })
  })

  it('lee el `code` del canje PKCE', () => {
    expect(parseRecoveryLink('eva://reset-password?code=34e770dd-9ff9-416c')).toEqual({
      kind: 'code',
      code: '34e770dd-9ff9-416c',
    })
  })
})

describe('parseRecoveryLink — enlaces que NO deben pintar el formulario', () => {
  it('un enlace vencido o ya usado se distingue del resto', () => {
    const url =
      'eva://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    expect(parseRecoveryLink(url)).toEqual({ kind: 'error', reason: 'expired' })
  })

  it('el error también llega por query (canje PKCE fallido)', () => {
    expect(
      parseRecoveryLink('https://eva-app.cl/reset-password?error=server_error&error_code=unexpected_failure'),
    ).toEqual({ kind: 'error', reason: 'invalid' })
  })

  it('un token que NO es de recovery se rechaza aunque traiga sesión completa', () => {
    for (const type of ['magiclink', 'signup', 'invite', 'email_change']) {
      expect(
        parseRecoveryLink(`eva://reset-password#access_token=at_1&refresh_token=rt_1&type=${type}`),
      ).toEqual({ kind: 'error', reason: 'invalid' })
    }
  })

  it('sin token no hay nada que canjear (y «hay sesión» no cuenta como token)', () => {
    expect(parseRecoveryLink('eva://reset-password')).toEqual({ kind: 'none' })
    expect(parseRecoveryLink('https://eva-app.cl/reset-password?utm_source=mail')).toEqual({ kind: 'none' })
    expect(parseRecoveryLink(null)).toEqual({ kind: 'none' })
    expect(parseRecoveryLink(undefined)).toEqual({ kind: 'none' })
    expect(parseRecoveryLink('   ')).toEqual({ kind: 'none' })
  })

  it('no lanza con fragmentos que no son pares clave=valor', () => {
    expect(parseRecoveryLink('eva://reset-password#/otra/cosa')).toEqual({ kind: 'none' })
    expect(parseRecoveryLink('eva://reset-password?#')).toEqual({ kind: 'none' })
  })
})

describe('recoveryLinkFromParams — lo que el router ya parseó', () => {
  it('lee el token_hash que llegó como param de ruta', () => {
    expect(recoveryLinkFromParams({ token_hash: 'pkce_a1b2', type: 'recovery' })).toEqual({
      kind: 'token_hash',
      tokenHash: 'pkce_a1b2',
    })
  })

  it('toma el primer valor cuando el router entrega arrays', () => {
    expect(recoveryLinkFromParams({ code: ['abc', 'def'] })).toEqual({ kind: 'code', code: 'abc' })
  })

  it('params vacíos o ajenos = nada que canjear', () => {
    expect(recoveryLinkFromParams({})).toEqual({ kind: 'none' })
    expect(recoveryLinkFromParams(null)).toEqual({ kind: 'none' })
    expect(recoveryLinkFromParams({ token_hash: '', coach_slug: 'ana-fit' })).toEqual({ kind: 'none' })
  })

  it('un enlace vencido reportado por params conserva su motivo', () => {
    expect(recoveryLinkFromParams({ error: 'access_denied', error_code: 'otp_expired' })).toEqual({
      kind: 'error',
      reason: 'expired',
    })
  })
})
