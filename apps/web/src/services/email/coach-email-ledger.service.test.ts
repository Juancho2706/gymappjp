import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Service del ledger de correos. Lo que se pinnea son las tres invariantes que hacen que un correo
 * no pueda romper nada ni repetirse:
 *
 *  · dedupe por (coach_id, template_key) ANTES de gastar un envío;
 *  · ledger FAIL-OPEN (lectura rota ⇒ se manda igual) — la elección OPUESTA a `cap-nudge`, que es
 *    fail-closed porque barre a todo el padrón todos los días;
 *  · nunca lanza: ni un Resend caído, ni un insert que revienta, ni un fetch que explota.
 */

const sendTransactionalEmail = vi.fn()
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

const findActiveByCoachAndKeys = vi.fn()
const insertLedgerRow = vi.fn()
const listScheduledByCoach = vi.fn()
const markCancelNotPossible = vi.fn()
const markCancelled = vi.fn()
vi.mock('@/infrastructure/db/coach-email-ledger.repository', () => ({
    findActiveByCoachAndKeys: (...a: unknown[]) => findActiveByCoachAndKeys(...a),
    insertLedgerRow: (...a: unknown[]) => insertLedgerRow(...a),
    listScheduledByCoach: (...a: unknown[]) => listScheduledByCoach(...a),
    markCancelNotPossible: (...a: unknown[]) => markCancelNotPossible(...a),
    markCancelled: (...a: unknown[]) => markCancelled(...a),
}))

/** Error del repository con el `code` de Postgres, que es lo que mira el service. */
function dbError(message: string, code?: string) {
    return Object.assign(new Error(message), { code })
}

import {
    cancelCoachEmails,
    DRIP_SALES_KEYS,
    resendCancelUrl,
    scheduleCoachEmail,
} from './coach-email-ledger.service'

const admin = {} as SupabaseClient<Database>

const INPUT = {
    coachId: 'coach-1',
    templateKey: 'day2_pro',
    trigger: 'drip' as const,
    to: 'coach@example.com',
    subject: 'Tu plan',
    html: '<p>hola</p>',
}

const originalApiKey = process.env.RESEND_API_KEY
const fetchMock = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.RESEND_API_KEY = 're_test'
    findActiveByCoachAndKeys.mockResolvedValue([])
    insertLedgerRow.mockResolvedValue({ id: 'row-1' })
    listScheduledByCoach.mockResolvedValue([])
    markCancelNotPossible.mockResolvedValue(undefined)
    markCancelled.mockResolvedValue(0)
    sendTransactionalEmail.mockResolvedValue({ ok: true, providerMessageId: 'res-1' })
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalApiKey
})

describe('resendCancelUrl', () => {
    it('es el endpoint verificado en la doc de Resend (POST /emails/:id/cancel)', () => {
        expect(resendCancelUrl('abc-123')).toBe('https://api.resend.com/emails/abc-123/cancel')
    })

    it('escapa el id (un id con `/` no puede reescribir la ruta)', () => {
        expect(resendCancelUrl('a/b')).toBe('https://api.resend.com/emails/a%2Fb/cancel')
    })
})

describe('scheduleCoachEmail — envío inmediato', () => {
    it('sin fila previa → manda, inserta `sent` con el provider_message_id y devuelve ok', async () => {
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({
            ok: true,
            deduped: false,
            ledgerId: 'row-1',
            providerMessageId: 'res-1',
        })
        expect(sendTransactionalEmail).toHaveBeenCalledWith({
            to: 'coach@example.com',
            subject: 'Tu plan',
            html: '<p>hola</p>',
        })
        const row = insertLedgerRow.mock.calls[0][1]
        expect(row.status).toBe('sent')
        expect(row.provider_message_id).toBe('res-1')
        expect(row.sent_at).toBeTruthy()
        expect(row.scheduled_at).toBeNull()
    })

    it('con `scheduledAt` → pasa el agendado a Resend e inserta `scheduled` sin sent_at', async () => {
        const res = await scheduleCoachEmail(admin, {
            ...INPUT,
            scheduledAt: '2026-08-24T10:00:00.000Z',
        })
        expect(res.ok).toBe(true)
        expect(sendTransactionalEmail).toHaveBeenCalledWith(
            expect.objectContaining({ scheduledAt: '2026-08-24T10:00:00.000Z' })
        )
        const row = insertLedgerRow.mock.calls[0][1]
        expect(row.status).toBe('scheduled')
        expect(row.scheduled_at).toBe('2026-08-24T10:00:00.000Z')
        expect(row.sent_at).toBeNull()
    })

    it('el payload de auditoría lleva destinatario y asunto, más lo que aporte el caller', async () => {
        await scheduleCoachEmail(admin, { ...INPUT, payload: { utm_campaign: 'drip' } })
        expect(insertLedgerRow.mock.calls[0][1].payload).toEqual({
            utm_campaign: 'drip',
            to: 'coach@example.com',
            subject: 'Tu plan',
        })
    })
})

