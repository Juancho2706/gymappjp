// Los DESTINOS de Share Entreno (`apps/mobile/components/alumno/share/share-targets.ts`) corren
// REALES; lo único mockeado son las hojas nativas que el runner de la raíz no puede cargar
// (react-native, react-native-share y los módulos de Expo).
//
// Qué se blinda acá, y por qué: el reporte del owner fue «Stories y WhatsApp no hacen nada» y
// «Guardar no avisa». Las dos degradaciones que lo producían son las que se testean —el destino
// directo que falla y cae a la hoja del sistema, y el permiso de galería negado— y en las dos lo que
// importa no es solo que la acción se recupere, sino que VUELVA UN `notice`: un fallback mudo es
// exactamente lo que el alumno lee como "el botón está roto". `share-notices.test.ts` fija los
// copys; esto fija el comportamiento.
//
// ── POR QUÉ LOS MOCKS APUNTAN A `apps/mobile/node_modules/…` ──
// Un `vi.mock('react-native')` desde `tests/` NO alcanza al módulo bajo test: en este monorepo pnpm
// la raíz tiene su propia copia hoisteada (`node_modules/react-native`) y `apps/mobile` resuelve a
// OTRA ruta real (`node_modules/.pnpm/react-native@0.81.5_…`). Son dos módulos distintos para Vite, y
// tres de estos paquetes (expo-media-library, expo-sharing, react-native-share) ni siquiera existen
// en la raíz. Mockear por la ruta de `apps/mobile` es lo único que intercepta el import de verdad.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` se hoistea por encima de todo, así que las dobles viven en un `vi.hoisted` — y de paso
// evitan tener que importar los paquetes por su ruta de node_modules para leer las llamadas.
const native = vi.hoisted(() => ({
    alert: vi.fn(),
    openSettings: vi.fn(),
    platform: { OS: 'android' as 'android' | 'ios' },
    nativeShare: vi.fn(async () => ({ action: 'sharedAction' })),
    shareSingle: vi.fn(async () => ({ success: true })),
    setStringAsync: vi.fn(async () => true),
    isAvailableAsync: vi.fn(async () => true),
    shareAsync: vi.fn(async () => {}),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
    saveToLibraryAsync: vi.fn(async () => {}),
    createAssetAsync: vi.fn(async () => ({ id: 'asset-1' })),
}))

vi.mock('../../apps/mobile/node_modules/react-native', () => ({
    Alert: { alert: native.alert },
    Linking: { openSettings: native.openSettings },
    Platform: native.platform,
    Share: { share: native.nativeShare },
}))

vi.mock('../../apps/mobile/node_modules/react-native-share', () => ({
    default: { shareSingle: native.shareSingle },
    Social: {
        InstagramStories: 'instagramstories',
        FacebookStories: 'facebookstories',
        Whatsapp: 'whatsapp',
    },
}))

vi.mock('../../apps/mobile/node_modules/expo-clipboard', () => ({ setStringAsync: native.setStringAsync }))

vi.mock('../../apps/mobile/node_modules/expo-sharing', () => ({
    isAvailableAsync: native.isAvailableAsync,
    shareAsync: native.shareAsync,
}))

vi.mock('../../apps/mobile/node_modules/expo-media-library', () => ({
    requestPermissionsAsync: native.requestPermissionsAsync,
    saveToLibraryAsync: native.saveToLibraryAsync,
    createAssetAsync: native.createAssetAsync,
}))

// Con App ID configurado: sin él Stories ni siquiera intenta y el test del fallback probaría el
// guard duro en vez del camino que interesa (el `shareSingle` que rechaza).
vi.mock('../../apps/mobile/node_modules/expo-constants', () => ({
    default: { expoConfig: { extra: { facebookAppId: '1234567890' } } },
}))

// Un helper de color que vive en el ejecutor y arrastra react-native + reanimated.
vi.mock('../../apps/mobile/components/alumno/workout/v3/JuicyButton', () => ({
    mixToBlack: (hex: string) => hex,
}))

import {
    runShareTarget,
    saveToGallery,
    shareToInstagramStories,
    shareToWhatsApp,
    type ShareTargetInput,
} from '../../apps/mobile/components/alumno/share/share-targets'

const INPUT: ShareTargetInput = {
    fileUri: 'file:///tmp/eva-share.png',
    transparent: false,
    accent: '#1462DC',
    inviteUrl: 'https://eva-app.cl/u/coach?ref=abc',
    presetId: 'heatmap',
}

