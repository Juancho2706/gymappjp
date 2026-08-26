/**
 * Native Google Sign-In for the COACH flow (login + register).
 *
 * Web parity: apps/web usa Google Identity Services (GIS, iframe) + `signInWithIdToken`
 * (lib/auth/google-gis.ts + post-google-auth.ts). El iframe GIS NO aplica a RN — acá usamos
 * el SDK NATIVO `@react-native-google-signin/google-signin` para obtener el `idToken` y lo
 * canjeamos con el MISMO `supabase.auth.signInWithIdToken({ provider: 'google', token })`.
 *
 * Nonce: la guía oficial de Supabase para RN + google-signin NO usa nonce (el idToken ya viene
 * ligado al webClientId configurado en el provider Google de Supabase). Web usa nonce porque el
 * navegador expone el hash a GIS; en nativo no hay ese vector, así que se omite (paridad de
 * seguridad equivalente: el aud del token = webClientId).
 *
 * Post-auth espejo de `resolvePostGoogleAuthUrl`: tras el sign-in resolvemos el destino según
 * exista (o no) una fila `coaches` para el user. NO auto-creamos el coach acá (igual que web:
 * el alta pasa por el onboarding que recolecta brand_name + consentimientos).
 *
 * Google ALUMNO está DIFERIDO por decisión CEO — este flujo es SOLO coach.
 */
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import { supabase } from '../supabase'
import { getCoachProfile } from '../coach'
import { apiFetch } from '../api'

/**
 * webClientId = el MISMO valor que el web usa en NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth client tipo
 * "Web application" del proyecto de Google Cloud). En RN se declara como EXPO_PUBLIC_GOOGLE_CLIENT_ID
 * (ver eas.json). El idToken que devuelve el SDK nativo lleva ese client id como `aud`, que es lo que
 * Supabase valida contra el provider Google. Android/iOS ADEMÁS necesitan sus propios OAuth clients
 * nativos (SHA-1 Android / bundle iOS) en el MISMO proyecto — ver reporte para el CEO.
 */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID

let configured = false

/** Idempotente. Sin webClientId configurado devuelve false → el botón no se muestra (fail-closed). */
export function configureGoogleSignIn(): boolean {
  if (!WEB_CLIENT_ID) return false
  if (!configured) {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      // Solo necesitamos identidad (idToken). Sin scopes extra ni offlineAccess (no usamos serverAuthCode).
      scopes: ['profile', 'email'],
    })
    configured = true
  }
  return true
}

