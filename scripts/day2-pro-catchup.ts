import { pathToFileURL } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { isTestCoachEmail } from '@/lib/test-accounts'
import { buildDripTemplates, type DripTemplateKey } from '@/lib/email/drip-templates'
import { siteBaseUrl } from '@/lib/email/subscription-url'
import { scheduleCoachEmail } from '@/services/email/coach-email-ledger.service'
import { SALES_EMAIL_AUDIT_ACTIONS } from '@/services/billing/sales-emails.service'

/**
 * Reenvío ÚNICO del correo «día 2» del drip (`day2_pro`) a los coaches Free que nunca lo
 * recibieron (decisión D2 del owner, 05-09).
 *
 * POR QUÉ EXISTE: la higiene de casillas sin probar (`cancelDripForUnverifiedCoach`) canceló en
 * Resend los agendados de la tanda dada de alta desde el 23-08. Las filas quedaron `cancelled`, que
 * para el ledger es un estado ACTIVO, así que ni el drip ni ningún otro flujo lo va a volver a
 * mandar: sin este script ese correo no sale nunca.
 *
 * POR QUÉ UNA KEY NUEVA (`day2_pro_catchup`) Y NO `day2_pro`: el índice único parcial
 * `coach_email_ledger_dedupe_uidx` es `(coach_id, template_key) where status <> 'failed'`, y las
 * filas `cancelled` del original siguen vivas. Reusar la key haría que `scheduleCoachEmail`
 * deduplique (o que el INSERT choque con un 23505) y no salga nada. El CUERPO del correo sí es el
 * mismo `day2_pro`: se reenvía el correo, no se escribe uno nuevo.
 *
 * SEGURIDAD: `--dry` es el default y solo lista. `--send` exige además `CATCHUP_CONFIRM=yes` en el
 * entorno; sin eso aborta sin tocar Resend ni la base. Nunca imprime el email completo ni la
 * service role.
 *
 * CÓMO SE CORRE (esbuild ya está en el repo; `tmp/` está ignorado por git — `.tmp/` NO lo está):
 *
 *   pnpm exec esbuild scripts/day2-pro-catchup.ts --bundle --platform=node --format=esm
 *     --external:server-only --alias:@=./apps/web/src --outfile=tmp/day2-pro-catchup.mjs
 *   node --env-file=.env.local tmp/day2-pro-catchup.mjs --dry
 *
 * ...y para agendar de verdad, con el mismo bundle:
 *
 *   CATCHUP_CONFIRM=yes node --env-file=.env.local tmp/day2-pro-catchup.mjs --send
 *
 * SIN `--packages=external`, y no es un olvido: el cuerpo del correo pasa por `wrapEmailLayout`,
 * que arrastra `@eva/brand-kit` → `culori`. Con pnpm esa dependencia vive en
 * `packages/brand-kit/node_modules/`, así que un bundle en `tmp/` la deja sin resolver y el script
 * muere con `ERR_MODULE_NOT_FOUND` antes de leer una sola env. Bundleando todo son 966 kB de
 * archivo temporal y cero sorpresas de resolución. `server-only` sí queda externo por el flag: es
 * el marcador de Next, no un módulo que este proceso deba cargar.
 *
 * La lógica de decisión es PURA y vive en las funciones exportadas de este archivo;
 * `scripts/day2-pro-catchup.test.ts` la cubre con fixtures, sin red ni base.
 */

// ── Constantes del reenvío ──────────────────────────────────────────────────────────────────────

/**
 * Corte de alta de la tanda afectada (owner: «dados de alta desde el 23-08»). Es un literal y no
 * un `now - N días` a propósito: el universo del reenvío tiene que ser el MISMO corra el script hoy
 * o dentro de un mes, si no una segunda corrida barrería coaches que nunca estuvieron en la lista.
 */
export const CATCHUP_MIN_CREATED_AT = '2026-08-23T00:00:00.000Z'

/** Plantilla que se reenvía. Tipada contra el union: un rename de la key rompe la compilación. */
export const SOURCE_TEMPLATE_KEY: DripTemplateKey = 'day2_pro'

/** Key del reenvío en el ledger. Ver el docblock de arriba: NO puede ser `day2_pro`. */
export const CATCHUP_TEMPLATE_KEY = 'day2_pro_catchup'

