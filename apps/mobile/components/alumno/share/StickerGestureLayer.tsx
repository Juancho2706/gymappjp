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
import { STICKER_PAINT_ORDER } from './share-presets'
import { withAlpha } from './stickers'
import {
    idleStickerTransform,
    liveDeltaFor,
    maxScaleFor,
    STICKER_SCALE_MAX,
    STICKER_SCALE_MIN,
    type StickerId,
    type StickerLiveTransform,
    type StickerSize,
    type StickerState,
} from './share-types'

/**
 * Share Entreno (F4) — el paso «Acomodar»: la capa de EDICIÓN del canvas.
 *
 * Se monta como hermana absoluta ENCIMA del `ShareCanvas`, del mismo tamaño y FUERA del nodo que
 * `captureRef` rasteriza. Esa es la regla que ordena todo el archivo: acá viven el marco de
 * selección, las guías de alineación y las zonas de arrastre, y ninguna de esas cosas puede
 * aparecer en el PNG (un borde punteado capturado sería un bug imposible de explicarle al alumno).
 *
 * ── DÓNDE VIVE EL STICKER MIENTRAS SE ARRASTRA ──
 * En el canvas, siempre. Esta capa NO dibuja stickers: dibuja cajas invisibles del mismo tamaño y
 * en el mismo lugar, y lo único que produce es un `SharedValue` con el destino vivo
 * (`StickerLiveTransform`). El canvas lo lee en su propio `useAnimatedStyle` y mueve el sticker
 * REAL en el UI thread. Se descartó el camino de "ocultar el original y arrastrar un clon acá"
 * porque duplica el camino de render y obliga a montar/desmontar el sticker en cada toque — con la
 * silueta anatómica (~150 paths SVG) eso es un tirón visible justo al empezar a arrastrar.
 *
 * ── QUÉ SE COMMITEA Y CUÁNDO ──
 * Durante el gesto no hay `setState`: todo pasa en el UI thread. Al soltar, `runOnJS` convierte el
 * centro a coordenadas normalizadas 0..1 y el composer lo guarda en `layout`. El destino vivo es
 * ABSOLUTO (no un delta) justamente para que el commit no parpadee — ver `StickerLiveTransform`.
 */

// ── Reglas del tablero ───────────────────────────────────────────────────────────────────────────

/**
 * Escala mínima/máxima de un sticker. Viven en `share-types` (son contrato y el tope fino,
 * `maxScaleFor`, es aritmética pura testeable) y se re-exportan acá porque este archivo fue su casa
 * y el barrel del módulo las publica desde él.
 */
export { STICKER_SCALE_MAX, STICKER_SCALE_MIN }

/**
 * Cómo se llama cada sticker cuando hay que hablar de él suelto: la etiqueta del lector de pantalla
 * sobre su zona de arrastre y el título del panel del composer. Los toggles del editor tienen sus
 * propias copys ("Logo y marca del coach") porque ahí se habla de CONTENIDO; acá se habla del
 * OBJETO que se está moviendo, y "Logo y marca del coach · Tamaño 120%" se lee mal.
 */
export const STICKER_LABEL: Record<StickerId, string> = {
    volumen: 'Volumen total',
    stats: 'Duración y series',
    musculos: 'Músculos trabajados',
    records: 'Récords del día',
    setlist: 'Ejercicios del día',
    marca: 'Marca del coach',
    fecha: 'Fecha',
    racha: 'Racha semanal',
    qr: 'QR «Entrena conmigo»',
}

/**
 * Clamp del CENTRO del sticker (fracción del canvas). Deliberadamente sobre el centro y NO sobre la
 * caja: los presets `marcador` y `poster` anclan sus rieles rotados en x=0.93 / x=0.07 y necesitan
 * que la caja desborde (con rotación ±90 el ancho y el alto se intercambian, así que una caja
 * "adentro" en horizontal se sale en vertical y viceversa — ver `StickerState.rotation`). Clampear
 * la caja rotada dejaría esas posiciones de fábrica fuera del alcance del alumno.
 */
