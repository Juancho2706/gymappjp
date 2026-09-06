import type { SupabaseClient } from '@supabase/supabase-js'
import { PersonaSchema, type Persona } from '@eva/schemas'
import type { Database } from '@/lib/database.types'
import { isTestCoachEmail } from '@/lib/test-accounts'
import { scheduleCoachEmail } from '@/services/email/coach-email-ledger.service'
import {
    findActiveByCoachAndKeys,
    type CoachEmailLedgerRow,
} from '@/infrastructure/db/coach-email-ledger.repository'
import { siteBaseUrl } from '../subscription-url'
import { buildBehaviorEmail } from './behavior-templates'
import {
    BEHAVIOR_LAUNCH_CUTOVER,
    BEHAVIOR_TEMPLATE_KEYS,
    FIRST_LOGIN_SIGNAL_CUTOVER,
    ONBOARDING_CUTOFF_MS,
    computeBehaviorTriggers,
    pickBehaviorTrigger,
    type BehaviorSkipReason,
    type BehaviorTemplateKey,
    type BehaviorTrigger,
    type CoachBehaviorSnapshot,
} from './behavior-triggers'

/**
 * Servicio de los correos por comportamiento (W6): lee el estado del coach, le pregunta al motor
 * puro qué corresponde y lo manda por el helper idempotente `scheduleCoachEmail`.
 *
 * DOS RELOJES (D12 = A + B, owner 22-08):
 * · el cron horario `api/cron/onboarding-behavior` (barrido de todos los coaches de los últimos 90 d);
 * · `enqueueBehaviorCheck(coachId)` para el disparo EN LÍNEA — el «+2 h» de un cron diario sería
 *   «hasta +26 h», y el aha se merece salir en el momento, no en la próxima hora en punto.
 * Los dos convergen en la misma función y comparten el dedupe del ledger, así que el correo sale
 * UNA vez sin importar quién llegó primero.
 *
 * FLAG APAGADO POR DEFECTO (`ONBOARDING_BEHAVIOR_EMAILS_ENABLED`): el owner revisa el copy antes de
 * encenderlo. Con el flag apagado no se lee nada y no se manda nada. `..._DRY_RUN=true` corre el
 * barrido completo y loguea qué habría salido, sin tocar Resend.
 *
 * NUNCA LANZA hacia afuera: un correo es un efecto secundario y no puede tumbar un cron, un login
 * ni un alta. Todo se reporta en el resumen contable.
 */

type Db = SupabaseClient<Database>

/** Interruptor del owner. Apagado por defecto: sin la env explícita en `true`, W6 no existe. */
export function behaviorEmailsEnabled(): boolean {
    return (process.env.ONBOARDING_BEHAVIOR_EMAILS_ENABLED ?? '').trim().toLowerCase() === 'true'
}

/** Ensayo: calcula y loguea, no manda. Sirve para auditar la primera corrida con datos reales. */
export function behaviorEmailsDryRun(): boolean {
    return (process.env.ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN ?? '').trim().toLowerCase() === 'true'
}

/**
 * WhatsApp del owner para el correo de +7 d (D13). **Placeholder por env a propósito**: al cierre de
 * W6 el owner todavía no fijó el número, y el correo NO inventa uno — sin esta env cae al «responde
 * este correo», que es una puerta real.
 */
export function ownerWhatsappUrl(): string | null {
    return process.env.OWNER_WHATSAPP_URL?.trim() || null
}

/** PostgREST corta en 1000 filas por respuesta: todo listado se pagina hasta página corta. */
const PAGE_SIZE = 1000
/** Guarda de bucle: 200 páginas × 1000 filas, imposible hoy (44 coaches en todo el padrón). */
const MAX_PAGES = 200
/**
 * Tope de alumnos que se leen por coach para armar el snapshot. Las señales que dependen de la
 * lista son «¿hay alguno?» y «¿el más viejo sin entrar?»: 200 filas alcanzan de sobra y evitan
 * arrastrar el roster entero de un coach grande en un barrido horario.
 */
const CLIENT_SAMPLE_LIMIT = 200

/**
 * Espaciado entre envíos REALES. Resend limita a 2 requests por segundo; 600 ms deja margen. Mismo
 * valor y misma env-override que `cap-nudge` y `checkout-abandoned` (los tests lo ponen en 0).
 */
const DEFAULT_SEND_SPACING_MS = 600

