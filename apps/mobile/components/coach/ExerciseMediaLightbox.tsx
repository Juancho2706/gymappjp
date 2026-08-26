import { Modal, Pressable, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { X } from 'lucide-react-native'
import { VideoPlayer } from '../VideoPlayer'
import { execMediaKind } from '../alumno/workout/v3/ExecMediaV3'

// Letterbox del lightbox: piso casi-negro (mismo valor que el modal de técnica del alumno,
// `TechniqueSheet.tsx` V3_LETTERBOX). No es color de marca — es el fondo neutro detrás de un
// medio `contain`, igual en claro y oscuro.
const LIGHTBOX_BG = '#050507'

/**
 * Multimedia de un ejercicio tal como la ve el coach en el builder. El `BuilderBlock` solo
 * transporta `gif_url`/`video_url` (packages/plan-builder/types.ts), así que `image_url` y el
 * recorte `[start,end]` llegan desde la fila del catálogo (`catById` del builder).
 */
export interface ExerciseMediaSource {
  gif_url: string | null
  image_url: string | null
  video_url: string | null
  /** Recorte del coach en segundos (hoy solo lo aplica YouTube, igual que el modal de técnica). */
  start?: number | null
  end?: number | null
}

/**
 * ¿El medio se REPRODUCE (gif animado o video)? Decide el badge de play sobre la miniatura.
 * La precedencia sale de `execMediaKind` — fuente de verdad única compartida con el alumno
 * (gif → video directo → youtube → imagen → nada); duplicarla a mano ya costó 33 ejercicios
 * `youtube-nocookie` mal clasificados (QA4 · hallazgo 17).
 */
export function isExerciseMediaPlayable(media: ExerciseMediaSource): boolean {
  const kind = execMediaKind(media)
  return kind === 'gif' || kind === 'video' || kind === 'youtube'
}

/** ¿Hay algo que abrir en el lightbox? (incluye la imagen suelta, que `execMediaKind` no mira). */
export function hasExerciseMedia(media: ExerciseMediaSource): boolean {
  return execMediaKind(media) !== 'none' || !!media.image_url
}

/** Medio dimensionado al lightbox: misma ramificación por `kind` que `LightboxMedia` del alumno. */
function LightboxMedia({ media, title }: { media: ExerciseMediaSource; title?: string }) {
  const { width, height } = useWindowDimensions()
  const boxW = Math.round(width * 0.94)
  // gif/imagen toman el 70% del ALTO (el `contain` centra sin deformar); el cap 16:9 se reserva
  // para el video, que sí es apaisado y estiraría letterbox de más.
  const boxH = Math.round(height * 0.7)
  const boxHVideo = Math.round(Math.min(height * 0.7, (boxW * 9) / 16))
  const kind = execMediaKind(media)

  if (kind === 'gif' && media.gif_url) {
    return (
      <View style={{ width: boxW, height: boxH, backgroundColor: LIGHTBOX_BG }}>
        <Image source={{ uri: media.gif_url }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk" transition={200} />
      </View>
    )
  }
  if ((kind === 'video' || kind === 'youtube') && media.video_url) {
    return (
      <VideoPlayer
        url={media.video_url}
        // El recorte del coach vive en el catálogo y hoy solo lo respeta YouTube (el mp4 loopea
        // completo, igual que el `<video loop>` de la web y que el modal de técnica).
        start={kind === 'youtube' ? media.start ?? null : null}
        end={kind === 'youtube' ? media.end ?? null : null}
        autoPlay
        frameless
        letterbox={LIGHTBOX_BG}
        style={{ width: boxW, height: boxHVideo }}
        title={title}
      />
    )
  }
  // `kind === 'image'` = un `video_url` que no es video ni YouTube (imagen de ExerciseDB).
  const still = kind === 'image' ? media.video_url : media.image_url
  if (still) {
    return (
      <View style={{ width: boxW, height: boxH, backgroundColor: LIGHTBOX_BG }}>
        <Image source={{ uri: still }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk" transition={200} />
      </View>
    )
  }
  return null
}

/**
 * Lightbox de multimedia del builder (coach): fondo oscuro, medio grande centrado, X y tap-al-fondo
 * para cerrar. Espeja el lightbox del modal de técnica del alumno (`TechniqueSheet.tsx:151-205`)
 * para que el coach vea EXACTAMENTE lo que verá el alumno, sin salir de la app.
 *
 * El contenido solo se monta con `visible` en true: mientras esté cerrado no hay WebView de YouTube
 * ni descarga de gif — requisito para poder colgarlo de cada card del día sin pagar 12 WebViews.
 */
export function ExerciseMediaLightbox({
  visible,
  media,
  title,
  onClose,
}: {
  visible: boolean
  media: ExerciseMediaSource
  /** Nombre del ejercicio (accesibilidad del player). */
  title?: string
  onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar multimedia"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {/* Absorbe el tap sobre el medio para que NO cierre (sólo el fondo cierra). */}
        <Pressable onPress={() => {}}>{visible ? <LightboxMedia media={media} title={title} /> : null}</Pressable>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 44,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(8,8,12,0.6)',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.2)',
          }}
        >
          <X size={22} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  )
}
