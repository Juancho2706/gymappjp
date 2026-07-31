import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { AlignLeft, Dumbbell, MessageSquare, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react-native'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { extractYoutubeVideoId, isYoutubeMediaUrl } from '../../../../lib/youtube'
import { toStorageRenderThumb } from '../../../../lib/exercise-catalog'
import type { SessionExercise } from '../../../../lib/workout-session'
import { VideoPlayer } from '../../../VideoPlayer'
import { Sheet } from '../../../Sheet'
import type { ExecTheme } from './exec-theme'

// Alto fijo del medio inline del ejercicio activo (preview compacto; el modal de técnica muestra el
// medio completo).
const MEDIA_HEIGHT = 150
// Colapso de los chips glass a solo-icono tras ENTRAR el ejercicio (~1,5s, one-shot por ejercicio).
const CHIP_COLLAPSE_MS = 1500
// Reintentos automáticos de carga de la media antes de ofrecer el retry manual (QA ronda 2: en el wifi
// del gimnasio la primera petición muere seguido y la card quedaba vacía para siempre).
const MEDIA_MAX_RETRIES = 2

/**
 * Clasifica el medio del ejercicio con la MISMA precedencia estricta que `resolveExecMedia` (web) y
 * `TechniqueSheet`: gif → video directo (mp4/webm/mov/Storage) → youtube → imagen → none. Compartido por
 * `ExecMediaV3` y `TypedMediaV3` para saber cuándo mostrar la fila de controles (sólo video/youtube) y si
 * la card grande existe (sólo si NO es 'none').
 */
export type ExecMediaKind = 'gif' | 'video' | 'youtube' | 'image' | 'none'
export function execMediaKind(exercise: SessionExercise): ExecMediaKind {
  const videoUrl = exercise.video_url
  if (exercise.gif_url) return 'gif'
  if (!videoUrl) return 'none'
  // QA4 · hallazgo 17: la detección de YouTube pasa por el parser central (`isYoutubeMediaUrl`, allowlist
  // de hosts que INCLUYE `youtube-nocookie.com`), NUNCA por `includes('youtube.com')` — ese substring dejaba
  // fuera los 33 ejercicios guardados como `www.youtube-nocookie.com/embed/<id>`, que terminaban como
  // 'image' y pintaban la caja de error permanente.
  if (isYoutubeMediaUrl(videoUrl)) {
    // Host de YouTube sin id extraíble ⇒ 'none' (silueta), jamás 'image': bajar la página de embed como
    // imagen siempre falla.
    return extractYoutubeVideoId(videoUrl) ? 'youtube' : 'none'
  }
  const u = videoUrl.toLowerCase()
  const isMp4 =
    u.includes('.mp4') || u.includes('.mov') || u.includes('.webm') ||
    (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
  return isMp4 ? 'video' : 'image'
}
/** ¿El ejercicio tiene media visible (gif/video/youtube/imagen)? Si es false, kind === 'none'. */
export function hasExecMedia(exercise: SessionExercise): boolean {
  return execMediaKind(exercise) !== 'none'
}

/**
 * URI de MINIATURA ESTÁTICA del ejercicio (card "SIGUIENTE" del descanso, listas) — null ⇒ silueta.
 *
 * QA4 · hallazgo 1: la card del descanso miraba SOLO `gif_url`, que está vacío en TODO el catálogo (la
 * media real vive en `video_url`), así que siempre caía al placeholder de mancuerna. Prioridad:
 * `thumbnail_url` (webp chico ya generado) → `gif_url` → póster de YouTube → gif/imagen de Storage del
 * propio `video_url`. Lo de Storage se reescribe a `render/image` (mismo criterio que `exerciseGridThumb`)
 * para no bajar el gif crudo (~93KB) en un recuadro de 58px. Para mp4 real no hay póster ⇒ null ⇒ silueta.
 */
export function execThumbUri(exercise: SessionExercise, width = 128): string | null {
  const kind = execMediaKind(exercise)
  // `thumbnail_url` YA es el webp chico: se sirve tal cual, sin pasar por `render/image` (la cuota de
  // Image Transformations de Supabase no se quema en algo que ya está optimizado — igual que la web
  // `exerciseGridThumb`, que hace early-return con este campo).
  if (exercise.thumbnail_url) return exercise.thumbnail_url
  let base: string | null = exercise.gif_url ?? null
  if (!base && kind === 'youtube') {
    const yt = extractYoutubeVideoId(exercise.video_url)
    if (yt) base = `https://img.youtube.com/vi/${yt}/hqdefault.jpg`
  }
  if (!base && kind === 'image' && exercise.video_url) base = exercise.video_url
  if (!base) return null
  return toStorageRenderThumb(base, width) ?? base
}

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
  // Audio del video (archivo directo o youtube inline): default SIN sonido; el botón glass alterna el mute.
  const [muted, setMuted] = useState(true)
  // Pausa/reanudar + reinicio (controles glass QA5). El nonce de reinicio se incrementa al tocar Reiniciar.
  const [paused, setPaused] = useState(false)
  const [restartNonce, setRestartNonce] = useState(0)

  const kind = execMediaKind(exercise)
  // Controles de video: sólo con media reproducible (video directo o youtube inline). QA4 · hallazgo 10: el
  // botón de audio ahora TAMBIÉN aplica a youtube — el mute se alterna con la IFrame API por
  // `injectJavaScript` (como la web `ExecYoutubeInline`), sin recargar el WebView.
  const hasControls = kind === 'video' || kind === 'youtube'
  const hasAudioBtn = kind === 'video' || kind === 'youtube'

  const hasTechnique = !!(exercise.gif_url || exercise.video_url)
  const hasInstructions = (exercise.instructions?.length ?? 0) > 0
  const showInstrChip = hasTechnique || hasInstructions

  // Colapso de los chips glass: extendidos al ENTRAR el ejercicio (one-shot por `exercise.id`), se
  // contraen a solo-icono ~1,5s después. reduced-motion ⇒ quedan siempre extendidos.
  const chipsExpanded = useChipCollapse(exercise.id, reducedMotion)

  return (
    <>
      {/* MEDIA + chips glass. Fondo con gradiente 160deg #202029→#17171f (mockup `.a3a-media`) + barrido
          de brillo diagonal (shimmer) sobre la card. */}
      {/* `alignItems/justifyContent: center` = web `.exec-v3-media { display:flex; align-items:center;
          justify-content:center }` (globals.css:1768): si el medio mide menos que el marco queda CENTRADO,
          no pegado a la izquierda (QA4 · hallazgo 10). */}
      <View style={{ position: 'relative', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
        <LinearGradient
          colors={['#202029', '#17171f']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <ExecMediaInnerV3
          exercise={exercise}
          exec={exec}
          onOpenTechnique={onOpenTechnique}
          muted={muted}
          paused={paused}
          restartSignal={restartNonce}
          reducedMotion={reducedMotion}
        />
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

        {/* Fila de controles glass de video (QA5): audio (sólo video directo) + pausa/reanudar + reiniciar. */}
        {hasControls && (
          <MediaControlsRow
            hasAudio={hasAudioBtn}
            muted={muted}
            onToggleMuted={() => setMuted((m) => !m)}
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            onRestart={() => {
              setPaused(false)
              setRestartNonce((n) => n + 1)
            }}
          />
        )}
      </View>

      {/* Sheet de nota del coach. */}
      {coachNote && (
        <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota del coach" forceDark nativeModal snapPoints={['35%']}>
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
/**
 * Colapso one-shot de los chips glass: extendidos al ENTRAR el ejercicio (por `exerciseId`), se contraen
 * a solo-icono ~1,5s después. reduced-motion ⇒ quedan siempre extendidos. Compartido por el bloque de
 * media de fuerza/superserie (`ExecMediaV3`) y el de las pantallas tipadas (`TypedMediaV3`).
 */
export function useChipCollapse(exerciseId: string, reducedMotion: boolean): boolean {
  const [expanded, setExpanded] = useState(true)
  useEffect(() => {
    if (reducedMotion) {
      setExpanded(true)
      return
    }
    setExpanded(true)
    const t = setTimeout(() => setExpanded(false), CHIP_COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [exerciseId, reducedMotion])
  return expanded
}

/** Botón glass 30x30 de la fila de controles (audio/pausa/reinicio). Mismo lenguaje que los chips. */
function GlassCtlButton({
  onPress,
  accessibilityLabel,
  selected,
  testID,
  children,
}: {
  onPress: () => void
  accessibilityLabel: string
  selected?: boolean
  testID?: string
  children: ReactNode
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={selected != null ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(8,8,12,0.6)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.16)',
      }}
    >
      {children}
    </Pressable>
  )
}

/**
 * Fila de controles glass de la media de VIDEO (QA5): audio (mute/unmute), pausa/reanudar y reiniciar.
 * Esquina inferior-derecha, 3 (o 2) botones chicos con gap 6, mismo lenguaje que los chips. Compartido por
 * `ExecMediaV3` (fuerza) y `TypedMediaV3` (tipadas). QA4 · hallazgo 10: el audio ya aplica también a
 * youtube — el `VideoPlayer` hornea el HTML SIEMPRE muteado (requisito de autoplay) y alterna el sonido con
 * la IFrame API por `injectJavaScript`, sin recargar el WebView.
 */
export function MediaControlsRow({
  hasAudio,
  muted,
  onToggleMuted,
  paused,
  onTogglePause,
  onRestart,
}: {
  hasAudio: boolean
  muted: boolean
  onToggleMuted: () => void
  paused: boolean
  onTogglePause: () => void
  onRestart: () => void
}) {
  return (
    <View style={{ position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 6 }}>
      {hasAudio && (
        <GlassCtlButton
          testID="btn-media-audio-v3"
          onPress={onToggleMuted}
          selected={!muted}
          accessibilityLabel={muted ? 'Activar el sonido del video' : 'Silenciar el video'}
        >
          {muted ? <VolumeX size={14} color="#eaeaf0" /> : <Volume2 size={14} color="#eaeaf0" />}
        </GlassCtlButton>
      )}
      <GlassCtlButton
        testID="btn-media-pause-v3"
        onPress={onTogglePause}
        selected={paused}
        accessibilityLabel={paused ? 'Reanudar el video' : 'Pausar el video'}
      >
        {paused ? <Play size={14} color="#eaeaf0" /> : <Pause size={14} color="#eaeaf0" />}
      </GlassCtlButton>
      <GlassCtlButton testID="btn-media-restart-v3" onPress={onRestart} accessibilityLabel="Reiniciar el video">
        <RotateCcw size={14} color="#eaeaf0" />
      </GlassCtlButton>
    </View>
  )
}

export function GlassChip({
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
 * Imagen de la media del ejecutor (gif / imagen suelta) con caché, transición y ESTADO DE CARGA REAL
 * (QA ronda 2 — "cajas vacías / gif que nunca aparece"):
 *   - `cachePolicy="memory-disk"` + `transition`: el gif del ejercicio ya visto no se vuelve a bajar y
 *     el que llega entra con fundido en vez de aparecer de golpe.
 *   - Mientras la imagen no resolvió se pinta un velo pulsante ENCIMA del gradiente. El shimmer diagonal
 *     del padre es decorativo (corre siempre) y NO sirve de estado de carga.
 *   - `onError` reintenta remontando el `<Image>` con otra `key` (hasta `MEDIA_MAX_RETRIES`); si igual
 *     muere, queda un icono discreto con "Toca para reintentar".
 * Compartida por la media de fuerza/superserie (`ExecMediaV3`) y la de las pantallas tipadas
 * (`TypedMediaV3`).
 */
export function ExecMediaImage({
  uri,
  alt,
  accent,
  reducedMotion = false,
}: {
  uri: string
  alt: string
  /** Acento de marca para el icono del reintento. */
  accent: string
  reducedMotion?: boolean
}) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // Cambió el ejercicio (o su sustitución): el ciclo de carga arranca de cero.
  useEffect(() => {
    setAttempt(0)
    setStatus('loading')
  }, [uri])

  const handleError = () => {
    if (attempt < MEDIA_MAX_RETRIES) {
      setAttempt(attempt + 1)
      setStatus('loading')
      return
    }
    setStatus('error')
  }

  return (
    // `alignSelf: 'stretch'` — el marco de media del ejecutor centra sus hijos (QA4 · hallazgo 10); sin esto
    // el ancho colapsaría a contenido y el gif no se vería.
    <View style={{ flex: 1, width: '100%', alignSelf: 'stretch' }}>
      {status !== 'error' && (
        <Image
          key={attempt}
          source={{ uri }}
          alt={alt}
          style={{ flex: 1, width: '100%' }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
          onLoadStart={() => setStatus((st) => (st === 'ready' ? st : 'loading'))}
          onLoad={() => setStatus('ready')}
          onError={handleError}
        />
      )}

      {status === 'loading' && (
        <MotiView
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' }}
          from={{ opacity: reducedMotion ? 0.55 : 0.3 }}
          animate={{ opacity: reducedMotion ? 0.55 : 0.75 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 900, loop: !reducedMotion, repeatReverse: true }}
        >
          <Dumbbell size={30} color="rgba(255,255,255,0.16)" strokeWidth={1.6} />
        </MotiView>
      )}

      {status === 'error' && (
        <Pressable
          testID="btn-media-retry-v3"
          onPress={() => {
            setAttempt(attempt + 1)
            setStatus('loading')
          }}
          accessibilityRole="button"
          accessibilityLabel={`Reintentar cargar la imagen de ${alt}`}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <RotateCcw size={20} color={hexToRgba(accent, 0.8)} strokeWidth={2} />
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: '#9a9aa6' }}>Toca para reintentar</Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * Medio inline del ejercicio activo — ramifica por el `kind` de `execMediaKind` (única fuente de verdad de
 * la regla de media, compartida con TechniqueSheet/web):
 *   1. 'gif' → imagen `contain`.
 *   2. 'video' (mp4/webm/mov/Storage) → VideoPlayer autoplay-mute-loop (modo GIF).
 *   3. 'youtube' (incluye youtube-nocookie) → VideoPlayer inline autoplay muteado, con controles glass.
 *   4. 'image' → imagen.
 *   5. 'none' → placeholder silueta.
 */
function ExecMediaInnerV3({
  exercise,
  exec,
  onOpenTechnique,
  muted = true,
  paused = false,
  restartSignal,
  reducedMotion = false,
}: {
  exercise: SessionExercise
  exec: ExecTheme
  onOpenTechnique: () => void
  /** Silencio del <video> directo (kind 'video'). Default true. */
  muted?: boolean
  /** Pausa la reproducción (video directo o youtube inline) — controles glass QA5. */
  paused?: boolean
  /** Nonce de reinicio (QA5): al cambiar, el video vuelve al inicio. */
  restartSignal?: number
  /** Apaga el pulso del estado de carga (queda un velo fijo). */
  reducedMotion?: boolean
}) {
  const s = exec.surface
  const videoUrl = exercise.video_url
  // Una sola fuente de verdad de clasificación (QA4 · hallazgo 17): antes esta función RE-CALCULABA la
  // detección a mano y divergía de `execMediaKind` (el padre habilitaba controles con un criterio y acá se
  // renderizaba otra cosa). Ahora ramifica por el `kind` canónico.
  const kind = execMediaKind(exercise)
  // Todos los medios llenan el marco a lo ancho: el contenedor de 150px centra sus hijos.
  const fillStyle = { flex: 1, width: '100%', alignSelf: 'stretch' } as const

  if (kind === 'gif' && exercise.gif_url) {
    return <ExecMediaImage uri={exercise.gif_url} alt={exercise.name} accent={exec.accent} reducedMotion={reducedMotion} />
  }

  if (kind === 'video' && videoUrl) {
    // Archivo de video: reproduce en loop mudo por default. Los controles glass (audio + pausa + reinicio)
    // los monta el padre (`ExecMediaV3`) como overlay; acá sólo se propaga el estado.
    return (
      <VideoPlayer url={videoUrl} autoPlay muted={muted} paused={paused} restartSignal={restartSignal} frameless letterbox={s.surfaceRaised} style={fillStyle} title={exercise.name} />
    )
  }

  if (kind === 'image' && videoUrl) {
    return <ExecMediaImage uri={videoUrl} alt={exercise.name} accent={exec.accent} reducedMotion={reducedMotion} />
  }

  // YouTube (QA4 · decisión CEO): AUTOREPRODUCIDO inline MUTED al entrar al ejercicio (reusa el
  // `VideoPlayer` de la técnica: mismo iframe youtube-nocookie autoplay/mute/loop del recorte). La fila de
  // controles del padre añade PAUSA/REANUDAR, REINICIAR y —QA4 hallazgo 10— AUDIO, todo vía la IFrame API
  // por injectJavaScript (no recarga el WebView), así que acá se propaga el `muted` REAL del padre.
  if (kind === 'youtube' && videoUrl) {
    return (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        muted={muted}
        paused={paused}
        restartSignal={restartSignal}
        frameless
        letterbox={s.surfaceRaised}
        style={fillStyle}
        title={exercise.name}
      />
    )
  }

  return (
    <View style={{ flex: 1, width: '100%', alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
      <Dumbbell size={40} color={hexToRgba(exec.accent, 0.4)} strokeWidth={1.6} />
    </View>
  )
}
