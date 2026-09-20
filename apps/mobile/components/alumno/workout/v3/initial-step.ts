/**
 * Paso en el que ABRE el ejecutor (Q7-A del SPEC `docs/specs/vuelta-nueva-salud-y-reloj` §3.5).
 * Puro, para testearlo sin montar el ejecutor.
 *
 * `firstIncompleteStepIndex` devuelve el ULTIMO paso cuando todo esta registrado
 * (`packages/workout-engine/workout-stepper.ts:86-90`), que es el comportamiento correcto para el
 * auto-avance —terminar deja al alumno junto a «Finalizar»— pero es el equivocado para ABRIR: el que
 * reabre un dia ya cerrado HOY, o entra por «Corregir registros del {16 sept}», aterrizaba en el
 * final, sin serie activa ni reloj. Eso es la mitad de la queja de Movens («les deja repetir el dia
 * pero no les muestra ejercicios ni tiempos»).
 *
 * Solo cambia el ARRANQUE: el auto-avance y la navegacion manual siguen usando
 * `firstIncompleteStepIndex` tal cual (mover el paso tras registrar una serie no es este caso).
 */
import { firstIncompleteStepIndex, isStepComplete, type Step, type StepBlock, type StepLog } from '@eva/workout-engine'

export function initialStepIndex<B extends StepBlock>(steps: Step<B>[], logs: StepLog[]): number {
  if (steps.length === 0) return 0
  // TODO registrado ⇒ primer ejercicio (con su serie activa y su reloj), no el último paso.
  if (steps.every((step) => isStepComplete(step, logs))) return 0
  return firstIncompleteStepIndex(steps, logs)
}
