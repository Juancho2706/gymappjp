# TASKS — Composición corporal dual (BIA + ISAK 5 componentes)

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-11
**Spec:** `specs/movida-bodycomp/SPEC.md`
**Plan:** `specs/movida-bodycomp/PLAN.md`
**Módulo:** `body_composition`

Leyenda: `[ ]` pendiente · `[x]` hecho. DoD por tanda (regla 2026-06-10): **typecheck + vitest** verdes;
Playwright/SQL contra Supabase **solo en el gate autorizado**. Specs/suites nuevas se escriben en la tanda y
se corren en el gate. Cada fase: commit + push (cuando el usuario lo pida).

---

## F0 — Baseline anti-regresión

- [ ] **T0.1** Test de render de `ProgressBodyCompositionB6` (peso/IMC/energía/fotos) con fixtures de check-ins,
      como baseline de **cero regresión** de la curva de peso.
  - Scope: `apps/web/src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.test.tsx` (o smoke del helper
    `profileBodyCompositionUtils`). No tocar el componente.
  - Verificación: `pnpm test` verde; documenta que el peso vive en `check_ins`, no en la tabla nueva.

## F1 — Cálculo puro + golden (sin DB, sin UI) — núcleo testeable local

- [ ] **T1.1** `domain/bodycomp/types.ts`: `BiaMetrics`, `IsakRawInput`, `IsakResult`, `Somatotype`, `BodyFatEquation`.
  - Scope: tipos puros; sin imports de Next/Supabase/`lib/`.
  - Verificación: typecheck.
- [ ] **T1.2** `domain/bodycomp/phantom.ts`: constantes del phantom Kerr (medias `P`, SD `s`, exponente `d` por
      variable) + `phantomZ(value, P, s, d, heightCm)`. **Cita de fuente** en comentario (Ross & Kerr 1988).
  - Scope: módulo puro. Las constantes del phantom **NO son un bloqueante externo de Movida**: están en la
    literatura publicada (Ross & Kerr 1988; tabla/manual original, reproducidas en material ISAK) → **tarea de
    research del implementador**: transcribirlas con cita de fuente verificable. **No** dejar `it.todo` ni
    placeholders "definitivos"; si una constante no se confirma, se sigue investigando hasta tenerla (AC3 es
    incondicional). Lo que depende de Fran es la **paridad** con fichas reales para `is_validated` (T6.2), no estas
    constantes.
  - Verificación: `phantom.test.ts` con `phantomZ` contra un cálculo manual conocido (verde, sin `it.todo`).
- [ ] **T1.3** `domain/bodycomp/anthropometry.ts`: `fractionate5C(input)` (adiposo/muscular/óseo/residual/piel, kg y %).
  - Scope: modelo Kerr vía Z-scores del phantom; invariante Σ masas ≈ peso.
  - Verificación: **golden Kerr** (caso publicado) tolerancia masas <2 % + invariante de suma. Vitest local.
- [ ] **T1.4** `domain/bodycomp/somatotype.ts`: `heathCarter(input)` (endo/meso/ecto, 3 ecuaciones del manual).
  - Scope: incluye tramos de ectomorfia por HWR; perímetros corregidos por pliegue.
  - Verificación: **golden Heath-Carter** (ejemplo del manual) tolerancia ≤0.3/eje.
- [ ] **T1.5** `domain/bodycomp/bodyfat.ts`: `bodyFatPct(input, equation)` — Durnin-Womersley (densidad log10 → Siri),
      Yuhasz, Faulkner; despacho por `equation`.
  - Scope: DW con coeficientes por sexo/edad; Yuhasz/Faulkner lineales.
  - Verificación: golden por ecuación contra valores publicados; DW edge de rangos de edad.
- [ ] **T1.6** `domain/bodycomp/index.ts`: `computeIsak(raw, { bodyFatEquation })` compone 5C + somatotipo + %grasa
      en `IsakResult`; barrel.
  - Verificación: test de composición end-to-end de un input ISAK → `IsakResult` esperado.

## F2 — Migración + RLS (branch efímero Pro; aplicar SOLO en el gate de DB autorizado)

- [ ] **T2.1** Migración `<ts>_body_composition_measurements.sql` (DDL del PLAN): tabla + CHECK `method` + índices
      (`idx_bcm_org` **parcial** `WHERE org_id IS NOT NULL`) + **trigger `handle_updated_at`** + **hardening de grants**
      (`REVOKE ALL FROM anon, authenticated` → `GRANT SELECT, INSERT, UPDATE` a authenticated **sin DELETE**, `GRANT
      ALL` a service_role; patrón M3 `20260609054917`). Aditiva, idempotente (`IF NOT EXISTS`), forward-only,
      soft-delete `deleted_at`.
  - Verificación: aplica en branch; `MIGRATIONS_PASSED`.