/**
 * Estados que prueban que el `day2_pro` original ya salió o va a salir solo: `sent`/`delivered`
 * (Resend lo mandó) y `scheduled` (sigue en la cola de Resend y, con la higiene nueva de D1, ya
 * nadie se lo cancela por «no verificado»). Solo `cancelled` es la tanda que este script rescata;
 * `failed` nunca salió y también entra.
 */
export const DELIVERED_LEDGER_STATUSES: readonly string[] = ['sent', 'delivered', 'scheduled']

/**
 * El correo de «tope de alumnos» ya le dice lo mismo (así se amplía el cupo). Si el coach lo
 * recibió, el reenvío sería repetirle el argumento. La acción sale del service para que un rename
 * allá no deje este filtro apuntando a un string muerto.
 */
export const CAP_REACHED_AUDIT_ACTION = SALES_EMAIL_AUDIT_ACTIONS.client_limit_reached

/**
 * Hora «decente» por defecto, en UTC: 13:00Z = 10:00 en Chile con horario de verano (UTC-3). El
 * default del drip era `ahora + N días`, que en una corrida nocturna manda el correo de madrugada.
 */
export const DEFAULT_SEND_HOUR_UTC = 13

/** Pausa entre envíos: Resend limita por segundo y 24 POST seguidos se comen el rate limit. */
export const SEND_GAP_MS = 600

// ── Tipos del plan ──────────────────────────────────────────────────────────────────────────────

export type CoachCandidate = {
    id: string
    slug: string
    brandName: string
    coachName: string
    createdAt: string
    subscriptionTier: string
    subscriptionStatus: string
}

/** Fila del ledger reducida a lo que decide: la key y su estado. */
export type LedgerFact = { templateKey: string; status: string }

export type CoachFacts = {
    coach: CoachCandidate
    /** El email vive en `auth.users`, no en `coaches`. `null` = el admin API no lo devolvió. */
    email: string | null
    /** Alumnos REALES (ni demo ni archivados). Con >0 el coach ya recibe el correo de cupo. */
    realClients: number
    /** Filas vivas del coach para las dos keys que importan (`day2_pro` y el reenvío). */
    ledger: readonly LedgerFact[]
    /** ¿`admin_audit_logs` ya registró el correo de «tope de alumnos» para este coach? */
    capEmailSent: boolean
}

export type SkipReason =
    | 'no_es_free'
    | 'suscripcion_no_activa'
    | 'alta_anterior_al_corte'
    | 'sin_email'
    | 'email_de_prueba'
    | 'ya_tiene_alumnos'
    | 'day2_ya_enviado'
    | 'reenvio_ya_registrado'
    | 'ya_recibio_correo_de_cupo'

/** Etiqueta legible de cada motivo. Es lo único que se imprime: los motivos no llevan PII. */
export const SKIP_LABELS: Record<SkipReason, string> = {
    no_es_free: 'no es Free',
    suscripcion_no_activa: 'suscripción no activa',
    alta_anterior_al_corte: 'alta anterior al 23-08',
    sin_email: 'sin email en auth',
    email_de_prueba: 'cuenta de prueba',
    ya_tiene_alumnos: 'ya tiene alumnos',
    day2_ya_enviado: 'el día 2 ya le salió',
    reenvio_ya_registrado: 'reenvío ya registrado',
    ya_recibio_correo_de_cupo: 'ya recibió el correo de cupo',
}

export type CatchupDecision = { eligible: true } | { eligible: false; reason: SkipReason }

// ── Decisión (PURA) ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este coach entra al reenvío?
 *
 * El ORDEN de los cortes importa y es deliberado: primero lo que define el universo (tier, estado,
 * fecha de alta), después la identidad (email), y recién al final el estado del correo. Así el
 * motivo que se imprime es el más explicativo posible: un coach de prueba se reporta como tal y no
 * como «sin alumnos», aunque las dos cosas sean ciertas.
 *
 * Los tres primeros cortes ya los aplica la consulta a `coaches`; se repiten acá a propósito para
 * que la regla viva ENTERA en un lugar testeable y una consulta mal editada no cuele a nadie.
 */
