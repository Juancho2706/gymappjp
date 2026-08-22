import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    ACTIVE_LEDGER_STATUSES,
    CoachEmailLedgerDbError,
    findActiveByCoachAndKeys,
    findByProviderMessageId,
    insertLedgerRow,
    listScheduledByCoach,
    markCancelNotPossible,
    markCancelled,
    updateStatusByProviderMessageId,
} from './coach-email-ledger.repository'

/**
 * Cliente falso con la FORMA de supabase-js (mismo patrón que
 * `coach-food-overrides.repository.test.ts`): cada eslabón devuelve el builder y el resultado se
 * resuelve al final. Sin esta forma, un repository que desengancha un método pasa el test y explota
 * en producción.
 *
 * Lo que se pinnea acá NO es «llama a supabase» sino los PREDICADOS: qué columnas filtra cada
 * función. Un `.eq('status', …)` que se cae en un refactor haría que `cancelCoachEmails` intente
 * cancelar correos ya entregados, y el test tiene que verlo.
 */

type Result = { data: unknown; error: { message: string; code?: string } | null }
type Call = {
    table: string
    op: string
    payload?: unknown
    filters: Array<{ method: string; column: string; value: unknown }>
}

function fakeDb(results: Result[]) {
    const calls: Call[] = []
    let cursor = 0
    const next = (): Result => results[cursor++] ?? { data: null, error: null }

    const makeChain = (call: Call) => {
        const record = (method: string) => (column: string, value: unknown) => {
            call.filters.push({ method, column, value })
            return chain
        }
        const chain: Record<string, unknown> = {
            select: () => chain,
            eq: record('eq'),
            in: record('in'),
            gt: record('gt'),
            order: (column: string, opts: unknown) => {
                call.filters.push({ method: 'order', column, value: opts })
                return chain
            },
            single: () => Promise.resolve(next()),
            maybeSingle: () => Promise.resolve(next()),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(next()).then(resolve, reject),
        }
        return chain
    }

    const start = (table: string, op: string, payload?: unknown) => {
        const call: Call = { table, op, payload, filters: [] }
        calls.push(call)
        return makeChain(call)
    }

    const db = {
        from: (table: string) => ({
            select: () => start(table, 'select'),
            insert: (payload: unknown) => start(table, 'insert', payload),
            update: (payload: unknown) => start(table, 'update', payload),
        }),
    }

    return { db: db as unknown as SupabaseClient<Database>, calls }
}

const ROW = {
    id: 'row-1',
    coach_id: 'coach-1',
    template_key: 'day2_pro',
    trigger: 'drip',
    status: 'scheduled',
    provider_message_id: 'res-1',
    scheduled_at: '2026-08-24T10:00:00.000Z',
    sent_at: null,
    delivered_at: null,
    payload: { to: 'coach@example.com' },
    created_at: '2026-08-22T10:00:00.000Z',
    updated_at: '2026-08-22T10:00:00.000Z',
}

describe('coach-email-ledger.repository — findActiveByCoachAndKeys', () => {
    it('filtra por coach, keys y los estados vivos (TODOS menos `failed`)', async () => {
        const { db, calls } = fakeDb([{ data: [ROW], error: null }])
        const rows = await findActiveByCoachAndKeys(db, 'coach-1', ['day2_pro', 'day14_last_call'])
        expect(rows).toHaveLength(1)
        expect(calls[0].table).toBe('coach_email_ledger')
        expect(calls[0].filters).toEqual([
            { method: 'eq', column: 'coach_id', value: 'coach-1' },
            { method: 'in', column: 'template_key', value: ['day2_pro', 'day14_last_call'] },
            { method: 'in', column: 'status', value: ACTIVE_LEDGER_STATUSES },
        ])
    })

    // I-1/I-2: esta lista es el ESPEJO del índice único parcial de la DB
    // (`coach_email_ledger_dedupe_uidx`, `where status <> 'failed'`). Si se separan, el dedupe de la
    // app y el de Postgres dejan de decir lo mismo y aparecen 23505 donde el service esperaba pasar.
    it('el único estado reintentable es `failed` (bounced/complained/cancelled BLOQUEAN)', () => {
        expect([...ACTIVE_LEDGER_STATUSES].sort()).toEqual(
            ['bounced', 'cancelled', 'complained', 'delivered', 'scheduled', 'sent'].sort()
        )
        // Un correo que NUNCA salió se puede reintentar…
        expect(ACTIVE_LEDGER_STATUSES).not.toContain('failed')
        // …pero a una dirección que rebotó o que se quejó no se le vuelve a escribir con esa key,
        // y lo que cancelamos nosotros (el coach pagó / se dio de baja) no se re-agenda.
        expect(ACTIVE_LEDGER_STATUSES).toContain('bounced')
        expect(ACTIVE_LEDGER_STATUSES).toContain('complained')
        expect(ACTIVE_LEDGER_STATUSES).toContain('cancelled')
    })

    it('lista de keys vacía → cero consultas (no un `.in` con array vacío)', async () => {
        const { db, calls } = fakeDb([])
        expect(await findActiveByCoachAndKeys(db, 'coach-1', [])).toEqual([])
        expect(calls).toHaveLength(0)
    })

    it('error de la DB → lanza (el fail-open lo decide el service, no el repository)', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'boom' } }])
        await expect(findActiveByCoachAndKeys(db, 'coach-1', ['k'])).rejects.toThrow(/boom/)
    })
})

