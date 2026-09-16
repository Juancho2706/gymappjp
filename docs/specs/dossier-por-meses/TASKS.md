---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# TASKS — Dossier por meses

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md) · [DATA-TESTING](DATA-TESTING.md). **Ningún checkbox se marca sin gate real o QA del owner.** Push, merge, deploy y OTA **solo a pedido del owner**.

Todas las rutas `archivo:línea` están verificadas contra el worktree `dossier-por-meses`, rama `worktree-dossier-por-meses`, base `96800255`.

> Las líneas pueden correrse ±5 mientras el tren avanza: **el implementador ancla por identificador** (nombre de función, constante, prop), nunca por número de línea.

> **Estado al escribir este documento (15-09, ~23:30).** Los artefactos de **W0** y **W1** ya están en el worktree (migración `20260915230000_client_month_reports.sql`, `packages/client-dossier/`, registro en los 5 lugares, firmas en `database.types.ts`, poda de `CURRENT.md`): los pusieron workers en paralelo. **Ningún checkbox se marca acá** porque esta sesión no ejecutó ni presenció los gates. Los marca quien corra el gate real y pegue su salida.

## W0 · Decisiones del owner (2026-09-15)

No son tareas: son el marco que ya decidió el owner. **Por eso van sin checkbox** — la regla de arriba reserva `- [ ]` para lo que se ejecuta y se cierra con gate real o QA.

| # | Decisión | Consecuencia |
|---|---|---|
| W0.1 | **Q1 = a** · En RN v1 **solo «un PDF junto»**; «separado» (un archivo por mes) solo en web. | El sheet RN no lleva interruptor junto/separado (C7). |
| W0.2 | **Q2 = a** · En modo mes **los 6 cuadros cambian de pregunta**. | Los 6 tiles nuevos con rótulo con período (B4). |
| W0.3 | **Q3 = a** · **Selección libre** de meses con chips: uno o varios, seguidos o no. | Chips multiselección, sin rango contiguo (C1, C7). |
| W0.4 | **Q4 = a** · Interruptor **«Incluir fotos de check-in»**, **encendido por defecto**. | C1, C7, D1–D4. |
| W0.5 | **Mismo estilo del PDF.** Paleta, tipografía, secciones y orden **no se rediseñan**. | Solo cambian rótulos y recorte temporal. |
| W0.6 | **Va en todos los planes, sin gate por tier.** | Cero lecturas de tier o `enabled_modules` en este tren. |

---

## A · Datos (W0 — Opus)

