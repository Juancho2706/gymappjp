import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { GripVertical, Minus, Plus, X } from 'lucide-react-native'
import { ScaleDecorator } from 'react-native-draggable-flatlist'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
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
}

/** Card de ejercicio 1:1 con la web (ExerciseBlock): borde por músculo, miniatura,
 *  badges (sección, sets×reps con quick-edit, descanso, superserie, progresión, músculo)
 *  + botones CAL/PRI/ENF + eliminar. */
export function BuilderBlockCard({ block, drag, isActive, onEdit, onRemove, onUpdate, onSetSection, onToggleSuperset }: Props) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)
  const [qs, setQs] = useState(block.sets ?? 3)
  const [qr, setQr] = useState(block.reps ?? '8-10')
  useEffect(() => { setQs(block.sets ?? 3); setQr(block.reps ?? '8-10') }, [block.uid])

  const muscle = getMuscleColor(block.muscle_group)
  const sec: BuilderSection = block.section === 'warmup' || block.section === 'cooldown' ? block.section : 'main'
  const secC = sec === 'warmup' ? '#F59E0B' : sec === 'cooldown' ? '#38BDF8' : theme.primary
  const thumb = exerciseThumb({ gif_url: block.gif_url ?? null, image_url: null, video_url: block.video_url ?? null })
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
            <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" transition={120} />
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

            {editing ? (
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
          </View>
        </View>

        <TouchableOpacity onPress={() => onRemove(block.uid)} hitSlop={6} style={styles.del}>
          <X size={18} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, marginBottom: 8 },
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
  secSwitch: { flexDirection: 'row', gap: 3, marginTop: 1 },
  secBtn: { minWidth: 34, paddingVertical: 4, alignItems: 'center', borderRadius: 6 },
  del: { padding: 4 },
})
