import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { sizer, strokeSizer, type StickerProps } from './sticker-kit'

/**
 * QR con el link de invitación del coach.
 *
 * OFF por defecto y solo disponible en la variante «Guardar» (SPEC §Growth): un QR en una story es
 * inescaneable desde el mismo teléfono que la mira — su caso real es la foto impresa o la pantalla
 * del gimnasio, en persona.
 *
 * Fondo blanco EXPLÍCITO con padding: sobre el canvas oscuro ninguna cámara lee el código (mismo
 * gotcha que ya documenta `InviteStudent.tsx:261`). Es la ÚNICA superficie que sobrevivió al "cero
 * fondos detrás de los datos": sin ella el sticker no cumple su función. El caption sí perdió el
 * gris y va en blanco con contorno, como el resto del card.
 */
export function QrSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    if (!data.inviteUrl) return null

    const qrSize = s(220)

    return (
        <View style={{ alignItems: 'center', gap: s(12) }}>
            <View style={{ backgroundColor: '#FFFFFF', padding: s(18), borderRadius: s(24) }}>
                <QRCode value={data.inviteUrl} size={qrSize} backgroundColor="#FFFFFF" color="#0F172A" />
            </View>
            <StrokedText
                sw={sw}
                style={{
                    fontFamily: FONT.uiSemibold,
                    fontSize: s(24),
                    lineHeight: s(30),
                    letterSpacing: s(1),
                }}
                numberOfLines={1}
            >
                Entrena conmigo
            </StrokedText>
        </View>
    )
}
