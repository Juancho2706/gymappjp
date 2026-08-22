import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ONBOARDING_STEPS } from '@eva/onboarding'
import { HelpCenter } from './HelpCenter'

/**
 * «Primeros pasos» del centro de ayuda tiene que ser LA MISMA guía del dashboard: la auditoría
 * encontró cinco copys distintos de los mismos pasos (modal, checklist, viñetas, ayuda, correo).
 */
function openHelpCenter() {
    fireEvent.click(screen.getByText('Centro de ayuda'))
}

describe('HelpCenter — «Primeros pasos» sale de @eva/onboarding', () => {
    it('un nutricionista lee sus pasos, no los del entrenador de fuerza', () => {
        const { container } = render(<HelpCenter persona="nutrition" />)
        openHelpCenter()
        expect(container.textContent).toContain(ONBOARDING_STEPS.nutrition[2].label)
        expect(container.textContent).not.toContain('rutina de Matías')
    })

    it('sin persona cae en los pasos del panel completo', () => {
        const { container } = render(<HelpCenter />)
        openHelpCenter()
        expect(container.textContent).toContain(ONBOARDING_STEPS.other[2].label)
    })
})
