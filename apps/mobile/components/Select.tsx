import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { Check, ChevronDown, Search } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'
import { haptics } from '../lib/haptics'

/**
 * EVA Select — value picker (RN port of the DS `Select`, web
 * `components/ui/select.tsx` = Base UI `Select`).
 *
 * Web parity:
 *  - Trigger mirrors the DS Input box: surface-card fill, 1.5px `border-default`,
 *    radius-control (14), chevron-down on the right, placeholder in text-muted.
 *  - EXPLICIT label map (the Base UI quirk: `SelectPrimitive.Value` renders the
 *    raw value, so web passes children with a label map). Here `options` carries
 *    `{ value, label }` and the trigger shows the matched label — never the raw
 *    value.
 *  - Options list mirrors `SelectItem`: row + check indicator on the selected row.
 *
 * On native the popup is a bottom sheet (RN `Modal` + slide-up panel) instead of
 * an anchored popover — the mobile-native equivalent. Self-contained (does NOT
 * use the legacy `BottomSheet`, which is Montserrat-based); typography here is DS
 * (Hanken/Archivo) and colors come from token utilities so dark mode + the
 * white-label brand ramp resolve at runtime. `searchable` adds a filter field.
 */

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string | null | undefined
  onValueChange: (value: string) => void
  options: SelectOption[]
  /** Field label above the trigger (DS Input parity). */
  label?: string
  placeholder?: string
  /** Header shown at the top of the sheet (defaults to `label` or placeholder). */
  title?: string
  searchable?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  error?: string | null
}

const FONT_LABEL = 'HankenGrotesk_600SemiBold'
const FONT_VALUE = 'HankenGrotesk_500Medium'
const FONT_TITLE = 'Archivo_800ExtraBold'
const FONT_HELP = 'HankenGrotesk_400Regular'

export function Select({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Seleccionar…',
  title,
  searchable,
  disabled,
  size = 'md',
  error,
}: SelectProps) {
  const { theme, resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, searchable, query])

  const height = size === 'lg' ? 52 : 48
  const borderClass = error ? 'border-danger-500' : 'border-default'

  function openSheet() {
    if (disabled) return
    haptics.tap()
    setQuery('')
    setOpen(true)
  }

  function pick(opt: SelectOption) {
    if (opt.disabled) return
    haptics.select()
    onValueChange(opt.value)
    setOpen(false)
  }

  const sheetShadow: ViewStyle = SHADOWS[resolvedScheme].xl

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text className="text-strong" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={openSheet}
        className={`flex-row items-center rounded-control bg-surface-card ${borderClass}`}
        style={[{ height, opacity: disabled ? 0.5 : 1 }, styles.trigger]}
      >
        <Text
          className={selected ? 'text-strong' : 'text-muted'}
          style={styles.value}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={theme.mutedForeground} />
      </Pressable>

      {error ? (
        <Text className="text-danger-600" style={styles.help}>
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Stop propagation: taps inside the panel must not close it. */}
          <Pressable style={styles.panelWrap} onPress={() => {}}>
            <MotiView
              from={{ opacity: 0, translateY: 40 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 220 }}
              className="bg-surface-card border-t border-x border-subtle"
              style={[
                styles.panel,
                { paddingBottom: insets.bottom + 16, borderColor: theme.border },
                sheetShadow,
              ]}
            >
              <View style={[styles.handle, { backgroundColor: theme.mutedForeground }]} />

              {(title || label) ? (
                <Text className="text-strong" style={styles.title} numberOfLines={1}>
                  {title ?? label}
                </Text>
              ) : null}

              {searchable ? (
                <View
                  className="flex-row items-center rounded-control bg-surface-sunken border-subtle"
                  style={styles.search}
                >
                  <Search size={16} color={theme.mutedForeground} />
                  <TextInput
                    className="flex-1 text-strong"
                    placeholder="Buscar…"
                    placeholderTextColor={theme.mutedForeground}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    style={styles.searchInput}
                  />
                </View>
              ) : null}

              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
              >
                {filtered.length === 0 ? (
                  <Text className="text-muted" style={styles.empty}>
                    Sin resultados
                  </Text>
                ) : (
                  filtered.map((opt) => {
                    const isSel = opt.value === value
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel, disabled: !!opt.disabled }}
                        disabled={opt.disabled}
                        onPress={() => pick(opt)}
                        className={`flex-row items-center rounded-control ${isSel ? 'bg-surface-sunken' : ''}`}
                        style={[styles.row, { opacity: opt.disabled ? 0.4 : 1 }]}
                      >
                        <Text
                          className={isSel ? 'text-strong' : 'text-body'}
                          style={styles.rowLabel}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                        {isSel ? <Check size={18} color={theme.primary} /> : null}
                      </Pressable>
                    )
                  })
                )}
              </ScrollView>
            </MotiView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontFamily: FONT_LABEL },
  trigger: { paddingHorizontal: 14, gap: 8, borderWidth: 1.5 },
  value: { flex: 1, fontSize: 15, fontFamily: FONT_VALUE },
  help: { fontSize: 12, lineHeight: 16, fontFamily: FONT_HELP },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  panelWrap: { width: '100%' },
  panel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
    maxHeight: '82%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, opacity: 0.4, marginBottom: 4 },
  title: { fontSize: 20, fontFamily: FONT_TITLE, letterSpacing: -0.3 },
  search: { height: 44, paddingHorizontal: 12, gap: 8, borderWidth: 1 },
  searchInput: { fontSize: 15, fontFamily: FONT_VALUE, paddingVertical: 0 },
  list: { flexGrow: 0 },
  listContent: { gap: 2, paddingVertical: 2 },
  row: { minHeight: 46, paddingHorizontal: 12, gap: 8, justifyContent: 'space-between' },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: FONT_VALUE },
  empty: { fontSize: 14, fontFamily: FONT_HELP, textAlign: 'center', paddingVertical: 20 },
})
