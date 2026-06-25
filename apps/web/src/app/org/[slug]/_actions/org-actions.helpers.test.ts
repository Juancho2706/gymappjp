import { describe, it, expect } from 'vitest'
import { validateLogoFile, MAX_LOGO_BYTES } from './org-actions.helpers'

/**
 * Golden master del slice (Fase 2). Pinea el comportamiento EXACTO de validateLogoFile extraída
 * verbatim de org.actions.ts: orden de checks (MIME → tamaño → magic-bytes) y mensajes de error.
 * Es seguridad de upload (defense-in-depth) — el golden master garantiza que el split no la afloja.
 */

function fileFrom(bytes: number[], type: string, name = 'logo'): File {
    return new File([new Uint8Array(bytes)], name, { type })
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]
const JPEG = [0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
const GIF = [0x47, 0x49, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0]

describe('validateLogoFile', () => {
    it('acepta PNG/JPEG/WebP/GIF válidos (MIME declarado + magic bytes)', async () => {
        expect(await validateLogoFile(fileFrom(PNG, 'image/png'))).toEqual({ ok: true })
        expect(await validateLogoFile(fileFrom(JPEG, 'image/jpeg'))).toEqual({ ok: true })
        expect(await validateLogoFile(fileFrom(WEBP, 'image/webp'))).toEqual({ ok: true })
        expect(await validateLogoFile(fileFrom(GIF, 'image/gif'))).toEqual({ ok: true })
    })

    it('rechaza MIME no permitido — primer check', async () => {
        expect(await validateLogoFile(fileFrom(PNG, 'application/pdf'))).toEqual({
            ok: false,
            error: 'Tipo de archivo no permitido. Solo JPEG, PNG, WebP o GIF.',
        })
        expect(await validateLogoFile(fileFrom(PNG, 'image/svg+xml'))).toEqual({
            ok: false,
            error: 'Tipo de archivo no permitido. Solo JPEG, PNG, WebP o GIF.',
        })
    })

    it('rechaza archivo > 2 MB — segundo check (MIME válido)', async () => {
        const big = new File([new Uint8Array(MAX_LOGO_BYTES + 1)], 'big.png', { type: 'image/png' })
        expect(await validateLogoFile(big)).toEqual({ ok: false, error: 'El archivo supera 2 MB.' })
    })

    it('tamaño exacto 2 MB pasa (el check es > MAX, no >=)', async () => {
        const arr = new Uint8Array(MAX_LOGO_BYTES)
        arr[0] = 0x89; arr[1] = 0x50; arr[2] = 0x4e; arr[3] = 0x47 // PNG magic
        const atLimit = new File([arr], 'edge.png', { type: 'image/png' })
        expect(await validateLogoFile(atLimit)).toEqual({ ok: true })
    })

    it('rechaza contenido cuyos magic-bytes no coinciden — tercer check', async () => {
        expect(await validateLogoFile(fileFrom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'image/png'))).toEqual({
            ok: false,
            error: 'El contenido del archivo no coincide con su extensión.',
        })
    })
})
