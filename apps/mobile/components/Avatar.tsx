import { StyleSheet, Text, View } from 'react-native'
import { User } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface AvatarProps {
  name?: string | null
  size?: number
}

export function Avatar({ name, size = 44 }: AvatarProps) {
  const { theme } = useTheme()
  const initial = name?.trim()?.charAt(0)?.toUpperCase()

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: theme.primary + '1A',
          borderColor: theme.primary + '33',
        },
      ]}
    >
      {initial ? (
        <Text style={[styles.initial, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold', fontSize: size * 0.38 }]}>
          {initial}
        </Text>
      ) : (
        <User size={size * 0.42} color={theme.primary} strokeWidth={1.75} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { lineHeight: undefined },
})
