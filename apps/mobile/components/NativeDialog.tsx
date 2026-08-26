import { useRef } from 'react'
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { useSheetKeyboardInset } from '../lib/use-sheet-keyboard-inset'
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
  /**
   * Envuelve el contenido en un scroll con manejo de teclado. OPT-IN a propósito: el contenido
   * que ya trae su propio ScrollView vertical (p. ej. `ImportClientsForm`) no debe anidar dos
   * scrolls de la misma dirección — el interno se queda los gestos y el externo no responde.
   * Actívalo en los diálogos con formulario largo, donde la card no alcanza a mostrar todos
   * los campos con el teclado abierto.
   */
  scrollable?: boolean
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
  scrollable = false,
}: NativeDialogProps) {
  const { theme } = useTheme()
  const requestClose = () => {
    if (!closeDisabled) onClose()
  }
  const body = !unmountOnClose || open ? children : null
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      // Android: la ventana del diálogo debe ser edge-to-edge, igual que el path `nativeModal` de
      // `Sheet.tsx` (ver el comentario largo ahí). RN avisa por consola si `navigationBarTranslucent`
      // viaja sin `statusBarTranslucent`, así que van juntas.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      {/* Teclado: mismo mecanismo que `Sheet.tsx:369` (los 65 sheets `nativeModal` ya viven así).
          `padding` SIN gate de plataforma: con `statusBarTranslucent` la ventana del Modal nunca
          recibe ADJUST_RESIZE en Android, así que el teclado la tapa en vez de encogerla y la
          compensación no puede duplicarse. Sin esto la card queda centrada en la ventana completa
          y su mitad inferior (últimos campos, botones) termina debajo del teclado. */}
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
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
          {scrollable ? <DialogScrollBody>{body}</DialogScrollBody> : body}
        </MotiView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/**
 * Cuerpo scrolleable del diálogo. Vive en su propio componente (dentro del `<Modal>`, que no
 * monta nada mientras está cerrado) para que los listeners de teclado del hook existan solo
 * mientras hay un diálogo abierto: varias pantallas montan 3 `NativeDialog` a la vez.
 */
function DialogScrollBody({ children }: { children: ReactNode }) {
  const scrollRef = useRef<ScrollView>(null)
  const { keyboardInset, onScroll } = useSheetKeyboardInset(scrollRef)
  return (
    <ScrollView
      ref={scrollRef}
      // flexGrow 0 → la card sigue abrazando el contenido cuando es corto; flexShrink 1 → cuando
      // supera el `maxHeight` de la card, el scroll cede alto en vez de recortarse (los hijos flex
      // de RN vienen con flexShrink 0). Mismo criterio que `Sheet.tsx:396`.
      style={styles.scroll}
      contentContainerStyle={[styles.scrollBody, keyboardInset ? { paddingBottom: 18 + keyboardInset } : null]}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
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
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollBody: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 18, flex: 1 },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  closeDisabled: { opacity: 0.45 },
})
