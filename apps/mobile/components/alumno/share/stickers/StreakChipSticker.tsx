import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { EMBER_500, sizer, TABULAR, withAlpha, type StickerProps } from './sticker-kit'

/**
 * Chip de racha semanal ("3 de 4 esta semana").
 *
 * Tono ember (#FF6A3D) y no la marca del coach: es el mismo naranja que usa la variante `streak` del
 * motor `ShareCard` (ShareCard.tsx:93, 129) — el fuego es un tono del SISTEMA, así lee igual venga
 * de la marca que venga.
 *
 * `null` sin copy: la racha solo se pinta cuando `WeeklyStreak.hasSignal` (el adaptador ya filtra).
 * Un "Sin sesiones esta semana" justo al terminar de entrenar sería absurdo.
 */
export function StreakChipSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    if (!data.streakCopy) return null

    return (
        <View
            style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(10),
                backgroundColor: withAlpha(EMBER_500, 0.14),
                borderRadius: 9999,
                borderWidth: Math.max(1, s(2)),
                borderColor: withAlpha(EMBER_500, 0.32),
                paddingHorizontal: s(26),
                paddingVertical: s(12),
            }}
        >
            <Text style={{ fontFamily: FONT.ui, fontSize: s(28), lineHeight: s(36) }}>🔥</Text>
            <Text
                style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(36), color: EMBER_500, ...TABULAR }}
                numberOfLines={1}
            >
                {data.streakCopy}
            </Text>
        </View>
    )
}
