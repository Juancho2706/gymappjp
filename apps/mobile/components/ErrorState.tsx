import { StyleSheet, Text, View } from 'react-native'
import { AlertTriangle, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Button } from './Button'

interface ErrorStateProps {
  icon?: LucideIcon
  title?: string
  subtitle?: string
  onRetry?: () => void
  retryLabel?: string
}

/**
 * Estado de ERROR (Ola 0) — distinto de EmptyState. Para fallos de red/servidor
 * con acción de reintentar. NUNCA disfrazar un error de red como "sin datos".
 */
export function ErrorState({ icon: Icon = AlertTriangle, title = 'No pudimos cargar', subtitle = 'Revisá tu conexión e intentá de nuevo.', onRetry, retryLabel = 'Reintentar' }: ErrorStateProps) {
  const { theme } = useTheme()
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: theme.destructive + '14', borderColor: theme.destructive + '33', borderRadius: theme.radius['2xl'] }]}>
        <Icon size={28} color={theme.destructive} strokeWidth={1.75} />
      </View>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text> : null}
      {onRetry ? <Button label={retryLabel} variant="outline" onPress={onRetry} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  iconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 4 },
  title: { fontSize: 17, letterSpacing: -0.2, textAlign: 'center' },
  sub: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 280 },
})
