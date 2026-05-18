import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'

export default function ClientesScreen() {
  const { theme } = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.text, { color: theme.text }]}>Clientes — próximamente</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18 },
})
