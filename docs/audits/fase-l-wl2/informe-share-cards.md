# Informe — Tarjetas compartibles con marca del coach: RACHA + RESUMEN MENSUAL + link de invitacion

Fecha: 2026-07-04 · Rama: `feat/redesign-eva-design-system` · App: `apps/web`
Autor: investigador tecnico (solo informe, cero cambios de producto)

Objetivo: extender la infraestructura de share-cards existente a dos plantillas nuevas
(**Racha** y **Resumen mensual**) y **embeber el link de invitacion del coach** (codigo +
QR) en cada tarjeta que se comparte.

---

## Estado actual (archivos:lineas concretos)

### Inventario de tarjetas que existen HOY y por que via

Hay **dos vias tecnicas conviviendo** para generar tarjetas 1080x1350 (formato feed/story):

| Tarjeta | Via | Archivo:simbolo | Entrada (UI) |
|---|---|---|---|
| Record personal (post-sesion) | **Canvas cliente** (zero-server) | `apps/web/src/lib/workout-pr-card-canvas.ts:177` → `renderWorkoutPRCardToBlob()` | `.../workout/[planId]/PRShareCardModal.tsx` disparado desde `WorkoutSummaryOverlay.tsx:199` (`prCard` state) |
| Record personal (dashboard/coach) | **Servidor** `ImageResponse` (next/og / satori) | `apps/web/src/app/api/pr-card/route.tsx:146` → `GET` | `apps/web/src/components/shared/SharePRButton.tsx:52` (fetch a `/api/pr-card`), usado en records/PRDetailSheet y flujo coach (`ClientProfileDashboard.tsx`) |
| Progreso del alumno (entrenos + racha) | **Canvas cliente** (zero-server) | `apps/web/src/lib/workout-pr-card-canvas.ts:330` → `renderProgressCardToBlob()` | `.../perfil/_components/ProgressShareCardModal.tsx`, disparado desde `ProfileClient.tsx:216` (boton "Comparti tu logro") + montado en `ProfileClient.tsx:347` |

Conclusion del inventario: **la tarjeta de record esta DUPLICADA** (una version canvas-cliente
y una version servidor-satori, con la MISMA estetica pero mantenidas por separado). La tarjeta de
progreso solo existe en canvas-cliente. Las **entradas iniciadas por el alumno** (post-sesion y
perfil) usan **canvas-cliente**; la unica que usa servidor es el flujo donde **el coach** comparte
el record de un alumno suyo (necesita auth server-side porque el DOM del coach no tiene el
white-label del alumno — ver `resolveBrand()` en `route.tsx:101`).

### Como se resuelve la MARCA (white-label) en cada via

- **Canvas cliente** (`workout-pr-card-canvas.ts:58` `readShareCardBrand()`): lee del DOM del
  layout `/c`:
  - `data-brand-name` y `data-logo-dark` (fijados en `apps/web/src/app/c/[coach_slug]/layout.tsx:325-326`).
  - CSS vars `--theme-primary` / `--sport-500` (acento) via `getComputedStyle`.
  - Fuente display real (next/font hashea el nombre) via probe de `.font-display`.
  - **El gating de tier ya viene aplicado por el layout**: si el coach es free, `logoUrlDark` = `''`
    y el color cae a `SYSTEM_PRIMARY_COLOR` (`layout.tsx:170-187`). La canvas **no re-gatea nada**.
- **Servidor** (`route.tsx:101` `resolveBrand()`): resuelve con service-role por `clientId`
  (team pool → `teams`; si no → `coaches`), aplicando `isBrandingAllowed(tier)` de `@eva/tiers`.
  Rasteriza logo solo si es http(s) no-svg/webp/avif (`lib/records/pr-card.ts:10` `rasterLogo`).

### Compartir el archivo (Web Share API) — helper unico ya existe

