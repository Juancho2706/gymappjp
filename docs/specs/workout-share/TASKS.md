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

- [x] F4.1 `StickerGestureLayer` (capa hermana del nodo capturado, montada solo en el paso):
      zonas de gesto calcadas de cada sticker con las medidas que ahora publica el canvas
      (`reportSizes`) + Pan por sticker y Pinch en la raíz sobre el SELECCIONADO (dos dedos
      dentro de una pastilla de 40 px no es un gesto real), clamp 0,5–3. El sticker que se
      mueve es el REAL: el canvas lee un `SharedValue` con el destino vivo y lo aplica en el
      UI thread (`liveTransform`) — no hay clon ni remonte. El destino es ABSOLUTO y no un
      delta: así el commit no parpadea (el desplazamiento vale 0 en el mismo render en que
      React aplica la posición nueva).
- [x] F4.2 Guías de alineación centro H/V (aparecen a 12 px, imantan a 8 con tick háptico —
      latch de imán aparte del de la guía, si no el tick se comía el enganche), mantener
      apretado 500 ms = quitar (por el mismo camino de overrides del editor), flip de silueta
      reusando `MuscleViewSegmented`. Clamp del CENTRO en [0,03–0,97]×[0,02–0,98]: sobre el
      centro y NO sobre la caja, o los rieles rotados de Marcador/Póster quedaban fuera del
      alcance del alumno.
- [x] F4.3 `setStickerPosition`/`setStickerScale` viven en `layout` (no en DB, no son
      overrides): verificado que `selectPreset` los pisa al re-clonar el preset, que es el
      comportamiento pedido. Botón «Restaurar» devuelve un sticker a su lugar de fábrica.
      Extra encontrado al integrar: el composer necesitaba `GestureHandlerRootView` propio —
      sus dos caminos de montaje son ventanas nativas ajenas y el root de `app/_layout.tsx`
      no las alcanza (mismo fix que documenta `components/Sheet.tsx`).
- [ ] F4.4 Verificar captura fiel post-drag (transforms Reanimated + view-shot) en Android
      low-end — QA device (ACUMULAR). Sumar a esa pasada: `borderStyle:'dashed'` con radio en
      Android (algunas versiones lo pintan sólido) y el pellizco con un dedo apoyado sobre un
      sticker (el Pan es `maxPointers(1)` justamente para dejarle el segundo dedo al Pinch).

**Drifts de F4 vs el pedido/mockup** (deliberados, anotados para no redescubrirlos):
- Sin papelera flotante: quitar es SOLO mantener apretado, anunciado en el hint del paso.
- Tamaño por stepper de 0,1 (con barra de referencia) y no con el `Slider` del DS: ese
  componente resuelve pista y relleno con `resolvedScheme`/`theme.primary` y este chrome es
  oscuro SIEMPRE — en una cuenta con tema claro la pista desaparecía. Es el mismo motivo por
  el que el composer ya tiene su propio `DarkSwitch`. El ajuste continuo es el pellizco.
- `STAGE_FRACTION.acomodar` baja de 0,70 a 0,62 para que el panel del seleccionado entre en
  un teléfono chico sin tapar el lienzo.

## F5 — Compartir (paso 4, targets)

