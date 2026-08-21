import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendTransactionalEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/send-email', () => ({ sendTransactionalEmail }))

import {
    COOLDOWN_TOLERANCE_MS,
    RENEWAL_REMINDER_THRESHOLD_DAYS,
    SALES_EMAIL_AUDIT_ACTIONS,
    buildSubscriptionUrl,
    daysUntil,
    isSalesEmailEnabled,
    isWithinRenewalReminderWindow,
    sendClientLimitReachedEmail,
    sendSalesEmailOnce,
} from './sales-emails.service'

/**
 * Cubre las tres invariantes del canal de venta por email (ver cabecera del service):
 * kill-switch sin deploy, dedupe SIN DDL (ledger en admin_audit_logs) y "fallar nunca rompe el flujo".
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Doble del cliente admin: `admin_audit_logs` se lee encadenado (select→eq→eq→gte→order→limit) y se
 * escribe con insert. Devuelve las filas del ledger que se le siembren y captura los insert.
 */
function makeAdmin(ledgerRows: Array<{ payload: unknown; created_at: string }>, readError?: string) {
    const inserts: unknown[] = []
    const reads: Array<[string, unknown]> = []
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn((col: string, val: unknown) => {
        reads.push([col, val])
        return builder
    })
    builder.gte = vi.fn((col: string, val: unknown) => {
        reads.push([col, val])
        return builder
    })
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(() =>
        Promise.resolve(
            readError ? { data: null, error: { message: readError } } : { data: ledgerRows, error: null }
        )
    )
    builder.insert = vi.fn((row: unknown) => {
        inserts.push(row)
        return Promise.resolve({ error: null })
    })
    const admin = { from: vi.fn(() => builder) } as never
    return { admin, inserts, reads }
}

const baseInput = {
    event: 'plan_expiring_soon' as const,
    coachId: 'coach-1',
    to: 'coach@example.com',
    subject: 'Tu plan Pro vence el 3 de agosto de 2026',
    html: '<p>hola</p>',
}

beforeEach(() => {
    sendTransactionalEmail.mockReset()
    sendTransactionalEmail.mockResolvedValue({ ok: true, providerMessageId: 'msg-1' })
    delete process.env.EVA_SALES_EMAILS_DISABLED
})

afterEach(() => {
    delete process.env.EVA_SALES_EMAILS_DISABLED
    delete process.env.NEXT_PUBLIC_SITE_URL
})

describe('isSalesEmailEnabled — kill-switch EVA_SALES_EMAILS_DISABLED', () => {
    it('sin la env todos los eventos están vivos (lista de apagado, no allowlist)', () => {
        expect(isSalesEmailEnabled('client_limit_reached')).toBe(true)
        expect(isSalesEmailEnabled('plan_expiring_soon')).toBe(true)
        expect(isSalesEmailEnabled('plan_expired')).toBe(true)
    })

    it('apaga solo los eventos listados (CSV, tolera espacios)', () => {
        process.env.EVA_SALES_EMAILS_DISABLED = 'plan_expired, plan_expiring_soon'
        expect(isSalesEmailEnabled('plan_expired')).toBe(false)
        expect(isSalesEmailEnabled('plan_expiring_soon')).toBe(false)
        expect(isSalesEmailEnabled('client_limit_reached')).toBe(true)
    })

    it('`*` y `1` apagan todo (espejo de EVA_PUSH_DISABLED_EVENTS + atajo pánico)', () => {
        process.env.EVA_SALES_EMAILS_DISABLED = '*'
        expect(isSalesEmailEnabled('client_limit_reached')).toBe(false)
        process.env.EVA_SALES_EMAILS_DISABLED = '1'
        expect(isSalesEmailEnabled('plan_expired')).toBe(false)
    })

    it('string vacío o solo espacios NO apaga nada (no romper por env mal seteada)', () => {
        process.env.EVA_SALES_EMAILS_DISABLED = '   '
        expect(isSalesEmailEnabled('plan_expired')).toBe(true)
    })
})