describe('scheduleCoachEmail — dedupe', () => {
    it('ya hay fila viva para (coach, key) → deduped y NI SIQUIERA llama a Resend', async () => {
        findActiveByCoachAndKeys.mockResolvedValue([{ id: 'row-previa' }])
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({
            ok: true,
            deduped: true,
            ledgerId: 'row-previa',
            providerMessageId: null,
        })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(insertLedgerRow).not.toHaveBeenCalled()
    })

    it('consulta el dedupe SOLO por la key pedida', async () => {
        await scheduleCoachEmail(admin, INPUT)
        expect(findActiveByCoachAndKeys).toHaveBeenCalledWith(admin, 'coach-1', ['day2_pro'])
    })

    // I-1: escotilla explícita para el día en que un correo legítimamente se repita. Hoy nadie la
    // usa; el test existe para que no se rompa en silencio y para dejar el contrato escrito.
    it('`force` saltea el dedupe: ni siquiera lee el ledger y manda igual', async () => {
        findActiveByCoachAndKeys.mockResolvedValue([{ id: 'row-previa' }])
        const res = await scheduleCoachEmail(admin, { ...INPUT, force: true })
        expect(res).toMatchObject({ ok: true, deduped: false })
        expect(findActiveByCoachAndKeys).not.toHaveBeenCalled()
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
    })
})

describe('scheduleCoachEmail — fail-open y fallos', () => {
    it('lectura del ledger rota → MANDA IGUAL (fail-open) y deja la fila', async () => {
        findActiveByCoachAndKeys.mockRejectedValue(new Error('ledger caído'))
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toMatchObject({ ok: true, deduped: false, ledgerId: 'row-1' })
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
    })

    it('Resend devuelve ok:false → send_failed + fila `failed` (que NO bloquea el reintento)', async () => {
        sendTransactionalEmail.mockResolvedValue({ ok: false, error: 'Resend 500: boom' })
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({ ok: false, reason: 'send_failed', error: 'Resend 500: boom' })
        const row = insertLedgerRow.mock.calls[0][1]
        expect(row.status).toBe('failed')
        expect(row.payload.error).toBe('Resend 500: boom')
        expect(row.provider_message_id).toBeUndefined()
    })

    it('Resend LANZA (fetch abortado) → send_failed, nunca propaga la excepción', async () => {
        sendTransactionalEmail.mockRejectedValue(new Error('network down'))
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({ ok: false, reason: 'send_failed', error: 'network down' })
    })

    it('el insert de la fila `failed` también revienta → igual devuelve send_failed sin lanzar', async () => {
        sendTransactionalEmail.mockResolvedValue({ ok: false, error: 'Resend 429' })
        insertLedgerRow.mockRejectedValue(new Error('db down'))
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({ ok: false, reason: 'send_failed', error: 'Resend 429' })
    })

    it('correo ENVIADO pero insert roto → ok con ledgerId null (jamás pedir que se reintente)', async () => {
        insertLedgerRow.mockRejectedValue(new Error('db down'))
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({
            ok: true,
            deduped: false,
            ledgerId: null,
            providerMessageId: 'res-1',
        })
    })
})

/**
 * I-7 — CARRERA DE DEDUPE. El dedupe de arriba es SELECT-y-después-INSERT: entre los dos, otra
 * ejecución puede escribir la fila (doble clic en el link de confirmación ⇒ dos GET a
 * `/auth/confirm` antes de que commitee el UPDATE a `pending_email`). El índice único parcial
 * `coach_email_ledger_dedupe_uidx` es el que corta, y el service tiene que traducir ese 23505 a
 * «deduped» — y retirar de Resend el correo que acaba de agendar de más.
 */
