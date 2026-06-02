import { forwardRef, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Link2, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import type { BuilderBlock, BuilderSection } from '../../lib/plan-builder/types'

interface Props {
  block: BuilderBlock | null
  onChange: (block: BuilderBlock) => void
  onRemove: (uid: string) => void
  onSetSection: (uid: string, section: BuilderSection) => void
  onToggleOverride: (uid: string) => void
  onToggleSuperset: (uid: string) => void
  onClose: () => void
}

const SECTIONS: { value: BuilderSection; label: string }[] = [
  { value: 'warmup', label: 'Calent.' },
  { value: 'main', label: 'Principal' },
  { value: 'cooldown', label: 'Enfri.' },
]
const PROGRESSIONS: { value: 'none' | 'weight' | 'reps'; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'weight', label: 'Peso' },
  { value: 'reps', label: 'Reps' },
]

export const BlockEditorSheet = forwardRef<BottomSheetModal, Props>(function BlockEditorSheet(
  { block, onChange, onRemove, onSetSection, onToggleOverride, onToggleSuperset, onClose },
  ref
) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState<BuilderBlock | null>(block)

  useEffect(() => { setDraft(block) }, [block])

  if (!draft) {
    return <BottomSheetModal ref={ref} index={0} snapPoints={['85%']} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}><View /></BottomSheetModal>
  }

  function patch(fields: Partial<BuilderBlock>) {
    const next = { ...draft!, ...fields }
    setDraft(next)
    onChange(next)
  }

  const progression = draft.progression_type ?? 'none'

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['85%']}
      enablePanDownToClose
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{draft.exercise_name}</Text>
        <Text style={[styles.muscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{draft.muscle_group}</Text>

        {/* Section */}
        <Label theme={theme}>Sección</Label>
        <Segmented theme={theme} options={SECTIONS.map((s) => ({ value: s.value, label: s.label }))} value={draft.section ?? 'main'}
          onChange={(v) => onSetSection(draft.uid, v as BuilderSection)} />

        {/* Sets / reps / weight / rest */}
        <View style={styles.row2}>
          <Field theme={theme} label="Series" value={String(draft.sets ?? '')} keyboardType="number-pad" onChangeText={(v: string) => patch({ sets: Number(v) || undefined })} />
          <Field theme={theme} label="Reps" value={draft.reps ?? ''} onChangeText={(v: string) => patch({ reps: v })} placeholder="8-10" />
        </View>
        <View style={styles.row2}>
          <Field theme={theme} label="Peso (kg)" value={draft.target_weight_kg ?? ''} keyboardType="decimal-pad" onChangeText={(v: string) => patch({ target_weight_kg: v })} placeholder="opcional" />
          <Field theme={theme} label="Descanso" value={draft.rest_time ?? ''} onChangeText={(v: string) => patch({ rest_time: v })} placeholder="90s" />
        </View>
        <View style={styles.row2}>
          <Field theme={theme} label="Tempo" value={draft.tempo ?? ''} onChangeText={(v: string) => patch({ tempo: v })} placeholder="3-0-1-0" />
          <Field theme={theme} label="RIR" value={draft.rir ?? ''} onChangeText={(v: string) => patch({ rir: v })} placeholder="2" />
        </View>

        {/* Progression */}
        <Label theme={theme}>Progresión</Label>
        <Segmented theme={theme} options={PROGRESSIONS} value={progression}
          onChange={(v) => patch({ progression_type: v === 'none' ? null : (v as 'weight' | 'reps') })} />
        {progression !== 'none' ? (
          <Field theme={theme} label="Valor por semana" value={draft.progression_value != null ? String(draft.progression_value) : ''} keyboardType="decimal-pad"
            onChangeText={(v: string) => patch({ progression_value: v.trim() ? Number(v) : null })} placeholder={progression === 'weight' ? '2.5 (kg)' : '1 (rep)'} />
        ) : null}

        {/* Notes */}
        <Field theme={theme} label="Notas" value={draft.notes ?? ''} onChangeText={(v: string) => patch({ notes: v })} placeholder="Indicaciones para el alumno" multiline />

        {/* Toggles */}
        <View style={styles.toggleRow}>
          <TouchableOpacity onPress={() => onToggleSuperset(draft.uid)} activeOpacity={0.8}
            style={[styles.toggleBtn, { borderColor: draft.superset_group ? theme.primary : theme.border, backgroundColor: draft.superset_group ? theme.primary + '1A' : 'transparent' }]}>
            <Link2 size={15} color={draft.superset_group ? theme.primary : theme.mutedForeground} />
            <Text style={[styles.toggleText, { color: draft.superset_group ? theme.primary : theme.foreground, fontFamily: theme.fontSans }]}>
              {draft.superset_group ? `Superserie ${draft.superset_group}` : 'Superserie con siguiente'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleText, { color: theme.foreground, fontFamily: theme.fontSans }]}>Excluir al sincronizar (override)</Text>
          <Switch theme={theme} on={Boolean(draft.is_override)} onPress={() => onToggleOverride(draft.uid)} />
        </View>

        <TouchableOpacity onPress={() => onRemove(draft.uid)} activeOpacity={0.8} style={[styles.removeBtn, { borderColor: theme.destructive + '55' }]}>
          <Trash2 size={16} color={theme.destructive} />
          <Text style={[styles.removeText, { color: theme.destructive, fontFamily: 'Montserrat_700Bold' }]}>Quitar ejercicio</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

function Label({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground} multiline={multiline}
        style={[styles.input, multiline && { height: 76, textAlignVertical: 'top', paddingTop: 10 }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

function Segmented({ theme, options, value, onChange }: { theme: any; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.segmented, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} activeOpacity={0.8}
            style={[styles.segItem, active && { backgroundColor: theme.primary }]}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function Switch({ theme, on, onPress }: { theme: any; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.switch, { backgroundColor: on ? theme.primary : theme.muted }]}>
      <View style={[styles.knob, { backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }]} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
  name: { fontSize: 18 },
  muscle: { fontSize: 13, marginTop: -6 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  fieldLabel: { fontSize: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  toggleText: { fontSize: 14 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  removeText: { fontSize: 14 },
})
