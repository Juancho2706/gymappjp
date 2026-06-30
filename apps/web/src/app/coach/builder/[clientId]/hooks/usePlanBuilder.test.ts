/**
 * Baseline F0/F2 del reducer del builder (specs/movida-areas).
 *
 * Bloque "baseline clasico": captura el comportamiento observable del reducer con los
 * 3 sections legacy (warmup/main/cooldown) ANTES del refactor por areas — orden de
 * reconstruccion del dia, ruptura de superseries al mover de seccion y regla de
 * superserie misma-seccion. NO asertar aqui section_template_id: la sincronizacion
 * section<->area es el cambio intencional de F2.
 */
import { describe, it, expect } from 'vitest'
import { builderReducer } from './usePlanBuilder'
import { LEGACY_SECTION_AREA_ID } from '@/lib/workout-areas'
import type { WorkoutArea } from '@/domain/workout/types'
import type { BuilderBlock, BuilderSection, DayState } from '../types'

let uidSeq = 0
function mkBlock(overrides: Partial<BuilderBlock> & { uid?: string } = {}): BuilderBlock {
    uidSeq += 1
    return {
        uid: overrides.uid ?? `b${uidSeq}`,
        exercise_id: `ex-${uidSeq}`,
        exercise_name: `Ejercicio ${uidSeq}`,
        muscle_group: 'Pecho',
        sets: 3,
        reps: '8-12',
        section: 'main',
        superset_group: null,
        ...overrides,
    }
}

function mkDay(id: number, blocks: BuilderBlock[]): DayState {
    return { id, name: `Día ${id}`, title: '', blocks }
}

function sections(day: DayState): (BuilderSection | undefined)[] {
    return day.blocks.map(b => b.section)
}

function uids(day: DayState): string[] {
    return day.blocks.map(b => b.uid)
}

describe('builderReducer — baseline clásico (warmup/main/cooldown)', () => {
    it('SET_BLOCK_SECTION mueve el bloque al final de la sección destino y reagrupa W→M→C', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'w1', section: 'warmup' }),
            mkBlock({ uid: 'm1', section: 'main' }),
            mkBlock({ uid: 'm2', section: 'main' }),
            mkBlock({ uid: 'c1', section: 'cooldown' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'm1', section: 'warmup' },
        })
        expect(uids(next[0])).toEqual(['w1', 'm1', 'm2', 'c1'])
        expect(sections(next[0])).toEqual(['warmup', 'warmup', 'main', 'cooldown'])
    })

    it('SET_BLOCK_SECTION a la misma sección reubica el bloque al final de su grupo', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main' }),
            mkBlock({ uid: 'm2', section: 'main' }),
            mkBlock({ uid: 'm3', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'm1', section: 'main' },
        })
        expect(uids(next[0])).toEqual(['m2', 'm3', 'm1'])
    })

    it('SET_BLOCK_SECTION rompe la superserie completa del bloque movido', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm3', section: 'main', superset_group: 'B' }),
            mkBlock({ uid: 'm4', section: 'main', superset_group: 'B' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'm1', section: 'cooldown' },
        })
        const byUid = Object.fromEntries(next[0].blocks.map(b => [b.uid, b]))
        expect(byUid['m1'].superset_group).toBeNull()
        expect(byUid['m2'].superset_group).toBeNull()
        // El grupo B (ajeno) queda intacto
        expect(byUid['m3'].superset_group).toBe('B')
        expect(byUid['m4'].superset_group).toBe('B')
        expect(byUid['m1'].section).toBe('cooldown')
    })

    it('bloques sin section se normalizan como main al reagrupar', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'x1', section: undefined }),
            mkBlock({ uid: 'w1', section: 'warmup' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'w1', section: 'warmup' },
        })
        // warmup primero, el sin-section cae al bucket main
        expect(uids(next[0])).toEqual(['w1', 'x1'])
    })

    it('TOGGLE_SUPERSET enlaza con el siguiente de la MISMA sección (letra A)', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main' }),
            mkBlock({ uid: 'm2', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm1' },
        })
        expect(next[0].blocks[0].superset_group).toBe('A')
        expect(next[0].blocks[1].superset_group).toBe('A')
    })

    it('TOGGLE_SUPERSET rechaza enlazar entre secciones distintas', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'w1', section: 'warmup' }),
            mkBlock({ uid: 'm1', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'w1' },
        })
        expect(next[0].blocks.every(b => !b.superset_group)).toBe(true)
    })

    it('TOGGLE_SUPERSET sobre un par enlazado lo desenlaza completo', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm1' },
        })
        expect(next[0].blocks.every(b => !b.superset_group)).toBe(true)
    })

    it('el último bloque del día no puede enlazar hacia adelante', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main' }),
            mkBlock({ uid: 'm2', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm2' },
        })
        expect(next[0].blocks.every(b => !b.superset_group)).toBe(true)
    })
})