> Research 19-08 (flujo App ID verificado contra docs Meta): basta el App ID («app sin caso
> de uso», SIN review/verificación/portafolio; recomendado flip a Live con privacy URL).
> Trampas de implementación confirmadas: `<queries>` Android SOLO por config plugin (no
> app.json); payload iOS = data real (string URL produce el MISMO error que App ID malo);
> FB Stories usa extra `com.facebook.platform.extra.APPLICATION_ID` (≠ patrón IG
> `source_application`); swipe-up/attributionURL NO existe para apps normales ⇒ link SIEMPRE
> por portapapeles; iOS 16+ muestra prompt de pegado disparado por Instagram (indeprimible;
> si el usuario deniega, el share llega vacío — considerar en QA); colores de fondo
> opcionales (default #222222); URIs Android requieren FLAG_GRANT_READ + grantUriPermission
> explícito a com.instagram.android o IG rebota con ENOENT.

- [x] F5.1 `react-native-share@12.3.1` + plugin (schemes iOS + queries Android) + extra
      NO pedido pero necesario: `["expo-media-library",{"granularPermissions":[]}]` — el
      plugin auto-aplicado metía READ_MEDIA_IMAGES/VIDEO/AUDIO al manifest (declaraciones
      de datos sensibles en Play) para una feature que solo ESCRIBE. Verificado con
      `expo config --type prebuild`. App ID `28862306396704276` en extra.
- [x] F5.2 Stories directo IG/FB en share-targets.ts: guard Android por
      `isPackageInstalled` (canOpenURL con scheme custom no funciona sin intent queries;
      sin guard la lib manda a la ficha de Play) + iOS canOpenURL (InstagramStories.m
      resuelve true aunque no abra nada); portapapeles con `&k={preset}` + toast SOLO en
      Stories (pisarle el clipboard a quien va a un chat es invasivo); backgroundTop/
      BottomColor del acento (IG solo los honra en modo sticker).
- [x] F5.3 WhatsApp shareSingle con fallback; Guardar vía expo-media-library writeOnly
      (Android 13+ pide CERO permisos — verificado en MediaLibraryModule.kt; iOS add-only)
      + NSPhotoLibraryAddUsageDescription es-CL; Más… = hoja nativa solo archivo.
- [x] F5.4 Fila de destinos explícitos Stories·WhatsApp·Guardar·Más… (+FB secundario solo
      con App ID); `busyTarget` por botón; captura por tap; ninguno lanza —
      `{target, outcome}`. QA binario pendiente en F9.

## F6 — Growth (atribución)

> **Decisión del 20-08 (el loop estaba CORTADO):** la tarjeta emitía `/c/{código}/login`, pero el
> capturador del `?ref` vive en `/join/[invite_code]` — y ahí el alta standalone estaba apagada por
> el **C-KILL (2026-07-04)**. Dos puertas cerradas: quien recibía la tarjeta no tenía cuenta para
> loguearse, y `/c/` además está reclamada como deep link (AASA + intentFilters), así que con EVA
> instalada el link abría la app en vez del alta. Se **retiró el C-KILL** (el hueco de `max_clients`
> que lo motivó ya lo cierra `checkJoinCapacity`, cableado en `join.actions.ts` desde Pricing v2) y
> la tarjeta ahora apunta a **`/join/{código}`**, que NO está reclamada y abre el navegador.

- [~] F6.1 `build-share-data` arma `?ref={clientId}&src=share_card` sobre `studentJoinUrl` cuando
      hay `clientId` (sin él, URL limpia). FALTA el `k={preset}`: NO va en esta URL a propósito —es
      la que se hornea en el QR y el alumno puede cambiar de preset después de que el canvas se
      pintó—; el link con `k` lo arma F5 al copiar al portapapeles, que sí conoce el preset final.
- [x] F6.2 `/join/[código]` web: leer searchParams, validar `ref` pertenece al MISMO coach,
      persistir en insert de `clients` (`034c6863`). Standalone reabierto el 20-08: la page renderiza
      el `JoinForm` para los tres scopes y el action crea el alumno tras el cerco de cupo.
- [x] F6.3 Evento server `coach_client_referred` al concretarse el alta referida (`034c6863`).
- [x] F6.4 (20-08) Aviso al coach por Resend cuando el alta es standalone — es el único camino que
      él no origina. `await` (nunca fire-and-forget: el redirect mata la promesa en Vercel) y
      fail-open: un fallo de correo jamás rompe el alta.

## F7 — Analytics móvil

- [x] F7.1 `posthog-react-native@4.63.2` en lib/analytics.ts — fail-open (sin key ⇒ no-op),
      lifecycle/replay/push/errorTracking en false EXPLÍCITO (varios default true;
      errorTracking chocaría con los handlers de Sentry), identified_only sin identify.
- [x] F7.2 4 eventos cableados (opened/style_selected/photo_attached/target_selected) —
      props sin datos de salud (21.719); `card_kind` usa el mismo vocabulario que
      `k=`/`referral_card_kind`.

## F8 — CTA del resumen (rework)

- [~] F8.1 CORRECCIÓN DE PREMISA (verificado en código 19-08): la pantalla final VIVA es
      `SessionCompleteV3` (montada en `ExecutorV3.tsx:1902`); `WorkoutSummaryOverlay` NO está
      montado en ningún lado bajo V3. Y esa pantalla YA tiene lo que pedía el rework: stats con
      tickers, mapa anatómico real (`MuscleMapSvg` con tiers), PR dorado y racha. Se decidió NO
      rediseñarla (regla: verificar el diseño contra el código). Queda abierto solo el detalle
      «volumen héroe» del mockup Main: hoy el volumen es un tile de la grilla, no una cifra héroe.
- [x] F8.2 `share/ShareWorkoutCta.tsx`: pastilla juicy V3 con halo pulsante (View tintado, no
      `shadowColor` — Android no anima color de sombra), shimmer de EXACTAMENTE 2 pasadas
      (`withRepeat(..., 2, false)`), mini del card real (`ShareCanvas` 36×64, layout de fábrica de
      `placa`, memoizado por referencia de `data`) y fila de redes con SVG inline (lucide ya no trae
      iconos de marca; cero dependencias nuevas). Entrada anclada a la fase 2 del resumen
      (1200 ms) + 320 ms ⇒ ~1,5 s post-confetti; reduced-motion = estático e inmediato. La barra de
      acciones RESERVA el alto para que «Volver al inicio» no salte bajo el dedo.
- [x] F8.3 Wire: el CTA REEMPLAZA al `JuicyButton` «Compartir logro» (mismo testID `final-share`) y
      abre `WorkoutShareComposer embedded` montado dentro del Modal del resumen; la `ShareCardPreview
      variant="default"` de sesión se retiró (el composer ocupa su lugar), la del PR queda intacta
      como affordance aparte. `shareData` sale de `buildWorkoutShareData` en un `useMemo` (los minis
      del composer y del CTA comparan `data` por referencia). `clientId` baja de `ExecutorV3` para el
      `?ref=` y branding sale de `useTheme()`. Marcador `// F7:` puesto donde va
      `student_share_card_opened`. Gates: tsc mobile ✅ · eslint de share/ + v3 tocados ✅.
      QA device pendiente (F9.2).

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
