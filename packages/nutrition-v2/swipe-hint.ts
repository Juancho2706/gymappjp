/**
 * Pista de descubrimiento del swipe de intercambio — D5 del QA de T2.5.
 *
 * El QA dejó la pregunta abierta: el gesto es un ATAJO (el camino descubrible es el control
 * visible "⇄ N equivalentes"), así que nadie se entera de que la fila se puede deslizar.
 * Decisión del owner: una micro-animación one-shot — la primera fila intercambiable del día se
 * asoma unos píxeles mostrando el fondo "Cambiar" y vuelve sola. Una vez por dispositivo.
 *
 * Acá vive SOLO la decisión (pura y testeable). El movimiento y el almacenamiento son de cada
 * plataforma: `framer-motion` + `localStorage` en web, `reanimated` + `AsyncStorage` en RN.
 *
 * Reglas, en orden:
 *  1. Sin filas intercambiables no hay nada que enseñar.
 *  2. Con "reducir movimiento" NO se anima nunca — y NO se marca como vista: si la persona
 *     desactiva la preferencia después, todavía merece la pista.
 *  3. Una sola fila la toca: la primera que se monta en la pantalla la reclama para sí.
 *  4. Una sola vez en la vida del dispositivo.
 */

/** Clave de almacenamiento (localStorage en web, AsyncStorage en RN). */
export const NUTRITION_SWIPE_HINT_STORAGE_KEY = 'eva.nutrition-v2.swipe-hint.seen'

/** Valor persistido. Se guarda un `'1'` y no un booleano para no depender del JSON. */
export const NUTRITION_SWIPE_HINT_SEEN_VALUE = '1'

/** Desplazamiento del asomo, en px. Menos que el `TRIGGER_PX` (56) del gesto a propósito: la
 *  pista muestra el fondo, no simula un intercambio a punto de aplicarse. */
export const NUTRITION_SWIPE_HINT_PEEK_PX = 24

/** Espera antes de asomar, para que la lista termine de pintar y el gesto no compita con el
 *  scroll de entrada. */
export const NUTRITION_SWIPE_HINT_DELAY_MS = 700

/** Ida, sostenido y vuelta. Suma ~0,7 s: se ve, no interrumpe. */
export const NUTRITION_SWIPE_HINT_OUT_MS = 240
export const NUTRITION_SWIPE_HINT_HOLD_MS = 180
export const NUTRITION_SWIPE_HINT_BACK_MS = 280

export type SwipeHintDecisionInput = {
  /** La fila admite el gesto (tiene equivalentes y no está en medio de una escritura). */
  enabled: boolean
  /** Preferencia de accesibilidad del sistema. */
  reduceMotion: boolean
  /** Ya se mostró alguna vez en este dispositivo. */
  alreadySeen: boolean
  /** Otra fila ya la reclamó en esta sesión de pantalla. */
  claimedBySibling: boolean
}

/** ¿Esta fila debe reproducir la pista? */
export function shouldPlaySwipeHint(input: SwipeHintDecisionInput): boolean {
  if (!input.enabled) return false
  if (input.reduceMotion) return false
  if (input.alreadySeen) return false
  if (input.claimedBySibling) return false
  return true
}
