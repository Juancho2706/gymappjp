/**
 * cap-nudge — núcleo PURO del barrido de cupo alcanzado (sin red, sin Supabase, sin Next).
 *
 * POR QUÉ EXISTE LA ESCALERA
 * El correo de venta por cupo (`sendClientLimitReachedEmail`) hoy solo se dispara cuando el coach
 * INTENTA agregar un alumno y el server lo rechaza con 402. Nadie barre a los que YA están arriba:
 * con Pricing v3 (Free = 1 alumno) hay 11 coaches con 1/1 que están «en cupo» de forma PERMANENTE
 * y jamás vuelven a intentar — para ellos el evento nunca ocurre y el correo se envió 0 veces.
 *
 * Pero «permanente» es exactamente el problema del barrido: si el cron mandara un correo cada vez
 * que ve a alguien lleno, ese coach recibiría un correo DIARIO para siempre. Por eso la cadencia es
 * una escalera con tope: T0, T0+7 d, T0+28 d ⇒ máximo 3 toques y después SILENCIO, hasta que cambie
 * el nivel de cupo del coach (subir de plan o grandfather mueven `max_clients` ⇒ los envíos viejos
 * dejan de contar y la escalera arranca de cero, porque el mensaje vuelve a ser nuevo y verdadero).
 *
 * El cooldown de 7 días del service (`CLIENT_LIMIT_EMAIL_COOLDOWN_DAYS`) es la SEGUNDA barrera: cubre
 * el cruce evento↔cron (un coach que intentó ayer y hoy entra al barrido no recibe dos correos).
 * Esta escalera es la primera y la que evita el spam eterno.
 *
 * Todo acá es puro y determinista (el reloj entra por parámetro) para poder testear la cadencia sin
 * DB ni fechas del sistema.
 */

/**
 * Tiers que entran al barrido. Solo `free`: son los únicos con cupo estructuralmente pequeño y sin
 * pago asociado; a un Pro lleno se le habla por otro canal (el upsell a Elite no es este correo).
 */
export const CAP_NUDGE_TIERS = ['free'] as const

/**
 * Días desde el PRIMER toque en los que cae cada correo de la escalera: 0, 7 y 28.
 * Los gaps derivados son 7 días (toque 1 → 2) y 21 días (toque 2 → 3).
 */
export const CAP_NUDGE_SCHEDULE_DAYS = [0, 7, 28] as const

/** Tope duro de toques por nivel de cupo (= largo de la escalera). */
export const CAP_NUDGE_MAX_TOUCHES = CAP_NUDGE_SCHEDULE_DAYS.length

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Tolerancia del peldaño: 12 horas. La cadencia es 0/7/28 días CONTADOS EN DÍAS, no en instantes.
 * La fila del ledger se escribe SEGUNDOS DESPUÉS del `now` de la corrida que la generó, así que a la
 * corrida del día 7 —a la misma hora del cron— le faltan siempre unos segundos para el gap exacto y
 * el toque 2 saldría recién el día 8 (y el 3 el día 29). Con media jornada de tolerancia el peldaño
 * cae el día que dice la escalera aunque el cron se corra un poco antes; media jornada es demasiado
 * poco para adelantar un peldaño entero, así que no abre la puerta al spam.
 */
export const LADDER_TOLERANCE_MS = 12 * 60 * 60 * 1000

/**
 * ¿El coach está en (o sobre) su cupo? Espejo EXACTO del gate 402 del server
 * (`api/mobile/coach/clients/route.ts`): `activeCount >= maxClients`.
 *
 * `maxClients <= 0` devuelve false a propósito: un cupo 0 (o negativo) es un dato roto o un plan
 * sin límite modelado, y no queremos mandarle correo de venta a alguien por un valor basura.
 */
export function isAtCap(input: { activeCount: number; maxClients: number }): boolean {
    return input.maxClients > 0 && input.activeCount >= input.maxClients
}

/**
 * Un envío previo del correo de cupo leído del ledger (`admin_audit_logs`).
 * `currentLimit` es `payload.current_limit`: el nivel de cupo que tenía el coach en ese envío.
 * `null` = fila vieja sin ese dato (o payload ilegible).
 */
export type CapNudgePriorSend = {
    sentAt: string
    currentLimit: number | null
}

export type CapNudgeDecision =
    | { action: 'send'; touch: 1 | 2 | 3; reason: 'first_touch' | 'ladder_due' }
    | { action: 'skip'; touch: number; reason: 'max_touches' | 'ladder_not_due' }

/**
 * Decide si a este coach le toca correo hoy.
 *
 * Solo cuentan los envíos del MISMO nivel de cupo (`currentLimit === input.currentLimit`) — si el
 * coach subió de plan, su cupo cambió, el mensaje es otro y la escalera se reinicia. Las filas con
 * `currentLimit === null` (ledger viejo sin el dato) también cuentan: criterio CONSERVADOR, ante la
 * duda preferimos callar antes que repetir un correo que quizás ya mandamos.
 *
 * `touch` en un `skip` por `ladder_not_due` es el toque que quedó PENDIENTE (el próximo);
 * en `max_touches` es la cantidad de toques ya gastados.
 *
 * El gap se compara con `LADDER_TOLERANCE_MS` de holgura (12 h) porque la escalera es 0/7/28 DÍAS
 * literales: un previo de hace 6 d 23 h ya es «el día 7» y manda; uno de hace 6 d 11 h todavía no.
 */
export function resolveCapNudgeDecision(input: {
    priorSends: CapNudgePriorSend[]
    currentLimit: number
    now: Date
}): CapNudgeDecision {
    const counted = input.priorSends
        .filter((send) => send.currentLimit === null || send.currentLimit === input.currentLimit)
        .map((send) => Date.parse(send.sentAt))
        // Fecha ilegible ⇒ la fila no puede anclar un gap: se ignora (no cuenta como toque).
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => b - a)

    const touches = counted.length

    if (touches >= CAP_NUDGE_MAX_TOUCHES) {
        return { action: 'skip', touch: touches, reason: 'max_touches' }
    }
    if (touches === 0) {
        return { action: 'send', touch: 1, reason: 'first_touch' }
    }

    const gapDays = CAP_NUDGE_SCHEDULE_DAYS[touches] - CAP_NUDGE_SCHEDULE_DAYS[touches - 1]
    const elapsedMs = input.now.getTime() - counted[0]
    if (elapsedMs < gapDays * DAY_MS - LADDER_TOLERANCE_MS) {
        return { action: 'skip', touch: touches + 1, reason: 'ladder_not_due' }
    }
    return { action: 'send', touch: (touches + 1) as 1 | 2 | 3, reason: 'ladder_due' }
}