- [ ] **A1** `supabase/migrations/20260915230000_client_month_reports.sql` (**nuevo**) — las **dos** funciones en una migración aditiva: `public.get_client_month_reports(p_client_id uuid, p_months date[]) returns jsonb` (R2) y `public.get_client_report_bounds(p_client_id uuid) returns jsonb` (R11). **Cierre**: la migración existe, es idempotente (`create or replace`), no toca tablas ni filas, y su cabecera documenta el rollback.
- [ ] **A2** Guard y errores (R3) — guard de 3 vías **verbatim** de `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql:39-43`; denegación con `raise exception 'client_month_reports_denied' using errcode = '42501'`; más de **24** meses ⇒ `raise exception … errcode = '22023'`. **Cierre**: los dos casos probados dentro de la tx de A6 y pegados en [DATA-TESTING](DATA-TESTING.md) §3.
- [ ] **A3** Hardening (R4) — `language plpgsql stable security definer set search_path = ''` con **todos** los nombres calificados; `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT EXECUTE … TO authenticated, service_role`; bloque `DO $verify$` con `has_function_privilege` copiado de `20260903212800:89-106`; `COMMENT ON FUNCTION` en las dos. **Cierre**: el bloque `DO` pasa al aplicar (si falla, aborta la migración sola).
- [ ] **A4** Predicados verbatim (R6) — récords de `20260910205101_get_client_exercise_prs_reps_filter.sql:39-44`; `reps_eff` por lado y filtro de volumen de `20260903212800:56-75`; grupo `COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')` (`:53`); JOIN `COALESCE(wb.exercise_id, wl.exercise_id)` (`:63-64`). **Cierre**: el caso de paridad de [DATA-TESTING](DATA-TESTING.md) §4.3 da el mismo volumen que `get_client_muscle_volume` para una ventana equivalente.
- [ ] **A5** Forma y rendimiento (R1, R2) — TZ `America/Santiago` **hardcodeada** (precedente `20260612051000_rpc_client_workout_day_counts.sql:20,23`); filtro **sargable** con la columna cruda; una sola pasada sobre `workout_logs`; máximo previo por ejercicio con **window function**; el CTE de logs **sin cota inferior** (`prev_max_kg` necesita todo el historial). **Cierre**: el `EXPLAIN` de A6 muestra range scan, no `Seq Scan`.
- [ ] **A6** **Validación tx-rollback en LIVE (R12)** — `BEGIN;` → crear las funciones → `SET LOCAL ROLE authenticated` + claims del coach dueño de un alumno de prueba (**nunca** una cuenta «jamás tocar») → forma del jsonb → `EXPLAIN (ANALYZE, BUFFERS)` con 12 meses → denegación con claims de otro coach (`42501`) → 25 meses (`22023`) → `ROLLBACK;`. **Cierre**: la salida completa pegada en [DATA-TESTING](DATA-TESTING.md) §3 y §4.
- [ ] **A7** `get_advisors` (security y performance) **antes y después** de aplicar. **Cierre**: sin hallazgo nuevo atribuible a este tren, anotado en [DATA-TESTING](DATA-TESTING.md) §3.4.
- [ ] **A8** `apply_migration` y verificación. **Cierre**: `20260915230000` aparece en `list_migrations` y las dos funciones responden con el JWT de un coach real.
- [ ] **A9** Nutrición del mes (R9) — solo `public.nutrition_plan_versions_v2`, `public.nutrition_plans_v2`, `public.nutrition_day_snapshots_v2` y `private.nutrition_v2_intake_totals` (`supabase/migrations/20260728120000_nutrition_v2_macros_basis.sql:221`). **Prohibido** invocar `get_nutrition_today_v2`, `get_nutrition_client_detail_v2`, cualquier `…_scoped_v2` o algo que llame a `private.nutrition_v2_ensure_day_snapshot`. **Cierre**: `grep` sobre la migración sin ninguno de esos nombres **y** conteo de `nutrition_day_snapshots_v2` idéntico antes/después de ejecutar el RPC (DATA-TESTING §5.4).
- [ ] **A10** **R24 · Poda de `docs/status/CURRENT.md`** por debajo de **15 KB** antes de registrar el tren: la prosa de trenes ya `done` se mueve a `docs/archive/current-historial-2026-09.md`, dejando **una línea por tren** con enlace a su SDD. Medir con `wc -c` **antes y después**. El tope duro del check es 16 KB (`scripts/check-docs.mjs:117`). **Cierre**: `pnpm docs:check` verde con el tamaño nuevo en su salida.

---

## B · Modelo puro (W1 — Opus)

