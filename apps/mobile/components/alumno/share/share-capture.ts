import type { RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as FileSystem from 'expo-file-system/legacy'

/**
 * Share Entreno (F2) — rasterizado del canvas a un PNG en disco.
 *
 * Es el MISMO camino que ya usa el motor `ShareCard` (ShareCard.tsx:544-578) — captura a resolución
 * fija + renombrado best-effort — extraído acá porque el composer tiene varios destinos (Stories,
 * WhatsApp, Guardar, hoja nativa) y todos necesitan el archivo antes de decidir a dónde va.
 */

export interface CaptureShareCanvasOptions {
    /** Nombre del archivo SIN extensión; se sanea (el share sheet muestra este nombre). */
    fileName: string
    /**
     * Modo sticker: el canvas viene con fondo transparente. NO cambia las opciones de captura —
     * está acá para documentar la decisión y para que el call site no tenga que recordarla: el
     * formato es PNG SIEMPRE, y es justamente PNG lo que preserva el canal alpha. Un JPG (o un
     * `format:'jpg'` "para que pese menos") aplanaría la transparencia contra negro y el sticker
     * llegaría a Instagram como un rectángulo opaco.
     */
    transparent: boolean
}

/**
 * Captura `ref` como PNG 1080×1920 y devuelve el `file://` del archivo.
 *
 * Requisitos del NODO capturado (responsabilidad del caller, no se pueden imponer desde acá):
 *  - `collapsable={false}` en el View al que cuelga el ref — en Android, Fabric fusiona vistas sin
 *    pintado propio con su padre y `captureRef` se queda sin nodo que rasterizar (o captura el
 *    padre entero, chrome de edición incluido).
 *  - montado y medido: capturar en el mismo tick del montaje sale en blanco. En el composer eso lo
 *    garantiza el flujo (el usuario ve el preview antes de tocar Compartir).
 *
 * Resolución FIJA 1080×1920: sin `width`/`height` view-shot exporta a `anchoDeVista × pixelRatio`,
 * que según el device queda entre ~680 y ~1200 px — el mismo bug que ya se corrigió en `ShareCard`.
 */
export async function captureShareCanvas(
    ref: RefObject<View | null>,
    opts: CaptureShareCanvasOptions,
): Promise<string> {
    const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 1080,
        height: 1920,
    })

    // El tmpfile queda con un nombre aleatorio; renombrarlo es lo que hace que el archivo llegue a
    // WhatsApp/Fotos con un nombre legible. BEST-EFFORT: si el move falla en alguna plataforma
    // devolvemos el tmpfile — jamás romper el share por el renombrado (mismo criterio que ShareCard).
    try {
        const safe =
            (opts.fileName || 'eva-entreno').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
            'eva-entreno'
        const from = uri.startsWith('file://') ? uri : `file://${uri}`
        const to = `${FileSystem.cacheDirectory}${safe}.png`
        if (to === from) return uri
        // `idempotent`: si quedó un PNG de una captura anterior con el mismo nombre, `moveAsync`
        // falla por destino ocupado en vez de sobreescribir.
        await FileSystem.deleteAsync(to, { idempotent: true })
        await FileSystem.moveAsync({ from, to })
        return to
    } catch {
        return uri
    }
}

/**
 * Borra el PNG capturado. Se llama tras compartir/guardar (privacidad: el card puede llevar una foto
 * personal del alumno y no tiene por qué sobrevivir en caché al share).
 *
 * Nunca lanza: fallar al limpiar un archivo temporal no puede tumbar el flujo — el SO igual purga el
 * caché, y un `throw` acá aparecería DESPUÉS de que el usuario ya compartió con éxito.
 */
export async function cleanupShareCapture(uri: string | null | undefined): Promise<void> {
    if (!uri) return
    try {
        await FileSystem.deleteAsync(uri, { idempotent: true })
    } catch {
        // swallow — ver arriba.
    }
}
