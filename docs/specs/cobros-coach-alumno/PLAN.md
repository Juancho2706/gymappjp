---
status: draft
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# PLAN — Cobros coach → alumno (motor + tres modos sobre MercadoPago)

Destino en el repo: `docs/specs/cobros-coach-alumno/PLAN.md`. Compañeros: [SPEC](SPEC.md) ·
[TASKS](TASKS.md) · [EMAILS](EMAILS.md) · [DATA-SECURITY](DATA-SECURITY.md) · [TESTING](TESTING-LEGAL.md).
Rutas verificadas contra `rnmobiledenuevo` @ `c85ef28b` el 2026-08-28. Modelo sugerido entre paréntesis
en cada wave (Sonnet = mecánico bien especificado; Opus = implementación guiada por informe; el jefe
solo orquesta y juzga).

**Orden obligado: W0 → W1 → W1.5 → (W2 ∥ W3) → W4 → W5 → W6 → (aprobación del owner) → W7.**

**Fuente única del DDL (R17)**: la **lista única** de migraciones (M1..Mn, con sus timestamps
`20260829090000` + 5 min cada una), el SQL completo, los rollbacks y el threat model T-01…T-22 viven en
[DATA-SECURITY](DATA-SECURITY.md) (§1 y §11). Este PLAN y TASKS **citan las migraciones por nombre
`M-n` y no repiten timestamps**. Si un archivo, número o nombre de test difiere entre los dos
documentos, gana DATA-SECURITY §1 y este PLAN se corrige.

## 0. Frontera del feature (lo que este plan NO toca)

El billing EVA↔coach queda intacto: `api/payments/webhook/route.ts`, `lib/payments/webhook-pipeline.ts`,
`coaches.subscription_*`, `subscription_events`, `billing_snapshots`, `coach_addons`, cupones y los
crons `mp-reconcile`/`flow-reconcile`/`paid-expiry`/`trial-expiry`. El módulo nuevo es un subsistema
aparte: tablas nuevas, **segunda aplicación de MercadoPago** («EVA Cobros», con sus propios
`client_id`/`client_secret`/signing secret), webhook `/api/cobros/mp/webhook` y crons propios. Del
billing viejo se comparten **solo helpers puros** (r1 §6.2) y se le agrega **defensa en profundidad**
(r1 §6.1) sin cambiar su comportamiento.

## 1. Contratos que no se pueden romper (valen en TODAS las waves)

| # | Contrato | Dónde vive | Cómo se verifica |
|---|---|---|---|
| K1 | **NUT-033**: `private.student_write_allowed` conserva textualmente el `coalesce(<billing coach>, false)` y el `left join` | `supabase/migrations/20260728125000_student_write_gate_fail_closed.sql:74-105` | `supabase/tests/student_gate_equivalence.sql` sigue pasando + diff textual del `pg_get_functiondef` antes/después |
| K2 | `STUDENT_ACCESS_GRACE_DAYS = 7` **no se toca** (es el espejo TS del `interval '7 days'` de la DB) | `apps/web/src/lib/student-access.ts` | grep + `apps/web/src/proxy.test.ts` verde |
| K3 | Gate viejo = fail-CLOSED; gate nuevo = **fail-OPEN** (sin ancla no se corta) | `apps/web/src/lib/student-access.server.ts` vs `packages/cobros/state.ts` | tests de borde en ambos lados, con comentario cruzado |
| K4 | Cero precios en `apps/mobile/**`, incluido el literal `/mes` | `tests/mobile-no-prices.test.ts` | gate CI |
| K5 | La línea Android existe en **un** lugar: `STORE_PLAN_CHANGE_CAPTION`; toda URL que la app abre pasa por `isStoreSafeUrl` | `apps/mobile/lib/client-cap.ts`, `store-compliance.ts`, `tests/mobile/store-copy.test.ts`, `tests/mobile/store-compliance.test.ts` | gates CI |
| K7 | `toStudentAccess` fail-OPEN ante estados desconocidos ⇒ **no** inventar `state:'unpaid'`; se usa `state:'blocked'` + `reason` | `apps/mobile/lib/entitlements-core.ts:105-113` | test nuevo + orden de despliegue (§4) |
| K8 | `student-account-status.ts:23` descarta el objeto entero si `reason` no es `archived\|paused\|null` ⇒ **`/api/mobile/auth/account-status` no cambia** en este tren | `apps/mobile/lib/student-account-status.ts` | test de contrato |
| K9 | El webhook viejo sigue verde | `apps/web/src/app/api/payments/webhook/route.ts` + `route.test.ts` | vitest dirigido antes y después del refactor de helpers |
| K10 | Espejo de copys web↔RN declarado «NO driftar» | `apps/mobile/lib/student-access-copy.ts:1-9` | test de espejo |
| K11 | La UI nunca autoriza: todo gate de plata es server-side | `apps/web/src/lib/constants.ts:161-167` (gotcha `NEXT_PUBLIC` + «Sensitive») | revisión de diff + tests de ruta |
| K12 | `apps/enterprise` CONGELADA: `apps/web/src/app/org/[slug]/payments/*` y `org.repository.ts:557` leen `client_payments` ⇒ las columnas nuevas son **nullable con default**, nunca `not null` | r3 §2.5 | `pnpm typecheck` + lectura del diff |

## 2. Gates (regla `feedback_gates_proporcionales`)

**Por wave, solo lo que la wave tocó**: `pnpm exec vitest run <archivos>` · `pnpm typecheck` (si tocó
`apps/web`) · `pnpm --filter @eva/mobile exec tsc --noEmit` (si tocó `apps/mobile`) ·
`pnpm check:tokens` (tokens/tema) · `pnpm docs:check` (Markdown) · `pnpm lint` sobre lo tocado.

**Una sola vez, antes del push**: `pnpm install --frozen-lockfile` · `pnpm docs:check` · `pnpm lint` ·
`pnpm typecheck` · `pnpm check:tokens` · `pnpm exec vitest run` · `pnpm build` ·
`pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm check:nutrition-v2-boundaries`.

**Lo que CI no corre y va a mano**: los `.sql` de `supabase/tests/` en `BEGIN; … ROLLBACK;`,
`get_advisors` antes/después de cada tanda de migraciones, y Playwright (`pnpm test:e2e`,
**1 navegador, tandas en serie**, nunca 6 en paralelo).

---

## W0 — Preparación, llaves y borradores legales (0,5-1 día-agente · owner + Sonnet)

**Objetivo**: que W1..W5 no se frenen por una credencial. Cero código de producto.

**Entregables**
- Segunda aplicación de MercadoPago **«EVA Cobros»** (prod) y **«EVA Cobros (test)»** (preview), con
  `redirect_uri` estática por entorno y signing secret propio. EVA nunca reusa el AppID
  `539042216877374` del billing.
- Las **10 envs** de Vercel (Production + Preview, todas **Sensitive**, ninguna `NEXT_PUBLIC`): las 9 de
  OUTLINE §15 más **`COBROS_WEBHOOK_REQUIRE_SIGNATURE`** (default `false` hasta que X1 confirme qué
  secret firma, R22). Y las 2 claves de Edge Config (`COBROS_KILL_SWITCH`, `COBROS_BETA_COACH_IDS`).
- **Tareas legales — BORRADOR (R21)**, todas como entregable de esta wave y sin
  tocar producción: `LEGAL-01` borrador del texto de cobros para `apps/web/src/app/legal/page.tsx`;
  borrador del **anexo «Cobros»** de `docs/legal/tos.md` (contrato estándar de EVA parametrizado con
  `client_billing_plans.description`, monto, periodicidad, día de cobro, gracia, forma de cancelar,
  responsable = el coach y sus datos); borrador del párrafo de **privacidad** (qué datos del alumno ve
  MP y cuáles EVA) y del **DPA** coach↔EVA; y el texto de **retracto** (10 días) marcado
  «VALIDAR CON ABOGADO» en TESTING-LEGAL.
  **Regla única de publicación (C-09, cierra las cuatro versiones que había): borrador en W0 ·
  revisado por el abogado, PUBLICADO en producción y ACEPTADO por el coach (con `terms_version`
  guardado) ANTES de W6 · W7 solo revalida versiones y deja el enlace en las docs.** El motivo es que
  la beta de W6 cobra **plata real** y el coach acepta el anexo con `terms_version` para poder crear un
  plan. Los borradores **no** bloquean W1-W5; **bloquean W6** (encender la beta), y por lo tanto también
  GA. La publicación ocurre en **una sola ola**: ni en W2 (que tiene prohibido tocar esos archivos) ni
  otra vez en W7.
- Consulta al contador (Ley 21.713 / Circular 39-2025). Hallazgo de investigación (s6), no opinión
  legal: **no bloquea** W1-W6 (tampoco la beta), sí bloquea GA (W7).

**Archivos a editar**: `.env.example` (nombres, sin valores) · `docs/operations/MANUAL_TASKS.md`
(entradas `COB-01`..`COB-09`, ver §5 Operación).

**Gates**: `pnpm docs:check`.

**Riesgo → mitigación**: crear la app MP con la misma cuenta dueña de «EVA SPA» puede impedir que esa
misma cuenta actúe de vendedor en el QA (s2 §4.2) → el coach de prueba del nivel C es **otra** cuenta
MP (socio o segunda cuenta del owner), decidido en W0 y anotado en `MANUAL_TASKS.md`.

**Rollback**: borrar las envs. Nada desplegado.

**Dependencias**: ninguna. Puede correr en paralelo con la escritura del SPEC.

---

## W1 — Datos + motor puro + flags (3-4 días-agente · Opus)

**Objetivo**: el esquema completo, las RPCs de plata, la función de estado con el gate DB fail-open
enchufado y **el flag de producto**, sin una sola pantalla. Todo aditivo y con el feature apagado.

**Entregables**: **16 migraciones** (M1..M16, 10 tablas nuevas), `@eva/cobros`, las **RPCs
`private.cobros_*`** (R13), `private.cobros_gate_enabled()` + `public.platform_flags` (R14),
`private.student_billing_allowed`, **`apps/web/src/lib/cobros/flags.ts` con `resolveCobrosAccess` y los
tipos compartidos** (R18), los **exports parametrizables del cliente MP viejo** (R18), tests SQL y vitest.

