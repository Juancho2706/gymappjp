import { forwardRef, useState } from 'react'
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { WebView } from 'react-native-webview'
import { Copy, Dumbbell, ExternalLink, Globe, Pencil, Play, Target, User, Wrench } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { exerciseEmbedUrl, exerciseThumb, youtubeId, type ExerciseRow } from '../../lib/exercises'

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
 * botón "Editar". Para ejercicios con video de YouTube reproduce el tramo recortado
 * IN-APP (WebView con el embed canónico: mute + loop + sin controles = GIF), con
 * "Ver en YouTube" como acción secundaria.
 */
export const ExercisePreviewSheet = forwardRef<BottomSheetModal, Props>(function ExercisePreviewSheet(
  { exercise, onEdit, onClone, onClose },
  ref
) {
  const { theme } = useTheme()
  const [playing, setPlaying] = useState(false)

  const thumb = exercise ? exerciseThumb(exercise) : null
  const yt = exercise ? youtubeId(exercise.video_url) : null
  const isYouTubeOnly = !!exercise && !exercise.gif_url && !exercise.image_url && !!yt
  // Embed canónico del tramo recortado (1:1 web exerciseEmbedUrl): mute + loop + sin controles.
  const embedUrl = isYouTubeOnly && yt
    ? exerciseEmbedUrl(yt, { start: exercise!.video_start_time, end: exercise!.video_end_time })
    : null
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
      onDismiss={() => { setPlaying(false); onClose?.() }}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!exercise ? null : (
          <>
            {/* Media */}
            <View style={[styles.media, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
              {playing && embedUrl ? (
                <WebView
                  source={{ uri: embedUrl }}
                  style={styles.mediaImg}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled
                />
              ) : thumb ? (
                <Image source={{ uri: thumb }} style={styles.mediaImg} contentFit={isYouTubeOnly ? 'cover' : 'contain'} transition={180} />
              ) : (
                <View style={styles.mediaEmpty}>
                  <Dumbbell size={40} color={theme.mutedForeground} strokeWidth={1.4} />
                  <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 12 }}>Sin previsualización</Text>
                </View>
              )}
              {/* Play badge tappable: arranca el reproductor in-app del tramo recortado. */}
              {embedUrl && !playing ? (
                <TouchableOpacity style={styles.playBadge} activeOpacity={0.85} onPress={() => setPlaying(true)}>
                  <Play size={22} color="#fff" fill="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>

            {isYouTubeOnly ? (
              <TouchableOpacity
                onPress={() => exercise.video_url && Linking.openURL(exercise.video_url)}
                activeOpacity={0.85}
                style={[styles.ytBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}
              >
                <ExternalLink size={15} color={theme.primary} />
                <Text style={[styles.ytText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Ver en YouTube</Text>
              </TouchableOpacity>
            ) : null}

            {/* Title */}
            <Text style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{exercise.name}</Text>

            {/* Badges */}
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33' }]}>
                <Target size={13} color={theme.primary} />
                <Text style={[styles.badgeText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>{exercise.muscle_group}</Text>
              </View>
              {exercise.equipment ? (
                <View style={[styles.badge, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                  <Wrench size={13} color={theme.mutedForeground} />
                  <Text style={[styles.badgeText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{exercise.equipment}</Text>
                </View>
              ) : null}
              {exercise.difficulty ? (
                <View style={[styles.badge, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                  <Text style={[styles.badgeText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                    {DIFFICULTY_LABEL[exercise.difficulty] ?? exercise.difficulty}
                  </Text>
                </View>
              ) : null}
            </View>

            {secondary.length > 0 ? (
              <View style={styles.badges}>
                {secondary.map((m) => (
                  <View key={m} style={[styles.badge, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                    <Text style={[styles.badgeText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{m}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Instrucciones */}
            {steps.length > 0 ? (
              <View style={{ gap: 12, marginTop: 4 }}>
                <Text style={[styles.section, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Instrucciones</Text>
                {steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: theme.primary + '1A' }]}>
                      <Text style={[styles.stepNumText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Origen */}
            <View style={[styles.source, { borderTopColor: theme.border }]}>
              {exercise.isOwn ? <User size={14} color={theme.mutedForeground} /> : <Globe size={14} color={theme.mutedForeground} />}
              <Text style={[styles.sourceText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {exercise.isOwn ? 'Ejercicio personalizado' : 'Catálogo del sistema · EVA'}
              </Text>
            </View>

            {exercise.isOwn && onEdit ? (
              <TouchableOpacity
                onPress={() => onEdit(exercise)}
                activeOpacity={0.85}
                style={[styles.editBtn, { backgroundColor: theme.primary }]}
              >
                <Pencil size={16} color={theme.primaryForeground} />
                <Text style={[styles.editText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Editar ejercicio</Text>
              </TouchableOpacity>
            ) : null}

            {!exercise.isOwn && onClone ? (
              <TouchableOpacity
                onPress={() => onClone(exercise)}
                activeOpacity={0.85}
                style={[styles.editBtn, { backgroundColor: theme.primary + '1A', borderWidth: 1, borderColor: theme.primary + '44' }]}
              >
                <Copy size={16} color={theme.primary} />
                <Text style={[styles.editText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Duplicar a mis ejercicios</Text>
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
  media: { width: '100%', height: 220, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mediaImg: { width: '100%', height: '100%' },
  mediaEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  playBadge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ytBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12 },
  ytText: { fontSize: 14 },
  name: { fontSize: 21, letterSpacing: -0.3, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  badgeText: { fontSize: 12 },
  section: { fontSize: 15 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
  sourceText: { fontSize: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, marginTop: 6 },
  editText: { fontSize: 15 },
})