function sendSpacingMs(): number {
    const raw = process.env.ONBOARDING_BEHAVIOR_SEND_SPACING_MS?.trim()
    if (!raw) return DEFAULT_SEND_SPACING_MS
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SEND_SPACING_MS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function parsePersonaValue(raw: string | null | undefined): Persona | null {
    if (!raw) return null
    const parsed = PersonaSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
}

/** Fila de `coaches` que necesita el barrido. Sin PII más allá del nombre visible del coach. */
export interface BehaviorCoachRow {
    id: string
    slug: string
    full_name: string | null
    brand_name: string | null
    persona: string | null
    invite_code: string | null
    created_at: string | null
    last_active_at: string | null
    active_org_id: string | null
}

const COACH_COLUMNS =
    'id, slug, full_name, brand_name, persona, invite_code, created_at, last_active_at, active_org_id'

type PageResponse = { data: unknown; error: { message: string } | null }

/**
 * Pagina un listado hasta la primera página corta. `buildQuery` DEBE traer su propio `.order(...)`
 * estable antes del `.range`: sin orden explícito Postgres puede repetir u OMITIR filas entre
 * páginas, y una fila omitida acá es un coach que nunca recibe su correo.
 */
async function fetchAllPages<T>(
    buildQuery: (from: number, to: number) => PromiseLike<PageResponse>,
    pageSize: number
): Promise<T[]> {
    const out: T[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * pageSize
        const { data, error } = await buildQuery(from, from + pageSize - 1)
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as T[]
        out.push(...rows)
        if (rows.length < pageSize) break
    }
    return out
}

/**
 * Coaches dentro de la ventana de onboarding: alta en los últimos 90 d **y** posterior al corte de
 * lanzamiento.
 *
 * El `since` es el MÁXIMO de los dos para que el padrón anterior a W6 ni se lea: el motor igual lo
 * rebotaría con `before_launch`, pero eso son 85 lecturas de `auth.users` + roster + ledger por
 * corrida horaria para descartar a todos menos a un puñado. Mientras el cutover sea más reciente que
 * `now - 90 d` manda el cutover; después manda la ventana y esto vuelve a ser el corte de siempre.
 */
export async function listBehaviorCandidates(admin: Db, now: Date): Promise<BehaviorCoachRow[]> {
    const windowStart = now.getTime() - ONBOARDING_CUTOFF_MS
    const launch = new Date(BEHAVIOR_LAUNCH_CUTOVER).getTime()
    const since = new Date(Math.max(windowStart, launch)).toISOString()
    return await fetchAllPages<BehaviorCoachRow>(
        (from, to) =>
            admin
                .from('coaches')
                .select(COACH_COLUMNS)
                .gte('created_at', since)
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to),
        PAGE_SIZE
    )
}

/**
 * Email real del coach. Vive en `auth.users`, no en `public.coaches` (mismo lookup que
 * `resolveCoachEmail` de sales-emails; se repite acá para no arrastrar el módulo de billing dentro
 * de `lib/email`). Nunca lanza: sin email el coach queda como `no_recipient`.
 */
async function resolveCoachEmail(admin: Db, coachId: string): Promise<string | null> {
    try {
        const { data } = await admin.auth.admin.getUserById(coachId)
        return data?.user?.email ?? null
    } catch (err) {
        console.warn('[behavior-emails] no se pudo resolver el email del coach', {
            coachId,
            message: errMessage(err),
        })
        return null
    }
}

/**
 * Estados del ledger que cuentan como «a este coach ya le escribimos» para el espaciado de W6.
 *
 * NO es la lista del dedupe (`ACTIVE_LEDGER_STATUSES`): `bounced`, `complained` y `cancelled` quedan
 * afuera porque ese correo no está en la bandeja del coach —rebotó, lo marcó como spam o lo dimos de
 * baja nosotros—, así que no hay nada que espaciar. `scheduled` sí entra: todavía no salió, pero va
 * a salir, y amontonarle otro encima es justo lo que el piso de 24 h viene a evitar.
 */
const DELIVERABLE_LEDGER_STATUSES: readonly string[] = ['sent', 'delivered', 'scheduled']

/**
 * Cuándo salió (o va a salir) el último correo de comportamiento del coach, sobre las mismas filas
 * que ya trajo el dedupe.
 *
 * `sent_at` es el dato bueno; `scheduled_at` cubre la fila que espera su turno y `created_at` es el
 * piso cuando el webhook de Resend nunca movió la fila (sin ese respaldo, un webhook no registrado
 * apagaría el espaciado entero: todo `sent_at` en `null` se leería como «nunca le escribimos»).
 */
