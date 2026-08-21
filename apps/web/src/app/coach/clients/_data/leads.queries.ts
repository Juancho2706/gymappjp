import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Lectura del inbox «Solicitudes» del coach (`coach_leads`).
 *
 * POR QUÉ con el cliente del USUARIO y no service_role: `coach_leads` tiene RLS con una sola
 * policy (`select ... using (coach_id = auth.uid())`) y ese es justamente el techo que queremos.
 * Leer con service_role acá sería reemplazar una garantía de la base por un `.eq()` que un
 * refactor puede borrar sin que nada se rompa. El `.eq('coach_id', …)` de abajo es defensa en
 * profundidad, no el control de acceso.
 *
 * (Las ESCRITURAS sí van con service_role — la tabla no tiene grants de insert/update a
 * propósito; ver `_actions/leads.actions.ts` y la migración 20260821030821.)
 *
 * Sin scope de workspace a propósito: hoy solo el `/join` STANDALONE genera solicitudes (team y
 * org conservan su autoalta y escriben directo en `clients`), así que todo lead tiene
 * `team_id`/`org_id` en null y pertenece al coach como persona. Filtrar por el workspace activo
 * solo lograría esconderle solicitudes propias a un coach que además está en un equipo.
 */

/** Estados que el coach ve como "pendientes". `converted`/`dismissed` salen de la lista. */
export const OPEN_LEAD_STATUSES = ['new', 'contacted'] as const

export type OpenLeadStatus = (typeof OPEN_LEAD_STATUSES)[number]

/** DTO de UI: nombres de dominio, no columnas — el componente no conoce la tabla. */
export type CoachLeadListItem = {
    id: string
    fullName: string
    phone: string | null
    email: string | null
    message: string | null
    status: OpenLeadStatus
    createdAt: string
    /** `clients.full_name` del alumno que compartió la tarjeta; null si el lead llegó sin `?ref`. */
    referrerName: string | null
    referralCardKind: string | null
    referralSource: string | null
}

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

export const getCoachLeads = cache(async (coachId: string): Promise<CoachLeadListItem[]> => {
    const supabase = await createClient()

    // El hint de FK (`clients!coach_leads_referred_by_client_id_fkey`) NO es opcional: la tabla
    // tiene DOS FKs a `clients` (`referred_by_client_id` y `converted_client_id`) y sin él
    // PostgREST responde 300 "more than one relationship was found".
    // El embed también pasa por RLS de `clients`: el referente es alumno del mismo coach, así que
    // se ve; si no se viera, el nombre queda null y la tarjeta cae al texto genérico.
    const { data, error } = await supabase
        .from('coach_leads')
        .select(
            'id, full_name, phone, email, message, status, created_at, referred_by_client_id, referral_card_kind, referral_source, referrer:clients!coach_leads_referred_by_client_id_fkey(full_name)'
        )
        .eq('coach_id', coachId)
        .in('status', OPEN_LEAD_STATUSES as unknown as string[])
        .order('created_at', { ascending: false })
        // Techo defensivo: el inbox es una bandeja para actuar, no un CRM. Si un coach acumula
        // más de 50 pendientes el problema es de proceso, no de paginación.
        .limit(50)

    if (error) {
        // Falla blanda: la pantalla de alumnos NO puede caerse porque el inbox no cargó.
        console.error('[coach-leads] lectura del inbox falló:', error.message)
        return []
    }

    return ((data ?? []) as unknown as LeadRow[]).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        message: row.message,
        status: row.status === 'contacted' ? 'contacted' : 'new',
        createdAt: row.created_at,
        referrerName: readReferrerName(row.referrer),
        referralCardKind: row.referral_card_kind,
        referralSource: row.referral_source,
    }))
})

/**
 * PostgREST devuelve el embed to-one como objeto, pero según la versión del generador de tipos
 * (y en varios mocks de test) llega como array de 0/1 elementos. Se normalizan los dos.
 */
function readReferrerName(referrer: LeadRow['referrer']): string | null {
    if (!referrer) return null
    if (Array.isArray(referrer)) return referrer[0]?.full_name ?? null
    return referrer.full_name ?? null
}
