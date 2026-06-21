import { forwardRef, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Dumbbell, History, Link2, Trash2 } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import type {
  BuilderBlock,
  BuilderCardioContext,
  BuilderSection,
  ExerciseType,
  SideMode,
} from '../../lib/plan-builder/types'
import {
  EXERCISE_TYPE_LABEL,
  EXERCISE_TYPES,
  effectiveExerciseType,
} from '../../lib/workout-exercise-type'
import { HR_ZONES, INTERVAL_TEMPLATES, type IntervalConfig } from '../../lib/cardio'
import type { AreaVM } from '../../lib/areas'

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

function formatPace(sec: number | null | undefined): string {
  return sec == null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
function parsePace(str: string): number | null {
  const t = str.trim()
  if (t === '') return null
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t)
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(3600, n) : null
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
  /** Áreas custom + system del coach (selector de área por bloque). */
  areas?: AreaVM[]
  /** Contexto cardio (zonas del alumno + plantillas). undefined ⇒ módulo OFF. */
  cardio?: BuilderCardioContext
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
const SIDE_MODES: { value: SideMode | null; label: string }[] = [
  { value: null, label: 'Normal' },
  { value: 'per_side', label: 'Por lado' },
  { value: 'alternating', label: 'Alternado' },
]

export const BlockEditorSheet = forwardRef<BottomSheetModal, Props>(function BlockEditorSheet(
  { block, onChange, onRemove, onSetSection, onToggleOverride, onToggleSuperset, onClose, days, currentDayId, onMoveToDay, clientId, areas, cardio },
  ref
) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState<BuilderBlock | null>(block)
  const [history, setHistory] = useState<{ date: string; sets: number; maxKg: number } | null>(null)

  useEffect(() => { setDraft(block) }, [block])

  const effectiveType: ExerciseType = draft
    ? effectiveExerciseType(draft, { exercise_type: draft.exercise_type })
    : 'strength'

  // Historial del ejercicio para este alumno (última sesión registrada). Solo fuerza.
  useEffect(() => {
    setHistory(null)
    const name = block?.exercise_name
    if (!clientId || !name || effectiveType !== 'strength') return
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
  }, [block?.exercise_name, clientId, effectiveType])

  if (!draft) {
    return <BottomSheetModal ref={ref} index={0} snapPoints={['90%']} enableDynamicSizing={false} enablePanDownToClose backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}><View /></BottomSheetModal>
  }

  function patch(fields: Partial<BuilderBlock>) {
    const next = { ...draft!, ...fields }
    setDraft(next)
    onChange(next)
  }

  // Override del tipo a nivel bloque (manda sobre exercise_type del catálogo).
  function setTypeOverride(type: ExerciseType) {
    const ownType = effectiveExerciseType(null, { exercise_type: draft!.exercise_type })
    patch({ exercise_type_override: type === ownType ? null : type })
  }

  const progression = draft.progression_type ?? 'none'
  const selectedArea = areas?.find((a) => a.id === draft.section_template_id) ?? null

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
      <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
                <Text style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>{draft.exercise_name}</Text>
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

        {/* Tipo de ejercicio (override del bloque) */}
        <Label theme={theme}>Tipo de ejercicio</Label>
        <Segmented theme={theme} options={EXERCISE_TYPES.map((t) => ({ value: t, label: EXERCISE_TYPE_LABEL[t] }))}
          value={effectiveType} onChange={(v) => setTypeOverride(v as ExerciseType)} />
        {draft.exercise_type_override != null ? (
          <Text style={[styles.hintTiny, { color: theme.mutedForeground }]}>Tipo modificado solo en este bloque</Text>
        ) : null}

        {/* Sección legacy (CAL/PRI/ENF) */}
        <Label theme={theme}>Sección</Label>
        <Segmented theme={theme} options={SECTIONS.map((s) => ({ value: s.value, label: s.label }))} value={draft.section ?? 'main'}
          onChange={(v) => onSetSection(draft.uid, v as BuilderSection)} />

        {/* Área (workout_section_templates) — preferente sobre section legacy */}
        {areas && areas.length > 0 ? (
          <>
            <Label theme={theme}>Área de entrenamiento</Label>
            <View style={styles.areaRow}>
              <TouchableOpacity onPress={() => patch({ section_template_id: null })} activeOpacity={0.8}
                style={[styles.areaChip, { borderColor: draft.section_template_id == null ? theme.primary : theme.border, backgroundColor: draft.section_template_id == null ? theme.primary + '1A' : theme.secondary }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: draft.section_template_id == null ? theme.primary : theme.mutedForeground }}>Sin área</Text>
              </TouchableOpacity>
              {areas.map((a) => {
                const on = draft.section_template_id === a.id
                return (
                  <TouchableOpacity key={a.id} onPress={() => patch({ section_template_id: a.id })} activeOpacity={0.8}
                    style={[styles.areaChip, { borderColor: on ? a.color : theme.border, backgroundColor: on ? hexToRgba(a.color, 0.16) : theme.secondary }]}>
                    <View style={[styles.areaDot, { backgroundColor: a.color }]} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: on ? a.color : theme.foreground }} numberOfLines={1}>{a.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {selectedArea ? (
              <Text style={[styles.hintTiny, { color: theme.mutedForeground }]}>El área manda sobre la sección legacy al sincronizar.</Text>
            ) : null}
          </>
        ) : null}

        {/* ── Formularios por tipo ─────────────────────────────────────────── */}
        {effectiveType === 'strength' ? (
          <StrengthForm theme={theme} draft={draft} patch={patch} progression={progression} />
        ) : null}

        {effectiveType === 'cardio' ? (
          <CardioForm theme={theme} draft={draft} patch={patch} cardio={cardio} />
        ) : null}

        {effectiveType === 'mobility' ? (
          <MobilityForm theme={theme} draft={draft} patch={patch} />
        ) : null}

        {effectiveType === 'roller' ? (
          <RollerForm theme={theme} draft={draft} patch={patch} />
        ) : null}

        {/* Instrucciones (transversal a tipos no-strength — columna instructions) */}
        {effectiveType !== 'strength' ? (
          <Field theme={theme} label="Instrucciones para el alumno" value={draft.instructions ?? ''}
            onChangeText={(v: string) => patch({ instructions: v })} placeholder="Cómo ejecutar (ritmo, técnica, sensación)…" multiline />
        ) : null}

        {/* Notas (transversal) */}
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

        {/* Mover a otro día */}
        {days && currentDayId != null && onMoveToDay && days.filter((d) => d.id !== currentDayId).length > 0 ? (
          <>
            <Label theme={theme}>Mover a día</Label>
            <View style={styles.moveRow}>
              {days.filter((d) => d.id !== currentDayId).map((d) => (
                <TouchableOpacity key={d.id} onPress={() => onMoveToDay(draft.uid, d.id)} activeOpacity={0.8}
                  style={[styles.moveChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: theme.foreground }}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <TouchableOpacity onPress={() => onRemove(draft.uid)} activeOpacity={0.8} style={[styles.removeBtn, { borderColor: theme.destructive + '55' }]}>
          <Trash2 size={16} color={theme.destructive} />
          <Text style={[styles.removeText, { color: theme.destructive, fontFamily: 'Montserrat_700Bold' }]}>Quitar ejercicio</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

// ── Formulario FUERZA (legacy + ejes adicionales + progresión) ────────────────
function StrengthForm({ theme, draft, patch, progression }: { theme: any; draft: BuilderBlock; patch: (f: Partial<BuilderBlock>) => void; progression: 'none' | 'weight' | 'reps' }) {
  return (
    <>
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

      {/* Ejes adicionales (farmer carry: distancia + unidad de carga + lado) */}
      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
        <Label theme={theme}>Ejes adicionales (opcional)</Label>
        <View style={styles.row2}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Distancia</Text>
            <View style={styles.inlineRow}>
              <TextInput value={draft.distance_value ?? ''} onChangeText={(v) => patch({ distance_value: v })} placeholder="7.5" keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground}
                style={[styles.input, { flex: 1, textAlign: 'center', borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
              <TouchableOpacity onPress={() => patch({ distance_unit: draft.distance_unit === 'km' ? 'm' : 'km' })} style={[styles.unitBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: theme.mutedForeground }}>{draft.distance_unit ?? 'm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Unidad de carga</Text>
            <Segmented theme={theme} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
              value={draft.load_unit ?? 'kg'} onChange={(v) => patch({ load_unit: v as 'kg' | 'lb', load_type: 'weight' })} />
          </View>
        </View>
        <Label theme={theme}>Lado</Label>
        <Segmented theme={theme} options={SIDE_MODES.map((s) => ({ value: s.value ?? 'bilateral', label: s.label }))}
          value={draft.side_mode ?? 'bilateral'} onChange={(v) => patch({ side_mode: v === 'bilateral' ? null : (v as SideMode) })} />
      </View>

      {/* Progresión automática (solo fuerza) */}
      <Label theme={theme}>Progresión</Label>
      <Segmented theme={theme} options={PROGRESSIONS} value={progression}
        onChange={(v) => patch({ progression_type: v === 'none' ? null : (v as 'weight' | 'reps'), progression_value: v === 'none' ? null : (draft.progression_value ?? (v === 'weight' ? 2.5 : 1)) })} />
      {progression !== 'none' ? (
        <Field theme={theme} label="Valor por semana" value={draft.progression_value != null ? String(draft.progression_value) : ''} keyboardType="decimal-pad"
          onChangeText={(v: string) => patch({ progression_value: v.trim() ? Number(v) : null })} placeholder={progression === 'weight' ? '2.5 (kg)' : '1 (rep)'} />
      ) : null}
    </>
  )
}

// ── Formulario CARDIO (duración/distancia/pace + zonas FC + intervalos) ───────
function CardioForm({ theme, draft, patch, cardio }: { theme: any; draft: BuilderBlock; patch: (f: Partial<BuilderBlock>) => void; cardio?: BuilderCardioContext }) {
  const [paceStr, setPaceStr] = useState(formatPace(draft.target_pace_sec_per_km))
  useEffect(() => { setPaceStr(formatPace(draft.target_pace_sec_per_km)) }, [draft.target_pace_sec_per_km])
  const selectedZone = cardio?.enabled ? cardio.zones?.find((z) => z.zone === draft.hr_zone) ?? null : null

  return (
    <>
      <View style={styles.row2}>
        <Field theme={theme} label="Duración (min)"
          value={draft.duration_sec != null ? String(Math.round(draft.duration_sec / 60)) : ''} keyboardType="number-pad"
          onChangeText={(v: string) => { const n = parseInt(v, 10); patch({ duration_sec: Number.isFinite(n) && n > 0 ? n * 60 : null }) }} placeholder="20" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Distancia</Text>
          <View style={styles.inlineRow}>
            <TextInput value={draft.distance_value ?? ''} onChangeText={(v) => patch({ distance_value: v })} placeholder="5" keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground}
              style={[styles.input, { flex: 1, textAlign: 'center', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
            <TouchableOpacity onPress={() => patch({ distance_unit: draft.distance_unit === 'm' ? 'km' : 'm' })} style={[styles.unitBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: theme.mutedForeground }}>{draft.distance_unit ?? 'km'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Pace (min/km)</Text>
          <TextInput value={paceStr} onChangeText={setPaceStr} onBlur={() => patch({ target_pace_sec_per_km: parsePace(paceStr) })} placeholder="5:00" keyboardType="numbers-and-punctuation" placeholderTextColor={theme.mutedForeground}
            style={[styles.input, { textAlign: 'center', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
        </View>
        <Field theme={theme} label="Series del bloque" value={String(draft.sets ?? 1)} keyboardType="number-pad" onChangeText={(v: string) => patch({ sets: Math.max(1, Number(v) || 1) })} />
      </View>

      {/* Zona de FC objetivo */}
      <Label theme={theme}>Zona de FC objetivo</Label>
      <View style={styles.zoneRow}>
        <TouchableOpacity onPress={() => patch({ hr_zone: null })} activeOpacity={0.8}
          style={[styles.zoneChip, { borderColor: draft.hr_zone == null ? theme.primary : theme.border, backgroundColor: draft.hr_zone == null ? theme.primary + '1A' : theme.secondary }]}>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: draft.hr_zone == null ? theme.primary : theme.mutedForeground }}>Sin zona</Text>
        </TouchableOpacity>
        {HR_ZONES.map((z) => {
          const on = draft.hr_zone === z
          return (
            <TouchableOpacity key={z} onPress={() => patch({ hr_zone: z })} activeOpacity={0.8}
              style={[styles.zoneChip, { minWidth: 44, alignItems: 'center', borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : theme.secondary }]}>
              <Text style={{ fontSize: 13, fontFamily: 'Montserrat_800ExtraBold', color: on ? theme.primaryForeground : theme.mutedForeground }}>Z{z}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {cardio?.enabled && draft.hr_zone != null ? (
        selectedZone ? (
          <Text style={[styles.hintTiny, { color: theme.success }]}>Z{draft.hr_zone} · {selectedZone.minBpm}–{selectedZone.maxBpm} bpm para este alumno</Text>
        ) : (
          <Text style={[styles.hintTiny, { color: theme.mutedForeground }]}>Completa el perfil cardio del alumno (fecha de nacimiento) para ver los bpm.</Text>
        )
      ) : null}

      {/* Intervalos */}
      {draft.interval_config ? (
        <IntervalEditor theme={theme} draft={draft} patch={patch} cardio={cardio} />
      ) : (
        <TouchableOpacity onPress={() => patch({ interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 90, mode: 'rest' } } })} activeOpacity={0.8}
          style={[styles.dashedBtn, { borderColor: theme.border }]}>
          <Text style={[styles.dashedBtnText, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>+ Prescribir por intervalos</Text>
        </TouchableOpacity>
      )}

      <Field theme={theme} label="Recuperación entre series" value={draft.rest_time ?? ''} onChangeText={(v: string) => patch({ rest_time: v })} placeholder="90s" />
    </>
  )
}

function IntervalEditor({ theme, draft, patch, cardio }: { theme: any; draft: BuilderBlock; patch: (f: Partial<BuilderBlock>) => void; cardio?: BuilderCardioContext }) {
  const config = (draft.interval_config ?? {}) as IntervalConfig
  const workByDistance = config.work?.distance_m != null
  const patchCfg = (partial: Partial<IntervalConfig>) => {
    const next: IntervalConfig = {
      repeats: config.repeats ?? 4,
      work: config.work ?? { duration_sec: 60 },
      recovery: config.recovery,
      warmup_sec: config.warmup_sec,
      cooldown_sec: config.cooldown_sec,
      ...partial,
    }
    patch({ interval_config: next })
  }
  const numField = (label: string, value: number | null | undefined, onCommit: (n: number | null) => void, placeholder: string) => (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.fieldLabelTiny, { color: theme.mutedForeground }]}>{label}</Text>
      <TextInput value={value != null ? String(value) : ''} onChangeText={(v) => { const n = parseInt(v, 10); onCommit(v.trim() === '' ? null : Number.isFinite(n) ? n : null) }} placeholder={placeholder} keyboardType="number-pad" placeholderTextColor={theme.mutedForeground}
        style={[styles.input, { height: 40, textAlign: 'center', borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
    </View>
  )

  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
      <Label theme={theme}>Intervalos</Label>
      {cardio?.enabled ? (
        <View style={styles.tplRow}>
          {INTERVAL_TEMPLATES.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => patch({ interval_config: t.config as IntervalConfig, hr_zone: t.suggestedHrZone ?? draft.hr_zone ?? null, duration_sec: null, distance_value: '' })} activeOpacity={0.8}
              style={[styles.tplChip, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Inter_600SemiBold', color: theme.foreground }}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.row2}>
        {numField('Repeticiones (N)', config.repeats ?? 4, (n) => patchCfg({ repeats: n ?? 1 }), '4')}
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.fieldLabelTiny, { color: theme.mutedForeground }]}>Trabajo por</Text>
          <Segmented theme={theme}
            options={[{ value: 'time', label: 'Tiempo' }, { value: 'dist', label: 'Distancia' }]}
            value={workByDistance ? 'dist' : 'time'}
            onChange={(v) => patchCfg({ work: v === 'dist'
              ? { ...config.work, distance_m: config.work?.distance_m ?? 400, duration_sec: undefined }
              : { ...config.work, duration_sec: config.work?.duration_sec ?? 60, distance_m: undefined } })} />
        </View>
      </View>
      <View style={styles.row2}>
        {workByDistance
          ? numField('Trabajo (m)', config.work?.distance_m ?? null, (n) => patchCfg({ work: { ...config.work, distance_m: n ?? undefined, duration_sec: undefined } }), '400')
          : numField('Trabajo (seg)', config.work?.duration_sec ?? null, (n) => patchCfg({ work: { ...config.work, duration_sec: n ?? undefined, distance_m: undefined } }), '60')}
        {numField('Recuperación (seg)', config.recovery?.duration_sec ?? null, (n) => patchCfg({ recovery: n != null ? { ...config.recovery, duration_sec: n } : undefined }), '90')}
      </View>
      <View style={styles.row2}>
        {numField('Calentamiento (seg)', config.warmup_sec ?? null, (n) => patchCfg({ warmup_sec: n ?? undefined }), '300')}
        {numField('Vuelta a la calma (seg)', config.cooldown_sec ?? null, (n) => patchCfg({ cooldown_sec: n ?? undefined }), '300')}
      </View>
      <TouchableOpacity onPress={() => patch({ interval_config: null })} activeOpacity={0.8}>
        <Text style={[styles.hintTiny, { color: theme.destructive, marginTop: 4 }]}>Quitar intervalos</Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Formulario MOVILIDAD (hold/respiraciones/lado) ───────────────────────────
function MobilityForm({ theme, draft, patch }: { theme: any; draft: BuilderBlock; patch: (f: Partial<BuilderBlock>) => void }) {
  return (
    <>
      <View style={styles.row2}>
        <Field theme={theme} label="Hold (seg)" value={draft.duration_sec != null ? String(draft.duration_sec) : ''} keyboardType="number-pad"
          onChangeText={(v: string) => { const n = parseInt(v, 10); patch({ duration_sec: v.trim() === '' ? null : Number.isFinite(n) ? n : null }) }} placeholder="30" />
        <Field theme={theme} label="Series (holds)" value={String(draft.sets ?? 1)} keyboardType="number-pad" onChangeText={(v: string) => patch({ sets: Math.max(1, Number(v) || 1) })} />
      </View>
      <View style={styles.row2}>
        <Field theme={theme} label="Respiraciones" value={draft.reps_unit === 'breaths' && draft.reps_value != null ? String(draft.reps_value) : ''} keyboardType="number-pad"
          onChangeText={(v: string) => { const n = parseInt(v, 10); const val = v.trim() === '' ? null : Number.isFinite(n) ? n : null; patch({ reps_value: val, reps_unit: val != null ? 'breaths' : null }) }} placeholder="5" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Lado</Text>
          <Segmented theme={theme} options={SIDE_MODES.map((s) => ({ value: s.value ?? 'bilateral', label: s.label }))}
            value={draft.side_mode ?? 'bilateral'} onChange={(v) => patch({ side_mode: v === 'bilateral' ? null : (v as SideMode) })} />
        </View>
      </View>
      <Field theme={theme} label="Descanso entre holds" value={draft.rest_time ?? ''} onChangeText={(v: string) => patch({ rest_time: v })} placeholder="30s" />
    </>
  )
}

// ── Formulario FOAM ROLLER (duración O pasadas + lado) ────────────────────────
function RollerForm({ theme, draft, patch }: { theme: any; draft: BuilderBlock; patch: (f: Partial<BuilderBlock>) => void }) {
  return (
    <>
      <View style={styles.row2}>
        <Field theme={theme} label="Duración (seg)" value={draft.duration_sec != null ? String(draft.duration_sec) : ''} keyboardType="number-pad"
          onChangeText={(v: string) => { const n = parseInt(v, 10); const val = v.trim() === '' ? null : Number.isFinite(n) ? n : null; patch({ duration_sec: val, ...(val != null ? { reps_value: null, reps_unit: null } : {}) }) }} placeholder="60" />
        <Field theme={theme} label="Pasadas" value={draft.reps_unit === 'passes' && draft.reps_value != null ? String(draft.reps_value) : ''} keyboardType="number-pad"
          onChangeText={(v: string) => { const n = parseInt(v, 10); const val = v.trim() === '' ? null : Number.isFinite(n) ? n : null; patch({ reps_value: val, reps_unit: val != null ? 'passes' : null, ...(val != null ? { duration_sec: null } : {}) }) }} placeholder="10" />
      </View>
      <Label theme={theme}>Lado</Label>
      <Segmented theme={theme} options={SIDE_MODES.map((s) => ({ value: s.value ?? 'bilateral', label: s.label }))}
        value={draft.side_mode ?? 'bilateral'} onChange={(v) => patch({ side_mode: v === 'bilateral' ? null : (v as SideMode) })} />
    </>
  )
}

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
            <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
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
  body: { paddingHorizontal: 18, paddingBottom: 48, gap: 12 },
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
  fieldLabelTiny: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold' },
  hintTiny: { fontSize: 10.5, lineHeight: 15 },
  row2: { flexDirection: 'row', gap: 10 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  inlineRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  unitBtn: { height: 44, minWidth: 48, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', borderRadius: 8 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, marginTop: 2 },
  areaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  areaDot: { width: 8, height: 8, borderRadius: 4 },
  zoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  zoneChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  dashedBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  dashedBtnText: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tplChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  toggleText: { fontSize: 14 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
  moveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moveChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  removeText: { fontSize: 14 },
})
