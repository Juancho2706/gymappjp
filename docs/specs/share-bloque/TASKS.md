---
status: in-progress
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# TASKS — Share Entreno: bloque único en Inter

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Estado: **en código en el worktree
`share-bloque-strava`, commit local pendiente, sin push ni OTA** (ambos solo a pedido del owner).
**Ningún checkbox se marca sin gate real o QA del owner en device.**

## W0 · Decisión del owner (2026-09-06)

- [x] W0.1 Mockup opción A aprobado (artifact `6937fe7a-2bfd-4e2b-bdec-39a6f7dcf96d`): bloque único,
      sin estilos alternativos.
- [x] W0.2 Tipografía Inter fija, nunca la fuente de marca del coach.
- [x] W0.3 Edición reducida a drag + pellizco; se acepta la deuda a11y de tamaño sin stepper.

## T1 · Datos y layout puros

- [ ] T1.1 **Nuevo** `apps/mobile/components/alumno/share/share-block.ts`: `blockLines(data:
      WorkoutShareData)` puro (sin RN) que arma eyebrow, cifra de kg, fila min/series/reps con sus
      labels, nombre del grupo muscular principal y footer (nombre del coach + «vía EVA» — sin
      logo, eso lo resuelve el sticker). Cero imports de React Native.
- [ ] T1.2 **Nuevo** `apps/mobile/components/alumno/share/share-layout.ts` (reemplaza
      `share-presets.ts`): un único `SHARE_LAYOUT` con el sticker `'bloque'` (posición inicial
      normalizada, escala 1, `visible: true`). Sin `SharePresetId` con múltiples valores — se reduce
      a un tipo de un solo literal o se retira si nada más lo necesita (Riesgo R4 de la SPEC).
- [ ] T1.3 **Nuevo** `tests/mobile/share-block-data.test.ts`: `blockLines` con datos completos,
      con volumen 0, sin grupo muscular principal y con nombre de coach largo (trunca o no según lo
      que decida T1.1, documentado en el test).
- [ ] T1.4 **Nuevo** `tests/mobile/share-layout.test.ts`: `SHARE_LAYOUT` tiene exactamente un
      sticker, visible, con `x/y` dentro de 0..1.

## T2 · Sticker y tipografía

- [ ] T2.1 **Nuevo** `apps/mobile/components/alumno/share/stickers/StatsBlockSticker.tsx`: pinta
      `blockLines(data)` con `StrokedText` (contorno del 02-09, sin cambios) y los tres roles nuevos
      de tipografía. Alineado a la izquierda, sin fondo ni marco propio.
- [ ] T2.2 `apps/mobile/lib/typography.ts`: agregar `FONT.shareLabel` (Inter 600), `FONT.shareBold`
      (Inter 700) y `FONT.shareValue` (Inter 800, `tabular-nums` en los números) junto al resto de
      `FONT` (linea ~27-44 hoy). No tocar `ui*`/`display*`/`mono*` existentes.
- [ ] T2.3 `apps/mobile/app/_layout.tsx`: registrar `Inter_600SemiBold`, `Inter_700Bold`,
      `Inter_800ExtraBold` en el `useFonts` de `RootLayoutWithFonts` (línea ~299), importados de
      `@expo-google-fonts/inter` (mismo paquete que ya usa `lib/brand-fonts.ts:92`). **No** mezclar
      con `brandDisplayFontMap(branding)`: ese mapa es el mecanismo white-label y nunca debe resolver
      a Inter salvo que el coach lo haya elegido como fuente de marca.

## T3 · Composer: borrar lo que sobra

- [ ] T3.1 `WorkoutShareComposer.tsx` y `StickerGestureLayer.tsx`: quitar las ramas de long-press
      para remover un sticker, el stepper de tamaño y el toggle «Fondo transparente». Conservar
      drag y pellizco (`maxScaleFor`, `StickerGestureLayer.tsx:220`) sin tocar su aritmética.
- [ ] T3.2 Quitar el emisor de `student_share_style_selected`
      (`WorkoutShareComposer.tsx:355`) — código muerto, no solo deshabilitado.
