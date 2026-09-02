// El tope de escala de un sticker de Share Entreno
// (`apps/mobile/components/alumno/share/share-types.ts`).
//
// Origen: QA del owner en Android (02-09). Al pellizcar un elemento del card en el paso «Acomodar»
// y llevarlo AL MÁXIMO, el elemento «desaparecía». El tope era plano (`STICKER_SCALE_MAX = 3`) y
// desde el rediseño de F los datos no tienen pill pero siguen midiendo lo mismo: la cifra héroe con
// 4 dígitos ocupa ~540 px del canvas de diseño (1080) ⇒ a escala 3 pide 1620. Yoga mide al sticker
// con `FitContent` contra el ancho del lienzo y los textos van con `numberOfLines={1}`, así que el
// resultado no es un sticker gigante sino un «375…» recortado con la unidad `kg` empujada afuera del
// canvas — que es exactamente lo que el alumno lee como "se borró".
//
// `maxScaleFor` es aritmética pura (sin RN), así que corre con el runner de la raíz.
import { describe, expect, it } from 'vitest'
import {
  maxScaleFor,
  STICKER_SCALE_MAX,
  STICKER_SCALE_MIN,
} from '../../apps/mobile/components/alumno/share/share-types'

/**
 * Lienzo del paso «Acomodar» en un teléfono típico: 9:16 y ~216 px de ancho (el composer le da al
 * card el 62 % del alto disponible, no el ancho de pantalla).
 */
const CANVAS_W = 216
const CANVAS_H = 384

describe('STICKER_SCALE_MIN / MAX — el rango del catálogo no se movió', () => {
  it('sigue siendo 50 %–300 %: el tope fino es por sticker, no un número más chico para todos', () => {
    // Bajar el máximo global habría castigado a los stickers chicos (la fecha ocupa el 12 % del
    // ancho de diseño: ×3 entra de sobra) para arreglar solo a los grandes.
    expect(STICKER_SCALE_MIN).toBe(0.5)
    expect(STICKER_SCALE_MAX).toBe(3)
  })
})

describe('maxScaleFor — sin medida', () => {
  it('cae al tope del catálogo mientras el sticker no reportó su caja', () => {
    // Primer frame: `ShareCanvas` todavía no emitió `reportSizes`. Bloquear el pellizco ahí sería
    // peor que dejarlo pasar — la medida llega en el layout siguiente.
    expect(maxScaleFor(1, undefined, CANVAS_W, CANVAS_H)).toBe(STICKER_SCALE_MAX)
    expect(maxScaleFor(1, { w: 0, h: 0 }, CANVAS_W, CANVAS_H)).toBe(STICKER_SCALE_MAX)
  })

  it('cae al tope del catálogo si el lienzo todavía no tiene tamaño', () => {
    expect(maxScaleFor(1, { w: 100, h: 40 }, 0, 0)).toBe(STICKER_SCALE_MAX)
  })

  it('cae al tope del catálogo con una escala inválida (no se divide por cero)', () => {
    expect(maxScaleFor(0, { w: 100, h: 40 }, CANVAS_W, CANVAS_H)).toBe(STICKER_SCALE_MAX)
  })
})

describe('maxScaleFor — el tope sale de la medida real', () => {
  it('un sticker chico (la fecha) sigue llegando al 300 %', () => {
    // "19 ago" a escala 0,9 mide ~26×8 px de pantalla: ×3 sigue ocupando un octavo del lienzo.
    expect(maxScaleFor(0.9, { w: 26, h: 8 }, CANVAS_W, CANVAS_H)).toBe(3)
  })

  it('la cifra héroe se planta cuando llena el ancho, no en el 300 % del catálogo', () => {
    // Media pantalla de ancho a escala 1 ⇒ el doble es exactamente el lienzo. Es el caso del bug:
    // con el tope plano el alumno podía pedir 3 y lo que quedaba en pantalla era «375…».
    expect(maxScaleFor(1, { w: 108, h: 50 }, CANVAS_W, CANVAS_H)).toBeCloseTo(2, 5)
  })

  it('el alto también frena: un bloque alto y angosto no crece por tener ancho de sobra', () => {
    // El set-list son 8 filas. `ShareCanvas` acota el ANCHO del sticker al del lienzo pero no el
    // alto, así que sin mirar los dos ejes la lista se salía por arriba y por abajo.
    expect(maxScaleFor(1, { w: 40, h: 300 }, CANVAS_W, CANVAS_H)).toBeCloseTo(384 / 300, 5)
  })
})

describe('maxScaleFor — lo que ya llena el lienzo', () => {
  it('no crece más (y el tope no se arrastra pellizco a pellizco)', () => {
    // Yoga nunca reporta más que el ancho del lienzo, así que un sticker que YA se sale mide "justo
    // el lienzo" y la razón queda pegada apenas sobre 1. Sin el piso de holgura, cada pellizco lo
    // agrandaba otro 2-3 % para siempre, recortando un poco más de texto cada vez.
    expect(maxScaleFor(2, { w: CANVAS_W, h: 50 }, CANVAS_W, CANVAS_H)).toBe(2)
    expect(maxScaleFor(2, { w: CANVAS_W - 4, h: 50 }, CANVAS_W, CANVAS_H)).toBe(2)
  })

  it('NUNCA devuelve menos que la escala vigente: el preset «Póster» ancla la cifra en 2,4', () => {
    // Ese preset viene de fábrica más grande que el lienzo. Si el tope pudiera quedar por debajo,
    // el primer pellizco lo achicaría solo — moviendo algo que el alumno no pidió mover.
    expect(maxScaleFor(2.4, { w: CANVAS_W, h: 200 }, CANVAS_W, CANVAS_H)).toBe(2.4)
  })

  it('jamás pasa del tope del catálogo, por chico que sea el sticker', () => {
    expect(maxScaleFor(1, { w: 1, h: 1 }, CANVAS_W, CANVAS_H)).toBe(STICKER_SCALE_MAX)
  })
})

describe('maxScaleFor — rieles rotados', () => {
  it('a ±90° mide contra el eje que el sticker ocupa de verdad', () => {
    // `marcador` y `poster` giran fecha/racha 90° para pegarlas al borde: rotadas ocupan de ancho lo
    // que miden de alto (contrato de `StickerState.rotation`). Medir la caja sin rotar les daba el
    // tope del eje equivocado — el que sobra — y las dejaba crecer hasta salirse del riel.
    // Rotada, la caja de 300×40 ocupa 40 de ancho y 300 de alto: el alto es el que se queda sin
    // lugar (384/300 ≈ 1,28) y el ancho sobra por lejos (216/40 = 5,4).
    const box = { w: 300, h: 40 }
    expect(maxScaleFor(1, box, CANVAS_W, CANVAS_H, 90)).toBeCloseTo(CANVAS_H / 300, 5)
    expect(maxScaleFor(1, box, CANVAS_W, CANVAS_H, -90)).toBeCloseTo(CANVAS_H / 300, 5)
    // Sin rotar, esa misma caja ya se sale de ancho: no crece.
    expect(maxScaleFor(1, box, CANVAS_W, CANVAS_H, 0)).toBe(1)
  })

  it('0 y 180 son el mismo eje', () => {
    const box = { w: 108, h: 50 }
    expect(maxScaleFor(1, box, CANVAS_W, CANVAS_H, 180)).toBe(maxScaleFor(1, box, CANVAS_W, CANVAS_H, 0))
  })
})
