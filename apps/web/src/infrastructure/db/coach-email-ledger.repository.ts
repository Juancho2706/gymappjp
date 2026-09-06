import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

/**
 * Repository de `coach_email_ledger` (migración 20260822004243). Acceso a datos PURO: la decisión de
 * mandar, deduplicar o cancelar vive en `services/email/coach-email-ledger.service.ts`.
 *
 * ⚠️ TODA escritura corre con SERVICE-ROLE: la migración revoca insert/update/delete a
 * `authenticated` y deja una sola policy (`select` de las filas propias). Un client user-scoped solo
 * puede LEER lo suyo.
 *
 * TODO: regenerar `database.types.ts` tras el commit de onboarding v2 (la tabla es de la migración
 * 20260822004243 y el archivo generado todavía no la conoce; además otra sesión lo está editando
 * ahora mismo). Hasta entonces la fila se tipa acá y el acceso pasa por `ledger()`, mismo patrón
 * `(from as any)` que `lib/admin/admin-gate.ts` usa con `platform_admins`. Cuando los tipos existan:
 * borrar `ledger()`, usar `db.from('coach_email_ledger')` y derivar los tipos de
 * `Database['public']['Tables']['coach_email_ledger']`.
 */

type Db = SupabaseClient<Database>

export type CoachEmailLedgerStatus =
    | 'scheduled'
    | 'sent'
    | 'delivered'
    | 'bounced'
    | 'complained'
    | 'cancelled'
    | 'failed'

/**
 * Estados que cuentan como «este correo ya existe» para el dedupe: TODOS menos `failed`.
 *
 * El único que se puede reintentar es el correo que NUNCA SALIÓ. Los otros dos que antes estaban
 * fuera vuelven adentro por razones distintas y las dos importan:
 *
 * · `bounced` / `complained` — a esa dirección no se le vuelve a escribir con esa key, nunca. Un
 *   rebote repetido quema el dominio de envío, y una queja de spam sobre una serie que EVA inicia
 *   sola es exactamente lo que la Ley 19.496 (art. 28 B) no perdona.
 * · `cancelled` — lo escribe `cancelCoachEmails`, o sea NOSOTROS, y significa «este correo ya no
 *   aplica» (el coach pagó, cargó su primer alumno, se dio de baja). Es una decisión, no un fallo:
 *   re-agendarlo sería volver a mandar justo lo que acabamos de decidir que sobraba.
 *
 * Espejo exacto del índice único parcial `coach_email_ledger_dedupe_uidx`
 * (`20260822005701`, `where status <> 'failed'`), que es lo que hace atómico este dedupe.
 * SI SE CAMBIA ESTA LISTA, SE CAMBIA EL ÍNDICE.
 */
export const ACTIVE_LEDGER_STATUSES: readonly CoachEmailLedgerStatus[] = [
    'scheduled',
    'sent',
    'delivered',
    'bounced',
    'complained',
    'cancelled',
]

export type CoachEmailLedgerRow = {
    id: string
    coach_id: string
    template_key: string
    trigger: string
    status: CoachEmailLedgerStatus
    provider_message_id: string | null
    scheduled_at: string | null
    sent_at: string | null
    delivered_at: string | null
    payload: Json
    created_at: string
    updated_at: string
}

export type CoachEmailLedgerInsert = {
    coach_id: string
    template_key: string
    trigger: string
    status: CoachEmailLedgerStatus
    provider_message_id?: string | null
    scheduled_at?: string | null
    sent_at?: string | null
    delivered_at?: string | null
    payload?: Record<string, Json>
}

/** Parche que escribe el webhook de Resend al mover una fila por el ciclo de vida. */
export type CoachEmailLedgerStatusPatch = {
    status: CoachEmailLedgerStatus
    sent_at?: string | null
    delivered_at?: string | null
    payload?: Record<string, Json>
}

const LEDGER_TABLE = 'coach_email_ledger'

const LEDGER_COLUMNS =
    'id, coach_id, template_key, trigger, status, provider_message_id, scheduled_at, sent_at, delivered_at, payload, created_at, updated_at'

/** Único punto con el cast: cuando `database.types.ts` conozca la tabla, esta función desaparece. */
function ledger(db: Db) {
    return (db.from as any)(LEDGER_TABLE)
}

