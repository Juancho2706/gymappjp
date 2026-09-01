import { StyleSheet, Text, View } from 'react-native'
import { SlidersHorizontal } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../Button'
import { MI_PANEL_PATH, domainOffCopy, type FeatureDomain } from '../../lib/domain-off'

/**
 * DomainOffNotice (RN) — aviso in-page de un DOMINIO apagado (Ola de orden W1, decision 3A del
 * owner sobre el mockup `9801fec7`): la pantalla conserva su chasis/encabezado y reemplaza SOLO el
 * contenido, en vez de redirigir.
 *
 * No confundir con `components/ModuleOffNotice.tsx`, del que calca el chasis visual:
 *  - ModuleOffNotice = MODULO apagado por el OPERADOR (kill-switch `EVA_DISABLED_MODULES`) o acceso
 *    de la cuenta inactivo (entitlement server-side, fail-CLOSED). No es un gate de plan (W4.2,
 *    2026-09-01): copy de mantenimiento y boton secundario «Volver», sin accion de compra.
 *  - DomainOffNotice = PREFERENCIA del propio coach (`coach_feature_prefs._enabled`, fail-OPEN).
 *    El coach lo apago y lo puede prender ahora mismo: cero plan, cero precio, cero urgencia. Su
 *    CTA lleva a «Opciones › Mi panel».
 * Cuando una superficie tiene los dos, la PREFERENCIA se evalua ANTES que el modulo: preguntarle
 * por el plan a alguien que solo apago una seccion suya es hostigamiento.
 *
 * La pantalla que lo monta debe seguir el contrato de consumo de `lib/domain-guard.ts`: el efecto
 * de fetch se gatea con `{ ready, enabled }` (dominio apagado ⇒ CERO request) y la eleccion de rama
 * ocurre en el JSX, nunca con un early-return que cambie la cantidad de hooks entre renders.
 *
 * Copy: `domainOffCopy(domain)` de `@eva/feature-prefs` — las MISMAS palabras que la web. Colores
 * y tipografias salen de `useTheme()` (dark mode + marca del coach en runtime); ningun hex aca.
 */

type CtaProp = { label: string; onPress: () => void } | null

export function DomainOffNotice({
  domain,
  cta,
}: {
  domain: FeatureDomain
  /**
   * CTA override. `undefined` => default: boton `sport` con el copy compartido que abre
   * «Mi panel». `null` => sin boton (p. ej. embebido en una tarjeta que ya tiene su accion).
   */
  cta?: CtaProp
}) {
  const { theme } = useTheme()
  const router = useRouter()
  const copy = domainOffCopy(domain)

  return (
    <View style={styles.wrap} accessibilityLabel="domain-off-notice">
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.muted,
            borderRadius: theme.radius.xl,
          },
        ]}
      >
        <SlidersHorizontal size={26} color={theme.mutedForeground} strokeWidth={2} />
      </View>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>
        {copy.title}
      </Text>
      <Text style={[styles.description, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {copy.body}
      </Text>
      {cta === undefined ? (
        <Button
          label={copy.cta}
          variant="sport"
          onPress={() => router.push(MI_PANEL_PATH)}
          style={styles.cta}
        />
      ) : cta ? (
        <Button label={cta.label} variant="sport" onPress={cta.onPress} style={styles.cta} />
      ) : null}
    </View>
  )
}

// Chasis calcado de ModuleOffNotice: los dos avisos ocupan el mismo hueco de la pantalla y no
// pueden verse como dos componentes distintos.
const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 340,
  },
  cta: {
    marginTop: 6,
  },
})