export function decideCatchup(facts: CoachFacts): CatchupDecision {
    const { coach, email, realClients, ledger, capEmailSent } = facts

    if (coach.subscriptionTier !== 'free') return { eligible: false, reason: 'no_es_free' }
    if (coach.subscriptionStatus !== 'active') return { eligible: false, reason: 'suscripcion_no_activa' }

    // Un `created_at` ilegible cae del lado seguro: no se le manda nada.
    const createdAtMs = Date.parse(coach.createdAt)
    if (!Number.isFinite(createdAtMs) || createdAtMs < Date.parse(CATCHUP_MIN_CREATED_AT)) {
        return { eligible: false, reason: 'alta_anterior_al_corte' }
    }

    if (!email || !email.trim()) return { eligible: false, reason: 'sin_email' }
    if (isTestCoachEmail(email)) return { eligible: false, reason: 'email_de_prueba' }

    if (realClients > 0) return { eligible: false, reason: 'ya_tiene_alumnos' }

    const day2Salio = ledger.some(
        (row) => row.templateKey === SOURCE_TEMPLATE_KEY && DELIVERED_LEDGER_STATUSES.includes(row.status)
    )
    if (day2Salio) return { eligible: false, reason: 'day2_ya_enviado' }

    // `failed` es el ÚNICO estado reintentable (espejo de `ACTIVE_LEDGER_STATUSES`): una corrida
    // anterior que no pudo salir no puede dejar al coach fuera para siempre.
    const reenvioVivo = ledger.some(
        (row) => row.templateKey === CATCHUP_TEMPLATE_KEY && row.status !== 'failed'
    )
    if (reenvioVivo) return { eligible: false, reason: 'reenvio_ya_registrado' }

    if (capEmailSent) return { eligible: false, reason: 'ya_recibio_correo_de_cupo' }

    return { eligible: true }
}

export type SkippedEntry = { coach: CoachCandidate; email: string | null; reason: SkipReason }

export type CatchupPlan = {
    /** Cuántos coaches se evaluaron (lo que devolvió la consulta, antes de decidir). */
    candidates: number
    selected: CoachFacts[]
    skipped: SkippedEntry[]
    /** Elegibles que quedaron afuera SOLO por `--limit`. Se reporta para que no pase inadvertido. */
    trimmedByLimit: number
}

/**
 * Arma el plan completo a partir de los hechos ya recolectados. Separada de la recolección para que
 * el test la ejercite con fixtures: acá vive el «a quién le mandamos», que es lo que no puede
 * fallar.
 */
export function buildCatchupPlan(facts: readonly CoachFacts[], limit: number | null): CatchupPlan {
    const selected: CoachFacts[] = []
    const skipped: SkippedEntry[] = []

    for (const item of facts) {
        const decision = decideCatchup(item)
        if (decision.eligible) selected.push(item)
        else skipped.push({ coach: item.coach, email: item.email, reason: decision.reason })
    }

    const trimmedByLimit = limit !== null && selected.length > limit ? selected.length - limit : 0
    return {
        candidates: facts.length,
        selected: trimmedByLimit > 0 ? selected.slice(0, limit as number) : selected,
        skipped,
        trimmedByLimit,
    }
}

/** Conteo por motivo para el resumen final. Ordenado de mayor a menor. */
export function countSkipReasons(skipped: readonly SkippedEntry[]): Array<[SkipReason, number]> {
    const counts = new Map<SkipReason, number>()
    for (const row of skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

// ── Enmascarado y formato (PUROS) ───────────────────────────────────────────────────────────────

/**
 * `juan@gmail.com` → `j***@gmail.com`. La consola queda como evidencia en el chat y en el
 * scrollback del owner: el dominio alcanza para reconocer al coach, la casilla completa no hace
 * falta y sería PII regalada.
 */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return '(sin email)'
    const normalized = email.trim()
    if (!normalized) return '(sin email)'
    const at = normalized.lastIndexOf('@')
    // Sin `@` no hay dominio que mostrar: se enmascara entero antes que arriesgar un volcado.
    if (at < 0) return '***'
    const local = normalized.slice(0, at)
    const domain = normalized.slice(at + 1)
    return `${local.slice(0, 1)}***@${domain}`
}

/** Recorta a `width` con elipsis. Para que la tabla no se desarme con marcas largas. */
export function truncate(value: string, width: number): string {
    if (value.length <= width) return value
    return `${value.slice(0, Math.max(0, width - 1))}…`
}

/** `2026-08-25T04:12:00Z` → `2026-08-25`. Fecha ilegible → `????-??-??` (nunca `Invalid Date`). */
export function shortDate(iso: string): string {
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms)) return '????-??-??'
    return new Date(ms).toISOString().slice(0, 10)
}

