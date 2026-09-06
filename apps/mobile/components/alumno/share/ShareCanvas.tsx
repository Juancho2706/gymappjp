import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { SportTokens } from '@eva/brand-kit'
import { STICKER_PAINT_ORDER } from './share-layout'
import {
    liveDeltaFor,
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    type ShareBackground,
    type StickerId,
    type StickerLiveTransform,
    type StickerSize,
    type StickerState,
    type WorkoutShareData,
} from './share-types'
import { INK_900, INK_950, StatsBlockSticker } from './stickers'

/**
 * Share Entreno — el LIENZO. Es exactamente el nodo que `captureRef` rasteriza a 1080×1920.
 *
 * Componente PURO por contrato: sin queries, sin ThemeContext (el acento llega en `tokens`), sin
 * gestos y sin chrome de edición. Todo lo que se vea acá sale en el PNG — por eso la edición
 * envuelve al bloque POR FUERA con `GestureDetector` en vez de meter handles adentro: un borde
 * punteado capturado sería un bug imposible de explicarle al alumno.
 *
 * Lo ÚNICO que la capa de gestos mete adentro es el desplazamiento vivo del arrastre
 * (`liveTransform`): es un transform, no un adorno, así que no pinta nada nuevo y al soltar vuelve a
 * cero. El marco punteado y las guías de alineación se quedan afuera, en `StickerGestureLayer`.
 *
 * El canvas NO redondea sus esquinas (`borderRadius: 0`): el PNG va full-bleed a la story. El
 * preview de la pantalla puede redondearlo envolviéndolo en un View con `overflow:'hidden'`.
 */
export interface ShareCanvasProps {
    data: WorkoutShareData
    /** Layout vivo del composer (arranca en el de fábrica, el alumno lo mueve y lo escala). */
    stickers: Record<StickerId, StickerState>
    background: ShareBackground
    /** `file://` de cámara/galería. `null` con `background: 'photo'` ⇒ cae a fondo de marca. */
    photoUri: string | null
    /** Ancho de render en px. El alto sale de él: el canvas es 9:16 SIEMPRE. */
    width: number
    tokens: SportTokens
    /**
     * Emite la medida viva del bloque montado. El canvas ya la tiene — la necesita para anclar por
     * el centro — y la capa de gestos la necesita para poner su zona de arrastre EXACTAMENTE
     * encima; duplicar la medición en la capa (con un hijo fantasma) daría dos verdades que se
     * desincronizan en el primer texto que cambie de largo.
     */
    reportSizes?: (sizes: Partial<Record<StickerId, StickerSize>>) => void
    /**
     * Arrastre/pellizco VIVO. Cuando llega, el bloque se envuelve en `Animated.View` y sigue el dedo
     * en el UI thread; el commit a `stickers` ocurre al soltar.
     *
     * NO lo pases y lo saques en caliente: cambiar el tipo de elemento (View ⇄ Animated.View)
     * REMONTA el sticker. El composer lo pasa desde el montaje; los minis decorativos (el CTA del
     * resumen, el harness) NUNCA lo pasan — no se arrastran.
     */
    liveTransform?: SharedValue<StickerLiveTransform>
}

// El filtro `hasContentFor` (auto-ocultado por datos) se retiró junto con los 9 stickers: el bloque
// SIEMPRE tiene algo que decir. Sin volumen cae al fallback de series (`share-block.ts`) y sin
// músculos identificados solo se saltea esa línea — nunca mide 0×0 ni deja una caja vacía que
// arrastrar.