- [ ] T3.3 `SessionCompleteV3.tsx:665-667`: `card_kind` pasa de `DEFAULT_SHARE_PRESET_ID` al
      literal `'bloque'`.
- [ ] T3.4 Colapsar los pasos Editar/Acomodar/Compartir en una sola pantalla: header + canvas +
      hint «Arrastra el bloque · pellizca para el tamaño» + chips Foto Tomar/Galería/Sin foto +
      barra de destinos Stories/WhatsApp/Guardar/Más…
- [ ] T3.5 `share-targets.ts`: los llamadores de `copyInviteLink` (líneas 239 y 269) pasan el
      literal `'bloque'` en vez de un `presetId` variable; `copyInviteLink` (línea 167) no cambia.

## T4 · Borrado de módulos huérfanos

- [ ] T4.1 Borrar `apps/mobile/components/alumno/share/share-presets.ts`.
- [ ] T4.2 Borrar `apps/mobile/components/alumno/share/MuscleBodySvg.tsx`.
- [ ] T4.3 Borrar los 9 stickers viejos: `BrandFooterSticker.tsx`, `DateChipSticker.tsx`,
      `MuscleFigureSticker.tsx`, `QrSticker.tsx`, `RecordsBandSticker.tsx`, `SetlistSticker.tsx`,
      `StatsRowSticker.tsx`, `StreakChipSticker.tsx`, `VolumenHeroSticker.tsx`, y su barrel en
      `stickers/index.ts` si solo reexportaba a estos.
- [ ] T4.4 Grep repo-wide de los cuatro nombres borrados (`share-presets`, `MuscleBodySvg`, y cada
      sticker) antes de dar el borrado por cerrado (Riesgo R3 de la SPEC).

## Gates

- [ ] G1 `pnpm --filter @eva/mobile exec tsc --noEmit` — 0 errores.
- [ ] G2 `pnpm exec vitest run tests/mobile/share-layout.test.ts tests/mobile/share-block-data.test.ts
      tests/mobile/share-sticker-scale.test.ts tests/mobile/share-per-side.test.ts
      tests/mobile/share-stroke-kit.test.ts tests/mobile/share-targets.test.ts
      tests/mobile/share-notices.test.ts` — todos verdes.
- [ ] G3 `pnpm docs:check` — verde (corrido por el worker de docs, ver informe aparte).

## QA en device (owner, tras la OTA)

- [ ] Q1 Bloque legible sobre foto CLARA y sobre foto OSCURA (contorno hace el trabajo, sin velo
      adicional).
- [ ] Q2 Drag del bloque sin parpadeo; clamp correcto contra los cuatro bordes del canvas.
- [ ] Q3 Pellizco hasta el tope (`maxScaleFor`) sin que el bloque desaparezca ni se corte — repetir
      la regresión del 02-09 (`qa-ejecutor-share-0209/TASKS.md` Q5).
- [ ] Q4 Stories en Instagram y en Facebook, con foto y con «Sin foto» (fondo de marca).
- [ ] Q5 WhatsApp (hoja nativa / share directo según disponibilidad).
- [ ] Q6 «Guardar» a la galería.
- [ ] Q7 PNG capturado sin marco punteado ni recorte del bloque en los cuatro cuadrantes del canvas.
- [ ] Q8 Coach SIN logo propio muestra la inicial en el círculo, sin branding «EVA» visible más
      allá de «vía EVA» en el footer.
- [ ] Q9 Reduced motion: sin animaciones de entrada del bloque cuando el sistema lo pide.
- [ ] Q10 TalkBack/VoiceOver: el bloque se anuncia como una unidad legible; el hint de arrastrar/
      pellizcar es descubrible sin gesto.

## Pendientes declarados

- [ ] P1 Commit local, push y OTA — **solo a pedido del owner**.
- [ ] P2 QA en device (checklist arriba) — depende de la OTA.
- [ ] P3 Actualizar `docs/testing/QA_DEVICE_PENDIENTE.md` y `docs/status/MOBILE_PARITY.md` cuando
      el QA del owner dé veredicto (ver entradas ya agregadas el 06-09, pendientes de tildar).
