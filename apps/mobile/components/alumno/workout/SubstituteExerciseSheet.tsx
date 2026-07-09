import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { ArrowRightLeft, Check, Dumbbell, RotateCw, Search, TriangleAlert, X } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { Button } from '../../Button'
import { toast } from '../../Toast'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { exerciseThumb, normalizeString } from '../../../lib/exercises'
import {
  equipmentLabel,
  fetchSubstituteCandidates,
  SUBSTITUTION_REASON,
  type SubstituteCandidate,
  type SubstitutionCandidateSet,
} from '../../../lib/workout/substitution'

/**
 * SubstituteExerciseSheet (E2-05) — sustitucion de "maquina ocupada" del ejecutor alumno RN.
 *
 * Puerto DS del `SubstituteExerciseSheet` web (Fase L · workstream C). Bottom-sheet que sugiere
 * alternativas del MISMO grupo muscular (mismo query/ranking que la web, replicado en
 * `lib/workout/substitution.ts`), deja elegir una + un motivo (chips) y devuelve la eleccion via
 * `onSubstituted`. El cambio vale SOLO por la sesion de hoy: el plan no se toca; la escritura de
 * las columnas de log (`substituted_exercise_*`/`substitution_reason`) la hace el nucleo al
 * loguear usando `buildSubstitutionLogFields` (exportado abajo, contrato de integracion).
 *
 * Estados: cargando (skeleton) · vacio (sin alternativas) · error (Toast DS + reintentar).
 * Lazy: pide las sugerencias al abrir (evento raro, sin prefetch).
 */

interface Props {
  visible: boolean
  onClose(): void
  blockId: string
  exerciseName: string
  onSubstituted(sub: { exerciseId: string | null; name: string; reason: string | null }): void
}

/** Seleccion emitida por el sheet / consumida por el nucleo. */
export interface SubstitutionSelection {
  exerciseId: string | null
  name: string
  reason: string | null
}

/**
 * Helper PURO (contrato de integracion): mapea la seleccion a las columnas de `workout_logs`.
 * El nucleo lo hace merge dentro del payload del set al loguear. `null`/undefined ⇒ log normal
 * (sin sustitucion). No toca `exercise_id` del log (el sustituto vive SOLO en estas columnas —
 * migracion `20260704160352_workout_logs_substitution_columns.sql`, DC-4/AC-C7).
 */
export function buildSubstitutionLogFields(sub: SubstitutionSelection | null | undefined): {
  substituted_exercise_id: string | null
  substituted_exercise_name: string | null
  substitution_reason: string | null
} {
  if (!sub) {
    return { substituted_exercise_id: null, substituted_exercise_name: null, substitution_reason: null }
  }
  return {
    substituted_exercise_id: sub.exerciseId ?? null,
    substituted_exercise_name: sub.name ?? null,
    substitution_reason: sub.reason ?? null,
  }
}

/** Motivos de sustitucion (chips). El valor viaja al log; el default es paridad web (machine_busy). */
const REASONS: { key: string; label: string }[] = [
  { key: SUBSTITUTION_REASON, label: 'Máquina ocupada' },
  { key: 'pain', label: 'Molestia / dolor' },
  { key: 'no_equipment', label: 'Sin equipo' },
  { key: 'preference', label: 'Preferencia' },
]