function latestBehaviorSentAt(rows: readonly CoachEmailLedgerRow[]): string | null {
    let latestAt: string | null = null
    let latestMs = -Infinity
    for (const row of rows) {
        if (!DELIVERABLE_LEDGER_STATUSES.includes(row.status)) continue
        const at = row.sent_at ?? row.scheduled_at ?? row.created_at ?? null
        if (!at) continue
        const ms = new Date(at).getTime()
        if (!Number.isFinite(ms) || ms <= latestMs) continue
        latestMs = ms
        latestAt = at
    }
    return latestAt
}

/**
 * Arma el snapshot que consume el motor puro.
 *
 * Cada lectura degrada hacia el lado SEGURO: un conteo caído devuelve el valor que NO dispara
 * correo (0 alumnos no dispara «no entró», y `hasRealStudentActivity = false` no dispara el aha).
 */
export async function loadCoachBehaviorSnapshot(
    admin: Db,
    coach: BehaviorCoachRow
): Promise<CoachBehaviorSnapshot> {
    const email = await resolveCoachEmail(admin, coach.id)

    // Alumnos REALES: nunca el demo (`is_demo`), nunca los archivados.
    const clientsResult = await admin
        .from('clients')
        .select('created_at, first_login_at')
        .eq('coach_id', coach.id)
        .eq('is_demo', false)
        .eq('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(CLIENT_SAMPLE_LIMIT)

    if (clientsResult.error) {
        console.warn('[behavior-emails] roster ilegible — el coach queda sin señales de alumno', {
            coachId: coach.id,
            message: clientsResult.error.message,
        })
    }

    const clients = clientsResult.data ?? []
    const anyRealClientLoggedIn = clients.some((c) => Boolean(c.first_login_at))
    // Solo las filas POSTERIORES al corte pueden interpretarse como «todavía no entró»: antes de
    // ese deploy la columna no se escribía y un `null` significa vejez, no ausencia.
    const oldestPendingInviteAt =
        clients.find(
            (c) => !c.first_login_at && c.created_at != null && c.created_at >= FIRST_LOGIN_SIGNAL_CUTOVER
        )?.created_at ?? null

    // El aha pertenece al alumno REAL: el demo trae actividad sembrada y tildaría el paso el día 1
    // (mismo predicado que `loadOnboardingSignalsDetailed`, services/onboarding/onboarding-v2.queries.ts).
    const [workoutActivity, intakeActivity] = await Promise.all([
        admin
            .from('workout_logs')
            .select('id, clients!inner(coach_id, is_demo, is_archived)')
            .eq('clients.coach_id', coach.id)
            .eq('clients.is_demo', false)
            .eq('clients.is_archived', false)
            .limit(1),
        admin
            .from('nutrition_intake_entries')
            .select('id, clients!inner(coach_id, is_demo, is_archived)')
            .eq('clients.coach_id', coach.id)
            .eq('clients.is_demo', false)
            .eq('clients.is_archived', false)
            .limit(1),
    ])

    // Dedupe por `(coach_id, template_key)`: las keys VIVAS del ledger. Fail-open como el resto del
    // ledger — si no se puede leer, el dedupe atómico de `scheduleCoachEmail` sigue siendo la red.
    // La MISMA lectura alimenta el espaciado por coach: no cuesta una consulta extra.
    let alreadySent: string[] = []
    let lastBehaviorSentAt: string | null = null
    try {
        const rows = await findActiveByCoachAndKeys(admin, coach.id, BEHAVIOR_TEMPLATE_KEYS)
        alreadySent = rows.map((r) => r.template_key)
        lastBehaviorSentAt = latestBehaviorSentAt(rows)
    } catch (err) {
        console.warn('[behavior-emails] ledger ilegible — se cae al dedupe de la base (fail-open)', {
            coachId: coach.id,
            message: errMessage(err),
        })
    }

    return {
        coachId: coach.id,
        email,
        persona: parsePersonaValue(coach.persona),
        createdAt: coach.created_at,
        lastActiveAt: coach.last_active_at,
        realClientCount: clients.length,
        anyRealClientLoggedIn,
        oldestPendingInviteAt,
        hasRealStudentActivity:
            (workoutActivity.data?.length ?? 0) > 0 || (intakeActivity.data?.length ?? 0) > 0,
        alreadySent,
        lastBehaviorSentAt,
        isTestAccount: isTestCoachEmail(email),
        isOrgManaged: Boolean(coach.active_org_id),
    }
}

export type BehaviorCoachOutcome =
    | { outcome: 'skipped'; reason: BehaviorSkipReason }
    | { outcome: 'no_trigger' }
    | { outcome: 'would_send'; trigger: BehaviorTrigger }
    | { outcome: 'sent'; trigger: BehaviorTrigger }
    | { outcome: 'deduped'; trigger: BehaviorTrigger }
    | { outcome: 'send_failed'; trigger: BehaviorTrigger; error: string }

/**
 * Evalúa UN coach y —salvo en dry-run— manda el correo de MAYOR prioridad que corresponda.
 *
 * UNO POR CORRIDA: `pickBehaviorTrigger` se queda con el primero de la lista. Un coach de 8 días
 * sin alumnos matchea tres señales a la vez; mandárselas juntas es el spam que W6 vino a matar.
 */
export async function runBehaviorCheckForCoach(
    admin: Db,
    coach: BehaviorCoachRow,
    opts: { now: Date; dry: boolean }
): Promise<BehaviorCoachOutcome> {
    const snapshot = await loadCoachBehaviorSnapshot(admin, coach)
    const evaluation = computeBehaviorTriggers(snapshot, opts.now)
    if (!evaluation.eligible) return { outcome: 'skipped', reason: evaluation.skipped }

    const trigger = pickBehaviorTrigger(evaluation)
    if (!trigger) return { outcome: 'no_trigger' }
    if (opts.dry) return { outcome: 'would_send', trigger }

    const { subject, html } = buildBehaviorEmail(trigger.template_key, {
        coachName: coach.full_name,
        brandName: coach.brand_name,
        persona: snapshot.persona,
        inviteCode: coach.invite_code,
        baseUrl: siteBaseUrl(),
        ownerWhatsappUrl: ownerWhatsappUrl(),
    })

    const result = await scheduleCoachEmail(admin, {
        coachId: coach.id,
        templateKey: trigger.template_key,
        trigger: 'behavior',
        // `email` no es null: `evaluateBehaviorEligibility` ya cortó por `no_recipient`.
        to: snapshot.email as string,
        subject,
        html,
        payload: {
            reason: trigger.reason,
            persona: snapshot.persona ?? 'sin_persona',
            coach_slug: coach.slug,
        },
    })

    if (!result.ok) return { outcome: 'send_failed', trigger, error: result.reason }
    if (result.deduped) return { outcome: 'deduped', trigger }
    return { outcome: 'sent', trigger }
}

export interface BehaviorSweepSummary {
    candidates: number
    sent: number
    /** Slug + key, sin PII: es lo que se mira en los logs para auditar una corrida. */
    sentTo: Array<{ slug: string; key: BehaviorTemplateKey; reason: string }>
    wouldSend: Array<{ slug: string; key: BehaviorTemplateKey; reason: string }>
    /**
     * Reparto del ensayo POR TEMPLATE: `{ behavior_no_client_2h: 41, behavior_help_7d: 12 }`. Solo
     * las keys con al menos uno, para que entre en una línea de log de Vercel. Es el número que el
     * owner necesita ANTES de encender —cuántos correos de cada tipo saldrían y de qué señal— y así
     * se lee del log del cron sin llamar al endpoint ni parsear el `wouldSend` completo. En una
     * corrida real queda vacío por construcción: ahí el reparto se lee en `sentTo`.
     */
    wouldSendByKey: Partial<Record<BehaviorTemplateKey, number>>
    skipped: Record<BehaviorSkipReason | 'no_trigger' | 'deduped' | 'send_failed', number>
    errors: number
}

function emptySkipped(): BehaviorSweepSummary['skipped'] {
    return {
        no_recipient: 0,
        test_account: 0,
        org_managed: 0,
        no_created_at: 0,
        past_cutoff: 0,
        before_launch: 0,
        cooldown: 0,
        no_trigger: 0,
        deduped: 0,
        send_failed: 0,
    }
}

/**
 * Barrido completo: todos los coaches de los últimos 90 d, uno por uno.
 *
 * FAIL-OPEN de a un coach (cada uno en su try/catch: un fallo suyo solo se cuenta) y FAIL-CLOSED
 * del listado (si `coaches` no se puede listar, la corrida devuelve ceros sin mandar nada).
 */
export async function sweepBehaviorEmails(
    admin: Db,
    opts: { now?: Date; dry?: boolean } = {}
): Promise<BehaviorSweepSummary> {
    const now = opts.now ?? new Date()
    const dry = opts.dry ?? behaviorEmailsDryRun()
    const summary: BehaviorSweepSummary = {
        candidates: 0,
        sent: 0,
        sentTo: [],
        wouldSend: [],
        wouldSendByKey: {},
        skipped: emptySkipped(),
        errors: 0,
    }

    let coaches: BehaviorCoachRow[]
    try {
        coaches = await listBehaviorCandidates(admin, now)
    } catch (err) {
        console.error('[behavior-emails] barrido abortado: no se pudieron listar los candidatos', {
            message: errMessage(err),
        })
        return summary
    }

    summary.candidates = coaches.length
    const spacing = sendSpacingMs()

    for (const coach of coaches) {
        try {
            const result = await runBehaviorCheckForCoach(admin, coach, { now, dry })
            switch (result.outcome) {
                case 'skipped':
                    summary.skipped[result.reason] += 1
                    break
                case 'no_trigger':
                    summary.skipped.no_trigger += 1
                    break
                case 'would_send': {
                    const key = result.trigger.template_key
                    summary.wouldSend.push({
                        slug: coach.slug,
                        key,
                        reason: result.trigger.reason,
                    })
                    summary.wouldSendByKey[key] = (summary.wouldSendByKey[key] ?? 0) + 1
                    break
                }
                case 'deduped':
                    summary.skipped.deduped += 1
                    break
                case 'send_failed':
                    summary.skipped.send_failed += 1
                    break
                case 'sent':
                    summary.sent += 1
                    summary.sentTo.push({
                        slug: coach.slug,
                        key: result.trigger.template_key,
                        reason: result.trigger.reason,
                    })
                    break
            }

            // Throttle de Resend (2 req/s): se espera DESPUÉS de un envío real, nunca en dry ni en
            // los skips —que no tocan la API—. La espera de más del último coach de la corrida no
            // se optimiza a propósito: enredaría el bucle para ahorrar 600 ms de un cron horario.
            if (!dry && result.outcome === 'sent' && spacing > 0) await sleep(spacing)
        } catch (err) {
            summary.errors += 1
            console.error('[behavior-emails] coach fallido', {
                coachId: coach.id,
                message: errMessage(err),
            })
        }
    }

    return summary
}

/**
 * D12 = B — DISPARO EN LÍNEA.
 *
 * Se llama desde el call site del dominio que acaba de cambiar el estado del coach (ver
 * `docs/specs/coach-onboarding-v2/TASKS.md` W6): el primer login de un alumno, el primer entreno o
 * la primera comida registrada. Con el cron horario solo, el aha del alumno esperaría hasta 59 min
 * y el «+2 h» sería «hasta +3 h».
 *
 * NO BLOQUEA la respuesta: el trabajo va por `after()` de `next/server`, que mantiene viva la
 * invocación de Vercel sin sumarle latencia al request. Si `after()` no está disponible (fuera de un
 * request scope: un script, un test), se corre detached con su `.catch` — nunca se propaga un error
 * al caller, que está en medio del login de un alumno.
 *
 * Con el flag apagado no hace absolutamente nada (ni una lectura).
 */
export function enqueueBehaviorCheck(
    coachId: string,
    opts: { admin?: Db; now?: Date; dry?: boolean } = {}
): void {
    if (!behaviorEmailsEnabled()) return
    if (!coachId) return

    const run = async () => {
        try {
            // El call site que ya tiene su cliente de service role lo pasa (y se ahorra el import);
            // el que no, lo crea acá. `admin-client` es `server-only`, por eso va por `import()`.
            const admin =
                opts.admin ??
                (await import('@/lib/supabase/admin-client')).createServiceRoleClient()
            const { data, error } = await admin
                .from('coaches')
                .select(COACH_COLUMNS)
                .eq('id', coachId)
                .maybeSingle()
            if (error || !data) return
            const result = await runBehaviorCheckForCoach(admin, data as unknown as BehaviorCoachRow, {
                now: opts.now ?? new Date(),
                dry: opts.dry ?? behaviorEmailsDryRun(),
            })
            console.info('[behavior-emails] inline', { coachId, outcome: result.outcome })
        } catch (err) {
            console.warn('[behavior-emails] disparo en línea fallido', {
                coachId,
                message: errMessage(err),
            })
        }
    }

    try {
        // `import()` diferido: `next/server` no puede cargarse en los tests puros del motor.
        void import('next/server')
            .then(({ after }) => after(run))
            .catch(() => {
                void run()
            })
    } catch {
        void run()
    }
}
