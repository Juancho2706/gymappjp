import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isTestCoachEmail } from '@/lib/test-accounts'
import { normalizePlatformEmail, sanitizePlatformEmail } from '@/lib/auth/platform-email'

/**
 * north-star-weekly — la consulta de cohorte de W0.1 (`docs/specs/flujo-coach-nuevo/TASKS.md`)
 * traducida a TypeScript para que la North Star se calcule SOLA una vez por semana.
 *
 * POR QUÉ NO ES SQL: `createServiceRoleClient` habla PostgREST, no Postgres. No ejecuta SQL crudo
 * y no expone el schema `auth`, así que el `join auth.users` de la consulta canónica (el correo del
 * coach, su teléfono, `email_confirmed_at`, y el `last_sign_in_at` del alumno) se resuelve con
 * `auth.admin.getUserById(id)` — una llamada por id. La cohorte de una semana es chica (~30 coaches
 * + ~15 alumnos), así que el costo es del orden de segundos, muy por debajo del `maxDuration` de 60.
 *
 * VENTANA: la SEMANA ISO UTC ANTERIOR COMPLETA (lunes 00:00 → lunes 00:00). El cron corre los lunes
 * 13:00 UTC, así que reporta la semana recién cerrada. El CORTE DE DATOS es `now`, no el fin de la
 * ventana: «maduró a 72 h» y «entró» se leen contra el presente, igual que en la SQL (`params.corte`).
 *
 * SEMÁNTICA: idéntica a la consulta canónica, incluidas sus dos advertencias vivas —
 *  (a) `last_sign_in_at` es el ÚLTIMO login, no el primero: es una COTA de «entró», no la métrica
 *      final (esa llega con `clients.first_login_at`, W1.1–W1.5);
 *  (b) la exclusión del autoinvitado por normalización captura CERO casos reales conocidos, por eso
 *      existe `SELF_INVITES_MANUAL` (ver abajo).
 *
 * PII: la fila resultante son solo conteos y porcentajes. Ningún correo, teléfono ni id sale de acá,
 * y por lo tanto tampoco entra al correo que arma `buildNorthStarEmail`.
 */

type Admin = SupabaseClient<Database>

/** PostgREST corta en 1000 filas por respuesta: todo listado se pagina hasta página corta. */
const PAGE_SIZE = 1000
/** Guarda de bucle: 200 páginas × 1000 filas, imposible con una cohorte semanal. */
const MAX_PAGES = 200
/** Tamaño de chunk de ids para los `.in` (evita URLs gigantes en el query string). */
const COACH_ID_CHUNK = 100

/**
 * n MÍNIMO POR GUARDARRAÍL (regla dura de W0.1 / SPEC §2.2): bajo esto la celda va NULL y el
 * reporte imprime «sin lectura». Con n = 9 un coach de diferencia mueve el indicador 11 pp: sin
 * este piso los guardarraíles dispararían reverts por ruido.
 */
export const MIN_N_GUARDRAIL = 20

/**
 * Los DOS defaults históricos de `coaches.primary_color`. La columna tiene DEFAULT y SIEMPRE viene
 * seteada (verificado en LIVE, G-BASE), así que «marca propia por color» = distinto de estos dos:
 * `#1462DC` es el default actual y `#10B981` el de antes del cambio verde→azul.
 */
export const DEFAULT_PRIMARY_COLORS = ['#1462DC', '#10B981'] as const

/**
 * Autoinvitados CONFIRMADOS A MANO que `normalizePlatformEmail` no captura.
 *
 * El coach que se invita a sí mismo para probar la app no es un alumno: contarlo infla la North
 * Star. La normalización cubre el caso fácil (`coach+alumno@gmail.com`, los puntos de Gmail), pero
 * el caso #28 de la cohorte 18→23-08 (SPEC §1.1) usó un SEGUNDO CORREO sin parentesco textual:
 * `palaciosjob98@gmail.com` creó a `jobpal46@gmail.com` cinco minutos después de su alta, sin
 * teléfono, y ese alumno nunca entró. Ninguna normalización puede deducir eso, así que va a mano.
 *
 * Pares `[correo del coach, correo del alumno]`, comparados en forma saneada (trim + minúsculas).
 */
