import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HelpCenter } from './HelpCenter'

/**
 * Centro de ayuda — el camino de vuelta a la guía (QA del owner 22-08).
 *
 * Desde el 22-08 la guía vive en `/coach/guia` y su píldora se apaga sola al completarse o al
 * cerrarse. Leer «Primeros pasos» acá sin poder abrirla era un callejón sin salida: el CTA es uno
 * de los dos caminos de vuelta que quedan (el otro es Opciones › Mi panel).
 */

function openHelpCenter() {
    render(<HelpCenter persona="nutrition" />)
    fireEvent.click(screen.getByRole('button', { name: /Centro de ayuda/ }))
}

describe('HelpCenter', () => {
    it('la guía «Primeros pasos» ofrece abrir la guía real', () => {
        openHelpCenter()
        const cta = screen.getByRole('link', { name: /Abrir la guía/ })
        expect(cta.getAttribute('href')).toBe('/coach/guia')
    })

    it('el CTA es exclusivo de «Primeros pasos»: las demás guías no lo llevan', () => {
        openHelpCenter()
        expect(screen.getAllByRole('link', { name: /Abrir la guía/ })).toHaveLength(1)
        // Las otras guías siguen ahí, solo que sin CTA.
        expect(screen.getByText('Invitar y gestionar alumnos')).toBeTruthy()
    })

    it('los pasos de «Primeros pasos» son los de la PERSONA, no un quinto copy', () => {
        openHelpCenter()
        expect(screen.getByText(/Arma la pauta de Ana desde una plantilla/)).toBeTruthy()
    })

    it('en la pestaña FAQ no se pinta el CTA de la guía', () => {
        openHelpCenter()
        fireEvent.click(screen.getByRole('button', { name: 'FAQ' }))
        expect(screen.queryByRole('link', { name: /Abrir la guía/ })).toBeNull()
    })
})
