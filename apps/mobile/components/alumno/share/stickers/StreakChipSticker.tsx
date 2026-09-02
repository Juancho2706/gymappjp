import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { sizer, strokeShadow, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/**
 * Chip de racha semanal ("3 de 4 esta semana").
 *
 * Ya no es un chip pintado: se fueron la pill ember, su borde y sus paddings. Queda el 🔥 y el texto
 * en blanco con contorno, como el resto de los datos (decisión F.6.2, opción A — el ember del
 * sistema también salía del card; revertirlo es cambiar este color y nada más).
 *
 * El emoji va en un `<Text>` pelado A PROPÓSITO: `color` no pinta un glifo de color, así que las
 * copias del contorno dibujarían ocho fuegos completos corridos alrededor del original en vez de un
 * borde. Lleva la MISMA sombra que el texto (`strokeShadow`, que `textShadow` sí respeta en un glifo
 * de color): sin ella el fuego naranja sobre una pared clara o un ventanal se borra, mientras el
 * texto de al lado se sigue leyendo. Y no escala con el tamaño de fuente del sistema — con «Máximo»
 * crecía ~1,3× y descentraba la fila entera, que además re-ancla el sticker por otro centro.
 *
 * `null` sin copy: la racha solo se pinta cuando `WeeklyStreak.hasSignal` (el adaptador ya filtra).
 * Un "Sin sesiones esta semana" justo al terminar de entrenar sería absurdo.
 */
export function StreakChipSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    if (!data.streakCopy) return null

    return (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Text
                allowFontScaling={false}
                style={{ fontFamily: FONT.ui, fontSize: s(28), lineHeight: s(36), ...strokeShadow(sw) }}
            >
                🔥
            </Text>
            <StrokedText
                sw={sw}
                style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(36), ...TABULAR }}
                numberOfLines={1}
            >
                {data.streakCopy}
            </StrokedText>
        </View>
    )
}
