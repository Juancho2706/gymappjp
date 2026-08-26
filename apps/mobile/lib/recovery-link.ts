/**
 * Lectura del enlace de recuperación de contraseña (W4.2 de `docs/specs/flujo-coach-nuevo`).
 *
 * La pantalla `app/(auth)/reset-password.tsx` NO puede pintar el formulario porque «hay sesión»:
 * con la sesión de coach viva, `updateUser({ password })` le cambiaría su propia clave sin pedir
 * la anterior. Lo que habilita el formulario es haber **canjeado** el token del enlace, y ese
 * token llega dentro de la URL con la que se abrió la app. Este módulo es el único lugar que
 * sabe leer esa URL; la pantalla solo decide qué hacer con el resultado.
 *
 * Formas reales en las que el token puede llegar:
 *
 * 1. **Fragmento implícito** — es el caso del reset pedido DESDE la app:
 *    `lib/supabase.ts` crea el cliente sin `flowType`, o sea implícito, y
 *    `forgot-password.tsx` manda `redirectTo: 'eva://reset-password'`. GoTrue verifica el token
 *    en su `/auth/v1/verify` y redirige con la sesión en el **hash**:
 *    `eva://reset-password#access_token=…&refresh_token=…&type=recovery`.
 *    Como el cliente móvil tiene `detectSessionInUrl: false`, nadie lo consume solo.
 * 2. **`token_hash` en la query** — el camino del reset pedido desde la web:
 *    `apps/web/src/app/auth/callback/route.ts:47` reenvía `token_hash` + `type` al destino, y
 *    `/reset-password` está reclamada con `autoVerify` en las cuatro variantes de host
 *    (`app.json`), así que en Android ese link abre la app.
 * 3. **`code` en la query** — canje PKCE. Solo sirve si el `code_verifier` lo generó ESTE
 *    dispositivo; si el reset se pidió en otro lado, `exchangeCodeForSession` falla y la
 *    pantalla cae al fallback con salida (que es exactamente lo que debe pasar).
 * 4. **Error** — `?error=…` / `#error=…` con `error_code=otp_expired`: el enlace venció o ya se
 *    usó. Es un estado propio, no un «no llegó nada».
 *
 * `+native-intent.ts` NO toca esta ruta: `/reset-password` cae en su `return path` (`:43`) con la
 * query y el fragmento intactos.
 */

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; reason: 'expired' | 'invalid' }
  | { kind: 'none' }

/**
 * Lee la URL cruda con la que se abrió la app (`Linking.getInitialURL()` o el evento `url`).
 * Se parsea a mano —sin `new URL`— porque el esquema propio (`eva://…`) y las variantes de
 * dev (`exp://…/--/reset-password#…`) no son URLs «especiales» y su parseo varía por runtime.
 */
export function parseRecoveryLink(url: string | null | undefined): RecoveryLink {
  if (typeof url !== 'string' || url.trim() === '') return { kind: 'none' }

  const hashAt = url.indexOf('#')
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : ''
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url
  const queryAt = beforeHash.indexOf('?')
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : ''

  return readRecoveryParams(safeParams(fragment), safeParams(query))
}

/**
 * Misma lectura, pero desde los params que el router ya parseó (`useLocalSearchParams`). Cubre
 * el caso 2 (`token_hash` en la query de un App Link) sin depender de que `getInitialURL()`
 * siga disponible. El fragmento NUNCA llega por acá: React Navigation no lo convierte en param,
 * y por eso la pantalla igual consulta la URL cruda.
 */
export function recoveryLinkFromParams(
  params: Record<string, unknown> | null | undefined,
): RecoveryLink {
  if (!params) return { kind: 'none' }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === 'string' && first.trim() !== '') query.set(key, first)
  }
  return readRecoveryParams(new URLSearchParams(), query)
}

function safeParams(raw: string): URLSearchParams {
  try {
    return new URLSearchParams(raw)
  } catch {
    return new URLSearchParams()
  }
}

function readRecoveryParams(fragment: URLSearchParams, query: URLSearchParams): RecoveryLink {
  const pick = (key: string): string => (fragment.get(key) ?? query.get(key) ?? '').trim()

  // El error primero: un enlace vencido trae `error_code` y NADA más, y merece su propio copy
  // («pide uno nuevo»), no el genérico de «abre el enlace del correo».
  const errorCode = pick('error_code')
  const errorFlag = pick('error')
  if (errorCode || errorFlag) {
    const haystack = `${errorCode} ${pick('error_description')}`.toLowerCase()
    return { kind: 'error', reason: haystack.includes('expired') ? 'expired' : 'invalid' }
  }

  // `type` viaja en el fragmento implícito y en el link con `token_hash`; el canje PKCE no lo
  // trae. Si viene y NO es `recovery`, el enlace es de otra cosa (alta, magic link, cambio de
  // correo): canjearlo acá sería abrir el formulario de clave nueva con un token que nunca fue
  // de recuperación.
  const type = pick('type')
  if (type && type !== 'recovery') return { kind: 'error', reason: 'invalid' }

  const accessToken = pick('access_token')
  const refreshToken = pick('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }

  const tokenHash = pick('token_hash')
  if (tokenHash) return { kind: 'token_hash', tokenHash }

  const code = pick('code')
  if (code) return { kind: 'code', code }

  // Medio par de tokens = fragmento truncado. Sin `refresh_token` no hay sesión persistible, así
  // que es un enlace roto, no un «no llegó nada».
  if (accessToken || refreshToken) return { kind: 'error', reason: 'invalid' }

  return { kind: 'none' }
}
