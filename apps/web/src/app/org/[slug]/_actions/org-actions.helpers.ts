// Helpers PUROS (sin red/DB, sin 'use server') para las org actions. Extraídos verbatim de
// org.actions.ts (Fase 2 — split de god-file, behavior-preserving). Importables por el archivo
// 'use server' sin romper la regla de "solo exports async" (esto NO es un módulo de actions).

export const ALLOWED_LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export type LogoValidationResult = { ok: true } | { ok: false; error: string }

/**
 * Valida un logo subido: MIME declarado + tamaño + magic-bytes (defense-in-depth). Devuelve el
 * MISMO mensaje de error que la versión inline previa, en el MISMO orden de chequeo.
 */
export async function validateLogoFile(file: File): Promise<LogoValidationResult> {
    // Server-side MIME check — never trust client-reported type alone
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
        return { ok: false, error: 'Tipo de archivo no permitido. Solo JPEG, PNG, WebP o GIF.' }
    }
    if (file.size > MAX_LOGO_BYTES) {
        return { ok: false, error: 'El archivo supera 2 MB.' }
    }

    // Re-read first 12 bytes to verify magic numbers (defense-in-depth)
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8
    const isPng  = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47
    const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
    const isGif  = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46
    if (!isJpeg && !isPng && !isWebp && !isGif) {
        return { ok: false, error: 'El contenido del archivo no coincide con su extensión.' }
    }

    return { ok: true }
}
