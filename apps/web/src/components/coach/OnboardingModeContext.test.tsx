import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingModeProvider, useOnboardingMode } from './OnboardingModeContext'

/**
 * «Un solo onboarding por área» (owner 22-08) — el contrato del contexto.
 *
 * Lo que importa acá es el DEFAULT: fuera del panel del coach (harness, tests de superficies
 * sueltas, un layout que todavía no monta el provider) el modo tiene que caer en `false`, o sea
 * «comportate como antes de este cambio». Un default `true` apagaría tours en pantallas que ni
 * siquiera tienen guía.
 */

function Probe() {
    const { guideActive } = useOnboardingMode()
    return <span data-testid="mode">{guideActive ? 'guia-activa' : 'sin-guia'}</span>
}

describe('useOnboardingMode', () => {
    it('fuera del provider cae en guideActive=false', () => {
        render(<Probe />)
        expect(screen.getByTestId('mode').textContent).toBe('sin-guia')
    })

    it('dentro del provider con la guía activa devuelve true', () => {
        render(
            <OnboardingModeProvider guideActive>
                <Probe />
            </OnboardingModeProvider>,
        )
        expect(screen.getByTestId('mode').textContent).toBe('guia-activa')
    })

    it('el provider con la guía apagada devuelve false', () => {
        render(
            <OnboardingModeProvider guideActive={false}>
                <Probe />
            </OnboardingModeProvider>,
        )
        expect(screen.getByTestId('mode').textContent).toBe('sin-guia')
    })
})