- [ ] **B1** `packages/client-dossier/{package.json,tsconfig.json,index.ts}` (**nuevos**) — espejo de `packages/coach-nav/` (el más chico del repo). Entrypoint `index.ts` en la **raíz** del package, que re-exporta `./src/index` (convención del repo; R13 decía `src/index.ts`, ver [PLAN](PLAN.md) §Arquitectura). **Cierre**: `import { buildClientMonthDossier } from '@eva/client-dossier'` resuelve en web, en RN y en vitest.
- [ ] **B2** `packages/client-dossier/src/types.ts` — `ClientDossierData` y sus tipos hijos **movidos** desde `apps/web/src/services/client/client-dossier.ts:18-128`; `DossierPeriod`, `DossierTone`, `DossierTile`; contrato `MonthReportJson` / `MonthReportsJson` / `ClientReportBoundsJson` (R10, [DATA-TESTING](DATA-TESTING.md) §1); `BuildClientMonthDossierOpts`. Los campos numéricos del jsonb se tipan `JsonNumber = number | string` (PostgREST manda `numeric` como string). **Cierre**: `pnpm typecheck` verde sin `as any`.
- [ ] **B3** `packages/client-dossier/src/months.ts` — `monthRangeFrom`, `monthPeriod(monthKey, todayIso)`, `formatMonthLabel` / `formatMonthLong` / `formatDayMonth`, `toMonthKey`, `daysInMonth`, `slugifyClientName`, `dossierFileStem`. Tablas de meses **literales**, sin `Intl` (no existe igual en Hermes). **Cierre**: casos de [DATA-TESTING](DATA-TESTING.md) §5.2 verdes.
- [ ] **B4** `packages/client-dossier/src/month-dossier.ts` — `buildClientMonthDossier(report, opts)` con los **6 tiles** (SPEC §8.2, R14) y las reglas de peso, récord nuevo, programa y encabezado (SPEC DM-21…DM-26, R15). **Cierre**: casos de [DATA-TESTING](DATA-TESTING.md) §5.3 verdes, incluyendo mes vacío, mes en curso, sin programa, programa borrado con `plan_names_from_logs`, récord nuevo vs repetido y peso fuera del período.
- [ ] **B5** `packages/client-dossier/src/today-tiles.ts` — `buildTodayTiles(dossier)` con los seis cuadros de hoy extraídos **sin cambio de valor** de `apps/web/src/lib/pdf/client-dossier-pdf.ts:193-243` (incluido el dead-band de ±0,05 kg de `:198`). **Cierre**: test que compara los seis `{label, value, sub}` con los strings que imprime hoy el PDF (DM-04).
- [ ] **B6** `apps/web/src/services/client/client-dossier.ts` — importar los tipos de `@eva/client-dossier` y **re-exportarlos** con `export type { … }`. `buildClientDossier` (`:268`) **no se mueve** (depende de `@/lib/workout/programWeekVariant`, `:13`) y su cuerpo **no cambia**. **Cierre**: `apps/web/src/services/client/client-dossier.test.ts` pasa **sin tocar el archivo de test**.
- [ ] **B7** Registro del package en los **5 lugares**: `apps/web/tsconfig.json` (`paths`), `apps/mobile/tsconfig.json` (`paths`), `vitest.config.ts` (const `alias`), `apps/web/package.json` y `apps/mobile/package.json` (`dependencies: "@eva/client-dossier": "workspace:*"`), más `pnpm install` para el lockfile. **Cierre**: los tres gates de B8 verdes. Metro no necesita cambios (`apps/mobile/metro.config.js:19-27` ya vigila `packages/`).
- [ ] **B8** **Gates del carril**: `pnpm exec vitest run packages/client-dossier apps/web/src/services/client/client-dossier.test.ts` · `pnpm typecheck` · `pnpm --filter @eva/mobile exec tsc --noEmit`.

---

## C · Web (W2 — Opus datos + Fable UI)

- [ ] **C1** **R17 · Firmas en `apps/web/src/lib/database.types.ts`** (bloque `Functions`, orden alfabético entre `get_client_exercise_prs` `:7137` y `get_client_muscle_volume`):
  `get_client_month_reports: { Args: { p_client_id: string; p_months: string[] }; Returns: Json }` y
  `get_client_report_bounds: { Args: { p_client_id: string }; Returns: Json }`.
  **Cierre**: los dos `supabase.rpc(...)` de la server action compilan **sin `as any`** y `pnpm typecheck` pasa.