const COLUMNS: ReadonlyArray<{ header: string; width: number }> = [
    { header: 'slug', width: 24 },
    { header: 'marca', width: 20 },
    { header: 'alta', width: 10 },
    { header: 'email', width: 28 },
    { header: 'estado', width: 28 },
]

function row(cells: readonly string[]): string {
    return cells.map((cell, i) => truncate(cell, COLUMNS[i].width).padEnd(COLUMNS[i].width)).join('  ')
}

/**
 * Tabla del plan: primero lo que SE VA a mandar, después lo saltado con su motivo. El saltado se
 * imprime igual (no solo el conteo) porque la revisión del owner es «¿falta alguien?», y eso no se
 * puede contestar con un número.
 */
export function renderPlanTable(plan: CatchupPlan): string {
    const lines: string[] = []
    lines.push(row(COLUMNS.map((c) => c.header)))
    lines.push(COLUMNS.map((c) => '─'.repeat(c.width)).join('  '))

    for (const item of plan.selected) {
        lines.push(
            row([
                item.coach.slug,
                item.coach.brandName,
                shortDate(item.coach.createdAt),
                maskEmail(item.email),
                'SE AGENDA',
            ])
        )
    }
    for (const item of plan.skipped) {
        lines.push(
            row([
                item.coach.slug,
                item.coach.brandName,
                shortDate(item.coach.createdAt),
                maskEmail(item.email),
                `salta: ${SKIP_LABELS[item.reason]}`,
            ])
        )
    }
    return lines.join('\n')
}

// ── Argumentos y entorno (PUROS: el entorno entra por parámetro) ────────────────────────────────

export type CatchupArgs = { send: boolean; at: string | null; limit: number | null }
export type ArgsResult = { ok: true; args: CatchupArgs } | { ok: false; error: string }

/**
 * Parsea la línea de comandos. Devuelve un resultado en vez de lanzar: el caller imprime UN mensaje
 * claro y sale con 1, que es lo que el owner necesita ver, no un stack.
 *
 * `--dry` es el default y también se acepta explícito; combinarlo con `--send` es un error y no
 * «gana el último»: en un script que manda correos, la ambigüedad se resuelve abortando.
 */
export function parseArgs(argv: readonly string[]): ArgsResult {
    const args: CatchupArgs = { send: false, at: null, limit: null }
    let dryExplicito = false

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i]
        if (flag === '--dry') {
            dryExplicito = true
        } else if (flag === '--send') {
            args.send = true
        } else if (flag === '--at') {
            const value = argv[++i]
            if (!value || value.startsWith('--')) return { ok: false, error: '--at necesita una fecha ISO (ej: --at 2026-09-08T13:00:00Z)' }
            args.at = value
        } else if (flag === '--limit') {
            const value = argv[++i]
            const parsed = Number(value)
            if (!value || !Number.isInteger(parsed) || parsed <= 0) {
                return { ok: false, error: '--limit necesita un entero positivo (ej: --limit 5)' }
            }
            args.limit = parsed
        } else {
            return { ok: false, error: `flag desconocida: «${flag}». Válidas: --dry --send --at <ISO> --limit N` }
        }
    }

    if (args.send && dryExplicito) {
        return { ok: false, error: '--dry y --send juntos no se pueden: elegí uno' }
    }
    return { ok: true, args }
}

export type EnvResult =
    | { ok: true; url: string; serviceKey: string; baseUrl: string }
    | { ok: false; error: string }

/**
 * Lee la configuración de Supabase del entorno recibido (NO de `process.env` directo: así el test
 * la ejercita sin ensuciar el proceso). Con env falsa o ausente el script tiene que abortar ACÁ,
 * antes de crear el client y antes de cualquier consulta.
 */
