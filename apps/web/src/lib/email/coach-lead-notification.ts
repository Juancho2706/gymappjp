import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout, ctaButton, ghostButton, divider } from '@/lib/email/base-layout'
import { resolveMetadataBase } from '@/lib/site-url'
import { waMeUrl } from '@/lib/contact/whatsapp'

/**
 * Aviso al coach de que alguien pidió entrenar con él desde `/join/[código]` (scope standalone).
 *
 * Reemplaza al aviso «X se unió» del 20-08, que existía cuando ese camino creaba la cuenta
 * solo (helper dado de baja). Decisión del owner del 2026-08-21: el join standalone ya no da de alta a nadie,
 * deja una SOLICITUD y el coach decide. Por eso este correo no es un «enterado»: es la manera de
 * responderle al interesado, así que el botón de WhatsApp es lo primero después del nombre.
 *
 * SE ESPERA (`await`) en el caller, no es fire-and-forget: la solicitud termina en una respuesta y
 * Vercel congela la invocación apenas se devuelve — todo POST a Resend pendiente muere ahí
 * (medido en producción el 19-08 con la bienvenida del coach Free; ver `free-coach-onboarding.ts`).
 *
 * Fail-open y sin throws: `sendTransactionalEmail` devuelve `{ ok: false }` en vez de lanzar y el
 * `try` cubre el `getUserById`. Un fallo de correo JAMÁS puede tumbar una solicitud ya escrita:
 * la fila queda en la tabla y el coach igual la ve en su panel.
 */
export async function notifyCoachOfLead(
    admin: SupabaseClient<Database>,
    params: {
        coachId: string
        brandName: string
        fullName: string
        phone: string | null
        email: string | null
        message: string | null
        /** Nombre del alumno cuya tarjeta compartida trajo la solicitud (si hubo atribución). */
        referrerName: string | null
    }
): Promise<void> {
    try {
        // El email autoritativo del coach vive en `auth.users` (la tabla `coaches` no lo duplica),
        // mismo camino que usan los cron de trial/pagos.
        const { data } = await admin.auth.admin.getUserById(params.coachId)
        const to = data?.user?.email
        if (!to) return

        const appUrl = resolveMetadataBase().origin
        const name = escapeHtml(params.fullName)
        const brand = escapeHtml(params.brandName)

        // El origen le dice al coach por qué le llegó este desconocido: la tarjeta de un alumno
        // suyo pesa distinto que un código pegado en cualquier lado.
        const origin = params.referrerName
            ? `Llegó por la tarjeta compartida de <strong>${escapeHtml(params.referrerName)}</strong>.`
            : 'Llegó con tu código de invitación.'

        const wa = waMeUrl(params.phone)
        const rows = [
            params.phone ? contactRow('WhatsApp', escapeHtml(params.phone)) : '',
            params.email ? contactRow('Correo', `<a href="mailto:${escapeHtml(params.email)}" style="color:#111827;">${escapeHtml(params.email)}</a>`) : '',
        ].join('')

        const messageBlock = params.message
            ? `<p style="margin:0 0 22px;padding:12px 14px;background-color:#f9fafb;border-left:3px solid #e5e7eb;border-radius:6px;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(params.message)}</p>`
            : ''

        const html = wrapEmailLayout(
            `<h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#111827;line-height:1.3;">Nueva solicitud para entrenar contigo</h1>
<p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.6;"><strong>${name}</strong> quiere entrenar con <strong>${brand}</strong>.</p>
<p style="margin:0 0 18px;font-size:13px;color:#6b7280;line-height:1.6;">${origin}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">${rows}</table>
${messageBlock}
${wa ? `<p style="margin:0 0 14px;">${ctaButton('Escribir por WhatsApp', wa)}</p>` : ''}
${divider()}
<p style="margin:0;">${ghostButton('Ver solicitudes', `${appUrl}/coach/clients?solicitudes=1`)}</p>`,
            { headerTitle: 'EVA', previewText: `${name} quiere entrenar contigo` }
        )

        const sent = await sendTransactionalEmail({
            to,
            subject: `${params.fullName} quiere entrenar contigo`,
            html,
        })
        // Sin PII en el log: solo que la pata de correo falló.
        if (!sent.ok) console.warn('[coach-lead-email] fallo el envío')
    } catch {
        console.warn('[coach-lead-email] fallo inesperado')
    }
}

function contactRow(label: string, value: string): string {
    return `<tr>
  <td width="90" valign="top" style="padding:4px 0;font-size:13px;color:#6b7280;">${label}</td>
  <td valign="top" style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">${value}</td>
</tr>`
}

/** Todo esto lo escribe un desconocido en un form público: nunca se interpola crudo en el HTML. */
function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
