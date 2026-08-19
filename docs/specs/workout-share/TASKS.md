---
status: draft
owner: product-engineering
last_verified: "2026-08-19"
canonical: false
---

# TASKS — Compartir Entreno

Orden ejecutable. Contexto en [SPEC.md](./SPEC.md) y [PLAN.md](./PLAN.md).
Convención: `[ ]` pendiente · `[x]` hecho con evidencia real · `[~]` parcial (anotar qué falta).

**Bloqueantes externos**: (a) Facebook App ID — trámite del owner en developers.facebook.com
(sin él, F5.2 degrada a hoja nativa pero NO bloquea el resto); (b) Apple aprueba 1.1.1 antes de
encolar el build 1.1.2 (F9).

## F0 — Fixes del motor existente (prerrequisito de todo)

- [ ] F0.1 `ShareCard.tsx:590`: iOS compartir SOLO archivo (quitar `message` del `Share.share`
      cuando hay imagen); verificar share de Records sigue OK (regresión).
- [ ] F0.2 Contrato `onShared` → semántica «share sheet abierto» (Android no distingue cancelar);
      renombrar callback y todo consumidor; comentario de contrato en el tipo.
- [ ] F0.3 tsc mobile + tests afectados (ACUMULAR — CPU bloqueada).

## F1 — DDL + Mi Marca (@handle)

- [ ] F1.1 DDL en LIVE (protocolo: tx-rollback antes, advisors después):
      `coaches.instagram_handle` + CHECK + `grant update (instagram_handle)` a authenticated;
      `clients.referred_by_client_id/referral_source/referral_card_kind` (sin grant — escribe server).
- [ ] F1.2 Regenerar `database.types.ts` (web y mobile si aplica).
- [ ] F1.3 Mi Marca (web): input @handle con Zod espejo del CHECK; guardado por la ruta de
      branding existente; mostrarlo en la preview de marca.
- [ ] F1.4 Branding payload móvil: exponer `instagram_handle` donde el móvil lee el branding.

## F2 — ShareCanvas + 6 presets (la imagen)

- [ ] F2.1 Estructura `apps/mobile/components/alumno/share/`: ShareCanvas + capas (Background,
      stickers: VolumenHero, StatsRow, MuscleFigure, RecordsBand, ExerciseSetlist, BrandFooter
      con logo+@handle, DateChip, StreakChip, QR).
- [ ] F2.2 MuscleFigure: reuso de MuscleMapSvg/body-anatomy con intensidad de
      `muscleGroupsToRegionIntensity`; variantes frente/espalda/ambos + chips.
- [ ] F2.3 PresetEngine: los 6 presets como datos (Placa default, Heatmap, Sello, Marcador,
      Set-list, Póster) con defaults de posición/visibilidad/fondo/aspect según mockup
      (artifact `3d5e94c1`).
- [ ] F2.4 Fondos: foto (cámara frontal default / galería), fondo de marca (sin foto),
      TRANSPARENTE (PNG con alpha para sticker mode).
- [ ] F2.5 Captura view-shot PNG limpia (ref sin chrome de edición); limpieza del tmpfile.
- [ ] F2.6 Póster: segmentación de sujeto (iOS Vision / Android ML Kit) con degradación
      número-adelante alpha 0.14 si no disponible. Si estrangula timeline: lanzar solo con
      degradación (anotar aquí).

## F3 — Editor (paso 2)

- [ ] F3.1 Fila de presets deslizable (thumbnails en vivo del ShareCanvas a escala).
- [ ] F3.2 Fuente de foto: cámara (pre-permiso «Continuar» — regla iOS), galería, sin foto.
- [ ] F3.3 10 toggles: volumen, duración, series, récords, 1RM, músculos (silueta/chips/ambos),
      logo, @handle, fecha, racha. Defaults del mockup. Cambio de preset conserva toggles,
      resetea posiciones.
- [ ] F3.4 QR solo visible/activable en variante Guardar.

## F4 — Acomodar (paso 3, drag)