export function readSupabaseEnv(env: Record<string, string | undefined>): EnvResult {
    const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    const faltan: string[] = []
    if (!url) faltan.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) faltan.push('SUPABASE_SERVICE_ROLE_KEY')
    if (faltan.length > 0) {
        return { ok: false, error: `faltan variables de entorno: ${faltan.join(', ')} (probá con node --env-file=.env.local)` }
    }
    // `siteBaseUrl()` ya cae en producción cuando falta la env; no se duplica el default acá.
    return { ok: true, url: url as string, serviceKey: serviceKey as string, baseUrl: siteBaseUrl() }
}

export type GateResult = { ok: true } | { ok: false; error: string }

/**
 * Segundo cerrojo de `--send`, al estilo de `seed-e2e-personas.mjs`: la flag sola no alcanza, hace
 * falta `CATCHUP_CONFIRM=yes` en el entorno.
 *
 * También se exigen `RESEND_API_KEY` y `EMAIL_FROM` ANTES de empezar: sin ellas
 * `sendTransactionalEmail` devuelve error y `scheduleCoachEmail` deja una fila `failed` por coach.
 * Serían 24 filas basura en el ledger por una env olvidada.
 */
export function checkSendPreconditions(env: Record<string, string | undefined>): GateResult {
    if (env.CATCHUP_CONFIRM?.trim().toLowerCase() !== 'yes') {
        return { ok: false, error: '--send exige CATCHUP_CONFIRM=yes en el entorno. No se agendó nada.' }
    }
    const faltan: string[] = []
    if (!env.RESEND_API_KEY?.trim()) faltan.push('RESEND_API_KEY')
    if (!env.EMAIL_FROM?.trim()) faltan.push('EMAIL_FROM')
    if (faltan.length > 0) {
        return { ok: false, error: `--send sin ${faltan.join(' ni ')}: cada envío dejaría una fila «failed» en el ledger. Abortado.` }
    }
    return { ok: true }
}

/**
 * Próximo 13:00Z ESTRICTAMENTE futuro. Si ya pasó (o es exactamente ahora), se va al día siguiente:
 * Resend rechaza un `scheduled_at` en el pasado y un agendado «para ya» sale de madrugada, que es
 * justo lo que el owner pidió evitar.
 */
export function nextDecentSlot(now: Date): Date {
    const slot = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DEFAULT_SEND_HOUR_UTC, 0, 0, 0)
    )
    if (slot.getTime() <= now.getTime()) slot.setUTCDate(slot.getUTCDate() + 1)
    return slot
}

export type ScheduleResult = { ok: true; iso: string } | { ok: false; error: string }

/** Resuelve el `scheduledAt`: el `--at` del owner si lo hay (validado), si no el próximo 13:00Z. */
export function resolveScheduledAt(raw: string | null, now: Date): ScheduleResult {
    if (!raw) return { ok: true, iso: nextDecentSlot(now).toISOString() }
    const ms = Date.parse(raw)
    if (!Number.isFinite(ms)) return { ok: false, error: `--at no es una fecha válida: «${raw}»` }
    if (ms <= now.getTime()) {
        return { ok: false, error: `--at ya pasó (${new Date(ms).toISOString()}): Resend rechazaría el agendado` }
    }
    return { ok: true, iso: new Date(ms).toISOString() }
}

/** Parte una lista en lotes. Los `.in(...)` de PostgREST viajan en la URL y no aguantan cualquier largo. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

// ── Recolección (impura: acá empieza la base) ───────────────────────────────────────────────────

type Admin = SupabaseClient<Database>

/** Tope por lote de los `.in(...)`. Con la tanda del 23-08 nunca se roza; existe por si crece. */
const IN_BATCH = 100

