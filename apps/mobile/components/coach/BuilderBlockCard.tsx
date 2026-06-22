import { memo, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Check, ChevronDown, CircleHelp, GripVertical, Minus, Plus, Settings2, X } from 'lucide-react-native'
import { ScaleDecorator } from 'react-native-draggable-flatlist'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import { effectiveExerciseType, typedBlockSummary } from '../../lib/workout-exercise-type'
import type { AreaVM } from '../../lib/areas'
import { effectiveAreaKey } from '../../lib/workout-areas-grouping'
import type { BuilderBlock, BuilderSection } from '../../lib/plan-builder/types'

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return `rgba(107,114,128,${a})`
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`
}

const SECTION_SHORT: Record<BuilderSection, string> = { warmup: 'CAL', main: 'PRI', cooldown: 'ENF' }
const SECTIONS: BuilderSection[] = ['warmup', 'main', 'cooldown']

interface Props {
  block: BuilderBlock
  drag: () => void
  isActive: boolean
  onEdit: (uid: string) => void
  onRemove: (uid: string) => void
  onUpdate: (block: BuilderBlock) => void
  onSetSection: (uid: string, section: BuilderSection) => void
  onToggleSuperset: (uid: string) => void
  /** Áreas visibles (system + custom) ya como VM (chips del area-picker on-card). */
  areas?: AreaVM[]
  /** Mover el bloque a un área (espejo del popover web "Mover a área"). */
  onSetArea?: (uid: string, areaId: string) => void
  /** Navegar a gestionar áreas (espejo del link "Gestionar áreas" → /coach/settings/areas). */
  onManageAreas?: () => void
  /** Fallback de media desde el catálogo (por exercise_id) cuando el bloque no la trae. */
  catGif?: string | null
  catImage?: string | null
  catVideo?: string | null
}

/** Card de ejercicio 1:1 con la web (ExerciseBlock): borde por músculo, miniatura,
 *  badges (sección, sets×reps con quick-edit, descanso, superserie, progresión, músculo)
 *  + botones CAL/PRI/ENF + eliminar. */
function BuilderBlockCardInner({ block, drag, isActive, onEdit, onRemove, onUpdate, onSetSection, onToggleSuperset, areas, onSetArea, onManageAreas, catGif, catImage, catVideo }: Props) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [areaPickerOpen, setAreaPickerOpen] = useState(false)
  const [qs, setQs] = useState(block.sets ?? 3)
  const [qr, setQr] = useState(block.reps ?? '8-10')
  useEffect(() => { setQs(block.sets ?? 3); setQr(block.reps ?? '8-10') }, [block.uid])

  // Área efectiva del bloque (espejo de ExerciseBlock web): section_template_id → área system del
  // section legacy. Si el id no está en la lista conocida, cae al área legacy del bloque.
  const areaVMs = areas ?? []
  const areaPickerEnabled = !!onSetArea && areaVMs.length > 0
  const areaKey = useMemo(
    () => effectiveAreaKey(block, new Set(areaVMs.map((a) => a.id))),
    [block, areaVMs],
  )
  const currentArea = areaVMs.find((a) => a.id === areaKey) ?? areaVMs.find((a) => a.slug === 'main') ?? areaVMs[0]

  const muscle = getMuscleColor(block.muscle_group)
  const sec: BuilderSection = block.section === 'warmup' || block.section === 'cooldown' ? block.section : 'main'
  const secC = sec === 'warmup' ? '#F59E0B' : sec === 'cooldown' ? '#38BDF8' : theme.primary
  const thumb = exerciseThumb({ gif_url: block.gif_url ?? catGif ?? null, image_url: catImage ?? null, video_url: block.video_url ?? catVideo ?? null })
  // Resumen por tipo (specs/movida-entrenamiento, 1:1 web ExerciseBlock): null en strength sin
  // prescripción tipada ⇒ se renderiza el chip legacy "sets × reps" exactamente como hoy (AC3).
  // En cardio/movilidad/roller (o farmer carry) muestra el resumen tipado y nunca quick-edit.
  const blockType = effectiveExerciseType(block, { exercise_type: block.exercise_type })
  const typedSummary = (() => {
    const dist = parseFloat((block.distance_value || '').replace(',', '.'))
    return typedBlockSummary(
      { ...block, distance_value: Number.isFinite(dist) ? dist : null, load_value: null },
      blockType,
    )
  })()
  const complete = (block.sets ?? 0) > 0 && !!block.reps

  function saveQuick() { onUpdate({ ...block, sets: qs, reps: qr }); setEditing(false) }

  return (
    <ScaleDecorator>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: muscle, opacity: isActive ? 0.6 : 1 }]}>
        <TouchableOpacity onLongPress={drag} delayLongPress={140} hitSlop={6} style={styles.grip}>
          <GripVertical size={16} color={theme.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.thumb, { backgroundColor: hexToRgba(muscle, 0.15) }]}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={block.uid} />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: hexToRgba(muscle, 0.22) }} />
          )}
        </View>

        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(block.uid)}>
            <Text numberOfLines={2} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{block.exercise_name}</Text>
          </TouchableOpacity>

          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: hexToRgba(secC, 0.14), borderColor: hexToRgba(secC, 0.4) }]}>
              <Text style={[styles.badgeT, { color: secC }]}>{SECTION_SHORT[sec]}</Text>
            </View>
            {/* P-F7: badge de override (bloque modificado vs plantilla base). */}
            {block.is_override ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba('#F59E0B', 0.14), borderColor: hexToRgba('#F59E0B', 0.4) }]}>
                <Text style={[styles.badgeT, { color: '#F59E0B' }]}>MODIF.</Text>
              </View>
            ) : null}

            {typedSummary ? (
              // Bloque tipado (cardio/movilidad/roller o farmer carry): resumen, sin quick-edit.
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}>
                <Text style={[styles.badgeT, { color: theme.foreground }]}>{typedSummary}</Text>
              </View>
            ) : editing ? (
              <View style={styles.qrow}>
                <TouchableOpacity onPress={() => setQs((s) => Math.max(1, s - 1))} hitSlop={6} style={styles.qbtn}><Minus size={12} color={theme.primary} /></TouchableOpacity>
                <Text style={[styles.qval, { color: theme.foreground }]}>{qs}</Text>
                <TouchableOpacity onPress={() => setQs((s) => Math.min(20, s + 1))} hitSlop={6} style={styles.qbtn}><Plus size={12} color={theme.primary} /></TouchableOpacity>
                <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>×</Text>
                <TextInput value={qr} onChangeText={setQr} autoFocus style={[styles.qinput, { color: theme.foreground, borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.08) }]} />
                <TouchableOpacity onPress={saveQuick} style={[styles.okbtn, { backgroundColor: hexToRgba(theme.primary, 0.15) }]}><Text style={{ color: theme.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }}>OK</Text></TouchableOpacity>
              </View>
            ) : complete ? (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}>
                <Text style={[styles.badgeT, { color: theme.foreground }]}>{block.sets} × {block.reps}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.3)' }]}>
                <Text style={[styles.badgeT, { color: '#F97316' }]}>INCOMPLETO</Text>
              </TouchableOpacity>
            )}

            {block.rest_time ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}><Text style={[styles.badgeT, { color: theme.mutedForeground }]}>⏱ {block.rest_time}</Text></View>
            ) : null}
            {block.superset_group ? (
              <TouchableOpacity onPress={() => onToggleSuperset(block.uid)} style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.3) }]}><Text style={[styles.badgeT, { color: theme.primary }]}>SS·{block.superset_group}</Text></TouchableOpacity>
            ) : null}
            {block.progression_type ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.25)' }]}><Text style={[styles.badgeT, { color: '#10B981' }]}>↑{block.progression_type === 'weight' ? `${block.progression_value ?? '?'}kg` : `${block.progression_value ?? '?'}r`}</Text></View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: muscle, borderColor: 'transparent', maxWidth: 120 }]}><Text style={[styles.badgeT, { color: '#fff' }]} numberOfLines={1}>{block.muscle_group}</Text></View>

            {/* Area-picker on-card (espejo del popover web "Mover a área" + "Gestionar áreas"). */}
            {areaPickerEnabled && currentArea ? (
              <TouchableOpacity
                onPress={() => setAreaPickerOpen(true)}
                activeOpacity={0.8}
                style={[styles.areaChip, { borderColor: currentArea.color + '66', backgroundColor: currentArea.color + '1A' }]}
              >
                <View style={[styles.areaDot, { backgroundColor: currentArea.color }]} />
                <Text style={[styles.areaChipT, { color: currentArea.color }]} numberOfLines={1}>{currentArea.shortLabel}</Text>
                <ChevronDown size={11} color={currentArea.color} strokeWidth={3} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.secSwitch}>
            {SECTIONS.map((s) => {
              const on = sec === s
              return (
                <TouchableOpacity key={s} onPress={() => onSetSection(block.uid, s)} style={[styles.secBtn, { backgroundColor: on ? theme.primary : hexToRgba(theme.mutedForeground, 0.12) }]}>
                  <Text style={{ fontSize: 8, fontFamily: 'Inter_700Bold', color: on ? theme.primaryForeground : theme.mutedForeground }}>{SECTION_SHORT[s]}</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity onPress={() => setHelpOpen(true)} hitSlop={8} style={[styles.helpBtn, { borderColor: theme.border }]}>
              <CircleHelp size={13} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
          <Pressable style={styles.helpBackdrop} onPress={() => setHelpOpen(false)}>
            <Pressable style={[styles.helpCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <Text style={[styles.helpTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Secciones (CAL / PRI / ENF)</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}><Text style={{ color: theme.foreground, fontFamily: 'Inter_700Bold' }}>CAL</Text> (Calentamiento): prepara el cuerpo antes del trabajo intenso.</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}><Text style={{ color: theme.foreground, fontFamily: 'Inter_700Bold' }}>PRI</Text> (Principal): bloque principal (volumen e intensidad).</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}><Text style={{ color: theme.foreground, fontFamily: 'Inter_700Bold' }}>ENF</Text> (Enfriamiento): bajar pulsaciones y recuperación al final.</Text>
              <Text style={[styles.helpTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold', marginTop: 6 }]}>Superserie</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Une el ejercicio con el siguiente solo si están en la misma sección. Si cambiás la sección de uno, el enlace se rompe.</Text>
              <TouchableOpacity onPress={() => setHelpOpen(false)} style={[styles.helpClose, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold', fontSize: 13 }}>Entendido</Text></TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Picker de área (espejo del popover web): "Mover a área" + lista de chips + "Gestionar áreas". */}
        <Modal visible={areaPickerOpen} transparent animationType="fade" onRequestClose={() => setAreaPickerOpen(false)}>
          <Pressable style={styles.helpBackdrop} onPress={() => setAreaPickerOpen(false)}>
            <Pressable style={[styles.areaCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <Text style={[styles.areaPickerTitle, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>MOVER A ÁREA</Text>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {areaVMs.map((area) => {
                  const on = area.id === areaKey
                  return (
                    <TouchableOpacity
                      key={area.id}
                      activeOpacity={0.8}
                      onPress={() => { setAreaPickerOpen(false); if (!on) onSetArea?.(block.uid, area.id) }}
                      style={[styles.areaRow, on && { backgroundColor: theme.primary + '14' }]}
                    >
                      <View style={[styles.areaRowBadge, { borderColor: area.color + '66', backgroundColor: area.color + '1A' }]}>
                        <Text style={[styles.areaRowBadgeT, { color: area.color }]}>{area.shortLabel}</Text>
                      </View>
                      <Text style={[styles.areaRowName, { color: on ? theme.primary : theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{area.name}</Text>
                      {on ? <Check size={15} color={theme.primary} /> : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              <TouchableOpacity
                onPress={() => { setAreaPickerOpen(false); onManageAreas?.() }}
                activeOpacity={0.8}
                style={[styles.areaManage, { borderColor: theme.border }]}
              >
                <Settings2 size={13} color={theme.mutedForeground} />
                <Text style={[styles.areaManageT, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Gestionar áreas</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <TouchableOpacity onPress={() => onRemove(block.uid)} hitSlop={6} style={styles.del}>
          <X size={18} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  )
}

// Memo: re-render sólo si cambia el bloque (identidad), su estado de drag o la media del catálogo.
// Ignora handlers inline del renderItem → no re-render por estado ajeno del builder.
export const BuilderBlockCard = memo(
  BuilderBlockCardInner,
  (a, b) =>
    a.block === b.block &&
    a.isActive === b.isActive &&
    a.catGif === b.catGif &&
    a.catImage === b.catImage &&
    a.catVideo === b.catVideo &&
    a.areas === b.areas &&
    a.onSetArea === b.onSetArea &&
    a.onManageAreas === b.onManageAreas &&
    a.drag === b.drag,
)

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, marginBottom: 6 },
  grip: { paddingTop: 2 },
  thumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden' },
  thumbImg: { width: 40, height: 40 },
  name: { fontSize: 12.5, letterSpacing: 0.3, textTransform: 'uppercase' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  badge: { borderWidth: 1, borderColor: 'transparent', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeT: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.2, textTransform: 'uppercase' },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qbtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(127,127,127,0.12)' },
  qval: { fontSize: 12, fontFamily: 'Montserrat_700Bold', minWidth: 16, textAlign: 'center' },
  qinput: { width: 56, height: 26, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, fontSize: 12, textAlign: 'center' },
  okbtn: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  secSwitch: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  secBtn: { minWidth: 34, paddingVertical: 4, alignItems: 'center', borderRadius: 6 },
  helpBtn: { width: 26, height: 26, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  del: { padding: 4 },
  helpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  helpCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 },
  helpTitle: { fontSize: 14 },
  helpLine: { fontSize: 12.5, lineHeight: 18 },
  helpClose: { marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 110 },
  areaDot: { width: 6, height: 6, borderRadius: 3 },
  areaChipT: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.2, textTransform: 'uppercase' },
  areaCard: { width: '100%', maxWidth: 340, borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
  areaPickerTitle: { fontSize: 9.5, letterSpacing: 0.8, paddingHorizontal: 6, paddingBottom: 6, paddingTop: 2 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 9 },
  areaRowBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  areaRowBadgeT: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.2, textTransform: 'uppercase' },
  areaRowName: { flex: 1, fontSize: 13.5 },
  areaManage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 11 },
  areaManageT: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
})
