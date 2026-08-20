import 'server-only'
import { z } from 'zod/v4'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { InviteResolution } from './resolve-invite'

type Admin = SupabaseClient<Database>

/**
 * F6 (docs/specs/workout-share/) — atribución first-party del alta que llega por una tarjeta
 * compartida. El link del share es `/join/[código]?ref={client_id}&src=share_card&k={preset}`
 * y este módulo decide si ese `ref` se puede escribir en `clients` (columnas
 * `referred_by_client_id` / `referral_source` / `referral_card_kind`, migración 20260819223729).
 *
 * POR QUÉ vive acá y no en el action: los tres parámetros viajan por la URL y después por
 * inputs ocultos del form, o sea son ENTRADA DEL CLIENTE — cualquiera puede pegar el uuid de
 * un alumno ajeno en el link de otro coach. Sin la comprobación de pertenencia quedaría un FK
 * entre dos espacios distintos (fuga cross-tenant en una columna que nadie mira). La validación
 * es server-side y consulta la fila real.
 *
 * REGLA DURA: esto es METADATA de growth. Si algo no cuadra —uuid mal formado, alumno
 * inexistente, otro coach, `src`/`k` fuera de la lista blanca, error de red— se devuelve `null`
 * y el alta sigue su curso NORMAL sin atribución. Un referido malo jamás puede costar un alumno.
 */

/** Única fuente hoy. Lista blanca: cualquier otro valor descarta la atribución entera. */
export const REFERRAL_SOURCES = ['share_card'] as const

/** Los 6 presets de la tarjeta (SPEC §Los 6 presets). */
export const REFERRAL_CARD_KINDS = ['placa', 'heatmap', 'sello', 'marcador', 'poster', 'setlist'] as const

/**
 * `z.guid()` y NO `z.uuid()`: hay ids sembrados que no cumplen la variante/versión de la RFC
 * 4122 y `z.uuid()` los rechaza (mismo criterio que el resto del repo, ver
 * app/api/mobile/nutrition/exchanges/group-foods/route.ts). Rechazarlos acá no rompería el alta,
 * pero perdería atribuciones legítimas en silencio.
 *
 * `k` es opcional (una tarjeta podría compartirse sin preset declarado ⇒ `card_kind` null), pero
 * si VIENE y no está en la lista blanca el parseo falla entero: un valor inventado es señal de
 * link manipulado, no de dato faltante.
 */
const ReferralParamsSchema = z.object({
    ref: z.guid(),
    src: z.enum(REFERRAL_SOURCES),
    k: z.enum(REFERRAL_CARD_KINDS).optional(),
})

export type ReferralParams = z.infer<typeof ReferralParamsSchema>

/** Lo que se mezcla en el insert de `clients`. Nombres = columnas, a propósito. */
export type ReferralAttribution = {
    referred_by_client_id: string
    referral_source: string
    referral_card_kind: string | null
}

/** Valores crudos: searchParams (string | string[]) o FormData (FormDataEntryValue). */
export type RawReferralInput = {
    ref?: unknown
    src?: unknown
    k?: unknown
}

/** searchParams repetidos (`?ref=a&ref=b`) → se toma el primero; lo demás se descarta. */
function firstString(value: unknown): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value
    if (typeof raw !== 'string') return undefined
    const trimmed = raw.trim()
    return trimmed ? trimmed : undefined
}

/**
 * Validación de FORMA (pura, sin DB). La usa la page para decidir qué inputs ocultos pinta y el
 * action como primer filtro. NO alcanza por sí sola: la pertenencia se comprueba en
 * `resolveJoinReferral`.
 */
export function parseReferralParams(raw: RawReferralInput): ReferralParams | null {
    const candidate = {
        ref: firstString(raw.ref),
        src: firstString(raw.src),
        k: firstString(raw.k),
    }
    // Sin `ref` no hay nada que atribuir: se sale antes de gastar un parseo.
    if (!candidate.ref) return null

    const parsed = ReferralParamsSchema.safeParse(candidate)
    return parsed.success ? parsed.data : null
}

/**
 * Comprueba contra la DB que el alumno referente exista y pertenezca al MISMO espacio que el
 * código de invitación, y devuelve las columnas listas para el insert (o `null`).
 *
 * Pertenencia por scope (más estricto que "mismo coach", nunca más laxo):
 *  - `team`: mismo `team_id` — en el pool todas las filas quedan con el coach dueño, así que el
 *    `coach_id` también coincide. Es el camino donde vive el share hoy (estrategia Teams-first).
 *  - `enterprise`: mismo `org_id` Y mismo `coach_id`. Un referido entre coaches distintos DENTRO
 *    de la misma org se descarta (se pierde el dato, jamás el alta): enterprise está congelada y
 *    preferimos el criterio conservador antes que aflojar el cerco.
 *  - `standalone`: mismo `coach_id` y sin org ni team. Es el camino de la tarjeta compartida.
 *
 * Un alumno archivado SÍ puede referir: su tarjeta vieja sigue circulando y el alta que trae es
 * igual de real.
 */
export async function resolveJoinReferral(
    admin: Admin,
    invite: NonNullable<InviteResolution>,
    raw: RawReferralInput
): Promise<ReferralAttribution | null> {
    const params = parseReferralParams(raw)
    if (!params) return null

    try {
        const { data: referrer, error } = await admin
            .from('clients')
            .select('id, coach_id, org_id, team_id')
            .eq('id', params.ref)
            .maybeSingle()

        if (error || !referrer) {
            // Sin el uuid en el log: es un identificador de persona y esto es solo diagnóstico.
            console.warn('[join-referral] ref descartado: alumno inexistente o ilegible')
            return null
        }

        const belongs =
            invite.scope === 'team'
                ? referrer.team_id === invite.teamId
                : invite.scope === 'enterprise'
                  ? referrer.org_id === invite.orgId && referrer.coach_id === invite.coachId
                  : referrer.coach_id === invite.coachId &&
                    referrer.org_id === null &&
                    referrer.team_id === null

        if (!belongs) {
            console.warn('[join-referral] ref descartado: no pertenece al espacio del código')
            return null
        }

        return {
            referred_by_client_id: referrer.id,
            referral_source: params.src,
            referral_card_kind: params.k ?? null,
        }
    } catch (err) {
        // Metadata: una caída de red acá no puede tumbar un alta.
        console.warn('[join-referral] ref descartado: fallo consultando al referente', err)
        return null
    }
}
