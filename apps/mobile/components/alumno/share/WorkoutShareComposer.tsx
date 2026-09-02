import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
    AccessibilityInfo,
    ActivityIndicator,
    AppState,
    BackHandler,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { MotiView } from 'moti'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
    ArrowLeft,
    Camera,
    CircleCheck,
    Download,
    ImageOff,
    Images,
    Minus,
    Move,
    OctagonX,
    Plus,
    RotateCcw,
    Share2,
    TriangleAlert,
    X,
    type LucideIcon,
} from 'lucide-react-native'
import { deriveSportTokens, type SportTokens } from '@eva/brand-kit'
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
import {
    cloneStickerLayout,
    DEFAULT_SHARE_PRESET_ID,
    SHARE_PRESET_BY_ID,
    SHARE_PRESETS,
} from './share-presets'
import { captureShareCanvas, cleanupShareCapture } from './share-capture'
import { pickSharePhoto, takeSharePhoto } from './share-photo'
import { accentOf, withAlpha } from './stickers'
import { StickerGestureLayer, STICKER_LABEL } from './StickerGestureLayer'
import {
    idleStickerTransform,
    maxScaleFor,
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    STICKER_SCALE_MAX,
    STICKER_SCALE_MIN,
    type MuscleView,
    type ShareBackground,
    type SharePreset,
    type SharePresetId,
    type StickerId,
    type StickerSize,
    type StickerState,
    type WorkoutShareData,
} from './share-types'

/**
 * Share Entreno (F3) — el COMPOSER: la pantalla donde el alumno arma su card.
 *
 * Tres pasos (`editor` → `acomodar` → `compartir`) sobre UN solo lienzo montado: el `ShareCanvas`
 * vive en la "etapa" superior y NUNCA se desmonta al cambiar de paso. Es a propósito: el canvas
 * mide sus stickers con `onLayout` para anclarlos por el centro, y remontarlo en cada paso
 * significaría re-medir (parpadeo) y, peor, arriesgar una captura sobre un árbol a medio medir
 * (`share-capture.ts` documenta que capturar en el tick del montaje sale en blanco).
 *
 * ── QUÉ ES CHROME Y QUÉ ES CARD ──
 * Todo lo que se vea DENTRO del View con el ref (`canvasRef`) sale en el PNG. Por eso el chrome de
 * cada paso (header, fila de presets, toggles, botones) vive FUERA de ese View, y hasta el
 * redondeado del preview lo aplica el wrapper de arriba: el canvas se rasteriza full-bleed y
 * cuadrado, mientras en pantalla se ve con esquinas suaves. `captureRef` dibuja el subárbol del
 * nodo, no el recorte de su padre.
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

type Step = 'editor' | 'acomodar' | 'compartir'

const STEP_ORDER: Step[] = ['editor', 'acomodar', 'compartir']
const STEP_TITLE: Record<Step, string> = {
    editor: 'Editar',
    acomodar: 'Acomodar',
    compartir: 'Compartir',
}

/**
 * Fracción del alto disponible que puede ocupar el lienzo en cada paso. El editor le cede espacio a
 * los controles (presets + fuente de foto + 10 toggles no entran si el preview se come la pantalla);
 * `acomodar` deja ~150 px para el panel del sticker seleccionado (tamaño, flip de silueta,
 * restaurar) sin que el lienzo se coma la pantalla en un teléfono chico.
 *
 * `compartir` bajó de 0,88 a 0,72 al entrar F5: cuando el paso era un botón único el card podía
 * ocupar casi todo (era el momento de decidir "¿me gusta?"), pero ahora abajo hay una fila de cuatro
 * destinos con ícono + etiqueta (~64 px) más el secundario de Facebook. Con 0,88 esa fila quedaba
 * pegada al borde inferior en un teléfono chico y el hint no entraba.
 */
const STAGE_FRACTION: Record<Step, number> = { editor: 0.52, acomodar: 0.62, compartir: 0.72 }

/**
 * Vida del aviso in-composer. Los mismos 4 s del `<Toaster />` de la app: es el reemplazo del toast
 * en esta ventana, no un componente nuevo con su propia idea del tiempo.
 *
 * Se cuentan SOLO con la app en primer plano (ver el efecto del `notice`): la mitad de los avisos
 * nacen justo cuando la pantalla se va a Instagram o WhatsApp.
 */
const NOTICE_MS = 4000

/**
 * Alto que se le RESERVA a la barra inferior antes de repartir el resto. `editor` y `acomodar`
 * llevan un botón «Continuar» (52 px + paddings ⇒ 76, con holgura a 92); `compartir` lleva la fila
 * de destinos (64) + el secundario de Facebook (36) + paddings ⇒ ~132. Sin esta distinción el paso
 * Compartir calculaba el lienzo contra un presupuesto de barra que ya no era el suyo y la fila se
 * salía de la pantalla en teléfonos de 640 px de alto.
 */
const FOOTER_BUDGET: Record<Step, number> = { editor: 92, acomodar: 92, compartir: 140 }

/** Ancho del mini-canvas de cada chip de preset. */
const THUMB_W = 68

// ── Helpers de estado ────────────────────────────────────────────────────────────────────────────

/** Los toggles que el alumno cambió EXPLÍCITAMENTE; sobreviven al cambio de preset. */
type VisibilityOverrides = Partial<Record<StickerId, boolean>>

/**
 * Layout de fábrica del preset + los toggles explícitos del alumno encima.
 *
 * Decisión del owner (SPEC §Flujo, paso 3): cambiar de preset RESETEA POSICIONES y CONSERVA los
 * toggles. Por eso el layout se re-clona del preset nuevo (posiciones/escala/rotación de fábrica) y
 * después se re-aplican los `visible` que el alumno tocó — y solo esos: un sticker que nunca tocó
 * usa el default del preset nuevo, que es lo que hace que cada preset "se vea bien de fábrica".
 */
