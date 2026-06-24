# PLAN — Screening de Movimiento de Ingreso

**Status:** DRAFT (listo para review)
**Spec:** `specs/movida-screening/SPEC.md`
**Last updated:** 2026-06-11
**Módulo:** key **`movement_assessment`** (YA existe en `MODULE_KEYS` de
`apps/web/src/services/entitlements.service.ts`; YA tiene toggle en Settings>Módulos y en el panel
CEO de teams — este plan lo convierte en módulo real).
**Riesgo:** MEDIO — greenfield (no toca builder ni hot tables), pero introduce 2 tablas nuevas con
RLS 3-vías y es el PRIMER módulo que activa el gancho `entitlement` del nav y `assertModule`.

---

## Estado actual (piezas existentes sobre las que se construye — NO reinventar)

- **Entitlements:** `services/entitlements.service.ts` — `MODULE_KEYS` incluye
  `movement_assessment`; `hasModule`/`assertModule` resuelven por contexto del recurso
  (teamId ⇒ `teams.enabled_modules`; coachId ⇒ `coaches.enabled_modules`). Aún SIN consumidores.
- **Nav-como-módulos:** `components/coach/coach-nav.ts` — `NAV_MODULES` con `contexts` +
  `entitlement?: ModuleKey` declarado pero **sin enforcement** (gancho a cablear acá).
  `CoachSidebar.tsx:97` llama `getVisibleNavItems({ activeWorkspaceType, subscriptionStatus })`.
- **Toggles UI:** `app/coach/settings/modules/_components/ModulesForm.tsx` (coach/team) y
  `app/admin/(panel)/teams/_components/module-labels.ts` (CEO) ya listan el módulo.
  ⚠️ La desc de ModulesForm contiene "(tipo FMS)" → corregir (regla de marca).
- **Scoping 3-vías:** patrón `CoachClientScope` (`app/coach/clients/_data/clients.queries.ts`) y
  guards `getCoachClientScope`/`assertCoachClientReadAccess` (+ `viaTeam`) en
  `services/client/client-detail.service.ts` — el guard de lectura del alumno YA es team-aware.
  ⚠️ HOY son funciones **privadas** (sin `export`; líneas 36 y 53 de un archivo `'use server'`):
  el service nuevo NO puede importarlas. F3 (T3.0) las extrae a un servicio compartido
  `services/client/client-scope.service.ts` — prohibido copiar-pegar el guard: la lógica de
  scoping 3-vías debe vivir en UN solo lugar.
- **RLS team optimizada:** helpers set-returning `current_user_team_ids()`,
  `current_user_pool_client_ids()`, `current_user_pool_coach_ids()`,
  `current_user_managed_team_ids()` (migr. `20260609160000`/`170000`) — patrón
  `col IN (SELECT helper())`, jamás per-row.
- **Consentimiento + bitácora:** `client_consents` (purpose `health_data_processing`, activo =
  `revoked_at IS NULL`) y `team_access_logs` (append-only) — migr. `20260609054748`.
  `logTeamClientAccess` en `services/team/team.service.ts`, ya cableado en `getClientProfileData`
  (solo `viaTeam`).
- **Kill-switch:** `teams.suspended_at` (team entero, migr. `20260610030000`). Falta el flag de
  operador POR MÓDULO (Director §3) → este plan lo introduce (env `DISABLED_MODULES`).
