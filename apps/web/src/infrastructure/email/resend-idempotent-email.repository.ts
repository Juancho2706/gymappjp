import type { ProgramAssignmentNotificationEmailSender } from '@/services/workout/program-assignment-notification.service'

/**
 * Adapter mínimo de Resend con deduplicación nativa. Resend conserva la clave 24h; el servicio
 * limita la antigüedad del evento a la misma ventana, evitando reenvíos tardíos fuera del ledger.
 */
export const resendIdempotentEmailSender: ProgramAssignmentNotificationEmailSender = {
  async send(input) {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      return { ok: false, error: 'Missing RESEND_API_KEY or EMAIL_FROM' }
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
      })
      if (!response.ok) {
        return { ok: false, error: `Resend ${response.status}: ${await response.text()}` }
      }
      const payload = await response.json() as { id?: string }
      return { ok: true, providerMessageId: payload.id ?? null }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Resend request failed',
      }
    }
  },
}
