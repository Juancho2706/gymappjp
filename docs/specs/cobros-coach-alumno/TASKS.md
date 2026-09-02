---
status: draft
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# TASKS — Cobros coach → alumno

Destino en el repo: `docs/specs/cobros-coach-alumno/TASKS.md`. Compañeros: [SPEC](SPEC.md) · [PLAN](PLAN.md) ·
[EMAILS](EMAILS.md) · [DATA-SECURITY](DATA-SECURITY.md) · [TESTING](TESTING-LEGAL.md) — los **6** se crean juntos en
W0.8 o `pnpm docs:check` sale rojo.
Archivos:línea verificados contra `rnmobiledenuevo` @ `c85ef28b` el 2026-08-28. Modelo sugerido entre
paréntesis. Cada tarea lleva su **criterio de aceptación verificable** (CA).

**Jerarquía ante conflicto**: `DECISIONS.md` (owner) > `OUTLINE-16-RESOLUCIONES.md` (**R1–R23**) >
`DECISIONS-2.md` > `OUTLINE.md` > mapas/research. Cualquier tarea de este archivo que contradiga una
resolución R-n está desactualizada y se corrige contra ella (no al revés).

**Orden obligado: W0 → W1 → W1B → (W2 ∥ W3) → W4 → W5 → W6 → (aprobación del owner) → W7.**

**Regla ÚNICA de los textos legales (resuelve las cuatro versiones que circulaban):** se **redactan en
borrador en `W0-legal`**, se **publican y se aceptan en W2.15** (la aceptación con `terms_version` es
prerrequisito para crear un plan) y **W7.9 solo REVALIDA** que lo publicado coincide con lo aceptado — W7.9
**no publica nada**. Por eso **`W0-legal` corre en paralelo desde W0 y bloquea W6** (encender la beta cobra
plata real), **no W7**. `PLAN §W2` no puede prohibir tocar `docs/legal/tos.md` ni `legal/page.tsx`: W2.15 los
edita, y esa es la única publicación del tren.

`W1B` («cimientos de servidor», = `W1.5` en `PLAN.md`; mismo contenido, otro rótulo para no chocar con la
tarea `W1.5`) es la wave que hace posible el paralelismo W2 ∥ W3. **R18 la adelgaza**: `lib/cobros/flags.ts`,
`resolveCobrosAccess` y los tipos compartidos **se mudan a W1** (W1.21/W1.22), igual que la exportación de
`mpRequest/mpPostJson/mpPutJson/buildMpHeaders/getMpAccessToken` con token inyectado y el test de
no-regresión del billing viejo (W1.23/W1.24). En W1B quedan los tres repositorios y los servicios de plata
(confirmar, deshacer, revertir), todos sobre las RPCs `private.cobros_*` de R13. Con eso, **W2 ∥ W3 es
válido de verdad**.

**Estimación re-hecha (reemplaza el «≈ 14 días-agente» del OUTLINE §13, que no era creíble):** W0 0,5 ·
W0-legal 1 (owner + abogado/contador, en paralelo) · W1 **4-5** (crece con las migraciones de R13/R14/R16/R21,
el flag de R18 y el refactor de helpers MP adelantado) · W1B 1,5 (pierde el flag, gana deshacer/revertir y el
endpoint de kill-switch) · W2 6-8 · W3 3-4 · W4 2-2,5 (suma la ruta de claim de R19) · W5 6-8 (suma cascada de
cancelación, reversas y reconcile real) · W6 3-4 · W7 0,5 ⇒ **≈ 28-35 días-agente + 2-3 semanas de beta**. Alternativa para el owner (no la decide el
writer): partir el tren en v1 = solo modo `manual` (W0…W4 + W6 + W7, sin W5) y los rieles `mp_link` /
`mp_subscription` como tren 2.

Leyenda: 🧑 = solo la puede hacer el owner (cuentas, plata real, dispositivo). 🔴 = bloqueante de la wave.

## W0 — Preparación y llaves (0,5 día-agente · owner + Sonnet)

- [ ] 🧑🔴 W0.1 Crear la aplicación MP **«EVA Cobros»** (prod) y **«EVA Cobros (test)»** (preview) con
      `redirect_uri` estática por entorno. **CA**: existen dos AppIDs distintos del `539042216877374`
      del billing, y cada uno tiene su signing secret; nada de eso se escribe en el repo.
- [ ] 🧑🔴 W0.2 Cargar en Vercel las envs de OUTLINE §15 (Production + Preview, todas *Sensitive*), **más
      `COBROS_WEBHOOK_REQUIRE_SIGNATURE`** (R22; nombre canónico — `COBROS_WEBHOOK_SIGNATURE_ENFORCE` de
      DECISIONS-2 §DATA-SECURITY es alias del mismo flag y **no** se usa en el código), que nace en `false`
      hasta que X1 se confirme en nivel C. **CA**: `COBROS_ENABLED` **no** está seteada en Production (el
      feature nace apagado), `COBROS_WEBHOOK_REQUIRE_SIGNATURE=false` en ambos entornos, y ninguna lleva
      prefijo `NEXT_PUBLIC`.
- [ ] 🧑 W0.3 Crear las claves de Edge Config `COBROS_KILL_SWITCH=false` y `COBROS_BETA_COACH_IDS=[]`.
      **CA**: ambas se leen desde una función de prueba en preview; `COBROS_BETA_COACH_IDS` vacío = **nadie**
      (fail-closed) mientras `COBROS_GA` sea falso, y solo el literal `true` de `COBROS_KILL_SWITCH` apaga
      (Edge Config caído ⇒ módulo encendido) — D-W12, DECISIONS-2 §PLAN.
- [ ] 🧑 W0.4 Confirmar que **no** existe `RESEND_API_KEY` en Preview (o dejarla ausente).
      **CA**: captura del panel de envs; ningún cron de preview puede escribirle a un alumno real.
- [ ] 🧑 W0.5 Consultar al contador por Ley 21.713 / Circular 39-2025 («operador de plataforma de
      intermediación»). **CA**: respuesta escrita archivada; bloquea GA (W7), no la beta.
- [ ] W0.6 Agregar a `.env.example` los nombres nuevos (los de OUTLINE §15 + `COBROS_WEBHOOK_REQUIRE_SIGNATURE`),
      sin valores. **CA**: `pnpm docs:check` verde, `scripts/check-docs.mjs` no reporta credencial literal, y
      la lista de `.env.example` coincide 1:1 con la de W0.2.
- [ ] W0.7 Crear el bloque `## P1 — Cobros coach → alumno` en `docs/operations/MANUAL_TASKS.md` con
      COB-01..COB-08 (PLAN §5). **CA**: `pnpm docs:check` verde.
- [ ] W0.8 Crear **de una sola vez** los **6** archivos de `docs/specs/cobros-coach-alumno/`: `SPEC.md`,
      `PLAN.md`, `TASKS.md`, `EMAILS.md`, `DATA-SECURITY.md` y `TESTING-LEGAL.md` (destino del `TESTING-LEGAL.md`
      del SDD). Ninguno queda para después: `scripts/check-docs.mjs:247-258` valida los links de **todo** el
      Markdown activo, así que un `[EMAILS](EMAILS.md)` sin archivo deja `pnpm docs:check` en rojo; y sin
      `DATA-SECURITY.md` + `TESTING-LEGAL.md` se pierden el DDL completo, el threat model y el plan de pruebas
      A/B/C. **CA**: `pnpm docs:check` verde; frontmatter `status: draft / owner: product-engineering /
      last_verified / canonical: false` en los 6; **cero links relativos dentro de celdas de tabla de
      ejemplo** (en `PLAN §6` van en bloque de código o como ruta desde la raíz, que
      `check-docs.mjs:144-150` `isExternalOrRoute` deja pasar — los backticks inline **no** salvan); y las
      referencias al threat model T-01…T-22 apuntan a `DATA-SECURITY §11`, no a `PLAN.md`.

**Gates W0**: `pnpm docs:check`.

## W0-legal — Identidad legal, contratos y textos (owner + abogado/contador; redacta Sonnet)

Corre **en paralelo** con W1-W5 y **bloquea W6** (no W7): sin esto no se enciende la beta con plata real.
Fuente: `TESTING-LEGAL.md` §B.1.1 (obligaciones E1-E13) y su § «Bloqueantes antes de abrir el riel automático a
plata real». Hoy ninguna de estas seis obligaciones tenía tarea en el plan.

- [ ] 🧑🔴 W0L.1 Cerrar **LEGAL-01** (E8): razón social, RUT y representante legal reales en
      `docs/legal/tos.md:13,21` (hoy «Juan Villegas» persona natural y `status: review-required`) y en
      `apps/web/src/app/legal/page.tsx:64` («**Responsable:** Juan Villegas (persona natural)»). **CA**: los
      dos textos dicen lo mismo, la nota interna «no publicar» desaparece, se cierra la divergencia de fechas
      (`tos.md:9` «17 de mayo de 2026» vs `legal/page.tsx:12` `LAST_UPDATED = '12 de junio de 2026'`) y la
      entrada `LEGAL-01` sale de `docs/operations/MANUAL_TASKS.md:69`.
- [ ] 🔴 W0L.2 **Redactar el BORRADOR** del **anexo «Módulo de Cobros»** para `docs/legal/tos.md` + la
      sección de `apps/web/src/app/legal/page.tsx` (E8) — **la publicación es de W2.15**, acá solo el texto: la comisión de MP la paga el coach; contracargos, reembolsos y
      boletas son del coach; EVA no recauda ni retiene; EVA puede informar al SII si la ley lo exige. **CA**:
      tiene `terms_version` propia asignada, revisada por el abogado, y queda lista para que **W2.15** la
      publique y la haga aceptar con timestamp.
- [ ] 🔴 W0L.3 **DPA coach↔EVA** por escrito (E6, Ley 21.719, plena vigencia 01-12-2026): EVA como encargado
      de los datos de pago del alumno. **CA**: se acepta en el mismo flujo del anexo, con versión + timestamp
      guardados en `coach_billing_settings`.
- [ ] 🔴 W0L.4 Actualizar `docs/legal/privacy-policy.md` (E7): la fila «Facturación» (`:41`) hoy solo cubre
      el correo de pago **del coach**; debe cubrir los datos de pago **del alumno** (correo del pagador,
      comprobantes del bucket `payment-receipts`, ids de MP) y el **RUT del coach**, con finalidad y base de
      licitud. **CA**: el documento nombra al alumno como titular y a MP como tercero, y no promete que EVA
      custodie plata.
- [ ] 🧑🔴 W0L.5 Decidir **retracto A vs B** y la rama de mayoría de edad R-a/R-b (`TESTING §B.3`, decisión
      owner + abogado). **CA**: la decisión queda escrita y versionada por `terms_version`; W5.9 implementa
      **una**, no las dos.
- [ ] 🔴 W0L.6 **Paquete de evidencia** de autorización (E10, el de mayor ROI del documento legal), **con
      soporte concreto = `student_billing_consents`** (R21: `id, client_id, plan_id, kind in
      ('subscription','first_checkout'), terms_version, consented_at, ip_hash, user_agent`): timestamp,
      IP (hasheada), user agent, `terms_version` y el texto exacto mostrado. Tabla en W1.19, escritura en
      W5.9, export CSV desde admin en W2.20. **CA**: existe el export y un test que verifica las 5 piezas;
      retención **24 meses** (> los 6 meses de ventana de contracargo) y la tabla queda **excluida de
      `purge-data`** (test que falla si el purgador la toca).