- **Awareness (LOCKED #4):** columna `last_edited_by` seteada en service (NO trigger).
- **Perfil del alumno:** `app/coach/clients/[clientId]/` (tabs B3-B8, `ProfileTabNav`,
  `progress-print/page.tsx` como precedente de export print, recharts ya en uso en
  `ProgressBodyCompositionB6.tsx`).
- **check_ins** NO se toca: weight/energy/photos/notes es otro dominio; el screening es entidad
  propia (igual decisión que body comp en plan 03).
- **i18n:** `src/locales/{es,en}.json` + `LanguageContext` — namespace nuevo `assessment.*`.
- **`packages/calc/` NO existe** → este plan lo crea (primer cálculo puro del Director §3;
  precedente de package con tests: `packages/schemas/workout.test.ts`).

## Arquitectura

Data flow obligatorio (Clean Architecture):

```text
app/coach/movement/**/_data/*.queries.ts        (React.cache, RSC)
app/coach/movement/**/_actions/*.actions.ts     (server actions + Zod)
  -> services/assessment/movement-assessment.service.ts   (orquesta: scope + assertModule +
       consentimiento + cálculo + bitácora + last_edited_by)
  -> infrastructure/db/assessment.repository.ts            (acceso DB, cliente user-scoped)
  -> Supabase (RLS = techo)
packages/calc/src/movement.ts                    (cálculo puro, sin IO, testeable con vitest)
packages/schemas/assessment.ts                   (Zod compartido client/server)
apps/web/src/domain/assessment/types.ts          (tipos de negocio puros)
```

Reglas de importación: `packages/calc` y `domain/` sin Next.js/Supabase; el repository solo
importa `domain/` + `database.types`; el service no importa de `app/`.

### Gating del módulo (exacto)

1. **Server-side (fuente de verdad):** al tope de TODA action y RSC del módulo:

   ```ts
   const scope = await getCoachClientScope(supabase, user.id) // o el scope del workspace activo
   await assertModule(supabase, 'movement_assessment',
       scope.activeTeamId ? { teamId: scope.activeTeamId } : { coachId: user.id })
   ```

   Para recursos de un alumno concreto, el contexto es el del ALUMNO (pool ⇒ su `team_id` manda,
   LOCKED #7), resuelto tras `assertCoachClientReadAccess`. RSC con módulo OFF ⇒ `notFound()`.
   Ambos guards se importan del servicio compartido `services/client/client-scope.service.ts`
   (extracción en F3 T3.0 — hoy son privados de `client-detail.service.ts` y no son importables).
2. **Kill-switch de operador (Director §3, primero en evaluarse):** `hasModule()` consulta ANTES
   del entitlement un flag de plataforma: env runtime `DISABLED_MODULES` (CSV de `ModuleKey`,
   ej. `DISABLED_MODULES=movement_assessment`). Vive en `entitlements.service.ts`
   (`isModuleKilled(key)`), se cambia en Vercel sin migración ni release. Documentar en
   `docs/operations/RUNBOOK.md` y en la tabla de env vars de `CLAUDE.md`.
3. **Nav (espejo UI):** `NAV_MODULES` nuevo ítem:

   ```ts
   { key: 'movement', href: '/coach/movement', label: 'Movimiento', shortLabel: 'Mov.',
     icon: Activity, contexts: ['coach_standalone', 'coach_team'], entitlement: 'movement_assessment' }
   ```

   y se ACTIVA el gancho: `VisibleNavContext` gana `enabledModules?: Partial<Record<ModuleKey,
   boolean>>`; `getVisibleNavItems` oculta ítems cuyo `entitlement` no esté en `true` (función
   sigue pura → unit tests en `coach-nav.test.ts`). El layout del coach (server) resuelve
   `getTeamEnabledModules`/`getCoachEnabledModules` según workspace activo (menos el kill-switch)
   y lo pasa a `CoachSidebar`. Enterprise v1: el ítem no existe en ese contexto (mismo criterio
   que áreas custom: enterprise ⇒ diferido).
4. **Alumno:** la página `/c/[coach_slug]/movimiento` (servida también vía proxy `/t/[team_slug]`)
   verifica `hasModule` con el contexto del propio alumno (team ⇒ team; standalone ⇒ su coach) y
   `notFound()` si OFF.

### Decisiones de diseño (v1)

- **Borrador en DB** (`status='draft'`), no localStorage: restaurable cross-device y compatible
  con pool plano. Máximo 1 borrador por alumno (índice único parcial). Autosave por paso
  (`useTransition` + action `upsertItem`), submit final con `useActionState`.
- **Final inmutable:** una evaluación `final` no se edita in-place (datos de salud firmados con
  consentimiento); corregir = eliminar y re-evaluar (queda `delete` en bitácora) o nueva evaluación.
- **El server recalcula SIEMPRE** compuesto/banderas/banda con `packages/calc` al finalizar; los
  valores del cliente son solo preview optimista.
- **Catálogo de patrones hardcodeado** en `packages/calc` (const `MOVEMENT_PATTERNS_V1`, 7 slugs +
  `is_per_side` + `has_clearing`), NO tabla catálogo (YAGNI); `protocol_version='v1'` en la fila
  deja la puerta abierta.
- **Semántica visible:** banda = "prioridad de trabajo correctivo" (alta/media/baja, semáforo
  rojo/ámbar/verde). Columna `risk_band` (nombre del plan 03) con valores `high|moderate|low`.
- **Sin Storage en v1** (checklist puro, sin archivos) → el bucket `team-health-docs` queda para
  la fase 2 (video/PDF histórico).

## Modelo de datos (DDL aditiva propuesta — expand, jamás contract)

Migración única `2026MMDDHHMMSS_movement_assessment_module.sql`, **aditiva, idempotente,
forward-only** (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` antes de cada
`CREATE POLICY`), aplicada vía **branching MCP** (ventana Pro hasta ~2026-07-09) según protocolo
del Director §3. Sin backfill (greenfield ⇒ no necesita `_POST_DEPLOY_`).

```sql
-- (1) Tabla principal (FRÍA: ~2-4 filas/alumno/año; 300 alumnos ⇒ <1.5k filas/año)
CREATE TABLE IF NOT EXISTS public.movement_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id             uuid REFERENCES public.coaches(id) ON DELETE SET NULL,  -- evaluador original
  team_id              uuid REFERENCES public.teams(id) ON DELETE SET NULL,    -- denormalizado del client al crear
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  protocol_version     text NOT NULL DEFAULT 'v1',
  assessed_at          timestamptz NOT NULL DEFAULT now(),
  composite_score      smallint CHECK (composite_score BETWEEN 0 AND 21),
  has_pain             boolean NOT NULL DEFAULT false,
  has_asymmetry        boolean NOT NULL DEFAULT false,
  risk_band            text CHECK (risk_band IN ('low','moderate','high')),
  consent_confirmed_at timestamptz,  -- finalize lo estampa SIEMPRE (team y standalone; ver service paso 4) — el CHECK de abajo lo exige para 'final'
  notes                text,
  last_edited_by       uuid REFERENCES public.coaches(id) ON DELETE SET NULL,  -- awareness LOCKED #4
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movement_assessments_final_complete CHECK (
    status <> 'final'
    OR (composite_score IS NOT NULL AND risk_band IS NOT NULL AND consent_confirmed_at IS NOT NULL)
  )
);
-- 1 borrador por alumno (los finales son N)
CREATE UNIQUE INDEX IF NOT EXISTS movement_assessments_one_draft_per_client
  ON public.movement_assessments (client_id) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_movement_assessments_client_assessed
  ON public.movement_assessments (client_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_assessments_team_id ON public.movement_assessments (team_id);
CREATE INDEX IF NOT EXISTS idx_movement_assessments_coach_id ON public.movement_assessments (coach_id);

-- (2) Ítems (7 por evaluación)
CREATE TABLE IF NOT EXISTS public.movement_assessment_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES public.movement_assessments(id) ON DELETE CASCADE,
  pattern           text NOT NULL CHECK (pattern IN (
                      'deep_squat','hurdle_step','inline_lunge','shoulder_mobility',
                      'active_straight_leg_raise','trunk_stability_pushup','rotary_stability')),
  is_per_side       boolean NOT NULL,
  score_left        smallint CHECK (score_left  BETWEEN 0 AND 3),
  score_right       smallint CHECK (score_right BETWEEN 0 AND 3),
  score_single      smallint CHECK (score_single BETWEEN 0 AND 3),
  final_score       smallint NOT NULL CHECK (final_score BETWEEN 0 AND 3),
  pain              boolean NOT NULL DEFAULT false,
  clearing_positive boolean,            -- NULL = el patrón no tiene prueba de descarte
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movement_assessment_items_unique UNIQUE (assessment_id, pattern)
);
CREATE INDEX IF NOT EXISTS idx_movement_assessment_items_assessment
  ON public.movement_assessment_items (assessment_id);

-- (3) updated_at via trigger existente
DROP TRIGGER IF EXISTS handle_updated_at ON public.movement_assessments;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.movement_assessments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS handle_updated_at ON public.movement_assessment_items;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.movement_assessment_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- (4) GOTCHA repo: ALTER DEFAULT PRIVILEGES otorga ALL (incl. TRUNCATE) a toda tabla nueva
--     -> REVOKE + GRANT minimo (patron migr. 20260609054748)
REVOKE ALL ON public.movement_assessments      FROM anon, authenticated;
REVOKE ALL ON public.movement_assessment_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_assessments      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_assessment_items TO authenticated;
GRANT ALL ON public.movement_assessments      TO service_role;
GRANT ALL ON public.movement_assessment_items TO service_role;
ALTER TABLE public.movement_assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_assessment_items ENABLE ROW LEVEL SECURITY;

-- (5) Helper set-returning para los items del pool (patron 20260609160000; SIN parametro de fila)
CREATE OR REPLACE FUNCTION public.current_user_pool_movement_assessment_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ma.id FROM public.movement_assessments ma
  WHERE ma.client_id IN (SELECT public.current_user_pool_client_ids())
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_pool_movement_assessment_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_pool_movement_assessment_ids() TO authenticated, service_role;
```

### Policies RLS (3 vías + self + service)

```sql
-- TEAM (pool plano full-access): InitPlan via helper, jamas per-row
DROP POLICY IF EXISTS team_movement_assessments_member_all ON public.movement_assessments;
CREATE POLICY team_movement_assessments_member_all ON public.movement_assessments FOR ALL TO authenticated
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_movement_assessment_items_member_all ON public.movement_assessment_items;
CREATE POLICY team_movement_assessment_items_member_all ON public.movement_assessment_items FOR ALL TO authenticated
  USING (assessment_id IN (SELECT public.current_user_pool_movement_assessment_ids()))
  WITH CHECK (assessment_id IN (SELECT public.current_user_pool_movement_assessment_ids()));

-- STANDALONE (coach dueno; tabla fria -> patron client_consents con EXISTS justificado;
-- validar con EXPLAIN ANALYZE igual)
DROP POLICY IF EXISTS movement_assessments_standalone_coach_all ON public.movement_assessments;
CREATE POLICY movement_assessments_standalone_coach_all ON public.movement_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = movement_assessments.client_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = movement_assessments.client_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL));

