import { describe, expect, it } from 'vitest'
import {
    NUTRITION_SECTIONS,
    PRESETS,
    normalizePreset,
    resolveSections,
    type ModuleKey,
    type NutritionSectionKey,
} from './index'
// Fuente de verdad de las keys (la app es la duena; el paquete es puro y la espeja).
import { MODULE_KEYS } from '@/services/entitlements.service'

const ALL_ENTITLED: Partial<Record<ModuleKey, boolean>> = {
    cardio: true,
    movement_assessment: true,
    body_composition: true,
    nutrition_exchanges: true,
}
const NONE_ENTITLED: Partial<Record<ModuleKey, boolean>> = {}

const CORE_KEYS: NutritionSectionKey[] = ['plan', 'macros', 'adherence']

function on(...keys: NutritionSectionKey[]): Partial<Record<NutritionSectionKey, boolean>> {
    return Object.fromEntries(keys.map((k) => [k, true]))
}

describe('@eva/feature-prefs — catalogo', () => {
    it('cada requiresModule es un MODULE_KEYS valido', () => {
        const valid = new Set<string>(MODULE_KEYS)
        for (const section of NUTRITION_SECTIONS) {
            if (section.requiresModule !== null) {
                expect(valid.has(section.requiresModule)).toBe(true)
            }
        }
    })

    it('las secciones core estan ON en los 3 presets y no requieren modulo', () => {
        for (const section of NUTRITION_SECTIONS) {
            if (!section.core) continue
            expect(section.requiresModule).toBeNull()
            expect(section.presets.basico).toBe(true)
            expect(section.presets.intermedio).toBe(true)
            expect(section.presets.profesional).toBe(true)
        }
    })

    it('basico = solo core', () => {
        for (const section of NUTRITION_SECTIONS) {
            expect(section.presets.basico).toBe(section.core)
        }
    })

    it('intermedio agrega las opcionales gratis (no las Pro)', () => {
        const intermedioExtras: NutritionSectionKey[] = [
            'micros_base',
            'plate',
            'off_plan_log',
            'notes',
            'habits',
            'recipes',
            'shopping',
        ]
        for (const section of NUTRITION_SECTIONS) {
            if (section.core) continue
            const expected = intermedioExtras.includes(section.key)
            expect(section.presets.intermedio).toBe(expected)
        }
    })

    it('profesional agrega micros_advanced + goals_bodycomp (todo lo demas tambien ON)', () => {
        for (const section of NUTRITION_SECTIONS) {
            expect(section.presets.profesional).toBe(true)
        }
        const advanced = NUTRITION_SECTIONS.find((s) => s.key === 'micros_advanced')
        const bodycomp = NUTRITION_SECTIONS.find((s) => s.key === 'goals_bodycomp')
        expect(advanced?.requiresModule).toBe('nutrition_exchanges')
        expect(bodycomp?.requiresModule).toBe('body_composition')
        expect(advanced?.presets.intermedio).toBe(false)
        expect(bodycomp?.presets.intermedio).toBe(false)
    })

    it('normalizePreset coacciona basura/ausente a basico', () => {
        expect(normalizePreset('basico')).toBe('basico')
        expect(normalizePreset('intermedio')).toBe('intermedio')
        expect(normalizePreset('profesional')).toBe('profesional')
        expect(normalizePreset('garbage')).toBe('basico')
        expect(normalizePreset(undefined)).toBe('basico')
        expect(normalizePreset(null)).toBe('basico')
        expect(normalizePreset(42)).toBe('basico')
        expect([...PRESETS]).toEqual(['basico', 'intermedio', 'profesional'])
    })
})

describe('@eva/feature-prefs — resolveSections', () => {
    it('core siempre ON aunque la preferencia las apague', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { plan: false, macros: false, adherence: false },
            useTeamBase: false,
        })
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
    })

    it('preset basico → solo core ON', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            useTeamBase: false,
        })
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
        expect(res.micros_base).toBe(false)
        expect(res.recipes).toBe(false)
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preset intermedio → core + opcionales gratis ON, Pro OFF', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            useTeamBase: false,
        })
        expect(res.micros_base).toBe(true)
        expect(res.plate).toBe(true)
        expect(res.recipes).toBe(true)
        // Entitled + en preset profesional only → intermedio NO las prende.
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preset profesional + entitled → secciones Pro ON', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'profesional',
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(true)
        expect(res.goals_bodycomp).toBe(true)
    })

    it('entitled AND enabled: preset profesional pero SIN entitlement → Pro OFF', () => {
        const res = resolveSections({
            entitledByModule: NONE_ENTITLED,
            preset: 'profesional',
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
        // las gratis del preset profesional siguen ON
        expect(res.micros_base).toBe(true)
    })

    it('preferencia NO puede ampliar lo no-entitled', () => {
        const res = resolveSections({
            entitledByModule: NONE_ENTITLED,
            preset: 'basico',
            coachSections: on('micros_advanced', 'goals_bodycomp'),
            clientSections: on('micros_advanced', 'goals_bodycomp'),
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preferencia entitled puede prender una seccion fuera del preset', () => {
        const res = resolveSections({
            entitledByModule: { nutrition_exchanges: true },
            preset: 'basico',
            coachSections: on('micros_advanced'),
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(true)
        // body_composition NO entitled → sigue OFF aunque el preset/coach no la pida
        expect(res.goals_bodycomp).toBe(false)
    })

    it('client override gana sobre coach (prende)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: false },
            clientSections: { recipes: true },
            useTeamBase: false,
        })
        expect(res.recipes).toBe(true)
    })

    it('client override gana sobre coach (apaga)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            coachSections: { recipes: true },
            clientSections: { recipes: false },
            useTeamBase: false,
        })
        expect(res.recipes).toBe(false)
    })

    it('fila de alumno ausente → hereda coach (no fuerza OFF)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: true },
            clientSections: { plate: false }, // recipes ausente en client
            useTeamBase: false,
        })
        expect(res.recipes).toBe(true)
    })

    it('useTeamBase → la base es team, ignora coach', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: true }, // ignorado en modo team
            teamSections: { recipes: false, plate: true },
            useTeamBase: true,
        })
        expect(res.recipes).toBe(false)
        expect(res.plate).toBe(true)
    })

    it('useTeamBase + client override sigue ganando sobre team', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            teamSections: { recipes: false },
            clientSections: { recipes: true },
            useTeamBase: true,
        })
        expect(res.recipes).toBe(true)
    })

    it('preset basura → tratado como basico', () => {
        const garbage = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'no-existe',
            useTeamBase: false,
        })
        const basico = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            useTeamBase: false,
        })
        expect(garbage).toEqual(basico)
    })

    it('preset null → basico', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: null,
            useTeamBase: false,
        })
        expect(res.micros_base).toBe(false)
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
    })
})
