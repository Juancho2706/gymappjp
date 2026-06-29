import { forwardRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import type { DurationType, ProgramStructureType } from '../../lib/plan-builder/types'

export type Phase = { name: string; weeks: number; color: string }
// EVA DS macrocycle palette (token-contract): sport · violet · success · warning · ember · aqua
export const PHASE_COLORS = ['#2680FF', '#7C5CE6', '#1FB877', '#F5A524', '#FF6A3D', '#18ABD4']

interface Props {
  name: string; setName: (v: string) => void
  structureType: ProgramStructureType; setStructureType: (v: ProgramStructureType) => void
  cycleLength: number; setCycleLength: (v: number) => void
  durationType: DurationType; setDurationType: (v: DurationType) => void
  weeks: number; setWeeks: (v: number) => void
  durationDays: number | null; setDurationDays: (v: number | null) => void
  abMode: boolean; onToggleAb: (v: boolean) => void
  variant: 'A' | 'B'; onSwitchVariant: (v: 'A' | 'B') => void
  startDateFlexible: boolean; setStartDateFlexible: (v: boolean) => void
  startDate: string; setStartDate: (v: string) => void
  programNotes: string; setProgramNotes: (v: string) => void
  phases: Phase[]; setPhases: Dispatch<SetStateAction<Phase[]>>
  onClose: () => void
}

/** Config completa del programa (1:1 con ProgramConfigHeader web) en bottom-sheet,
 *  abierto por la tuerca ámbar. Incluye fases con paleta de color + reordenar. */
export const ProgramConfigSheet = forwardRef<BottomSheetModal, Props>(function ProgramConfigSheet(p, ref) {
  const { theme } = useTheme()
  const Switch = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={[styles.switch, { backgroundColor: on ? theme.primary : theme.muted }]}>
      <View style={[styles.knob, { alignSelf: on ? 'flex-end' : 'flex-start' }]} />
    </TouchableOpacity>
  )

  return (
    <BottomSheetModal ref={ref} index={0} snapPoints={['92%']} enableDynamicSizing={false} enablePanDownToClose onDismiss={p.onClose}
      backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
      <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>Configurar programa</Text>

        <Field theme={theme} label="Nombre del programa">
          <TextInput value={p.name} onChangeText={p.setName} placeholder="EJ: HIPERTROFIA BLOQUE 1" placeholderTextColor={theme.mutedForeground} maxLength={100}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} />
        </Field>

        <Field theme={theme} label="Estructura del programa">
          <Seg theme={theme} options={[{ v: 'weekly', l: 'Semanal' }, { v: 'cycle', l: 'Ciclo N-días' }]} value={p.structureType} onChange={(v) => p.setStructureType(v as ProgramStructureType)} />
          {p.structureType === 'cycle' ? (
            <View style={styles.cycleRow}>
              <Text style={[styles.cycleLbl, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Longitud del ciclo (1–14 días)</Text>
              <View style={styles.stepper}>
                <TouchableOpacity onPress={() => p.setCycleLength(Math.max(1, p.cycleLength - 1))} style={[styles.stepBtn, { borderColor: theme.border }]}><Text style={[styles.stepTxt, { color: theme.foreground }]}>−</Text></TouchableOpacity>
                <Text style={[styles.stepVal, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{p.cycleLength}</Text>
                <TouchableOpacity onPress={() => p.setCycleLength(Math.min(14, p.cycleLength + 1))} style={[styles.stepBtn, { borderColor: theme.border }]}><Text style={[styles.stepTxt, { color: theme.foreground }]}>+</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}
        </Field>

        <Field theme={theme} label="Duración">
          <Seg theme={theme} options={[{ v: 'weeks', l: 'Semanas' }, { v: 'async', l: 'Días (sin cal.)' }, { v: 'calendar_days', l: 'Días corridos' }]} value={p.durationType} onChange={(v) => p.setDurationType(v as DurationType)} />
          {p.durationType === 'weeks' ? (
            <View style={styles.inlineNum}>
              <Text style={[styles.inlineLbl, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cantidad de semanas (1–52)</Text>
              <TextInput value={String(p.weeks)} onChangeText={(v) => p.setWeeks(Math.max(1, Math.min(52, Number(v) || 1)))} keyboardType="number-pad"
                style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
            </View>
          ) : (
            <View style={styles.inlineNum}>
              <Text style={[styles.inlineLbl, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Total de días (1–365)</Text>
              <TextInput value={p.durationDays != null ? String(p.durationDays) : ''} onChangeText={(v) => p.setDurationDays(v.trim() ? Math.max(1, Math.min(365, Number(v) || 1)) : null)} keyboardType="number-pad" placeholder="Ej: 10" placeholderTextColor={theme.mutedForeground}
                style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
            </View>
          )}
        </Field>

        <View style={[styles.row, { borderColor: theme.border }]}>
          <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Inicio flexible (el alumno decide)</Text>
          <Switch on={p.startDateFlexible} onToggle={() => p.setStartDateFlexible(!p.startDateFlexible)} />
        </View>
        {!p.startDateFlexible ? (
          <Field theme={theme} label="Fecha de inicio">
            <TextInput value={p.startDate} onChangeText={p.setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.mutedForeground} autoCapitalize="none"
              style={[styles.numInput, { width: '100%', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
          </Field>
        ) : null}

        <Field theme={theme} label="Notas y reglas del programa">
          <TextInput value={p.programNotes} onChangeText={p.setProgramNotes} placeholder="Reglas del macrociclo, RIR general…" placeholderTextColor={theme.mutedForeground} multiline maxLength={2000}
            style={[styles.notes, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
        </Field>

        {/* Fases */}
        <Field theme={theme} label="Fases del programa (Volumen → Fuerza → …)">
          <View style={[styles.phaseNote, { borderColor: '#F5A52433', backgroundColor: '#F5A52414' }]}>
            <Text style={[styles.phaseNoteTxt, { color: theme.foreground, fontFamily: theme.fontSans }]}>Solo organizan el timeline visual. No cambian ejercicios ni cargas.</Text>
          </View>
          {p.phases.map((ph, i) => (
            <View key={i} style={styles.phaseRow}>
              <TouchableOpacity onPress={() => p.setPhases((prev) => prev.map((x, idx) => idx === i ? { ...x, color: PHASE_COLORS[(PHASE_COLORS.indexOf(x.color) + 1) % PHASE_COLORS.length] } : x))} style={[styles.phaseColor, { backgroundColor: ph.color }]} />
              <TextInput value={ph.name} onChangeText={(v) => p.setPhases((prev) => prev.map((x, idx) => idx === i ? { ...x, name: v } : x))} placeholder="Fase" placeholderTextColor={theme.mutedForeground}
                style={[styles.phaseName, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
              <TextInput value={String(ph.weeks)} onChangeText={(v) => p.setPhases((prev) => prev.map((x, idx) => idx === i ? { ...x, weeks: Math.max(1, Number(v) || 1) } : x))} keyboardType="number-pad"
                style={[styles.phaseWeeks, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
              <TouchableOpacity disabled={i === 0} onPress={() => p.setPhases((prev) => { const n = [...prev];[n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} hitSlop={4} style={styles.phaseIcon}><ChevronUp size={16} color={i === 0 ? theme.muted : theme.mutedForeground} /></TouchableOpacity>
              <TouchableOpacity disabled={i >= p.phases.length - 1} onPress={() => p.setPhases((prev) => { const n = [...prev];[n[i], n[i + 1]] = [n[i + 1], n[i]]; return n })} hitSlop={4} style={styles.phaseIcon}><ChevronDown size={16} color={i >= p.phases.length - 1 ? theme.muted : theme.mutedForeground} /></TouchableOpacity>
              <TouchableOpacity onPress={() => p.setPhases((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={4} style={styles.phaseIcon}><Trash2 size={15} color={theme.destructive} /></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => p.setPhases((prev) => [...prev, { name: `Fase ${prev.length + 1}`, weeks: 4, color: PHASE_COLORS[prev.length % PHASE_COLORS.length] }])} activeOpacity={0.8} style={[styles.phaseAdd, { borderColor: theme.border }]}>
            <Plus size={14} color={theme.primary} />
            <Text style={[styles.phaseAddTxt, { color: theme.primary, fontFamily: 'HankenGrotesk_600SemiBold' }]}>Añadir fase</Text>
          </TouchableOpacity>
        </Field>

        <TouchableOpacity onPress={() => (ref as React.RefObject<BottomSheetModal>).current?.dismiss()} activeOpacity={0.85} style={[styles.doneBtn, { backgroundColor: theme.primary }]}>
          <Text style={[styles.doneTxt, { color: theme.primaryForeground, fontFamily: 'Archivo_700Bold' }]}>Listo</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

function Field({ theme, label, children }: { theme: any; label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>{label}</Text>
      {children}
    </View>
  )
}

function Seg({ theme, options, value, onChange }: { theme: any; options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.seg, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
      {options.map((o) => {
        const active = o.v === value
        return (
          <TouchableOpacity key={o.v} onPress={() => onChange(o.v)} activeOpacity={0.8} style={[styles.segItem, active && { backgroundColor: theme.primary }]}>
            <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.l}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 48, gap: 18 },
  title: { fontSize: 19 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  cycleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  cycleLbl: { fontSize: 12, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 18, fontFamily: 'Archivo_700Bold' },
  stepVal: { fontSize: 22, minWidth: 28, textAlign: 'center' },
  inlineNum: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  inlineLbl: { fontSize: 12, flex: 1 },
  numInput: { width: 90, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  rowLabel: { fontSize: 13, flexShrink: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  notes: { minHeight: 90, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, textAlignVertical: 'top' },
  phaseNote: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  phaseNoteTxt: { fontSize: 11, lineHeight: 16 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseColor: { width: 26, height: 26, borderRadius: 8 },
  phaseName: { flex: 1, height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 13 },
  phaseWeeks: { width: 46, height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, fontSize: 13, textAlign: 'center' },
  phaseIcon: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  phaseAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 11, marginTop: 2 },
  phaseAddTxt: { fontSize: 13 },
  doneBtn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  doneTxt: { fontSize: 15 },
})
