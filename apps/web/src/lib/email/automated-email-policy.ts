/**
 * Regla COMPARTIDA de los correos automáticos al coach (plan «Correos y activación», 01-10).
 *
 * QUÉ RESUELVE: hasta acá cada sistema contaba solo lo suyo. W6 anotaba en `coach_email_ledger`,
 * el aviso de cupo en `admin_audit_logs`, y ninguno veía al otro: un coach Gratis podía recibir
 * «Tu alumno ya está adentro» y «Alcanzaste el límite» el mismo día, de dos remitentes lógicos que
 * no se conocían. Esta regla es UNA sola para todos los correos que EVA inicia sola:
 *
 * · **Máximo 1 cada 24 h y 3 por semana** (ventana móvil de 7 días), contando los dos registros.
 * · **Solo de 09:00 a 20:00 en Chile** (`America/Santiago`). Si la señal llega de noche, el correo
 *   espera a la mañana: los barridos son horarios y la señal sigue ahí.
 * · **Baja real**: una marca en el ledger (`EMAIL_OPT_OUT_TEMPLATE_KEY`) apaga todo lo automático.
 *
 * QUÉ QUEDA FUERA (siempre sale): lo que responde a algo que el coach hizo — confirmar correo,
 * contraseña, pagos, «X quiere entrenar contigo» y el aviso de cupo cuando INTENTA sumar al segundo
 * alumno. Esos sí CUENTAN en el historial (para que un automático no le caiga encima el mismo día),
 * pero nunca esperan turno.
 *
 * Todo acá es PURO: el reloj entra por parámetro y la lectura de los registros vive en
 * `services/email/automated-email-history.service.ts`.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Zona horaria de la regla. Con anuncios en Argentina y Colombia la hora de Chile sirve hoy. */
export const SEND_WINDOW_TIME_ZONE = 'America/Santiago'
/** Primera hora local en que puede salir un correo automático (inclusive). */
export const SEND_WINDOW_START_HOUR = 9
/** Hora local desde la que ya NO sale (exclusive): 20:00 queda fuera. */
export const SEND_WINDOW_END_HOUR = 20

/** Piso de silencio entre dos correos automáticos a un mismo coach. */
export const AUTOMATED_EMAIL_MIN_GAP_MS = 24 * HOUR_MS
/** Tope de correos automáticos por coach en la ventana móvil de `AUTOMATED_EMAIL_WEEK_MS`. */
export const AUTOMATED_EMAIL_WEEKLY_MAX = 3
export const AUTOMATED_EMAIL_WEEK_MS = 7 * DAY_MS

/**
 * Marca de baja en `coach_email_ledger`: una fila con esta key, `trigger = 'transactional'` y
 * `status = 'cancelled'` («lo decidimos nosotros»). Sin DDL: el índice único parcial del ledger
 * (`where status <> 'failed'`) ya garantiza una sola marca viva por coach. La escribe el panel admin
 * cuando el coach responde «no quiero más».
 */
export const EMAIL_OPT_OUT_TEMPLATE_KEY = 'email_opt_out'

/** El barrido de cupo no le escribe a una cuenta de menos de 7 días: es la semana de W6. */
export const CAP_SWEEP_MIN_ACCOUNT_AGE_MS = 7 * DAY_MS
/** Tras «Tu alumno ya está adentro», el barrido de cupo espera 72 h. */
export const CAP_SWEEP_QUIET_AFTER_AHA_MS = 72 * HOUR_MS

const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SEND_WINDOW_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
})

/** Hora local de Chile (0–23) del instante dado. `NaN` si el reloj no se puede leer. */
export function chileHour(now: Date): number {
    // `Intl` lanza `RangeError` con una fecha inválida: se corta antes.
    if (!Number.isFinite(now.getTime())) return Number.NaN
    const hour = hourFormatter.formatToParts(now).find((p) => p.type === 'hour')?.value
    return hour === undefined ? Number.NaN : Number(hour)
}

/**
 * ¿Puede salir un correo automático en este instante? FAIL-CLOSED: una hora ilegible responde
 * `false` — el error barato es un correo que espera una hora, el caro es uno que llega a las 3 AM.
 */
export function isWithinSendWindow(now: Date): boolean {
    const hour = chileHour(now)
    return Number.isFinite(hour) && hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR
}

export type AutomatedEmailQuotaBlock = 'gap_24h' | 'weekly_max'

/**
 * ¿El cupo compartido deja salir otro correo automático? `null` = sí; si no, el motivo.
 *
 * `sentAts` trae los instantes de AMBOS registros (ledger + auditoría). Un `scheduled_at` a futuro
 * da una diferencia negativa y cuenta como «recién» y «esta semana»: ese correo todavía no llegó a la
 * casilla, pero va a llegar, y sumarle otro encima es el amontonamiento que la regla evita. Una fecha
 * ilegible se ignora: no puede anclar nada.
 */
export function evaluateAutomatedEmailQuota(
    sentAts: readonly string[],
    now: Date
): AutomatedEmailQuotaBlock | null {
    let inWeek = 0
    for (const iso of sentAts) {
        const at = new Date(iso).getTime()
        if (!Number.isFinite(at)) continue
        const since = now.getTime() - at
        if (since < AUTOMATED_EMAIL_MIN_GAP_MS) return 'gap_24h'
        if (since < AUTOMATED_EMAIL_WEEK_MS) inWeek += 1
    }
    return inWeek >= AUTOMATED_EMAIL_WEEKLY_MAX ? 'weekly_max' : null
}

/** ¿Siguen corriendo las 72 h de silencio del barrido de cupo tras el aha? */
export function isWithinAhaQuiet(ahaAt: string | null, now: Date): boolean {
    if (!ahaAt) return false
    const at = new Date(ahaAt).getTime()
    return Number.isFinite(at) && now.getTime() - at < CAP_SWEEP_QUIET_AFTER_AHA_MS
}

/** ¿La cuenta es más nueva que el piso del barrido de cupo (su primera semana es de W6)? */
export function isWithinCapSweepGrace(createdAt: string | null, now: Date): boolean {
    if (!createdAt) return false
    const at = new Date(createdAt).getTime()
    return Number.isFinite(at) && now.getTime() - at < CAP_SWEEP_MIN_ACCOUNT_AGE_MS
}
