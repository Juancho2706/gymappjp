import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { FONT } from '../../../lib/typography'

/**
 * Barra de accion persistente de la ficha (chrome) — mirror de la web
 * `ProfileFloatingActions.tsx`. UN solo boton WhatsApp verde full-width flotando
 * sobre el contenido (se removieron los botones-icono de check-in / builder). Se
 * encoge (38px + gutter 56) al bajar el scroll y vuelve a 44px + gutter 20 al
 * subir / volver arriba. El contenedor no bloquea el contenido (box-none); solo
 * el boton captura toques.
 */

// Verde profundo WhatsApp (feedback CEO 2026-07-04: el #25D366 brillante con
// sombra suave leia translucido sobre las cards) — constante de marca externa,
// no un token del DS.
const WA_GREEN = '#16A34A'

function WhatsAppGlyph({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Svg>
  )
}

export function ProfileFloatingActions({ onWhatsApp, compact, enabled = true }: { onWhatsApp: () => void; compact: boolean; enabled?: boolean }) {
  const insets = useSafeAreaInsets()
  return (
    <MotiView
      pointerEvents="box-none"
      animate={{ paddingHorizontal: compact ? 56 : 20 }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.wrap, { bottom: insets.bottom + 12 }]}
    >
      <MotiView
        animate={{ height: compact ? 38 : 44 }}
        transition={{ type: 'timing', duration: 180 }}
        style={styles.btnShell}
      >
        <Pressable
          disabled={!enabled}
          onPress={() => {
            if (!enabled) return
            Haptics.selectionAsync().catch(() => {})
            onWhatsApp()
          }}
          accessibilityRole="button"
          accessibilityLabel={enabled ? 'Contactar por WhatsApp' : 'Sin teléfono para WhatsApp'}
          accessibilityState={{ disabled: !enabled }}
          testID="ficha-whatsapp"
          style={({ pressed }) => [styles.btn, !enabled ? styles.disabled : null, pressed && enabled ? { opacity: 0.9 } : null]}
        >
          <WhatsAppGlyph />
          <Text style={styles.label}>WhatsApp</Text>
        </Pressable>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnShell: {
    flex: 1,
    borderRadius: 14,
    // Sombra dura: sobre las cards el boton debe leer como flotante solido.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: WA_GREEN,
  },
  label: { color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14 },
  disabled: { opacity: 0.85 },
})
