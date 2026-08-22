import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    CONFIRMATION_RESEND_AUDIT_ACTION,
    CONFIRMATION_RESEND_DAILY_LIMIT,
    evaluateResendThrottle,
    readConfirmationResendTimestamps,
    recordConfirmationResend,
    resolveCoachConfirmationTarget,
} from './resend-confirmation'

/**
 * Guards compartidos del reenvío de confirmación (W4 del embudo Free→Pro). Lo que se pinnea acá es
 * la parte que no puede aflojarse en ninguna de las dos superficies: de dónde sale el email
 * destino, quién califica para un reenvío, y cuánto se puede insistir.
 */

const UID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-08-22T12:00:00.000Z')

function ago(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString()
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('evaluateResendThrottle', () => {
    it('sin envíos previos deja pasar', () => {
        expect(evaluateResendThrottle({ sentAtIso: [], now: NOW })).toEqual({ allowed: true })
    })

    it('un envío hace 10 s cae en el cooldown de 60 s con el resto exacto', () => {
        const decision = evaluateResendThrottle({ sentAtIso: [ago(10_000)], now: NOW })
        expect(decision).toEqual({ allowed: false, reason: 'cooldown', retryAfterSeconds: 50 })
    })

    it('pasados los 60 s vuelve a dejar pasar', () => {
        expect(evaluateResendThrottle({ sentAtIso: [ago(61_000)], now: NOW })).toEqual({ allowed: true })
    })

    it(`el ${CONFIRMATION_RESEND_DAILY_LIMIT + 1}.º del día se frena aunque el cooldown esté cumplido`, () => {
        const stamps = [ago(2 * HOUR), ago(5 * HOUR), ago(9 * HOUR), ago(14 * HOUR), ago(20 * HOUR)]
        expect(stamps).toHaveLength(CONFIRMATION_RESEND_DAILY_LIMIT)

        const decision = evaluateResendThrottle({ sentAtIso: stamps, now: NOW })
        expect(decision.allowed).toBe(false)
        expect(decision).toMatchObject({ reason: 'daily_cap' })
        // El más viejo de los 5 sale de la ventana en 4 h ⇒ ese es el retryAfter honesto.
        expect((decision as { retryAfterSeconds: number }).retryAfterSeconds).toBe(4 * 60 * 60)
    })

    it('los envíos fuera de la ventana de 24 h no cuentan para el tope', () => {
        const stamps = [ago(25 * HOUR), ago(26 * HOUR), ago(27 * HOUR), ago(28 * HOUR), ago(29 * HOUR)]
        expect(evaluateResendThrottle({ sentAtIso: stamps, now: NOW })).toEqual({ allowed: true })
    })

    it('timestamps basura o del futuro se descartan en vez de romper la decisión', () => {
        const decision = evaluateResendThrottle({
            sentAtIso: ['no-es-fecha', new Date(NOW.getTime() + HOUR).toISOString()],
            now: NOW,
        })
        expect(decision).toEqual({ allowed: true })
    })

    it('el orden de llegada del ledger no importa: manda el más reciente', () => {
        const decision = evaluateResendThrottle({ sentAtIso: [ago(10 * HOUR), ago(5_000)], now: NOW })
        expect(decision).toMatchObject({ reason: 'cooldown', retryAfterSeconds: 55 })
    })
})

describe('resolveCoachConfirmationTarget', () => {
    type Coach = { full_name: string | null; subscription_status: string } | null
    type AuthUser = { id: string; email: string | null; email_confirmed_at?: string | null }
    const state = {
        authUser: null as AuthUser | null,
        coach: null as Coach,
    }

    // `from` es spy: varios casos tienen que probar que la consulta a `coaches` NI SIQUIERA ocurre.
    const fromSpy = vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach }) }) }),
    }))

    const admin = {
        auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: state.authUser } })) } },
        from: fromSpy,
    } as unknown as SupabaseClient<Database>

    beforeEach(() => {
        fromSpy.mockClear()
        state.authUser = { id: UID, email: 'coach@example.com' }
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'pending_email' }
    })

    it('coach pending_email: devuelve el email de auth.users, no otro', async () => {
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({
            status: 'ok',
            email: 'coach@example.com',
            coachName: 'Josefa Díaz',
        })
    })

    it('sin usuario de auth (uid inventado) ⇒ not_found y ni se mira `coaches`', async () => {
        state.authUser = null
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({ status: 'not_found' })
        expect(fromSpy).not.toHaveBeenCalled()
    })

    it('usuario de auth sin email ⇒ not_found sin tocar `coaches` (no hay destino posible)', async () => {
        state.authUser = { id: UID, email: null }
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({ status: 'not_found' })
        expect(fromSpy).not.toHaveBeenCalled()
    })

    it('`email_confirmed_at` seteado ⇒ already_confirmed AUNQUE `coaches` diga pending_email', async () => {
        // Defensa en profundidad: la fila del coach puede quedar regresada (rollback a medias,
        // backfill torcido, edición manual). GoTrue manda; si ya confirmó, no se emite otro link.
        state.authUser = { id: UID, email: 'coach@example.com', email_confirmed_at: '2026-08-22T10:00:00Z' }
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'pending_email' }

        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({
            status: 'already_confirmed',
        })
        expect(fromSpy).not.toHaveBeenCalled()
    })

    it('`email_confirmed_at` nulo es el caso normal del coach pendiente: deja pasar', async () => {
        state.authUser = { id: UID, email: 'coach@example.com', email_confirmed_at: null }
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toMatchObject({ status: 'ok' })
    })

    it('usuario de auth sin fila `coaches` (p.ej. un alumno) ⇒ not_found', async () => {
        state.coach = null
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({ status: 'not_found' })
    })

    it('coach ya activo ⇒ already_confirmed (no hay nada que reenviar)', async () => {
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'active' }
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toEqual({ status: 'already_confirmed' })
    })

    it('`full_name` nulo no rompe: el nombre cae a cadena vacía', async () => {
        state.coach = { full_name: null, subscription_status: 'pending_email' }
        await expect(resolveCoachConfirmationTarget(admin, UID)).resolves.toMatchObject({ coachName: '' })
    })
})

