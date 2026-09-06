import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { addResendAudienceContact } from './send-email'
import { buildDripTemplates, type DripTemplate, type DripTemplateKey } from './drip-templates'
import { siteBaseUrl } from './subscription-url'
import { cancelCoachEmails, scheduleCoachEmail } from '@/services/email/coach-email-ledger.service'
import { findLatestByCoachAndKey } from '@/infrastructure/db/coach-email-ledger.repository'

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
 * D11 = A (owner 22-08, TASKS § W8.4.1): **el drip por calendario MUERE.** Lo reemplazan los
 * correos por comportamiento de W6 (`lib/email/behavior/*`): el D+1 y el gatillo «+2 h sin alumno»
 * eran literalmente el mismo correo con dos keys distintas, y el del calendario salía igual aunque
 * el coach ya hubiera cargado a su primer alumno.
 *
 * Se apaga por env y NO se borra: las cuatro plantillas (`drip-templates.ts`) quedan vivas y
 * testeadas, y `FREE_COACH_DRIP_ENABLED=true` resucita la serie entera si el owner quiere volver
 * atrás. Sin la env no se agenda ningún correo; el alta a la audiencia de Resend sí sigue (no es
 * un correo: es la lista para broadcasts manuales).
 */
export function freeCoachDripEnabled(): boolean {
    return (process.env.FREE_COACH_DRIP_ENABLED ?? '').trim().toLowerCase() === 'true'
}

/**
 * Agenda la serie de bienvenida completa (D+1 / D+2 / D+7 / D+14) de un coach Free.
 *
 * @deprecated D11 = A: apagada desde W6. Con `FREE_COACH_DRIP_ENABLED` distinto de `true` esta
 * función NO encola nada y devuelve el resumen en cero. Su reemplazo es
 * `sweepBehaviorEmails` / `enqueueBehaviorCheck` (`lib/email/behavior/behavior-emails.ts`).
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

    // ── D11 = A: la serie por calendario NO encola ────────────────────────────────────────────
    // El alta a la audiencia de Resend sigue (es la lista para broadcasts manuales, no un correo),
    // y el resumen vuelve en cero: los callers ya saben leerlo y siguen logueando una línea por alta.
    if (!freeCoachDripEnabled()) {
        await addToFreeCoachAudience(input, audienceId, now).catch((err: unknown) => {
            console.warn('[drip] alta a la audiencia de Resend falló', {
                coachId: input.coachId,
                message: errMessage(err),
            })
        })
        return { scheduled: 0, deduped: 0, failed: 0, failures: [] }
    }

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
    const audiencePromise = addToFreeCoachAudience(input, audienceId, now)

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
 * Alta del coach a la audiencia de Resend (visibilidad en el panel + broadcasts manuales).
 *
 * Vive aparte de la serie porque SOBREVIVE a D11: la audiencia no es un correo, y apagar el drip no
 * puede dejar al padrón nuevo fuera de la lista con la que el owner manda un aviso a mano.
 */
function addToFreeCoachAudience(
    input: FreeDripInput,
    audienceId: string | undefined,
    nowMs: number
): Promise<unknown> {
    if (!audienceId) return Promise.resolve()
    return addResendAudienceContact({
        audienceId,
        email: input.email,
        firstName: input.coachName.split(' ')[0],
        lastName: input.coachName.split(' ').slice(1).join(' ') || undefined,
        data: {
            brand_name: input.brandName,
            plan: 'free',
            registered_at: new Date(nowMs).toISOString(),
        },
    })
}

// ── Higiene: el drip no le sigue hablando a una casilla que REBOTA (FCN W3.8 + D1 del 05-09) ────

/**
 * Las CUATRO keys de la serie, derivadas del calendario. Una sola fuente: agregar un correo al
 * `DRIP_SCHEDULE` lo mete solo en la cancelación, sin un segundo listado que se desincronice.
 */
export const DRIP_TEMPLATE_KEYS: readonly string[] = DRIP_SCHEDULE.map(({ key }) => key)

/**
 * El correo cuya ENTREGA prueba que la casilla existe: el D+1, el primero de la serie.
 *
 * Se escribe explícito (y no como `DRIP_SCHEDULE[0].key`) porque no es «el primero del arreglo»: es
 * el único correo que ya salió cuando la higiene corre a las 24 h, así que es el único que puede
 * traer veredicto de Resend. Reordenar el calendario no debe mover la prueba en silencio.
 */
export const DRIP_PROOF_TEMPLATE_KEY: DripTemplateKey = 'day1_value'

/** Gracia desde el alta antes de mirar el veredicto del D+1: 24 h (`DAY_MS` ya son 24 h). */
export const UNVERIFIED_DRIP_GRACE_MS = DAY_MS

/**
 * Ventana hacia atrás del barrido. Más viejo que el D+14 no puede tener nada agendado, así que
 * mirar más atrás solo agrega consultas al ledger por coaches que nunca van a tener filas.
 */
