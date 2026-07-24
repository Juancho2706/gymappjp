/**
 * Detección de récord personal (PR) de una serie de FUERZA — cálculo PURO (sin React ni Next).
 *
 * El ejecutor v3 (E4.1) emite `pr_detectado` y decide `isRealPR` con esto. Dos ejes de PR:
 *   - `weight` — peso absoluto: el alumno levantó más kg que nunca en ese ejercicio.
 *   - `e1rm`   — 1RM estimado (Epley) por sobre su mejor histórico, aunque el peso no sea récord
 *               (ej. mismas 100 kg pero más reps ⇒ 1RM estimado mayor).
 *
 * Reglas heredadas del resumen (`session-summary.ts`, AC-C5 anti-PR-falso):
 *   - Una serie hecha con máquina SUSTITUIDA nunca es PR (peso no comparable) — se marca en el input.
 *   - `historico` DEBE venir ya filtrado de series sustituidas (mismo criterio que `maxWeight`); el
 *     caller excluye esos bloques, igual que `summarizeSessionByKind`.
 *   - Sin histórico válido con qué comparar ⇒ NO es un PR real (primer registro): `isPR:false`,
 *     `prevBest:null`. Esto alinea con `celebrationTierFor('pr_detectado', { isRealPR })`.
 *
 * La fórmula de 1RM se REUSA de `@eva/profile-analytics` (`epleyOneRM`) — misma que el dashboard del
 * coach, para que el PR del ejecutor y el 1RM del perfil nunca discrepen.
 */

import { epleyOneRM } from '@eva/profile-analytics'

/** Serie de fuerza (snake_case = shape de `ReconciledSessionLog` / `SummaryLogLike`). */
export interface PrSet {
    weight_kg: number | null
    reps_done: number | null
    /** true ⇒ serie con máquina sustituida: nunca cuenta como PR (anti-PR-falso, AC-C5). */
    substituted?: boolean
}

export type PrKind = 'weight' | 'e1rm'

/** Mejor histórico con qué se comparó (para que la UI muestre "antes: X"). */
export interface PrBest {
    /** Mayor peso levantado en el histórico (kg). */
    weightKg: number
    /** Mayor 1RM Epley estimado del histórico (1 decimal). */
    e1rm: number
}

export interface PrResult {
    isPR: boolean
    /** `weight` manda sobre `e1rm` cuando ambos son récord; `null` si no hubo PR. */
    kind: PrKind | null
    /** Mejor histórico comparable, o `null` si no había con qué comparar. */
    prevBest: PrBest | null
}

function isValidSet(set: PrSet): set is { weight_kg: number; reps_done: number; substituted?: boolean } {
    return (
        typeof set.weight_kg === 'number' &&
        Number.isFinite(set.weight_kg) &&
        set.weight_kg > 0 &&
        typeof set.reps_done === 'number' &&
        Number.isFinite(set.reps_done) &&
        set.reps_done > 0
    )
}

function round1(n: number): number {
    return Math.round(n * 10) / 10
}

/**
 * Deriva el mejor histórico (peso máx + 1RM Epley máx) sobre series VÁLIDAS y NO sustituidas.
 * `null` si ninguna serie del histórico sirve para comparar.
 */
function historicalBest(historico: readonly PrSet[]): PrBest | null {
    let maxWeight = 0
    let maxE1rm = 0
    let any = false
    for (const set of historico) {
        if (set.substituted || !isValidSet(set)) continue
        any = true
        if (set.weight_kg > maxWeight) maxWeight = set.weight_kg
        const e1rm = epleyOneRM(set.weight_kg, set.reps_done)
        if (e1rm > maxE1rm) maxE1rm = e1rm
    }
    if (!any) return null
    return { weightKg: maxWeight, e1rm: round1(maxE1rm) }
}

/**
 * Detecta si `setActual` es un PR frente a `historico`. Serie inválida (peso/reps <= 0) o sustituida
 * nunca es PR. Sin histórico comparable, `isPR:false` (primer registro no es récord real).
 */
export function detectPR(setActual: PrSet, historico: readonly PrSet[]): PrResult {
    const prevBest = historicalBest(historico)

    if (setActual.substituted || !isValidSet(setActual) || prevBest === null) {
        return { isPR: false, kind: null, prevBest }
    }

    const actualE1rm = epleyOneRM(setActual.weight_kg, setActual.reps_done)
    const weightPR = setActual.weight_kg > prevBest.weightKg
    const e1rmPR = round1(actualE1rm) > prevBest.e1rm

    if (weightPR) return { isPR: true, kind: 'weight', prevBest }
    if (e1rmPR) return { isPR: true, kind: 'e1rm', prevBest }
    return { isPR: false, kind: null, prevBest }
}