function applyOverrides(preset: SharePreset, overrides: VisibilityOverrides): Record<StickerId, StickerState> {
    const layout = cloneStickerLayout(preset)
    for (const key of Object.keys(overrides) as StickerId[]) {
        const wanted = overrides[key]
        if (wanted === undefined) continue
        layout[key] = { ...layout[key], visible: wanted }
    }
    return layout
}

/**
 * Overrides iniciales: el QR arranca APAGADO siempre.
 *
 * SPEC §Growth: "QR OFF por defecto; solo disponible en la variante «Guardar»" — un QR es
 * inescaneable en una story vista desde el mismo teléfono. El preset `sello` lo trae encendido de
 * fábrica (tiene el hueco de sobra), así que apagarlo tiene que ser un OVERRIDE y no un parche al
 * catálogo: sembrado acá, sobrevive al cambio de preset igual que cualquier decisión del alumno, y
 * si él lo enciende el override se da vuelta y también sobrevive.
 */
const INITIAL_OVERRIDES: VisibilityOverrides = { qr: false }

// ── Composer ─────────────────────────────────────────────────────────────────────────────────────

export function WorkoutShareComposer({ visible, onClose, data, embedded = false }: WorkoutShareComposerProps) {
    const insets = useSafeAreaInsets()
    const { width: screenW, height: screenH } = useWindowDimensions()
    const canvasRef = useRef<View>(null)

    const [step, setStep] = useState<Step>('editor')
    const [presetId, setPresetId] = useState<SharePresetId>(DEFAULT_SHARE_PRESET_ID)
    const [layout, setLayout] = useState<Record<StickerId, StickerState>>(() =>
        applyOverrides(SHARE_PRESET_BY_ID[DEFAULT_SHARE_PRESET_ID], INITIAL_OVERRIDES),
    )

    /**
     * Los overrides y los flags `touched` viven en REFS, no en estado: son MEMORIA, no entrada de
     * render — lo que la UI dibuja es `layout`, que ya se actualiza en el mismo gesto. Tenerlos en
     * estado metía `overrides` en las dependencias de `selectPreset`, así que cada toggle cambiaba
     * la identidad del callback y repintaba los SEIS mini-canvas de la fila de presets (9 stickers
     * y hasta una silueta SVG cada uno) por marcar una casilla. Con refs los callbacks del editor
     * quedan estables y los chips solo se repintan cuando cambia la selección.
     */
    const overridesRef = useRef<VisibilityOverrides>(INITIAL_OVERRIDES)
    const presetIdRef = useRef<SharePresetId>(DEFAULT_SHARE_PRESET_ID)
    // `muscleView` y `background` arrancan en el default del preset, pero una vez que el alumno los
    // toca pasan a ser SUYOS y el cambio de preset ya no los pisa — misma regla que los toggles
    // (son dos de los 10 toggles del SPEC). El flag `touched` es lo que distingue "default heredado"
    // de "elección del alumno"; sin él, elegir Heatmap le borraba la foto que acababa de sacar.
    const muscleViewTouchedRef = useRef(false)
    const backgroundTouchedRef = useRef(false)

    const preset = SHARE_PRESET_BY_ID[presetId]

    const [muscleView, setMuscleViewState] = useState<MuscleView>(preset.muscleView)
    const [background, setBackground] = useState<ShareBackground>(preset.background)
    const [photoUri, setPhotoUri] = useState<string | null>(null)
    /** De dónde salió la foto — solo para que el chip correcto se vea seleccionado. */
    const [photoSource, setPhotoSource] = useState<'camera' | 'library' | null>(null)
    const [showHandle, setShowHandle] = useState(true)

    /**
     * Qué destino está corriendo (o `null`). Es el target y no un booleano porque el paso Compartir
     * tiene cuatro botones a la vez: con un `busy` plano los cuatro mostrarían spinner y el alumno
     * no sabría cuál apretó. Deshabilitar TODOS mientras uno corre sí es correcto — una segunda
     * captura en paralelo pelearía por el mismo `canvasRef` y por el mismo nombre de archivo.
     */
    const [busyTarget, setBusyTarget] = useState<ShareTarget | null>(null)
    const busy = busyTarget !== null
    const [cameraPrimer, setCameraPrimer] = useState(false)
    const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions()

    /**
     * Aviso VISIBLE del composer (G).
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

    // ── Paso Acomodar (F4) ──────────────────────────────────────────────────────────────────────
    // Medidas reales de los stickers montados: las reporta el lienzo (es el único que las conoce) y
    // las consume la capa de gestos para calcar cada zona de arrastre sobre su sticker.
    const [stickerSizes, setStickerSizes] = useState<Partial<Record<StickerId, StickerSize>>>({})
    const [selectedStickerId, setSelectedStickerId] = useState<StickerId | null>(null)
    /** Destino VIVO del arrastre/pellizco. Lo escribe la capa de gestos, lo lee el lienzo. */
    const liveTransform = useSharedValue(idleStickerTransform())

    const tokens = useMemo(() => deriveSportTokens(data.brand.accent), [data.brand.accent])
    const accent = accentOf(tokens)
    const s = EXEC_SURFACE

    // Volver a abrir el composer siempre arranca en el editor: cerrar desde "Compartir" y reabrir
    // para caer otra vez en el botón de compartir es desorientador. El RESTO del estado se conserva
    // a propósito (preset, foto, toggles) — si el alumno cerró sin querer, no le borramos la edición.
    useEffect(() => {
        if (!visible) return
        setStep('editor')
        // Un aviso de la sesión anterior no tiene por qué recibir al alumno al reabrir el composer.
        setNotice(null)
    }, [visible])

    // ── Geometría del lienzo ────────────────────────────────────────────────────────────────────
    // El cap de ancho es `pantalla − 48` (mockup), pero manda el ALTO: el card es 9:16 y a ancho
    // completo mide ~1,6 pantallas de alto, así que sin este budget el editor no tendría dónde
    // poner sus controles. En `compartir` el budget casi no recorta y el preview llega al cap.
    const chromeH = insets.top + insets.bottom + 52 /* header */ + FOOTER_BUDGET[step]
    const bodyH = Math.max(280, screenH - chromeH)
    const canvasW = Math.min(screenW - 48, (bodyH * STAGE_FRACTION[step] * SHARE_CANVAS_W) / SHARE_CANVAS_H)
    // La MISMA expresión que usa `ShareCanvas` internamente, sin redondear: un `Math.round` acá deja
    // medio píxel de desfase y el wrapper con `overflow:'hidden'` recorta una línea del card.
    const canvasH = (canvasW * SHARE_CANVAS_H) / SHARE_CANVAS_W

    // ── Acciones ────────────────────────────────────────────────────────────────────────────────

    const selectPreset = useCallback((id: SharePresetId) => {
        if (id === presetIdRef.current) return
        haptics.select()
        // F7.2 — solo el ID del estilo. Ningún dato del entreno viaja en analytics (21.719).
        captureAppEvent('student_share_style_selected', { style: id })
        presetIdRef.current = id
        const next = SHARE_PRESET_BY_ID[id]
        setPresetId(id)
        setLayout(applyOverrides(next, overridesRef.current))
        // Los defaults del preset nuevo solo entran donde el alumno todavía no decidió.
        if (!muscleViewTouchedRef.current) setMuscleViewState(next.muscleView)
        if (!backgroundTouchedRef.current) setBackground(next.background)
    }, [])

    const setStickerVisible = useCallback((id: StickerId, next: boolean) => {
        overridesRef.current = { ...overridesRef.current, [id]: next }
        setLayout((prev) => ({ ...prev, [id]: { ...prev[id], visible: next } }))
    }, [])

    /**
     * Commit de una posición arrastrada. NO es un override: las posiciones se resetean al cambiar
     * de preset (decisión del owner, SPEC §Flujo paso 3) y eso ya lo hace `selectPreset`, que
     * re-clona el layout del preset nuevo y solo re-aplica los `visible` que el alumno tocó.
     */
    const setStickerPosition = useCallback((id: StickerId, x: number, y: number) => {
        setLayout((prev) => ({ ...prev, [id]: { ...prev[id], x, y } }))
    }, [])

    const setStickerScale = useCallback((id: StickerId, scale: number) => {
        setLayout((prev) => {
            const cur = prev[id]
            if (!cur || cur.scale === scale) return prev
            return { ...prev, [id]: { ...cur, scale } }
        })
    }, [])

    /**
     * Stepper del panel: 0,1 por toque, redondeado para que el valor no acumule ruido flotante.
     *
     * El techo es el MISMO `maxScaleFor` que aplica el pellizco (medida real del sticker contra el
     * lienzo): si el stepper pudiera pasarlo, el botón «+» dejaría al héroe recortado justo donde el
     * pellizco se planta, y el alumno tendría dos topes distintos para la misma cosa.
     */
    const nudgeStickerScale = useCallback(
        (id: StickerId, delta: number) => {
            haptics.select()
            setLayout((prev) => {
                const cur = prev[id]
                if (!cur) return prev
                const raw = Math.round((cur.scale + delta) * 10) / 10
                const cap = maxScaleFor(cur.scale, stickerSizes[id], canvasW, canvasH, cur.rotation)
                const next = Math.min(cap, Math.max(STICKER_SCALE_MIN, raw))
                if (next === cur.scale) return prev
                return { ...prev, [id]: { ...cur, scale: next } }
            })
        },
        [stickerSizes, canvasW, canvasH],
    )

    /** Vuelve al lugar/tamaño de fábrica del preset VIGENTE (por ref: el callback queda estable). */
    const restoreStickerPlacement = useCallback((id: StickerId) => {
        haptics.select()
        const factory = SHARE_PRESET_BY_ID[presetIdRef.current].stickers[id]
        setLayout((prev) => ({
            ...prev,
            [id]: { ...prev[id], x: factory.x, y: factory.y, scale: factory.scale, rotation: factory.rotation },
        }))
    }, [])

    /** Mantener apretado sobre un sticker = quitarlo. Mismo camino que el toggle del editor. */
    const removeSticker = useCallback(
        (id: StickerId) => {
            setSelectedStickerId((cur) => (cur === id ? null : cur))
            setStickerVisible(id, false)
        },
        [setStickerVisible],
    )

    /**
     * Apagar el destino vivo cuando la posición commiteada ya está en pantalla.
     *
     * Se hace acá y no en el worklet a propósito: el UI thread resetea al instante y React tarda
     * uno o dos frames, así que el sticker volvía a su lugar viejo antes de saltar al nuevo. Cuando
     * este efecto corre, el render con la posición nueva ya se aplicó y el desplazamiento vivo vale
     * 0 por cálculo (`liveDeltaFor` compara contra el estado pintado), así que apagarlo no se ve.
     * También cubre el cambio de preset: si `layout` se re-clona, un destino viejo quedaría
     * arrastrando el sticker a una posición que ya no existe.
     */
    useEffect(() => {
        liveTransform.value = idleStickerTransform()
    }, [layout, liveTransform])

    // Salir de Acomodar suelta la selección: volver al editor con un marco punteado colgado sobre
    // un lienzo que ya no se puede tocar confunde. El cambio de preset también la suelta (las
    // posiciones se resetean y el sticker elegido se movió solo).
    useEffect(() => {
        if (step !== 'acomodar') setSelectedStickerId(null)
    }, [step])

    useEffect(() => {
        setSelectedStickerId(null)
    }, [presetId])

    const setMuscleView = useCallback((view: MuscleView) => {
        haptics.select()
        muscleViewTouchedRef.current = true
        setMuscleViewState(view)
    }, [])

    const applyPhoto = useCallback((uri: string | null, source: 'camera' | 'library' | null) => {
        backgroundTouchedRef.current = true
        // F7.2 — solo DE DÓNDE salió la foto, jamás la foto ni nada de ella. `library` se traduce a
        // `gallery` porque esa es la palabra de la taxonomía del PLAN (el nombre interno viene de
        // `expo-image-picker`), y "sin foto" también es una elección que hay que poder medir.
        captureAppEvent('student_share_photo_attached', {
            photo_source: uri ? (source === 'camera' ? 'camera' : 'gallery') : 'none',
        })
        setPhotoUri(uri)
        setPhotoSource(uri ? source : null)
        // Elegir una foto SALE del modo transparente: es la acción más específica y más reciente, y
        // en modo sticker el fondo no se dibuja — el alumno vería su foto desaparecer sin motivo.
        // "Sin foto", en cambio, sí convive con el modo sticker (un PNG con alpha y sin foto es
        // exactamente lo que se pega sobre la story propia).
        if (uri) setBackground('photo')
        else setBackground((prev) => (prev === 'transparent' ? prev : 'brand'))
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

    const setTransparent = useCallback(
        (next: boolean) => {
            backgroundTouchedRef.current = true
            setBackground(next ? 'transparent' : photoUri ? 'photo' : 'brand')
        },
        [photoUri],
    )

    const goBack = useCallback(() => {
        const i = STEP_ORDER.indexOf(step)
        if (i <= 0) {
            onClose()
            return
        }
        setStep(STEP_ORDER[i - 1])
    }, [step, onClose])

    const goNext = useCallback(() => {
        const i = STEP_ORDER.indexOf(step)
        if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
    }, [step])

    /**
     * Captura + destino (F5).
     *
     * UNA captura POR TAP, nunca precapturada: el alumno puede volver al editor entre destino y
     * destino (cambiar de estilo, sacarse otra foto) y un PNG guardado de antes compartiría un card
     * viejo. Rasterizar cuesta ~100 ms; equivocarse de imagen cuesta el share entero.
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
                        transparent: background === 'transparent',
                    })
                } catch {
                    showNotice(CAPTURE_FAILED_NOTICE)
                    return
                }
                haptics.tap()

                const result = await runShareTarget(target, {
                    fileUri: uri,
                    transparent: background === 'transparent',
                    accent,
                    inviteUrl: data.inviteUrl,
                    presetId,
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
        [busy, data.dateISO, data.inviteUrl, background, accent, presetId, showNotice],
    )

    // Sin Modal propio no hay `onRequestClose`, así que el back físico de Android hay que atajarlo
    // a mano — y tiene que retroceder de PASO, no cerrar el composer entero (ni, peor, cerrar el
    // resumen que está detrás). Solo mientras el overlay se está mostrando.
    useEffect(() => {
        if (!embedded || !visible) return
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            goBack()
            return true
        })
        return () => sub.remove()
    }, [embedded, visible, goBack])

    // ── Toggles de contenido ────────────────────────────────────────────────────────────────────

    const toggles = useMemo<ToggleSpec[]>(
        () => [
            { id: 'volumen', label: 'Volumen total' },
            {
                id: 'stats',
                label: 'Duración y series',
                // Un solo toggle para los tres: duración, series y reps son UNA fila (`StatsRow`),
                // no tres stickers. El SPEC los lista por separado; partirlos exigiría partir el
                // sticker y dejaría tres cajitas sueltas peleando por el mismo hueco del preset.
                hint: 'Duración · series · reps van juntas en la misma fila',
            },
            { id: 'musculos', label: 'Músculos trabajados' },
            {
                id: 'records',
                label: 'Récords del día',
                hint: 'Incluye el 1RM estimado',
                disabled: data.records.length === 0,
                disabledHint: 'Hoy no marcaste récords',
            },
            {
                id: 'setlist',
                label: 'Ejercicios del día',
                disabled: data.exercises.length === 0,
                disabledHint: 'No registraste ejercicios de fuerza',
            },
            { id: 'marca', label: 'Logo y marca del coach' },
            { id: 'fecha', label: 'Fecha' },
            {
                id: 'racha',
                label: 'Racha semanal',
                disabled: !data.streakCopy,
                disabledHint: 'Sin racha que mostrar esta semana',
            },
            {
                id: 'qr',
                label: 'QR «Entrena conmigo»',
                hint: 'Ideal para la variante Guardar: en una story nadie lo escanea',
                disabled: !data.inviteUrl,
                disabledHint: 'Tu coach todavía no tiene código de invitación',
            },
        ],
        [data.records.length, data.exercises.length, data.streakCopy, data.inviteUrl],
    )

    // ── Render ──────────────────────────────────────────────────────────────────────────────────

    const stage = (
        <View style={{ alignItems: 'center', paddingVertical: 14 }}>
            {/* +2 de ancho/alto por el borde: con `borderWidth:1` la caja de contenido mide
                `width - 2`, así que a medida exacta el wrapper le recortaba un píxel de cada lado al
                lienzo. El redondeado y el borde son CHROME: viven fuera del nodo capturado, y por eso
                el PNG sale full-bleed y cuadrado aunque el preview se vea con esquinas suaves. */}
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
                {/* Damero: la ÚNICA forma de que el alumno vea que "transparente" es alpha real y no
                    un fondo negro. Va FUERA del nodo capturado (es chrome, no card). */}
                {background === 'transparent' ? <Checkerboard width={canvasW} height={canvasH} /> : null}
                {/* EL NODO CAPTURADO. `collapsable={false}` porque en modo transparente no pinta
                    nada propio y Android lo fusionaría con su padre: `captureRef` se quedaría sin
                    nodo (o rasterizaría el padre, damero incluido). Requisito documentado en
                    `share-capture.ts`. */}
                <View ref={canvasRef} collapsable={false}>
                    <ShareCanvas
                        data={data}
                        stickers={layout}
                        muscleView={muscleView}
                        background={background}
                        photoUri={photoUri}
                        width={canvasW}
                        tokens={tokens}
                        posterGhost={presetId === 'poster'}
                        showHandle={showHandle}
                        reportSizes={setStickerSizes}
                        // Se pasa SIEMPRE, en los tres pasos: sacarlo al salir de Acomodar
                        // cambiaría el tipo de elemento de cada sticker y los remontaría (la
                        // silueta son ~150 paths SVG). En reposo el transform vale identidad.
                        liveTransform={liveTransform}
                    />
                </View>

                {/* Capa de edición: hermana del nodo capturado, NUNCA hija. Todo lo que dibuja
                    (marco de selección, guías) es chrome y no puede salir en el PNG. */}
                {step === 'acomodar' ? (
                    <StickerGestureLayer
                        width={canvasW}
                        height={canvasH}
                        stickers={layout}
                        sizes={stickerSizes}
                        live={liveTransform}
                        selectedId={selectedStickerId}
                        accent={accent}
                        onSelect={setSelectedStickerId}
                        onCommitPosition={setStickerPosition}
                        onCommitScale={setStickerScale}
                        onRemove={removeSticker}
                    />
                ) : null}
            </View>
        </View>
    )

    const body = (
        // `GestureHandlerRootView` y no `View`: es drop-in (no agrega nodo ni cambia layout) y sin
        // él el paso Acomodar no recibe UN SOLO toque. Los dos caminos de montaje del composer
        // viven en una ventana NATIVA ajena — el `<Modal>` de abajo, o el Modal del host cuando se
        // usa `embedded` — y el root de `app/_layout.tsx` no alcanza esas ventanas. Es el mismo fix
        // que documenta `components/Sheet.tsx` para el slider del ejecutor.
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: s.appBgDeep }}>
            <StepHeader
                step={step}
                accent={accent}
                onBack={goBack}
                onClose={onClose}
                canClose={!busy}
            />

            {stage}

            <View style={{ flex: 1 }}>
                {step === 'editor' ? (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <SectionLabel>Estilo</SectionLabel>
                        <PresetRow
                            presetId={presetId}
                            data={data}
                            tokens={tokens}
                            photoUri={photoUri}
                            accent={accent}
                            onSelect={selectPreset}
                        />

                        <SectionLabel>Foto</SectionLabel>
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
                        <ToggleRow
                            label="Fondo transparente"
                            hint="Para pegarlo como sticker en tus stories"
                            value={background === 'transparent'}
                            accent={accent}
                            onChange={setTransparent}
                        />

                        <SectionLabel>Qué se ve</SectionLabel>
                        {toggles.map((t) => (
                            <View key={t.id}>
                                <ToggleRow
                                    label={t.label}
                                    hint={t.disabled ? t.disabledHint : t.hint}
                                    value={!t.disabled && !!layout[t.id]?.visible}
                                    disabled={t.disabled}
                                    accent={accent}
                                    onChange={(next) => setStickerVisible(t.id, next)}
                                />
                                {/* El selector de silueta cuelga del toggle de músculos: es su
                                    modo, no un toggle aparte. Oculto cuando el sticker está off. */}
                                {t.id === 'musculos' && layout.musculos?.visible ? (
                                    <MuscleViewSegmented value={muscleView} accent={accent} onChange={setMuscleView} />
                                ) : null}
                                {/* Sub-toggle del @handle: solo existe si el coach cargó su
                                    Instagram, y depende del sticker de marca (el handle se imprime
                                    DENTRO del footer, no suelto). */}
                                {t.id === 'marca' && data.brand.instagramHandle ? (
                                    <ToggleRow
                                        sub
                                        label={`@${data.brand.instagramHandle}`}
                                        hint="El handle del coach, impreso en la firma"
                                        value={showHandle && !!layout.marca?.visible}
                                        disabled={!layout.marca?.visible}
                                        accent={accent}
                                        onChange={setShowHandle}
                                    />
                                ) : null}
                            </View>
                        ))}
                    </ScrollView>
                ) : null}

                {step === 'acomodar' ? (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 12 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* El hint se queda SIEMPRE, también con algo seleccionado: "mantener
                            apretado para quitar" es la única acción del paso que no tiene botón
                            (no hay papelera flotante), así que no puede vivir solo en el vacío. */}
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 20,
                                paddingTop: 10,
                            }}
                        >
                            <Move size={15} color={s.textDim} />
                            <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 12, lineHeight: 17, color: s.textDim }}>
                                Arrastra los elementos · mantén apretado para quitar
                            </Text>
                        </View>

                        {selectedStickerId && layout[selectedStickerId] ? (
                            <StickerEditPanel
                                id={selectedStickerId}
                                state={layout[selectedStickerId]}
                                maxScale={maxScaleFor(
                                    layout[selectedStickerId].scale,
                                    stickerSizes[selectedStickerId],
                                    canvasW,
                                    canvasH,
                                    layout[selectedStickerId].rotation,
                                )}
                                accent={accent}
                                muscleView={muscleView}
                                onMuscleView={setMuscleView}
                                onNudgeScale={nudgeStickerScale}
                                onRestore={restoreStickerPlacement}
                            />
                        ) : (
                            <Text
                                style={{
                                    fontFamily: FONT.ui,
                                    fontSize: 12,
                                    lineHeight: 17,
                                    color: s.textMuted,
                                    textAlign: 'center',
                                    paddingHorizontal: 32,
                                    paddingTop: 22,
                                }}
                            >
                                Toca un elemento del card para cambiarle el tamaño.
                            </Text>
                        )}
                    </ScrollView>
                ) : null}

                {step === 'compartir' ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 8 }}>
                        <Text style={{ fontFamily: FONT.ui, fontSize: 13, lineHeight: 19, color: s.textDim, textAlign: 'center' }}>
                            Elige a dónde va. La imagen se arma en tu teléfono y no se sube a ningún servidor.
                        </Text>
                        {/* Micro-hint del QR (SPEC §Growth): el QR es inescaneable en una story vista
                            desde el mismo teléfono, así que su caso real es la variante Guardar —
                            mostrar la imagen en persona. Solo aparece cuando hay algo que escanear
                            (el coach tiene código) y el QR está apagado, que es el default. */}
                        {data.inviteUrl && !layout.qr?.visible ? (
                            <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 17, color: s.textMuted, textAlign: 'center' }}>
                                Si la vas a guardar para mostrarla en persona, activa el QR en «Editar».
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* El aviso vive en el ÚLTIMO tramo flexible, anclado abajo y en absoluto: así queda
                    siempre pegado encima de la barra de destinos sin empujarla —un banner que
                    desplaza los botones 44 px justo cuando el alumno vuelve a tocar es un mis-tap
                    garantizado— y sin depender del alto de la barra, que cambia por paso. */}
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
                {step === 'compartir' ? (
                    <ShareTargetsBar
                        accent={accent}
                        busyTarget={busyTarget}
                        busy={busy}
                        onTarget={(target) => void runTarget(target)}
                    />
                ) : (
                    <PrimaryButton label="Continuar" accent={accent} onPress={goNext} />
                )}
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
        <Modal visible={visible} animationType="slide" onRequestClose={goBack} statusBarTranslucent>
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

