import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { formatKg, sizer, strokeShadow, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/**
 * Récords: la línea que hace que valga la pena compartir el entreno.
 *
 * Ya no es una banda — se fueron el tinte ámbar, el borde y los paddings — y el ámbar del titular
 * pasó a blanco con contorno (decisión F.6.1, opción A: el card entero quedó sin color salvo la
 * silueta; si el owner prefiere conservar el oro del logro, es cambiar el `color` de una línea).
 *
 * El 🏆 se separó del texto en su propio `<Text>`: es un glifo de color y las copias del contorno lo
 * dibujarían ocho veces alrededor. Antes viajaba dentro del string del titular. Sí lleva la sombra
 * (`textShadow` respeta el color del glifo) — sin ella el oro sobre un fondo cálido desaparece — y
 * no escala con el tamaño de fuente del sistema, que descentraría la fila.
 *
 * Devuelve `null` sin récords — el canvas igual respeta la visibilidad del preset, pero un sticker
 * vacío no debe ocupar espacio.
 *
 * Ancho por `maxWidth` (no `width` fijo): en la columna angosta del preset "sello" una banda rígida
 * de 940 px de diseño se salía del canvas.
 */
export function RecordsBandSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const records = data.records
    if (records.length === 0) return null

    const first = records[0]
    const headline = records.length === 1 ? 'Récord personal' : `${records.length} récords`
    const detail = `${first.exerciseName} ${formatKg(first.weightKg)} kg → 1RM est. ${formatKg(first.oneRmEstKg)} kg`

    return (
        <View style={{ maxWidth: s(940), gap: s(6) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
                <Text
                    allowFontScaling={false}
                    style={{ fontFamily: FONT.ui, fontSize: s(32), lineHeight: s(40), ...strokeShadow(sw) }}
                >
                    🏆
                </Text>
                <StrokedText
                    sw={sw}
                    style={{
                        fontFamily: FONT.displayBold,
                        fontSize: s(32),
                        lineHeight: s(40),
                        letterSpacing: s(2),
                        textTransform: 'uppercase',
                    }}
                    numberOfLines={1}
                >
                    {headline}
                </StrokedText>
            </View>
            <StrokedText
                sw={sw}
                style={{ fontFamily: FONT.uiSemibold, fontSize: s(30), lineHeight: s(38), ...TABULAR }}
                numberOfLines={2}
            >
                {detail}
            </StrokedText>
        </View>
    )
}
