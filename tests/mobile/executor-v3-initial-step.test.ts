/**
 * Arranque del ejecutor con TODO registrado (Q7-A, SPEC `docs/specs/vuelta-nueva-salud-y-reloj`).
 *
 * `firstIncompleteStepIndex` devuelve el ULTIMO paso cuando no queda nada incompleto
 * (`packages/workout-engine/workout-stepper.ts:86-90`): bien para el auto-avance, mal para ABRIR.
 * El alumno que reabria un dia cerrado HOY, o que entraba por «Corregir registros del {16 sept}»,
 * aterrizaba en el final sin serie activa ni reloj — la mitad de la queja de Movens del 19-09.
 *
 * `initialStepIndex` es lo UNICO que cambia: el auto-avance (`ExecutorV3.tsx`) y la navegacion
 * manual siguen llamando a `firstIncompleteStepIndex` tal cual.
 */
import { describe, expect, it } from 'vitest'
import { firstIncompleteStepIndex, type Step, type StepBlock, type StepLog } from '@eva/workout-engine'
import { initialStepIndex } from '../../apps/mobile/components/alumno/workout/v3/initial-step'

/** Paso `single` con un bloque de `sets` series. */
function step(key: string, sets: number): Step<StepBlock> {
  return {
    key,
    kind: 'single',
    blocks: [{ id: `${key}-b`, sets }],
    sectionKey: 'main',
    sectionTitle: 'Bloque principal',
    sectionSubtitle: null,
    muted: false,
  }
}

/** Todas las series de esos pasos, registradas. */
function logsFor(steps: Step<StepBlock>[]): StepLog[] {
  const logs: StepLog[] = []
  for (const s of steps) {
    for (const b of s.blocks) {
      for (let i = 1; i <= b.sets; i += 1) logs.push({ block_id: b.id, set_number: i })
    }
  }
  return logs
}

const STEPS = [step('s1', 3), step('s2', 3), step('s3', 3)]

describe('initialStepIndex', () => {
  it('TODO registrado ⇒ abre en el PRIMER ejercicio, no en el ultimo paso', () => {
    const logs = logsFor(STEPS)
    // La regla vieja (la que sigue rigiendo el auto-avance) dejaba al alumno en el ultimo paso.
    expect(firstIncompleteStepIndex(STEPS, logs)).toBe(2)
    expect(initialStepIndex(STEPS, logs)).toBe(0)
  })

  it('sesion a medias ⇒ identico a `firstIncompleteStepIndex` (primer paso incompleto)', () => {
    const logs = logsFor([STEPS[0]])
    expect(initialStepIndex(STEPS, logs)).toBe(1)
    expect(initialStepIndex(STEPS, logs)).toBe(firstIncompleteStepIndex(STEPS, logs))
  })

  it('sin nada registrado ⇒ paso 0, igual que siempre', () => {
    expect(initialStepIndex(STEPS, [])).toBe(0)
  })

  it('rutina vacia ⇒ 0 (mismo contrato que el motor)', () => {
    expect(initialStepIndex([], [])).toBe(0)
  })

  it('un solo paso, completo ⇒ 0 (no hay diferencia visible, pero el contrato no cambia)', () => {
    const one = [step('solo', 2)]
    expect(initialStepIndex(one, logsFor(one))).toBe(0)
  })

  it('bloque sin series prescritas (`sets` 0) cuenta como resuelto: todo completo ⇒ 0', () => {
    const mixed = [step('s1', 0), step('s2', 2)]
    expect(initialStepIndex(mixed, logsFor(mixed))).toBe(0)
  })
})