export const UNVERIFIED_DRIP_LOOKBACK_MS = 30 * DAY_MS

/** Motivos por los que la higiene NO toca la serie. Uno por rama de la decisión, para el contador. */
export type UnverifiedDripSkipReason =
    | 'verified'
    | 'too_soon'
    | 'delivered'
    | 'no_signal'
    | 'no_day1'
    | 'not_found'
    | 'unreadable'

export type UnverifiedDripHygieneResult =
    | { skipped: UnverifiedDripSkipReason }
    | { cancelled: number; alreadySent: number; failed: number }

/**
 * Cancela lo que quede AGENDADO de la serie SOLO si el D+1 del coach REBOTÓ.
 *
 * D1 DEL OWNER (05-09) — **«no verificado» NO es «casilla inexistente», y la regla vieja las
 * confundía.** Esta higiene cancelaba el D+2 / D+7 / D+14 de todo coach con
 * `coaches.email_verified_at` en NULL a las 24 h. Resultado real: 24 de 45 altas nuevas se quedaron
 * sin el «pásate a Pro» aunque Resend había ENTREGADO el D+1 en su casilla. La columna solo prueba
 * que el coach volvió por un `verifyOtp` o entró por Google; no volver es de lo más común en un alta
 * free que ya entró sin abrir el correo, y no dice absolutamente nada de si la dirección existe.
 * **SPEC §9 R4 queda SUPERADA por esta decisión.**
 *
 * LA PRUEBA DE LA CASILLA ES LA ENTREGA DEL D+1 QUE REPORTA RESEND, no la verificación del coach.
 * El webhook (`api/webhooks/resend`) ya escribe el veredicto en la fila `day1_value` del
 * `coach_email_ledger`; esta función solo lo lee y decide:
 *
 * · `delivered` (o `delivered_at` sellado) → `delivered`: la casilla existe, la serie SIGUE ENTERA.
 * · `bounced` / `complained` / `failed` → **CANCELA** el resto de `DRIP_TEMPLATE_KEYS`. Es el caso
 *   que la higiene existe para atajar: la dirección no recibe (rebote duro, queja o supresión) y
 *   otros tres correos son otros tres golpes a la reputación del dominio.
 * · `scheduled` → `too_soon`: el D+1 todavía no salió, así que no hay veredicto que leer.
 * · `sent` sin `delivered_at` → `no_signal`: salió pero el webhook no dijo nada (puede no estar
 *   registrado, o venir demorado). SIN SEÑAL NO SE CANCELA.
 * · sin fila del D+1 → `no_day1`: la serie ni se agendó (drip apagado por D11, alta vieja).
 * · cualquier otro estado (`cancelled`, o uno nuevo del enum) → `no_signal`: ninguno es prueba de
 *   rebote.
 *
 * FAIL-CLOSED EN TODAS LAS RAMAS: sin prueba explícita de rebote no se cancela. El error barato es
 * un correo de más a una casilla dudosa; el caro —el que ya pagamos— es dejar sin la serie de venta
 * a un coach legítimo. Por eso la lectura del ledger, que SÍ lanza (`CoachEmailLedgerDbError`), va
 * envuelta y cae en `unreadable`.
 *
 * SIGUE MIRANDO `coaches`: `email_verified_at` seteado corta antes (verificó ⇒ ni se lee el ledger)
 * y la gracia de 24 h evita mirar un D+1 que ni siquiera está agendado. Y sigue siendo esa columna,
 * NUNCA `auth.users.email_confirmed_at` (regla 11 del SPEC): `createUser({ email_confirm: true })`
 * la sella en la creación para todos.
 *
 * CÓMO SE CANCELA: `scheduleFreeCoachDripSequence` agenda los cuatro correos de una vez con el
 * `scheduled_at` de Resend; cancelar es pegarle a Resend con el `provider_message_id` del ledger
 * (`cancelCoachEmails`), el mismo mecanismo que usa el webhook de pagos cuando el coach compra.
 *
 * Nunca lanza: `cancelCoachEmails` no lanza por contrato, la lectura del coach va por `error` y la
 * del ledger va en `try`.
 */