describe('ledger de `admin_audit_logs`', () => {
    it('lee los timestamps de la ventana filtrando por acción y uid', async () => {
        const calls: Record<string, unknown> = {}
        const admin = {
            from: (table: string) => {
                calls.table = table
                const q = {
                    eq: (col: string, val: string) => {
                        calls[col] = val
                        return q
                    },
                    gte: (_col: string, val: string) => {
                        calls.since = val
                        return q
                    },
                    order: () => q,
                    limit: async (n: number) => {
                        calls.limit = n
                        return { data: [{ created_at: ago(HOUR) }], error: null }
                    },
                }
                return { select: () => q }
            },
        } as unknown as SupabaseClient<Database>

        const read = await readConfirmationResendTimestamps(admin, UID, NOW)

        expect(read).toEqual({ ok: true, sentAtIso: [ago(HOUR)] })
        expect(calls.table).toBe('admin_audit_logs')
        expect(calls.action).toBe(CONFIRMATION_RESEND_AUDIT_ACTION)
        expect(calls.target_id).toBe(UID)
        expect(calls.since).toBe(ago(24 * HOUR))
        expect(calls.limit).toBe(CONFIRMATION_RESEND_DAILY_LIMIT + 1)
    })

    it('error de lectura se propaga como `ok: false` (el caller decide, y decide cerrar)', async () => {
        const admin = {
            from: () => ({
                select: () => {
                    const q = {
                        eq: () => q,
                        gte: () => q,
                        order: () => q,
                        limit: async () => ({ data: null, error: { message: 'boom' } }),
                    }
                    return q
                },
            }),
        } as unknown as SupabaseClient<Database>

        await expect(readConfirmationResendTimestamps(admin, UID, NOW)).resolves.toEqual({
            ok: false,
            error: 'boom',
        })
    })

    it('la fila escrita lleva la superficie y NINGÚN dato personal', async () => {
        const rows: unknown[] = []
        const admin = {
            from: () => ({
                insert: async (row: unknown) => {
                    rows.push(row)
                    return { error: null }
                },
            }),
        } as unknown as SupabaseClient<Database>

        await recordConfirmationResend(admin, UID, 'mobile')

        expect(rows).toEqual([
            {
                admin_email: 'system',
                action: CONFIRMATION_RESEND_AUDIT_ACTION,
                target_table: 'coaches',
                target_id: UID,
                payload: { surface: 'mobile' },
            },
        ])
        expect(JSON.stringify(rows)).not.toContain('@')
    })

    it('un fallo de auditoría se loguea sin uid y NO lanza (el correo ya salió)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const admin = {
            from: () => ({ insert: async () => ({ error: { message: 'rls' } }) }),
        } as unknown as SupabaseClient<Database>

        await expect(recordConfirmationResend(admin, UID, 'web')).resolves.toBeUndefined()

        expect(spy).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(spy.mock.calls[0])).not.toContain(UID)
        spy.mockRestore()
    })
})