DROP POLICY IF EXISTS movement_assessment_items_standalone_coach_all ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_standalone_coach_all ON public.movement_assessment_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.movement_assessments ma JOIN public.clients c ON c.id = ma.client_id
                 WHERE ma.id = movement_assessment_items.assessment_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.movement_assessments ma JOIN public.clients c ON c.id = ma.client_id
                 WHERE ma.id = movement_assessment_items.assessment_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL));

-- ALUMNO: solo SELECT de las propias y FINALES (cubre cuenta legacy id=auth.uid y split memberships)
DROP POLICY IF EXISTS movement_assessments_client_self_select ON public.movement_assessments;
CREATE POLICY movement_assessments_client_self_select ON public.movement_assessments FOR SELECT TO authenticated
  USING (status = 'final' AND (
    client_id = (SELECT auth.uid())
    OR client_id IN (SELECT cm.client_id FROM public.client_memberships cm
                     WHERE cm.account_id = (SELECT auth.uid()) AND cm.status = 'active' AND cm.deleted_at IS NULL)));

DROP POLICY IF EXISTS movement_assessment_items_client_self_select ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_client_self_select ON public.movement_assessment_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.movement_assessments ma
                 WHERE ma.id = movement_assessment_items.assessment_id AND ma.status = 'final'
                 AND (ma.client_id = (SELECT auth.uid())
                      OR ma.client_id IN (SELECT cm.client_id FROM public.client_memberships cm
                          WHERE cm.account_id = (SELECT auth.uid()) AND cm.status = 'active' AND cm.deleted_at IS NULL))));

