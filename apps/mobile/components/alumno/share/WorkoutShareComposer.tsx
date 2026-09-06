import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
    AccessibilityInfo,
    ActivityIndicator,
    AppState,
    BackHandler,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { MotiView } from 'moti'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
    Camera,
    CircleCheck,
    Download,
    ImageOff,
    Images,
    Move,
    OctagonX,
    Share2,
    TriangleAlert,
    X,
    type LucideIcon,
} from 'lucide-react-native'
import { deriveSportTokens } from '@eva/brand-kit'
import { EXEC_SURFACE } from '../workout/v3/exec-theme'
import { FONT } from '../../../lib/typography'
import { haptics } from '../../../lib/haptics'
import { captureAppEvent } from '../../../lib/analytics'
import { ShareCanvas } from './ShareCanvas'
import { FacebookGlyph, InstagramGlyph, WhatsappGlyph } from './brand-glyphs'
import {
    CAMERA_DENIED_NOTICE,
    CAPTURE_FAILED_NOTICE,
    SHARE_FAILED_NOTICE,
    type ShareNotice,
} from './share-notices'
import { hasFacebookAppId, runShareTarget, type ShareTarget } from './share-targets'
import { cloneStickerLayout, SHARE_LAYOUT } from './share-layout'
import { captureShareCanvas, cleanupShareCapture } from './share-capture'
import { pickSharePhoto, takeSharePhoto } from './share-photo'
import { accentOf, withAlpha } from './stickers'
import { StickerGestureLayer } from './StickerGestureLayer'
import {
    idleStickerTransform,
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    type StickerId,
    type StickerSize,
    type StickerState,
    type WorkoutShareData,
} from './share-types'

/**
 * Share Entreno — el COMPOSER: la pantalla donde el alumno arma su card.
 *
 * UNA sola pantalla desde la decisión del owner del 06-09-2026. Antes eran tres pasos (Editar →
 * Acomodar → Compartir) sobre un catálogo de 6 estilos, 9 stickers con toggles, vista de músculos y
 * un stepper de tamaño; hoy hay UN bloque de datos, se mueve, se pellizca, se le pone (o no) una
 * foto y se manda. Todo lo que se sacó era decisión que el alumno no quería tomar antes de compartir.
 *
 * ── QUÉ ES CHROME Y QUÉ ES CARD ──
 * Todo lo que se vea DENTRO del View con el ref (`canvasRef`) sale en el PNG. Por eso el chrome
 * (header, hint, chips de foto, barra de destinos) vive FUERA de ese View, y hasta el redondeado del
 * preview lo aplica el wrapper de arriba: el canvas se rasteriza full-bleed y cuadrado, mientras en
 * pantalla se ve con esquinas suaves. `captureRef` dibuja el subárbol del nodo, no el recorte de su
 * padre.
 *
 * ── PALETA ──
 * Chrome oscuro-inmersivo SIEMPRE, en ambos temas de la cuenta: son los literales `EXEC_SURFACE`
 * del área alumno v3 (el ejecutor ya es dark-only por diseño y documenta el porqué). No se usan
 * clases NativeWind acá porque sus tokens semánticos flipean con el esquema del sistema y el
 * composer quedaría medio claro sobre un card que siempre es oscuro. El único color dinámico es el
 * ACENTO, que sale de la marca del coach vía `deriveSportTokens(data.brand.accent)` — el MISMO que
 * usa el canvas, para que el chrome y el card no discutan.
 */

// ── Contrato ─────────────────────────────────────────────────────────────────────────────────────

export interface WorkoutShareComposerProps {
    visible: boolean
    onClose: () => void
    data: WorkoutShareData
    /**
     * Montar como overlay absoluto SIN `<Modal>` propio.
     *
     * MISMO fix QA-5 que documenta `ShareCard.tsx`: un `<Modal>` de RN anidado dentro de otro Modal
     * nativo (el resumen post-entreno ES un Modal) apila dos Dialog windows en Android; cuando la
     * Activity nativa de compartir manda la app a background y el usuario vuelve, Android no logra
     * restaurar el Dialog anidado y deja la pantalla en el scrim gris SIN contenido (el "brick" que
     * reportó el CEO). Y este composer abre la hoja de compartir sí o sí, así que el riesgo es
     * estructural, no hipotético. Cuando el host ya es una ventana nativa, pasar `embedded` deja
     * UNA sola ventana y el background/resume queda limpio. Hosts de nivel superior (una ruta) se
     * quedan con el Modal por defecto.
     */
    embedded?: boolean
}

