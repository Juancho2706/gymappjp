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

function candidateFromPath(pathname: string, protocol: string, hostname: string): string | null {
    const pathSegments = pathname.split('/').filter(Boolean)
    const segments = protocol !== 'http:' && protocol !== 'https:' && hostname
        ? [hostname, ...pathSegments]
        : pathSegments

    const route = segments[0]?.toLowerCase()
    if ((route !== 'c' && route !== 'invite') || !segments[1]) return null
    return safeDecode(segments[1])
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
            const url = new URL(urlInput)
            return candidateFromPath(url.pathname, url.protocol, url.hostname)
        } catch {
            return null
        }
    }

    if (trimmed.startsWith('/')) {
        try {
            const url = new URL(trimmed, 'https://eva.local')
            return candidateFromPath(url.pathname, url.protocol, url.hostname)
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
 * Las rutas admitidas son `/c/<identificador>` y `/invite/<identificador>`.
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
