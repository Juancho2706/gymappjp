import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    assertPlatformEmailAvailable,
    isEmailTakenReason,
    normalizePlatformEmail,
    sanitizePlatformEmail,
    PLATFORM_EMAIL_TAKEN_ES,
    EMAIL_TAKEN_CLIENT_CREATE_ES,
} from './platform-email'

/**
 * W2.12 (flujo-coach-nuevo, callejón 16): el alta del alumno con correo tomado terminaba en
 * «escríbenos a soporte y lo resolvemos contigo», en el minuto 6 de una sesión de celular.
 */
describe('EMAIL_TAKEN_CLIENT_CREATE_ES — copy con salida real y sin oráculo', () => {
    it('la primera salida es accionable en el momento, con ejemplo explícito', () => {
        expect(EMAIL_TAKEN_CLIENT_CREATE_ES).toContain('Pídele otro correo')
        expect(EMAIL_TAKEN_CLIENT_CREATE_ES).toContain('ana+eva@gmail.com')
    })

    // (c) del TASKS: las cuatro razones se colapsan a propósito. Nombrar la categoría convertiría
    // el alta en un oráculo de correos ajenos para cualquier coach autenticado.
    it('no revela cuál de las cuatro razones es', () => {
        const lower = EMAIL_TAKEN_CLIENT_CREATE_ES.toLowerCase()
        for (const leak of ['coach', 'entrenador', 'de otro', 'huérfan', 'huerfan', 'alumno de']) {
            expect(lower).not.toContain(leak)
        }
    })

    it('el correo a EVA queda como segundo paso, no como el único', () => {
        const support = EMAIL_TAKEN_CLIENT_CREATE_ES.indexOf('contacto@eva-app.cl')
        const alias = EMAIL_TAKEN_CLIENT_CREATE_ES.indexOf('ana+eva@gmail.com')
        expect(alias).toBeGreaterThan(-1)
        expect(support).toBeGreaterThan(alias)
        expect(EMAIL_TAKEN_CLIENT_CREATE_ES).not.toContain('Escríbenos a soporte')
    })
})

describe('sanitizePlatformEmail', () => {
    it('preserves dots in the local part (Gmail addresses are stored verbatim)', () => {
        expect(sanitizePlatformEmail('jvillegas.dev@gmail.com')).toBe('jvillegas.dev@gmail.com')
        expect(sanitizePlatformEmail('first.middle.last@gmail.com')).toBe('first.middle.last@gmail.com')
    })

    it('preserves +aliases', () => {
        expect(sanitizePlatformEmail('user+tag@gmail.com')).toBe('user+tag@gmail.com')
        expect(sanitizePlatformEmail('user+work@outlook.com')).toBe('user+work@outlook.com')
    })

    it('lowercases and trims surrounding whitespace', () => {
        expect(sanitizePlatformEmail('  Coach@Example.COM  ')).toBe('coach@example.com')
    })
})

describe('normalizePlatformEmail', () => {
    it('strips dots for Gmail (dedup only — never use for storage)', () => {
        expect(normalizePlatformEmail('jvillegas.dev@gmail.com')).toBe('jvillegasdev@gmail.com')
    })

    it('treats googlemail.com as gmail.com', () => {
        expect(normalizePlatformEmail('user@googlemail.com')).toBe('user@gmail.com')
    })

    it('strips +aliases for providers that ignore them', () => {
        expect(normalizePlatformEmail('user+tag@gmail.com')).toBe('user@gmail.com')
        expect(normalizePlatformEmail('user+work@outlook.com')).toBe('user@outlook.com')
    })

    it('keeps dots for non-Gmail providers', () => {
        expect(normalizePlatformEmail('first.last@outlook.com')).toBe('first.last@outlook.com')
    })
})

// F2a (caso Natalia/jotap 2026-08-05): la razón granular viaja server-side para que el alta
// distinga "cuenta existente" (accionable) de dominios vetados, SIN revelar el tipo en el copy.
function fakeAdmin(payload: unknown, error: unknown = null): SupabaseClient<Database> {
    return { rpc: async () => ({ data: payload, error }) } as unknown as SupabaseClient<Database>
}

describe('assertPlatformEmailAvailable — reason estructurado', () => {
    it('correo de una cuenta coach → taken_coach con el mensaje genérico (no revela tipo)', async () => {
        const res = await assertPlatformEmailAvailable(
            fakeAdmin({ exists_in_auth: true, is_coach: true, is_client: false, orphan_client_email: false }),
            'coach@ejemplo.cl'
        )
        expect(res).toEqual({ ok: false, error: PLATFORM_EMAIL_TAKEN_ES, reason: 'taken_coach' })
    })

    it('correo de un alumno existente → taken_client', async () => {
        const res = await assertPlatformEmailAvailable(
            fakeAdmin({ exists_in_auth: true, is_coach: false, is_client: true, orphan_client_email: false }),
            'alumno@ejemplo.cl'
        )
        expect(res).toMatchObject({ ok: false, reason: 'taken_client' })
    })

    it('fila clients huérfana (sin auth user) → taken_orphan', async () => {
        const res = await assertPlatformEmailAvailable(
            fakeAdmin({ exists_in_auth: false, is_coach: false, is_client: true, orphan_client_email: true }),
            'huerfana@ejemplo.cl'
        )
        expect(res).toMatchObject({ ok: false, reason: 'taken_orphan' })
    })

    it('correo libre → ok', async () => {
        const res = await assertPlatformEmailAvailable(
            fakeAdmin({ exists_in_auth: false, is_coach: false, is_client: false, orphan_client_email: false }),
            'libre@ejemplo.cl'
        )
        expect(res).toEqual({ ok: true })
    })

    it('correo desechable → disposable, sin pasar por el RPC', async () => {
        const res = await assertPlatformEmailAvailable(fakeAdmin(null), 'x@mailinator.com')
        expect(res).toMatchObject({ ok: false, reason: 'disposable' })
    })

    it('error del RPC → rpc_error (fail-closed)', async () => {
        const res = await assertPlatformEmailAvailable(fakeAdmin(null, { message: 'boom' }), 'x@ejemplo.cl')
        expect(res).toMatchObject({ ok: false, reason: 'rpc_error' })
    })
})

describe('isEmailTakenReason', () => {
    it('true solo para las variantes taken_*', () => {
        expect(isEmailTakenReason('taken_coach')).toBe(true)
        expect(isEmailTakenReason('taken_client')).toBe(true)
        expect(isEmailTakenReason('taken_orphan')).toBe(true)
        expect(isEmailTakenReason('taken_auth')).toBe(true)
        expect(isEmailTakenReason('disposable')).toBe(false)
        expect(isEmailTakenReason('blocked_domain')).toBe(false)
        expect(isEmailTakenReason('rpc_error')).toBe(false)
        expect(isEmailTakenReason('invalid')).toBe(false)
    })
})
