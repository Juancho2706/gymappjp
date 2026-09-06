import { useMemo } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated'
import { haptics } from '../../../lib/haptics'
import {
    idleStickerTransform,
    liveDeltaFor,
    maxScaleFor,
    STICKER_SCALE_MAX,
    STICKER_SCALE_MIN,
    type StickerLiveTransform,
    type StickerSize,
    type StickerState,
} from './share-types'

/**
 * Share Entreno — la capa de EDICIÓN del canvas.
 *
 * Se monta como hermana absoluta ENCIMA del `ShareCanvas`, del mismo tamaño y FUERA del nodo que
 * `captureRef` rasteriza. Esa es la regla que ordena todo el archivo: acá viven el marco punteado,
 * las guías de alineación y la zona de arrastre, y ninguna de esas cosas puede aparecer en el PNG
 * (un borde punteado capturado sería un bug imposible de explicarle al alumno).
 *
 * ── QUÉ SE PUEDE HACER ──
 * Mover el bloque y cambiarle el tamaño. Nada más (decisión del owner, 06-09-2026). Se retiraron el
 * «mantener apretado para quitar» —con un solo elemento, quitarlo dejaba el card vacío—, el tap de
 * selección —no hay entre qué elegir— y con ellos el latch `multiTouch` que existía únicamente para
 * que el pellizco no disparara el quitar.
 *
 * ── DÓNDE VIVE EL BLOQUE MIENTRAS SE ARRASTRA ──
 * En el canvas, siempre. Esta capa NO dibuja el bloque: dibuja una caja invisible del mismo tamaño y
 * en el mismo lugar, y lo único que produce es un `SharedValue` con el destino vivo
 * (`StickerLiveTransform`). El canvas lo lee en su propio `useAnimatedStyle` y mueve el sticker
 * REAL en el UI thread. Se descartó "ocultar el original y arrastrar un clon": duplica el camino de
 * render y obliga a montar/desmontar el bloque en cada toque.
 *
 * ── QUÉ SE COMMITEA Y CUÁNDO ──
 * Durante el gesto no hay `setState`: todo pasa en el UI thread. Al soltar, `runOnJS` convierte el
 * centro a coordenadas normalizadas 0..1 y el composer lo guarda en `layout`. El destino vivo es
 * ABSOLUTO (no un delta) justamente para que el commit no parpadee — ver `StickerLiveTransform`.
 */

// ── Reglas del tablero ───────────────────────────────────────────────────────────────────────────

/**
 * Escala mínima/máxima del bloque. Viven en `share-types` (son contrato y el tope fino,
 * `maxScaleFor`, es aritmética pura testeable) y se re-exportan acá porque este archivo fue su casa
 * y el barrel del módulo las publica desde él.
 */
export { STICKER_SCALE_MAX, STICKER_SCALE_MIN }

/**
 * El id del único sticker. Constante y no un literal suelto: `liveDeltaFor` compara por id contra lo
 * que escribe esta misma capa, y las dos puntas tienen que decir exactamente lo mismo.
 */
const BLOCK_ID = 'bloque' as const

/**
 * Clamp del CENTRO del bloque (fracción del canvas), no de su caja.
 *
 * Sobre el centro a propósito: el bloque puede ser más ancho que el lienzo cuando el alumno lo
 * agranda, y clampear la caja lo dejaría anclado al medio sin poder elegir QUÉ parte se sale. Estos
 * márgenes garantizan que siempre quede un asa visible para volver a agarrarlo.
 */
const CENTER_MIN_X = 0.03
const CENTER_MAX_X = 0.97
const CENTER_MIN_Y = 0.02
const CENTER_MAX_Y = 0.98

/** Distancia al centro del canvas (px) a la que aparece la guía… */
const GUIDE_SHOW_PX = 12
/** …y a la que el bloque se pega de verdad. Menor que la anterior: primero se ve, después imanta. */
const SNAP_PX = 8

/** Aire alrededor del bloque para que se pueda agarrar cómodo y el marco respire. */
const GRAB_PAD = 6

/** Movimiento que activa el arrastre. Bajo a propósito: el ajuste fino es de pocos píxeles. */
const DRAG_MIN_DISTANCE = 4

// `runOnJS` necesita una referencia estable a una función JS común; los métodos del objeto
// `haptics` se pasan envueltos para no depender de cómo esté construido ese objeto.
const tickHaptic = () => haptics.select()

const clampTo = (v: number, lo: number, hi: number): number => {
    'worklet'
    return Math.min(Math.max(v, lo), hi)
}

// ── Capa ─────────────────────────────────────────────────────────────────────────────────────────