- [ ] **C2** `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` — `getClientReportBounds(clientId)` y `getClientMonthDossiers(clientId, months, { includePhotos })`. Validación de `clientId` como en `getClientDossier` (`:48-50`); `assertCoachClientReadAccess`; **RPC con `createClient()` de `@/lib/supabase/server`** (`server.ts:14`); `generatedAtIso` **único** para toda la exportación; `42501` ⇒ `Error('No tenés acceso a este alumno')`. Archivo `'use server'`: **solo funciones async exportadas**. **Cierre**: R16 verificable por lectura del diff — el RPC no toca `createServiceRoleClient` en ninguna rama.
- [ ] **C3** Fotos en la action (R16) — cuando `includePhotos`, `resolveCheckinPhotoUrls(createServiceRoleClient(), rows, { fullPhotoRows: 3, tailFields: ['front_photo_url'] })` **por mes**, tope global **18** por exportación. Patrón calcado de `apps/web/src/services/client/client-detail.service.ts:702-703`. **Cierre**: con el interruptor apagado no se crea el cliente service-role ni se llama a storage.
- [ ] **C4** **R18 · jsPDF multi-informe** en `apps/web/src/lib/pdf/client-dossier-pdf.ts` — extraer el cuerpo de `downloadClientDossierPdf` (`:66-663`) a `renderDossierReport(doc, ctx, dossier, { index, total })`, con los helpers (`paintBg`, `addPage`, `checkPage`, `card`, `sectionHeader`, `emptyState`, `:83-127`) **fuera del bucle**. Firma nueva `downloadClientDossierPdf(input: ClientDossierData | ClientDossierData[], opts?: { separate?: boolean })`. Junto: un `doc`, `addPage()` entre informes, footer con página **global**. Los tiles salen de `dossier.tiles ?? buildTodayTiles(dossier)`. **Cierre**: C9 verde.
- [ ] **C5** **R18 · Zip** — separado ⇒ N `doc` y **un** `zipSync` de `fflate`, nombre `dossier-<slug>-<primero>_<último>.zip` (`dossierFileStem`). **Nunca** N `doc.save()`. Declarar `"fflate": "0.8.3"` en `apps/web/package.json` (`dependencies`, junto a `jose`/`xlsx`/`zxing-wasm`, `:12-23`) + `pnpm install`. **Cierre**: el smoke test ve **un** `save()` y un zip con N entradas.
- [ ] **C6** `apps/web/src/app/coach/clients/[clientId]/DossierExportDialog.tsx` (**nuevo**, `[UI · Fable]`) — SPEC §6: `@/components/ui/dialog`, `@/components/ui/segmented-control` (`:22-30`), `@/components/ui/switch`; chips `<button aria-pressed>` con scroll a partir de 12; atajos «Últimos 3» / «Últimos 6»; interruptores «Un solo PDF» (≥ 2 meses) e «Incluir fotos» (encendido, Q4); CTA con contador de archivos; **errores dentro del diálogo**; `bounds` pedidos al abrir. **Cierre**: los puntos 1–14 del QA web (SPEC §17).
- [ ] **C7** `apps/web/src/app/coach/clients/[clientId]/ClientProfileHero.tsx` (`[UI · Fable]`) — `handleExport` (`:217-229`) abre el diálogo en vez de descargar; `exporting`/`exportError` (`:214-215`, `:225`) se mudan al diálogo; el botón (`:253-257`) pasa a `aria-label`/`title` «Exportar dossier». **Cierre**: el camino «Estado actual» del diálogo produce el mismo archivo que antes (DM-04).
- [ ] **C8** **R18 · Smoke test ampliado** `apps/web/src/lib/pdf/client-dossier-pdf.smoke.test.ts` — el holder pasa de un valor suelto a `captured: ArrayBuffer[]`; casos nuevos: (a) **3 informes junto** ⇒ un `save()`, páginas > 3, nombre `…_2026-09.pdf`; (b) **3 informes separado** ⇒ un zip con 3 entradas y un solo `save()`; (c) un `ClientDossierData` suelto (la firma vieja) sigue funcionando. Detalle en [DATA-TESTING](DATA-TESTING.md) §5.5. **Cierre**: los tres casos verdes.
- [ ] **C9** **Gates del carril**: `pnpm typecheck` · `pnpm exec vitest run apps/web/src/lib/pdf/client-dossier-pdf.smoke.test.ts apps/web/src/services/client/client-dossier.test.ts packages/client-dossier` · `pnpm exec eslint` sobre los **archivos tocados** de este carril.