- [ ] W0L.7 **X1 (qué secret firma el webhook de Cobros) NO bloquea W5.6** — R22: se resuelve en **nivel C
      con la primera notificación real** (loguear el `x-signature` crudo y verificarlo contra el secret de
      «EVA Cobros»). Hasta entonces el webhook acepta `?token=` + firma **si viene**; la firma pasa a
      obligatoria en prod cuando X1 lo confirme, girando `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true` (W6.11).
      **CA**: queda escrito en la spec que el secret candidato es `COBROS_WEBHOOK_SIGNING_SECRET`, distinto
      del secret del billing EVA↔coach (T-21), y que la verificación estricta está detrás del flag.

**Gates W0-legal**: `pnpm docs:check` · `pnpm lint` y `pnpm build` sobre `apps/web/src/app/legal/page.tsx`.

## W1 — Datos + motor puro (3 días-agente · Opus)

> **Fuente única del DDL: `DATA-SECURITY §1` (lista única M1…Mn).** R17: ese documento —y solo ese— trae el
> SQL completo, los nombres de archivo, **los timestamps** (una base fija y +5 min por migración) y el rollback
> de cada migración. **`PLAN.md` y este archivo citan por nombre `M-n` y por objeto, y no repiten ni un
> timestamp.** Son **16 migraciones** y la numeración es **exactamente** la de `DATA-SECURITY §1`:
> **M1** `coach_billing_settings` · **M2** `client_billing_plans` · **M3** `student_billing_charges` ·
> **M4** `student_subscriptions` · **M5** `student_payment_events` · **M6** `coach_payment_connections` ·
> **M7** `coach_payment_connection_events` · **M8** columnas de cobros en `client_payments` ·
> **M9** `REVOKE ALL ON client_payments FROM anon` · **M10** `client_email_ledger` · **M11** bucket
> `payment-receipts` · **M12** `platform_flags` + `private.cobros_gate_enabled()` (**R14**) ·
> **M13** `student_billing_consents` (**R21**) · **M14** las cuatro RPCs `private.cobros_*` (**R13**) ·
> **M15** `private.student_billing_allowed` · **M16** `create or replace private.student_write_allowed`.
> El gate va partido en **M15** (crear la función nueva) y **M16** (agregar el término al gate viejo), para
> poder revertir el término NUT-033 sin tocar la función nueva.
> **No hay una decimoséptima migración**: los cambios de **R21** (`client_billing_plans.description`) y de
> **R16** (`periods_covered` en `client_payments`, sin unique sobre `student_billing_charges.payment_id`)
> van **dentro** de M2, M3 y M8 —que son de este mismo tren y todavía no están aplicadas— como criterios de
> aceptación de W1.2, no como archivos propios (tareas W1.19/W1.20). Cualquier tabla de migraciones que
> contradiga a `DATA-SECURITY §1` —incluida la de `PLAN §W1`, que está **derogada**— se corrige contra ella.

- [ ] 🔴 W1.1 Censo previo en LIVE: `get_advisors` (security + performance), `pg_policy` e
      `information_schema.column_privileges` de `clients`, `client_payments` y `coaches`; y grep de
      lectores de `client_payments` en `apps/` (para **M9**). **CA**: censo pegado en el header de **M9** y
      de **M16**, con el bloque de censo de `DATA-SECURITY §1` («Protocolo de aplicación»).
- [ ] W1.2 Escribir **M1-M8** copiando el SQL literal de `DATA-SECURITY §1`, un objeto por archivo y en el
      orden de esa lista (**los nombres y timestamps salen de ahí; no se repiten acá** — R17):
      `coach_billing_settings` · `client_billing_plans` · `student_billing_charges` ·
      `student_subscriptions` · `student_payment_events` · `coach_payment_connections` ·
      `coach_payment_connection_events` · columnas de cobros en `client_payments`.
      **M2 incluye `description` (R21), M3 va sin unique sobre `payment_id` y M8 trae `periods_covered`
      (R16)**: son parte de estos ocho archivos, no migraciones aparte (W1.19/W1.20).
      **CA**: cada tabla nueva tiene RLS habilitada, ninguna
      otorga `INSERT/UPDATE/DELETE` a `anon`/`authenticated`, toda FK nueva trae su índice en la misma
      migración, y cada archivo es idempotente (`create … if not exists`, `drop policy if exists`).
- [ ] 🔴 W1.3 **M9** (`REVOKE ALL ON public.client_payments FROM anon`, hallazgo `baseline.sql:3592`), con
      censo previo de lectores y rollback propio (`GRANT` de una línea). **CA**: tras el
      ensayo, `has_table_privilege('anon','public.client_payments','SELECT')` = `false`, ninguna
      superficie web/RN pierde lectura, y el hallazgo queda declarado como **cerrado en este tren** en
      `docs/status/CURRENT.md` (W7.3) — DECISIONS-2 §PLAN.
- [ ] W1.4 **M10** `client_email_ledger` (molde `20260822004243_coach_email_ledger.sql`),
      con `dedupe_key` unique y `payload` sin PII. **CA**: `insert` duplicado de la misma `dedupe_key` falla.
- [ ] W1.5 **M11** bucket privado `payment-receipts` con
      policies por carpeta `<coach_id>/<client_id>/…` (molde
      `20260525181500_storage_workspace_policies.sql:117-155`). **CA**: un `GET` anónimo a un objeto del
      bucket devuelve 400/403.
- [ ] 🔴 W1.6 **M15** `private.student_billing_allowed(uuid,text,text)` **fail-open** (3 argumentos: tier y
      estado del coach inyectados), sin tocar todavía el gate viejo. **R14**: devuelve `true` también cuando
      `coach_billing_settings.enabled is not true` (**fila ausente incluida**), cuando el plan está `paused`
      o ausente, y cuando **`private.cobros_gate_enabled()`** es `false`. **CA**: la función existe y
      devuelve `true` en los seis casos (sin plan · plan `paused` · sin ancla `paid_through` null · coach
      fuera de Pro · `coach_billing_settings` ausente o `enabled=false` · `platform_flags.cobros_gate=false`);
      `supabase/tests/student_gate_equivalence.sql` sigue pasando **sin editarlo** (M15 todavía no toca el
      camino caliente).
- [ ] 🔴 W1.7 **M16** `create or replace private.student_write_allowed` agregando el `and`. **CA**: el `pg_get_functiondef`
      posterior conserva **textualmente** el `coalesce(...)` y el `left join` de `20260728125000:93,96`
      (contrato NUT-033); pasan **sin editarse** `supabase/tests/student_gate_equivalence.sql` (el viejo) y
      `supabase/tests/cobros_gate_equivalence.sql` (el nuevo de `DATA-SECURITY §2.2` — **único** nombre
      válido: no existe `student_billing_gate_equivalence.sql`).
- [ ] 🔴 W1.8 `EXPLAIN (ANALYZE)` de un `insert` de `workout_logs` y de `check_ins` **antes y después de
      M16** (la migración que mete el término nuevo en el camino caliente; **no** M13, que es la tabla de
      consentimientos), con el bloque literal de `DATA-SECURITY §2.1`. **CA**: ambos planes pegados en el
      header de **M16**; umbral **+15 %** de `Execution Time` (`DATA-SECURITY §3.1`, `TESTING` A-4; el
      «> 20 %» anterior queda derogado) — si se supera, **M16 se difiere a una ola posterior** (el corte
      queda en proxy + API, reversible) y el diferimiento se documenta en el RUNBOOK (W7.5), o se reescribe
      con `exists` sobre el índice único parcial y se vuelve a medir.
- [ ] W1.8b Escribir **un rollback por migración** (las **16**, M1…M16 de `DATA-SECURITY §1`)
      en `supabase/tests/<mismo_nombre_de_la_migración>_rollback.sql` (convención viva: ya hay 8
      `*_rollback.sql` ahí; el nombre exacto lo fija la lista única, no este archivo),
      **al mismo tiempo** que su migración. **No** hay un `cobros_schema_rollback.sql` único: se descarta
      justamente para poder revertir solo el término NUT-033 (M16) sin tirar abajo el esquema. **CA**: cada
      rollback corre limpio sobre un esquema recién migrado dentro de `BEGIN; … ROLLBACK;`; el de M9
      devuelve exactamente el `GRANT` que revocó y el de M16 reinstala el texto anterior de
      `student_write_allowed`.
- [ ] W1.9 Crear `packages/cobros` (`package.json` con nombre `@eva/cobros`, `index.ts`, `state.ts`,
      `periods.ts`, `schemas.ts`, `copy-keys.ts`) sin dependencias de Next/Supabase/React/RN.
      **CA**: `pnpm --filter @eva/cobros exec tsc --noEmit` verde, el paquete no importa nada del app, y
      **queda congelado al cierre de W1** (DECISIONS-2 §PLAN): W2/W3/W5 lo consumen, no lo editan.
- [ ] 🔴 W1.10 `resolveStudentBillingState()` en `packages/cobros/state.ts` con `.test.ts` exhaustivo
      (patrón `apps/web/src/lib/payments/paid-expiry.test.ts`: tabla de combinaciones, cero mocks).
      **Firma exacta = `DATA-SECURITY §3.1`** (única autoridad del tipo, registrada en `SPEC §19`):
      entrada `StudentBillingInput { plan: StudentBillingPlanRow | null, coachIsPro, clientExcluded,
      gateEnabled, now? }`, donde `StudentBillingPlanRow` trae `status`, `paidThrough`,
      **`effectiveGraceDays`**, `reminderDaysBefore`, **`moduleEnabled`**, **`engineHoldAt`**,
      **`claimDeferralUntil`** y `mode` (espejo 1:1 de las columnas nuevas de M2:
      `effective_grace_days`, `module_enabled`, `engine_hold_at`, `claim_deferral_until`);
      salida `StudentBillingResult { state, paidThrough, cutsAt, graceDays, deferredByClaim }` —
      **`cutsAt`**, nunca `dueUntil`.
      **Estados finales = `off | ok | due_soon | due | unpaid | ended` (R1)**: un plan `canceled` con
      `now ≤ paid_through` deriva `ok` («tu plan termina el X») y después **`ended`** (corte); solo
      `paused`, coach no Pro, módulo apagado o `paid_through null` dan `off`. **R2**: `paid_through` se
      inicializa en `first_due_on` al crear el plan y **nunca** queda `null` en un plan activo (el caso
      `null` sigue existiendo en la función como fail-open, no como estado alcanzable). **CA**: casos
      cubiertos = plan ausente · plan `paused` · coach no Pro (`coachIsPro:false`) · **`moduleEnabled:false`**
      (el coach apagó Cobros ⇒ `off`, caso E-01 de `DATA-SECURITY §2.2`) · **`engineHoldAt` puesto** (MP
      desconectado ⇒ `off`, E-02) · **`gateEnabled:false`** (kill-switch R14 ⇒ `off` para todos, sin mirar
      nada más) · `clientExcluded:true` · `paid_through` null
      (⇒ `off`, **fail-open**) · plan `canceled` antes y después de `paid_through` (⇒ `ok` y `ended`) ·
      **`claimDeferralUntil` vivo (⇒ sigue `due`, R3) y ya vencido (⇒ `unpaid`), con `cutsAt` corrido y
      `deferredByClaim:true`** · borde exacto de `endOfDay(paid_through)` en `America/Santiago` ·
      `effectiveGraceDays` 0 y 3 · día del corte ·
      `due_soon` con `reminderDaysBefore`; y un test que falla si aparece un séptimo estado.
      **El espejo SQL↔TS de `DATA-SECURITY §3.4` corre sobre estos mismos casos**: los frenos
      `module_enabled` / `engine_hold_at` / `cobros_gate_enabled()` tienen que dar el mismo resultado en
      `private.student_billing_allowed` (M15) y acá (I-11).