**Migraciones — la lista única (nombres, orden, timestamps, DDL y rollback) vive SOLO en
[DATA-SECURITY §1](DATA-SECURITY.md) (R17). Este PLAN no la repite: la cita por nombre `M-n`.**
Son **16** migraciones, una por objeto, forward-only e idempotentes, en el orden de esa sección:
**M1** `coach_billing_settings` → **M2** `client_billing_plans` → **M3** `student_billing_charges` →
**M4** `student_subscriptions` → **M5** `student_payment_events` → **M6** `coach_payment_connections` →
**M7** `coach_payment_connection_events` → **M8** columnas de cobros en `client_payments` →
**M9** `REVOKE ALL ON client_payments FROM anon` → **M10** `client_email_ledger` →
**M11** bucket `payment-receipts` → **M12** `public.platform_flags` + `private.cobros_gate_enabled()` →
**M13** `student_billing_consents` → **M14** las cuatro RPCs `private.cobros_*` →
**M15** `private.student_billing_allowed` → **M16** `create or replace private.student_write_allowed`.
Si un número o un nombre difiere de DATA-SECURITY §1, **gana DATA-SECURITY** y se corrige acá.

**El rollback de cada migración es un archivo propio** `supabase/tests/<mismo_nombre>_rollback.sql`
(16 archivos; convención viva: ya hay 8 `*_rollback.sql` allí). No existe un
`cobros_schema_rollback.sql` único: se revierte de a una para poder bisecar.

**Lo que esta wave tiene que vigilar de esa lista** (el contenido completo está en DATA-SECURITY §1):
- **M2/M3/M8 no son migraciones nuevas de esta ronda**: `description text` ≤ 140 (R21) va **dentro**
  de M2; el borrado del unique sobre `student_billing_charges.payment_id` (R16) va **dentro** de M3;
  `periods_covered int default 1` (R16) y los estados `duplicate|refunded|charged_back` (R9) van
  **dentro** de M8. Son criterios de aceptación de esas tres, no archivos aparte (ninguna está
  aplicada todavía, así que no se rompe «nunca se edita una migración aplicada»).
- **M8**: todas las columnas nuevas **nullable con default** (K12, `apps/enterprise` congelada).
- **M9**: censo previo de lectores `anon` en el header + rollback propio de una línea; se declara en
  `CURRENT.md` como hallazgo de seguridad cerrado en el tren (DECISIONS-2 §PLAN).
- **M12 antes que M15**: el gate llama a `private.cobros_gate_enabled()` (R14), con **fila ausente =
  encendido**; `platform_flags` es service-role-only.
- **M13**: `student_billing_consents` (R21), retención 24 meses y **excluida de `purge-data`**.
- **M14**: las RPCs `private.cobros_*` (R13) son `security definer`, con `select … for update` sobre el
  plan, y **sin grant a `authenticated`**.
- **M15**: solo crea `private.student_billing_allowed(uuid, text, text)` fail-open con la rama de
  módulo apagado. **No toca el gate viejo.**
- **M16**: el único `create or replace` sobre `private.student_write_allowed`, **preservando K1 letra
  por letra**, con el `EXPLAIN (ANALYZE)` antes/después pegado en su header. **Si el EXPLAIN empeora
  > +15 %, M16 se difiere a una ola posterior** y el corte queda en proxy + API, reversible
  (DECISIONS-2 §DATA-SECURITY); se documenta en el RUNBOOK.

**Por qué M15 y M16 van separadas** (DATA-SECURITY §1): M16 es la única que toca el camino caliente
de las 8 policies RESTRICTIVAS y el contrato NUT-033. Separada, se revierte el término del gate en una
pasada **sin** tocar la función nueva ni las tablas, que es exactamente lo que se necesita si el
`EXPLAIN` sale mal en LIVE.

**Archivos a crear (código)**
- `packages/cobros/package.json`, `index.ts`, `state.ts`, `periods.ts`, `schemas.ts`, `copy-keys.ts`
  y sus `*.test.ts` hermanos (convención de `packages/schemas`: un `.test.ts` por `.ts`). `state.ts`
  deriva los **seis** estados de R1 (`off | ok | due_soon | due | unpaid | ended`).
- **`apps/web/src/lib/cobros/flags.ts` (R18)** — `resolveCobrosAccess` + lectores de env y de Edge
  Config (calcado de `apps/web/src/lib/student-access.server.ts:25-34`, cacheado por isolate como
  `proxy.ts:357-375`), con `.test.ts`. **Es el único punto de verdad del gate de producto** (§3) y
  nace acá, no en W1.5: es lo que hace verdadero el paralelismo W2 ∥ W3.
- `apps/web/src/lib/cobros/types.ts` (tipos compartidos web↔servicio, R18).
- Tests SQL (nombres canónicos de DATA-SECURITY, **sin variantes**): `supabase/tests/cobros_grants.sql`
  (§13.1), `supabase/tests/cobros_isolation.sql` (§13.2) y
  `supabase/tests/cobros_gate_equivalence.sql` (§2.2) — este último es **el** test de equivalencia del
  gate; no existe ningún `student_billing_gate_equivalence.sql`. Se suma
  `supabase/tests/cobros_rpc_atomicity.sql` (R13: la RPC deja cuota + pago + `paid_through` coherentes o
  no deja nada).
- Los 16 `supabase/tests/*_rollback.sql` de la tabla de arriba.

**Archivos a editar**
- `pnpm-workspace.yaml` no cambia (`packages/*` ya está); `apps/web/package.json` y
  `apps/mobile/package.json` suman la dependencia `@eva/cobros` **solo cuando la usan** (W1.5/W2/W4).
- `apps/web/src/lib/database.types.ts` — regenerar tras las 16 migraciones.
- `packages/tiers/index.ts` — capability `canUseCobros` en `TierCapabilities` + `TIER_CAPABILITIES`
  (`free:false`, `starter:false`, `pro/elite/growth/scale:true`) + accesor fail-closed
  `isCobrosAllowed(tier)`, calcado de `isBrandingAllowed`.
- `packages/tiers/pricing-v3.test.ts` (o test hermano nuevo) — la tabla de capabilities.
- **`apps/web/src/lib/payments/providers/mercadopago.ts` (R18, adelantado desde W5)** —
  `mpRequest/mpPostJson/mpPutJson` aceptan `accessToken` con `getMpAccessToken()` como **default** de
  los callers actuales, y se **exportan** `buildMpHeaders` y `getMpAccessToken`. Cambio compatible
  hacia atrás, **commit aparte**, con `apps/web/src/app/api/payments/webhook/route.test.ts` (K9) verde
  **antes y después en esta misma wave**. Sin esto, W5 no puede llamar a MP con el token del coach y
  W2/W3 no pueden arrancar en paralelo sin miedo a un merge sobre el billing viejo.

**Contratos**: K1, K3, K9, K12. `supabase/tests/student_gate_equivalence.sql` debe seguir pasando
**sin editarlo**.

**Gates**: `pnpm exec vitest run packages/cobros packages/tiers apps/web/src/lib/cobros apps/web/src/app/api/payments/webhook/route.test.ts apps/web/src/lib/payments` ·
`pnpm typecheck` · `get_advisors` (security + performance) antes y después · los 4 `.sql` de
`supabase/tests/` (`cobros_grants`, `cobros_isolation`, `cobros_gate_equivalence`,
`cobros_rpc_atomicity`) corridos a mano en `BEGIN; … ROLLBACK;` · el bloque `EXPLAIN (ANALYZE)` de
DATA-SECURITY §2.1 (escritura de `workout_logs` y `check_ins`) antes y después de **M16**, pegado en el
header de M16.

**Riesgos → mitigación**
1. *M16 mete un término nuevo en el camino caliente de 8 policies RESTRICTIVE sobre 4 tablas*
   (r2 §5.2) → `EXPLAIN (ANALYZE)` obligatorio (lo exige `20260728125000:66-69`); si el plan
   empeora > +15 %, se **difiere M16** (corte por proxy + API, reversible) y se documenta en el RUNBOOK.
2. *El `REVOKE` de M9 rompe un lector `anon` desconocido* → censo previo y ventana baja;
   rollback = un `GRANT` de una línea.
3. *FK sin índice dispara advisor de performance* (precedente `20260826010728`) → cada FK nueva lleva
   su índice en la misma migración. *Tipos desincronizados* → `database.types.ts` se regenera en la
   wave, no al final.
4. *El refactor del cliente MP viejo (R18) toca código de plata que hoy funciona* → commit aparte, K9
   verde antes y después, y ningún caller nuevo hasta W5.

**Rollback**: **uno por migración**, aplicados en orden inverso (M16 → M1). El más barato y el que más
probablemente se use es el de M16 solo (devuelve `student_write_allowed` a su texto de
`20260728125000`); los de M1..M15 dropean tablas, funciones y RPCs vacías. Como todo
es aditivo y nadie escribe todavía, el rollback es de riesgo bajo. El refactor de `mercadopago.ts`
**no** se revierte: es compatible hacia atrás por diseño.

**Dependencias**: W0 (nada, en realidad: W1 no necesita credenciales de MP).

---

## W1.5 — Cimientos de servidor (1 día-agente · Opus)

**Objetivo**: dejar cerrado **todo lo que W2 y W3 comparten** y que no cabía en W1, para que después sí
puedan correr en paralelo de verdad. Sin una sola pantalla. Existe porque el paralelismo W2 ∥ W3 era
ficticio: W3 (proxy, `/c/[slug]/pagos`, claim, sweep, correos) consume los repositorios y el servicio de
confirmación, y ambos nacían dentro de W2. **El flag (`lib/cobros/flags.ts`, `resolveCobrosAccess`) y
los tipos ya están cerrados en W1 (R18)**: esta wave los consume.

**Archivos a crear**
- `apps/web/src/lib/cobros/state.ts` (re-export de `@eva/cobros`) y `apps/web/src/lib/cobros/copy.ts`.
- `apps/web/src/infrastructure/db/cobros-settings.repository.ts`,
  `cobros-plans.repository.ts`, `cobros-charges.repository.ts` (service-role, guard de pertenencia
  **siempre**; molde `coach-email-ledger.repository.ts`), con sus `.test.ts`.
