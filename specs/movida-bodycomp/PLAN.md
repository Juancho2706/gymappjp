# PLAN — Composición corporal dual (BIA + ISAK 5 componentes)

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-11
**Spec:** `specs/movida-bodycomp/SPEC.md`
**Módulo:** `body_composition`

---

## Arquitectura

Clean Architecture de EVA, calcando el patrón ya probado por **movida-areas** (cálculo puro testeable +
service que orquesta + repository + RSC `_data`/action `_actions`, gating server-side, scoping 3-vías).

```text
app/coach/clients/[clientId]/_data/body-composition.queries.ts   (RSC, React.cache, assertModule)
  -> services/bodycomp/body-composition.service.ts                (orquesta: consent + gate + calc + log)
      -> domain/bodycomp/*.ts                                      (CÁLCULO PURO — sin Next/Supabase)
      -> infrastructure/db/body-composition.repository.ts          (acceso a DB, user-scoped)
          -> Supabase (body_composition_measurements, RLS)
```

### Por qué el cálculo puro va en `domain/bodycomp/` (y no en `packages/calc/`)

- **Orden explícito de la tarea:** "las fórmulas van en `domain/` puro (sin Next/Supabase) con tests
  unitarios — eso es lo testeable local".
- `domain/` **ya existe** como capa pura canónica (`domain/workout/types.ts`, etc.); CLAUDE.md la define como
  "tipos de negocio puros (sin Next.js, sin Supabase)". `packages/calc/` **no existe** todavía.
- Vitest ya incluye `apps/web/src/**/*.test.{ts,tsx}` → los golden corren sin tocar nada de infra.
- `domain/` no importa de `lib/`, `app/` ni Supabase (regla de importación de los pilares) → es exactamente
  el lugar de las fórmulas.
- **Nota de reuso futuro (Director §2.1 recomienda `packages/calc/` para Expo):** como `domain/bodycomp/` es
  100 % puro y sin `server-only`, **mover** ese folder a `packages/calc/` el día que exista la app Expo es un
  refactor mecánico (cambiar el path del import). Se deja anotado como deuda diferida, NO se bloquea v1.

### Módulos de cálculo puro (`domain/bodycomp/`)

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | `BiaMetrics`, `IsakRawInput` (pliegues/perímetros/diámetros), `IsakResult` (5 masas kg+%, somatotipo, %grasa), `Somatotype`, `BodyFatEquation` union (`durnin_womersley`\|`yuhasz`\|`faulkner`) |
| `phantom.ts` | **Única fuente** de constantes del phantom Kerr (medias `P`, SD `s`, exponente dimensional `d` por variable) + `phantomZ(value, P, s, d, heightCm)` puro. Cita de fuente en comentario. |
| `anthropometry.ts` | `fractionate5C(input): { adipose, muscle, bone, residual, skin }` (kg y %) — modelo Kerr vía Z-scores del phantom; restricción Σ masas ≈ peso |
| `somatotype.ts` | `heathCarter(input): Somatotype` (endo/meso/ecto) con las 3 ecuaciones del manual |
| `bodyfat.ts` | `bodyFatPct(input, equation)` — Durnin-Womersley (densidad log10 → Siri), Yuhasz, Faulkner; despacho por `equation` |
| `index.ts` | barrel + `computeIsak(raw, { bodyFatEquation })` que compone fractionation + somatotype + %grasa en un `IsakResult` |

Cada archivo tiene su `*.test.ts` con **golden tests** (ver Test Plan). Todo determinista, sin IO, sin fechas.

### Schemas (`packages/schemas/bodycomp.ts`, espeja `packages/schemas/workout.ts`)

- `BiaMetricsSchema` (todos opcionales; `visceral_fat_area_cm2` y `visceral_fat_level` **separados**).
- `IsakRawInputSchema` (pliegues/perímetros/diámetros, números positivos acotados).
- `BodyCompositionCreateSchema` discriminado por `method` (`z.discriminatedUnion('method', …)`): BIA valida
  `metrics` contra `BiaMetricsSchema`; ISAK valida `raw_input` contra `IsakRawInputSchema` (los `metrics`
  derivados los calcula el server, NO el cliente). Usado en **client (RHF)** y **server (action)** — pilar de validación.
- Reutiliza la lección movida-areas: usar `z.guid()`/`z.string().uuid()` con cuidado si hay ids seed versión 0
  (acá no aplica: las mediciones usan `gen_random_uuid()` v4).

## Files