- [ ] W1.11 `packages/cobros/periods.ts`: avance de `paid_through` por `period_kind`
      (`monthly`, `biweekly`, `quarterly`, `one_off`) y **prepago de N períodos (R16)**: un pago puede
      cerrar N cuotas consecutivas y `paid_through` queda en el `period_end` de la última.
      **Regla de R8, que reemplaza la invariante «solo avanza»**: `paid_through` **avanza por
      confirmaciones y retrocede SOLO por deshacer, reembolso o contracargo** (eventos auditados).
      **CA**: test de que dos confirmaciones seguidas de la misma cuota **no** avanzan dos períodos; de
      fin de mes (31 ene + 1 mes); de que `periods_covered = 3` cierra exactamente 3 cuotas consecutivas y
      deja `paid_through` en el `period_end` de la tercera; y de que la reversa devuelve `paid_through` al
      `period_end` de la cuota anterior pagada.
- [ ] W1.12 `packages/tiers/index.ts`: capability `canUseCobros` + `isCobrosAllowed(tier)` fail-closed
      (calcado de `isBrandingAllowed`, `:391-398`). **CA**: test con `free:false`, `starter:false`,
      `pro/elite/growth/scale:true`, y un tier corrupto ⇒ `false`.
- [ ] W1.13 `supabase/tests/cobros_grants.sql`: asserts de que `anon` y `authenticated` no tienen
      `INSERT/UPDATE/DELETE` en las **10** tablas nuevas (las 8 de `OUTLINE §15` —`coach_billing_settings`,
      `client_billing_plans`, `student_billing_charges`, `student_subscriptions`, `student_payment_events`,
      `coach_payment_connections`, `coach_payment_connection_events`, `client_email_ledger`— más
      **`student_billing_consents`** (R21) y **`public.platform_flags`** (R14, *service-role-only*: ni
      `SELECT` para `anon`/`authenticated`)); de que
      `has_column_privilege('authenticated','coach_payment_connections','access_token_enc','SELECT')`
      es `false`; y de que **ninguna** de las cuatro RPCs `private.cobros_*` (R13) ni
      `private.cobros_gate_enabled()` tiene `EXECUTE` para `anon`/`authenticated`. **CA**: el script hace
      `RAISE EXCEPTION` si algún grant sigue abierto (patrón `20260617033845:40-46`).
- [ ] W1.14 `supabase/tests/cobros_isolation.sql`: 2 coaches × 2 alumnos sintéticos. **CA**: el alumno A
      no ve el plan de B; el coach A no ve el plan de B; el alumno no puede `UPDATE` su plan (42501).
- [ ] W1.15 Regenerar `apps/web/src/lib/database.types.ts`. **CA**: `pnpm typecheck` verde.
- [ ] W1.16 `get_advisors` posterior. **CA**: cero advisors nuevos de seguridad; los de performance,
      resueltos o justificados por escrito.
- [ ] 🔴 W1.17 **M12 — (R14) `platform_flags` + `private.cobros_gate_enabled()`**: tabla
      `public.platform_flags (key text primary key, enabled boolean not null default true, updated_at,
      updated_by)`, **service-role-only** (`revoke all … from anon, authenticated`), y la función
      `private.cobros_gate_enabled()` que lee la fila `key='cobros_gate'` con **fila ausente = `true`**.
      **Va antes del gate porque el gate la usa**: la consume M15 (W1.6). **CA**: sin fila, la función
      devuelve `true`; con `enabled=false`,
      `private.student_billing_allowed` devuelve `true` para **todos** los alumnos (kill-switch en DB);
      `authenticated` no puede leer ni escribir la tabla (asserts en `cobros_grants.sql`).
- [ ] 🔴 W1.18 **M14 — (R13) las RPCs de plata**: `private.cobros_confirm_charge(charge_id,
      payment_input)`, `private.cobros_apply_provider_payment(...)`, `private.cobros_undo_confirmation(...)`
      y `private.cobros_revert_charge(...)`, todas `security definer` en el schema `private`, ejecutadas
      **con service-role** y **sin grant a `authenticated`**. Existen porque supabase-js/PostgREST **no
      tiene `withTransaction`**: cada una hace `select … for update` sobre el plan y actualiza cuota +
      `client_payments` + `paid_through` en **una** transacción. **CA**: test SQL de que dos llamadas
      concurrentes a `cobros_confirm_charge` sobre la misma cuota dejan **un** pago y **un** avance; que
      `cobros_revert_charge` retrocede `paid_through` al `period_end` de la cuota anterior pagada; que
      `cobros_undo_confirmation` falla si la confirmación tiene más de 7 días o no es la última de esa
      cuota; y que `has_function_privilege('authenticated', …, 'EXECUTE')` es `false` para las cuatro.
- [ ] 🔴 W1.19 **M13 — (R21) `student_billing_consents`**: tabla `(id, client_id, plan_id, kind check in
      ('subscription', 'first_checkout'), terms_version, consented_at, ip_hash, user_agent)` con RLS,
      escrituras service-role y retención 24 meses. **No es migración propia** el
      `client_billing_plans.description text` **obligatoria** con `check (char_length(description)
      between 1 and 140)` (p. ej. «Asesoría online mensual»; viaja en E0/E5/E6): esa columna nace **dentro
      de M2** (W1.2), porque M2 es de este mismo tren y todavía no está aplicada. **CA**:
      `student_billing_consents` acepta los dos `kind` y ninguno más y queda **fuera** de `purge-data`
      (W0L.6); y, sobre M2, no se puede insertar un plan sin `description` ni con más de 140 caracteres.
- [ ] W1.20 **(R16) Prepago — dentro de M8 y M3, sin archivo nuevo**: `client_payments.periods_covered
      smallint not null default 1 check (periods_covered between 1 and 12)` va **en M8**, y **M3 se escribe
      sin** índice único sobre `student_billing_charges.payment_id` (varias cuotas comparten el mismo pago).
      **CA**: se pueden apuntar 3 cuotas consecutivas al mismo `payment_id` sin violar ninguna constraint, y
      un test SQL falla si alguien agrega ese unique más adelante.
- [ ] 🔴 W1.21 **(R18, movida desde W1B.1)** `apps/web/src/lib/cobros/flags.ts` con `resolveCobrosAccess(coach)`
      (env + Edge Config + allowlist + tier + `hasEffectiveAccess`), el lector de Edge Config en
      `flags.server.ts` (`DATA-SECURITY §10.2`, calcado de `student-access.server.ts:25-34` y cacheado por
      isolate como `proxy.ts:357-375`), `assertCobrosAllowed` para las mutaciones y **los tipos compartidos
      del módulo**. Vive en W1 —y no en W1B— para que W2 y W3 puedan arrancar de verdad en paralelo.
      **CA**: test con la matriz completa; `COBROS_ENABLED` ausente ⇒ `false`; `COBROS_BETA_COACH_IDS`
      vacío y `COBROS_GA` falso ⇒ `false` (fail-closed); Edge Config caído ⇒ el kill-switch **no** apaga
      (solo el literal `true` apaga) pero la allowlist sí niega.
- [ ] W1.22 **(R18, movida desde W1B.2)** `COBROS_ENABLED` en `apps/web/src/lib/constants.ts`, junto a
      `CHANGE_CARD_ENABLED:168`, con el docblock del gotcha `NEXT_PUBLIC` + «Sensitive». **CA**: grep
      confirma que no hay `NEXT_PUBLIC_COBROS_*` en todo el repo.
- [ ] 🔴 W1.23 **(R18, adelantada desde W5.1) Commit aparte**: exportar desde el billing viejo
      `mpRequest`, `mpPostJson`, `mpPutJson`, `buildMpHeaders` y `getMpAccessToken`
      (`apps/web/src/lib/payments/providers/mercadopago.ts`) **con el `accessToken` como parámetro
      opcional cuyo default es el env**, y `verifyMercadoPagoSignature(request, dataId, secret)` +
      `constantTimeEquals` desde `apps/web/src/lib/payments/webhook-authorization.ts`. Cero cambio de
      comportamiento; el `.toLowerCase()` del manifest **no** se reimplementa. **CA**: ningún caller actual
      pasa token y todos siguen funcionando; el diff no toca un solo test existente.
- [ ] 🔴 W1.24 **(R18)** El test de **no-regresión del billing EVA↔coach** corre en W1, no en W5:
      `pnpm exec vitest run apps/web/src/app/api/payments apps/web/src/lib/payments` verde **antes y
      después** de W1.23, con la salida pegada en el PR. **CA**: mismo conteo de tests y cero
      `.skip`/`.only` nuevos.

**Gates W1**: `pnpm exec vitest run packages/cobros packages/tiers apps/web/src/lib/cobros apps/web/src/lib/payments apps/web/src/app/api/payments` ·
`pnpm typecheck` ·
`supabase/tests/cobros_grants.sql`, `cobros_isolation.sql` y `cobros_gate_equivalence.sql` corridos a mano en
transacción con `ROLLBACK`, más **un `*_rollback.sql` por migración** (las 16, M1…M16 de
`DATA-SECURITY §1`) ·
`EXPLAIN (ANALYZE)` de `DATA-SECURITY §2.1` antes/después de **M16** · `get_advisors` antes/después.

## W1B — Cimientos de servidor compartidos (1,5 días-agente · Opus)

Wave nueva (= `W1.5` en `PLAN.md`). **Sin ella el paralelismo W2 ∥ W3 es ficticio**: W3 (proxy,
`/c/[slug]/pagos`, claim, sweep, correos) consume los tres repositorios y los servicios de plata, que
estaban todos dentro de W2. Acá se construye solo lo compartido; ninguna pantalla. **Depende de W1.**
Por **R18**, el flag y los tipos ya no viven acá (W1.21/W1.22).

- [ ] ~~W1B.1~~ **movida a W1.21 por R18** (`lib/cobros/flags.ts` + `resolveCobrosAccess` + tipos). El
      número no se recicla.
- [ ] ~~W1B.2~~ **movida a W1.22 por R18** (`COBROS_ENABLED` en `constants.ts`). El número no se recicla.
- [ ] 🔴 W1B.3 Repositorios `cobros-{settings,plans,charges}.repository.ts` (service-role, guard de
      pertenencia en **cada** método). **CA**: test que falla si algún método acepta un `coachId` que no
      coincide con el dueño de la fila.
