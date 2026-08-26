import { wrapEmailLayout, ctaButton, badge } from './base-layout'

/**
 * Correo de RECUPERACIÓN del checkout abandonado en la pasarela (P4 / B1 del informe de checkout).
 *
 * Qué recupera: el coach pidió su preference, llegó a MercadoPago y no volvió. La fila queda en
 * `subscription_events` con `provider_status = 'pending'` y nunca avanza a `authorized`. Hoy ese
 * coach no recibe NADA — ni un correo, ni un aviso — y es el momento de mayor intención de compra
 * medible que tiene el producto. El cron `api/cron/checkout-abandoned` lo dispara una sola vez.
 *
 * Mismas reglas de contenido que `sales-templates.ts` (decisión del owner):
 * - CERO listas de precios: el precio vive en `/coach/subscription`, única fuente viva.
 * - UN solo CTA por correo.
 * - Tono cercano, español latam neutro CON tildes.
 * - Sin `brand`: es un correo de EVA AL COACH, jamás white-label.
 *
 * ⚠️ HONESTIDAD DEL COPY (no negociable): la línea «tu cuenta ya está activa» solo se escribe
 * cuando de verdad lo está. Un alta con tier pago nace en `subscription_status='pending_payment'`
 * (`register.actions.ts:229`) y ese estado es BLOQUEO DURO en `lib/coach-subscription-gate.ts:57`:
 * el coach que abandonó el checkout puede estar sin producto. Decirle que su cuenta está activa
 * sería falso y le costaría un ticket de soporte. Por eso hay dos variantes de UN solo párrafo
 * (`accountState`); el resto del correo, el asunto y el CTA son idénticos. Cuando el fix A1 del
 * informe (nacer `free`+`active` en vez de `pending_payment`) esté en producción, la variante
 * `blocked` deja de ocurrir sola — no hay nada que desmontar acá.
 */

export type CheckoutAbandonedContext = {
    coachName: string
    /**
     * Estado REAL de la cuenta al momento del envío, resuelto por el cron:
     * - `active`: el coach puede entrar (se pasó a Free, o su plan anterior sigue vivo).
     * - `blocked`: quedó en un estado que canda el panel (`pending_payment` y familia).
     */
    accountState: 'active' | 'blocked'
    /** CTA a `/coach/subscription` con su atribución (`buildSubscriptionUrl`). */
    subscriptionUrl: string
}

/** Escapa texto controlado por el coach (nombre) antes de interpolarlo en el HTML. */
function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Asunto FIJO (contrato de la ola). Pro es el único tier que llegó a la pasarela en toda la
 * historia del producto; si algún día un abandono de Elite se vuelve real, este literal se parte
 * por tier y el cron pasa el label.
 */
export const CHECKOUT_ABANDONED_SUBJECT = 'Tu plan Pro quedó a un paso'

/** Key lógica del correo en `coach_email_ledger`. Es la mitad de la clave de dedupe. */
export const CHECKOUT_ABANDONED_TEMPLATE_KEY = 'checkout_abandoned'

export function buildCheckoutAbandonedEmail(ctx: CheckoutAbandonedContext): {
    subject: string
    html: string
} {
    const coachName = escHtml(ctx.coachName)

    const accountLine =
        ctx.accountState === 'active'
            ? `Tu cuenta <strong>ya está activa</strong> y no perdiste nada: tus alumnos, tus rutinas y
               tu marca siguen donde las dejaste.`
            : `Tu cuenta <strong>ya está creada</strong> y te está esperando: nada de lo que cargaste
               se perdió. Al completar el pago recuperas el acceso al panel de inmediato.`

    const body = `
${badge('Quedó a un paso')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coachName}, tu plan Pro quedó a un paso
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Empezaste a contratar tu plan y el pago no llegó a completarse. Pasa seguido: se cierra la
  pestaña, la tarjeta pide una confirmación, el celular suena.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  ${accountLine}
</p>

<div style="margin-bottom:20px;">
  ${ctaButton('Retomar el pago →', ctx.subscriptionUrl)}
</div>

<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;">
  ¿Algo te frenó? <strong>Responde este correo</strong> y lo vemos: si el medio de pago no te
  sirvió, si el plan no era el que necesitabas o si simplemente tienes una duda, contestamos
  nosotros.
</p>`

    return {
        subject: CHECKOUT_ABANDONED_SUBJECT,
        html: wrapEmailLayout(body, {
            previewText: 'Tu cuenta te espera. Retomas el pago desde donde lo dejaste.',
            headerTitle: 'Tu plan quedó a un paso — EVA',
            footerText:
                'Recibes este correo porque iniciaste la contratación de un plan en EVA. Si ya no te interesa, responde este correo o escríbenos a contacto@eva-app.cl.',
        }),
    }
}
