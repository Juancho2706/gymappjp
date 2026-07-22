import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { AlignLeft, Dumbbell, MessageSquare, Play } from 'lucide-react-native'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { extractYoutubeVideoId } from '../../../../lib/youtube'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { Sheet } from '../../../Sheet'
import type { ExecTheme } from './exec-theme'

// Alto fijo del medio inline del ejercicio activo (preview compacto; el modal de técnica muestra el
// medio completo).
const MEDIA_HEIGHT = 150
// Colapso de los chips glass a solo-icono tras ENTRAR el ejercicio (~1,5s, one-shot por ejercicio).
const CHIP_COLLAPSE_MS = 1500

/**
 * Bloque de MEDIA reutilizable del ejecutor V3 (extracción pura de `ExerciseScreenV3`, sin lógica de
 * motor). Renderiza la media inline 150px (gif/video/youtube/none, misma precedencia que TechniqueSheet)
 * sobre gradiente + shimmer, con los chips glass "Instrucciones" / "Nota del coach" que entran extendidos
 * y colapsan a solo-icono ~1,5s (one-shot por ejercicio; reduced-motion los deja extendidos). El chip de
 * nota abre un sheet local.
 *
 * Se comparte entre el ejercicio SOLO (`ExerciseScreenV3`) y el miembro ACTIVO de la superserie
 * (`SupersetScreenV3`), que ahora se presenta igual que un ejercicio solo (requerimiento CEO 2026-07-22).
 */
export function ExecMediaV3({
  exercise,
  coachNote,
  exec,
  reducedMotion,
  onOpenTechnique,
}: {
  exercise: SessionExercise
  /** Nota del coach del BLOQUE (block.notes ya recortada), o null. */
  coachNote: string | null
  exec: ExecTheme
  reducedMotion: boolean
  onOpenTechnique: () => void
}) {
  const s = exec.surface
  const [noteOpen, setNoteOpen] = useState(false)

  const hasTechnique = !!(exercise.gif_url || exercise.video_url)
  const hasInstructions = (exercise.instructions?.length ?? 0) > 0
  const showInstrChip = hasTechnique || hasInstructions

  // Colapso de los chips glass: extendidos al ENTRAR el ejercicio (one-shot por `exercise.id`), se
  // contraen a solo-icono ~1,5s después. reduced-motion ⇒ quedan siempre extendidos.
  const [chipsExpanded, setChipsExpanded] = useState(true)
  useEffect(() => {
    if (reducedMotion) {
      setChipsExpanded(true)
      return
    }
    setChipsExpanded(true)
    const t = setTimeout(() => setChipsExpanded(false), CHIP_COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [exercise.id, reducedMotion])

  return (
    <>
      {/* MEDIA + chips glass. Fondo con gradiente 160deg #202029→#17171f (mockup `.a3a-media`) + barrido
          de brillo diagonal (shimmer) sobre la card. */}
      <View style={{ position: 'relative', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong }}>
        <LinearGradient
          colors={['#202029', '#17171f']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <ExecMediaInnerV3 exercise={exercise} exec={exec} onOpenTechnique={onOpenTechnique} />
        {!reducedMotion && (
          <MotiView
            pointerEvents="none"
            from={{ translateX: -160 }}
            animate={{ translateX: 520 }}
            transition={{ type: 'timing', duration: 3200, loop: true, repeatReverse: false, easing: Easing.linear }}
            style={{ position: 'absolute', top: 0, bottom: 0, width: 110 }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.07)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </MotiView>
        )}
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 7 }}>
          {showInstrChip && (
            <GlassChip
              testID="chip-instructions-v3"
              icon={<AlignLeft size={14} color="#cfcfd8" />}
              label="Instrucciones"
              expanded={chipsExpanded}
              reducedMotion={reducedMotion}
              onPress={onOpenTechnique}
              accessibilityLabel={`Ver instrucciones de ${exercise.name}`}
            />
          )}
          {coachNote && (
            <GlassChip
              testID="chip-coach-note-v3"
              icon={<MessageSquare size={14} color="#cfcfd8" />}
              label="Nota del coach"
              expanded={chipsExpanded}
              reducedMotion={reducedMotion}
              badgeColor={exec.accent}
              onPress={() => setNoteOpen(true)}
              accessibilityLabel="Ver la nota del coach"
            />
          )}
        </View>
      </View>

      {/* Sheet de nota del coach. */}
      {coachNote && (
        <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota del coach" nativeModal snapPoints={['35%']}>
          <View style={{ paddingVertical: 8 }}>
            <Text style={textStyle('md', FONT.ui, { lh: 'relaxed' })} className="text-body">
              {coachNote}
            </Text>
          </View>
        </Sheet>
      )}
    </>
  )
}

/**
 * Chip "glass" sobre la media (Instrucciones / Nota del coach). Entra extendido (icono + label) y colapsa
 * a solo-icono: el label se monta/desmonta con AnimatePresence (fade + slide) y el pill re-fluye a su
 * ancho de icono. reduced-motion ⇒ el label queda montado siempre. `badgeColor` pinta el puntito de aviso.
 */
function GlassChip({
  icon,
  label,
  expanded,
  reducedMotion,
  badgeColor,
  onPress,
  testID,
  accessibilityLabel,
}: {
  icon: ReactNode
  label: string
  expanded: boolean
  reducedMotion: boolean
  badgeColor?: string
  onPress: () => void
  testID?: string
  accessibilityLabel?: string
}) {
  return (
    <MotiView
      animate={{ paddingHorizontal: expanded ? 11 : 8 }}
      transition={{ type: 'timing', duration: reducedMotion ? 0 : 260 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 30,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(8,8,12,0.6)',
      }}
    >
      <Pressable
        testID={testID}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        {icon}
        <AnimatePresence>
          {expanded && (
            <MotiView
              key="label"
              from={{ opacity: reducedMotion ? 1 : 0, translateX: reducedMotion ? 0 : -6 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -6 }}
              transition={{ type: 'timing', duration: reducedMotion ? 0 : 260 }}
            >
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: '#eaeaf0' }} numberOfLines={1}>
                {label}
              </Text>
            </MotiView>
          )}
        </AnimatePresence>
      </Pressable>
      {badgeColor && (
        <View pointerEvents="none" style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
          <MotiView
            from={{ scale: 1, opacity: reducedMotion ? 0.45 : 0.55 }}
            animate={{ scale: reducedMotion ? 1 : [1, 1.35, 1], opacity: reducedMotion ? 0.45 : [0.55, 0.1, 0.55] }}
            transition={{ type: 'timing', duration: reducedMotion ? 0 : 1800, loop: !reducedMotion, repeatReverse: false }}
            style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: hexToRgba(badgeColor, 1) }}
          />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: badgeColor, borderWidth: 2, borderColor: '#16161d' }} />
        </View>
      )}
    </MotiView>
  )
}

