import { memo, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from 'react-native-reanimated'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { Share2 } from 'lucide-react-native'
import { deriveSportTokens, type SportTokens } from '@eva/brand-kit'
import { EXEC_SURFACE } from '../workout/v3/exec-theme'
// `mixToBlack` es EL color de profundidad del lenguaje juicy de V3 (borde + barra dura del botón).
// Se importa en vez de re-implementarse para que este CTA y `JuicyButton` no puedan divergir: si
// mañana el mockup cambia el 55% de mezcla, cambia en un solo lugar.
import { mixToBlack } from '../workout/v3/JuicyButton'
import { FONT } from '../../../lib/typography'
import { haptics } from '../../../lib/haptics'
import { ShareCanvas } from './ShareCanvas'
// Los cuatro logos de red viven en `brand-glyphs` y no acá: los comparte con los botones de destino
// del composer (F5), y duplicar los `Path` garantizaba que un ajuste quedara en una sola superficie.
import { FacebookGlyph, InstagramGlyph, TiktokGlyph, WhatsappGlyph } from './brand-glyphs'
import { cloneStickerLayout, SHARE_LAYOUT } from './share-layout'
import { withAlpha } from './stickers'
import { SHARE_CANVAS_H, SHARE_CANVAS_W, type WorkoutShareData } from './share-types'

/**
 * Share Entreno (F8.2) — el CTA de compartir del resumen post-entreno.
 *
 * Decisión del owner (SPEC §Decisiones 5): "el botón de compartir del resumen debe ser llamativo
 * (glow + shimmer 2 pasadas + redes visibles + mini-thumbnail del card real) y entrar ~1,2-1,8 s
 * después del confetti". Cada una de esas cuatro piezas responde a una objeción distinta:
 *
 *  · **glow pulsante** — el CTA aparece TARDE (la pantalla ya se leyó); sin un latido propio el ojo,
 *    que ya recorrió la pantalla entera, no vuelve.
 *  · **shimmer de DOS pasadas y para** — el brillo infinito de los banners publicitarios cansa y
 *    entrena a ignorar el elemento. Dos pasadas dicen "mírame" una vez y devuelven la pantalla a
 *    la calma. Es la diferencia entre un CTA y un anuncio.
 *  · **iconos de redes** — "Compartir" a secas se lee como "mandar por WhatsApp un texto". Ver los
 *    logos responde en silencio la pregunta real: ¿a dónde va esto?
 *  · **mini-thumbnail del card REAL** — es el único que promete algo concreto: no es "compartir tu
 *    resultado", es "compartir ESTA imagen". El mini se pinta con `ShareCanvas` y los datos de la
 *    sesión, así que nunca puede mentir sobre lo que el alumno va a ver al tocar.
 *
 * ENTRADA: el host manda `play` cuando su pantalla YA se asentó (en el resumen V3, la fase 2 con las
 * stats) y acá se espera `enterDelayMs` más. La barra de acciones RESERVA el espacio desde el primer
 * frame aunque el CTA esté invisible: si el CTA empujara el layout al aparecer, "Volver al inicio"
 * saltaría bajo el dedo del alumno justo cuando lo va a tocar.
 *
 * REDUCED MOTION: sin entrada, sin glow y sin shimmer — el CTA aparece ya puesto en cuanto `play`.
 * El hundido al presionar se conserva (es feedback directo, no decoración: misma regla que
 * `JuicyButton`).
 */

// ── Geometría ────────────────────────────────────────────────────────────────────────────────────

/** Profundidad de la barra dura del juicy V3 (espejo de `JuicyButton.DEPTH`). */
const DEPTH = 5
const PILL_H = 78
const PILL_RADIUS = 18

/**
 * Mini-card: 9:16 EXACTO como el canvas real (`ShareCanvas` deriva el alto del ancho). El mockup
 * pide ~54 px, que es el ALTO; a 9:16 eso daría 30 px de ancho y el bloque se vuelve ruido
 * ilegible. 36×64 es lo más grande que entra CON AIRE en la pastilla (78 − 4 de borde = 74 de caja)
 * y todavía deja distinguir las dos masas que hacen reconocible al card: el fondo de marca y el
 * número del volumen.
 */
const THUMB_W = 36
const THUMB_H = Math.round((THUMB_W * SHARE_CANVAS_H) / SHARE_CANVAS_W)

/** Ancho de la banda de brillo. Más angosta se ve como una raya; más ancha, como un flash. */
const BAND_W = 76
const SHIMMER_MS = 820
const SHIMMER_PASSES = 2
/** Respiro entre que el CTA terminó de entrar y el primer brillo (si no, se pisan). */
const SHIMMER_START_MS = 240

/** Espera por defecto desde `play` hasta la entrada (ventana 1,2-1,8 s del SPEC, medida desde el
 *  mount de la pantalla: en el resumen V3 la fase 2 llega a los 1200 ms ⇒ 1200 + 320 ≈ 1,5 s). */
export const SHARE_CTA_ENTER_DELAY_MS = 320

/**
 * Layout del mini: el de FÁBRICA, nunca el vivo del composer. El chip promete "así se ve tu card
 * recién abierto", que es exactamente con lo que arranca el composer. Constante de módulo y no
 * `useMemo`: es de solo lectura (el canvas jamás muta el layout) y así la referencia es estable para
 * TODAS las instancias.
 */
const MINI_STICKERS = cloneStickerLayout(SHARE_LAYOUT)

// ── Contrato ─────────────────────────────────────────────────────────────────────────────────────

export interface ShareWorkoutCtaProps {
    /**
     * Los MISMOS datos que va a recibir el composer. Tiene que venir de un `useMemo` del host: el
     * mini es un `ShareCanvas` real memoizado por referencia y un `data` nuevo en cada render lo
     * repinta entero (el bloque son ~10 `Text` por el anillo de contorno de cada línea).
     */
    data: WorkoutShareData
    /** Acento del ejecutor (`exec.accent`): el CTA es chrome de la pantalla, no del card. */
    accent: string
    /** Color legible SOBRE el acento (`exec.accentText`). */
    accentText: string
    reducedMotion: boolean
    /** El host lo enciende cuando su pantalla ya se asentó (resumen V3: fase 2, post-confetti). */
    play: boolean
    /** Espera desde `play` hasta la entrada. */
    enterDelayMs?: number
    onPress: () => void
    testID?: string
}

export function ShareWorkoutCta({
    data,
    accent,
    accentText,
    reducedMotion,
    play,
    enterDelayMs = SHARE_CTA_ENTER_DELAY_MS,
    onPress,
    testID,
}: ShareWorkoutCtaProps) {
    const [entered, setEntered] = useState(false)
    const [pressed, setPressed] = useState(false)
    const [pillW, setPillW] = useState(0)
    const dark = mixToBlack(accent, 0.55)

    // Tokens del CARD (no del chrome): el mini tiene que verse igual que el card real, y el card
    // deriva su rampa del color CRUDO de la marca del coach (`data.brand.accent`), no del acento del
    // ejecutor —que en modo 'eva' es verde EVA aunque la marca sea otra—.
    const tokens = useMemo(() => deriveSportTokens(data.brand.accent), [data.brand.accent])

    useEffect(() => {
        if (!play) {
            setEntered(false)
            return
        }
        // reduced-motion: nada de esperas coreografiadas — el CTA está disponible de inmediato.
        if (reducedMotion) {
            setEntered(true)
            return
        }
        const t = setTimeout(() => setEntered(true), enterDelayMs)
        return () => clearTimeout(t)
    }, [play, reducedMotion, enterDelayMs])

    // ── Shimmer: DOS pasadas y muere ──
    // `withRepeat(..., SHIMMER_PASSES, false)` es literalmente el contrato del owner: dos veces, sin
    // reversa, y el valor queda en el destino (la banda estacionada FUERA de la pastilla, invisible).
    // Arranca en -BAND_W para entrar por la izquierda; sin `pillW` medido no hay recorrido que animar.
    const shimmerX = useSharedValue(-BAND_W)
    useEffect(() => {
        if (!entered || reducedMotion || pillW <= 0) return
        shimmerX.value = -BAND_W
        shimmerX.value = withDelay(
            SHIMMER_START_MS,
            withRepeat(
                withTiming(pillW + BAND_W, { duration: SHIMMER_MS, easing: Easing.inOut(Easing.quad) }),
                SHIMMER_PASSES,
                false,
            ),
        )
    }, [entered, reducedMotion, pillW, shimmerX])
    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmerX.value }, { rotate: '14deg' }],
    }))

    const glowing = entered && !reducedMotion

    return (
        <MotiView
            // La entrada es un spring corto: el CTA "aterriza" en vez de aparecer. Sin rebote grande
            // (damping alto) — es un botón, no una notificación.
            from={reducedMotion ? { opacity: 1, translateY: 0, scale: 1 } : { opacity: 0, translateY: 18, scale: 0.94 }}
            animate={{
                opacity: entered ? 1 : 0,
                translateY: entered ? 0 : 18,
                scale: entered ? 1 : 0.94,
            }}
            transition={
                reducedMotion
                    ? { type: 'timing', duration: 0 }
                    : { type: 'spring', damping: 15, stiffness: 180, mass: 0.9 }
            }
            // Invisible ⇒ intocable, también para los lectores de pantalla: sin esto la pastilla
            // recibe taps y se anuncia mientras todavía no existe para el que mira.
            pointerEvents={entered ? 'auto' : 'none'}
            accessibilityElementsHidden={!entered}
            importantForAccessibility={entered ? 'auto' : 'no-hide-descendants'}
        >
            {/* Contenedor con el alto RESERVADO (pastilla + barra de profundidad). */}
            <View style={{ height: PILL_H + DEPTH }}>
                {/* Halo pulsante. Un View tintado y no una sombra: `shadowColor` solo existe en iOS y
                    en Android `elevation` no anima color, así que el glow se vería en una plataforma
                    sola. Escala + opacidad de un View se comportan igual en las dos. */}
                <MotiView
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: -7,
                        right: -7,
                        top: -5,
                        bottom: -1,
                        borderRadius: PILL_RADIUS + 8,
                        backgroundColor: withAlpha(accent, 0.3),
                    }}
                    from={{ opacity: 0.22, scale: 1 }}
                    animate={{ opacity: glowing ? 0.72 : 0.22, scale: glowing ? 1.025 : 1 }}
                    // Mismo ciclo que el latido del juicy (`loop` + `repeatReverse`), un poco más
                    // lento: es respiración de fondo, no un parpadeo.
                    transition={
                        glowing
                            ? { type: 'timing', duration: 1250, loop: true, repeatReverse: true }
                            : { type: 'timing', duration: 0 }
                    }
                />

                {/* Barra dura de profundidad (juicy V3): la cara la tapa al hundirse. */}
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: DEPTH,
                        height: PILL_H,
                        borderRadius: PILL_RADIUS,
                        backgroundColor: dark,
                    }}
                />

                <MotiView
                    animate={{ translateY: pressed ? DEPTH : 0 }}
                    transition={{ type: 'timing', duration: reducedMotion ? 0 : 90 }}
                >
                    <Pressable
                        testID={testID}
                        onPress={() => {
                            haptics.tap()
                            onPress()
                        }}
                        onPressIn={() => setPressed(true)}
                        onPressOut={() => setPressed(false)}
                        onLayout={(e: LayoutChangeEvent) => setPillW(e.nativeEvent.layout.width)}
                        accessibilityRole="button"
                        accessibilityLabel="Compartir mi entreno"
                        accessibilityHint="Arma una imagen con tu resumen para tus historias, WhatsApp o donde quieras"
                        style={{
                            height: PILL_H,
                            borderRadius: PILL_RADIUS,
                            borderWidth: 2,
                            borderColor: dark,
                            backgroundColor: accent,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingHorizontal: 12,
                            // Recorta la banda de brillo a la pastilla: sin esto el shimmer se pasea
                            // por encima de la barra de acciones entera.
                            overflow: 'hidden',
                        }}
                    >
                        <MiniCard data={data} tokens={tokens} />

                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Share2 size={17} color={accentText} strokeWidth={2.4} />
                                <Text
                                    // 16 y no 17: con el mini + el icono + los paddings, en un
                                    // teléfono de 320 dp el label a 17 se corta con puntos suspensivos.
                                    style={{ fontFamily: FONT.uiExtra, fontSize: 16, letterSpacing: 0.3, color: accentText }}
                                    numberOfLines={1}
                                >
                                    Compartir mi entreno
                                </Text>
                            </View>
                            <Text
                                style={{ fontFamily: FONT.uiBold, fontSize: 12, color: withAlpha(accentText, 0.82) }}
                                numberOfLines={1}
                            >
                                Listo para tu historia
                            </Text>
                        </View>

                        {/* Brillo: banda inclinada que cruza dos veces. `pointerEvents="none"` para que
                            jamás se coma el tap del botón que está adornando. */}
                        {!reducedMotion ? (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    {
                                        position: 'absolute',
                                        // Sobresale arriba y abajo: inclinada 14°, una banda del alto
                                        // exacto dejaría dos esquinas sin barrer.
                                        top: -PILL_H,
                                        bottom: -PILL_H,
                                        left: 0,
                                        width: BAND_W,
                                    },
                                    shimmerStyle,
                                ]}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.34)', 'rgba(255,255,255,0)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={{ flex: 1 }}
                                />
                            </Animated.View>
                        ) : null}
                    </Pressable>
                </MotiView>
            </View>

            <SocialRow />
        </MotiView>
    )
}