- [ ] 🔴 W1B.4 `apps/web/src/services/cobros/confirm-payment.service.ts` (`DATA-SECURITY §8.1`) **sobre la
      RPC `private.cobros_confirm_charge` (R13)**, no sobre un `withTransaction` que supabase-js no tiene:
      el servicio arma el `payment_input`, llama la RPC con service-role y traduce el resultado. Confirmar
      es idempotente por `client_payments.charge_id`, avanza `paid_through` dentro de la transacción de la
      RPC (`select … for update`) y escribe `client_payments` con `source`; sirve a las **cuatro** fuentes
      (`manual`, `student_claim`, `mp_link`, `mp_subscription`) y acepta **`periodsCovered` (R16)** para
      cerrar N cuotas consecutivas con un solo pago. **CA**: test de doble confirmación ⇒ un solo pago y un
      solo avance; dos confirmaciones concurrentes ⇒ idem; `coachId` ajeno ⇒ `forbidden`; `periodsCovered=3`
      ⇒ 3 cuotas `paid` con el mismo `payment_id` y `paid_through` en el `period_end` de la tercera; y un
      test que falla si el servicio ejecuta más de una escritura fuera de la RPC.
- [ ] 🔴 W1B.5 **(R8) `undoConfirmation`** en `apps/web/src/services/cobros/confirm-payment.service.ts`
      sobre `private.cobros_undo_confirmation`: deshace **solo la última** confirmación de esa cuota, con
      **≤ 7 días** de antigüedad, reabre la cuota y **retrocede `paid_through`** al valor previo, dejando
      registro auditado en `student_payment_events`. **CA**: intentar deshacer una confirmación que no es
      la última, o de hace 8 días, devuelve error y no muta nada; el estado derivado vuelve exactamente al
      que había antes (test de ida y vuelta).
- [ ] 🔴 W1B.6 **(R9) `revertCharge`** (reembolso / contracargo) sobre `private.cobros_revert_charge`:
      cuota → `refunded` | `charged_back`, `client_payments.status` idem, `paid_through` retrocede al
      `period_end` de la cuota **anterior pagada**, y el estado derivado se recalcula (puede quedar
      `unpaid`). Dispara E11 al alumno y C7 al coach (plantillas en W5.13). **CA**: test de que tras
      revertir, `resolveStudentBillingState` devuelve el estado correcto sin que ningún cron escriba nada;
      y de que revertir dos veces la misma cuota es idempotente.
- [ ] 🔴 W1B.7 **(R14) Endpoint admin de kill-switch**: una sola acción autenticada de admin que apaga
      **Edge Config `COBROS_KILL_SWITCH`** y la fila **`platform_flags.cobros_gate`** en el mismo click (y
      las vuelve a encender). **CA**: tras un click, `private.cobros_gate_enabled()` devuelve `false` **y**
      el lector de Edge Config devuelve `true` para el kill-switch; ningún alumno queda cortado; el runbook
      documenta **las dos** palancas (W7.5). El kill-switch **no** cancela suscripciones de MP (R5: es
      temporal; solo apaga gate, cron y webhook).

**Gates W1B**: `pnpm exec vitest run apps/web/src/lib/cobros apps/web/src/services/cobros` · `pnpm typecheck` ·
`pnpm lint` sobre lo tocado · los asserts de `EXECUTE` de `cobros_grants.sql` (las RPCs siguen sin grant a
`authenticated`).

## W2 — Coach web, modo manual (6-8 días-agente · Opus ×2, uno por superficie)

**Depende de W1** (flags `resolveCobrosAccess`, tipos) **y de W1B** (repositorios y servicios de plata).
`W2.1`, `W2.2`, `W2.3` y `W2.5` se mudaron a W1B/W1; los números **no** se reciclan, para no romper las
citas cruzadas de SPEC/PLAN.

- [ ] W2.4 Servicios `settings/plans/charges` con `assertCobrosAllowed` (W1.21) al inicio de cada mutación
      — `confirm-payment` ya vino de W1B.4. **CA**: cada servicio tiene un test que devuelve 403 para un
      coach Free.
- [ ] W2.6 `/coach/cobros`: `page.tsx` (RSC con `notFound()` si no aplica, patrón
      `coach/subscription/update-card/page.tsx:23`), KPIs del mes, tabla con filtros y búsqueda, panel
      «Cómo cobras», onboarding de 3 pasos. **CA**: la página responde 404 para un coach Free y para un
      Pro fuera de la allowlist; deep links `?alumno=<id>` y `?filtro=vencidos` funcionan.
- [ ] W2.7 Tarjeta «Cobros» en la pantalla «Funciones» de web (`apps/web/src/app/coach/settings/funciones/`;
      el hub `coach/tools/ToolsHub.tsx` fue disuelto por la Ola de orden W4.3), sección nueva
      «Tu negocio». **R20 + DECISIONS-2 §SPEC**: `ToolDef.key` es un `ModuleKey` y «cobros» **no** lo es,
      así que se crea un array aparte **`BUSINESS_TOOLS: BusinessToolDef[]`** con su propio tipo
      (`key: 'cobros'`), y su `active` se calcula con **`resolveCobrosAccess`, nunca con los add-ons
      comprados** ni con `enabled_modules`. **CA**: `pnpm typecheck` verde sin castear `key` a `ModuleKey`;
      un coach Pro con el módulo fuera de la allowlist ve la tarjeta **inactiva** aunque tenga add-ons; el
      coach Free la ve inactiva con copy «no incluido en tu plan»; el navbar **no** cambia; y un test falla
      si `BUSINESS_TOOLS` termina dentro del catálogo de `ModuleKey`.
- [ ] 🔴 W2.8 Pill «Pagos» (6.ª) en `ProfileTabNav.tsx:13-19` + rama de render en
      `ClientProfileDashboard.tsx` con **carga diferida** por `api/cobros/clients/[clientId]/plan`.
      **CA**: el bundle de la ficha **no** consulta `client_payments` cuando la pill está cerrada (se
      verifica con el log de queries), respetando el motivo de la poda del 2026-07-29
      (`client-detail.service.ts:146-150`).
- [ ] W2.9 Cablear la misma pill en el master-detail (`CoachFichaPanel.tsx` +
      `[clientId]/_data/ficha-panel.data.ts`). **CA**: test de render que abre la pill en las **dos**
      encarnaciones de la ficha.
- [ ] W2.10 `ConfirmPaymentDialog.tsx` + reemplazo del flujo de `QuickAddPaymentModal.tsx`, con selector
      de alumno **y cuota**, invocado desde `QuickActionsBar.tsx:58-67` y desde la pill.
      **CA**: registrar un pago sin plan de cobro sigue funcionando (compatibilidad con las 11 filas
      históricas de `client_payments`).
- [ ] W2.11 «Cobros del mes» en `RevenueSheet.tsx`: badges `Al día / Vencido / Sin pago` + `En gracia` +
      `Cortado` + `Avisó que pagó`, migrados a `Badge tone=…`. **CA**: `pnpm check:tokens` verde y cero
      `emerald-500`/`orange-500` crudos en el archivo.
- [ ] W2.12 Roster: `directory-types.ts` (`por_cobrar`), `DirectoryActionBar.tsx`,
      `DesktopRosterTable.tsx` (chip + columna + header CSV `:309`), `DirRowCard.tsx`,
      `ClientsDirectoryClient.tsx`, `ClientActionsSheet.tsx`. **CA**: el filtro «Por cobrar» devuelve
      exactamente los alumnos con estado `due`/`unpaid`/`claimed`, y el CSV exportado trae la columna.
- [ ] W2.13 `AddStudentStepper.tsx`: el `<details> Opcional` pasa a «Cobro (opcional)» con el form
      inline. **CA**: crear un alumno sin tocar el bloque sigue funcionando igual que hoy.
- [ ] W2.14 Test de no-regresión del acoplamiento `is_active`: el corte por impago **no** escribe
      `clients.is_active`. **CA**: test que falla si `assertCoachCanManageClient`
      (`client.service.ts:27-44`) rechaza a un alumno cortado por impago.
- [ ] 🔴 W2.15 **PUBLICAR** el anexo T&C «Cobros» (borrador de W0L.2) en `docs/legal/tos.md` + la sección
      de `apps/web/src/app/legal/page.tsx`, junto con la privacidad de W0L.4 y el DPA de W0L.3, **y**
      registrar `terms_version`/`terms_accepted_at` en el onboarding del módulo. **Esta es la única
      publicación del tren** y tiene que estar cerrada **antes de W6** (la beta cobra plata real y el coach
      acepta el anexo para poder crear un plan). **CA**: no se puede crear un plan sin
      `tax_declaration_accepted_at` y `terms_accepted_at`; la `terms_version` que muestra la web es la misma
      que guarda `coach_billing_settings`.
- [ ] W2.16 Eventos PostHog `cobros_module_enabled`, `cobros_plan_created{mode,period,grace}`,
      `cobros_payment_confirmed{source,surface}`. **CA**: ningún evento lleva monto ni `client_id`.
- [ ] 🔴 W2.17 **(R21 + R2)** El formulario de plan (inline en la pill y en `/coach/cobros`) pide
      **`description` obligatoria ≤ 140** («Asesoría online mensual») y **«primer vencimiento»**, que
      inicializa `paid_through = first_due_on` al crear el plan (**nunca `null` en un plan activo**).
      **Sin prorrateo automático** (DECISIONS-2 §SPEC: fuera de alcance): el coach ajusta a mano la primera
      cuota con «Monto distinto…». **CA**: no se puede guardar un plan sin `description` (validación
      servidor, no solo UI) ni con 141 caracteres; tras crear el plan, `paid_through` = `first_due_on` y el
      estado derivado es `ok`; y la `description` aparece literal en E0, E5 y E6.
- [ ] 🔴 W2.18 **(R8) «Deshacer confirmación» en vez de «Borrar pago»**: en el historial de pagos (web y en
      el `FacturacionTab` de RN, W4.3) las filas **con `charge_id` pierden el ícono de borrar** y ganan
      «Deshacer confirmación» (server action → W1B.5). Los pagos legacy **sin `charge_id`** conservan el
      borrado actual. **CA**: test que falla si una fila con `charge_id` expone borrado; deshacer reabre la
      cuota, retrocede `paid_through` y queda auditado; el botón no aparece si la confirmación no es la
      última de la cuota o tiene más de 7 días.
- [ ] W2.19 **(R16) Prepago de N períodos** en `ConfirmPaymentDialog`: selector «cuántos períodos cubre
      este pago» (1..12) que viaja como `periodsCovered` a W1B.4. **CA**: confirmar con N=3 marca 3 cuotas
      consecutivas `paid` con el **mismo** `payment_id` y deja `paid_through` en el `period_end` de la
      tercera; el historial muestra una sola fila de pago con «cubre 3 períodos».
- [ ] W2.20 **(R21) Export CSV del paquete de evidencia** (`student_billing_consents`) desde el panel
      **admin** de EVA: `terms_version`, `consented_at`, `ip_hash`, `user_agent`, `kind` y el texto exacto
      mostrado, filtrable por coach y por alumno. **CA**: el CSV trae las 5 piezas de W0L.6; solo un admin
      puede pedirlo (test de autorización); no expone tokens ni `access_token`; y la retención de 24 meses
      queda documentada junto a la exclusión de `purge-data`.

