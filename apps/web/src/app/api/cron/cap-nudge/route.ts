import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    SALES_EMAIL_AUDIT_ACTIONS,
    resolveCoachEmail,
    sendClientLimitReachedEmail,
} from '@/services/billing/sales-emails.service'
import { isTestCoachEmail } from '@/lib/test-accounts'
import { tierMaxClientsFor, type SubscriptionTier } from '@/lib/constants'
import type { Json, TablesInsert } from '@/lib/database.types'
import {
    CAP_NUDGE_TIERS,
    isAtCap,
    resolveCapNudgeDecision,
    type CapNudgePriorSend,
} from './cap-nudge'

/**
 * Cron `cap-nudge` — BARRIDO diario de coaches que YA están en su cupo de alumnos.
 *
 * QUÉ HACE: busca coaches free activos y sin org, cuenta sus alumnos activos con el MISMO predicado
 * que el gate 402 del alta (`api/mobile/coach/clients/route.ts`), y a los que están llenos les manda
 * el correo de venta por cupo (`sendClientLimitReachedEmail`, variante `sweep`).
 *
 * POR QUÉ EXISTE: ese correo ya está desplegado, tiene kill-switch y ledger… y se envió CERO veces,
 * porque solo dispara cuando el coach INTENTA agregar un alumno y es rechazado. Con Pricing v3
 * (Free = 1 alumno) hay ~15 coaches «en cupo» permanentemente que nunca vuelven a intentar: el
 * evento no ocurre nunca y la venta jamás sale. Este cron es el que enciende el canal.
 *
 * ESCALERA (anti-spam): máximo 3 toques por nivel de cupo — T0, T0+7 d, T0+28 d — y después silencio
 * hasta que cambie `max_clients` (subir de plan o grandfather). La lógica vive pura en `cap-nudge.ts`;
 * el cooldown de 7 días del service es la segunda barrera (cubre el cruce evento↔cron).
 *
 * KILL-SWITCH: `EVA_SALES_EMAILS_DISABLED=client_limit_reached` (lo aplica el service; acá se cuenta
 * el outcome `skipped_disabled` y la corrida igual deja su resumen).
 *
 * `?dry=1`: corre el barrido completo (candidatos, conteo, escalera) SIN enviar nada y devuelve
 * `wouldSend` con los slugs y el toque que les tocaría. Es la forma de auditar la primera corrida.
 *
 * FAIL-CLOSED DEL LEDGER (no negociable): si `admin_audit_logs` no se puede leer, el barrido se
 * ABORTA sin enviar nada. Con el mapa de envíos previos vacío TODOS los coaches vuelven a parecer
 * `first_touch` y la escalera —la única barrera contra el spam eterno— desaparece: quedaría solo el
 * cooldown de 7 días del service, o sea un correo SEMANAL para siempre a gente que nunca intentó
 * nada. Perder un día de nudges no cuesta nada; quemar el dominio sí.
 *
 * FAIL-OPEN de a un coach: cada coach va en su propio try/catch y un outcome `failed` de Resend solo
 * se cuenta — un envío roto no aborta la corrida. Fail-CLOSED también para la auth: sin `CRON_SECRET`
 * el endpoint no responde nada.
 *
 * RESUMEN SIEMPRE (SPEC §Reglas 6): `cron.cap_nudge_ran` se escribe en el `finally`, tanto en la
 * corrida sana (`outcome: 'ok'`) como en la abortada (`outcome: 'aborted'` + `error`). Sin esa fila
 * no hay forma de distinguir «el cron corrió y no había nadie» de «el cron no corrió».
 *
 * Excluye cuentas de prueba (`isTestCoachEmail`, misma fuente que finanzas).
 */

/**
 * 15 envíos × (GoTrue + ledger + Resend + insert + los 600 ms de espaciado) ≈ 25 s: no entran en el
 * default de 10 s. 60 es el único valor con precedente en el repo (`mirror-exercise-thumbnails`) y es
 * válido en cualquier plan de Vercel; da para ~45 coaches en cupo por corrida (hoy 15). Si el barrido
 * se corta por tiempo, el resumen no se escribe: mirar la duración en Runtime Logs antes de subirlo.
 */
export const maxDuration = 60

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

type CandidateCoach = {
    id: string
    slug: string
    full_name: string | null
    created_at: string | null
    subscription_tier: string | null
    subscription_status: string | null
    max_clients: number | null
}

