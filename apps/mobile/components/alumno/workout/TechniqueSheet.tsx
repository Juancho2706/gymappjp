import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
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
 * Marco de altura FIJA para gif/imagen — SIN chrome de tarjeta (sin borde ni radio), a sangre: el medio del
 * modal web es full-bleed bajo `DialogContent p-0`, el gif usa `bg-muted` sin borde ni radio y el
 * fallback de imagen `bg-white border-b` sin radio (WorkoutExecutionClient.tsx:2005,2030,2062).
 * `height` es la ALTURA FIJA del contenedor = web `h-48 md:h-64` (192/256px), independiente del ancho,
 * con el medio `object-contain` centrado dentro (WorkoutExecutionClient.tsx:2030,2062). Antes se derivaba
 * de `aspectRatio:16/9`, que en un phone full-bleed (~390px) daba ~219px (~27px de más) y divergía más en tablets.
 * `padded` inset el medio 16px dentro del marco = web gif `object-contain p-4`
 * (WorkoutExecutionClient.tsx:2035, p-4 = 16px = space-5). El fallback de imagen del web
 * (video_url no-YouTube/no-mp4, :2067) NO lleva padding, así que ese caso pasa `padded={false}`.
 * El bleed lateral (fuera del padding del scroll) lo aplica el envoltorio en `TechniqueSheet`.
 */
function MediaImage({ uri, padded = false, height }: { uri: string; padded?: boolean; height: number }) {
  // gif (padded): letterbox `bg-surface-sunken` = web `bg-muted` (WorkoutExecutionClient.tsx:2030) — en paridad.
  // imagen-fallback (no padded): letterbox BLANCO + hairline inferior = web `bg-white border-b border-border/50`
  // (:2062, con `--border` = `--border-subtle`, globals.css:235). El blanco forzado en ambos temas se espeja con
  // `bg-white` (--color-white, global.css:39) y el hairline con `border-subtle/50` (mismo canal + alpha del web).
  return (
    <View
      className={`overflow-hidden ${padded ? 'bg-surface-sunken p-space-5' : 'border-b border-subtle/50 bg-white'}`}
      style={{ width: '100%', height }}
    >
      <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
    </View>
  )
}

/** Decide el medio a renderizar espejando el orden de prioridad de la web (§3). */
function TechniqueMedia({ exercise }: { exercise: SessionExercise }) {
  const { width } = useWindowDimensions()
  // Altura FIJA del medio = web `h-48 md:h-64` (Tailwind 4px grid: 48·4=192 / 64·4=256px). Los CUATRO
  // contenedores del medio del modal web usan esta altura fija INDEPENDIENTE del ancho, con el medio
  // `object-contain` centrado dentro (WorkoutExecutionClient.tsx:2016,2030,2048,2062). ≥md (tablet/landscape,
  // breakpoint 768 de Tailwind) sube a 256 igual que el `md:` del web. No es un valor nuevo: es el mismo token
  // `h-48`/`h-64` de la escala Tailwind (misma grilla de 4px del DS) que compila el web, no `aspectRatio:16/9`.
  const mediaHeight = width >= 768 ? 256 : 192
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
        // Altura FIJA = web `h-48 md:h-64` (:2016), no el 16:9 derivado del ancho.
        style={{ height: mediaHeight }}
        title={exercise.name}
      />
    )
  }

  // 2) gif — inset 16px como el web (`object-contain p-4`, :2035).
  if (exercise.gif_url) {
    return <MediaImage uri={exercise.gif_url} padded height={mediaHeight} />
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
    // Letterbox BLANCO + hairline inferior = web mp4 `bg-white border-b border-border/50` (:2048), blanco
    // forzado en ambos temas. `letterbox="#ffffff"` pinta el fondo del video (contenedor + WebView/HTML) de
    // blanco en vez del #000 por defecto; el `#fff` = --color-white (global.css:39), patrón hex-que-coincide-
    // con-canal-DS documentado. El `border-b border-subtle/50` (= web border-subtle/50) va en el envoltorio.
    if (isMp4) {
      return (
        <View className="border-b border-subtle/50 bg-white">
          {/* Altura FIJA = web `h-48 md:h-64` (:2048), no el 16:9 derivado del ancho. */}
          <VideoPlayer url={videoUrl} autoPlay frameless letterbox="#ffffff" style={{ height: mediaHeight }} title={exercise.name} />
        </View>
      )
    }
    return <MediaImage uri={videoUrl} height={mediaHeight} />
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
          nombre en display xl extrabold uppercase tracking-tighter, color `text-foreground` que en el DS web
          resuelve a `--text-body` (= ink-800), NO a text-strong/ink-950 (globals.css:209 `--foreground:
          var(--text-body)`, :401 `--text-body: var(--ink-800)`); por eso el Text usa `text-body`. La X
          (w-5 h-5 text-muted-foreground, botón p-2 -mr-2 -mt-2 rounded-full) cierra el modal. `mt-space-3`
          (8px) sube el gap uniforme (14px) del BottomSheetScrollView (Sheet.tsx:219) hacia el ~24px
          medio→nombre del web (p-6 top del cuerpo scrolleable, WorkoutExecutionClient.tsx:2076). Sin
          `numberOfLines`: el DialogTitle web NO clampa, el nombre envuelve completo (:2079). */}
      <View className="mt-space-3 flex-row items-start justify-between gap-space-4">
        <Text style={techniqueTitleStyle} className="flex-1 text-body">
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
              {/* Badge numérico — espejo de la web (§5): círculo sport-500 @15%, número sport-500 bold,
                  size 'xs' (13px) = web span `text-xs` (globals.css:455 `--text-xs: 13px`,
                  WorkoutExecutionClient.tsx:2090). mt-0.5 (2px) iguala el `mt-0.5` del span web (:2090)
                  para el mismo alineado vertical. */}
              <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                <Text style={textStyle('xs', FONT.uiBold)} className="text-sport-500">
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
          surface-sunken / text-body (globals.css:222-223). Sin toast/haptic/navegación.
          `mt-space-3` (8px) sobre el gap uniforme (14px) del scroll (Sheet.tsx:219) ≈ 22px, acercándose
          al `mt-6` (24px) pasos→botón del web (WorkoutExecutionClient.tsx:2107) sin el ~38px previo
          (14 gap + 24 mt), reproduciendo el ritmo grande/pequeño/grande (24/16/24) del web. */}
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        className="mt-space-3 w-full items-center justify-center rounded-control bg-surface-sunken py-3"
      >
        {/* 16px bold: el <button> web no fija tamaño de texto → por el preflight de Tailwind
            (button { font-size: 100% }) hereda el 1rem/16px del body (WorkoutExecutionClient.tsx:2107,
            sin utilidad text-*), 2px por encima de los pasos (text-sm/14px) para conservar la
            jerarquía del CTA primario. `md` = 16px del DS (typography.ts:53), equivalente a --text-base. */}
        <Text style={textStyle('md', FONT.uiBold)} className="text-body">
          Entendido
        </Text>
      </TouchableOpacity>
    </Sheet>
  )
}
