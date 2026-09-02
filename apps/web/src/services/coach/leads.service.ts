import type { SupabaseClient } from '@supabase/supabase-js'
import {
    OPEN_COACH_LEAD_STATUSES,
    type CoachLead,
    type CoachLeadStatus,
    type CoachLeadUpdatableStatus,
} from '@eva/schemas'
import type { Database } from '@/lib/database.types'

/**
 * Servicio del inbox «Solicitudes» (`coach_leads`) — capa compartida entre superficies.
 *
 * POR QUÉ existe: el panel web lee estos leads desde `coach/clients/_data/leads.queries.ts` con el
 * cliente de sesión (cookies). El bridge móvil no tiene cookies: llega con un Bearer, así que
 * necesita el MISMO SQL sobre un cliente distinto. Este servicio recibe el cliente por parámetro y
 * es el único lugar donde vive la consulta para el camino móvil.
 *
 * Régimen de permisos (migración 20260821030821), idéntico al de la web:
 *  - LECTURA con el cliente del USUARIO: `coach_leads` tiene una sola policy
 *    (`select ... using (coach_id = auth.uid())`) y ese es el techo que queremos. El `.eq(coach_id)`
 *    de abajo es defensa en profundidad, NO el control de acceso.
 *  - ESCRITURA con `service_role`: la tabla no tiene policy ni grants de insert/update a propósito.
 *    Por eso cada update verifica ANTES la pertenencia con el cliente del usuario (que sí pasa por
 *    RLS) y repite `.eq('coach_id', …)` en el `where` del write: verificar y escribir son dos
 *    viajes distintos y el segundo no hereda la garantía del primero.
 *
 * DEUDA DECLARADA (W3.1): `_data/leads.queries.ts` conserva hoy su propia copia de la consulta —
 * ese archivo pertenece a otra zona de trabajo en esta tanda y no se tocó. La unificación es
 * reemplazar su cuerpo por `listCoachLeads(await createClient(), coachId)`.
 */

type DB = SupabaseClient<Database>

/**
 * Columnas + embed del referente. El hint de FK
 * (`clients!coach_leads_referred_by_client_id_fkey`) NO es opcional: la tabla tiene DOS FKs a
 * `clients` (`referred_by_client_id` y `converted_client_id`) y sin él PostgREST responde 300
 * «more than one relationship was found».
 */
const LEAD_SELECT =
    'id, full_name, phone, email, message, status, created_at, referred_by_client_id, referral_card_kind, referral_source, referrer:clients!coach_leads_referred_by_client_id_fkey(full_name)'

/**
 * Techo defensivo: el inbox es una bandeja para actuar, no un CRM. Mismo número que la web.
 */
const LEAD_LIST_LIMIT = 50

type LeadRow = {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    message: string | null
    status: string
    created_at: string
    referred_by_client_id: string | null
    referral_card_kind: string | null
    referral_source: string | null
    referrer: { full_name: string } | { full_name: string }[] | null
}

/**
 * PostgREST devuelve el embed to-one como objeto, pero según la versión del generador de tipos
 * (y en varios mocks de test) llega como array de 0/1 elementos. Se normalizan los dos.
 */
function readReferrerName(referrer: LeadRow['referrer']): string | null {
    if (!referrer) return null
    if (Array.isArray(referrer)) return referrer[0]?.full_name ?? null
    return referrer.full_name ?? null
}

/** Un `status` desconocido en DB no puede romper el contrato tipado del cliente. */
function normalizeStatus(raw: string): CoachLeadStatus {
    if (raw === 'contacted' || raw === 'converted' || raw === 'dismissed') return raw
    return 'new'
}

export function mapLeadRow(row: LeadRow): CoachLead {
    return {
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        message: row.message,
        status: normalizeStatus(row.status),
        createdAt: row.created_at,
        referrerName: readReferrerName(row.referrer),
        referralCardKind: row.referral_card_kind,
        referralSource: row.referral_source,
    }
}

