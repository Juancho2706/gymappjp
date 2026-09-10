/**
 * Modelo puro de la pantalla "Superserie" del ejecutor V3 (E3.5). Valida la capa de presentación que
 * deriva del motor de rondas (`superset-rounds`) sin renderizar: ronda activa, estados de dots del header,
 * siguiente miembro dentro de la ronda abierta y dots de "ronda cerrada" del interstitial. El intercalado
 * y el cierre de ronda ya tienen su suite en el paquete `@eva/workout-engine`.
 */
import { describe, expect, it } from 'vitest'
import {
  firstIncompleteStepIndex,
  isRoundComplete,
  isStepComplete,
  type RoundLogLike,
  type RoundMemberBlock,
} from '@eva/workout-engine'
import {
  activeRound,
  closedRoundDots,
  memberLetter,
  nextMemberIdInRound,
  roundDotStates,
  roundRestStartArgs,
  shouldDeferRoundRest,
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


// ─────────────────────────────────────────────────────────────────────────────
// W3.3 · D2 + R24 — el descanso de GRUPO queda armado, no arranca solo
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldDeferRoundRest (W3.3 · D2/R24)', () => {
  const base = { roundClosed: true, groupRestSec: 90, holdSource: null as string | null, autoRestEnabled: true }

  it('cerrada por RELOJ con la preferencia ON: arranca sola (matriz §11.2, paridad web; D2 reconciliada por D5)', () => {
    expect(shouldDeferRoundRest({ ...base, holdSource: 'timer' })).toBe(false)
  })

  it('cerrada A MANO con la preferencia ON: arranca sola, como hoy', () => {
    expect(shouldDeferRoundRest({ ...base, holdSource: 'manual' })).toBe(false)
    expect(shouldDeferRoundRest({ ...base, holdSource: null })).toBe(false)
  })

  it('R24: con la preferencia APAGADA tampoco arranca solo, sea cual sea la fuente', () => {
    expect(shouldDeferRoundRest({ ...base, autoRestEnabled: false, holdSource: null })).toBe(true)
    expect(shouldDeferRoundRest({ ...base, autoRestEnabled: false, holdSource: 'timer' })).toBe(true)
  })

  it('sin cerrar la ronda no hay nada que armar (el descanso es de GRUPO)', () => {
    expect(shouldDeferRoundRest({ ...base, roundClosed: false, holdSource: 'timer' })).toBe(false)
    expect(shouldDeferRoundRest({ ...base, roundClosed: false, autoRestEnabled: false })).toBe(false)
  })

  it('A7: sin `rest_time` del grupo no se arma ningún CTA (no hay nada que arrancar)', () => {
    expect(shouldDeferRoundRest({ ...base, groupRestSec: 0, holdSource: 'timer' })).toBe(false)
    expect(shouldDeferRoundRest({ ...base, groupRestSec: 0, autoRestEnabled: false })).toBe(false)
  })

  it('el caso canónico «Dia B»: el hold del miembro de movilidad NO cierra la ronda; el press pallof sí', () => {
    // El veredicto de cierre lo da el MOTOR; acá sólo se encadena con la regla del descanso.
    const afterHold = [log('a', 1)]
    expect(isRoundComplete(AB, 1, afterHold)).toBe(false)
    expect(
      shouldDeferRoundRest({ roundClosed: false, groupRestSec: 90, holdSource: 'timer', autoRestEnabled: true }),
    ).toBe(false)

    const afterPallof = [log('a', 1), log('b', 1)]
    expect(isRoundComplete(AB, 1, afterPallof)).toBe(true)
    // Con la preferencia ENCENDIDA el orquestador arranca el descanso de ronda; con la preferencia
    // APAGADA queda armado en «Ronda lista · Descansar 90 s» (criterio de salida 3 de W3 con pref OFF).
    expect(
      shouldDeferRoundRest({ roundClosed: true, groupRestSec: 90, holdSource: 'timer', autoRestEnabled: true }),
    ).toBe(false)
    expect(
      shouldDeferRoundRest({ roundClosed: true, groupRestSec: 90, holdSource: 'timer', autoRestEnabled: false }),
    ).toBe(true)
  })

  it('idempotencia: repetir el mismo (block,set) no cambia el veredicto de cierre', () => {
    const dup = [log('a', 1), log('b', 1), log('b', 1)]
    expect(isRoundComplete(AB, 1, dup)).toBe(true)
  })
})

describe('roundRestStartArgs (W3.3 · R28)', () => {
  it('el CTA arranca el MISMO descanso de ronda: countKind ronda + setIndex/setTotal de RONDAS', () => {
    expect(roundRestStartArgs({ round: 2, totalRounds: 4, label: 'Press pallof' })).toEqual({
      autoStart: true,
      label: 'Press pallof',
      setIndex: 2,
      setTotal: 4,
      countKind: 'ronda',
    })
  })

  it('sin nombre de miembro el rótulo queda `undefined`, no la cadena "null"', () => {
    expect(roundRestStartArgs({ round: 1, totalRounds: 3, label: null }).label).toBeUndefined()
  })

  it('es la ronda RECIÉN cerrada, nunca la próxima (no imprime «Ronda 5 de 4»)', () => {
    expect(roundRestStartArgs({ round: 4, totalRounds: 4, label: 'X' }).setIndex).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// W3.5 · R5 — el salto de paso se mantiene igual que hoy, también por reloj
// ─────────────────────────────────────────────────────────────────────────────

describe('salto de paso automático (W3.5 · R5, sin cambio de código)', () => {
  type Step = { key: string; blocks: Array<{ id: string; sets: number }> }
  const steps: Step[] = [
    { key: 's1', blocks: [{ id: 'a', sets: 2 }] },
    { key: 's2', blocks: [{ id: 'b', sets: 2 }] },
  ]

  /**
   * Réplica FIEL del efecto de `ExecutorV3.tsx:1798-1811` (el que no se toca): resuelto el paso
   * activo, se reposiciona al primer paso sin resolver **una sola vez por paso** (`autoAdvancedRef`).
   */
  function autoAdvance(guard: Set<string>, stepIndex: number, logs: RoundLogLike[]): number {
    const active = steps[Math.min(stepIndex, steps.length - 1)]
    if (!active || guard.has(active.key)) return stepIndex
    if (!isStepComplete(active, logs)) return stepIndex
    if (steps.every((st) => isStepComplete(st, logs))) return stepIndex
    guard.add(active.key)
    return firstIncompleteStepIndex(steps, logs)
  }

  it('cerrar la última serie del bloque salta al paso siguiente (da igual quién la cerró)', () => {
    const logs = [log('a', 1), log('a', 2)]
    const guard = new Set<string>()
    expect(autoAdvance(guard, 0, logs)).toBe(1)
  })

  it('el guard `autoAdvancedRef` impide el DOBLE salto sobre el mismo paso', () => {
    const logs = [log('a', 1), log('a', 2)]
    const guard = new Set<string>()
    autoAdvance(guard, 0, logs)
    // El alumno volvió a mano al paso 1 (a corregir): el efecto ya NO lo vuelve a empujar.
    expect(autoAdvance(guard, 0, logs)).toBe(0)
  })

  it('con el entreno completo no salta a ninguna parte', () => {
    const logs = [log('a', 1), log('a', 2), log('b', 1), log('b', 2)]
    expect(autoAdvance(new Set<string>(), 1, logs)).toBe(1)
  })

  it('con el paso a medias no salta', () => {
    expect(autoAdvance(new Set<string>(), 0, [log('a', 1)])).toBe(0)
  })
})
