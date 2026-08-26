import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { scheduleCoachEmail } from '@/services/email/coach-email-ledger.service'
import { resolveCoachEmail } from '@/services/billing/sales-emails.service'
import { buildSubscriptionUrl } from '@/lib/email/subscription-url'
import {
    CHECKOUT_ABANDONED_TEMPLATE_KEY,
    buildCheckoutAbandonedEmail,
} from '@/lib/email/checkout-abandoned-template'
import { isTestCoachEmail } from '@/lib/test-accounts'
import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import type { Json, TablesInsert } from '@/lib/database.types'

/**
 * Cron `checkout-abandoned` — cierra el ÚLTIMO hueco del embudo de pago (A6 del informe de checkout).
 *
 * QUÉ MIDE: hoy tenemos `checkout_started` (el coach sale hacia la pasarela) y después NADA hasta que
 * el webhook confirma un pago. Entre esos dos puntos hay un abismo: un preapproval de MercadoPago que
 * queda en `pending` y jamás pasa a `authorized` significa «llegó a la pasarela y no pagó», y eso no
 * lo registra ningún evento. Los dos abandonos medidos (ljfitness 24-08, nexo-performance 25-08) se
 * leen en PostHog como «vio el precio y no compró», que es exactamente lo contrario de lo que pasó.
 *
 * QUÉ HACE, cada hora:
 *  1. Busca filas de `subscription_events` con `provider_status='pending'` de hace MÁS de 2 h (y menos
 *     de `LOOKBACK_DAYS`), agrupadas por coach.
 *  2. Descarta a quien SÍ terminó pagando: cualquier evento POSTERIOR con estado de cobro real
 *     (`authorized`/`approved`), o un coach que hoy está en un tier pago con acceso vivo.
 *  3. Por cada coach que queda, UNA sola vez: emite `checkout_abandoned_at_gateway` server-side a
 *     PostHog y le manda el correo de recuperación por Resend.
 *
 * POR QUÉ 'active' NO cuenta como recuperación: `activate-free` escribe un evento `provider_status =
 * 'active'` (`services/billing/activate-free.service.ts:124`). El coach que abandonó el checkout Pro y
 * se pasó a Free para poder entrar (caso nexo-performance, 61 s después) ABANDONÓ en la pasarela — es
 * el lead más caliente que hay, no una venta cerrada. Solo `authorized`/`approved` (preapproval
 * autorizado / pago aprobado) apagan el caso.
 *
 * DEDUPE: `coach_email_ledger` vía `scheduleCoachEmail` con `templateKey='checkout_abandoned'`. La
 * fila del ledger es el ÚNICO token de dedupe y gobierna el tratamiento COMPLETO (evento + correo):
 * el evento de PostHog se emite solo cuando el correo salió de verdad y no venía deduplicado. Es
 * deliberado — un evento por corrida horaria inflaría el paso del embudo con el mismo abandono 24
 * veces al día, y un abandono contado de más es peor que uno contado de menos en la única métrica
 * que va a decidir si se toca el checkout.
 *
 * `?dry=1`: corre el barrido entero (candidatos, descartes, decisión) SIN mandar ni emitir nada, y
 * devuelve `wouldNotify` con los slugs. Es la forma de auditar la primera corrida antes de que le
 * escriba a nadie.
 *
 * FAIL-CLOSED de la auth (`CRON_SECRET`) y FAIL-OPEN de a un coach: cada coach va en su try/catch y un
 * fallo suyo solo se cuenta. Excluye cuentas de prueba (`isTestCoachEmail`, misma fuente que finanzas)
 * y coaches operando dentro de una organización (su cupo y su plan los manda la org).
 */

/** Ventana de gracia: por debajo de esto el coach todavía puede estar pagando en la pasarela. */
const ABANDON_THRESHOLD_HOURS = 2

/**
 * Horizonte hacia atrás. Sin este tope, la PRIMERA corrida le escribiría a todo coach con un
 * `pending` histórico —«tu plan quedó a un paso» sobre un checkout de hace tres meses es spam, no
 * recuperación— y el dedupe del ledger, que es por coach para siempre, quemaría el único disparo.
 */
const LOOKBACK_DAYS = 7

/** Estados del gateway que significan COBRO REAL: apagan el caso (ver docblock sobre 'active'). */
const RECOVERED_PROVIDER_STATUSES = ['authorized', 'approved'] as const

