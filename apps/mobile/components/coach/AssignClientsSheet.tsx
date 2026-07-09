import { forwardRef, useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Check } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'

interface ClientRow { id: string; full_name: string }
interface Props {
  onAssign: (clientIds: string[]) => void
  saving?: boolean
}

/** Multi-select de alumnos activos del coach para asignar/duplicar el programa. */
export const AssignClientsSheet = forwardRef<BottomSheetModal, Props>(function AssignClientsSheet({ onAssign, saving }, ref) {
  const { theme } = useTheme()
  const [items, setItems] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    const { data } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .limit(200)
    setItems((data as ClientRow[]) ?? [])
    setLoading(false)
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['80%']}
      enablePanDownToClose
      onChange={(i) => { if (i >= 0) load() }}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: FONT.display }]}>Asignar a alumnos</Text>
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
        {!loading && items.length === 0 ? (
          <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin alumnos activos.</Text>
        ) : null}
        {items.map((c) => {
          const on = selected.has(c.id)
          return (
            <TouchableOpacity key={c.id} onPress={() => toggle(c.id)} activeOpacity={0.8}
              style={[styles.row, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '14' : 'transparent' }]}>
              <View style={[styles.check, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                {on ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.rowText, { color: theme.foreground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>{c.full_name}</Text>
            </TouchableOpacity>
          )
        })}
      </BottomSheetScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <TouchableOpacity
          onPress={() => { if (selected.size > 0) onAssign([...selected]) }}
          disabled={selected.size === 0 || saving}
          activeOpacity={0.85}
          style={[styles.assignBtn, { backgroundColor: theme.primary, opacity: selected.size === 0 || saving ? 0.5 : 1 }]}
        >
          {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : (
            <Text style={[styles.assignText, { color: theme.primaryForeground, fontFamily: FONT.display }]}>
              Asignar a {selected.size} alumno{selected.size === 1 ? '' : 's'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 90, gap: 8 },
  title: { fontSize: 18, marginBottom: 4 },
  empty: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 14, flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  assignBtn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assignText: { fontSize: 15 },
})
