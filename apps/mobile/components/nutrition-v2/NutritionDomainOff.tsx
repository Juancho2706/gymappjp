import { StyleSheet, Text, View } from 'react-native'
import { Salad } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../Button'

/**
 * Estado de ruta para Nutrición V2 cuando el dominio está deshabilitado para el alumno.
 * Vive en el namespace V2 para que sus rutas no dependan del árbol legacy.
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