export const SELF_INVITES_MANUAL: readonly (readonly [string, string])[] = [
    ['palaciosjob98@gmail.com', 'jobpal46@gmail.com'],
] as const

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Una fila por semana: la misma que devuelve la consulta canónica de W0.1. */
export type NorthStarWeeklyRow = {
    /** Lunes ISO UTC de la ventana, `YYYY-MM-DD` (el `date_trunc('week', …)` de la SQL). */
    semana: string
    /** Ventana de la cohorte y corte de datos, en ISO, para poder auditar la corrida. */
    desde: string
    hasta: string
    corte: string
    n: number
    invitaron_ns: number
    invitaron_cruda: number
    activados: number
    maduras_72h: number
    activados_72h: number
    /** `null` si ningún coach de la cohorte maduró a 72 h todavía. */
    north_star_pct: number | null
    /** Guardarrailes: `null` = «sin lectura» (n < MIN_N_GUARDRAIL). */
    pct_marca_color: number | null
    pct_marca_logo: number | null
    pct_persona: number | null
    altas_sobre_tope_ip: number
    /** Base propia: coaches maduros a 7 días con `subscription_status='active'`. */
    pct_active_sin_verificar_7d: number | null
    n_active_7d: number
    /** Guardas anti-fraude (conteos crudos, nunca porcentajes). */
    logins_bajo_120s: number
    mismo_fono: number
}

type CoachRow = {
    id: string
    created_at: string
    persona: string | null
    primary_color: string | null
    logo_url: string | null
    subscription_status: string | null
    registration_ip: string | null
}

const COACH_COLUMNS =
    'id, created_at, persona, primary_color, logo_url, subscription_status, registration_ip'

type ClientRow = {
    id: string
    coach_id: string | null
    /** NOT NULL en la tabla; se tipa nullable porque acá llega de un cast de PostgREST. */
    email: string | null
    created_at: string
    phone: string | null
}

const CLIENT_COLUMNS = 'id, coach_id, email, created_at, phone'

type AuthUserInfo = {
    email: string | null
    phone: string | null
    emailConfirmedAt: string | null
    lastSignInAt: string | null
}

type CohortCoach = CoachRow & { email: string; auth: AuthUserInfo }

type CohortClient = ClientRow & {
    lastSignInAt: string | null
    selfInvited: boolean
}

type PageResponse = { data: unknown; error: { message: string } | null }

/**
 * Pagina un listado de PostgREST hasta la primera página corta. `buildQuery` DEBE traer su propio
 * `.order(...)` ESTABLE antes del `.range`: sin orden explícito Postgres puede repetir u OMITIR
 * filas entre páginas, y una fila omitida acá es un coach que desaparece de la métrica.
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

/** Lunes 00:00:00 UTC de la semana que contiene `d` (mismo corte que `date_trunc('week', …)`). */
export function isoWeekStartUtc(d: Date): Date {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const mondayOffset = (t.getUTCDay() + 6) % 7 // domingo=0 ⇒ 6; lunes=1 ⇒ 0
    t.setUTCDate(t.getUTCDate() - mondayOffset)
    return t
}

/** Ventana de la corrida: la semana ISO UTC anterior completa, con el corte de datos en `now`. */
export function previousIsoWeekWindow(now: Date): { desde: Date; hasta: Date; corte: Date } {
    const hasta = isoWeekStartUtc(now)
    const desde = new Date(hasta.getTime() - 7 * DAY_MS)
    return { desde, hasta, corte: now }
}

/** `round(100.0 * num / den, 1)`; `null` cuando no hay denominador (misma forma que la SQL). */
function pct(num: number, den: number): number | null {
    if (den <= 0) return null
    return Math.round((1000 * num) / den) / 10
}

/** Solo dígitos, y solo si quedan al menos 8. */
function phoneTail(raw: string | null | undefined): string | null {
    if (!raw) return null
    const digits = raw.replace(/\D/g, '')
    // La SQL usa `right(…, 8)` a secas; acá se exige un mínimo de 8 dígitos porque dos teléfonos
    // sin ningún dígito darían '' = '' y la guarda se dispararía sola.
    if (digits.length < 8) return null
    return digits.slice(-8)
}

async function fetchAuthUser(admin: Admin, id: string): Promise<AuthUserInfo | null> {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (error || !data?.user) return null
    const u = data.user
    return {
        email: u.email ?? null,
        phone: u.phone ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
    }
}

/**
 * Cohorte de coaches: altas de la ventana, fuera de organización, con su fila de `auth.users`.
 * El `join auth.users` de la SQL es INNER: un coach sin usuario de auth (o sin correo) no entra —
 * no se le puede aplicar la purga de cuentas de prueba ni resolver la autoinvitación.
 */