export interface StickerGestureLayerProps {
    /** Mismas dimensiones que el `ShareCanvas` que hay debajo (px de pantalla). */
    width: number
    height: number
    /** Posición/escala YA commiteadas del bloque. */
    state: StickerState
    /** Medida real que reportó el canvas (`reportSizes`). Sin medida no hay zona que agarrar. */
    size: StickerSize | undefined
    /** El destino vivo que esta capa escribe y el canvas lee. */
    live: SharedValue<StickerLiveTransform>
    accent: string
    /** Centro normalizado 0..1 al soltar. */
    onCommitPosition: (x: number, y: number) => void
    onCommitScale: (scale: number) => void
}

export function StickerGestureLayer({
    width,
    height,
    state,
    size,
    live,
    accent,
    onCommitPosition,
    onCommitScale,
}: StickerGestureLayerProps) {
    // Opacidad de cada guía + el booleano de "ya está mostrada". Hacen falta los dos: `withTiming`
    // deja la opacidad en valores intermedios, así que comparar contra ella para decidir si hay que
    // animar reiniciaría la animación en cada frame del arrastre.
    const vGuide = useSharedValue(0)
    const hGuide = useSharedValue(0)
    const vGuideOn = useSharedValue(false)
    const hGuideOn = useSharedValue(false)

    // Enganche del imán, por eje. Va aparte de la guía porque los umbrales son distintos (12 px
    // para ver la línea, 8 para pegarse): sin este latch, entrar de 20 px a 10 y recién después a 7
    // se comía el tick — la guía ya estaba encendida cuando el bloque se pegó de verdad.
    const magnetX = useSharedValue(false)
    const magnetY = useSharedValue(false)

    const baseX = state.x * width
    const baseY = state.y * height
    const baseScale = state.scale
    const boxW = (size?.w ?? 0) + GRAB_PAD * 2
    const boxH = (size?.h ?? 0) + GRAB_PAD * 2

    /**
     * Pellizco = escala del bloque, y va en la RAÍZ de la capa y no en la zona: el segundo dedo de
     * un pellizco casi nunca cae DENTRO de la caja del bloque, y `react-native-gesture-handler` solo
     * le entrega a un handler los eventos de los punteros que ese handler trackea.
     */
    const pinch = useMemo(() => {
        // Tope FINO, contra la medida real: `STICKER_SCALE_MAX` a secas deja al bloque 1,5 lienzos
        // de ancho y lo único que se ve es un "375…" recortado (ver `maxScaleFor`).
        const cap = maxScaleFor(baseScale, size, width, height)

        return Gesture.Pinch()
            .onStart(() => {
                live.value = { id: BLOCK_ID, cx: baseX, cy: baseY, scale: baseScale }
            })
            .onUpdate((e) => {
                const next = clampTo(baseScale * e.scale, STICKER_SCALE_MIN, cap)
                live.value = { id: BLOCK_ID, cx: baseX, cy: baseY, scale: next }
            })
            .onEnd(() => {
                const l = live.value
                if (l.id !== BLOCK_ID) return
                if (l.scale === baseScale) {
                    // Pellizco que no movió la escala (típico al quedarse pegado contra el tope): el
                    // composer corta por igualdad y NO re-renderiza, así que el efecto que apaga el
                    // destino vivo tampoco corre y quedaría un `cx`/`cy` viejo listo para descolocar
                    // al bloque cuando el lienzo cambie de ancho. Se apaga acá, y a escala idéntica
                    // no se ve nada (el delta ya valía 0).
                    live.value = idleStickerTransform()
                    return
                }
                runOnJS(onCommitScale)(l.scale)
            })
    }, [baseX, baseY, baseScale, size, width, height, live, onCommitScale])

    const drag = useMemo(() => {
        const midX = width / 2
        const midY = height / 2
        const loX = CENTER_MIN_X * width
        const hiX = CENTER_MAX_X * width
        const loY = CENTER_MIN_Y * height
        const hiY = CENTER_MAX_Y * height

        return (
            Gesture.Pan()
                // Un dedo: el segundo tiene que quedar libre para que el pellizco de la raíz active.
                .maxPointers(1)
                .minDistance(DRAG_MIN_DISTANCE)
                .onStart(() => {
                    // Arrancar de cero SIEMPRE (opacidad incluida): una guía que quedó encendida por
                    // un gesto cancelado se vería como una línea fantasma pegada al card.
                    vGuideOn.value = false
                    hGuideOn.value = false
                    vGuide.value = 0
                    hGuide.value = 0
                    magnetX.value = false
                    magnetY.value = false
                    live.value = { id: BLOCK_ID, cx: baseX, cy: baseY, scale: baseScale }
                })
                .onUpdate((e) => {
                    let cx = baseX + e.translationX
                    let cy = baseY + e.translationY

                    // Imán al centro + tick háptico SOLO al enganchar (no en cada frame pegado).
                    const nearX = Math.abs(cx - midX) <= SNAP_PX
                    if (nearX) cx = midX
                    if (nearX !== magnetX.value) {
                        magnetX.value = nearX
                        if (nearX) runOnJS(tickHaptic)()
                    }
                    const nearY = Math.abs(cy - midY) <= SNAP_PX
                    if (nearY) cy = midY
                    if (nearY !== magnetY.value) {
                        magnetY.value = nearY
                        if (nearY) runOnJS(tickHaptic)()
                    }

                    cx = clampTo(cx, loX, hiX)
                    cy = clampTo(cy, loY, hiY)

                    // La guía se decide DESPUÉS del clamp: contra la posición que se va a pintar.
                    const showV = Math.abs(cx - midX) <= GUIDE_SHOW_PX
                    if (showV !== vGuideOn.value) {
                        vGuideOn.value = showV
                        vGuide.value = withTiming(showV ? 1 : 0, { duration: 110 })
                    }
                    const showH = Math.abs(cy - midY) <= GUIDE_SHOW_PX
                    if (showH !== hGuideOn.value) {
                        hGuideOn.value = showH
                        hGuide.value = withTiming(showH ? 1 : 0, { duration: 110 })
                    }

                    live.value = { id: BLOCK_ID, cx, cy, scale: baseScale }
                })
                .onEnd(() => {
                    const l = live.value
                    if (l.id !== BLOCK_ID) return
                    runOnJS(onCommitPosition)(l.cx / width, l.cy / height)
                })
                .onFinalize(() => {
                    // También al cancelar: una guía encendida que se queda pintada parece un bug.
                    if (vGuideOn.value) {
                        vGuideOn.value = false
                        vGuide.value = withTiming(0, { duration: 110 })
                    }
                    if (hGuideOn.value) {
                        hGuideOn.value = false
                        hGuide.value = withTiming(0, { duration: 110 })
                    }
                })
        )
    }, [
        baseX,
        baseY,
        baseScale,
        width,
        height,
        live,
        vGuide,
        hGuide,
        vGuideOn,
        hGuideOn,
        magnetX,
        magnetY,
        onCommitPosition,
    ])

    const vStyle = useAnimatedStyle(() => ({ opacity: vGuide.value }))
    const hStyle = useAnimatedStyle(() => ({ opacity: hGuide.value }))

    // El MISMO `liveDeltaFor` que usa el canvas, con el MISMO orden de transform: si se separan, el
    // marco punteado deja de calzar con el bloque.
    const moved = useAnimatedStyle(() => {
        const d = liveDeltaFor(live.value, BLOCK_ID, baseX, baseY, baseScale)
        return {
            transform: [
                { translateX: -boxW / 2 + d.dx },
                { translateY: -boxH / 2 + d.dy },
                { scale: d.k },
            ],
        }
    })

    return (
        <GestureDetector gesture={pinch}>
            <View style={{ position: 'absolute', left: 0, top: 0, width, height }}>
                {/* Guías de alineación: 1 px de acento, centro vertical y horizontal del canvas. */}
                <Animated.View
                    pointerEvents="none"
                    style={[
                        { position: 'absolute', top: 0, left: width / 2 - 0.5, width: 1, height, backgroundColor: accent },
                        vStyle,
                    ]}
                />
                <Animated.View
                    pointerEvents="none"
                    style={[
                        { position: 'absolute', left: 0, top: height / 2 - 0.5, height: 1, width, backgroundColor: accent },
                        hStyle,
                    ]}
                />

                {/* Sin medida no hay caja que calcar: el canvas todavía no reportó su `onLayout` y
                    una zona de 12×12 (solo el padding) recibiría toques en la esquina equivocada. */}
                {size ? (
                    <GestureDetector gesture={drag}>
                        <Animated.View
                            // `image` y no `button`: la caja no ejecuta ninguna acción con un toque
                            // simple — arrastrar y pellizcar no son gestos que un lector de pantalla
                            // pueda emitir. Anunciarla como botón prometería algo que no pasa.
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel="Bloque del entreno"
                            style={[
                                {
                                    position: 'absolute',
                                    left: baseX,
                                    top: baseY,
                                    width: boxW,
                                    height: boxH,
                                    borderRadius: 10,
                                    borderWidth: 1.5,
                                    // Punteado y en el acento: se lee como "esto se mueve" y no se
                                    // confunde con un borde del propio card. SIN relleno tintado —
                                    // ahora el marco está SIEMPRE puesto (no hay selección que
                                    // encender) y un velo permanente le cambiaría el color al
                                    // preview justo donde está el dato más grande.
                                    borderStyle: 'dashed',
                                    borderColor: accent,
                                },
                                moved,
                            ]}
                        />
                    </GestureDetector>
                ) : null}
            </View>
        </GestureDetector>
    )
}