export function SubstituteExerciseSheet({ visible, onClose, blockId, exerciseName, onSubstituted }: Props) {
  const { theme } = useTheme()
  const [set, setSet] = useState<SubstitutionCandidateSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState<string>(SUBSTITUTION_REASON)

  async function load() {
    if (!blockId) return
    setLoading(true)
    setError(false)
    setSet(null)
    try {
      const result = await fetchSubstituteCandidates(blockId)
      if (!result) {
        setError(true)
        toast.error('No se pudo resolver el ejercicio de este bloque.')
      } else {
        setSet(result)
      }
    } catch {
      setError(true)
      toast.error('No pudimos cargar alternativas. Revisa tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  // Pide sugerencias cada vez que se abre para un bloque concreto; limpia al cerrar.
  useEffect(() => {
    if (visible && blockId) {
      setQuery('')
      setSelectedId(null)
      setReason(SUBSTITUTION_REASON)
      load()
    }
    if (!visible) {
      setSet(null)
      setError(false)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, blockId])

  const muscleGroup = set?.current.muscle_group ?? null

  const filtered = useMemo(() => {
    const list = set?.candidates ?? []
    const q = normalizeString(query.trim())
    if (!q) return list
    return list.filter((c) => {
      const name = normalizeString(c.name)
      const equip = normalizeString(equipmentLabel(c.equipment))
      return name.includes(q) || equip.includes(q)
    })
  }, [set, query])

  const selected = filtered.find((c) => c.id === selectedId) ?? set?.candidates.find((c) => c.id === selectedId) ?? null

  function handleConfirm() {
    if (!selected) return
    onSubstituted({ exerciseId: selected.id, name: selected.name, reason })
    onClose()
  }

  const footer = (
    <Button
      label="Confirmar cambio"
      leftIcon={Check}
      variant="sport"
      onPress={handleConfirm}
      disabled={!selected}
      full
      size="lg"
      testID="substitute-confirm"
    />
  )

  return (
    <Sheet open={visible} onClose={onClose} snapPoints={['85%']} footer={footer} scrollable>
      {/* Header: objetivo prescrito + aviso "solo por hoy". */}
      <View style={styles.headerBlock}>
        <View style={styles.eyebrowRow}>
          <ArrowRightLeft size={14} color={theme.primary} strokeWidth={2.4} />
          <Text style={TYPE.eyebrow} className="text-sport-600">
            Cambiar ejercicio
          </Text>
        </View>
        <Text style={textStyle('xl', FONT.displayBold, { lh: 'snug', ls: 'tight' })} className="text-strong mt-1" numberOfLines={2}>
          {exerciseName}
        </Text>
        <Text style={TYPE.caption} className="text-muted mt-1">
          {muscleGroup ? `${muscleGroup} · ` : ''}El cambio vale solo por hoy y no toca tu plan.
        </Text>
      </View>

      {/* Buscador */}
      {!error ? (
        <View className="flex-row items-center bg-surface-sunken border border-subtle rounded-control" style={styles.searchBar}>
          <Search size={16} color={theme.mutedForeground} />
          <BottomSheetTextInput
            testID="substitute-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar alternativa…"
            placeholderTextColor={theme.mutedForeground}
            className="flex-1 text-strong"
            style={[styles.searchInput, { fontFamily: FONT.ui }]}
          />
          {query.length ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
              <X size={15} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Motivo (chips) */}
      {!error ? (
        <View style={styles.reasonWrap}>
          <Text style={TYPE.eyebrow} className="text-muted">
            Motivo
          </Text>
          <View style={styles.reasonRow}>
            {REASONS.map((r) => {
              const on = reason === r.key
              return (
                <TouchableOpacity
                  key={r.key}
                  testID={`substitute-reason-${r.key}`}
                  onPress={() => setReason(r.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={`justify-center rounded-pill ${on ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
                  style={styles.chip}
                >
                  <Text style={TYPE.caption} className={on ? 'text-on-sport' : 'text-body'}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ) : null}

      {/* Estado: cargando */}
      {loading ? (
        <View style={styles.stateWrap}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="flex-row items-center bg-surface-card border border-subtle rounded-control" style={styles.skeletonRow}>
              <View className="bg-surface-sunken" style={styles.skeletonThumb} />
              <View style={{ flex: 1, gap: 8 }}>
                <View className="bg-surface-sunken" style={[styles.skeletonLine, { width: '66%' }]} />
                <View className="bg-surface-sunken" style={[styles.skeletonLine, { width: '33%' }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Estado: error */}
      {!loading && error ? (
        <View style={styles.centerState}>
          <TriangleAlert size={30} color={theme.destructive} strokeWidth={2} />
          <Text style={TYPE.body} className="text-muted text-center">
            No pudimos cargar alternativas.
          </Text>
          <TouchableOpacity
            testID="substitute-retry"
            onPress={load}
            activeOpacity={0.85}
            className="flex-row items-center justify-center bg-surface-card border border-default rounded-control"
            style={styles.retryBtn}
          >
            <RotateCw size={16} color={theme.text} />
            <Text style={TYPE.label} className="text-strong">
              Reintentar
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Estado: vacio */}
      {!loading && !error && set && filtered.length === 0 ? (
        <View style={styles.centerState}>
          <View className="bg-surface-sunken items-center justify-center rounded-pill" style={styles.emptyIcon}>
            <Dumbbell size={26} color={theme.mutedForeground} />
          </View>
          <Text style={TYPE.body} className="text-muted text-center">
            {query.trim()
              ? 'Ninguna alternativa coincide con tu búsqueda.'
              : `No encontramos alternativas equivalentes para ${muscleGroup ?? 'este ejercicio'} en tu catálogo.`}
          </Text>
        </View>
      ) : null}

      {/* Lista de candidatos */}
      {!loading && !error && filtered.length > 0
        ? filtered.map((opt) => (
            <CandidateRow key={opt.id} opt={opt} selected={opt.id === selectedId} onPress={() => setSelectedId(opt.id)} />
          ))
        : null}
    </Sheet>
  )
}

function CandidateRow({ opt, selected, onPress }: { opt: SubstituteCandidate; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  const thumb = exerciseThumb(opt)
  return (
    <TouchableOpacity
      testID={`substitute-option-${opt.id}`}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Usar ${opt.name} (${equipmentLabel(opt.equipment)})`}
      className={`flex-row items-center rounded-control ${selected ? 'bg-sport-500/10 border-2 border-sport-500' : 'bg-surface-card border border-subtle'}`}
      style={[styles.optRow, selected ? styles.optRowSelected : null]}
    >
      <View className="bg-surface-sunken items-center justify-center overflow-hidden" style={styles.optThumb}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.optThumbImg} contentFit="contain" cachePolicy="memory-disk" recyclingKey={opt.id} />
        ) : (
          <Dumbbell size={18} color={theme.mutedForeground} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={textStyle('sm', FONT.uiBold, { lh: 'snug' })} className="text-strong" numberOfLines={1}>
          {opt.name}
        </Text>
        <View style={styles.optMetaRow}>
          <View className="bg-sport-500/15 rounded-pill" style={styles.optBadge}>
            <Text style={TYPE.eyebrow} className="text-sport-600">
              {equipmentLabel(opt.equipment)}
            </Text>
          </View>
          {opt.muscle_group ? (
            <Text style={TYPE.caption} className="text-muted" numberOfLines={1}>
              {opt.muscle_group}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        className={`items-center justify-center rounded-pill ${selected ? 'bg-sport-500' : 'border border-default'}`}
        style={styles.optCheck}
      >
        {selected ? <Check size={16} color={theme.primaryForeground} strokeWidth={2.6} /> : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  headerBlock: { gap: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchBar: { gap: 10, paddingHorizontal: 12, height: 46 },
  searchInput: { fontSize: 15, paddingVertical: 0 },
  reasonWrap: { gap: 8 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 13, height: 34 },
  stateWrap: { gap: 10 },
  skeletonRow: { gap: 12, padding: 12 },
  skeletonThumb: { width: 48, height: 48, borderRadius: 10 },
  skeletonLine: { height: 12, borderRadius: 6 },
  centerState: { alignItems: 'center', gap: 12, paddingVertical: 36, paddingHorizontal: 8 },
  retryBtn: { gap: 8, paddingHorizontal: 16, height: 44 },
  emptyIcon: { width: 56, height: 56 },
  optRow: { gap: 12, padding: 12 },
  optRowSelected: {},
  optThumb: { width: 48, height: 48, borderRadius: 10 },
  optThumbImg: { width: 48, height: 48 },
  optMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  optBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  optCheck: { width: 30, height: 30 },
})
