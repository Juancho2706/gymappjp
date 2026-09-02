import { z } from 'zod'

/**
 * Códigos públicos EVA según el contrato histórico `[A-Z2-9]{5}` (excluye 0/1).
 * El preprocess permite pegar el código en minúsculas sin relajar el output canónico.
 */
export const CoachInviteCodeSchema = z.preprocess(
    value => typeof value === 'string' ? value.trim().toUpperCase() : value,
    z.string().regex(/^[A-Z2-9]{5}$/, 'Código de coach inválido'),
)

/**
 * Contrato compatible con los slugs históricos que hoy resuelven web y mobile.
 * El output siempre queda en minúsculas.
 */
export const CoachSlugSchema = z.preprocess(
    value => typeof value === 'string' ? value.trim().toLowerCase() : value,
    z.string()
        .min(3, 'Slug de coach inválido')
        .max(50, 'Slug de coach inválido')
        .regex(/^[a-z0-9-]+$/, 'Slug de coach inválido'),
)

export const MobileStudentWorkspaceValidationRequestSchema = z.object({
    coachId: z.string().uuid(),
}).strict()

export type MobileStudentWorkspaceValidationRequest = z.infer<
    typeof MobileStudentWorkspaceValidationRequestSchema
>

export const MobileStudentWorkspaceValidationErrorCodeSchema = z.enum([
    'MISSING_TOKEN',
    'INVALID_TOKEN',
    'VALIDATION_ERROR',
    'ACCESS_DENIED',
    'ACCOUNT_PAUSED',
    'VALIDATION_UNAVAILABLE',
])

export const MobileStudentWorkspaceValidationSuccessSchema = z.object({
    ok: z.literal(true),
    forcePasswordChange: z.boolean(),
}).strict()

export const MobileStudentWorkspaceValidationErrorSchema = z.object({
    ok: z.literal(false),
    code: MobileStudentWorkspaceValidationErrorCodeSchema,
    error: z.string(),
}).strict()

export const MobileStudentWorkspaceValidationResponseSchema = z.discriminatedUnion('ok', [
    MobileStudentWorkspaceValidationSuccessSchema,
    MobileStudentWorkspaceValidationErrorSchema,
])

export type MobileStudentWorkspaceValidationResponse = z.infer<
    typeof MobileStudentWorkspaceValidationResponseSchema
>

export type CoachIdentifierParseResult =
    | { type: 'code'; value: string }
    | { type: 'slug'; value: string }
    | { type: 'invalid' }

