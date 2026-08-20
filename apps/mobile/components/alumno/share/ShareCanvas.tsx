import { useCallback, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { SportTokens } from '@eva/brand-kit'
import { STICKER_PAINT_ORDER } from './share-presets'
import {
    SHARE_CANVAS_H,
    SHARE_CANVAS_W,
    type MuscleView,
    type ShareBackground,
    type StickerId,
    type StickerState,
    type WorkoutShareData,
} from './share-types'
import {
    accentOf,
    BrandFooterSticker,
    DateChipSticker,
    INK_900,
    INK_950,
    MuscleFigureSticker,
    QrSticker,
    RecordsBandSticker,
    SetlistSticker,
    StatsRowSticker,
    StreakChipSticker,
    VolumenHeroSticker,
    withAlpha,
} from './stickers'

/**
 * Share Entreno (F2) — el LIENZO. Es exactamente el nodo que `captureRef` rasteriza a 1080×1920.
 *
 * Componente PURO por contrato: sin queries, sin ThemeContext (el acento llega en `tokens`), sin
 * gestos y sin chrome de edición. Todo lo que se vea acá sale en el PNG — por eso el modo Acomodar
 * (F4) envuelve los stickers POR FUERA con `GestureDetector` en vez de meter handles adentro: un
 * borde de selección capturado sería un bug imposible de explicarle al alumno.
 *
 * El canvas NO redondea sus esquinas (`borderRadius: 0`): el PNG va full-bleed a la story. El
 * preview de la pantalla puede redondearlo envolviéndolo en un View con `overflow:'hidden'`.
 */
export interface ShareCanvasProps {
    data: WorkoutShareData
    /** Layout vivo del composer (arranca en los defaults del preset, el alumno lo mueve). */
    stickers: Record<StickerId, StickerState>
    muscleView: MuscleView
    background: ShareBackground
    /** `file://` de cámara/galería. `null` con `background: 'photo'` ⇒ cae a fondo de marca. */
    photoUri: string | null
    /** Ancho de render en px. El alto sale de él: el canvas es 9:16 SIEMPRE. */
    width: number
    tokens: SportTokens
    /** Preset Póster: la cifra gigante va delante del sujeto con alpha bajo (PLAN §Póster). */
    posterGhost?: boolean
    /**
     * Sub-toggle del editor (F3): el `@handle` del coach vive DENTRO del sticker de marca, así que
     * no tiene `visible` propio en el layout — viaja como prop hasta `BrandFooterSticker`.
     * Default `true` (el handle es el mecanismo de growth del feature).
     */
    showHandle?: boolean
}

/** Medida de un sticker ya montado (necesaria para anclarlo por su CENTRO). */
interface Measured {
    w: number
    h: number
}

/**
 * Auto-ocultado POR DATOS, además del `visible` del preset.
 *
 * Los stickers ya devuelven `null` sin contenido, pero un wrapper vacío igual se monta, se mide y
 * ocupa un turno de layout. Filtrarlo acá deja el árbol capturado limpio y evita que el modo
 * Acomodar (F4) ofrezca arrastrar una caja de 0×0 invisible.
 */
function hasContentFor(id: StickerId, data: WorkoutShareData): boolean {
    switch (id) {
        case 'records':
            return data.records.length > 0
        case 'qr':
            return !!data.inviteUrl
        case 'racha':
            return !!data.streakCopy
        case 'setlist':
            return data.exercises.length > 0
        default:
            return true
    }
}

export function ShareCanvas({
    data,
    stickers,
    muscleView,
    background,
    photoUri,
    width,
    tokens,
    posterGhost = false,
    showHandle = true,
}: ShareCanvasProps) {
    // Sin redondear: `captureRef` re-escala el nodo a 1080×1920 exactos y cualquier desvío de
    // aspecto acá se traduce en un estiramiento del PNG.
    const height = (width * SHARE_CANVAS_H) / SHARE_CANVAS_W
    const k = width / SHARE_CANVAS_W
    const accent = accentOf(tokens)

    // Foto pedida pero no elegida (o revocada) ⇒ marca. Sin esto el canvas quedaba negro y el alumno
    // no entendía por qué su card estaba "vacía".
    const bg: ShareBackground = background === 'photo' && !photoUri ? 'brand' : background

    const [sizes, setSizes] = useState<Partial<Record<StickerId, Measured>>>({})

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

    function renderSticker(id: StickerId, state: StickerState) {
        const props = { data, k, stickerScale: state.scale, tokens }
        switch (id) {
            case 'volumen':
                return <VolumenHeroSticker {...props} ghost={posterGhost} />
            case 'stats':
                return <StatsRowSticker {...props} />
            case 'musculos':
                return <MuscleFigureSticker {...props} view={muscleView} />
            case 'records':
                return <RecordsBandSticker {...props} />
            case 'setlist':
                return <SetlistSticker {...props} />
            case 'marca':
                return <BrandFooterSticker {...props} showHandle={showHandle} />
            case 'fecha':
                return <DateChipSticker {...props} />
            case 'racha':
                return <StreakChipSticker {...props} />
            case 'qr':
                return <QrSticker {...props} />
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
            {bg === 'photo' && photoUri ? (
                <>
                    {/* `transition={0}`: cualquier fade de entrada arriesga que view-shot congele un
                        frame a medio camino y el PNG salga lavado. */}
                    <Image
                        source={{ uri: photoUri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={0}
                        alt="Foto del entreno"
                    />
                    {/* Velo inferior: la banda de datos vive abajo y sobre una foto clara (gimnasio
                        con ventanales, ropa blanca) el texto blanco desaparecía. Sutil a propósito —
                        oscurecer la foto entera mataría justo lo que el alumno quiere mostrar. */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.38 }}
                        pointerEvents="none"
                    />
                </>
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
                    {/* Halo de marca arriba-centro (espejo del mockup y de ShareCard:427-432). RN no
                        tiene gradiente radial: un lineal pesado hacia arriba lee como la misma
                        "energía" detrás del héroe. Va ENCIMA de la tinta, no debajo, o el tinte se
                        pierde bajo el gradiente base. */}
                    <LinearGradient
                        colors={[withAlpha(accent, 0.18), withAlpha(accent, 0)]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 0.55 }}
                        style={StyleSheet.absoluteFill}
                    />
                </>
            ) : null}

            {STICKER_PAINT_ORDER.map((id) => {
                const state = stickers[id]
                if (!state || !state.visible) return null
                if (!hasContentFor(id, data)) return null

                const size = sizes[id]
                return (
                    <View
                        key={id}
                        onLayout={onStickerLayout(id)}
                        style={{
                            position: 'absolute',
                            // Ancla en la esquina superior-izquierda; el centrado real lo hace el
                            // transform de abajo. OJO: Yoga mide al hijo absoluto contra el ANCHO
                            // COMPLETO del canvas (no contra el resto a la derecha de `left`), así
                            // que un sticker anclado en x=0.93 se mide entero y luego desborda —
                            // que es justo lo que necesitan los rieles laterales rotados.
                            left: state.x * width,
                            top: state.y * height,
                            // Hasta la primera medición no sabemos cuánto correrlo: pintarlo sería
                            // mostrar un frame con el sticker descolocado (salto visible, y peor:
                            // capturable si el usuario aprieta compartir en ese instante).
                            opacity: size ? 1 : 0,
                            transform: [
                                { translateX: size ? -size.w / 2 : 0 },
                                { translateY: size ? -size.h / 2 : 0 },
                                // La rotación va DESPUÉS del centrado: RN no tiene `transformOrigin`
                                // y gira sobre el centro de la caja, así que con el sticker ya
                                // anclado por su centro el giro sale donde corresponde (contrato
                                // documentado en `StickerState.rotation`).
                                ...(state.rotation ? [{ rotate: `${state.rotation}deg` }] : []),
                            ],
                        }}
                    >
                        {renderSticker(id, state)}
                    </View>
                )
            })}
        </View>
    )
}