const CENTER_MIN_X = 0.03
const CENTER_MAX_X = 0.97
const CENTER_MIN_Y = 0.02
const CENTER_MAX_Y = 0.98

/** Distancia al centro del canvas (px) a la que aparece la guía… */
const GUIDE_SHOW_PX = 12
/** …y a la que el sticker se pega de verdad. Menor que la anterior: primero se ve, después imanta. */
const SNAP_PX = 8

/** Aire alrededor del sticker para que una pastilla chica se pueda agarrar y el marco respire. */
const GRAB_PAD = 6

/** Movimiento que activa el arrastre. Bajo a propósito: los stickers chicos se mueven poco. */
const DRAG_MIN_DISTANCE = 4

/** «Mantener apretado para quitar». 500 ms: el mismo umbral del ejecutor. */
const REMOVE_HOLD_MS = 500

// `runOnJS` necesita una referencia estable a una función JS común; los métodos del objeto
// `haptics` se pasan envueltos para no depender de cómo esté construido ese objeto.
const tickHaptic = () => haptics.select()
const removeHaptic = () => haptics.longPress()

const clampTo = (v: number, lo: number, hi: number): number => {
    'worklet'
    return Math.min(Math.max(v, lo), hi)
}

// ── Capa ─────────────────────────────────────────────────────────────────────────────────────────

export interface StickerGestureLayerProps {
    /** Mismas dimensiones que el `ShareCanvas` que hay debajo (px de pantalla). */
    width: number
    height: number
    /** Layout VIVO del composer: la posición ya commiteada de cada sticker. */
    stickers: Record<StickerId, StickerState>
    /** Medidas reales que reportó el canvas (`reportSizes`). Sin medida no hay zona que agarrar. */
    sizes: Partial<Record<StickerId, StickerSize>>
    /** El destino vivo que esta capa escribe y el canvas lee. */
    live: SharedValue<StickerLiveTransform>
    selectedId: StickerId | null
    accent: string
    onSelect: (id: StickerId | null) => void
    /** Centro normalizado 0..1 al soltar. */
    onCommitPosition: (id: StickerId, x: number, y: number) => void
    onCommitScale: (id: StickerId, scale: number) => void
    /** Mantener apretado = quitar (pasa por los overrides de visibilidad del composer). */
    onRemove: (id: StickerId) => void
}