/**
 * Un coach en tier PAGO con uno de estos estados está pagando hoy: escribirle «tu plan quedó a un
 * paso» sería absurdo. Segunda barrera, independiente de los eventos (cubre pagos conciliados a mano,
 * cortesías y migraciones que no dejaron fila `authorized`).
 */
const PAYING_STATUSES = ['active', 'trialing', 'org_managed', 'team_managed'] as const

/** PostgREST corta en 1000 filas por respuesta: todo listado se pagina hasta página corta. */
const PAGE_SIZE = 1000
/** Guarda de bucle: 200 páginas × 1000 filas, imposible hoy. */
const MAX_PAGES = 200
/** Tamaño de chunk de ids para los `.in` (evita URLs gigantes en el query string). */
const COACH_ID_CHUNK = 100

/**
 * Espaciado entre envíos REALES. Resend limita a 2 requests por segundo: 600 ms deja margen sin
 * alargar de más la corrida. `CHECKOUT_ABANDONED_SEND_SPACING_MS` lo pisa (los tests lo ponen en 0).
 */
const DEFAULT_SEND_SPACING_MS = 600

/**
 * GoTrue + ledger + Resend + PostHog por coach, más el espaciado: el default de 10 s no alcanza si
 * un día hay varios abandonos juntos. 60 es el valor con precedente en el repo (`cap-nudge`).
 */
export const maxDuration = 60

function sendSpacingMs(): number {
    const raw = process.env.CHECKOUT_ABANDONED_SEND_SPACING_MS?.trim()
    if (!raw) return DEFAULT_SEND_SPACING_MS
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SEND_SPACING_MS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isAuthorized(req: Request): boolean {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    const expectedHeader = `Bearer ${expected}`
    const authBuf = Buffer.from(auth, 'utf8')
    const expectedBuf = Buffer.from(expectedHeader, 'utf8')
    if (authBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(authBuf, expectedBuf)
}

type PendingEventRow = {
    coach_id: string | null
    created_at: string | null
    provider: string | null
    provider_status: string | null
}

type CandidateCoach = {
    id: string
    slug: string
    full_name: string | null
    subscription_tier: string | null
    subscription_status: string | null
    active_org_id: string | null
}

const COACH_COLUMNS = 'id, slug, full_name, subscription_tier, subscription_status, active_org_id'

type PageResponse = { data: unknown; error: { message: string } | null }

/**
 * Pagina un listado de PostgREST hasta la primera página corta. `buildQuery` DEBE traer su propio
 * `.order(...)` ESTABLE antes del `.range`: sin orden explícito Postgres puede repetir u OMITIR filas
 * entre páginas, y una fila omitida acá es un abandono que nunca se mide ni se recupera.
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

function chunked<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

type AbandonedCase = {
    coachId: string
    /** El `pending` MÁS RECIENTE del coach dentro de la ventana: el intento que quedó colgado. */
    pendingAtIso: string
    provider: string
}

/**
 * Encuentra los abandonos: `pending` con más de `ABANDON_THRESHOLD_HOURS` y sin ningún evento de
 * cobro real POSTERIOR a ese `pending`. Devuelve un caso por coach (el intento más nuevo).
 */
async function findAbandonedCases(
    admin: ReturnType<typeof createServiceRoleClient>,
    now: Date
): Promise<AbandonedCase[]> {
    const staleBefore = new Date(now.getTime() - ABANDON_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()
    const lookbackFrom = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const pendingRows = await fetchAllPages<PendingEventRow>(
        (from, to) =>
            admin
                .from('subscription_events')
                .select('coach_id, created_at, provider, provider_status')
                .eq('provider_status', 'pending')
                .gte('created_at', lookbackFrom)
                .lt('created_at', staleBefore)
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to),
        PAGE_SIZE
    ).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`pending events query failed: ${message}`)
    })

    // Un caso por coach: el `pending` más nuevo (las filas vienen ordenadas desc, así que la primera
    // que aparece por coach ya es la correcta).
    const byCoach = new Map<string, AbandonedCase>()
    for (const row of pendingRows) {
        if (!row.coach_id || !row.created_at) continue
        if (byCoach.has(row.coach_id)) continue
        byCoach.set(row.coach_id, {
            coachId: row.coach_id,
            pendingAtIso: row.created_at,
            provider: row.provider ?? 'mercadopago',
        })
    }

    if (byCoach.size === 0) return []

    // Descarte por COBRO REAL posterior. Se piden solo los estados que cuentan y solo desde el
    // `pending` más viejo del lote — comparar en memoria evita una consulta por coach.
    const coachIds = [...byCoach.keys()]
    const oldestPending = [...byCoach.values()].reduce(
        (min, c) => (c.pendingAtIso < min ? c.pendingAtIso : min),
        [...byCoach.values()][0].pendingAtIso
    )

    const recoveredByCoach = new Map<string, string[]>()
    for (const chunk of chunked(coachIds, COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<PendingEventRow>(
            (from, to) =>
                admin
                    .from('subscription_events')
                    .select('coach_id, created_at, provider, provider_status')
                    .in('coach_id', chunk)
                    .in('provider_status', [...RECOVERED_PROVIDER_STATUSES])
                    .gte('created_at', oldestPending)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        ).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            throw new Error(`recovered events query failed: ${message}`)
        })

        for (const row of rows) {
            if (!row.coach_id || !row.created_at) continue
            const list = recoveredByCoach.get(row.coach_id) ?? []
            list.push(row.created_at)
            recoveredByCoach.set(row.coach_id, list)
        }
    }

    return [...byCoach.values()].filter((c) => {
        const recovered = recoveredByCoach.get(c.coachId) ?? []
        return !recovered.some((at) => at > c.pendingAtIso)
    })
}