**Gates W2**: `pnpm exec vitest run apps/web/src/services/cobros apps/web/src/lib/cobros packages/tiers` ·
`pnpm typecheck` · `pnpm lint` sobre lo tocado · `pnpm check:tokens` · `pnpm docs:check`.

## W3 — Alumno web + correos + cron (3-4 días-agente · Opus) — paralelo con W2, **después de W1B**

**Dependencias**: W1 y W1B. Con W1 (flags, tipos — R18) y W1B (repositorios y servicios de plata) cerradas,
W2 y W3 ya no comparten archivos: W3 solo **importa** `lib/cobros/flags.ts`, los repositorios y
`confirm-payment.service.ts`; no los edita.

- [ ] 🔴 W3.1 `apps/web/src/lib/student-billing.ts` + `.server.ts`: el resolver server-side del alumno,
      **fail-open**, con comentario cruzado hacia `student-access.ts` explicando que el gate viejo es
      fail-closed y este NO. **CA**: test de que sin `paid_through` el alumno entra.
- [ ] 🔴 W3.2 `proxy.ts` **según R15: el plan NO se embebe en el SELECT de identidad del alumno**
      (`:1229`) — un 42501 en el embed dejaría al alumno **fuera** de la app. En su lugar, **segunda
      consulta service-role**, solo para clientes standalone, dentro de un `try/catch` **fail-open**,
      reusando el tier/estado del coach que el proxy ya trae. Bloque nuevo tras `:1373/:1383`; precedencia
      `readonly > archived/paused > unpaid > due` escrita en comentario. Costo asumido: **1 query extra por
      request de alumno** (110 alumnos hoy), a medir en beta (W6.12). **CA**: `proxy.test.ts` cubre las 4
      precedencias, el fail-open sin ancla, **el caso de la segunda consulta que lanza (⇒ el alumno entra
      igual)**, que el SELECT de identidad no cambió de forma, y que `STUDENT_ACCESS_GRACE_DAYS = 7` no
      cambió; además, estados `ended` y `due` derivan del mismo resolver (R1).
- [ ] W3.3 `/c/[coach_slug]/pagos`: estado, monto, modo, botón principal por modo, historial,
      comprobantes, toggle «Recibir recordatorios», «Cancelar mi suscripción». **CA**: en `manual` el
      botón es «Ver cómo pagar» y no hay ningún link a MP.
- [ ] 🔴 W3.4 Claim «avisar que pagué» + comprobante opcional al bucket privado
      (`api/cobros/receipt/route.ts`, máx 5 MB, imagen/PDF), **en un servicio compartido que también usa RN
      (R19)**. **R3**: una cuota `claimed` **no reactiva**, pero **difiere el corte hasta 5 días** después
      del fin de la gracia y **suspende E2/E3/E4** al alumno mientras el claim esté vivo; el coach recibe C2
      al instante y un recordatorio diario («{alumno} avisó hace N días: confirmar o rechazar»); **rechazar
      el claim** (botón del coach) devuelve la cuota al calendario normal. **CA**: rate limit 3/día por
      alumno (`rateLimitCobrosClaim`), **máximo un claim vivo por cuota**, el claim no cambia el acceso al
      instante, forjarlo compra **como máximo 5 días** (test del borde: día 5 = todavía adentro, día 6 =
      cortado) y el coach ve el claim con su antigüedad.
- [ ] W3.5 Banner en `c/[coach_slug]/layout.tsx` para `due_soon` y `due`. **CA**: en `unpaid` no hay
      banner (el proxy ya redirigió).
- [ ] 🔴 W3.6 `/c/[coach_slug]/suspended/page.tsx`, **dos variantes nuevas** (R1; el proxy de W3.2 ya
      redirige las dos, así que sin ambas una cae en el default genérico «Acceso pausado»):
      **(a) `?reason=unpaid`** (corte reversible): «Tu acceso está en pausa» + «Tu progreso está guardado» +
      `Pagar ahora`/`Ver cómo pagar` + «Escribir a mi coach».
      **(b) `?reason=ended`** (corte terminal, plan `canceled` pasado su `paid_through`): **«Tu plan con
      {coach} terminó»** + «Tu progreso está guardado» + **sin ningún CTA de pago** (no hay nada que pagar:
      se arregla con un plan nuevo del coach), solo «Escribir a mi coach».
      **CA**: las dos variantes renderizan su copy propio y ninguna cae en el default; un test falla si
      `?reason=ended` muestra `Pagar ahora`, `Ver cómo pagar` o cualquier monto; la variante `?reason=coach`
      existente no cambia ni un carácter; y el QA de device D8 de `TESTING` encuentra las dos pantallas.
- [ ] W3.7 `client-email-ledger.repository.ts` + `sendCobrosEmailOnce`. **CA**: nunca lanza; devuelve
      outcome; kill-switch `EVA_COBROS_EMAILS_DISABLED` **antes** de Resend; dedupe antes de Resend; la
      fila se escribe **solo** tras envío exitoso; `payload` sin PII.
- [ ] 🔴 W3.8 Templates **E0**, E1, E1-link, E2, E3, E4, E5, C1, C2 y **C2-bis** en `cobros-templates.ts` con
      `wrapEmailLayout`/`ctaButton`, white-label y `replyTo` = correo del coach (C2 con `replyTo` del
      **alumno**). **R21: E0 «tu coach activó tu cobro»** sale al crear el plan y trae monto, ciclo,
      **primer vencimiento**, la `description` del plan, cómo pagar y **quién responde** (el coach, no EVA).
      **C2-bis** es el **recordatorio diario del claim** que exige **R3** («{alumno} avisó hace N días:
      confirmar o rechazar»), con `dedupe_key` `cobros_claim_pendiente:{charge_id}:{yyyy-mm-dd}` y tope de
      5 días; lo dispara el sweep de W3.9.
      El catálogo total del tren es **22 plantillas** (`EMAILS §9`): **13 al alumno** (E0, E1, **E1-link**,
      E2, E3, E4, E5, E6, E7, E8, E9, E10, E11) y **9 al coach** (C1, C2, **C2-bis**, C3, C4, C5, C6, C7,
      C8). Las «16» de DECISIONS-2 §SPEC eran el conteo **previo** a R3 (C2-bis), R5 (C6), R9 (C7/C8) y R21
      (E0), y a la separación de E1-link: **no** se construyen 16.
      **CA**: render tests de asunto, **un solo CTA**, escapado de HTML, `<meta name="color-scheme">` en el
      layout base, un test que falla si E0 no nombra al coach como responsable o si le falta alguno de los
      cinco datos, y otro que falla si C2-bis no existe o no dedupea por día.
- [ ] 🔴 W3.9 Cron `cobros-sweep`: auth `timingSafeEqual` con `CRON_SECRET`, `?dry=1`, espaciado 600 ms,
      resumen en `finally`, decisión pura en `lib/cobros/sweep-decision.ts`. **R4: los avisos se disparan
      por umbral (`≤`), nunca por igualdad de fecha**, con dedupe en `client_email_ledger`; un plan creado
      dentro de la ventana recibe el aviso que le corresponda **al día siguiente**, en el sweep. **R3**: si
      la cuota tiene un claim vivo, E2/E3/E4 quedan suspendidos y el corte se difiere 5 días, pero el coach
      recibe el recordatorio diario. **CA**: test de la función pura con la tabla
      T-5/T-`reminder`/T0/T+(gracia-1)/T+gracia **y con el sweep saltado un día** (el aviso sale igual, una
      sola vez, por el `≤` + ledger); `cut_notified_at` impide el segundo correo de corte; una cuota
      `claimed` no genera E2/E3/E4 y sí genera el recordatorio al coach; excluye `is_demo`, org/team,
      archivados y `reminder_opt_out_at` (solo E1).
- [ ] W3.10 Registrar el cron en `vercel.json` (**`45 12 * * *`**, después de `paid-expiry` `30 12`).
      **CA**: no colisiona con ningún schedule existente de `vercel.json`.
- [ ] W3.11 Extender `api/webhooks/resend/route.ts` para buscar en `client_email_ledger` cuando
      `coach_email_ledger` no matchea. **CA**: los códigos de respuesta actuales (`:26-29`) no cambian y
      su test sigue verde.
- [ ] W3.12 Guard `VERCEL_ENV` en el cron y en `sendCobrosEmailOnce`. **CA**: una corrida en preview
      **no** manda ni un correo real.
- [ ] W3.13 Eventos push `cobros_claim_received`, `cobros_daily_digest`, `cobros_payment_confirmed`,
      `cobros_access_paused`, `cobros_access_restored` en `lib/push-events.ts`. **CA**: **no** existe
      push de recordatorio previo al alumno; todas gateadas por `isPushEventEnabled`.
- [ ] W3.14 Eventos PostHog `cobros_claim_sent{surface}`, `cobros_access_cut`,
      `cobros_access_restored{hours_cut}`, `cobros_email_sent{template}`. **CA**: sin montos ni `client_id`.
- [ ] 🔴 W3.15 **(R1) Copys del estado `ended`** en web y en el resolver del alumno: plan `canceled` con
      `now ≤ paid_through` ⇒ «tu plan termina el X» (acceso normal); después ⇒ **`ended`**, con copy web
      «Tu plan con {coach} terminó» y copy de app «Tu acceso está en pausa». **CA**: test de espejo
      web↔RN de los seis estados; **cancelar no da acceso eterno** (el test que lo demuestra es el borde
      `paid_through + 1 día` ⇒ corte); y `ended` no muestra ningún CTA de pago en la app.
- [ ] W3.16 **(DECISIONS-2 §SPEC) Copy del banner en gracia para `mp_subscription`**: «Mercado Pago está
      reintentando tu cobro. Puedes actualizar tu tarjeta en tu cuenta de Mercado Pago.», **sin botón de
      pago** y **sin estado `recycling`** (el corte ocurre al terminar la gracia igual que en los otros
      modos; si MP recupera el cobro después, el webhook lo confirma y el acceso vuelve solo). **CA**: test
      de que el banner de `due` en modo `mp_subscription` no renderiza CTA de pago y que no existe ningún
      estado nuevo en el union de `packages/cobros`.

**Gates W3**: `pnpm exec vitest run apps/web/src/proxy.test.ts apps/web/src/lib/cobros apps/web/src/lib/email apps/web/src/services/cobros apps/web/src/app/api/cron` ·
`pnpm typecheck` · `pnpm lint` · corrida `?dry=1` en preview con salida pegada en el PR.

## W4 — React Native (2 días-agente · Opus)

- [ ] 🔴 W4.1 `apps/mobile/lib/web-only-hint.ts` + `components/WebOnlyHint.tsx` (extraído de
      `app/coach/(tabs)/subscription.tsx:354-370`): `View` + `accessibilityRole="text"`, **sin**
      `onPress`, ícono `Globe` (plan) / `Monitor` (cobros). **R6 manda**: el topic `cobros` usa **UN solo
      copy, sin dominio y con iOS = Android** — «El cobro a tus alumnos se configura desde el computador»
      (variante de ficha: «El cobro de este alumno se configura desde el computador»), **literal único en
      `apps/mobile/lib/web-only-hint.ts`**. **NO** se crea `STORE_COBROS_SETUP_CAPTION` en `client-cap.ts`
      (DECISIONS-2 §TESTING-LEGAL); el topic `plan` **sigue** usando `storePlanChangeCaption(platform)` sin
      cambio alguno. **Cero «eva-app.cl» nuevo en la app.** **CA**: `tests/mobile/web-only-hint.test.ts`
      verifica `webOnlyHintCopy('plan','ios') === undefined`,
      `…('plan','android')?.caption === STORE_PLAN_CHANGE_CAPTION`, y que **`…('cobros','ios')` y
      `…('cobros','android')` devuelven exactamente el mismo string**; plataformas raras ⇒ fail-safe.
