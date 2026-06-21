import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader, errors as joseErrors } from 'jose'
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
        if (error || !data.user) {
            console.error('[mobile-auth-401] getUser RECHAZO', { err: error?.message ?? 'no user' })
            return UNAUTHORIZED
        }
        return { ok: true, userId: data.user.id, via: 'getUser' }
    } catch (e) {
        // GoTrue caído: no podemos afirmar identidad -> 401 (no abrir acceso).
        console.error('[mobile-auth-401] getUser THREW', { err: (e as Error)?.message })
        return UNAUTHORIZED
    }
}

export async function verifyMobileBearer(token: string): Promise<MobileAuthResult> {
    if (!token) return UNAUTHORIZED
    const url = supabaseUrl()

    // DIAG [mobile-auth-401] TEMPORAL: decodificar (SIN verificar) el token para ver sus claims
    // reales vs lo esperado. iss/aud/alg/exp revelan el mismatch de una. No loguea el token.
    try {
        const h = decodeProtectedHeader(token)
        const c = decodeJwt(token)
        console.error('[mobile-auth-401] token claims', {
            alg: h.alg,
            kid: h.kid,
            iss: c.iss,
            aud: c.aud,
            sub: c.sub ? 'present' : 'MISSING',
            exp: c.exp,
            now: Math.floor(Date.now() / 1000),
            expectedIss: `${url}/auth/v1`,
            expectedAud: AUDIENCE,
        })
    } catch (e) {
        console.error('[mobile-auth-401] decode FALLO (token no es JWT?)', { err: (e as Error)?.message })
    }

    if (!url) {
        console.error('[mobile-auth-401] sin NEXT_PUBLIC_SUPABASE_URL -> getUser directo')
        return verifyViaGetUser(token) // sin URL no se puede armar el JWKS
    }

    try {
        const { payload } = await jwtVerify(token, getJwks(url), {
            issuer: `${url}/auth/v1`,
            audience: AUDIENCE,
        })
        if (typeof payload.sub === 'string' && payload.sub) {
            return { ok: true, userId: payload.sub, via: 'jose' }
        }
        console.error('[mobile-auth-401] jose OK pero payload SIN sub -> 401')
        return UNAUTHORIZED // token válido pero sin sub -> no es una sesión de usuario
    } catch (err) {
        const name = (err as Error)?.constructor?.name
        if (isUnambiguousTokenError(err)) {
            console.error('[mobile-auth-401] hard 401 (token EXPIRADO)', { name })
            return UNAUTHORIZED
        }
        // claim iss/aud (drift de env) o JWKS/red/kid/alg/firma: que decida GoTrue (autoritativo).
        console.error('[mobile-auth-401] jose lanzo, degrado a getUser', {
            name,
            claim: (err as { claim?: string })?.claim,
        })
        return verifyViaGetUser(token)
    }
}
