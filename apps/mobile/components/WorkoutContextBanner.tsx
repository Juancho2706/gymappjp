import { StyleSheet, Text, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface Props {
  visible: boolean
}

export function WorkoutContextBanner({ visible }: Props) {
  const { theme } = useTheme()
  if (!visible) return null
  return (
    <View style={[styles.banner, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '40', borderRadius: theme.radius.lg }]}>
      <Dumbbell size={15} color={theme.primary} strokeWidth={2} />
      <Text style={[styles.text, { color: theme.primary, fontFamily: theme.fontSans }]}>
        Hoy tienes entrenamiento. Considerá ajustar tus macros.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  text: { fontSize: 13, flex: 1, lineHeight: 18 },
})