// ─── F2: reducer por área (SET_BLOCK_AREA + fallbacks) ──────────────────────

function mkArea(overrides: Partial<WorkoutArea> & { id: string; name: string; slug: string; sort_order: number }): WorkoutArea {
    return { is_system: true, coach_id: null, team_id: null, ...overrides }
}

/** Las 7 areas system con los sort_order reales del seed (20260609062017). */
const SYSTEM_AREAS: WorkoutArea[] = [
    mkArea({ id: LEGACY_SECTION_AREA_ID.warmup, name: 'Calentamiento', slug: 'warmup', sort_order: 0 }),
    mkArea({ id: '0000a5ec-0000-0000-0000-000000000005', name: 'Movilidad', slug: 'mobility', sort_order: 5 }),
    mkArea({ id: '0000a5ec-0000-0000-0000-000000000006', name: 'Activacion pilar central', slug: 'core_activation', sort_order: 6 }),
    mkArea({ id: '0000a5ec-0000-0000-0000-000000000008', name: 'Potencia', slug: 'power', sort_order: 8 }),
    mkArea({ id: LEGACY_SECTION_AREA_ID.main, name: 'Principal', slug: 'main', sort_order: 10 }),
    mkArea({ id: LEGACY_SECTION_AREA_ID.cooldown, name: 'Enfriamiento', slug: 'cooldown', sort_order: 20 }),
    mkArea({ id: '0000a5ec-0000-0000-0000-000000000030', name: 'Acondicionamiento', slug: 'conditioning', sort_order: 30 }),
]
const MOBILITY_ID = '0000a5ec-0000-0000-0000-000000000005'

