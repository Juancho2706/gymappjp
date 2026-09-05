import { stringFromBase64URL } from '@supabase/ssr'

// ── Fuga de sesión en los logs (incidente 04-09, `/api/auth/google-link` 21:43Z y 21:52Z) ─────────
//
// Una cookie de sesión CORRUPTA (chunk perdido ⇒ JSON truncado, como el auth user huérfano del caso
// Leonardo) hacía que `@supabase/auth-js` escupiera el payload ENTERO —access_token, refresh_token y
// email— a los runtime logs de Vercel. Dos saltos, los dos dentro de la librería:
//   1. `auth-js/dist/main/lib/helpers.js:128-139 getItemAsync()` hace `JSON.parse(value)` y, cuando
//      falla, DEVUELVE EL STRING CRUDO en lugar de `null`;
//   2. `auth-js/dist/main/GoTrueClient.js:3803 _recoverAndRefresh()` hace `currentSession.user = …`
//      sobre ese string ⇒ `TypeError: Cannot create property 'user' on string '{"access_token":…}'`
//      — el motor mete el VALOR del receptor dentro del mensaje. Y lo peor: ese throw lo atrapa su
//      propio `catch` y lo imprime con `console.error(err)` (GoTrueClient.js:3855-3858).
//
// De ahí que NINGÚN try/catch en una route pueda tapar esto: la librería nunca relanza, ya logueó.
// El único punto donde se corta es ANTES, no dejándole llegar al storage un valor no parseable.
//
// NO cambia el contrato: para auth-js una cookie descartada es exactamente "no hay sesión" ⇒ el
// caller lee `user: null` y responde 401 — que es lo que ya pasaba el 04-09, pero sin el log.
// Falso positivo imposible: una sesión USABLE siempre parsea a objeto (`_isValidSession` exige
// access_token/refresh_token/expires_at, GoTrueClient.js:3748-3755); lo que se tira acá es
// precisamente lo que la librería iba a descartar igual dos líneas después.

/** `sb-<ref>-auth-token` y sus chunks `.0`, `.1`, … NO matchea `…-auth-token-code-verifier` (PKCE, no es JSON). */
const AUTH_TOKEN_COOKIE = /^sb-.+-auth-token(\.(?:0|[1-9][0-9]*))?$/
const BASE64_PREFIX = 'base64-'

/** `sb-x-auth-token.3` → `sb-x-auth-token`. Mismo sufijo que `isChunkLike()` de @supabase/ssr. */
function authCookieBaseName(name: string) {
    return name.replace(/\.(?:0|[1-9][0-9]*)$/, '')
}

/** ¿Lo que `getItemAsync()` va a poder parsear? Espejo de su `JSON.parse` (con el decode de ssr). */
function isParseableSession(combined: string) {
    let decoded = combined
    if (combined.startsWith(BASE64_PREFIX)) {
        try {
            decoded = stringFromBase64URL(combined.slice(BASE64_PREFIX.length))
        } catch {
            return false
        }
    }
    try {
        const parsed: unknown = JSON.parse(decoded)
        return typeof parsed === 'object' && parsed !== null
    } catch {
        return false
    }
}

/** Saca de la vista de auth-js las cookies de sesión que no son JSON válido. */
export function dropCorruptAuthCookies<T extends { name: string; value: string }>(all: T[]): T[] {
    const bases = new Set(
        all.filter((c) => AUTH_TOKEN_COOKIE.test(c.name)).map((c) => authCookieBaseName(c.name))
    )
    if (bases.size === 0) return all

    const byName = new Map(all.map((c) => [c.name, c.value]))
    const corrupt = new Set<string>()

    for (const base of bases) {
        // Mismo orden que `combineChunks()` de @supabase/ssr: gana la cookie entera; si no está, se
        // concatenan `.0`, `.1`, … hasta el primer hueco (justo el caso que produce el JSON truncado).
        let combined = byName.get(base) ?? ''
        if (!combined) {
            const parts: string[] = []
            for (let i = 0; ; i++) {
                const chunk = byName.get(`${base}.${i}`)
                if (!chunk) break
                parts.push(chunk)
            }
            combined = parts.join('')
        }
        if (combined && !isParseableSession(combined)) corrupt.add(base)
    }

    if (corrupt.size === 0) return all

    // Log FIJO: ni el valor, ni el error, ni el nombre de la cookie (el `sb-<ref>-` no aporta nada y
    // el valor es justamente lo que se filtró). Solo cuántos grupos se descartaron.
    console.warn('[supabase/server] cookie de sesión ilegible descartada', { groups: corrupt.size })
    return all.filter((c) => !corrupt.has(authCookieBaseName(c.name)))
}
