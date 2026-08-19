---
status: draft
owner: product-engineering
last_verified: "2026-08-19"
canonical: false
---

# PLAN — Compartir Entreno

Arquitectura y decisiones técnicas. El QUÉ está en [SPEC.md](./SPEC.md); el orden ejecutable en
[TASKS.md](./TASKS.md).

## Punto de partida (verificado contra código 19-08)

El ~80% de la infra existe:

- `apps/mobile/components/ShareCard.tsx` (731 líneas): motor componer-vista→imagen con
  `react-native-view-shot` (captureRef, 1080×1350), marca del coach, footer `«marca» · via EVA`.
  Lo usa el share de Records. **Se extiende, no se reescribe.**
- `apps/mobile/components/alumno/workout/WorkoutSummaryOverlay.tsx`: ya calcula
  `muscleGroupsToRegionIntensity`, volumen, duración, 1RM Epley, confetti, `deriveSportTokens`,
  y ya importa la familia `ShareCard*`.
- `packages/workout-engine/body-anatomy.ts` + `MuscleMapSvg.tsx`: los 159 paths anatómicos
  reales con tiers de alpha — la silueta del card ES este componente.
- Gesture Handler + Reanimated ya en el stack (drag de stickers), expo-camera +
  expo-image-picker ya en plugins (foto), `CircularBrandLogo` existe.

## Bugs pre-existentes del motor — SE ARREGLAN PRIMERO (F0)

1. **`ShareCard.tsx:590` iOS**: `Share.share({ url: shareUri, message: shareMessage ?? '' })` —
   con `url` Y `message` juntos, WhatsApp/Instagram toman el TEXTO y descartan la imagen.
   Fix: compartir SOLO el archivo; todo texto va quemado en el PNG. (El link de invitación viaja
   por portapapeles, no por `message`.)
2. **Contrato `onShared` Android**: `Sharing.shareAsync` devuelve `Promise<void>` — no distingue
   compartido de cancelado ⇒ sobre-cuenta. Fix: renombrar la semántica a `onShareSheetOpened`
   (o equivalente) y que la instrumentación cuente «intentos», no «éxitos»; el éxito real lo
   mide el funnel de atribución (`?ref=`).

Estos dos fixes van ANTES de cualquier feature nueva: la instrumentación de v1 se construye
encima del contrato corregido.

## Arquitectura del feature

### Composición por capas (nuevo, `apps/mobile/components/alumno/share/`)

```
WorkoutShareComposer (pantalla/modal, 3 pasos: Editor → Acomodar → Compartir)
 ├─ ShareCanvas (la vista 1080×1920 u 1080×1350 que captura view-shot)
 │   ├─ BackgroundLayer     foto | fondo de marca | TRANSPARENTE (sticker mode)
 │   ├─ StickerLayer × N    cada elemento visible = un sticker posicionable
 │   │    (VolumenHero, StatsRow, MuscleFigure front/back, RecordsBand,
 │   │     ExerciseSetlist, BrandFooter[logo+@handle], DateChip, StreakChip, QR)
 │   └─ (sin chrome de edición — la captura sale limpia)
 ├─ PresetEngine            6 presets = { layout defaults por sticker, fondo, aspect }
 ├─ StickerGestureLayer     wrappers Gesture Handler/Reanimated SOLO en modo Acomodar
 └─ ShareTargets            botones Stories · WhatsApp · Guardar · Más…
```

- **Preset = datos, no componente**: cada preset es un objeto `{ stickers: {id: {x,y,scale,
  visible}}, background, aspect }`. Cambiar preset = aplicar sus defaults (toggles de contenido
  se conservan, posiciones se resetean — decisión del owner).
- **Drag**: cada sticker envuelto en `GestureDetector` con `translateX/Y` + `scale` en shared
  values; guías de alineación (snap a centro H/V con haptic), long-press = quitar (equivale a
  toggle off), slider de tamaño para el seleccionado. view-shot captura el resultado igual
  porque los transforms son estilo de vista.
- **Captura**: `captureRef` con `result: 'tmpfile'`, formato PNG. Modo transparente: el
  BackgroundLayer se omite y el contenedor va `backgroundColor: 'transparent'` — PNG con alpha
  para pegarlo como sticker DENTRO de Instagram sobre la propia foto del usuario.
- **Póster (segmentación de sujeto)**: iOS `VisionKit`/`Vision` (subject lifting), Android
  ML Kit subject segmentation — ambos vía librería o módulo nativo. Si no disponible en el
  device ⇒ degradación: número DELANTE con alpha 0.14. Es el preset más caro; se implementa
  al final de F3 y si estrangula el timeline se lanza con la degradación como comportamiento
  único (el preset sigue existiendo).

### Targets de share (react-native-share v12.3.1)

- Dependencia nueva `react-native-share` (TurboModule, plugin de config Expo) — **binario**.
- Config plugin: `["react-native-share", {"ios": ["instagram-stories","facebook-stories",
  "instagram","whatsapp"], "android": ["com.instagram.android","com.facebook.katana",
  "com.whatsapp","com.zhiliaoapp.musically"]}]` (genera LSApplicationQueriesSchemes + `<queries>`).
- **Instagram Stories directo**: `Share.shareSingle({ social: Social.InstagramStories,
  backgroundImage|stickerImage, appId: FACEBOOK_APP_ID })`. En modo transparente se pasa como
  `stickerImage` (el usuario elige su fondo en IG); en modo normal como `backgroundImage`.
