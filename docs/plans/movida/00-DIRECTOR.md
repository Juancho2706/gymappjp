# 00 · DIRECTOR — "Movida powered by EVA"

> Documento director. Es el **índice + decisiones + bitácora** de todo el esfuerzo Movida. Leer al iniciar cada sesión. Enlaza los 3 planes y guarda el historial.

- **Branch de trabajo:** `feat/movida-platform` (nunca trabajar en `master`).
- **Planes:** [01 Cimientos](01-PLAN-cimientos.md) · [02 Entrenamiento](02-PLAN-entrenamiento.md) · [03 Evaluación + Nutrición](03-PLAN-evaluacion-nutricion.md)
- **Plataforma objetivo:** web / PWA / responsive. Coach + alumno **standalone**. Enterprise-aware (no se toca enterprise hoy; se diseña para reuso futuro y futura app Expo).
- **Memoria relacionada:** `project_movida_deal`.

---

## 1. Contexto y objetivo

Movida (centro integral salud/deporte, Viña del Mar; ~300 alumnos, 20+ profesionales: entrenadores, kinesiólogos, nutricionistas, psicólogo) evalúa adoptar EVA como **plataforma única** reemplazando Medilink (parcial) + Trek Integral + 5componentes + Excel/Canva + FMS-Excel. Ani (socia, coord. entrenadores) es el canal. Fran (`@franallendel.nutri`) es la nutri (intercambios + Canva). El kine usa screening de movimiento + Excel. El entrenador evalúa con bioimpedancia.

**Objetivo:** construir una EVA que **resuelva** a Movida (precio se ve después). Entregar los módulos/ajustes que Ani pidió, de forma **aditiva sobre Supabase LIVE sin romper a los clientes actuales**.

> **Nota menores:** Movida proyecta entrar a colegios (Kingston, etc.). El pool NO se habilita para poblaciones de menores hasta implementar **consentimiento parental verificable**.

## 1.1 Modelo conceptual: 3 formas de EVA

Con Team, EVA opera en 3 "tamaños" (Team es un **ecosistema propio, separado de enterprise**, para equipos chicos/medianos):

| | Standalone | **Team (nuevo)** | Enterprise |
|---|---|---|---|
| Para quién | 1 coach solo | centro/box/clínica (Movida) | organización grande/cadena |
| Alumnos | los suyos | **pool plano, todos ven/editan todo** | pool con asignación 1 coach↔alumno |
| Jerarquía | ninguna | mínima (owner/co-gestor solo *gestión*, no datos) | completa (roles org_*) |
| Marca del alumno | personal del coach | del team (`/t/slug`) | de la org (subdominio) |
| Cupos/billing | suscripción coach | CEO fija `seat_limit` | facturación corporativa |
| Estado | existe | a construir | existe, intacto |

**Por qué separado de enterprise:** enterprise asigna 1 coach por alumno (opuesto al pool plano), trae maquinaria que Movida no necesita (roles/dashboards/brand center/facturación), y su aislamiento ya está testeado (mezclar lo arriesga). Team **copia patrones** (helper anti-recursión, proxy de alumno, audit logs, UI de gestión de miembros) pero con **tablas propias**. Un coach puede tener dos sombreros (standalone + miembro de team) gracias al split `client_memberships` (`standalone|enterprise|team`); lo del team no se derrama a sus alumnos standalone. Team es además un **nicho de producto revendible** (box/HYROX/clínicas), no solo Movida.

## 2. Decisiones arquitectónicas (LOCKED)

1. **Pool compartido = "TEAM" (equipo) ligero, NUEVO, aislado del enterprise.** Tablas `teams` + `team_members`, helper `is_team_member()`, columna `clients.team_id`. **Plano y full-access**: todo miembro activo es "coach" y ve/edita TODOS los alumnos del pool y TODAS las funciones habilitadas. La "especialidad" (kine/nutri/entrenador) es **solo etiqueta editable de display**, no restringe acceso. Standalone (`team_id NULL`) intacto.
   > ⚠️ **`workspace` PROHIBIDO** como nombre: ya está tomado 2 veces — (1) selector de identidad multi-rol (`services/auth/workspace.service.ts`, `workspace_preferences`, `WorkspaceSwitcher`, domain `WorkspaceSummary`); (2) migración enterprise `20260525180500_workspace_rls_sensitive_tables.sql`. Nunca reusar `workspace*` para el pool.

