import { View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { sizer, STROKE, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/**
 * Héroe del card: la cifra que se lee a un metro de distancia en una story.
 *
 * Fallback: sin volumen (sesión de cardio, movilidad o peso corporal) la cifra pasa a ser las SERIES
 * completadas — mismo criterio que el `heroSecondary` del resumen post-entreno
 * (WorkoutSummaryOverlay.tsx:292-296). Un "0 kg" gigante sería la peor tarjeta posible justo cuando
 * el alumno sí entrenó.
 *
 * Sin fondo propio (nunca lo tuvo) y TODO en blanco con contorno: el eyebrow era el acento del coach
 * y salió — la marca vive solo en la silueta.
 */
export interface VolumenHeroStickerProps extends StickerProps {
    /**
     * Póster: en F2 el número va DELANTE del sujeto con alpha bajo porque la segmentación nativa del
     * OS es fase posterior (PLAN §Póster). El canvas lo activa solo en ese preset.
     */
    ghost?: boolean
}

export function VolumenHeroSticker({ data, k, stickerScale, ghost = false }: VolumenHeroStickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const hasVolume = data.totalVolumeKg > 0

    const value = hasVolume ? String(Math.round(data.totalVolumeKg)) : String(data.completedSets)
    const unit = hasVolume ? 'kg' : null
    const eyebrow = hasVolume
        ? 'VOLUMEN TOTAL'
        : data.completedSets === 1
          ? 'SERIE COMPLETADA'
          : 'SERIES COMPLETADAS'

    return (
        // En modo póster el `opacity` del wrapper apaga el bloque entero (cifra Y contorno a la vez):
        // bajarle el alfa solo al texto dejaría el contorno negro flotando sobre el sujeto.
        <View style={{ alignItems: 'flex-start', opacity: ghost ? 0.34 : 1 }}>
            <StrokedText
                sw={sw}
                style={{
                    fontFamily: FONT.displayBold,
                    fontSize: s(30),
                    lineHeight: s(34),
                    letterSpacing: s(5),
                }}
                numberOfLines={1}
            >
                {eyebrow}
            </StrokedText>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: s(12) }}>
                <StrokedText
                    sw={sw}
                    stroke={STROKE.lg}
                    style={{
                        fontFamily: FONT.displayBlack,
                        fontSize: s(200),
                        lineHeight: s(206),
                        letterSpacing: -s(6),
                        ...TABULAR,
                    }}
                    numberOfLines={1}
                >
                    {value}
                </StrokedText>
                {unit ? (
                    <StrokedText
                        sw={sw}
                        stroke={STROKE.md}
                        // El margen vive en el WRAPPER: es layout del padre, no del texto (y las
                        // copias del contorno se posicionan contra ese wrapper).
                        containerStyle={{ marginBottom: s(24) }}
                        style={{
                            fontFamily: FONT.displayBold,
                            fontSize: s(62),
                            lineHeight: s(70),
                        }}
                    >
                        {unit}
                    </StrokedText>
                ) : null}
            </View>
        </View>
    )
}
