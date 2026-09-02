// El contorno y la sombra de los datos del card de Share Entreno
// (`apps/mobile/components/alumno/share/stickers/sticker-kit.ts`).
//
// Desde el rediseño de F ningún dato del card tiene fondo propio: el texto es blanco y lo único que
// lo separa de la foto del alumno son estas dos cosas. El módulo es RN-free (solo importa el TIPO
// `TextStyle`), así que corre con el runner de la raíz.
//
// Lo que se fija son los números del MOCKUP APROBADO y el umbral de miniatura, que es el que decide
// si el anillo de 8 copias se pinta o no. Los dos se habían corrido: el contorno salía hasta 3× y la
// sombra 2,5× lo aprobado, y un piso de medio píxel volvía borrón las 6 minis de preset.
import { describe, expect, it } from 'vitest'
import {
  PLAIN_CANVAS_SCALE,
  STROKE,
  strokeShadow,
  strokeSizer,
} from '../../apps/mobile/components/alumno/share/stickers/sticker-kit'

/** El canvas de diseño (`SHARE_CANVAS_W`) y el ancho de las minis de preset (`THUMB_W`). */
const CANVAS_W = 1080
const THUMB_W = 68

describe('STROKE — grosor contra el mockup', () => {
  it('el texto normal emite 1 px de diseño hacia afuera, como el `-webkit-text-stroke: k*2px` con `paint-order`', () => {
    // El stroke del mockup es CENTRADO: 2 px de diseño dejan 1 hacia afuera. El anillo de copias
    // desplaza hacia afuera, así que su equivalente es 1.
    expect(STROKE.sm).toBe(1)
    expect(STROKE.md).toBe(1)
  })

  it('la cifra héroe es la única excepción y no se va de 2', () => {
    // Con 1 px el contorno se pierde contra el trazo de la display black a 200 px; con 3 (lo que
    // había) la letra se ve embarrada y la sombra que la acompañaba era una mancha difusa.
    expect(STROKE.lg).toBe(2)
    expect(STROKE.lg).toBeLessThanOrEqual(2)
  })
})

describe('strokeSizer', () => {
  it('escala proporcional y SIN redondear: a la escala del preview el contorno es sub-píxel', () => {
    const sw = strokeSizer(0.25, 1)
    expect(sw(1)).toBeCloseTo(0.25, 6)
    expect(sw(2)).toBeCloseTo(0.5, 6)
  })

  it('no tiene piso: en una mini el contorno vale lo que vale, no medio píxel', () => {
    // El piso de 0,5 px era ~8× el grosor proporcional de la mini — un borrón gris sobre un texto
    // de ~2 px, justo donde ya no quedan pills que le den forma.
    const sw = strokeSizer(THUMB_W / CANVAS_W, 1)
    expect(sw(STROKE.sm)).toBeLessThan(0.1)
  })

  it('lleva pegada la escala del CANVAS, no el factor completo del sticker', () => {
    const sw = strokeSizer(0.25, 1.5)
    expect(sw.canvasScale).toBe(0.25)
    // El factor del sticker sí incluye la escala: son dos números distintos a propósito.
    expect(sw(1)).toBeCloseTo(0.375, 6)
  })
})

describe('PLAIN_CANVAS_SCALE — cuándo el anillo de copias no se pinta', () => {
  const thumbK = THUMB_W / CANVAS_W

  it('las 6 minis de preset caen del lado «plano»', () => {
    expect(strokeSizer(thumbK, 1).canvasScale).toBeLessThan(PLAIN_CANVAS_SCALE)
  })

  it('el lienzo del editor en el teléfono más chico que soportamos NO cae del lado plano', () => {
    // ~133 px de ancho: pantalla de 640 de alto, con el header, la barra y las safe areas fuera.
    expect(strokeSizer(133 / CANVAS_W, 1).canvasScale).toBeGreaterThan(PLAIN_CANVAS_SCALE)
  })

  it('la decisión NO depende del `stickerScale`: una card nunca queda medio contorneada', () => {
    // Los `stickerScale` del catálogo van de 0,8 (QR) a 1,5 (silueta). Si el umbral mirara el factor
    // completo, la silueta de una mini (0,094) superaría al QR del canvas grande (0,096) y el PNG
    // exportado saldría con la mitad de los datos contorneados y la otra mitad no.
    for (const stickerScale of [0.8, 0.9, 1, 1.5]) {
      expect(strokeSizer(thumbK, stickerScale).canvasScale).toBeLessThan(PLAIN_CANVAS_SCALE)
      expect(strokeSizer(133 / CANVAS_W, stickerScale).canvasScale).toBeGreaterThan(PLAIN_CANVAS_SCALE)
    }
  })
})

describe('strokeShadow', () => {
  it('es la sombra fija del mockup: `0 2px 6px rgba(0,0,0,.55)` en px de diseño', () => {
    const shadow = strokeShadow(strokeSizer(1, 1))
    expect(shadow.textShadowColor).toBe('rgba(0,0,0,0.55)')
    expect(shadow.textShadowOffset).toEqual({ width: 0, height: 2 })
    expect(shadow.textShadowRadius).toBe(6)
  })

  it('NO es proporcional al grosor del contorno: el héroe tenía una sombra 2,5× la aprobada', () => {
    // Antes salía de multiplicar el contorno YA escalado (×1,7 el offset, ×3,4 el radio), así que la
    // cifra héroe —que lleva el contorno más grueso— era la que peor sombra tenía. Ahora la sombra
    // sale del MISMO escalador para todos: solo depende de la escala del sticker.
    const sw = strokeSizer(0.25, 1)
    const shadow = strokeShadow(sw)
    expect(shadow.textShadowOffset).toEqual({ width: 0, height: sw(2) })
    expect(shadow.textShadowRadius).toBe(sw(6))
  })
})