interface ToggleSpec {
    id: StickerId
    label: string
    hint?: string
    /** Sin datos que mostrar: el toggle se apaga y explica por qué (no se esconde: enseña qué falta). */
    disabled?: boolean
    disabledHint?: string
}

function StepHeader({
    step,
    accent,
    onBack,
    onClose,
    canClose,
}: {
    step: Step
    accent: string
    onBack: () => void
    onClose: () => void
    canClose: boolean
}) {
    const s = EXEC_SURFACE
    const index = STEP_ORDER.indexOf(step)
    return (
        <View
            style={{
                height: 52,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 8,
                gap: 8,
            }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={index === 0 ? 'Cerrar el editor' : 'Volver al paso anterior'}
                onPress={onBack}
                hitSlop={10}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
                <ArrowLeft size={20} color={s.text} />
            </Pressable>

            <View style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <Text style={{ fontFamily: FONT.displayBold, fontSize: 15, color: s.text }}>{STEP_TITLE[step]}</Text>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                    {STEP_ORDER.map((id, i) => (
                        <View
                            key={id}
                            style={{
                                width: i === index ? 14 : 5,
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: i === index ? accent : s.dotTrack,
                            }}
                        />
                    ))}
                </View>
            </View>

            {/* El back navega el flujo; la X aborta el composer entero. Se bloquea mientras hay una
                captura en curso: cerrar a mitad deja el PNG temporal sin limpiar. */}
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

function SectionLabel({ children }: { children: string }) {
    return (
        <Text
            style={{
                fontFamily: FONT.uiSemibold,
                fontSize: 11,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: EXEC_SURFACE.textDim,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 10,
            }}
        >
            {children}
        </Text>
    )
}

/**
 * Fila de presets: cada chip es un `ShareCanvas` REAL en miniatura, no un ícono — el alumno elige
 * "cómo se va a ver", y una etiqueta no comunica eso.
 *
 * PERF: 6 minis × 9 stickers es el nodo más caro del editor. Dos decisiones lo acotan:
 *  1. Los minis pintan el layout DE FÁBRICA del preset (no el vivo), así que están memoizados y un
 *     toggle NO los repinta. Además es lo correcto semánticamente: el chip muestra qué es ese
 *     estilo, no cómo quedó el card del alumno.
 *  2. Solo 3 de los 6 montan la silueta anatómica (~150 paths SVG cada una), que es lo pesado:
 *     `sello`/`setlist` usan chips y `póster` la trae apagada.
 * Si en un device de gama baja igual se nota, el paso siguiente es recortar los minis a
 * fondo + volumen + silueta (el resto es textura ilegible a 68 px de ancho de todos modos).
 *
 * CONDICIÓN DEL HOST: el memo compara `data` por REFERENCIA. Si la pantalla que monta el composer
 * arma un `WorkoutShareData` nuevo en cada render, los minis se repintan igual y la memoización no
 * sirve de nada — el `data` tiene que venir de un `useMemo`.
 */
function PresetRow({
    presetId,
    data,
    tokens,
    photoUri,
    accent,
    onSelect,
}: {
    presetId: SharePresetId
    data: WorkoutShareData
    tokens: SportTokens
    photoUri: string | null
    accent: string
    onSelect: (id: SharePresetId) => void
}) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
        >
            {SHARE_PRESETS.map((p) => (
                <PresetChip
                    key={p.id}
                    preset={p}
                    active={p.id === presetId}
                    data={data}
                    tokens={tokens}
                    photoUri={photoUri}
                    accent={accent}
                    onPress={onSelect}
                />
            ))}
        </ScrollView>
    )
}

const PresetChip = memo(function PresetChip({
    preset,
    active,
    data,
    tokens,
    photoUri,
    accent,
    onPress,
}: {
    preset: SharePreset
    active: boolean
    data: WorkoutShareData
    tokens: SportTokens
    photoUri: string | null
    accent: string
    onPress: (id: SharePresetId) => void
}) {
    const s = EXEC_SURFACE
    const stickers = useMemo(() => cloneStickerLayout(preset), [preset])
    const thumbH = (THUMB_W * SHARE_CANVAS_H) / SHARE_CANVAS_W

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Estilo ${preset.label}`}
            onPress={() => onPress(preset.id)}
            style={{ alignItems: 'center', gap: 6 }}
        >
            <View
                style={{
                    padding: 3,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: active ? accent : s.border,
                    backgroundColor: active ? withAlpha(accent, 0.14) : 'transparent',
                }}
            >
                {/* `pointerEvents="none"`: el mini es decorativo — el tap tiene que llegar entero al
                    Pressable de arriba, no perderse en los stickers. */}
                <View style={{ width: THUMB_W, height: thumbH, borderRadius: 8, overflow: 'hidden' }} pointerEvents="none">
                    <ShareCanvas
                        data={data}
                        stickers={stickers}
                        muscleView={preset.muscleView}
                        background={preset.background}
                        photoUri={photoUri}
                        width={THUMB_W}
                        tokens={tokens}
                        posterGhost={preset.id === 'poster'}
                    />
                </View>
            </View>
            <Text
                style={{
                    fontFamily: active ? FONT.uiSemibold : FONT.ui,
                    fontSize: 11,
                    color: active ? s.text : s.textMuted,
                }}
                numberOfLines={1}
            >
                {preset.label}
            </Text>
        </Pressable>
    )
})

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

function ToggleRow({
    label,
    hint,
    value,
    disabled,
    accent,
    onChange,
    sub,
}: {
    label: string
    hint?: string
    value: boolean
    disabled?: boolean
    accent: string
    onChange: (next: boolean) => void
    /** Sub-fila indentada (el @handle cuelga del sticker de marca). */
    sub?: boolean
}) {
    const s = EXEC_SURFACE
    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: value, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => {
                haptics.select()
                onChange(!value)
            }}
            style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                paddingRight: 20,
                paddingLeft: sub ? 36 : 20,
                opacity: disabled ? 0.45 : 1,
            }}
        >
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 14, color: s.text }}>{label}</Text>
                {hint ? (
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11, lineHeight: 15, color: s.textDim }}>{hint}</Text>
                ) : null}
            </View>
            <DarkSwitch value={value} accent={accent} />
        </Pressable>
    )
}

/**
 * Carril del toggle — PRESENTACIONAL: no captura el press, lo hace la fila entera (blanco de toque
 * grande y UN solo nodo de accesibilidad; anidar dos Pressable con rol `switch` le entregaba al
 * lector de pantalla el mismo control dos veces).
 *
 * Por qué no el `Switch` del DS: su carril apagado se resuelve con `resolvedScheme` (negro al 14%
 * en tema claro) y este chrome es oscuro SIEMPRE — en una cuenta con tema claro el carril
 * desaparecía contra el fondo. Geometría idéntica a la del DS (32×18, pulgar 16) para que se sienta
 * el mismo control; encendido = acento de la marca.
 */
function DarkSwitch({ value, accent }: { value: boolean; accent: string }) {
    const trackW = 32
    const trackH = 18
    const thumb = 16
    const pad = 1
    const travel = trackW - thumb - pad * 2

    return (
        <MotiView
            animate={{ backgroundColor: value ? accent : 'rgba(255,255,255,0.16)' }}
            transition={{ type: 'timing', duration: 160 }}
            style={{
                width: trackW,
                height: trackH,
                borderRadius: trackH / 2,
                paddingHorizontal: pad,
                justifyContent: 'center',
            }}
        >
            <MotiView
                animate={{ translateX: value ? travel : 0 }}
                transition={{ type: 'spring', damping: 18, stiffness: 260 }}
                style={{ width: thumb, height: thumb, borderRadius: thumb / 2, backgroundColor: '#FFFFFF' }}
            />
        </MotiView>
    )
}

const MUSCLE_VIEW_OPTIONS: { id: MuscleView; label: string }[] = [
    { id: 'front', label: 'Frente' },
    { id: 'back', label: 'Espalda' },
    { id: 'both', label: 'Ambos' },
    { id: 'chips', label: 'Chips' },
]

function MuscleViewSegmented({
    value,
    accent,
    onChange,
}: {
    value: MuscleView
    accent: string
    onChange: (next: MuscleView) => void
}) {
    const s = EXEC_SURFACE
    return (
        <View
            style={{
                flexDirection: 'row',
                marginHorizontal: 20,
                marginBottom: 6,
                padding: 3,
                gap: 3,
                borderRadius: 12,
                backgroundColor: s.surfaceSunken,
                borderWidth: 1,
                borderColor: s.borderSubtle,
            }}
        >
            {MUSCLE_VIEW_OPTIONS.map((opt) => {
                const active = opt.id === value
                return (
                    <Pressable
                        key={opt.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Silueta ${opt.label}`}
                        onPress={() => onChange(opt.id)}
                        style={{
                            flex: 1,
                            minHeight: 34,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 9,
                            backgroundColor: active ? withAlpha(accent, 0.18) : 'transparent',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: active ? FONT.uiSemibold : FONT.ui,
                                fontSize: 12,
                                color: active ? s.text : s.textMuted,
                            }}
                        >
                            {opt.label}
                        </Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

/**
 * Panel del sticker seleccionado (paso Acomodar). Vive acá y no en `StickerGestureLayer` porque es
 * CHROME: la capa de gestos es todo lo que se dibuja encima del lienzo, y este panel va debajo,
 * en el flujo normal de la pantalla. Así además puede reusar `MuscleViewSegmented` sin que los dos
 * archivos se importen en círculo.
 *
 * Por qué un stepper y no el `Slider` del DS: ese componente resuelve su pista con `resolvedScheme`
 * y su relleno con `theme.primary`, y este chrome es oscuro SIEMPRE — en una cuenta con tema claro
 * la pista se volvía invisible sobre el fondo. Es exactamente el motivo por el que este archivo ya
 * tiene su propio `DarkSwitch` en vez del `Switch` del DS. El ajuste fino continuo igual existe:
 * es el pellizco de dos dedos sobre el lienzo.
 */
function StickerEditPanel({
    id,
    state,
    maxScale,
    accent,
    muscleView,
    onMuscleView,
    onNudgeScale,
    onRestore,
}: {
    id: StickerId
    state: StickerState
    /** Tope REAL de este sticker (`maxScaleFor`): el catálogo acotado por lo que entra en el lienzo. */
    maxScale: number
    accent: string
    muscleView: MuscleView
    onMuscleView: (next: MuscleView) => void
    onNudgeScale: (id: StickerId, delta: number) => void
    onRestore: (id: StickerId) => void
}) {
    const s = EXEC_SURFACE
    const pct = Math.round(state.scale * 100)
    const fill = (state.scale - STICKER_SCALE_MIN) / (STICKER_SCALE_MAX - STICKER_SCALE_MIN)

    return (
        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 14, color: s.text }} numberOfLines={1}>
                    {STICKER_LABEL[id]}
                </Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Restaurar posición"
                    onPress={() => onRestore(id)}
                    hitSlop={8}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 34,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: s.border,
                    }}
                >
                    <RotateCcw size={13} color={s.textMuted} />
                    <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>Restaurar</Text>
                </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ScaleStep
                    icon={Minus}
                    label="Achicar"
                    disabled={state.scale <= STICKER_SCALE_MIN}
                    onPress={() => onNudgeScale(id, -0.1)}
                />
                {/* Barra de referencia: no se arrastra, solo dice dónde estás dentro del rango. */}
                <View
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel="Tamaño"
                    accessibilityValue={{ min: 50, max: 300, now: pct }}
                    style={{ flex: 1, gap: 6 }}
                >
                    <View style={{ height: 4, borderRadius: 999, backgroundColor: s.surfaceSunken, overflow: 'hidden' }}>
                        <View
                            style={{
                                width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`,
                                height: '100%',
                                borderRadius: 999,
                                backgroundColor: accent,
                            }}
                        />
                    </View>
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: s.textDim, textAlign: 'center' }}>
                        Tamaño {pct}% · pellizca en el card para el ajuste fino
                    </Text>
                </View>
                <ScaleStep
                    icon={Plus}
                    label="Agrandar"
                    // Contra el tope REAL y no contra `STICKER_SCALE_MAX`: un sticker que ya llena el
                    // lienzo no crece más, y un «+» que sigue habilitado sin hacer nada se lee como
                    // que el control está roto.
                    disabled={state.scale >= maxScale}
                    onPress={() => onNudgeScale(id, 0.1)}
                />
            </View>

            {/* El flip de silueta cuelga del sticker de músculos: es SU modo, no un control global
                del paso. Mismo control que el editor — una sola forma de elegir la vista. */}
            {id === 'musculos' ? (
                <View style={{ marginHorizontal: -20 }}>
                    <MuscleViewSegmented value={muscleView} accent={accent} onChange={onMuscleView} />
                </View>
            ) : null}
        </View>
    )
}

function ScaleStep({
    icon: Icon,
    label,
    disabled,
    onPress,
}: {
    icon: LucideIcon
    label: string
    disabled: boolean
    onPress: () => void
}) {
    const s = EXEC_SURFACE
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: s.border,
                backgroundColor: s.surface,
                opacity: disabled ? 0.4 : 1,
            }}
        >
            <Icon size={17} color={s.text} />
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
 * Los destinos del paso 4 (F5.4).
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

/**
 * Damero de "transparencia" detrás del lienzo. Un `Pattern` de SVG y no una grilla de Views: a
 * 342×608 px la grilla serían ~400 nodos nativos para una capa puramente decorativa.
 */
function Checkerboard({ width, height }: { width: number; height: number }) {
    const cell = 12
    return (
        <Svg
            width={width}
            height={height}
            style={{ position: 'absolute', left: 0, top: 0 }}
            pointerEvents="none"
        >
            <Defs>
                <Pattern id="shareAlphaGrid" patternUnits="userSpaceOnUse" width={cell * 2} height={cell * 2}>
                    <Rect x={0} y={0} width={cell * 2} height={cell * 2} fill="#E4E4E7" />
                    <Rect x={0} y={0} width={cell} height={cell} fill="#F4F4F5" />
                    <Rect x={cell} y={cell} width={cell} height={cell} fill="#F4F4F5" />
                </Pattern>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#shareAlphaGrid)" />
        </Svg>
    )
}
