/**
 * Estado de la TANDA (no de un test). Módulo con estado a propósito.
 *
 * `prod-suave` corre con `workers: 1`, así que todos los specs comparten este proceso y este
 * módulo: cuando el guardián de salud encuentra la DB sufriendo, levanta la bandera acá y los
 * tests siguientes se saltan sin volver a preguntar. Ese "sin volver a preguntar" es el punto:
 * un guardián que reintenta contra una base caída es otro cliente golpeándola.
 */

let abortedReason: string | null = null

/** Corta la tanda. Solo la PRIMERA causa queda registrada: es la que explica el resto. */
export function abortSession(reason: string): void {
    if (abortedReason === null) abortedReason = reason
}

/** `null` mientras la tanda siga viva. */
export function sessionAbortReason(): string | null {
    return abortedReason
}

/** Solo para tests del propio andamiaje. */
export function resetSession(): void {
    abortedReason = null
}
