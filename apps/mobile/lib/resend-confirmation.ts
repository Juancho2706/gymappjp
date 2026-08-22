/**
 * Maquina de estados (pura) del boton "Reenviar correo" de `(auth)/verify-email`.
 *
 * Vive fuera de la pantalla por la misma razon que las funciones puras extraidas de `proxy.ts` en
 * la web: la pantalla arrastra `moti`, `expo-router` y `lucide-react-native` y no se puede montar
 * en la suite, pero la logica que de verdad falla —cuando el boton se apaga, que dice mientras
 * corre el cooldown, que pasa si el server contesta 429— si se puede pinear.
 *
 * El cooldown por defecto es de 60 s porque es el mismo que aplica el server por `uid`
 * (`CONFIRMATION_RESEND_COOLDOWN_SECONDS` en `apps/web/src/lib/auth/resend-confirmation.ts`), pero
 * ya NO se asume: el 429 trae `retryAfter` y hay que respetarlo, porque el server tiene DOS frenos
 * y estan a tres ordenes de magnitud de distancia — cooldown de 60 s y tope de 5 en 24 h, cuyo
 * `retryAfter` se mide en HORAS. Pintar "Reenviar en 60s" sobre un tope diario es mentirle al coach
 * y mandarlo a chocar contra el mismo 429 cinco veces seguidas; por eso el estado distingue los dos
 * casos y el del tope ofrece la unica salida real (revisar spam / escribir a soporte).
 */

export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Frontera entre los dos frenos del server. El cooldown nunca pide mas de 60 s; el tope diario pide
 * lo que falte para que el mas viejo de los 5 salga de la ventana (minutos a horas). Cualquier
 * espera de 5 minutos o mas solo puede venir del tope.
 */
export const RESEND_DAILY_CAP_MIN_SECONDS = 5 * 60

/** Techo defensivo: la ventana del server es de 24 h, un `retryAfter` mayor es basura. */
const MAX_WAIT_SECONDS = 24 * 60 * 60

export type ResendPhase = 'idle' | 'sending' | 'sent' | 'error'

export type ResendUiState = {
  phase: ResendPhase
  /** Segundos que faltan para poder volver a pedirlo. 0 = disponible. */
  cooldown: number
  /** El ultimo 429 fue el tope diario, no el cooldown corto: cambia el copy, no el boton. */
  cappedToday?: boolean
}

/** `45s` para la espera corta, `12 min` / `4 h` para la larga: nadie lee "Reenviar en 14400s". */
export function formatResendWait(seconds: number): string {
  if (seconds < 120) return `${seconds}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`
  return `${Math.ceil(seconds / 3600)} h`
}

export function resendButtonLabel(state: ResendUiState): string {
  if (state.phase === 'sending') return 'Reenviando…'
  if (state.cooldown > 0) return `Reenviar en ${formatResendWait(state.cooldown)}`
  return state.phase === 'sent' ? 'Reenviar de nuevo' : 'Reenviar correo'
}

/**
 * El tope diario NO reactiva el boton antes de tiempo: `cooldown` sigue siendo el `retryAfter` real
 * (horas) y este predicado lo respeta igual que a los 60 s. Si el coach cierra la pantalla el
 * contador local se pierde, pero el freno de verdad esta en el server — esto es cortesia visual.
 */
export function isResendDisabled(state: ResendUiState): boolean {
  return state.phase === 'sending' || state.cooldown > 0
}

/**
 * Copy bajo el boton. El estado `sent` NO promete entrega ("te lo reenviamos", no "ya te llego") y
 * repite el spam, que es donde el correo se pierde de verdad.
 *
 * Ese copy se pinta tambien cuando el server decidio NO reenviar (uid desconocido, cuenta ya
 * confirmada, Resend caido): el endpoint contesta 200 neutro a proposito y la app no tiene —ni
 * debe tener— forma de distinguirlo. Decir la verdad ahi seria delatar si la cuenta existe.
 */
export function resendHint(state: ResendUiState): string {
  if (state.cappedToday && state.cooldown > 0) {
    return 'Ya reenviamos varias veces hoy. Revisa spam o escríbenos a soporte@eva-app.cl'
  }
  if (state.phase === 'sent') return 'Listo, te lo reenviamos. Revisa también la carpeta de spam.'
  if (state.phase === 'error') return 'No pudimos reenviarlo ahora. Intenta de nuevo en un minuto.'
  return '¿No te llegó? Revisa spam o reenvíalo.'
}

/** Un tick de reloj: nunca baja de 0 (el intervalo se apaga solo cuando llega). */
export function tickCooldown(seconds: number): number {
  return seconds > 0 ? seconds - 1 : 0
}

/**
 * Estado tras un 429. `retryAfterSeconds` es el del server (`ApiError.retryAfterSeconds`, body o
 * header); si no viene —server viejo, proxy que come el header— se cae a los 60 s de siempre.
 *
 * La fase queda en `idle`, no en `error`: un rate-limit no es una falla, es el server diciendo
 * "esperá". El boton se apaga por `cooldown`, no por un cartel rojo.
 */
export function resendStateFromRateLimit(retryAfterSeconds?: number): ResendUiState {
  const raw =
    typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds)
      : RESEND_COOLDOWN_SECONDS
  const cooldown = Math.min(raw, MAX_WAIT_SECONDS)
  return { phase: 'idle', cooldown, cappedToday: cooldown >= RESEND_DAILY_CAP_MIN_SECONDS }
}
