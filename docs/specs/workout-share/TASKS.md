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

- [x] F0.1 `ShareCard.tsx`: iOS comparte SOLO archivo (sin `message` — WhatsApp/IG tomaban el
      texto y botaban la imagen); `shareMessage` queda como dialogTitle/fallback Android.
      Regresión de Records: QA device pendiente (acumulado).
- [x] F0.2 `onShared` (prop muerta, 0 consumidores) → `onShareOutcome('shared'|'dismissed'|
      'unknown')`: iOS honesto, Android siempre 'unknown' (shareAsync no distingue cancelar);
      contrato documentado en el tipo — instrumentar INTENTOS, el éxito lo mide `?ref=`.
- [x] F0.3 Gates corridos 19-08 al liberar CPU: tsc mobile, typecheck monorepo, lint (0 err),
      tests (5985 ✓), docs:check, boundaries, tokens — TODOS verdes. QA device de regresión
      del share de Records queda en F9.2.

## F1 — DDL + Mi Marca (@handle)

- [x] F1.1 DDL EN LIVE 19-08 (tx-rollback verde → `apply_migration` → advisors 0 ERROR):
      migración `20260819223729_share_entreno_instagram_handle_y_referral` (espejo en repo).
      Extra vs plan: `grant select (instagram_handle) to anon` (el select RICH anónimo del
      login white-label falla entero sin él) + índice parcial en `referred_by_client_id`.
- [x] F1.2 `database.types.ts` actualizado quirúrgico (coaches + clients, Row/Insert/Update;
      falta solo la entrada `Relationships` del FK — la pondrá el próximo regen completo).
- [x] F1.3 Mi Marca (web): input @handle (prefijo @ visual) en «Identidad de tu marca»;
      Zod + normalizador ÚNICA FUENTE en `@eva/schemas` (`normalizeInstagramHandle`,
      `INSTAGRAM_HANDLE_RE` espejo del CHECK); se escribe SIEMPRE (fuera del gate Pro+ —
      es identidad, como brand_name); `settings.queries.ts` suma la columna al select
      explícito (sin eso cada Guardar la borraba).
- [x] F1.4 Móvil: `CoachBranding.instagramHandle` + `BRANDING_COLS_RICH` + mapper
      (branding.ts); editor Mi Marca RN completo (coach-brand.ts + brand.tsx: input con
      leftIcon @, dirty normalizado, cache del device parcheada).
- [x] F1.5 DECISIÓN OWNER 19-08: white-label queda COMO ESTÁ (opción C — se evaluó split
      lite/full y se descartó por ahora). Consecuencia asumida: el @handle solo lo editan
      coaches Pro+ (Mi Marca); el card de un alumno de coach Free sale con brand_name pero
      acento/logo EVA y sin handle. Si el loop de shares demuestra tracción en Free,
      reabrir con datos (student_share_* por tier).

## F2 — ShareCanvas + 6 presets (la imagen)

- [x] F2.1 Estructura completa en `apps/mobile/components/alumno/share/` (`3191fe20`+`e585e323`):
      share-types (StickerState con centro normalizado 0..1 + scale + rotation), 9 stickers
      puros (contrato `{data,k,stickerScale,tokens}` en sticker-kit), ShareCanvas (anclaje por
      centro vía onLayout con guard anti-bucle; opacity 0 hasta medir — frame capturable),
      build-share-data (réplica exacta de la detección de récords del resumen; ★ por exerciseId).
- [x] F2.2 MuscleBodySvg standalone (front/back/both sobre BODY_SHAPES filtrado por side,
      mismos tiers/alfas que MuscleMapSvg, acento por prop, sin ThemeContext) + variante chips.
- [x] F2.3 Los 6 presets como DATOS con defaults del mockup (ajustes de colisión documentados
      en share-presets.ts; rieles laterales de Marcador/Póster con rotation ±90).
- [x] F2.4 Fondos: foto (velo inferior de legibilidad; helpers `takeSharePhoto` cámara FRONTAL
      default / `pickSharePhoto`), marca (tinta diagonal + halo de acento), TRANSPARENTE real
      (PNG con alpha). Pantalla pre-permiso «Continuar» (App Review 5.1.1(iv)) → la pone F3.
- [x] F2.5 `captureShareCanvas` (1080×1920, rename + fallback, `collapsable={false}` en raíz y
      caller) + `cleanupShareCapture`. Harness de QA device: `dev-harness/share-canvas`
      (guard `__DEV__`, mock realista, damero para ver el alpha, switcher de presets).
- [~] F2.6 Póster: lanzado con DEGRADACIÓN (cifra delante con alpha, `posterGhost`) —
      la segmentación de sujeto nativa (iOS Vision / ML Kit) queda como spike posterior
      (módulo nativo ⇒ binario; evaluar para 1.1.2 solo si sobra timeline).

## F3 — Editor (paso 2)

- [x] F3.1 `WorkoutShareComposer` (3 pasos, un solo lienzo montado — remontar re-mide stickers)
      con fila de 6 minis: ShareCanvas real a 68px, layout de fábrica + React.memo (un toggle
      no repinta los minis). Chrome con literales EXEC_SURFACE (canvas siempre-oscuro).
- [x] F3.2 Cámara con panel pre-permiso «Continuar»/«Ahora no» (hook useCameraPermissions para
      estado fresco), galería, sin foto. Pendiente F5: atajo a Ajustes cuando canAskAgain=false.
- [x] F3.3 Toggles por sticker + selector de vista muscular + sub-toggle @handle (prop
      showHandle nueva en BrandFooterSticker). DRIFT documentado: «duración y series» = UN
      toggle (mismo sticker) y 1RM vive dentro de récords (anunciado en hint). Cambio de
      preset: posiciones se resetean, overrides del alumno sobreviven (refs, no estado);
      fondo/silueta con regla `touched`.
- [x] F3.4 QR default OFF vía override sembrado (sobrevive el cambio de preset; `sello` lo
      trae de fábrica y el SPEC manda OFF). Paso Compartir provisional: hoja nativa con
      captura+cleanup (F5 lo reemplaza por botones de destino).

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
