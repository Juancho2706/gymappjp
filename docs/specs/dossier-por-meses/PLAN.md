---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# PLAN — Dossier por meses

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md) · [DATA-TESTING](DATA-TESTING.md).

Un solo tren en el worktree `dossier-por-meses` (rama `worktree-dossier-por-meses`, base `96800255`): **una migración aditiva**, **un package nuevo**, un diálogo web, un sheet RN y dos generadores de PDF que pasan a imprimir N informes. Sin DDL destructiva, sin cambios nativos, sin dependencias nuevas salvo **`fflate`** en la web.

Jerarquía que gobierna este archivo: decisiones del owner (**Q1–Q4 = a**) > resoluciones del jefe (**R1–R26**) > brief original > este PLAN. Ningún worker reabre Q1–Q4 ni R1–R26.

**Esfuerzo total: ≈ 5,25 días-agente** + QA del owner.

> **Estado al escribir este PLAN (15-09, ~23:30).** Los artefactos de **W0** y **W1** ya están en el worktree (migración, package, registros de resolución, tipos de DB, poda de `CURRENT.md`): los pusieron workers en paralelo mientras se escribía el SDD. Los checkboxes de [TASKS](TASKS.md) siguen **sin marcar** porque esta sesión **no ejecutó ni presenció** sus gates: los marca quien corra el gate real.

---

## Arquitectura

```text
supabase/migrations/
  20260915230000_client_month_reports.sql          1 migración ADITIVA (R2, R3, R4, R11)
    public.get_client_month_reports(uuid, date[]) -> jsonb   { "months": [ … ] }
    public.get_client_report_bounds(uuid)         -> jsonb   { first_month, current_month }
        │  (contrato jsonb R10)
        ▼
packages/client-dossier/                           @eva/client-dossier — PURO (R13)
  index.ts                 -> export * from './src/index'
  src/types.ts             ClientDossierData (movido), DossierPeriod, DossierTile, DossierTone,
                           MonthReportJson / MonthReportsJson / ClientReportBoundsJson,
                           BuildClientMonthDossierOpts
  src/months.ts            monthRangeFrom, monthPeriod, formatMonthLabel/Long, formatDayMonth,
                           slugifyClientName, dossierFileStem, toMonthKey, daysInMonth
  src/month-dossier.ts     buildClientMonthDossier(report, opts)  ← la ÚNICA semántica del mes
  src/today-tiles.ts       buildTodayTiles(dossier)               ← los 6 tiles de «Estado actual»
        │
        ├── apps/web/src/services/client/client-dossier.ts   RE-EXPORTA los tipos (4 consumidores
        │                                                    intactos); buildClientDossier NO se mueve
        │                                                    (depende de programWeekVariant)
        │
        ├── WEB                                                                        (W2)
        │     _actions/client-detail.actions.ts   + getClientMonthDossiers / getClientReportBounds
        │         · RPC con createClient() de cookies      ← guard IDOR real (R16)
        │         · service-role SOLO en resolveCheckinPhotoUrls
        │     lib/pdf/client-dossier-pdf.ts       renderDossierReport(doc, ctx, dossier, {i,n})
        │                                         downloadClientDossierPdf(input, {separate})
        │                                         separado ⇒ zipSync de fflate (R18)
        │     .../[clientId]/DossierExportDialog.tsx  (nuevo)
        │     .../[clientId]/ClientProfileHero.tsx    el botón abre el diálogo
        │
        └── RN                                                                          (W3)
              lib/coach-client-detail.ts   + fetchClientMonthReports / fetchClientReportBounds
              lib/client-dossier-pdf.ts    renderDossierHtml(model, photoMap) separado de
                                           exportClientDossierPdfs(models[], opts)
              components/coach/clientDetail/DossierExportSheet.tsx  (nuevo, sobre Sheet.tsx)
              app/coach/cliente/[clientId].tsx   el handler abre el sheet
```

### Reglas duras de arquitectura

