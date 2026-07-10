import { forwardRef, useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Layers } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'

interface Tpl { id: string; name: string }
interface Props {
  onSelect: (templateId: string) => void
}

/** Lista las plantillas del coach (workout_programs con client_id null) para cargarlas. */
export const TemplatePickerSheet = forwardRef<BottomSheetModal, Props>(function TemplatePickerSheet({ onSelect }, ref) {
  const { theme } = useTheme()
  const [items, setItems] = useState<Tpl[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('workout_programs')
      .select('id, name')
      .is('client_id', null)
      .order('name')
      .limit(100)
    setItems((data as Tpl[]) ?? [])
    setLoading(false)
  }, [])

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['70%']}
      enablePanDownToClose
      onChange={(i) => { if (i >= 0) load() }}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: FONT.display }]}>Cargar plantilla</Text>
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
        {!loading && items.length === 0 ? (
          <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            No tienes plantillas guardadas. Crea un programa sin alumno para reutilizarlo.
          </Text>
        ) : null}
        {items.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => { onSelect(t.id); (ref as React.RefObject<BottomSheetModal>).current?.dismiss() }}
            activeOpacity={0.8}
            style={[styles.row, { borderColor: theme.border }]}
          >
            <Layers size={16} color={theme.primary} />
            <Text style={[styles.rowText, { color: theme.foreground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>{t.name}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 10 },
  title: { fontSize: 18, marginBottom: 4 },
  empty: { fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowText: { fontSize: 14, flex: 1 },
})