- [ ] 🔴 W4.2 Migrar `subscription.tsx:355-372` al componente y **borrar** `platformPlanCaption` (`:268`);
      y **ampliar `tests/mobile/store-copy.test.ts` para pinnear que el copy de cobros NO contiene
      `eva-app.cl` ni `http`** (DECISIONS-2 §TESTING-LEGAL, A-3), sin aflojar los asserts vigentes del
      literal Android de `client-cap.ts`. **CA**: el test falla si alguien mete un dominio, una URL o una
      variante por plataforma en el hint de cobros; `tests/mobile/store-copy.test.ts` verde; grep confirma
      **una sola** implementación del hint.
- [ ] 🔴 W4.3 Revivir `components/coach/clientDetail/FacturacionTab.tsx` como pill «Pagos»: cablear el
      array `tabs` de `app/coach/cliente/[clientId].tsx:616-641` y el `case` de render (`:752-790`);
      corregir el drift `'#F59E0B'` → token `warning-500`. **R8**: las filas con `charge_id` **no** llevan
      ícono de borrar; llevan «Deshacer confirmación» (misma regla que W2.18). **CA**: `pnpm check:tokens`
      verde; el tab abre con historial + `Confirmar pago recibido` + `<WebOnlyHint topic="cobros"/>`; y un
      test falla si una fila con `charge_id` expone el borrado.
- [ ] W4.4 `app/coach/cobros.tsx` (lista del mes con chips y confirmar) + `MobileBanner` «N alumnos por
      cobrar» en `CoachDashboardSections.tsx` (junto a `MobileBillingBanners`, `:147`) + destino real
      para el «Ir a facturacion» huérfano (`:2146`). **CA**: la pantalla **no** tiene ajustes, ni
      «Conectar Mercado Pago», ni ningún link externo.
- [ ] W4.5 Tarjeta «Cobros» en la pantalla «Funciones» de RN (equivalente de `settings/funciones` web;
      el hub `app/coach/tools.tsx` fue disuelto por la Ola de orden W4.3) dentro de la sección **«Tu negocio»**, con
      el mismo **`BUSINESS_TOOLS`** y el mismo `active = resolveCobrosAccess` del web (**R20**; Pro; Free =
      «no incluido en tu plan»), y `<WebOnlyHint topic="cobros"/>` en
      `components/coach/directory/CreateClientModal.tsx`. **CA**: el `active` de la tarjeta **no** se
      calcula con add-ons comprados (test); un hint por pantalla como máximo; ninguno en onboarding ni en
      pantallas del alumno.
- [ ] 🔴 W4.6 Alumno RN: fila «Tu plan con tu coach · Al día hasta el 12 sep» en `home.tsx` y
      `perfil.tsx`; banner `due` en `StudentAccessBanner.tsx`; **las dos ramas** de `StudentAccessBlocked.tsx`
      — `reason:'unpaid'` y **`reason:'ended'`** (R1/R7: el config de W4.9 emite las dos) — con sus copys
      `blockScreen.unpaid` y **`blockScreen.ended`** en `lib/student-access-copy.ts`. En la app **ambas**
      dicen «Tu acceso está en pausa» (el copy web «Tu plan con {coach} terminó» es solo de la web, W3.6) y
      **ninguna** ofrece CTA de pago: el único CTA es «Escribir a mi coach» (W4.7/W4.8). **CA**: **cero**
      monto, cero link, cero «paga en la web»; el copy es idéntico en iOS y Android; **el test de espejo
      web↔RN cubre los seis estados** (`off | ok | due_soon | due | unpaid | ended`) y falla si `ended` cae
      en el default genérico o si le aparece un CTA de pago; un `reason` desconocido no rompe la pantalla
      (fail-open, W4.10).
- [ ] 🔴 W4.7 `Escribir a mi coach` con `wa.me` **sin** parámetro `text`. **CA**: test nuevo que falla si
      alguna URL de WhatsApp de `apps/mobile/**` incluye `text=` con `$` o la palabra «pagar»; y
      `isStoreSafeUrl` cubre el host.
- [ ] 🔴 W4.8 Poblar `whatsapp` del coach (hoy `null` en `api/mobile/auth/account-status/route.ts:38`),
      que es el **único** CTA permitido en iOS para el alumno cortado. **Entra en este tren y es bloqueante
      de W4** (DECISIONS-2 §PLAN). **Fallback obligatorio si el coach no tiene teléfono: `mailto:` al correo
      del coach.** **CA**: el botón aparece en device cuando el coach tiene teléfono cargado; con `whatsapp`
      null el botón **sigue apareciendo** como `mailto:` (test), nunca desaparece dejando al alumno cortado
      sin salida; y `account-status` no cambia su forma (K8).
- [ ] 🔴 W4.9 `apps/web/src/app/api/mobile/config/route.ts` **según R7**: emitir
      `studentAccess: { state: 'blocked', reason: 'unpaid' | 'ended', graceEndsAt }` + `studentBilling
      { state, paidThrough, cutsAt, canClaim }` — **`cutsAt`, nunca `dueUntil`**: es el nombre que ya
      usa `StudentBillingResult` en `DATA-SECURITY §3.1` y el que queda canonizado en `SPEC §19`, y el
      payload no puede llamarle distinto a la función pura que lo produce. Si el proxy agrega un header
      propio para propagarlo (`STUDENT_BILLING_CUTS_AT_HEADER`, `DATA-SECURITY §4.2`), ese nombre también
      va al glosario de `SPEC §19` antes de usarse. Los **binarios viejos** muestran la pausa genérica
      (seguro); el **OTA** agrega el copy por `reason`. **CA**: test que falla si la respuesta contiene
      `checkout_url`, `init_point` o cualquier monto; `reason` cubre `unpaid` **y** `ended`; un binario
      pre-OTA (simulado ignorando `reason`) sigue mostrando una pantalla correcta y no un texto falso;
      `api/mobile/auth/account-status` **no cambia** (K8).
- [ ] W4.10 `lib/entitlements-core.ts`: normalizar `reason` con fail-open. **CA**: un `reason`
      desconocido no bloquea al alumno (test), y `state:'unpaid'` **no** existe como valor nuevo (K7).
- [ ] W4.11 Rutas bearer `api/mobile/coach/cobros/route.ts` y
      `api/mobile/coach/clients/[clientId]/cobros/route.ts` (molde `api/mobile/coach/payments/route.ts`,
      Zod + bearer + scope de workspace). **CA**: un coach no puede leer ni confirmar la cuota de otro
      (test de IDOR).
- [ ] W4.12 Ampliar `tests/mobile-no-prices.test.ts` con los literales nuevos del tarifario y la
      excepción **angosta** para montos que vienen de datos. **CA**: el guard sigue rompiendo con
      `$29.990`, `29990`, `monthlyPriceClp` y `/mes`; el copy usa «cada mes», nunca «/mes».
- [ ] W4.13 3 filas nuevas en la tabla de guards de `apps/mobile/AGENTS.md:80-84`. **CA**:
      `pnpm docs:check` verde (los links relativos resuelven).
- [ ] 🔴 W4.14 **(R19) Ruta de claim desde RN**: `POST /api/mobile/student/cobros/claim` (bearer verificado
      con `admin.auth.getUser(token)`, molde `api/mobile/checkin-submitted/route.ts`), **sin nota y sin
      archivo** en este tren, con `rateLimitCobrosClaim` 3/día. **Web y RN llaman al MISMO servicio** de
      W3.4 — no hay una segunda implementación del claim. Sin esta ruta, el botón «Avisar a mi coach» del
      alumno en RN no tiene por dónde entrar: las tablas nuevas están con `revoke all … from authenticated`
      (invariante I-1), así que PostgREST directo **no** puede escribir `status='claimed'`. **CA**: el
      `clientId` sale de la sesión, nunca del body (test de IDOR: bearer de A + `chargeId` de B ⇒ 404 sin
      filtrar existencia); Zod `{ chargeId: uuid }`; un claim vivo por cuota; respuesta **sin monto, sin
      instrucciones de pago y sin `checkout_url`** — solo `{ ok, claimedAt }` (K4 y T-20); y un test que
      falla si `canClaim` viaja en `/api/mobile/config` sin que esta ruta exista.
- [ ] W4.15 **(R19) «+ Pago» y «Registrar pago» del coach en RN**
      (`CoachDashboardSections.tsx:647` y `:1045`): si el alumno **tiene plan de cobro**, abren «Confirmar
      pago» **de la cuota**; si **no** tiene, siguen abriendo el pago libre legacy **sin ningún cambio**.
      **CA**: test de las dos ramas; el flujo legacy conserva su payload actual contra
      `POST /api/mobile/coach/payments` (las filas históricas de `client_payments` siguen funcionando).

**Gates W4**: `pnpm --filter @eva/mobile exec tsc --noEmit` ·
`pnpm exec vitest run tests/mobile-no-prices.test.ts tests/mobile apps/web/src/app/api/mobile` ·
`pnpm check:tokens` · `pnpm docs:check`.

## W5 — Riel MercadoPago (5-7 días-agente · Opus; el webhook lo revisa el jefe)

- [ ] W5.1 **Movida a W1.23/W1.24 por R18** (export de `mpRequest/mpPostJson/mpPutJson/buildMpHeaders/
      getMpAccessToken` con token inyectado + `verifyMercadoPagoSignature(request, dataId, secret)` y
      `constantTimeEquals`, en commit aparte, con el test de no-regresión del billing corriendo **en W1**).
      Acá solo queda la **verificación**: `pnpm exec vitest run apps/web/src/app/api/payments apps/web/src/lib/payments`
      sigue verde al empezar W5. **CA**: salida pegada; si algo se rompió entre W1 y W5, se arregla antes de
      escribir una línea del riel.
- [ ] 🔴 W5.2 Defensa en profundidad en la ruta vieja: validar UUID en
      `checkout-external-reference.ts:46-47`; early-return si el `external_reference` empieza con
      `cobro|`; no escribir `subscription_mp_id` sin plan resuelto (`webhook-pipeline.ts:1132-1141`).
      **CA**: casos nuevos en `api/payments/webhook/route.test.ts` — un evento `cobro|…` responde 200 y
      **no** toca `coaches`.
- [ ] W5.3 `lib/cobros/token-crypto.ts` (AES-256-GCM con `COBROS_OAUTH_ENC_KEY_V1`, `import 'server-only'`).
      **CA**: test de round-trip y de que un ciphertext manipulado falla la autenticación.
