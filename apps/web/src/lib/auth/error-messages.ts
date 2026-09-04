// Centralized auth URL-error code → message map.
// Used by `/login` and `/org/login` to render `?error=<code>` banners.

export type AuthErrorVariant = 'coach' | 'enterprise'

interface AuthErrorMessage {
    coach: string
    enterprise?: string
}

const MESSAGES: Record<string, AuthErrorMessage> = {
    auth_callback_failed: {
        coach: 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.',
    },
    confirmation_expired: {
        coach: 'El enlace de confirmación expiró. Solicita uno nuevo.',
        enterprise: 'El enlace de confirmación expiró. Contacta al administrador.',
    },
    // Copy que nombra la puerta: este es el login del COACH. El alumno que llega acá con Google (caso
    // Leonardo/Movens 2026-09-04) tiene que ver de inmediato que su entrada es el código de su coach
    // (el `StudentEntryCard` de abajo), no reintentar Google seis veces.
    no_google_account: {
        coach: 'No encontramos una cuenta de coach con ese Google. Si eres alumno, entra con el código o enlace de tu coach; si eres coach nuevo, crea tu cuenta.',
    },
    session_expired: {
        coach: 'Tu sesión expiró. Inicia sesión nuevamente.',
        enterprise: 'Tu sesión expiró. Inicia sesión nuevamente.',
    },
    captcha_failed: {
        coach: 'No pudimos verificar el captcha. Reintenta.',
        enterprise: 'No pudimos verificar el captcha. Reintenta.',
    },
    // «Vive tu app» (docs/specs/vive-tu-app-directo §3): el coach entró a su app de alumno y el
    // camino de vuelta ya no sirve — no había cookie de retorno, o `/volver-al-panel` se throttleó.
    // Solo lo emite ese handler y solo lo renderiza ESTE login (el del coach); el login del alumno
    // tiene su propio código (`vive_tu_app_expirado`).
    vive_tu_app_volver: {
        coach: 'Tu sesión de ejemplo terminó. Entra de nuevo a tu panel.',
    },
}

const FALLBACK: AuthErrorMessage = {
    coach: 'Ocurrió un error. Intenta de nuevo.',
    enterprise: 'Ocurrió un error. Intenta de nuevo.',
}

export function getAuthErrorMessage(
    code: string | null | undefined,
    variant: AuthErrorVariant,
): string | null {
    if (!code) return null
    const entry = MESSAGES[code] ?? FALLBACK
    return entry[variant] ?? entry.coach
}

export const AUTH_ERROR_CODES = {
    AUTH_CALLBACK_FAILED: 'auth_callback_failed',
    CONFIRMATION_EXPIRED: 'confirmation_expired',
    NO_GOOGLE_ACCOUNT: 'no_google_account',
    SESSION_EXPIRED: 'session_expired',
    CAPTCHA_FAILED: 'captcha_failed',
    VIVE_TU_APP_VOLVER: 'vive_tu_app_volver',
} as const
