import { StyleSheet, Text, View } from 'react-native'
import { Salad } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'
import { Button } from '../../Button'

/**
 * NutritionDomainOff (E8) — estado "Nutrición no disponible": el coach apagó el dominio Nutrición
 * por preferencia (master switch `_enabled`, `useEntitlements().nutritionEnabled === false`, §4.8).
 * Espejo EXACTO del `NutritionDomainOff` de web (copy verbatim). Se oculta TODO el contenido del
 * dominio — NUNCA se borra data, solo no se renderiza. Distinto de "sin plan" (`NutritionEmpty`):
 * acá el coach decidió no usar la superficie de nutrición para este alumno/team.
 *
 * El tab ya se oculta en el nav (E0-C3); esta pantalla cubre la RUTA (deep-link / estado stale),
 * de modo que aunque el alumno llegue directo, ve el aviso — nunca el plan.
 */
export function NutritionDomainOff() {
  const { theme } = useTheme()
  const router = useRouter()
  return (
    <View style={styles.wrap} testID="nutrition-domain-off">
      <View style={[styles.iconWrap, { backgroundColor: theme.muted, borderRadius: theme.radius.xl }]}>
        <Salad size={26} color={theme.mutedForeground} strokeWidth={2} />
      </View>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>
        Nutrición no disponible
      </Text>
      <Text style={[styles.description, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Tu coach no tiene activada la sección de nutrición por ahora. Si crees que debería estar
        disponible, escríbele directamente.
      </Text>
      <Button
        label="Volver al inicio"
        variant="sport"
        onPress={() => router.replace('/alumno/home')}
        style={styles.cta}
      />
    </View>
  )
}

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
  title: { fontSize: 20, letterSpacing: -0.4, textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 340 },
  cta: { marginTop: 6 },
})
