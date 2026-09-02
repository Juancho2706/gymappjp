import { View } from 'react-native'
import { formatSessionDuration } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { sizer, STROKE, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/**
 * Fila de contexto del héroe: duración · series · reps.
 *
 * La duración usa `formatSessionDuration` (el formato EXPLÍCITO del resumen: "45 min", "1 h 05 min")
 * y no mm:ss — el bug de lectura que reportó el CEO era exactamente ese, "0:40" leído como 40
 * minutos cuando eran 40 segundos. Sin cronómetro registrado el helper ya devuelve "—".
 *
 * Sin caja: se fueron el panel, el borde y los separadores verticales. Lo único que agrupa los tres
 * bloques ahora es el aire — por eso el gap sube de 30 a 40: sin la caja que los contenía, tres
 * pares valor/label a 30 px de diseño se leen como una sola frase revuelta.
 */
export function StatsRowSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)

    const tiles: { value: string; label: string }[] = [
        { value: formatSessionDuration(data.durationSec), label: 'Duración' },
        { value: String(data.completedSets), label: data.completedSets === 1 ? 'Serie' : 'Series' },
        { value: String(data.totalReps), label: 'Reps' },
    ]

    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(40) }}>
            {tiles.map((tile) => (
                <View key={tile.label} style={{ alignItems: 'flex-start' }}>
                    <StrokedText
                        sw={sw}
                        stroke={STROKE.md}
                        style={{
                            fontFamily: FONT.displayBlack,
                            fontSize: s(44),
                            lineHeight: s(50),
                            ...TABULAR,
                        }}
                        numberOfLines={1}
                    >
                        {tile.value}
                    </StrokedText>
                    <StrokedText
                        sw={sw}
                        style={{
                            fontFamily: FONT.uiSemibold,
                            fontSize: s(24),
                            lineHeight: s(30),
                            letterSpacing: s(2),
                            textTransform: 'uppercase',
                        }}
                        numberOfLines={1}
                    >
                        {tile.label}
                    </StrokedText>
                </View>
            ))}
        </View>
    )
}
