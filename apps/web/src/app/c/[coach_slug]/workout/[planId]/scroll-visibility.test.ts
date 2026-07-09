import { describe, it, expect } from 'vitest'
import { bottomVisibilityBoundary, isTargetWithinViewport } from './scroll-visibility'

const VH = 800
const FOOTER = 88
const HEADER = 96

describe('bottomVisibilityBoundary', () => {
    it('sin obstrucciones medidas → viewportH - footerFallback (comportamiento histórico)', () => {
        expect(bottomVisibilityBoundary(VH, FOOTER, [])).toBe(VH - FOOTER)
    })

    it('un sheet inferior (RestTimer) más alto que el footer sube la frontera (min de tops)', () => {
        // El RestTimer arranca en y=560 (más arriba que la barra Finalizar en ~712) → frontera=560.
        expect(bottomVisibilityBoundary(VH, FOOTER, [712, 560])).toBe(560)
    })

    it('ignora tops no plausibles (0, negativos, no finitos, NaN)', () => {
        expect(bottomVisibilityBoundary(VH, FOOTER, [0, -20, Number.NaN, Infinity])).toBe(VH - FOOTER)
    })

    it('un top mayor que el fallback no relaja la frontera (nunca la baja)', () => {
        expect(bottomVisibilityBoundary(VH, FOOTER, [780])).toBe(VH - FOOTER)
    })
})

describe('isTargetWithinViewport', () => {
    it('target totalmente visible (bajo el header, sobre la frontera) → true (no scrollear)', () => {
        expect(
            isTargetWithinViewport({ rectTop: 200, rectBottom: 400, headerH: HEADER, bottomBoundary: VH - FOOTER }),
        ).toBe(true)
    })

    it('target tapado por el header → false (scrollear)', () => {
        expect(
            isTargetWithinViewport({ rectTop: 40, rectBottom: 300, headerH: HEADER, bottomBoundary: VH - FOOTER }),
        ).toBe(false)
    })

    it('target tapado por el sheet inferior real (bottom > frontera del RestTimer) → false', () => {
        // Con la barra Finalizar sola (frontera 712) estaría visible, pero el RestTimer sube la frontera a 560.
        expect(
            isTargetWithinViewport({ rectTop: 200, rectBottom: 600, headerH: HEADER, bottomBoundary: 560 }),
        ).toBe(false)
        // Mismo target con sólo la barra Finalizar sería "visible" (bug previo: FOOTER fijo).
        expect(
            isTargetWithinViewport({ rectTop: 200, rectBottom: 600, headerH: HEADER, bottomBoundary: VH - FOOTER }),
        ).toBe(true)
    })

    it('bordes exactos cuentan como visible (>= / <=)', () => {
        expect(
            isTargetWithinViewport({ rectTop: HEADER, rectBottom: VH - FOOTER, headerH: HEADER, bottomBoundary: VH - FOOTER }),
        ).toBe(true)
    })
})