1. **El package es el único dueño de la semántica del mes.** Web y RN no calculan tiles, ni el récord nuevo, ni el rótulo del mes, ni el nombre del archivo: los piden a `@eva/client-dossier`. Si una regla aparece dos veces, divergen — ya pasó con la nutrición del dossier (SPEC §1 P3).
2. **El package es PURO.** Sin React, sin RN, sin Supabase, sin Next, sin `new Date()` interno: el `generatedAtIso` y el `todayIso` entran por parámetro. Por eso `buildClientDossier` **no se mueve**: importa `@/lib/workout/programWeekVariant` (`apps/web/src/services/client/client-dossier.ts:13`).
3. **El RPC se llama con el JWT del coach.** En web, `createClient()` de `@/lib/supabase/server` (`server.ts:14`). El `createServiceRoleClient()` (`admin-client.ts:7`) entra **solo** a `resolveCheckinPhotoUrls` (`apps/web/src/lib/storage/checkin-photos.ts:85`), calcado de `client-detail.service.ts:702`. Llamarlo con service-role saltaría el guard de 3 vías: agujero cross-tenant.
4. **La migración es aditiva, idempotente y forward-only.** `CREATE OR REPLACE` de dos funciones nuevas, ninguna tabla tocada, ninguna fila modificada.
5. **El dossier «Estado actual» no cambia.** Cualquier cambio de rótulo, nombre de archivo o tile en ese camino es una regresión (DM-04).

### Registro del package (los 5 lugares, ninguno opcional)

| Dónde | Qué |
|---|---|
| `apps/web/tsconfig.json` (bloque `paths`) | `"@eva/client-dossier": ["../../packages/client-dossier/index.ts"]` |
| `apps/mobile/tsconfig.json` (bloque `paths`) | idem |
| `vitest.config.ts` (const `alias`) | `'@eva/client-dossier': path.resolve(__dirname, './packages/client-dossier/index.ts')` |
| `apps/web/package.json` (`dependencies`) | `"@eva/client-dossier": "workspace:*"` |
| `apps/mobile/package.json` (`dependencies`) | idem, + `pnpm install` para el lockfile |

**Metro no necesita configuración**: `apps/mobile/metro.config.js:19-27` ya vigila `packages/` entero y resuelve `node_modules` del monorepo. Los tests del package entran solos a la suite por el patrón `packages/**/*.test.ts` de `vitest.config.ts:56` (project `web-node`).

**Divergencia declarada vs R13**: R13 pedía `src/index.ts` como entrypoint; el repo usa un `index.ts` en la raíz del package (`packages/coach-nav/index.ts`, `packages/feature-prefs/index.ts`, `packages/profile-analytics/index.ts`) y los `paths`/alias apuntan ahí. Se sigue la convención del repo: `index.ts` raíz que re-exporta `./src/index`.

---

## Olas — resumen

| Ola | Qué entra | Depende de | Días-agente | Worker | Gate de salida |
|---|---|---|---|---|---|
| **W0 · DB + docs** | Migración `20260915230000_client_month_reports.sql`, tx-rollback en LIVE, `EXPLAIN`, advisors, poda de `CURRENT.md` (R24) | — | 1,25 | **Opus** | `ROLLBACK` registrado en DATA-TESTING · migración en `list_migrations` · `pnpm docs:check` verde |
| **W1 · Modelo puro** | `packages/client-dossier` completo + registro en los 5 lugares + re-export en el service web + tests del package | W0 (contrato) | 1 | **Opus** | `pnpm exec vitest run packages/client-dossier apps/web/src/services/client/client-dossier.test.ts` verde · `pnpm typecheck` |
| **W2 · Web** | `database.types.ts` (R17), server actions, jsPDF multi + zip, `DossierExportDialog`, hero | W1 | 1,5 | Opus (datos) + **Fable (UI)** | vitest de los archivos tocados · `pnpm typecheck` · `pnpm exec eslint <archivos>` |
| **W3 · RN** | `fetchClientMonthReports`/`Bounds`, `renderDossierHtml` + `exportClientDossierPdfs`, fixes de corte, `DossierExportSheet`, hero, tope de `refs` (R20) | W1 | 1,25 | Opus (datos) + **Fable (UI)** | `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint:mobile` · `npx expo export --platform android` |
| **W4 · Cierre** | Suite completa **una vez**, spec E2E escrita (no corrida), docs canónicos, QA del owner | W2, W3 | 0,25 | **Fable (jefe)** + owner | Tabla de gates con salida real + QA del owner (SPEC §17) |

