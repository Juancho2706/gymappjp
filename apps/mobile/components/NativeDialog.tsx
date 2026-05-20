import { Modal, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { HapticPressable } from './HapticPressable'

interface NativeDialogProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

export function NativeDialog({ open, title, onClose, children }: NativeDialogProps) {
  const { theme } = useTheme()
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <MotiView
          from={{ opacity: 0, scale: 0.96, translateY: 12 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 16 }}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>
              {title}
            </Text>
            <HapticPressable onPress={onClose} style={styles.close}>
              <X size={18} color={theme.mutedForeground} />
            </HapticPressable>
          </View>
          {children}
        </MotiView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: { borderWidth: 1, padding: 18, gap: 14, maxHeight: '82%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 18, flex: 1 },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
})