beforeEach(() => {
    vi.clearAllMocks()
    native.platform.OS = 'android'
    native.shareSingle.mockResolvedValue({ success: true })
    native.isAvailableAsync.mockResolvedValue(true)
    native.shareAsync.mockResolvedValue(undefined)
    native.setStringAsync.mockResolvedValue(true)
    native.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true })
    native.saveToLibraryAsync.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('destino directo que no abre', () => {
    it('WhatsApp: si `shareSingle` rechaza cae a la hoja del sistema y devuelve el aviso', async () => {
        native.shareSingle.mockRejectedValueOnce(new Error('activity not found'))

        const result = await shareToWhatsApp(INPUT)

        // Se abrió la hoja, con el MISMO archivo: el alumno igual comparte.
        expect(native.shareAsync).toHaveBeenCalledWith(
            INPUT.fileUri,
            expect.objectContaining({ mimeType: 'image/png' }),
        )
        // El target sigue siendo el que el alumno PIDIÓ (así lo mide el evento), con outcome degradado.
        expect(result.target).toBe('whatsapp')
        expect(result.outcome).toBe('fallback')
        // Lo que motivó el ítem G: el fallback NO puede ser mudo.
        expect(result.notice?.kind).toBe('warn')
        expect(result.notice?.text).toContain('WhatsApp')
    })

    it('Stories: el fallback pisa el aviso del link copiado — lo urgente es explicar el cambio de pantalla', async () => {
        native.shareSingle.mockRejectedValueOnce(new Error('no activity'))

        const result = await shareToInstagramStories(INPUT)

        // El link igual quedó copiado ANTES del salto (patrón Strava), con el preset final en `k=`.
        expect(native.setStringAsync).toHaveBeenCalledWith('https://eva-app.cl/u/coach?ref=abc&k=heatmap')
        expect(result.outcome).toBe('fallback')
        expect(result.notice?.text).toContain('Instagram')
    })

    it('si la hoja del sistema TAMPOCO abre, el aviso sube a `error`', async () => {
        native.shareSingle.mockRejectedValueOnce(new Error('no activity'))
        native.shareAsync.mockRejectedValueOnce(new Error('sin actividad para el intent'))

        const result = await shareToWhatsApp(INPUT)

        expect(result.outcome).toBe('error')
        expect(result.notice?.kind).toBe('error')
    })

    it('el destino que SÍ abre no inventa avisos', async () => {
        const result = await shareToWhatsApp(INPUT)

        expect(result).toEqual({ target: 'whatsapp', outcome: 'ok' })
        expect(native.shareAsync).not.toHaveBeenCalled()
    })

    it('Stories que abre devuelve el aviso del link: es la única instrucción que hace funcionar el `?ref=`', async () => {
        const result = await shareToInstagramStories(INPUT)

        expect(result.outcome).toBe('ok')
        expect(result.notice?.text).toContain('sticker Link')
    })

    it('ninguna función lanza: el contrato es que la UI decide, no el `catch` de cada call site', async () => {
        native.shareSingle.mockRejectedValue(new Error('boom'))
        native.isAvailableAsync.mockRejectedValue(new Error('boom'))
        native.nativeShare.mockRejectedValue(new Error('boom'))

        for (const target of ['ig_stories', 'fb_stories', 'whatsapp', 'sheet'] as const) {
            await expect(runShareTarget(target, INPUT)).resolves.toMatchObject({ target })
        }
    })
})

describe('guardar en la galería', () => {
    it('permiso negado recién (canAskAgain) ⇒ `denied` con aviso en el composer y SIN diálogo nativo encima', async () => {
        native.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true })

        const result = await saveToGallery(INPUT)

        expect(native.saveToLibraryAsync).not.toHaveBeenCalled()
        expect(result.outcome).toBe('denied')
        expect(result.notice?.kind).toBe('warn')
        expect(result.notice?.text.length).toBeGreaterThan(0)
        // El alumno acaba de ver (y negar) el diálogo del sistema: repetirlo sería doble aviso.
        expect(native.alert).not.toHaveBeenCalled()
    })

    it('permiso bloqueado en ajustes (canAskAgain=false) ⇒ `denied` con aviso Y diálogo con «Abrir Ajustes»', async () => {
        native.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false })

        const result = await saveToGallery(INPUT)

        expect(result.outcome).toBe('denied')
        expect(result.notice?.kind).toBe('warn')
        expect(native.alert).toHaveBeenCalledTimes(1)
        const buttons = native.alert.mock.calls[0]?.[2] as Array<{ text: string }> | undefined
        expect(buttons?.map((b) => b.text)).toEqual(['Ahora no', 'Abrir Ajustes'])
    })

    it('sin `canAskAgain` el diálogo ofrece abrir los ajustes: el del sistema ya no vuelve', async () => {
        native.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false })

        await saveToGallery(INPUT)

        const buttons = native.alert.mock.calls[0]?.[2] as Array<{ text: string }> | undefined
        expect(buttons).toHaveLength(2)
        expect(buttons?.[1]?.text).toContain('Ajustes')
    })

    it('guarda y confirma', async () => {
        const result = await saveToGallery(INPUT)

        expect(native.saveToLibraryAsync).toHaveBeenCalledWith(INPUT.fileUri)
        expect(result.outcome).toBe('ok')
        expect(result.notice?.kind).toBe('ok')
    })

    it('en Android reintenta por `createAssetAsync` cuando el guardado corto falla', async () => {
        native.saveToLibraryAsync.mockRejectedValueOnce(new Error('ruta de caché de un OEM'))

        const result = await saveToGallery(INPUT)

        expect(native.createAssetAsync).toHaveBeenCalledWith(INPUT.fileUri)
        expect(result.outcome).toBe('ok')
    })

    it('en iOS NO reintenta: `createAssetAsync` relee el asset y con el permiso add-only rechaza aunque haya guardado', async () => {
        native.platform.OS = 'ios'
        native.saveToLibraryAsync.mockRejectedValueOnce(new Error('falló de verdad'))

        const result = await saveToGallery(INPUT)

        // Sin el guard, acá el alumno leía «No pudimos guardar» sobre una imagen que sí quedó en el
        // carrete — y la guardaba dos veces.
        expect(native.createAssetAsync).not.toHaveBeenCalled()
        expect(result.outcome).toBe('error')
        expect(result.notice?.kind).toBe('error')
    })
})
