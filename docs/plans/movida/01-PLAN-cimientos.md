# 01 · PLAN — Cimientos (plataforma + acceso + áreas custom)

> Base de los planes 02 y 03. Hacer **primero**. Volver al [Director](00-DIRECTOR.md).
> **Concepto del pool = `team` (equipo).** `workspace` PROHIBIDO (colisión, ver Director §2).

## Objetivo

Dejar la plataforma lista: (A) **pool compartido `team`** plano y full-access para ~30 coaches; (A.bis) **identidad/app del alumno de pool**; (B) **toggles de módulos**; (C) **menú Settings**; (D) **áreas custom** del builder; (E) **awareness** de concurrencia; (F) **autorización a nivel servicio + consentimiento + log de accesos**. Todo aditivo sobre Supabase LIVE.

> **Prerrequisitos bloqueantes de TODO el plan:** A.bis (identidad alumno), F (consentimiento + guards), y RLS por-tabla resuelta. No iniciar implementación hasta tener specs SDD de estos.

## A. Team / Equipo (pool compartido)

**Modelo (tablas nuevas):**
- `teams`: `id`, `name`, `slug` (para `/t/[team_slug]`), `owner_coach_id`, `logo_url`, `primary_color`, `enabled_modules jsonb default '{}'`, `created_at`, `deleted_at`.
- `team_members`: `id`, `team_id`, `coach_id`, `display_role text` (etiqueta libre "Kinesiólogo"/"Nutricionista"/"Entrenador" — **solo display**), `status text check (active|suspended|revoked) default 'active'`, `joined_at`, `deleted_at`. `UNIQUE(team_id, coach_id)`.
- `clients.team_id uuid` (FK nullable). Standalone = `NULL` (intacto). `coach_id` se conserva como **creador/dueño**.
- `team_audit_logs` (espejo de `org_audit_logs`): altas/bajas de miembros, reasignaciones, borrados.

**Helper anti-recursión (obligatorio):**
```sql
create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and coach_id = auth.uid()
      and status = 'active' and deleted_at is null
  );
$$;
```
La policy SELECT de `team_members` DEBE usar este helper (que bypasea RLS), nunca un `EXISTS` directo sobre `team_members` (replica el fix `20260517150000`).

### A.bis — Identidad y app del alumno de pool (LOCKED, prerrequisito)

- **Scope:** agregar `team` al CHECK de `client_memberships` (`standalone|enterprise|team`) — expand-contract. Membership de pool: `scope='team'`, `team_id`, `client_id`, `account_id`. `clients.team_id` setea la pertenencia del registro cliente. `clients.coach_id` = creador/dueño.
- **Login:** extender `clientLoginAction` con rama "miembro de pool" (resolver team del alumno).
- **Branding/ruta:** el alumno ve la **marca del team (Movida)** vía ruta proxy **`/t/[team_slug]`** (patrón enterprise `/e/[org_slug]→/c/[coach_slug]`). Middleware resuelve la marca del team y setea headers `x-coach-*`/`x-team-*`. Manifest/splash/PWA del alumno = branding del team. Push del alumno con branding del team.
- **Orfandad:** si el `owner_coach_id`/dueño deja el pool → reasignar `coach_id` dentro del team (no borrar datos). Prohibir revocar al último miembro activo o al owner sin transferir.
- **Índice único parcial** para evitar membresías duplicadas activas por (account, client, scope).

### A.bis2 — Entrada de alumnos al pool (ajuste de flujos existentes)

