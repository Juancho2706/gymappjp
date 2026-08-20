import { Alert, Linking, Platform, Share as NativeShare } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import Constants from 'expo-constants'
import RNShare, { Social } from 'react-native-share'
import { toast } from '../../Toast'
import { mixToBlack } from '../workout/v3/JuicyButton'
import type { SharePresetId } from './share-types'

/**
 * Share Entreno (F5) — los DESTINOS del card ya rasterizado.
 *
 * El composer captura el lienzo (`share-capture.ts`) y le pasa el `file://` a una de estas
 * funciones. Cada destino es una función aparte y no una hoja genérica porque el SPEC (§Flujo paso
 * 4) lo pide por dos motivos: el salto directo a Stories no existe en la hoja nativa, y los botones
 * por destino son la ÚNICA medición fiable del target — Android no reporta a qué app fue el share
 * (`Sharing.shareAsync` devuelve `Promise<void>`), así que preguntarle al sistema es imposible.
 *
 * ── CONTRATO ──
 * Ninguna de estas funciones LANZA. Todas devuelven `{ target, outcome }` y la UI decide qué
 * mostrar. Un throw acá aparecería después de que el usuario ya vio abrirse (o no) la app destino,
 * y encima obligaría a cada call site a repetir el mismo try/catch.
 *
 * ── NOMBRES ──
 * `RNShare` es `react-native-share` (la librería nueva) y `NativeShare` es el `Share` de React
 * Native (la hoja del sistema). Se importan con alias justamente para que no se confundan: son dos
 * APIs distintas que conviven en este archivo.
 */

// ── Contratos ────────────────────────────────────────────────────────────────────────────────────

/** Los 5 destinos. Coincide 1:1 con la prop `target` del evento `student_share_target_selected`. */
export type ShareTarget = 'ig_stories' | 'fb_stories' | 'whatsapp' | 'save' | 'sheet'

/**
 * Qué terminó pasando:
 *  - `ok`       el destino pedido se abrió (o el archivo se guardó).
 *  - `fallback` el destino no estaba disponible y se abrió la hoja nativa en su lugar.
 *  - `denied`   el usuario negó un permiso (hoy solo Guardar).
 *  - `error`    falló de verdad; el composer avisa con un toast.
 *
 * OJO con `ok`: significa "se abrió el destino", NO "el usuario publicó". Ninguna de las dos
 * plataformas informa si terminó publicando (mismo límite que documenta F0.2). Lo que se instrumenta
 * son INTENTOS; el éxito real lo mide el funnel de atribución (`?ref=`).
 */
export type ShareTargetOutcome = 'ok' | 'fallback' | 'denied' | 'error'

export interface ShareTargetResult {
    target: ShareTarget
    outcome: ShareTargetOutcome
}

export interface ShareTargetInput {
    /** `file://` del PNG que devolvió `captureShareCanvas`. */
    fileUri: string
    /** Modo sticker: el PNG tiene alpha y va como `stickerImage`, no como fondo. */
    transparent: boolean
    /** Acento de la marca del coach; pinta el degradado de fondo de la story en modo sticker. */
    accent: string
    /** Link de invitación del coach con `?ref=` (o `null` si el coach no tiene código). */
    inviteUrl: string | null
    /** Preset final elegido por el alumno; viaja como `k=` en el link del portapapeles. */
    presetId: SharePresetId
}

// ── Config ───────────────────────────────────────────────────────────────────────────────────────

/**
 * App ID de Facebook (app.json `extra.facebookAppId`).
 *
 * Meta lo exige para el intent/scheme de Stories: sin él (o con uno inválido) Instagram abre y
 * descarta el asset SIN avisar. Por eso es un guard duro: sin ID no intentamos Stories, caemos a la
 * hoja nativa. Vive en `extra` y no en una `EXPO_PUBLIC_*` porque es configuración del binario, no
 * un secreto ni algo que cambie por ambiente.
 */
const FACEBOOK_APP_ID: string | null = (() => {
    const raw = (Constants.expoConfig?.extra as { facebookAppId?: string } | undefined)?.facebookAppId
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed.length > 0 ? trimmed : null
})()

/** Fondo por defecto de la story cuando el acento de la marca no es un hex usable. */
const FALLBACK_STORY_COLOR = '#222222'

