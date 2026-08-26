import { describe, expect, it } from 'vitest'
import {
  postRegisterRoute,
  verifyEmailHref,
  type RegisterCoachStatus,
} from '../../apps/mobile/lib/register-flow'

/**
 * Decisión post-alta del registro coach free en RN (W3.2b de `docs/specs/flujo-coach-nuevo`).
 *
 * La pantalla (`app/(auth)/register.tsx`) no se puede montar en la suite (moti + expo-router +
 * lucide-react-native), pero acá vive el riesgo real: el campo `status` es NUEVO y un binario con
 * OTA puede correr contra un server que no lo manda. Si esa lectura se equivoca hacia `active`, el
 * coach termina en un `signInWithPassword` que GoTrue rechaza con «Email not confirmed»; si se
 * equivoca hacia `verify_email` con la cuenta activa, ve una pantalla de más y sale con el botón.
 */

describe('postRegisterRoute', () => {
  it('con status active entra directo al panel (alta sin muro de correo)', () => {
    expect(postRegisterRoute('active')).toBe('panel')
  })

  it('con pending_email va a la pantalla de verificación', () => {
    expect(postRegisterRoute('pending_email')).toBe('verify_email')
  })

  it('sin status (server anterior a W3.2) va a la pantalla de verificación', () => {
    expect(postRegisterRoute(undefined)).toBe('verify_email')
    expect(postRegisterRoute(null)).toBe('verify_email')
  })

  it('un valor basura NO se lee como activo: fail-safe hacia la pantalla', () => {
    for (const basura of ['ACTIVE', 'activo', 'active ', '', 'true', '1']) {
      expect(postRegisterRoute(basura)).toBe('verify_email')
    }
  })

  it('cubre los dos estados del contrato del server', () => {
    const estados: RegisterCoachStatus[] = ['active', 'pending_email']
    expect(estados.map(postRegisterRoute)).toEqual(['panel', 'verify_email'])
  })
})

describe('verifyEmailHref', () => {
  it('lleva el email escapado y el uid cuando el server lo mandó', () => {
    expect(verifyEmailHref({ email: 'coach+eva@example.com', uid: 'abc-123' })).toBe(
      '/(auth)/verify-email?email=coach%2Beva%40example.com&uid=abc-123',
    )
  })

  it('sin uid (server anterior a W4) no inventa el parámetro: la pantalla degrada sola', () => {
    expect(verifyEmailHref({ email: 'coach@example.com' })).toBe(
      '/(auth)/verify-email?email=coach%40example.com',
    )
    expect(verifyEmailHref({ email: 'coach@example.com', uid: null })).not.toContain('uid=')
    expect(verifyEmailHref({ email: 'coach@example.com', uid: '   ' })).not.toContain('uid=')
  })

  it('marca active=1 solo en el fallback de la cuenta ya activa', () => {
    expect(verifyEmailHref({ email: 'coach@example.com', uid: 'abc', alreadyActive: true })).toBe(
      '/(auth)/verify-email?email=coach%40example.com&uid=abc&active=1',
    )
    expect(verifyEmailHref({ email: 'coach@example.com', uid: 'abc', alreadyActive: false })).not.toContain(
      'active=1',
    )
    expect(verifyEmailHref({ email: 'coach@example.com', uid: 'abc' })).not.toContain('active=1')
  })
})