2. **Reuso vs duplicación enterprise.** Enterprise YA implementa pool-multi-coach + aislamiento + proxy de alumno (`organizations`, `organization_members`, `coach_client_assignments`, `is_active_org_member()`, `/e/[org_slug]→/c/[coach_slug]`). Se crean tablas NUEVAS aisladas (no se reusa `organizations`) porque el team es **plano sin roles/billing/jerarquía** y mezclarlo contaminaría el aislamiento enterprise ya hecho. **SÍ se copian patrones:** helper `SECURITY DEFINER` anti-recursión, proxy de alumno, estructura de tests de aislamiento, `org_audit_logs`→`team_audit_logs`.

3. **Identidad del alumno de pool (LOCKED):** scope nuevo **`team`** en `client_memberships` (expand-contract sobre el CHECK `standalone|enterprise|team`) + `clients.team_id`. El alumno ve la **marca del POOL (Movida)** vía ruta proxy **`/t/[team_slug]`** (patrón enterprise). `clients.coach_id` se conserva como **creador/dueño original**; si el dueño sale del pool, se reasigna dentro del team (no se borra data). Consentimiento requerido para entrar al pool (ver #5).

4. **Concurrencia = awareness primero (v1).** `last_edited_by` (seteado en service/action, NO trigger) + indicador "editado por X / hace Y" + toast no destructivo si cambió mientras editabas. **Más** un log append-only mínimo con "ver/revertir último cambio" para entidades críticas (plan entreno, pauta nutri, evaluaciones). Sin locking optimista duro v1.

5. **Legal datos de salud (LOCKED — postura completa):** Movida = **responsable** / EVA = **encargado** (DPA). Consentimiento **por propósito y BLOQUEANTE**: sin consentimiento activo el alumno NO entra al pool (queda standalone). **Log de accesos** a datos de salud (`team_access_logs`). **DPIA breve** (≥300 titulares de salud). Datos de salud (FMS, antropometría, composición, fotos) en Storage **privado** con RLS + signed URLs.

6. **Corte por capa/dependencia:** Cimientos → Entrenamiento → Evaluación+Nutrición. **Excepción de valor:** intercalar un slice vertical de **nutrición-intercambios + PDF branded** apenas Cimientos exponga pool+toggles, en paralelo a Plan 2 (riesgo de churn de Fran a Avena).

7. **Módulos nuevos = OFF por defecto + toggle.** Resolución por **contexto del recurso**: para un alumno de pool el módulo se resuelve por `teams.enabled_modules` (**el pool MANDA**, no unión); para el dashboard propio del coach standalone usa `coaches.enabled_modules`. Movida los tiene ON. **Sin atar a tier.** El contexto team **exime de gates de tier** (`canImportClients`, `max_clients`).

8. **Aditivo sobre Supabase LIVE** (expand-contract). Standalone-first, enterprise-aware (web/PWA, futuro Expo).

### 2.1 Decisiones recomendadas (aplicadas como default — confirmar cuando puedas)

- **Templates** (`workout_plans`/`nutrition_plans` con `client_id NULL`): **compartidos dentro del pool** (full-access coherente).
- **Cálculo puro** (cardio/FMS/ISAK) en **`packages/calc/`** (no `apps/web/src/services`) → reuso futuro Expo sin refactor.
- **Migración de históricos de los 300:** diferida a **futuro lejano**; si Movida la pide, carga manual asistida (el CEO entrega la data → import directo a la BD con Claude). v1 arranca limpio (histórico como PDF adjunto opcional).
- **Validación:** **hay Supabase Pro por 1 mes (hasta ~2026-07-09)** → se trabaja/testea en un **branch efímero (cuarto limpio)** vía MCP y se mergea a prod solo en verde (ver §3 "Workflow con branching (Pro)"). Front-load los cambios riesgosos este mes. Al expirar, volver al protocolo aditivo-en-LIVE.
- **Antropometría/ISAK:** construir el **cálculo completo ahora** (5 componentes Kerr + somatotipo Heath-Carter + %grasa + features de 5componentes/Avena), aunque sea trabajoso (decisión del usuario). Validar con **casos resueltos publicados** (golden tests) ya; cuando Fran pase 3-5 fichas reales, confirmar paridad <1-2% y marcar "validado". No bloquea construir; sí antes de exponer %grasa a un alumno real.
- **i18n:** bilingüe es/en desde el día 1 (la app ya es bilingüe); términos de dominio (1C/1P, patrones de movimiento) quedan como términos de dominio.
- **kg vs lb:** trabajar con **ambos** (default `kg`, `lb` soportado por ejercicio vía `load_unit`; el coach elige). Confirmado por el usuario — no requiere input de Ani.
- **Provisión y límite del team:** vía **sección "Teams" en el CEO/admin panel** (`/admin`), no auto-signup. El CEO crea el team, su marca, define **`seat_limit`** (cupos de coach contratados, ej. 30 — solo el CEO lo cambia), las cuentas coach (set-password link) y designa al `owner`. Script puente opcional para bootstrap.
- **Gestión de miembros (self-service):** el `owner` + **co-gestores** (`team_members.can_manage`, designables, ej. socios Tito/Jaime) gestionan miembros desde una sección **"Equipo"** en el menú coach (espejo simplificado de la gestión enterprise): invitar/sacar coach, editar etiqueta, reset password, transferir owner — **respetando `seat_limit`** (al tope → "contacta al CEO"). Gestionar ≠ acceso a datos (data plana para todos).

## 3. Reglas de trabajo (obligatorias)

- **Branch:** todo en `feat/movida-platform` (o sub-ramas). Commit/push solo cuando el usuario lo pida.
- **DB aditiva (expand-contract):** columnas nullable con default; tablas nuevas; políticas RLS con nombres nuevos. Nada de `DROP`/`ALTER` destructivo en fase expand; los `DROP` van en una migración "contract" posterior. RLS de team vía helper `SECURITY DEFINER` `is_team_member()` (anti-recursión, gotcha `is_active_org_member()` migración `20260517150000`). Separar DDL de backfills con la convención `_POST_DEPLOY_` existente; backfills idempotentes y re-ejecutables.
- **Workflow con branching (Pro) — protocolo obligatorio (ventana Pro hasta ~2026-07-09):** validar TODO en un **branch efímero** y mergear a prod solo en verde. **Ciclo por tanda:** `list_branches` (cazar colgados) → `create_branch` (`confirm_cost`; async → guardar `project_ref`, anotar hora) → poll `list_branches` hasta `MIGRATIONS_PASSED` (si `MIGRATIONS_FAILED` → `get_logs` service `branch-action`) → `apply_migration` con `project_id`=branch (solo DDL **aditiva**: tablas nuevas, columnas nullable, `CREATE POLICY` nuevas, helper `is_team_member()` SECURITY DEFINER; **queda trackeada → es lo único que `merge_branch` propaga**) → `execute_sql` para **data sintética** (el branch arranca SIN datos: 2+ teams/coaches/alumnos + `auth.users` + claims JWT; `execute_sql` NO se trackea → solo seed/tests) → **testear RLS** impersonando `set local role authenticated` + claims (NUNCA `service_role` = falso OK): team A no ve team B, coach no ve otro team, standalone `team_id NULL` intacto → `get_advisors` security+performance (0 críticos; envolver `auth.uid()` en `(select auth.uid())`, indexar FKs, consolidar policies) → `rebase_branch` si prod cambió (drift) → **snapshot prod** `CREATE TABLE _bak_<tabla>_<AAAAMMDD> AS SELECT *` → `merge_branch` (⚠️ **resetea prod y re-ejecuta TODO el historial de migrations** → migrations **idempotentes/forward-only** `IF NOT EXISTS`/`CREATE OR REPLACE`, jamás DROP/rename destructivo que el replay corra sobre datos reales; vigilar `get_logs`) → `supabase db pull` (versionar `.sql`; `apply_migration` MCP NO escribe el local) + `generate_typescript_types` + `pnpm typecheck`/`test`/`build` verdes → **`delete_branch` el MISMO día** (corta el cobro). **Sigue vigente:** todo aditivo/expand-contract, módulos OFF + kill-switch, snapshot pre-merge, cero destructivo sobre data real, `DROP` (contract) diferido y dentro de un branch. **Costo:** branch Micro ≈ **USD 0.0134/h**; **Compute Credits y Spend Cap NO cubren branching** (branch olvidado 24/7 ≈ USD 9.7/mes) → máx 1 branch, `list_branches` al inicio/fin de sesión, borrar al terminar, NO usar persistent. **Al expirar el Pro:** volver al protocolo aditivo-en-LIVE (snapshot + data sintética + advisors, sin cuarto limpio).
- **Observabilidad y kill-switch:** el toggle por coach es ENTITLEMENT, no kill-switch. Cada módulo nuevo respeta **además** un **flag de operador a nivel plataforma** (env runtime o tabla `feature_flags` global) consultado por el guard server-side ANTES del entitlement → apaga el módulo para todos sin migración. Instrumentar errores de cálculos puros y server actions de módulos nuevos con tag por módulo. Métricas mínimas: tasa de error de generación PDF y de cálculo ISAK/FMS.
- **i18n transversal:** todo string visible de módulo nuevo usa `t()` y agrega su key a `es.json` Y `en.json` en el mismo commit. Namespaces: `workout.area.*`, `workout.cardio.*`, `assessment.*`, `bodycomp.*`, `nutrition.exchange.*`. El nombre del screening de movimiento es key propia (`assessment.title`) para cambiar el nombre legal sin tocar código.
- **Cálculo puro en `packages/calc/`:** cálculo determinista sin IO (cardio Tanaka/Karvonen/zonas/pace, FMS scoring, ISAK Kerr/Heath-Carter/%grasa) vive ahí; los `services/` orquestan (DB+repos) y llaman a esas funciones puras. Sin imports `server-only`/Supabase para que Vitest las pruebe.
- **Mobile transversal:** `h-dvh` (no `h-screen`/`100vh` fuera de `md:`), `*-safe` en elementos fijos, `overflow-x: clip`; overlays/timers respetan safe-area; `useReducedMotion` en animaciones.
- **SDD (pilar 4):** cada feature lleva `specs/[feature]/SPEC+PLAN+TASKS`. Clean Architecture: `_data → services → infrastructure/db/*.repository → Supabase`.
- **Docs:** al cambiar rutas/schema/flujos, actualizar docs canónicas y la **bitácora** de este director en el mismo cambio.

## 4. Roles como lentes de revisión

| Rol | Qué vigila |
|---|---|
| Software Architect | Aditividad, Clean Arch, límites de dominio, reuso vs duplicación (team vs enterprise vs identity-split), deuda |
| Backend Engineer | Migraciones, RLS por-tabla (USING vs WITH CHECK), repositories, servicios puros, performance |
| Frontend Engineer | UI condicional por tipo, estado (useActionState/useOptimistic/useTransition), skeletons, accesibilidad |
| Mobile Engineer | Cálculo en `packages/calc` + tipos en `domain/`; reglas mobile; reuso futuro Expo |
| DevOps | Workflow branching Pro (create→apply→seed→advisors→merge→**delete mismo día**), no dejar branches corriendo (costo), aditivo/expand-contract, snapshot pre-merge, CI typecheck/test/build, drift-guard types |
| QA Automation | RLS/team-isolation tests con env (no hardcode local), golden fixtures, E2E coach→alumno, paridad ISAK |
| Security | Aislamiento team, guards de app (no solo RLS), gating server-side, Storage privado de salud |
| Product Manager | Priorización, MVP vs completo, "resuelve a Movida", milestones demo-ables, scope creep |
| UX/UI Designer | Áreas custom (DnD), wizard movimiento, steppers, PDF branded, menú Settings IA, awareness UX |
| Head of Sales B2B | Que lo construido = "lo que diferencia a Movida"; revendible a box/HYROX/nutris |
| SDR | Mensaje/demos; qué mostrar primero a Ani |
| Customer Success | Onboarding 30 coaches (set-password link), migración 300 alumnos, seed, adopción |
| Legal & Compliance / DPO (Chile) | Ley 21.719/19.628/20.584; DPIA pool de salud; consentimiento por propósito; log de accesos; DPA Movida (responsable vs encargado); menores |
| Fintech / Integrations | No romper MercadoPago al reorganizar Settings; import CSV InBody (fase 2 cond.); Medilink (diferido) |

## 5. Resumen de research (sesión 2026-06-08)

Detalle (fórmulas/valores) vive en cada plan. Hooks: builder/ejercicios polimórficos + Excel real (bloques custom, por-lado, carga polimórfica, distancia, instrucciones) → [02]; cardio FC/pace/intervalos (omitir TSS/power) + HYROX → [02]; screening de movimiento (7 tests, /21, asimetría por-lado, semáforo, marca propia) → [03]; composición dual BIA (entrenador) vs ISAK (nutri) NO mezclables → [03]; nutrición intercambios (guía real de Fran, 8 grupos, alimentos chilenos) + PDF branded reemplaza Canva → [03]. **Avena.io** = referencia (B2C nutris MX); inspirarse en intercambios + PDF multi-formato + lista de compras + import InBody; riesgo: que Fran lo contrate sola → urgencia.

## 6. Hallazgos de código que fundamentan los planes

- Propiedad cliente = `clients.coach_id` (FK); RLS standalone `coach_id = auth.uid()`. NO existe agrupación bajo `organization` salvo enterprise. Split de identidad `client_accounts`/`client_memberships` (scope `standalone|enterprise`) migración `20260608210000`.
- Bloqueador áreas: `workout_blocks.section` CHECK warmup/main/cooldown (`baseline.sql:1504`). `reps` texto libre, `sets` int, logs en `workout_logs`. Sin `exercise_type`. `domain/workout/types.ts` declara `WorkoutSection`/`ExerciseUnit` (sin uso).
- Nutrición: `food_swap_groups` YA existe + `foods.category` enum + `foods.org_id`. `nutrition-day-pdf.ts` (jsPDF) branding EVA hardcodeado. `nutrition-utils.ts:105` macros.
- Body comp: `check_ins` solo weight/energy/photos/notes; `ProgressBodyCompositionB6.tsx` con recharts. Greenfield.
- Settings: `/coach/settings` YA existe como hub embrionario (branding "Mi Marca": `BrandSettingsForm`, `LogoUploadForm`, `DangerZone`, `BrandSettingsTour`, `StudentDashboardPreview`) → reorganizar/extender, no crear. `/coach/subscription` separado (MP). Sin `enabled_modules`/`feature_flags` por coach (flags solo env `lib/feature-flags.ts`). `CoachSidebar` navItems hardcoded.
- **Guards de app** (no solo RLS): `assertCoachClientReadAccess`, `getCoachClientScope` (`client-detail.service.ts`) filtran por `coach_id`/scope → hay que extenderlos a `is_team_member`. Firma de fotos service-role (`app/api/mobile/coach/checkin-photos/route.ts`, `resolveCheckinPhotoUrls`, `lib/storage/checkin-photos.ts`) no contempla pool.
- **Flujos de entrada** existentes escriben `coach_id` individual: `resolve-invite.ts`, `import.actions.ts`/`create-client-internal.ts`, `join.actions.ts` → ajustar para `team_id`. Import gateado por tier (choca con LOCKED #7).
- Concurrencia: sin locking optimista, sin realtime; `updated_at` via trigger `handle_updated_at()` (no conoce actor de negocio).
- Existen: `WorkoutTimerProvider` (solo `startRest`), offline queue `enqueueWorkoutLog`, `useOptimistic`/`useActionState`, `LanguageContext` i18n, `@dnd-kit` con `TouchSensor`, `recharts`, `progress-print/page.tsx`, `lib/import/csv-injection`, `api/cron/purge-data`.
- Docs/specs: `specs/_templates/{SPEC,PLAN,TASKS}.md` existe; `docs/plans/` destino de estos docs.

## 7. Pendientes a pedirle a Ani (bloqueantes)

- **Export actual de los ~300 alumnos** (Medilink/Excel) — bloqueante de onboarding.
- Confirmación de **responsable del tratamiento** (Movida) para el DPA.
- Nutrición: valores **kcal/macro por grupo** de intercambio (la guía de Fran trae equivalencias, no macros) → confirmar vs SMAE/UDD. Set canónico de grupos (incluye `SP` scoop proteína). ¿Subgrupos por % grasa?
- Antropometría: 3-5 fichas reales **ISAK** (ecuación/pliegues) + 3-5 reportes **bioimpedancia** (marca/modelo, export CSV?).
- Screening de movimiento: la **hoja real** del kine (¿7 patrones? ¿clearing de dolor? frecuencia re-test).
- Entreno: 2-3 sesiones más (incl. **HYROX** de box). ¿**kg y lb** indistinto o forzar uno?
- Negocio: ¿Fran ya evalúa Avena por su cuenta? (urgencia).

## 8. Milestones demo-ables (guion 5 min para Ani)

- **M0 (~sem 1-2) "Pool vivo":** team Movida con 5-10 alumnos reales importados; 3 coaches viendo el mismo pool; awareness de último editor.
- **M1 "Diferenciador nutri":** pauta de intercambios real de Fran + PDF branded descargable (mata Canva).
- **M2 "Evaluación de ingreso":** wizard de screening de movimiento + 1 medición BIA.
- **M3 "Entreno completo":** bloque cardio/movilidad/farmer-carry ejecutado por alumno con timer.

## 9. Bitácora / Historial

| Fecha | Plan | Qué se hizo | Commit / Branch | Estado |
|---|---|---|---|---|
| 2026-06-08 | — | Investigación (3 informes + 3 PDFs reales), decisiones locked, branch `feat/movida-platform`, 4 docs creados | `feat/movida-platform` | ✅ Setup |
| 2026-06-08 | — | Revisión multi-lente (7 roles) → plan de edición; decisiones estructurales (team, scope `team`, marca `/t/`, legal completa); docs pulidos y endurecidos (RLS por-tabla, guards, consentimiento, identidad alumno, migración LIVE, milestones) | `feat/movida-platform` | ✅ Planes pulidos |
| 2026-06-08 | 01 | Gobernanza del team: kg+lb soportados; provisión vía CEO panel "Teams"; owner + co-gestores (`can_manage`) self-service (sección "Equipo", espejo enterprise); `seat_limit` solo-CEO con guard de cupos; marca team solo owner/co-gestor | `feat/movida-platform` | ✅ Gobernanza team |
| 2026-06-08 | — | Ajustes: trabajar en LIVE sin branch (protocolo aditivo + snapshot + data sintética); antropometría/ISAK = construir completo ahora (validar con literatura + fichas de Fran); históricos diferidos a futuro (carga manual asistida) | `feat/movida-platform` | ↪️ Reemplazado por branching |
| 2026-06-09 | — | **Supabase Pro comprado (1 mes, hasta ~2026-07-09).** §3 pasa de "LIVE sin branch" a "Workflow con branching (Pro)": ciclo create_branch→apply_migration→seed→get_advisors→merge_branch→delete (mismo día). Reglas de costo (branch ≈ USD 0.0134/h; créditos/Spend Cap NO cubren branching). Aditivo/snapshot/advisors siguen. Front-load cambios riesgosos este mes | `feat/movida-platform` | ✅ Workflow branching |
| 2026-06-09 | 01 | **Migración 1 `team_foundation` APLICADA A PROD** (aditiva). Specs SDD `specs/movida-team/`. Workflow autorea+4 lentes → SQL final. Branch descartado (drift 9 migrs por file-less MCP/dashboard) → pivote a directo-en-prod-aditivo + snapshot (`_bak_*`). Tablas `teams`/`team_members`/`team_audit_logs`, `team_id` en clients+memberships, scope `team`, helpers `is_team_member`/`is_team_manager`, 25 policies RLS, 3 triggers (owner-only/seat/escalación). **13/13 tests RLS pasaron** (tx+rollback, cero contaminación, cero regresión). get_advisors: 0 ERRORs (hardening trigger grants + snapshots asegurados). Files en `supabase/migrations/20260609050855_*` + `20260609051251_*` + `tests/team/team-isolation.sql` | `feat/movida-platform` | ✅ Migración team en prod |
| 2026-06-09 | 01 | **Migraciones 2 y 3 APLICADAS A PROD.** M2 `governance_entitlements_consent_access_logs`: `coaches.enabled_modules` + `client_consents` (Ley 21.719, inmutable salvo revoked_at via trigger, revoke forward-only) + `team_access_logs` (append-only). M3 `team_tables_harden_grants`. **Hallazgo de seguridad (review live):** el proyecto tiene ALTER DEFAULT PRIVILEGES que da ALL (incl. TRUNCATE, no filtrado por RLS) a authenticated/anon en toda tabla nueva → se REVOKE ALL + GRANT mínimo en TODAS las tablas team (incl. las de M1: `team_audit_logs` ahora append-only real, `teams`/`team_members` sin TRUNCATE, anon sin nada). **T1-T20 PASARON** (tx+rollback, 0 contaminación). Files en `supabase/migrations/20260609054748_*` + `20260609054917_*` + `tests/team/governance-isolation.sql` | `feat/movida-platform` | ✅ Gobernanza + entitlements en prod |
| 2026-06-09 | 01/02 | **Migración 4 `workout_section_templates` APLICADA A PROD** (áreas custom del builder). Tabla con 7 áreas system (Calentamiento/Principal/Enfriamiento + Movilidad/Activación pilar central/Potencia/Acondicionamiento, UUIDs fijos) + `workout_blocks.section_template_id` + **backfill 4004/4004 (0 huérfanas)**. RLS por operación (system solo-lectura, coach/team scope, gestor escribe), soft-delete en RLS, grants sin TRUNCATE, anon sin nada. Expand-contract: NO se dropea el CHECK `section` (fallback). **9 asserts PASARON** (tx+rollback). Files: `supabase/migrations/20260609062017_*` + `tests/team/areas-isolation.sql` | `feat/movida-platform` | ✅ Áreas custom en prod |
| 2026-06-09 | 01 | **Fase CÓDIGO APP — slice 1 (read+list del pool).** `database.types.ts` regenerado (5 tablas nuevas) vía CLI + typecheck verde. Nuevos servicios aditivos: `services/auth/team.service.ts` (getCoachActiveTeamIds, isCurrentUserTeamMember/Manager, currentUserHasTeamAccessToClient) y `services/entitlements.service.ts` (hasModule/assertModule, pool manda). Cableado team-aware (zero-regresión, RLS=techo→sin fuga): `assertCoachClientReadAccess` (+viaTeam) + base fetch de `getClientProfileData` + list `getCoachClientsWithPrograms`. → un coach del pool ve el directorio del pool y abre cualquier alumno (perfil + sub-data). typecheck verde. **Sin commitear.** Falta verificar UX con `pnpm dev`. | `feat/movida-platform` (working tree) | ✅ Read+list pool (typecheck) |
| | | **SIGUIENTE app:** build/save workout guard (`assertCoachCanManageWorkoutClient`, `getBuilderData`), mutation actions (archive/delete/reset), `findClientsByCoach` (confirmar user vs service), provisión team Movida (CEO panel), Settings/UI áreas. **Verificar con app corriendo.** | | ⏳ |
| | | **PENDIENTES:** (a) `supabase db pull` para reconciliar drift (9 migrs file-less + las 2 nuevas) + regenerar `database.types.ts`; (b) endurecer policy `clients_standalone_coach_manage` (deuda: coach creador ve cliente de pool tras salir) en migración de policies; (c) drop snapshots `_bak_*` cuando se confirme OK; (d) seguir Plan 1: app guards (`assertCoachClientReadAccess`→`is_team_member`), consentimiento, entitlements, Settings, áreas custom. | | ⏳ |
| 2026-06-09 | 01 | **Commits + push** de migraciones 1-4, tests, `database.types.ts` y servicios app (read/list pool) a `origin/feat/movida-platform` (3 commits). Verificado typecheck + build + boot. | `feat/movida-platform` | ✅ Pusheado |
| 2026-06-09 | ⚠️INCIDENTE | **PROD CAÍDO (~14:55-15:00 UTC): alumnos no logean + web lentísima.** Causa raíz: las 16 policies `team_*_member_all` (migr. 1) con `is_team_member()` SECURITY DEFINER **evaluadas POR FILA** + EXISTS correlacionado → planner opaco → per-row en hot tables → statement timeouts masivos → DB Unhealthy sobre t4g.nano. Dx: `get_logs(postgres)` (cientos de "canceling statement due to statement timeout") + `get_logs(auth)` (504 request_timeout). Descartado incidente de plataforma Supabase (otra región). **Fix:** (1) compute nano→**micro** (gratis con Pro, crédito $10/mo cubre 1 Micro); (2) **DROP de las 16 policies** en hot tables (pérdida funcional CERO: teams=0, app master no consulta team) → migr. `20260609150000_team_drop_hot_table_rls_incident.sql`. Verificado: timeouts cesaron, advisors 0 ERROR críticos, RLS standalone/enterprise intacta. **Login E2E OK 200** (coach+alumno, password grant real). Nota: passwords de cuentas prueba reseteadas a la deseada. | `feat/movida-platform` | ✅ Prod restablecido |
| | | **LECCIÓN RLS (crítica, antes de re-añadir pool):** NUNCA `SECURITY DEFINER` por-fila ni EXISTS correlacionado en policies de hot tables. Re-introducir acceso pool OPTIMIZADO: envolver el check en `(select is_team_member(...))` para que el planner lo trate como InitPlan (1 eval por query, no por fila), o materializar ids del pool. Validar EXPLAIN ANALYZE + carga ANTES de aplicar a prod. **Bloquea provisión de Movida.** | | ✅ Resuelto abajo |
| 2026-06-09 | 01 | **RLS POOL OPTIMIZADO APLICADO A PROD** (`team_rls_optimized`). Investigación web (Supabase RLS perf docs + supaexplorer, jun 2026): el anti-patrón era `is_team_member(<col fila>)` SECURITY DEFINER con **parámetro de fila** → no cacheable → per-row. Patrón nuevo: 7 funciones `SECURITY DEFINER STABLE` set-returning SIN parámetro de fila (`current_user_team_ids` / `_pool_coach_ids` / `_pool_client_ids` / `_pool_workout_plan_ids` / `_pool_nutrition_plan_ids` / `_pool_daily_log_ids` / `_pool_meal_ids`), usadas como `col IN (SELECT helper())` → **InitPlan, 1 eval/query**, hash semi-join indexado. + 2 índices faltantes (`client_payments`/`workout_programs`.client_id). **EXPLAIN ANALYZE en prod: `loops=1`, hash join, 1.5ms sobre workout_logs (6965 filas)** vs per-row viejo. **Correctness 4/4 PASS** (tx+rollback: miembro VE pool, outsider NO). `get_advisors performance`: **0 `auth_rls_initplan` en policies team** (los 122 son deuda pre-existente). Login coach+alumno OK 200. File: `supabase/migrations/20260609160000_team_rls_optimized.sql`. **DESBLOQUEA provisión de Movida.** | `feat/movida-platform` | ✅ RLS pool óptimo en prod |