const CANDIDATE_COLUMNS =
    'id, slug, full_name, created_at, subscription_tier, subscription_status, max_clients'

/** Lookback del ledger: mismo horizonte generoso que el modo ancla del service. */
const LEDGER_LOOKBACK_DAYS = 400
/** PostgREST corta en 1000 filas por respuesta: todo listado se pagina con `.range` hasta página corta. */
const PAGE_SIZE = 1000
/** Guarda de bucle: 200 páginas × 1000 filas por listado, imposible hoy. */
const MAX_PAGES = 200
/** Tamaño de chunk de ids para los `.in` (evita URLs gigantes en el query string). */
const COACH_ID_CHUNK = 100

/**
 * Espaciado entre envíos REALES. Resend limita a 2 requests por segundo: 600 ms deja margen (~1,6
 * req/s) sin alargar de más una corrida de decenas de coaches. `CAP_NUDGE_SEND_SPACING_MS` en el env
 * lo pisa (los tests lo ponen en 0; en producción no hace falta tocarlo).
 */
const CAP_NUDGE_SEND_SPACING_MS = 600

function sendSpacingMs(): number {
    const raw = process.env.CAP_NUDGE_SEND_SPACING_MS?.trim()
    if (!raw) return CAP_NUDGE_SEND_SPACING_MS
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : CAP_NUDGE_SEND_SPACING_MS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type PageResponse = { data: unknown; error: { message: string } | null }

/**
 * Pagina un listado de PostgREST hasta la primera página corta.
 *
 * `buildQuery` DEBE traer su propio `.order(...)` ESTABLE antes del `.range`: sin orden explícito
 * Postgres no garantiza el mismo orden entre páginas y el paginado puede repetir u OMITIR filas
 * (una fila omitida acá es un coach que se pierde el correo, o peor: un alumno que no se cuenta y
 * deja al coach fuera del barrido).
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

/** El ledger no se pudo leer ⇒ la escalera no existe ⇒ se aborta la corrida (ver docblock). */
class LedgerUnreadableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LedgerUnreadableError'
    }
}

/**
 * Cuenta alumnos ACTIVOS por coach con el predicado EXACTO del gate 402 del alta:
 * `is_archived = false`, `is_demo = false`, `org_id IS NULL`, `team_id IS NULL` (workspace
 * standalone). Cualquier diferencia acá haría que el correo mienta sobre el cupo — con el alumno
 * de ejemplo del onboarding v2 contando, un coach 0/1 recibiría el correo de «llegaste al tope».
 * Pagina de a 1000 y agrupa en memoria.
 */
async function countActiveClients(
    admin: ReturnType<typeof createServiceRoleClient>,
    coachIds: string[]
): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    for (const id of coachIds) counts.set(id, 0)

    for (const chunk of chunked(coachIds, COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<{ coach_id: string | null }>(
            (from, to) =>
                admin
                    .from('clients')
                    .select('coach_id')
                    .in('coach_id', chunk)
                    .eq('is_archived', false)
                    .eq('is_demo', false)
                    .is('org_id', null)
                    .is('team_id', null)
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        ).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            throw new Error(`clients count failed: ${message}`)
        })

        for (const row of rows) {
            if (!row.coach_id) continue
            counts.set(row.coach_id, (counts.get(row.coach_id) ?? 0) + 1)
        }
    }

    return counts
}

/**
 * Lee el ledger de envíos del correo de cupo para TODOS los coaches en cupo de una vez (N+1 sería
 * una consulta por coach cada día). FAIL-CLOSED: cualquier fallo de lectura lanza
 * `LedgerUnreadableError` y aborta el barrido — un mapa vacío haría que todos parezcan `first_touch`
 * y el cron mandaría correo semanal para siempre (ver docblock del módulo).
 */
async function readPriorSends(
    admin: ReturnType<typeof createServiceRoleClient>,
    coachIds: string[],
    now: Date
): Promise<Map<string, CapNudgePriorSend[]>> {
    const byCoach = new Map<string, CapNudgePriorSend[]>()
    if (coachIds.length === 0) return byCoach

    const sinceIso = new Date(now.getTime() - LEDGER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

    for (const chunk of chunked(coachIds, COACH_ID_CHUNK)) {
        // `created_at desc, id asc`: el desempate por id hace el orden TOTAL y estable entre páginas.
        const rows = await fetchAllPages<{
            target_id: string | null
            created_at: string | null
            payload: unknown
        }>(
            (from, to) =>
                admin
                    .from('admin_audit_logs')
                    .select('target_id, created_at, payload')
                    .eq('action', SALES_EMAIL_AUDIT_ACTIONS.client_limit_reached)
                    .in('target_id', chunk)
                    .gte('created_at', sinceIso)
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        ).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            throw new LedgerUnreadableError(message)
        })

        for (const row of rows) {
            if (!row.target_id || !row.created_at) continue
            const payload = row.payload as { current_limit?: unknown } | null
            const currentLimit = typeof payload?.current_limit === 'number' ? payload.current_limit : null
            const list = byCoach.get(row.target_id) ?? []
            list.push({ sentAt: row.created_at, currentLimit })
            byCoach.set(row.target_id, list)
        }
    }

    return byCoach
}

