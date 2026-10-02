import { deviceFromUserAgent } from '@/lib/user-agent'
import type { RegistrationPlatform } from '@/lib/posthog/registration'

/**
 * Superficie desde la que se dio de alta el coach (`coaches.signup_surface`, B4 del plan
 * «Activación», `docs/specs/coach-onboarding-v2/TASKS.md`).
 *
 * Existe porque el embudo semanal tiene que separarse por web de escritorio, web del teléfono
 * (navegador o PWA) y app, y hasta el 02-10 la base no guardaba de dónde venía cada alta: la
 * plataforma solo viajaba en el evento de PostHog. Se escribe UNA vez, en el insert de la fila,
 * y solo desde el servidor (la columna no tiene grant de escritura a `authenticated`/`anon`).
 *
 * Es una etiqueta de medición, nunca autoriza nada: el user-agent lo escribe el cliente.
 */
export const SIGNUP_SURFACES = [
    'web_desktop',
    'web_mobile',
    'app_ios',
    'app_android',
    'app_unknown',
] as const

export type SignupSurface = (typeof SIGNUP_SURFACES)[number]

/** Altas web (correo y Google): teléfono o tablet ⇒ `web_mobile`; el resto ⇒ `web_desktop`. */
export function webSignupSurface(userAgent: string | null | undefined): SignupSurface {
    return deviceFromUserAgent(userAgent) === 'mobile' ? 'web_mobile' : 'web_desktop'
}

/**
 * Altas por `api/mobile/**`: las llama la app, así que todo lo que no se reconozca como iOS o
 * Android queda `app_unknown` en vez de inventar una plataforma (mismo criterio que
 * `resolveRegistrationPlatform`).
 */
export function appSignupSurface(platform: RegistrationPlatform): SignupSurface {
    if (platform === 'ios') return 'app_ios'
    if (platform === 'android') return 'app_android'
    return 'app_unknown'
}
