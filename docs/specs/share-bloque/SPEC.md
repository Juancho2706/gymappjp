---
status: in-progress
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# SPEC — Share Entreno: bloque único en Inter (reemplaza presets, toggles y stickers sueltos)

Cambio aprobado por el owner el 2026-09-06 sobre [`workout-share`](../workout-share/SPEC.md), ya en
producción desde 1.1.2. Mockup aprobado: artifact `6937fe7a-2bfd-4e2b-bdec-39a6f7dcf96d`, **opción
A**. Estado: en código en el worktree `share-bloque-strava`, commit local pendiente, **sin push ni
OTA** (ambos solo a pedido del owner). QA en device pendiente del owner tras la OTA.

## Antes → después

**Antes** (`workout-share` F/G, en prod): 6 presets (Placa/Heatmap/Sello/Marcador/Póster/Set-list),
9 toggles de contenido, vista de músculos con silueta/chips, paso «Acomodar» separado de «Editar»,
9 stickers independientes con contorno blanco+negro sobre foto, `@handle` impreso, QR en la
variante Guardar, `MuscleBodySvg.tsx` (silueta anatómica).

**Después**: **un solo bloque de texto** blanco en Inter, movible por drag y escalable por
pellizco (tope `maxScaleFor`, motor sin cambios — `apps/mobile/components/alumno/share/share-types.ts:108`).
Layout fijo del bloque (opción A del mockup, alineado a la izquierda): eyebrow «VOLUMEN TOTAL» →
cifra «960 kg» → fila «42 min / 12 / 96» con labels «DURACIÓN / SERIES / REPS» → grupo muscular
principal solo por nombre («Hombros», sin porcentaje) → footer logo circular del coach + nombre en
mayúsculas + «vía EVA». Sin fecha, racha, récords, set-list, QR ni `@handle`. Una sola pantalla:
header + canvas + hint «Arrastra el bloque · pellizca para el tamaño» + chips de foto
Tomar/Galería/Sin foto + barra de destinos Stories/WhatsApp/Guardar/Más… (se eliminan los pasos
Editar/Acomodar/Compartir como pantallas separadas).

## Decisiones cerradas (2026-09-06, no reabrir)

1. **Layout A**, contenido y orden fijos como en «Después» arriba. Sin fecha/racha/récords/
   set-list/QR/`@handle`.
2. **Tipografía Inter fija** (600 para labels, 700 para músculo y marca, 800 para cifras;
   `tabular-nums` en los números) — **nunca** la fuente de marca del coach (los slots `Archivo_*`
   de `apps/mobile/lib/brand-fonts.ts` son el mecanismo white-label y no aplican acá). Fundamento:
   Strava usa Inter en app y cifras; su fuente de marca Boathouse (Grilli Type, reemplazó a Maison
   Neue en 2024) es custom y no se licencia. Inter 600/700/800/900 ya se importa en
   `apps/mobile/lib/brand-fonts.ts:92` (catálogo curado, key `'inter'`) y por lo tanto el asset ya
   viaja en el binario 1.1.2 ⇒ registrar los mismos nombres de fuente en
   `apps/mobile/app/_layout.tsx:299` (`useFonts`) es un cambio de JS puro: **sale por OTA, sin
   build nativa**.
3. **Edición reducida a dos gestos**: mover (drag) y tamaño (pellizco con el mismo tope
   `maxScaleFor` que ya usa el motor). Se eliminan: los 6 estilos/presets, los 9 toggles, la vista
   de músculos (silueta/chips), el long-press para quitar un sticker, el stepper de tamaño, el
   toggle «Fondo transparente», `@handle`, QR, y los pasos Editar/Acomodar/Compartir como pantallas
   separadas.
4. **Deuda de accesibilidad anotada**: sin stepper, el tamaño del bloque solo se cambia con
   pellizco (decisión del owner, no hay alternativa por teclado/switch en v1).

## Motor que NO cambia

`ShareCanvas.tsx` (centro normalizado, `LiveStickerSlot`, medición de tamaño real vía
`reportSizes`), la captura PNG 1080×1920 fija (`share-capture.ts:37,48-49`), los destinos
(`share-targets.ts` — `copyInviteLink` en la línea 167 sigue armando `&k=` con el separador según
haya o no `?ref=`; el valor que recibe pasa a ser el literal fijo `'bloque'`), `build-share-data.ts`
y el tipo `WorkoutShareData` (`share-types.ts:231`) intactos, `StrokedText.tsx` y `sticker-kit.ts`
(texto blanco + contorno negro fino del 02-09, reutilizados por el bloque nuevo), `CircularBrandLogo`,
`ShareWorkoutCta.tsx`, el host `SessionCompleteV3.tsx`, `CameraPrimer` (función interna de
`WorkoutShareComposer.tsx:1788`), `ComposerNotice` (`WorkoutShareComposer.tsx:983`), y el montaje
embebido/Modal con su propio `GestureHandlerRootView` (`WorkoutShareComposer.tsx:721-932`).

