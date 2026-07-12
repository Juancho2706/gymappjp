import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check } from 'lucide-react-native'
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.card }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
        {options.map((opt) => {
          const active = selected === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              testID={`directory-option-${opt.value}`}
              style={[styles.option, { backgroundColor: active ? theme.muted : 'transparent' }]}
              onPress={() => { onSelect(opt.value); onClose() }}
            >
              <View style={{ width: 18 }}>{active ? <Check size={15} color={theme.primary} /> : null}</View>
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
  title: { fontSize: 18, marginBottom: 8, fontFamily: FONT.displayBold },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  optionText: { fontSize: 13.5 },
})
