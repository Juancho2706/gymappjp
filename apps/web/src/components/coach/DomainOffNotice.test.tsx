import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FUNCIONES_PATH, domainOffCopy } from '@/lib/domain-off'
import { DomainOffNotice } from './DomainOffNotice'

/**
 * W1.13.c (Ola de orden) — mitad «status» del gate de dominio: el aviso IN-PAGE.
 *
 * Lo que se protege acá es el CONTRATO del aviso, no las palabras exactas (que W3 va a mover
 * cuando renombre la pantalla): que el copy salga de `domainOffCopy` con el dominio recibido
 * (género incluido), que haya DOS salidas (prender en Mi panel + volver al inicio) y que NO se
 * cuele ningún gesto de venta — esto es una preferencia del coach, no un upsell.
 */
describe('DomainOffNotice (W1.4b)', () => {
    it('cardio: pinta el copy compartido y el testid del aviso', () => {
        const copy = domainOffCopy('cardio')
        render(<DomainOffNotice domain="cardio" />)

        // El título se afirma LITERAL a propósito: no contiene el nombre de la pantalla, así que
        // W3 (rename «Mi panel» → «Funciones») no lo toca y el caso sigue siendo una red real.
        expect(
            screen.getByRole('heading', { level: 1, name: 'Cardio está apagado en tu panel' }),
        ).toBeInTheDocument()
        expect(screen.getByText(copy.body)).toBeInTheDocument()
        expect(screen.getByTestId('domain-off-notice')).toBeInTheDocument()
    })

    it('cardio: CTA a Mi panel + escape al inicio', () => {
        const copy = domainOffCopy('cardio')
        render(<DomainOffNotice domain="cardio" />)

        expect(screen.getByRole('link', { name: copy.cta })).toHaveAttribute('href', FUNCIONES_PATH)
        expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
            'href',
            '/coach/dashboard',
        )
    })

    it('nutrition: el dominio viaja de verdad (label + género femenino)', () => {
        const copy = domainOffCopy('nutrition')
        render(<DomainOffNotice domain="nutrition" />)

        expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument()
        expect(copy.title).toBe('Nutrición está apagada en tu panel')
        expect(screen.getByText(copy.body)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: copy.cta })).toHaveAttribute('href', FUNCIONES_PATH)
    })

    it('no hay gesto de venta: ni «Ver planes», ni precio, ni link a suscripción', () => {
        // Ojo: NO se puede afirmar sobre /plan/i a secas — el copy de nutrición dice «Tus planes se
        // conservan». Lo que no debe aparecer es el VOCABULARIO de venta ni el destino de upgrade.
        for (const domain of ['cardio', 'nutrition', 'bodycomp'] as const) {
            const { container, unmount } = render(<DomainOffNotice domain={domain} />)

            expect(container.textContent).not.toMatch(/ver planes|precio|upgrade|suscrip/i)
            expect(container.querySelector('a[href="/coach/subscription"]')).toBeNull()

            unmount()
        }
    })
})
