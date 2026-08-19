# QA5 — Media (controles de video + cardio sin media)

Unidad: `qa5-media-controles`. Superficie: componentes de media web + RN (sin tocar steps/screens salvo lo indicado como pendiente). tsc web = 0, tsc mobile = 0. Sin commits.

## Hallazgo 1 — Controles de video (pausa/reanudar + reiniciar)

Antes: la media de video sólo tenía botón de audio. Ahora, cuando la media es video (mp4 directo o YouTube inline) hay una FILA glass en la esquina inferior-derecha: **audio + pausa/reanudar (Pause/Play 14px) + reiniciar (RotateCcw 14px)**, gap 6. Gif/imagen NO llevan controles.

### Web
- Nuevo: `ExecMediaControls.tsx` — fila reutilizable (audio + pausa + reinicio), clases `.exec-v3-mediactl` / `.exec-v3-mctlbtn`.
- `ExecMediaCard.tsx` (fuerza/superserie): mp4 → `video.pause()/play()` + `currentTime = 0`.
- `ExecTypedMedia.tsx` (cardio/movilidad/roller): idem mp4.
- `ExecYoutubeInline.tsx`: YouTube web → IFrame API por `postMessage` (`pauseVideo`/`playVideo` y `seekTo 0`+`playVideo`). Audio ya existía por postMessage; ahora comparte la fila.
- CSS: `globals.css` — añadidas `.exec-v3-mediactl` y `.exec-v3-mctlbtn` (aditivo, tras `.exec-v3-maudio`). `.exec-v3-maudio` queda sin uso (dead, no removido para no chocar con el worker paralelo de globals.css).

### RN
- `VideoPlayer.tsx`: props nuevas `paused?` y `restartSignal?` (defaults inocuos → comportamiento previo intacto en técnica/catálogo). 
  - mp4 vía expo-video (`DirectVideo`): `player.pause()/play()` + `currentTime = start` en reinicio.
  - WebView (YouTube y fallback HTML5 `<video>`): `injectJavaScript` con snippets combinados (`window.player` de la IFrame API + `<video id="v">`). NO recarga el WebView → pausa/reinicio sin reiniciar.
- `ExecMediaV3.tsx`: `MediaControlsRow` + `GlassCtlButton` (reemplazan a `AudioGlassButton`, ya eliminado); estado `paused`/`restartNonce`; clasificador compartido `execMediaKind`/`hasExecMedia`.
- `TypedMediaV3.tsx`: usa `MediaControlsRow`; pausa/reinicio en mp4 y YouTube.

### Pendiente con razón (RN YouTube audio)
El AUDIO de YouTube en RN sigue diferido (`hasAudio=false` para kind youtube): alternar el mute recargaría el WebView. Pausa/reinicio SÍ se implementaron (injectJavaScript no recarga). En web el audio de YouTube funciona (postMessage). Decisión heredada de QA4, mantenida.

## Hallazgo 2 — Cardio (y tipadas) sin media

Antes: cardio sin gif/video (kind 'none': elíptica, cinta…) dejaba una card 150px vacía con silueta (corazón). Ahora la card grande **sólo existe si hay media**; sin media colapsa a un chip glass suelto "Instrucciones" (+ "Nota del coach" si hay) junto a la identidad. Aplica a los 3 tipados. Si no hay ni técnica ni nota → no se renderiza nada.

### Web — HECHO y autocontenido
`ExecTypedMedia.tsx`: early-return cuando `media.kind === 'none'` → fila centrada de chips `exec-v3-mchip` (sin card, sin CSS nuevo — utilidades Tailwind). Los steps ya renderizan `<ExecTypedMedia/>` en su sitio → **sin cambios en los steps**. Prop `fallbackIcon` marcada `@deprecated` (ya no se dibuja; se mantiene en la firma para no romper a cardio/movilidad/roller que la siguen pasando).

- Fuerza (`ExecMediaCard.tsx`) NO colapsa: la instrucción acota el colapso a "los 3 tipados"; fuerza casi siempre trae gif del catálogo. Mantiene su silueta Dumbbell. (Decisión — reversible si el CEO lo quiere igual.)

### RN — PENDIENTE de wiring en las screens (coordinación con worker de steps)
El wrapper de altura fija 150px lo posee CADA screen (no el componente de media), así que el colapso pleno requiere gatear ese wrapper. Dejé listo lo mío:
- Exportado desde `TypedMediaV3.tsx`: `hasExecMedia(exercise)` y `<TypedInstructionsChip exercise accent coachNote onOpenTechnique onOpenNote reducedMotion />`.
- Interino ya activo: si la screen sigue renderizando `<TypedMediaV3/>` sin media, éste muestra el chip centrado (en vez de la silueta) — mejora aunque la screen no cambie.

Cambio exacto que debe hacer cada screen (gatear el wrapper y montar el chip junto al nombre):
- `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx:197-199` — `<View style={{ width:'100%', height:150, ... }}><TypedMediaV3 .../></View>`.
- `apps/mobile/components/alumno/workout/v3/MobilityScreenV3.tsx:169-171` — wrapper `height: MEDIA_HEIGHT`.
- `apps/mobile/components/alumno/workout/v3/RollerScreenV3.tsx:171-173` — wrapper `height: MEDIA_HEIGHT`.

Patrón sugerido: `hasExecMedia(exercise) ? (<View height:150>...<TypedMediaV3/></View>) : (<TypedInstructionsChip .../> junto al nombre)`. `onOpenTechnique`/`onOpenNote` ya existen en las 3 screens.

## Archivos tocados
- Web: `ExecMediaControls.tsx` (nuevo), `ExecMediaCard.tsx`, `ExecTypedMedia.tsx`, `ExecYoutubeInline.tsx`, `globals.css`.
- RN: `VideoPlayer.tsx`, `ExecMediaV3.tsx`, `TypedMediaV3.tsx`.
