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
    no_google_account: {
        coach: 'No encontramos una cuenta con ese correo de Google.',
    },
    session_expired: {
        coach: 'Tu sesión expiró. Inicia sesión nuevamente.',
        enterprise: 'Tu sesión expiró. Inicia sesión nuevamente.',
    },
    captcha_failed: {
        coach: 'No pudimos verificar el captcha. Reintenta.',
        enterprise: 'No pudimos verificar el captcha. Reintenta.',
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
} as const
