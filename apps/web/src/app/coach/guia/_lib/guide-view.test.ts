import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS, type OnboardingStepKey } from '@eva/onboarding'
import { PERSONAS } from '@eva/schemas'
import {
    PERSONA_CHIP_LABEL,
    resolveStepViews,
    stepAnchorId,
    welcomeLines,
    withPrimeraFlag,
} from './guide-view'

function completed(over: Partial<Record<OnboardingStepKey, boolean>> = {}): Record<
    OnboardingStepKey,
    boolean
> {
    return {
        profile_branding: false,
        vive_tu_app: false,
        first_artifact: false,
        first_client: false,
        aha: false,
        ...over,
    }
}

describe('resolveStepViews', () => {
    it('el PRIMERO sin tildar es el único `next`; el resto queda pendiente', () => {
        const views = resolveStepViews(ONBOARDING_STEPS.strength, completed())
        expect(views.map((v) => v.state)).toEqual(['next', 'pending', 'pending', 'pending', 'pending'])
        expect(views.map((v) => v.position)).toEqual([1, 2, 3, 4, 5])
    })

    it('un paso tildado más abajo NO adelanta al pendiente de arriba', () => {
        const views = resolveStepViews(
            ONBOARDING_STEPS.nutrition,
            completed({ profile_branding: true, first_client: true }),
        )
        expect(views.map((v) => v.state)).toEqual(['done', 'next', 'pending', 'done', 'pending'])
    })

    it('con 5/5 no queda ningún `next`', () => {
        const all = completed({
            profile_branding: true,
            vive_tu_app: true,
            first_artifact: true,
            first_client: true,
            aha: true,
        })
        expect(resolveStepViews(ONBOARDING_STEPS.rehab, all).every((v) => v.state === 'done')).toBe(true)
    })
})

describe('withPrimeraFlag', () => {
    it('agrega `primera=1` respetando el query que ya traiga el href', () => {
        expect(withPrimeraFlag('/coach/workout-programs')).toBe('/coach/workout-programs?primera=1')
        expect(withPrimeraFlag('/coach/clients?invite=1')).toBe('/coach/clients?invite=1&primera=1')
    })

    it('no duplica el flag y respeta el `null` (paso que no navega)', () => {
        expect(withPrimeraFlag('/coach/cardio/abc?primera=1')).toBe('/coach/cardio/abc?primera=1')
        expect(withPrimeraFlag(null)).toBeNull()
    })
})

describe('welcomeLines', () => {
    it('dos líneas, con el nombre del coach y el alumno de ejemplo de su mundo', () => {
        const [line1, line2] = welcomeLines('nutrition', 'Ana')
        expect(line1).toContain('Ana')
        expect(line2).toContain('Ana') // «Ana, tu paciente de ejemplo»
        expect(line2).toContain('paciente')
    })

    it('la rama sin demo (`other`) no promete un alumno que no existe', () => {
        const [, line2] = welcomeLines('other', 'Javier')
        expect(line2).toContain('panel completo')
        expect(line2).not.toContain('de ejemplo')
    })

    it('sin persona invita a elegir especialidad', () => {
        const [line1, line2] = welcomeLines(null, 'Pedro')
        expect(line1).toContain('Pedro')
        expect(line2).toContain('especialidad')
    })
})

describe('PERSONA_CHIP_LABEL', () => {
    it('cubre las 5 personas con etiquetas cortas (el chip es de una línea)', () => {
        for (const persona of PERSONAS) {
            const label = PERSONA_CHIP_LABEL[persona]
            expect(label.length).toBeGreaterThan(0)
            expect(label.length).toBeLessThanOrEqual(30)
        }
    })
})

describe('stepAnchorId', () => {
    it('da un ancla estable y única por paso (la banda apunta ahí el foco)', () => {
        const ids = ONBOARDING_STEPS.strength.map((step) => stepAnchorId(step.key))
        expect(ids).toEqual([
            'paso-profile_branding',
            'paso-vive_tu_app',
            'paso-first_artifact',
            'paso-first_client',
            'paso-aha',
        ])
        expect(new Set(ids).size).toBe(ids.length)
    })
})

