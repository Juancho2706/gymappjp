import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { History, Plus, Search, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../context/ThemeContext'
import { addIntakeEntry, searchFoods, type FoodHit } from '../../lib/nutrition-intake'

/**
 * Registro fuera de plan (off-plan) del alumno — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/OffPlanLogger.tsx. Boton "Registrar algo
 * mas" => sheet con busqueda debounced del catalogo + fila de "Recientes" quick-add. Inserta 100 g
 * por defecto via addIntakeEntry (clientId derivado de la sesion). Solo el dia de hoy.
 */

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2

interface Props {
  clientId: string
  recents: { id: string; name: string }[]
  today: string
  /** Callback opcional para refrescar la pantalla tras un registro exitoso. */
  onLogged?: () => void
}

export function OffPlanLogger({ clientId, recents, today, onLogged }: Props) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodHit[]>([])
  const [searching, setSearching] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTerm('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = term.trim()
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      const hits = await searchFoods(trimmed)
      if (cancelled) return
      setResults(hits)
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, open])

  async function logFood(foodId: string) {
    setPendingId(foodId)
    const res = await addIntakeEntry({ clientId, logDate: today, foodId })
    setPendingId(null)
    if (res.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setOpen(false)
      onLogged?.()
    }
  }

  const trimmed = term.trim()
  const showEmpty = !searching && trimmed.length >= SEARCH_MIN_CHARS && results.length === 0
  const hasRecents = recents.length > 0

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={[styles.trigger, { borderColor: theme.border, backgroundColor: theme.background }]}
      >
        <Plus size={16} color={theme.foreground} />
        <Text style={[styles.triggerText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Registrar algo más
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
          <MotiView
            from={{ translateY: 500 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'timing', duration: 220 }}
            style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 16 }]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.mutedForeground }]} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Registrar algo más</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <X size={20} color={theme.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
              <Search size={16} color={theme.mutedForeground} />
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder="Buscar alimento (ej: Pollo, Manzana...)"
                placeholderTextColor={theme.mutedForeground}
                autoFocus
                style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
              />
              {searching && <ActivityIndicator size="small" color={theme.mutedForeground} />}
            </View>

            {hasRecents && trimmed.length < SEARCH_MIN_CHARS && (
              <View style={styles.recentsWrap}>
                <View style={styles.recentsHead}>
                  <History size={14} color={theme.mutedForeground} />
                  <Text style={[styles.recentsLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Recientes</Text>
                </View>
                <View style={styles.recentsRow}>
                  {recents.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      disabled={pendingId !== null}
                      onPress={() => logFood(r.id)}
                      activeOpacity={0.8}
                      style={[styles.recentChip, { borderColor: theme.border, backgroundColor: theme.secondary, opacity: pendingId !== null ? 0.5 : 1 }]}
                    >
                      {pendingId === r.id ? (
                        <ActivityIndicator size="small" color={theme.mutedForeground} />
                      ) : (
                        <Plus size={14} color={theme.foreground} />
                      )}
                      <Text style={[styles.recentChipText, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {trimmed.length < SEARCH_MIN_CHARS && !hasRecents && (
                <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Escribe al menos 2 letras para buscar un alimento del catálogo.
                </Text>
              )}
              {showEmpty && (
                <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  No se encontraron alimentos con &ldquo;{trimmed}&rdquo;.
                </Text>
              )}
              {results.map((f) => {
                const isPending = pendingId === f.id
                return (
                  <TouchableOpacity
                    key={f.id}
                    disabled={pendingId !== null}
                    onPress={() => logFood(f.id)}
                    activeOpacity={0.7}
                    style={[styles.resultRow, { borderBottomColor: theme.border, opacity: pendingId !== null && !isPending ? 0.5 : 1 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                        {f.name}
                      </Text>
                      {f.brand ? (
                        <Text style={[styles.resultBrand, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                          {f.brand}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.addCircle, { backgroundColor: theme.secondary }]}>
                      {isPending ? (
                        <ActivityIndicator size="small" color={theme.foreground} />
                      ) : (
                        <Plus size={16} color={theme.foreground} />
                      )}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </MotiView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  triggerText: { fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 12, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  title: { fontSize: 16, flex: 1 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  recentsWrap: { paddingBottom: 8, gap: 6 },
  recentsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentsLabel: { fontSize: 11 },
  recentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, maxWidth: '100%' },
  recentChipText: { fontSize: 12 },
  list: { flexGrow: 0 },
  hint: { fontSize: 12, textAlign: 'center', paddingVertical: 36 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  resultName: { fontSize: 14 },
  resultBrand: { fontSize: 11, marginTop: 1 },
  addCircle: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