type SweepSkipped = {
    payingNow: number
    orgManaged: number
    coachMissing: number
    noRecipient: number
    testAccount: number
    deduped: number
    sendFailed: number
}

type SweepResult = {
    candidates: number
    notified: number
    notifiedTo: { slug: string; hours: number }[]
    wouldNotify: { slug: string; hours: number }[]
    skipped: SweepSkipped
    errors: number
}

type SummaryPayload = {
    dry: boolean
    outcome: 'ok' | 'aborted'
    candidates: number
    notified: number
    would_notify: number
    skipped: Record<string, number>
    errors: number
    triggered_by: string
    error?: string
}

/**
 * Deja la traza de la corrida en auditoría. NUNCA lanza: el resumen es evidencia, no el trabajo — si
 * el insert falla, los correos YA salieron y la corrida fue un éxito con la traza perdida.
 */
async function writeSummary(
    admin: ReturnType<typeof createServiceRoleClient>,
    payload: SummaryPayload
): Promise<void> {
    try {
        const row: TablesInsert<'admin_audit_logs'> = {
            admin_email: 'cron',
            action: 'cron.checkout_abandoned_ran',
            target_table: 'coaches',
            target_id: null,
            payload: payload as unknown as Json,
        }
        const { error } = await admin.from('admin_audit_logs').insert(row)
        if (error) console.error('[cron/checkout-abandoned] summary insert failed:', error.message)
    } catch (err) {
        console.error('[cron/checkout-abandoned] summary insert threw:', err)
    }
}

/** Horas enteras entre el `pending` y ahora — propiedad del evento, nunca una fecha con PII. */
function hoursSince(iso: string, now: Date): number {
    return Math.floor((now.getTime() - new Date(iso).getTime()) / (60 * 60 * 1000))
}