async function collectFacts(admin: Admin): Promise<CoachFacts[]> {
    const { data, error } = await admin
        .from('coaches')
        .select('id, slug, brand_name, full_name, created_at, subscription_tier, subscription_status')
        .eq('subscription_tier', 'free')
        .eq('subscription_status', 'active')
        .gte('created_at', CATCHUP_MIN_CREATED_AT)
        .order('created_at', { ascending: true })

    if (error) throw new Error(`no se pudieron listar los coaches: ${error.message}`)

    const coaches: CoachCandidate[] = (data ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        brandName: c.brand_name,
        coachName: c.full_name,
        createdAt: c.created_at,
        subscriptionTier: c.subscription_tier,
        subscriptionStatus: c.subscription_status,
    }))
    if (coaches.length === 0) return []

    const ids = coaches.map((c) => c.id)
    const [clientCounts, ledgerByCoach, capSent] = await Promise.all([
        countRealClients(admin, ids),
        fetchLedger(admin, ids),
        fetchCapEmailSent(admin, ids),
    ])

    // El email vive en `auth.users`: una llamada por coach al admin API (no hay batch), secuencial
    // para no gatillar el rate limit de GoTrue con la tanda entera de golpe.
    const facts: CoachFacts[] = []
    for (const coach of coaches) {
        const { data: user, error: userError } = await admin.auth.admin.getUserById(coach.id)
        if (userError) {
            console.warn('[day2-catchup] no se pudo leer el usuario de auth', {
                coachId: coach.id,
                message: userError.message,
            })
        }
        facts.push({
            coach,
            email: user?.user?.email ?? null,
            realClients: clientCounts.get(coach.id) ?? 0,
            ledger: ledgerByCoach.get(coach.id) ?? [],
            capEmailSent: capSent.has(coach.id),
        })
    }
    return facts
}

/**
 * Alumnos reales por coach. Se traen las filas y se cuentan en memoria en vez de pedir un `count`
 * por coach: es UNA consulta por lote en lugar de N, y con el cupo Free son un puñado de filas.
 */
async function countRealClients(admin: Admin, ids: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    for (const batch of chunk(ids, IN_BATCH)) {
        const { data, error } = await admin
            .from('clients')
            .select('coach_id')
            .in('coach_id', batch)
            .eq('is_demo', false)
            .eq('is_archived', false)
        if (error) throw new Error(`no se pudieron contar los alumnos: ${error.message}`)
        for (const c of data ?? []) {
            if (!c.coach_id) continue
            counts.set(c.coach_id, (counts.get(c.coach_id) ?? 0) + 1)
        }
    }
    return counts
}

async function fetchLedger(admin: Admin, ids: readonly string[]): Promise<Map<string, LedgerFact[]>> {
    const byCoach = new Map<string, LedgerFact[]>()
    for (const batch of chunk(ids, IN_BATCH)) {
        const { data, error } = await admin
            .from('coach_email_ledger')
            .select('coach_id, template_key, status')
            .in('coach_id', batch)
            .in('template_key', [SOURCE_TEMPLATE_KEY, CATCHUP_TEMPLATE_KEY])
        if (error) throw new Error(`no se pudo leer el ledger de correos: ${error.message}`)
        for (const r of data ?? []) {
            const list = byCoach.get(r.coach_id) ?? []
            list.push({ templateKey: r.template_key, status: r.status })
            byCoach.set(r.coach_id, list)
        }
    }
    return byCoach
}

async function fetchCapEmailSent(admin: Admin, ids: readonly string[]): Promise<Set<string>> {
    const seen = new Set<string>()
    for (const batch of chunk(ids, IN_BATCH)) {
        const { data, error } = await admin
            .from('admin_audit_logs')
            .select('target_id')
            .eq('action', CAP_REACHED_AUDIT_ACTION)
            .in('target_id', batch)
        if (error) throw new Error(`no se pudo leer admin_audit_logs: ${error.message}`)
        for (const r of data ?? []) if (r.target_id) seen.add(r.target_id)
    }
    return seen
}

// ── Envío ───────────────────────────────────────────────────────────────────────────────────────