## Fuera de alcance

- Cualquier estilo alternativo al bloque único (no hay preset B).
- Stepper de tamaño u otro control accesible sin gesto (ver deuda anotada arriba).
- Cambios a `ShareCanvas`, captura, destinos, `build-share-data` o `WorkoutShareData`.
- Nueva build nativa: si `useFonts` en `_layout.tsx` no basta y hace falta un asset no importado
  hoy en `brand-fonts.ts`, el cambio deja de ser OTA y vuelve a planificarse aparte.
- Migración de datos históricos de PostHog: la serie `student_share_card_opened.card_kind` queda
  partida entre `'placa'` (histórico) y `'bloque'` (desde este cambio); no se retroetiqueta.

## Criterios de aceptación (medibles sobre la CAPTURA PNG 1080×1920)

- **AC-1** El PNG capturado contiene un único bloque de texto (sin fondo propio, sin marco) con,
  en este orden vertical: eyebrow «VOLUMEN TOTAL», cifra de kg, fila min/series/reps con sus tres
  labels, nombre del grupo muscular principal, footer (logo circular + nombre del coach en
  mayúsculas + «vía EVA»). Ningún otro sticker (fecha/racha/récords/set-list/QR/`@handle`) aparece.
- **AC-2** Todo el texto del bloque usa Inter en los tres pesos declarados (600/700/800), color
  blanco, con el mismo contorno negro fino de `sticker-kit.ts`; las cifras llevan `tabular-nums`.
- **AC-3** Arrastrar el bloque lo mueve sin parpadeo y queda clampado dentro del canvas (no sale del
  borde) tanto en preview como en el PNG final.
- **AC-4** Pellizcar el bloque lo escala hasta el tope de `maxScaleFor` (medido contra el tamaño
  real del sticker) sin que desaparezca ni se corte contra el borde — la misma regresión que motivó
  la re-verificación del 02-09 en `qa-ejecutor-share-0209/TASKS.md` Q5.
- **AC-5** Con «Sin foto», el bloque se lee sobre el fondo de marca; con foto clara y con foto
  oscura, el contorno negro mantiene la legibilidad (sin velo adicional).
- **AC-6** El coach sin logo propio muestra la inicial en el círculo (`CircularBrandLogo`, sin
  cambios) y el footer NO menciona ninguna marca EVA visible más allá de «vía EVA».
- **AC-7** Compartir a Stories/WhatsApp/Guardar/Más… funciona igual que antes (motor sin cambios);
  el link copiado a Stories lleva `&k=bloque` fijo.
- **AC-8** `student_share_card_opened` reporta `card_kind: 'bloque'`; `student_share_style_selected`
  ya no se dispara (el evento se elimina, no queda código muerto que lo emita).
- **AC-9** `pnpm --filter @eva/mobile exec tsc --noEmit` y los tests nuevos/conservados (ver
  [TASKS](TASKS.md)) pasan en verde.

## Riesgos

- **R1 · Registro de Inter en `_layout.tsx`.** Si Metro no resuelve los mismos módulos
  `@expo-google-fonts/inter` ya importados por `brand-fonts.ts` (por ejemplo si se referencian con
  nombres de export distintos), `useFonts` puede quedar colgado (`fontsLoaded` nunca `true`) y
  tumbar el arranque completo de la app, no solo Share. Verificar con `tsc` y arranque real antes
  de dar por hecho el OTA.
- **R2 · Analítica partida.** `student_share_card_opened.card_kind` cambia de dominio de valores
  (`'placa'|'heatmap'|...` → `'bloque'`) en medio de la serie histórica en PostHog — cualquier
  dashboard o funnel que filtre por `card_kind` viejo deja de sumar altas desde el corte. Anotado
  en `docs/status/MOBILE_PARITY.md`; no se resuelve con backfill.
- **R3 · Borrado de `MuscleBodySvg.tsx` y 9 stickers.** Si algún otro flujo importa alguno de estos
  módulos fuera de `share/` (no detectado en esta spec, pero no verificado con un grep repo-wide
  por el otro worker), el borrado rompe `tsc`. Gate obligatorio antes de cerrar.
- **R4 · `SharePresetId` como tipo.** Si `share-targets.ts` sigue tipando `presetId: SharePresetId`
  y `share-types.ts` deja de exportar ese tipo al borrar `share-presets.ts`, el archivo no compila;
  la opción más simple es que el caller pase el literal `'bloque'` tipado como `string` o que
  `SharePresetId` se reduzca a `'bloque'` en vez de desaparecer.