- [ ] **T2.2** Policies RLS `bcm_select` (SELECT), `bcm_insert` (INSERT), `bcm_update` (UPDATE, cubre soft-delete),
      `bcm_service` (ALL service_role). **Sin** policy/grant DELETE para `authenticated`. SELECT usa **helpers
      set-returning existentes** (`current_user_pool_client_ids()`/`current_user_team_ids()`) + `col IN (SELECT helper())`
      + columna `coach_id` para standalone + `(select auth.uid())`. **Sin rama org en v1** (helper inexistente +
      over-grant del modelo 1 coach↔alumno; ver PLAN). INSERT/UPDATE: `WITH CHECK` **amarra `client_id` al scope** vía
      `EXISTS` sobre `clients` (patrón hardening `20260609180000` / `team_access_logs_member_insert`; solo en WITH CHECK).
      **Prohibido** per-row / EXISTS correlacionado en el **USING de SELECT** (incidente 2026-06-09).
  - Verificación: `EXPLAIN ANALYZE` loops=1 (SELECT/INSERT vía pool); `get_advisors` 0 `auth_rls_initplan`; correctness
    en `BEGIN…ROLLBACK` con seed (team A ≠ team B; standalone aislado; estampar `client_id`/`team_id` ajeno BLOQUEADO).
- [ ] **T2.3** `tests/team/bodycomp-isolation.sql`: aislamiento (T-cases: team A ≠ team B, standalone propio,
      no-miembro sin acceso, soft-deleted fuera; **WITH CHECK:** INSERT con `client_id` ajeno BLOQUEADO en standalone,
      INSERT con `team_id` que no es el del cliente BLOQUEADO en pool; **authenticated no puede DELETE**). Gate, no tanda.
- [ ] **T2.4** Merge en verde → snapshot `_bak_*` pre-merge → `supabase db pull` + `generate_typescript_types`
      → `database.types.ts` con la tabla nueva → `delete_branch` el mismo día.
  - Verificación: typecheck verde con la tabla en types.

## F3 — Repository + service + schemas

- [ ] **T3.1** `packages/schemas/bodycomp.ts`: `BiaMetricsSchema` (visceral área y nivel **separados**),
      `IsakRawInputSchema`, `BodyCompositionCreateSchema` (`z.discriminatedUnion('method', …)`). `+ bodycomp.test.ts`.
  - Verificación: acepta BIA/ISAK válidos; rechaza payload desconocido / método inválido. Vitest local.
- [ ] **T3.2** `infrastructure/db/body-composition.repository.ts`: `insert`, `listByClientAndMethod`, `getById`,
      `softDelete` — user-scoped, `SELECT` de columnas específicas (no `*`).
  - Verificación: typecheck; firma alineada a `database.types`.
- [ ] **T3.3** `services/bodycomp/body-composition.service.ts`: orquesta `assertBodyCompositionEnabled()` (kill-switch
      Edge Config `body_composition_kill_switch`, **antes** del entitlement) → `assertModule('body_composition', ctx)` →
      write-access → **assert consentimiento de salud (team)** → Zod → si ISAK `computeIsak` → repository →
      `logTeamClientAccess`.
  - Scope: `ctx` por workspace activo (team ⇒ teamId; standalone ⇒ coachId); reusa `getCoachClientScope`.
  - Verificación: unit con seed: falla sin módulo; falla sin consentimiento (team); persiste derivados correctos.
- [ ] **T3.4** `assertCoachClientWriteAccess` (análogo a `assertCoachClientReadAccess`) para las actions de escritura.
  - Verificación: typecheck; cubre team/standalone/enterprise.

## F4 — Captura BIA (UI)

- [ ] **T4.1** `_data/body-composition.queries.ts` (RSC, `React.cache`): lista mediciones por método; `assertModule`
      al tope; scope por workspace activo. **NO** Supabase directo en `_data` (pasa por service/repository).
  - Verificación: typecheck; data flow correcto (pilar Clean Arch).
- [ ] **T4.2** `_actions/body-composition.actions.ts`: `saveBodyCompositionAction` + `deleteBodyCompositionAction`
      (Zod server + `revalidatePath`).
  - Verificación: typecheck; validación server con el mismo schema que el cliente.
- [ ] **T4.3** `BiaCaptureForm.tsx` (RHF+Zod, `useActionState`) + `BiaTrendPanel.tsx` (recharts, serie + delta del
      mismo método + etiqueta dispositivo+fecha). Campos del dispositivo elegido (InBody área vs Tanita nivel).
  - Verificación: mobile `h-dvh`/`*-safe`, dark mode; manual: guardar BIA → aparece en pestaña BIA.

