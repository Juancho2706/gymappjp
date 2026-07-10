/**
 * Ejecución de superseries por RONDAS intercaladas (puro, sin React/DOM).
 *
 * Fuente de verdad: la vista de ejecución del alumno de web (`WorkoutExecutionClient.tsx:490-530`),
 * donde estas funciones viven como helpers locales. Se extraen acá para que web y mobile compartan la
 * misma lógica de intercalado A1 → B1 → A2 → B2… y de cierre de ronda (el descanso completo del grupo
 * dispara sólo al CERRAR la ronda, no entre miembros).
 */

/** Bloque miembro de una superserie: sólo se necesita id + número de series. */
export interface RoundMemberBlock {
    id: string
    sets: number
}

/** Serie logueada (forma mínima) para consultar el estado de una ronda. */
export interface RoundLogLike {
    block_id: string
    set_number: number
}

/** Posición en el orden intercalado: qué bloque y qué serie (ronda). */
export interface RoundPosition {
    blockId: string
    set: number
}

/**
 * Orden de presentación intercalado: ronda 1 (A,B,C…), ronda 2 (A,B,C…)… saltando miembros sin serie
 * en esa ronda. Mirror de `buildRoundOrder` (WEC:490-499).
 */
export function buildRoundOrder(members: RoundMemberBlock[]): RoundPosition[] {
    const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
    const order: RoundPosition[] = []
    for (let r = 1; r <= maxSets; r += 1) {
        for (const m of members) {
            if (m.sets >= r) order.push({ blockId: m.id, set: r })
        }
    }
    return order
}

/**
 * ¿Está completa la ronda `round`? Todos los miembros con serie en esa ronda deben tener log. Mirror de
 * `isRoundComplete` (WEC:501-516). `extraLoggedBlockId` permite proyectar la serie recién confirmada
 * cuando aún no llegó al array de logs (commit optimista).
 */
export function isRoundComplete(
    members: RoundMemberBlock[],
    round: number,
    logs: RoundLogLike[],
    extraLoggedBlockId?: string,
): boolean {
    for (const m of members) {
        if (m.sets < round) continue
        const logged =
            (extraLoggedBlockId != null && m.id === extraLoggedBlockId) ||
            logs.some((l) => l.block_id === m.id && l.set_number === round)
        if (!logged) return false
    }
    return true
}

/**
 * Siguiente serie incompleta en orden intercalado (tras la recién logueada; envuelve si hace falta).
 * Mirror de `findNextIncompleteInRounds` (WEC:518-530).
 */
export function findNextIncompleteInRounds(
    order: RoundPosition[],
    logs: RoundLogLike[],
    justLogged: { blockId: string; setNumber: number },
): RoundPosition | null {
    const isLogged = (p: RoundPosition) => logs.some((l) => l.block_id === p.blockId && l.set_number === p.set)
    const idx = order.findIndex((p) => p.blockId === justLogged.blockId && p.set === justLogged.setNumber)
    for (let i = idx + 1; i < order.length; i += 1) if (!isLogged(order[i])) return order[i]
    for (let i = 0; i <= idx && i < order.length; i += 1) if (!isLogged(order[i])) return order[i]
    return null
}

/**
 * Primera posición incompleta del grupo en orden intercalado (la serie ACTIVA que debe pintarse como
 * fila de registro y llevar la señal "Sigue"). Null si todas las series del grupo están logueadas.
 */
export function firstIncompleteInRounds(members: RoundMemberBlock[], logs: RoundLogLike[]): RoundPosition | null {
    const order = buildRoundOrder(members)
    return order.find((p) => !logs.some((l) => l.block_id === p.blockId && l.set_number === p.set)) ?? null
}