/**
 * Fondo que el composer sabe ofrecer. El motor conserva `transparent` (ver `ShareBackground`), pero
 * el toggle «Fondo transparente» se retiró con la simplificación: era el control con menos uso y el
 * que peor se explicaba sin ver el resultado pegado en una story.
 */
type ComposerBackground = 'photo' | 'brand'

/** Alto fijo de la barra superior. Se usa además para calcular cuánto lienzo entra. */
const HEADER_H = 52

/**
 * Fracción del alto disponible que puede ocupar el lienzo. El card es lo que el alumno está
 * juzgando, así que se lleva casi todo: la del viejo paso «Compartir» (0,72), no la de «Acomodar»
 * (0,62, que dejaba la preview a un tercio del ancho en un iPhone de 390 pt). Lo que queda del
 * cuerpo (28 %) solo tiene que alojar el hint y la fila de chips (~70 pt): en un teléfono de 640 pt
 * de alto sobran ~20 pt; en uno de 844, ~130. El `FOOTER_BUDGET` ya reservó la barra de destinos.
 */
const STAGE_FRACTION = 0.72

/**
 * Alto que se le RESERVA a la barra inferior antes de repartir el resto: la fila de destinos (64) +
 * el secundario de Facebook (36) + paddings ⇒ ~132, con holgura 140. Sin esta reserva el lienzo se
 * calcula contra la pantalla entera y la fila de destinos se sale por abajo.
 */
const FOOTER_BUDGET = 140

/**
 * Vida del aviso in-composer. Los mismos 4 s del `<Toaster />` de la app: es el reemplazo del toast
 * en esta ventana, no un componente nuevo con su propia idea del tiempo.
 *
 * Se cuentan SOLO con la app en primer plano (ver el efecto del `notice`): la mitad de los avisos
 * nacen justo cuando la pantalla se va a Instagram o WhatsApp.
 */
const NOTICE_MS = 4000

// ── Composer ─────────────────────────────────────────────────────────────────────────────────────

