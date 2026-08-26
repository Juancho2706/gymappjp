import { memo, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Check, ChevronDown, ChevronUp, CircleHelp, GripVertical, Link2, Minus, Play, Plus, Trash2 } from 'lucide-react-native'
import { ScaleDecorator } from 'react-native-draggable-flatlist'
import { effectiveExerciseType, typedBlockSummary } from '@eva/workout-engine'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { exerciseThumb, type ExerciseRow } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import { ExerciseMediaLightbox, isExerciseMediaPlayable, type ExerciseMediaSource } from './ExerciseMediaLightbox'
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
  /** Badge SS·letra de la fila → SIEMPRE desagrupa (web: intent 'unlink'). */
  onToggleSuperset: (uid: string) => void
  /** Mini-fila inferior (1:1 web narrowLayout): enlaza/desenlaza con el SIGUIENTE de la misma área. */
  onTapSuperset?: () => void
  /** false ⇒ el botón SS queda deshabilitado (no hay siguiente en la misma área ni grupo propio). */
  supersetEnabled?: boolean
  /** Rail de chevrons ▲▼ (1:1 web ExerciseBlock): reordenar el bloque dentro de su área. */
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  /**
   * Fila del catálogo del ejercicio (`catById` del builder). Cubre lo que el bloque no trae:
   * `image_url` y el recorte `[start,end]` del coach, además de servir de respaldo de gif/video.
   */
  catalogRow?: ExerciseRow | null
}

/** Card de ejercicio 1:1 con la web (ExerciseBlock en `narrowLayout`): borde por músculo,
 *  miniatura, badge de ÁREA (color), chip resumen typed (cardio/movilidad/roller) o sets×reps
 *  con quick-edit / "Incompleto", descanso, superserie, progresión, músculo, selector de área
 *  y ayuda — todo en la MISMA fila envolvente — y una mini-fila inferior con SS (izquierda) y
 *  el tacho de eliminar (derecha). */