`apps/web/src/lib/web-share.ts`: `isWebShareSupported()`, `canShareFiles(files)`,
`share(data)`. Los dos modales cliente ya lo usan (`PRShareCardModal.tsx:8`,
`ProgressShareCardModal.tsx:8`) con fallback a descarga directa del PNG. `SharePRButton.tsx:61`
implementa el mismo patron inline (`navigator.canShare({files})` → `navigator.share` → fallback
`<a download>`).

### Datos disponibles

**Racha (streak):**
- `getDashboardStreak(clientId)` — `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:28`.
- RPC `get_client_current_streak(p_client_id)` — `supabase/migrations/20260616165712_fix_idor_client_streak_lastworkout_guard.sql:12`.
  - Semantica: **dias consecutivos con actividad** (union de `workout_logs` por `DATE(logged_at)`
    + `nutrition_meal_logs.is_completed` por `log_date`), tope 730 dias. Rompe si el ultimo dia
    activo es anterior a ayer. Guard IDOR 3-vias (self / coach dueno / pool) con bypass service-role.
  - **Ya llega al alumno**: la perfil page (`perfil/page.tsx:33`) lo pasa a `ProfileClient` como
    `streak`, y de ahi a `ProgressShareCardModal` (`data.streak`).

**Resumen mensual (sesiones / volumen / PRs del mes):**
- **Sesiones (dias entrenados)**: `getWorkoutHistoryDayCounts(clientId, daysBack)` —
  `dashboard.queries.ts:217` → RPC `get_client_workout_day_counts(p_client_id, p_days_back)`
  (`supabase/migrations/20260612051000_rpc_client_workout_day_counts.sql:6`). Devuelve `{day, sets}`
  por dia (zona America/Santiago). Sesiones del mes = filtrar dias al mes calendario y contar.
- **Volumen (tonelaje)**: RPC `get_client_daily_tonnage(p_client_id, p_max_days DEFAULT 21)` —
  `supabase/migrations/20260612052000_rpc_client_progress_aggregations.sql:200`. Devuelve
  `{day, tonnage, sessions, moving_avg}` (tonnage = `sum(weight_kg*reps_done)` por dia, Santiago).
  **Ya esta GRANT a `authenticated` con el mismo guard 3-vias** → el alumno puede llamarlo para su
  propio `clientId`. Hoy solo se consume del lado coach (`services/client/client-detail.service.ts`),
  **no** hay un query wrapper del lado alumno. Volumen del mes = sumar `tonnage` de los dias del mes
  (pasar `p_max_days` ≈ 31).
- **PRs del mes**: **GAP**. Lo mas cercano:
  - `getPersonalRecords(clientId)` — `dashboard.queries.ts:289` — ventana 14 dias, flag `fresh`
    (ultimas 24h), devuelve holders del max historico (no cuenta "cuantos PRs este mes").
  - `get_client_exercise_prs(p_client_id)` — all-time max por ejercicio (no month-scoped).
  - `get_client_weekly_prs(p_client_id)` — week-scoped (no month).
  - No existe un conteo de "records nuevos logrados en el mes". Ver Diseno §PRs del mes.
- **Total entrenos historicos** (para la card de progreso existente): perfil usa `dayCounts.length`
  con ventana 365d (`perfil/page.tsx:34,57`).

### Link de invitacion del coach — que existe

- **Codigo de invitacion**: `coaches.invite_code` (5 chars, alfabeto sin O/0/I/1),
  `apps/web/src/lib/coach/invite-code.ts` (`generateInviteCode`, `isValidInviteCode`,
  `INVITE_CODE_PATTERN`, `coachIdentifierColumn`). Es el **identificador primario del coach**
  (memoria del proyecto) y sirve como slug publico: `/c/[invite_code]` resuelve via
  `coachIdentifierColumn` (proxy `proxy.ts:733`).