export function WorkoutShareComposer({ visible, onClose, data, embedded = false }: WorkoutShareComposerProps) {
    const insets = useSafeAreaInsets()
    const { width: screenW, height: screenH } = useWindowDimensions()
    const canvasRef = useRef<View>(null)

    /** Posición y escala VIVAS del bloque. Arrancan en las de fábrica y solo las mueve el alumno. */
    const [layout, setLayout] = useState<Record<StickerId, StickerState>>(() => cloneStickerLayout(SHARE_LAYOUT))
    const [background, setBackground] = useState<ComposerBackground>(SHARE_LAYOUT.background)
    const [photoUri, setPhotoUri] = useState<string | null>(null)
    /** De dónde salió la foto — solo para que el chip correcto se vea seleccionado. */
    const [photoSource, setPhotoSource] = useState<'camera' | 'library' | null>(null)

    /**
     * Qué destino está corriendo (o `null`). Es el target y no un booleano porque hay cuatro botones
     * a la vez: con un `busy` plano los cuatro mostrarían spinner y el alumno no sabría cuál apretó.
     * Deshabilitar TODOS mientras uno corre sí es correcto — una segunda captura en paralelo
     * pelearía por el mismo `canvasRef` y por el mismo nombre de archivo.
     */
    const [busyTarget, setBusyTarget] = useState<ShareTarget | null>(null)
    const busy = busyTarget !== null
    const [cameraPrimer, setCameraPrimer] = useState(false)
    const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions()

    /**
     * Aviso VISIBLE del composer.
     *
     * No se usa `toast` acá: el composer vive dentro de una ventana nativa ajena (el Modal del
     * resumen, o el suyo) y el `<Toaster />` está montado una sola vez en el árbol raíz, así que
     * cada toast se pintaba DETRÁS y el alumno no veía nada — ese era el «Guardar no avisa» del
     * reporte. Este banner se monta dentro del composer, o sea en la misma ventana.
     *
     * Lleva un `id` incremental y no solo el aviso: las copias son constantes de módulo, así que
     * guardar dos veces seguidas mostraría el MISMO objeto, `setState` cortaría por igualdad y el
     * banner no reiniciaría su cuenta de 4 s — se apagaría a mitad del segundo guardado.
     */
    const [notice, setNotice] = useState<{ id: number; value: ShareNotice } | null>(null)
    const noticeSeq = useRef(0)

    const showNotice = useCallback((value: ShareNotice | null | undefined) => {
        if (!value) return
        noticeSeq.current += 1
        setNotice({ id: noticeSeq.current, value })
    }, [])

    /**
     * Los 4 s corren SOLO con la app activa.
     *
     * El caso que lo motiva es el de Stories: `RNShare.shareSingle` resuelve en el instante en que
     * se lanza el intent —no cuando el alumno vuelve—, así que «Link copiado — pégalo en el sticker
     * Link» aparecía con la app ya en background. En Android los timers vencidos se disparan apenas
     * el foco vuelve, o sea que el banner se limpiaba en el primer frame del regreso y el alumno
     * nunca leía la única instrucción que hace funcionar el link. Igual pasa con «Guardada en tu
     * galería» si el alumno se va a mirar el carrete.
     *
     * Por eso el timer se desarma al salir y se REARMA entero al volver: el aviso se lee al
     * regresar, que es cuando hay alguien mirando.
     *
     * `announceForAccessibility` es para iOS: `accessibilityLiveRegion` (abajo, en el banner) es
     * solo Android, así que sin esto VoiceOver no anuncia nada. Va acá y no en el banner para que
     * salga una sola vez por aviso.
     */
    useEffect(() => {
        if (!notice) return
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice.value.text)

        let timer: ReturnType<typeof setTimeout> | null = null
        const disarm = () => {
            if (timer) clearTimeout(timer)
            timer = null
        }
        const arm = () => {
            disarm()
            timer = setTimeout(() => setNotice(null), NOTICE_MS)
        }

        if (AppState.currentState === 'active') arm()
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') arm()
            else disarm()
        })
        return () => {
            disarm()
            sub.remove()
        }
    }, [notice])

    // Medida real del bloque montado: la reporta el lienzo (es el único que la conoce) y la consume
    // la capa de gestos para calcar su zona de arrastre encima del bloque.
    const [stickerSizes, setStickerSizes] = useState<Partial<Record<StickerId, StickerSize>>>({})
    /** Destino VIVO del arrastre/pellizco. Lo escribe la capa de gestos, lo lee el lienzo. */
    const liveTransform = useSharedValue(idleStickerTransform())

    const tokens = useMemo(() => deriveSportTokens(data.brand.accent), [data.brand.accent])
    const accent = accentOf(tokens)
    const s = EXEC_SURFACE

    // Un aviso de la sesión anterior no tiene por qué recibir al alumno al reabrir el composer. El
    // RESTO del estado se conserva a propósito (foto, posición del bloque) — si cerró sin querer, no
    // le borramos la edición.
    useEffect(() => {
        if (!visible) return
        setNotice(null)
    }, [visible])

    // ── Geometría del lienzo ────────────────────────────────────────────────────────────────────
    // El cap de ancho es `pantalla − 48` (mockup), pero manda el ALTO: el card es 9:16 y a ancho
    // completo mide ~1,6 pantallas de alto, así que sin este budget no quedaría dónde poner los
    // controles.
    const chromeH = insets.top + insets.bottom + HEADER_H + FOOTER_BUDGET
    const bodyH = Math.max(280, screenH - chromeH)
    const canvasW = Math.min(screenW - 48, (bodyH * STAGE_FRACTION * SHARE_CANVAS_W) / SHARE_CANVAS_H)
    // La MISMA expresión que usa `ShareCanvas` internamente, sin redondear: un `Math.round` acá deja
    // medio píxel de desfase y el wrapper con `overflow:'hidden'` recorta una línea del card.
    const canvasH = (canvasW * SHARE_CANVAS_H) / SHARE_CANVAS_W

    // ── Acciones ────────────────────────────────────────────────────────────────────────────────

    const setStickerPosition = useCallback((x: number, y: number) => {
        setLayout((prev) => ({ ...prev, bloque: { ...prev.bloque, x, y } }))
    }, [])

    const setStickerScale = useCallback((scale: number) => {
        setLayout((prev) => {
            if (prev.bloque.scale === scale) return prev
            return { ...prev, bloque: { ...prev.bloque, scale } }
        })
    }, [])

    /**
     * Apagar el destino vivo cuando la posición commiteada ya está en pantalla.
     *
     * Se hace acá y no en el worklet a propósito: el UI thread resetea al instante y React tarda uno
     * o dos frames, así que el bloque volvía a su lugar viejo antes de saltar al nuevo. Cuando este
     * efecto corre, el render con la posición nueva ya se aplicó y el desplazamiento vivo vale 0 por
     * cálculo (`liveDeltaFor` compara contra el estado pintado), así que apagarlo no se ve.
     */
    useEffect(() => {
        liveTransform.value = idleStickerTransform()
    }, [layout, liveTransform])

    const applyPhoto = useCallback((uri: string | null, source: 'camera' | 'library' | null) => {
        // F7.2 — solo DE DÓNDE salió la foto, jamás la foto ni nada de ella. `library` se traduce a
        // `gallery` porque esa es la palabra de la taxonomía del PLAN (el nombre interno viene de
        // `expo-image-picker`), y "sin foto" también es una elección que hay que poder medir.
        captureAppEvent('student_share_photo_attached', {
            photo_source: uri ? (source === 'camera' ? 'camera' : 'gallery') : 'none',
        })
        setPhotoUri(uri)
        setPhotoSource(uri ? source : null)
        setBackground(uri ? 'photo' : 'brand')
    }, [])

    const openCamera = useCallback(async () => {
        const uri = await takeSharePhoto()
        if (uri) applyPhoto(uri, 'camera')
    }, [applyPhoto])

    const onPressCamera = useCallback(() => {
        // App Review 5.1.1(iv): la hoja de permisos del sistema NO puede ser lo primero que ve el
        // usuario — primero explicamos para qué usamos la cámara y él aprieta "Continuar" (mismo
        // patrón que `nutrition-v2/scanner.tsx`, y mismo rechazo que ya nos costó una revisión).
        if (!cameraPermission?.granted) {
            setCameraPrimer(true)
            return
        }
        void openCamera()
    }, [cameraPermission?.granted, openCamera])

    const continueFromPrimer = useCallback(async () => {
        setCameraPrimer(false)
        // Pedimos por el HOOK (no por el helper) para que su estado quede fresco: `takeSharePhoto`
        // pide por su cuenta, pero el hook no se entera y el panel pre-permiso volvería a aparecer
        // la próxima vez aunque el permiso ya esté concedido. Concedido acá, el request del helper
        // resuelve solo, sin segundo diálogo.
        const res = await requestCameraPermission()
        if (!res.granted) {
            showNotice(CAMERA_DENIED_NOTICE)
            return
        }
        await openCamera()
    }, [requestCameraPermission, openCamera, showNotice])

    const openGallery = useCallback(async () => {
        const uri = await pickSharePhoto()
        if (uri) applyPhoto(uri, 'library')
    }, [applyPhoto])

    /**
     * Captura + destino.
     *
     * UNA captura POR TAP, nunca precapturada: el alumno puede mover el bloque o cambiar la foto
     * entre destino y destino, y un PNG guardado de antes compartiría un card viejo. Rasterizar
     * cuesta ~100 ms; equivocarse de imagen cuesta el share entero.
     *
     * El evento de analytics sale ANTES de capturar, no después: mide la INTENCIÓN del alumno
     * («toqué Stories»), que es lo único honesto — ninguna plataforma informa si terminó publicando
     * (mismo límite que documenta F0.2), y si la captura falla igual queremos saber que lo intentó.
     *
     * Toda la lógica por destino vive en `share-targets.ts` y ninguna de esas funciones lanza ni
     * pinta: devuelven `outcome` + `notice` y ACÁ se muestra. `fallback` no es un error —el alumno
     * pidió Stories, no tenía Instagram y se le abrió la hoja nativa— pero tampoco puede ser mudo,
     * que era el bug: la pantalla cambiaba sin explicación y se leía como «no hizo nada». Va como
     * aviso ámbar, no rojo.
     */
    const runTarget = useCallback(
        async (target: ShareTarget) => {
            if (busy) return
            setBusyTarget(target)
            setNotice(null)
            captureAppEvent('student_share_target_selected', { target })
            let uri: string | null = null
            try {
                try {
                    uri = await captureShareCanvas(canvasRef, {
                        fileName: `eva-entreno-${data.dateISO}`,
                        // El composer ya no ofrece el modo sticker: el card siempre viaja con fondo
                        // (foto o marca). El motor conserva la rama por si vuelve.
                        transparent: false,
                    })
                } catch {
                    showNotice(CAPTURE_FAILED_NOTICE)
                    return
                }
                haptics.tap()

                const result = await runShareTarget(target, {
                    fileUri: uri,
                    transparent: false,
                    accent,
                    inviteUrl: data.inviteUrl,
                })
                // El destino ya redactó su aviso (sabe si guardó, si cayó a la hoja o si el permiso
                // estaba negado). El genérico es solo la red: un `error` que llegó sin copy propio.
                showNotice(result.notice ?? (result.outcome === 'error' ? SHARE_FAILED_NOTICE : null))
            } finally {
                // Privacidad (PLAN §Privacidad): el PNG puede llevar una foto personal del alumno y
                // no tiene por qué sobrevivir en caché. Se borra recién acá porque las dos
                // plataformas resuelven DESPUÉS de que la app destino terminó de leer el archivo.
                await cleanupShareCapture(uri)
                setBusyTarget(null)
            }
        },
        [busy, data.dateISO, data.inviteUrl, accent, showNotice],
    )

    // Sin Modal propio no hay `onRequestClose`, así que el back físico de Android hay que atajarlo a
    // mano. Con una sola pantalla no hay paso al que volver: el back CIERRA el composer (y no el
    // resumen que está detrás, por eso devuelve `true`). Bloqueado mientras hay una captura en
    // curso: salir a mitad deja el PNG temporal sin limpiar.
    useEffect(() => {
        if (!embedded || !visible) return
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!busy) onClose()
            return true
        })
        return () => sub.remove()
    }, [embedded, visible, busy, onClose])

    // ── Render ──────────────────────────────────────────────────────────────────────────────────

    const body = (
        // `GestureHandlerRootView` y no `View`: es drop-in (no agrega nodo ni cambia layout) y sin
        // él el lienzo no recibe UN SOLO toque. Los dos caminos de montaje del composer viven en una
        // ventana NATIVA ajena — el `<Modal>` de abajo, o el Modal del host cuando se usa
        // `embedded` — y el root de `app/_layout.tsx` no alcanza esas ventanas. Es el mismo fix que
        // documenta `components/Sheet.tsx` para el slider del ejecutor.
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: s.appBgDeep }}>
            <ComposerHeader onClose={onClose} canClose={!busy} />

            <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                {/* +2 de ancho/alto por el borde: con `borderWidth:1` la caja de contenido mide
                    `width - 2`, así que a medida exacta el wrapper le recortaba un píxel de cada
                    lado al lienzo. El redondeado y el borde son CHROME: viven fuera del nodo
                    capturado, y por eso el PNG sale full-bleed y cuadrado aunque el preview se vea
                    con esquinas suaves. */}
                <View
                    style={{
                        width: canvasW + 2,
                        height: canvasH + 2,
                        borderRadius: 20,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: s.border,
                    }}
                >
                    {/* EL NODO CAPTURADO. `collapsable={false}` para que Android no lo fusione con
                        su padre: `captureRef` se quedaría sin nodo que rasterizar (o rasterizaría el
                        padre entero, chrome incluido). Requisito documentado en `share-capture.ts`. */}
                    <View ref={canvasRef} collapsable={false}>
                        <ShareCanvas
                            data={data}
                            stickers={layout}
                            background={background}
                            photoUri={photoUri}
                            width={canvasW}
                            tokens={tokens}
                            reportSizes={setStickerSizes}
                            liveTransform={liveTransform}
                        />
                    </View>

                    {/* Capa de edición: hermana del nodo capturado, NUNCA hija. Todo lo que dibuja
                        (marco punteado, guías) es chrome y no puede salir en el PNG. */}
                    <StickerGestureLayer
                        width={canvasW}
                        height={canvasH}
                        state={layout.bloque}
                        size={stickerSizes.bloque}
                        live={liveTransform}
                        accent={accent}
                        onCommitPosition={setStickerPosition}
                        onCommitScale={setStickerScale}
                    />
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingHorizontal: 20,
                    }}
                >
                    <Move size={15} color={s.textDim} />
                    <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 17, color: s.textDim }}>
                        Arrastra el bloque · pellizca para el tamaño
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
                    <SourceChip
                        icon={Camera}
                        label="Tomar"
                        active={photoSource === 'camera'}
                        accent={accent}
                        onPress={onPressCamera}
                    />
                    <SourceChip
                        icon={Images}
                        label="Galería"
                        active={photoSource === 'library'}
                        accent={accent}
                        onPress={() => void openGallery()}
                    />
                    <SourceChip
                        icon={ImageOff}
                        label="Sin foto"
                        active={!photoUri}
                        accent={accent}
                        onPress={() => applyPhoto(null, null)}
                    />
                </View>

                {/* El aviso va anclado abajo y en absoluto: así queda siempre pegado encima de la
                    barra de destinos sin empujarla — un banner que desplaza los botones 44 px justo
                    cuando el alumno vuelve a tocar es un mis-tap garantizado. */}
                {notice ? <ComposerNotice notice={notice.value} /> : null}
            </View>

            <View
                style={{
                    paddingHorizontal: 20,
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderTopWidth: 1,
                    borderTopColor: s.borderSubtle,
                    backgroundColor: s.appBg,
                }}
            >
                <ShareTargetsBar
                    accent={accent}
                    busyTarget={busyTarget}
                    busy={busy}
                    onTarget={(target) => void runTarget(target)}
                />
            </View>

            {/* Panel pre-permiso de cámara. Va al final del árbol (encima de todo) y tapa el
                composer: el alumno lee para qué usamos la cámara ANTES de que aparezca el diálogo
                del sistema — App Review 5.1.1(iv). El botón dice "Continuar", NUNCA "Permitir
                cámara". */}
            {cameraPrimer ? (
                <CameraPrimer
                    accent={accent}
                    onContinue={() => void continueFromPrimer()}
                    onCancel={() => setCameraPrimer(false)}
                />
            ) : null}
        </GestureHandlerRootView>
    )

    if (embedded) {
        if (!visible) return null
        return (
            <View
                style={[
                    StyleSheet.absoluteFillObject,
                    {
                        zIndex: 50,
                        elevation: 50,
                        backgroundColor: s.appBgDeep,
                        paddingTop: insets.top,
                        paddingBottom: insets.bottom,
                    },
                ]}
            >
                {body}
            </View>
        )
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            {/* SafeAreaProvider DENTRO del Modal: en Android la ventana del Modal es otra y sin
                proveedor propio los insets llegan en 0 (mismo patrón que `SessionCompleteV3`). */}
            <SafeAreaProvider>
                <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: s.appBgDeep }}>
                    {body}
                </SafeAreaView>
            </SafeAreaProvider>
        </Modal>
    )
}