| Acción | Path | Notas |
|---|---|---|
| CREATE | `apps/web/src/domain/bodycomp/{types,phantom,anthropometry,somatotype,bodyfat,index}.ts` | cálculo puro |
| CREATE | `apps/web/src/domain/bodycomp/{anthropometry,somatotype,bodyfat,phantom}.test.ts` | golden tests (Vitest) |
| CREATE | `packages/schemas/bodycomp.ts` (+ `bodycomp.test.ts`) | Zod por método (client+server) |
| CREATE | `apps/web/src/infrastructure/db/body-composition.repository.ts` | insert/list/get/soft-delete user-scoped |
| CREATE | `apps/web/src/services/bodycomp/body-composition.service.ts` | gate + consent + calc + access-log |
| CREATE | `apps/web/src/app/coach/clients/[clientId]/_data/body-composition.queries.ts` | RSC React.cache + assertModule |
| CREATE | `apps/web/src/app/coach/clients/[clientId]/_actions/body-composition.actions.ts` | server actions + Zod |
| CREATE | `apps/web/src/app/coach/clients/[clientId]/BodyCompositionTabB6b.tsx` | shell con sub-pestañas BIA/ISAK |
| CREATE | `…/[clientId]/_components/{BiaCaptureForm,IsakCaptureForm,BiaTrendPanel,IsakTrendPanel,IsakResultCard}.tsx` | UI route-local |
| UPDATE | `apps/web/src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.tsx` | se mantiene (peso); se le agrega navegación a la nueva sub-vista de composición, sin tocar la curva de peso |
| UPDATE | `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` | render condicional de la sección composición cuando el módulo está ON |
| UPDATE | `apps/web/src/components/coach/coach-nav.ts` | **sin nuevo navItem** (la composición vive dentro de la ficha del alumno); el toggle del módulo se gestiona en `/coach/settings/modules` (ya existe) |
| UPDATE | `apps/web/src/lib/i18n/{es,en}.json` | namespace `bodycomp.*` (todas las keys en el mismo commit) |
| CREATE | `supabase/migrations/<ts>_body_composition_measurements.sql` | tabla + RLS + índices (aditiva) |
| CREATE | `tests/team/bodycomp-isolation.sql` | RLS/aislamiento (corre en el gate E2E autorizado) |

> El gating del **menú** ya está resuelto por `NAV_MODULES` + `enabled_modules`; este módulo **no agrega un
> ítem de menú** porque su superficie es la ficha del alumno (tab existente "Progreso"). Si más adelante se
> quiere una superficie del alumno, ahí sí se declara un `NavModule` con `entitlement: 'body_composition'`.

## Data Model (migración aditiva, expand-contract)

Tabla **única con discriminador** (decisión locked del Plan 03): genérica `method` (`bia`|`isak`), payload por
método en `jsonb` validado por Zod server-side. **No** se toca `check_ins` (el peso sigue ahí).

```sql
-- <ts>_body_composition_measurements.sql  (forward-only, idempotente)
CREATE TABLE IF NOT EXISTS public.body_composition_measurements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id               uuid REFERENCES public.coaches(id) ON DELETE SET NULL,        -- actor/dueño del registro
  team_id                uuid REFERENCES public.teams(id) ON DELETE SET NULL,          -- pool (NULL = standalone)
  org_id                 uuid REFERENCES public.organizations(id) ON DELETE SET NULL,  -- enterprise-aware (NULL hoy)
  method                 text NOT NULL CHECK (method IN ('bia','isak')),
  measured_at            timestamptz NOT NULL DEFAULT now(),
  weight_kg              numeric(6,2),
  height_cm              numeric(6,2),
  device_brand           text,
  device_model           text,
  equation_used          text,             -- ISAK: 'kerr+heath_carter+durnin_womersley' etc.
  metrics                jsonb NOT NULL DEFAULT '{}'::jsonb,   -- derivados (ISAK) o capturados (BIA), Zod-validados
  raw_input              jsonb NOT NULL DEFAULT '{}'::jsonb,   -- pliegues/perímetros/diámetros/segmental crudos
  measurement_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,   -- BIA: ayuno/hidratación/hora
  source                 text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv_import','api')),
  is_validated           boolean NOT NULL DEFAULT false,       -- cálculo ISAK validado vs ficha real
  consent_confirmed_at   timestamptz,
  notes                  text,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz                            -- soft-delete (patrón wst_*)
);

CREATE INDEX IF NOT EXISTS idx_bcm_client_method_measured
  ON public.body_composition_measurements (client_id, method, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_bcm_team   ON public.body_composition_measurements (team_id);
CREATE INDEX IF NOT EXISTS idx_bcm_coach  ON public.body_composition_measurements (coach_id);
-- org_id siempre NULL en v1 (rama enterprise diferida) -> indice parcial para no almacenar entradas vacias
CREATE INDEX IF NOT EXISTS idx_bcm_org    ON public.body_composition_measurements (org_id) WHERE org_id IS NOT NULL;

-- updated_at via trigger existente (convencion del repo; mismo patron que screening/baseline)
DROP TRIGGER IF EXISTS handle_updated_at ON public.body_composition_measurements;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.body_composition_measurements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- GOTCHA repo (bitacora 2026-06-09, migr. 20260609054917 team_tables_harden_grants):
-- el ALTER DEFAULT PRIVILEGES del proyecto otorga ALL (incl. TRUNCATE, que RLS NO filtra) a
-- anon/authenticated en TODA tabla nueva. Esta es una tabla de DATOS DE SALUD -> REVOKE + GRANT minimo.
-- SIN DELETE para authenticated: el borrado es SOFT (UPDATE de deleted_at); el hard-delete solo via service_role.
REVOKE ALL ON public.body_composition_measurements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.body_composition_measurements TO authenticated;  -- sin DELETE
GRANT ALL                    ON public.body_composition_measurements TO service_role;

ALTER TABLE public.body_composition_measurements ENABLE ROW LEVEL SECURITY;
```

