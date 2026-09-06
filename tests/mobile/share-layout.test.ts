// El LAYOUT único de Share Entreno
// (`apps/mobile/components/alumno/share/share-layout.ts`).
//
// Origen: decisión del owner del 06-09-2026 — el card pasa de 6 presets × 9 stickers a UN bloque
// que solo se mueve y se escala. Lo que se blinda acá no es estética sino las tres cosas que, si se
// rompen, dejan el card VACÍO o el bloque FUERA de la story y no hay `tsc` que lo note:
//
//   1. el bloque nace visible (un `visible: false` de fábrica = card en blanco);
//   2. su centro cae DENTRO del canvas y con aire suficiente abajo — la UI de Instagram Stories
//      tapa el ~12 % inferior con su barra de respuesta, y ahí es donde va la firma del coach;
//   3. `cloneStickerLayout` devuelve una copia PROFUNDA: el composer muta el layout en cada
//      arrastre y si compartiera referencia con la constante de módulo, el card del segundo entreno
//      arrancaría donde el alumno dejó el del primero (y el mini del CTA también).
//
// El módulo es datos puros (sin react-native): se importa directo, sin mocks.
import { describe, expect, it } from 'vitest'
import {
    cloneStickerLayout,
    SHARE_LAYOUT,
    STICKER_PAINT_ORDER,
} from '../../apps/mobile/components/alumno/share/share-layout'

describe('SHARE_LAYOUT — el bloque de fábrica', () => {
    it('trae exactamente un sticker y es `bloque`', () => {
        expect(Object.keys(SHARE_LAYOUT.stickers)).toEqual(['bloque'])
    })

    it('nace visible: un card sin bloque no tiene nada que compartir', () => {
        expect(SHARE_LAYOUT.stickers.bloque.visible).toBe(true)
    })

    it('arranca a escala 1 — el tamaño de diseño, no una escala heredada de ningún preset', () => {
        expect(SHARE_LAYOUT.stickers.bloque.scale).toBe(1)
    })

    it('su centro cae dentro del canvas', () => {
        const { x, y } = SHARE_LAYOUT.stickers.bloque
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThan(1)
        expect(y).toBeGreaterThan(0)
        expect(y).toBeLessThan(1)
    })

    it('deja el bloque completo dentro del canvas con margen inferior', () => {
        // El bloque mide ~510 px de diseño de alto a escala 1 (el desglose está en `share-layout`),
        // y el canvas lo ancla por el CENTRO: el pie queda en `y·1920 + 255`.
        const BLOCK_DESIGN_H = 510
        const CANVAS_H = 1920
        const center = SHARE_LAYOUT.stickers.bloque.y * CANVAS_H
        const top = center - BLOCK_DESIGN_H / 2
        const bottom = center + BLOCK_DESIGN_H / 2

        expect(top).toBeGreaterThan(0)
        // ≥ 60 px es el mínimo del brief; el layout deja bastante más porque abajo vive la barra de
        // respuesta de Stories. Si alguien baja `y`, este test es el que avisa.
        expect(CANVAS_H - bottom).toBeGreaterThanOrEqual(60)
    })

    it('el fondo de fábrica es la foto: el card se diseñó para ir encima de una', () => {
        expect(SHARE_LAYOUT.background).toBe('photo')
    })
})

describe('STICKER_PAINT_ORDER', () => {
    it('es la lista de un solo elemento que recorre el canvas', () => {
        expect([...STICKER_PAINT_ORDER]).toEqual(['bloque'])
    })
})

describe('cloneStickerLayout', () => {
    it('devuelve un objeto nuevo y con estados nuevos (copia profunda)', () => {
        const a = cloneStickerLayout(SHARE_LAYOUT)
        expect(a).not.toBe(SHARE_LAYOUT.stickers)
        expect(a.bloque).not.toBe(SHARE_LAYOUT.stickers.bloque)
        expect(a).toEqual(SHARE_LAYOUT.stickers)
    })

    it('mutar la copia NO toca el catálogo ni a otra copia', () => {
        const a = cloneStickerLayout(SHARE_LAYOUT)
        a.bloque.x = 0.11
        a.bloque.scale = 2.5

        expect(SHARE_LAYOUT.stickers.bloque.x).not.toBe(0.11)
        expect(SHARE_LAYOUT.stickers.bloque.scale).toBe(1)
        expect(cloneStickerLayout(SHARE_LAYOUT).bloque.x).toBe(SHARE_LAYOUT.stickers.bloque.x)
    })
})