// ── Piezas del chrome ────────────────────────────────────────────────────────────────────────────

/**
 * Barra superior: el título y la salida. Sin flecha de volver ni puntos de paso — con una sola
 * pantalla, un back que hiciera lo mismo que la X sería un segundo botón para la misma acción.
 */
function ComposerHeader({ onClose, canClose }: { onClose: () => void; canClose: boolean }) {
    const s = EXEC_SURFACE
    return (
        <View
            style={{
                height: HEADER_H,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 8,
                gap: 8,
            }}
        >
            {/* Contrapeso de la X para que el título quede centrado de verdad. */}
            <View style={{ width: 40 }} />
            <Text
                style={{ flex: 1, textAlign: 'center', fontFamily: FONT.displayBold, fontSize: 15, color: s.text }}
                numberOfLines={1}
            >
                Compartir entreno
            </Text>
            {/* Se bloquea mientras hay una captura en curso: cerrar a mitad deja el PNG temporal sin
                limpiar. */}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sin compartir"
                onPress={onClose}
                disabled={!canClose}
                hitSlop={10}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canClose ? 1 : 0.4 }}
            >
                <X size={20} color={s.textMuted} />
            </Pressable>
        </View>
    )
}

/**
 * El aviso del composer: el toast que el alumno SÍ puede ver.
 *
 * No se reusa `components/Toast.tsx` porque su `<Toaster />` es un singleton montado en el árbol
 * raíz de la app, y este composer siempre vive dentro de una ventana nativa ajena — el Modal del
 * resumen post-entreno cuando va `embedded`, o el suyo propio. Cada `toast.*()` disparado desde acá
 * se pintaba detrás de esa ventana: invisible. Montar un segundo `<Toaster />` no sirve (los dos
 * comparten la misma cola global y el aviso saldría igual en la raíz), así que el banner es propio.
 *
 * Tres tonos con el mismo peso visual: el ícono lleva el color, la superficie no. Un fallback («no
 * pudimos abrir Instagram, te abrimos las opciones») pintado de rojo entero le diría al alumno que
 * algo se rompió cuando en realidad puede seguir compartiendo.
 */