### RLS (regla dura del incidente 2026-06-09 — set-returning, sin per-row)

Solo se usan **helpers set-returning STABLE que YA existen en prod** (`current_user_pool_client_ids()` y
`current_user_team_ids()`, migr. `20260609160000`). **No** se inventa ningún helper nuevo, y **no** se referencia
`current_user_org_ids()` (no existe en ninguna migración — usarlo haría fallar la creación de la policy).

**Decisión v1 — sin rama enterprise (org):** la columna `org_id` es aditiva y **siempre NULL hoy** (el centro
Movida es modelo `team`, no enterprise). La rama org NO se incluye en v1 por dos razones: (a) el helper que
necesitaría no existe; (b) un predicado `org_id IN (SELECT … org_ids)` daría a **cualquier** coach de la org acceso
a **todas** las mediciones de salud de la org, violando el modelo enterprise de **asignación 1 coach↔alumno**
(`coach_client_assignments`). La policy org se agrega **aditivamente** el día que enterprise lo necesite, y deberá
amarrarse a `is_org_coach_assigned_to_client(client_id)` / `is_org_admin_member(org_id)` (helpers existentes), **no**
a la pertenencia plana a la org. Hasta entonces, las filas con `org_id IS NOT NULL` simplemente no son visibles por
RLS (no hay productor de esas filas en v1).

**Lección del hardening `20260609180000`:** el `WITH CHECK` de INSERT/UPDATE **debe amarrar `client_id` al scope**
(no basta `coach_id = auth.uid()`), o un coach podría estampar una medición de salud sobre un `client_id` ajeno
(standalone) o poner su `team_id` sobre un cliente que no pertenece a ese team (pool). El `EXISTS` sobre `clients`
**solo en `WITH CHECK`** es el patrón exacto del hardening y de `team_access_logs_member_insert`, y es aceptable:
la prohibición per-row del incidente aplica al `USING` de SELECT en hot tables, no al `WITH CHECK` de escritura.

Policies (per-comando, InitPlan / 1 eval-query en el `USING`; sin DELETE para `authenticated` — soft-delete = UPDATE):

