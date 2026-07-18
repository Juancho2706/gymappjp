/**
 * @eva/plan-builder — estado del builder de programas de entreno (web + mobile).
 *
 * Fuente de verdad única del reducer + tipos del builder, extraída de web en E5-01
 * (specs/rn-mobile-parity-redesign). Web y mobile reexportan desde acá para eliminar el
 * fork (cero drift). La resolución de áreas / agrupamiento de superseries vive en
 * @eva/workout-engine y se importa (NO se duplica).
 */
export * from './types'
export * from './reducer'