function ComposerNotice({ notice }: { notice: ShareNotice }) {
    const s = EXEC_SURFACE
    const { Icon, color } =
        notice.kind === 'ok'
            ? { Icon: CircleCheck, color: '#1FB877' } // DS success-500
            : notice.kind === 'warn'
              ? { Icon: TriangleAlert, color: '#F5A524' } // DS warning-500
              : { Icon: OctagonX, color: '#F4365A' } // DS danger-500

    return (
        <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 160 }}
            // `polite` y no `assertive`: es confirmación de algo que el alumno acaba de pedir, no
            // una interrupción. Es una prop SOLO de Android; en iOS el anuncio lo hace el efecto del
            // `notice` con `AccessibilityInfo.announceForAccessibility`.
            accessibilityLiveRegion="polite"
            style={{
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: s.surfaceRaised,
                borderWidth: 1,
                borderColor: s.borderStrong,
            }}
        >
            <Icon size={18} color={color} />
            <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 13, lineHeight: 18, color: s.text }}>
                {notice.text}
            </Text>
        </MotiView>
    )
}

function SourceChip({
    icon: Icon,
    label,
    active,
    accent,
    onPress,
}: {
    icon: LucideIcon
    label: string
    active: boolean
    accent: string
    onPress: () => void
}) {
    const s = EXEC_SURFACE
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={onPress}
            style={{
                flex: 1,
                minHeight: 46,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: active ? accent : s.border,
                backgroundColor: active ? withAlpha(accent, 0.14) : s.surface,
            }}
        >
            <Icon size={16} color={active ? accent : s.textMuted} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: active ? s.text : s.textMuted }}>
                {label}
            </Text>
        </Pressable>
    )
}

