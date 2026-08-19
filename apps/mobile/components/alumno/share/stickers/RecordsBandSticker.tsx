import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { AMBER_200, formatKg, sizer, TABULAR, W72, withAlpha, type StickerProps } from './sticker-kit'

/**
 * Banda de récords: la línea que hace que valga la pena compartir el entreno.
 *
 * Ámbar y no marca del coach: el logro es del ALUMNO, y el ámbar lo separa del resto del card (que
 * sí es white-label). Devuelve `null` sin récords — el canvas igual respeta la visibilidad del
 * preset, pero un sticker vacío no debe ocupar espacio ni pintar borde.
 *
 * Ancho por `maxWidth` (no `width` fijo): en la columna angosta del preset "sello" una banda rígida
 * de 940 px de diseño se salía del canvas.
 */
export function RecordsBandSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const records = data.records
    if (records.length === 0) return null

    const first = records[0]
    const headline = records.length === 1 ? '🏆 Récord personal' : `🏆 ${records.length} récords`
    const detail = `${first.exerciseName} ${formatKg(first.weightKg)} kg → 1RM est. ${formatKg(first.oneRmEstKg)} kg`

    return (
        <View
            style={{
                maxWidth: s(940),
                backgroundColor: withAlpha(AMBER_200, 0.07),
                borderRadius: s(26),
                borderWidth: Math.max(1, s(2)),
                borderColor: withAlpha(AMBER_200, 0.22),
                paddingHorizontal: s(32),
                paddingVertical: s(22),
                gap: s(6),
            }}
        >
            <Text
                style={{
                    fontFamily: FONT.displayBold,
                    fontSize: s(32),
                    lineHeight: s(40),
                    letterSpacing: s(2),
                    textTransform: 'uppercase',
                    color: AMBER_200,
                }}
                numberOfLines={1}
            >
                {headline}
            </Text>
            <Text
                style={{ fontFamily: FONT.uiSemibold, fontSize: s(30), lineHeight: s(38), color: W72, ...TABULAR }}
                numberOfLines={2}
            >
                {detail}
            </Text>
        </View>
    )
}