type SweepSkipped = {
    noRecipient: number
    testAccount: number
    maxTouches: number
    ladderNotDue: number
    duplicate: number
    disabled: number
    failed: number
}

type SweepResult = {
    candidates: number
    atCap: number
    sent: number
    sentTo: { slug: string; touch: number }[]
    wouldSend: { slug: string; touch: number }[]
    skipped: SweepSkipped
    errors: number
}

type SummaryPayload = {
    dry: boolean
    outcome: 'ok' | 'aborted'
    candidates: number
    at_cap: number
    sent: number
    would_send: number
    skipped: Record<string, number>
    errors: number
    triggered_by: string
    error?: string
    ledger_unreadable?: boolean
}

/**
 * Deja la traza de la corrida en auditoría. NUNCA lanza ni propaga: el resumen es evidencia, no el
 * trabajo — si el insert falla (o devuelve `error`) los correos YA salieron y la corrida es un éxito
 * con la traza perdida, así que se loguea y se sigue.
 */
async function writeSummary(
    admin: ReturnType<typeof createServiceRoleClient>,
    payload: SummaryPayload
): Promise<void> {
    try {
        const row: TablesInsert<'admin_audit_logs'> = {
            admin_email: 'cron',
            action: 'cron.cap_nudge_ran',
            target_table: 'coaches',
            target_id: null,
            payload: payload as unknown as Json,
        }
        const { error } = await admin.from('admin_audit_logs').insert(row)
        if (error) {
            console.error('[cron/cap-nudge] summary insert failed:', error.message)
        }
    } catch (err) {
        console.error('[cron/cap-nudge] summary insert threw:', err)
    }
}

/**
 * El barrido completo. Lanza ante cualquier fallo que invalide la corrida (query de coaches, conteo
 * de alumnos, ledger ilegible); los fallos POR COACH se cuentan y no cortan el bucle.
 */