describe('isWithinRenewalReminderWindow — ventana pura del aviso previo', () => {
    const now = new Date('2026-08-01T12:00:00.000Z')

    it('umbral por defecto = 3 días', () => {
        expect(RENEWAL_REMINDER_THRESHOLD_DAYS).toBe(3)
    })

    it('dentro de la ventana (2 y 3 días) → avisa', () => {
        const in2d = new Date(now.getTime() + 2 * DAY_MS).toISOString()
        const in3d = new Date(now.getTime() + 3 * DAY_MS - 1000).toISOString()
        expect(isWithinRenewalReminderWindow({ periodEndIso: in2d, now })).toBe(true)
        expect(isWithinRenewalReminderWindow({ periodEndIso: in3d, now })).toBe(true)
    })

    it('más lejos que el umbral → todavía no', () => {
        const in5d = new Date(now.getTime() + 5 * DAY_MS).toISOString()
        expect(isWithinRenewalReminderWindow({ periodEndIso: in5d, now })).toBe(false)
    })

    it('ya vencido o justo ahora → NO es este correo (es el de "venció")', () => {
        expect(isWithinRenewalReminderWindow({ periodEndIso: now.toISOString(), now })).toBe(false)
        const yesterday = new Date(now.getTime() - DAY_MS).toISOString()
        expect(isWithinRenewalReminderWindow({ periodEndIso: yesterday, now })).toBe(false)
    })

    it('sin fecha o fecha inválida → no avisa (fail-safe)', () => {
        expect(isWithinRenewalReminderWindow({ periodEndIso: null, now })).toBe(false)
        expect(isWithinRenewalReminderWindow({ periodEndIso: 'no-es-fecha', now })).toBe(false)
    })

    it('la ventana cubre días perdidos: si el cron se salta el día 3, el día 1 igual avisa', () => {
        const in1d = new Date(now.getTime() + DAY_MS).toISOString()
        expect(isWithinRenewalReminderWindow({ periodEndIso: in1d, now })).toBe(true)
    })
})

describe('daysUntil', () => {
    const now = new Date('2026-08-01T12:00:00.000Z')

    it('redondea hacia arriba (2,4 días → "3 días", nunca 0)', () => {
        expect(daysUntil(new Date(now.getTime() + 2.4 * DAY_MS).toISOString(), now)).toBe(3)
        expect(daysUntil(new Date(now.getTime() + 3 * DAY_MS).toISOString(), now)).toBe(3)
        expect(daysUntil(new Date(now.getTime() + 60 * 1000).toISOString(), now)).toBe(1)
    })
})

describe('buildSubscriptionUrl', () => {
    it('cae al dominio productivo si falta la env', () => {
        expect(buildSubscriptionUrl()).toBe('https://www.eva-app.cl/coach/subscription')
    })

    it('respeta NEXT_PUBLIC_SITE_URL', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
        expect(buildSubscriptionUrl()).toBe('http://localhost:3000/coach/subscription')
    })

    // Los UTM son OPT-IN: `paid-expiry` la llama sin argumentos y su URL no puede moverse.
    it('con utmSource agrega la atribución (medium fijo = email)', () => {
        expect(buildSubscriptionUrl({ utmSource: 'cap_email', utmCampaign: 'sweep' })).toBe(
            'https://www.eva-app.cl/coach/subscription?utm_source=cap_email&utm_medium=email&utm_campaign=sweep'
        )
    })

    it('sin campaña solo lleva source y medium', () => {
        expect(buildSubscriptionUrl({ utmSource: 'cap_email' })).toBe(
            'https://www.eva-app.cl/coach/subscription?utm_source=cap_email&utm_medium=email'
        )
    })

    it('objeto vacío o sin source → URL desnuda idéntica a la de hoy', () => {
        expect(buildSubscriptionUrl({})).toBe('https://www.eva-app.cl/coach/subscription')
        expect(buildSubscriptionUrl({ utmCampaign: 'sweep' })).toBe('https://www.eva-app.cl/coach/subscription')
    })
})