export function StickerGestureLayer({
    width,
    height,
    stickers,
    sizes,
    live,
    selectedId,
    accent,
    onSelect,
    onCommitPosition,
    onCommitScale,
    onRemove,
}: StickerGestureLayerProps) {
    // Opacidad de cada guía + el booleano de "ya está mostrada". Hacen falta los dos: `withTiming`
    // deja la opacidad en valores intermedios, así que comparar contra ella para decidir si hay que
    // animar reiniciaría la animación en cada frame del arrastre.
    const vGuide = useSharedValue(0)
    const hGuide = useSharedValue(0)
    const vGuideOn = useSharedValue(false)
    const hGuideOn = useSharedValue(false)

    /**
     * ¿Hay MÁS DE UN dedo sobre el lienzo en este toque? Lo escribe el detector de la raíz y lo lee
     * el «mantener apretado para quitar» de cada zona.
     *
     * ── POR QUÉ HACE FALTA CONTARLOS A MANO ──
     * El segundo dedo de un pellizco casi nunca cae DENTRO de la zona del sticker (sin las pills del
     * rediseño de F las cajas son chicas: la fecha mide ~40 px de alto). Y `react-native-gesture-
     * handler` solo le entrega a un handler los eventos de los punteros que ese handler TRACKEA
     * (`GestureHandler.wantsEvent` exige `isTrackingPointer(...)`): el `ACTION_POINTER_DOWN` del
     * segundo dedo ni siquiera llega a la zona, así que su `LongPress` nunca ve dos dedos y su
     * propio corte por cantidad de punteros (`currentPointers > numberOfPointersRequired ⇒ fail`)
     * no se dispara. El temporizador de 500 ms sigue corriendo con el dedo ancla quieto y a los
     * medio segundo QUITA el sticker: el alumno estaba agrandando y el elemento desaparece.
     *
     * Tampoco alcanza con que el pellizco lo cancele al activarse: `ScaleGestureDetector` de Android
     * no arranca hasta que los dedos están a ~27 mm (`config_minScalingSpan`), y un pellizco para
     * agrandar empieza JUNTANDO los dedos. Entre el toque y esa distancia pasan de sobra los 500 ms.
     *
     * El contador vive en la raíz porque su View cubre el lienzo entero: ahí sí caen los dos dedos.
     */
    const multiTouch = useSharedValue(false)

    /**
     * Qué se puede agarrar: lo que el canvas está pintando DE VERDAD. Un sticker apagado no tiene
     * zona, y uno sin medida tampoco (o no llegó a montarse, o `hasContentFor` lo filtró, o midió
     * 0×0 porque su propio componente devolvió `null` — el caso de los chips sin músculos).
     * El orden es el de pintado: el último es el que está más arriba y el que se lleva el toque.
     */
    const grabbable = useMemo(
        () =>
            STICKER_PAINT_ORDER.flatMap((id) => {
                const state = stickers[id]
                const size = sizes[id]
                if (!state?.visible || !size || size.w <= 1 || size.h <= 1) return []
                return [{ id, state, size }]
            }),
        [stickers, sizes],
    )

    /**
     * Pellizco = escala del sticker SELECCIONADO, y va en la RAÍZ de la capa, no en cada zona: dos
     * dedos dentro de la pastilla de fecha (~40 px de alto) no es un gesto real.
     *
     * SIEMPRE vivo, incluso sin selección: un handler `enabled(false)` no recibe punteros, y este es
     * el único gesto que ve los dos dedos del pellizco (ver `multiTouch`). Deshabilitarlo dejaba el
     * caso peor —pellizcar sin haber elegido nada— sin contador Y sin nadie que cancelara el
     * «mantener apretado»: no escalaba nada y encima borraba el sticker. Sin objetivo, escala nada.
     */
    const pinch = useMemo(() => {
        const target = selectedId
        const state = target ? stickers[target] : null

        const counted = Gesture.Pinch().onTouchesDown((e) => {
            // El primer dedo REINICIA el latch (toque nuevo) y cualquier dedo extra lo enciende. Se
            // apaga solo en el próximo toque de un dedo: un pellizco que suelta un dedo y sigue
            // apretando con el otro sigue siendo un pellizco, no un "quitar".
            if (e.numberOfTouches > 1) multiTouch.value = true
            else if (e.numberOfTouches === 1) multiTouch.value = false
        })
        if (!target || !state) return counted

        const cx = state.x * width
        const cy = state.y * height
        const base = state.scale
        // Tope FINO, contra la medida real del sticker: `STICKER_SCALE_MAX` a secas deja al héroe
        // 1,5 lienzos de ancho y lo único que se ve es un "375…" recortado (ver `maxScaleFor`).
        const cap = maxScaleFor(base, sizes[target], width, height, state.rotation)

        return counted
            .onStart(() => {
                live.value = { id: target, cx, cy, scale: base }
            })
            .onUpdate((e) => {
                const next = clampTo(base * e.scale, STICKER_SCALE_MIN, cap)
                live.value = { id: target, cx, cy, scale: next }
            })
            .onEnd(() => {
                const l = live.value
                if (l.id !== target) return
                if (l.scale === base) {
                    // Pellizco que no movió la escala (típico al quedarse pegado contra el tope): el
                    // composer corta por igualdad y NO re-renderiza, así que el efecto que apaga el
                    // destino vivo tampoco corre y quedaría un `cx`/`cy` viejo listo para descolocar
                    // al sticker cuando el lienzo cambie de ancho al pasar de paso. Se apaga acá, y
                    // a escala idéntica no se ve nada (el delta ya valía 0).
                    live.value = idleStickerTransform()
                    return
                }
                runOnJS(onCommitScale)(target, l.scale)
            })
    }, [selectedId, stickers, sizes, width, height, live, multiTouch, onCommitScale])

    /**
     * Tocar el fondo deselecciona. Va en un View HERMANO (debajo de las zonas), no en un ancestro:
     * como las zonas se pintan después, se llevan el toque antes de que llegue acá y no hay que
     * pelear prioridades entre un Tap padre y un Tap hijo.
     */
    const backdropTap = useMemo(
        () =>
            Gesture.Tap().onEnd((_e, ok) => {
                if (ok) runOnJS(onSelect)(null)
            }),
        [onSelect],
    )

    const vStyle = useAnimatedStyle(() => ({ opacity: vGuide.value }))
    const hStyle = useAnimatedStyle(() => ({ opacity: hGuide.value }))

    return (
        <GestureDetector gesture={pinch}>
            <View style={{ position: 'absolute', left: 0, top: 0, width, height }}>
                <GestureDetector gesture={backdropTap}>
                    <View style={{ position: 'absolute', left: 0, top: 0, width, height }} />
                </GestureDetector>

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

                {grabbable.map(({ id, state, size }) => (
                    <StickerZone
                        key={id}
                        id={id}
                        state={state}
                        size={size}
                        width={width}
                        height={height}
                        live={live}
                        selected={id === selectedId}
                        accent={accent}
                        vGuide={vGuide}
                        hGuide={hGuide}
                        vGuideOn={vGuideOn}
                        hGuideOn={hGuideOn}
                        multiTouch={multiTouch}
                        onSelect={onSelect}
                        onCommitPosition={onCommitPosition}
                        onRemove={onRemove}
                    />
                ))}
            </View>
        </GestureDetector>
    )
}