/**
 * Lista las solicitudes del coach. Sin `statuses` devuelve la bandeja ABIERTA (`new`+`contacted`),
 * que es lo que pinta la pantalla; con un estado concreto filtra por ese solo estado.
 *
 * Sin scope de workspace a propósito (igual que la web): hoy solo el `/join` STANDALONE genera
 * solicitudes, así que todo lead tiene `team_id`/`org_id` en null y pertenece al coach como
 * persona. Filtrar por el workspace activo solo escondería solicitudes propias.
 */
export async function listCoachLeads(
    db: DB,
    coachId: string,
    options?: { statuses?: readonly CoachLeadStatus[] },
): Promise<{ ok: true; leads: CoachLead[] } | { ok: false; error: string }> {
    const statuses = options?.statuses ?? OPEN_COACH_LEAD_STATUSES

    const { data, error } = await db
        .from('coach_leads')
        .select(LEAD_SELECT)
        .eq('coach_id', coachId)
        .in('status', statuses as unknown as string[])
        .order('created_at', { ascending: false })
        .limit(LEAD_LIST_LIMIT)

    if (error) return { ok: false, error: error.message }

    return { ok: true, leads: ((data ?? []) as unknown as LeadRow[]).map(mapLeadRow) }
}

export type CoachLeadUpdateOutcome =
    | { ok: true; lead: CoachLead }
    | { ok: false; code: 'NOT_FOUND' | 'UPDATE_FAILED'; error: string }

const NOT_FOUND = 'Solicitud no encontrada.'

/**
 * Mueve una solicitud de estado. Espejo de `markLeadContactedAction`/`dismissLeadAction` del panel
 * web, con la MISMA regla de no-downgrade: una solicitud ya `converted` o `dismissed` no vuelve a
 * `contacted` (eso la reabriría en la bandeja).
 *
 * `converted` acá NO copia la atribución de la tarjeta a `clients` — esa copia necesita el
 * `clients.id` recién creado y el alta móvil (`POST /api/mobile/coach/clients`) todavía no lo
 * devuelve. La atribución se sigue cerrando desde la web (`markLeadConvertedAction`). Anotado como
 * pendiente de W3 en `docs/specs/coach-leads/TASKS.md`.
 *
 * `userDb` (cliente del usuario, pasa por RLS) verifica la pertenencia; `admin` (service_role)
 * escribe. El orden importa: escribir con service_role sin ese SELECT previo dejaría a cualquier
 * coach autenticado mover el lead de otro pasando su uuid.
 */
export async function updateCoachLeadStatus(
    clients: { userDb: DB; admin: DB },
    coachId: string,
    leadId: string,
    status: CoachLeadUpdatableStatus,
): Promise<CoachLeadUpdateOutcome> {
    // Un uuid mal formado hace que PostgREST devuelva error (22P02) ⇒ `data` null ⇒ el mismo
    // «no encontrada» que un lead ajeno. Nunca se distingue "no existe" de "no es tuyo".
    const { data: owned } = await clients.userDb
        .from('coach_leads')
        .select('id, status')
        .eq('id', leadId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!owned) return { ok: false, code: 'NOT_FOUND', error: NOT_FOUND }

    // No-downgrade: `contacted` solo se alcanza desde `new`. Idempotente y sin escritura.
    if (status === 'contacted' && owned.status !== 'new') {
        return readBack(clients.userDb, coachId, leadId)
    }

    const update: { status: CoachLeadUpdatableStatus } = { status }
    const { error } = await clients.admin
        .from('coach_leads')
        .update(update)
        .eq('id', leadId)
        .eq('coach_id', coachId)

    if (error) return { ok: false, code: 'UPDATE_FAILED', error: 'No pudimos actualizar la solicitud.' }

    return readBack(clients.userDb, coachId, leadId)
}

/**
 * Relee la fila YA actualizada con el cliente del usuario para devolverle a la app el item
 * completo (incluido el nombre del referente): así la lista no tiene que inventar el nuevo estado
 * ni pedir la lista entera después de cada toque.
 */
async function readBack(userDb: DB, coachId: string, leadId: string): Promise<CoachLeadUpdateOutcome> {
    const { data } = await userDb
        .from('coach_leads')
        .select(LEAD_SELECT)
        .eq('id', leadId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!data) return { ok: false, code: 'NOT_FOUND', error: NOT_FOUND }
    return { ok: true, lead: mapLeadRow(data as unknown as LeadRow) }
}
