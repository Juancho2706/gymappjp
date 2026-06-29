import { describe, it, expect } from 'vitest'
import { buildLibrarySections } from './ProgramPreviewPanel'
import { LEGACY_SECTION_AREA_ID } from '@/lib/workout-areas'
import type { WorkoutArea } from '@/domain/workout/types'

type Row = {
    id: string
    order_index: number
    superset_group: string | null
    section?: string | null
    section_template_id?: string | null
}

function row(id: string, order_index: number, over: Partial<Row> = {}): Row {
    return { id, order_index, superset_group: null, section: 'main', section_template_id: null, ...over }
}

const mobility: WorkoutArea = {
    id: '0000a5ec-0000-0000-0000-000000000005', name: 'Movilidad', slug: 'mobility',
    sort_order: 5, is_system: true, coach_id: null, team_id: null,
}
const hyrox: WorkoutArea = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'HYROX', slug: 'hyrox',
    sort_order: 100, is_system: false, coach_id: 'coach-1', team_id: null,
}

describe('buildLibrarySections (preview de la biblioteca por área)', () => {
    it('CONTRATO ANTI-REGRESIÓN: programa solo clásico → mismos headers CAL/PRI/ENF de siempre', () => {
        const rows = [
            row('b1', 0, { section: 'warmup' }),
            row('b2', 1, { section: 'main' }),
            row('b3', 2, { section: 'cooldown' }),
        ]
        const sections = buildLibrarySections(rows, [])
        expect(sections.map(s => s.short)).toEqual(['CAL', 'PRI', 'ENF'])
        expect(sections.map(s => s.label)).toEqual(['Calentamiento', 'Bloque principal', 'Enfriamiento'])
        // Clases EXACTAS del SECTION_META (DS redesign Fase 5: warning/sport/aqua semánticos).
        expect(sections.map(s => s.className)).toEqual([
            'text-[var(--warning-700)] bg-[var(--warning-100)] border-[var(--warning-500)]/25',
            'text-[var(--sport-700)] bg-[var(--sport-100)] border-[var(--sport-300)]/40',
            'text-[var(--aqua-700)] bg-[var(--aqua-100)] border-[var(--aqua-500)]/25',
        ])
    })

    it('section_template_id de los 3 clásicos va por la vía legacy (idéntico a hoy)', () => {
        const rows = [
            row('b1', 0, { section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
            row('b2', 1, { section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup }),
        ]
        const sections = buildLibrarySections(rows, [mobility, hyrox])
        expect(sections.map(s => s.short)).toEqual(['CAL', 'PRI'])
    })

    it('áreas custom/extra: nombre real, abreviatura y paleta de buildAreaVMs, orden por sort_order', () => {
        const rows = [
            row('b1', 0, { section: 'warmup' }),
            row('b2', 1, { section: 'main', section_template_id: hyrox.id }),
            row('b3', 2, { section: 'main', section_template_id: mobility.id }),
            row('b4', 3, { section: 'main' }),
        ]
        const sections = buildLibrarySections(rows, [mobility, hyrox])
        // warmup(0) → Movilidad(5) → main(10) → HYROX(100)
        expect(sections.map(s => s.label)).toEqual(['Calentamiento', 'Movilidad', 'Bloque principal', 'HYROX'])
        expect(sections[1].short).toBe('MOV')
        expect(sections[3].short).toBe('HYR')
        // Paleta estable por orden de aparición entre no-clásicas (misma que los badges del builder).
        expect(sections[1].className).toContain('violet')
        expect(sections[3].className).toContain('emerald')
    })

    it('id de área no resuelto cae a la sección legacy del bloque', () => {
        const rows = [row('b1', 0, { section: 'cooldown', section_template_id: 'deadbeef-0000-0000-0000-000000000000' })]
        const sections = buildLibrarySections(rows, [mobility])
        expect(sections.map(s => s.short)).toEqual(['ENF'])
    })

    it('superseries contiguas dentro del área conservan su agrupación', () => {
        const rows = [
            row('b1', 0, { superset_group: 'A' }),
            row('b2', 1, { superset_group: 'A' }),
            row('b3', 2),
        ]
        const [main] = buildLibrarySections(rows, [])
        expect(main.groups.map(g => g.type)).toEqual(['superset', 'single'])
        expect(main.groups[0].blocks.map(b => b.id)).toEqual(['b1', 'b2'])
    })
})
