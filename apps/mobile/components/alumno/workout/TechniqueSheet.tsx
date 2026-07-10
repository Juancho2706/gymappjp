import { Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { X } from 'lucide-react-native'
// Importar Sheet registra su cssInterop(X) (className→color), así la X de abajo colorea con text-*.
import { Sheet } from '../../Sheet'
import { VideoPlayer } from '../../VideoPlayer'
import { FONT, textStyle } from '../../../lib/typography'
import { extractYoutubeVideoId } from '../../../lib/youtube'
import type { SessionExercise } from '../../../lib/workout-session'

/**
 * Estilo del nombre del ejercicio reubicado bajo el medio (§4): idéntico al que el Sheet aplica a su
 * cabecera en `titleSize='xl'` (Sheet.tsx:107-110) = web `DialogTitle text-xl font-extrabold` +
 * base uppercase/tracking-tighter Montserrat→display (dialog.tsx:126-127, WorkoutExecutionClient.tsx:2079).
 */
const techniqueTitleStyle = {
  ...textStyle('xl', FONT.displayBold, { lh: 'snug', ls: 'tighter' }),
  textTransform: 'uppercase' as const,
}

/**
 * Modal de técnica (mobile). Video INLINE via `VideoPlayer` (YouTube/mp4) o gif/imagen, +
 * instrucciones numeradas + botón "Entendido". Espeja el modal de técnica de web
 * (`WorkoutExecutionClient.tsx:2001-2113`) sin salir de la app (reemplaza el `Linking.openURL`
 * del legacy). Adaptación idiomática: Dialog centrado → BottomSheet (swipe/backdrop del `Sheet`
 * cubren 2 de las 3 vías de cierre de la web; la X y "Entendido" cubren la tercera). Orden vertical
 * = web: [MEDIO full-bleed] → [nombre + X] → [instrucciones] → [Entendido]. El nombre va en el
 * CUERPO bajo el medio (no en la cabecera del Sheet) para espejar el DialogHeader debajo del medio
 * (medio :2007-2075 → nombre :2076-2084); por eso el Sheet va sin `title` y con `showCloseButton={false}`.
 *
 * Bloque de medio — MISMA prioridad estricta que la web (`WorkoutExecutionClient.tsx:2007-2074`):
 *   1. YouTube (video_url youtube + id válido) → VideoPlayer (autoplay/mute/loop = GIF; recorta [start,end]).
 *   2. gif_url → imagen contain.
 *   3. video_url no-YouTube → mp4/mov/webm/Storage → VideoPlayer directo (loop completo, sin recorte,
 *      igual que el `<video loop>` de la web); cualquier otro → imagen.
 *   4. sin medio → nada.
 */

/**
 * Marco 16:9 para gif/imagen — SIN chrome de tarjeta (sin borde ni radio), a sangre: el medio del
 * modal web es full-bleed bajo `DialogContent p-0`, el gif usa `bg-muted` sin borde ni radio y el
 * fallback de imagen `bg-white border-b` sin radio (WorkoutExecutionClient.tsx:2005,2030,2062).
 * `padded` inset el medio 16px dentro del marco = web gif `object-contain p-4`
 * (WorkoutExecutionClient.tsx:2035, p-4 = 16px = space-5). El fallback de imagen del web
 * (video_url no-YouTube/no-mp4, :2067) NO lleva padding, así que ese caso pasa `padded={false}`.
 * El bleed lateral (fuera del padding del scroll) lo aplica el envoltorio en `TechniqueSheet`.
 */
function MediaImage({ uri, padded = false }: { uri: string; padded?: boolean }) {
  return (
    <View
      className={`bg-surface-sunken overflow-hidden${padded ? ' p-space-5' : ''}`}
      style={{ width: '100%', aspectRatio: 16 / 9 }}
    >
      <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
    </View>
  )
}

/** Decide el medio a renderizar espejando el orden de prioridad de la web (§3). */
function TechniqueMedia({ exercise }: { exercise: SessionExercise }) {
  const videoUrl = exercise.video_url
  // Detección idéntica a la web (WorkoutExecutionClient.tsx:2010-2012): substring + extractor robusto.
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  // 1) YouTube — recorta el tramo [start,end] del coach.
  if (isYouTube && ytId && videoUrl) {
    return (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        frameless
        title={exercise.name}
      />
    )
  }

  // 2) gif — inset 16px como el web (`object-contain p-4`, :2035).
  if (exercise.gif_url) {
    return <MediaImage uri={exercise.gif_url} padded />
  }

  // 3) video_url no-YouTube: mp4/mov/webm/Storage → video directo; resto → imagen.
  if (videoUrl) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') ||
      u.includes('.mov') ||
      u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    // La web reproduce el mp4 con `<video loop>` SIN recorte → no pasamos start/end (loop completo).
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay frameless title={exercise.name} />
    }
    return <MediaImage uri={videoUrl} />
  }

  // 4) sin medio.
  return null
}

