import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const COACH_ID = '11111111-1111-4111-8111-111111111111'

/**
 * FCN W3.11 — la señal del banner de verificación blanda.
 *
 * Lo que se pinnea es DE DÓNDE sale: `coaches.email_verified_at`. Si alguien la cambia por
 * `auth.users.email_confirmed_at`, bajo D1 = A nace seteada para todos y el banner no se pintaría
 * nunca (regla 11 del SPEC) — la tarea quedaría escrita y muerta.
 *
 * `React.cache` memoiza por request: cada caso estrena su propio módulo para no comerse la caché
 * del anterior.
 */
async function readFresh(coachId: string): Promise<boolean> {
    vi.resetModules()
    const mod = await import('./email-verification.queries')
    return mod.getCoachEmailVerified(coachId)
}

function supabaseReturning(result: { data?: unknown; error?: { message: string } }) {
    const maybeSingle = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClientMock.mockResolvedValue({ from })
    return { from, select }
}

describe('getCoachEmailVerified (W3.11)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lee `coaches.email_verified_at` — con valor, verificado (sin banner)', async () => {
        const { from, select } = supabaseReturning({ data: { email_verified_at: '2026-08-26T09:00:00.000Z' } })

        await expect(readFresh(COACH_ID)).resolves.toBe(true)
        expect(from).toHaveBeenCalledWith('coaches')
        expect(select).toHaveBeenCalledWith('email_verified_at')
    })

    it('columna en NULL ⇒ nadie probó la casilla: el banner se pinta', async () => {
        supabaseReturning({ data: { email_verified_at: null } })

        await expect(readFresh(COACH_ID)).resolves.toBe(false)
    })

    // Fail-closed hacia el SILENCIO: mostrarle el aviso a todo el padrón por un hipo de la DB es
    // peor que perderse el aviso — el banner informa, no bloquea.
    it('si la lectura falla se responde «verificado» y el banner se calla', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        supabaseReturning({ error: { message: 'permission denied for column email_verified_at' } })

        await expect(readFresh(COACH_ID)).resolves.toBe(true)
        expect(warn).toHaveBeenCalled()
    })

    it('coach sin fila: no se pinta un aviso que nadie puede resolver', async () => {
        supabaseReturning({ data: null })

        await expect(readFresh(COACH_ID)).resolves.toBe(false)
    })
})
