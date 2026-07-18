import { afterEach, describe, expect, it, vi } from 'vitest'
import { resendIdempotentEmailSender } from './resend-idempotent-email.repository'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('resendIdempotentEmailSender', () => {
  it('envía la clave idempotente en el header oficial de Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'EVA <hola@eva.test>')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resendIdempotentEmailSender.send({
      to: 'ana@example.com',
      subject: 'Nuevo programa',
      html: '<p>Programa</p>',
      idempotencyKey: 'program-assigned-mobile/program-1',
    })).resolves.toEqual({ ok: true, providerMessageId: 'email-1' })

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer re_test',
        'Idempotency-Key': 'program-assigned-mobile/program-1',
      }),
    }))
  })

  it('falla sin tocar red cuando faltan secretos server-side', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(resendIdempotentEmailSender.send({
      to: 'ana@example.com',
      subject: 'Nuevo programa',
      html: '<p>Programa</p>',
      idempotencyKey: 'program-assigned-mobile/program-1',
    })).resolves.toEqual({ ok: false, error: 'Missing RESEND_API_KEY or EMAIL_FROM' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