const HEX6 = /^#[0-9a-fA-F]{6}$/

/**
 * Degradado de fondo de la story.
 *
 * Instagram los usa SOLO cuando el share no trae asset de fondo — o sea en modo sticker, donde el
 * PNG transparente se pega encima de este degradado. Con `backgroundImage` los ignora, así que
 * mandarlos siempre es inofensivo y ahorra una rama. Si el acento no es `#RRGGBB` (marca mal
 * cargada) se cae al gris del SPEC en vez de mandarle basura a Meta.
 */
function storyColors(accent: string): { backgroundTopColor: string; backgroundBottomColor: string } {
    if (!HEX6.test(accent.trim())) {
        return { backgroundTopColor: FALLBACK_STORY_COLOR, backgroundBottomColor: FALLBACK_STORY_COLOR }
    }
    return { backgroundTopColor: accent.trim(), backgroundBottomColor: mixToBlack(accent.trim(), 0.45) }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

/**
 * ¿Está la app destino instalada?
 *
 * Dos caminos porque las dos plataformas responden distinto:
 *  - Android: `isPackageInstalled` (PackageManager). Necesita que el paquete esté declarado en
 *    `<queries>` del manifest — eso lo genera el config plugin de `react-native-share` desde
 *    `app.json`; NO se puede escribir `<queries>` a mano en `app.json`.
 *  - iOS: `canOpenURL` sobre el scheme. Necesita `LSApplicationQueriesSchemes`, que sale del MISMO
 *    plugin. `isPackageInstalled` no existe en iOS (la librería lanza "Not implemented").
 *
 * Sin este chequeo la librería hace algo peor que fallar: en Android manda al usuario a la ficha de
 * Play Store de la app que no tiene, y en iOS Stories "resuelve OK" sin haber abierto nada.
 */
async function isTargetInstalled(iosScheme: string, androidPackage: string): Promise<boolean> {
    try {
        if (Platform.OS === 'android') {
            const res = await RNShare.isPackageInstalled(androidPackage)
            return res.isInstalled
        }
        return await Linking.canOpenURL(iosScheme)
    } catch {
        // Un scheme no declarado en el plist hace que `canOpenURL` devuelva false, pero un error
        // inesperado no puede leerse como "sí está instalada": ante la duda, fallback.
        return false
    }
}

/**
 * Patrón Strava: el link al portapapeles ANTES de saltar a la app.
 *
 * Meta no deja adjuntar links programáticamente a una story (el sticker Link lo pone el usuario, y
 * `attributionURL`/swipe-up no existen para apps normales). Lo único que funciona es dejarle el link
 * copiado y decírselo, para que lo pegue en el sticker.
 *
 * El `k={preset}` se agrega ACÁ y no en `build-share-data`: esa URL es la que se hornea en el QR
 * cuando el canvas se pinta, y el alumno todavía puede cambiar de estilo después. Este momento —el
 * tap en el destino— es el único que conoce el preset FINAL.
 *
 * El separador se calcula: `inviteUrl` trae `?ref=…` solo cuando hay `clientId`; sin él la URL viene
 * limpia y un `&k=` a secas la rompería.
 */
async function copyInviteLink(inviteUrl: string | null, presetId: SharePresetId): Promise<boolean> {
    if (!inviteUrl) return false
    const separator = inviteUrl.includes('?') ? '&' : '?'
    try {
        await Clipboard.setStringAsync(`${inviteUrl}${separator}k=${encodeURIComponent(presetId)}`)
        return true
    } catch {
        return false
    }
}

// ── Destinos ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Hoja nativa del sistema («Más…»): cubre TikTok, Telegram, X, Fotos, Drive y todo lo demás.
 *
 * Es además el fallback de los otros destinos, por eso acepta el `target` con el que se la llamó:
 * si Stories no estaba disponible, el evento tiene que seguir diciendo `ig_stories` con outcome
 * `fallback` (lo que el alumno PIDIÓ), no `sheet`.
 *
 * Comparte SOLO el archivo, sin `message`: con `url` + `message` juntos WhatsApp/Instagram se quedan
 * con el texto y descartan la imagen — o sea justo la tarjeta branded que queremos que viaje (fix
 * F0.1, documentado en `ShareCard.tsx`). Todo el texto va quemado en el PNG.
 */
export async function shareToSheet(
    input: ShareTargetInput,
    target: ShareTarget = 'sheet',
): Promise<ShareTargetResult> {
    const outcome: ShareTargetOutcome = target === 'sheet' ? 'ok' : 'fallback'
    try {
        if (Platform.OS === 'ios') {
            await NativeShare.share({ url: input.fileUri })
        } else if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(input.fileUri, {
                mimeType: 'image/png',
                dialogTitle: 'Compartir entreno',
                UTI: 'public.png',
            })
        } else {
            await NativeShare.share({ url: input.fileUri })
        }
        return { target, outcome }
    } catch {
        // La cancelación del usuario NO lanza (resuelve): un throw acá es un fallo real de la hoja.
        return { target, outcome: 'error' }
    }
}