async function loadCohort(admin: Admin, desde: Date, hasta: Date): Promise<CohortCoach[]> {
    const rows = await fetchAllPages<CoachRow>(
        (from, to) =>
            admin
                .from('coaches')
                .select(COACH_COLUMNS)
                .gte('created_at', desde.toISOString())
                .lt('created_at', hasta.toISOString())
                .is('active_org_id', null)
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to),
        PAGE_SIZE
    ).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`coaches query failed: ${message}`)
    })

    const out: CohortCoach[] = []
    for (const row of rows) {
        const auth = await fetchAuthUser(admin, row.id)
        if (!auth?.email) continue
        const email = sanitizePlatformEmail(auth.email)
        if (!email) continue
        // Purga de cuentas de prueba de COACH por el espejo canónico (@evatest.cl + lista
        // explícita). Los ALUMNOS jamás se purgan por dominio: los demo comparten @evatest.cl y
        // ya salen por `is_demo`.
        if (isTestCoachEmail(email)) continue
        out.push({ ...row, email, auth })
    }
    return out
}

/**
 * Alumnos de la cohorte con el predicado canónico COMPLETO de SPEC §2.1:
 * `is_demo IS NOT TRUE AND is_archived = false AND org_id IS NULL AND team_id IS NULL`,
 * creados hasta el corte. `clients.id` ES el auth uid del alumno (verificado en LIVE), así que su
 * `last_sign_in_at` se pide por ese mismo id.
 */
async function loadClients(
    admin: Admin,
    coaches: CohortCoach[],
    corte: Date
): Promise<Map<string, CohortClient[]>> {
    const byCoach = new Map<string, CohortClient[]>()
    if (coaches.length === 0) return byCoach

    const emailByCoachId = new Map(coaches.map((c) => [c.id, c.email] as const))
    const normByCoachId = new Map(
        coaches.map((c) => [c.id, normalizePlatformEmail(c.email)] as const)
    )
    const manualPairs = new Set(
        SELF_INVITES_MANUAL.map(
            ([coachEmail, clientEmail]) =>
                `${sanitizePlatformEmail(coachEmail)} ${sanitizePlatformEmail(clientEmail)}`
        )
    )

    for (const chunk of chunked(coaches.map((c) => c.id), COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<ClientRow>(
            (from, to) =>
                admin
                    .from('clients')
                    .select(CLIENT_COLUMNS)
                    .in('coach_id', chunk)
                    .not('is_demo', 'is', true)
                    .eq('is_archived', false)
                    .is('org_id', null)
                    .is('team_id', null)
                    .lte('created_at', corte.toISOString())
                    .order('created_at', { ascending: true })
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        ).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            throw new Error(`clients query failed: ${message}`)
        })

        for (const row of rows) {
            if (!row.coach_id) continue
            const coachEmail = emailByCoachId.get(row.coach_id)
            const coachNorm = normByCoachId.get(row.coach_id)
            if (!coachEmail || !coachNorm) continue

            const clientEmail = sanitizePlatformEmail(row.email ?? '')
            const selfInvited =
                normalizePlatformEmail(clientEmail) === coachNorm ||
                manualPairs.has(`${coachEmail} ${clientEmail}`)

            const auth = await fetchAuthUser(admin, row.id)
            const list = byCoach.get(row.coach_id) ?? []
            list.push({ ...row, lastSignInAt: auth?.lastSignInAt ?? null, selfInvited })
            byCoach.set(row.coach_id, list)
        }
    }
    return byCoach
}

/**
 * Calcula la fila de la semana. Pura respecto de sus entradas: todo lo que varía —la fecha de
 * corte— entra por `opts.now`, así que la misma cohorte con el mismo `now` da siempre la misma fila.
 */
