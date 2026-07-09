import { forwardRef, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Check, ChevronDown, Dumbbell, History, Link2, Lock, Minus, Plus, Trash2 } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { Switch } from '../Switch'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import {
  EXERCISE_TYPES,
  INTERVAL_TEMPLATES,
  effectiveExerciseType,
  type ExerciseType,
  type IntervalConfig,
} from '@eva/workout-engine'
import { HR_ZONES } from '@eva/cardio'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../lib/exercise-type-meta'
import { buildMobileAreaVMs, type MobileAreaVM } from '../../lib/builder-area-vm'
import type { BuilderBlock } from '../../lib/plan-builder/types'

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
  onToggleOverride: (uid: string) => void
  onToggleSuperset: (uid: string) => void
  onClose: () => void
  /** Áreas disponibles (VM) para el selector "Mover a área". */
  areaVMs?: MobileAreaVM[]
  /** Mover el bloque a otra área (persiste section_template_id vía SET_BLOCK_AREA). */
  onSetArea?: (uid: string, areaId: string) => void
  /** Módulo cardio ON (hasModule): sin él, el tipo cardio no es seleccionable (paridad web). */
  cardioEnabled?: boolean
  /** Días disponibles para "Mover a día" (incluye el actual; se filtra). */
  days?: { id: number; name: string }[]
  currentDayId?: number
  onMoveToDay?: (uid: string, targetDayId: number) => void
  /** Si hay alumno, muestra el historial del ejercicio (última sesión, solo fuerza). */
  clientId?: string
}

const PROGRESSIONS: { value: 'none' | 'weight' | 'reps'; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'weight', label: 'Peso' },
  { value: 'reps', label: 'Reps' },
]
const PROGRESSION_MODE_OPTS: { value: 'weekly_linear' | 'double'; label: string }[] = [
  { value: 'weekly_linear', label: 'Cada semana' },
  { value: 'double', label: 'Al completar reps' },
]
const SIDE_MODE_OPTS: { value: 'bilateral' | 'per_side' | 'alternating' | null; label: string }[] = [
  { value: null, label: 'Normal' },
  { value: 'per_side', label: 'Por lado' },
  { value: 'alternating', label: 'Alternado' },
]

