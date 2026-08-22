import { safeNext } from '@/lib/auth/safe-next'

/**
 * Parámetros de `/auth/abrir-app` — la escala iOS del regreso a la app tras confirmar el correo.
 *
 * Vive fuera del componente porque son las dos únicas decisiones de la pantalla (a dónde salta el
 * botón, dónde aterriza «Seguir en la web») y las dos son puro texto: se pueden pinnear sin montar
 * React ni un DOM. `_lib` con guion bajo = carpeta privada para el router, no genera ruta.
 */

/**
 * Scheme + ruta que la app YA maneja: `apps/mobile/app/+native-intent.ts` reescribe
 * `eva://auth/confirmed?email=…` a `/(auth)/verify-email?confirmed=1&email=…`, y esa pantalla
 * intenta `signInWithPassword` sola con las credenciales del alta (o cae al login con el email
 * puesto si la app murió mientras el coach leía el correo).
 *
 * El nombre del parámetro (`email`, no `mail` ni `e`) es contrato con `+native-intent`: cambiarlo
 * acá sin cambiarlo allá deja al coach en el login con el campo vacío.
 */
const APP_CONFIRMED_URL = 'eva://auth/confirmed'

/** Aterrizaje web cuando no llega `next` o no pasa la allowlist. */
export const DEFAULT_WEB_NEXT = '/coach/dashboard'

/**
 * Tope del email que se refleja en el deep link. El máximo real de una dirección son 320 bytes
 * (64 local + @ + 255 dominio); más que eso no es un correo, es alguien probando cuánto aguanta la
 * URL que la app va a parsear.
 */
const MAX_EMAIL_LENGTH = 320

export interface AbrirAppParams {
    /** URL `eva://` del botón «Abrir EVA» y del salto automático. */
    deepLink: string
    /** Ruta interna ya validada para «Seguir en la web». Nunca `null`: siempre hay dónde caer. */
    webNext: string
    /** Email normalizado (`''` si no vino o no era usable) — solo para mostrarlo. */
    email: string
}

/**
 * Traduce el query de la página a las dos URLs que necesita.
 *
 * `next` pasa por `safeNext(raw, '/coach')`: es el MISMO criterio que usa el login, así que un
 * `?next=https://evil.tld` (o `//evil.tld`, o `/coach/..%2Fadmin`) cae al panel en vez de convertir
 * esta pantalla en un open redirect con aspecto de EVA.
 */
export function resolveAbrirAppParams(raw: { email?: unknown; next?: unknown }): AbrirAppParams {
    const email =
        typeof raw.email === 'string' && raw.email.trim().length <= MAX_EMAIL_LENGTH
            ? raw.email.trim()
            : ''

    return {
        deepLink: email ? `${APP_CONFIRMED_URL}?email=${encodeURIComponent(email)}` : APP_CONFIRMED_URL,
        webNext: safeNext(raw.next, '/coach') ?? DEFAULT_WEB_NEXT,
        email,
    }
}