function PrimaryButton({
    label,
    icon: Icon,
    accent,
    busy,
    onPress,
}: {
    label: string
    icon?: LucideIcon
    accent: string
    busy?: boolean
    onPress: () => void
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={busy}
            onPress={onPress}
            style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                borderRadius: 16,
                backgroundColor: accent,
                opacity: busy ? 0.6 : 1,
            }}
        >
            {/* El spinner reemplaza SOLO el ícono; el label se queda (mismo criterio que ShareCard). */}
            {busy ? <ActivityIndicator color="#FFFFFF" /> : Icon ? <Icon size={18} color="#FFFFFF" /> : null}
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 15, color: '#FFFFFF' }}>{label}</Text>
        </Pressable>
    )
}

/**
 * Los destinos (F5.4).
 *
 * Cuatro botones EXPLÍCITOS y no una hoja genérica, por lo que manda el SPEC (§Flujo paso 4): el
 * salto directo a Stories no existe dentro de la hoja nativa, y estos botones son la única medición
 * fiable del target (Android no reporta a qué app fue el share).
 *
 * ── JERARQUÍA ──
 * `Stories` va con el acento del coach porque es el destino que mueve el loop de growth (la story es
 * lo que ve la audiencia del alumno); los otros tres van en superficie neutra. Facebook Stories NO
 * entra en la fila: el SPEC lista exactamente cuatro destinos y meter un quinto deja cada botón en
 * ~57 px, donde "WhatsApp" ya no entra en una línea en un teléfono de 360 dp. Va abajo como
 * secundario de texto, y SOLO si el binario trae App ID — sin ID, Facebook degradaría a la misma
 * hoja nativa que ya ofrece «Más…» y sería un botón que miente.
 *
 * Los cuatro se deshabilitan mientras uno corre (dos capturas en paralelo pelean por el mismo
 * `canvasRef` y el mismo nombre de archivo), pero el spinner lo muestra SOLO el que se tocó.
 */
