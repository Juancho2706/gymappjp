import { wrapEmailLayout, ctaButton, badge } from './base-layout'

/**
 * Emails de DUNNING (cobro recurrente, P0-2): pago fallido + pago recuperado. Resend ya integrado
 * (`send-email.ts`). Envío fire-and-forget desde el webhook: si Resend falla, se loggea pero NUNCA
 * bloquea la mutación de cobro.
 *
 * Antes de esto un coach con la tarjeta sin fondos NO recibía ningún aviso: MP rechazaba, reintentaba
 * y eventualmente lo pausaba, y el coach se enteraba recién al quedar bloqueado. Estos correos cierran
 * esa ceguera. CERO mención de IVA. Español latam neutro con tildes.
 */

export type PaymentFailedContext = {
    coachName: string
    /** Fecha (es-CL) hasta la que conserva acceso (current_period_end), o null si no se conoce. */
    accessUntil: string | null
    /** URL a /coach/subscription (donde, con el cambio de tarjeta live, está el botón de actualizar). */
    subscriptionUrl: string
}

export function buildPaymentFailedEmail(ctx: PaymentFailedContext) {
    const subject = 'No pudimos procesar el pago de tu suscripción EVA'
    const accessLine = ctx.accessUntil
        ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">Conservás el acceso hasta el <strong style="color:#111827;">${ctx.accessUntil}</strong>. Mercado Pago reintentará el cobro automáticamente, pero te recomendamos actualizar tu tarjeta para no perder el servicio.</p>`
        : `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">Mercado Pago reintentará el cobro automáticamente. Actualizá tu tarjeta para no perder el acceso.</p>`
    const body = `
${badge('PAGO RECHAZADO', '#F59E0B')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.coachName}, tu pago no se procesó
</h1>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  El cobro de tu suscripción de EVA fue rechazado (saldo insuficiente o un problema con la tarjeta).
</p>
${accessLine}
${ctaButton('Actualizar mi tarjeta', ctx.subscriptionUrl)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
  Si ya lo resolviste, podés ignorar este correo.
</p>`
    return { subject, html: wrapEmailLayout(body) }
}

export type PaymentRecoveredContext = {
    coachName: string
    subscriptionUrl: string
}

export function buildPaymentRecoveredEmail(ctx: PaymentRecoveredContext) {
    const subject = 'Tu pago en EVA se procesó — todo en orden'
    const body = `
${badge('PAGO AL DÍA', '#10B981')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.coachName}, tu suscripción está al día
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Recibimos tu pago y tu suscripción de EVA quedó activa de nuevo. ¡Gracias!
</p>
${ctaButton('Ir a mi suscripción', ctx.subscriptionUrl)}`
    return { subject, html: wrapEmailLayout(body) }
}