export const BlockEditorSheet = forwardRef<BottomSheetModal, Props>(function BlockEditorSheet(
  { block, onChange, onRemove, onToggleOverride, onToggleSuperset, onClose, areaVMs, onSetArea, cardioEnabled, days, currentDayId, onMoveToDay, clientId },
  ref
) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState<BuilderBlock | null>(block)
  const [history, setHistory] = useState<{ date: string; sets: number; maxKg: number } | null>(null)
  const [areaOpen, setAreaOpen] = useState(false)

  useEffect(() => { setDraft(block) }, [block])

  const draftType: ExerciseType = draft
    ? effectiveExerciseType(draft, { exercise_type: draft.exercise_type })
    : 'strength'

  // Historial del ejercicio para este alumno (última sesión registrada) — solo fuerza (E5-11).
  useEffect(() => {
    setHistory(null)
    const name = block?.exercise_name
    const type = block ? effectiveExerciseType(block, { exercise_type: block.exercise_type }) : 'strength'
    if (!clientId || !name || type !== 'strength') return
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
  }, [block?.exercise_name, block?.exercise_type, block?.exercise_type_override, clientId])

  if (!draft) {
    return <BottomSheetModal ref={ref} index={0} snapPoints={['90%']} enableDynamicSizing={false} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}><View /></BottomSheetModal>
  }

  function patch(fields: Partial<BuilderBlock>) {
    const next = { ...draft!, ...fields }
    setDraft(next)
    onChange(next)
  }

  function setTypeOverride(t: ExerciseType) {
    const ownType = effectiveExerciseType(null, { exercise_type: draft!.exercise_type })
    patch({ exercise_type_override: t === ownType ? null : t })
  }

  const progression = draft.progression_type ?? 'none'
  const vms = areaVMs && areaVMs.length ? areaVMs : buildMobileAreaVMs([])
  const currentArea: MobileAreaVM | undefined =
    vms.find((v) => v.id === (draft.section_template_id ?? null)) ?? vms.find((v) => v.slug === 'main') ?? vms[0]

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['90%']}
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

        {/* Tipo de ejercicio (override del bloque — decisión #2 del PLAN) */}
        <Label theme={theme}>Tipo de ejercicio</Label>
        <View style={styles.typeGrid}>
          {EXERCISE_TYPES.map((t) => {
            const meta = EXERCISE_TYPE_META[t]
            const Icon = meta.Icon
            const active = draftType === t
            const color = exerciseTypeColor(t, theme.primary)
            const locked = t === 'cardio' && !cardioEnabled && draftType !== 'cardio'
            return (
              <TouchableOpacity
                key={t}
                testID={`block-type-${t}`}
                disabled={locked}
                onPress={() => setTypeOverride(t)}
                activeOpacity={0.8}
                style={[
                  styles.typeBtn,
                  { borderColor: active ? hexToRgba(color, 0.4) : theme.border, backgroundColor: active ? hexToRgba(color, 0.16) : 'transparent', opacity: locked ? 0.4 : 1 },
                ]}
              >
                {locked ? <Lock size={13} color={theme.mutedForeground} /> : <Icon size={16} color={active ? color : theme.mutedForeground} />}
                <Text style={[styles.typeBtnT, { color: active ? color : theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>{meta.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {!cardioEnabled ? (
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 10.5 }}>
            Cardio requiere el módulo Cardio (plan del coach).
          </Text>
        ) : null}
        {draft.exercise_type_override != null ? (
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 10.5 }}>Tipo modificado solo en este bloque</Text>
        ) : null}

        {/* Área */}
        <Label theme={theme}>Área</Label>
        <TouchableOpacity onPress={() => setAreaOpen((v) => !v)} activeOpacity={0.8}
          style={[styles.areaSelect, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <View style={[styles.areaDot, { backgroundColor: currentArea?.color ?? theme.primary }]} />
          <Text style={[styles.areaSelectT, { color: theme.foreground, fontFamily: theme.fontSans }]}>{currentArea?.name ?? 'Principal'}</Text>
          <ChevronDown size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
        {areaOpen ? (
          <View style={[styles.areaList, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {vms.map((area) => {
              const on = area.id === (currentArea?.id ?? draft.section_template_id)
              return (
                <TouchableOpacity key={area.id} onPress={() => { setAreaOpen(false); if (onSetArea && !on) onSetArea(draft.uid, area.id) }} activeOpacity={0.8}
                  style={[styles.areaRow, on && { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
                  <View style={[styles.areaDot, { backgroundColor: area.color ?? theme.primary }]} />
                  <Text style={[styles.areaRowT, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{area.name}</Text>
                  {on ? <Check size={15} color={theme.primary} /> : null}
                </TouchableOpacity>
              )
            })}
          </View>
        ) : null}

        {/* ── Campos por TIPO ─────────────────────────────────────────── */}
        {draftType === 'strength' ? (
          <>
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
            <Field theme={theme} label="Descanso calentamiento" value={draft.warmup_rest_time ?? ''} onChangeText={(v: string) => patch({ warmup_rest_time: v })} placeholder="opcional — vacío = mismo descanso" />

            {/* Ejes adicionales (farmer carry: distancia + carga + lado) */}
            <View style={[styles.groupBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
              <Label theme={theme}>Ejes adicionales (opcional)</Label>
              <View style={styles.row2}>
                <DistanceField theme={theme} value={draft.distance_value ?? ''} unit={draft.distance_unit ?? 'm'}
                  onChangeText={(v: string) => patch({ distance_value: v })}
                  onToggleUnit={() => patch({ distance_unit: draft.distance_unit === 'km' ? 'm' : 'km' })} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Lado</Text>
                  <SideModeSelector theme={theme} value={draft.side_mode ?? null} onChange={(v) => patch({ side_mode: v })} />
                </View>
              </View>
            </View>

            {/* Progresión */}
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
                <Segmented theme={theme} options={PROGRESSION_MODE_OPTS} value={draft.progression_mode === 'double' ? 'double' : 'weekly_linear'}
                  onChange={(v) => patch({ progression_mode: v as 'weekly_linear' | 'double' })} />
                {draft.progression_mode === 'double' ? (
                  <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 11, lineHeight: 15 }}>
                    Doble progresión: necesita un rango de reps (ej. 8-12). El alumno mantiene el peso hasta completar el tope en todas las series; ahí sube.
                  </Text>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {draftType === 'cardio' ? (
          <>
            <View style={styles.row2}>
              <IntField theme={theme} label="Duración (min)" value={draft.duration_sec != null ? Math.round(draft.duration_sec / 60) : null}
                onCommit={(min) => patch({ duration_sec: min != null ? min * 60 : null })} placeholder="20" />
              <DistanceField theme={theme} label="Distancia" value={draft.distance_value ?? ''} unit={draft.distance_unit ?? 'm'}
                onChangeText={(v: string) => patch({ distance_value: v })}
                onToggleUnit={() => patch({ distance_unit: draft.distance_unit === 'km' ? 'm' : 'km' })} />
            </View>
            <View style={styles.row2}>
              <PaceField theme={theme} value={draft.target_pace_sec_per_km ?? null} onCommit={(sec) => patch({ target_pace_sec_per_km: sec })} />
              <StepperField theme={theme} label="Series (rondas)" value={draft.sets ?? 1} onChange={(n: number) => patch({ sets: n || 1 })} />
            </View>

            <Label theme={theme}>Zona de FC objetivo</Label>
            <HrZoneSelector theme={theme} value={draft.hr_zone ?? null} onChange={(z) => patch({ hr_zone: z })} />

            {draft.interval_config ? (
              <IntervalEditor theme={theme} config={draft.interval_config} onChange={(c) => patch({ interval_config: c })} onRemove={() => patch({ interval_config: null })} />
            ) : (
              <TouchableOpacity onPress={() => patch({ interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 90, mode: 'rest' } } })}
                activeOpacity={0.8} style={[styles.dashedBtn, { borderColor: theme.border }]}>
                <Plus size={14} color={theme.primary} />
                <Text style={[styles.dashedBtnT, { color: theme.primary, fontFamily: FONT.uiBold }]}>Prescribir por intervalos</Text>
              </TouchableOpacity>
            )}
            {/* Plantillas de intervalos (system) */}
            <View style={styles.tplRow}>
              {INTERVAL_TEMPLATES.map((tpl) => (
                <TouchableOpacity key={tpl.id} onPress={() => patch({ interval_config: tpl.config, hr_zone: tpl.suggestedHrZone ?? draft.hr_zone ?? null, duration_sec: null, distance_value: '' })}
                  activeOpacity={0.8} style={[styles.tplChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                  <Text style={{ fontSize: 10, fontFamily: FONT.uiSemibold, color: theme.foreground }}>{tpl.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field theme={theme} label="Recuperación entre series" value={draft.rest_time ?? ''} onChangeText={(v: string) => patch({ rest_time: v })} placeholder="90s" />
          </>
        ) : null}

        {draftType === 'mobility' ? (
          <>
            <View style={styles.row2}>
              <IntField theme={theme} label="Hold (seg)" value={draft.duration_sec ?? null} onCommit={(s) => patch({ duration_sec: s })} placeholder="30" />
              <StepperField theme={theme} label="Series (holds)" value={draft.sets ?? 1} onChange={(n: number) => patch({ sets: n || 1 })} />
            </View>
            <View style={styles.row2}>
              <IntField theme={theme} label="Respiraciones" value={draft.reps_unit === 'breaths' ? (draft.reps_value ?? null) : null}
                onCommit={(n) => patch({ reps_value: n, reps_unit: n != null ? 'breaths' : null })} placeholder="opcional" />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Lado</Text>
                <SideModeSelector theme={theme} value={draft.side_mode ?? null} onChange={(v) => patch({ side_mode: v })} />
              </View>
            </View>
            <Field theme={theme} label="Descanso entre holds" value={draft.rest_time ?? ''} onChangeText={(v: string) => patch({ rest_time: v })} placeholder="30s" />
          </>
        ) : null}

        {draftType === 'roller' ? (
          <>
            <View style={styles.row2}>
              <IntField theme={theme} label="Duración (seg)" value={draft.duration_sec ?? null}
                onCommit={(s) => patch({ duration_sec: s, ...(s != null ? { reps_value: null, reps_unit: null } : {}) })} placeholder="60" />
              <IntField theme={theme} label="Pasadas" value={draft.reps_unit === 'passes' ? (draft.reps_value ?? null) : null}
                onCommit={(n) => patch({ reps_value: n, reps_unit: n != null ? 'passes' : null, ...(n != null ? { duration_sec: null } : {}) })} placeholder="10" />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Lado</Text>
              <SideModeSelector theme={theme} value={draft.side_mode ?? null} onChange={(v) => patch({ side_mode: v })} />
            </View>
          </>
        ) : null}

        {/* Instrucciones (tipos no-fuerza) */}
        {draftType !== 'strength' ? (
          <Field theme={theme} label="Instrucciones para el alumno" value={draft.instructions ?? ''} onChangeText={(v: string) => patch({ instructions: v })} placeholder="Ritmo, técnica, sensación…" multiline />
        ) : null}

        {/* Notas (todos) */}
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

/** Input entero opcional (commit number|null al escribir). */
function IntField({ theme, label, value, onCommit, placeholder }: { theme: any; label: string; value: number | null; onCommit: (n: number | null) => void; placeholder?: string }) {
  const [str, setStr] = useState(value == null ? '' : String(value))
  useEffect(() => { setStr(value == null ? '' : String(value)) }, [value])
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput
        value={str}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        onChangeText={(v) => {
          const clean = v.replace(/[^0-9]/g, '')
          setStr(clean)
          onCommit(clean === '' ? null : parseInt(clean, 10))
        }}
        style={[styles.input, { textAlign: 'center', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
      />
    </View>
  )
}

/** Distancia: valor decimal + toggle de unidad m/km. */
function DistanceField({ theme, label, value, unit, onChangeText, onToggleUnit }: { theme: any; label?: string; value: string; unit: string; onChangeText: (v: string) => void; onToggleUnit: () => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label ?? 'Distancia'}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput value={value} keyboardType="decimal-pad" placeholder="opcional" placeholderTextColor={theme.mutedForeground}
          onChangeText={onChangeText}
          style={[styles.input, { flex: 1, textAlign: 'center', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
        <TouchableOpacity onPress={onToggleUnit} activeOpacity={0.8} style={[styles.unitBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Text style={{ fontSize: 12, fontFamily: FONT.uiBold, color: theme.mutedForeground }}>{unit}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

/** Pace m:ss por km ↔ segundos. */
function PaceField({ theme, value, onCommit }: { theme: any; value: number | null; onCommit: (sec: number | null) => void }) {
  const fmt = (sec: number | null) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`)
  const [str, setStr] = useState(fmt(value))
  useEffect(() => { setStr(fmt(value)) }, [value])
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Pace (min/km)</Text>
      <TextInput
        value={str}
        placeholder="5:00"
        keyboardType="numbers-and-punctuation"
        placeholderTextColor={theme.mutedForeground}
        onChangeText={setStr}
        onBlur={() => {
          const t = str.trim()
          if (t === '') { onCommit(null); return }
          const m = /^(\d{1,2}):([0-5]\d)$/.exec(t)
          if (m) onCommit(parseInt(m[1], 10) * 60 + parseInt(m[2], 10))
          else { const n = parseInt(t, 10); if (Number.isFinite(n) && n > 0) onCommit(Math.min(3600, n)); else setStr(fmt(value)) }
        }}
        style={[styles.input, { textAlign: 'center', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
      />
    </View>
  )
}

function HrZoneSelector({ theme, value, onChange }: { theme: any; value: number | null; onChange: (z: number | null) => void }) {
  return (
    <View style={styles.hrRow}>
      <TouchableOpacity onPress={() => onChange(null)} activeOpacity={0.8}
        style={[styles.hrBtn, { borderColor: value == null ? theme.primary : theme.border, backgroundColor: value == null ? hexToRgba(theme.primary, 0.1) : 'transparent' }]}>
        <Text style={{ fontSize: 10, fontFamily: FONT.uiBold, color: value == null ? theme.primary : theme.mutedForeground }}>Sin zona</Text>
      </TouchableOpacity>
      {HR_ZONES.map((z) => {
        const on = value === z
        return (
          <TouchableOpacity key={z} onPress={() => onChange(z)} activeOpacity={0.8}
            style={[styles.hrZ, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
            <Text style={{ fontSize: 12, fontFamily: FONT.displayBold, color: on ? theme.primaryForeground : theme.mutedForeground }}>Z{z}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function SideModeSelector({ theme, value, onChange }: { theme: any; value: 'bilateral' | 'per_side' | 'alternating' | null; onChange: (v: 'per_side' | 'alternating' | null) => void }) {
  return (
    <View style={[styles.segmented, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
      {SIDE_MODE_OPTS.map((o) => {
        const active = (value ?? null) === o.value || (o.value === null && (value === 'bilateral' || value == null))
        return (
          <TouchableOpacity key={o.label} onPress={() => onChange(o.value as 'per_side' | 'alternating' | null)} activeOpacity={0.8}
            style={[styles.segItem, active && { backgroundColor: theme.primary }]}>
            <Text style={{ fontSize: 11, fontFamily: FONT.uiSemibold, color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function IntervalEditor({ theme, config, onChange, onRemove }: { theme: any; config: IntervalConfig; onChange: (c: IntervalConfig) => void; onRemove: () => void }) {
  const workByDistance = config.work?.distance_m != null
  const patch = (partial: Partial<IntervalConfig>) => onChange({
    repeats: config.repeats ?? 4,
    work: config.work ?? { duration_sec: 60 },
    recovery: config.recovery,
    warmup_sec: config.warmup_sec,
    cooldown_sec: config.cooldown_sec,
    ...partial,
  })
  return (
    <View style={[styles.groupBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label theme={theme}>Intervalos</Label>
        <TouchableOpacity onPress={onRemove} hitSlop={6}><Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiBold, fontSize: 10 }}>QUITAR</Text></TouchableOpacity>
      </View>
      <View style={styles.row2}>
        <IntField theme={theme} label="Repeticiones (N)" value={config.repeats ?? 4} onCommit={(n) => patch({ repeats: n ?? 1 })} placeholder="4" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Trabajo por</Text>
          <View style={[styles.segmented, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => patch({ work: { ...config.work, duration_sec: config.work?.duration_sec ?? 60, distance_m: undefined } })}
              style={[styles.segItem, !workByDistance && { backgroundColor: theme.primary }]}>
              <Text style={{ fontSize: 11, fontFamily: FONT.uiSemibold, color: !workByDistance ? theme.primaryForeground : theme.mutedForeground }}>Tiempo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => patch({ work: { ...config.work, distance_m: config.work?.distance_m ?? 400, duration_sec: undefined } })}
              style={[styles.segItem, workByDistance && { backgroundColor: theme.primary }]}>
              <Text style={{ fontSize: 11, fontFamily: FONT.uiSemibold, color: workByDistance ? theme.primaryForeground : theme.mutedForeground }}>Distancia</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.row2}>
        <IntField theme={theme} label={workByDistance ? 'Trabajo (m)' : 'Trabajo (seg)'}
          value={workByDistance ? (config.work?.distance_m ?? null) : (config.work?.duration_sec ?? null)}
          onCommit={(n) => patch({ work: workByDistance ? { ...config.work, distance_m: n ?? undefined, duration_sec: undefined } : { ...config.work, duration_sec: n ?? undefined, distance_m: undefined } })}
          placeholder={workByDistance ? '400' : '60'} />
        <IntField theme={theme} label="Recuperación (seg)" value={config.recovery?.duration_sec ?? null}
          onCommit={(n) => patch({ recovery: n != null ? { ...config.recovery, duration_sec: n } : undefined })} placeholder="90" />
      </View>
      <View style={styles.row2}>
        <IntField theme={theme} label="Calentamiento (seg)" value={config.warmup_sec ?? null} onCommit={(n) => patch({ warmup_sec: n ?? undefined })} placeholder="300" />
        <IntField theme={theme} label="Vuelta a la calma (seg)" value={config.cooldown_sec ?? null} onCommit={(n) => patch({ cooldown_sec: n ?? undefined })} placeholder="300" />
      </View>
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
  typeGrid: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 52, borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 2 },
  typeBtnT: { fontSize: 10.5 },
  areaSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  areaSelectT: { flex: 1, fontSize: 14 },
  areaList: { borderWidth: 1, borderRadius: 10, padding: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 8 },
  areaRowT: { flex: 1, fontSize: 14 },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  groupBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  unitBtn: { width: 52, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hrRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hrBtn: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hrZ: { minHeight: 40, minWidth: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dashedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12 },
  dashedBtnT: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tplChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
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