- [ ] 🔴 W5.4 OAuth: `api/cobros/mp/connect` (cookie httpOnly firmada con state + verifier PKCE, exp
      10 min) y `callback` (validación timing-safe del state, `POST /oauth/token`, `GET /users/me`,
      cifrado y guardado, evento, redirect `/coach/cobros?conectado=1`). **CA**: state desconocido o
      reusado ⇒ 401; `code_challenge` = BASE64URL(SHA256(verifier)) con `S256`; `redirect_uri`
      estática; en preview se manda `test_token: true`.
- [ ] W5.5 `mp-client.ts`: **exige** una `connection` activa para construir el cliente. **CA**: test que
      falla si `getMpAccessToken` aparece en cualquier archivo de `apps/web/src/lib/cobros/**` (T-22).
- [ ] 🔴 W5.6 Webhook `POST /api/cobros/mp/webhook?token=…` con **eventos re-procesables (R12)**:
      `student_payment_events.status in ('received','applied','failed')`; insert
      `on conflict do nothing` **antes** de mutar; **si la fila ya existe con `applied` ⇒ 200 y salir**; si
      existe con `failed`, o con `received` y **más de 2 minutos** de antigüedad ⇒ **re-procesar** (nunca
      quedarse pegado en `received` por un crash). Resolución del dueño por `external_reference`; **re-fetch
      del recurso con el token del coach**; verificación `collector_id === connection.provider_account_id`.
      **Autorización (R22)**: `?token=` obligatorio siempre; la **firma** se exige solo cuando
      `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true` (hasta que X1 se confirme en nivel C, se **verifica si viene**
      y se loguea el `x-signature` crudo para resolver X1). **CA** (molde
      `api/payments/webhook/route.test.ts`): redelivery idempotente · token inválido ⇒ 401 · firma inválida
      con el flag encendido ⇒ 401, con el flag apagado y firma ausente ⇒ se procesa · recurso de otro coach
      o desconocido ⇒ **`applied` con nota + 200**, cero mutación (T-08 / A10) · **fallo transitorio (MP 5xx
      o timeout) ⇒ `failed` + 502** (MP reintenta cada 15 min) · un evento `received` de hace 3 minutos se
      re-procesa y no duplica el pago.
- [ ] 🔴 W5.7 `api/cobros/checkout` y **`external_reference` por modo (R10)**: preferences (`mp_link`)
      llevan `cobro|coachId|clientId|chargeId`; preapprovals (`mp_subscription`) llevan
      `cobro|coachId|clientId|**planId**` (el ref es **inmutable** y la suscripción vive N cuotas).
      `mp_link` devuelve/crea la preference; `mp_subscription` crea o recupera el preapproval `pending` con
      `X-Idempotency-Key cobro:<planId>:<v>`. **CA**: `external-reference.ts` tiene un parser/serializador
      **por modo** con test de ida y vuelta para los dos; dos POST seguidos devuelven el **mismo**
      `init_point` (T-19); `start_date` siempre `.toISOString()`; y un test falla si alguien mete un
      `chargeId` en el ref de un preapproval.
- [ ] 🔴 W5.7b **(R10) Resolución de la cuota de un `authorized_payment` por PERÍODO, nunca por el
      `chargeId` del ref**: la fecha de cobro cae dentro de `[period_start, period_end]` de una cuota; si no
      existe, **se crea**. **CA**: test con un `authorized_payment` cuyo período no tiene cuota ⇒ se crea
      una y se marca `paid`; test con dos `authorized_payment` del mismo período ⇒ el segundo es duplicado
      (W5.19), no un segundo avance de `paid_through`.
- [ ] W5.8 `/c/[slug]/pagos/retorno`: poll cada 4 s (patrón `flow-processing`) y **sincronía como fuente
      de verdad** cuando MP vuelve con `collection_status=approved` (re-fetch con el token del coach).
      **CA**: el webhook posterior no duplica el pago (lección `project_billing_webhook_spof`).
- [ ] 🔴 W5.9 **Aviso previo + consentimiento registrado (R21)**: la versión **completa** (LPC art. 12 A /
      Ley 21.398 — precio total, periodicidad, día de cobro, cómo cancelar, que EVA no cobra ni retiene,
      quién responde, mayor de 18) antes de **suscribirse**; y una **versión corta obligatoria también en el
      PRIMER checkout de `mp_link`**. Cada aceptación escribe una fila en **`student_billing_consents`**
      (`kind = 'subscription' | 'first_checkout'`, `terms_version`, `consented_at`, `ip_hash`,
      `user_agent`). La rama de retracto/mayoría de edad implementada es **una sola**, la que decidió W0L.5.
      **CA**: no se puede llegar a `init_point` sin el checkbox en **ninguno** de los dos modos; existe la
      fila de consentimiento con las 5 piezas; y el export de W2.20 la encuentra.
- [ ] W5.10 Cancelación por el alumno: `PUT /preapproval/{id} {status:'cancelled'}` + plan `canceled`
      con `canceled_by='student'` + correos E7. **CA**: conserva acceso hasta `paid_through` y **después
      pasa a `ended`, no a acceso eterno** (R1: test del borde `paid_through + 1 día`); un botón, sin
      trámite; es **irreversible** y el copy lo dice.
- [ ] 🔴 W5.11 **Desautorización desde MP** (`mp-connect` / `application.deauthorized`): EVA ya **no puede**
      llamar a la API del coach, así que conexión `revoked`, planes `mp_*` → `manual` **sin cortar a nadie**,
      y **C5 al coach con instrucciones para cancelar las suscripciones en su propio panel de MP** (R5).
      **CA**: ningún alumno pierde acceso por esto (test); C5 nombra explícitamente que EVA ya no puede
      cancelar por él; y no se intenta ni una llamada a la API con tokens muertos.
- [ ] 🔴 W5.12 Cron `cobros-mp-reconcile` (**`15 13 * * *`**) **con reconcile real de suscripciones (R11)**:
      por cada suscripción viva, `GET /authorized_payments/search?preapproval_id=…` y **materializar los
      aprobados que falten** (idempotente por `provider_payment_id`, cuota resuelta por período — W5.7b);
      para `mp_link`, `GET /v1/payments/search?external_reference=…`. El **alert-only** queda **solo para el
      drift de estado**, no para los pagos. Además: refresh de tokens con `expires_at < now()+30d` bajo
      `select … for update` con rotación atómica del `refresh_token`, y expiración de preferences.
      **CA**: un pago aprobado que MP nunca notificó aparece confirmado tras una corrida y **no** se duplica
      en la segunda; `invalid_grant` ⇒ conexión `error` + C5 + los planes `mp_*` **no cortan**; nunca cancela
      una suscripción porque MP esté inaccesible.
- [ ] W5.13 Templates **E6, E7, E8, E9, E10, E11, C3, C4, C5, C6, C7, C8** (12 acá + las **10** de W3.8 —
      E0, E1, E1-link, E2, E3, E4, E5, C1, C2, C2-bis — = **22 plantillas**, el catálogo completo de
      `EMAILS §9`; **E10 se mantiene separado de E5**, decisión del writer 5). **CA**: **E6** trae la confirmación escrita obligatoria (monto, periodicidad, día de
      cobro, cómo cancelar, quién responde) **parametrizada con `client_billing_plans.description`** (R21),
      **sin campo libre del coach** en este tren, y con el texto estándar de retracto marcado «VALIDAR CON
      ABOGADO»; **E11** avisa al alumno «tu pago fue reembolsado/desconocido; tu acceso queda en pausa el
      X» (R9); **C4** el aviso de comisión MP (~2,9-3,2 % + IVA la paga el coach), contracargos y boleta;
      **C6** «bajaste a Free» (R5); **C7** reembolso/contracargo (R9); **C8** pago duplicado (R9).
      **E5/E6/E7 ignoran `EVA_COBROS_EMAILS_DISABLED`** (obligación contractual) y hay un test que lo pinnea.
- [ ] W5.14 `scripts/cobros-fake-webhook.mjs`: firma un webhook a mano contra preview. **CA**: el POST
      firmado pasa la verificación real de `webhook-authorization` de Cobros.
- [ ] W5.15 Scrubbing en Sentry de `access_token`, `refresh_token`, `init_point`. **CA**: test o captura
      de un evento con esos campos redactados.
- [ ] W5.16 Eventos PostHog `cobros_mp_connected`, `cobros_mp_disconnected{reason}`,
      `cobros_charge_link_sent`, `cobros_subscription_authorized`, `cobros_subscription_canceled{by}`.
- [ ] 🔴 W5.17 **(R5) Nadie sigue cobrando a quien perdió el acceso — cancelación en cascada**: cancelar el
      preapproval por API (`PUT /preapproval/{id} {status:'cancelled'}`, con **reintentos y alerta si
      falla**) en los cuatro disparadores: (a) el plan se **cancela**; (b) el alumno se **archiva o
      elimina**; (c) el coach **desconecta MP desde EVA** — se cancelan **TODAS** sus suscripciones vivas
      **ANTES** de revocar los tokens, con un **diálogo que se lo dice** y no deja seguir a ciegas; (d) el
      coach **baja a Free** (W5.18). El **kill-switch global NO cancela** nada (es temporal: solo apaga
      gate, cron y webhook). **CA**: test por disparador de que no queda ninguna suscripción viva apuntando
      a un alumno sin acceso; test de que el `disconnect` **falla y no revoca** si alguna cancelación no
      pudo confirmarse (con alerta); test de que encender `COBROS_KILL_SWITCH` **no** cancela ni una
      suscripción; y el reintento queda registrado en `coach_payment_connection_events`.
- [ ] 🔴 W5.18 **(R5) Coach que baja a Free**: correo **C6** + **cancelación automática de sus suscripciones
      vivas** + los planes quedan **`paused`** (no `canceled`), enganchado en el camino de downgrade/expiración
      del billing EVA↔coach **sin tocar su lógica** (solo un hook aditivo). **CA**: tras el downgrade, cero
      preapprovals vivos, todos los planes `paused` y ningún alumno cortado por esto (estado `off`); al
      volver a Pro, los planes se pueden reactivar sin recrear datos.
- [ ] 🔴 W5.19 **(R9) Reversa por reembolso / contracargo y pago duplicado**, sobre W1B.6: el webhook y el
      reconcile marcan la cuota `refunded` | `charged_back`, `client_payments.status` idem, **`paid_through`
      retrocede** al `period_end` de la cuota anterior pagada, el estado derivado se recalcula (puede quedar
      `unpaid`) y salen **E11** al alumno y **C7** al coach. **Pago duplicado** (segundo pago aprobado para
      una cuota ya `paid`): se registra en `client_payments` con **`charge_id null`** y **`status='duplicate'`**,
      sale **C8** al coach para que lo devuelva desde MP, y **`paid_through` nunca avanza dos veces**.
      **CA**: test de reembolso ⇒ retroceso exacto + E11 + C7; test de contracargo ⇒ idem; test de duplicado
      ⇒ fila `duplicate` con `charge_id null`, C8 enviado y `paid_through` intacto; los tres son idempotentes
      ante redelivery del webhook.

**Gates W5**: `pnpm exec vitest run apps/web/src/app/api/payments apps/web/src/lib/payments apps/web/src/app/api/cobros apps/web/src/lib/cobros` ·
`pnpm typecheck` · `pnpm lint` · nivel A completo (A1..A12 de s2 §10) verde.