describe('coach-email-ledger.repository — insertLedgerRow', () => {
    it('inserta la fila tal cual y devuelve la creada', async () => {
        const { db, calls } = fakeDb([{ data: ROW, error: null }])
        const row = await insertLedgerRow(db, {
            coach_id: 'coach-1',
            template_key: 'day2_pro',
            trigger: 'drip',
            status: 'scheduled',
            provider_message_id: 'res-1',
        })
        expect(row.id).toBe('row-1')
        expect(calls[0].op).toBe('insert')
        expect(calls[0].payload).toMatchObject({ coach_id: 'coach-1', status: 'scheduled' })
    })

    it('error de la DB → lanza', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'duplicate key' } }])
        await expect(
            insertLedgerRow(db, { coach_id: 'c', template_key: 'k', trigger: 'drip', status: 'sent' })
        ).rejects.toThrow(/duplicate key/)
    })

    // El service distingue la CARRERA de dedupe (23505 del índice único parcial) de una DB caída.
    // Con `new Error(message)` a secas el código se perdía y los dos casos se veían idénticos.
    it('conserva el `code` de Postgres en el error (23505 = unique_violation)', async () => {
        const { db } = fakeDb([
            { data: null, error: { message: 'duplicate key value', code: '23505' } },
        ])
        await expect(
            insertLedgerRow(db, { coach_id: 'c', template_key: 'k', trigger: 'drip', status: 'sent' })
        ).rejects.toMatchObject({ code: '23505' })
    })

    it('sin `code` en el error de PostgREST el campo queda null, no undefined', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'boom' } }])
        await insertLedgerRow(db, { coach_id: 'c', template_key: 'k', trigger: 'drip', status: 'sent' }).catch(
            (err: unknown) => {
                expect(err).toBeInstanceOf(CoachEmailLedgerDbError)
                expect((err as CoachEmailLedgerDbError).code).toBeNull()
            }
        )
    })
})

describe('coach-email-ledger.repository — updateStatusByProviderMessageId', () => {
    it('matchea por provider_message_id y reporta matched:true', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 'row-1' }], error: null }])
        const res = await updateStatusByProviderMessageId(db, 'res-1', {
            status: 'delivered',
            delivered_at: '2026-08-24T10:00:01.000Z',
        })
        expect(res).toEqual({ matched: true })
        expect(calls[0].op).toBe('update')
        expect(calls[0].payload).toEqual({
            status: 'delivered',
            delivered_at: '2026-08-24T10:00:01.000Z',
        })
        expect(calls[0].filters).toEqual([
            { method: 'eq', column: 'provider_message_id', value: 'res-1' },
        ])
    })

    it('sin filas → matched:false (correo que no pasa por el ledger, NO es error)', async () => {
        const { db } = fakeDb([{ data: [], error: null }])
        expect(await updateStatusByProviderMessageId(db, 'res-x', { status: 'sent' })).toEqual({
            matched: false,
        })
    })

    it('onlyFromStatuses agrega el guard de orden como filtro `in`', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 'row-1' }], error: null }])
        await updateStatusByProviderMessageId(
            db,
            'res-1',
            { status: 'sent' },
            { onlyFromStatuses: ['scheduled', 'sent'] }
        )
        expect(calls[0].filters).toEqual([
            { method: 'eq', column: 'provider_message_id', value: 'res-1' },
            { method: 'in', column: 'status', value: ['scheduled', 'sent'] },
        ])
    })

    it('error de la DB → lanza (el webhook lo traduce a 500 para que Svix reintente)', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'timeout' } }])
        await expect(updateStatusByProviderMessageId(db, 'res-1', { status: 'sent' })).rejects.toThrow(
            /timeout/
        )
    })
})

