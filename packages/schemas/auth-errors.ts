// SAFE FOR MOBILE — sin dependencias (ni zod).
//
// GoTrue rechaza contraseñas con la protección de contraseñas filtradas (HIBP) activada:
// 422 weak_password "Password is known to be weak and easy to guess, please choose a
// different one.". El mensaje llega en inglés y contradice los chips verdes del form
// (la contraseña cumple largo/número/mayúscula pero aparece en filtraciones de datos),
// así que el alumno cree que el cambio "no funciona" (incidente Dudú 2026-07-25).
//
// GoTrue no traduce por Accept-Language: el mapeo es responsabilidad del cliente.

type AuthErrorLike = {
    code?: string
    message?: string
    /** AuthWeakPasswordError (supabase-js v2): ['length' | 'characters' | 'pwned']. */
    reasons?: string[]
}

/**
 * Mensaje en español cuando GoTrue rechaza la CONTRASEÑA en sí (filtrada/débil/igual a
 * la anterior). Devuelve `null` para cualquier otro error (sesión expirada, red, rate
 * limit...) para que cada flujo conserve su fallback contextual.
 */
export function passwordRejectionMessage(error: AuthErrorLike | null | undefined): string | null {
    if (!error) return null
    const code = error.code ?? ''
    const message = error.message ?? ''
    const reasons = Array.isArray(error.reasons) ? error.reasons : []

    const isWeak = code === 'weak_password' || /^password should/i.test(message)
        || /weak and easy to guess/i.test(message)
    if (isWeak) {
        if (reasons.includes('pwned') || /weak and easy to guess/i.test(message)) {
            return 'Esta contraseña aparece en filtraciones de datos de internet, por lo que es fácil de adivinar. Elige una distinta: evita nombres conocidos, fechas o palabras comunes.'
        }
        if (reasons.includes('length') || /at least \d+ characters/i.test(message)) {
            return 'La contraseña debe tener al menos 8 caracteres.'
        }
        return 'Esta contraseña es demasiado débil. Usa una más larga que combine letras, números y símbolos.'
    }

    if (code === 'same_password' || /different from the old password/i.test(message)) {
        return 'La nueva contraseña debe ser distinta a la actual.'
    }

    return null
}
