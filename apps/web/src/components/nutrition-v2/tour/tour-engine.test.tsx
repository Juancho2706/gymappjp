import { describe, expect, it, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OnboardingModeProvider } from '@/components/coach/OnboardingModeContext'
import { useTourController } from './tour-engine'
import { tourFlagKey } from './tour-flags'

/**
 * `useTourController` × «un solo onboarding por área» (decisión del owner 22-08).
 *
 * Mientras la guía del coach está ACTIVA ningún tour de módulo se dispara solo. Los dos
 * invariantes que este test protege son los que hacen que la regla no le cueste nada al coach:
 * el «?» sigue abriendo el tour, y el auto-arranque NO se marca como visto — cuando la guía
 * termine, la próxima entrada a la superficie lo mostrará como siempre.
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111'

function Probe() {
    const tour = useTourController({ tourId: 'hub', coachId: COACH_ID, autoStart: true })
    return (
        <>
            <span data-testid="estado">{tour.active ? 'abierto' : 'cerrado'}</span>
            <button type="button" onClick={tour.start}>
                ayuda
            </button>
        </>
    )
}

beforeEach(() => {
    window.localStorage.clear()
})

describe('useTourController — auto-arranque vs guía activa', () => {
    it('sin provider (default del contexto) auto-arranca como siempre', () => {
        render(<Probe />)
        expect(screen.getByTestId('estado').textContent).toBe('abierto')
    })

    it('con la guía apagada auto-arranca', () => {
        render(
            <OnboardingModeProvider guideActive={false}>
                <Probe />
            </OnboardingModeProvider>,
        )
        expect(screen.getByTestId('estado').textContent).toBe('abierto')
    })

    it('con la guía ACTIVA no auto-arranca, el «?» lo abre igual y la memoria queda intacta', () => {
        render(
            <OnboardingModeProvider guideActive>
                <Probe />
            </OnboardingModeProvider>,
        )
        expect(screen.getByTestId('estado').textContent).toBe('cerrado')
        // Clave: NO se marcó como visto. Marcarlo se lo habría comido para siempre sin mostrarlo.
        expect(window.localStorage.getItem(tourFlagKey('hub', COACH_ID))).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'ayuda' }))
        expect(screen.getByTestId('estado').textContent).toBe('abierto')
    })
})
