import { Fragment, useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Search, X } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { TYPE, textStyle, FONT } from '../lib/typography'
import { Avatar } from './Avatar'

/**
 * CommandPalette — full-screen search / command overlay (RN port of the web
 * coach global search `CoachGlobalSearch` + shadcn `command`).
 *
 * DATA-AGNOSTIC. This is the Wave-3 DS *primitive* only: it renders a search
 * input + grouped results + empty/loading states and reports query changes and
 * selections via callbacks. It does NOT know about coaches, alumnos, endpoints,
 * debounce or fetching — the wiring (debounce + AbortController + /api/coach/search)
 * is the consumer's job (E7). Feed it `groups`, drive `query`/`onQueryChange`,
 * handle `onSelect`.
 *
 * Web parity (CoachGlobalSearch):
 *  - grouped results: eyebrow heading (icon + uppercase label) + rows with a
 *    leading thumb (avatar for people, image for catalog, icon fallback), a
 *    bold title with the matched substring highlighted, and a muted sublabel.
 *  - empty state ("Sin resultados para «query»") once a search settled empty.
 *  - loading spinner in the input affordance while a search is in flight.
 * Mobile adaptations (no APG combobox/arrow-nav on touch): full-screen Modal,
 * autofocus input, tap-to-select, keyboard-aware scrolling, safe-area padding.
 *
 * Tokens: NativeWind DS utilities (surface / text / border / sport ramps) so
 * light/dark + white-label brand ramp resolve at runtime — plus the typography
 * helpers for text shape. No hardcoded hex.
 */

/** A single selectable row. `T` is the consumer's payload (e.g. a SearchHit). */
export interface CommandItem<T = unknown> {
  id: string
  /** Primary text; the portion matching `query` is highlighted. */
  label: string
  /** Secondary muted line under the label. */
  sublabel?: string
  /** Remote thumbnail (catalog rows: exercise/recipe). Wins over `icon`. */
  thumbUrl?: string | null
  /** Render an initials avatar instead of an icon/thumb (people rows). */
  avatarName?: string | null
  /** Fallback leading glyph when there is no thumb/avatar. */
  icon?: LucideIcon
  /** Opaque payload handed back to `onSelect`. */
  data?: T
}

/** A titled section of rows (Alumnos / Programas / …). */
export interface CommandGroup<T = unknown> {
  key: string
  label: string
  /** Eyebrow icon next to the group heading. */
  icon?: LucideIcon
  items: ReadonlyArray<CommandItem<T>>
}

export interface CommandPaletteProps<T = unknown> {
  visible: boolean
  onClose: () => void
  /** Controlled query string (owner holds the state). */
  query: string
  onQueryChange: (next: string) => void
  groups: ReadonlyArray<CommandGroup<T>>
  onSelect: (item: CommandItem<T>) => void
  /** Drives the spinner + which empty copy to show. Default 'idle'. */
  status?: 'idle' | 'loading' | 'ready'
  placeholder?: string
  /** Minimum chars before the empty-state copy is meaningful (mirror MIN_CHARS). */
  minChars?: number
  /** Hint shown before the user has typed enough. */
  idleHint?: string
}

