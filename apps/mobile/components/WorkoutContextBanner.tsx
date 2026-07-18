import { StyleSheet, Text, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT } from '../lib/typography'

interface Props {
  visible: boolean
}

/**
 * Mensaje informativo (no prescripción médica): contexto entreno + nutrición.
 * Copy espejo del web `nutrition/_components/WorkoutContextBanner`, en español
 * latam neutro (sin voseo).
 */
export function WorkoutContextBanner({ visible }: Props) {
  const { theme } = useTheme()
  if (!visible) return null
  return (
    <View style={[styles.banner, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '40', borderRadius: theme.radius.lg }]}>
      <Dumbbell size={15} color={theme.primary} strokeWidth={2} style={styles.icon} />
      <Text style={[styles.text, { color: theme.primary, fontFamily: FONT.ui }]}>
        <Text style={{ fontFamily: FONT.uiBold }}>Hoy tienes entreno en tu plan.</Text>{' '}
        Hidrátate y distribuye carbohidratos alrededor de la sesión según lo que acordaste con tu coach.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  icon: { marginTop: 1 },
  text: { fontSize: 13, flex: 1, lineHeight: 18 },
})