describe('scheduleCoachEmail — carrera de dedupe (23505)', () => {
    it('agendado: devuelve deduped, CANCELA en Resend el duplicado y no lanza', async () => {
        insertLedgerRow.mockRejectedValue(dbError('duplicate key value', '23505'))
        fetchMock.mockResolvedValue({ ok: true, status: 200 })

        const res = await scheduleCoachEmail(admin, { ...INPUT, scheduledAt: '2026-08-24T10:00:00.000Z' })

        expect(res).toEqual({ ok: true, deduped: true, ledgerId: null, providerMessageId: null })
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.resend.com/emails/res-1/cancel',
            expect.objectContaining({ method: 'POST' })
        )
    })

    it('INMEDIATO: no hay nada que cancelar (el correo ya voló) pero igual reporta deduped', async () => {
        insertLedgerRow.mockRejectedValue(dbError('duplicate key value', '23505'))
        const res = await scheduleCoachEmail(admin, INPUT)
        expect(res).toEqual({ ok: true, deduped: true, ledgerId: null, providerMessageId: null })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('si la cancelación del duplicado falla, sigue siendo deduped (y queda logueado)', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        insertLedgerRow.mockRejectedValue(dbError('duplicate key value', '23505'))
        fetchMock.mockResolvedValue({ ok: false, status: 500 })

        const res = await scheduleCoachEmail(admin, { ...INPUT, scheduledAt: '2026-08-24T10:00:00.000Z' })

        expect(res).toEqual({ ok: true, deduped: true, ledgerId: null, providerMessageId: null })
        expect(error).toHaveBeenCalled()
    })

    it('un error de DB SIN 23505 sigue siendo «enviado sin fila», no una carrera', async () => {
        insertLedgerRow.mockRejectedValue(dbError('connection refused'))
        const res = await scheduleCoachEmail(admin, { ...INPUT, scheduledAt: '2026-08-24T10:00:00.000Z' })
        expect(res).toEqual({
            ok: true,
            deduped: false,
            ledgerId: null,
            providerMessageId: 'res-1',
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('cancelCoachEmails', () => {
    const scheduledRow = (id: string, messageId: string | null, key = 'day2_pro') => ({
        id,
        template_key: key,
        provider_message_id: messageId,
    })

    it('cancela en Resend con POST + Bearer y marca las filas 2xx', async () => {
        listScheduledByCoach.mockResolvedValue([
            scheduledRow('row-a', 'res-a'),
            scheduledRow('row-b', 'res-b', 'day14_last_call'),
        ])
        fetchMock.mockResolvedValue({ ok: true, status: 200 })
        const res = await cancelCoachEmails(admin, 'coach-1', DRIP_SALES_KEYS)
        expect(res).toEqual({ cancelled: 2, alreadySent: 0, failed: 0 })
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.resend.com/emails/res-a/cancel',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer re_test' }),
            })
        )
        expect(markCancelled).toHaveBeenCalledWith(admin, ['row-a', 'row-b'])
    })

    it('Resend responde 5xx → cuenta failed y NO marca la fila', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', 'res-a')])
        fetchMock.mockResolvedValue({ ok: false, status: 500 })
        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 1,
        })
        expect(markCancelled).not.toHaveBeenCalled()
    })

    // I-3: 404/422 significan «ese correo ya salió o no es cancelable». No es un fallo nuestro y no
    // se puede arreglar: la fila deja de estar agendada y el motivo queda en el payload.
    it('404 → alreadySent: cierra la fila como `sent` MERGEANDO el payload, sin contar failed', async () => {
        listScheduledByCoach.mockResolvedValue([
            { ...scheduledRow('row-a', 'res-a'), payload: { to: 'coach@example.com', day: 2 } },
        ])
        fetchMock.mockResolvedValue({ ok: false, status: 404 })

        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 0,
            alreadySent: 1,
            failed: 0,
        })
        expect(markCancelNotPossible).toHaveBeenCalledWith(admin, 'row-a', {
            to: 'coach@example.com',
            day: 2,
            cancel_not_possible: 404,
        })
        expect(markCancelled).not.toHaveBeenCalled()
    })

    it('422 también es terminal (no cancelable), no un fallo', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', 'res-a')])
        fetchMock.mockResolvedValue({ ok: false, status: 422 })
        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 0,
            alreadySent: 1,
            failed: 0,
        })
    })

    it('si cerrar la fila ya enviada falla, el conteo se conserva y no se propaga', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', 'res-a')])
        fetchMock.mockResolvedValue({ ok: false, status: 404 })
        markCancelNotPossible.mockRejectedValue(new Error('db down'))
        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 0,
            alreadySent: 1,
            failed: 0,
        })
    })

    it('mezcla 2xx y 404 → cada uno a su columna', async () => {
        listScheduledByCoach.mockResolvedValue([
            scheduledRow('row-a', 'res-a'),
            scheduledRow('row-b', 'res-b'),
        ])
        fetchMock
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: false, status: 404 })
        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 1,
            alreadySent: 1,
            failed: 0,
        })
        expect(markCancelled).toHaveBeenCalledWith(admin, ['row-a'])
    })

    it('fetch LANZA → failed, nunca propaga', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', 'res-a')])
        fetchMock.mockRejectedValue(new Error('ENOTFOUND'))
        expect(await cancelCoachEmails(admin, 'coach-1', ['day2_pro'])).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 1,
        })
    })

    it('fila agendada sin provider_message_id → failed sin tocar la red', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', null)])
        expect(await cancelCoachEmails(admin, 'coach-1', '*')).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 1,
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('nada agendado → cero llamadas y cero fallos', async () => {
        listScheduledByCoach.mockResolvedValue([])
        expect(await cancelCoachEmails(admin, 'coach-1', DRIP_SALES_KEYS)).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 0,
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    // M-3: cada fila es un POST a Resend. Con `'*'` (baja de cuenta) un coach con muchos agendados
    // podía dejar la invocación cancelando hasta el timeout, en medio de un webhook de pago.
    it("con '*' y 60 agendados procesa 50 y avisa que quedaron 10", async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        listScheduledByCoach.mockResolvedValue(
            Array.from({ length: 60 }, (_, i) => scheduledRow(`row-${i}`, `res-${i}`))
        )
        fetchMock.mockResolvedValue({ ok: true, status: 200 })

        expect(await cancelCoachEmails(admin, 'coach-1', '*')).toEqual({
            cancelled: 50,
            alreadySent: 0,
            failed: 0,
        })
        expect(fetchMock).toHaveBeenCalledTimes(50)
        expect(markCancelled.mock.calls[0][1]).toHaveLength(50)
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('tope del lote'),
            expect.objectContaining({ total: 60, limit: 50 })
        )
    })

    it('sin RESEND_API_KEY → no-op silencioso (no revienta el webhook de pago)', async () => {
        delete process.env.RESEND_API_KEY
        expect(await cancelCoachEmails(admin, 'coach-1', DRIP_SALES_KEYS)).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 0,
        })
        expect(listScheduledByCoach).not.toHaveBeenCalled()
    })

    it('el listado revienta → todo en cero, sin lanzar', async () => {
        listScheduledByCoach.mockRejectedValue(new Error('db down'))
        expect(await cancelCoachEmails(admin, 'coach-1', DRIP_SALES_KEYS)).toEqual({
            cancelled: 0,
            alreadySent: 0,
            failed: 0,
        })
    })

    it('markCancelled revienta → el conteo se conserva y no se propaga', async () => {
        listScheduledByCoach.mockResolvedValue([scheduledRow('row-a', 'res-a')])
        fetchMock.mockResolvedValue({ ok: true, status: 200 })
        markCancelled.mockRejectedValue(new Error('db down'))
        expect(await cancelCoachEmails(admin, 'coach-1', DRIP_SALES_KEYS)).toEqual({
            cancelled: 1,
            alreadySent: 0,
            failed: 0,
        })
    })

    // El reenvío único del día 2 (`day2_pro_catchup`, D2 del owner 05-09) es el mismo correo de venta
    // con otra key: si el coach paga antes de que salga, el webhook lo cancela junto con los otros dos.
    it('DRIP_SALES_KEYS son las dos del drip de venta más el reenvío único del día 2', () => {
        expect(DRIP_SALES_KEYS).toEqual(['day2_pro', 'day14_last_call', 'day2_pro_catchup'])
    })
})
