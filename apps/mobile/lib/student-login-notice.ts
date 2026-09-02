import { PERSONAS, personaNoun, type Persona } from '@eva/schemas'

/**
 * Espejo RN del aviso `coach_account` del login de ALUMNO (VTA-3.12, deuda declarada en
 * `docs/specs/vive-tu-app-directo/TASKS.md`).
 *
 * Fuente de verdad del copy: `apps/web/src/lib/auth/student-login-messages.ts`
 * (`coachAccountMessage`), que es lo que ya dicen `/c/[coach_slug]/login` y `/t/[team_slug]/login`.
 * Hasta hoy la app respondía al mismo caso —el coach entrando con SU cuenta por el código de sus
 * alumnos— con «Esta cuenta no pertenece a la plataforma de este coach», que es verdad y no sirve
 * para nada: el coach no entiende qué hizo mal ni por dónde salir.
 *
 * Módulo PURO (cero imports de react-native/expo/supabase) ⇒ testeable con vitest.
 */

/**
 * Persona de respaldo, la MISMA que la web: los coaches con `persona` NULL (y cualquier valor
 * stale fuera del CHECK) leen el vocabulario de `strength`, default histórico del producto.
 */
const FALLBACK_PERSONA: Persona = 'strength'

function nounFor(persona: string | null | undefined, plural = false): string {
    const known = (PERSONAS as readonly string[]).includes(persona ?? '')
        ? (persona as Persona)
        : FALLBACK_PERSONA
    return personaNoun(known, plural)
}

/**
 * Salida concreta en la app. La web ofrece un link «Ir al login de coach»; acá el equivalente es
 * la card «Soy coach» de la pantalla de entrada — el botón «Elegir otro rol» del login solo existe
 * cuando se llegó con `?switch=1`, así que nombrarlo mentiría la mitad de las veces.
 */
export const COACH_ACCOUNT_LOGIN_EXIT = 'Vuelve al inicio y entra por «Soy coach».'

/**
 * El coach entró con su propia cuenta al login de sus alumnos. Primera oración VERBATIM de la web
 * (mismo vocabulario por persona); la segunda es la salida, en los términos de la app.
 */
export function coachAccountLoginMessage(persona?: string | null): string {
    return (
        `Esta es tu cuenta de coach, no una cuenta de ${nounFor(persona)}. ` +
        `Para ver tu app como la ven tus ${nounFor(persona, true)}, entra a tu panel y toca Vive tu app. ` +
        COACH_ACCOUNT_LOGIN_EXIT
    )
}