- `apps/web/src/services/cobros/charges.service.ts` y `confirm-payment.service.ts` (+ `.test.ts`):
  **toda mutación de plata pasa por las RPCs `private.cobros_*` de M14 con service-role (R13)** —
  `confirmCharge` invoca `private.cobros_confirm_charge`, que es quien hace el `select … for update` y
  actualiza cuota + pago + `paid_through` en una transacción. **No** se arma la transacción en TS:
  supabase-js/PostgREST no tiene `withTransaction`. El servicio queda idempotente por
  `client_payments.charge_id` y respeta la regla de `paid_through` de R8 (avanza por confirmaciones;
  retrocede **solo** por deshacer, reembolso o contracargo). Lo llaman W2 (coach confirma), W3 (sweep y
  correo E5) y W5 (webhook): por eso nace acá y no en ninguna de las tres.
- `apps/web/src/services/cobros/undo-confirmation.service.ts` (+ `.test.ts`) — **R8**: «Deshacer
  confirmación» sobre `private.cobros_undo_confirmation` (solo la ÚLTIMA confirmación de la cuota,
  ≤ 7 días, auditada). Lo consumen W2 (web) y W4 (RN lee, no deshace).

**Contratos**: K3 (fail-OPEN), K11.

**Gates**: `pnpm exec vitest run apps/web/src/lib/cobros apps/web/src/services/cobros` ·
`pnpm typecheck` · `pnpm lint` sobre lo tocado.

**Riesgo → mitigación**: *`confirm-payment.service` se congela antes de saber lo que el riel MP
necesita* → su firma acepta `source`, `providerPaymentId` y `periodsCovered` (R16) desde el día 1 (los
cuatro valores del CHECK de M8), aunque W2 solo use `'manual'`. Si aun así hay que tocarlo en W5, se
toca con la suite de W1.5 verde antes y después.

**Rollback**: código muerto detrás de `COBROS_ENABLED` sin setear. Nada desplegado que se vea.

**Dependencias**: W1 (tablas, RPCs M14, `@eva/cobros` y `lib/cobros/flags.ts`). **Bloquea a W2 y a W3.**

---

## W2 — Coach web, modo manual (6-8 días-agente · Opus ×2 en paralelo por superficie)

**Objetivo**: el coach puede crear un plan de cobro, ver quién le debe y confirmar un pago. Sin MP.

**Archivos a crear** (los cimientos compartidos —`lib/cobros/flags.ts` y los tipos desde **W1** (R18);
`state.ts`, `copy.ts`, los tres repositorios, `charges.service.ts`, `confirm-payment.service.ts` y
`undo-confirmation.service.ts` desde **W1.5**— **ya existen**: esta wave los consume, no los crea)
- `apps/web/src/services/cobros/`: `settings.service.ts`, `plans.service.ts` (+ `.test.ts` hermanos).
  `plans.service.ts` exige `description` (R21, ≤ 140, va en E0/E5/E6), inicializa `paid_through =
  first_due_on` (R2) y dispara **E0 «tu coach activó tu cobro»** al crear el plan (R21).
- `apps/web/src/app/coach/cobros/`: `page.tsx`, `_components/` (KPIs, tabla del mes, «Cómo cobras»,
  onboarding de 3 pasos), `_actions/cobros.actions.ts`, `_data/cobros.queries.ts`.
- `apps/web/src/app/coach/clients/[clientId]/_components/PagosTab.tsx` + `ConfirmPaymentDialog.tsx` +
  `apps/web/src/app/api/cobros/clients/[clientId]/plan/route.ts` (carga diferida de la pill).

**Archivos a editar (todos existen, verificado)**
- `apps/web/src/app/coach/tools/_components/ToolsHub.tsx` — sección «Tu negocio» + tarjeta «Cobros»
  en un array propio `BUSINESS_TOOLS: BusinessToolDef[]` (`key: 'cobros'`, **no** es `ModuleKey`);
  **`active` se calcula con `resolveCobrosAccess`, nunca con los add-ons comprados (R20)**; Free ve la
  tarjeta inactiva.
