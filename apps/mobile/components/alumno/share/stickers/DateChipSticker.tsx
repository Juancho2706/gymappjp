import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { localDateFromISO, sizer, W08, W10, W72, type StickerProps } from './sticker-kit'

/**
 * Chip de fecha, formato es-CL corto ("19 ago").
 *
 * Corto a propósito: el card ya dice todo lo demás, y una fecha larga ("19 de agosto de 2026")
 * ocupa el ancho de media story sin agregar nada. La fecha se parsea LOCAL (ver `localDateFromISO`):
 * `new Date('2026-08-19')` es UTC y en Chile retrocedía un día.
 */
export function DateChipSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const label = localDateFromISO(data.dateISO)
        .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        // es-CL devuelve "19 ago." con punto final; sobra en un chip.
        .replace(/\.$/, '')

    return (
        <View
            style={{
                alignSelf: 'flex-start',
                backgroundColor: W08,
                borderRadius: 9999,
                borderWidth: Math.max(1, s(2)),
                borderColor: W10,
                paddingHorizontal: s(26),
                paddingVertical: s(12),
            }}
        >
            <Text
                style={{
                    fontFamily: FONT.uiSemibold,
                    fontSize: s(28),
                    lineHeight: s(36),
                    letterSpacing: s(1),
                    color: W72,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    )
}