type PostgrestErrorLike = { message: string; code?: string | null }

type QueryResult = { data: unknown; error: PostgrestErrorLike | null }

/**
 * Error de la DB con el `code` de Postgres PRESERVADO.
 *
 * `new Error(message)` a secas tiraba el código a la basura, y el service necesita distinguir un
 * `23505` (unique_violation del índice de dedupe: la carrera perdió, el correo ya existe) de
 * cualquier otro fallo (que sí es un problema). Sin el código, la carrera se veía igual que una DB
 * caída y el coach terminaba con dos series agendadas.
 */
export class CoachEmailLedgerDbError extends Error {
    readonly code: string | null

    constructor(op: string, error: PostgrestErrorLike) {
        super(`${op} coach_email_ledger: ${error.message}`)
        this.name = 'CoachEmailLedgerDbError'
        this.code = error.code ?? null
    }
}

function rowsOrThrow(result: QueryResult, op: string): CoachEmailLedgerRow[] {
    if (result.error) throw new CoachEmailLedgerDbError(op, result.error)
    return (result.data ?? []) as CoachEmailLedgerRow[]
}

/**
 * ¿Este coach ya tiene alguno de estos correos vivo? Es la consulta del dedupe: una sola ida a la DB
 * para todas las keys que interesan.
 */
export async function findActiveByCoachAndKeys(
    admin: Db,
    coachId: string,
    keys: readonly string[]
): Promise<CoachEmailLedgerRow[]> {
    if (keys.length === 0) return []
    const result = (await ledger(admin)
        .select(LEDGER_COLUMNS)
        .eq('coach_id', coachId)
        .in('template_key', keys as string[])
        .in('status', ACTIVE_LEDGER_STATUSES as string[])) as QueryResult
    return rowsOrThrow(result, 'findActiveByCoachAndKeys')
}

/**
 * La fila de UN correo lógico del coach SIN filtrar por estado — `failed` incluido.
 *
 * Existe aparte de `findActiveByCoachAndKeys` porque aquella lectura sirve al DEDUPE y por eso deja
 * `failed` afuera (es el único correo reintentable). La higiene del drip necesita exactamente lo
 * contrario: un `failed` (Resend no pudo entregarlo, o la dirección está suprimida) es la prueba de
 * que la casilla no recibe, y es una de las señales que dispara la cancelación del resto de la serie.
 * Con la lectura del dedupe esa fila era invisible y el rebote pasaba de largo.
 *
 * Devuelve la MÁS RECIENTE: el índice de dedupe garantiza a lo sumo una fila viva por
 * `(coach_id, template_key)`, pero puede haber `failed` viejas de intentos anteriores debajo, y la
 * que vale es la del último intento.
 */
export async function findLatestByCoachAndKey(
    admin: Db,
    coachId: string,
    templateKey: string
): Promise<CoachEmailLedgerRow | null> {
    const result = (await ledger(admin)
        .select(LEDGER_COLUMNS)
        .eq('coach_id', coachId)
        .eq('template_key', templateKey)
        .order('created_at', { ascending: false })
        .limit(1)) as QueryResult
    return rowsOrThrow(result, 'findLatestByCoachAndKey')[0] ?? null
}

/** Deja la fila del envío. Devuelve la fila creada (el service solo usa el `id`). */
export async function insertLedgerRow(
    admin: Db,
    row: CoachEmailLedgerInsert
): Promise<CoachEmailLedgerRow> {
    const result = (await ledger(admin)
        .insert(row)
        .select(LEDGER_COLUMNS)
        .single()) as QueryResult
    if (result.error) throw new CoachEmailLedgerDbError('insertLedgerRow', result.error)
    return result.data as CoachEmailLedgerRow
}

/**
 * La fila de un correo por su id de Resend. La necesita el evento `email.delivery_delayed`, que solo
 * anota en `payload`: sin leer el payload vigente, escribirlo lo pisaría (jsonb se reemplaza entero,
 * PostgREST no sabe hacer `||` en un update).
 */