/**
 * Instagram Stories directo.
 *
 * En modo transparente el PNG va como `stickerImage` (Instagram lo pega sobre el fondo/la foto que
 * elija el usuario) y en modo normal como `backgroundImage` (ocupa la story entera). Es la misma
 * decisión que ya tomó el editor al ofrecer «Fondo transparente», acá solo se traduce al payload.
 *
 * Trampa de iOS 16+: Instagram lee el asset del portapapeles del sistema, así que al abrirse dispara
 * el prompt de «pegar desde EVA». Es indeprimible y si el usuario lo rechaza la story llega vacía —
 * nada que podamos hacer desde el código, pero explica reportes de "no pasó nada" en QA.
 *
 * Trampa de Android a vigilar en QA: en el camino `backgroundImage` la librería tipa el intent como
 * `image/jpeg` fijo (`InstagramStoriesShare.java`) aunque el archivo sea PNG. Instagram lee los
 * bytes reales y no el MIME declarado, pero si en algún device el fondo llega en blanco, ESE es el
 * primer sospechoso (el camino `stickerImage` sí declara `image/png` y no tiene el problema).
 */
export async function shareToInstagramStories(input: ShareTargetInput): Promise<ShareTargetResult> {
    const target: ShareTarget = 'ig_stories'
    if (!FACEBOOK_APP_ID) return shareToSheet(input, target)
    if (!(await isTargetInstalled('instagram-stories://share', 'com.instagram.android'))) {
        return shareToSheet(input, target)
    }

    // Antes de abrir, no después: una vez que Instagram toma el foco la app queda en background y
    // el toast no se vería. Además el usuario necesita el link YA para pegarlo en el sticker.
    if (await copyInviteLink(input.inviteUrl, input.presetId)) {
        toast.success('Link copiado — pégalo en el sticker Link de tu historia')
    }

    try {
        await RNShare.shareSingle({
            social: Social.InstagramStories,
            appId: FACEBOOK_APP_ID,
            ...(input.transparent ? { stickerImage: input.fileUri } : { backgroundImage: input.fileUri }),
            ...storyColors(input.accent),
        })
        return { target, outcome: 'ok' }
    } catch {
        return shareToSheet(input, target)
    }
}

/**
 * Facebook Stories directo.
 *
 * MISMO payload que Instagram salvo el `social`. La diferencia real es nativa y la resuelve la
 * librería sola: en Android el intent de Facebook lleva el App ID en el extra
 * `com.facebook.platform.extra.APPLICATION_ID`, mientras que el de Instagram usa
 * `source_application`. Se pasa `appId` y listo — copiar el patrón de IG a mano rompería FB.
 */
export async function shareToFacebookStories(input: ShareTargetInput): Promise<ShareTargetResult> {
    const target: ShareTarget = 'fb_stories'
    if (!FACEBOOK_APP_ID) return shareToSheet(input, target)
    if (!(await isTargetInstalled('facebook-stories://share', 'com.facebook.katana'))) {
        return shareToSheet(input, target)
    }

    // Facebook tiene la misma limitación de links que Instagram: el sticker lo pone el usuario.
    if (await copyInviteLink(input.inviteUrl, input.presetId)) {
        toast.success('Link copiado — pégalo en el sticker Link de tu historia')
    }

    try {
        await RNShare.shareSingle({
            social: Social.FacebookStories,
            appId: FACEBOOK_APP_ID,
            ...(input.transparent ? { stickerImage: input.fileUri } : { backgroundImage: input.fileUri }),
            ...storyColors(input.accent),
        })
        return { target, outcome: 'ok' }
    } catch {
        return shareToSheet(input, target)
    }
}

