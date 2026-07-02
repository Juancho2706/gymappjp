import { describe, it, expect } from 'vitest'
import { toStorageRenderThumb, exerciseGridThumb } from './exercise-thumb'

const SB = 'https://jikjeokundmaafuytdcx.supabase.co'
const STORAGE_GIF = `${SB}/storage/v1/object/public/exercise-animations/catalog/27NNGFr.gif`

describe('toStorageRenderThumb', () => {
    it('reescribe una URL pública de Storage al endpoint render/image con width+quality', () => {
        const out = toStorageRenderThumb(STORAGE_GIF, 256, 55)
        expect(out).toBe(
            `${SB}/storage/v1/render/image/public/exercise-animations/catalog/27NNGFr.gif?width=256&quality=55`,
        )
    })

    it('preserva el origin (host/puerto) del stack local', () => {
        const local = 'http://127.0.0.1:54321/storage/v1/object/public/exercise-animations/x.gif'
        expect(toStorageRenderThumb(local, 128)).toBe(
            'http://127.0.0.1:54321/storage/v1/render/image/public/exercise-animations/x.gif?width=128&quality=55',
        )
    })

    it('descarta cualquier query previa de la URL de objeto', () => {
        const out = toStorageRenderThumb(`${STORAGE_GIF}?token=abc`, 200, 40)
        expect(out).toBe(
            `${SB}/storage/v1/render/image/public/exercise-animations/catalog/27NNGFr.gif?width=200&quality=40`,
        )
    })

    it('devuelve null para URLs que no son de Storage de Supabase', () => {
        expect(toStorageRenderThumb('https://static.exercisedb.dev/media/abc.gif')).toBeNull()
        expect(toStorageRenderThumb('https://img.youtube.com/vi/xyz/mqdefault.jpg')).toBeNull()
        expect(toStorageRenderThumb('')).toBeNull()
    })
})

describe('exerciseGridThumb', () => {
    it('prefiere thumbnail_url (espejo estático) y lo sirve directo, sin transformar', () => {
        const mirror = `${SB}/storage/v1/object/public/exercise-media/yt/abc.webp`
        const out = exerciseGridThumb({
            thumbnail_url: mirror,
            gif_url: null,
            video_url: STORAGE_GIF,
        })
        expect(out).toBe(mirror)
    })

    it('reescribe el gif de Storage (via video_url) a una miniatura render/image', () => {
        const out = exerciseGridThumb({
            thumbnail_url: null,
            gif_url: null,
            video_url: STORAGE_GIF,
        }, 256)
        expect(out).toBe(
            `${SB}/storage/v1/render/image/public/exercise-animations/catalog/27NNGFr.gif?width=256&quality=55`,
        )
        // Nunca el gif crudo full-res en el grid.
        expect(out).not.toBe(STORAGE_GIF)
    })

    it('usa el póster estático de YouTube (mqdefault) para videos de YouTube, sin transformar', () => {
        const out = exerciseGridThumb({
            thumbnail_url: null,
            gif_url: null,
            video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        })
        expect(out).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
    })

    it('deja pasar una media externa no-Supabase tal cual (CDN de ExerciseDB)', () => {
        const cdn = 'https://static.exercisedb.dev/media/abc.gif'
        const out = exerciseGridThumb({ thumbnail_url: null, gif_url: cdn, video_url: null })
        expect(out).toBe(cdn)
    })

    it('devuelve null cuando el ejercicio no tiene media utilizable', () => {
        expect(
            exerciseGridThumb({ thumbnail_url: null, gif_url: null, video_url: null }),
        ).toBeNull()
    })
})