Hoy escriben `coach_id` individual y `resolve-invite` solo conoce standalone/enterprise → caen fuera del pool. Ajustar:
- `resolve-invite.ts`: si el coach del código pertenece a un team activo, resolver y setear `team_id`.
- `import.actions.ts` / `create-client-internal.ts`: aceptar y escribir `team_id` del contexto del coach (+ eximir de gate de tier, LOCKED #7).
- `join.actions.ts`: propagar el team del invite.
- **Decisión menor (default aplicado):** el código de invite es per-coach y **hereda** el team del coach. (Alternativa: código único de team. Confirmar con Ani.)
- Disparar **flujo de consentimiento** (ver §F) al asociar el alumno al team; sin consentimiento → queda standalone.

### A — RLS por-tabla (full-access del pool: SELECT=USING, escritura=WITH CHECK)

Reescribir el sketch genérico. Cadena de llaves real por tabla (políticas nuevas `team_*`, aditivas a las standalone):

| Tabla | Cadena a `team` | Comando |
|---|---|---|
| `clients` | directo `team_id` | SELECT/INSERT/UPDATE/DELETE |
| `workout_programs` | `client_id`→clients.team_id (o `coach_id` ∈ team) | FOR ALL |
| `workout_plans` | `client_id`→team (templates `client_id NULL` = **compartidos en pool**, rama `coach_id ∈ team`) | SELECT + WITH CHECK |
| `workout_blocks`/`workout_plan_blocks` | vía `plan_id→workout_plans` (no tienen `client_id` directo) | SELECT + WITH CHECK |
| `nutrition_plans` | `client_id`→team (templates igual que workout_plans) | SELECT + WITH CHECK |
| `nutrition_meals` | vía `nutrition_plans`; `food_items` vía `nutrition_meals→nutrition_plans` | SELECT + WITH CHECK |
| `daily_nutrition_logs` | `client_id` directo; `nutrition_meal_logs` vía `daily_nutrition_logs.client_id` | SELECT + WITH CHECK |
| `workout_logs`, `check_ins`, `client_intake`, `client_payments` | `client_id` directo | SELECT + WITH CHECK |
| NUEVAS: `movement_assessments`/`_items`, `body_composition_measurements`, `meal_exchange_targets` | vía cabecera/`client_id`/meal→plan | SELECT + WITH CHECK |
| NUEVAS catálogo: `workout_section_templates`, `exchange_groups`, `exercises` (team) | `team_id`/`coach_id` directo | FOR ALL |

- **USING (lectura) y WITH CHECK (escritura) por separado** — full-access requiere escritura, no solo lectura.
- **Contrato de autoría en el pool:** cuando un par crea/edita datos de un alumno ajeno → `coach_id` = dueño original conservado; `last_edited_by` = par actor.

### F — Autorización a nivel servicio (NO solo RLS)

RLS permisivo no basta: hay guards de app que filtran por `coach_id`/scope y bloquearían al par del pool. **DoD: grep obligatorio de `coach_id` en `services/` y `app/**/_actions`.** Actualizar a aceptar también `is_team_member(client.team_id)`:
- `assertCoachClientReadAccess`, `getCoachClientScope` (`client-detail.service.ts`).
- Chokepoint de firma de fotos: `app/api/mobile/coach/checkin-photos/route.ts`, `resolveCheckinPhotoUrls`, `lib/storage/checkin-photos.ts` (firmar a miembros del pool, path keyed por alumno).
- Wrapper `assertModule(ctx, key)` y `assertTeamAccess(ctx, clientId)` al inicio de cada server action de datos de cliente.

### F — Consentimiento de pool multiprofesional (NO diferir a Plan 3)

- Tabla `client_consents (id, client_id, team_id, purpose check (pool_multidisciplinary_access|health_data_processing|photo_storage|marketing), granted_at, revoked_at, consent_text_version, granted_via)`.
- Al asociar alumno a un team → flujo de consentimiento explícito (texto que nombre al equipo y especialidades). **Gating server-side:** sin consentimiento activo, el alumno no entra al pool (queda standalone). El alumno ve en su app qué team/especialidades acceden y puede **revocar** (cascada → vuelve standalone). **Bloqueante de go-live.**
- **Menores:** no habilitar pool para menores hasta consentimiento parental verificable.

### F — Registro de accesos a datos de salud

- Tabla `team_access_logs (actor_coach_id, client_id, team_id, resource, action check (view|create|update|delete|export|pdf_generate), at)`, escrita en el service layer en queries de FMS/antropometría/composición/fotos/nutrición del pool. Test QA: abrir ficha de salud deja registro. Documentar retención (alinear con `api/cron/purge-data`).

### A — Gestión de Teams en el CEO/admin panel + onboarding 300 alumnos

- **Dónde se crean los teams:** nueva sección **"Teams"** en el panel `/admin` (CEO, gated por `ADMIN_EMAILS`). NO auto-signup de coaches. Permite: crear team + marca (logo/color), crear/invitar las N cuentas coach, **designar el `owner`** (uno de los coaches; coach normal + derecho a editar marca del team y gestionar miembros), asignar alumnos al pool. Reusable para futuros centros/box (no solo Movida).
- **Límite de cupos (`teams.seat_limit int`) — SOLO el CEO lo define/cambia en `/admin`.** Es el nº de cuentas coach contratadas (ej. Movida = 30). El owner/co-gestores NO pueden cambiarlo. Cupos consumidos = miembros **activos** (`status='active'`, `deleted_at IS NULL`); sacar un coach libera cupo. Espejo de `organizations.seats_included`. Default = nº contratado.
- **Provisión de cuentas (server-only):** endpoint/acción protegida por `ADMIN_EMAILS` (nunca cliente, nunca exponer `SERVICE_ROLE_KEY`). Idempotente (`ON CONFLICT` en `team_members` y altas `auth.users`). Cuentas vía admin API con **invite/set-password link** (NO password temporal a 30 personas). Audit log (`team_audit_logs`) por alta. Dry-run + rollback. Validar en un **branch efímero (Pro)** con data sintética; snapshot prod antes del merge. Primer login del coach pide su `display_role`.
- **Bootstrap inmediato (opcional):** script puente service-role para dejar el team Movida operativo ya, mientras se construye la UI del CEO panel. Misma lógica idempotente.
- **Modelo de owner + co-gestores:** `teams.owner_coach_id` = uno de los miembros. `team_members.can_manage bool` (el owner siempre `true`; puede designar 1-2 co-gestores, ej. Tito/Jaime). **Gestionar ≠ acceso a datos:** owner y co-gestores tienen los mismos poderes de gestión (miembros + marca); el acceso a alumnos/módulos sigue **plano** para los 30 (sin jerarquía). Poderes exclusivos de gestión: editar marca del team + gestión de miembros (ver §A.bis3 y §C).

### A.bis3 — Gestión de miembros (self-service del owner + co-gestores)

Espejo **simplificado** de la gestión enterprise ya existente (`app/org/[slug]/coaches/page.tsx`, `app/org/[slug]/_actions/org.actions.ts`, `services/org/org.service.ts`). El owner/co-gestor lo hace **solo**, sin depender del CEO. Capacidades (con guard server-side `is_team_manager(team_id)`):
- **Ver lista** de coaches del team (nombre, `display_role`, estado, nº de alumnos).
- **Invitar/crear coach** → cuenta + **link set-password** (reusa `createEnterpriseCoachAction`/`inviteCoachAction`). Idempotente. **Guard de cupos:** si miembros activos ≥ `teams.seat_limit` → bloquear con mensaje "contacta al CEO para ampliar cupos". El owner NO puede subir el límite (solo el CEO). Mostrar "X de N cupos usados" en la sección Equipo.
- **Desactivar/sacar coach** → soft-delete (`status='revoked'`, `deleted_at`); si era dueño de algún alumno, **reasignar dentro del pool** (no borrar data); guard "no sacar al owner sin transferir" (espejo del guard enterprise F6).
- **Editar `display_role`/nombre** de un miembro.
- **Reset password** de un miembro.
- **Designar/quitar co-gestor** (`can_manage`) — solo el owner.
- **Transferir owner** a otro miembro (NUEVO — enterprise no lo tiene; agregarlo).
- Todo a `team_audit_logs` (actor, acción, metadata).
- **El CEO (`/admin` Teams) puede hacer todo lo anterior también** (superset).
- Roles de gestión NO van en RLS de datos (data plana); el gating de gestión es server-side (`is_team_manager`).
- **Migración 300 alumnos:** reusar import wizard existente con `team_id` (+ pipeline anti-injection `lib/import/csv-injection`). Default: arrancar limpio (históricos PDF adjunto opcional v2). Checklist de Customer Success para la sesión de carga. **Pedir a Ani el export actual (bloqueante).**

### A — Ciclo de vida del miembro + borrado

- Suspender/revocar (`status`); reasignar `owner_coach_id`; datos creados quedan en el team; `last_edited_by` congela nombre histórico; prohibir revocar al último miembro/owner sin transferir.
- Borrado de alumno = **soft-delete (`deleted_at`)**, restringido a owner/admin o con confirmación + registro en `team_audit_logs`. **Full-access ≠ full-destroy.**

## B. Toggles de módulos (entitlements) — resolución por contexto

- `coaches.enabled_modules jsonb default '{}'` + `teams.enabled_modules jsonb`. **El pool MANDA:** contexto = recurso (alumno de pool) → resuelve por `teams.enabled_modules`; dashboard propio del coach → `coaches.enabled_modules`. Los módulos del team NO se derraman a clientes standalone del coach. Multi-pool: elegir el team del contexto, no unión.
- Claves: `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`. Catálogo como **constante TS única en `packages/`** validada con Zod. Default OFF.
- `services/entitlements.service.ts`: `hasModule(ctx, key)` + wrapper `assertModule(ctx, key)`. **Gate server-side recibe el recurso y deriva el team; NUNCA confía en `enabled_modules` del body/props.**
- **Gating doble:** cliente (sidebar/botones deshabilitados-visibles con tooltip, no ocultos) **y** servidor. **No** en RLS.
- El contexto team **exime de gates de tier** (`canImportClients`, `max_clients`) — análogo a `orgId`.

## C. Menú Settings / Opciones (reorganizar el `/coach/settings` existente)

`/coach/settings` YA existe (branding "Mi Marca": `BrandSettingsForm`, `LogoUploadForm`, `DangerZone`, `BrandSettingsTour`, `StudentDashboardPreview`). **Reestructurar, no crear:**
- **DOS marcas distintas (importante):** (1) **Marca del TEAM (Movida)** = lo que ve el alumno en `/t/[team_slug]` (`teams.logo_url`/`primary_color`) — identidad **compartida** del pool. (2) **Marca personal del coach** (`coaches.*`) = solo aplica a sus clientes **standalone** propios; el alumno de Movida NO la ve.
- **Quién edita la marca del team (decisión recomendada — confirmar):** solo el **owner/admin del team** (única excepción al modelo plano, porque es identidad compartida → evita que 30 personas pisen el logo de Movida). Cada coach edita libremente su marca personal. Alternativa pura-plana: cualquiera la edita + `last_edited_by` en `teams`.
- Subrutas `/coach/settings/{marca,modulos,preferencias,cliente}`. `settings/marca` distingue "Marca personal" y (si es owner/co-gestor) "Marca del equipo". Preservar `DangerZone`/tour/preview.
- **NavItem "Equipo"** (`/coach/equipo`) visible **solo a owner/co-gestores** (`is_team_manager`) → la pantalla de gestión de miembros de §A.bis3 (con "X de N cupos usados"). Los demás 29 no lo ven. No es enterprise: misma app de coach, un item extra gateado.
- **Módulos** (toggles de entitlements). **Preferencias** (nombre/`display_role`, idioma, unidades kg/lb). **Opciones del cliente** (qué ve el alumno; gancho de consentimiento).
- **Suscripción/Facturación = link externo a `/coach/subscription`** (NO subruta; **no tocar MercadoPago**). Billing siempre visible (excluido del gating).
- `CoachSidebar.navItems` → items con flag `{module?: ModuleKey}` y render "disabled+tooltip" cuando OFF (feature-discovery), preservando filtrado `org_managed`. Accesibilidad: `aria-current`, foco visible, labels vía `t()`.

## D. Áreas custom del builder (expand-contract sobre `section`)

- Tabla `workout_section_templates`: `id`, `name`, `slug`, `coach_id` (nullable), `team_id` (nullable), `sort_order`, `is_system bool`, `deleted_at`. Seed system idempotente (`ON CONFLICT DO NOTHING` por slug): Calentamiento/Principal/Enfriamiento (mapean a warmup/main/cooldown) + presets (Movilidad, Activación pilar central, Potencia, Acondicionamiento).
- `workout_blocks.section_template_id uuid` (FK nullable). **No** dropear el CHECK `section` ahora. Backfill (`_POST_DEPLOY_` idempotente): setear `section_template_id` desde `section`. Reads prefieren template, fallback a `section`. Auditoría: count `section not null AND section_template_id null` = 0. Fase contract posterior dropea CHECK/columna.
- **UX DnD:** droppable id `area-${dayId}-${areaId}`; DnD de **dos niveles** (bloques dentro/entre áreas + reordenar áreas con handle, persistir `sort_order`); área vacía = droppable visible con placeholder; `DragOverlay` + ring; touch ya cubierto (`TouchSensor`).
- **Eliminar literales de sección** que colapsan a 'main' (bug silencioso en áreas custom): `normSection`/`SECTION_FULL`/`SECTION_SHORT` (`ExerciseBlock`, `DayColumn`) y `WORKOUT_SECTION_TITLE` (`WorkoutExecutionClient`) → lookup contra `section_templates` con fallback a labels system. Archivos: `DayColumn`, `ExerciseBlock`, `lib/workout-block-grouping.ts`, `WorkoutExecutionClient`.
- **Migración visual:** los 3 templates system aparecen como áreas no-borrables por defecto; el coach agrega/renombra/reordena áreas custom sin tocar las system; renombrar system = solo display (slug estable). Ejecución alumno ordena por `sort_order`.

## E. Awareness de concurrencia

- `last_edited_by uuid` en tablas editables clave (workout_plans/blocks, nutrition_plans, check_ins, nuevas). Seteado en **service/action** (NO trigger — `handle_updated_at()` no conoce el actor de negocio), coexiste con el trigger.
- UX: componente reusable `EditedByBadge` (avatar+nombre+"editado hace X") en header builder/ficha; al guardar, si `updated_at` es más nuevo que el cargado → toast no destructivo "X editó esto / Ver cambios / Recargar" (sin perder lo escrito). Opcional Realtime presence (solo display).
- **Undo/historial mínimo (v1):** log append-only (jsonb diff o snapshot) + "ver/revertir último cambio" para entidades críticas (plan entreno, pauta nutri, evaluaciones). Evita pérdida irrecuperable en pool concurrente.

## Archivos clave

`supabase/migrations/*` (teams[+seat_limit,+owner_coach_id], team_members[+can_manage], clients.team_id, client_memberships scope `team`, section_templates, enabled_modules, last_edited_by, client_consents, team_access_logs, team_audit_logs, RLS + helper) · `infrastructure/db/{client,workout}.repository.ts` + nuevo `team.repository.ts` · `services/{entitlements,team,client-detail}.service.ts` · `services/auth/*` (login alumno pool) · `resolve-invite.ts`, `import.actions.ts`, `create-client-internal.ts`, `join.actions.ts` · `app/coach/settings/*` + `app/coach/equipo/*` (gestión de miembros owner/co-gestores — espejo simplificado de `app/org/[slug]/coaches/page.tsx` + `app/org/[slug]/_actions/org.actions.ts` + `services/org/org.service.ts`) + helper `is_team_manager()` + `components/coach/CoachSidebar.tsx` · `app/coach/builder/[clientId]/components/{DayColumn,ExerciseBlock,BlockEditSheet}.tsx` + `types.ts` + `hooks/usePlanBuilder.ts` · `app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` + `lib/workout-block-grouping.ts` · `app/admin/(panel)/teams/*` (CEO panel — crear team, marca, **seat_limit**, provisión de coaches, designar owner, asignar alumnos) · middleware (resolución `/t/[team_slug]`) · `app/api/mobile/coach/checkin-photos/route.ts` + `lib/storage/checkin-photos.ts` · `lib/database.types.ts` (regenerar) · nuevo componente `components/EditedByBadge`.

## Specs SDD a crear

`specs/movida-team/` (incluye identidad alumno + RLS + consentimiento) · `specs/coach-modules-settings/` · `specs/workout-custom-areas/`.

## Orden sugerido

1. SDD specs. 2. Migración `teams`/`team_members`/`clients.team_id` + `client_memberships` scope `team` + RLS por-tabla + helper + `team-isolation` tests **en branch (Pro)** con data sintética + `get_advisors`; merge a prod en verde, borrar branch. 3. Guards de app (§F) + grep `coach_id`. 4. Consentimiento + `team_access_logs`. 5. Identidad/login/branding alumno (`/t/[team_slug]` + middleware). 6. Entitlements + toggles (sin UI). 7. Hub Settings + gating sidebar. 8. Áreas custom (migración + backfill + UI + ejecución). 9. Awareness (`last_edited_by` + `EditedByBadge` + undo mínimo). 10. Provisión Movida + onboarding 300.

## Verification (matriz)

- **RLS:** [miembro activo SELECT/INSERT/UPDATE/DELETE en cliente del pool y TODAS las tablas hijas/nuevas = OK]; [miembro suspended/revoked = 0 filas]; [standalone ajeno = 0 filas]; [standalone pre-existente idéntico antes/después incl. INSERT]; [alumno del pool inserta logs propios = OK, otro team no los ve]; [datos de salud team A invisibles a miembro team B, incl. fotos firmadas]. Tests con **env** (no hardcode local 127.0.0.1).
- **Guards:** par del pool ve/edita ficha de alumno ajeno vía la app (no solo RLS).
- **Consentimiento:** alumno sin consentimiento NO entra al pool; revoca → vuelve standalone; abrir ficha de salud deja `team_access_logs`.
- **Backfill áreas:** bloque con `section` y `section_template_id` NULL renderiza vía fallback; post-backfill count huérfano = 0; idempotente.
- **Fintech no-regresión:** tras reorganizar Settings, `/coach/subscription` carga, webhook MP responde, ninguna ruta MP cambió, billing fuera del gating.
- `pnpm typecheck`/`test`/`build` verdes; `get_advisors` limpio; `database.types.ts` sin drift.

## Definition of Done

Team Movida operativo (N coaches, pool común, full-access real vía RLS **y** guards de app); alumno de pool entra con marca Movida en `/t/[team_slug]` y consentimiento; módulos toggleables (OFF default, pool manda); Settings unificado; builder con áreas custom; awareness + undo mínimo; log de accesos a salud; cero regresión standalone/enterprise.
