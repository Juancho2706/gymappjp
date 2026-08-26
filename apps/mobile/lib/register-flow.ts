/**
 * Decisión post-alta del registro coach free en RN (W3.2b de `docs/specs/flujo-coach-nuevo`) —
 * parte PURA.
 *
 * Por qué existe: hasta hoy `(auth)/register.tsx` mandaba SIEMPRE a `/(auth)/verify-email`, sin
 * mirar en qué estado nació la cuenta. Con el alta sin muro de correo (D1 = A) el server la crea
 * ya `active` y esa pantalla no tiene nada que verificar: el coach queda esperando un correo que
 * no necesita. La regla de «a dónde va» es lo único testeable de ese camino —la pantalla arrastra
 * moti, expo-router y lucide y no se puede montar en la suite—, así que vive acá, igual que
 * `lib/resend-confirmation.ts` y `components/coach/directory/guided-invite.ts`.
 *
 * Nada de acá autoriza nada: quién entra al panel lo decide `signInWithPassword` contra GoTrue.
 */

/**
 * Estado con el que el server declara el alta (`/api/mobile/auth/register-coach-free`, W3.2).
 * `pending_email` = nació con el muro del correo; `active` = ya se puede entrar.
 */
export type RegisterCoachStatus = 'active' | 'pending_email'

/** Los dos únicos destinos post-alta. `panel` = login inmediato; `verify_email` = pantalla de siempre. */
export type PostRegisterRoute = 'panel' | 'verify_email'

/**
 * A dónde va el coach recién registrado.
 *
 * FAIL-SAFE hacia `verify_email` a propósito: el campo `status` es NUEVO (W3.2) y el binario con
 * OTA puede correr contra un server anterior que no lo manda. Ausente, `pending_email` o cualquier
 * basura ⇒ pantalla de verificación, que es el comportamiento que ya existía y del que se sale con
 * «Ya confirmé · Ir al panel». Solo el `active` explícito salta la pantalla: adivinar al revés
 * dejaría al coach en un login que GoTrue va a rechazar con «Email not confirmed».
 */
export function postRegisterRoute(status: string | null | undefined): PostRegisterRoute {
    return status === 'active' ? 'panel' : 'verify_email'
}

/**
 * URL de la pantalla de verificación con lo que esa pantalla necesita.
 *
 * - `email`: para no hacerlo tipear de nuevo y para casar las credenciales en memoria.
 * - `uid`: ÚNICA llave del reenvío del correo (no hay sesión). Un server anterior a W4 no lo manda
 *   y la pantalla degrada sola, por eso es opcional.
 * - `alreadyActive`: el alta ya está `active` pero el login inmediato no salió (red, carrera). La
 *   pantalla lo usa SOLO para no mentir —no hay correo que esperar ni nada que reenviar—; el
 *   permiso real de entrar sigue siendo la sesión.
 */
export function verifyEmailHref(input: {
    email: string
    uid?: string | null
    alreadyActive?: boolean
}): string {
    const params = [`email=${encodeURIComponent(input.email)}`]
    const uid = (input.uid ?? '').trim()
    if (uid) params.push(`uid=${encodeURIComponent(uid)}`)
    if (input.alreadyActive) params.push('active=1')
    return `/(auth)/verify-email?${params.join('&')}`
}
