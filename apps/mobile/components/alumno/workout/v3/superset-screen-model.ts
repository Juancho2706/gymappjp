/**
 * Modelo puro de la pantalla "Superserie" del ejecutor V3 (E3.5) — deriva del MISMO motor de rondas
 * (`superset-rounds`) toda la señal que la presentación necesita: ronda activa, estados de los dots de
 * ronda del header, el siguiente miembro dentro de la ronda abierta y los dots de "ronda cerrada" del
 * interstitial. NO duplica la lógica de intercalado ni de cierre de ronda — sólo la CONSUME. Vive como
 * módulo aparte (sin React/moti/svg) para poder testearlo sin renderizar.
 */
import {
  firstIncompleteInRounds,
  isRoundComplete,
  type RoundLogLike,
  type RoundMemberBlock,
} from '@eva/workout-engine'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Estado de un dot de ronda en el header del paso superserie. */
export type RoundDotState = 'done' | 'now' | 'todo'
/** Estado de un dot de ronda en el interstitial de "ronda cerrada" (la recién cerrada LATE = `fill`). */
export type ClosedRoundDotState = 'done' | 'fill' | 'todo'

/** Total de rondas del grupo (máximo de series entre los miembros). */
export function totalRounds(members: RoundMemberBlock[]): number {
  return members.reduce((mx, m) => Math.max(mx, m.sets), 0)
}

/**
 * Ronda ACTIVA (1-based): la del primer set incompleto en orden intercalado. Si el grupo está completo,
 * devuelve la última ronda (para que el header no colapse durante el auto-avance).
 */
export function activeRound(members: RoundMemberBlock[], logs: RoundLogLike[]): number {
  const pos = firstIncompleteInRounds(members, logs)
  return pos ? pos.set : totalRounds(members)
}

/**
 * Estados de los dots de ronda del header: `done` si la ronda está cerrada (todos sus miembros con log),
 * `now` la ronda activa, `todo` el resto. Uno por ronda.
 */
export function roundDotStates(members: RoundMemberBlock[], logs: RoundLogLike[]): RoundDotState[] {
  const total = totalRounds(members)
  const active = activeRound(members, logs)
  const out: RoundDotState[] = []
  for (let r = 1; r <= total; r += 1) {
    out.push(isRoundComplete(members, r, logs) ? 'done' : r === active ? 'now' : 'todo')
  }
  return out
}

/**
 * Id del SIGUIENTE miembro incompleto DENTRO de la ronda activa (el que aún queda por registrar tras el
 * activo). Null si el activo es el último de la ronda (cerrar su serie cierra la ronda) o si el grupo
 * está completo. Alimenta la pill "Sin descanso — sigue con {letra}".
 */
export function nextMemberIdInRound(members: RoundMemberBlock[], logs: RoundLogLike[]): string | null {
  const pos = firstIncompleteInRounds(members, logs)
  if (!pos) return null
  const round = pos.set
  const roundMembers = members.filter((m) => m.sets >= round)
  const activeIdx = roundMembers.findIndex((m) => m.id === pos.blockId)
  for (let i = activeIdx + 1; i < roundMembers.length; i += 1) {
    const m = roundMembers[i]
    if (!logs.some((l) => l.block_id === m.id && l.set_number === round)) return m.id
  }
  return null
}

/**
 * Dots del interstitial de "ronda cerrada": las rondas previas van `done`, la recién cerrada
 * (`roundNumber`) va `fill` (late), las futuras `todo`. Espeja el mockup concepto-a-v32 (Ronda 2 lista:
 * done, fill, todo, todo).
 */
export function closedRoundDots(roundNumber: number, total: number): ClosedRoundDotState[] {
  const out: ClosedRoundDotState[] = []
  for (let r = 1; r <= total; r += 1) {
    out.push(r < roundNumber ? 'done' : r === roundNumber ? 'fill' : 'todo')
  }
  return out
}

/** Letra del grupo superserie por su orden entre superseries del plan (0 → A, 1 → B…). */
export function supersetGroupLetter(index: number): string {
  return LETTERS[index] ?? LETTERS[LETTERS.length - 1]
}

/** Letra de un miembro por su posición en el grupo (0 → A, 1 → B…). */
export function memberLetter(index: number): string {
  return LETTERS[index] ?? '?'
}
