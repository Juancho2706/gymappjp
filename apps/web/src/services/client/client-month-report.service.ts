import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolveCheckinPhotoUrls } from '@/lib/storage/checkin-photos'
import { assertCoachClientReadAccess } from '@/services/client/client-scope.service'
import {
    buildClientMonthDossier,
    toMonthKey,
    type ClientDossierData,
    type ClientReportBoundsJson,
    type MonthReportJson,
    type MonthReportsJson,
} from '@eva/client-dossier'

/**
 * Informe MENSUAL del alumno (docs/specs/dossier-por-meses) — capa de datos de la web.
 *
 * Dos lecturas y nada más:
 *   - `getClientReportBounds`  → rango de meses seleccionables (chips del diálogo).
 *   - `getClientMonthReports`  → los `ClientDossierData` de los meses pedidos, listos para jsPDF.
 *
 * ── INVARIANTE DE SEGURIDAD (R16) ────────────────────────────────────────────────────────────
 * Los DOS RPC se llaman SIEMPRE con el cliente de COOKIES (`createClient()` de
 * `@/lib/supabase/server`), nunca con service-role: el guard de 3 vías de las funciones SQL
 * (propio / coach dueño / pool) vive sobre `auth.uid()`, y con service-role `auth.uid()` es NULL
 * ⇒ la denegación dejaría de existir y cualquier coach leería a cualquier alumno.
 * El ÚNICO uso de `createServiceRoleClient()` en este módulo es firmar las fotos de check-in
 * (`resolveCheckinPhotoUrls`), porque los coaches no tienen policy SELECT sobre el bucket privado
 * `checkins`; y ahí se firman SOLO los paths que el RPC (ya autorizado) devolvió.
 *
 * `assertCoachClientReadAccess` corre igual antes del RPC: falla temprano y con un mensaje de
 * producto, en vez de dejar que el 42501 de Postgres sea la primera línea de defensa.
 */

// Tope duro del RPC (`raise ... errcode 22023` si se pide más). Se valida antes de la red.
export const MAX_MONTHS_PER_EXPORT = 24
// R16/R20: fotos por mes y por exportación. El PDF con 18 fotos ya pesa; más no se firma.
export const MAX_PHOTOS_PER_MONTH = 3
export const MAX_PHOTOS_PER_EXPORT = 18

/** Rango de meses con señal del alumno, en claves `YYYY-MM` (lo que consumen los chips). */
export type ClientReportBounds = {
    firstMonthKey: string
    currentMonthKey: string
}

export type GetClientMonthReportsOptions = {
    /** `false` ⇒ no se firma NINGUNA foto (ni se instancia el cliente service-role). */
    includePhotos?: boolean
}

type SupabaseCookieClient = Awaited<ReturnType<typeof createClient>>

type PostgrestLikeError = { code?: string | null; message?: string | null }

/**
 * Traduce los errores que las dos funciones SQL levantan a propósito:
 *   42501 = `client_month_reports_denied` / `client_report_bounds_denied` (guard de 3 vías, R3)
 *   22023 = selección de meses inválida (array vacío, > 24 meses, fechas que no son día 1)
 *
 * Cualquier OTRO error es un bug, y su mensaje de Postgres NO viaja a la UI: describe tablas,
 * columnas y funciones internas. Queda en el log del servidor y el coach ve un texto genérico.
 */
function translateReportRpcError(error: PostgrestLikeError): Error {
    if (error.code === '42501') return new Error('No tenés acceso a este alumno')
    if (error.code === '22023') return new Error('Selección de meses inválida')
    console.error('[client-month-report] RPC error', {
        code: error.code ?? null,
        message: error.message ?? null,
    })
    return new Error('No se pudo leer el informe del alumno')
}

