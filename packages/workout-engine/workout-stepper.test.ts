import { describe, expect, it } from 'vitest'
import {
    buildStepModel,
    firstIncompleteStepIndex,
    isStepComplete,
    stepIndexOfBlock,
    type StepBlock,
    type StepSectionInput,
} from './workout-stepper'

/**
 * Fase L · workstream A — modelo de pasos del modo "paso a paso".
 * Contrato: una superserie = UN paso (DA-5); el orden de pasos = orden de render de `sectioned`;
 * completitud y navegación puras (para el auto-avance y el rail de progreso).
 */

type B = StepBlock

const block = (id: string, sets: number): B => ({ id, sets })

/** Helpers de armado de `sectioned` (espejo de lo que produce `WorkoutExecutionClient`). */
const single = (b: B): StepSectionInput<B>['groups'][number] => ({ key: `single-${b.id}`, type: 'single', blocks: [b] })
const superset = (letter: string, ...bs: B[]): StepSectionInput<B>['groups'][number] => ({
    key: `ss-${letter}-${bs[0].id}`,
    type: 'superset',
    blocks: bs,
})
const section = (
    sectionKey: string,
    groups: StepSectionInput<B>['groups'],
    extra: Partial<Omit<StepSectionInput<B>, 'sectionKey' | 'groups'>> = {},
): StepSectionInput<B> => ({
    sectionKey,
    title: extra.title ?? sectionKey,
    subtitle: extra.subtitle ?? null,
    muted: extra.muted ?? false,
    groups,
})

const log = (block_id: string, set_number: number) => ({ block_id, set_number })

describe('buildStepModel', () => {
    it('aplana secciones → grupos en orden de render', () => {
        const sections = [
            section('warmup', [single(block('w1', 1))], { muted: true, title: 'Calentamiento' }),
            section('main', [single(block('a', 3)), single(block('b', 4))]),
        ]
        const steps = buildStepModel(sections)
        expect(steps.map((s) => s.key)).toEqual(['single-w1', 'single-a', 'single-b'])
        expect(steps.map((s) => s.kind)).toEqual(['single', 'single', 'single'])
        // La metadata de sección viaja con el paso (eyebrow del pager).
        expect(steps[0]).toMatchObject({ sectionTitle: 'Calentamiento', muted: true, sectionKey: 'warmup' })
        expect(steps[1]).toMatchObject({ sectionTitle: 'main', muted: false })
    })

    it('una superserie = UN solo paso (kind superset, sus miembros en blocks)', () => {
        const sections = [section('main', [superset('A', block('a', 3), block('b', 3)), single(block('c', 2))])]
        const steps = buildStepModel(sections)
        expect(steps).toHaveLength(2)
        expect(steps[0]).toMatchObject({ kind: 'superset', key: 'ss-A-a' })
        expect(steps[0].blocks.map((b) => b.id)).toEqual(['a', 'b'])
        expect(steps[1]).toMatchObject({ kind: 'single', key: 'single-c' })
    })

    it('sin secciones ⇒ sin pasos', () => {
        expect(buildStepModel([])).toEqual([])
    })
})

describe('isStepComplete', () => {
    const steps = buildStepModel([
        section('main', [single(block('a', 2)), superset('A', block('b', 2), block('c', 1))]),
    ])

    it('bloque suelto: completo solo con todas sus series', () => {
        expect(isStepComplete(steps[0], [log('a', 1)])).toBe(false)
        expect(isStepComplete(steps[0], [log('a', 1), log('a', 2)])).toBe(true)
    })

    it('superserie: completa solo cuando TODOS los miembros están completos', () => {
        // b (2 series) incompleto, c (1 serie) completo → paso incompleto.
        expect(isStepComplete(steps[1], [log('b', 1), log('c', 1)])).toBe(false)
        expect(isStepComplete(steps[1], [log('b', 1), log('b', 2), log('c', 1)])).toBe(true)
    })

    it('series duplicadas o fuera de rango no inflan la cuenta', () => {
        expect(isStepComplete(steps[0], [log('a', 1), log('a', 1), log('a', 5)])).toBe(false)
    })
})

describe('firstIncompleteStepIndex', () => {
    const steps = buildStepModel([
        section('main', [single(block('a', 1)), single(block('b', 1)), single(block('c', 1))]),
    ])

    it('sin logs ⇒ primer paso (0)', () => {
        expect(firstIncompleteStepIndex(steps, [])).toBe(0)
    })

    it('primeros pasos completos ⇒ salta al primer incompleto', () => {
        expect(firstIncompleteStepIndex(steps, [log('a', 1)])).toBe(1)
        expect(firstIncompleteStepIndex(steps, [log('a', 1), log('b', 1)])).toBe(2)
    })

    it('todo completo ⇒ último paso (junto a Finalizar)', () => {
        expect(firstIncompleteStepIndex(steps, [log('a', 1), log('b', 1), log('c', 1)])).toBe(2)
    })

    it('sin pasos ⇒ 0', () => {
        expect(firstIncompleteStepIndex([], [])).toBe(0)
    })
})

describe('stepIndexOfBlock', () => {
    const steps = buildStepModel([
        section('main', [single(block('a', 2)), superset('A', block('b', 2), block('c', 2))]),
    ])

    it('encuentra el paso de un bloque suelto', () => {
        expect(stepIndexOfBlock(steps, 'a')).toBe(0)
    })

    it('un miembro de superserie mapea al paso de su grupo', () => {
        expect(stepIndexOfBlock(steps, 'b')).toBe(1)
        expect(stepIndexOfBlock(steps, 'c')).toBe(1)
    })

    it('bloque inexistente ⇒ -1', () => {
        expect(stepIndexOfBlock(steps, 'zzz')).toBe(-1)
    })
})