---

## D · RN (W3 — Opus datos + Fable UI)

- [ ] **D1** `apps/mobile/lib/coach-client-detail.ts` — `fetchClientMonthReports(clientId, months)` y `fetchClientReportBounds(clientId)` con `supabase.rpc`, al lado de las llamadas que ya existen (`:860-883`). El modelo se arma con `buildClientMonthDossier` de `@eva/client-dossier`: RN **no** reimplementa ni una regla (R22). **Cierre**: los seis tiles de un mes coinciden con los de la web (QA punto 20).
- [ ] **D2** **R23 · HTML multi-informe** en `apps/mobile/lib/client-dossier-pdf.ts` — separar `renderDossierHtml(model, photoMap)` de la exportación; nuevo `exportClientDossierPdfs(models[], opts)` que concatena bloques `<div class="report">` con `page-break-after: always` y comparte **un** archivo (Q1 = a). `kpiCard` (`:176`) pasa a recibir un `DossierTile`; el stem (`:329`) usa `dossierFileStem`. **Cierre**: 3 meses ⇒ un PDF con 3 informes.
- [ ] **D3** **R23 · Fixes de corte** en `STYLES` (`apps/mobile/lib/client-dossier-pdf.ts:130+`): `.vol-row, tr, .photo-cell { page-break-inside: avoid }`; el bloque de fotos (`:280-286`) envuelto en `.photos-block { break-inside: avoid }`; `.vol-track/.vol-bar { display: block }` (inofensivo en WebKit, necesario en Chromium). **Cierre**: QA punto 19 — ninguna barra huérfana, ninguna foto partida.
- [ ] **D4** **R20 · Fotos RN** en `embedCheckinPhotos` (`:92-127`) — `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 700 } }], { compress: 0.6, format: JPEG, base64: true })` antes de embeber (patrón de `apps/mobile/lib/exercises.ts:420-423`; el paquete ya está, `apps/mobile/package.json:65`). Topes **3 por mes** y **18 por exportación**; firma **por lote de mes** con `signCheckinPhotos` (`apps/mobile/lib/api.ts:246`). **Cierre**: QA puntos 21–22.
- [ ] **D5** **R20 · Tope de `refs` en la ruta de fotos** — `apps/web/src/app/api/mobile/coach/checkin-photos/route.ts:52`: `.slice(0, 24)` sobre el array de `refs`. Hoy la ruta firma **todo** lo que venga en el body contra el service-role. **Cierre**: un POST con 100 refs devuelve 24 entradas en `urls` y el resto no se firma.
- [ ] **D6** `apps/mobile/components/coach/clientDetail/DossierExportSheet.tsx` (**nuevo**, `[UI · Fable]`) — SPEC §7, construido con `apps/mobile/components/Sheet.tsx` (`SheetProps` `:80`, componente `:173`), `SegmentedTabs.tsx` y `Switch.tsx`. **No** se monta un `@gorhom/bottom-sheet` nuevo a mano. Chips en `ScrollView` horizontal + atajos; interruptor de fotos solo en «Por meses»; **sin** interruptor junto/separado; CTA «Generar y compartir». **Cierre**: QA puntos 15–18.
- [ ] **D7** `apps/mobile/app/coach/cliente/[clientId].tsx` (`[UI · Fable]`) — `handleExportPdf` (`:678-696`) abre el sheet; el camino «Estado actual» sigue llamando a `exportClientDossierPdf(clientId, data, scalars)` con los mismos `scalars` (`:682-689`). `ClientHero.tsx` no cambia de contrato (`onExportPdf` `:75`, `exportingPdf` `:76`). **Cierre**: QA punto 16.
- [ ] **D8** **Gates del carril**: `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint:mobile` · `npx expo export --platform android` (desde `apps/mobile`) · `pnpm exec vitest run packages/client-dossier`.

