/**
 * SuccessOverlay — política pura (cuánto dura, qué se anima) y copy de los
 * éxitos que lo usan. Vive fuera del componente para que sea testeable sin
 * montar RN (mismo patrón que `celebrationAnimationPlan` en
 * `nutrition-v2-celebrations.ts`).
 *
 * Dos modos, discriminados por `durationMs`:
 * - número (o ausente ⇒ `SUCCESS_OVERLAY_MS`): confirmación fugaz que se cierra
 *   sola y devuelve el control (guardar un programa en el builder).
 * - `null`: pantalla de éxito terminal que cierra el usuario con un botón
 *   (check-in del alumno). Sin timer y SIN háptico: el háptico acompaña al pop
 *   de una confirmación que pasa, no a una pantalla que se queda.
 *
 * Reduce-motion apaga confeti y entrada con spring (queda solo el fade del
 * contenedor) y estira la ventana: sin animación que la acompañe, la frase
 * necesita más tiempo en pantalla para leerse.
 */

/** Tono del overlay. Hoy solo hay éxito; el tipo deja la puerta abierta sin `string` suelto. */
export type SuccessOverlayTone = 'success'

export interface SuccessOverlayPlan {
  /** ms visibles antes de invocar `onDone`. `null` ⇒ no se cierra solo. */
  visibleMs: number | null
  /** Burst de confeti (se apaga con reduce-motion). */
  confetti: boolean
  /** Entrada del disco de éxito. */
  entrance: 'spring' | 'none'
  /** Háptico de éxito al montar. */
  haptic: boolean
}

/** Ventana por defecto de una confirmación fugaz (pedido del owner: ~1,4 s). */
export const SUCCESS_OVERLAY_MS = 1400
/** Piso con reduce-motion: sin animación, la frase se lee sola. */
export const SUCCESS_OVERLAY_REDUCED_MS = 1800
/** Piso duro: por debajo de esto el overlay es un parpadeo que nadie alcanza a leer. */
export const SUCCESS_OVERLAY_MIN_MS = 600

export function successOverlayPlan(input: {
  /** `undefined` ⇒ default; `null` ⇒ sin auto-dismiss. */
  durationMs?: number | null
  reduced: boolean
}): SuccessOverlayPlan {
  const { durationMs, reduced } = input
  const entrance = reduced ? 'none' : 'spring'
  const confetti = !reduced

  if (durationMs === null) {
    return { visibleMs: null, confetti, entrance, haptic: false }
  }

  // Valores basura (NaN, negativos, 0) caen al default en vez de cerrar el
  // overlay en el mismo frame en que se abre.
  const requested =
    typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : SUCCESS_OVERLAY_MS
  const base = Math.max(requested, SUCCESS_OVERLAY_MIN_MS)

  return {
    visibleMs: reduced ? Math.max(base, SUCCESS_OVERLAY_REDUCED_MS) : base,
    confetti,
    entrance,
    haptic: true,
  }
}

/**
 * Copy del overlay al guardar en el builder de programas. El coach acaba de
 * tocar «Guardar» y la app se va de la pantalla: el título dice QUÉ pasó y el
 * subtítulo QUÉ programa y DE QUIÉN, para que no quede la duda de si guardó.
 */
export function programSavedOverlay(input: {
  programName?: string | null
  clientName?: string | null
  isTemplate?: boolean
}): { title: string; subtitle: string } {
  const name = (input.programName ?? '').trim()
  const client = (input.clientName ?? '').trim()
  const quoted = name ? `«${name}»` : 'El programa'

  if (input.isTemplate) {
    return {
      title: 'Plantilla guardada',
      subtitle: name ? `${quoted} quedó lista para asignar.` : 'La plantilla quedó lista para asignar.',
    }
  }
  if (client) {
    return { title: 'Plan guardado', subtitle: `${quoted} ya está en el plan de ${client}.` }
  }
  return { title: 'Plan guardado', subtitle: `${quoted} quedó guardado.` }
}
