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
 * Fire-and-forget: el correo jamás bloquea ni rompe un alta.
 */
export function sendFreeCoachOnboardingEmails(params: {
    email: string
    coachName: string
    brandName: string
    appUrl: string
}): void {
    const { subject, html } = buildFreeCoachWelcomeEmail({
        coachName: params.coachName,
        brandName: params.brandName,
        dashboardUrl: `${params.appUrl}/coach/dashboard`,
        clientsUrl: `${params.appUrl}/coach/clients`,
        subscriptionUrl: `${params.appUrl}/coach/subscription`,
    })
    sendTransactionalEmail({ to: params.email, subject, html }).catch(() => null)
    scheduleFreeCoachDripSequence({
        email: params.email,
        coachName: params.coachName,
        brandName: params.brandName,
    }).catch(() => null)
}