function ShareTargetsBar({
    accent,
    busyTarget,
    busy,
    onTarget,
}: {
    accent: string
    busyTarget: ShareTarget | null
    busy: boolean
    onTarget: (target: ShareTarget) => void
}) {
    const s = EXEC_SURFACE
    return (
        <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TargetButton
                    label="Stories"
                    accessibilityLabel="Compartir en tus historias de Instagram"
                    primary
                    accent={accent}
                    busy={busyTarget === 'ig_stories'}
                    disabled={busy}
                    onPress={() => onTarget('ig_stories')}
                    renderIcon={(color) => <InstagramGlyph color={color} size={20} />}
                />
                <TargetButton
                    label="WhatsApp"
                    accessibilityLabel="Compartir por WhatsApp"
                    accent={accent}
                    busy={busyTarget === 'whatsapp'}
                    disabled={busy}
                    onPress={() => onTarget('whatsapp')}
                    renderIcon={(color) => <WhatsappGlyph color={color} size={20} />}
                />
                <TargetButton
                    label="Guardar"
                    accessibilityLabel="Guardar la imagen en tu galería"
                    accent={accent}
                    busy={busyTarget === 'save'}
                    disabled={busy}
                    onPress={() => onTarget('save')}
                    renderIcon={(color) => <Download size={20} color={color} />}
                />
                <TargetButton
                    label="Más…"
                    accessibilityLabel="Compartir en otra aplicación"
                    accent={accent}
                    busy={busyTarget === 'sheet'}
                    disabled={busy}
                    onPress={() => onTarget('sheet')}
                    renderIcon={(color) => <Share2 size={20} color={color} />}
                />
            </View>

            {hasFacebookAppId() ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Compartir en tus historias de Facebook"
                    disabled={busy}
                    onPress={() => onTarget('fb_stories')}
                    style={{
                        minHeight: 36,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        opacity: busy ? 0.45 : 1,
                    }}
                >
                    {busyTarget === 'fb_stories' ? (
                        <ActivityIndicator color={s.textMuted} size="small" />
                    ) : (
                        <FacebookGlyph color={s.textMuted} size={14} />
                    )}
                    <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12.5, color: s.textMuted }}>
                        También en Facebook Stories
                    </Text>
                </Pressable>
            ) : null}
        </View>
    )
}