/**
 * Correo de cupo: mismo evento y mismo ledger para los dos gatillos (rechazo real y barrido del cron
 * `cap-nudge`), pero copy y `utm_campaign` distintos.
 */
describe('sendClientLimitReachedEmail — gatillos attempt vs sweep', () => {
    const capInput = {
        coachId: 'coach-1',
        coachEmail: 'coach@example.com',
        coachName: 'Josefa',
        tier: 'free',
        currentLimit: 1,
    }

    function sentHtml(): string {
        return (sendTransactionalEmail.mock.calls[0][0] as { html: string }).html
    }

    it('trigger sweep: copy de barrido, UTM de campaña y ledger con trigger + source', async () => {
        const { admin, inserts } = makeAdmin([])
        const outcome = await sendClientLimitReachedEmail(admin, {
            ...capInput,
            source: 'cron_cap_nudge',
            trigger: 'sweep',
        })

        expect(outcome).toBe('sent')
        const html = sentHtml()
        expect(html).not.toContain('intentaste')
        expect(html).toContain('El próximo alumno que quieras sumar no va a entrar')
        expect(html).toContain('utm_source=cap_email')
        expect(html).toContain('utm_medium=email')
        expect(html).toContain('utm_campaign=sweep')
        expect((inserts[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
            event: 'client_limit_reached',
            trigger: 'sweep',
            source: 'cron_cap_nudge',
            current_limit: 1,
            tier: 'free',
        })
    })

    it('sin trigger: copy del rechazo, campaña attempt y ledger con trigger attempt', async () => {
        const { admin, inserts } = makeAdmin([])
        const outcome = await sendClientLimitReachedEmail(admin, { ...capInput, source: 'web_create' })

        expect(outcome).toBe('sent')
        const html = sentHtml()
        expect(html).toContain('intentaste agregar')
        expect(html).toContain('utm_campaign=attempt')
        expect((inserts[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
            trigger: 'attempt',
            source: 'web_create',
        })
    })

    it('el subject singulariza el cupo 1 del Free v3 (no «1 alumnos»)', async () => {
        const { admin } = makeAdmin([])
        await sendClientLimitReachedEmail(admin, { ...capInput, source: 'cron_cap_nudge', trigger: 'sweep' })
        const { subject } = sendTransactionalEmail.mock.calls[0][0] as { subject: string }
        expect(subject).toBe('Alcanzaste el límite de 1 alumno de tu plan Gratis')
    })
})

describe('sendSalesEmailOnce — gate, dedupe y no-romper-el-flujo', () => {
    it('manda y deja el registro en el ledger con el dedupe_key', async () => {
        const { admin, inserts } = makeAdmin([])
        const outcome = await sendSalesEmailOnce(admin, { ...baseInput, dedupeKey: '2026-08-04T00:00:00Z' })

        expect(outcome).toBe('sent')
        expect(sendTransactionalEmail).toHaveBeenCalledWith({
            to: 'coach@example.com',
            subject: baseInput.subject,
            html: baseInput.html,
        })
        expect(inserts).toHaveLength(1)
        expect(inserts[0]).toMatchObject({
            action: SALES_EMAIL_AUDIT_ACTIONS.plan_expiring_soon,
            target_table: 'coaches',
            target_id: 'coach-1',
        })
        expect((inserts[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
            event: 'plan_expiring_soon',
            dedupe_key: '2026-08-04T00:00:00Z',
            provider_message_id: 'msg-1',
        })
    })

    it('kill-switch apagado → ni envía ni escribe el ledger', async () => {
        process.env.EVA_SALES_EMAILS_DISABLED = 'plan_expiring_soon'
        const { admin, inserts } = makeAdmin([])
        expect(await sendSalesEmailOnce(admin, baseInput)).toBe('skipped_disabled')
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(inserts).toHaveLength(0)
    })

    it('sin destinatario → skipped_no_recipient (nunca lanza)', async () => {
        const { admin } = makeAdmin([])
        expect(await sendSalesEmailOnce(admin, { ...baseInput, to: null })).toBe('skipped_no_recipient')
        expect(await sendSalesEmailOnce(admin, { ...baseInput, to: '   ' })).toBe('skipped_no_recipient')
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('mismo ancla ya registrada → no re-envía (idempotencia del cron diario)', async () => {
        const { admin } = makeAdmin([
            { payload: { dedupe_key: '2026-08-04T00:00:00Z' }, created_at: '2026-08-01T12:00:00Z' },
        ])
        const outcome = await sendSalesEmailOnce(admin, { ...baseInput, dedupeKey: '2026-08-04T00:00:00Z' })
        expect(outcome).toBe('skipped_duplicate')
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('ancla NUEVA (el coach renovó y el período avanzó) → vuelve a avisar', async () => {
        const { admin } = makeAdmin([
            { payload: { dedupe_key: '2026-07-04T00:00:00Z' }, created_at: '2026-07-01T12:00:00Z' },
        ])
        const outcome = await sendSalesEmailOnce(admin, { ...baseInput, dedupeKey: '2026-08-04T00:00:00Z' })
        expect(outcome).toBe('sent')
    })

    it('modo cooldown: cualquier envío dentro de la ventana bloquea el siguiente', async () => {
        const { admin, reads } = makeAdmin([{ payload: { event: 'client_limit_reached' }, created_at: 'x' }])
        const outcome = await sendSalesEmailOnce(admin, {
            ...baseInput,
            event: 'client_limit_reached',
            cooldownDays: 7,
        })
        expect(outcome).toBe('skipped_duplicate')
        // El ledger se consulta filtrando por la acción del evento y el coach.
        expect(reads).toContainEqual(['action', SALES_EMAIL_AUDIT_ACTIONS.client_limit_reached])
        expect(reads).toContainEqual(['target_id', 'coach-1'])
    })

    it('modo cooldown: la ventana es N días MENOS 12 h (la corrida del día N del cron ya puede mandar)', async () => {
        const before = Date.now()
        const { admin, reads } = makeAdmin([])
        await sendSalesEmailOnce(admin, { ...baseInput, event: 'client_limit_reached', cooldownDays: 7 })
        const since = reads.find(([col]) => col === 'created_at')
        expect(since).toBeDefined()
        const sinceMs = new Date(since![1] as string).getTime()
        const expected = before - (7 * DAY_MS - COOLDOWN_TOLERANCE_MS)
        // Tolerancia de ejecución del test: ±5 s alrededor del valor esperado.
        expect(Math.abs(sinceMs - expected)).toBeLessThan(5_000)
    })

    it('sin dedupeKey ni cooldownDays → siempre manda (no hay dedupe que aplicar)', async () => {
        const { admin } = makeAdmin([{ payload: { dedupe_key: 'lo-que-sea' }, created_at: 'x' }])
        expect(await sendSalesEmailOnce(admin, baseInput)).toBe('sent')
    })

    it('ledger ilegible → fail-OPEN: se manda igual (mejor repetido que perdido)', async () => {
        const { admin } = makeAdmin([], 'boom')
        expect(await sendSalesEmailOnce(admin, { ...baseInput, dedupeKey: 'k' })).toBe('sent')
    })

    it('Resend falla → outcome failed y NO se marca el ledger (el próximo evento reintenta)', async () => {
        sendTransactionalEmail.mockResolvedValue({ ok: false, error: 'Resend 500' })
        const { admin, inserts } = makeAdmin([])
        expect(await sendSalesEmailOnce(admin, { ...baseInput, dedupeKey: 'k' })).toBe('failed')
        expect(inserts).toHaveLength(0)
    })

    it('excepción inesperada (red caída) se traga: devuelve failed en vez de propagar', async () => {
        sendTransactionalEmail.mockRejectedValue(new Error('ECONNRESET'))
        const { admin } = makeAdmin([])
        await expect(sendSalesEmailOnce(admin, baseInput)).resolves.toBe('failed')
    })
})
