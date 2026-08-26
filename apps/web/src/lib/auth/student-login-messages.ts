// Copy compartido de los logins de ALUMNO (`/c/[coach_slug]/login` y `/t/[team_slug]/login`).
//
// «Vive tu app» directo, SPEC §4: en web nadie que tenga cuenta es un extraño. Dos mensajes
// nacen acá para que el formulario y el server action digan exactamente lo mismo en las dos
// superficies:
//
//  1. `coachAccountMessage` — el coach entró con SU cuenta al login de sus alumnos. La sesión se
//     cierra (`signOut({ scope: 'local' })`, decisión D4 = B) y se le devuelve una salida, no un
//     error mudo. El vocabulario sale de `coaches.persona` (regla de producto 8: nada de «alumno»
//     hardcodeado en copy nuevo).
//  2. `getStudentLoginQueryNotice` — el `?error=` que el propio árbol nos manda por URL. Hoy solo
//     `vive_tu_app_expirado`, que emite `/vive-tu-app` cuando el magic link del demo venció o ya
//     se usó; hasta ahora caía en un login pelado (callejón 4 de la SPEC).
//
// Un código desconocido NO pinta nada: un `?error=` inventado en la barra no debe poder plantar
// un banner rojo en la pantalla de marca del coach.

import { PERSONAS, personaNoun, type Persona } from '@eva/schemas'

export type StudentLoginAction = {
    href: string
    label: string
}

export type StudentLoginNotice = {
    error: string
    action?: StudentLoginAction
}

/**
 * Persona de respaldo: los 48 coaches con `persona` NULL (y cualquier valor stale que no esté en
 * el CHECK) leen el vocabulario de `strength`, que es el default histórico del producto.
 */
const FALLBACK_PERSONA: Persona = 'strength'

function nounFor(persona: string | null | undefined, plural = false): string {
    const known = (PERSONAS as readonly string[]).includes(persona ?? '')
        ? (persona as Persona)
        : FALLBACK_PERSONA
    return personaNoun(known, plural)
}

/** Salida del coach que aterrizó en el login de alumno. Nunca cambia según el slug. */
export const COACH_ACCOUNT_ACTION: StudentLoginAction = {
    href: '/login',
    label: 'Ir al login de coach',
}

export function coachAccountMessage(persona?: string | null): string {
    return (
        `Esta es tu cuenta de coach, no una cuenta de ${nounFor(persona)}. ` +
        `Para ver tu app como la ven tus ${nounFor(persona, true)}, entra a tu panel y toca Vive tu app.`
    )
}

export const STUDENT_LOGIN_ERROR_CODES = {
    VIVE_TU_APP_EXPIRADO: 'vive_tu_app_expirado',
} as const

// El nombre del alumno de ejemplo NO se puede nombrar acá: cuando el `verifyOtp` falla, el route
// nunca llegó a leer la fila del demo, así que no hay `full_name` que pasar por la URL (y el login
// es anónimo: resolverlo en la page pediría service_role para un dato decorativo).
const QUERY_NOTICES: Record<string, StudentLoginNotice> = {
    [STUDENT_LOGIN_ERROR_CODES.VIVE_TU_APP_EXPIRADO]: {
        error: 'Tu link para entrar a tu app de ejemplo venció o ya se usó. Vuelve a tu panel y toca Vive tu app de nuevo.',
        action: { href: '/coach/guia', label: 'Ir a mi panel' },
    },
}

export function getStudentLoginQueryNotice(
    code: string | null | undefined,
): StudentLoginNotice | null {
    if (!code) return null
    return QUERY_NOTICES[code] ?? null
}
