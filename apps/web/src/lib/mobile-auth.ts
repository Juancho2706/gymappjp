import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Verificación de Bearer tokens para el bridge móvil (apps/mobile habla PostgREST/HTTP directo).
 *
 * SOLO para endpoints GET read-only (dashboard, pulse). Las MUTACIONES de cuenta
 * (crear/borrar/resetear alumnos) DEBEN seguir usando `admin.auth.getUser(token)` directo:
 * `jose` valida la FIRMA del token localmente pero NO consulta el estado de revocación en
 * GoTrue, así que un coach dado de baja con un token aún válido (~1h) podría mutar. Para
 * lecturas la ventana del JWT es aceptable; para escrituras NO.
 *
 * Estrategia fail-safe (regla global del plan):
 *  1. Verificación LOCAL con JWKS (sin red) -> camino rápido para el token válido.
 *  2. Token claramente inválido (expirado / claim iss-aud-nbf mala) -> 401 local, sin red.
 *  3. Cualquier ambigüedad (JWKS inalcanzable, kid desconocido, alg HS legacy, firma que no
 *     resuelve contra una key, error desconocido) -> DEGRADAR a `admin.auth.getUser` (red,
 *     autoritativo). Nunca un 401 masivo por una caída de infra de JWKS.
 */

const AUDIENCE = 'authenticated'

function supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks(url: string) {
    if (!_jwks) {
        // Cache a nivel de módulo: el módulo de la ruta persiste entre requests del mismo
        // worker -> el JWKS se reusa (a diferencia del proxy, que crea cliente por request).
        _jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`))
    }
    return _jwks
}

/**
 * ¿El error de jwtVerify es un fallo de validez del token (rechazar local) o algo ambiguo
 * (degradar a getUser)? PURO -> testeable. Solo los errores INEQUÍVOCOS de token caen a 401:
 * expirado y claim-validation (iss/aud/nbf/exp). Todo lo demás (firma, JWKS, kid, alg) degrada.
 */
export function isUnambiguousTokenError(err: unknown): boolean {
    return (
        err instanceof joseErrors.JWTExpired ||
        err instanceof joseErrors.JWTClaimValidationFailed
    )
}

export type MobileAuthResult =
    | { ok: true; userId: string; via: 'jose' | 'getUser' }
    | { ok: false; status: 401 }

const UNAUTHORIZED: MobileAuthResult = { ok: false, status: 401 }

/** Fallback autoritativo por red (también resuelve tokens HS legacy y revocación). */
async function verifyViaGetUser(token: string): Promise<MobileAuthResult> {
    try {
        const admin = createServiceRoleClient()
        const { data, error } = await admin.auth.getUser(token)
        if (error || !data.user) return UNAUTHORIZED
        return { ok: true, userId: data.user.id, via: 'getUser' }
    } catch {
        // GoTrue caído: no podemos afirmar identidad -> 401 (no abrir acceso).
        return UNAUTHORIZED
    }
}

export async function verifyMobileBearer(token: string): Promise<MobileAuthResult> {
    if (!token) return UNAUTHORIZED
    const url = supabaseUrl()
    if (!url) return verifyViaGetUser(token) // sin URL no se puede armar el JWKS

    try {
        const { payload } = await jwtVerify(token, getJwks(url), {
            issuer: `${url}/auth/v1`,
            audience: AUDIENCE,
        })
        if (typeof payload.sub === 'string' && payload.sub) {
            return { ok: true, userId: payload.sub, via: 'jose' }
        }
        return UNAUTHORIZED // token válido pero sin sub -> no es una sesión de usuario
    } catch (err) {
        if (isUnambiguousTokenError(err)) return UNAUTHORIZED
        // ambiguo (JWKS/red/kid/alg/firma): que decida GoTrue
        return verifyViaGetUser(token)
    }
}
