import { describe, it, expect } from 'vitest'
import { buildDayPreviewSections } from './ProgramPreviewDialog'
import { LEGACY_SECTION_AREA_ID } from '@eva/workout-engine'
import type { WorkoutArea } from '@/domain/workout/types'
import type { BuilderBlock } from '../types'

function block(over: Partial<BuilderBlock> & { uid: string }): BuilderBlock {
    return {
        exercise_id: 'ex-1',
        exercise_name: 'Sentadilla',
        muscle_group: 'Piernas',
        sets: 3,
        reps: '10',
        section: 'main',
        section_template_id: null,
        superset_group: null,
        ...over,
    }
}

const mobility: WorkoutArea = {
    id: '0000a5ec-0000-0000-0000-000000000005', name: 'Movilidad', slug: 'mobility',
    sort_order: 5, is_system: true, coach_id: null, team_id: null,
}
const hyrox: WorkoutArea = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'HYROX', slug: 'hyrox',
    sort_order: 100, is_system: false, coach_id: 'coach-1', team_id: null,
}

describe('buildDayPreviewSections (preview del builder por área)', () => {
    it('CONTRATO ANTI-REGRESIÓN: programa solo clásico → mismos labels y orden de siempre', () => {
        const blocks = [
            block({ uid: 'b1', section: 'cooldown' }),
            block({ uid: 'b2', section: 'main' }),
            block({ uid: 'b3', section: 'warmup' }),
        ]
        const sections = buildDayPreviewSections(blocks, [])
        expect(sections.map(s => s.label)).toEqual(['Calentamiento', 'Principal', 'Enfriamiento'])
        expect(sections.map(s => s.key)).toEqual(['warmup', 'main', 'cooldown'])
    })

    it('section_template_id de los 3 clásicos va por la vía legacy (idéntico a hoy)', () => {
        const blocks = [
            block({ uid: 'b1', section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup }),
            block({ uid: 'b2', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
        ]
        const sections = buildDayPreviewSections(blocks, [mobility, hyrox])
        expect(sections.map(s => s.label)).toEqual(['Calentamiento', 'Principal'])
    })

    it('bloques en áreas custom/extra se agrupan bajo el nombre real, intercaladas por sort_order', () => {
        const blocks = [
            block({ uid: 'b1', section: 'warmup' }),
            block({ uid: 'b2', section: 'main', section_template_id: hyrox.id }),
            block({ uid: 'b3', section: 'main' }),
            block({ uid: 'b4', section: 'main', section_template_id: mobility.id }),
        ]
        const sections = buildDayPreviewSections(blocks, [mobility, hyrox])
        // warmup(0) → Movilidad(5) → main(10) → HYROX(100)
        expect(sections.map(s => s.label)).toEqual(['Calentamiento', 'Movilidad', 'Principal', 'HYROX'])
    })

    it('id de área no resuelto (borrada / otro contexto) cae a la sección legacy del bloque', () => {
        const blocks = [
            block({ uid: 'b1', section: 'cooldown', section_template_id: 'deadbeef-0000-0000-0000-000000000000' }),
        ]
        const sections = buildDayPreviewSections(blocks, [mobility])
        expect(sections.map(s => s.label)).toEqual(['Enfriamiento'])
    })

    it('superseries contiguas dentro del área conservan su agrupación', () => {
        const blocks = [
            block({ uid: 'b1', section: 'main', superset_group: 'A' }),
            block({ uid: 'b2', section: 'main', superset_group: 'A' }),
            block({ uid: 'b3', section: 'main' }),
        ]
        const [main] = buildDayPreviewSections(blocks, [])
        expect(main.groups.map(g => g.type)).toEqual(['superset', 'single'])
        expect(main.groups[0].blocks.map(b => b.uid)).toEqual(['b1', 'b2'])
    })
})