/** Identidad + guard. Devuelve el cliente de cookies y el userId ya verificados. */
async function authorizeClientRead(clientId: string): Promise<{
    supabase: SupabaseCookieClient
    userId: string
}> {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. Lectura coach-scoped (RLS + el
    // guard del RPC la gatean), no requiere revocación fresca. Mismo patrón que client-detail.
    const { data: __cl } = await supabase.auth.getClaims()
    const userId = __cl?.claims?.sub ? (__cl.claims.sub as string) : null
    if (!userId) throw new Error('Unauthorized')

    await assertCoachClientReadAccess(supabase, userId, clientId)
    return { supabase, userId }
}

/**
 * `get_client_report_bounds` (R11): primer mes con señal y mes en curso (Santiago), `YYYY-MM`.
 * RPC con el cliente de COOKIES — ver la invariante del encabezado.
 */
export async function getClientReportBounds(clientId: string): Promise<ClientReportBounds> {
    const { supabase } = await authorizeClientRead(clientId)

    const { data, error } = await supabase.rpc('get_client_report_bounds', {
        p_client_id: clientId,
    })
    if (error) throw translateReportRpcError(error)

    const payload = (data ?? null) as unknown as ClientReportBoundsJson | null
    const currentMonthKey = toMonthKey(payload?.current_month)
    const firstMonthKey = toMonthKey(payload?.first_month) || currentMonthKey
    if (!currentMonthKey) throw new Error('No se pudo leer el rango de meses del alumno')

    return { firstMonthKey, currentMonthKey }
}

/** Normaliza, deduplica y ordena las claves de mes. Lanza si la selección no es exportable. */
function normalizeMonthKeys(monthKeys: string[]): string[] {
    const keys = Array.from(
        new Set((monthKeys ?? []).map((k) => toMonthKey(k)).filter((k) => k !== ''))
    ).sort()
    if (keys.length === 0 || keys.length > MAX_MONTHS_PER_EXPORT) {
        throw new Error('Selección de meses inválida')
    }
    return keys
}

type PhotoPick = { checkInId: string; ref: string }

/**
 * Elige QUÉ fotos se firman: los primeros `MAX_PHOTOS_PER_MONTH` check-ins con foto frontal de
 * cada mes (ya vienen `created_at` DESC del RPC), con tope global `MAX_PHOTOS_PER_EXPORT`.
 * El recorte se hace ACÁ, antes de llamar al firmador: `resolveCheckinPhotoUrls` no tiene noción
 * de meses y su `fullPhotoRows` cuenta filas, no fotos por período.
 */
function pickPhotoRefs(months: MonthReportJson[]): PhotoPick[] {
    const picks: PhotoPick[] = []
    for (const month of months) {
        let perMonth = 0
        for (const checkIn of month?.check_ins ?? []) {
            if (picks.length >= MAX_PHOTOS_PER_EXPORT) return picks
            if (perMonth >= MAX_PHOTOS_PER_MONTH) break
            const checkInId = String(checkIn?.id ?? '').trim()
            const ref = String(checkIn?.front_photo_url ?? '').trim()
            if (!checkInId || !ref) continue
            picks.push({ checkInId, ref })
            perMonth += 1
        }
    }
    return picks
}

/**
 * Firma las fotos elegidas y devuelve `{ [checkInId]: url | null }`.
 *
 * INVARIANTE (R16): este es el ÚNICO `createServiceRoleClient()` del módulo. Se justifica porque
 * el bucket `checkins` es privado y el coach no tiene policy SELECT; el acceso al ALUMNO ya quedó
 * autorizado antes (assert + guard del RPC) y acá solo se firman paths que ese RPC devolvió.
 *
 * `{ fullPhotoRows: 0, tailFields: ['front_photo_url'] }`: con `fullPhotoRows: 3` las 3 primeras
 * filas recibirían los TRES campos firmados (front/side/back) — `tailFields` solo aplica a las
 * filas fuera de `fullPhotoRows` (ver `resolveCheckinPhotoUrls`). El informe mensual imprime
 * únicamente la frontal, así que 0 + tailFields firma exactamente eso y nada más.
 */
async function signMonthPhotos(picks: PhotoPick[]): Promise<Record<string, string | null>> {
    if (picks.length === 0) return {}
    const rows = picks.map((p) => ({ id: p.checkInId, front_photo_url: p.ref as string | null }))
    const signed = await resolveCheckinPhotoUrls(createServiceRoleClient(), rows, {
        fullPhotoRows: 0,
        tailFields: ['front_photo_url'],
    })
    const photoUrls: Record<string, string | null> = {}
    for (const row of signed) photoUrls[row.id] = row.front_photo_url ?? null
    return photoUrls
}

type ClientIdentityRow = {
    full_name: string | null
    email: string | null
    phone: string | null
    is_active: boolean | null
    subscription_start_date: string | null
    created_at: string | null
}

/** Misma receta de identidad que `buildClientDossier` (los dos informes deben decir lo mismo). */
function toDossierIdentity(row: ClientIdentityRow) {
    return {
        fullName: (row.full_name ?? '').trim() || 'Alumno',
        email: row.email ?? '',
        phone: row.phone ?? null,
        isActive: row.is_active !== false,
        clientSinceIso: row.subscription_start_date || row.created_at || null,
    }
}

/**
 * `get_client_month_reports` (R2/R10) → un `ClientDossierData` por mes, en el orden pedido
 * (ascendente) y con un `generatedAtIso` ÚNICO para toda la exportación (R15).
 *
 * RPC con el cliente de COOKIES — ver la invariante del encabezado.
 */
export async function getClientMonthReports(
    clientId: string,
    monthKeys: string[],
    options?: GetClientMonthReportsOptions
): Promise<ClientDossierData[]> {
    const keys = normalizeMonthKeys(monthKeys)
    const includePhotos = options?.includePhotos !== false

    const { supabase } = await authorizeClientRead(clientId)

    // `date[]` de Postgres: cada mes entra como su primer día (contrato R2).
    const pMonths = keys.map((k) => `${k}-01`)

    const [reportsResult, clientResult] = await Promise.all([
        supabase.rpc('get_client_month_reports', { p_client_id: clientId, p_months: pMonths }),
        supabase
            .from('clients')
            .select('full_name, email, phone, is_active, subscription_start_date, created_at')
            .eq('id', clientId)
            .maybeSingle(),
    ])

    if (reportsResult.error) throw translateReportRpcError(reportsResult.error)
    const clientRow = clientResult.data as ClientIdentityRow | null
    if (!clientRow) throw new Error('No tenés acceso a este alumno')

    const payload = (reportsResult.data ?? null) as unknown as MonthReportsJson | null
    const months = (payload?.months ?? []).filter((m): m is MonthReportJson => !!m)
    if (months.length === 0) return []

    const photoUrls = includePhotos ? await signMonthPhotos(pickPhotoRefs(months)) : {}

    const identity = toDossierIdentity(clientRow)
    const generatedAtIso = new Date().toISOString()
    const total = months.length

    return months.map((month, i) =>
        buildClientMonthDossier(month, {
            generatedAtIso,
            identity,
            index: i + 1,
            total,
            photoUrls,
        })
    )
}