**Orden duro**: `W0 → W1 → (W2 ‖ W3) → W4`. W2 y W3 pueden correr en paralelo porque solo comparten el contrato que cerró W1; el `index.ts` del package **lo toca solo W1**.

**Gates proporcionales (R25).** Por ola: `typecheck` **de la app tocada**, `vitest` **de los archivos tocados**, `eslint` **de los archivos tocados**. La **suite completa corre una sola vez, en W4**. Los **E2E solo con autorización explícita del owner**: el spec de Playwright se **escribe y no se corre** ([TASKS](TASKS.md) E3). Push, merge, deploy y OTA: **solo a pedido del owner**.

---

## W0 · Datos y documentación — 1,25 días-agente · **Opus**

**Objetivo.** Que exista un solo read capaz de contestar «cómo le fue a este alumno en estos meses», con guard IDOR real y sin escribir una sola fila, antes de que exista una línea de UI que lo consuma. Bloquea todo el tren.

### Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260915230000_client_month_reports.sql` (**nuevo**) | Las **dos** funciones (R2 + R11) en una sola migración: `public.get_client_month_reports(p_client_id uuid, p_months date[]) returns jsonb` y `public.get_client_report_bounds(p_client_id uuid) returns jsonb`. `language plpgsql stable security definer set search_path = ''` con **todos** los nombres calificados (R4). Guard de 3 vías **verbatim** de `20260903212800_muscle_volume_side_metadata.sql:39-43`, con `raise exception … using errcode = '42501'` (R3). Tope de 24 meses ⇒ `22023` (R2). ACL `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT EXECUTE … TO authenticated, service_role` + bloque `DO $verify$` con `has_function_privilege`, copiado de `20260903212800:89-106`. `COMMENT ON FUNCTION` en las dos. |
| `docs/status/CURRENT.md` (**otro worker**, R24) | Podar por debajo de **15 KB** moviendo la prosa de trenes `done` a `docs/archive/current-historial-2026-09.md`, dejando una línea por tren con enlace a su SDD. El tope duro del check es **16 KB** (`scripts/check-docs.mjs:117`); 15 KB es el margen para que este tren entre sin volver a podar. |

### Predicados que la migración copia verbatim (R6)

| Concepto | Origen |
|---|---|
| Récords | `supabase/migrations/20260910205101_get_client_exercise_prs_reps_filter.sql:39-44` |
| `reps_eff` por lado | `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql:56-60` |
| Filtro de volumen | `20260903212800:67-75` |
| Grupo muscular | `20260903212800:53` |
| JOIN de ejercicio | `20260903212800:63-64` |

### Reglas de forma del SQL

- **Filtro sargable** (R2): `wl.logged_at >= (m::timestamp at time zone 'America/Santiago')` y `< ((m + interval '1 month')::timestamp at time zone 'America/Santiago')`. `timezone('America/Santiago', ts)::date` se usa **solo en el SELECT** para etiquetar el día local, nunca en el `WHERE`.
- **Una sola pasada** sobre `workout_logs` del alumno, con el máximo previo por ejercicio resuelto con `max(...) over (partition by exercise order by month_bucket rows between unbounded preceding and 1 preceding)`.
- El CTE de logs **no lleva cota inferior**: `prev_max_kg` tiene que ver todo el historial anterior, incluidos los meses que el coach no pidió.
- **TZ hardcodeada** `America/Santiago`, sin parámetro (R1), igual que `supabase/migrations/20260612051000_rpc_client_workout_day_counts.sql:20,23`.
- **Nutrición solo lectura** (R9): `nutrition_plan_versions_v2`, `nutrition_plans_v2`, `nutrition_day_snapshots_v2` y el helper `private.nutrition_v2_intake_totals` (`supabase/migrations/20260728120000_nutrition_v2_macros_basis.sql:221`, `language sql stable`). **Prohibido** `get_nutrition_today_v2`, `…_scoped_v2` y todo lo que llame a `private.nutrition_v2_ensure_day_snapshot`.

### Protocolo de aplicación en LIVE (R12) — no negociable

En este orden, sin saltear pasos, y **antes** de `apply_migration`:

