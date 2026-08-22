import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    RESEND_WEBHOOK_TOLERANCE_MS,
    verifyResendSignature,
} from './resend-webhook-signature'

/**
 * Esta función es la ÚNICA puerta entre un POST anónimo de internet y un `UPDATE` en la DB. Los
 * vectores se generan acá con `node:crypto` (no se copian de la doc) para que el test compruebe el
 * algoritmo, no una constante pegada.
 *
 * Esquema verificado el 2026-08-21 en
 * https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests → delega en
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */

const SECRET_B64 = Buffer.from('eva-webhook-secret-1234567890').toString('base64')
const SECRET = `whsec_${SECRET_B64}`
const ID = 'msg_2abc'
const RAW_BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'res-1' } })
const NOW = new Date('2026-08-22T00:00:00.000Z')
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

function sign(input: {
    secret?: string
    id?: string
    timestamp?: string
    rawBody?: string
}): string {
    const key = Buffer.from((input.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
    const content = `${input.id ?? ID}.${input.timestamp ?? TIMESTAMP}.${input.rawBody ?? RAW_BODY}`
    return createHmac('sha256', key).update(content).digest('base64')
}

const valid = () => ({
    secret: SECRET,
    id: ID,
    timestamp: TIMESTAMP,
    signatureHeader: `v1,${sign({})}`,
    rawBody: RAW_BODY,
    now: NOW,
})

describe('verifyResendSignature — camino feliz', () => {
    it('firma correcta → ok', () => {
        expect(verifyResendSignature(valid())).toEqual({ ok: true })
    })

    it('acepta el secreto SIN el prefijo whsec_ (por si se pega solo la parte base64)', () => {
        expect(verifyResendSignature({ ...valid(), secret: SECRET_B64 })).toEqual({ ok: true })
    })

    it('varias firmas en el header (rotación de secreto) → basta que UNA calce', () => {
        const otra = createHmac('sha256', Buffer.from('otro', 'base64')).update('x').digest('base64')
        expect(
            verifyResendSignature({
                ...valid(),
                signatureHeader: `v1,${otra} v1,${sign({})}`,
            })
        ).toEqual({ ok: true })
    })

    it('ignora versiones desconocidas sin romperse', () => {
        expect(
            verifyResendSignature({
                ...valid(),
                signatureHeader: `v2,cualquiera v1,${sign({})}`,
            })
        ).toEqual({ ok: true })
    })

    it('dentro de la tolerancia (±5 min) sigue siendo válida, en pasado y en futuro', () => {
        const casi = RESEND_WEBHOOK_TOLERANCE_MS - 1000
        expect(
            verifyResendSignature({ ...valid(), now: new Date(NOW.getTime() + casi) })
        ).toEqual({ ok: true })
        expect(
            verifyResendSignature({ ...valid(), now: new Date(NOW.getTime() - casi) })
        ).toEqual({ ok: true })
    })
})

describe('verifyResendSignature — rechazos', () => {
    it('cuerpo alterado en UN byte → no_match', () => {
        expect(verifyResendSignature({ ...valid(), rawBody: `${RAW_BODY} ` })).toEqual({
            ok: false,
            reason: 'no_match',
        })
    })

    it('re-serializar el JSON (mismo objeto, otro orden) rompe la firma — por eso se usa el body crudo', () => {
        const reordenado = JSON.stringify({ data: { email_id: 'res-1' }, type: 'email.delivered' })
        expect(reordenado).not.toBe(RAW_BODY)
        expect(verifyResendSignature({ ...valid(), rawBody: reordenado }).ok).toBe(false)
    })

    it('otro svix-id con la misma firma → no_match (el id entra en el contenido firmado)', () => {
        expect(verifyResendSignature({ ...valid(), id: 'msg_otro' })).toEqual({
            ok: false,
            reason: 'no_match',
        })
    })

    it('secreto equivocado → no_match', () => {
        expect(
            verifyResendSignature({
                ...valid(),
                secret: `whsec_${Buffer.from('otro-secreto').toString('base64')}`,
            })
        ).toEqual({ ok: false, reason: 'no_match' })
    })

    it('replay: timestamp más viejo que la tolerancia → stale_timestamp', () => {
        const viejo = new Date(NOW.getTime() - RESEND_WEBHOOK_TOLERANCE_MS - 1000)
        expect(
            verifyResendSignature({
                ...valid(),
                timestamp: String(Math.floor(viejo.getTime() / 1000)),
                signatureHeader: `v1,${sign({ timestamp: String(Math.floor(viejo.getTime() / 1000)) })}`,
            })
        ).toEqual({ ok: false, reason: 'stale_timestamp' })
    })

    it('timestamp del FUTURO fuera de tolerancia también se rechaza (reloj forjado)', () => {
        const futuro = new Date(NOW.getTime() + RESEND_WEBHOOK_TOLERANCE_MS + 1000)
        const ts = String(Math.floor(futuro.getTime() / 1000))
        expect(
            verifyResendSignature({
                ...valid(),
                timestamp: ts,
                signatureHeader: `v1,${sign({ timestamp: ts })}`,
            })
        ).toEqual({ ok: false, reason: 'stale_timestamp' })
    })

    it('timestamp no numérico → bad_timestamp', () => {
        expect(verifyResendSignature({ ...valid(), timestamp: 'ayer' })).toEqual({
            ok: false,
            reason: 'bad_timestamp',
        })
    })

    it('headers faltantes → missing_input (nunca se llega a calcular el HMAC)', () => {
        expect(verifyResendSignature({ ...valid(), id: '' }).ok).toBe(false)
        expect(verifyResendSignature({ ...valid(), signatureHeader: '' })).toEqual({
            ok: false,
            reason: 'missing_input',
        })
        expect(verifyResendSignature({ ...valid(), timestamp: '' })).toEqual({
            ok: false,
            reason: 'missing_input',
        })
        expect(verifyResendSignature({ ...valid(), secret: '' })).toEqual({
            ok: false,
            reason: 'missing_input',
        })
    })

    it('secreto que decodifica a cero bytes → bad_secret (no degrada a una clave vacía)', () => {
        expect(verifyResendSignature({ ...valid(), secret: 'whsec_' })).toEqual({
            ok: false,
            reason: 'bad_secret',
        })
        expect(verifyResendSignature({ ...valid(), secret: 'whsec_===' })).toEqual({
            ok: false,
            reason: 'bad_secret',
        })
    })

    it('header sin coma (formato roto) → no_match, no una excepción', () => {
        expect(verifyResendSignature({ ...valid(), signatureHeader: 'basura' })).toEqual({
            ok: false,
            reason: 'no_match',
        })
    })

    it('firma de largo distinto → no_match sin reventar el timingSafeEqual', () => {
        expect(verifyResendSignature({ ...valid(), signatureHeader: 'v1,AAA' })).toEqual({
            ok: false,
            reason: 'no_match',
        })
    })
})