export async function computeNorthStarWeeklyRow(
    admin: Admin,
    opts: { now: Date }
): Promise<NorthStarWeeklyRow> {
    const { desde, hasta, corte } = previousIsoWeekWindow(opts.now)
    const corteMs = corte.getTime()

    const cohort = await loadCohort(admin, desde, hasta)
    const clientsByCoach = await loadClients(admin, cohort, corte)

    let invitaronNs = 0
    let invitaronCruda = 0
    let activados = 0
    let maduras72h = 0
    let activados72h = 0
    let marcaColor = 0
    let marcaLogo = 0
    let persona = 0
    let nActive7d = 0
    let activeSinVerificar = 0
    let loginsBajo120s = 0
    let mismoFono = 0
    const altasPorIp = new Map<string, number>()

    for (const coach of cohort) {
        const clients = clientsByCoach.get(coach.id) ?? []
        const reales = clients.filter((c) => !c.selfInvited)
        const coachCreatedMs = new Date(coach.created_at).getTime()

        if (reales.length > 0) invitaronNs++
        if (clients.length > 0) invitaronCruda++

        // «Entró»: cota por `last_sign_in_at` (ver docblock). Solo alumnos NO autoinvitados.
        if (reales.some((c) => c.lastSignInAt !== null && new Date(c.lastSignInAt).getTime() <= corteMs)) {
            activados++
        }

        const madura72h = coachCreatedMs + 72 * HOUR_MS <= corteMs
        if (madura72h) {
            maduras72h++
            const dentro = reales.some(
                (c) =>
                    c.lastSignInAt !== null &&
                    new Date(c.lastSignInAt).getTime() <= coachCreatedMs + 72 * HOUR_MS
            )
            if (dentro) activados72h++
        }

        // Guardarrailes de marca / persona.
        const color = coach.primary_color
        if (color && !(DEFAULT_PRIMARY_COLORS as readonly string[]).includes(color)) marcaColor++
        if (coach.logo_url !== null) marcaLogo++
        if (coach.persona !== null) persona++

        // Tope de 3 altas free por IP en 7 días: se cuenta el EXCESO, no las altas.
        if (coach.registration_ip) {
            altasPorIp.set(coach.registration_ip, (altasPorIp.get(coach.registration_ip) ?? 0) + 1)
        }

        // «active sin verificar a 7 días»: base propia (maduros a 7 d y en estado `active`).
        // HOY la señal de verificación es `auth.users.email_confirmed_at` — hoy ningún alta free
        // nace confirmada. Cuando W3.0 despliegue `coaches.email_verified_at` (con D1 = A el alta
        // nace con `email_confirm: true` y esta columna daría 0 % para siempre), la señal pasa a
        // esa columna con la MISMA forma NULL-safe; el backfill de W3.0 las deja equivalentes.
        const madura7d = coachCreatedMs + 7 * DAY_MS <= corteMs
        if (madura7d && coach.subscription_status === 'active') {
            nActive7d++
            const confirmed = coach.auth.emailConfirmedAt
            const sinVerificar =
                confirmed === null ||
                new Date(confirmed).getTime() > coachCreatedMs + 7 * DAY_MS
            if (sinVerificar) activeSinVerificar++
        }

        // Guardas anti-fraude: se cuentan sobre TODOS los alumnos, autoinvitados incluidos — son
        // señal para mirar a mano, no un filtro de la métrica.
        const coachTail = phoneTail(coach.auth.phone)
        for (const c of clients) {
            if (c.lastSignInAt !== null) {
                const delta = new Date(c.lastSignInAt).getTime() - new Date(c.created_at).getTime()
                if (delta < 120 * 1000) loginsBajo120s++
            }
            const clientTail = phoneTail(c.phone)
            if (coachTail && clientTail && coachTail === clientTail) mismoFono++
        }
    }

    const n = cohort.length
    const conLectura = n >= MIN_N_GUARDRAIL

    let altasSobreTopeIp = 0
    for (const count of altasPorIp.values()) altasSobreTopeIp += Math.max(0, count - 3)

    return {
        // La cohorte cabe entera en una semana ISO, así que `date_trunc('week', created_at)` de la
        // SQL es siempre el lunes de la ventana.
        semana: desde.toISOString().slice(0, 10),
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        corte: corte.toISOString(),
        n,
        invitaron_ns: invitaronNs,
        invitaron_cruda: invitaronCruda,
        activados,
        maduras_72h: maduras72h,
        activados_72h: activados72h,
        north_star_pct: pct(activados72h, maduras72h),
        pct_marca_color: conLectura ? pct(marcaColor, n) : null,
        pct_marca_logo: conLectura ? pct(marcaLogo, n) : null,
        pct_persona: conLectura ? pct(persona, n) : null,
        altas_sobre_tope_ip: altasSobreTopeIp,
        pct_active_sin_verificar_7d:
            nActive7d >= MIN_N_GUARDRAIL ? pct(activeSinVerificar, nActive7d) : null,
        n_active_7d: nActive7d,
        logins_bajo_120s: loginsBajo120s,
        mismo_fono: mismoFono,
    }
}

/** Texto de «sin lectura»: la celda vacía sería indistinguible de un 0 %, que significa lo opuesto. */
export const SIN_LECTURA = 'sin lectura'