/**
 * Mini del card REAL, memoizado por referencia de `data`.
 *
 * Es el nodo más caro del CTA (el bloque entero, aunque a 36 px `StrokedText` ya pinta «plano» y se
 * ahorra el anillo) y vive dentro de un botón que late y brilla: sin `memo` se repintaría en cada
 * tick de presión. El `pointerEvents`
 * en 'none' es obligatorio — el mini es decorativo y el tap tiene que llegar entero al Pressable.
 */
const MiniCard = memo(function MiniCard({
    data,
    tokens,
}: {
    data: WorkoutShareData
    tokens: SportTokens
}) {
    return (
        <View
            pointerEvents="none"
            // +2 de caja para que el borde de 1 px NO recorte el canvas: adentro tiene que quedar
            // exactamente THUMB_W×THUMB_H o el card se ve mordido por los cuatro lados.
            style={{
                width: THUMB_W + 2,
                height: THUMB_H + 2,
                borderRadius: 9,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.28)',
            }}
        >
            <ShareCanvas
                data={data}
                stickers={MINI_STICKERS}
                // `photoUri` null con `background:'photo'` cae al fondo de marca (el canvas lo
                // resuelve solo): acá todavía no hay foto porque el alumno no abrió el composer.
                background={SHARE_LAYOUT.background}
                photoUri={null}
                width={THUMB_W}
                tokens={tokens}
            />
        </View>
    )
})

