import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Banda del alumno de ejemplo — forma responsive (QA del owner 22-08).
 *
 * jsdom no calcula layout, así que acá se prueba el CONTRATO de clases que produce la forma (la
 * geometría real —tres renglones en móvil, una línea desde `md`— la mide
 * `scripts/guia-visual-check.mjs` en un navegador de verdad). Lo que importa es que el
 * componente no vuelva a la fila de tres piezas incondicional que exprimía el texto a ~110 px.
 */

vi.mock('../../_actions/demo.actions', () => ({
    deleteDemoStudentAction: vi.fn().mockResolvedValue({ error: null }),
}))

import { DemoStudentBanner } from './DemoStudentBanner'

function renderBanner() {
    return render(<DemoStudentBanner label="Alumno de ejemplo" name="Ana Riquelme" />)
}

describe('DemoStudentBanner', () => {
    it('dice qué es el alumno de ejemplo y ofrece borrarlo', () => {
        renderBanner()
        expect(screen.getByText('Alumno de ejemplo')).toBeTruthy()
        expect(
            screen.getByText(/Ana Riquelme no ocupa cupo de tu plan, no recibe correos/),
        ).toBeTruthy()
        expect(screen.getByText('Borrar ejemplo')).toBeTruthy()
    })

    it('en móvil apila (columna) y recién desde `md` vuelve a ser fila', () => {
        const { container } = renderBanner()
        const banner = container.firstElementChild as HTMLElement
        expect(banner.className).toContain('flex-col')
        expect(banner.className).toContain('md:flex-row')
        // La fila vieja era `flex-wrap items-center` sin prefijo: eso es lo que apretaba el texto.
        expect(banner.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/)
    })

    it('el botón «Borrar ejemplo» ocupa el ancho completo en móvil y se encoge desde `md`', () => {
        renderBanner()
        const label = screen.getByText('Borrar ejemplo')
        expect(label.className).toContain('w-full')
        expect(label.className).toContain('md:w-auto')
        // Tap target: la altura mínima sigue siendo la del kit (44 px).
        expect(label.className).toContain('min-h-11')
    })

    it('el texto ya no compite por el ancho: solo crece desde `md`', () => {
        renderBanner()
        const paragraph = screen.getByText(/no ocupa cupo de tu plan/)
        expect(paragraph.className).toContain('md:flex-1')
        expect(paragraph.className).not.toMatch(/(^|\s)flex-1(\s|$)/)
    })
})
