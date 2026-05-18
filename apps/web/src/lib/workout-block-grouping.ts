/**
 * Agrupación de bloques de entreno por sección y superseries contiguas
 * (alineado con el builder y la vista de ejecución del alumno).
 */

export type WorkoutSectionKey = 'warmup' | 'main' | 'cooldown' | 'other'

/** Orden fijo de secciones en UI (preview, ejecución, biblioteca). */
export const WORKOUT_SECTION_ORDER: readonly WorkoutSectionKey[] = ['warmup', 'main', 'cooldown', 'other']

export function effectiveWorkoutSection(section: string | null | undefined): WorkoutSectionKey {
    if (section === 'warmup' || section === 'main' || section === 'cooldown') return section
    if (section == null || section === '') return 'main'
    return 'other'
}

export type SupersetGroupRow<T> = {
    key: string
    /** Letra del grupo (A, B…) para UI; solo en `type === 'superset'` */
    supersetLetter?: string
    blocks: T[]
    type: 'superset' | 'single'
}

/**
 * Bloques ya filtrados por una sección y ordenados por `order_index` ascendente.
 * Agrupa superseries solo en tramos consecutivos (mismo `superset_group` y order_index +1).
 */
export function groupContiguousSupersetRuns<
    T extends { id: string; order_index: number; superset_group: string | null | undefined },
>(sectionSortedBlocks: T[]): SupersetGroupRow<T>[] {
    const result: SupersetGroupRow<T>[] = []
    let i = 0
    while (i < sectionSortedBlocks.length) {
        const b = sectionSortedBlocks[i]
        const g = b.superset_group?.trim()
        if (!g) {
            result.push({ key: `single-${b.id}`, blocks: [b], type: 'single' })
            i += 1
            continue
        }
        const run: T[] = [b]
        let j = i + 1
        while (j < sectionSortedBlocks.length) {
            const next = sectionSortedBlocks[j]
            const ng = next.superset_group?.trim()
            const prev = run[run.length - 1]
            if (ng === g && next.order_index === prev.order_index + 1) {
                run.push(next)
                j += 1
            } else {
                break
            }
        }
        result.push({ key: `ss-${g}-${b.id}`, supersetLetter: g, blocks: run, type: 'superset' })
        i = j
    }
    return result
}
