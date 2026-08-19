import { Text, View } from 'react-native'
import { formatSessionDuration } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { sizer, TABULAR, W08, W10, W50, type StickerProps } from './sticker-kit'

/**
 * Fila de contexto del héroe: duración · series · reps.
 *
 * La duración usa `formatSessionDuration` (el formato EXPLÍCITO del resumen: "45 min", "1 h 05 min")
 * y no mm:ss — el bug de lectura que reportó el CEO era exactamente ese, "0:40" leído como 40
 * minutos cuando eran 40 segundos. Sin cronómetro registrado el helper ya devuelve "—".
 */
export function StatsRowSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)

    const tiles: { value: string; label: string }[] = [
        { value: formatSessionDuration(data.durationSec), label: 'Duración' },
        { value: String(data.completedSets), label: data.completedSets === 1 ? 'Serie' : 'Series' },
        { value: String(data.totalReps), label: 'Reps' },
    ]

    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                backgroundColor: W08,
                borderRadius: s(28),
                borderWidth: Math.max(1, s(2)),
                borderColor: W10,
                paddingHorizontal: s(30),
                paddingVertical: s(22),
                gap: s(30),
            }}
        >
            {tiles.map((tile, i) => (
                <View key={tile.label} style={{ flexDirection: 'row', alignItems: 'stretch', gap: s(30) }}>
                    {/* Separador entre tiles (no antes del primero): pinta la fila como UN objeto. */}
                    {i > 0 ? <View style={{ width: Math.max(1, s(2)), backgroundColor: W10 }} /> : null}
                    <View style={{ alignItems: 'flex-start' }}>
                        <Text
                            style={{
                                fontFamily: FONT.displayBlack,
                                fontSize: s(44),
                                lineHeight: s(50),
                                color: '#FFFFFF',
                                ...TABULAR,
                            }}
                            numberOfLines={1}
                        >
                            {tile.value}
                        </Text>
                        <Text
                            style={{
                                fontFamily: FONT.uiSemibold,
                                fontSize: s(24),
                                lineHeight: s(30),
                                letterSpacing: s(2),
                                textTransform: 'uppercase',
                                color: W50,
                            }}
                            numberOfLines={1}
                        >
                            {tile.label}
                        </Text>
                    </View>
                </View>
            ))}
        </View>
    )
}
