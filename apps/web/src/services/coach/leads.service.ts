import type { SupabaseClient } from '@supabase/supabase-js'
import {
    OPEN_COACH_LEAD_STATUSES,
    type CoachLead,
    type CoachLeadStatus,
    type CoachLeadUpdatableStatus,
} from '@eva/schemas'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
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
 * CONVERSIÓN (W3, cierre de la deuda): la copia de atribución de la tarjeta compartida y sus dos
 * eventos viven acá y NO en el server action del panel web. `markLeadConvertedAction` es hoy un
 * envoltorio de `convertCoachLead` (resuelve la sesión, revalida la ruta); el camino móvil entra
 * por `updateCoachLeadStatus` con `clientId`. Una sola implementación para las dos superficies.
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

export type CoachLeadUpdateErrorCode = 'NOT_FOUND' | 'CLIENT_NOT_FOUND' | 'UPDATE_FAILED'

export type CoachLeadUpdateOutcome =
    | { ok: true; lead: CoachLead }
    | { ok: false; code: CoachLeadUpdateErrorCode; error: string }

/** Desde dónde se cerró la solicitud. Solo viaja como prop de PostHog, nunca como autorización. */
export type CoachLeadSurface = 'web' | 'mobile'

const NOT_FOUND = 'Solicitud no encontrada.'
const CLIENT_NOT_FOUND = 'Alumno no encontrado.'
const UPDATE_FAILED = 'No pudimos actualizar la solicitud.'
const CONVERT_FAILED = 'No pudimos marcar la solicitud como convertida.'

/**
 * Columnas mínimas para autorizar y para decidir la atribución. Sin el embed del referente a
 * propósito: esta lectura no pinta nada, solo decide. Lo que se le devuelve a la UI sale del
 * `readBack`, que sí usa `LEAD_SELECT`.
 */
const OWNED_LEAD_SELECT = 'id, status, referred_by_client_id, referral_source, referral_card_kind'

type OwnedLead = {
    id: string
    status: string
    referred_by_client_id: string | null
    referral_source: string | null
    referral_card_kind: string | null
}

/**
 * Boundary de autorización compartido: devuelve el lead SOLO si es del coach de la sesión.
 *
 * Un uuid mal formado hace que PostgREST devuelva error (22P02) ⇒ `data` null ⇒ el mismo
 * «no encontrada» que un lead ajeno. Nunca se distingue "no existe" de "no es tuyo".
 */
async function resolveOwnedLead(userDb: DB, coachId: string, leadId: string): Promise<OwnedLead | null> {
    const { data } = await userDb
        .from('coach_leads')
        .select(OWNED_LEAD_SELECT)
        .eq('id', leadId)
        .eq('coach_id', coachId)
        .maybeSingle()

    return (data as unknown as OwnedLead | null) ?? null
}

export type CoachLeadConversionOutcome =
    | { ok: true; referred: boolean }
    | { ok: false; code: CoachLeadUpdateErrorCode; error: string }

/**
 * Cierre del loop de growth, ÚNICA implementación para web y app.
 *
 * Copia la atribución de la tarjeta compartida (`referred_by_client_id` / `referral_source` /
 * `referral_card_kind`) del lead a la fila `clients` y marca la solicitud como convertida.
 * POR QUÉ la copia no vive en el alta: cuando el desconocido dejó la solicitud todavía NO existía
 * un alumno al que atribuir, y esas tres columnas de `clients` no tienen grant de usuario
 * (migración 20260819223729) ⇒ service_role.
 *
 * La copia NO es fatal: si falla, el alumno ya existe y el lead igual queda convertido. Perder el
 * crédito del referente es malo; dejar el inbox mintiendo es peor.
 *
 * `clientId` en null = camino de compatibilidad OTA (una app vieja manda `converted` a secas): el
 * estado se mueve igual, pero sin alumno no hay a quién copiarle nada ni sobre quién emitir
 * `coach_client_referred`. Emitirlo igual sería declarar atribuido a un alumno que en la tabla no
 * lo está.
 */