export function ShareCanvas({
    data,
    stickers,
    background,
    photoUri,
    width,
    tokens,
    reportSizes,
    liveTransform,
}: ShareCanvasProps) {
    // Sin redondear: `captureRef` re-escala el nodo a 1080×1920 exactos y cualquier desvío de
    // aspecto acá se traduce en un estiramiento del PNG.
    const height = (width * SHARE_CANVAS_H) / SHARE_CANVAS_W
    const k = width / SHARE_CANVAS_W

    // Foto pedida pero no elegida (o revocada) ⇒ marca. Sin esto el canvas quedaba negro y el alumno
    // no entendía por qué su card estaba "vacía".
    const bg: ShareBackground = background === 'photo' && !photoUri ? 'brand' : background

    const [sizes, setSizes] = useState<Partial<Record<StickerId, StickerSize>>>({})

    const onStickerLayout = useCallback(
        (id: StickerId) => (e: LayoutChangeEvent) => {
            const { width: w, height: h } = e.nativeEvent.layout
            setSizes((prev) => {
                const cur = prev[id]
                // Guard de igualdad: sin él cada `onLayout` dispara un render que vuelve a disparar
                // `onLayout` (el transform cambia la caja pintada, no la de layout, pero RN reemite
                // igual en algunos casos) y el canvas entra en bucle.
                if (cur && Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5) return prev
                return { ...prev, [id]: { w, h } }
            })
        },
        [],
    )

    // Publicar hacia afuera SOLO cuando la medición cambió de verdad (el guard de arriba conserva la
    // referencia si no cambió), así el consumidor no re-renderiza en cada pasada de layout.
    useEffect(() => {
        reportSizes?.(sizes)
    }, [sizes, reportSizes])

    function renderSticker(id: StickerId, state: StickerState) {
        const props = { data, k, stickerScale: state.scale, tokens }
        switch (id) {
            case 'bloque':
                return <StatsBlockSticker {...props} />
        }
    }

    return (
        <View
            // `collapsable={false}`: en modo transparente el contenedor no pinta nada y Android puede
            // fusionarlo con su padre — el nodo que `captureRef` busca dejaría de existir. El caller
            // debe hacer lo mismo con el View al que le cuelga el ref (ver `share-capture.ts`).
            collapsable={false}
            style={{
                width,
                height,
                overflow: 'hidden',
                borderRadius: 0,
                // Modo sticker: fondo REALMENTE transparente para que el PNG salga con alpha y se
                // pueda pegar dentro de Instagram sobre la foto del propio usuario (SPEC §Editor).
                backgroundColor: bg === 'transparent' ? 'transparent' : INK_950,
            }}
        >
            {/* SIN velo inferior (decisión F del owner, 02-09): la banda de datos ya se lee sobre
                cualquier foto gracias al contorno blanco de los stickers, y el degradado oscuro
                apagaba justo la parte de la foto que el alumno quiere mostrar. Si alguna vez hace
                falta aire, va NEUTRO oscuro — nunca teñido de marca. */}
            {bg === 'photo' && photoUri ? (
                // `transition={0}`: cualquier fade de entrada arriesga que view-shot congele un
                // frame a medio camino y el PNG salga lavado.
                <Image
                    source={{ uri: photoUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={0}
                    alt="Foto del entreno"
                />
            ) : null}

            {bg === 'brand' ? (
                <>
                    {/* Base de tinta en diagonal, igual que el motor `ShareCard` (:418-424): el card
                        nunca es un negro plano. */}
                    <LinearGradient
                        colors={[INK_950, INK_900]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* NO va halo de acento acá. La regla del owner es literal: el color del coach
                        vive SOLO en la silueta. En `heatmap`/`setlist` la cifra héroe cae en
                        y≈0,12 — o sea DENTRO de donde llegaba el halo—, así que era acento detrás
                        de un dato. Si el fondo necesitara aire, el velo va NEUTRO oscuro, nunca
                        teñido de marca (el de la foto se retiró en la decisión F del 02-09). */}
                </>
            ) : null}

            {STICKER_PAINT_ORDER.map((id) => {
                const state = stickers[id]
                if (!state || !state.visible) return null

                const size = sizes[id]
                const slot = {
                    state,
                    size,
                    width,
                    height,
                    onLayout: onStickerLayout(id),
                    children: renderSticker(id, state),
                }
                return liveTransform ? (
                    <LiveStickerSlot key={id} id={id} live={liveTransform} {...slot} />
                ) : (
                    <StaticStickerSlot key={id} {...slot} />
                )
            })}
        </View>
    )
}

// ── Anclaje de un sticker ────────────────────────────────────────────────────────────────────────

interface SlotProps {
    state: StickerState
    size: StickerSize | undefined
    width: number
    height: number
    onLayout: (e: LayoutChangeEvent) => void
    children: ReactNode
}

/**
 * Camino por defecto (minis decorativos): un `View` pelado, sin Reanimated.
 *
 * Ancla en la esquina superior-izquierda; el centrado real lo hace el transform. OJO: Yoga mide al
 * hijo absoluto contra el ANCHO COMPLETO del canvas (no contra el resto a la derecha de `left`), así
 * que un bloque anclado cerca del borde se mide entero y después desborda.
 */
function StaticStickerSlot({ state, size, width, height, onLayout, children }: SlotProps) {
    return (
        <View
            onLayout={onLayout}
            style={{
                position: 'absolute',
                left: state.x * width,
                top: state.y * height,
                // Hasta la primera medición no sabemos cuánto correrlo: pintarlo sería mostrar un
                // frame con el sticker descolocado (salto visible, y peor: capturable si el usuario
                // aprieta compartir en ese instante).
                opacity: size ? 1 : 0,
                transform: [
                    { translateX: size ? -size.w / 2 : 0 },
                    { translateY: size ? -size.h / 2 : 0 },
                ],
            }}
        >
            {children}
        </View>
    )
}

/**
 * Mismo anclaje, pero con el desplazamiento vivo del arrastre sumado en el UI thread.
 *
 * El sticker REAL es el que se mueve — no una copia dibujada en la capa de gestos. Se probó lo
 * contrario (ocultar el original y arrastrar un clon) y sale caro por dos lados: duplica el camino
 * de render y obliga a desmontar/remontar el bloque en cada toque, que se siente como un tirón justo
 * al empezar a arrastrar.
 *
 * `left`/`top` siguen siendo layout normal (posición YA commiteada) y el delta viaja por transform:
 * al soltar, React re-renderiza con la posición nueva y `liveDeltaFor` devuelve 0 en ese MISMO
 * render, así que no hay ni un frame con las dos cosas aplicadas ni con ninguna.
 *
 * El orden del transform (`translate → scale`) tiene que ser EL MISMO que el de la zona de gesto en
 * `StickerGestureLayer`: si se separan, el marco punteado deja de calzar con el bloque al pellizcar.
 */
function LiveStickerSlot({
    id,
    live,
    state,
    size,
    width,
    height,
    onLayout,
    children,
}: SlotProps & { id: StickerId; live: SharedValue<StickerLiveTransform> }) {
    const baseX = state.x * width
    const baseY = state.y * height
    const baseScale = state.scale
    const w = size ? size.w : 0
    const h = size ? size.h : 0

    const moved = useAnimatedStyle(() => {
        const d = liveDeltaFor(live.value, id, baseX, baseY, baseScale)
        return {
            transform: [
                { translateX: -w / 2 + d.dx },
                { translateY: -h / 2 + d.dy },
                { scale: d.k },
            ],
        }
    })

    return (
        <Animated.View
            onLayout={onLayout}
            style={[{ position: 'absolute', left: baseX, top: baseY, opacity: size ? 1 : 0 }, moved]}
        >
            {children}
        </Animated.View>
    )
}
