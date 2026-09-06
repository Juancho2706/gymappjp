import { Alert, Linking, Platform, Share as NativeShare } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import Constants from 'expo-constants'
import RNShare, { Social } from 'react-native-share'
import { mixToBlack } from '../workout/v3/JuicyButton'
import {
    galleryPermissionNotice,
    LINK_COPIED_NOTICE,
    SAVE_FAILED_NOTICE,
    SAVED_NOTICE,
    targetFallbackNotice,
    type ShareAppName,
    type ShareNotice,
} from './share-notices'

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
 * Ninguna de estas funciones LANZA. Todas devuelven `{ target, outcome, notice? }` y la UI decide
 * qué mostrar. Un throw acá aparecería después de que el usuario ya vio abrirse (o no) la app
 * destino, y encima obligaría a cada call site a repetir el mismo try/catch.
 *
 * Ninguna PINTA tampoco: hasta el 02-09 tres de ellas llamaban al singleton `toast`, que se
 * renderiza en el árbol raíz — detrás de la ventana nativa donde vive el composer. El alumno no veía
 * ni «Guardada en tu galería» ni el link copiado (ver `share-notices.ts`). Ahora el aviso viaja en
 * `notice` y lo pinta el composer, en su propia ventana.
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
 *  - `error`    falló de verdad; el composer lo pinta en su banner.
 *
 * OJO con `ok`: significa "se abrió el destino", NO "el usuario publicó". Ninguna de las dos
 * plataformas informa si terminó publicando (mismo límite que documenta F0.2). Lo que se instrumenta
 * son INTENTOS; el éxito real lo mide el funnel de atribución (`?ref=`).
 */
export type ShareTargetOutcome = 'ok' | 'fallback' | 'denied' | 'error'

