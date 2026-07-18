import { describe, it, expect } from 'vitest'
import { areaShortLabel, buildAreaVMs } from './area-ui'
import { LEGACY_SECTION_AREA_ID } from '@eva/workout-engine'
import type { WorkoutArea } from '@/domain/workout/types'

const sys = (id: string, name: string, slug: string, sort_order: number): WorkoutArea =>
    ({ id, name, slug, sort_order, is_system: true, coach_id: null, team_id: null })

const SYSTEM_AREAS: WorkoutArea[] = [
    sys(LEGACY_SECTION_AREA_ID.warmup, 'Calentamiento', 'warmup', 0),
    sys('0000a5ec-0000-0000-0000-000000000005', 'Movilidad', 'mobility', 5),
    sys('0000a5ec-0000-0000-0000-000000000006', 'Activacion pilar central', 'core_activation', 6),
    sys('0000a5ec-0000-0000-0000-000000000008', 'Potencia', 'power', 8),
    sys(LEGACY_SECTION_AREA_ID.main, 'Principal', 'main', 10),
    sys(LEGACY_SECTION_AREA_ID.cooldown, 'Enfriamiento', 'cooldown', 20),
    sys('0000a5ec-0000-0000-0000-000000000030', 'Acondicionamiento', 'conditioning', 30),
]

describe('area-ui', () => {
    it('sin areas: fallback a los 3 clásicos con labels CAL/PRI/ENF en orden W→M→C', () => {
        const vms = buildAreaVMs([])
        expect(vms.map(v => v.shortLabel)).toEqual(['CAL', 'PRI', 'ENF'])
        expect(vms.map(v => v.id)).toEqual([
            LEGACY_SECTION_AREA_ID.warmup,
            LEGACY_SECTION_AREA_ID.main,
            LEGACY_SECTION_AREA_ID.cooldown,
        ])
        expect(vms.every(v => v.isClassic)).toBe(true)
    })

    it('clásicos conservan sus clases exactas actuales (cero regresión visual)', () => {
        const vms = buildAreaVMs(SYSTEM_AREAS)
        const warmup = vms.find(v => v.slug === 'warmup')!
        const main = vms.find(v => v.slug === 'main')!
        const cooldown = vms.find(v => v.slug === 'cooldown')!
        expect(warmup.badgeClass).toBe('border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-100')
        expect(main.badgeClass).toBe('border-primary/35 bg-primary/10 text-primary')
        expect(cooldown.badgeClass).toBe('border-sky-500/40 bg-sky-500/12 text-sky-900 dark:text-sky-100')
        expect(warmup.zoneClass).toContain('border-amber-500/45')
        expect(main.zoneClass).toContain('border-border/80')
        expect(cooldown.zoneClass).toContain('border-sky-500/45')
    })

    it('ordena por sort_order y asigna paleta estable a las no clásicas', () => {
        const vms = buildAreaVMs(SYSTEM_AREAS)
        expect(vms.map(v => v.name)).toEqual([
            'Calentamiento', 'Movilidad', 'Activacion pilar central', 'Potencia',
            'Principal', 'Enfriamiento', 'Acondicionamiento',
        ])
        const nonClassic = vms.filter(v => !v.isClassic)
        expect(nonClassic).toHaveLength(4)
        // Paleta distinta entre las primeras no clásicas
        expect(nonClassic[0].zoneClass).not.toBe(nonClassic[1].zoneClass)
        expect(nonClassic[1].zoneClass).not.toBe(nonClassic[2].zoneClass)
    })

    it('areaShortLabel quita diacríticos y trunca a 3 letras', () => {
        expect(areaShortLabel({ name: 'Activación pilar central', slug: 'x', is_system: false })).toBe('ACT')
        expect(areaShortLabel({ name: 'Móvilidad', slug: 'y', is_system: false })).toBe('MOV')
        expect(areaShortLabel({ name: 'HYROX', slug: 'z', is_system: false })).toBe('HYR')
        expect(areaShortLabel({ name: '···', slug: 'w', is_system: false })).toBe('???')
    })

    it('clásico custom (mismo slug pero no system) NO toma el estilo clásico', () => {
        const custom: WorkoutArea = { id: 'c1', name: 'Warmup custom', slug: 'warmup', sort_order: 1, is_system: false, coach_id: 'co', team_id: null }
        const [vm] = buildAreaVMs([custom])
        expect(vm.isClassic).toBe(false)
        expect(vm.shortLabel).toBe('WAR')
    })
})
