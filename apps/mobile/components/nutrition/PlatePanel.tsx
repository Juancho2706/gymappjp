import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { ProportionPlate, type PlateProportion } from './ProportionPlate'

/**
 * Tarjeta "Tu plato" — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/PlatePanel.tsx. Guia proporcional.
 */
export function PlatePanel({ proportion }: { proportion: PlateProportion }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Tu plato</Text>
      <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Guía de cómo dividir el plato (verduras, proteína, carbohidrato), no cantidades absolutas.
      </Text>
      <ProportionPlate proportion={proportion} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, gap: 8 },
  title: { fontSize: 14 },
  hint: { fontSize: 11, lineHeight: 15, marginBottom: 4 },
})