- **Facebook Stories**: mismo patrón con `Social.FacebookStories`.
- **WhatsApp**: `shareSingle({ social: Social.Whatsapp, url: file })` con fallback a hoja nativa.
- **Guardar**: `expo-media-library` (`NSPhotoLibraryAddUsageDescription` — binario) — única
  variante donde el QR está disponible.
- **Más…**: hoja nativa con SOLO el archivo (fix F0). Cubre TikTok/Telegram/X/todo.
- `FACEBOOK_APP_ID`: constante de config (app.json `extra` + EXPO_PUBLIC). **Bloqueante: trámite
  del owner.** Sin App ID los botones Stories degradan a la hoja nativa (guard en runtime) —
  el código no revienta si el ID falta.

### CTA del resumen (rework de `WorkoutSummaryOverlay`/`SessionCompleteV3`)

Secuencia: confetti/logro primero → CTA entra con settle ~1,2-1,8 s después (spring sutil).
Glow pulsante (`withRepeat` sombra/opacity) + shimmer que cruza SOLO 2 pasadas (no infinito —
lo infinito cansa y parece ad) + fila de iconos de redes + mini-thumbnail del card real
(pre-render del preset default en miniatura, mismo ShareCanvas a escala). Respeta
reduced-motion (sin shimmer ni glow animado).

### DDL (aditiva en LIVE, protocolo AGENTS.md: tx-rollback + EXPLAIN antes, advisors después)

```sql
-- 1) handle del coach (user-editable ⇒ column-level grant obligatorio)
alter table public.coaches add column instagram_handle text
  check (instagram_handle ~ '^[a-zA-Z0-9._]{1,30}$');
grant update (instagram_handle) on public.coaches to authenticated;

-- 2) atribución en clients (escribe el server en el alta; sin grant a authenticated)
alter table public.clients
  add column referred_by_client_id uuid references public.clients(id) on delete set null,
  add column referral_source text,      -- 'share_card'
  add column referral_card_kind text;   -- preset del card que trajo el alta
```

RLS existente cubre (columnas nuevas heredan políticas de fila). `database.types.ts` se
regenera. Nada destructivo, nada de `db push` ciego.

### Web (atribución + Mi Marca)

- `apps/web` Mi Marca: input `@handle` con validación espejo del CHECK (Zod), guardado por la
  ruta existente de branding.
- `/join/[código]` (`join.actions.ts:78`): lee `?ref&src&k` de searchParams, persiste en el
  insert de `clients` (server-side, validando que `ref` sea un client del MISMO coach — anti
  cross-tenant). El link se arma en el móvil: `https://www.eva-app.cl/join/{codigo}?ref={client_
  short_id}&src=share_card&k={preset}`.

### Analytics (PostHog) — el móvil NO tiene SDK

Decisión: **agregar `posthog-react-native` al binario 1.1.2** (ya vamos a binario igual; es la
única forma de medir el funnel del share donde ocurre). Alcance mínimo: SOLO estos eventos, sin
autocapture, sin session replay, `person_profiles: identified_only`.

Taxonomía (snake_case objeto_accion; SIN datos de salud — 21.719):

| Evento | Props |
|---|---|
| `student_share_card_opened` | `card_kind`, `surface` ('workout_summary') |
| `student_share_style_selected` | `style` |
| `student_share_photo_attached` | `photo_source` ('camera'\|'gallery'\|'none') |
| `student_share_target_selected` | `target` ('ig_stories'\|'fb_stories'\|'whatsapp'\|'save'\|'sheet') |
| `coach_client_referred` (web, server) | `referred_by_client_id`, `card_kind`, `days_since_share`* |

\* `days_since_share` se aproxima desde el timestamp del link si se incluye; si complica, se
omite en v1 (el join DDL ya da la verdad).

### Privacidad

Foto y card se componen on-device; `tmpfile` de view-shot se limpia tras compartir. La foto
jamás toca Supabase. Eventos sin kg/músculos/ejercicios. Permiso de cámara con pantalla
pre-permiso patrón «Continuar» (regla del 4to rechazo iOS).

## Release: binario 1.1.2 (decisión owner: todo junto)

Ya esperando en el árbol: deep links www + backgroundColor + expo-system-ui. Se suman:
react-native-share plugin, `NSPhotoLibraryAddUsageDescription`, posthog-react-native,
FACEBOOK_APP_ID. Bump `version` 1.1.2 (política appVersion ⇒ canal OTA nuevo — los usuarios de
1.1.1 no reciben nada de esto por OTA, correcto porque hay módulos nativos). Build por
GH Actions `mobile-build.yml` con submit_ios + submit_android. **Gate previo: 1.1.1 aprobada
por Apple** (en revisión ahora) — no encolar 1.1.2 antes.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| App ID no llega a tiempo | Guard runtime: Stories degrada a hoja nativa; el binario NO se bloquea |
| Segmentación Póster cara/frágil | Degradación número-adelante es el default si no hay módulo confiable |
| view-shot + transforms Reanimated | Capturar tras `runOnJS` settle; QA en Android low-end (MIUI) |
| Hermes sin `crypto` | ids de share con generador propio ya existente (gotcha 17-08) |
| Drag rompe capture en modo transparente | ShareCanvas separado del chrome de edición; captura de un ref limpio |
| 1.1.1 se atrasa en revisión | 1.1.2 espera; el desarrollo avanza en rama igual |

## Gates (ACUMULADOS — CPU bloqueada por el owner, correr solo cuando libere)

Por tanda: `pnpm --filter @eva/mobile exec tsc --noEmit` + tests afectados. Antes de push:
suite completa una vez + `pnpm lint` + `pnpm docs:check` (este documento). QA device por cable
(adb+Metro) para drag/captura/targets; QA en iPhone para Stories directo y transparente.
