import 'server-only'

import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import type { PlatformEmailTakenReason } from '@/lib/auth/platform-email'

/**
 * `add_student_email_taken` emitido desde el SERVIDOR (W2.12 de flujo-coach-nuevo).
 *
 * POR QUÉ existe: el alta de alumno rechaza el correo ya registrado con un copy opaco a propósito
 * (`EMAIL_TAKEN_CLIENT_CREATE_ES`) y hasta hoy ese rechazo no dejaba NINGÚN rastro. No sabemos si
 * el callejón 16 pasa una vez por semana o en un tercio de las altas, y sin ese número no se puede
 * decidir cuánto invertir en la salida. Antes de reescribir el copy, medir.
 *
 * No puede vivir en el navegador: la razón granular (`taken_coach` vs. `taken_client` vs.
 * `taken_orphan` vs. `taken_auth`) es justo lo que el servidor **no** le cuenta al cliente para no
 * convertir el alta en un oráculo de correos ajenos. Si el evento saliera del navegador, la razón
 * tendría que viajar en la respuesta y el anti-sondeo se caería.
 *
 * Consentimiento (Ley 21.719): mismo criterio que `registration-events.ts` — es un hecho de
 * NEGOCIO del coach sobre su propia cuenta (`distinct_id` = su id). **Cero PII del alumno**: ni el
 * correo tipeado, ni su hash, ni el nombre. Solo la razón y desde qué superficie.
 */
export type AddStudentEmailTakenReason =
    | PlatformEmailTakenReason
    /** GoTrue rechazó el `createUser` por duplicado: carrera contra la RPC de disponibilidad. */
    | 'auth_duplicate'
    /** 23505 en el INSERT de `clients`: la fila ya existía con ese correo (misma carrera). */
    | 'clients_duplicate'

export async function captureAddStudentEmailTaken(input: {
    coachId: string
    reason: AddStudentEmailTakenReason
    /** Espejo de `sendClientLimitReachedEmail`: mismo vocabulario de superficie en la misma acción. */
    source: 'web_create' | 'mobile_create'
}): Promise<void> {
    // `capturePostHogServerEvent` nunca lanza y corta a 1,5 s. El `await` es obligatorio: este es
    // un camino que DEVUELVE (server action / NextResponse) y Vercel congela la invocación ahí,
    // llevándose el POST — la misma trampa que perdió 2 de 5 bienvenidas el 19-08. El coach ya
    // está frenado por el rechazo, así que el costo de esperar el evento es invisible.
    await capturePostHogServerEvent({
        event: 'add_student_email_taken',
        distinctId: input.coachId,
        properties: {
            reason: input.reason,
            source: input.source,
        },
    })
}