1. **Elegir el alumno de prueba.** Un alumno real con historial de varios meses de un coach de prueba. **Jamás** una cuenta «jamás tocar» ni un alumno de un coach pagador. Anotar `client_id` y `coach_id` en [DATA-TESTING](DATA-TESTING.md) §3.
2. **`BEGIN;`** — crear las dos funciones dentro de la transacción.
3. **`SET LOCAL ROLE authenticated`** + `set_config('request.jwt.claims', …)` con el `sub` del **coach dueño**. Ejecutar las dos funciones y verificar la forma del jsonb contra el contrato (DATA-TESTING §1).
4. **`EXPLAIN (ANALYZE, BUFFERS)`** del cuerpo principal con 12 meses: tiene que mostrar **Index Scan / Bitmap con range** sobre `workout_logs (client_id, logged_at)` — `idx_workout_logs_client_id_logged_at` (`supabase/migrations/00000000000001_baseline.sql:2079`) o `idx_wl_client_logged_notnull` (`20260612050000_workout_logs_perf_indexes.sql:9`). Un `Seq Scan` **aborta la ola**: significa que el filtro dejó de ser sargable.
5. **Prueba de denegación**: mismas llamadas con los claims de **otro** coach ⇒ `42501` con el mensaje `client_month_reports_denied`. Y con 25 meses ⇒ `22023`.
6. **`ROLLBACK;`** — pegar la salida completa en [DATA-TESTING](DATA-TESTING.md) §3.
7. **`get_advisors`** (security y performance) **antes** y **después**: sin hallazgo nuevo atribuible a este tren.
8. Recién ahí, **`apply_migration`**. Después: `list_migrations` tiene que mostrar `20260915230000`, y la verificación de ACL del bloque `DO` tiene que haber pasado (si falla, la migración aborta sola).
9. **Rollback documentado** en DATA-TESTING §7: `DROP FUNCTION IF EXISTS` de las dos firmas. Nada más que revertir: la migración no toca tablas, filas ni ACL de objetos existentes.

**Criterios de salida.** (1) `ROLLBACK` ejecutado y su salida pegada; (2) `EXPLAIN` con range scan; (3) `42501` y `22023` probados; (4) advisors sin hallazgo nuevo; (5) migración en `list_migrations`; (6) `pnpm docs:check` verde con `CURRENT.md` bajo 15 KB.

---

## W1 · Modelo puro — 1 día-agente · **Opus**

**Objetivo.** Que toda la semántica del informe mensual (tiles, récord nuevo, período, rótulos, nombre de archivo) exista como funciones **puras testeadas** antes de que web y RN la consuman. Bloquea W2 y W3.

### Archivos

| Archivo | Cambio |
|---|---|
| `packages/client-dossier/package.json`, `tsconfig.json`, `index.ts` (**nuevos**) | Espejo de `packages/coach-nav/` (el más chico del repo): `"name": "@eva/client-dossier"`, `private`, `type: module`, `main`/`types`/`exports` apuntando a `./index.ts`. |
| `packages/client-dossier/src/types.ts` (**nuevo**) | `ClientDossierData` y sus tipos hijos **movidos** desde `apps/web/src/services/client/client-dossier.ts:18-128`, más `DossierPeriod`, `DossierTone`, `DossierTile`, el contrato `MonthReportJson` / `MonthReportsJson` / `ClientReportBoundsJson` (R10) y `BuildClientMonthDossierOpts`. Los campos del jsonb se tipan como `JsonNumber = number | string`: PostgREST devuelve `numeric` como **string**. |
| `packages/client-dossier/src/months.ts` (**nuevo**) | `monthRangeFrom(first, current)`, `monthPeriod(monthKey, todayIso)` (el mes en curso corta en hoy), `formatMonthLabel` / `formatMonthLong` / `formatDayMonth`, `toMonthKey`, `daysInMonth`, `slugifyClientName` y `dossierFileStem(fullName, monthKeys)`. Tablas de meses **literales** (`MONTHS_SHORT` / `MONTHS_LONG`): sin `Intl`, que no existe igual en Hermes. |
| `packages/client-dossier/src/month-dossier.ts` (**nuevo**) | `buildClientMonthDossier(report, opts)` ⇒ `ClientDossierData` con `period` y `tiles`. Implementa DM-21…DM-26 del SPEC. |
| `packages/client-dossier/src/today-tiles.ts` (**nuevo**) | `buildTodayTiles(dossier)` con los seis cuadros de hoy, extraídos **sin cambio de valor** de `apps/web/src/lib/pdf/client-dossier-pdf.ts:193-243`. Es lo que garantiza DM-04. |
| `apps/web/src/services/client/client-dossier.ts` | Importa los tipos de `@eva/client-dossier` y los **re-exporta** con `export type { … }`. `buildClientDossier` (`:268`) **no se mueve** y su cuerpo **no cambia**. Los 4 consumidores (`client-detail.actions.ts:21`, `client-dossier-pdf.ts:10`, `client-dossier-pdf.smoke.test.ts:2`, `client-dossier.test.ts:3`) siguen importando desde acá. |
| `apps/web/tsconfig.json`, `apps/mobile/tsconfig.json`, `vitest.config.ts`, `apps/web/package.json`, `apps/mobile/package.json` | Registro del package (tabla de arriba) + `pnpm install` para el lockfile. |
| `packages/client-dossier/src/*.test.ts` (**nuevos**) | Casos en [DATA-TESTING](DATA-TESTING.md) §5.2 y §5.3. |