describe('builderReducer — SET_BLOCK_AREA (areas)', () => {
    it('mueve a un área system no-clásica: bucket main + section_template_id + orden por sort_order', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'w1', section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup }),
            mkBlock({ uid: 'm1', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
            mkBlock({ uid: 'c1', section: 'cooldown', section_template_id: LEGACY_SECTION_AREA_ID.cooldown }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_AREA',
            payload: { dayId: 1, uid: 'c1', areaId: MOBILITY_ID },
        }, SYSTEM_AREAS)
        // Movilidad (5) va entre warmup (0) y main (10)
        expect(uids(next[0])).toEqual(['w1', 'c1', 'm1'])
        const moved = next[0].blocks[1]
        expect(moved.section).toBe('main') // bucket legacy para áreas no clásicas
        expect(moved.section_template_id).toBe(MOBILITY_ID)
    })

    it('SET_BLOCK_AREA a un área clásica equivale a SET_BLOCK_SECTION (paridad clásicos)', () => {
        const mk = () => [mkDay(1, [
            mkBlock({ uid: 'w1', exercise_id: 'ex-w1', exercise_name: 'W1', section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup }),
            mkBlock({ uid: 'm1', exercise_id: 'ex-m1', exercise_name: 'M1', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
            mkBlock({ uid: 'm2', exercise_id: 'ex-m2', exercise_name: 'M2', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
        ])]
        const viaArea = builderReducer(mk(), {
            type: 'SET_BLOCK_AREA',
            payload: { dayId: 1, uid: 'm1', areaId: LEGACY_SECTION_AREA_ID.warmup },
        }, SYSTEM_AREAS)
        const viaSection = builderReducer(mk(), {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'm1', section: 'warmup' },
        }, SYSTEM_AREAS)
        expect(viaArea).toEqual(viaSection)
        expect(viaArea[0].blocks[1].uid).toBe('m1')
        expect(viaArea[0].blocks[1].section).toBe('warmup')
        expect(viaArea[0].blocks[1].section_template_id).toBe(LEGACY_SECTION_AREA_ID.warmup)
    })

    it('SET_BLOCK_SECTION sincroniza section_template_id (fix de id viejo al mover)', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_SECTION',
            payload: { dayId: 1, uid: 'm1', section: 'cooldown' },
        }, SYSTEM_AREAS)
        expect(next[0].blocks[0].section).toBe('cooldown')
        expect(next[0].blocks[0].section_template_id).toBe(LEGACY_SECTION_AREA_ID.cooldown)
    })

    it('bloques legacy (sin section_template_id) agrupan por section al reagrupar', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'c1', section: 'cooldown' }),
            mkBlock({ uid: 'w1', section: 'warmup' }),
            mkBlock({ uid: 'm1', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_AREA',
            payload: { dayId: 1, uid: 'm1', areaId: LEGACY_SECTION_AREA_ID.main },
        }, SYSTEM_AREAS)
        expect(uids(next[0])).toEqual(['w1', 'm1', 'c1'])
    })

    it('área desconocida (borrada/ajena) no pierde bloques: cae al bucket legacy', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', section_template_id: 'deadbeef-0000-0000-0000-000000000000' }),
            mkBlock({ uid: 'w1', section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_AREA',
            payload: { dayId: 1, uid: 'w1', areaId: LEGACY_SECTION_AREA_ID.warmup },
        }, SYSTEM_AREAS)
        // m1 (area desconocida, section main) agrupa como main; ningún bloque desaparece
        expect(uids(next[0])).toEqual(['w1', 'm1'])
        expect(next[0].blocks).toHaveLength(2)
    })

    it('sin areas cargadas mantiene el orden clásico W→M→C', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'c1', section: 'cooldown' }),
            mkBlock({ uid: 'm1', section: 'main' }),
        ])]
        const next = builderReducer(state, {
            type: 'SET_BLOCK_AREA',
            payload: { dayId: 1, uid: 'c1', areaId: LEGACY_SECTION_AREA_ID.warmup },
        })
        expect(uids(next[0])).toEqual(['c1', 'm1'])
        expect(next[0].blocks[0].section).toBe('warmup')
    })

    it('TOGGLE_SUPERSET respeta el área efectiva: misma section legacy pero áreas distintas no enlaza', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'a1', section: 'main', section_template_id: MOBILITY_ID }),
            mkBlock({ uid: 'a2', section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'a1' },
        }, SYSTEM_AREAS)
        expect(next[0].blocks.every(b => !b.superset_group)).toBe(true)
    })

    it('TOGGLE_SUPERSET enlaza dentro de la misma área no clásica', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'a1', section: 'main', section_template_id: MOBILITY_ID }),
            mkBlock({ uid: 'a2', section: 'main', section_template_id: MOBILITY_ID }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'a1' },
        }, SYSTEM_AREAS)
        expect(next[0].blocks[0].superset_group).toBe('A')
        expect(next[0].blocks[1].superset_group).toBe('A')
    })
})

// ─── Fixes: superset extend / COPY_DAY isolation / split middle ──────────────

describe('builderReducer — TOGGLE_SUPERSET extender (bug 1)', () => {
    it('toggle sobre el ÚLTIMO miembro de un grupo amplía el tramo (no lo destruye)', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm3', section: 'main', superset_group: null }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm2' },
        })
        const byUid = Object.fromEntries(next[0].blocks.map(b => [b.uid, b]))
        expect(byUid['m1'].superset_group).toBe('A')
        expect(byUid['m2'].superset_group).toBe('A')
        expect(byUid['m3'].superset_group).toBe('A')
    })

    it('no extiende si el siguiente es de otra sección/área (queda como quitar)', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'c1', section: 'cooldown', superset_group: null }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm2' },
        })
        const byUid = Object.fromEntries(next[0].blocks.map(b => [b.uid, b]))
        // m2 (último, no extensible) se quita; m1 queda singleton → limpio
        expect(byUid['m2'].superset_group).toBeNull()
        expect(byUid['m1'].superset_group).toBeNull()
        expect(byUid['c1'].superset_group).toBeNull()
    })
})

