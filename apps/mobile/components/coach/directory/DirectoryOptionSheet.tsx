import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'

/**
 * DirectoryOptionSheet — bottom-sheet de selección única (Ordenar / Estado).
 * Espejo del patrón "Filtros y orden" móvil del DS.
 */
export function DirectoryOptionSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  theme,
}: {
  visible: boolean
  title: string
  options: { label: string; value: string }[]
  selected: string
  onSelect: (v: string) => void
  onClose: () => void
  theme: any
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View accessibilityViewIsModal accessibilityLabel={title} style={[styles.sheet, { backgroundColor: theme.card, maxHeight: Math.min(height * 0.85, 520), paddingBottom: 32 + insets.bottom }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cerrar ${title.toLowerCase()}`} onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.muted, borderColor: theme.border }]}>
          <X size={16} className="text-strong" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
        <ScrollView style={styles.optionsScroll} showsVerticalScrollIndicator={false}>
          {options.map((opt) => {
            const active = selected === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                testID={`directory-option-${opt.value}`}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ checked: active }}
                style={[styles.option, { backgroundColor: active ? theme.muted : 'transparent' }]}
                onPress={() => { onSelect(opt.value); onClose() }}
              >
                <View style={{ width: 18 }}>{active ? <Check size={15} className="text-sport-600" /> : null}</View>
                <Text
                  style={[
                    styles.optionText,
                    { color: theme.foreground, fontFamily: active ? FONT.uiBold : FONT.uiMedium },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 2,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  closeBtn: { position: 'absolute', right: 16, top: 12, zIndex: 2, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, marginBottom: 8, fontFamily: FONT.displayBold, letterSpacing: -0.36 },
  optionsScroll: { flexShrink: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  optionText: { fontSize: 13.5 },
})
