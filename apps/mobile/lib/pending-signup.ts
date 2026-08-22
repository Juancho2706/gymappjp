/**
 * Credenciales del alta RECIÉN hecha, SOLO en memoria, para entrar solo al confirmar el correo.
 *
 * Por qué existe (QA del owner 22-08, Recorrido A): el alta móvil no abre sesión hasta que el coach
 * confirma el correo (GoTrue rechaza `signInWithPassword` con «Email not confirmed»). El coach
 * confirmaba en el navegador, volvía a la app y «Ya confirmé · Ir al panel» lo dejaba en el LOGIN
 * tipeando de nuevo lo que acababa de escribir. Con esto, al volver a la app (o al tocar el botón)
 * la pantalla de verificación intenta el login con lo que el coach ya escribió y entra directo.
 *
 * Nunca se persiste: si la app muere, el coach entra por el login como siempre. Se consume una vez
 * (`clearPendingSignup`) apenas hay sesión.
 */
type PendingSignup = { email: string; password: string }

let pending: PendingSignup | null = null

export function rememberPendingSignup(email: string, password: string): void {
    pending = { email: email.trim().toLowerCase(), password }
}

/** Devuelve las credenciales si coinciden con el email de la pantalla (o si no se pasa email). */
export function peekPendingSignup(email?: string | null): PendingSignup | null {
    if (!pending) return null
    if (email && pending.email !== email.trim().toLowerCase()) return null
    return pending
}

export function clearPendingSignup(): void {
    pending = null
}
