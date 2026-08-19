import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { accentOf, sizer, TABULAR, W50, type StickerProps } from './sticker-kit'

/**
 * Héroe del card: la cifra que se lee a un metro de distancia en una story.
 *
 * Fallback: sin volumen (sesión de cardio, movilidad o peso corporal) la cifra pasa a ser las SERIES
 * completadas — mismo criterio que el `heroSecondary` del resumen post-entreno
 * (WorkoutSummaryOverlay.tsx:292-296). Un "0 kg" gigante sería la peor tarjeta posible justo cuando
 * el alumno sí entrenó.
 */
export interface VolumenHeroStickerProps extends StickerProps {
    /**
     * Póster: en F2 el número va DELANTE del sujeto con alpha bajo porque la segmentación nativa del
     * OS es fase posterior (PLAN §Póster). El canvas lo activa solo en ese preset.
     */
    ghost?: boolean
}

export function VolumenHeroSticker({ data, k, stickerScale, tokens, ghost = false }: VolumenHeroStickerProps) {
    const s = sizer(k, stickerScale)
    const accent = accentOf(tokens)
    const hasVolume = data.totalVolumeKg > 0

    const value = hasVolume ? String(Math.round(data.totalVolumeKg)) : String(data.completedSets)
    const unit = hasVolume ? 'kg' : null
    const eyebrow = hasVolume
        ? 'VOLUMEN TOTAL'
        : data.completedSets === 1
          ? 'SERIE COMPLETADA'
          : 'SERIES COMPLETADAS'

    return (
        <View style={{ alignItems: 'flex-start', opacity: ghost ? 0.34 : 1 }}>
            <Text
                style={{
                    fontFamily: FONT.displayBold,
                    fontSize: s(30),
                    lineHeight: s(34),
                    letterSpacing: s(5),
                    color: ghost ? 'rgba(255,255,255,0.55)' : accent,
                }}
                numberOfLines={1}
            >
                {eyebrow}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: s(12) }}>
                <Text
                    style={{
                        fontFamily: FONT.displayBlack,
                        fontSize: s(200),
                        lineHeight: s(206),
                        letterSpacing: -s(6),
                        color: '#FFFFFF',
                        ...TABULAR,
                    }}
                    numberOfLines={1}
                >
                    {value}
                </Text>
                {unit ? (
                    <Text
                        style={{
                            fontFamily: FONT.displayBold,
                            fontSize: s(62),
                            lineHeight: s(70),
                            color: W50,
                            marginBottom: s(24),
                        }}
                    >
                        {unit}
                    </Text>
                ) : null}
            </View>
        </View>
    )
}
