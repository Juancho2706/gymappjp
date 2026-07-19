import { describe, it, expect } from 'vitest'
import {
  ALLOWED_E2E_SLUGS,
  ALLOWED_E2E_EMAILS,
  ALLOWED_E2E_CLIENT_IDS,
  assertAllowedE2eEmail,
  assertAllowedE2eSlug,
  assertAllowedE2eClientId,
  assertE2eAccounts,
} from './e2e-accounts'

/**
 * Guard puro de cuentas E2E (belt-and-suspenders anti-fuga al workspace del CEO).
 * Verifica que el fixture pool PROPIO (e2e-pool-owner/member + alumnos) pasa y que
 * cualquier identificador de josefit lanza — incluido el camino POOL nuevo.
 */

// Ids v4 FIJOS del fixture (scripts/e2e/seed-pool-fixture.mjs).
const POOL_ALUMNO_UNO = 'e2e0a004-0000-4000-8000-000000000004'
const POOL_ALUMNO_DOS = 'e2e0a005-0000-4000-8000-000000000005'

describe('guard E2E — allowlist del fixture pool propio', () => {
  it('acepta los correos del fixture pool', () => {
    for (const email of [
      'e2e-pool-owner@evatest.cl',
      'e2e-pool-member@evatest.cl',
      'e2e-pool-uno@evatest.cl',
      'e2e-pool-dos@evatest.cl',
    ]) {
      expect(ALLOWED_E2E_EMAILS.has(email)).toBe(true)
      expect(() => assertAllowedE2eEmail(email)).not.toThrow()
    }
  })

  it('acepta cualquier correo @evatest.cl (dominio propio)', () => {
    expect(() => assertAllowedE2eEmail('quien-sea@evatest.cl')).not.toThrow()
  })

  it('acepta los slugs del fixture pool', () => {
    for (const slug of ['e2e-pool-owner', 'e2e-pool-member', 'e2e-pool-movida']) {
      expect(ALLOWED_E2E_SLUGS.has(slug)).toBe(true)
      expect(() => assertAllowedE2eSlug(slug)).not.toThrow()
    }
  })

  it('acepta los clientIds del fixture pool', () => {
    for (const id of [POOL_ALUMNO_UNO, POOL_ALUMNO_DOS]) {
      expect(ALLOWED_E2E_CLIENT_IDS.has(id)).toBe(true)
      expect(() => assertAllowedE2eClientId(id)).not.toThrow()
    }
  })

  it('un valor vacio NO lanza (credencial no seteada => el spec hace skip)', () => {
    expect(() => assertAllowedE2eEmail('')).not.toThrow()
    expect(() => assertAllowedE2eSlug('')).not.toThrow()
    expect(() => assertAllowedE2eClientId('')).not.toThrow()
  })
})

describe('guard E2E — bloquea el workspace del CEO (josefit) tambien en el camino POOL', () => {
  it('lanza si E2E_POOL_COACH_EMAIL apunta a josefit', () => {
    expect(() => assertAllowedE2eEmail('josefit@example.com', 'POOL')).toThrow(/josefit/i)
  })

  it('lanza para slugs/ids del CEO', () => {
    expect(() => assertAllowedE2eSlug('josefit-designqa')).toThrow(/josefit/i)
    expect(() => assertAllowedE2eClientId('cat-rojas-id')).toThrow(/cat-rojas|PROHIBIDO/i)
  })

  it('rechaza un correo que no es @evatest.cl ni nominal', () => {
    expect(() => assertAllowedE2eEmail('random@gmail.com')).toThrow(/no permitido/i)
  })

  it('assertE2eAccounts valida el bundle del camino POOL de un tiro', () => {
    expect(() =>
      assertE2eAccounts({
        coachEmail: 'e2e-pool-owner@evatest.cl',
        studentEmail: 'e2e-pool-uno@evatest.cl',
        coachSlug: 'e2e-pool-movida',
        clientId: POOL_ALUMNO_UNO,
      }),
    ).not.toThrow()

    expect(() => assertE2eAccounts({ coachEmail: 'josefit@x.cl' })).toThrow(/josefit/i)
  })
})
