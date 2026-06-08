import { describe, it, expect } from 'vitest'
import { validateImageMagicBytes, extToKind } from './image-validation'

function blobOf(bytes: number[]): Blob {
    return new Blob([new Uint8Array(bytes)])
}

describe('validateImageMagicBytes', () => {
    it('acepta GIF89a', async () => {
        const r = await validateImageMagicBytes(blobOf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.kind).toBe('gif')
    })

    it('acepta GIF87a', async () => {
        const r = await validateImageMagicBytes(blobOf([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.kind).toBe('gif')
    })

    it('acepta JPEG', async () => {
        const r = await validateImageMagicBytes(blobOf([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.kind).toBe('jpeg')
    })

    it('acepta PNG', async () => {
        const r = await validateImageMagicBytes(blobOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.kind).toBe('png')
    })

    it('acepta WebP (RIFF....WEBP)', async () => {
        const r = await validateImageMagicBytes(blobOf([
            0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
            0x57, 0x45, 0x42, 0x50,
        ]))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.kind).toBe('webp')
    })

    it('rechaza SVG renombrado como PNG', async () => {
        // SVG comienza con `<?xml` o `<svg` — nunca pasa magic-bytes de imagen real
        const r = await validateImageMagicBytes(blobOf([0x3c, 0x3f, 0x78, 0x6d, 0x6c, 0, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(false)
    })

    it('rechaza ejecutable Windows (MZ header)', async () => {
        const r = await validateImageMagicBytes(blobOf([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(false)
    })

    it('rechaza PDF (%PDF)', async () => {
        const r = await validateImageMagicBytes(blobOf([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]))
        expect(r.ok).toBe(false)
    })

    it('rechaza archivo casi vacío (3 bytes)', async () => {
        const r = await validateImageMagicBytes(blobOf([0x47, 0x49, 0x46]))
        expect(r.ok).toBe(false)
    })

    it('rechaza archivo vacío', async () => {
        const r = await validateImageMagicBytes(blobOf([]))
        expect(r.ok).toBe(false)
    })

    it('rechaza RIFF sin WEBP en bytes 8-11', async () => {
        // RIFF + AVI en lugar de WEBP
        const r = await validateImageMagicBytes(blobOf([
            0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
            0x41, 0x56, 0x49, 0x20,
        ]))
        expect(r.ok).toBe(false)
    })

    it('rechaza bytes aleatorios', async () => {
        const r = await validateImageMagicBytes(blobOf([0xde, 0xad, 0xbe, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]))
        expect(r.ok).toBe(false)
    })
})

describe('extToKind', () => {
    it('mapea cada MIME válido', () => {
        expect(extToKind('image/gif')).toBe('gif')
        expect(extToKind('image/jpeg')).toBe('jpeg')
        expect(extToKind('image/jpg')).toBe('jpeg')
        expect(extToKind('image/png')).toBe('png')
        expect(extToKind('image/webp')).toBe('webp')
    })

    it('case-insensitive', () => {
        expect(extToKind('IMAGE/PNG')).toBe('png')
    })

    it('null para MIME no permitido', () => {
        expect(extToKind('image/svg+xml')).toBe(null)
        expect(extToKind('image/bmp')).toBe(null)
        expect(extToKind('application/octet-stream')).toBe(null)
    })
})