```sql
-- SELECT: pool (cualquier miembro del team del cliente) ∪ standalone (dueño del registro). (select auth.uid()) envuelto.
DROP POLICY IF EXISTS bcm_select ON public.body_composition_measurements;
CREATE POLICY bcm_select ON public.body_composition_measurements FOR SELECT TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())                  -- pool: helper set-returning (InitPlan)
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))    -- standalone: dueño, columna indexada
);

-- INSERT: WITH CHECK amarra client_id al scope (EXISTS sobre clients SOLO en WITH CHECK — patrón hardening).
DROP POLICY IF EXISTS bcm_insert ON public.body_composition_measurements;
CREATE POLICY bcm_insert ON public.body_composition_measurements FOR INSERT TO authenticated
WITH CHECK (
  -- pool: el cliente es del pool del coach Y el team_id estampado = team real del cliente (no se puede falsear)
  (
    team_id IS NOT NULL
    AND client_id IN (SELECT public.current_user_pool_client_ids())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.team_id = body_composition_measurements.team_id)
  )
  OR
  -- standalone: registro self-attribuido Y el cliente es del coach (sin team/org)
  (
    team_id IS NULL AND org_id IS NULL
    AND coach_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.coach_id = (select auth.uid())
                 AND c.team_id IS NULL AND c.org_id IS NULL)
  )
);

-- UPDATE: cubre edición y soft-delete (set deleted_at). USING = scope visible; WITH CHECK = mismo amarre que INSERT.
DROP POLICY IF EXISTS bcm_update ON public.body_composition_measurements;
CREATE POLICY bcm_update ON public.body_composition_measurements FOR UPDATE TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))
)
WITH CHECK (
  (
    team_id IS NOT NULL
    AND client_id IN (SELECT public.current_user_pool_client_ids())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.team_id = body_composition_measurements.team_id)
  )
  OR (
    team_id IS NULL AND org_id IS NULL
    AND coach_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.coach_id = (select auth.uid())
                 AND c.team_id IS NULL AND c.org_id IS NULL)
  )
);

-- service_role total (purge, soporte, hard-delete). authenticated NO tiene DELETE (grant ni policy).
DROP POLICY IF EXISTS bcm_service ON public.body_composition_measurements;
CREATE POLICY bcm_service ON public.body_composition_measurements FOR ALL TO service_role
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
```

- **NUNCA** `is_team_member(team_id)` (per-fila) ni `EXISTS (… correlacionado …)` dentro del **`USING` de SELECT**
  (hot table). El `EXISTS` sobre `clients` aparece **solo en `WITH CHECK`** de INSERT/UPDATE (patrón del hardening
  `20260609180000` y de `team_access_logs_member_insert`), donde se evalúa por fila escrita, no por fila leída.
- **No hay policy ni grant DELETE para `authenticated`:** el borrado de negocio es **soft** (`UPDATE deleted_at`,
  cubierto por `bcm_update`); el hard-delete (purga/soporte) queda en `service_role` (`bcm_service`).
- Validar con `EXPLAIN ANALYZE` (loops=1) del SELECT/INSERT en la vía pool, `get_advisors` (0 `auth_rls_initplan`,
  FKs indexadas) y correctness en `BEGIN … ROLLBACK` con seed sintético (team A ≠ team B; standalone aislado;
  no-miembro sin acceso; intento de estampar `client_id`/`team_id` ajeno BLOQUEADO) **antes** de aplicar (branch Pro).
- **Generated types:** tras merge → `supabase db pull` + `generate_typescript_types` → `database.types.ts`
  gana `body_composition_measurements`.

### Workflow de migración (branching Pro, Director §3)

`list_branches` → `create_branch` (confirm_cost) → poll `MIGRATIONS_PASSED` → `apply_migration` (solo este DDL
aditivo) → `execute_sql` seed sintético (2 teams + coaches + alumnos + claims) → tests RLS impersonando
`authenticated` (team A ≠ team B; standalone aislado) → `get_advisors` 0 críticos → snapshot prod `_bak_*` →
`merge_branch` → `db pull` + types + `pnpm typecheck/test/build` verdes → **`delete_branch` el mismo día**.
Si el Pro ya expiró: protocolo aditivo-en-LIVE (snapshot + seed sintético + advisors, sin cuarto limpio).

## Server Actions

- `saveBodyCompositionAction(input)` — `'use server'`:
  1. **Kill-switch de plataforma (operador EVA) — ANTES del entitlement.** `assertBodyCompositionEnabled()` lee el
     flag `body_composition_kill_switch` de **Vercel Edge Config** (mismo mecanismo que `free_tier_kill_switch` en
     `proxy.ts`); si está en `true`, la action falla server-side para **todos** los tenants sin deploy. Es el lever
     del riesgo Director §3 (un % grasa mal calculado expuesto a todos los teams). Default ausente = habilitado.
  2. `assertModule(db, 'body_composition', ctx)` (ctx por workspace activo: team ⇒ teamId; standalone ⇒ coachId).
  3. `assertCoachClientWriteAccess` (extiende el patrón `assertCoachClientReadAccess`/`getCoachClientScope`).
  4. En contexto team: **assert consentimiento de salud activo** (`client_consents` purpose `health_data_processing`
     no revocado para `client_id`+`team_id`); sin él → error, no persiste.
  5. Validar con `BodyCompositionCreateSchema` (discriminado por método).
  6. Si `method='isak'`: `computeIsak(raw, { bodyFatEquation })` (puro) → `metrics`; `equation_used` persistido;
     `is_validated=false`. Si `method='bia'`: `metrics` = lo capturado (solo Zod).
  7. `repository.insert(...)` user-scoped (RLS = techo). `logTeamClientAccess(resource:'body_composition',
     action:'create')` best-effort (solo viaTeam). `revalidatePath` de la ficha.
