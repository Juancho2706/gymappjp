# QA4 — Multimedia: autoplay YouTube inline + expandir + chips unificados + pills fuera

Unidad: `qa4-media-autoplay-expand`. Rama `fix/executor-v3-qa1` (worktree `executor-redesign`). Sin commits.
Reglas de oro respetadas: motor guardado/drafts/cola INTOCABLE (sólo presentación bajo `[data-exec-v3]` /
`exec-theme`); props aditivas; dark-only; white-label (`var(--exec-brand)` web, `exec.accent` RN); copy
español latam con tildes. `pnpm --filter web exec tsc --noEmit` = 0 errores. `pnpm --filter @eva/mobile exec
tsc --noEmit` = 0 errores.

## Hallazgo 1 — YouTube AUTOREPRODUCIDO inline
- WEB (hecho completo): nuevo `ExecYoutubeInline.tsx`. La media kind `'youtube'` pasa de placeholder a
  `<iframe>` de `youtube-nocookie` autoplay + `mute=1` + `loop=1&playlist={id}` sin controles ni branding,
  respetando `start`/`end` del coach. `pointer-events:none` sobre el iframe (el tap cae en los chips/expand,
  no en el player). El botón de audio glass (`exec-v3-maudio`, ya existente) alterna el mute vía la IFrame
  API por `postMessage` (`enablejsapi=1`, `{event:'command',func:'mute'|'unMute'}`) SIN recargar el src.
  Fallback: `onError` del iframe → placeholder "Ver video" de siempre (abre la técnica). Cuota intacta: sólo
  el paso activo monta el componente. Usado por `ExecMediaCard` (fuerza/superserie) y `ExecTypedMedia`
  (movilidad/roller/cardio).
- RN (espejado, estable): `ExecMediaV3`/`TypedMediaV3` reproducen YouTube inline MUTED reusando el
  `VideoPlayer` de la técnica (mismo WebView + iframe youtube-nocookie autoplay/mute/loop que ya funciona en
  release). SIN botón de audio en YouTube — ver pendiente.

## Hallazgo 2 — Expandir multimedia (pantalla completa)
- WEB: botón `Maximize2` 16px glass en la esquina superior-derecha de la media del `TechniqueSheetV3` (sólo
  si hay media) → `TechniqueLightbox`: `fixed inset-0 z-[200]`, fondo `bg-black/90`, media centrada grande
  (youtube via `ExerciseVideo`, video con `controls`, imagen `contain`), X para cerrar + tap-al-fondo cierra
  (stopPropagation sobre la media). Reset del estado al cambiar/cerrar el ejercicio.
- RN: botón `Maximize2` glass sobre la media del `TechniqueSheet` → `Modal` fullscreen (`LightboxMedia` con
  la misma precedencia, dimensionada a la ventana), X + tap-al-fondo cierran.

## Hallazgo 3 — Chips unificados en tipadas (Nota adentro)
- `ExecTypedMedia` (web) y `TypedMediaV3` (RN) ahora montan los DOS chips glass en el overlay superior-
  IZQUIERDO (antes sólo "Instrucciones" a la derecha): "Instrucciones" + "Nota del coach" (condicional, con
  badge de aviso), mismo colapso 1,5s one-shot por ejercicio. La pill suelta de nota se ELIMINÓ de los steps
  (web `MobilityStepV3`/`RollerStepV3`/`CardioStepV3` ya no importan `CoachNoteChip`) y de las pantallas RN
  (`MobilityScreenV3`/`RollerScreenV3`/`CardioScreenV3`). Web: `ExecTypedMedia` posee su `CoachNoteSheet`
  (mismo patrón que `ExecMediaCard`). RN: el chip llama `onOpenNote` y la pantalla conserva su `Sheet` de
  nota (mínima invasión; el `noteOpen` sigue en uso).

## Hallazgo 4 — Pills fuera
- Eliminadas las pills superpuestas "Mantén" (movilidad) y "En loop" (roller): web se quitó la prop
  `liveLabel` de `ExecTypedMedia` y su render (`exec-v3-medialbl`/`exec-v3-live` quedan sin uso en estos
  paneles); RN se quitó la View absoluta de la etiqueta live en `MobilityScreenV3`/`RollerScreenV3`. El resto
  del overlay (chips) queda.

## Archivos tocados
WEB: `ExecYoutubeInline.tsx` (nuevo), `ExecMediaCard.tsx`, `ExecTypedMedia.tsx`, `TechniqueSheetV3.tsx`,
`MobilityStepV3.tsx`, `RollerStepV3.tsx`, `CardioStepV3.tsx`. (`exec-media.ts` sin cambios: el tipo `youtube`
ya cargaba `videoId/start/end`.) Sin edits a `globals.css` (se reusan clases existentes + Tailwind/inline).
RN: `ExecMediaV3.tsx`, `TypedMediaV3.tsx`, `TechniqueSheet.tsx`, `MobilityScreenV3.tsx`, `RollerScreenV3.tsx`,
`CardioScreenV3.tsx`.

## Pendientes (con razón)
- RN: el toggle de audio en YouTube inline NO se implementó (queda muted). Alternar el mute en el `VideoPlayer`
  de YouTube requiere reconstruir el `source` del WebView → recarga/reinicio del video (jank). En web sí hay
  toggle porque la IFrame API acepta `postMessage` sin recargar. El CEO QA-ea la PWA; el archivo de video mp4
  directo SÍ conserva su botón de audio en RN (mute en vivo por `expo-video`).
- WEB: el `onError` del iframe es best-effort (los iframes rara vez emiten `error` en bloqueos de red); es el
  fallback que pidió el CEO ("si el embed falla, queda el placeholder"), suficiente para casos de embed
  deshabilitado por el dueño del video.