const MAX_IDENTIFIER_INPUT_LENGTH = 2_048
const WEB_PROTOCOL_RE = /^https?:\/\//i
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const SCHEMELESS_HOST_RE = /^(?:www\.)?[^/\s]+\.[^/\s]+(?:[/?#]|$)/i

function safeDecode(value: string): string | null {
    try {
        return decodeURIComponent(value)
    } catch {
        return null
    }
}

/**
 * Rutas públicas que llevan el identificador del coach en el segmento siguiente:
 *  - `c`      → `/c/<código|slug>` y `/c/<…>/login` (login de marca, reclamado como deep link).
 *  - `invite` → alias histórico que sigue vivo en `+native-intent.ts`.
 *  - `join`   → `/join/<código>`, el enlace que EVA reparte de verdad (QR de Mi Marca, póster,
 *               `TeamShareLink`, tarjeta de Share Entreno con `?ref&src&k`). Antes caía en
 *               `invalid` y el alumno veía «Revisa el dato…» al pegar el link de su coach.
 *
 * NO agregar `t`, `org`, `e` ni comodines: su segundo segmento es un slug de equipo u
 * organización y resolvería a un coach equivocado.
 */
const IDENTIFIER_ROUTES = new Set(['c', 'invite', 'join'])

/** Parámetros que llevan el identificador cuando la ruta no lo trae (deep link propio, correos). */
const IDENTIFIER_QUERY_KEYS = ['identifier', 'code', 'invite', 'invite_code'] as const

/**
 * `?code=` es ambiguo y por eso se valida por forma antes de aceptarlo: los callbacks de
 * Supabase Auth viajan como `?code=<uuid>` (`app/auth/callback` y `app/register-callback`), y
 * un alumno que pega ese link terminaba mandando un código de un solo uso al RPC de branding
 * —el uuid pasa el `CoachSlugSchema` y se clasificaba como slug—. Solo cuenta si tiene la
 * forma del código público EVA (5 caracteres `[A-Za-z2-9]`, mayúsculas o minúsculas: el
 * `CoachInviteCodeSchema` normaliza después). Los emisores propios usan `?identifier=`.
 */
const AMBIGUOUS_QUERY_KEYS = new Set<string>(['code'])
const PUBLIC_CODE_SHAPE_RE = /^[A-Za-z2-9]{5}$/

function candidateFromPath(pathname: string, protocol: string, hostname: string): string | null {
    const pathSegments = pathname.split('/').filter(Boolean)
    const segments = protocol !== 'http:' && protocol !== 'https:' && hostname
        ? [hostname, ...pathSegments]
        : pathSegments

    const route = segments[0]?.toLowerCase()
    if (!route || !IDENTIFIER_ROUTES.has(route) || !segments[1]) return null
    return safeDecode(segments[1])
}

/**
 * Fallback cuando la ruta no es una de las públicas: el deep link interno de la app viaja como
 * `/alumno/codigo?identifier=…&auto=1` (`apps/mobile/app/+native-intent.ts`), así que pegar esa
 * misma URL tiene que funcionar. `URLSearchParams` ya decodifica el valor.
 */
function candidateFromQuery(search: string): string | null {
    if (!search) return null
    const params = new URLSearchParams(search)
    for (const key of IDENTIFIER_QUERY_KEYS) {
        const raw = params.get(key)?.trim()
        if (!raw) continue
        // Un `?code=` que no tiene forma de código EVA se ignora y se sigue buscando: es el
        // callback de auth de otro flujo, no el identificador de un coach.
        if (AMBIGUOUS_QUERY_KEYS.has(key) && !PUBLIC_CODE_SHAPE_RE.test(raw)) continue
        return raw
    }
    return null
}

function extractCandidate(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed || trimmed.length > MAX_IDENTIFIER_INPUT_LENGTH) return null

    const looksLikeUrl = SCHEME_RE.test(trimmed) || SCHEMELESS_HOST_RE.test(trimmed)
    if (looksLikeUrl) {
        const urlInput = SCHEMELESS_HOST_RE.test(trimmed) && !SCHEME_RE.test(trimmed)
            ? `https://${trimmed}`
            : trimmed
        try {
            // A propósito NO se filtra el host: `previewv2` y el QA local sirven otros orígenes, y
            // el valor extraído se valida igual contra la DB. Un host ajeno no puede inventar un
            // coach que no exista, así que endurecer esto solo rompería QA.
            const url = new URL(urlInput)
            return candidateFromPath(url.pathname, url.protocol, url.hostname)
                ?? candidateFromQuery(url.search)
        } catch {
            return null
        }
    }

    if (trimmed.startsWith('/')) {
        try {
            const url = new URL(trimmed, 'https://eva.local')
            return candidateFromPath(url.pathname, url.protocol, url.hostname)
                ?? candidateFromQuery(url.search)
        } catch {
            return null
        }
    }

    // Un valor crudo puede venir acompañado por query/hash al copiarlo desde una UI.
    const rawCandidate = trimmed.split(/[?#]/, 1)[0]
    // Un protocolo incompleto o una ruta no reconocida no debe degradar a slug.
    if (WEB_PROTOCOL_RE.test(rawCandidate) || rawCandidate.includes('/')) return null
    return safeDecode(rawCandidate)
}

/**
 * Clasifica de forma total (sin throw) un código, slug o link de entrada EVA.
 * Las rutas admitidas son `/c/<identificador>`, `/invite/<identificador>` y `/join/<identificador>`;
 * si ninguna calza, se busca el identificador en el query (`?identifier=`, `?code=`, …). `?code=`
 * solo cuenta si tiene forma de código público EVA — ver `AMBIGUOUS_QUERY_KEYS`.
 */
export function parseCoachIdentifier(input: unknown): CoachIdentifierParseResult {
    if (typeof input !== 'string') return { type: 'invalid' }

    const candidate = extractCandidate(input)
    if (candidate === null) return { type: 'invalid' }

    const code = CoachInviteCodeSchema.safeParse(candidate)
    if (code.success) return { type: 'code', value: code.data }

    const slug = CoachSlugSchema.safeParse(candidate)
    if (slug.success) return { type: 'slug', value: slug.data }

    return { type: 'invalid' }
}
