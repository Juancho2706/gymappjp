import { Text, View } from 'react-native'
import { CircularBrandLogo } from '../../../CircularBrandLogo'
import { FONT } from '../../../../lib/typography'
import { blockLines } from '../share-block'
import { StrokedText } from './StrokedText'
import { accentOf, sizer, STROKE, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/**
 * Share Entreno — EL bloque. El único elemento del card desde la decisión del owner (06-09-2026).
 *
 * Es la fusión de cuatro stickers que antes vivían sueltos y que el alumno tenía que acomodar a
 * mano: la cifra héroe (`VolumenHeroSticker`), la fila duración/series/reps (`StatsRowSticker`), el
 * grupo top (`MuscleFigureSticker` en modo chips) y la firma del coach (`BrandFooterSticker`). Los
 * tamaños, los grosores de contorno y los márgenes son los MISMOS de esos cuatro: lo que cambió es
 * que ahora se apilan en una sola columna alineada a la izquierda, con un aire declarado entre
 * partes en vez de cuatro posiciones independientes que podían chocar.
 *
 * ── TIPOGRAFÍA ──
 * Inter FIJA (`FONT.share*`), nunca `FONT.display*`: esos nombres son los SLOTS white-label
 * (`lib/brand-fonts.ts` los reapunta al asset de la fuente del coach), así que el card cambiaba de
 * cara según quién fuera el coach. El bloque tiene una sola voz — la referencia es Strava.
 *
 * ── TODO EL TEXTO SALE DE `blockLines` ──
 * El componente no decide copy: el fallback sin volumen, el singular «Serie», la duración sin
 * cronómetro y el grupo top viven en `share-block.ts`, que es puro y se testea en Node.
 *
 * Sin fondos propios: el texto es blanco con contorno negro fino (`StrokedText`) y lo único que
 * lleva superficie es el logo del coach — que no es el fondo de un dato, es la marca.
 */
export function StatsBlockSticker({ data, k, stickerScale, tokens }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const accent = accentOf(tokens)
    const { eyebrow, value, unit, tiles, muscleLabel } = blockLines(data)
    const { name, logoUrl } = data.brand
    const logoSize = s(64)

    return (
        <View style={{ alignItems: 'flex-start' }}>
            <StrokedText
                sw={sw}
                style={{
                    fontFamily: FONT.shareLabel,
                    fontSize: s(30),
                    lineHeight: s(34),
                    letterSpacing: s(5),
                }}
                numberOfLines={1}
            >
                {eyebrow}
            </StrokedText>

            {/* Cifra + unidad. Sin gap contra el eyebrow (así venía del mockup aprobado): el
                lineHeight de la cifra ya deja el aire. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: s(12) }}>
                <StrokedText
                    sw={sw}
                    stroke={STROKE.lg}
                    style={{
                        fontFamily: FONT.shareValue,
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
                            fontFamily: FONT.shareBold,
                            fontSize: s(62),
                            lineHeight: s(70),
                        }}
                    >
                        {unit}
                    </StrokedText>
                ) : null}
            </View>

            {/* Duración · series · reps. Sin caja ni separadores: lo único que agrupa los tres
                bloques es el aire, por eso el gap es 40 y no 30. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(40), marginTop: s(16) }}>
                {tiles.map((tile) => (
                    <View key={tile.label} style={{ alignItems: 'flex-start' }}>
                        <StrokedText
                            sw={sw}
                            stroke={STROKE.md}
                            style={{
                                fontFamily: FONT.shareValue,
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
                                fontFamily: FONT.shareLabel,
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

            {/* Grupo con más volumen, solo el nombre. Desaparece entero si el entreno no movió
                músculos identificados: una línea vacía dejaría un hueco sin explicación. */}
            {muscleLabel ? (
                <StrokedText
                    sw={sw}
                    stroke={STROKE.md}
                    containerStyle={{ marginTop: s(20) }}
                    style={{ fontFamily: FONT.shareBold, fontSize: s(56), lineHeight: s(62) }}
                    numberOfLines={1}
                >
                    {muscleLabel}
                </StrokedText>
            ) : null}

            {/* Firma del coach. La ÚNICA mención de EVA en un card white-label es el "vía EVA"
                chico del final (paridad con el footer del motor `ShareCard`, :448-459). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(20), marginTop: s(28) }}>
                {logoUrl ? (
                    // Backplate blanco: un logo claro sobre la foto se perdería (mismo criterio que
                    // el `LogoChip` del ShareCard).
                    <CircularBrandLogo uri={logoUrl} size={logoSize} backgroundColor="#FFFFFF" padding={logoSize * 0.14} />
                ) : (
                    <View
                        style={{
                            width: logoSize,
                            height: logoSize,
                            borderRadius: logoSize / 2,
                            backgroundColor: accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {/* La inicial va sobre el círculo de marca, no sobre la foto: no lleva
                            contorno. `allowFontScaling={false}` igual: con el tamaño de fuente del
                            sistema en «Máximo» la letra desborda el círculo, que es fijo. */}
                        <Text
                            allowFontScaling={false}
                            style={{ fontFamily: FONT.shareBold, fontSize: s(32), color: '#FFFFFF' }}
                        >
                            {name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}

                <StrokedText
                    sw={sw}
                    stroke={STROKE.md}
                    style={{
                        fontFamily: FONT.shareBold,
                        fontSize: s(32),
                        lineHeight: s(38),
                        letterSpacing: Math.max(0.3, s(1)),
                    }}
                    numberOfLines={1}
                >
                    {name.toUpperCase()}
                </StrokedText>

                {/* Con todo en blanco puro, "vía EVA" pesaría lo mismo que la marca del coach y la
                    firma perdería jerarquía. El alfa lo devuelve a secundario sin caer en un gris
                    que se pierda sobre la foto. */}
                <StrokedText
                    sw={sw}
                    containerStyle={{ opacity: 0.75, marginLeft: s(24) }}
                    style={{ fontFamily: FONT.shareLabel, fontSize: s(24) }}
                    numberOfLines={1}
                >
                    vía EVA
                </StrokedText>
            </View>
        </View>
    )
}