export async function findByProviderMessageId(
    admin: Db,
    providerMessageId: string
): Promise<CoachEmailLedgerRow | null> {
    const result = (await ledger(admin)
        .select(LEDGER_COLUMNS)
        .eq('provider_message_id', providerMessageId)
        .maybeSingle()) as QueryResult
    if (result.error) throw new CoachEmailLedgerDbError('findByProviderMessageId', result.error)
    return (result.data as CoachEmailLedgerRow | null) ?? null
}

/**
 * Mueve una fila por su id de Resend (lo que trae el webhook en `data.email_id`).
 *
 * `matched: false` NO es un error: la mayoría de los correos de EVA (bienvenidas, recibos, dunning)
 * no pasan por el ledger, así que sus eventos llegan sin fila que actualizar.
 *
 * `onlyFromStatuses` es el guard de ORDEN: Svix no garantiza el orden de entrega, y un `email.sent`
 * que llega tarde no puede borrar un `bounced` ya registrado. El caller declara desde qué estados es
 * legítima la transición; el resto no matchea (y el webhook responde 200 sin tocar nada).
 */
export async function updateStatusByProviderMessageId(
    admin: Db,
    providerMessageId: string,
    patch: CoachEmailLedgerStatusPatch,
    options?: { onlyFromStatuses?: readonly CoachEmailLedgerStatus[] }
): Promise<{ matched: boolean }> {
    let query = ledger(admin).update(patch).eq('provider_message_id', providerMessageId)
    if (options?.onlyFromStatuses) {
        query = query.in('status', options.onlyFromStatuses as string[])
    }
    const result = (await query.select('id')) as QueryResult
    if (result.error) throw new CoachEmailLedgerDbError('updateStatusByProviderMessageId', result.error)
    const rows = (result.data ?? []) as { id: string }[]
    return { matched: rows.length > 0 }
}

/**
 * Los correos todavía cancelables del coach. `'*'` = todas las keys (baja de cuenta: se cancela todo
 * lo agendado, no una lista).
 *
 * `scheduled_at > now()`: lo VENCIDO no es cancelable. Una fila queda `scheduled` hasta que el
 * webhook de Resend la mueve a `sent`, y ese webhook puede no estar registrado o llegar tarde — sin
 * este filtro, cada cancelación gastaba un POST a Resend por cada correo ya salido para cosechar un
 * 404. Se ordena por fecha para que el tope de lote (`CANCEL_BATCH_LIMIT` del service) se coma
 * primero lo que está más cerca de dispararse.
 */
export async function listScheduledByCoach(
    admin: Db,
    coachId: string,
    keys: readonly string[] | '*',
    now: Date = new Date()
): Promise<CoachEmailLedgerRow[]> {
    if (keys !== '*' && keys.length === 0) return []
    let query = ledger(admin)
        .select(LEDGER_COLUMNS)
        .eq('coach_id', coachId)
        .eq('status', 'scheduled')
        .gt('scheduled_at', now.toISOString())
    if (keys !== '*') query = query.in('template_key', keys as string[])
    const result = (await query.order('scheduled_at', { ascending: true })) as QueryResult
    return rowsOrThrow(result, 'listScheduledByCoach')
}

/**
 * Cierra como `sent` una fila agendada que Resend ya NO puede cancelar (404/422: el correo salió, o
 * el id no es cancelable). No es un fallo nuestro y no debe contarse como tal: el correo se entregó.
 *
 * El `payload` se REEMPLAZA entero, así que el caller manda el merge ya hecho (jsonb no sabe hacer
 * `||` desde PostgREST) — mismo patrón que el `email.delivery_delayed` del webhook.
 */
export async function markCancelNotPossible(
    admin: Db,
    id: string,
    payload: Record<string, Json>
): Promise<void> {
    const result = (await ledger(admin)
        .update({ status: 'sent', payload })
        .eq('id', id)
        .select('id')) as QueryResult
    if (result.error) throw new CoachEmailLedgerDbError('markCancelNotPossible', result.error)
}

/** Cierra las filas que Resend confirmó canceladas. Devuelve cuántas quedaron marcadas. */
export async function markCancelled(admin: Db, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = (await ledger(admin)
        .update({ status: 'cancelled' })
        .in('id', ids as string[])
        .select('id')) as QueryResult
    if (result.error) throw new CoachEmailLedgerDbError('markCancelled', result.error)
    return ((result.data ?? []) as { id: string }[]).length
}
