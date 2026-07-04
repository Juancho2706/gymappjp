import { describe, it, expect } from 'vitest'
import {
    PWA_SCREENSHOT_WIDTH,
    PWA_SCREENSHOT_HEIGHT,
    PWA_SCREENSHOT_SIZES,
    PWA_SCREENSHOT_VARIANTS,
} from './screenshot-dimensions'

// Guarda la invariante load-bearing del SPEC whitelabel-r2 §7: si las screenshots del manifest
// caen fuera de los límites de Chrome (320–3840 px; dimensión mayor ≤ 2.3× la menor) o difieren en
// aspect ratio entre variantes, Chrome descarta TODO el Richer Install UI en silencio. Como ambas
// variantes y ambos manifests leen estas mismas constantes, testearlas aquí cubre las dos rutas.
describe('PWA screenshot dimensions (Chrome Richer Install UI constraints)', () => {
    it('cada lado está dentro del rango 320–3840 px', () => {
        for (const side of [PWA_SCREENSHOT_WIDTH, PWA_SCREENSHOT_HEIGHT]) {
            expect(side).toBeGreaterThanOrEqual(320)
            expect(side).toBeLessThanOrEqual(3840)
        }
    })

    it('la dimensión mayor no supera 2.3× la menor', () => {
        const min = Math.min(PWA_SCREENSHOT_WIDTH, PWA_SCREENSHOT_HEIGHT)
        const max = Math.max(PWA_SCREENSHOT_WIDTH, PWA_SCREENSHOT_HEIGHT)
        expect(max / min).toBeLessThanOrEqual(2.3)
    })

    it('es formato narrow (retrato) para el diálogo tipo app-store', () => {
        expect(PWA_SCREENSHOT_HEIGHT).toBeGreaterThan(PWA_SCREENSHOT_WIDTH)
    })

    it('PWA_SCREENSHOT_SIZES coincide exactamente con el ancho×alto', () => {
        expect(PWA_SCREENSHOT_SIZES).toBe(`${PWA_SCREENSHOT_WIDTH}x${PWA_SCREENSHOT_HEIGHT}`)
    })

    it('expone las dos variantes (dashboard-look / entrenamiento-look)', () => {
        expect([...PWA_SCREENSHOT_VARIANTS]).toEqual([1, 2])
    })
})
