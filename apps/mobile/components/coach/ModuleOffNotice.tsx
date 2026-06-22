import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Activity, Apple, HeartPulse, Ruler, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../Button'
import type { ModuleKey } from '../../lib/entitlements'

/**
 * ModuleOffNotice (mobile) — espejo verbatim de apps/web ModuleOffNotice.tsx.
 * Aviso amable cuando el coach abre la superficie de un módulo que NO tiene habilitado.
 *
 * Reglas (doc fuente §2.6 — anti-hostigamiento):
 *   - mensaje NEUTRO, sin urgencia ni precio (el precio vive en el catálogo Settings > Módulos).
 *   - NO mencionar "de pago" ni sacar al usuario de la app: el CTA navega IN-APP al catálogo.
 *   - CTA único a `/coach/settings/modules` (que sí muestra disponibilidad).
 */

type ModuleCopy = {
  icon: LucideIcon
  title: string
  description: string
}

const MODULE_COPY: Record<ModuleKey, ModuleCopy> = {
  cardio: {
    icon: HeartPulse,
    title: 'El módulo Cardio no está habilitado',
    description:
      'Las zonas de frecuencia cardiaca personalizadas, la calculadora de pace y las plantillas de intervalos son parte del módulo Cardio.',
  },
  movement_assessment: {
    icon: Activity,
    title: 'El módulo Evaluación de movimiento no está habilitado',
    description:
      'El screening de movilidad y los patrones de movimiento para personalizar la prescripción son parte del módulo Evaluación de movimiento.',
  },
  body_composition: {
    icon: Ruler,
    title: 'El módulo Composición corporal no está habilitado',
    description:
      'La antropometría y la composición corporal (protocolo ISAK completo) son parte del módulo Composición corporal.',
  },
  nutrition_exchanges: {
    icon: Apple,
    title: 'El módulo Nutrición Pro no está habilitado',
    description:
      'Las pautas por intercambios, las plantillas reutilizables, los micronutrientes avanzados, los objetivos por composición corporal y el PDF con tu marca son parte del módulo Nutrición Pro.',
  },
}

export function ModuleOffNotice({ moduleKey }: { moduleKey: ModuleKey }) {
  const { theme } = useTheme()
  const router = useRouter()
  const copy = MODULE_COPY[moduleKey]
  const Icon = copy.icon

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: theme.muted }]}>
        <Icon size={32} color={theme.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{copy.title}</Text>
      <Text style={[styles.description, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {copy.description}
      </Text>
      <Button
        label="Ver módulos disponibles"
        onPress={() => router.push('/coach/settings/modules')}
        style={{ marginTop: 4 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, textAlign: 'center' },
  description: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 360 },
})
