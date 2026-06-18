import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sharpMock } = vi.hoisted(() => ({ sharpMock: vi.fn() }))
vi.mock('sharp', () => ({ default: sharpMock }))

import { compressImageToWebp } from './image-compress'

function chainReturning(buffer: Buffer | null) {
    const chain: Record<string, unknown> = {}
    chain.rotate = () => chain
    chain.resize = () => chain
    chain.webp = () => ({ toBuffer: async () => buffer })
    return chain
}

const jpg = (bytes: number[]) => new File([new Uint8Array(bytes)], 'p.jpg', { type: 'image/jpeg' })

beforeEach(() => sharpMock.mockReset())

describe('compressImageToWebp — best-effort, NUNCA tira', () => {
    it('imagen válida -> WebP comprimido', async () => {
        sharpMock.mockReturnValue(chainReturning(Buffer.from([10, 20, 30])))
        const r = await compressImageToWebp(jpg([1, 2, 3, 4]))
        expect(r).not.toBeNull()
        expect(r!.contentType).toBe('image/webp')
        expect(r!.ext).toBe('webp')
        expect(r!.buffer.byteLength).toBe(3)
    })

    it('sharp falla al decodificar (HEIC/corrupto/OOM) -> null (caller sube el original, no aborta)', async () => {
        const chain: Record<string, unknown> = {}
        chain.rotate = () => chain
        chain.resize = () => chain
        chain.webp = () => ({ toBuffer: async () => { throw new Error('unsupported image format') } })
        sharpMock.mockReturnValue(chain)
        expect(await compressImageToWebp(jpg([1, 2, 3]))).toBeNull()
    })

    it('sharp devuelve buffer vacío -> null', async () => {
        sharpMock.mockReturnValue(chainReturning(Buffer.alloc(0)))
        expect(await compressImageToWebp(jpg([1, 2, 3]))).toBeNull()
    })

    it('archivo vacío (0 bytes) -> null sin invocar sharp', async () => {
        const r = await compressImageToWebp(new File([], 'empty.jpg', { type: 'image/jpeg' }))
        expect(r).toBeNull()
        expect(sharpMock).not.toHaveBeenCalled()
    })

    it('input sin arrayBuffer -> null sin invocar sharp', async () => {
        const r = await compressImageToWebp({} as unknown as File)
        expect(r).toBeNull()
        expect(sharpMock).not.toHaveBeenCalled()
    })
})
