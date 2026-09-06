---
status: in-progress
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# PLAN — Share Entreno: bloque único en Inter

Ver [SPEC](SPEC.md). Sin DDL, sin RLS, sin dependencias nuevas (Inter ya está en el binario 1.1.2
vía `apps/mobile/lib/brand-fonts.ts:92`). Todo el cambio es JS/TS ⇒ **OTA sobre el runtime 1.1.2**.

## Arquitectura: conserva / borra / nuevo

```text
CONSERVA (motor)
  apps/mobile/components/alumno/share/ShareCanvas.tsx           centro normalizado, LiveStickerSlot
  apps/mobile/components/alumno/share/share-types.ts            WorkoutShareData (:231), maxScaleFor (:108)
  apps/mobile/components/alumno/share/share-capture.ts          captura PNG 1080×1920 fija (:37,48-49)
  apps/mobile/components/alumno/share/share-targets.ts          destinos, copyInviteLink (:167) con &k= fijo
  apps/mobile/components/alumno/share/build-share-data.ts       adaptador de datos puro
  apps/mobile/components/alumno/share/stickers/StrokedText.tsx  contorno negro por copias apiladas
  apps/mobile/components/alumno/share/stickers/sticker-kit.ts   OUTLINE_COLOR, paleta
  apps/mobile/components/CircularBrandLogo.tsx                  logo circular del coach
  apps/mobile/components/alumno/share/ShareWorkoutCta.tsx       CTA que abre el composer
  apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx  host del CTA
  WorkoutShareComposer.tsx: GestureHandlerRootView (:721-932), ComposerNotice (:983), CameraPrimer (:1788)

BORRA
  apps/mobile/components/alumno/share/share-presets.ts          6 presets (reemplazado por share-layout.ts)
  apps/mobile/components/alumno/share/MuscleBodySvg.tsx         silueta anatómica (162 líneas)
  apps/mobile/components/alumno/share/stickers/{BrandFooterSticker,DateChipSticker,
    MuscleFigureSticker,QrSticker,RecordsBandSticker,SetlistSticker,StatsRowSticker,
    StreakChipSticker,VolumenHeroSticker}.tsx                    9 stickers de datos sueltos

NUEVO
  apps/mobile/components/alumno/share/share-layout.ts            SHARE_LAYOUT con el sticker único 'bloque'
  apps/mobile/components/alumno/share/stickers/StatsBlockSticker.tsx  pinta el bloque (usa StrokedText)
  apps/mobile/components/alumno/share/share-block.ts              helper puro blockLines(data): WorkoutShareData → líneas
  FONT.shareLabel / shareBold / shareValue en apps/mobile/lib/typography.ts
  registro de Inter_600SemiBold/700Bold/800ExtraBold en apps/mobile/app/_layout.tsx:299 (useFonts)
```

`WorkoutShareComposer.tsx` y `StickerGestureLayer.tsx` pierden las ramas de long-press/quitar,
stepper de tamaño y toggle de fondo transparente, pero conservan drag + pellizco (`maxScaleFor`
en `StickerGestureLayer.tsx:220`) sin tocar su aritmética.

## Tipografía y OTA

`share-block.ts` produce texto plano; `StatsBlockSticker.tsx` lo pinta con `FONT.shareLabel`
(Inter 600, eyebrow y labels DURACIÓN/SERIES/REPS), `FONT.shareBold` (Inter 700, músculo y nombre
del coach) y `FONT.shareValue` (Inter 800, cifra de kg y la fila min/series/reps; `tabular-nums`).
Estos tres roles son NUEVOS en `typography.ts` y apuntan a los mismos nombres de fuente
(`Inter_600SemiBold`, `Inter_700Bold`, `Inter_800ExtraBold`) que hay que registrar en `_layout.tsx`
junto al resto de `useFonts` (no en el mapa `brandDisplayFontMap`, que es el mecanismo white-label
y nunca debe alimentar este bloque). Como el asset ya se referencia desde
`apps/mobile/lib/brand-fonts.ts:92` (catálogo curado, key `'inter'`), Metro ya lo empaqueta en el
binario 1.1.2: registrar el mismo módulo bajo su nombre propio en un `useFonts` adicional no agrega
bytes nuevos al bundle nativo ⇒ el cambio es puramente JS y sale por OTA.

## Analítica

- Se elimina `student_share_style_selected` (y su único emisor, `WorkoutShareComposer.tsx:355`):
  ya no hay estilos entre los que elegir.
- `student_share_card_opened.card_kind` pasa de `DEFAULT_SHARE_PRESET_ID` (`'placa'`,
  `SessionCompleteV3.tsx:666`) al literal fijo `'bloque'`. Esto parte la serie histórica en
  PostHog (anotado en `MOBILE_PARITY.md` y como riesgo R2 en la SPEC): cualquier filtro por
  `card_kind` anterior deja de sumar altas desde el corte.

## Gates

```bash
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm exec vitest run tests/mobile/share-layout.test.ts tests/mobile/share-block-data.test.ts \
  tests/mobile/share-sticker-scale.test.ts tests/mobile/share-per-side.test.ts \
  tests/mobile/share-stroke-kit.test.ts tests/mobile/share-targets.test.ts tests/mobile/share-notices.test.ts
pnpm docs:check
```

Sin runner para `apps/mobile` en `vitest.config.ts` (mismo gotcha que `qa-ejecutor-share-0209`):
lo que se testea es lo que baja a módulos puros (`share-block.ts`, `share-layout.ts` como datos);
el resto es QA de device (checklist en [TASKS](TASKS.md)).

## Riesgos de ejecución

- **Un solo worker toca `apps/mobile`** en este worktree; docs no corre `tsc` ni `vitest` (otro
  proceso lo hace) — este PLAN documenta el gate esperado, no su resultado.
- Ver riesgos R1–R4 de la [SPEC](SPEC.md) (registro de fuentes, analítica partida, borrado de
  módulos huérfanos, tipo `SharePresetId`).