- `apps/web/src/app/coach/clients/[clientId]/ProfileTabNav.tsx` — 6.ª pill `pagos → Pagos` en `TABS`.
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` — rama de render + fetch
  diferido al abrir la pill (el comentario `:20-22` explica por qué la pestaña se borró: **no** volver
  a cosechar `client_payments` en cada carga de ficha).
- `apps/web/src/app/coach/clients/[clientId]/_data/ficha-panel.data.ts` y
  `apps/web/src/app/coach/clients/CoachFichaPanel.tsx` — el master-detail es la **segunda**
  encarnación de la ficha; si no se cablea, la pill existe en una ruta y no en la otra.
- `apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts` — acciones nuevas.
- `apps/web/src/app/coach/dashboard/_components/sheets/RevenueSheet.tsx` → «Cobros del mes» (reusar
  los badges `Al día / Vencido / Sin pago` y sumarles `En gracia`, `Cortado`, `Avisó que pagó`;
  migrar de `emerald-500`/`orange-500` crudos a `Badge tone="success|warning|neutral"`).
- `apps/web/src/app/coach/dashboard/_components/header/QuickActionsBar.tsx` y
  `_components/payments/QuickAddPaymentModal.tsx` — `+ Pago` abre el diálogo nuevo con selector de
  alumno **y cuota**.
- Roster (5 archivos, todos en `apps/web/src/app/coach/clients/`): `directory-types.ts`
  (`DirectoryRiskFilter` += `por_cobrar`), `DirectoryActionBar.tsx` (label), `DesktopRosterTable.tsx`
  (chip + columna «Pagos» + header CSV), `DirRowCard.tsx`, `ClientsDirectoryClient.tsx` (predicado);
  y `ClientActionsSheet.tsx` (ítem «Confirmar pago»).
- `apps/web/src/app/coach/clients/_components/AddStudentStepper.tsx` — el `<details> Opcional` pasa a
  «Cobro (opcional)» con el form inline cuando el módulo está activo.
- `apps/web/src/services/client/client.service.ts` — ⚠️ `assertCoachCanManageClient` exige
  `is_active = true` (r3 §2.1): el corte por impago **no** puede escribir `is_active`; esta wave
  documenta el acoplamiento con un test.
- `apps/web/src/lib/constants.ts` (`COBROS_ENABLED` server-only, junto a `CHANGE_CARD_ENABLED:168`).
  **Los archivos legales (`apps/web/src/app/legal/page.tsx`, `docs/legal/tos.md`, privacidad, DPA)
  NO se tocan en esta wave**: borrador en W0 y publicación en la **ola legal previa a W6** (R21 /
  DECISIONS-2 / C-09). Lo que sí entra acá es el **consumo**: `plans.service.ts` guarda el
  `terms_version` aceptado por el coach al crear el plan.

**Contratos**: K11, K12, y el costo por render de la ficha (comentario `client-detail.service.ts:146-150`).

**Gates**: `pnpm exec vitest run apps/web/src/services/cobros apps/web/src/lib/cobros packages/tiers` ·
`pnpm typecheck` · `pnpm lint` sobre lo tocado · `pnpm check:tokens` (badges nuevos).

**Riesgos → mitigación**
1. *Reponer la pill reabre el costo de `client_payments` en cada carga* → carga diferida por route
   handler al abrir la pestaña, nunca en el bundle de la ficha.
2. *Se cablea solo una de las dos fichas* → tarea explícita y test de render del master-detail.
3. *El coach Free ve el módulo* → `resolveCobrosAccess` server-side en cada action y `notFound()` en
   la RSC (patrón `coach/subscription/update-card/page.tsx:23`).

**Rollback**: `COBROS_ENABLED` sin setear ⇒ tarjeta oculta, pill oculta, actions 403. Sin migración
que revertir.

**Dependencias**: W1 **y W1.5**. Recién con las dos cerradas puede correr **en paralelo con W3** (R18):
los únicos archivos que las dos waves tocarían a la vez (`packages/cobros`, `lib/cobros/flags.ts` y los
tipos —congelados en **W1**—, `lib/cobros/{state,copy}.ts`, los tres repositorios,
`confirm-payment.service.ts` y `undo-confirmation.service.ts` —congelados en **W1.5**—) ya están
cerrados antes de que arranquen. W2 escribe UI de coach y
`services/cobros/{settings,plans}.service.ts`; W3 escribe alumno, correos y cron.

---

## W3 — Alumno web + correos + cron (3-4 días-agente · Opus)

**Objetivo**: el alumno ve su estado, avisa que pagó, recibe recordatorios y se corta solo al vencer
la gracia.

**Archivos a crear**
- `apps/web/src/app/c/[coach_slug]/pagos/page.tsx` + `_actions/pagos.actions.ts` (claim, cancelar,
  comprobante, toggle de recordatorios) + `_components/`; y `api/cobros/receipt/route.ts` (subida
  firmada al bucket privado).
- `apps/web/src/services/cobros/claims.service.ts` + `.test.ts` — **el servicio único del claim (R19)**:
  lo consumen la server action de la web y la ruta bearer de RN (`api/mobile/student/cobros/claim`,
  W4). Máx. 1 claim vivo por cuota, C2 al coach al instante + recordatorio diario, y el botón
  «Rechazar el claim» del coach que vuelve al calendario normal (R3).
- `apps/web/src/lib/student-billing.ts` + `.server.ts` + `.test.ts` (resolver del alumno; **fail-open**).
- Correo: `apps/web/src/lib/email/cobros-format.ts` (`formatClp`/`formatEmailDate`/`escHtml` en **un**
  lugar), `cobros-templates.ts` (alumno) y `cobros-coach-templates.ts` (coach) + sus `.test.ts`.
  **Las plantillas son 22 en total** (13 al alumno + 9 al coach, EMAILS §9: sobre las 16 previas, R21
  suma E0, R9 suma E11/C7/C8, R5 suma C6, R3 suma C2-bis, y E1-link siempre contó aparte). Esta wave
  construye **11**: **E0** «tu coach activó tu cobro» (R21, con monto, ciclo, primer vencimiento, cómo
  pagar y quién responde), E1, E1-link, E2, E3, **E4 con sus dos variantes `unpaid` y `ended`** (R1),
  E5, E10, C1, C2 y **C2-bis** (recordatorio diario del claim, R3 — sin él el claim queda cojo). Las
  **11 restantes** (E6, E7, E8, E9, E11, C3, C4, C5, C6, C7, C8) entran en W5.
  `apps/web/src/infrastructure/db/client-email-ledger.repository.ts`,
  `apps/web/src/services/email/client-email-ledger.service.ts` (`sendCobrosEmailOnce`).
- **Kill-switch de un solo click (R14)**: `apps/web/src/app/api/admin/cobros/kill-switch/route.ts` +
  el botón en `apps/web/src/app/admin/(panel)/sistema` (server action en su `_actions`). Un POST
  autenticado como admin **apaga las dos palancas a la vez**: escribe `COBROS_KILL_SWITCH=true` en Edge
  Config (Vercel API) **y** pone `platform_flags.enabled=false` para `key='cobros_gate'` (service-role).
  Si una de las dos falla, responde 500 diciendo **cuál quedó encendida**; nunca reporta éxito parcial.
  El mismo endpoint enciende de vuelta. El RUNBOOK documenta las dos palancas y el fallback manual
  (SQL + panel de Edge Config) por si el endpoint no responde.
- `apps/web/src/services/cobros/sweep.service.ts` + `emails.service.ts` (+ tests) y
  `apps/web/src/app/api/cron/cobros-sweep/route.ts` (I/O) con la decisión pura en
  `apps/web/src/lib/cobros/sweep-decision.ts` + `.test.ts` (patrón `paid-expiry.ts` + su test). La
  decisión pura dispara **por umbral (`≤`), nunca por igualdad de fecha**, con dedupe en
  `client_email_ledger` (R4), y respeta el claim vivo: E2/E3/E4 al alumno **suspendidos** y corte
  **diferido hasta 5 días** tras el fin de la gracia, con recordatorio diario al coach (R3).

**Archivos a editar**
- `apps/web/src/proxy.ts` — **R15: el plan NO se embebe en el SELECT de identidad de `:1229`** (un
  42501 sobre las tablas nuevas dejaría al alumno fuera de la app). Se hace una **segunda consulta
  service-role**, solo para clientes **standalone** (no org/team), dentro de un `try/catch`
  **fail-open** (cualquier error ⇒ se sigue sin cortar), reusando los datos del coach (tier y estado de
  suscripción) que el proxy **ya trae**. Bloque nuevo tras `:1373/:1383`; **precedencia escrita**:
  `readonly` (coach moroso con EVA) > `archived/paused` > `unpaid`/`ended` > `due`. `/e` y `/t` no
  cambian. Costo: 1 query extra por request de alumno — aceptable con 110 alumnos; **se mide p75
  durante la beta** (§3).
- `apps/web/src/proxy.test.ts` — casos de precedencia, de fail-open sin ancla y **de fail-open cuando
  la segunda consulta tira error o timeout** (R15), más el caso org/team (no se consulta nada).
- `apps/web/src/app/c/[coach_slug]/suspended/page.tsx` — **dos** variantes, las mismas que emite el
  proxy (R1/R7): `?reason=unpaid` (web SÍ lleva botón de pago) y **`?reason=ended`** («Tu plan con
  {coach} terminó», **sin CTA de pago**, con el camino para contactar al coach). Sin la segunda, el
  `ended` que el proxy ya redirige cae al default «Acceso pausado». Cualquier otro `reason` mantiene el
  default.
- `apps/web/src/app/c/[coach_slug]/layout.tsx` — banner `due_soon` / `due`.
- `apps/web/src/app/api/webhooks/resend/route.ts` — buscar también en `client_email_ledger` cuando
  `coach_email_ledger` no matchea, **sin cambiar los códigos de respuesta**.
- `vercel.json` — cron `/api/cron/cobros-sweep` en **`45 12 * * *`** (después de `paid-expiry`
  `30 12`, antes de `cap-nudge` `0 13`; horario confirmado en DECISIONS-2 §PLAN).
- `apps/web/src/lib/push-events.ts` — eventos `cobros_claim_received`, `cobros_payment_received`,
  `cobros_daily_digest`, `cobros_payment_confirmed`, `cobros_access_paused`, `cobros_access_restored`
  (todos best-effort, gateados por `isPushEventEnabled`; **sin** push de recordatorio al alumno).

**Contratos**: K2, K3, K10. El alumno demo (`is_demo`), org/team y archivados quedan **fuera** del
barrido (precedente `checkin-reminder/route.ts:71`).

**Gates**: `pnpm exec vitest run apps/web/src/proxy.test.ts apps/web/src/lib/cobros apps/web/src/lib/email/cobros-templates.test.ts apps/web/src/services/cobros` ·
`pnpm typecheck` · `pnpm lint` · corrida del cron con `?dry=1` en preview.

**Riesgos → mitigación**
1. *El cron en preview le escribe a alumnos reales* → no setear `RESEND_API_KEY` en Preview
   (precedente `MANUAL_TASKS.md:61` con `RESEND_WEBHOOK_SECRET`) **y** guard por `VERCEL_ENV`.
2. *Fire-and-forget muere en Vercel* (r4 §5.4, memoria del 17-08) → todo envío se `await`ea.
3. *Reputación del dominio* → ledger fail-CLOSED en el cron, espaciado 600 ms, rebotes registrados,
   `EVA_COBROS_EMAILS_DISABLED` propio (no reusar `EVA_SALES_EMAILS_DISABLED`).
4. *El corte por proxy no cubre prefetch* (`proxy.ts:1177-1179`) → la barrera real es
   `private.student_billing_allowed` en DB (M15+M16), no el proxy.

**Rollback**: el **endpoint admin de kill-switch** (R14) apaga en un click Edge Config
(`COBROS_KILL_SWITCH=true`) **y** `platform_flags.cobros_gate` ⇒ gate SQL, gate de proxy, cron y correos
quedan mudos **sin deploy**. No cancela suscripciones (R5: el kill-switch es temporal).

**Dependencias**: W1 (`lib/cobros/flags.ts`, `platform_flags`/`cobros_gate_enabled`, RPCs) **y W1.5**
(`cobros-charges/plans.repository`, `confirm-payment.service.ts`). Paralelo con W2, no antes.

---

## W4 — React Native (2,5-3 días-agente · Opus)

**Objetivo**: estado y confirmación en la app. **Cero** configuración de plata, cero links, cero montos
del tarifario de EVA.

**Archivos a crear**
- `apps/mobile/components/WebOnlyHint.tsx` + `apps/mobile/lib/web-only-hint.ts` — **R6: UN copy, sin
  dominio, iOS = Android** («El cobro a tus alumnos se configura desde el computador»; variante ficha:
  «El cobro de este alumno se configura desde el computador»). El literal vive **solo** en
  `web-only-hint.ts`; **NO se crea `STORE_COBROS_SETUP_CAPTION` en `client-cap.ts`** y el topic `plan`
  sigue usando `storePlanChangeCaption(platform)` sin cambios. `tests/mobile/store-copy.test.ts` se
  amplía para pinnear que el hint **no** contiene «eva-app.cl» ni «http»; más
  `tests/mobile/web-only-hint.test.ts`; y
  `apps/mobile/app/coach/cobros.tsx` (lista del mes + confirmar; sin ajustes, sin conectar MP).
- `apps/web/src/app/api/mobile/coach/cobros/route.ts` (lista + confirmar; bearer, molde
  `api/mobile/coach/payments/route.ts`) y `api/mobile/coach/clients/[clientId]/cobros/route.ts`
  (plan + historial).
- ✅ **`apps/web/src/app/api/mobile/student/cobros/claim/route.ts`** — **ruta aprobada por R19** (ya no
  es una alternativa a discutir): el botón «Avisar a mi coach» del alumno en RN no tiene por dónde
  entrar sin esto. M1-M16 dejan las tablas nuevas con
  `revoke all … from authenticated` + `grant select` acotado (DATA-SECURITY §1, invariante I-1), así
  que PostgREST directo desde la app **no** puede escribir `student_billing_charges.status='claimed'`;
  y el resto de W4 solo crea rutas de coach. Contrato, molde `api/mobile/checkin-submitted/route.ts`:
  `POST` con bearer verificado por `admin.auth.getUser(token)`; el `clientId` **sale de la sesión**,
  nunca del body (test de IDOR: bearer del alumno A + `chargeId` de B ⇒ 404, sin filtrar existencia);
  Zod `{ chargeId: uuid }` — **sin nota y sin archivo adjunto desde RN (R19)**; rate limit
  `rateLimitCobrosClaim` 3/día por alumno y **máx. 1 claim vivo por cuota (R3)**; respuesta **sin monto,
  sin instrucciones de pago, sin `checkout_url`** — solo `{ ok, claimedAt }` (K4 y T-20). **Web y RN
  llaman al MISMO servicio** (`services/cobros/claims.service.ts` de W3): la ruta es solo el borde
  bearer. Efecto del claim: difiere el corte hasta 5 días y suspende E2/E3/E4, nunca reactiva (R3).

**Archivos a editar**
- `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` — **revivir** como pill «Pagos»
  (hoy huérfano, único hit es su propia declaración); corregir el drift `'#F59E0B'` → `warning-500`;
  y **R8**: las filas con `charge_id` **pierden el ícono de borrar** y ganan «Deshacer confirmación»
  (solo la última confirmación de esa cuota, ≤ 7 días, vía la server action de W1.5). Los pagos legacy
  **sin** `charge_id` conservan el borrado actual.
- `apps/mobile/app/coach/cobros.tsx` y los puntos de entrada «+ Pago» / «Registrar pago» (R19): si el
  alumno **tiene plan**, abren «Confirmar pago» de la cuota; si **no**, el pago libre legacy, sin
  cambios.
- `apps/mobile/components/coach/clientDetail/ClientTabBar.tsx` — el tipo ya admite `'facturacion'`.
- `apps/mobile/app/coach/cliente/[clientId].tsx` — array `tabs` (`:616-641`) + `case` de render.
- `apps/mobile/components/coach/CoachDashboardSections.tsx` — `MobileBanner` «N alumnos por cobrar»
  → `/coach/cobros`; darle destino real al «Ir a facturacion» huérfano (`:2146`).
- `apps/mobile/app/coach/tools.tsx` — tarjeta «Cobros» (Pro; Free = «no incluido en tu plan»).
- `apps/mobile/components/coach/directory/CreateClientModal.tsx` — `<WebOnlyHint/>`.
- `apps/mobile/app/coach/(tabs)/subscription.tsx` — migrar el prototipo `:355-372` al componente y
  borrar `platformPlanCaption` (`:268`), o vuelve el problema que `store-copy.test.ts` previene.
- Alumno RN (6 archivos): `app/alumno/(tabs)/home.tsx` (fila «Tu plan con tu coach» + banner `due`),
  `app/alumno/(tabs)/perfil.tsx` (fila de estado), `components/alumno/home/StudentAccessBanner.tsx`
  (rama `due`), `components/alumno/StudentAccessBlocked.tsx` (**ramas `reason:'unpaid'` y
  `reason:'ended'`**, R1/R7: `STUDENT_ACCESS_COPY.blockScreen.unpaid` y `blockScreen.ended`),
  `lib/student-access-copy.ts` (copys, espejo del web — incluye `blockScreen.ended`),
  `lib/entitlements-core.ts` (normalizar `reason` con fail-open). El **test de espejo web↔RN cubre los
  seis estados de R1** (`off | ok | due_soon | due | unpaid | ended`), con caso propio para `ended`:
  `/c/[slug]/suspended?reason=ended` y `blockScreen.ended` tienen que decir lo mismo (K10).
  ⚠️ `app/alumno/suspended.tsx` **no se toca**: el corte por impago **no cierra sesión**, así que el
  alumno moroso nunca llega ahí. Esa pantalla vive del caché de `account-status`, que K8 congela y que
  descarta el objeto entero si `reason` no es `archived|paused|null`
  (`apps/mobile/lib/student-account-status.ts:23`) — una rama `unpaid` ahí sería código muerto. La
  pantalla real del moroso es `StudentAccessBlocked`, montada por `app/alumno/_layout.tsx:100-107`
  cuando `studentAccess.state === 'blocked'`.
  Y `STUDENT_ACCESS_COPY.blockScreen` suma una **variante neutra** que sirve para las dos causas (coach
  moroso con EVA y alumno moroso con su coach), porque los binarios pre-OTA la van a mostrar igual (ver
  §4): hoy el único texto es «El plan de tu coach está inactivo»
  (`apps/mobile/lib/student-access-copy.ts:34`), que para un alumno impago es falso.
- `apps/web/src/app/api/mobile/config/route.ts` — **R7**: `studentAccess: { state:'blocked',
  reason:'unpaid'|'ended' }` + `studentBilling` (`{ state, paidThrough, cutsAt, canClaim }` — el nombre canónico es **`cutsAt`**, el
  que ya devuelve la función pura de DATA-SECURITY §3.1; no existe `dueUntil`).
  **Nunca** `checkout_url` ni monto de EVA. Los binarios viejos muestran la pausa genérica (seguro); el
  OTA agrega el copy por `reason`.
- `apps/mobile/AGENTS.md` — 3 filas nuevas en la tabla de guards (§Docs).
- `tests/mobile-no-prices.test.ts` — excepción **angosta**: montos que vienen de datos sí; literales
  del tarifario no. Ampliar la lista de literales prohibidos, nunca aflojar el guard.

**Contratos**: K4, K5, K6, K7, K8, K10.

**Gates**: `pnpm --filter @eva/mobile exec tsc --noEmit` ·
`pnpm exec vitest run tests/mobile-no-prices.test.ts tests/mobile/store-copy.test.ts tests/mobile/store-compliance.test.ts tests/mobile/client-cap.test.ts tests/mobile/web-only-hint.test.ts` ·
`pnpm check:tokens` · `pnpm exec vitest run apps/web/src/app/api/mobile`.

**Riesgos → mitigación**
1. *Un revisor de Apple lee el monto de la mensualidad del coach como precio de EVA* → en el alumno,
   **cero monto** en RN (solo fecha y estado); el monto vive en la ficha del **coach**, que es su
   propio dato de negocio.
2. *Rompemos binarios 1.1.x en circulación* → `account-status` no cambia (K8) y el campo nuevo viaja
   por `/api/mobile/config`, que tolera desconocidos. Ojo: **un binario pre-OTA no ignora el corte**
   —`toStudentAccess` mapea `'blocked'` a `'blocked'` (`entitlements-core.ts:105-113`)— sino que lo
   aplica con el copy equivocado; de ahí la variante neutra y el orden del §4.
3. *`whatsapp` del coach llega `null`* (`account-status/route.ts:38`) y el CTA «Escribir a mi coach»
   —único camino permitido en iOS— nunca aparece → **W4.8: poblar `whatsapp` en `account-status` entra
   en este tren y es bloqueante de W4** (DECISIONS-2 §PLAN). **Fallback si el coach no tiene teléfono:
   `mailto:` al correo del coach** (mismo botón, otro esquema); el `wa.me` sigue **sin** parámetro
   `text` con `$` ni «pagar» (guard de `apps/mobile/AGENTS.md`).

**Rollback**: OTA de reversión al runtime anterior (`mobile-ota.yml`) + `COBROS_KILL_SWITCH`.

**Dependencias**: W2 y W3 (necesita las rutas y el resolver).

---

## W5 — Riel MercadoPago (5-7 días-agente · Opus, con juicio del jefe en el webhook)

**Objetivo**: el coach conecta su MP; EVA emite links por ciclo y suscripciones; el webhook confirma y
reactiva solo.

**Archivos a crear**
- `apps/web/src/lib/cobros/`: `token-crypto.ts` (AES-256-GCM, `import 'server-only'`), `mp-client.ts`
  (token **inyectado**; exige `connection`), `oauth.ts` (state HMAC + PKCE), `external-reference.ts`
  (**R10**: preferences `cobro|coachId|clientId|chargeId`; preapprovals
  `cobro|coachId|clientId|planId`, y la cuota de un `authorized_payment` se resuelve **por período**,
  nunca por el chargeId del ref), `webhook-authorization.ts` (secret de Cobros; **R22**: `?token=` +
  re-fetch + `collector_id` son la autoridad, la firma se verifica **si viene** y pasa a obligatoria
  solo cuando **`COBROS_WEBHOOK_REQUIRE_SIGNATURE=true`** —default `false` hasta que el experimento X1
  del nivel C diga qué secret firma), `reconcile-decision.ts` — todos con `.test.ts`.
- `apps/web/src/services/cobros/connection.service.ts`, `subscriptions.service.ts`.
- **`apps/web/src/services/cobros/cancel-subscription.service.ts` + `.test.ts` (R5)** — «nadie sigue
  cobrando a quien perdió el acceso»: `PUT /preapproval/{id} status=cancelled` con **reintentos y
  alerta si falla** (evento en `coach_payment_connection_events` + correo al owner). Se invoca cuando:
  (a) se **cancela el plan**; (b) el alumno se **archiva** o se **elimina**; (c) el coach
  **desconecta MP desde EVA** — se cancelan **TODAS** sus suscripciones vivas **ANTES** de revocar los
  tokens, con diálogo que lo dice; (d) el coach **baja a Free** — correo C6 + cancelación automática y
  los planes quedan `paused`. Si la desautorización llega **desde MP** (`application.deauthorized`),
  EVA ya no puede llamar a la API: conexión `revoked`, planes `mp_*` → `manual`, **C5** al coach con
  instrucciones para cancelar en su panel MP. **El kill-switch global NO cancela nada** (es temporal).
- `apps/web/src/app/api/cobros/mp/{connect,callback,webhook,disconnect}/route.ts` (el webhook con su
  `route.test.ts`, molde de oro `api/payments/webhook/route.test.ts`) y `api/cobros/checkout/route.ts`.
  El webhook implementa **R12**: insert `on conflict do nothing` en `student_payment_events`; ya
  `applied` ⇒ 200 y salir; `failed`, o `received` con más de 2 minutos ⇒ **re-procesar**; fallo
  transitorio (MP 5xx/timeout) ⇒ `failed` + **502** para que MP reintente; recurso ajeno o desconocido
  ⇒ `applied` con nota + 200. Toda mutación va por las RPCs `private.cobros_*` (R13). **X1 (R22)**: el
  webhook loguea el header `x-signature` **crudo** (sin secretos en el log) para resolver qué secret
  firma con la primera notificación real.
  `api/cobros/checkout/route.ts` registra el **consentimiento** en `student_billing_consents`
  (`kind='first_checkout'`, versión corta del aviso previo) y `subscriptions.service` el de
  `kind='subscription'` (aviso completo) — **R21**.
- `apps/web/src/app/c/[coach_slug]/pagos/retorno/page.tsx` (poll 4 s, patrón `flow-processing`) y
  `apps/web/src/app/api/cron/cobros-mp-reconcile/route.ts` (**R11**: por suscripción viva,
  `GET /authorized_payments/search?preapproval_id=…` y materializar los aprobados que falten,
  idempotente por `provider_payment_id`; para `mp_link`,
  `GET /v1/payments/search?external_reference=…`; **alert-only solo para drift de estado**).
- `apps/web/src/lib/email/cobros-templates.ts` y `cobros-coach-templates.ts` crecen con las **11
  plantillas que faltan** —E6, E7, E8, E9, E11, C3, C4, C5, C6, C7, C8 (R5/R9/R21)— hasta completar las
  **22 de EMAILS §9** (13 alumno + 9 coach): **C6** «bajaste a Free», **C7** reembolso/contracargo,
  **C8** pago duplicado, **E11** «tu pago fue reembolsado/desconocido».
- `scripts/cobros-fake-webhook.mjs` (firma webhooks a mano contra preview).

**Archivos a editar (refactor mínimo del billing viejo — cero cambio de comportamiento)**
- `apps/web/src/lib/payments/providers/mercadopago.ts` — **ya refactorizado en W1 (R18)**:
  `mpRequest/mpPostJson/mpPutJson` aceptan `accessToken` con `getMpAccessToken()` de default y
  `buildMpHeaders`/`getMpAccessToken` están exportados (el `X-scope: stage` con token `TEST-` hace falta
  en el sandbox del riel C). Esta wave **solo los consume**; si hay que tocarlos, va en commit aparte
  con K9 verde antes y después.
- `apps/web/src/lib/payments/webhook-authorization.ts` — extraer
  `verifyMercadoPagoSignature(request, dataId, secret)`; el wrapper actual lee el env; exportar
  `constantTimeEquals`. El `.toLowerCase()` del manifest es un fix ganado a golpes: **no** reimplementarlo.
- `apps/web/src/lib/payments/checkout-external-reference.ts` — validar UUID en `parts[0]` y
  early-return si el `external_reference` empieza con `cobro|` (defensa en profundidad, r1 §6.1).
- `apps/web/src/lib/payments/webhook-pipeline.ts` — no escribir `subscription_mp_id` sin plan resuelto.
- **Hooks de cancelación (R5)** — cada uno llama a `cancel-subscription.service` y **no** deja el
  camino a medias si MP falla (reintento + alerta, la operación de negocio sigue):
  `apps/web/src/services/client/client-archive.service.ts` (archivar alumno),
  `apps/web/src/services/client/client-deletion.service.ts` (eliminar alumno),
  `apps/web/src/services/cobros/plans.service.ts` (cancelar plan),
  `apps/web/src/app/api/cobros/mp/disconnect/route.ts` (desconectar MP: cancelar **antes** de revocar),
  y la baja a Free — `apps/web/src/services/billing/activate-free.service.ts` y
  `apps/web/src/app/api/cron/paid-expiry/route.ts` (correo C6 + planes a `paused`). Cada hook con su
  test; los de `client-archive`/`client-deletion` con la suite existente verde antes y después.
- `apps/web/src/app/api/payments/webhook/route.test.ts` — casos nuevos: `external_reference` con
  prefijo `cobro|` ⇒ 200 + ignorado, y no-regresión de los existentes.
- `vercel.json` — cron `/api/cron/cobros-mp-reconcile` en **`15 13 * * *`** (después de `cap-nudge`
  `0 13`; horario confirmado en DECISIONS-2 §PLAN).

**Contratos**: K9 sigue siendo el más caro. El refactor del cliente MP ya se hizo en **W1** (R18); lo
que queda acá del billing viejo (`checkout-external-reference.ts`, `webhook-authorization.ts`,
`webhook-pipeline.ts`, los hooks de R5) se commitea **aparte** del código nuevo, con
`api/payments/webhook/route.test.ts` verde antes y después.

**Gates**: `pnpm exec vitest run apps/web/src/app/api/payments apps/web/src/lib/payments apps/web/src/app/api/cobros apps/web/src/lib/cobros` ·
`pnpm typecheck` · `pnpm lint` · nivel A completo de s2 §10 (A1..A12) verde.

**Riesgos → mitigación**
1. *Un evento del riel C cae en la ruta vieja y expira a un coach pago* → app MP separada + prefijo
   reservado + early-return + test.
2. *Token del coach usado fuera del riel* (T-22) → `mp-client.ts` exige `connection`; test que falla
   si `getMpAccessToken` aparece en `lib/cobros/**`. *`checkout_url` filtrado a RN* (T-20) → test que
   falla si `checkout_url`/`init_point` aparece en cualquier respuesta de `api/mobile/**`.
3. *`invalid_grant` al refrescar* → conexión `status='error'` + correo C5; los planes `mp_*` **no
   cortan** al alumno, solo dejan de crear cuotas nuevas.
4. *Doble emisión de link* (T-19) → `X-Idempotency-Key cobro:<planId>:<v>` + unique parcial de la
   cuota. *Secretos en Sentry* → scrubbing de `access_token`, `refresh_token`, `init_point`.

**Rollback**: el kill-switch (endpoint admin, R14) apaga el webhook (responde 200 y no muta) y los
crons; los planes `mp_*` degradan a `manual` sin cortar a nadie. **No cancela suscripciones** (R5: el
kill-switch es temporal; cancelar es irreversible). El refactor de helpers **no** se revierte: es
compatible hacia atrás por diseño.

**Dependencias**: W1 + W1.5 + W2 + W3. W4 puede solaparse si son agentes distintos.

---

## W6 — QA A/B/C + beta cerrada (3-4 días-agente + 2-3 semanas de calendario · Opus + owner)

**Objetivo**: probar los tres niveles y correr la beta con plata real antes de abrir.

**Precondición que bloquea el encendido de la beta (C-09)**: los textos legales de W0 revisados por el
abogado, **publicados en producción** (`legal/page.tsx`, anexo Cobros de `docs/legal/tos.md`,
privacidad, DPA) y **aceptados por cada coach de la allowlist** con su `terms_version` registrado. Sin
eso no se prende `COBROS_ENABLED` para nadie. No se vuelve a publicar en W7.

**Entregables**: nivel A verde en CI · nivel B en sandbox MLC (OAuth, preapproval, `init_point`, matriz
`APRO/FUND/OTHE/SECU/CONT`, cancelación, aislamiento coach A↔B) · nivel C con plata real (CLP 1.000 × 2,
`frequency_type: days`, reembolso al final) · **experimento X1 (R22)**: con la **primera notificación
real** del nivel C, loguear el `x-signature` crudo y verificar el manifest contra el signing secret de
**EVA Cobros**; si valida, se sube `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true` en prod y se agrega el caso
al `route.test.ts` del webhook; si no valida, queda documentado qué secret firma y el flag sigue en
`false` con `?token=` + re-fetch + `collector_id` como autoridad · `tests/cobros-coach.spec.ts` y
`tests/cobros-alumno.spec.ts` (Playwright, serie) · **prueba del endpoint admin de kill-switch** (R14:
apaga Edge Config **y** `platform_flags` en un click, y el fallback manual del RUNBOOK funciona) ·
prueba de **cancelación de preapproval** en los 4 caminos de R5 (plan cancelado, alumno archivado,
desconexión de MP, baja a Free) · QA de device iOS y Android en claro/oscuro y con marca white-label.

**Gates**: **suite completa** (§2) una vez antes del push · `pnpm test:e2e --workers=1` · monitoreo de
`/auth/v1/health` durante la corrida.

**Riesgo → mitigación**: el sandbox de MP **no entrega webhooks** (hecho documentado, s2 §7.1) →
`scripts/cobros-fake-webhook.mjs` + Simulador del panel + nivel C obligatorio para cerrar el riel.
Playwright en paralelo tumbó el Micro de Supabase el 22-08 → 1 navegador, tandas en serie.
**Rollback**: sacar los `coach_id` de `COBROS_BETA_COACH_IDS`. **Dependencias**: W5.

---

## W7 — GA + revalidación legal + review + docs (1 día-agente · Sonnet + juicio del jefe)

**Objetivo**: abrir a todos los Pro y dejar la documentación canónica al día. **Lo legal ya está
publicado desde antes de W6 (C-09): esta wave NO vuelve a publicarlo**, solo lo revalida.

**Entregables**: **revalidación legal (R21)** — confirmar que la versión publicada antes de W6
(`apps/web/src/app/legal/page.tsx` con la sección «Cobros», el **anexo Cobros** de `docs/legal/tos.md`,
el párrafo de **privacidad** y el **DPA** coach↔EVA) sigue siendo la vigente, que el `terms_version` de
los planes creados en la beta coincide y que el texto de **retracto** tiene el visto bueno del abogado;
si el abogado pidió cambios durante la beta, se publica la versión nueva y se bumpea `terms_version` ·
`COBROS_GA=true` con la allowlist vaciada · **Notes for Review con la redacción final de R23**, sin 3.1.3(f) · `CURRENT.md`,
`MOBILE_PARITY.md`, `RUNBOOK.md`, `MANUAL_TASKS.md` (borrar lo cumplido) · spec a
`status: implemented-pending-qa`. **Gates**: `pnpm docs:check` (+ suite completa si hubo código).
**Dependencias**: W6 cerrada, respuesta del contador (COB-05) **y** aprobación explícita del owner. La
revisión legal ya se cerró antes de W6 (C-09).

---

## 3. Beta cerrada (D-D)

**Mecanismo**: tres palancas con roles separados, ninguna sustituye a las otras.

| Palanca | Tipo | Semántica | Falla a |
|---|---|---|---|
| `COBROS_ENABLED` | env server-only (Sensitive, **no** `NEXT_PUBLIC`) | launch switch; `=== 'true'` exacto | apagado |
| `COBROS_BETA_COACH_IDS` | Edge Config, array de uuid | allowlist de la beta | **lista vacía** ⇒ nadie (mientras `COBROS_GA` sea falso) |
| `COBROS_GA` | env server-only | abre a todos los Pro e ignora la allowlist | apagado |
| `COBROS_KILL_SWITCH` | Edge Config, bool | apagado de incidente **sin deploy**: gate de app, crons y webhook | **fail-OPEN** ante caída de Edge Config (no romper el feature por infra de flags) |
| `platform_flags.cobros_gate` | fila en DB (service-role-only), leída por `private.cobros_gate_enabled()` | apaga el gate **dentro de la DB**: sin ella, las policies seguirían cortando aunque Edge Config diga «apagado» | **fila ausente = encendido** (R14) |
| `COBROS_WEBHOOK_REQUIRE_SIGNATURE` | env server-only | firma del webhook obligatoria; `false` mientras X1 no confirme qué secret firma (R22) | apagado (`?token=` + re-fetch + `collector_id`) |

**Las dos palancas de apagado se mueven juntas (R14)**: el kill-switch es **un endpoint admin** que en
el mismo click escribe `COBROS_KILL_SWITCH=true` en Edge Config **y** apaga la fila
`platform_flags.cobros_gate`. Nunca se toca una sola a mano salvo fallback documentado en el RUNBOOK.

Guard compuesto server-side, único punto de verdad:
`resolveCobrosAccess(coach)` = `COBROS_ENABLED` && `!killSwitch` && (`betaIds.includes(coach.id)` ||
`COBROS_GA`) && `isCobrosAllowed(tier)` && `hasEffectiveAccess(status, currentPeriodEnd)`.
Lector de Edge Config calcado de `apps/web/src/lib/student-access.server.ts:25-34`, cacheado por
isolate como `proxy.ts:357-375`.

**Criterios de entrada** (los 3 a la vez): coach Pro activo · ≥ 5 alumnos reales no demo · acepta el
anexo T&C y declara RUT + inicio de actividades. Universo hoy: 7 coaches Pro / 55 alumnos (STATS).

**Qué se mide, 2-3 semanas** (PostHog + una query semanal a LIVE, sin montos ni `client_id`):
(1) **north-star: % de cuotas cobradas ≤ T+3**; (2) cuotas creadas/confirmadas/cortadas/reactivadas y
horas de corte (`cobros_access_restored{hours_cut}`); (3) reparto por modo y % automático; (4) claims
«ya pagué» vs. confirmaciones (tasa de forja/error); (5) correos enviados, rebotes y quejas — el
termómetro de la reputación del dominio; (6) incidentes: cortes erróneos (meta **0**), dobles cobros
(meta **0**), webhooks 5xx.

**Criterios de salida a GA** (todos): 0 cortes erróneos · 0 dobles cobros · ≥ 1 ciclo completo cobrado
por el riel MP con webhook real · tasa de rebote de correos < 2 % · el owner aprueba el QA de device ·
respuesta del contador sobre Ley 21.713.

**Quién monitorea**: el owner revisa el digest diario (C1) y el panel; el equipo revisa Sentry +
`student_payment_events` + logs de `/api/cobros/mp/webhook` una vez al día durante la beta.

**Cómo se apaga**: el **endpoint admin de kill-switch** (R14) — un click, segundos, sin deploy — apaga
Edge Config **y** `platform_flags.cobros_gate` ⇒ el gate deja de cortar (en la app **y** en la DB), los
crons no mandan correos, el webhook responde 200 sin mutar y la UI muestra estado congelado. Vaciar
`COBROS_BETA_COACH_IDS` saca a los coaches de a uno. Los datos **no** se borran y **las suscripciones
MP NO se cancelan** (R5: el kill-switch es temporal).

## 4. Entrega y OTA (secuencia con dependencias)

1. Migraciones W1 en LIVE (tablas vacías, feature apagado).
2. Deploy web con `COBROS_ENABLED` **sin setear** en Production.
3. OTA RN por `mobile-ota.yml` desde rama con master mergeado (piso OTA 1.1.2). **Sin binario nuevo**:
   no hay config plugin ni permiso nuevo. **Antes de encender la beta**, correr
   `eas channel:insights --channel production` para ver cuánta gente sigue en 1.1.1 (el piso de OTA es
   1.1.2, así que 1.1.1 **no** recibe este runtime): esos binarios se quedan con el copy viejo hasta
   que actualicen desde la tienda.
4. `COBROS_ENABLED=true` + `COBROS_BETA_COACH_IDS` con 2-3 coaches.
5. Tras W6: `COBROS_GA=true` y allowlist vacía.

**Orden que no se puede invertir**: el paso 3 va **después** del 2 pero **antes** del 4, y el motivo
**no** es que los binarios viejos hagan fail-open. Hacen lo contrario: `toStudentAccess` mapea
`state:'blocked'` a `'blocked'` (`apps/mobile/lib/entitlements-core.ts:105-113`) e ignora el `reason`
desconocido, así que `app/alumno/_layout.tsx:100-107` monta `StudentAccessBlocked` y le muestra al
alumno moroso **«El plan de tu coach está inactivo»** (`lib/student-access-copy.ts:34`), que es falso y
además culpa al coach. El fail-open de K7 aplica a estados desconocidos (`'unpaid'` inventado ⇒
`'active'`), no a `'blocked'`. Por eso: primero el OTA con la variante neutra de copy (W4), después el
flag. Y por eso los que queden en 1.1.1 —que no reciben el OTA— son un argumento más para arrancar la
beta con coaches cuyos alumnos estén al día en versión de app.

## 5. Operación

### `docs/operations/MANUAL_TASKS.md` — bloque nuevo `## P1 — Cobros coach → alumno`

- **COB-01 — Crear la aplicación de MercadoPago «EVA Cobros»** (prod + test) con la cuenta correcta
  (**no** la que actuará de vendedor en el QA), `redirect_uri` estática por entorno, signing secret, y
  el AppID guardado en el gestor de secretos del owner (nunca en el repo).
- **COB-02 — Cargar las 10 envs de Cobros en Vercel** (las 9 de OUTLINE §15 +
  `COBROS_WEBHOOK_REQUIRE_SIGNATURE=false`; Production y Preview, todas *Sensitive*, ninguna
  `NEXT_PUBLIC`), y **no** setear `RESEND_API_KEY` en Preview. Si el endpoint admin de kill-switch (R14)
  escribe Edge Config por API, sumar también el token de escritura de Vercel y el id del Edge Config,
  ambos *Sensitive* y **solo** en Production.
- **COB-03 — Crear las claves de Edge Config** `COBROS_KILL_SWITCH` (`false`) y
  `COBROS_BETA_COACH_IDS` (`[]`); verificar que el proyecto tiene `EDGE_CONFIG`.
- **COB-04 — Verificar que el bucket `payment-receipts` quedó privado** tras M11 (molde
  `_POST_DEPLOY_20260608200100_checkins_bucket_private.sql`).
- **COB-05 — Consultar al contador** (Ley 21.713 / Circular 39-2025). Bloquea GA, no la beta.
- **COB-06 — Cuentas de prueba MLC** (1 vendedor, 1 comprador, opcional 2.º vendedor) y **cuenta MP
  del coach de prueba distinta de «EVA SPA»**, con saldo ≈ CLP 5.000 para poder reembolsar.
- **COB-07 — QA con plata real (nivel C)**: los 14 pasos C0..C13 de s2 §10, con reembolso al final.
- **COB-08 — Aprobar el copy de las 22 plantillas de correo** (13 alumno + 9 coach, EMAILS §9) **y del
  anexo T&C** antes de encender la beta.
- **COB-09 — Revisión legal de los borradores de W0** (anexo Cobros de `tos.md`, sección de
  `legal/page.tsx`, privacidad, DPA y el texto de retracto de 10 días marcado «VALIDAR CON ABOGADO»).
  **Bloquea la beta (W6)**, no solo GA: los textos tienen que estar publicados y aceptados antes de
  encender `COBROS_ENABLED` (C-09).

### `docs/operations/RUNBOOK.md`

- Tabla `## Crons activos`: dos filas nuevas — `/api/cron/cobros-sweep` (`45 12 * * *`, barrido diario
  de cuotas, recordatorios y aviso de corte; `?dry=1` lista sin enviar; kill-switch
  `COBROS_KILL_SWITCH`) y `/api/cron/cobros-mp-reconcile` (`15 13 * * *`, drift alert-only + refresh de
  tokens OAuth + expiración de preferences).
- `## Clasificación`: sumar a P0 el ejemplo **«corte masivo erróneo de alumnos por el motor de cobros»**.
- **`### Cobros: kill-switch (las DOS palancas)`** — R14: el botón admin apaga en un click
  `COBROS_KILL_SWITCH` (Edge Config) **y** `platform_flags.cobros_gate` (fila en DB). Documentar el
  fallback manual por si el endpoint no responde: `update public.platform_flags set enabled=false where
  key='cobros_gate'` con service-role **y** la clave de Edge Config desde el panel de Vercel; y cómo
  verificar que las dos quedaron apagadas. **El kill-switch no cancela suscripciones MP** (R5).
- Subsecciones nuevas bajo `## Pagos — reglas comunes`:
  - **`### Cobros: webhook de MercadoPago caído`** — síntoma: cuotas `pending` con pago hecho.
    Contención: kill-switch por el endpoint admin (apaga Edge Config **y** `platform_flags`, R14) para
    que nadie se corte; diagnóstico con `notifications_history` del panel MP + logs de
    `/api/cobros/mp/webhook` + `student_payment_events`; reparación con `cobros-mp-reconcile` manual
    (Bearer `CRON_SECRET`); verificar conteo de cuotas movidas.
  - **`### Cobros: token OAuth del coach vencido o revocado`** — `invalid_grant` ⇒ conexión `error`,
    correo C5, planes `mp_*` **no cortan**; el coach reconecta desde `/coach/cobros`.
  - **`### Cobros: alumno cortado por error`** — contención: kill-switch por el endpoint admin (las dos
    palancas, R14; el estado es derivado ⇒ el acceso vuelve al instante, sin escribir nada); después
    corregir `paid_through` con `select … for update` y dejar evidencia en `student_payment_events`. **Nunca** tocar
    `clients.is_active` (rompe el registro de pagos, r3 §2.1).
  - **`### Cobros: doble cobro al alumno`** — el reembolso lo hace **el coach** desde su cuenta MP (EVA
    no recauda ni retiene, D4); EVA marca la cuota y registra el evento.
  - **`### Cobros: el coach desvinculó MercadoPago`** — **R5**, dos caminos distintos: (a) **desde
    EVA** ⇒ se cancelan **TODAS** las suscripciones vivas **antes** de revocar tokens, con diálogo que
    lo advierte; (b) **desde MP** (`application.deauthorized`) ⇒ EVA ya no puede llamar a la API:
    conexión `revoked`, planes `mp_*` → `manual` **sin cortar**, correo **C5** con instrucciones para
    cancelar en su panel MP. Verificar en `coach_payment_connection_events` que no quedaron
    preapprovals vivos.
  - **`### Cobros: el coach bajó a Free`** — **R5**: correo **C6**, cancelación automática de las
    suscripciones vivas y planes a `paused`. Si la cancelación en MP falla, hay alerta: reintentar con
    el script y, si el token ya no sirve, pedirle al coach que cancele desde su panel MP.

## 6. Docs

| Archivo | Qué se agrega |
|---|---|
| `docs/status/CURRENT.md` | Ítem nuevo bajo el frente Web/PWA, patrón vigente: beta cerrada, motor de cuotas + 3 modos, corte derivado, gracia 0/3, allowlist y kill-switch, shas, y los pendientes (GA, contador, QA de device). Texto literal en el bloque **A** de abajo. |
| `docs/status/MOBILE_PARITY.md` | Blockquote nuevo en el resumen ejecutivo: qué recibe RN (solo estado y confirmación) y qué archivos lo implementan. Texto literal en el bloque **B** de abajo. |
| `docs/operations/APP_REVIEW_NOTES.md` | (a) sección `## Billing`: agregar «Coaches may charge their own clients through EVA; that money never touches EVA and is never collected, offered or linked inside the app.» (b) `## Notes for Review (EN)`: un punto 5 explicando que el módulo de cobros del coach es **web-only** y que el cliente moroso solo ve estado. **No** agregar la línea de Android a las notas de Apple. |
| `apps/mobile/AGENTS.md` | 3 filas en la tabla de guards (`:80-84`): `tests/mobile/web-only-hint.test.ts` (que el hint no sea tocable ni escriba el literal), el test de `wa.me` sin `text` con `$`/«pagar», y el test de que ningún endpoint `api/mobile/**` devuelve `checkout_url`/`init_point`. |
| `docs/specs/cobros-coach-alumno/` | **Seis** archivos, todos con frontmatter `status/owner/last_verified/canonical: false`, creados **en el mismo commit**: `SPEC.md`, `PLAN.md`, `TASKS.md`, `EMAILS.md` (las 22 plantillas: 13 alumno + 9 coach), `DATA-SECURITY.md` (**lista única de migraciones M1..Mn con sus timestamps**, gate, OAuth, webhook, threat model T-01…T-22) y `TESTING-LEGAL.md` (niveles A/B/C, Playwright, legal/tributario). Si falta uno solo, `docs:check` falla por link roto: `check-docs.mjs:247-258` valida los links de **todo** el Markdown activo. `docs/README.md` **no** se toca: no mantiene índice de specs. |

### Textos literales (van en bloque cercado a propósito)

`check-docs.mjs` solo ignora los links que están dentro de un **bloque cercado**
(`stripFencedCode`, `check-docs.mjs:120-137`): los backticks inline **no** protegen nada. Un
link relativo de ejemplo (`[texto]` seguido de `(../specs/…)`) escrito en una celda de tabla de este
archivo se resolvería contra `docs/specs/cobros-coach-alumno/` y daría `docs/specs/specs/…` ⇒
`docs:check` rojo. Por eso los dos snippets de abajo viven en bloques cercados y nunca en la tabla.

**A — `docs/status/CURRENT.md`** (los `../specs/…` son relativos a `docs/status/`):

```markdown
- **Cobros coach → alumno EN BETA CERRADA (<fecha>, [spec](../specs/cobros-coach-alumno/SPEC.md)):**
  motor de cuotas + 3 modos (transferencia, link MP por ciclo, suscripción MP) con corte derivado y
  gracia 0/3 elegida por el coach; allowlist `COBROS_BETA_COACH_IDS`; kill-switch
  `COBROS_KILL_SWITCH`. Shas: … **Pendiente:** GA, respuesta del contador, QA de device.
```

**B — `docs/status/MOBILE_PARITY.md`**:

```markdown
> **<fecha> («Cobros coach → alumno»)** (spec [cobros-coach-alumno](../specs/cobros-coach-alumno/SPEC.md),
> OTA `<id>`): RN recibe solo estado y confirmación — pill «Pagos» revive
> `components/coach/clientDetail/FacturacionTab.tsx`, `app/coach/cobros.tsx` lista el mes,
> `components/WebOnlyHint.tsx` explica que la configuración vive en la web (Android suma la línea de
> `lib/client-cap.ts`; iOS nada), y el alumno ve estado sin monto ni link.
```

## 7. Estimación y paralelismo

| Wave | Días-agente | Modelo | Notas |
|---|---|---|---|
| W0 | 0,5-1 | owner + Sonnet | credenciales, 10 envs, **borradores legales de R21** |
| W1 | **3-4** | Opus | 16 migraciones (incl. RPCs `private.cobros_*`, `platform_flags`, consents) + `@eva/cobros` + `flags.ts`/`resolveCobrosAccess` + exports de `mercadopago.ts` (R13/R14/R17/R18/R21); bloquea a todas |
| W1.5 | 1 | Opus | repositorios + `confirm-payment`/`undo-confirmation` sobre las RPCs; bloquea a W2 y W3 |
| W2 | **6-8** | Opus ×2 | ∥ W3 |
| W3 | **3,5-4,5** | Opus | ∥ W2; suma la 2.ª query fail-open del proxy (R15), el servicio de claim (R19) y el endpoint admin de kill-switch (R14) |
| W4 | 2,5-3 | Opus | ruta claim (R19) + W4.8 `whatsapp` con fallback `mailto:`; solapable con la 2.ª mitad de W5 |
| W5 | **5,5-7,5** | Opus | suma cancelaciones de preapproval y sus 6 hooks (R5) |
| W6 | **3-4** + 2-3 semanas de calendario | Opus + owner | suma el experimento X1 (R22); **exige lo legal publicado y aceptado** (C-09) |
| W7 | 1 | Sonnet | revalida lo legal (publicado antes de W6, C-09) y Notes for Review (R23) |

**Total ≈ 26-32 días-agente + 2-3 semanas de beta.** Ruta crítica: W1 → W1.5 → W3 → W5 → W6.
El delta contra la estimación anterior (24-30) es todo de R1-R23: +1 día en W1 (3 migraciones nuevas,
las 4 RPCs, el flag adelantado y el refactor de `mercadopago.ts` con K9 verde), −0,5 en W1.5 (el flag
se fue a W1), +0,5 en W3, +0,5 en W4, +0,5 en W5 y +0,5 entre W0 y W7 por lo legal.

La estimación anterior («≈ 14 días-agente») no era creíble y queda corregida acá. Los tres números que
la hundían, con lo que hay adentro de cada uno: **W2** = 2 servicios + `/coach/cobros` entera (KPIs,
tabla del mes con 7 estados, «Cómo cobras», onboarding de 3 pasos) + la pill en las **dos**
encarnaciones de la ficha + `ConfirmPaymentDialog` + `RevenueSheet` + 6 archivos de roster +
`AddStudentStepper` (855 líneas, con test); **W5** = OAuth con PKCE y cookie firmada +
cifrado AES-256-GCM con rotación + webhook re-procesable (R12) con re-fetch y verificación de
`collector_id` + checkout con consentimiento (R21) + reconcile de suscripciones (R11) + cancelaciones
con sus 6 hooks (R5) + 11 correos; **W6** = Playwright en
serie + sandbox MLC completo + nivel C con plata real y reembolso + QA de device iOS y Android en
claro/oscuro y con marca. Ver §8.7 para la alternativa de partir el tren.

## 8. Decisiones del writer (para que el jefe las revise)

1. ✅ **Horario de los crons — CONFIRMADO** (DECISIONS-2 §PLAN): `cobros-sweep` = `45 12 * * *` y
   `cobros-mp-reconcile` = `15 13 * * *`, con los nombres canónicos intactos. OUTLINE §15 (12:00 y
   13:00 UTC) queda corregido: el sweep debe correr **después** de `paid-expiry` (`30 12`) y las 13:00
   ya las ocupa `cap-nudge` (`0 13`).
2. **16 archivos de migración** (era 13) en vez de los «9 items» de OUTLINE §3: cada objeto va en su
   archivo para poder bisecar y revertir de a uno (`20260612140001:26-27` pide exactamente eso). Las
   tres nuevas salen de las resoluciones: **M12** `platform_flags` + `private.cobros_gate_enabled()` (R14), **M13**
   `student_billing_consents` (R21) y **M14** las RPCs `private.cobros_*`
   (R13); `description` (R21), `periods_covered` y el **borrado del unique sobre `payment_id`** (R16)
   viajan dentro de M2/M3/M8, que todavía no están aplicadas. El item 6 del OUTLINE se parte en **M15**
   (crear `private.student_billing_allowed`) y **M16** (sumarle el término a `student_write_allowed`)
   para poder revertir el toque al gate NUT-033 sin tocar nada más. **R17**: la lista única, los
   timestamps y los nombres de rollback viven en [DATA-SECURITY §1](DATA-SECURITY.md); este PLAN cita
   por nombre `M-n` y **no** repite timestamps. Si la numeración difiere, gana DATA-SECURITY.
3. **`packages/cobros`, `lib/cobros/flags.ts` y los tipos se cierran en W1 (R18); los cimientos de
   servidor, en W1.5**, y no se tocan después. Es lo que permite que W2 y W3 corran en paralelo sin
   pisarse; cualquier cambio posterior al motor puro, al flag o a `confirm-payment.service` vuelve como
   sub-wave. Antes, el «paralelismo W2 ∥ W3» era falso: W3 consumía tres entregables que nacían dentro
   de W2.
4. **El refactor de helpers del billing viejo se commitea aparte** del código nuevo, con la suite de
   `api/payments/webhook/route.test.ts` verde antes y después. Por **R18** la parte del cliente MP
   (`mpRequest/mpPostJson/mpPutJson/buildMpHeaders/getMpAccessToken` con token opcional) se adelanta a
   **W1** y su test de no-regresión corre ahí; el resto (external-reference, webhook-authorization,
   pipeline, hooks de R5) queda en W5. Es el único cambio de este tren en código de plata que hoy
   funciona, y quiero poder revertirlo solo.
5. **`COBROS_BETA_COACH_IDS` vacío = nadie** (fail-closed), aunque el kill-switch sea fail-OPEN. Son
   dos palancas con propósitos opuestos: la allowlist protege el lanzamiento, el kill-switch protege
   contra que una caída de Edge Config apague un motor que ya está en producción.
6. ✅ **Ruta nueva `POST /api/mobile/student/cobros/claim` (W4) — APROBADA por R19**, con bearer, rate
   limit y **sin nota ni archivo**; web y RN llaman al mismo servicio. Ya no hay alternativa que
   discutir: el `canClaim` del payload queda respaldado por un endpoint real.
7. **El tren sigue siendo uno solo** (motor + riel), como decidió el owner (OUTLINE §1). Dicho eso,
   con la estimación real (24-30 días-agente) y un universo de 7 coaches Pro / 55 alumnos, **queda
   sobre la mesa partirlo**: tren 1 = solo modo `manual` (motor, corte, correos, panel, RN) —que es lo
   que ya cubre el caso real de todos los coaches de hoy— y tren 2 = los rieles `mp_link` y
   `mp_subscription` (W5 completa). Achica el tren 1 a ~15-18 días-agente y saca del camino crítico la
   parte con más riesgo externo (OAuth, sandbox sin webhooks, plata real). **Es decisión del owner: no
   la tomo yo, la dejo escrita.**
