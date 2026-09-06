import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { OUTLINE_COLOR, PLAIN_CANVAS_SCALE, STROKE, strokeShadow, type StrokeSizer } from './sticker-kit'

/**
 * Texto BLANCO con contorno negro fino, por copias apiladas.
 *
 * El card se lee sobre la foto del alumno (a veces un ventanal, a veces ropa blanca) y ya no tiene
 * ningún fondo detrás de los datos: el contorno es lo ÚNICO que separa el texto de la imagen.
 *
 * ── POR QUÉ COPIAS Y NO OTRA COSA ──
 * RN no tiene stroke de texto. `textShadow` da un halo difuso, no un contorno. `react-native-svg`
 * no soporta `paint-order`, así que su stroke se pinta centrado sobre el glifo y le come la mitad
 * hacia adentro (adelgaza la letra). Skia daría stroke real pero exige `useFont()` con archivos de
 * fuente y hay reportes de que `react-native-view-shot` captura su surface en negro en Android — y
 * este card SE CAPTURA, no vale la pena arriesgar el PNG. Quedan las copias: RN puro, se rasterizan
 * bien y el grosor es exacto.
 *
 * ── CÓMO SE APILA ──
 * 1. Una copia EN FLUJO con `opacity: 0` — es la que define la caja que mide `ShareCanvas` con su
 *    `onLayout` para anclar el sticker por el centro. Sin ella el wrapper mediría 0.
 * 2. Las copias negras, absolutas, desplazadas por `transform` (nunca `left/top`: no re-disparan
 *    layout) en las 8 direcciones del anillo.
 * 3. La copia blanca, absoluta, al final: el orden del JSX es el orden de pintado.
 *
 * Las 10 comparten EXACTAMENTE el mismo estilo salvo el color, y `numberOfLines` /
 * `adjustsFontSizeToFit` / `ellipsizeMode` viajan a todas: si difieren, el contorno se desalinea en
 * cuanto el texto trunca.
 *
 * ── EL CAMINO «PLANO» ──
 * Bajo `PLAIN_CANVAS_SCALE` (el mini-card del CTA del resumen, 36 px de ancho) no hay anillo: un
 * solo `Text` blanco con la sombra. A esa escala el contorno vale centésimas de píxel sobre una
 * letra de ~2 px — las copias no dibujan un borde, embarran el glifo — y montar 10 nodos por texto
 * castiga el tiempo de montaje sin que se vea nada a cambio.
 */

/** Anillo cerrado: 4 rectas + 4 diagonales. */
const RING_FULL: ReadonlyArray<readonly [number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
]

/**
 * Anillo barato (solo diagonales). Con un contorno de menos de 1 px las diagonales ya cubren el
 * perímetro y el ahorro importa donde hay muchas líneas: el set-list son 8 filas × 3 textos.
 */
const RING_DIAGONAL: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
]

export interface StrokedTextProps extends Omit<TextProps, 'style' | 'children'> {
    style?: StyleProp<TextStyle>
    /**
     * Estilo del wrapper. Solo para lo que ANTES vivía en el `<Text>` y es layout del padre
     * (`flex: 1` de la fila del set-list): el wrapper es el que ocupa el lugar del texto original.
     */
    containerStyle?: StyleProp<ViewStyle>
    /**
     * Escalador `diseño-1080 → px reales` del sticker (`strokeSizer(k, stickerScale)`).
     *
     * Se pasa el ESCALADOR y no el grosor ya escalado porque de él salen tres cosas que tienen que
     * moverse juntas: el contorno (`sw(stroke)`), la sombra fija del mockup (`strokeShadow(sw)`) y
     * el umbral de miniatura. Con solo el grosor, la sombra terminaba siendo proporcional al
     * contorno y el héroe quedaba con una mancha difusa.
     */
    sw: StrokeSizer
    /** Grosor del contorno en px de DISEÑO-1080 (ver `STROKE`). */
    stroke?: number
    /** Color del contorno. */
    outlineColor?: string
    /** `diagonal` = 4 copias en vez de 8, para bloques con muchas líneas. */
    ring?: 'full' | 'diagonal'
    children: ReactNode
}

export function StrokedText({
    style,
    containerStyle,
    sw,
    stroke = STROKE.sm,
    outlineColor = OUTLINE_COLOR,
    ring = 'full',
    children,
    ...rest
}: StrokedTextProps) {
    // El card es una imagen de tamaño fijo: el font scaling del sistema desalinearía las copias y
    // desbordaría el sticker. Nunca escala, en ninguna copia.
    const shared = { ...rest, allowFontScaling: false }

    // Miniatura: el anillo no se ve como contorno sino como suciedad. Un solo `Text` blanco con la
    // sombra — que a esta escala es lo único que aporta legibilidad — y listo. Sigue siendo el que
    // define la caja que mide `ShareCanvas`.
    if (sw.canvasScale < PLAIN_CANVAS_SCALE) {
        return (
            <View style={[{ position: 'relative' }, containerStyle]}>
                <Text {...shared} style={[style, { color: '#FFFFFF' }, strokeShadow(sw)]}>
                    {children}
                </Text>
            </View>
        )
    }

    const w = sw(stroke)
    const offsets = ring === 'diagonal' ? RING_DIAGONAL : RING_FULL

    return (
        <View style={[{ position: 'relative' }, containerStyle]}>
            <Text
                {...shared}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[style, { opacity: 0 }]}
            >
                {children}
            </Text>
            {offsets.map(([dx, dy]) => (
                <Text
                    key={`${dx}:${dy}`}
                    {...shared}
                    accessible={false}
                    accessibilityElementsHidden
                    // Sin esto TalkBack leería el mismo texto nueve veces.
                    importantForAccessibility="no-hide-descendants"
                    style={[
                        style,
                        StyleSheet.absoluteFillObject,
                        { color: outlineColor, transform: [{ translateX: dx * w }, { translateY: dy * w }] },
                    ]}
                >
                    {children}
                </Text>
            ))}
            {/* La copia visible. La sombra va SOLO acá: repetida en las 8 copias negras se sumaría
                hasta volverse una mancha opaca. */}
            <Text {...shared} style={[style, StyleSheet.absoluteFillObject, { color: '#FFFFFF' }, strokeShadow(sw)]}>
                {children}
            </Text>
        </View>
    )
}
