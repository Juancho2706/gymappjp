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
  maxWidth?: number
  showClose?: boolean
  closeDisabled?: boolean
  unmountOnClose?: boolean
}

export function NativeDialog({
  open,
  title,
  onClose,
  children,
  maxWidth,
  showClose = true,
  closeDisabled = false,
  unmountOnClose = false,
}: NativeDialogProps) {
  const { theme } = useTheme()
  const requestClose = () => {
    if (!closeDisabled) onClose()
  }
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={requestClose}>
      <View style={styles.backdrop}>
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 200 }}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'], maxWidth }]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} numberOfLines={2}>
              {title}
            </Text>
            {showClose ? (
              <HapticPressable
                onPress={requestClose}
                disabled={closeDisabled}
                accessibilityState={{ disabled: closeDisabled }}
                style={[styles.close, closeDisabled ? styles.closeDisabled : null]}
              >
                <X size={18} color={theme.mutedForeground} />
              </HapticPressable>
            ) : null}
          </View>
          {!unmountOnClose || open ? children : null}
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
  closeDisabled: { opacity: 0.45 },
})
