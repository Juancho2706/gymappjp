import { describe, expect, it } from 'vitest'
import {
    GUIDE_PROGRESS_KEY,
    PERSONA_SCOPED_STEP_KEYS,
    applyPersonaSwitch,
    isPersonaScopedStep,
    mergePersonaProgress,
    normalizePersonaProgress,
    readPersonaProgress,
    readProgressByPersona,
} from './persona-progress'
import { ONBOARDING_STEP_KEYS } from './index'

/**
 * Memoria por especialidad (QA del owner 22-08): «debería llevar memoria de qué fue lo que hice
 * aunque me cambie o vea la guía de nuevo».
 */

const GUIDE_FUERZA = {
    completed: { profile_branding: true, vive_tu_app: true, first_artifact: true },
    [GUIDE_PROGRESS_KEY]: { strength: { vive_tu_app: true, first_artifact: true } },
}

describe('contrato de los pasos por especialidad', () => {
    it('solo los pasos 2 y 3 son por persona; los otros 3 son del coach', () => {
        expect(PERSONA_SCOPED_STEP_KEYS).toEqual(['vive_tu_app', 'first_artifact'])
        for (const key of PERSONA_SCOPED_STEP_KEYS) {
            expect(ONBOARDING_STEP_KEYS).toContain(key)
        }
        expect(isPersonaScopedStep('first_artifact')).toBe(true)
        expect(isPersonaScopedStep('profile_branding')).toBe(false)
        expect(isPersonaScopedStep('first_client')).toBe(false)
        expect(isPersonaScopedStep('aha')).toBe(false)
        expect(isPersonaScopedStep('cualquier_cosa')).toBe(false)
    })
})

describe('lectura tolerante del jsonb', () => {
    it('un jsonb raro nunca rompe la guía', () => {
        expect(readProgressByPersona(null)).toEqual({})
        expect(readProgressByPersona('texto')).toEqual({})
        expect(readProgressByPersona({})).toEqual({})
        expect(readProgressByPersona({ [GUIDE_PROGRESS_KEY]: [1, 2] })).toEqual({})
        expect(readProgressByPersona({ [GUIDE_PROGRESS_KEY]: { marciano: { vive_tu_app: true } } })).toEqual({})
        expect(normalizePersonaProgress({ vive_tu_app: 'si', first_artifact: 1 })).toEqual({})
    })

    it('lee lo hecho en la especialidad pedida y nada más', () => {
        expect(readPersonaProgress(GUIDE_FUERZA, 'strength')).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(readPersonaProgress(GUIDE_FUERZA, 'rehab')).toEqual({})
        expect(readPersonaProgress(GUIDE_FUERZA, null)).toEqual({})
    })
})

describe('mergePersonaProgress — sticky, nunca degrada', () => {
    it('suma los true y jamás vuelve un true a false', () => {
        const base = { strength: { vive_tu_app: true, first_artifact: true } }
        expect(mergePersonaProgress(base, 'strength', { first_artifact: false })).toEqual(base)
        expect(mergePersonaProgress(base, 'rehab', { vive_tu_app: true })).toEqual({
            strength: { vive_tu_app: true, first_artifact: true },
            rehab: { vive_tu_app: true },
        })
    })

    it('sin persona (coach que nunca contestó) no inventa una entrada', () => {
        expect(mergePersonaProgress({}, null, { vive_tu_app: true })).toEqual({})
    })

    it('nada hecho ⇒ no ensucia el jsonb con objetos vacíos', () => {
        expect(mergePersonaProgress({}, 'nutrition', {})).toEqual({})
        expect(mergePersonaProgress({}, 'nutrition', { vive_tu_app: false })).toEqual({})
    })
})

describe('applyPersonaSwitch — el bug del owner', () => {
    it('fuerza → rehab: archiva lo de fuerza y la rehab arranca LIMPIA (false explícito)', () => {
        const patch = applyPersonaSwitch({
            guide: GUIDE_FUERZA,
            from: 'strength',
            to: 'rehab',
            doneInFrom: { vive_tu_app: true, first_artifact: true },
        })

        expect(patch.changed).toBe(true)
        expect(patch.archived).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(patch.restored).toEqual({})
        // El `false` es EXPLÍCITO: es lo único que le gana al localStorage del navegador.
        expect(patch.completed).toEqual({ vive_tu_app: false, first_artifact: false })
        expect(patch.progress).toEqual({ strength: { vive_tu_app: true, first_artifact: true } })
    })

    it('rehab → fuerza: recupera lo de fuerza sin tocar lo de rehab', () => {
        const guide = {
            [GUIDE_PROGRESS_KEY]: {
                strength: { vive_tu_app: true, first_artifact: true },
                rehab: { vive_tu_app: true },
            },
        }
        const patch = applyPersonaSwitch({ guide, from: 'rehab', to: 'strength', doneInFrom: {} })

        expect(patch.restored).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(patch.completed).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(patch.progress.rehab).toEqual({ vive_tu_app: true })
    })

    it('rehab → fuerza estando a medias en rehab: lo de rehab queda guardado para la vuelta', () => {
        const patch = applyPersonaSwitch({
            guide: GUIDE_FUERZA,
            from: 'rehab',
            to: 'strength',
            doneInFrom: { first_artifact: true },
        })

        expect(patch.progress.rehab).toEqual({ first_artifact: true })
        expect(patch.progress.strength).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(patch.completed).toEqual({ vive_tu_app: true, first_artifact: true })
    })

    it('guardar la MISMA especialidad solo estampa la memoria: nunca destilda', () => {
        const patch = applyPersonaSwitch({
            guide: GUIDE_FUERZA,
            from: 'strength',
            to: 'strength',
            doneInFrom: { vive_tu_app: false, first_artifact: false },
        })

        expect(patch.changed).toBe(false)
        expect(patch.completed).toEqual({ vive_tu_app: true, first_artifact: true })
        expect(patch.progress.strength).toEqual({ vive_tu_app: true, first_artifact: true })
    })

    it('primera vez que contesta (persona null): lo hecho se le atribuye a la nueva, no se resetea', () => {
        const patch = applyPersonaSwitch({
            guide: { completed: { vive_tu_app: true } },
            from: null,
            to: 'nutrition',
            doneInFrom: { vive_tu_app: true },
        })

        expect(patch.changed).toBe(false)
        expect(patch.progress).toEqual({ nutrition: { vive_tu_app: true } })
        expect(patch.completed).toEqual({ vive_tu_app: true })
    })

    it('cambio a una especialidad nunca usada y sin nada hecho: no ensucia el jsonb', () => {
        const patch = applyPersonaSwitch({ guide: {}, from: 'other', to: 'endurance', doneInFrom: {} })

        expect(patch.progress).toEqual({})
        expect(patch.completed).toEqual({ vive_tu_app: false, first_artifact: false })
    })
})
