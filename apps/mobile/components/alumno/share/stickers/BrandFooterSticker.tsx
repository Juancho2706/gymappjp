import { Text, View } from 'react-native'
import { CircularBrandLogo } from '../../../CircularBrandLogo'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { accentOf, sizer, strokeSizer, type StickerProps } from './sticker-kit'

/**
 * Firma del card: logo + marca del coach + `@handle` + "vía EVA".
 *
 * Paridad con el footer del motor `ShareCard` (ShareCard.tsx:448-459): la ÚNICA mención de EVA en un
 * card white-label es ese "vía EVA" chico. Lo nuevo es el `@handle` de Instagram — el mecanismo de
 * growth principal del feature (SPEC §Growth): sobrevive a screenshots y re-posts, que es
 * exactamente lo que un link no hace.
 *
 * ── EL LOGO ES LA EXCEPCIÓN ──
 * "Cero fondos detrás de los datos" no alcanza al backplate blanco del logo ni al círculo de acento
 * del fallback: eso NO es fondo de un dato, es el logo del coach. Sin backplate un logo claro
 * desaparece sobre la foto, y el círculo con la inicial es la marca misma cuando no hay imagen. Lo
 * que sí salió es el acento del `@handle`, que era color de coach sobre un dato.
 */
export interface BrandFooterStickerProps extends StickerProps {
    /**
     * Sub-toggle del editor (F3): el `@handle` se imprime DENTRO de esta firma, no suelto, así que
     * no puede ser un sticker aparte con su propio `visible`. Default `true` — el handle es el
     * mecanismo de growth del feature y solo desaparece si el alumno lo apaga a mano.
     */
    showHandle?: boolean
}

export function BrandFooterSticker({ data, k, stickerScale, tokens, showHandle = true }: BrandFooterStickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const accent = accentOf(tokens)
    const { name, logoUrl, instagramHandle } = data.brand
    const logoSize = s(64)

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(20) }}>
            {logoUrl ? (
                // Backplate blanco: un logo claro sobre el canvas oscuro se perdería (mismo criterio
                // que `LogoChip` del ShareCard).
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
                    {/* La inicial va sobre el círculo de marca, no sobre la foto: no lleva contorno.
                        `allowFontScaling={false}` igual: con el tamaño de fuente del sistema en
                        «Máximo» la letra desborda el círculo de `logoSize`, que es fijo. */}
                    <Text
                        allowFontScaling={false}
                        style={{ fontFamily: FONT.displayBold, fontSize: s(32), color: '#FFFFFF' }}
                    >
                        {name.charAt(0).toUpperCase()}
                    </Text>
                </View>
            )}

            <View style={{ gap: s(2) }}>
                <StrokedText
                    sw={sw}
                    style={{
                        fontFamily: FONT.displayBold,
                        fontSize: s(32),
                        lineHeight: s(38),
                        letterSpacing: Math.max(0.3, s(1)),
                    }}
                    numberOfLines={1}
                >
                    {name.toUpperCase()}
                </StrokedText>
                {instagramHandle && showHandle ? (
                    <StrokedText
                        sw={sw}
                        style={{ fontFamily: FONT.uiSemibold, fontSize: s(26), lineHeight: s(32) }}
                        numberOfLines={1}
                    >
                        @{instagramHandle}
                    </StrokedText>
                ) : null}
            </View>

            {/* Empuja el "vía EVA" al extremo cuando el sticker recibe ancho; si va content-sized,
                el gap manda y queda pegado igual a la marca. */}
            <View style={{ flex: 1, minWidth: s(24) }} />
            {/* Con todo en blanco puro, "vía EVA" pesaría lo mismo que la marca del coach y el
                footer perdería jerarquía. El alfa lo devuelve a secundario sin volver a un gris que
                se pierda sobre la foto. */}
            <StrokedText
                sw={sw}
                containerStyle={{ opacity: 0.75 }}
                style={{ fontFamily: FONT.uiSemibold, fontSize: s(24) }}
                numberOfLines={1}
            >
                vía EVA
            </StrokedText>
        </View>
    )
}