/**
 * WhatsApp: abre el selector de chat de WhatsApp con la imagen adjunta.
 *
 * Sin `message`, por el mismo motivo que la hoja nativa (F0.1): WhatsApp prioriza el texto y tira la
 * imagen. El link de invitación NO se copia acá — en un chat el alumno escribe lo que quiere y
 * pisarle el portapapeles sin avisar sería invasivo.
 */
export async function shareToWhatsApp(input: ShareTargetInput): Promise<ShareTargetResult> {
    const target: ShareTarget = 'whatsapp'
    if (!(await isTargetInstalled('whatsapp://app', 'com.whatsapp'))) {
        return shareToSheet(input, target)
    }
    try {
        await RNShare.shareSingle({
            social: Social.Whatsapp,
            url: input.fileUri,
            type: 'image/png',
        })
        return { target, outcome: 'ok' }
    } catch {
        return shareToSheet(input, target)
    }
}

/**
 * Guardar en la galería.
 *
 * `requestPermissionsAsync(true)` = writeOnly: pedimos SOLO agregar, nunca leer. En iOS eso mapea a
 * `NSPhotoLibraryAddUsageDescription` (el permiso "add-only", el menos invasivo) y en Android 13+ la
 * lista de permisos a pedir queda VACÍA — el módulo no necesita ninguno para escribir vía MediaStore.
 *
 * Por eso `app.json` declara el plugin de expo-media-library con `granularPermissions: []`: Expo
 * auto-aplica el config plugin de cualquier módulo instalado que traiga uno, y el suyo por defecto
 * suma READ_MEDIA_IMAGES + READ_MEDIA_VIDEO + READ_MEDIA_AUDIO al manifest. Para guardar UNA imagen
 * no sirve ninguno de los tres, y en Play cada uno arrastra su declaración de datos sensibles. La
 * entrada explícita gana sobre la automática y los deja fuera.
 *
 * Sin pantalla pre-permiso a propósito: la regla de App Review 5.1.1(iv) apunta a permisos que
 * abren datos del usuario (cámara, fotos, ubicación). Acá el usuario acaba de tocar un botón que
 * dice «Guardar» y el permiso es de escritura — la intención ya está declarada por el propio tap.
 */
export async function saveToGallery(input: ShareTargetInput): Promise<ShareTargetResult> {
    const target: ShareTarget = 'save'
    try {
        const permission = await MediaLibrary.requestPermissionsAsync(true)
        if (!permission.granted) {
            Alert.alert('Permiso requerido', 'Necesitamos permiso para guardar la imagen en tu galería.')
            return { target, outcome: 'denied' }
        }
        await MediaLibrary.saveToLibraryAsync(input.fileUri)
        toast.success('Guardada en tu galería')
        return { target, outcome: 'ok' }
    } catch {
        return { target, outcome: 'error' }
    }
}

/**
 * Despachador: el composer solo conoce el `target` que tocó el alumno.
 *
 * Tener el switch acá y no en la UI mantiene el composer ignorante del payload de cada red — y hace
 * que agregar un destino nuevo (TikTok directo, fase 2) sea un caso más en este archivo.
 */
export async function runShareTarget(
    target: ShareTarget,
    input: ShareTargetInput,
): Promise<ShareTargetResult> {
    switch (target) {
        case 'ig_stories':
            return shareToInstagramStories(input)
        case 'fb_stories':
            return shareToFacebookStories(input)
        case 'whatsapp':
            return shareToWhatsApp(input)
        case 'save':
            return saveToGallery(input)
        case 'sheet':
        default:
            return shareToSheet(input)
    }
}

/**
 * ¿Hay App ID configurado? Lo usa la UI para no prometer Stories cuando el binario salió sin ID
 * (el botón sigue existiendo y cae a la hoja nativa, pero el copy puede ser honesto).
 */
export function hasFacebookAppId(): boolean {
    return FACEBOOK_APP_ID !== null
}