async function runSweep(
    admin: ReturnType<typeof createServiceRoleClient>,
    opts: { now: Date; dry: boolean }
): Promise<SweepResult> {
    const { now, dry } = opts

    const cases = await findAbandonedCases(admin, now)

    const skipped: SweepSkipped = {
        payingNow: 0,
        orgManaged: 0,
        coachMissing: 0,
        noRecipient: 0,
        testAccount: 0,
        deduped: 0,
        sendFailed: 0,
    }
    const notifiedTo: { slug: string; hours: number }[] = []
    const wouldNotify: { slug: string; hours: number }[] = []
    let notified = 0
    let errors = 0
    let attempts = 0
    const spacing = sendSpacingMs()

    if (cases.length === 0) {
        return { candidates: 0, notified, notifiedTo, wouldNotify, skipped, errors }
    }

    // Fila del coach para los dos guards de estado y para el nombre del correo.
    const coachById = new Map<string, CandidateCoach>()
    for (const chunk of chunked(cases.map((c) => c.coachId), COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<CandidateCoach>(
            (from, to) =>
                admin
                    .from('coaches')
                    .select(COACH_COLUMNS)
                    .in('id', chunk)
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        ).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            throw new Error(`coaches query failed: ${message}`)
        })
        for (const row of rows) coachById.set(row.id, row)
    }

    for (const abandoned of cases) {
        const coach = coachById.get(abandoned.coachId)
        if (!coach) {
            skipped.coachMissing++
            continue
        }

        try {
            // El plan de un coach dentro de una organización lo manda la org: no es su compra.
            if (coach.active_org_id) {
                skipped.orgManaged++
                continue
            }

            const tier = coach.subscription_tier ?? 'free'
            const status = coach.subscription_status ?? ''
            if (tier !== 'free' && (PAYING_STATUSES as readonly string[]).includes(status)) {
                skipped.payingNow++
                continue
            }

            const email = await resolveCoachEmail(admin, coach.id)
            if (!email) {
                skipped.noRecipient++
                continue
            }
            if (isTestCoachEmail(email)) {
                skipped.testAccount++
                continue
            }

            const hours = hoursSince(abandoned.pendingAtIso, now)

            if (dry) {
                wouldNotify.push({ slug: coach.slug, hours })
                continue
            }

            // Throttle de Resend: se espera ENTRE envíos reales (nunca antes del primero, nunca en
            // dry ni en los skips, que no tocan la API).
            if (attempts > 0 && spacing > 0) await sleep(spacing)
            attempts++

            // El estado real de la cuenta decide UN párrafo del correo: un coach bloqueado en
            // `pending_payment` no puede leer «tu cuenta ya está activa» (ver el template).
            const blocked = (SUBSCRIPTION_BLOCKED_STATUSES as readonly string[]).includes(status)
            const { subject, html } = buildCheckoutAbandonedEmail({
                coachName: coach.full_name?.trim() || 'Coach',
                accountState: blocked ? 'blocked' : 'active',
                subscriptionUrl: buildSubscriptionUrl({
                    utmSource: 'checkout_abandoned',
                    utmCampaign: 'checkout_abandoned',
                }),
            })

            const outcome = await scheduleCoachEmail(admin, {
                coachId: coach.id,
                templateKey: CHECKOUT_ABANDONED_TEMPLATE_KEY,
                trigger: 'behavior',
                to: email,
                subject,
                html,
                payload: {
                    coach_slug: coach.slug,
                    tier,
                    db_status: status,
                    provider: abandoned.provider,
                    hours_since_checkout: hours,
                },
            })

            if (!outcome.ok) {
                skipped.sendFailed++
                continue
            }
            if (outcome.deduped) {
                skipped.deduped++
                continue
            }

            // El correo salió y la fila del ledger es nueva ⇒ este abandono se cuenta UNA vez.
            await capturePostHogServerEvent({
                event: 'checkout_abandoned_at_gateway',
                distinctId: coach.id,
                properties: {
                    gateway: abandoned.provider,
                    tier,
                    coach_status: status,
                    hours_since_checkout: hours,
                    source: 'cron',
                },
            })

            notified++
            notifiedTo.push({ slug: coach.slug, hours })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[cron/checkout-abandoned] failed for coach ${coach.slug}:`, message)
            errors++
        }
    }

    return { candidates: cases.length, notified, notifiedTo, wouldNotify, skipped, errors }
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const admin = createServiceRoleClient()
    const now = new Date()

    const summary: SummaryPayload = {
        dry,
        outcome: 'ok',
        candidates: 0,
        notified: 0,
        would_notify: 0,
        skipped: {
            paying_now: 0,
            org_managed: 0,
            coach_missing: 0,
            no_recipient: 0,
            test_account: 0,
            deduped: 0,
            send_failed: 0,
        },
        errors: 0,
        triggered_by: 'cron/checkout-abandoned',
    }

    try {
        const result = await runSweep(admin, { now, dry })

        summary.candidates = result.candidates
        summary.notified = result.notified
        summary.would_notify = result.wouldNotify.length
        summary.skipped = {
            paying_now: result.skipped.payingNow,
            org_managed: result.skipped.orgManaged,
            coach_missing: result.skipped.coachMissing,
            no_recipient: result.skipped.noRecipient,
            test_account: result.skipped.testAccount,
            deduped: result.skipped.deduped,
            send_failed: result.skipped.sendFailed,
        }
        summary.errors = result.errors

        console.info(
            `[cron/checkout-abandoned] done — dry=${dry} candidates=${result.candidates} ` +
                `notified=${result.notified} wouldNotify=${result.wouldNotify.length} ` +
                `skipped=${JSON.stringify(result.skipped)} errors=${result.errors}`
        )

        return NextResponse.json({
            ok: true,
            dry,
            candidates: result.candidates,
            notified: result.notified,
            notifiedTo: result.notifiedTo,
            wouldNotify: result.wouldNotify,
            skipped: result.skipped,
            errors: result.errors,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/checkout-abandoned] sweep aborted:', message)
        summary.outcome = 'aborted'
        summary.error = message
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    } finally {
        await writeSummary(admin, summary)
    }
}
