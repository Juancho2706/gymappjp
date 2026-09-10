/**
 * Copys LITERALES del modal de primera vez y de la fila de la tuerca de la preferencia D5
 * «Pasar solo al descanso» (specs/cuenta-atras-en-pantalla, R11b / TASKS M.2, W5.6–W5.8).
 *
 * Viven acá, en el motor puro, para que RN y web pinten EXACTAMENTE el mismo texto: el modal sale
 * una sola vez en la vida del alumno y la fila de la tuerca es su espejo permanente. Sin variantes.
 */
export const AUTOREST_MODAL_COPY = Object.freeze({
  /** Título del modal de primera vez. */
  title: '¿Pasamos solo al descanso?',
  /** Cuerpo del modal. */
  body: 'Cuando termines una serie, podemos arrancar tu descanso automáticamente. Si prefieres, lo arrancas tú con el botón.',
  /** Nombre del toggle — el MISMO en el modal y en la fila de la tuerca. */
  toggle: 'Pasar solo al descanso',
  /** Sublabel con la preferencia encendida. */
  subOn: 'El descanso empieza solo al terminar cada serie.',
  /** Sublabel con la preferencia apagada (neutro: apagado es una elección legítima, no una avería). */
  subOff: 'Tú decides cuándo empieza el descanso.',
  /** Único CTA del modal. */
  cta: 'Listo',
  /** Pie del modal. */
  foot: 'Puedes cambiarlo cuando quieras en los ajustes del entrenamiento (⚙).',
})

/** Sublabel de la fila/toggle según el estado (una sola regla para el modal y la tuerca). */
export function autoRestSublabel(enabled: boolean): string {
  return enabled ? AUTOREST_MODAL_COPY.subOn : AUTOREST_MODAL_COPY.subOff
}