## F5 — Captura ISAK + resultado

- [ ] **T5.1** `IsakCaptureForm.tsx`: pasos pliegues → perímetros → diámetros (`useTransition`) + **cálculo en vivo**
      del lado cliente con las funciones puras de `domain/bodycomp` antes de persistir.
  - Verificación: el preview en vivo coincide con el `metrics` que persiste el server (mismo código puro).
- [ ] **T5.2** Persistencia: `saveBodyCompositionAction(method='isak')` calcula `metrics` server-side, guarda
      `equation_used`, `is_validated=false`.
  - Verificación: unit del service (metrics derivados correctos); typecheck.
- [ ] **T5.3** `IsakResultCard.tsx` + `IsakTrendPanel.tsx`: 5 componentes (kg+%), somatotipo, **% grasa con label
      "preliminar"** mientras `!is_validated`; serie por método sin mezclar con BIA.
  - Verificación: % grasa nunca en la misma curva que BIA; label "preliminar" visible; dark mode.
- [ ] **T5.4** `BodyCompositionTabB6b.tsx` + wiring en `ClientProfileDashboard.tsx` (render condicional cuando el
      módulo está ON) + sub-pestañas BIA/ISAK. Curva de peso de `ProgressBodyCompositionB6` **intacta**.
  - Verificación: baseline F0 sigue verde (cero regresión del peso).
- [ ] **T5.5** i18n: keys `bodycomp.*` en `es.json` **y** `en.json` (mismo commit). Términos de dominio (1C/1P,
      somatotipo) como términos de dominio.
  - Verificación: sin strings hardcodeados; ambos json con las keys.

## F6 — Gate E2E autorizado + paridad (solo con OK del usuario)

- [ ] **T6.1** Correr `tests/team/bodycomp-isolation.sql` + E2E coach→ficha (BIA e ISAK del mismo alumno; pestañas
      separadas; %grasa no mezclado; label "preliminar") — `--workers=1`, build prod.
- [ ] **T6.2** Cuando lleguen las **3-5 fichas reales de Fran**: golden de **paridad** (masas <2 %, %grasa ≤1.0 pp,
      somatotipo ≤0.3/eje) → si pasa, marcar el set de cálculo `is_validated` y quitar el label "preliminar".
- [ ] **T6.3** Observabilidad: tag de error por módulo en el cálculo ISAK y en las server actions (métrica mínima:
      tasa de error de cálculo ISAK) — Director §3.

## F7 — Diferido (Non-Goals, fuera de v1)

- [ ] **T7.1** Import CSV InBody (`source='csv_import'`, parser por marca/modelo) — fase 2 condicionada.
- [ ] **T7.2** Vista del alumno `/c/[coach_slug]/composicion` read-only (gate `is_validated` para %grasa) — declarar
      un `NavModule` con `entitlement: 'body_composition'` si se habilita.

---

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] Tests del dominio tocado (golden `domain/bodycomp/*` + schemas + service) verdes
- [ ] Sin llamadas directas a Supabase en `_data` (pasa por service/repository)
- [ ] Server actions validan con Zod (mismo schema en cliente y servidor)
- [ ] Mutaciones llaman `revalidatePath()` donde corresponde
- [ ] Mobile: `dvh` (no `vh`/`h-screen` fuera de `md:`); `*-safe` en bordes fijos
- [ ] Dark mode revisado en toda UI nueva
- [ ] `assertModule('body_composition', ctx)` al tope de toda action/RSC del módulo
- [ ] Consentimiento de salud (team) verificado server-side antes de persistir; acceso en `team_access_logs`
- [ ] RLS set-returning (sin per-row), `get_advisors` 0 críticos, snapshot pre-merge, branch borrado el mismo día
- [ ] Docs canónicas actualizadas (rutas/schema/flujos) + bitácora del Director en el mismo cambio

## Notas

- El **mayor valor testeable local** es F1 (cálculo puro + golden) — se puede avanzar completo sin tocar Supabase,
  y **no** está bloqueado por Movida: las constantes del phantom Kerr son research del implementador (literatura
  publicada), no un dato a pedir a Ani/Fran (ver SPEC, Bloqueantes). AC3 (golden verde) es **incondicional**.
- **No inventar** números: transcribir las constantes del phantom Kerr **con cita de fuente verificable**; lo que
  depende de Fran es la **paridad** con fichas reales para marcar `is_validated` (T6.2), no las constantes.
- Preservar el comportamiento actual: la curva de **peso** de `ProgressBodyCompositionB6` no cambia.
- Componentes route-local; nada atomic (un solo dominio).