- `deleteBodyCompositionAction(id)` — soft-delete (`deleted_at`), mismas guardas + log `action:'delete'`.
- Validación: Zod v4 en **cliente** (react-hook-form) y **servidor** (la misma `BodyCompositionCreateSchema`).
- Revalidation: `revalidatePath('/coach/clients/[clientId]')`.

## UI/UX

- **Entrada:** dentro de la ficha del alumno, tab "Progreso" (ya existe). Se agrega una sección
  **"Composición corporal"** con sub-pestañas **"Bioimpedancia (entrenador)"** / **"Antropometría (nutri)"**
  (segmented), separadas a nivel de datos (cada una su query filtrada por `method`).
- **Captura:** `react-hook-form` + Zod, `useActionState` para el submit, `useTransition` entre pasos del form ISAK
  (pliegues → perímetros → diámetros → revisión con resultado calculado en vivo del lado cliente vía las funciones
  puras de `domain/bodycomp` antes de persistir). BIA = formulario plano de los campos del dispositivo.
- **Visualización:** `recharts` (ya en el repo, mismo estilo que `ProgressBodyCompositionB6`): serie temporal por
  método + delta vs anterior del **mismo** método; etiqueta "InBody 570 · 05 jun". ISAK: tarjeta de 5 componentes
  (kg + %) + triángulo/coordenadas de somatotipo + % grasa con **label "preliminar"** mientras `!is_validated`.
- **Peso** puede coexistir (la curva de peso actual no se toca); **% grasa / masas nunca mezclan métodos**.
- **Mobile:** `h-dvh`/`min-h-dvh` fuera de `md:`, `*-safe` en barras fijas, `overflow-x: clip`; el form ISAK es
  denso → optimizar tablet (kine/nutri miden en tablet). `useReducedMotion` en transiciones.
- **Dark mode:** todos los componentes nuevos con variantes dark (regla de Colors de CLAUDE.md).
- **Componentes:** route-local en `[clientId]/_components/` (no atomic — un solo dominio).

## Dependencias / Integración con piezas existentes

- **`assertModule`** (`services/entitlements.service.ts`) — ya soporta `body_composition`. Sin cambios al service.
- **Scoping 3-vías** (`getCoachClientScope`/`assertCoachClientReadAccess` en `client-detail.service.ts`) — extender
  con un `assertCoachClientWriteAccess` análogo (mismo árbol team/standalone/enterprise) para las actions de escritura.
- **Consentimiento** — `client_consents` (purpose `health_data_processing`) + `grantTeamConsentAction` ya existen
  (Plan 1 §F). Acá solo se **lee/asserta**, no se cambia el flujo de consentimiento.
- **Bitácora** — `logTeamClientAccess` (`services/team/team.service.ts`) ya cableado para perfil; se reutiliza con
  `resource:'body_composition'`. Best-effort, nunca rompe la lectura.
- **Storage de salud** — bucket privado `team-health-docs` (migr. `20260609210000`) + patrón service-role + signed
  URL ya existe; el adjunto opcional de PDF/foto del reporte BIA lo reutiliza (fase opcional v1).
- **Kill-switch de plataforma** — Director §3 lo exige además del entitlement, y este módulo es exactamente su
  escenario de riesgo. Se resuelve **en v1** con tres leveres complementarios, sin tabla de flags nueva:
  1. **Per-módulo, plataforma global (operador EVA):** flag `body_composition_kill_switch` en **Vercel Edge Config**
     (camino barato; espeja el precedente `free_tier_kill_switch` de `proxy.ts`). Apaga el módulo para **todos** los
     tenants sin deploy. Lo consulta `assertBodyCompositionEnabled()` **antes** del entitlement (ver Server Actions).
  2. **Per-tenant (CEO/owner):** `enabled_modules` / `assertModule('body_composition', ctx)` — apaga el módulo para
     un team o un coach standalone puntual.
  3. **Workspace completo:** `teams.suspended_at` (commit 384e99b) — suspende el team entero (no solo un módulo).

  Estos tres cubren el apagado operativo de v1 sin ambigüedad. Lo único **diferido** es un panel de operador para el
  flag Edge Config (hoy se setea a mano en Vercel, como `free_tier_kill_switch`); no bloquea el guard del módulo.

