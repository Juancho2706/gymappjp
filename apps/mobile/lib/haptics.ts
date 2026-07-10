/**
 * Haptics semánticos (Ola 0). Acoplar SIEMPRE al frame visual de la acción
 * (tick al completar set, success al cerrar workout, etc.). Nombres por intención
 * para consistencia; todos tragan el error (no-op si el device no soporta).
 */
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
