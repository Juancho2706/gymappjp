/**
 * Haptics semánticos (Ola 0). Acoplar SIEMPRE al frame visual de la acción
 * (tick al completar set, success al cerrar workout, etc.). Nombres por intención
 * para consistencia; todos tragan el error (no-op si el device no soporta).
 */
import { Platform, Vibration } from 'react-native'
import * as Haptics from 'expo-haptics'

const safe = (p: Promise<void>) => { p.catch(() => {}) }

export const haptics = {
  /** Tap genérico en un botón/acción. */
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Cambio de valor en un stepper/selector (peso, reps). */
  select: () => safe(Haptics.selectionAsync()),
  /** Serie completada. */
  setDone: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Comida/hábito marcado. */
  mealLogged: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Éxito (cerrar workout, enviar check-in). */
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Nuevo récord personal: impacto fuerte + éxito. */
  pr: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      // no-op
    }
  },
  /**
   * Fin del descanso — cue HÁPTICO fuerte (canal primario en móvil: suena en el
   * device aunque el audio esté mudo o el asset no cargue). Doble golpe Heavy +
   * éxito para que se sienta con el teléfono en el bolsillo/mancuerna en mano.
   */
  alarm: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    } catch {
      // no-op
    }
  },
}

/**
 * Reproduce un patrón de vibración con los MISMOS milisegundos que la web
 * (`lib/client/haptics.ts:40-55` → `navigator.vibrate(pattern)`). El patrón web es
 * `[vibra, pausa, vibra, …]`; RN Android interpreta el array como
 * `[esperaInicial, vibra, pausa, vibra, …]`, por eso se antepone un `0` para alinear
 * la semántica y emitir los ms EXACTOS. En iOS los milisegundos NO son replicables
 * (la web usa un tap de intensidad fija vía el switch oculto, y `Vibration.vibrate`
 * ignora las duraciones), así que se delega en `iosFallback`. Best-effort: nunca lanza.
 */
const timerVibrate = (webPattern: number[], iosFallback: () => void) => {
  try {
    if (Platform.OS === 'android') Vibration.vibrate([0, ...webPattern])
    else iosFallback()
  } catch {
    // no-op
  }
}

/**
 * Refuerzo háptico de los TIMERS tipados (hold / intervalos), acoplado al cue de
 * audio. En Android reproduce los patrones EXACTOS de la web, restaurando la
 * diferenciación por patrón entre fin-de-hold, cambio-de-fase y fin-de-intervalos
 * (antes colapsaban al mismo `notificationAsync`). En iOS los patrones no son
 * replicables — igual que la web, que en los tres casos emite el mismo tap fijo —
 * así que se usa el feedback idiomático existente por evento (limitación de
 * plataforma documentada).
 */
export const timerHaptics = {
  /** Fin del HOLD — web HoldTimer.tsx:34 `triggerHaptic([200, 100, 400])`. */
  holdDone: () =>
    timerVibrate([200, 100, 400], () =>
      safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    ),
  /** Cambio de fase de INTERVALO — web IntervalTimer.tsx:45 `triggerHaptic([200, 100, 200])`. */
  intervalPhase: () =>
    timerVibrate([200, 100, 200], () =>
      safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    ),
  /** Fin de INTERVALOS (double) — web IntervalTimer.tsx:45 `triggerHaptic([200, 100, 200, 100, 400])`. */
  intervalFinish: () =>
    timerVibrate([200, 100, 200, 100, 400], () =>
      safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    ),
}