describe('builderReducer — TOGGLE_SUPERSET quitar del medio (bug 3)', () => {
    it('quitar el miembro del MEDIO de un grupo de 5 no deja letras no contiguas', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm3', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm4', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm5', section: 'main', superset_group: 'A' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm3' },
        })
        const groups = next[0].blocks.map(b => b.superset_group)
        // m3 vacío; los dos tramos sobrevivientes con letras DISTINTAS
        expect(groups[2]).toBeNull()
        expect(groups[0]).toBe('A')
        expect(groups[1]).toBe('A')
        expect(groups[3]).not.toBeNull()
        expect(groups[3]).not.toBe('A')
        expect(groups[4]).toBe(groups[3])
        // Ningún par de bloques no contiguos comparte letra
        const seen = new Map<string, number>()
        next[0].blocks.forEach((b, i) => {
            if (!b.superset_group) return
            if (seen.has(b.superset_group)) {
                expect(i - (seen.get(b.superset_group) as number)).toBe(1)
            }
            seen.set(b.superset_group, i)
        })
    })

    it('quitar el medio de un grupo de 3 limpia los dos extremos (singletons)', () => {
        const state = [mkDay(1, [
            mkBlock({ uid: 'm1', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm2', section: 'main', superset_group: 'A' }),
            mkBlock({ uid: 'm3', section: 'main', superset_group: 'A' }),
        ])]
        const next = builderReducer(state, {
            type: 'TOGGLE_SUPERSET',
            payload: { dayId: 1, uid: 'm2' },
        })
        expect(next[0].blocks.every(b => !b.superset_group)).toBe(true)
    })
})

describe('builderReducer — COPY_DAY aísla superseries (bug 2)', () => {
    it('re-letra los grupos copiados para no fusionar con uno ajeno en la costura', () => {
        const state = [
            mkDay(1, [
                mkBlock({ uid: 's1', section: 'main', superset_group: 'A' }),
                mkBlock({ uid: 's2', section: 'main', superset_group: 'A' }),
            ]),
            mkDay(2, [
                mkBlock({ uid: 'd1', section: 'main', superset_group: 'A' }),
                mkBlock({ uid: 'd2', section: 'main', superset_group: 'A' }),
            ]),
        ]
        const next = builderReducer(state, {
            type: 'COPY_DAY',
            payload: { sourceId: 1, targetIds: [2] },
        })
        const day2 = next.find(d => d.id === 2)!
        expect(day2.blocks).toHaveLength(4)
        // Los 2 originales del destino conservan 'A'
        expect(day2.blocks[0].superset_group).toBe('A')
        expect(day2.blocks[1].superset_group).toBe('A')
        // Los 2 copiados comparten una letra NUEVA (no 'A') → no se fusionan en la costura
        const copyGroup = day2.blocks[2].superset_group
        expect(copyGroup).not.toBeNull()
        expect(copyGroup).not.toBe('A')
        expect(day2.blocks[3].superset_group).toBe(copyGroup)
    })

    it('preserva múltiples grupos copiados distintos mapeándolos consistentemente', () => {
        const state = [
            mkDay(1, [
                mkBlock({ uid: 's1', section: 'main', superset_group: 'A' }),
                mkBlock({ uid: 's2', section: 'main', superset_group: 'A' }),
                mkBlock({ uid: 's3', section: 'main', superset_group: 'B' }),
                mkBlock({ uid: 's4', section: 'main', superset_group: 'B' }),
            ]),
            mkDay(3, []),
        ]
        const next = builderReducer(state, {
            type: 'COPY_DAY',
            payload: { sourceId: 1, targetIds: [3] },
        })
        const day3 = next.find(d => d.id === 3)!
        expect(day3.blocks).toHaveLength(4)
        // destino vacío: las letras pueden volver a A/B pero los pares se mantienen
        expect(day3.blocks[0].superset_group).toBe(day3.blocks[1].superset_group)
        expect(day3.blocks[2].superset_group).toBe(day3.blocks[3].superset_group)
        expect(day3.blocks[0].superset_group).not.toBe(day3.blocks[2].superset_group)
    })
})