async function convertOwnedLead(
    clients: { userDb: DB; admin: DB },
    coachId: string,
    lead: OwnedLead,
    clientId: string | null,
    surface: CoachLeadSurface,
): Promise<CoachLeadConversionOutcome> {
    const hasAttribution = Boolean(lead.referred_by_client_id)

    if (clientId) {
        // El alumno destino tiene que ser del MISMO coach: el uuid viene del cliente (respuesta del
        // alta) y no se confía. Lectura user-scoped ⇒ la RLS de `clients` es el techo.
        const { data: client } = await clients.userDb
            .from('clients')
            .select('id, referred_by_client_id')
            .eq('id', clientId)
            .eq('coach_id', coachId)
            .maybeSingle()

        if (!client) return { ok: false, code: 'CLIENT_NOT_FOUND', error: CLIENT_NOT_FOUND }

        // Solo si el alumno no traía atribución propia: convertir un lead sobre una ficha que ya
        // tiene referente le robaría el crédito al primero.
        if (hasAttribution && !client.referred_by_client_id) {
            const { error: copyError } = await clients.admin
                .from('clients')
                .update({
                    referred_by_client_id: lead.referred_by_client_id,
                    referral_source: lead.referral_source,
                    referral_card_kind: lead.referral_card_kind,
                })
                .eq('id', clientId)
                .eq('coach_id', coachId)

            if (copyError) console.error('[coach-leads] copia de atribución falló:', copyError.message)
        }
    }

    const update = clientId
        ? { status: 'converted' as const, converted_client_id: clientId }
        : { status: 'converted' as const }
    const { error } = await clients.admin
        .from('coach_leads')
        .update(update)
        .eq('id', lead.id)
        .eq('coach_id', coachId)

    if (error) return { ok: false, code: 'UPDATE_FAILED', error: CONVERT_FAILED }

    // Mismo evento que emitía el alta directa standalone antes de la reversión (F6.3 de
    // docs/specs/workout-share): el embudo de la tarjeta compartida se sigue midiendo end-to-end,
    // ahora con el coach como intermediario. Props del COACH y de la tarjeta, nada del alumno.
    if (hasAttribution && clientId) {
        await capturePostHogServerEvent({
            event: 'coach_client_referred',
            distinctId: coachId,
            properties: {
                referred_by_client_id: lead.referred_by_client_id,
                card_kind: lead.referral_card_kind,
                source: lead.referral_source,
                surface,
            },
        })
    }

    await capturePostHogServerEvent({
        event: 'coach_lead_converted',
        distinctId: coachId,
        properties: { referred: hasAttribution, surface },
    })

    return { ok: true, referred: hasAttribution }
}

/**
 * Entrada del panel WEB (`markLeadConvertedAction`): resuelve la pertenencia del lead y convierte.
 * La sesión y el `revalidatePath` los pone el server action; acá no entra nada de Next.
 */
export async function convertCoachLead(
    clients: { userDb: DB; admin: DB },
    coachId: string,
    leadId: string,
    clientId: string,
    options?: { surface?: CoachLeadSurface },
): Promise<CoachLeadConversionOutcome> {
    const lead = await resolveOwnedLead(clients.userDb, coachId, leadId)
    if (!lead) return { ok: false, code: 'NOT_FOUND', error: NOT_FOUND }

    return convertOwnedLead(clients, coachId, lead, clientId, options?.surface ?? 'web')
}

/**
 * Mueve una solicitud de estado. Espejo de `markLeadContactedAction`/`dismissLeadAction` del panel
 * web, con la MISMA regla de no-downgrade: una solicitud ya `converted` o `dismissed` no vuelve a
 * `contacted` (eso la reabriría en la bandeja).
 *
 * `converted` con `options.clientId` corre EXACTAMENTE el mismo cierre que el panel web (copia de
 * atribución + `coach_client_referred`), porque es el mismo `convertOwnedLead`. Sin `clientId`
 * —app vieja, sin la OTA— solo mueve el estado: ese camino se conserva a propósito para no romper
 * un binario ya publicado.
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
    options?: { clientId?: string | null; surface?: CoachLeadSurface },
): Promise<CoachLeadUpdateOutcome> {
    const owned = await resolveOwnedLead(clients.userDb, coachId, leadId)

    if (!owned) return { ok: false, code: 'NOT_FOUND', error: NOT_FOUND }

    // No-downgrade: `contacted` solo se alcanza desde `new`. Idempotente y sin escritura.
    if (status === 'contacted' && owned.status !== 'new') {
        return readBack(clients.userDb, coachId, leadId)
    }

    if (status === 'converted') {
        const converted = await convertOwnedLead(
            clients,
            coachId,
            owned,
            options?.clientId ?? null,
            options?.surface ?? 'mobile',
        )
        if (!converted.ok) return converted
        return readBack(clients.userDb, coachId, leadId)
    }

    const update: { status: CoachLeadUpdatableStatus } = { status }
    const { error } = await clients.admin
        .from('coach_leads')
        .update(update)
        .eq('id', leadId)
        .eq('coach_id', coachId)

    if (error) return { ok: false, code: 'UPDATE_FAILED', error: UPDATE_FAILED }

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
