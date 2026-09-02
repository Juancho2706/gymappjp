// Copys de los avisos de Share Entreno. El módulo bajo test es RN-free a propósito (por eso vive
// aparte de `share-targets.ts`, que importa react-native), así que corre con el runner de la raíz.
// El COMPORTAMIENTO de los destinos que los emiten se testea en `share-targets.test.ts`.
//
// Lo que se fija acá no es cosmética: hasta el 02-09 estos avisos salían por el `toast` global y se
// pintaban DETRÁS de la ventana del composer — el alumno guardaba la imagen y no se enteraba, o caía
// a la hoja del sistema sin ninguna explicación. El contrato que hay que no romper es que cada
// degradación tenga su copy y su severidad correcta.
import { describe, expect, it } from 'vitest'
import {
  CAMERA_DENIED_NOTICE,
  CAPTURE_FAILED_NOTICE,
  galleryPermissionNotice,
  LINK_COPIED_NOTICE,
  SAVE_FAILED_NOTICE,
  SAVED_NOTICE,
  SHARE_FAILED_NOTICE,
  targetFallbackNotice,
  type ShareAppName,
} from '../../apps/mobile/components/alumno/share/share-notices'

const APPS: ShareAppName[] = ['Instagram', 'Facebook', 'WhatsApp']

describe('targetFallbackNotice', () => {
  it.each(APPS)('con la hoja abierta avisa en tono `warn` y nombra a %s', app => {
    const notice = targetFallbackNotice(app, true)
    // `warn` y no `error`: el alumno igual puede compartir, solo cambió la pantalla.
    expect(notice.kind).toBe('warn')
    expect(notice.text).toContain(app)
    expect(notice.text).toContain('opciones de compartir')
  })

  it.each(APPS)('sin hoja es un error de verdad (%s)', app => {
    const notice = targetFallbackNotice(app, false)
    expect(notice.kind).toBe('error')
    expect(notice.text).toContain(app)
  })
})

describe('galleryPermissionNotice', () => {
  it('con `canAskAgain` pide el permiso y no manda a los ajustes', () => {
    const notice = galleryPermissionNotice(true)
    expect(notice.kind).toBe('warn')
    expect(notice.text.toLowerCase()).not.toContain('ajustes')
  })

  it('sin `canAskAgain` manda a los ajustes: el diálogo del sistema ya no vuelve', () => {
    const notice = galleryPermissionNotice(false)
    expect(notice.kind).toBe('warn')
    expect(notice.text.toLowerCase()).toContain('ajustes')
  })

  it('no nombra la pantalla exacta: «Fotos»/«Ajustes» es terminología de iOS y el copy es de las dos plataformas', () => {
    // En Android el permiso se llama «Fotos y videos» y la app es «Configuración» según el
    // fabricante. Un copy con mayúscula inicial ahí manda al alumno a buscar algo que no existe.
    for (const canAskAgain of [true, false]) {
      const { text } = galleryPermissionNotice(canAskAgain)
      expect(text).not.toContain('Fotos')
      expect(text).not.toContain('Ajustes')
    }
  })
})

describe('avisos fijos', () => {
  it('confirman o alertan según corresponde', () => {
    expect(SAVED_NOTICE.kind).toBe('ok')
    expect(LINK_COPIED_NOTICE.kind).toBe('ok')
    expect(CAMERA_DENIED_NOTICE.kind).toBe('warn')
    for (const fail of [SAVE_FAILED_NOTICE, CAPTURE_FAILED_NOTICE, SHARE_FAILED_NOTICE]) {
      expect(fail.kind).toBe('error')
    }
  })

  it('«Guardada en tu galería» sigue nombrando la galería — es el aviso que el owner nunca vio', () => {
    expect(SAVED_NOTICE.text.toLowerCase()).toContain('galer')
  })

  it('el aviso del link nombra el sticker Link: sin eso el copiado al portapapeles no se entiende', () => {
    expect(LINK_COPIED_NOTICE.text).toContain('sticker Link')
  })
})
