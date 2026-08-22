import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { addResendAudienceContact } from './send-email'
import { buildDripTemplates, type DripTemplate, type DripTemplateKey } from './drip-templates'
import { siteBaseUrl } from './subscription-url'
import { scheduleCoachEmail } from '@/services/email/coach-email-ledger.service'

type FreeDripInput = {
    /** Service-role client: el ledger de correos se escribe con service_role, nunca con la sesión. */
    admin: SupabaseClient<Database>
    coachId: string
    email: string
    coachName: string
    brandName: string
    /** Código de invitación del coach — el D+1 se lo deja listo para copiar. */
    inviteCode?: string | null
}

/** Día de envío de cada correo de la serie, medido desde el alta. */
export const DRIP_SCHEDULE: ReadonlyArray<{ key: DripTemplateKey; day: number }> = [
    { key: 'day1_value', day: 1 },
    { key: 'day2_pro', day: 2 },
    { key: 'day7_nutrition', day: 7 },
    { key: 'day14_last_call', day: 14 },
]

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Resumen de una corrida de la serie. SIN PII: solo la key del correo y el motivo del fallo, nunca
 * el email ni el nombre del coach (el log vive en Vercel, sin retención acotada).
 *
 * Existe porque la función devolvía `void`: cuatro correos podían fallar en silencio y el caller no
 * tenía forma de enterarse, ni siquiera para loguearlo (I-4 de la revisión adversarial de W2).
 */
export type DripSequenceSummary = {
    scheduled: number
    deduped: number
    failed: number
    failures: Array<{ key: string; error: string }>
}

/**
 * Agenda la serie de bienvenida completa (D+1 / D+2 / D+7 / D+14) de un coach Free.
 *
 * El envío diferido lo hace Resend (`scheduled_at`), pero pasa por `scheduleCoachEmail`: ahí vive
 * el ledger local (`coach_email_ledger`) con el `provider_message_id`, que es lo que permite
 * deduplicar y —más adelante— CANCELAR los agendados cuando dejan de tener sentido (el coach paga,
 * carga su primer alumno o se da de baja). Sin ledger, el D+2 «así se amplía el cupo» le llega
 * igual a alguien que ya pagó.
 *
 * Best-effort: `scheduleCoachEmail` no lanza y el alta a la audiencia es fire-and-forget. Lo único
 * que puede lanzar acá es `templateByKey`, y eso es a propósito (bug de programación, no de red).
 * Todo lo demás se reporta en el resumen que devuelve.
 */
export async function scheduleFreeCoachDripSequence(input: FreeDripInput): Promise<DripSequenceSummary> {
    const audienceId = process.env.RESEND_FREE_COACH_AUDIENCE_ID
    // M-5: el fallback es PRODUCCIÓN, no `localhost:3000`. Un correo agendado a 14 días con links a
    // localhost es un correo perdido, y es exactamente lo que salía si faltaba la env en runtime.
    const baseUrl = siteBaseUrl()

    const now = Date.now()

    const templates = buildDripTemplates({
        coachName: input.coachName,
        brandName: input.brandName,
        baseUrl,
        inviteCode: input.inviteCode ?? null,
    })

    // Se resuelven las CUATRO plantillas antes de agendar ninguna: si falta una key, el throw tiene
    // que dejar la serie entera sin agendar, no media serie en la cola de Resend.
    const resolved = DRIP_SCHEDULE.map(({ key, day }) => ({ key, day, ...templateByKey(templates, key) }))

    const emailPromises = resolved.map(({ key, day, subject, html }) =>
        scheduleCoachEmail(input.admin, {
            coachId: input.coachId,
            templateKey: key,
            trigger: 'drip',
            to: input.email,
            subject,
            html,
            scheduledAt: new Date(now + day * DAY_MS).toISOString(),
            payload: { day },
        })
    )

    // Add to Resend Audience (for dashboard visibility + manual broadcasts)
    const audiencePromise = audienceId
        ? addResendAudienceContact({
              audienceId,
              email: input.email,
              firstName: input.coachName.split(' ')[0],
              lastName: input.coachName.split(' ').slice(1).join(' ') || undefined,
              data: {
                  brand_name: input.brandName,
                  plan: 'free',
                  registered_at: new Date(now).toISOString(),
              },
          })
        : Promise.resolve()

    // La audiencia va en el mismo `allSettled` que los correos (un 500 suyo no puede tumbar el alta)
    // pero NO entra en el resumen: no es un correo de la serie.
    const [audience, ...settled] = await Promise.allSettled([audiencePromise, ...emailPromises])
    if (audience.status === 'rejected') {
        console.warn('[drip] alta a la audiencia de Resend falló', {
            coachId: input.coachId,
            message: errMessage(audience.reason),
        })
    }

    const summary: DripSequenceSummary = { scheduled: 0, deduped: 0, failed: 0, failures: [] }
    settled.forEach((result, index) => {
        const key = resolved[index].key
        if (result.status === 'rejected') {
            // `scheduleCoachEmail` no lanza por contrato; si lo hace es un bug y tiene que verse.
            summary.failed += 1
            summary.failures.push({ key, error: errMessage(result.reason) })
            return
        }
        const value = result.value
        if (!value.ok) {
            summary.failed += 1
            summary.failures.push({ key, error: value.reason })
            return
        }
        if (value.deduped) summary.deduped += 1
        else summary.scheduled += 1
    })

    return summary
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/**
 * Busca una plantilla por key y LANZA si no está.
 *
 * Antes devolvía `{ subject: '', html: '' }`: un typo en la key mandaba un correo vacío a todos los
 * coaches nuevos sin que nada fallara (colisión C3 del SPEC). Con la key tipada el compilador
 * atrapa el typo, y el throw cubre el caso de que `buildDripTemplates` deje de devolver una key.
 */
function templateByKey(templates: DripTemplate[], key: DripTemplateKey): { subject: string; html: string } {
    const t = templates.find((tpl) => tpl.key === key)
    if (!t) throw new Error(`drip template missing: ${key}`)
    return { subject: t.subject, html: t.html }
}
