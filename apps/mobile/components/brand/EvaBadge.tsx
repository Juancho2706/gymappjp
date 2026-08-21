import { Linking, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { EVA_BADGE_LABEL, getEvaBadgeUrl, type EvaBadgeMedium } from '../../lib/coach-tiers'

/**
 * Sello «Hecho con EVA» — gancho de Pro en Pricing v3 (docs/specs/pricing-v3, owner 2026-08-21).
 *
 * Desde v3 el white-label está en TODOS los planes: lo que distingue a Pro es el cupo de alumnos
 * y sacarse este sello. Free/starter lo llevan en las superficies del ALUMNO; pro/elite y los
 * legacy (growth/scale) no. El gate es `showsEvaBadge(tier)` de `@eva/tiers` — FAIL-OPEN a
 * propósito (tier corrupto ⇒ sello): ante un dato dudoso preferimos regalar atribución de EVA
 * antes que regalar el beneficio pago. Este componente NO decide: lo monta el caller que ya
 * conoce el tier.
 *
 * Reglas visuales (D3=A): discreto pero visible, SIEMPRE sobre superficie neutra con texto muted
 * del DS — nunca sobre el color de marca del coach (el sello no debe competir con su white-label).
 * Sin CTA de pago ni mención de precios: políticas de las tiendas
 * (docs/research/cta-pagos-externos-stores-2026-07-31.md).
 *
 * El texto y la URL (con UTMs por superficie) salen del paquete compartido: cero cadenas
 * hardcodeadas acá, cero drift con la web.
 */
export function EvaBadge({
  medium,
  style,
  testID,
}: {
  /** Superficie donde se pinta — viaja como `utm_medium` para medir de dónde llegan. */
  medium: EvaBadgeMedium
  /**
   * Aire/posición desde el caller. A propósito NO acepta la forma-función de `Pressable.style`:
   * `style` como función mata todo el estilo inline bajo css-interop (gotcha del AGENTS mobile).
   */
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const url = getEvaBadgeUrl(medium)
  return (
    // Gotcha css-interop (AGENTS mobile): `style` como FUNCIÓN en un Pressable pierde TODO el
    // estilo inline. Estilo estático + estado pressed vía children-as-function.
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${EVA_BADGE_LABEL}. Abre eva-app.cl`}
      accessibilityHint="Abre el sitio de EVA en tu navegador"
      hitSlop={8}
      onPress={() => {
        void Linking.openURL(url).catch(() => {})
      }}
      style={[styles.press, style]}
    >
      {({ pressed }) => (
        <Text
          className="font-sans text-muted"
          style={[styles.label, pressed && { opacity: 0.55 }]}
        >
          {EVA_BADGE_LABEL}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  press: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 8 },
  label: { fontSize: 11.5, letterSpacing: 0.6, textAlign: 'center' },
})

export default EvaBadge
