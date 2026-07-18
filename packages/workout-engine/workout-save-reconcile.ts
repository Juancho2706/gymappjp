/**
 * Reconciliación NO destructiva del guardado de programas de CLIENTE.
 *
 * Problema (data-loss): el save de un programa existente hacía `workout_plans.delete()` →
 * CASCADE borraba `workout_blocks` → CASCADE borraba `workout_logs` (TODO el historial del
 * alumno: sets, pesos, reps, fechas → streaks, "sesión anterior", progreso). Cada re-guardado o
 * sync con plantilla arrasaba el historial en silencio.
 *
 * Fix: en vez de borrar+reinsertar, reconciliar EN SITIO preservando los ids de plan/bloque que
 * el alumno ya logueó. Mismo principio que `reconcileMeals` de nutrición (CLAUDE.md): los ids
 * estables mantienen el historial ATADO y VISIBLE. Lo que de verdad se borra (un bloque que el
 * coach quitó) ya no destruye sus logs: la migración 20260630190000 cambió el FK a ON DELETE SET
 * NULL, así que el log sobrevive con block_id NULL + sus columnas snapshot.
 *
 * Estas funciones son PURAS (sin DB) para testear el diff; la orquestación (DB I/O) vive en el
 * service. Limitación conocida (igual que nutrición): el match es POSICIONAL (order_index); al
 * reordenar ejercicios, un id de bloque puede re-apuntar a otro ejercicio — sus logs quedan
 * atados al id, no al ejercicio (las columnas *_at_log preservan el nombre original). Fix total
 * requeriría un template_block_id estable.
 */

export interface ExistingBlock {
    id: string
    order_index: number | null
}

export interface ExistingPlan {
    id: string
    day_of_week: number | null
    week_variant: string | null
    blocks: ExistingBlock[]
}

export interface DesiredPlanKey {
    day_of_week: number
    week_variant: string
}

const normVariant = (v: string | null | undefined): string => String(v || 'A')

/**
 * Empareja los planes existentes con los días deseados por (day_of_week, week_variant).
 * - `reuse`: día deseado → id de plan existente a REUSAR (update en sitio).
 * - `insertDesiredIndexes`: días deseados sin plan existente → insertar.
 * - `deletePlanIds`: planes existentes que ya no están en el deseo → borrar (sus logs sobreviven
 *   vía ON DELETE SET NULL).
 */
export function matchPlans(
    existing: ExistingPlan[],
    desired: DesiredPlanKey[]
): {
    reuse: Array<{ desiredIndex: number; planId: string }>
    insertDesiredIndexes: number[]
    deletePlanIds: string[]
} {
    const used = new Set<string>()
    const reuse: Array<{ desiredIndex: number; planId: string }> = []
    const insertDesiredIndexes: number[] = []

    desired.forEach((d, i) => {
        const match = existing.find(
            (p) =>
                p.day_of_week === d.day_of_week &&
                normVariant(p.week_variant) === normVariant(d.week_variant) &&
                !used.has(p.id)
        )
        if (match) {
            used.add(match.id)
            reuse.push({ desiredIndex: i, planId: match.id })
        } else {
            insertDesiredIndexes.push(i)
        }
    })

    const deletePlanIds = existing.filter((p) => !used.has(p.id)).map((p) => p.id)
    return { reuse, insertDesiredIndexes, deletePlanIds }
}

export type BlockOp =
    | { kind: 'update'; id: string; desiredIndex: number }
    | { kind: 'insert'; desiredIndex: number }

/**
 * Diff posicional de bloques de UN plan: reusa los primeros `min(existentes, deseados)` ids
 * (UPDATE en sitio → preserva logs), inserta el resto de los deseados y borra los existentes
 * sobrantes. `order_index` final = posición en el deseo (0-based).
 */
export function diffBlocksByPosition(
    existing: ExistingBlock[],
    desiredCount: number
): { ops: BlockOp[]; deleteIds: string[] } {
    const sorted = [...existing].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    const ops: BlockOp[] = []
    for (let i = 0; i < desiredCount; i++) {
        if (i < sorted.length) ops.push({ kind: 'update', id: sorted[i].id, desiredIndex: i })
        else ops.push({ kind: 'insert', desiredIndex: i })
    }
    const deleteIds = sorted.slice(desiredCount).map((b) => b.id)
    return { ops, deleteIds }
}

export interface ProgramOptimisticConflictInput {
    expectedUpdatedAt?: string | null
    currentUpdatedAt?: string | null
    force?: boolean
}

/** Espejo puro del guard web: sin snapshot, fila actual o con `force`, no hay conflicto. */
export function hasProgramOptimisticConflict(input: ProgramOptimisticConflictInput): boolean {
    return Boolean(
        input.expectedUpdatedAt
        && input.currentUpdatedAt != null
        && !input.force
        && input.currentUpdatedAt !== input.expectedUpdatedAt
    )
}
