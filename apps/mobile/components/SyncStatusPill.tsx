import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { CheckCircle2, RefreshCw } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface SyncStatusPillProps {
  pending?: number
  syncing?: boolean
}

export function SyncStatusPill({ pending = 0, syncing }: SyncStatusPillProps) {
  const { theme } = useTheme()
  const hasPending = pending > 0

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: hasPending ? theme.primary + '15' : theme.success + '14',
          borderColor: hasPending ? theme.primary + '40' : theme.success + '35',
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {syncing ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : hasPending ? (
        <RefreshCw size={13} color={theme.primary} />
      ) : (
        <CheckCircle2 size={13} color={theme.success} />
      )}
      <Text
        style={[
          styles.text,
          { color: hasPending ? theme.primary : theme.success, fontFamily: 'Montserrat_700Bold' },
        ]}
      >
        {syncing ? 'Sync' : hasPending ? `${pending} pendientes` : 'Sincronizado'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 11, letterSpacing: 0.2 },
})
