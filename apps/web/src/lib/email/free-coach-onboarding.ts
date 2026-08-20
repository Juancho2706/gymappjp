import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildFreeCoachWelcomeEmail } from '@/lib/email/transactional-templates'
import { scheduleFreeCoachDripSequence } from '@/lib/email/send-drip-sequence'

/**
 * Bienvenida + secuencia drip del coach Free, en un solo lugar.
 *
 * Vivía inline en `auth/confirm/route.ts`, y eso lo convertía en exclusivo del camino por email:
 * el alta por Google (`completeOAuthOnboarding`) nace `active` sin pasar jamás por
 * `pending_email`, así que ese coach entraba sin bienvenida, sin drip día 3/7/14 y fuera de la
 * audiencia de Resend (QA pre-campaña 17-08 — y es el camino de MENOR fricción, el que más elige
 * el tráfico frío).
 *
 * Idempotencia por diseño, sin marca extra: el camino email lo dispara solo en la transición
 * `pending_email → active` y el camino Google solo en el insert. Un coach recorre exactamente uno
 * de los dos.
 *
 * SE ESPERA (`await`), no es fire-and-forget: los dos callers terminan en un redirect, y Vercel
 * congela la invocación apenas se devuelve la respuesta — todo POST a Resend que quedara pendiente
 * muere ahí. Medido en producción el 19-08: de 5 coaches que confirmaron por email, 2 (`futsoccer`
 * 03:27Z, `coach-nicolas` 09:28Z) no recibieron ni bienvenida ni drip. Misma trampa que ya había
 * matado el CAPI (531cf7b6) y misma cura: esperar antes de responder.
 *
 * `allSettled` mantiene la garantía vieja: un fallo de Resend nunca rompe un alta ni la retrasa
 * más allá de sus dos requests. La función JAMÁS lanza; un rechazo solo deja un warn sin PII.
 */
export async function sendFreeCoachOnboardingEmails(params: {
    email: string
    coachName: string
    brandName: string
    appUrl: string
}): Promise<void> {
    const { subject, html } = buildFreeCoachWelcomeEmail({
        coachName: params.coachName,
        brandName: params.brandName,
        dashboardUrl: `${params.appUrl}/coach/dashboard`,
        clientsUrl: `${params.appUrl}/coach/clients`,
        subscriptionUrl: `${params.appUrl}/coach/subscription`,
    })

    const [welcome, drip] = await Promise.allSettled([
        sendTransactionalEmail({ to: params.email, subject, html }),
        scheduleFreeCoachDripSequence({
            email: params.email,
            coachName: params.coachName,
            brandName: params.brandName,
        }),
    ])

    // El log lleva SOLO qué pata falló: nunca el email ni el nombre del coach.
    // `sendTransactionalEmail` no lanza cuando Resend responde 4xx/5xx ni cuando falta la API key —
    // devuelve `{ ok: false }`. Mirar solo el `rejected` dejaría mudo el modo de fallo más probable.
    if (welcome.status === 'rejected' || !welcome.value.ok) console.warn('[onboarding-email] fallo', 'welcome')
    if (drip.status === 'rejected') console.warn('[onboarding-email] fallo', 'drip')
}
