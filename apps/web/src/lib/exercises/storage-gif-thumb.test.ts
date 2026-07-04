import { describe, expect, it } from 'vitest'
import { storageGifThumbPath } from './storage-gif-thumb'

/**
 * Unit del helper PURO que deriva el path del thumbnail estatico desde el GIF de Storage.
 * INVARIANTE CRITICA: el slug DEBE ser identico al que produjo el backfill one-time
 * (scripts/mirror-catalog-gif-thumbs.mjs) para que el cron reuse (upsert) los 818 objetos ya
 * subidos en `exercise-media/gifthumb/` en vez de re-generarlos.
 */
const BASE = 'https://abc.supabase.co/storage/v1/object/public/'

describe('storageGifThumbPath', () => {
    it('mapea una URL de catalogo al slug exacto del backfill', () => {
        const r = storageGifThumbPath(`${BASE}exercise-animations/catalog/27NNGFr.gif`)
        expect(r).toEqual({
            bucketAndPath: 'exercise-animations/catalog/27NNGFr.gif',
            thumbPath: 'gifthumb/catalog_27NNGFr.webp',
        })
    })

    it('strip-ea el query string antes de derivar el path', () => {
        const r = storageGifThumbPath(`${BASE}exercise-animations/catalog/27NNGFr.gif?token=abc&x=1`)
        expect(r?.bucketAndPath).toBe('exercise-animations/catalog/27NNGFr.gif')
        expect(r?.thumbPath).toBe('gifthumb/catalog_27NNGFr.webp')
    })

    it('devuelve null para una URL que no es de Storage', () => {
        expect(storageGifThumbPath('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
    })

    it('devuelve null para un .mp4 en Storage (solo espeja gifs)', () => {
        expect(storageGifThumbPath(`${BASE}exercise-animations/catalog/clip.mp4`)).toBeNull()
    })

    it('deriva el slug del path COMPLETO (drop del bucket) para paths anidados', () => {
        const r = storageGifThumbPath(`${BASE}a/b/c.gif`)
        expect(r?.thumbPath).toBe('gifthumb/b_c.webp')
    })

    it('es case-insensitive con la extension .GIF', () => {
        const r = storageGifThumbPath(`${BASE}exercise-animations/catalog/X.GIF`)
        expect(r?.thumbPath).toBe('gifthumb/catalog_X.webp')
    })
})