- **Funnel de registro**: `apps/web/src/app/join/[invite_code]/page.tsx` (JoinForm "Crear tu
  cuenta"). `_lib/resolve-invite.ts:55` `resolveInvite()` resuelve **scope desde el codigo**:
  `organization_members.invite_code` (enterprise) → `teams.invite_code` (pool) →
  `coaches.invite_code` (standalone). Es el destino correcto para "sumar un alumno nuevo bajo el
  coach", scope-aware para las tres superficies.
- **URL builder**: `apps/web/src/lib/coach/public-identifier.ts` (`getCoachPublicIdentifier`,
  `buildCoachStudentUrl`). Patron existente para armar `/c/[identifier]`.
- **QR ya en el codebase**: `qrcode.react` `^4.2.0` (root `package.json:65`). Uso vivo:
  `apps/web/src/app/org/[slug]/coaches/_components/CoachQRButton.tsx:2,47` (`QRCodeSVG`,
  `joinUrl = ${siteUrl}/join/${inviteCode}`). Confirma la convencion de URL de invitacion.
- **Plumbing faltante**: el layout `/c` y el proxy **NO** exponen hoy el `invite_code` del coach al
  contexto del alumno. El proxy setea `x-coach-slug` (slug legacy) pero **no** `x-coach-invite-code`
  (ver `proxy.ts:760-798`). El `coach_slug` del URL puede ser un slug legacy (no el codigo), asi que
  **no** se puede construir `/join/{coach_slug}` de forma confiable sin plumbing.
- **Login del alumno NO ofrece registro**: `apps/web/src/app/c/[coach_slug]/login` no linkea a
  `/join` ni a "crear cuenta" (verificado). Un amigo del alumno que caiga en `/c/{slug}` sin sesion
  termina en login sin salida de registro → **el destino de invitacion debe ser `/join/{codigo}`**,
  no `/c/{slug}`.

---

## Investigacion web 2026 (fuentes)

**Web Share API nivel 2 (compartir archivos) — soporte 2026.**
El metodo `navigator.canShare({files})` valida si `navigator.share()` con archivos tendria exito y
devuelve `false` si el motor no soporta compartir archivos; es la deteccion correcta antes de
intentar. Web Share esta implementado en todos los motores principales; el share de **archivos**
(nivel 2) esta disponible en Safari iOS (share desde iOS 12.2; archivos desde iOS 15) y Chrome
Android, con Firefox/Opera sin planes en desktop. Conclusion practica: **el patron actual del
codebase (`canShareFiles` → `share` → fallback descarga) es exactamente la recomendacion 2026**; las
cards nuevas deben reutilizar `lib/web-share.ts` sin cambios.
Fuentes: [MDN Navigator.canShare()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare),
[web.dev — Web Share API](https://web.dev/articles/web-share),
[Can I use — Web Share](https://caniuse.com/web-share),
[W3C Web Share](https://www.w3.org/TR/web-share/).

**Share cards fitness 2026 (Strava, Hevy, WHOOP).**
Strava (mayo 2026) lanzo **cinco nuevos "strength shareables"** incluyendo mapas musculares
transparentes y **stickers de streak** en la pestana Progress ("pick your streak, pick your design,
share it"), ademas de **Monthly Recap** (You > Progress) y "Your Year in Sport". El feed card de
fuerza muestra **volumen total** y un mapa muscular auto-poblado. Patron dominante: metrica hero
grande + racha como objeto compartible propio + recap mensual/anual. Esto valida las dos plantillas
pedidas (Racha como card dedicada con la racha de hero; Resumen mensual estilo "recap" con
sesiones + volumen + PRs).
Fuentes: [Strava — Monthly Recap](https://support.strava.com/hc/en-us/articles/360057807412-Monthly-Recap),
[Strava press — strength shareables + muscle maps](https://press.strava.com/articles/strava-overhauls-strength-experience-with-expanded-partner-ecosystem-new-workout-log-and-muscle-maps),
[WHOOP — 2026 What's New](https://www.whoop.com/us/en/thelocker/2026-whats-new/).

**QR en cards compartibles + loop de referidos (2026).**
Los programas de referido fitness ponen un **QR con codigo personal** en la card: el amigo escanea,
se registra, y ambos ganan — 10-20% de altas nuevas vienen por referido y el referido tiene ~25%
mas LTV. Especificaciones tecnicas para que el QR sea escaneable:
- **Contraste minimo 4:1** (ideal negro sobre blanco ≈ 21:1). En una card de fondo oscuro, el QR
  **debe ir dentro de un recuadro blanco** con quiet-zone (margen) — nunca QR claro sobre el fondo dark.
- **Tamano**: ratio ~10:1 (distancia:tamano). En una card de 1080px de ancho vista/foto en un telefono,
  un QR de ~220-260px con quiet-zone escanea sin problema desde otra pantalla.
- Un **call-to-action de pocas palabras** junto al QR sube los escaneos ~30% ("Escanea para entrenar con {marca}").
Fuentes: [QR Code Design Best Practices (ISO 18004) — QRLynx](https://qrlynx.com/blog/qr-code-design-best-practices),
[QR Code Color Contrast Guidelines — Pageloot](https://pageloot.com/blog/qr-code-color-contrast-best-practices/),
[QR Code Size Guide 2026 — QR Insights](https://www.qr-insights.com/blog/2026-02-24-qr-code-size-guide-minimum-dimensions),
[Gym referral programs — WodGuru](https://wod.guru/blog/gym-referral-program/).

---

## Diseno propuesto (arquitectura por capas, componentes, datos)

### Decision 1 — Via canonica para las cards NUEVAS: **canvas cliente**

Recomendacion: **generar Racha y Resumen mensual con la via canvas-cliente**
(`workout-pr-card-canvas.ts`), consistente con `renderProgressCardToBlob` / `ProgressShareCardModal`.
Razones:
1. Ambas cards son **iniciadas por el alumno** desde su propia superficie (perfil / dashboard), donde
   `readShareCardBrand()` ya tiene el white-label correcto en el DOM (ya tier-gateado por el layout).
2. Zero-server, instantaneo, funciona offline (PWA), sin round-trip ni auth extra, sin cuota de
   render/imagen (recordar el incidente de Image Transformations quota — memoria del proyecto).
3. Las fuentes son **locales** (next/font ya cargado) → no depende de Google Fonts server-side ni de
   CORS de fuentes. El QR se dibuja local (ver Decision 3) → sin taint del canvas.
4. Reusa el helper `web-share.ts` tal cual.

La via **servidor `/api/pr-card`** se mantiene **solo** para el flujo **coach-comparte-record-de-alumno**
(su DOM no tiene el white-label del alumno; necesita `resolveBrand` server-side + `assertCoachClientReadAccess`).
No se recomienda portar Racha/Mensual a servidor. (Consolidar la duplicacion de la card de record en una
sola via queda como deuda tecnica anotada, fuera de este scope.)

### Decision 2 — Footer compartido con invitacion en TODAS las cards

Extraer el bloque de footer white-label (hoy repetido en `renderWorkoutPRCardToBlob:298-315` y
`renderProgressCardToBlob:456-473`) a un helper unico `drawBrandFooter(ctx, brand, opts)` dentro de
`workout-pr-card-canvas.ts`, que dibuje:
- Linea divisoria + `brand.brandName.toUpperCase()` a la izquierda (como hoy).
- **Recuadro blanco redondeado (~230px) con el QR** del `joinUrl` a la derecha, con quiet-zone.
- Debajo/al lado del QR: micro-CTA + codigo legible: `Escanea para entrenar con {marca}` y el codigo
  `AB3KP` (o el host `eva-app.cl/join/AB3KP`) en texto, por si comparten screenshot recortado.
- Mantener `vía EVA` discreto (o reemplazar por el CTA segun decision de marca — ver Preguntas CEO).

Aplicar `drawBrandFooter` a las 4 render functions (record, progreso, racha, mensual) → la invitacion
queda en **cada share** (requisito del tema). El PNG resultante es el artefacto compartido; el QR es
la unica parte "linkeable" (Web Share de imagen no lleva URL clickeable en la mayoria de targets).

### Decision 3 — Rasterizar el QR sin tainting ni servidor

Opciones evaluadas:
- (a) **Recomendada**: agregar dependencia `qrcode` (browser, ~pocos KB, sin postinstall → no requiere
  `allowBuilds`), usar `await QRCode.toDataURL(joinUrl, {margin, color:{dark:'#0B0E13',light:'#FFFFFF'}})`
  → `loadImage(dataUrl)` → `drawImage` en el recuadro blanco. Las imagenes `data:` **no tintan** el
  canvas (no son cross-origin) → `toBlob()` sigue funcionando. Funcion pura, testeable.
- (b) Reusar `qrcode.react` (ya dep) montando un `QRCodeCanvas` offscreen y copiando su canvas — mas
  hacky (requiere React root detachado). Solo si se quiere evitar la nueva dep.

Recomendacion: (a) `qrcode` + `@types/qrcode` en `apps/web`. Registrar en `pnpm-workspace.yaml` solo
si pnpm reporta build script (no lo tiene).

### Decision 4 — Plumbing del `invite_code` al contexto del alumno (canvas)

Para armar `joinUrl = ${NEXT_PUBLIC_SITE_URL}/join/{codigo}` en el cliente hace falta el **codigo real**
(el `coach_slug` del URL puede ser slug legacy). Plan (aditivo, sin romper nada):

Capa proxy (`apps/web/src/proxy.ts`):
- Standalone (bloque ~`proxy.ts:733-798`): agregar `invite_code` al `select` del coach y
  `h.set('x-coach-invite-code', coach.invite_code ?? '')`.
- Team (`proxy.ts:601-618`): `tRequestHeaders.set('x-coach-invite-code', tStr(tCtx.invite_code))`
  (el codigo del team = su join code).
- Enterprise (`proxy.ts:501-514`): el invite es por-member (no un unico codigo) → dejar
  `x-coach-invite-code` vacio; la card cae al fallback `/c/{coach_slug}` (o sin QR). Enterprise esta
  archivado comercialmente → prioridad baja.

Capa layout (`apps/web/src/app/c/[coach_slug]/layout.tsx:321-327`):
- Leer `headersList.get('x-coach-invite-code')` y emitir `data-invite-code={inviteCode || undefined}`
  en el mismo wrapper que ya lleva `data-brand-name`.

Capa lib (`workout-pr-card-canvas.ts`):
- Extender `ShareCardBrand` con `inviteCode: string | null` e `inviteUrl: string | null`.
- En `readShareCardBrand()`: leer `data-invite-code`; construir
  `inviteUrl = code ? `${SITE_URL}/join/${code}` : `${SITE_URL}/c/${coachSlug}``
  (fallback al identificador publico del URL leyendo `data-coach-slug`, que ya existe en `layout.tsx:324`).
  `SITE_URL` = `process.env.NEXT_PUBLIC_SITE_URL` (build-time inlined).

**Fallback MVP sin plumbing** (si se quiere shippear cards antes que el plumbing): pasar el
`coach_slug`/`base` (ya disponible como prop en `perfil/page.tsx` y en el arbol de workout) al modal y
usar `${SITE_URL}${base}`. Landea en la app publica del coach (login), no en el funnel de registro —
peor conversion, pero cero cambios de proxy/layout. Recomendado solo como puente.

### Decision 5 — Datos y capas para las cards nuevas (Clean Architecture)

**Racha (card dedicada):**
- Datos: ya disponibles (`streak`, `brandName`). En perfil se pasa igual que hoy a un nuevo modal.
- Nuevo tipo `StreakCardData { fullName; streak; brandName? }` y
  `renderStreakCardToBlob(data, brand)` en `workout-pr-card-canvas.ts` (hero = numero de racha grande,
  motivo flama/ember `--ember-500`, eyebrow "RACHA", pill "dias seguidos"). Reusa `drawBrandFooter`.
- Modal `StreakShareCardModal.tsx` (hermano de `ProgressShareCardModal`, misma UX).
- Entrada: en `ProfileClient.tsx`, o bien un segundo boton, o convertir el actual "Comparti tu logro"
  en un selector de plantilla (Progreso / Racha / Mensual) — ver Preguntas CEO.

**Resumen mensual (recap):**
- Nuevo `_data` del lado alumno. Sugerido: `perfil/_data/monthly-recap.queries.ts` con
  `getMonthlyRecap(clientId)` (`React.cache`) que respeta la capa
  `_data → services → repository/RPC`:
  - Sesiones del mes: `get_client_workout_day_counts(clientId, 31)` → filtrar `day` al mes calendario
    Santiago → contar dias.
  - Volumen del mes (kg): `get_client_daily_tonnage(clientId, 31)` → sumar `tonnage` de los dias del mes.
    (Idealmente encapsular la llamada en un metodo de servicio, p.ej.
    `services/client/*` o un `progress.service`, en vez de RPC directo desde `_data` — respetar
    "nunca `_data` → Supabase directo". Hoy el patron dashboard llama `supabase.rpc` desde `_data`;
    seguir el patron vigente o introducir el service, ver Riesgos.)
  - PRs del mes: ver siguiente.
- Nuevo tipo `MonthlySummaryCardData { fullName; monthLabel; sessions; volumeKg; prCount?; brandName? }`
  y `renderMonthlySummaryCardToBlob(data, brand)` (layout tipo grid: 3 stat-tiles — Sesiones /
  Volumen / PRs — estilo Wrapped/recap; eyebrow "RESUMEN DE {MES}"). Reusa `drawBrandFooter`.
- Modal `MonthlySummaryShareCardModal.tsx`.
- Entrada natural: dashboard del alumno (widget de fin de mes) o perfil. Ver Preguntas CEO.

**PRs del mes (el unico GAP de datos):**
- Opcion A (aditiva, recomendada si se quiere el conteo exacto): nueva RPC
  `get_client_month_pr_count(p_client_id, p_from date, p_to date)` en una migracion nueva
  (`CREATE OR REPLACE`, forward-only, idempotente), con el **mismo guard 3-vias** de los otros RPCs y
  `GRANT EXECUTE ... TO authenticated, service_role` (los RPC no requieren column-grants; sí el
  protocolo de validacion prod: snapshot + advisors + tx-rollback, por CLAUDE.md). Cuenta ejercicios
  cuyo max de peso del mes supero su max historico previo al mes (misma semantica de milestone que
  `getExercisePRHistory`/`reducePrFromRows`).
- Opcion B (sin DB): derivar client-side desde `get_client_strength_series` (ya devuelve day-best por
  ejercicio) detectando por-ejercicio el primer dia del mes en que se supero el max previo. Mas logica
  en cliente; peso de datos moderado.
- Opcion C (MVP): **omitir PRs** en la primera version del recap (Sesiones + Volumen + Racha) y sumar
  el conteo despues. Menor riesgo, entrega rapida.

### Estructura de archivos resultante (resumen)

```
apps/web/src/lib/workout-pr-card-canvas.ts        (+ drawBrandFooter, + renderStreakCardToBlob,
                                                    + renderMonthlySummaryCardToBlob, + tipos,
                                                    ShareCardBrand.inviteUrl/inviteCode,
                                                    readShareCardBrand lee data-invite-code + data-coach-slug)
apps/web/src/lib/qr.ts (nuevo)                     (buildJoinQrDataUrl(joinUrl) via `qrcode`, pura)
apps/web/src/app/c/[coach_slug]/perfil/_components/
  StreakShareCardModal.tsx (nuevo)
  MonthlySummaryShareCardModal.tsx (nuevo)
  ProfileClient.tsx (editar: entradas / selector)
apps/web/src/app/c/[coach_slug]/perfil/_data/monthly-recap.queries.ts (nuevo)
apps/web/src/app/c/[coach_slug]/perfil/page.tsx (editar: fetch recap si la entrada vive en perfil)
apps/web/src/app/c/[coach_slug]/layout.tsx (editar: data-invite-code)
apps/web/src/proxy.ts (editar: x-coach-invite-code en standalone + team)
supabase/migrations/<ts>_rpc_client_month_pr_count.sql (nuevo, SOLO si Opcion A)
```

---

## Tareas atomicas estimadas (S/M/L)

Plumbing / infra transversal:
1. **[S]** Proxy: `x-coach-invite-code` en bloque standalone (`proxy.ts:733-798`) — agregar
   `invite_code` al select + header.
2. **[S]** Proxy: `x-coach-invite-code` en bloque team (`proxy.ts:601-618`) desde `tCtx.invite_code`
   (verificar que el contexto team ya trae `invite_code`; si no, agregarlo a su query fuente).
3. **[S]** Layout `/c`: emitir `data-invite-code` (`layout.tsx:321-327`).
4. **[S]** `ShareCardBrand` + `readShareCardBrand()`: agregar `inviteCode`/`inviteUrl`, leer
   `data-invite-code` + fallback `data-coach-slug`, usar `NEXT_PUBLIC_SITE_URL`.
5. **[M]** Nueva lib `lib/qr.ts` + dependencia `qrcode`/`@types/qrcode` (pnpm), funcion pura
   `buildJoinQrDataUrl` + test de humo.

Footer + cards:
6. **[M]** Refactor `drawBrandFooter(ctx, brand, opts)` en `workout-pr-card-canvas.ts` (extraer de las
   dos render functions actuales, agregar recuadro blanco + QR + micro-CTA + codigo legible).
7. **[S]** Aplicar `drawBrandFooter` a `renderWorkoutPRCardToBlob` y `renderProgressCardToBlob`
   (invitacion en las cards existentes tambien).
8. **[M]** `renderStreakCardToBlob` + tipo `StreakCardData` (hero racha, motivo ember, eyebrow).
9. **[M]** `renderMonthlySummaryCardToBlob` + tipo `MonthlySummaryCardData` (grid de 3 stat-tiles).

Modales / UI:
10. **[S]** `StreakShareCardModal.tsx` (copia de `ProgressShareCardModal`, texto/emoji distintos).
11. **[S]** `MonthlySummaryShareCardModal.tsx` (idem).
12. **[M]** Entradas en `ProfileClient.tsx`: selector de plantilla (Progreso/Racha/Mensual) o botones
    separados (definir con CEO); montar los nuevos modales.

Datos mensuales:
13. **[M]** `perfil/_data/monthly-recap.queries.ts` `getMonthlyRecap()` (sesiones via
    `get_client_workout_day_counts`, volumen via `get_client_daily_tonnage`, filtrado a mes Santiago);
    wire en `page.tsx` si la entrada vive en perfil.
14. **[M/L]** PRs del mes — elegir Opcion A/B/C. Si **A**: migracion RPC aditiva + guard 3-vias +
    GRANT + protocolo de validacion prod (snapshot/advisors/tx-rollback) — **L**. Si **C**: nulo (MVP).

Verificacion:
15. **[M]** Smoke en dispositivo real (iOS Safari + Android Chrome): `canShareFiles` true → share de
    imagen; fallback descarga; **escanear el QR** de la card generada desde otra pantalla; validar
    contraste del recuadro blanco en tema claro y oscuro.
16. **[S]** `pnpm typecheck` + `pnpm test` (incluir test de `reduce`/QR puros) por tanda.

---

## Riesgos y gotchas

- **Duplicacion de la card de record** (canvas vs servidor): al tocar el footer, actualizar **ambas**
  vias o las cards de record divergiran (la de coach seguira sin invitacion). El servidor
  (`route.tsx`) tendria que aprender el `joinUrl` del alumno objetivo (resolverlo desde `clientId` con
  service-role) y dibujar un `<img>` de QR (satori **no** rasteriza `<canvas>`, pero si un `<img>` con
  data-URL PNG del QR). Decidir si la invitacion tambien va en el flujo coach.
- **CORS de logos** (memoria: "resta smoke fotos CORS"): en canvas-cliente `loadImage` usa
  `crossOrigin='anonymous'`; si el host del logo del coach no manda CORS, el logo cae a null (ya
  manejado) — pero **el QR via data-URL no se ve afectado** (no es cross-origin). No mezclar: el logo
  puede fallar sin romper la card.
- **Tainting del canvas**: usar `data:` URL para el QR (no `http`), si no `toBlob()` lanzaria. El logo
  ya puede tintar si el server manda CORS incorrecto — por eso `renderProgressCardToBlob` tolera logo
  nulo. Mantener esa tolerancia.
- **Clean Architecture — `_data` → `supabase.rpc` directo**: el patron vigente del dashboard llama
  `supabase.rpc(...)` desde `_data` (ver `dashboard.queries.ts:30,221`). CLAUDE.md pide
  `_data → services → repository`. Para no introducir drift, o bien seguir el patron vigente (RPC desde
  `_data`, consistente con el resto del modulo) o encapsular en un `progress.service`. Recomendado:
  seguir el patron del modulo para no abrir un refactor transversal en un feature de UI.
- **DB aditiva** (si Opcion A): migracion **forward-only, idempotente** (`CREATE OR REPLACE`), guard
  IDOR 3-vias con bypass service-role (copiar de `get_client_workout_day_counts`), `REVOKE ... FROM
  PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`. Validar en prod con
  snapshot + `get_advisors` + tx-rollback (NO branches Supabase — memoria del proyecto). Los RPC **no**
  requieren column-grants (eso es solo para columnas editables por usuario).
- **Zona horaria**: sesiones/volumen agregan por dia America/Santiago en los RPC; el filtro "mes
  calendario" debe usar la MISMA zona (Santiago) para no incluir/excluir el borde del mes. Reusar
  helpers de `lib/date-utils` (`getSantiagoIsoYmdForUtcInstant`, `getTodayInSantiago`).
- **Semantica de "racha"**: cuenta actividad (entreno **o** nutricion), no solo entrenos. El copy de la
  card de racha debe decir "dias seguidos activo/entrenando" con cuidado para no prometer solo-gym.
- **Mobile viewport / DS**: los modales nuevos deben seguir el DS del rediseno (radius EVA `rounded-card`,
  tokens `--sport-*`/`--ember-*`, `pt-safe/pb-safe`, nada de `h-screen` fuera de `md:` → `dvh`).
  Copiar exactamente el shell de `ProgressShareCardModal` (ya cumple).
- **Free tier**: la invitacion/QR debe aparecer para **todos** los tiers (el funnel de registro no es
  feature pago). El gating solo aplica al logo/color de marca (ya resuelto por el layout). No gatear el
  QR.
- **QR con URL larga / densidad**: `/join/{5-chars}` es corto → QR de baja densidad, muy escaneable.
  Mantener el error-correction level M (como `CoachQRButton`), margen ≥ 2 modulos, sobre blanco.
- **Enterprise**: no hay un unico invite-code por org → esas cards caen al fallback `/c/{slug}`.
  Aceptable (enterprise archivado). No bloquear el feature por este caso.

---

## Preguntas para el CEO

1. **Entrada de las cards**: ¿un unico boton "Comparti tu logro" que abre un **selector** de plantilla
   (Progreso / Racha / Resumen mensual), o botones/entradas separadas (p.ej. Racha en el StatCard de
   racha del perfil, Resumen mensual como widget en el dashboard a fin de mes)? Recomendado: selector
   unico en perfil + un trigger de "Resumen del mes" en el dashboard.
2. **PRs del mes**: ¿shippear el Resumen mensual **sin** conteo de PRs primero (Sesiones + Volumen +
   Racha, cero DB) y sumar PRs despues (Opcion C→A), o esperar a tener el conteo exacto (RPC aditiva)
   desde el dia 1? Recomendado: MVP sin PRs y follow-up con la RPC.
3. **Footer / marca EVA**: hoy las cards llevan `vía EVA` discreto. Con el QR de invitacion,
   ¿mantenemos `vía EVA` + QR, lo reemplazamos por el CTA "Escanea para entrenar con {marca}", o el
   coach free igual muestra "Potenciado por EVA"? (Afecta co-branding en tier free.)
