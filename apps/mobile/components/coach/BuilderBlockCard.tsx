import { memo, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Check, ChevronDown, CircleHelp, GripVertical, Minus, Plus, X } from 'lucide-react-native'
import { ScaleDecorator } from 'react-native-draggable-flatlist'
import { effectiveExerciseType, typedBlockSummary } from '@eva/workout-engine'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../lib/exercise-type-meta'
import { buildMobileAreaVMs, type MobileAreaVM } from '../../lib/builder-area-vm'
import type { BuilderBlock } from '../../lib/plan-builder/types'

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return `rgba(107,114,128,${a})`
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`
}

interface Props {
  block: BuilderBlock
  drag: () => void
  isActive: boolean
  onEdit: (uid: string) => void
  onRemove: (uid: string) => void
  onUpdate: (block: BuilderBlock) => void
  /** Areas disponibles (VM con color/label) para el selector "Mover a área". */
  areaVMs?: MobileAreaVM[]
  /** Clave de área efectiva del bloque (precalculada por el builder). */
  currentAreaId?: string
  /** Mover el bloque a otra área (persiste section_template_id vía SET_BLOCK_AREA). */
  onSetArea?: (uid: string, areaId: string) => void
  onToggleSuperset: (uid: string) => void
  /** Fallback de media desde el catálogo (por exercise_id) cuando el bloque no la trae. */
  catGif?: string | null
  catImage?: string | null
  catVideo?: string | null
}

/** Card de ejercicio 1:1 con la web (ExerciseBlock): borde por músculo, miniatura, badge de
 *  ÁREA (color), chip resumen typed (cardio/movilidad/roller) o sets×reps con quick-edit /
 *  "Incompleto", descanso, superserie, progresión, músculo + selector de área + eliminar. */
function BuilderBlockCardInner({ block, drag, isActive, onEdit, onRemove, onUpdate, areaVMs, currentAreaId, onSetArea, onToggleSuperset, catGif, catImage, catVideo }: Props) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [qs, setQs] = useState(block.sets ?? 3)
  const [qr, setQr] = useState(block.reps ?? '8-10')
  useEffect(() => { setQs(block.sets ?? 3); setQr(block.reps ?? '8-10') }, [block.uid])

  const muscle = getMuscleColor(block.muscle_group)
  const thumb = exerciseThumb({ gif_url: block.gif_url ?? catGif ?? null, image_url: catImage ?? null, video_url: block.video_url ?? catVideo ?? null })
  const complete = (block.sets ?? 0) > 0 && !!block.reps

  // Área efectiva → badge de color (main hereda la marca vía theme.primary).
  const vms = areaVMs && areaVMs.length ? areaVMs : buildMobileAreaVMs([])
  const currentArea: MobileAreaVM | undefined = vms.find((v) => v.id === currentAreaId) ?? vms.find((v) => v.slug === 'main') ?? vms[0]
  const areaC = currentArea ? (currentArea.color ?? theme.primary) : theme.primary

  // Resumen por tipo (specs/movida-entrenamiento): null en strength ⇒ chip legacy sets×reps.
  const blockType = effectiveExerciseType(block, { exercise_type: block.exercise_type })
  const typedSummary = useMemo(() => {
    if (blockType === 'strength') return null
    const dist = parseFloat((block.distance_value || '').replace(',', '.'))
    return typedBlockSummary({ ...block, distance_value: Number.isFinite(dist) ? dist : null, load_value: null }, blockType)
  }, [block, blockType])
  const TypeIcon = EXERCISE_TYPE_META[blockType].Icon
  const typeColor = exerciseTypeColor(blockType, theme.primary)

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
            <Text numberOfLines={2} style={[styles.name, { color: theme.foreground, fontFamily: FONT.display }]}>{block.exercise_name}</Text>
          </TouchableOpacity>

          <View style={styles.badges}>
            {/* Badge de ÁREA (color del área efectiva) */}
            <View style={[styles.badge, { backgroundColor: hexToRgba(areaC, 0.14), borderColor: hexToRgba(areaC, 0.4) }]}>
              <Text style={[styles.badgeT, { color: areaC }]}>{currentArea?.shortLabel ?? 'PRI'}</Text>
            </View>
            {/* P-F7: badge de override (bloque modificado vs plantilla base). */}
            {block.is_override ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba('#F5A524', 0.14), borderColor: hexToRgba('#F5A524', 0.4) }]}>
                <Text style={[styles.badgeT, { color: '#F5A524' }]}>MODIF.</Text>
              </View>
            ) : null}

            {editing ? (
              <View style={styles.qrow}>
                <TouchableOpacity onPress={() => setQs((s) => Math.max(1, s - 1))} hitSlop={6} style={styles.qbtn}><Minus size={12} color={theme.primary} /></TouchableOpacity>
                <Text style={[styles.qval, { color: theme.foreground }]}>{qs}</Text>
                <TouchableOpacity onPress={() => setQs((s) => Math.min(20, s + 1))} hitSlop={6} style={styles.qbtn}><Plus size={12} color={theme.primary} /></TouchableOpacity>
                <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>×</Text>
                <TextInput value={qr} onChangeText={setQr} autoFocus style={[styles.qinput, { color: theme.foreground, borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.08) }]} />
                <TouchableOpacity onPress={saveQuick} style={[styles.okbtn, { backgroundColor: hexToRgba(theme.primary, 0.15) }]}><Text style={{ color: theme.primary, fontSize: 10, fontFamily: FONT.uiBold }}>OK</Text></TouchableOpacity>
              </View>
            ) : typedSummary ? (
              // Chip resumen typed (cardio/movilidad/roller): icono del tipo + resumen. Tap ⇒ editor.
              <TouchableOpacity onPress={() => onEdit(block.uid)} style={[styles.typedChip, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}>
                <TypeIcon size={13} color={typeColor} />
                <Text style={[styles.typedChipT, { color: theme.foreground, fontFamily: FONT.monoBold }]} numberOfLines={1}>{typedSummary}</Text>
              </TouchableOpacity>
            ) : complete ? (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}>
                <Text style={[styles.badgeT, { color: theme.foreground, fontFamily: FONT.monoBold }]}>{block.sets} × {block.reps}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: hexToRgba(theme.destructive, 0.12), borderColor: hexToRgba(theme.destructive, 0.3) }]}>
                <Text style={[styles.badgeT, { color: theme.destructive }]}>INCOMPLETO</Text>
              </TouchableOpacity>
            )}

            {block.rest_time ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}><Text style={[styles.badgeT, { color: theme.mutedForeground, fontFamily: FONT.monoBold }]}>⏱ {block.rest_time}</Text></View>
            ) : null}
            {block.superset_group ? (
              <TouchableOpacity onPress={() => onToggleSuperset(block.uid)} style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.3) }]}><Text style={[styles.badgeT, { color: theme.primary }]}>SS·{block.superset_group}</Text></TouchableOpacity>
            ) : null}
            {block.progression_type ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.25) }]}><Text style={[styles.badgeT, { color: theme.primary }]}>↑{block.progression_type === 'weight' ? `${block.progression_value ?? '?'}kg` : `${block.progression_value ?? '?'}r`}</Text></View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: muscle, borderColor: 'transparent', maxWidth: 120 }]}><Text style={[styles.badgeT, { color: '#fff' }]} numberOfLines={1}>{block.muscle_group}</Text></View>
          </View>

          {/* Selector de ÁREA (mover a otra área) + ayuda */}
          <View style={styles.secSwitch}>
            {onSetArea ? (
              <TouchableOpacity onPress={() => setAreaOpen(true)} activeOpacity={0.8} style={[styles.areaBtn, { borderColor: hexToRgba(areaC, 0.4), backgroundColor: hexToRgba(areaC, 0.1) }]}>
                <Text style={{ fontSize: 9, fontFamily: FONT.uiBold, color: areaC, letterSpacing: 0.3 }}>{currentArea?.shortLabel ?? 'PRI'}</Text>
                <ChevronDown size={11} color={areaC} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setHelpOpen(true)} hitSlop={8} style={[styles.helpBtn, { borderColor: theme.border }]}>
              <CircleHelp size={13} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal selector de área */}
        <Modal visible={areaOpen} transparent animationType="fade" onRequestClose={() => setAreaOpen(false)}>
          <Pressable style={styles.helpBackdrop} onPress={() => setAreaOpen(false)}>
            <Pressable style={[styles.helpCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <Text style={[styles.helpTitle, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>MOVER A ÁREA</Text>
              {vms.map((area) => {
                const on = area.id === (currentArea?.id ?? currentAreaId)
                const c = area.color ?? theme.primary
                return (
                  <TouchableOpacity key={area.id} onPress={() => { setAreaOpen(false); if (onSetArea && !on) onSetArea(block.uid, area.id) }} activeOpacity={0.8}
                    style={[styles.areaRow, on && { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
                    <View style={[styles.areaDot, { backgroundColor: c }]} />
                    <Text style={[styles.areaRowT, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{area.name}</Text>
                    {on ? <Check size={15} color={theme.primary} /> : null}
                  </TouchableOpacity>
                )
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
          <Pressable style={styles.helpBackdrop} onPress={() => setHelpOpen(false)}>
            <Pressable style={[styles.helpCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <Text style={[styles.helpTitle, { color: theme.foreground, fontFamily: FONT.display }]}>Áreas del día</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cada día se organiza por <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold }}>áreas</Text> (Calentamiento, Principal, Enfriamiento, Movilidad…). El badge de color muestra el área del ejercicio; usa el selector con la flecha para moverlo.</Text>
              <Text style={[styles.helpTitle, { color: theme.foreground, fontFamily: FONT.display, marginTop: 6 }]}>Superserie</Text>
              <Text style={[styles.helpLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Une el ejercicio con el siguiente solo si están en la misma área. Si cambias el área de uno, el enlace se rompe.</Text>
              <TouchableOpacity onPress={() => setHelpOpen(false)} style={[styles.helpClose, { backgroundColor: theme.primary }]}><Text style={{ color: theme.primaryForeground, fontFamily: FONT.display, fontSize: 13 }}>Entendido</Text></TouchableOpacity>
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

// Memo: re-render sólo si cambia el bloque (identidad), su estado de drag, la media del
// catálogo, o el área asignada / las áreas disponibles.
export const BuilderBlockCard = memo(
  BuilderBlockCardInner,
  (a, b) =>
    a.block === b.block &&
    a.isActive === b.isActive &&
    a.catGif === b.catGif &&
    a.catImage === b.catImage &&
    a.catVideo === b.catVideo &&
    a.currentAreaId === b.currentAreaId &&
    a.areaVMs === b.areaVMs &&
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
  badgeT: { fontSize: 9, fontFamily: FONT.uiBold, letterSpacing: 0.2, textTransform: 'uppercase' },
  typedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 160 },
  typedChipT: { fontSize: 10, letterSpacing: 0.2 },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qbtn: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(127,127,127,0.12)' },
  qval: { fontSize: 12, fontFamily: FONT.display, minWidth: 16, textAlign: 'center' },
  qinput: { width: 56, height: 26, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, fontSize: 12, textAlign: 'center' },
  okbtn: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  secSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  areaBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 28, paddingHorizontal: 8, borderWidth: 1, borderRadius: 7 },
  helpBtn: { width: 26, height: 26, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  del: { padding: 4 },
  helpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  helpCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 },
  helpTitle: { fontSize: 14 },
  helpLine: { fontSize: 12.5, lineHeight: 18 },
  helpClose: { marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10 },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  areaRowT: { flex: 1, fontSize: 14 },
})
