import { StyleSheet, Text, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface OfflineBannerProps {
  visible: boolean
  message?: string
}

export function OfflineBanner({ visible, message = 'Sin conexion. Guardaremos los cambios para sincronizar despues.' }: OfflineBannerProps) {
  const { theme } = useTheme()
  if (!visible) return null

  return (
    <View style={[styles.wrap, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B55', borderRadius: theme.radius.lg }]}>
      <WifiOff size={16} color="#F59E0B" />
      <Text style={[styles.text, { color: theme.foreground, fontFamily: theme.fontSans }]}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 17 },
})