function TargetButton({
    label,
    accessibilityLabel,
    accent,
    primary,
    busy,
    disabled,
    onPress,
    renderIcon,
}: {
    label: string
    accessibilityLabel: string
    accent: string
    primary?: boolean
    busy?: boolean
    disabled?: boolean
    onPress: () => void
    /**
     * El ícono se pide por función y no como nodo porque su color depende de la variante: sobre el
     * acento va blanco, sobre la superficie neutra va el texto del chrome. Pasarlo ya construido
     * obligaría a cada call site a repetir esa decisión.
     */
    renderIcon: (color: string) => ReactNode
}) {
    const s = EXEC_SURFACE
    const fg = primary ? '#FFFFFF' : s.text
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            onPress={onPress}
            style={{
                flex: 1,
                minHeight: 64,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 4,
                borderRadius: 16,
                backgroundColor: primary ? accent : s.surface,
                borderWidth: primary ? 0 : 1,
                borderColor: s.border,
                opacity: disabled ? 0.45 : 1,
            }}
        >
            {/* El spinner reemplaza al ícono y el label se queda: mismo criterio que `PrimaryButton`
                (si desaparece el texto, el botón deja de decir qué está haciendo). */}
            {busy ? <ActivityIndicator color={fg} size="small" /> : renderIcon(fg)}
            {/* `adjustsFontSizeToFit` no existe en Android para texto multilínea y "WhatsApp" es la
                etiqueta más larga: una sola línea + `numberOfLines` evita que el botón crezca en un
                teléfono angosto y desalinee la fila. */}
            <Text
                numberOfLines={1}
                style={{ fontFamily: FONT.uiBold, fontSize: 10.5, letterSpacing: 0.1, color: fg }}
            >
                {label}
            </Text>
        </Pressable>
    )
}

function CameraPrimer({
    accent,
    onContinue,
    onCancel,
}: {
    accent: string
    onContinue: () => void
    onCancel: () => void
}) {
    const s = EXEC_SURFACE
    return (
        <View
            style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 28 },
            ]}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 340,
                    borderRadius: 20,
                    padding: 22,
                    gap: 12,
                    backgroundColor: s.surface,
                    borderWidth: 1,
                    borderColor: s.border,
                }}
            >
                <View
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: withAlpha(accent, 0.16),
                    }}
                >
                    <Camera size={20} color={accent} />
                </View>
                <Text style={{ fontFamily: FONT.displayBold, fontSize: 17, color: s.text }}>
                    Ponle tu foto al entreno
                </Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 13, lineHeight: 19, color: s.textMuted }}>
                    Usamos la cámara solo para tomar la foto de tu card. La imagen se arma en tu teléfono y no se
                    sube a ningún servidor. También puedes elegir una de tu galería o compartir sin foto.
                </Text>
                <PrimaryButton label="Continuar" accent={accent} onPress={onContinue} />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ahora no"
                    onPress={onCancel}
                    style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 14, color: s.textMuted }}>Ahora no</Text>
                </Pressable>
            </View>
        </View>
    )
}