async function runSweep(
    admin: ReturnType<typeof createServiceRoleClient>,
    opts: { now: Date; dry: boolean }
): Promise<SweepResult> {
    const { now, dry } = opts

    // Candidatos: coaches free ACTIVOS trabajando en su espacio propio. `active_org_id IS NULL`
    // deja fuera a quien está operando dentro de una organización (su cupo lo manda la org, no su
    // plan personal: mandarle un correo de venta sería falso).
    const candidates = await fetchAllPages<CandidateCoach>(
        (from, to) =>
            admin
                .from('coaches')
                .select(CANDIDATE_COLUMNS)
                .in('subscription_tier', [...CAP_NUDGE_TIERS])
                .eq('subscription_status', 'active')
                .is('active_org_id', null)
                .order('id', { ascending: true })
                .range(from, to),
        PAGE_SIZE
    ).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`candidate query failed: ${message}`)
    })

    const counts = await countActiveClients(
        admin,
        candidates.map((c) => c.id)
    )

    // Cupo real del coach: la columna gana (grandfather por USO de pricing v3) y el helper de fecha
    // es el fallback. Mismo orden que el gate 402 — el correo no puede contradecir al muro.
    const atCap = candidates
        .map((coach) => {
            const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
            const maxClients = coach.max_clients ?? tierMaxClientsFor(tier, coach.created_at)
            return { coach, tier, maxClients, activeCount: counts.get(coach.id) ?? 0 }
        })
        .filter((row) => isAtCap({ activeCount: row.activeCount, maxClients: row.maxClients }))

    const priorSendsByCoach = await readPriorSends(
        admin,
        atCap.map((row) => row.coach.id),
        now
    )

    let sent = 0
    let errors = 0
    let attempts = 0
    const spacing = sendSpacingMs()
    const sentTo: { slug: string; touch: number }[] = []
    const wouldSend: { slug: string; touch: number }[] = []
    const skipped: SweepSkipped = {
        noRecipient: 0,
        testAccount: 0,
        maxTouches: 0,
        ladderNotDue: 0,
        duplicate: 0,
        disabled: 0,
        failed: 0,
    }

    for (const row of atCap) {
        const { coach, tier, maxClients } = row
        try {
            // La decisión va PRIMERO: un coach en el tope de la escalera no puede costar una llamada
            // a GoTrue por día (la mayoría de las corridas son puro skip).
            const decision = resolveCapNudgeDecision({
                priorSends: priorSendsByCoach.get(coach.id) ?? [],
                currentLimit: maxClients,
                now,
            })
            if (decision.action === 'skip') {
                if (decision.reason === 'max_touches') skipped.maxTouches++
                else skipped.ladderNotDue++
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

            if (dry) {
                wouldSend.push({ slug: coach.slug, touch: decision.touch })
                continue
            }

            // Throttle: Resend corta en 2 req/s. Se espera ENTRE envíos reales (nunca antes del
            // primero, nunca en dry ni en los skips, que no tocan la API).
            if (attempts > 0 && spacing > 0) await sleep(spacing)
            attempts++

            const outcome = await sendClientLimitReachedEmail(admin, {
                coachId: coach.id,
                coachEmail: email,
                coachName: coach.full_name,
                tier,
                currentLimit: maxClients,
                source: 'cron_cap_nudge',
                trigger: 'sweep',
            })

            if (outcome === 'sent') {
                sent++
                sentTo.push({ slug: coach.slug, touch: decision.touch })
            } else if (outcome === 'skipped_duplicate') skipped.duplicate++
            else if (outcome === 'skipped_disabled') skipped.disabled++
            else if (outcome === 'skipped_no_recipient') skipped.noRecipient++
            else skipped.failed++
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[cron/cap-nudge] failed for coach ${coach.slug}:`, message)
            errors++
        }
    }

    return {
        candidates: candidates.length,
        atCap: atCap.length,
        sent,
        sentTo,
        wouldSend,
        skipped,
        errors,
    }
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const admin = createServiceRoleClient()
    const now = new Date()

    // El resumen se arma acá y se escribe en el `finally`: pase lo que pase adentro, la corrida deja
    // su fila (SPEC §Reglas 6). Los caminos de error lo pisan con `outcome: 'aborted'`.
    const summary: SummaryPayload = {
        dry,
        outcome: 'ok',
        candidates: 0,
        at_cap: 0,
        sent: 0,
        would_send: 0,
        skipped: {
            no_recipient: 0,
            test_account: 0,
            max_touches: 0,
            ladder_not_due: 0,
            duplicate: 0,
            disabled: 0,
            failed: 0,
        },
        errors: 0,
        triggered_by: 'cron/cap-nudge',
    }

    try {
        const result = await runSweep(admin, { now, dry })

        summary.candidates = result.candidates
        summary.at_cap = result.atCap
        summary.sent = result.sent
        summary.would_send = result.wouldSend.length
        summary.skipped = {
            no_recipient: result.skipped.noRecipient,
            test_account: result.skipped.testAccount,
            max_touches: result.skipped.maxTouches,
            ladder_not_due: result.skipped.ladderNotDue,
            duplicate: result.skipped.duplicate,
            disabled: result.skipped.disabled,
            failed: result.skipped.failed,
        }
        summary.errors = result.errors

        console.info(
            `[cron/cap-nudge] done — dry=${dry} candidates=${result.candidates} atCap=${result.atCap} ` +
                `sent=${result.sent} wouldSend=${result.wouldSend.length} ` +
                `skipped=${JSON.stringify(result.skipped)} errors=${result.errors}`
        )

        return NextResponse.json({
            ok: true,
            dry,
            candidates: result.candidates,
            atCap: result.atCap,
            sent: result.sent,
            sentTo: result.sentTo,
            wouldSend: result.wouldSend,
            skipped: result.skipped,
            errors: result.errors,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const ledgerUnreadable = err instanceof LedgerUnreadableError
        console.error('[cron/cap-nudge] sweep aborted:', message)

        summary.outcome = 'aborted'
        summary.error = message
        if (ledgerUnreadable) summary.ledger_unreadable = true

        return NextResponse.json(
            { ok: false, error: ledgerUnreadable ? 'ledger unreadable' : 'DB query failed' },
            { status: 500 }
        )
    } finally {
        await writeSummary(admin, summary)
    }
}
