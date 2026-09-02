import { View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { localDateFromISO, sizer, strokeSizer, type StickerProps } from './sticker-kit'

/**
 * Fecha, formato es-CL corto ("19 ago").
 *
 * Corto a propósito: el card ya dice todo lo demás, y una fecha larga ("19 de agosto de 2026")
 * ocupa el ancho de media story sin agregar nada. La fecha se parsea LOCAL (ver `localDateFromISO`):
 * `new Date('2026-08-19')` es UTC y en Chile retrocedía un día.
 *
 * Dejó de ser un chip con pill y borde: es texto suelto con contorno. Los presets que lo anclaban
 * contra un borde de la story (`placa`, `heatmap`, `marcador`, `poster`) corrigieron su x para
 * conservar el mismo margen — al perder los paddings, la caja se angostó y el centro se movía.
 */
export function DateChipSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const label = localDateFromISO(data.dateISO)
        .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        // es-CL devuelve "19 ago." con punto final; sobra.
        .replace(/\.$/, '')

    return (
        <View style={{ alignSelf: 'flex-start' }}>
            <StrokedText
                sw={sw}
                style={{
                    fontFamily: FONT.uiSemibold,
                    fontSize: s(28),
                    lineHeight: s(36),
                    letterSpacing: s(1),
                }}
                numberOfLines={1}
            >
                {label}
            </StrokedText>
        </View>
    )
}