## Phases (slices con verificación por capa)

- **F0 — Baseline anti-regresión.** Test del render actual de `ProgressBodyCompositionB6` (peso/IMC/energía/fotos)
  para garantizar **cero regresión** en la curva de peso al insertar la sección composición. Verde local.
- **F1 — Cálculo puro + golden (sin DB, sin UI).** `domain/bodycomp/*` completo (phantom + Kerr + Heath-Carter +
  %grasa) con golden tests de literatura. **Esta es la fase de mayor valor testeable local** y la que valida la
  decisión "ISAK completo ahora". Verificación: `pnpm test` verde con tolerancias del SPEC AC3.
- **F2 — Migración + RLS (branch efímero).** Tabla + policies set-returning + índices; seed sintético; tests de
  aislamiento; advisors 0 críticos; merge; `db pull` + types. Verificación: typecheck verde con la tabla en types.
- **F3 — Repository + service + schemas.** `BodyCompositionCreateSchema` (Zod por método) + repository +
  `body-composition.service` (gate + consent + calc + log). Verificación: unit de `bodycomp` schema + typecheck.
- **F4 — Captura BIA (UI).** Form BIA + action + lista/serie BIA. Captura manual, sin cálculo. Verificación: e2e
  manual coach guarda BIA → aparece en pestaña BIA con etiqueta dispositivo.
- **F5 — Captura ISAK + resultado.** Form ISAK + cálculo en vivo (puro) + persistencia derivados + tarjeta 5C /
  somatotipo / %grasa "preliminar" + serie ISAK. Verificación: guardar ISAK → metrics derivados correctos.
- **F6 — Gate E2E autorizado + paridad.** Suite RLS `tests/team/bodycomp-isolation.sql` + E2E coach→ficha; cuando
  lleguen las fichas de Fran, golden de paridad → marcar `is_validated`. (Solo con OK del usuario, `--workers=1`.)
- **F7 (diferida) — Import CSV InBody / vista del alumno.** Fuera de v1 (Non-Goals); el schema ya las contempla.

## Test Plan

- **Unit (Vitest, local, sin Supabase) — el core testeable de esta feature:**
  - `domain/bodycomp/phantom.test.ts`: `phantomZ` contra valores conocidos.
  - `domain/bodycomp/anthropometry.test.ts`: **golden Kerr** — caso publicado con masas resueltas; tolerancia <2 %;
    invariante Σ(masas) ≈ peso medido (±tolerancia).
  - `domain/bodycomp/somatotype.test.ts`: **golden Heath-Carter** — ejemplo del manual; tolerancia ≤0.3/eje.
  - `domain/bodycomp/bodyfat.test.ts`: Durnin-Womersley (densidad→Siri), Yuhasz, Faulkner contra valores publicados.
  - `packages/schemas/bodycomp.test.ts`: discriminated union acepta BIA/ISAK válidos y rechaza payload desconocido.
- **Integration:** service — gate falla sin módulo; falla sin consentimiento (contexto team); persiste con
  `metrics` derivados correctos; log emitido. (Con seed; en el gate.)
- **RLS/E2E (gate autorizado, `--workers=1`):** `tests/team/bodycomp-isolation.sql` (team A ≠ team B, standalone
  aislado, no-miembro sin acceso); E2E coach captura BIA e ISAK del mismo alumno → pestañas separadas, %grasa no
  mezclado, label "preliminar".
- **Manual:** mobile/tablet del form ISAK; dark mode; etiqueta dispositivo+fecha; curva de peso idéntica a hoy.

## Rollback Plan

- **Código:** la feature está aislada en archivos nuevos + un render condicional por `enabled_modules`. Revert =
  apagar `body_composition` en `enabled_modules` (sin deploy) y/o el kill-switch de plataforma cuando exista;
  como último recurso, revertir el commit (la sección composición desaparece, el resto de la ficha intacto).
- **DB:** la tabla es **aditiva** y desacoplada (no FK entrante desde tablas existentes salvo las salientes a
  clients/coaches/teams/orgs). No requiere rollback de datos; un DROP eventual sería fase CONTRACT futura, jamás
  en expand. Snapshot `_bak_*` pre-merge cubre el peor caso.
