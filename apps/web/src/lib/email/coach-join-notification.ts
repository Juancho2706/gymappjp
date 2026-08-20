import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout, ctaButton } from '@/lib/email/base-layout'
import { resolveMetadataBase } from '@/lib/site-url'

/**
 * Aviso al coach de que alguien se dio de alta SOLO con su código (`/join/[código]`, scope
 * standalone). Es el único camino de alta que el coach no origina él mismo, así que sin este
 * correo el alumno nuevo aparece en el roster sin que nadie se entere.
 *
 * SE ESPERA (`await`) en el caller, no es fire-and-forget: el alta termina en una respuesta y
 * Vercel congela la invocación apenas se devuelve — todo POST a Resend pendiente muere ahí
 * (medido en producción el 19-08 con la bienvenida del coach Free; ver `free-coach-onboarding.ts`).
 *
 * Fail-open y sin throws: `sendTransactionalEmail` devuelve `{ ok: false }` en vez de lanzar, y el
 * `try` cubre el `getUserById`. Un fallo de correo JAMÁS puede tumbar un alta ya escrita.
 */
export async function notifyCoachOfStandaloneJoin(
    admin: SupabaseClient<Database>,
    params: { coachId: string; studentName: string; brandName: string }
): Promise<void> {
    try {
        // El email autoritativo del coach vive en `auth.users` (la tabla `coaches` no lo duplica),
        // mismo camino que usan los cron de trial/pagos.
        const { data } = await admin.auth.admin.getUserById(params.coachId)
        const to = data?.user?.email
        if (!to) return

        const appUrl = resolveMetadataBase().origin
        const name = escapeHtml(params.studentName)
        const brand = escapeHtml(params.brandName)
        const html = wrapEmailLayout(
            `<h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#111827;line-height:1.3;">Nuevo alumno con tu código</h1>
<p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.6;"><strong>${name}</strong> se unió a <strong>${brand}</strong> usando tu código de invitación. Ya puede entrar a la app: asígnale su rutina cuando quieras.</p>
${ctaButton('Ver mis alumnos', `${appUrl}/coach/clients`)}`,
            { headerTitle: 'EVA', previewText: `${name} se unió a ${brand}` }
        )

        const sent = await sendTransactionalEmail({ to, subject: `${params.studentName} se unió a ${params.brandName}`, html })
        // Sin PII en el log: solo que la pata de correo falló.
        if (!sent.ok) console.warn('[coach-join-email] fallo el envío')
    } catch {
        console.warn('[coach-join-email] fallo inesperado')
    }
}

/** El nombre lo escribe un desconocido en un form público: nunca se interpola crudo en el HTML. */
function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