export function TechniqueSheet({
  exercise,
  onClose,
}: {
  exercise: SessionExercise | null
  onClose: () => void
}) {
  const open = !!exercise
  const steps = exercise?.instructions ?? null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      // Sin título en la cabecera del Sheet: la web muestra el nombre del ejercicio DEBAJO del medio,
      // no encima (medio :2007-2075 → DialogHeader con el nombre :2076-2084). Lo renderizamos como
      // primer contenido del cuerpo (bajo el medio) para espejar ese orden. showCloseButton={false}
      // = la web también apaga la X del contenedor (DialogContent showCloseButton={false}, :2004) y
      // dibuja su propia X junto al título; aquí hacemos igual (swipe/backdrop siguen cerrando).
      showCloseButton={false}
      // Nombre del ejercicio como accessible name del sheet (lo daba el título del header antes).
      accessibilityLabel={exercise?.name}
      snapPoints={['55%', '90%']}
      // El medio (índice 0) queda FIJADO fuera del scroll = web `shrink-0` fuera de la zona
      // `overflow-y-auto` (WorkoutExecutionClient.tsx:2015/2030/2048/2062 vs :2076): el gif/video
      // permanece a la vista mientras las instrucciones scrollean. Su marco lleva fondo opaco
      // (VideoPlayer / MediaImage bg-surface-sunken), requisito de stickyHeaderIndices.
      stickyHeaderIndices={[0]}
    >
      {/* `-mx-space-6` cancela el `paddingHorizontal:20` (=space-6) del BottomSheetScrollView
          (Sheet.tsx:219) → el medio llega a los bordes del sheet, espejando el medio full-bleed
          del modal web (DialogContent `p-0`, WorkoutExecutionClient.tsx:2005). */}
      {exercise ? (
        <View className="-mx-space-6">
          <TechniqueMedia exercise={exercise} />
        </View>
      ) : null}

      {/* Nombre + X DEBAJO del medio — espejo del DialogHeader web (WorkoutExecutionClient.tsx:2077-2084):
          nombre en display xl extrabold uppercase tracking-tighter (text-foreground → text-strong) y la X
          (w-5 h-5 text-muted-foreground, botón p-2 -mr-2 -mt-2 rounded-full) que cierra el modal. */}
      <View className="flex-row items-start justify-between gap-space-4">
        <Text style={techniqueTitleStyle} className="flex-1 text-strong" numberOfLines={2}>
          {exercise?.name ?? 'Técnica'}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={8}
          className="-mr-space-3 -mt-space-3 rounded-pill p-space-3"
        >
          <X className="text-muted" size={20} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {steps && steps.length > 0 ? (
        <View className="gap-3">
          {steps.map((step, i) => (
            <View key={`${i}-${step}`} className="flex-row items-start gap-3">
              {/* Badge numérico — espejo de la web (§5): círculo sport-500 @15%, número sport-500 bold.
                  mt-0.5 (2px) iguala el `mt-0.5` del span web (:2090) para el mismo alineado vertical. */}
              <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                <Text style={textStyle('2xs', FONT.uiBold)} className="text-sport-500">
                  {i + 1}
                </Text>
              </View>
              {/* 14px = web `text-sm` + `leading-relaxed` (WorkoutExecutionClient.tsx:2088,2098);
                  color text-muted = web text-muted-foreground. Un solo tamaño (sin mezclar TYPE.body/text-[13px]). */}
              <Text style={textStyle('sm', FONT.ui, { lh: 'relaxed' })} className="flex-1 text-muted">
                {step.replace(/^Step:\d+\s*/i, '')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={textStyle('sm', FONT.ui)} className="text-muted">
          {/* Sin text-center: el web lo alinea a la izquierda (WorkoutExecutionClient.tsx:2103,
              <p> sin text-align). */}
          No hay instrucciones detalladas disponibles para este ejercicio.
        </Text>
      )}

      {/* "Entendido" (§6): cierra el modal. bg-secondary/text-secondary-foreground de la web =
          surface-sunken / text-body (globals.css:222-223). Sin toast/haptic/navegación. */}
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        className="mt-space-7 w-full items-center justify-center rounded-control bg-surface-sunken py-3"
      >
        <Text style={textStyle('sm', FONT.uiBold)} className="text-body">
          Entendido
        </Text>
      </TouchableOpacity>
    </Sheet>
  )
}