---

## E · Cierre (W4 — Fable jefe + owner)

- [ ] **E1** Revisión del diff completo contra este documento, carril por carril, con foco en que el camino «Estado actual» **no tenga un solo diff de comportamiento** (DM-04).
- [ ] **E2** **Suite completa, una sola vez**, en este orden: `pnpm docs:check` · `pnpm lint` · `pnpm lint:mobile` · `pnpm typecheck` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm exec vitest run` · `pnpm check:tokens`. Registrar la **salida real** de cada uno.
- [ ] **E3** **R25 · Spec E2E escrita, NO corrida** — `tests/dossier-export.spec.ts`: login de coach, ficha de alumno, abrir «Exportar PDF», segmento «Por meses», elegir un mes, verificar el rótulo del CTA. Vive junto a los otros specs de Playwright (`tests/*.spec.ts`; el patrón `*.test.*` de `vitest.config.ts:56` los deja fuera de la suite unitaria). **Se corre solo en el gate final autorizado por el owner.** **Cierre**: el archivo existe y se anota «escrito, no corrido» en `docs/testing/TEST_STATUS.md`.
- [ ] **E4** `docs/status/CURRENT.md` — una línea del tren con enlace a esta spec, midiendo con `wc -c` **antes y después** (tope duro 16 KB, `scripts/check-docs.mjs:117`). Volver a correr `pnpm docs:check`.
- [ ] **E5** `docs/status/MOBILE_PARITY.md` si cambia la paridad web ↔ RN; `docs/testing/TEST_STATUS.md` **solo** si cambia un gate obligatorio o por E3.
- [ ] **E6** **Owner**: QA de [SPEC](SPEC.md) §17 **completo** — 14 puntos en web, 8 en device (RN) y 2 comunes. Sin los dos lados verdes el SDD **no** pasa a `done`.
- [ ] **E7** **Solo a pedido del owner**: commit, push, deploy web y OTA. Nada de esto sale de esta sesión por iniciativa propia.

---

## Backlog fuera del tren

Deuda declarada, con dueño y motivo. **No entra en este tren.**

- **Nutrición V1 en el dossier RN «de hoy» (R22).** `apps/mobile/lib/client-dossier-pdf.ts` imprime `data.nutritionMonthlyAvgPct`, que sale de `averageNutritionTimelineCompliance` sobre el timeline **V1** (`apps/mobile/lib/coach-client-detail.ts:1157`), mientras el dossier web ya usa la señal **V2** (`apps/web/src/services/client/client-dossier.ts:419-422`). El mismo alumno da dos números distintos según desde dónde se exporte. Es un **bug preexistente**; el informe **mensual** no lo hereda (su nutrición sale del RPC nuevo). Arreglo estimado: chico, pero toca el camino «Estado actual» de RN, que este tren se comprometió a no mover (DM-04).
- **La ficha web cuenta «workouts esta semana» en UTC (R26, D15a).** El fallback parte el ISO con `split('T')[0]`; el informe mensual corta en Santiago. Entre las 21:00 y la medianoche de Chile un entreno puede caer en semanas distintas según quién lo cuente. **Divergencia aceptada**, anotada en [DATA-TESTING](DATA-TESTING.md) §6. Arreglarla toca la ficha entera y sus tests, no este tren.
- **`check_ins.date` sigue escribiéndose en medianoche UTC por el peso rápido.** Este tren lo esquiva usando `created_at` como eje (R5); la columna sigue mintiendo para cualquier otro consumidor que la lea como instante.
- **Los atajos «Últimos 3/6» no recuerdan la última selección.** Cada apertura del diálogo/sheet arranca en «Estado actual».
- **Sin exportación programada ni envío por correo.** El coach descarga y manda él.
