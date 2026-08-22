/**
 * Foco de «Tus primeros pasos» en la app (`apps/mobile/lib/guia-focus.ts`, QA del owner 22-08).
 *
 * Lo que se pinnea es el hallazgo 1 («elegí persona, me arma las cosas y me devuelve al INICIO de
 * la guía, no me lleva al siguiente paso»):
 *  - el foco es SIEMPRE el primer paso sin tildar de la persona del coach (misma verdad que
 *    `nextStep` de `@eva/onboarding` y que la píldora del panel);
 *  - sin persona y con los cinco hechos NO hay foco (ahí mandan la invitación y el cierre);
 *  - la pantalla se desplaza sola solo cuando el paso que toca NO es el primero — desplazarse al
 *    paso 1 le taparía al coach recién llegado la bienvenida y el progreso;
 *  - el destino del scroll nunca es negativo.
 *
 * El módulo es puro (solo `@eva/onboarding`), así que se importa directo: no arrastra react-native
 * y no necesita el baile de `vi.doMock` por path absoluto de los otros tests de mobile.
 */
import { describe, expect, it } from 'vitest'
import { ONBOARDING_STEPS, ONBOARDING_STEP_KEYS, type OnboardingStepKey } from '@eva/onboarding'
import {
    focusScrollY,
    resolveGuideFocus,
    shouldAutoScrollToFocus,
} from '../../apps/mobile/lib/guia-focus'

/** Mapa completo de los 5 pasos con las claves indicadas en `true`. */
function completedWith(...keys: OnboardingStepKey[]): Record<OnboardingStepKey, boolean> {
    const out = {} as Record<OnboardingStepKey, boolean>
    for (const key of ONBOARDING_STEP_KEYS) out[key] = keys.includes(key)
    return out
}

describe('resolveGuideFocus', () => {
    it('sin nada hecho, el foco es el primer paso de la persona', () => {
        const focus = resolveGuideFocus({ persona: 'strength', completed: completedWith() })
        expect(focus).not.toBeNull()
        expect(focus?.index).toBe(0)
        expect(focus?.key).toBe(ONBOARDING_STEPS.strength[0]?.key)
        expect(focus?.label).toBe(ONBOARDING_STEPS.strength[0]?.label)
    })

    it('con pasos hechos, el foco salta al primero que falta (no al que acabas de terminar)', () => {
        const focus = resolveGuideFocus({
            persona: 'strength',
            completed: completedWith('profile_branding', 'vive_tu_app'),
        })
        expect(focus?.key).toBe('first_artifact')
        expect(focus?.index).toBe(2)
    })

    it('un tilde salteado no confunde: manda el PRIMER pendiente', () => {
        const focus = resolveGuideFocus({
            persona: 'nutrition',
            completed: completedWith('vive_tu_app', 'first_artifact'),
        })
        expect(focus?.key).toBe('profile_branding')
        expect(focus?.index).toBe(0)
    })

    it('sin persona no hay foco: a ese coach se lo invita a elegir especialidad', () => {
        expect(resolveGuideFocus({ persona: null, completed: completedWith() })).toBeNull()
    })

    it('con los cinco hechos tampoco: ahí manda la tarjeta de cierre', () => {
        expect(
            resolveGuideFocus({ persona: 'rehab', completed: completedWith(...ONBOARDING_STEP_KEYS) }),
        ).toBeNull()
    })

    it('el índice es el de la lista de ESA persona, para las cinco', () => {
        for (const persona of ['strength', 'nutrition', 'rehab', 'endurance', 'other'] as const) {
            const steps = ONBOARDING_STEPS[persona]
            const focus = resolveGuideFocus({
                persona,
                completed: completedWith(steps[0]!.key, steps[1]!.key),
            })
            expect(focus?.key).toBe(steps[2]?.key)
            expect(focus?.index).toBe(2)
        }
    })
})

describe('shouldAutoScrollToFocus', () => {
    const focusFirst = resolveGuideFocus({ persona: 'strength', completed: completedWith() })
    const focusThird = resolveGuideFocus({
        persona: 'strength',
        completed: completedWith('profile_branding', 'vive_tu_app'),
    })

    it('no se mueve mientras los datos no están', () => {
        expect(shouldAutoScrollToFocus(focusThird, { ready: false })).toBe(false)
    })

    it('no se mueve si el paso que toca ya es el primero', () => {
        expect(shouldAutoScrollToFocus(focusFirst, { ready: true })).toBe(false)
    })

    it('se mueve cuando el coach vuelve con pasos hechos', () => {
        expect(shouldAutoScrollToFocus(focusThird, { ready: true })).toBe(true)
    })

    it('sin foco no se mueve', () => {
        expect(shouldAutoScrollToFocus(null, { ready: true })).toBe(false)
    })
})

describe('focusScrollY', () => {
    it('suma el alto de la lista y el de la tarjeta, y deja aire arriba', () => {
        expect(focusScrollY({ containerY: 300, cardY: 220 })).toBe(508)
        expect(focusScrollY({ containerY: 300, cardY: 220, gap: 24 })).toBe(496)
    })

    it('nunca devuelve un destino negativo', () => {
        expect(focusScrollY({ containerY: 0, cardY: 0 })).toBe(0)
        expect(focusScrollY({ containerY: 4, cardY: 0, gap: 40 })).toBe(0)
    })
})