export async function cancelDripForUnverifiedCoach(
    admin: SupabaseClient<Database>,
    coachId: string,
    now: Date = new Date()
): Promise<UnverifiedDripHygieneResult> {
    const { data, error } = await admin
        .from('coaches')
        .select('email_verified_at, created_at')
        .eq('id', coachId)
        .maybeSingle()

    if (error) {
        console.warn('[drip-hygiene] no se pudo leer el coach — no se cancela nada (fail-closed)', {
            coachId,
            message: error.message,
        })
        return { skipped: 'unreadable' }
    }
    if (!data) return { skipped: 'not_found' }
    // Probó la casilla: el drip sigue su curso (y ni hace falta ir al ledger).
    if (data.email_verified_at) return { skipped: 'verified' }

    // Sin `created_at` no se puede probar que pasaron las 24 h ⇒ misma decisión que fail-closed.
    const createdAtMs = data.created_at ? new Date(data.created_at).getTime() : NaN
    if (!Number.isFinite(createdAtMs)) return { skipped: 'too_soon' }
    if (now.getTime() - createdAtMs < UNVERIFIED_DRIP_GRACE_MS) return { skipped: 'too_soon' }

    // El veredicto de Resend sobre el D+1. La lectura NO es la del dedupe
    // (`findActiveByCoachAndKeys`) justamente porque aquella filtra `failed`, que acá es señal de
    // rebote y no ruido.
    let day1: Awaited<ReturnType<typeof findLatestByCoachAndKey>>
    try {
        day1 = await findLatestByCoachAndKey(admin, coachId, DRIP_PROOF_TEMPLATE_KEY)
    } catch (err) {
        console.warn('[drip-hygiene] no se pudo leer el D+1 del ledger — no se cancela nada (fail-closed)', {
            coachId,
            message: errMessage(err),
        })
        return { skipped: 'unreadable' }
    }

    if (!day1) return { skipped: 'no_day1' }
    // `delivered_at` sellado con estado `sent` no debería pasar (el webhook sella y mueve juntos),
    // pero si pasa la casilla igual recibió: la entrega manda sobre el estado.
    if (day1.status === 'delivered' || day1.delivered_at) return { skipped: 'delivered' }
    if (day1.status === 'scheduled') return { skipped: 'too_soon' }

    if (day1.status !== 'bounced' && day1.status !== 'complained' && day1.status !== 'failed') {
        return { skipped: 'no_signal' }
    }

    // Solo las keys de la serie: `'*'` se llevaría por delante cualquier otro correo agendado del
    // coach (nudges de cupo, correos de comportamiento), que no es lo que esta higiene decide.
    return await cancelCoachEmails(admin, coachId, DRIP_TEMPLATE_KEYS)
}

export type UnverifiedDripSweepSummary = {
    candidates: number
    cancelled: number
    alreadySent: number
    failed: number
    /** Cuántos candidatos NO se tocaron y por qué. Es el tablero de la regla D1 en producción. */
    skipped: Record<UnverifiedDripSkipReason, number>
}

/**
 * Barrido diario de la higiene anterior: coaches sin verificar cuya alta ya pasó las 24 h.
 *
 * Los candidatos salen de `coaches` (no del ledger) porque la ventana es del alta, pero la DECISIÓN
 * de cancelar es de `cancelDripForUnverifiedCoach`, una por candidato. Antes el barrido llamaba
 * derecho a `cancelCoachEmails` y por eso cancelaba a todo el que no hubiera verificado, sin mirar
 * el veredicto del D+1: era el segundo camino a la misma regla vieja, y el que corría en el cron.
 * UNA sola regla, un solo lugar.
 *
 * El precio es una lectura extra del coach por candidato (el barrido ya lo listó y la higiene lo
 * vuelve a leer). Es un cron diario sobre decenas de filas: duplicar la regla para ahorrar esa
 * consulta es exactamente el error que causó el incidente de las 24 altas.
 *
 * `skipped` desglosa por qué no se tocó a cada uno: es lo que deja ver en el log del cron si la
 * regla nueva está frenando (delivered) o si el webhook dejó de reportar (no_signal en masa).
 *
 * Nunca lanza y devuelve un resumen contable; su caller es `api/cron/drip-hygiene`.
 */
export async function sweepUnverifiedCoachDrips(
    admin: SupabaseClient<Database>,
    now: Date = new Date()
): Promise<UnverifiedDripSweepSummary> {
    const summary: UnverifiedDripSweepSummary = {
        candidates: 0,
        cancelled: 0,
        alreadySent: 0,
        failed: 0,
        skipped: { verified: 0, too_soon: 0, delivered: 0, no_signal: 0, no_day1: 0, not_found: 0, unreadable: 0 },
    }

    const { data, error } = await admin
        .from('coaches')
        .select('id')
        .is('email_verified_at', null)
        .gte('created_at', new Date(now.getTime() - UNVERIFIED_DRIP_LOOKBACK_MS).toISOString())
        .lt('created_at', new Date(now.getTime() - UNVERIFIED_DRIP_GRACE_MS).toISOString())

    if (error) {
        console.error('[drip-hygiene] barrido abortado: no se pudieron listar los candidatos', {
            message: error.message,
        })
        return summary
    }

    summary.candidates = data?.length ?? 0
    for (const row of data ?? []) {
        const result = await cancelDripForUnverifiedCoach(admin, row.id, now)
        if ('skipped' in result) {
            summary.skipped[result.skipped] += 1
            continue
        }
        summary.cancelled += result.cancelled
        summary.alreadySent += result.alreadySent
        summary.failed += result.failed
    }

    return summary
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
