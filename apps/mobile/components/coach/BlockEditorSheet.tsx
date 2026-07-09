import { forwardRef, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Dumbbell, History, Link2, Minus, Plus, Trash2 } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { Switch } from '../Switch'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import type { BuilderBlock, BuilderSection } from '../../lib/plan-builder/types'

function fmtShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(f, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

interface Props {
  block: BuilderBlock | null
  onChange: (block: BuilderBlock) => void
  onRemove: (uid: string) => void
  onSetSection: (uid: string, section: BuilderSection) => void
  onToggleOverride: (uid: string) => void
  onToggleSuperset: (uid: string) => void
  onClose: () => void
  /** Días disponibles para "Mover a día" (incluye el actual; se filtra). */
  days?: { id: number; name: string }[]
  currentDayId?: number
  onMoveToDay?: (uid: string, targetDayId: number) => void
  /** Si hay alumno, muestra el historial del ejercicio (última sesión). */
  clientId?: string
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
const PROGRESSION_MODE_OPTS: { value: 'weekly_linear' | 'double'; label: string }[] = [
  { value: 'weekly_linear', label: 'Cada semana' },
  { value: 'double', label: 'Al completar reps' },
]

export const BlockEditorSheet = forwardRef<BottomSheetModal, Props>(function BlockEditorSheet(
  { block, onChange, onRemove, onSetSection, onToggleOverride, onToggleSuperset, onClose, days, currentDayId, onMoveToDay, clientId },
  ref
) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState<BuilderBlock | null>(block)
  const [history, setHistory] = useState<{ date: string; sets: number; maxKg: number } | null>(null)

  useEffect(() => { setDraft(block) }, [block])

  // Historial del ejercicio para este alumno (última sesión registrada).
  useEffect(() => {
    setHistory(null)
    const name = block?.exercise_name
    if (!clientId || !name) return
    let alive = true
    supabase
      .from('workout_logs')
      .select('weight_kg, reps_done, logged_at')
      .eq('client_id', clientId)
      .eq('exercise_name_at_log', name)
      .not('weight_kg', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!alive || !data || data.length === 0) return
        const day = String((data[0] as any).logged_at).slice(0, 10)
        const sameDay = (data as any[]).filter((r) => String(r.logged_at).slice(0, 10) === day)
        const maxKg = Math.max(...sameDay.map((r) => Number(r.weight_kg) || 0))
        setHistory({ date: day, sets: sameDay.length, maxKg })
      })
    return () => { alive = false }
  }, [block?.exercise_name, clientId])

  if (!draft) {
    return <BottomSheetModal ref={ref} index={0} snapPoints={['85%']} enableDynamicSizing={false} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}><View /></BottomSheetModal>
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
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        {(() => {
          const muscle = getMuscleColor(draft.muscle_group)
          const thumb = exerciseThumb({ gif_url: draft.gif_url ?? null, image_url: null, video_url: draft.video_url ?? null })
          return (
            <View style={styles.header}>
              <View style={[styles.thumb, { backgroundColor: hexToRgba(muscle, 0.15) }]}>
                {thumb ? <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} />
                  : <Dumbbell size={22} color={muscle} />}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.name, { color: theme.foreground, fontFamily: FONT.display }]} numberOfLines={2}>{draft.exercise_name}</Text>
                <View style={styles.muscleRow}>
                  <View style={[styles.mDot, { backgroundColor: muscle }]} />
                  <Text style={[styles.muscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{draft.muscle_group}</Text>
                </View>
              </View>
            </View>
          )
        })()}

        {history ? (
          <View style={[styles.histRow, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            <History size={14} color={theme.primary} />
            <Text style={[styles.histText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Última sesión {fmtShort(history.date)} · {history.sets} {history.sets === 1 ? 'serie' : 'series'} · máx {history.maxKg}kg
            </Text>
          </View>
        ) : null}

        {/* Section */}
        <Label theme={theme}>Sección</Label>
        <Segmented theme={theme} options={SECTIONS.map((s) => ({ value: s.value, label: s.label }))} value={draft.section ?? 'main'}
          onChange={(v) => onSetSection(draft.uid, v as BuilderSection)} />

        {/* Sets / reps / weight / rest — Series con stepper tactil 44px (paridad SeriesStepper web). */}
        <View style={styles.row2}>
          <StepperField theme={theme} label="Series" value={draft.sets ?? 0} onChange={(n: number) => patch({ sets: n || undefined })} />
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
        {progression === 'weight' ? (
          <>
            <Label theme={theme}>¿Cómo sube el peso?</Label>
            <Segmented theme={theme} options={PROGRESSION_MODE_OPTS} value={draft.progression_mode ?? 'weekly_linear'}
              onChange={(v) => patch({ progression_mode: v as 'weekly_linear' | 'double' })} />
            {draft.progression_mode === 'double' ? (
              <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 11, lineHeight: 15 }}>
                Doble progresión: necesita un rango de reps (ej. 8-12). El alumno mantiene el peso hasta completar el tope en todas las series; ahí sube.
              </Text>
            ) : null}
          </>
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
          <Switch value={Boolean(draft.is_override)} onValueChange={() => onToggleOverride(draft.uid)} />
        </View>

        {/* Mover a otro día */}
        {days && currentDayId != null && onMoveToDay && days.filter((d) => d.id !== currentDayId).length > 0 ? (
          <>
            <Label theme={theme}>Mover a día</Label>
            <View style={styles.moveRow}>
              {days.filter((d) => d.id !== currentDayId).map((d) => (
                <TouchableOpacity key={d.id} onPress={() => onMoveToDay(draft.uid, d.id)} activeOpacity={0.8}
                  style={[styles.moveChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                  <Text style={{ fontSize: 12, fontFamily: FONT.uiSemibold, color: theme.foreground }}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <TouchableOpacity onPress={() => onRemove(draft.uid)} activeOpacity={0.8} style={[styles.removeBtn, { borderColor: theme.destructive + '55' }]}>
          <Trash2 size={16} color={theme.destructive} />
          <Text style={[styles.removeText, { color: theme.destructive, fontFamily: FONT.display }]}>Quitar ejercicio</Text>
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
            <Text style={{ fontSize: 12, fontFamily: FONT.uiSemibold, color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/** Stepper tactil de series (paridad SeriesStepper web): botones ±44px + valor central. */
function StepperField({ theme, label, value, onChange, min = 1, max = 20 }: { theme: any; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const dec = () => onChange(Math.max(min, (value || min) - 1))
  const inc = () => onChange(Math.min(max, (value || min - 1) + 1))
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
        <TouchableOpacity testID="series-stepper-decrement" onPress={dec} activeOpacity={0.7} hitSlop={4} style={styles.stepBtn}>
          <Minus size={17} color={theme.foreground} />
        </TouchableOpacity>
        <Text style={[styles.stepVal, { color: value ? theme.foreground : theme.mutedForeground, fontFamily: FONT.displayBold }]}>{value || '—'}</Text>
        <TouchableOpacity testID="series-stepper-increment" onPress={inc} activeOpacity={0.7} hitSlop={4} style={styles.stepBtn}>
          <Plus size={17} color={theme.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, lineHeight: 21 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mDot: { width: 8, height: 8, borderRadius: 4 },
  muscle: { fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  histText: { fontSize: 12, flex: 1 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  fieldLabel: { fontSize: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  toggleText: { fontSize: 14 },
  stepper: { height: 44, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 17, minWidth: 28, textAlign: 'center' },
  moveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moveChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  removeText: { fontSize: 14 },
})