/**
 * Medio inline del ejercicio activo — MISMA prioridad estricta que TechniqueSheet/web (regla de media):
 *   1. gif_url → imagen `contain`.
 *   2. video_url no-YouTube (mp4/webm/mov/Storage) → VideoPlayer autoplay-mute-loop (modo GIF).
 *   3. video_url YouTube → NO inline: placeholder con silueta + Play que abre el modal de técnica.
 *   4. video_url imagen-ish → imagen.
 *   5. sin medio → placeholder silueta.
 */
function ExecMediaInnerV3({
  exercise,
  exec,
  onOpenTechnique,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  onOpenTechnique: () => void
}) {
  const s = exec.surface
  const videoUrl = exercise.video_url
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  if (exercise.gif_url) {
    return <Image source={{ uri: exercise.gif_url }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  if (videoUrl && !isYouTube) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') || u.includes('.mov') || u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay frameless letterbox={s.surfaceRaised} style={{ flex: 1 }} title={exercise.name} />
    }
    return <Image source={{ uri: videoUrl }} alt={exercise.name} style={{ flex: 1, width: '100%' }} contentFit="contain" />
  }

  return (
    <Pressable
      onPress={isYouTube && ytId ? onOpenTechnique : undefined}
      disabled={!(isYouTube && ytId)}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}
      accessibilityRole={isYouTube && ytId ? 'button' : undefined}
      accessibilityLabel={isYouTube && ytId ? `Ver técnica de ${exercise.name}` : undefined}
    >
      <Dumbbell size={40} color={hexToRgba(exec.accent, 0.4)} strokeWidth={1.6} />
      {isYouTube && ytId && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(8,8,12,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)' }}>
          <Play size={12} color="#eaeaf0" fill="#eaeaf0" />
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, color: '#eaeaf0' }}>Ver técnica</Text>
        </View>
      )}
    </Pressable>
  )
}
