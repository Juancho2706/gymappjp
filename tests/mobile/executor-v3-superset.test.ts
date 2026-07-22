/**
 * Modelo puro de la pantalla "Superserie" del ejecutor V3 (E3.5). Valida la capa de presentación que
 * deriva del motor de rondas (`superset-rounds`) sin renderizar: ronda activa, estados de dots del header,
 * siguiente miembro dentro de la ronda abierta y dots de "ronda cerrada" del interstitial. El intercalado
 * y el cierre de ronda ya tienen su suite en el paquete `@eva/workout-engine`.
 */
import { describe, expect, it } from 'vitest'
import type { RoundLogLike, RoundMemberBlock } from '@eva/workout-engine'
import {
  activeRound,
  closedRoundDots,
  memberLetter,
  nextMemberIdInRound,
  roundDotStates,
  supersetGroupLetter,
  totalRounds,
} from '../../apps/mobile/components/alumno/workout/v3/superset-screen-model'

const AB: RoundMemberBlock[] = [
  { id: 'a', sets: 3 },
  { id: 'b', sets: 3 },
]
// Superserie despareja: A con 3 rondas, B con 2 (la ronda 3 sólo tiene a A).
const UNEVEN: RoundMemberBlock[] = [
  { id: 'a', sets: 3 },
  { id: 'b', sets: 2 },
]
const log = (blockId: string, set: number): RoundLogLike => ({ block_id: blockId, set_number: set })

describe('totalRounds', () => {
  it('es el máximo de series entre los miembros', () => {
    expect(totalRounds(AB)).toBe(3)
    expect(totalRounds(UNEVEN)).toBe(3)
  })
})

describe('activeRound', () => {
  it('arranca en la ronda 1 sin logs', () => {
    expect(activeRound(AB, [])).toBe(1)
  })
  it('avanza a la ronda 2 al cerrar la ronda 1', () => {
    expect(activeRound(AB, [log('a', 1), log('b', 1)])).toBe(2)
  })
  it('queda dentro de la ronda mientras falte un miembro', () => {
    expect(activeRound(AB, [log('a', 1)])).toBe(1)
  })
  it('cae a la última ronda cuando el grupo está completo', () => {
    const all = [log('a', 1), log('b', 1), log('a', 2), log('b', 2), log('a', 3), log('b', 3)]
    expect(activeRound(AB, all)).toBe(3)
  })
})

describe('roundDotStates', () => {
  it('sin logs: la ronda 1 es la activa, el resto pendiente', () => {
    expect(roundDotStates(AB, [])).toEqual(['now', 'todo', 'todo'])
  })
  it('ronda 1 cerrada: done + now + todo', () => {
    expect(roundDotStates(AB, [log('a', 1), log('b', 1)])).toEqual(['done', 'now', 'todo'])
  })
  it('despareja: la ronda 3 (solo A) queda activa tras cerrar 1 y 2', () => {
    const logs = [log('a', 1), log('b', 1), log('a', 2), log('b', 2)]
    expect(roundDotStates(UNEVEN, logs)).toEqual(['done', 'done', 'now'])
  })
})

describe('nextMemberIdInRound', () => {
  it('con A activo (sin logs) el siguiente en la ronda es B', () => {
    expect(nextMemberIdInRound(AB, [])).toBe('b')
  })
  it('con B activo (A1 hecho) no hay siguiente: cerrar B cierra la ronda', () => {
    expect(nextMemberIdInRound(AB, [log('a', 1)])).toBeNull()
  })
  it('en la ronda 3 despareja (solo A) no hay siguiente', () => {
    const logs = [log('a', 1), log('b', 1), log('a', 2), log('b', 2)]
    expect(nextMemberIdInRound(UNEVEN, logs)).toBeNull()
  })
  it('grupo completo: null', () => {
    const all = [log('a', 1), log('b', 1), log('a', 2), log('b', 2), log('a', 3), log('b', 3)]
    expect(nextMemberIdInRound(AB, all)).toBeNull()
  })
})

describe('closedRoundDots', () => {
  it('ronda 2 cerrada de 4: done, fill (late), todo, todo', () => {
    expect(closedRoundDots(2, 4)).toEqual(['done', 'fill', 'todo', 'todo'])
  })
  it('primera ronda cerrada: fill al frente', () => {
    expect(closedRoundDots(1, 3)).toEqual(['fill', 'todo', 'todo'])
  })
  it('última ronda cerrada: todas done salvo la que late', () => {
    expect(closedRoundDots(3, 3)).toEqual(['done', 'done', 'fill'])
  })
})

describe('supersetGroupLetter / memberLetter', () => {
  it('mapea índice → letra', () => {
    expect(supersetGroupLetter(0)).toBe('A')
    expect(supersetGroupLetter(1)).toBe('B')
    expect(memberLetter(0)).toBe('A')
    expect(memberLetter(2)).toBe('C')
  })
  it('degrada con seguridad fuera de rango', () => {
    expect(supersetGroupLetter(99)).toBe('Z')
    expect(memberLetter(99)).toBe('?')
  })
})