export function isGoogleSignInAvailable(): boolean {
  // Exige formato real de OAuth client ID — un placeholder tipo "REEMPLAZAR_*"
  // en el env NO debe mostrar un botón Google roto (MT-42).
  return Boolean(WEB_CLIENT_ID && WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com'))
}

export class GoogleSignInError extends Error {
  code: 'cancelled' | 'in_progress' | 'play_services' | 'no_id_token' | 'supabase' | 'unknown'
  constructor(
    code: GoogleSignInError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'GoogleSignInError'
    this.code = code
  }
}

export interface GoogleAuthResult {
  userId: string
  email: string | null
  /** Nombre que Google reporta — sirve para prefill del onboarding de registro. */
  fullName: string | null
}

/**
 * W3.13b — avisa al servidor que ESTE usuario acaba de enlazar/entrar con Google, para que corra la
 * rotación anti-takeover (`apps/web/src/lib/auth/google-link-rotation.ts`).
 *
 * POR QUÉ HACE FALTA ACÁ. La web dispara la rotación desde su camino post-Google de cliente
 * (`api/auth/google-link`, por cookie), pero el binario canjea el idToken él mismo con
 * `signInWithIdToken` y nunca pasa por ahí: sin esta llamada, la víctima que entra con Google DESDE
 * LA APP no dispara nada y el intruso que registró su correo con contraseña conserva el acceso. El
 * endpoint gemelo `api/mobile/auth/google-link` autentica por Bearer y no recibe parámetros — la
 * identidad sale del token.
 *
 * FAIL-SILENT TOTAL, y por eso NO se hace `await`: es una tarea de servidor, no un paso del login.
 * `fetch` en RN no tiene timeout, así que esperar una red muerta dejaría al coach mirando el spinner
 * después de haberse autenticado bien. Una sola llamada, sin reintentos: si se pierde, el próximo
 * ingreso con Google la repite y el endpoint es idempotente (`email_verified_at` ya sellado no rota
 * de nuevo).
 *
 * Se pasa el token EXPLÍCITO de la sesión recién creada en vez de `authenticated: true` a propósito:
 * ese modo mete la llamada en el manejo central de 401 de `apiFetch` (refresh y, en el peor caso,
 * `signOut`) y nada de este aviso puede tener efectos sobre la sesión que el coach acaba de abrir.
 */
function notifyGoogleLink(accessToken: string | null): void {
  if (!accessToken) return
  void apiFetch<{ ok: true }>('/api/mobile/auth/google-link', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {
    // Silencio deliberado: red caída, 500 o endpoint aún no desplegado JAMÁS bloquean el login.
  })
}

/**
 * Ejecuta el flujo nativo: hasPlayServices → signIn → extrae idToken → signInWithIdToken.
 * Lanza GoogleSignInError (con `code`) en cualquier fallo; la UI mapea el code a copy.
 */
export async function signInWithGoogleCoach(): Promise<GoogleAuthResult> {
  if (!configureGoogleSignIn()) {
    throw new GoogleSignInError('unknown', 'Google no está configurado en esta app.')
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  } catch {
    throw new GoogleSignInError('play_services', 'Google Play Services no está disponible o desactualizado.')
  }

  let idToken: string | null = null
  try {
    const response = await GoogleSignin.signIn()
    // API moderna (v13+): { type: 'success', data } | { type: 'cancelled' }.
    if (response.type === 'cancelled') {
      throw new GoogleSignInError('cancelled', 'Cancelaste el inicio de sesión con Google.')
    }
    idToken = response.data?.idToken ?? null
  } catch (err) {
    if (err instanceof GoogleSignInError) throw err
    const code = (err as { code?: string })?.code
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleSignInError('cancelled', 'Cancelaste el inicio de sesión con Google.')
    }
    if (code === statusCodes.IN_PROGRESS) {
      throw new GoogleSignInError('in_progress', 'Ya hay un inicio de sesión en curso.')
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError('play_services', 'Google Play Services no está disponible.')
    }
    throw new GoogleSignInError('unknown', 'No se pudo iniciar sesión con Google. Intenta de nuevo.')
  }

  if (!idToken) {
    throw new GoogleSignInError('no_id_token', 'Google no devolvió un token válido. Intenta de nuevo.')
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error || !data.user) {
    throw new GoogleSignInError('supabase', 'No se pudo validar tu sesión de Google. Intenta de nuevo.')
  }

  notifyGoogleLink(data.session?.access_token ?? null)

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    fullName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null,
  }
}

export type GoogleCoachDestination =
  | { kind: 'home' }
  | { kind: 'onboarding' } // Google OK pero sin fila coaches → completar alta (solo intent register)
  | { kind: 'no-account' } // login sin coach → cortar sesión y pedir registro

/**
 * Espejo de `resolvePostGoogleAuthUrl` (web): decide el destino según exista la fila `coaches`.
 * - coach existe → home (login y register de un coach que vuelve).
 * - sin coach + register → onboarding (recolecta brand_name + consentimientos).
 * - sin coach + login → no-account (la UI corta la sesión Google y sugiere registrarse).
 */
export async function resolveGoogleCoachDestination(
  intent: 'login' | 'register',
): Promise<GoogleCoachDestination> {
  const coach = await getCoachProfile()
  if (coach) return { kind: 'home' }
  return intent === 'register' ? { kind: 'onboarding' } : { kind: 'no-account' }
}

/** Cierra la sesión nativa de Google + Supabase (para el caso login sin cuenta coach). */
export async function signOutGoogleAndSupabase(): Promise<void> {
  await GoogleSignin.signOut().catch(() => {})
  await supabase.auth.signOut().catch(() => {})
}
