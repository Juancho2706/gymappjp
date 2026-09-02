/**
 * Share Entreno (G) — los AVISOS del composer, como datos.
 *
 * ── POR QUÉ EXISTE ESTE MÓDULO ──
 * Hasta el 02-09 los destinos avisaban con `toast.*()`. El composer se monta SIEMPRE dentro de una
 * ventana nativa ajena (el `<Modal>` del resumen post-entreno cuando va `embedded`, o el suyo
 * propio) y el `<Toaster />` está montado una sola vez en `app/_layout.tsx`, en el árbol raíz: cada
 * toast se pintaba DETRÁS del Modal y el alumno no veía nada. De ahí el reporte del owner —
 * «Guardar no avisa», «Stories y WhatsApp no hacen nada»— cuando en varios casos la acción sí había
 * corrido.
 *
 * Ahora los destinos no muestran nada: devuelven el aviso en `ShareTargetResult.notice` y lo pinta
 * el composer, en SU ventana. Este archivo es la parte pura de ese contrato — sin React Native
 * adentro, así que el runner de la raíz puede testear las copias sin arrastrar el runtime RN
 * (`tests/mobile/share-notices.test.ts`).
 *
 * Regla de copy: decir lo que pasó de verdad. El fallback a la hoja del sistema NO es un error (el
 * alumno igual comparte), pero tampoco es lo que pidió: va como `warn` y lo nombra.
 */

/** `ok` confirma, `warn` avisa de una degradación, `error` es un fallo real. */
export type ShareNoticeKind = 'ok' | 'warn' | 'error'

export interface ShareNotice {
    kind: ShareNoticeKind
    text: string
}

/** Nombre de la app destino tal como se le muestra al alumno. */
export type ShareAppName = 'Instagram' | 'Facebook' | 'WhatsApp'

/**
 * Patrón Strava: el link va al portapapeles ANTES de saltar a Stories, porque Meta no deja adjuntar
 * links programáticamente. El aviso viaja con el resultado y se pinta al volver a la app.
 */
export const LINK_COPIED_NOTICE: ShareNotice = {
    kind: 'ok',
    text: 'Link copiado — pégalo en el sticker Link de tu historia',
}

export const SAVED_NOTICE: ShareNotice = { kind: 'ok', text: 'Guardada en tu galería' }

export const SAVE_FAILED_NOTICE: ShareNotice = {
    kind: 'error',
    text: 'No pudimos guardar la imagen. Intenta de nuevo.',
}

export const CAPTURE_FAILED_NOTICE: ShareNotice = {
    kind: 'error',
    text: 'No pudimos generar la imagen. Intenta de nuevo.',
}

export const SHARE_FAILED_NOTICE: ShareNotice = {
    kind: 'error',
    text: 'No pudimos compartir la imagen. Intenta de nuevo.',
}

export const CAMERA_DENIED_NOTICE: ShareNotice = {
    kind: 'warn',
    text: 'Sin permiso de cámara no podemos tomar la foto.',
}

/**
 * El destino directo no se pudo abrir.
 *
 * `sheetOpened` distingue las dos degradaciones, que para el alumno son MUY distintas: si la hoja
 * del sistema apareció, compartir sigue siendo posible y el aviso solo explica por qué cambió la
 * pantalla; si tampoco apareció, no queda nada que hacer y es un error.
 */
export function targetFallbackNotice(app: ShareAppName, sheetOpened: boolean): ShareNotice {
    if (!sheetOpened) {
        return { kind: 'error', text: `No pudimos abrir ${app} ni las opciones de compartir.` }
    }
    return { kind: 'warn', text: `No pudimos abrir ${app} — te abrimos las opciones de compartir.` }
}

/**
 * Permiso de galería negado.
 *
 * Con `canAskAgain: false` el diálogo del sistema ya no vuelve a aparecer por más que se toque
 * «Guardar», así que el único camino son los ajustes del teléfono y el copy tiene que decirlo — si
 * no, el botón se siente roto.
 *
 * El copy NO nombra la pantalla exacta a propósito: «el permiso de Fotos en Ajustes» es
 * terminología de iOS, y en Android el permiso se llama «Fotos y videos» y la app es
 * «Configuración» o «Ajustes» según el fabricante. Un texto genérico es correcto en las dos
 * plataformas; el botón «Abrir Ajustes» del `Alert` es el que lleva al lugar de verdad.
 */
export function galleryPermissionNotice(canAskAgain: boolean): ShareNotice {
    if (canAskAgain) {
        return { kind: 'warn', text: 'Necesitamos permiso para guardar la imagen en tu galería.' }
    }
    return { kind: 'warn', text: 'Activa el permiso de fotos en los ajustes del teléfono para guardar la imagen.' }
}