-- service_role total (purge, soporte)
DROP POLICY IF EXISTS movement_assessments_service ON public.movement_assessments;
CREATE POLICY movement_assessments_service ON public.movement_assessments FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS movement_assessment_items_service ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_service ON public.movement_assessment_items FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
```

**Validación obligatoria en el branch efímero (lección 2026-06-09):** seed sintético (2 teams + 1
standalone + alumnos + `auth.users` + claims) → suites como `authenticated` (NUNCA `service_role`)
→ `EXPLAIN ANALYZE` de SELECT/INSERT con `loops=1` en la vía team → `get_advisors` security+
performance 0 críticos (FKs indexadas ✓, `(select auth.uid())` ✓) → snapshot `_bak_*` solo si se
tocara data existente (acá no: tablas nuevas) → `merge_branch` → `supabase db pull` + regenerar
`database.types.ts` → `delete_branch` el MISMO día.

- **Generated types:** `src/lib/database.types.ts` se regenera tras el merge (drift-guard).
- **Purge/retención:** `ON DELETE CASCADE` desde `clients` cubre la eliminación de cuenta; revisar
  que `api/cron/purge-data` no necesite mención explícita (cascada lo cubre) y documentar la
  retención en la política de datos de salud (DPIA, Plan 01 §F).

## Cálculo puro — `packages/calc/` (nuevo package)

- `packages/calc/package.json` (`@gymapp/calc`, espejo de `packages/schemas`, sin deps runtime) +
  registrarlo en `pnpm-workspace.yaml` si el glob `packages/*` no lo cubre ya.
- `packages/calc/src/movement.ts` (export desde `packages/calc/index.ts`):
  - `MOVEMENT_PATTERNS_V1`: los 7 patrones `{ slug, isPerSide, hasClearing }` (shoulder_mobility,
    trunk_stability_pushup, rotary_stability con clearing).
  - `finalItemScore(item)`: `(clearing_positive || pain) ? 0 : (is_per_side ? min(L,R) : single)`.
  - `compositeScore(items)`: Σ final (requiere los 7 patrones presentes; lanza si faltan).
  - `hasAsymmetry(items)`: ∃ ítem por-lado con `|L−R| ≥ 1` (sobre ítems SIN forzar a 0 por dolor).
  - `priorityBand(composite, hasPain, hasAsymmetry)`: high si `pain || composite ≤ 14`; moderate
    si `15-16 || hasAsymmetry`; low si `≥ 17 && !asym && !pain`.
  - `summarizeAssessment(items)`: orquesta todo y devuelve `{ composite, hasPain, hasAsymmetry, band }`.
- `packages/calc/src/movement.test.ts`: los 8 golden tests del plan 03 §A + bordes (ítem
  incompleto, los 3 clearings, L=R sin asimetría). Corre con `pnpm test` (sin Supabase).

## Schemas y dominio

- `packages/schemas/assessment.ts`: `MovementItemInputSchema` (pattern enum, scores 0-3 nullable
  según `is_per_side`, pain, clearing), `MovementDraftUpsertSchema`, `MovementFinalizeSchema`
  (notes, atestación de consentimiento boolean), `MovementDeleteSchema`. Export en `index.ts`.
  Validación en AMBOS lados (react-hook-form + server action).
- `apps/web/src/domain/assessment/types.ts`: `MovementAssessment`, `MovementAssessmentItem`,
  `MovementPatternSlug`, `PriorityBand` — tipos puros (sin Supabase/Next).

## Repository y service

- **Pre-requisito (T3.0):** extraer `getCoachClientScope`/`assertCoachClientReadAccess` de
  `services/client/client-detail.service.ts` (hoy privadas, líneas 36/53) a
  `services/client/client-scope.service.ts` **sin** `'use server'` (no son server actions;
  exportarlas desde el archivo `'use server'` actual las publicaría como endpoints RPC).
  `client-detail.service.ts` pasa a importarlas de ahí — mover, no copiar; comportamiento
  idéntico para los ~10 call sites internos.
- `infrastructure/db/assessment.repository.ts` (cliente user-scoped; RLS = techo):
  `findAssessmentsByClient`, `findAssessmentWithItems`, `findDraftByClient`, `insertAssessment`,
  `upsertItem`, `finalizeAssessment` (update status+agregados), `deleteAssessment`,
  `findLatestFinalByClients(clientIds)` (para el hub). Registrar en `infrastructure/db/index.ts`.
- `services/assessment/movement-assessment.service.ts` — TODA action/query pasa por acá:
  1. auth + `assertCoachClientReadAccess(supabase, userId, clientId)` → `{ orgId, viaTeam }`.
  2. `orgId` presente ⇒ rechazar (enterprise diferido v1).
  3. `assertModule(supabase, 'movement_assessment', viaTeam ? { teamId } : { coachId: userId })`.
  4. Mutaciones: consentimiento (AC7) — team: `client_consents` activo `health_data_processing`
     o falla; standalone: atestación crea/verifica el registro (`granted_via='coach_attestation'`).
     **Finalize estampa `consent_confirmed_at` en AMBOS contextos** (team = timestamp de la
     verificación del consentimiento activo; standalone = timestamp de la atestación). Es
     obligatorio por el CHECK `movement_assessments_final_complete` (exige la columna NOT NULL
     para `status='final'`): dejarla NULL en la vía team rompería TODA finalización del pool de
     Movida en runtime. Unit test del service en F3 cubre ambas vías (T3.3).
  5. Cálculo: `summarizeAssessment` de `@gymapp/calc` al finalizar (server recalcula).
  6. `last_edited_by = userId` en cada write (awareness, LOCKED #4 — en service, NO trigger).
  7. Bitácora best-effort si `viaTeam`: `logTeamClientAccess(... resource: 'movement_assessment',
     action: view|create|update|delete|pdf_generate)`.
- Instrumentación (Director §3): errores del service con tag `module:movement_assessment`;
  métrica mínima = tasa de error de finalize y de print.

## Rutas y UI (module pattern obligatorio)

| Acción | Path | Notas |
|---|---|---|
| UPDATE | `services/entitlements.service.ts` | `isModuleKilled()` + check en `hasModule` (kill-switch operador) |
| UPDATE | `components/coach/coach-nav.ts` | ítem `movement` + enforcement `entitlement` en `getVisibleNavItems` |
| UPDATE | `components/coach/CoachSidebar.tsx` (+ layout que lo monta) | thread `enabledModules` desde RSC |
| UPDATE | `app/coach/settings/modules/_components/ModulesForm.tsx` | quitar "(tipo FMS)" de la desc |
| CREATE | `services/client/client-scope.service.ts` | extraer guards `getCoachClientScope`/`assertCoachClientReadAccess` (hoy privados en `client-detail.service.ts:36/53`) — T3.0, sin `'use server'` |
| UPDATE | `services/client/client-detail.service.ts` | importar los guards del módulo nuevo (mover, no copiar; ~10 call sites internos sin cambio de comportamiento) |
| CREATE | `app/coach/movement/page.tsx` + `loading.tsx` | hub: alumnos del workspace activo con último semáforo/fecha; CTA evaluar |
| CREATE | `app/coach/movement/_data/movement.queries.ts` | `React.cache`; scope 3-vías (patrón `CoachClientScope`) |
| CREATE | `app/coach/movement/[clientId]/page.tsx` + `loading.tsx` | reporte último final + historial + evolución (línea + radar recharts) |
| CREATE | `app/coach/movement/[clientId]/new/page.tsx` | wizard 7 pasos (retoma draft si existe) |
| CREATE | `app/coach/movement/[clientId]/print/page.tsx` | export print (patrón `progress-print`); registra `pdf_generate` |
| CREATE | `app/coach/movement/_actions/movement.actions.ts` | `upsertDraftItemAction`, `finalizeAssessmentAction`, `deleteAssessmentAction` (+Zod, `revalidatePath`) |
| CREATE | `app/coach/movement/_components/*` | `MovementWizard` (client), `PatternStep` (segmented 0-3, L/R, dolor, clearing), `ScoreBadge`, `PriorityTrafficLight`, `AssessmentReport`, `EvolutionCharts`, `EditedByBadge` reuso si existe |
| UPDATE | `app/coach/clients/[clientId]/ProfileOverviewB3.tsx` (o card nueva) | card "Screening de Movimiento": último semáforo + link al módulo (solo módulo ON) |
| CREATE | `app/c/[coach_slug]/movimiento/page.tsx` + `_data` | vista alumno read-only (finales): último reporte + evolución + disclaimer; sirve `/t` vía proxy |
| UPDATE | `src/locales/es.json` + `en.json` | namespace `assessment.*` (incl. `assessment.title`) |
| CREATE | `supabase/migrations/2026…_movement_assessment_module.sql` | DDL de arriba (vía branch MCP + `db pull`) |
| CREATE | `tests/team/movement-assessment-isolation.sql` | suite RLS (corre en gate autorizado) |

UX claves: wizard `h-dvh` tablet-first, stepper 7 pasos + revisión; segmented 0/1/2/3 con targets
≥44px; L/R lado a lado; toggle clearing solo en los 3 patrones que lo tienen; total parcial /21
fijo (safe-area); estado local por paso + autosave (`useTransition`) + submit `useActionState`;
preview optimista del semáforo; dark mode; `useReducedMotion`. Reporte: semáforo grande + badges
dolor/asimetría + tabla 7 patrones con lado débil resaltado + disclaimer SIEMPRE visible.

## Fases (slices verticales con verificación — testing por tanda SOLO typecheck+vitest)

- **F0 — Cimiento de módulo (transversal, sin DB):** kill-switch `DISABLED_MODULES` +
  enforcement `entitlement` en `getVisibleNavItems` + fix "(tipo FMS)" + ítem nav `movement`
  (apuntando a página stub con `assertModule`). Verifica: unit tests de `coach-nav` (matriz
  contexto × entitlement × kill-switch) + typecheck.
- **F1 — Cálculo puro:** crear `packages/calc` + `movement.ts` + golden tests (8+).
  Verifica: `pnpm test` verde; sin imports de IO.
- **F2 — DB:** migración vía branch efímero MCP (protocolo completo §Modelo de datos), merge en
  verde, `db pull` + regenerar types, **delete_branch mismo día**. Verifica: advisors 0 críticos,
  EXPLAIN ANALYZE loops=1, typecheck con types nuevos. Se escribe
  `tests/team/movement-assessment-isolation.sql` en esta tanda (corre en el gate).
- **F3 — Núcleo coach:** extracción de los guards de scoping a `client-scope.service.ts` (T3.0,
  pre-requisito) + domain + schemas + repository + service + wizard + finalize + reporte
  básico (sin evolución). Verifica: vitest del service (mock repo) + Zod contracts; flujo manual
  local; consentimiento AC7 cubierto con unit test del service, incluido que finalize estampa
  `consent_confirmed_at` en AMBOS contextos (team y standalone — lo exige el CHECK
  `movement_assessments_final_complete`).
- **F4 — Evolución + hub + perfil:** charts recharts (línea + radar), hub `/coach/movement` con
  semáforos, card en perfil del alumno. Verifica: typecheck + render local; AC4.
- **F5 — Export/print + bitácora completa:** página print + `pdf_generate`/`view` en
  `team_access_logs`. Verifica: print visual + unit del service (log llamado solo `viaTeam`).
- **F6 — Vista del alumno:** `/c/[coach_slug]/movimiento` + gate por módulo + disclaimer; probar
  vía `/t` (branding team). Verifica: typecheck + manual local.
- **F7 — GATE FINAL (con OK explícito del usuario):** 1 corrida E2E Playwright (`--workers=1`,
  build prod) con spec nuevo `tests/e2e` del flujo kine→alumno + suite SQL de aislamiento +
  grep de marca (AC5). Actualizar docs canónicas + bitácora del Director.

## Test plan

- **Unit (por tanda):** golden tests de cálculo (F1); `coach-nav` matriz con entitlement;
  service: gating (módulo OFF ⇒ throw), consentimiento (sin consent ⇒ throw), **finalize estampa
  `consent_confirmed_at` en ambos contextos** (team = verificación; standalone = atestación —
  jamás NULL en un final), recálculo server, `last_edited_by`, bitácora condicional `viaTeam`;
  Zod schemas (contratos).
- **SQL (gate):** `tests/team/movement-assessment-isolation.sql` — T1 team A no ve B; T2 standalone
  solo propios; T3 alumno solo SELECT finales propios; T4 INSERT cross-team rechazado; T5 anon
  nada; T6 draft único por alumno; T7 EXPLAIN ANALYZE vía team (InitPlan, loops=1).
- **E2E (gate, autorizado):** kine evalúa (draft → retoma → finaliza) → semáforo en hub → alumno
  ve reporte en `/t` con marca del team → print genera y queda `pdf_generate` en bitácora.
- **Manual:** tablet real (targets, safe-areas), dark mode, throttling (autosave).

## Rollback

- Módulo OFF por defecto + kill-switch `DISABLED_MODULES=movement_assessment` apaga TODO sin
  migración (nav + actions + rutas caen a `notFound`).
- Las tablas nuevas no tienen consumidores fuera del módulo: revert de código = feature invisible;
  las tablas quedan inertes (contract/DROP solo en una migración futura separada, jamás en caliente).
- Si la migración falla en el branch efímero: se corrige ahí; prod jamás vio el DDL.