describe('coach-email-ledger.repository — findByProviderMessageId', () => {
    it('devuelve la fila', async () => {
        const { db, calls } = fakeDb([{ data: ROW, error: null }])
        expect((await findByProviderMessageId(db, 'res-1'))?.id).toBe('row-1')
        expect(calls[0].filters).toEqual([
            { method: 'eq', column: 'provider_message_id', value: 'res-1' },
        ])
    })

    it('sin fila → null', async () => {
        const { db } = fakeDb([{ data: null, error: null }])
        expect(await findByProviderMessageId(db, 'res-x')).toBeNull()
    })
})

describe('coach-email-ledger.repository — listScheduledByCoach', () => {
    const NOW = new Date('2026-08-22T10:00:00.000Z')

    it('con keys: coach + status scheduled + FUTURO + template_key in keys, ordenado por fecha', async () => {
        const { db, calls } = fakeDb([{ data: [ROW], error: null }])
        const rows = await listScheduledByCoach(db, 'coach-1', ['day2_pro'], NOW)
        expect(rows).toHaveLength(1)
        expect(calls[0].filters).toEqual([
            { method: 'eq', column: 'coach_id', value: 'coach-1' },
            { method: 'eq', column: 'status', value: 'scheduled' },
            // I-3: lo VENCIDO no es cancelable — sin este filtro cada cancelación gastaba un POST a
            // Resend por correo ya salido solo para cosechar un 404.
            { method: 'gt', column: 'scheduled_at', value: '2026-08-22T10:00:00.000Z' },
            { method: 'in', column: 'template_key', value: ['day2_pro'] },
            { method: 'order', column: 'scheduled_at', value: { ascending: true } },
        ])
    })

    it("con '*': sin filtro de key (baja de cuenta = se cancela todo lo agendado)", async () => {
        const { db, calls } = fakeDb([{ data: [], error: null }])
        await listScheduledByCoach(db, 'coach-1', '*', NOW)
        expect(calls[0].filters.some((f) => f.column === 'template_key')).toBe(false)
        expect(calls[0].filters).toContainEqual({ method: 'eq', column: 'status', value: 'scheduled' })
        expect(calls[0].filters).toContainEqual({
            method: 'gt',
            column: 'scheduled_at',
            value: '2026-08-22T10:00:00.000Z',
        })
    })

    it('lista vacía de keys → cero consultas', async () => {
        const { db, calls } = fakeDb([])
        expect(await listScheduledByCoach(db, 'coach-1', [])).toEqual([])
        expect(calls).toHaveLength(0)
    })
})

describe('coach-email-ledger.repository — markCancelNotPossible', () => {
    it('cierra la fila como `sent` con el payload que le pasa el service (merge ya hecho)', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 'row-1' }], error: null }])
        await markCancelNotPossible(db, 'row-1', { to: 'coach@example.com', cancel_not_possible: 404 })
        expect(calls[0].op).toBe('update')
        expect(calls[0].payload).toEqual({
            status: 'sent',
            payload: { to: 'coach@example.com', cancel_not_possible: 404 },
        })
        expect(calls[0].filters).toEqual([{ method: 'eq', column: 'id', value: 'row-1' }])
    })

    it('error de la DB → lanza', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'nope' } }])
        await expect(markCancelNotPossible(db, 'row-1', {})).rejects.toThrow(/nope/)
    })
})

describe('coach-email-ledger.repository — markCancelled', () => {
    it('marca cancelled por id y devuelve cuántas', async () => {
        const { db, calls } = fakeDb([{ data: [{ id: 'a' }, { id: 'b' }], error: null }])
        expect(await markCancelled(db, ['a', 'b'])).toBe(2)
        expect(calls[0].payload).toEqual({ status: 'cancelled' })
        expect(calls[0].filters).toEqual([{ method: 'in', column: 'id', value: ['a', 'b'] }])
    })

    it('sin ids → cero consultas', async () => {
        const { db, calls } = fakeDb([])
        expect(await markCancelled(db, [])).toBe(0)
        expect(calls).toHaveLength(0)
    })

    it('error de la DB → lanza', async () => {
        const { db } = fakeDb([{ data: null, error: { message: 'nope' } }])
        await expect(markCancelled(db, ['a'])).rejects.toThrow(/nope/)
    })
})
