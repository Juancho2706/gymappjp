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
 *  2. Token EXPIRADO -> 401 local, sin red (getUser también lo rechazaría).
 *  3. Cualquier otra cosa (claim iss/aud/nbf por drift de env, JWKS inalcanzable, kid
 *     desconocido, alg HS legacy, firma que no resuelve, error desconocido) -> DEGRADAR a
 *     `admin.auth.getUser` (red, autoritativo). Nunca un 401 masivo por una aserción local
 *     estricta (iss/aud) ni por una caída de infra de JWKS.
 */

const AUDIENCE = 'authenticated'

function supabaseUrl(): string {
    // Normalizar trailing slash: un '/' final en NEXT_PUBLIC_SUPABASE_URL haría
    // issuer `${url}//auth/v1` != iss real del token -> falso claim-mismatch. Blindaje.
    return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
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
 * ¿El error de jwtVerify es un fallo INEQUÍVOCO del token (rechazar local) o algo que conviene
 * que decida GoTrue (degradar a getUser)? PURO -> testeable. Solo el token EXPIRADO es 401 local
 * (getUser también lo rechazaría; el 401 local evita un round-trip por token vencido).
 * Claim-validation (iss/aud/nbf) DEJA DE SER 401 duro: puede ser drift de env (trailing slash,
 * dominio custom) sobre un token legítimo del propio proyecto -> degradar a getUser (autoritativo:
 * valida firma + exp + revocación + binding de proyecto). Firma/JWKS/kid/alg ya degradaban.
 */
export function isUnambiguousTokenError(err: unknown): boolean {
    return err instanceof joseErrors.JWTExpired
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
        // claim iss/aud (drift de env) o JWKS/red/kid/alg/firma: que decida GoTrue (autoritativo).
        // Log de bajo volumen para confirmar el subtipo real y, si es iss/aud, corregir el env.
        console.warn('[mobile-auth] jose verify degradado a getUser', {
            name: (err as Error)?.constructor?.name,
            claim: (err as { claim?: string })?.claim,
        })
        return verifyViaGetUser(token)
    }
}