// ── Zona de gesto de un sticker ──────────────────────────────────────────────────────────────────

interface StickerZoneProps {
    id: StickerId
    state: StickerState
    size: StickerSize
    width: number
    height: number
    live: SharedValue<StickerLiveTransform>
    selected: boolean
    accent: string
    vGuide: SharedValue<number>
    hGuide: SharedValue<number>
    vGuideOn: SharedValue<boolean>
    hGuideOn: SharedValue<boolean>
    /** Latch de «hay más de un dedo en el lienzo» que escribe el detector de la raíz. */
    multiTouch: SharedValue<boolean>
    onSelect: (id: StickerId) => void
    onCommitPosition: (id: StickerId, x: number, y: number) => void
    onRemove: (id: StickerId) => void
}

/**
 * Caja invisible calcada del sticker: mismo centro, mismo tamaño medido, misma rotación — con el
 * MISMO `liveDeltaFor` que usa el canvas, para que el marco y el sticker nunca se separen.
 */
function StickerZone({
    id,
    state,
    size,
    width,
    height,
    live,
    selected,
    accent,
    vGuide,
    hGuide,
    vGuideOn,
    hGuideOn,
    multiTouch,
    onSelect,
    onCommitPosition,
    onRemove,
}: StickerZoneProps) {
    const baseX = state.x * width
    const baseY = state.y * height
    const baseScale = state.scale
    const rotation = state.rotation ?? 0
    const boxW = size.w + GRAB_PAD * 2
    const boxH = size.h + GRAB_PAD * 2

    // Enganche del imán, por eje. Va aparte de la guía porque los umbrales son distintos (12 px
    // para ver la línea, 8 para pegarse): sin este latch, entrar de 20 px a 10 y recién después a 7
    // se comía el tick — la guía ya estaba encendida cuando el sticker se pegó de verdad.
    const magnetX = useSharedValue(false)
    const magnetY = useSharedValue(false)

    const gesture = useMemo(() => {
        const midX = width / 2
        const midY = height / 2
        const loX = CENTER_MIN_X * width
        const hiX = CENTER_MAX_X * width
        const loY = CENTER_MIN_Y * height
        const hiY = CENTER_MAX_Y * height

        const drag = Gesture.Pan()
            // Un dedo: el segundo tiene que quedar libre para que el pellizco de la raíz active.
            .maxPointers(1)
            .minDistance(DRAG_MIN_DISTANCE)
            .onStart(() => {
                // Arrancar de cero SIEMPRE (opacidad incluida): una guía que quedó encendida por un
                // gesto cancelado se vería como una línea fantasma pegada al card.
                vGuideOn.value = false
                hGuideOn.value = false
                vGuide.value = 0
                hGuide.value = 0
                magnetX.value = false
                magnetY.value = false
                live.value = { id, cx: baseX, cy: baseY, scale: baseScale }
                // Arrastrar un sticker que no estaba elegido lo elige: pedirle al alumno que toque
                // primero y arrastre después sería una regla inventada.
                runOnJS(onSelect)(id)
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

                live.value = { id, cx, cy, scale: baseScale }
            })
            .onEnd(() => {
                const l = live.value
                if (l.id !== id) return
                runOnJS(onCommitPosition)(id, l.cx / width, l.cy / height)
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

        const remove = Gesture.LongPress()
            .minDuration(REMOVE_HOLD_MS)
            .onStart(() => {
                // «Quitar» es un gesto de UN dedo por definición. Con dos en el lienzo el alumno
                // está pellizcando: RNGH no le entrega a esta zona el evento del segundo dedo (no lo
                // trackea), así que el corte por cantidad de punteros del propio handler nunca se
                // dispara y el temporizador de 500 ms borraba el sticker en mitad del pellizco.
                if (multiTouch.value) return
                runOnJS(removeHaptic)()
                runOnJS(onRemove)(id)
            })

        const pick = Gesture.Tap().onEnd((_e, ok) => {
            if (ok) runOnJS(onSelect)(id)
        })

        // `Race`: gana el que active primero. Moverse arranca el arrastre, quedarse quieto medio
        // segundo dispara el quitar, y soltar sin nada de eso es un tap de selección.
        return Gesture.Race(drag, remove, pick)
    }, [
        id,
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
        multiTouch,
        onSelect,
        onCommitPosition,
        onRemove,
    ])

    const moved = useAnimatedStyle(() => {
        const d = liveDeltaFor(live.value, id, baseX, baseY, baseScale)
        return {
            transform: [
                { translateX: -boxW / 2 + d.dx },
                { translateY: -boxH / 2 + d.dy },
                { rotate: `${rotation}deg` },
                { scale: d.k },
            ],
        }
    })

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                // `button` y no `adjustable`: arrastrar no es un gesto que un lector de pantalla
                // pueda ejecutar. Lo que sí puede es ELEGIR el sticker acá y después ajustarlo con
                // el stepper accesible del panel de abajo — ese es el camino sin gestos del paso.
                accessible
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Elegir ${STICKER_LABEL[id]}`}
                style={[
                    {
                        position: 'absolute',
                        left: baseX,
                        top: baseY,
                        width: boxW,
                        height: boxH,
                        borderRadius: 10,
                        borderWidth: selected ? 1.5 : 1,
                        // Punteado: se lee como "esto se mueve" y no se confunde con un borde del
                        // propio card. Sin seleccionar queda apenas insinuado — con nueve stickers
                        // encendidos, nueve marcos de acento serían ruido puro.
                        borderStyle: 'dashed',
                        borderColor: selected ? accent : 'rgba(255,255,255,0.16)',
                        backgroundColor: selected ? withAlpha(accent, 0.08) : 'transparent',
                    },
                    moved,
                ]}
            />
        </GestureDetector>
    )
}