export interface ShareTargetResult {
    target: ShareTarget
    outcome: ShareTargetOutcome
    /**
     * Qué decirle al alumno, si hay algo que decirle. Lo pinta el composer dentro de SU ventana: un
     * toast global acá es invisible (ver la cabecera del archivo). `undefined` = la acción salió
     * como se esperaba y no necesita cartel.
     */
    notice?: ShareNotice
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
 * El destino directo no salió: se abre la hoja del sistema y se explica el cambio.
 *
 * ── POR QUÉ YA NO HAY PRE-GATE ──
 * Hasta el 02-09 los tres destinos preguntaban primero «¿está instalada?» (`canOpenURL` en iOS,
 * `RNShare.isPackageInstalled` en Android) y, si la respuesta era no, caían a la hoja SIN decir
 * nada. Las dos consultas mienten: en iOS `canOpenURL` devuelve false para cualquier scheme fuera de
 * `LSApplicationQueriesSchemes` aunque la app esté ahí (y `openURL` sí la abre), y en Android 11+ la
 * package visibility hace que `getPackageInfo` lance `NameNotFoundException` para un paquete que no
 * esté en `<queries>`. Con la consulta mintiendo, el alumno tocaba «Stories» y le aparecía una hoja
 * genérica sin ninguna explicación: exactamente el «no hace nada» del reporte.
 *
 * Ahora se INTENTA siempre y la única decisión la toma el resultado del intento.
 *
 * ⚠️ Límite conocido en Android: `shareSingle` no siempre lanza cuando la app no está. Su propio
 * `SingleShareIntent.open` (node_modules/react-native-share/android/.../SingleShareIntent.java:31-61)
 * repite el chequeo de PackageManager y, si dice que no, reemplaza el intent por el
 * `market://details?id=…` de la ficha de Play Store y resuelve `success: true`. O sea: si el binario
 * saliera SIN los `<queries>` de `app.json`, el alumno terminaría en la ficha de Play Store en vez de
 * en la hoja del sistema, y acá lo veríamos como `ok`. `app.json` los declara (los inyecta el config
 * plugin de la librería), pero hay que verificarlo en el APK instalado —
 * `adb shell dumpsys package cl.evaapp.eva | grep -i queries`— porque `/android` está en .gitignore y
 * el manifest del repo es un artefacto viejo que no prueba nada.
 */
async function fallbackToSheet(input: ShareTargetInput, target: ShareTarget, app: ShareAppName): Promise<ShareTargetResult> {
    const result = await shareToSheet(input, target)
    return { ...result, notice: targetFallbackNotice(app, result.outcome !== 'error') }
}

/**
 * Patrón Strava: el link al portapapeles ANTES de saltar a la app.
 *
 * Meta no deja adjuntar links programáticamente a una story (el sticker Link lo pone el usuario, y
 * `attributionURL`/swipe-up no existen para apps normales). Lo único que funciona es dejarle el link
 * copiado y decírselo, para que lo pegue en el sticker.
 *
 * El `k=` marca de qué card salió el link. Era el preset elegido cuando había seis; desde la
 * simplificación del 06-09-2026 hay un solo card, así que la constante es `bloque` — se conserva el
 * parámetro (no se borra) para que las URLs viejas ya repartidas y las nuevas sigan hablando el
 * mismo idioma en la atribución.
 *
 * El separador se calcula: `inviteUrl` trae `?ref=…` solo cuando hay `clientId`; sin él la URL viene
 * limpia y un `&k=` a secas la rompería.
 */
const SHARE_LINK_KIND = 'bloque'

async function copyInviteLink(inviteUrl: string | null): Promise<boolean> {
    if (!inviteUrl) return false
    const separator = inviteUrl.includes('?') ? '&' : '?'
    try {
        await Clipboard.setStringAsync(`${inviteUrl}${separator}k=${SHARE_LINK_KIND}`)
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
    if (!FACEBOOK_APP_ID) return fallbackToSheet(input, target, 'Instagram')

    // La copia va ANTES de abrir, no después: una vez que Instagram toma el foco la app queda en
    // background y el usuario necesita el link YA para pegarlo en el sticker. El AVISO en cambio
    // viaja en el resultado y se pinta al volver — mostrarlo ahora sería un cartel de 4 s que nadie
    // llega a leer porque la pantalla ya cambió de app.
    const copied = await copyInviteLink(input.inviteUrl)

    try {
        await RNShare.shareSingle({
            social: Social.InstagramStories,
            appId: FACEBOOK_APP_ID,
            ...(input.transparent ? { stickerImage: input.fileUri } : { backgroundImage: input.fileUri }),
            ...storyColors(input.accent),
        })
        return { target, outcome: 'ok', notice: copied ? LINK_COPIED_NOTICE : undefined }
    } catch {
        // El aviso del fallback le gana al del link copiado: el link sigue en el portapapeles, pero
        // lo que el alumno necesita entender es por qué se abrió otra pantalla.
        return fallbackToSheet(input, target, 'Instagram')
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
    if (!FACEBOOK_APP_ID) return fallbackToSheet(input, target, 'Facebook')

    // Facebook tiene la misma limitación de links que Instagram: el sticker lo pone el usuario.
    const copied = await copyInviteLink(input.inviteUrl)

    try {
        await RNShare.shareSingle({
            social: Social.FacebookStories,
            appId: FACEBOOK_APP_ID,
            ...(input.transparent ? { stickerImage: input.fileUri } : { backgroundImage: input.fileUri }),
            ...storyColors(input.accent),
        })
        return { target, outcome: 'ok', notice: copied ? LINK_COPIED_NOTICE : undefined }
    } catch {
        return fallbackToSheet(input, target, 'Facebook')
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
    try {
        await RNShare.shareSingle({
            social: Social.Whatsapp,
            url: input.fileUri,
            type: 'image/png',
        })
        return { target, outcome: 'ok' }
    } catch {
        return fallbackToSheet(input, target, 'WhatsApp')
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
 *
 * ── EL BUG QUE REPORTÓ EL OWNER ──
 * «Guardar no avisa». El `toast.success` de acá se pintaba en el árbol raíz, detrás de la ventana
 * del composer: la imagen se guardaba y no había forma de saberlo. El aviso ahora viaja en `notice`.
 * Lo único que el owner SÍ veía era el `Alert` del permiso, porque un diálogo nativo no depende del
 * árbol React — y por eso se conserva además del `notice`.
 */
export async function saveToGallery(input: ShareTargetInput): Promise<ShareTargetResult> {
    const target: ShareTarget = 'save'
    try {
        const permission = await MediaLibrary.requestPermissionsAsync(true)
        if (!permission.granted) {
            const notice = galleryPermissionNotice(permission.canAskAgain)
            // El banner del composer ya avisa. El `Alert` nativo se reserva para `canAskAgain: false`:
            // el diálogo del sistema ya no vuelve, el único camino son los Ajustes y un banner no
            // puede abrirlos — sin el botón sería un callejón sin salida. Con `canAskAgain: true` el
            // alumno acaba de ver (y negar) el diálogo del sistema: repetirlo encima sería doble aviso.
            if (!permission.canAskAgain) {
                Alert.alert('Permiso requerido', notice.text, [
                    { text: 'Ahora no', style: 'cancel' },
                    { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
                ])
            }
            return { target, outcome: 'denied', notice }
        }
        try {
            await MediaLibrary.saveToLibraryAsync(input.fileUri)
        } catch (err) {
            // Segundo intento por el camino largo: `saveToLibraryAsync` no devuelve el asset y en
            // algunos OEM Android falla contra rutas de caché que `createAssetAsync` sí acepta.
            //
            // SOLO en Android, y no por prolijidad: `createAssetAsync` crea el asset y DESPUÉS lo
            // busca para devolver el `Asset`. Con el permiso add-only de iOS (que es justamente el
            // que pedimos, `requestPermissionsAsync(true)`) esa lectura vuelve vacía y la promesa
            // rechaza — o sea que en iOS el reintento diría «No pudimos guardar» sobre una imagen
            // que YA quedó en el carrete, y el alumno la guardaría dos veces. Si el reintento (o el
            // rethrow de iOS) también lanza, cae al catch de afuera y el alumno se entera.
            if (Platform.OS !== 'android') throw err
            await MediaLibrary.createAssetAsync(input.fileUri)
        }
        return { target, outcome: 'ok', notice: SAVED_NOTICE }
    } catch {
        return { target, outcome: 'error', notice: SAVE_FAILED_NOTICE }
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