/**
 * Fila de redes: responde "¿a dónde va esto?" sin prometer integraciones que no existen. Los cuatro
 * glifos son SVG INLINE (lucide dejó de traer iconos de marca y no vamos a sumar una dependencia por
 * cuatro logos de 15 px) y van monocromos y apagados a propósito: son una PISTA del destino, no
 * botones — el destino real se elige en el paso 3 del composer.
 */
function SocialRow() {
    const c = EXEC_SURFACE.textMuted
    return (
        <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 9 }}
            // Un solo nodo accesible: cuatro logos sueltos serían cuatro paradas de lector de
            // pantalla que no llevan a ninguna acción.
            accessible
            accessibilityRole="text"
            accessibilityLabel="Instagram, WhatsApp, TikTok, Facebook y donde quieras"
        >
            <InstagramGlyph color={c} size={NET} opacity={NET_OPACITY} />
            <WhatsappGlyph color={c} size={NET} opacity={NET_OPACITY} />
            <TiktokGlyph color={c} size={NET} opacity={NET_OPACITY} />
            <FacebookGlyph color={c} size={NET} opacity={NET_OPACITY} />
            <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: c, marginLeft: 2 }}>y donde quieras</Text>
        </View>
    )
}

/** Tamaño de los glifos de red y su opacidad: presentes, nunca protagonistas. */
const NET = 15
const NET_OPACITY = 0.8
