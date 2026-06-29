import { forwardRef } from 'react'
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Copy, Dumbbell, Globe, Pencil, Play, Target, User, Wrench } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Badge, Button } from '../index'
import { exerciseThumb, youtubeId, type ExerciseRow } from '../../lib/exercises'

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

interface Props {
  exercise: ExerciseRow | null
  /** Solo para ejercicios propios: abre el form de edición. */
  onEdit?: (exercise: ExerciseRow) => void
  /** E-F8: duplicar a un ejercicio propio editable (sistema o propio). */
  onClone?: (exercise: ExerciseRow) => void
  onClose?: () => void
}

/**
 * Preview de un ejercicio (espeja el modal de la web): media grande + badges
 * (músculo/equipo/secundarios) + instrucciones numeradas + origen. Si es propio,
 * botón "Editar". Para ejercicios que solo tienen YouTube, muestra la miniatura
 * del video + botón "Ver en YouTube" (sin webview).
 */
export const ExercisePreviewSheet = forwardRef<BottomSheetModal, Props>(function ExercisePreviewSheet(
  { exercise, onEdit, onClone, onClose },
  ref
) {
  const { theme } = useTheme()

  const thumb = exercise ? exerciseThumb(exercise) : null
  const yt = exercise ? youtubeId(exercise.video_url) : null
  const isYouTubeOnly = !!exercise && !exercise.gif_url && !exercise.image_url && !!yt
  const steps = (exercise?.instructions ?? [])
    .map((s) => s.replace(/^Step:\s*\d+\s*/i, '').trim())
    .filter(Boolean)
  const secondary = (exercise?.secondary_muscles ?? []).filter(Boolean)

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['88%']}
      enablePanDownToClose
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!exercise ? null : (
          <>
            {/* Media */}
            <View className="bg-surface-sunken border border-subtle rounded-2xl items-center justify-center" style={styles.media}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.mediaImg} contentFit={isYouTubeOnly ? 'cover' : 'contain'} transition={180} />
              ) : (
                <View style={styles.mediaEmpty}>
                  <Dumbbell size={40} color={theme.mutedForeground} strokeWidth={1.4} />
                  <Text className="text-muted font-sans" style={styles.mediaEmptyText}>Sin previsualización</Text>
                </View>
              )}
              {isYouTubeOnly ? (
                <View style={styles.playBadge} pointerEvents="none">
                  <Play size={22} color="#fff" fill="#fff" />
                </View>
              ) : null}
            </View>

            {isYouTubeOnly ? (
              <TouchableOpacity
                onPress={() => exercise.video_url && Linking.openURL(exercise.video_url)}
                activeOpacity={0.85}
                className="flex-row items-center justify-center border border-subtle bg-surface-sunken rounded-control"
                style={styles.ytBtn}
              >
                <Play size={15} color={theme.primary} fill={theme.primary} />
                <Text className="text-strong font-sans-bold" style={styles.ytText}>Ver en YouTube</Text>
              </TouchableOpacity>
            ) : null}

            {/* Title */}
            <Text className="text-strong font-display-bold" style={styles.name}>{exercise.name}</Text>

            {/* Badges */}
            <View style={styles.badges}>
              <Badge tone="sport" variant="soft" size="md" icon={<Target size={13} color={theme.primary} />}>
                {exercise.muscle_group}
              </Badge>
              {exercise.equipment ? (
                <Badge tone="neutral" variant="soft" size="md" icon={<Wrench size={13} color={theme.mutedForeground} />}>
                  {exercise.equipment}
                </Badge>
              ) : null}
              {exercise.difficulty ? (
                <Badge tone="neutral" variant="soft" size="md">
                  {DIFFICULTY_LABEL[exercise.difficulty] ?? exercise.difficulty}
                </Badge>
              ) : null}
            </View>

            {secondary.length > 0 ? (
              <View style={styles.badges}>
                {secondary.map((m) => (
                  <Badge key={m} tone="neutral" variant="soft" size="md">{m}</Badge>
                ))}
              </View>
            ) : null}

            {/* Instrucciones */}
            {steps.length > 0 ? (
              <View style={styles.stepsWrap}>
                <Text className="text-strong font-display" style={styles.section}>Instrucciones</Text>
                {steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View className="bg-sport-100 dark:bg-sport-100/20 items-center justify-center" style={styles.stepNum}>
                      <Text className="text-sport-700 font-sans-bold" style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text className="text-body font-sans" style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Origen */}
            <View className="border-subtle" style={styles.source}>
              {exercise.isOwn ? <User size={14} color={theme.mutedForeground} /> : <Globe size={14} color={theme.mutedForeground} />}
              <Text className="text-muted font-sans" style={styles.sourceText}>
                {exercise.isOwn ? 'Ejercicio personalizado' : 'Catálogo del sistema · EVA'}
              </Text>
            </View>

            {exercise.isOwn && onEdit ? (
              <View style={styles.actionWrap}>
                <Button label="Editar ejercicio" variant="sport" size="lg" full leftIcon={Pencil} onPress={() => onEdit(exercise)} />
              </View>
            ) : null}

            {!exercise.isOwn && onClone ? (
              <TouchableOpacity
                onPress={() => onClone(exercise)}
                activeOpacity={0.85}
                className="flex-row items-center justify-center border border-sport-500/40 bg-sport-100 dark:bg-sport-100/20 rounded-control"
                style={styles.cloneBtn}
              >
                <Copy size={16} color={theme.primary} />
                <Text className="text-sport-700 font-sans-bold" style={styles.cloneText}>Duplicar a mis ejercicios</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 48, gap: 12 },
  media: { width: '100%', height: 220, overflow: 'hidden' },
  mediaImg: { width: '100%', height: '100%' },
  mediaEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  mediaEmptyText: { fontSize: 12 },
  playBadge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ytBtn: { gap: 8, paddingVertical: 12 },
  ytText: { fontSize: 14 },
  name: { fontSize: 21, letterSpacing: -0.3, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { fontSize: 15 },
  stepsWrap: { gap: 12, marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, flexShrink: 0 },
  stepNumText: { fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
  sourceText: { fontSize: 12 },
  actionWrap: { marginTop: 6 },
  cloneBtn: { gap: 8, height: 50, marginTop: 6 },
  cloneText: { fontSize: 15 },
})