- [ ] F4.1 StickerGestureLayer: drag (translate) + pinch/slider (scale) por sticker con
      Gesture Handler + Reanimated.
- [ ] F4.2 Guías de alineación (snap centro H/V + haptic), long-press = quitar,
      flip Frente⇄Espalda para MuscleFigure.
- [ ] F4.3 Persistir posiciones en el estado del composer (no en DB); reset al cambiar preset.
- [ ] F4.4 Verificar captura fiel post-drag (transforms Reanimated + view-shot) en Android
      low-end — QA device (ACUMULAR).

## F5 — Compartir (paso 4, targets)

- [ ] F5.1 `react-native-share` v12.3.1 + config plugin (iOS schemes instagram-stories/
      facebook-stories/instagram/whatsapp; Android queries IG/FB/WA/TikTok) — BINARIO.
- [ ] F5.2 Stories directo IG/FB: `shareSingle` con backgroundImage (normal) o stickerImage
      (transparente) + `FACEBOOK_APP_ID` de config; guard runtime → hoja nativa si falta ID o
      app no instalada. Patrón Strava: copiar link invitación al portapapeles + toast
      «pegalo en el sticker Link».
- [ ] F5.3 WhatsApp `shareSingle` con fallback; Guardar vía expo-media-library
      (+ `NSPhotoLibraryAddUsageDescription` — BINARIO); Más… = hoja nativa SOLO archivo.
- [ ] F5.4 Botones de destino explícitos (única medición fiable de target).

## F6 — Growth (atribución)

- [ ] F6.1 Link `?ref={client_short_id}&src=share_card&k={preset}` armado en móvil.
- [ ] F6.2 `/join/[código]` web: leer searchParams, validar `ref` pertenece al MISMO coach,
      persistir en insert de `clients` (`join.actions.ts:78`).
- [ ] F6.3 Evento server `coach_client_referred` al concretarse el alta referida.

## F7 — Analytics móvil

- [ ] F7.1 `posthog-react-native` mínimo (sin autocapture, sin replay, identified_only) — BINARIO.
- [ ] F7.2 4 eventos del funnel (opened / style_selected / photo_attached / target_selected) —
      SIN datos de salud (21.719).

## F8 — CTA del resumen (rework)

- [ ] F8.1 Rework `WorkoutSummaryOverlay`: volumen héroe, mapa anatómico real con % por región,
      récords banda fina, «Lo que viene» conservado (mockup Main).
- [ ] F8.2 CTA v2: entra ~1,2-1,8 s post-confetti, glow pulsante + shimmer 2 pasadas +
      iconos redes + mini-thumbnail del card real; reduced-motion = estático.
- [ ] F8.3 Wire: CTA → WorkoutShareComposer con los datos de la sesión.

## F9 — QA + release 1.1.2

- [ ] F9.1 Gates acumulados: tsc mobile, lint, tests, suite completa UNA vez (cuando owner
      libere CPU).
- [ ] F9.2 QA device Android (cable): drag, captura, transparente, targets, low-end MIUI.
- [ ] F9.3 QA iPhone: Stories directo, sticker transparente, Guardar (permiso), reduced-motion.
- [ ] F9.4 Bump `version` 1.1.2 + build GH Actions `mobile-build.yml` submit_ios+submit_android
      (GATE: 1.1.1 aprobada por Apple). Novedades ASC en ES-MX Y EN-US.
- [ ] F9.5 Actualizar docs canónicos: MOBILE_PARITY (share entreno), CURRENT, MOBILE_RELEASES_OTA
      (canal 1.1.2), TEST_STATUS.

## F10 — Fase 2 (NO v1, anotado para no perderlo)

- [ ] PWA: Web Share API Level 2 con files (canShare guard, blob ANTES del tap, fallback
      descarga), rasterizado canvas de los presets sin Póster ni Stories directo.
- [ ] TikTok directo (reevaluar solo si el share sheet demuestra fricción real).
- [ ] Formato 1:1 feed además de 9:16.
