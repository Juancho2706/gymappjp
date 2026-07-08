/**
 * Agrupación de bloques de entreno por sección y superseries contiguas
 * (alineado con el builder y la vista de ejecución del alumno).
 */

import { effectiveAreaId, type AreaResolvableBlock } from './workout-areas'

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
 *
 * Contrato: una superserie exige **≥2 bloques**. Un tramo de un solo bloque (aunque
 * tenga letra) se degrada a `type: 'single'` sin `supersetLetter` — así una letra
 * huérfana (dato legacy/importado o drag sin normalizar) NO se pinta como "Superserie".
 */
export function groupContiguousSupersetRuns<
    T extends { id: string; order_index: number; superset_group?: string | null | undefined },
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
        // Singleton guard: un run de <2 no es superserie → bloque suelto.
        if (run.length < 2) {
            result.push({ key: `single-${b.id}`, blocks: run, type: 'single' })
        } else {
            result.push({ key: `ss-${g}-${b.id}`, supersetLetter: g, blocks: run, type: 'superset' })
        }
        i = j
    }
    return result
}

// ─── Normalización de superseries (fuente única, pre-persistencia) ───────────

const SUPERSET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Primera letra A-Z libre (misma secuencia que `TOGGLE_SUPERSET` del builder; fallback 'A'). */
function nextFreeSupersetLetter(used: ReadonlySet<string>): string {
    for (const letter of SUPERSET_LETTERS) {
        if (!used.has(letter)) return letter
    }
    return 'A'
}

/** Bloque mínimo que `sanitizeSupersets` sabe normalizar (letra + resolución de área). */
export type SanitizableBlock = AreaResolvableBlock & {
    superset_group?: string | null | undefined
}

/**
 * Normaliza las letras de superserie de un día **sin reordenar**, operando sobre el
 * mismo orden/partición que muestra la UI. La partición por área es boundary: una
 * superserie NUNCA cruza áreas (dos tramos de la misma letra en áreas distintas se
 * tratan como fragmentos separados).
 *
 * Reglas (idempotente):
 * - (a) fragmento contiguo de ≥2 con la misma letra y misma área = run válido.
 * - (b) letra que quedó en un solo bloque → `superset_group = null`.
 * - (c) letra partida en 2+ fragmentos no contiguos: el fragmento MÁS LARGO
 *   (empate → el primero) conserva la letra; los otros de ≥2 reciben la siguiente
 *   letra libre (A..Z); los de 1 → null.
 * - (d) las letras válidas intactas NO cambian → cero churn en diffs/undo.
 *
 * Devuelve el MISMO array (por referencia) si nada cambió; los bloques sin cambio
 * también conservan su referencia. `areaKeyOf` permite paridad exacta con el reducer
 * (que resuelve el área con `effectiveAreaKey(block, knownAreaIds)`); por defecto usa
 * `effectiveAreaId` (section_template_id o el área system del section legacy).
 */
export function sanitizeSupersets<T extends SanitizableBlock>(
    blocks: T[],
    areaKeyOf: (block: T) => string = effectiveAreaId,
): T[] {
    const n = blocks.length
    if (n === 0) return blocks

    // 1) Fragmentos: tramos contiguos (misma letra trim + misma área) en el orden dado.
    type Fragment = { letter: string; start: number; end: number } // rango [start, end)
    const fragments: Fragment[] = []
    let i = 0
    while (i < n) {
        const g = blocks[i].superset_group?.trim()
        if (!g) {
            i += 1
            continue
        }
        const area = areaKeyOf(blocks[i])
        let j = i + 1
        while (j < n && blocks[j].superset_group?.trim() === g && areaKeyOf(blocks[j]) === area) {
            j += 1
        }
        fragments.push({ letter: g, start: i, end: j })
        i = j
    }

    if (fragments.length === 0) return blocks

    // 2) Fragmentos por letra, en orden de aparición.
    const byLetter = new Map<string, Fragment[]>()
    for (const f of fragments) {
        const list = byLetter.get(f.letter)
        if (list) list.push(f)
        else byLetter.set(f.letter, [f])
    }

    // 3) Destino por índice de bloque. `target` solo aplica a índices marcados en `touched`.
    const target = new Array<string | null>(n)
    const touched = new Array<boolean>(n).fill(false)
    const used = new Set<string>() // letras que sobreviven (ganadores) → reservadas
    const losers: Fragment[] = []

    for (const [letter, frags] of byLetter) {
        const valid: Fragment[] = []
        for (const f of frags) {
            if (f.end - f.start >= 2) {
                valid.push(f)
            } else {
                // Singleton → null.
                for (let k = f.start; k < f.end; k += 1) {
                    touched[k] = true
                    target[k] = null
                }
            }
        }
        if (valid.length === 0) continue
        // Ganador: el más largo; empate → el primero (menor start, por orden de aparición).
        let winner = valid[0]
        for (const f of valid) {
            if (f.end - f.start > winner.end - winner.start) winner = f
        }
        used.add(letter)
        for (let k = winner.start; k < winner.end; k += 1) {
            touched[k] = true
            target[k] = letter
        }
        for (const f of valid) {
            if (f !== winner) losers.push(f)
        }
    }

    // 4) Re-letrar perdedores en orden de aparición con la próxima letra libre.
    losers.sort((a, b) => a.start - b.start)
    for (const f of losers) {
        const letter = nextFreeSupersetLetter(used)
        used.add(letter)
        for (let k = f.start; k < f.end; k += 1) {
            touched[k] = true
            target[k] = letter
        }
    }

    // 5) Reconstruir preservando referencias si nada cambió.
    let changed = false
    const result = blocks.map((block, idx) => {
        if (!touched[idx]) return block // bloque suelto o sin letra: intacto
        const next = target[idx]
        const current = block.superset_group ?? null
        if (current === next) return block
        changed = true
        return { ...block, superset_group: next }
    })
    return changed ? result : blocks
}