## W6 — QA A/B/C, Playwright, device y beta cerrada (3-4 días-agente + 2-3 semanas de beta · Opus + owner)

**Bloqueada por `W0-legal`**: W6.8 enciende plata real.

- [ ] W6.1 **Suite completa una vez, antes del push**: `pnpm install --frozen-lockfile` ·
      `pnpm docs:check` · `pnpm lint` · `pnpm typecheck` · `pnpm check:tokens` · `pnpm exec vitest run` ·
      `pnpm build` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm check:nutrition-v2-boundaries`.
      **CA**: todo verde, con la salida real pegada (nada se declara verde sin ejecución).
- [ ] W6.2 `tests/cobros-coach.spec.ts` y `tests/cobros-alumno.spec.ts` (Playwright). **CA**: corren con
      `--workers=1`, **1 navegador, tandas en serie**, contra preview o `.env.e2e.local`, nunca 6 en
      paralelo (incidente Supabase Micro del 22-08); `/auth/v1/health` monitoreado durante la corrida.
- [ ] 🧑 W6.3 Nivel B (sandbox MLC): crear test users vendedor/comprador, correr OAuth end-to-end,
      preapproval, `init_point`, matriz `APRO/FUND/OTHE/SECU/CONT`, cancelación, aislamiento coach A↔B.
      **CA**: la evidencia de s2 §10 nivel B archivada, con el `access_token` **redactado**.
- [ ] W6.4 Tapar lo que el sandbox no valida: `scripts/cobros-fake-webhook.mjs` + Simulador del panel.
      **CA**: queda escrito en el PR que el sandbox de MP **no entrega webhooks** (hecho documentado) y
      cuál fue el sustituto.
- [ ] 🧑🔴 W6.5 Nivel C con plata real: los 14 pasos C0..C13 (CLP 1.000 × 2, `frequency_type: days`,
      coach = cuenta MP distinta de «EVA SPA», alumno = tarjeta del owner). **Acá se resuelve X1 (R22)**:
      con la **primera notificación real** se loguea el `x-signature` crudo y se verifica contra el secret
      de «EVA Cobros». **CA**: C5, C6 y C7 demuestran webhook real + firma real; queda escrito **qué secret
      firma**; C11 deja los reembolsos hechos; C13 no deja nada vivo cobrando (y lo verifica con W5.17).
- [ ] 🧑 W6.6 QA de device Android: coach y alumno, claro y oscuro, marca EVA y white-label.
      **CA**: pill «Pagos», `app/coach/cobros.tsx`, banner `due` y pantalla `unpaid` revisados; sin
      precio ni link en ninguna pantalla del alumno; safe areas y teclado OK.
- [ ] 🧑 W6.7 QA de device iOS (mismo alcance). **CA**: además, revisión explícita de que **ninguna**
      pantalla iOS muestra precio, link, URL, nombre de plan ni texto que explique dónde se paga; el
      único CTA del alumno cortado es «Escribir a mi coach».
- [ ] 🧑🔴 W6.8 Encender la beta: `COBROS_ENABLED=true` y 2-3 `coach_id` en `COBROS_BETA_COACH_IDS`.
      **CA**: (a) las **12** casillas de `TESTING-LEGAL.md` § «Bloqueantes antes de abrir el riel automático a
      plata real» están marcadas **con evidencia** (LEGAL-01, anexo aceptado, DPA, RUT + inicio de
      actividades, correo art. 12 A, pantalla previa + retracto decidido, cancelación simétrica, comprobante
      que dice que no es boleta, paquete de evidencia, guards de tiendas, tokens cifrados, X1 — esta última
      **no bloquea encender la beta**: R22 la resuelve dentro del nivel C, con la primera notificación real,
      y se cierra girando el flag en W6.11) — es decir,
      `W0-legal` cerrada; y (b) los coaches cumplen los 3 criterios de entrada (Pro activo, ≥ 5 alumnos
      reales, T&C + RUT aceptados) y ninguno es cuenta de prueba.
- [ ] W6.9 Monitoreo diario durante 2-3 semanas: Sentry, `student_payment_events`, logs del webhook,
      digest C1. **CA**: registro semanal de las 6 métricas de PLAN §3.
- [ ] W6.10 Ensayo del apagado **de las dos palancas** (R14): el endpoint admin de W1B.7 apaga Edge Config
      **y** `platform_flags.cobros_gate` en un click. **CA**: ningún alumno queda cortado con el switch
      encendido —ni por proxy/API ni por el gate de DB—, no se escribió ni una fila de estado para lograrlo
      (el estado es derivado), y **ninguna suscripción de MP se canceló** (R5).
- [ ] 🧑🔴 W6.11 **(R22) Endurecer la firma del webhook**: con X1 confirmado en W6.5, girar
      `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true` en Production. **CA**: una notificación real firmada pasa;
      una con firma inválida devuelve 401; queda registrado en `RUNBOOK.md` cómo volver a `false` si MP
      cambia el esquema.
- [ ] W6.12 **(R15) Medir el costo del proxy en beta**: p75 de latencia de request de alumno **antes y
      durante** la beta, para la query extra service-role. **CA**: la medición queda escrita; si el p75
      sube más de lo tolerable, la mitigación (cachear por isolate el resultado por `clientId` con TTL
      corto) queda propuesta con número, no con opinión.

## W7 — GA, review y docs (0,5 día-agente · Sonnet + juicio del jefe)

- [ ] 🧑🔴 W7.1 Aprobación explícita del owner tras revisar los criterios de salida (0 cortes erróneos,
      0 dobles cobros, ≥ 1 ciclo cobrado por el riel MP con webhook real, rebotes < 2 %, respuesta del
      contador). **CA**: la decisión queda escrita.
- [ ] W7.2 `COBROS_GA=true` y `COBROS_BETA_COACH_IDS` vaciada. **CA**: un coach Pro fuera de la vieja
      allowlist ve el módulo; un Free sigue sin verlo.
- [ ] W7.3 `docs/status/CURRENT.md`: ítem nuevo bajo Web/PWA con el patrón vigente (hito en negrita +
      fecha + link a la spec + shas + **Pendiente:**), **incluyendo el `REVOKE ALL ON client_payments FROM
      anon` como hallazgo de seguridad cerrado en el tren** (DECISIONS-2 §PLAN, tarea W1.3).
      **CA**: `pnpm docs:check` verde y el hallazgo nombrado con su migración.
- [ ] W7.4 `docs/status/MOBILE_PARITY.md`: blockquote nuevo en el resumen ejecutivo con fecha, spec,
      OTA y las rutas RN concretas. **CA**: mismo formato que la entrada de `library-new-choice` (`:8-20`).
- [ ] W7.5 `docs/operations/RUNBOOK.md`: 2 filas en `## Crons activos` (`cobros-sweep` `45 12 * * *` y
      `cobros-mp-reconcile` `15 13 * * *`), el ejemplo P0 nuevo en `## Clasificación` y las 5 subsecciones
      de incidentes de PLAN §5, **más el kill-switch de dos palancas (R14: Edge Config + fila
      `platform_flags.cobros_gate`, ambas desde el endpoint admin de W1B.7) y la nota de que el
      kill-switch NO cancela suscripciones de MP (R5)**; y el diferimiento de **M16** documentado si el
      `EXPLAIN` superó el +15 % (DECISIONS-2 §DATA-SECURITY). **CA**: `pnpm docs:check` verde y el runbook
      nombra **las dos** palancas.
- [ ] 🔴 W7.6 `docs/operations/APP_REVIEW_NOTES.md`: frase nueva en `## Billing` y punto 5 en
      `## Notes for Review (EN)` con la **redacción final de R23**, literal:
      «Coaches on paid plans can track payments their clients make to them. Payments are made outside the
      app — by bank transfer or on Mercado Pago, to the coach's own Mercado Pago account — never inside the
      app; there is no purchase flow, price, or payment link in the app. EVA does not collect funds or take
      a commission. When a client's access is paused, the app shows status only and lets the client contact
      their coach.» **Sin invocar 3.1.3(f)** (defensa débil; R23 la descarta). **CA**: el texto coincide
      palabra por palabra con R23; la línea de Android (`Los cambios de plan se hacen en eva-app.cl`)
      **no** aparece en las notas de Apple; y no hay ninguna mención a «free stand-alone companion».
- [ ] W7.7 Borrar de `docs/operations/MANUAL_TASKS.md` las entradas COB-* ya cumplidas (regla del
      archivo: lo terminado se elimina, Git guarda el historial). **CA**: solo quedan las pendientes.
- [ ] W7.8 Pasar la spec a `status: implemented-pending-qa` y actualizar `last_verified` con la fecha y
      el sha. **CA**: `pnpm docs:check` verde.
- [ ] 🔴 W7.9 **(R21 + DECISIONS-2) REVALIDACIÓN de los textos legales antes de GA — no se publica nada
      acá**: la publicación ocurrió en **W2.15** (borrador en W0-legal). Esta tarea solo verifica que el
      anexo «Cobros» de `docs/legal/tos.md`, la sección de `apps/web/src/app/legal/page.tsx`, la privacidad
      (W0L.4) y el DPA (W0L.3) **siguen publicados y versionados** con la misma `terms_version` que
      `coach_billing_settings` registró en las aceptaciones de la beta; si el texto cambió durante la beta,
      se emite una `terms_version` nueva y se re-acepta por el flujo de W2.15. **CA**: la versión que muestra
      la web es **idéntica** a la registrada en las aceptaciones (query de verificación pegada), el diff de
      esta tarea **no** toca los archivos legales salvo bump de versión justificado, y `pnpm docs:check`
      verde.

## Gates (por wave; suite completa una vez antes del push)

Por wave, solo lo que la wave tocó: `pnpm exec vitest run <archivos>` · `pnpm typecheck` ·
`pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm check:tokens` · `pnpm docs:check` · `pnpm lint`.
Una sola vez pre-push: `pnpm install --frozen-lockfile` · `pnpm docs:check` · `pnpm lint` ·
`pnpm typecheck` · `pnpm check:tokens` · `pnpm exec vitest run` · `pnpm build` ·
`pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm check:nutrition-v2-boundaries`.
Fuera de CI y a mano: los `.sql` de `supabase/tests/` en `BEGIN; … ROLLBACK;` (`cobros_grants`,
`cobros_isolation`, `cobros_gate_equivalence` y **un `*_rollback.sql` por migración**), `get_advisors`
antes/después de cada migración, y Playwright con **1 navegador en serie**.

## Entrega

- [ ] E.1 **Las 16** migraciones de la lista única (M1…M16 de `DATA-SECURITY §1`; los cambios de R16 y R21
      viajan dentro de M2/M3/M8 y no suman archivos) en LIVE con el feature apagado, en orden y
      una por una (protocolo aditivo: censo → ensayo en transacción → aplicar → advisors → regenerar tipos).
- [ ] E.2 Deploy web sin `COBROS_ENABLED` en Production.
- [ ] E.3 OTA RN por `mobile-ota.yml`, desde rama con master mergeado, a los runtimes vigentes (piso
      1.1.2). **Sin binario nuevo**: no hay config plugin ni permiso nuevo.
- [ ] E.4 Encender el flag para la allowlist (W6.8) — **después** del OTA, nunca antes.
- [ ] E.5 GA (W7.2) tras la aprobación del owner.