/** Case-insensitive highlight of the query substring inside a label. */
function Highlighted({ label, query }: { label: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{label}</>
  const idx = label.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{label}</>
  return (
    <>
      {label.slice(0, idx)}
      <Text className="text-sport-700" style={{ fontFamily: FONT.uiExtra }}>
        {label.slice(idx, idx + q.length)}
      </Text>
      {label.slice(idx + q.length)}
    </>
  )
}

export function CommandPalette<T = unknown>({
  visible,
  onClose,
  query,
  onQueryChange,
  groups,
  onSelect,
  status = 'idle',
  placeholder = 'Buscar…',
  minChars = 2,
  idleHint,
}: CommandPaletteProps<T>) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const inputRef = useRef<TextInput>(null)

  // Modal mounts before its content can take focus; nudge focus once shown.
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(id)
  }, [visible])

  const trimmed = query.trim()
  const hasQuery = trimmed.length >= minChars
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0)
  const isEmpty = status === 'ready' && hasQuery && totalItems === 0

  function handleSelect(item: CommandItem<T>) {
    onSelect(item)
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
        {/* Search bar row */}
        <View
          className="flex-row items-center border-b border-subtle bg-surface-app"
          style={styles.searchRow}
        >
          <View
            className="flex-1 flex-row items-center rounded-control border border-default bg-surface-sunken"
            style={styles.field}
          >
            <View style={styles.leadIcon}>
              {status === 'loading' ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Search size={18} color={theme.mutedForeground} />
              )}
            </View>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onQueryChange}
              placeholder={placeholder}
              placeholderTextColor={theme.mutedForeground}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              returnKeyType="search"
              className="flex-1 text-strong"
              style={[styles.input, { fontFamily: FONT.uiMedium }]}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  onQueryChange('')
                  inputRef.current?.focus()
                }}
                hitSlop={10}
                accessibilityLabel="Limpiar"
                style={styles.clearBtn}
              >
                <X size={15} color={theme.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn} accessibilityLabel="Cerrar">
            <Text className="text-link" style={[TYPE.label]}>
              Cancelar
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {isEmpty ? (
            <View style={styles.stateWrap}>
              <Text className="text-muted" style={[TYPE.body, styles.center]}>
                Sin resultados para{' '}
                <Text className="text-strong" style={{ fontFamily: FONT.uiBold }}>
                  «{trimmed}»
                </Text>
              </Text>
            </View>
          ) : !hasQuery ? (
            <View style={styles.stateWrap}>
              <Text className="text-subtle" style={[TYPE.body, styles.center]}>
                {idleHint ?? `Escribe al menos ${minChars} caracteres para buscar.`}
              </Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            >
              {groups.map((group) => {
                if (group.items.length === 0) return null
                const GroupIcon = group.icon
                return (
                  <View key={group.key} style={styles.group}>
                    <View style={styles.groupHeading}>
                      {GroupIcon ? <GroupIcon size={12} color={theme.mutedForeground} /> : null}
                      <Text className="text-subtle" style={TYPE.eyebrow}>
                        {group.label}
                      </Text>
                    </View>
                    {group.items.map((item) => (
                      <Fragment key={item.id}>
                        <Row item={item} query={trimmed} onPress={handleSelect} />
                      </Fragment>
                    ))}
                  </View>
                )
              })}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

/** Single result row: leading thumb + title (highlighted) + optional sublabel. */
function Row<T>({
  item,
  query,
  onPress,
}: {
  item: CommandItem<T>
  query: string
  onPress: (item: CommandItem<T>) => void
}) {
  const { theme } = useTheme()
  const Icon = item.icon
  return (
    <Pressable
      onPress={() => onPress(item)}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.mutedForeground + '14' }]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Leading item={item} Icon={Icon} theme={theme} />
      <View style={styles.rowText}>
        <Text className="text-strong" numberOfLines={1} style={[styles.rowTitle, { fontFamily: FONT.uiSemibold }]}>
          <Highlighted label={item.label} query={query} />
        </Text>
        {item.sublabel ? (
          <Text className="text-muted" numberOfLines={1} style={textStyle('2xs', FONT.ui)}>
            {item.sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function Leading<T>({
  item,
  Icon,
  theme,
}: {
  item: CommandItem<T>
  Icon?: LucideIcon
  theme: ReturnType<typeof useTheme>['theme']
}) {
  if (item.avatarName != null) {
    return <Avatar name={item.avatarName} size="sm" />
  }
  if (item.thumbUrl) {
    return (
      <View className="border border-subtle bg-surface-sunken" style={styles.thumb}>
        <Image source={{ uri: item.thumbUrl }} style={styles.thumbImg} contentFit="cover" />
      </View>
    )
  }
  return (
    <View className="bg-surface-sunken" style={styles.thumb}>
      {Icon ? <Icon size={16} color={theme.mutedForeground} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  field: { height: 44, paddingHorizontal: 10, gap: 6, borderWidth: 1.5 },
  leadIcon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  clearBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 48 },
  center: { textAlign: 'center' },
  listContent: { paddingTop: 8 },
  group: { paddingTop: 6 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 6, borderRadius: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14.5 },
  thumb: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
})