function BuilderBlockCardInner({ block, drag, isActive, onEdit, onRemove, onUpdate, areaVMs, currentAreaId, onSetArea, onToggleSuperset, onTapSuperset, supersetEnabled = false, onMoveUp, onMoveDown, canMoveUp, canMoveDown, catalogRow }: Props) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [qs, setQs] = useState(block.sets ?? 3)
  const [qr, setQr] = useState(block.reps ?? '8-10')
  useEffect(() => { setQs(block.sets ?? 3); setQr(block.reps ?? '8-10') }, [block.uid])

  const muscle = getMuscleColor(block.muscle_group)
  // Media del ejercicio: lo que trae el bloque + lo que solo vive en el catálogo (`image_url` y el
  // recorte del coach). Misma resolución que el editor de bloque y que la app del alumno.
  const media: ExerciseMediaSource = {
    gif_url: block.gif_url ?? catalogRow?.gif_url ?? null,
    image_url: catalogRow?.image_url ?? null,
    video_url: block.video_url ?? catalogRow?.video_url ?? null,
    start: catalogRow?.video_start_time ?? null,
    end: catalogRow?.video_end_time ?? null,
  }
  const thumb = exerciseThumb(media)
  const mediaPlayable = isExerciseMediaPlayable(media)
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
        <View style={styles.cardRow}>
        <TouchableOpacity onLongPress={drag} delayLongPress={140} hitSlop={6} style={styles.grip}>
          <GripVertical size={16} color={theme.mutedForeground} />
        </TouchableOpacity>

        {/* P2.3: la miniatura abre el MISMO lightbox que el editor de bloque. El medio solo se monta
            al abrirlo, así que la lista de un día con 12 ejercicios no monta ningún WebView. */}
        <TouchableOpacity
          onPress={() => setMediaOpen(true)}
          disabled={!thumb}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Ver multimedia de ${block.exercise_name}`}
          style={[styles.thumb, { backgroundColor: hexToRgba(muscle, 0.15) }]}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={block.uid} />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: hexToRgba(muscle, 0.22) }} />
          )}
          {mediaPlayable ? (
            <View style={styles.thumbPlay} pointerEvents="none">
              <Play size={11} color="#fff" fill="#fff" />
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.body}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(block.uid)}>
            <Text numberOfLines={2} style={[styles.name, { color: theme.foreground, fontFamily: FONT.uiBold }]}>{block.exercise_name}</Text>
          </TouchableOpacity>

          <View style={styles.badges}>
            {/* Badge de ÁREA (color del área efectiva) */}
            <View style={[styles.badge, { backgroundColor: hexToRgba(areaC, 0.14), borderColor: hexToRgba(areaC, 0.4) }]}>
              <Text style={[styles.badgeT, { color: areaC, fontSize: 8, fontFamily: FONT.uiExtra }]}>{currentArea?.shortLabel ?? 'PRI'}</Text>
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
                <Text style={[styles.typedChipT, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{typedSummary}</Text>
              </TouchableOpacity>
            ) : complete ? (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}>
                <Text style={[styles.badgeT, { color: theme.foreground, fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'none' }]}>{block.sets} × {block.reps}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={[styles.badge, { backgroundColor: hexToRgba(theme.destructive, 0.12), borderColor: hexToRgba(theme.destructive, 0.3) }]}>
                <Text style={[styles.badgeT, { color: theme.destructive, fontSize: 10, textTransform: 'none' }]}>Incompleto</Text>
              </TouchableOpacity>
            )}

            {block.rest_time ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.foreground, 0.06) }]}><Text style={[styles.badgeT, { color: theme.mutedForeground, fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'none' }]}>⏱ {block.rest_time}</Text></View>
            ) : null}
            {block.superset_group ? (
              <TouchableOpacity onPress={() => onToggleSuperset(block.uid)} style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.3) }]}><Text style={[styles.badgeT, { color: theme.primary }]}>SS·{block.superset_group}</Text></TouchableOpacity>
            ) : null}
            {block.progression_type ? (
              <View style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.25) }]}><Text style={[styles.badgeT, { color: theme.primary, fontSize: 10, textTransform: 'none' }]}>↑{block.progression_type === 'weight' ? `${block.progression_value ?? '?'}kg` : `${block.progression_value ?? '?'}r`}</Text></View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: muscle, borderColor: 'transparent', maxWidth: 120 }]}><Text style={[styles.badgeT, { color: '#fff' }]} numberOfLines={1}>{block.muscle_group}</Text></View>

            {/* Selector de ÁREA (mover a otra área) + ayuda — MISMA fila envolvente que los chips (1:1 web) */}
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

        {/* Rail de reordenar por tap (1:1 web): ▲▼ dentro del área */}
        {onMoveUp || onMoveDown ? (
          <View style={[styles.rail, { borderLeftColor: theme.border }]}>
            <TouchableOpacity onPress={onMoveUp} disabled={!canMoveUp} hitSlop={4}
              style={[styles.railBtn, { borderBottomWidth: 1, borderBottomColor: theme.border, opacity: canMoveUp ? 1 : 0.3 }]}>
              <ChevronUp size={16} color={theme.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onMoveDown} disabled={!canMoveDown} hitSlop={4}
              style={[styles.railBtn, { opacity: canMoveDown ? 1 : 0.3 }]}>
              <ChevronDown size={16} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : null}
        </View>

        {/* Mini-fila de acciones (1:1 web narrowLayout): SS abajo-izquierda, tacho abajo-derecha */}
        <View style={styles.actionRow}>
          {onTapSuperset ? (
            <TouchableOpacity onPress={onTapSuperset} disabled={!supersetEnabled} hitSlop={4} activeOpacity={0.7}
              accessibilityLabel={block.superset_group ? 'Quitar de la superserie' : 'Agrupar como superserie con el siguiente ejercicio'}
              style={[styles.ssBtn, { opacity: supersetEnabled ? 1 : 0.4 }]}>
              <Link2 size={13} color={block.superset_group ? theme.primary : theme.mutedForeground} />
              <Text style={[styles.ssBtnTxt, { color: block.superset_group ? theme.primary : theme.mutedForeground, fontFamily: FONT.uiBold }]}>SS</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => onRemove(block.uid)} hitSlop={6} activeOpacity={0.7}
            accessibilityLabel="Eliminar ejercicio" style={styles.del}>
            <Trash2 size={16} color={theme.destructive} />
          </TouchableOpacity>
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

        <ExerciseMediaLightbox
          visible={mediaOpen}
          media={media}
          title={block.exercise_name}
          onClose={() => setMediaOpen(false)}
        />

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
    // Identidad estable: `catById` del builder está memoizado sobre el catálogo.
    a.catalogRow === b.catalogRow &&
    a.currentAreaId === b.currentAreaId &&
    a.areaVMs === b.areaVMs &&
    a.canMoveUp === b.canMoveUp &&
    a.canMoveDown === b.canMoveDown &&
    a.supersetEnabled === b.supersetEnabled &&
    a.drag === b.drag,
)

const styles = StyleSheet.create({
  // Contenedor en COLUMNA (1:1 web): fila principal + mini-fila de acciones. El padding vive en
  // los hijos para que el rail ▲▼ llegue de borde a borde vertical, como en la web.
  card: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, marginBottom: 6, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 10 },
  body: { flex: 1, minWidth: 0, gap: 6, paddingRight: 10, paddingVertical: 10 },
  grip: { paddingTop: 12 },
  thumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 40, height: 40 },
  // Badge de play sobre la miniatura: solo cuando el medio se reproduce (gif/video/YouTube).
  thumbPlay: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14.5, lineHeight: 18 },
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
  areaBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 26, paddingHorizontal: 8, borderWidth: 1, borderRadius: 7 },
  helpBtn: { width: 26, height: 26, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rail: { alignSelf: 'stretch', width: 38, borderLeftWidth: 1 },
  railBtn: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  // Mini-fila inferior (1:1 web narrowLayout `px-2 pb-1 pl-3`).
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 8, paddingBottom: 4 },
  ssBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 6, borderRadius: 8 },
  ssBtnTxt: { fontSize: 11.5, letterSpacing: 0.2 },
  del: { minHeight: 40, minWidth: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  helpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  helpCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 16, gap: 7 },
  helpTitle: { fontSize: 14 },
  helpLine: { fontSize: 12.5, lineHeight: 18 },
  helpClose: { marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10 },
  areaDot: { width: 10, height: 10, borderRadius: 5 },
  areaRowT: { flex: 1, fontSize: 14 },
})