**Criterios de salida.** (1) `buildClientMonthDossier` cubre mes vacío, mes en curso, sin programa, programa borrado con `plan_names_from_logs`, récord nuevo vs repetido y peso fuera del período; (2) `buildTodayTiles` devuelve los seis tiles con **los mismos strings** que imprime hoy el PDF; (3) `client-dossier.test.ts` pasa **sin tocarlo** (el re-export es transparente); (4) `dossierFileStem` da `dossier-<slug>-2026-07` y `dossier-<slug>-2026-07_2026-09`.

**Gate real.** `pnpm exec vitest run packages/client-dossier apps/web/src/services/client/client-dossier.test.ts` + `pnpm typecheck` + `pnpm --filter @eva/mobile exec tsc --noEmit`.

---

## W2 · Web — 1,5 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Que el coach abra un diálogo, elija meses y reciba uno o N informes, sin que el camino «Estado actual» note nada.

### Capa de datos — Opus

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/database.types.ts` (bloque `Functions`) | **R17**: `get_client_month_reports` con `Args: { p_client_id: string; p_months: string[] }` y `Returns: Json`; `get_client_report_bounds` con `Args: { p_client_id: string }` y `Returns: Json`. Van en orden alfabético, entre `get_client_exercise_prs` (`:7137`) y `get_client_muscle_volume`. **Sin `as any` en ningún consumidor.** |
| `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` | Dos exports nuevos: `getClientReportBounds(clientId)` y `getClientMonthDossiers(clientId, months, { includePhotos })`. Los dos validan `clientId` como ya hace `getClientDossier` (`:48-50`). El segundo: `assertCoachClientReadAccess` → RPC con `createClient()` de cookies → `resolveCheckinPhotoUrls(createServiceRoleClient(), rows, { fullPhotoRows: 3, tailFields: ['front_photo_url'] })` por mes cuando `includePhotos` → `buildClientMonthDossier` por mes con `generatedAtIso` **único** → `ClientDossierData[]`. El `42501` se traduce a `Error('No tenés acceso a este alumno')`. **Archivo `'use server'`: solo exporta funciones async**; los tipos del diálogo viven fuera (regla de AGENTS.md). |
| `apps/web/src/lib/pdf/client-dossier-pdf.ts` | **R18**: extraer el cuerpo de `downloadClientDossierPdf` (`:66-663`) a `renderDossierReport(doc, ctx, dossier, { index, total })`, con los helpers (`paintBg`, `addPage`, `checkPage`, `card`, `sectionHeader`, `emptyState`, `:83-127`) **fuera del bucle**, en el `ctx`. Firma nueva: `downloadClientDossierPdf(input: ClientDossierData \| ClientDossierData[], opts?: { separate?: boolean })`. **Junto**: un `doc`, `doc.addPage()` entre informes, footer con página **global** «p/total». **Separado**: N `doc` ⇒ un zip con `zipSync` de `fflate`. Los tiles se leen de `dossier.tiles ?? buildTodayTiles(dossier)`: el grid de `:243-266` deja de calcular nada. |
| `apps/web/package.json` (`dependencies`) | `"fflate": "0.8.3"` — la versión que ya resuelve el lockfile y la que exige el override de seguridad del `package.json` raíz. `pnpm install` para el lockfile. |
| `apps/web/src/lib/pdf/client-dossier-pdf.smoke.test.ts` | El holder pasa de un blob a `captured: ArrayBuffer[]`; casos nuevos en [DATA-TESTING](DATA-TESTING.md) §5.5. |

### Capa de pantalla — Fable

| Archivo | Cambio |
|---|---|
| `apps/web/src/app/coach/clients/[clientId]/DossierExportDialog.tsx` (**nuevo**) | El diálogo de SPEC §6, con `@/components/ui/dialog`, `@/components/ui/segmented-control` (`SegmentedControlProps` en `segmented-control.tsx:22-30`) y `@/components/ui/switch`. Chips = `<button aria-pressed>` (no hay componente de chip multiselección en el DS); lista con scroll a partir de 12; atajos «Últimos 3» / «Últimos 6»; CTA con el contador de archivos; errores **dentro** del diálogo. |
| `apps/web/src/app/coach/clients/[clientId]/ClientProfileHero.tsx` | `handleExport` (`:217-229`) deja de descargar: abre el diálogo. El estado `exporting` / `exportError` (`:214-215`, `:225`) se muda al diálogo; el botón (`:253-257`) solo cambia `aria-label`/`title` a «Exportar dossier». El camino «Estado actual» del diálogo sigue llamando a `getClientDossier` + `downloadClientDossierPdf` tal cual. |

**Criterios de salida.** (1) «Estado actual» produce el mismo archivo que antes del cambio (mismo stem, mismos tiles); (2) 3 meses junto ⇒ un `save()` y páginas > 3; (3) 3 meses separado ⇒ un zip con 3 entradas y **cero** `save()` extra; (4) sin meses el CTA está deshabilitado; (5) el 42501 llega a la UI como texto en español dentro del diálogo.

**Gate real (proporcional).** `pnpm typecheck` · `pnpm exec vitest run apps/web/src/lib/pdf/client-dossier-pdf.smoke.test.ts apps/web/src/services/client/client-dossier.test.ts packages/client-dossier` · `pnpm exec eslint apps/web/src/app/coach/clients/\[clientId\]/DossierExportDialog.tsx apps/web/src/app/coach/clients/\[clientId\]/ClientProfileHero.tsx apps/web/src/app/coach/clients/\[clientId\]/_actions/client-detail.actions.ts apps/web/src/lib/pdf/client-dossier-pdf.ts`.

---

## W3 · RN — 1,25 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Que el coach haga lo mismo desde el teléfono y comparta **un** PDF (Q1 = a), con las barras y las fotos sin cortarse.

### Capa de datos — Opus

| Archivo | Cambio |
|---|---|
| `apps/mobile/lib/coach-client-detail.ts` | `fetchClientMonthReports(clientId, months): Promise<MonthReportsJson>` y `fetchClientReportBounds(clientId): Promise<ClientReportBoundsJson>`, vía `supabase.rpc`, al lado de las llamadas que ya existen (`:860-883`). El cliente RN (`apps/mobile/lib/supabase.ts`) **no** está tipado con `Database`, así que no hace falta tocar tipos: se castea al contrato del package, que es la fuente. |
| `apps/mobile/lib/client-dossier-pdf.ts` | **R23**: separar `renderDossierHtml(model: ClientDossierData, photoMap)` de la exportación; nuevo `exportClientDossierPdfs(models[], opts)` que concatena bloques `<div class="report">` con `page-break-after: always` y comparte **un** archivo. `kpiCard` (`:176`) pasa a recibir un `DossierTile`. El stem (`:329`) usa `dossierFileStem` del package. **Fixes de corte** en `STYLES` (`:130+`): `.vol-row, tr, .photo-cell { page-break-inside: avoid }`, `.photos-block { break-inside: avoid }` envolviendo el bloque de fotos de `:280-286`, y `.vol-track/.vol-bar { display: block }`. |
| `apps/mobile/lib/client-dossier-pdf.ts` (`embedCheckinPhotos`, `:92-127`) | **R20**: pasa por `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 700 } }], { compress: 0.6, format: JPEG, base64: true })` antes de embeber (patrón ya usado en `apps/mobile/lib/exercises.ts:420-423`). Topes: **3 fotos por mes**, **18 por exportación**. Firma **por lote de mes** con `signCheckinPhotos` (`apps/mobile/lib/api.ts:246`). |
| `apps/web/src/app/api/mobile/coach/checkin-photos/route.ts:52` | **R20**: `.slice(0, 24)` sobre `refs`. Hoy la ruta firma todo lo que venga en el body contra el service-role. Cambio de una línea, entra en este tren. |

### Capa de pantalla — Fable

| Archivo | Cambio |
|---|---|
| `apps/mobile/components/coach/clientDetail/DossierExportSheet.tsx` (**nuevo**) | El sheet de SPEC §7, construido con `apps/mobile/components/Sheet.tsx` (`SheetProps` en `:80`, componente en `:173`), `SegmentedTabs.tsx` y `Switch.tsx`. Chips en `ScrollView` horizontal. **Sin** interruptor junto/separado. CTA «Generar y compartir». |
| `apps/mobile/app/coach/cliente/[clientId].tsx` | `handleExportPdf` (`:678-696`) pasa a abrir el sheet; el camino «Estado actual» sigue llamando a `exportClientDossierPdf(clientId, data, scalars)` con los mismos `scalars` (`:682-689`). El sheet se monta junto a los demás overlays de la pantalla. |
| `apps/mobile/components/coach/clientDetail/ClientHero.tsx` | Sin cambio de contrato: `onExportPdf` (`:75`) y `exportingPdf` (`:76`) ya existen; solo cambia a qué apuntan. |

**Criterios de salida.** (1) «Estado actual» comparte el mismo PDF de antes; (2) 3 meses ⇒ **un** archivo con 3 informes; (3) los seis tiles coinciden con los de la web para el mismo mes; (4) ninguna barra de volumen queda huérfana y ninguna foto se parte; (5) 6 meses con fotos no tumban la app en gama media.

**Gate real (proporcional).** `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint:mobile` · `npx expo export --platform android` (desde `apps/mobile`) · `pnpm exec vitest run packages/client-dossier`.

---

## W4 · Cierre — 0,25 días-agente · **Fable (jefe)** + owner

| Paso | Qué |
|---|---|
| Revisión | Diff completo contra [TASKS](TASKS.md), carril por carril. Verificar que `buildClientDossier` y el camino «Estado actual» no tengan un solo diff de comportamiento. |
| Suite completa (**una sola vez**) | `pnpm docs:check` · `pnpm lint` · `pnpm lint:mobile` · `pnpm typecheck` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm exec vitest run` · `pnpm check:tokens`. Registrar la salida **real**. |
| E2E | `tests/dossier-export.spec.ts` **se escribe y no se corre** (R25). Corre solo en el gate final **autorizado por el owner**. |
| Docs | `docs/README.md` (índice de specs, ya hecho por este SDD) · `docs/status/CURRENT.md` (una línea del tren, con `wc -c` antes y después) · `docs/status/MOBILE_PARITY.md` si cambia la paridad · `docs/testing/TEST_STATUS.md` **solo** si cambia un gate obligatorio. |
| QA | El owner corre SPEC §17 (14 puntos web + 8 en device + 2 comunes). Sin QA verde el SDD **no** pasa a `done`. |
| Entrega | Commit, push, deploy y OTA **solo a pedido del owner**. |

---

## Presupuesto y orden de recorte

**≈ 5,25 días-agente**: W0 1,25 + W1 1 + W2 1,5 + W3 1,25 + W4 0,25.

Si no cabe, se recorta **en este orden y no en otro**:

1. Los **atajos «Últimos 3/6»** (web y RN) — comodidad, no funcionalidad.
2. El **spec E2E** `tests/dossier-export.spec.ts`, que queda **con causa anotada** en `docs/testing/TEST_STATUS.md`.
3. El **zip** de W2: se degrada a «junto siempre» en web también, igualando a RN (Q1 = a ya lo acepta para móvil). Se avisa al owner antes, porque es una decisión de producto.

**Nunca se recortan**: el guard de 3 vías, el tope de fotos, el tope de `refs` de R20, los predicados verbatim de R6 ni el test de identidad de DM-04.