/** Porcentaje en es-latam (coma decimal, un decimal). */
function fmtPct(value: number | null): string {
    if (value === null) return SIN_LECTURA
    return `${value.toFixed(1).replace('.', ',')} %`
}

type EmailCell = { label: string; value: string; n: string; note?: string }

/**
 * Arma el correo del lunes. Tabla simple: cada indicador con su valor y el `n` sobre el que se
 * calculó — sin el `n` un porcentaje no se puede juzgar, que es todo el punto de la regla del piso.
 * No lleva PII: la fila de entrada son solo conteos.
 */
export function buildNorthStarEmail(row: NorthStarWeeklyRow): { subject: string; html: string } {
    const subject = `North Star semanal — semana del ${row.semana}: ${fmtPct(row.north_star_pct)}`

    const metricas: EmailCell[] = [
        { label: 'Altas de coach en la semana', value: String(row.n), n: '—' },
        {
            label: 'Invitaron al menos un alumno (North Star)',
            value: String(row.invitaron_ns),
            n: String(row.n),
            note: 'sin autoinvitados',
        },
        {
            label: 'Invitaron (cruda)',
            value: String(row.invitaron_cruda),
            n: String(row.n),
            note: 'con autoinvitados, para conciliar',
        },
        { label: 'Con alumno que entró', value: String(row.activados), n: String(row.n) },
        { label: 'Maduraron a 72 h', value: String(row.maduras_72h), n: String(row.n) },
        {
            label: 'Alumno dentro de 72 h',
            value: String(row.activados_72h),
            n: String(row.maduras_72h),
        },
        {
            label: 'NORTH STAR',
            value: fmtPct(row.north_star_pct),
            n: String(row.maduras_72h),
            note: 'activados dentro de 72 h / maduros a 72 h',
        },
    ]

    const guardarrailes: EmailCell[] = [
        { label: 'Marca propia (color)', value: fmtPct(row.pct_marca_color), n: String(row.n) },
        { label: 'Marca propia (logo)', value: fmtPct(row.pct_marca_logo), n: String(row.n) },
        { label: 'Persona elegida', value: fmtPct(row.pct_persona), n: String(row.n) },
        {
            label: 'Altas por encima del tope de 3 free por IP',
            value: String(row.altas_sobre_tope_ip),
            n: String(row.n),
        },
        {
            label: 'Altas active sin correo verificado a 7 dias',
            value: fmtPct(row.pct_active_sin_verificar_7d),
            n: String(row.n_active_7d),
        },
    ]

    const guardas: EmailCell[] = [
        { label: 'Logins de alumno a menos de 120 s del alta', value: String(row.logins_bajo_120s), n: '—' },
        { label: 'Alumno con el mismo telefono que su coach', value: String(row.mismo_fono), n: '—' },
    ]

    const th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #d4d4d8;font-size:13px"'
    const td = 'style="padding:6px 10px;border-bottom:1px solid #e4e4e7;font-size:13px"'

    const section = (title: string, cells: EmailCell[]) => `
    <h3 style="margin:22px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#52525b">${title}</h3>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px">
      <tr><th ${th}>Indicador</th><th ${th}>Valor</th><th ${th}>n</th></tr>
      ${cells
          .map(
              (c) => `<tr>
        <td ${td}>${c.label}${c.note ? `<br><span style="color:#71717a;font-size:11px">${c.note}</span>` : ''}</td>
        <td ${td}><strong>${c.value}</strong></td>
        <td ${td}>${c.n}</td>
      </tr>`
          )
          .join('')}
    </table>`

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <h2 style="margin:0 0 4px;font-size:18px">North Star semanal</h2>
  <p style="margin:0;color:#52525b;font-size:13px">
    Cohorte: coaches creados del ${row.desde.slice(0, 10)} al ${row.hasta.slice(0, 10)} (UTC, semana cerrada).
    Corte de datos: ${row.corte.slice(0, 16).replace('T', ' ')} UTC.
  </p>
  ${section('La metrica', metricas)}
  ${section('Guardarrailes', guardarrailes)}
  ${section('Guardas (revisar a mano)', guardas)}
  <p style="margin:22px 0 0;color:#71717a;font-size:11px;max-width:640px">
    «${SIN_LECTURA}» = la cohorte no llega al minimo de ${MIN_N_GUARDRAIL} para ese indicador; un porcentaje
    ahi seria ruido, no senal. «Entro» se lee hoy por el ultimo login del alumno: es una cota, no la
    medicion final (esa llega con la columna first_login_at).
  </p>
</div>`

    return { subject, html }
}
