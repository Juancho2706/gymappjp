/**
 * Modelo de pasos del modo "paso a paso" (Fase L · workstream A). Puro y testeable: aplana el
 * `sectioned` de la ejecución (secciones → grupos) en una lista lineal de pasos, donde CADA paso es
 * un grupo — un bloque suelto (`kind:'single'`) o una superserie contigua (`kind:'superset'`, un solo
 * paso con sus rondas A1→B1 intactas, DA-5). Sin React/Next/Supabase → 100% presentación/navegación.
 */

/** Bloque mínimo que el modelo necesita (id + series planificadas para el cálculo de completitud). */
export interface StepBlock {
    id: string
    sets: number
}

/** Grupo contiguo de una sección (espejo estructural de `SupersetGroupRow`). */
export interface StepGroupInput<B extends StepBlock> {
    key: string
    type: 'single' | 'superset'
    blocks: B[]
}

/** Sección de la ejecución con sus grupos (espejo de `sectioned` en `WorkoutExecutionClient`). */
export interface StepSectionInput<B extends StepBlock> {
    sectionKey: string
    title: string
    subtitle: string | null
    muted: boolean
    groups: StepGroupInput<B>[]
}

/** Un paso del pager: un grupo con la metadata de su sección. */
export interface Step<B extends StepBlock> {
    /** Clave estable = `group.key` (usada para mapear paso → grupo en el orquestador). */
    key: string
    kind: 'single' | 'superset'
    blocks: B[]
    sectionKey: string
    sectionTitle: string
    sectionSubtitle: string | null
    muted: boolean
}

/** Log mínimo para el cálculo de completitud (dedup por block+set). */
export interface StepLog {
    block_id: string
    set_number: number
}

/** ¿El bloque tiene todas sus series registradas? (misma semántica que `isBlockComplete`). */
function isBlockDone(block: StepBlock, logs: StepLog[]): boolean {
    if (block.sets <= 0) return true
    let done = 0
    for (let i = 1; i <= block.sets; i += 1) {
        if (logs.some((l) => l.block_id === block.id && l.set_number === i)) done += 1
    }
    return done >= block.sets
}

/** Aplana `sections` en pasos en orden de render (una superserie = un paso, DA-5). */
export function buildStepModel<B extends StepBlock>(sections: StepSectionInput<B>[]): Step<B>[] {
    const steps: Step<B>[] = []
    for (const section of sections) {
        for (const group of section.groups) {
            steps.push({
                key: group.key,
                kind: group.type,
                blocks: group.blocks,
                sectionKey: section.sectionKey,
                sectionTitle: section.title,
                sectionSubtitle: section.subtitle,
                muted: section.muted,
            })
        }
    }
    return steps
}

/** ¿Todos los bloques del paso están completos? */
export function isStepComplete<B extends StepBlock>(step: Step<B>, logs: StepLog[]): boolean {
    return step.blocks.every((b) => isBlockDone(b, logs))
}

/**
 * Índice del primer paso incompleto; si todos están completos, el último paso (queda junto a
 * "Finalizar"). Vacío ⇒ 0. Es el punto de arranque del pager y el destino del auto-avance.
 */
export function firstIncompleteStepIndex<B extends StepBlock>(steps: Step<B>[], logs: StepLog[]): number {
    if (steps.length === 0) return 0
    const idx = steps.findIndex((s) => !isStepComplete(s, logs))
    return idx === -1 ? steps.length - 1 : idx
}

/** Índice del paso que contiene el bloque `blockId`; -1 si no está en ningún paso. */
export function stepIndexOfBlock<B extends StepBlock>(steps: Step<B>[], blockId: string): number {
    return steps.findIndex((s) => s.blocks.some((b) => b.id === blockId))
}
