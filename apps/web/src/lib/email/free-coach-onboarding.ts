import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildFreeCoachWelcomeEmail } from '@/lib/email/transactional-templates'
import {
    DRIP_SCHEDULE,
    scheduleFreeCoachDripSequence,
    type DripSequenceSummary,
} from '@/lib/email/send-drip-sequence'

/**
 * Bienvenida + secuencia drip del coach Free, en un solo lugar.
 *
 * ⚠️ D11 = A (owner 22-08, W6 de coach-onboarding-v2): **la serie por calendario está APAGADA.**
 * `scheduleFreeCoachDripSequence` quedó `@deprecated` y, sin `FREE_COACH_DRIP_ENABLED=true`, no
 * encola ningún correo (solo mantiene el alta a la audiencia de Resend) y devuelve el resumen en
 * cero. La BIENVENIDA de este mismo archivo NO se toca: es transaccional y sale igual. Los toques
 * siguientes los decide el comportamiento del coach (`lib/email/behavior/*`, cron horario
 * `api/cron/onboarding-behavior` + `enqueueBehaviorCheck`), no el almanaque.
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
    /** Service-role client: el ledger de correos (`coach_email_ledger`) se escribe con service_role. */
    admin: SupabaseClient<Database>
    coachId: string
    email: string
    coachName: string
    brandName: string
    /** Código de invitación del coach: el D+1 del drip se lo deja listo para copiar. */
    inviteCode?: string | null
    appUrl: string
}): Promise<void> {
    const { subject, html } = buildFreeCoachWelcomeEmail({
        coachName: params.coachName,
        brandName: params.brandName,
        // FCN W3.7 (= W8.1.10 de coach-onboarding-v2): el CTA de la bienvenida aterriza en la GUÍA,
        // no en el panel vacío. `/coach/guia` es «Tus primeros pasos» (marca en 60 s, alumno de
        // ejemplo, nudge de persona) desde que el owner la sacó del dashboard el 22-08; volver del
        // correo al dashboard dejaba al coach del día 1 justo en la pantalla que la guía existe
        // para evitar. El NOMBRE del parámetro sigue siendo `dashboardUrl` porque es el contrato de
        // `buildFreeCoachWelcomeEmail` (plantilla compartida, fuera del alcance de W3.7): lo que
        // cambia es el DESTINO.
        dashboardUrl: `${params.appUrl}/coach/guia`,
        clientsUrl: `${params.appUrl}/coach/clients`,
        subscriptionUrl: `${params.appUrl}/coach/subscription`,
    })

    const [welcome, drip] = await Promise.allSettled([
        sendTransactionalEmail({ to: params.email, subject, html }),
        scheduleFreeCoachDripSequence({
            admin: params.admin,
            coachId: params.coachId,
            email: params.email,
            coachName: params.coachName,
            brandName: params.brandName,
            inviteCode: params.inviteCode ?? null,
        }),
    ])

    // El log lleva SOLO qué pata falló: nunca el email ni el nombre del coach.
    // `sendTransactionalEmail` no lanza cuando Resend responde 4xx/5xx ni cuando falta la API key —
    // devuelve `{ ok: false }`. Mirar solo el `rejected` dejaría mudo el modo de fallo más probable.
    if (welcome.status === 'rejected' || !welcome.value.ok) console.warn('[onboarding-email] fallo', 'welcome')
    if (drip.status === 'rejected') console.warn('[onboarding-email] fallo', 'drip')

    // I-4: la serie ya no devuelve `void`. Sin esto, las cuatro podían fallar dentro del
    // `allSettled` (el ledger no lanza: devuelve `{ ok: false }`) y el alta se veía perfecta.
    // Una línea SIEMPRE, para poder contar en los logs cuántos drips salen de verdad; `error`
    // cuando hay al menos un correo caído, que es lo que hay que ir a mirar.
    const summary: DripSequenceSummary =
        drip.status === 'fulfilled'
            ? drip.value
            : { scheduled: 0, deduped: 0, failed: DRIP_SCHEDULE.length, failures: [{ key: 'all', error: 'rejected' }] }

    const line = { coachId: params.coachId, ...summary }
    console.warn('[onboarding-emails] drip', line)
    if (summary.failed > 0) console.error('[onboarding-emails] drip', line)
}