/** Cuerpo del `day2_pro` para este coach. Lanza si la key desaparece del catálogo (bug, no red). */
function day2Email(facts: CoachFacts, baseUrl: string): { subject: string; html: string } {
    const templates = buildDripTemplates({
        coachName: facts.coach.coachName,
        brandName: facts.coach.brandName,
        baseUrl,
        inviteCode: null,
    })
    const template = templates.find((t) => t.key === SOURCE_TEMPLATE_KEY)
    if (!template) throw new Error(`plantilla ausente: ${SOURCE_TEMPLATE_KEY}`)
    return { subject: template.subject, html: template.html }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Salida por consola ──────────────────────────────────────────────────────────────────────────

/**
 * `process.stdout.write` y no `console.log`: la salida de este script ES el entregable (el owner la
 * pega en la revisión) y el repo tiene `no-console` en warn para todo lo que no sea warn/error.
 */
function out(line = ''): void {
    process.stdout.write(`${line}\n`)
}

function fail(message: string): void {
    console.error(`[day2-catchup] ${message}`)
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
    const parsed = parseArgs(process.argv.slice(2))
    if (!parsed.ok) {
        fail(parsed.error)
        return 1
    }
    const args = parsed.args

    const env = readSupabaseEnv(process.env)
    if (!env.ok) {
        fail(env.error)
        return 1
    }

    // El cerrojo de `--send` se evalúa ANTES de crear el client: si falta la confirmación, el
    // script no tiene por qué llegar siquiera a abrir una conexión.
    if (args.send) {
        const gate = checkSendPreconditions(process.env)
        if (!gate.ok) {
            fail(gate.error)
            return 1
        }
    }

    const now = new Date()
    const schedule = resolveScheduledAt(args.at, now)
    if (!schedule.ok) {
        fail(schedule.error)
        return 1
    }

    const admin = createClient<Database>(env.url, env.serviceKey, {
        // Script de una sola corrida: no hay sesión que refrescar ni storage donde persistirla.
        auth: { autoRefreshToken: false, persistSession: false },
    })

    out(`[day2-catchup] modo: ${args.send ? 'SEND (agenda de verdad)' : 'DRY (solo lista)'}`)
    out(`[day2-catchup] agendado para: ${schedule.iso}`)
    out(`[day2-catchup] alta desde: ${CATCHUP_MIN_CREATED_AT}`)
    out()

    const facts = await collectFacts(admin)
    const plan = buildCatchupPlan(facts, args.limit)

    out(renderPlanTable(plan))
    out()

    let agendados = 0
    let deduplicados = 0
    let fallidos = 0

    if (args.send) {
        for (const item of plan.selected) {
            const { subject, html } = day2Email(item, env.baseUrl)
            const result = await scheduleCoachEmail(admin, {
                coachId: item.coach.id,
                templateKey: CATCHUP_TEMPLATE_KEY,
                trigger: 'drip',
                // `email` ya pasó por `decideCatchup`, que descarta el `null`.
                to: item.email as string,
                subject,
                html,
                scheduledAt: schedule.iso,
                payload: { source: SOURCE_TEMPLATE_KEY, catchup: true } as Record<string, Json>,
            })
            if (!result.ok) {
                fallidos += 1
                fail(`falló el agendado de ${item.coach.slug}: ${result.error}`)
            } else if (result.deduped) {
                deduplicados += 1
            } else {
                agendados += 1
            }
            await sleep(SEND_GAP_MS)
        }
    }

    out('── resumen ──')
    out(`candidatos evaluados: ${plan.candidates}`)
    out(`elegibles: ${plan.selected.length}${plan.trimmedByLimit > 0 ? ` (${plan.trimmedByLimit} fuera por --limit)` : ''}`)
    out(`agendados: ${args.send ? agendados : 0}${args.send ? '' : ' (dry-run: no se tocó nada)'}`)
    if (args.send) {
        out(`deduplicados: ${deduplicados}`)
        out(`fallidos: ${fallidos}`)
    }
    out('saltados por motivo:')
    for (const [reason, count] of countSkipReasons(plan.skipped)) {
        out(`  ${SKIP_LABELS[reason]}: ${count}`)
    }
    if (plan.skipped.length === 0) out('  (ninguno)')

    return fallidos > 0 ? 1 : 0
}

/**
 * Guarda de entrypoint: el test importa este módulo para cubrir las funciones puras, y sin esto
 * `main()` se dispararía dentro de Vitest e intentaría hablar con la base.
 */
const isEntrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false

if (isEntrypoint) {
    main().then(
        (code) => {
            process.exitCode = code
        },
        (err: unknown) => {
            fail(err instanceof Error ? err.message : String(err))
            process.exitCode = 1
        }
    )
}
