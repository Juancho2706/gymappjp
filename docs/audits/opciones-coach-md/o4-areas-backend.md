# 4. Areas del builder y backend de configuracion

> Capitulo orientado a backend. Cubre (a) la zona **Areas del builder** (`/coach/settings/areas`) de punta a punta — datos, persistencia, scoping, gating, soft-delete y que pasa con los ejercicios — y (b) el **resumen consolidado del backend de configuracion** de Settings: las server actions de `settings.actions.ts` y `feature-prefs.actions.ts`, sus validaciones, columnas/tablas que escriben, scoping standalone/team y los gotchas de grants de columna (compra-only / REVOKE+GRANT por columna).

---

## 4.1 AREAS — que son

Las **areas** organizan los dias del builder de entrenamiento (Calentamiento, Principal, Enfriamiento, Movilidad, Core, HYROX, etc.). Cada **dia** agrupa sus ejercicios por area; el orden de las areas dentro del dia se define por `sort_order` (menor = primero).

Persisten en la tabla `workout_section_templates` (no en `coaches`). Cada fila es un area; un bloque de ejercicio (`workout_blocks`) referencia su area por `section_template_id` (FK). El nombre "section template" es legacy interno; en UI se llaman **areas**.

Dos clases de areas:

- **System (`is_system = true`)**: 7 areas seed compartidas por TODOS, solo lectura, `coach_id = NULL` y `team_id = NULL`. UUIDs fijos (seed `20260609062017`):
  - `warmup` Calentamiento (sort 0), `main` Principal (sort 10), `cooldown` Enfriamiento (sort 20) — las 3 **clasicas** que mapean 1:1 al enum legacy `workout_blocks.section`.
  - `mobility` Movilidad (5), `core_activation` Activacion pilar central (6), `power` Potencia (8), `conditioning` Acondicionamiento (30) — system extra.
- **Custom (`is_system = false`)**: las que crea el coach o el team. `coach_id` XOR `team_id` (nunca ambos, nunca ninguno — `CHECK workout_section_templates_ownership_chk`).

El alumno NUNCA gestiona areas; las consume al ejecutar (agrupacion via `executionAreaGroupsFor`, `lib/workout-areas.ts`).

---

## 4.2 Pagina `/coach/settings/areas` — `page.tsx`

RSC. Llama `getAreasContext()` (queries) y aplica 3 redirects de guarda:

1. `if (!coachId) redirect('/login')` — no autenticado.
2. `if (orgManaged) redirect('/coach/dashboard')` — **enterprise/org_managed NO tiene areas propias** (consume solo system; la zona no aplica).
3. `if (!ctx) redirect('/coach/dashboard')` — defensa.

Render funcional:
- Link de retorno context-aware: en team vuelve a `/coach/team` ("Mi Equipo"); en standalone a `/coach/settings` ("Opciones").
- Encabezado con copy distinto por scope:
  - team: `Equipo "<teamName>" — todo el pool arma los dias con estas areas.`
  - standalone: `Organizá los días de entrenamiento con tus propias áreas (Movilidad, Core, HYROX…).`
- Monta `<AreasManager initialAreas={ctx.areas} canEdit={ctx.canEdit} scope={ctx.scope} />`.

`metadata.title = 'Áreas del builder | EVA'`.

---

## 4.3 Datos que llegan — `getAreasContext()` (`_data/areas.queries.ts`)

`React.cache`. Devuelve `{ coachId, orgManaged, ctx: AreasContext | null }` donde:

```
AreasContext = { scope: 'team'|'standalone', teamId, teamName, canEdit: boolean, areas: WorkoutArea[] }
```

Flujo (deriva del **WORKSPACE ACTIVO**, mismo patron que Modulos):

1. `createClient()` (cliente **user-scoped** — RLS `wst_*` es el techo real) + `getCoach()`.
2. Si no hay coach → `{ coachId: null, orgManaged: false, ctx: null }`.
3. `resolvePreferredWorkspace(supabase, coach.id)` resuelve el workspace activo.
4. `orgManaged = coach.subscription_status === 'org_managed' || workspace?.type === 'enterprise_coach'`.
5. **Si `workspace.type === 'coach_team'`** → `Promise.all`:
   - `teams.select('name')` por `teamId` (`maybeSingle`),
   - `isCurrentUserTeamManager(supabase, teamId)` → `canEdit`,
   - `listAvailableWorkoutAreas(supabase, { coachId: null, teamId })`.
   - Devuelve `scope: 'team'`, `teamName` (fallback `'Equipo'`), `canEdit` = es manager.
6. **Standalone** (default) → `listAvailableWorkoutAreas(supabase, { coachId: coach.id, teamId: null })`, `scope: 'standalone'`, `teamId/teamName: null`, **`canEdit: true`** (el coach siempre edita sus propias areas).

`listAvailableWorkoutAreas` → `findAvailableSectionTemplates` (repository), que filtra **vivas** (`deleted_at IS NULL`) y por scope:
- team: `is_system.eq.true OR team_id.eq.<teamId>`
- standalone: `is_system.eq.true OR (coach_id.eq.<coachId> AND team_id.is.null)`
- sin scope (ambos null): solo `is_system = true`.

Columnas SELECT explicitas: `id, name, slug, coach_id, team_id, sort_order, is_system, created_at, deleted_at`. Orden: `sort_order ASC, name ASC`. Estos filtros son **defensa en profundidad** sobre la RLS `wst_select` (que ya restringe lo mismo).

`toDomain` mapea a `WorkoutArea` (`{ id, name, slug, sort_order, is_system, coach_id, team_id }`).

---

## 4.4 Frontend funcional — `AreasManager.tsx`

`'use client'`. Estado local optimista (`useState` sobre `initialAreas`) + `useTransition`. No usa `useActionState`; cada accion es un `startTransition(async ...)` que invoca la server action y aplica el resultado al estado local + `toast` (sonner). VM visual via `buildAreaVMs` (badge/short-label por area, `area-ui.ts`).

Que muestra y que dispara:
- **Lista** ordenada por `sort_order` luego nombre. Cada item: badge corto (3 letras), nombre, "Orden N", y si `is_system` → "Área del sistema (solo lectura)".
- **Crear** (`canEdit`): input nombre (maxLength 40, minimo 2 para habilitar boton; Enter dispara con misma guarda) → `createAreaAction({ name })`. Exito → push al estado + toast `Área "<name>" creada`.
- **Editar inline** (custom, `canEdit && !is_system`): inputs nombre + orden (numerico) → `updateAreaAction`. Solo manda los campos que cambiaron; si nada cambio cierra sin llamar.
- **Eliminar** (custom): patron confirmar-en-dos-pasos (boton "Confirmar") → `deleteAreaAction({ id })`. Exito → quita del estado + toast `Área "<name>" eliminada. Sus ejercicios vuelven al área Principal.`
- **Banner sin permiso** (`!canEdit`):
  - team: "Solo el owner o co-gestor del equipo gestiona las áreas del pool. Puedes usarlas en el builder."
  - standalone: "No tienes permiso para editar las áreas." (en la practica standalone siempre tiene `canEdit: true`).
- Las **areas system nunca muestran controles** de editar/borrar (`!area.is_system`).
- Texto guia al pie: orden menor = primero; al eliminar, los ejercicios no se pierden, vuelven a verse bajo Principal.

---

## 4.5 CRUD — server actions (`_actions/areas.actions.ts`)

`AreaActionState = { error?, area?: WorkoutArea, success? }`.

**Guarda comun `resolveEditableAreaScope()`** (patron Modulos), corre en CADA action antes de escribir:
1. `getCoach()`; sin coach → error "No autenticado.".
2. Si `coach.subscription_status === 'org_managed'` → error "No disponible en cuentas gestionadas por una organización.".
3. `resolvePreferredWorkspace`; si `enterprise_coach` → mismo error org-managed.
4. Si `coach_team` → `isCurrentUserTeamManager(teamId)`; si **no** es manager → error "Solo el owner o co-gestor del equipo puede gestionar las áreas." Si lo es → `scope = { coachId: null, teamId }`.
5. Default standalone → `scope = { coachId: coach.id, teamId: null }`.

Devuelve `{ ok, db, scope: AreaScope }`. **El cliente `db` es user-scoped** (no service-role): la RLS `wst_*` es el techo real; la guarda de app es defensa en profundidad (doble candado team-manager: app + RLS `is_team_manager`).

### `createAreaAction(input)`
- Valida `WorkoutAreaCreateSchema` (`@eva/schemas`): `{ name: string trim, min 2 "El nombre necesita al menos 2 caracteres", max 40 "Máximo 40 caracteres" }`.
- `resolveEditableAreaScope` → `createWorkoutArea(db, scope, { name })`.
- En el service:
  - relee existentes (mismo scope) para calcular `sort_order`,
  - `slug = slugifyAreaName(name)` (NFD sin diacriticos, kebab-case `[a-z0-9-]`, max 50; si queda vacio — cirilico/emoji — sufijo deterministico `area-<hash>` para no colisionar todos en `area`),
  - `sort_order = nextCustomSortOrder(existing)` = `max(100, maxExisting + 10)` (piso 100 → las custom quedan detras de las 7 system, max seed 30),
  - `coach_id = teamId ? null : coachId`, `team_id = teamId`,
  - guarda en `workout_blocks`? no: `insertSectionTemplate` con `is_system = false`.
- `revalidatePath('/coach/settings/areas')`. Devuelve `{ area, success }`.

### `updateAreaAction(input)`
- Valida `WorkoutAreaUpdateSchema`: `{ id: z.guid(), name?: min2/max40, sort_order?: int 0..9999 }`.
- `updateWorkoutArea(db, id, { name?, sort_order? })`. Si nada que actualizar → error.
- **Renombrar REGENERA el slug** (`patch.slug = slugifyAreaName(name)`): seguro porque los bloques referencian por `id`, no por slug. Si no se regenerara, el slug viejo bloquearia ese nombre para siempre y permitiria duplicados via rename.
- Repository `updateSectionTemplate` filtra `eq('is_system', false).is('deleted_at', null)` (defensa extra ante RLS — no se tocan system ni borradas).

### `deleteAreaAction(input)`
- Valida `WorkoutAreaDeleteSchema`: `{ id: z.guid() }`.
- `deleteWorkoutArea(db, id)` → **SOFT-DELETE** (`softDeleteSectionTemplate`): `UPDATE ... SET deleted_at = now() WHERE id = ? AND is_system = false AND deleted_at IS NULL`. No es DELETE fisico.

Las 3 actions revalidan `/coach/settings/areas`.

---

## 4.6 Que pasa con los ejercicios al borrar un area

**No se pierden.** El soft-delete solo marca `deleted_at`; la FK `workout_blocks.section_template_id → workout_section_templates(id)` es **`ON DELETE SET NULL`** (no cascade), y al ser soft-delete el `id` sigue existiendo en la fila — la FK queda **intacta**.

Cuando el builder/ejecucion arma los grupos:
- `findAvailableSectionTemplates` filtra `deleted_at IS NULL` → el area borrada **ya no aparece** en la lista de areas visibles.
- `effectiveAreaKey(block, knownAreaIds)` (lib): si el `section_template_id` del bloque **no esta** en las areas conocidas (porque fue soft-deleted o es de otro contexto), cae al **bucket legacy** = el area system del `section` legacy del bloque. Para un bloque normal eso es `main` → **Principal**.
- De ahi el toast: "Sus ejercicios vuelven al área Principal."

Invariante: **un bloque NUNCA queda sin grupo visible**. La columna legacy `workout_blocks.section` (CHECK `warmup/main/cooldown`) sigue viva como bucket de compatibilidad (expand-contract, fase CONTRACT no aplicada).

---

## 4.7 Permisos y seguridad de areas

| Contexto | `canEdit` | Quien crea/edita/borra |
|---|---|---|
| standalone | `true` siempre | el propio coach (sus areas, `coach_id = uid`) |
| team | `isCurrentUserTeamManager` | solo **owner / co-gestor** (manager); miembro del pool = read-only, usa las areas en el builder |
| org_managed / enterprise_coach | N/A | la pagina redirige; sin areas propias (solo system) |

Capas de enforcement (todas activas a la vez):
1. **UI**: oculta controles si `!canEdit` o `is_system`.
2. **App guard** (`resolveEditableAreaScope`): re-chequea org-managed + team-manager server-side.
3. **RLS `wst_*`** (techo real, cliente user-scoped):
   - `wst_select`: vivas Y (`is_system` OR coach propio OR `is_team_member(team_id)`).
   - `wst_insert`: `is_system=false` Y (coach propio con `team_id NULL` OR `is_team_manager(team_id)` con `coach_id NULL`).
   - `wst_update`/`wst_delete`: `is_system=false` Y (coach propio OR `is_team_manager`).
   - `wst_service`: `ALL` para service_role.
4. **CHECK `ownership_chk`**: system⇒ambos NULL; custom⇒coach XOR team.
5. **UNIQUE parciales** por scope sobre filas vivas (`*_slug_uidx`): system/coach/team. Colision → `friendlyAreaError` traduce a "Ya existe un área con ese nombre en este contexto." (la unicidad de slug es reusable tras soft-delete porque el indice es parcial sobre `deleted_at IS NULL`).
6. **Grants de tabla** (seed): `REVOKE ALL FROM anon, authenticated` + `GRANT SELECT,INSERT,UPDATE,DELETE TO authenticated` + `GRANT ALL TO service_role`. **anon sin nada.** (Gotcha: el default-priv daria ALL incluido TRUNCATE → se revoca todo y se re-otorga el minimo.)

`friendlyAreaError` tambien traduce `row-level security` → "No tienes permiso para gestionar esta área."

---

## 4.8 RESUMEN BACKEND DE CONFIGURACION — server actions de Settings

Consolida `settings.actions.ts` y `feature-prefs.actions.ts` (lo no detallado en capitulos 2/3). Para cada action: que recibe, valida, que escribe y como, scoping, y los gotchas de grants.

### 4.8.1 `updateBrandSettingsAction(prev, formData)` — `settings.actions.ts`

Guarda identidad + marca del coach. `useActionState` (recibe `FormData`).

**Recibe** (campos del form): `full_name`, `brand_name`, `primary_color`, `use_brand_colors_coach`, `welcome_message`, `loader_text`, `use_custom_loader`, `loader_text_color`, `loader_icon_mode` (`eva|coach|none`), y white-label v2: `brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `brand_font_key`, `loader_variant`, `welcome_modal_enabled`, `welcome_modal_content`, `welcome_modal_type` (`text|video`).

**Valida** `BrandSettingsSchema` (`@eva/schemas/coach`):
- `full_name`/`brand_name` min2/max100; colores hex `#RRGGBB`; `welcome_message` max240; `loader_text` max10; `welcome_modal_content` max1000.
- `brand_font_key`: **enum cerrado** (`FONT_KEY_TUPLE`) — NUNCA string libre (unica defensa anti CSS-injection en fuente).
- `loader_variant`/`loader_icon_mode`/`welcome_modal_type`: enums.
- `superRefine`: si modal video con content → debe ser URL valida YouTube/Vimeo.
- Falla → `{ fieldErrors }`.

**Autorizacion**: `supabase.auth.getUser()`; sin user → "No autenticado.". `slug` e `invite_code` son **INMUTABLES** (set-once en registro) — no se editan aca.

**Escribe** (UPDATE `coaches` por `id = user.id`, cliente **user-scoped**, policy `coaches_update_own`):
- **Siempre** (identidad/comunicacion, NO gateadas): `full_name`, `brand_name`, `welcome_message`, `welcome_modal_enabled`, `welcome_modal_content`, `welcome_modal_type`, `welcome_modal_version`, `welcome_modal_updated_at`, `updated_at`.
  - **Versionado del welcome-modal**: relee `welcome_modal_version`; si cambio `enabled|content|type` incrementa `+1` y setea `welcome_modal_updated_at`.
- **Solo si branding permitido** (Pro+): `primary_color`, `use_brand_colors_coach`, `loader_text`, `use_custom_loader`, `loader_text_color`, `loader_icon_mode`, y white-label v2 `brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `brand_font_key`, `loader_variant`.

**Gate de branding** (decision CEO 2026-06-21): relee `subscription_tier` y `tier ⇒ isBrandingAllowed(tier)` (`@eva/tiers`). El branding VISUAL es **Pro+ entero**. El page redirige y el render del alumno cae a EVA, pero **este action es POSTeable directo → es el enforcement server-side real**. Identidad (`full_name`/`brand_name`) y comunicacion (`welcome_*`) NO se gatean: el alumno ve el nombre/mensaje del coach aunque el chrome sea EVA.

`revalidatePath('/coach/settings')`. `{ success: true }`.

### 4.8.2 `updateLogoAction(prev, formData)` — `settings.actions.ts`

Sube el logo claro a Storage.
- Valida: archivo presente, ≤ 2 MB, `image/*`, y **magic bytes** JPEG (`FF D8`) o PNG (`89 50 4E 47`) — defensa contra extension falsa.
- `getUser`; sin user → error.
- **Gate branding Pro+**: relee `subscription_tier`; `!isBrandingAllowed` → "El branding personalizado está disponible desde el plan Pro." (boton oculto en UI, pero POSTeable).
- Sube a bucket `logos` path `<user.id>/logo.<ext>` (`upsert: true`).
- `getPublicUrl` + **cache-buster** `?t=<Date.now()>`.
- UPDATE `coaches.logo_url` por `id = user.id`.
- Revalida `/coach/settings` (page), `/coach/dashboard` (layout), `/` (layout).

### 4.8.3 `deleteCoachAccountAction(confirmText)` — `settings.actions.ts`

Right-to-erasure (Ley 21.719). Requiere `confirmText === 'ELIMINAR'`.
- `getUser`; usa **`createServiceRoleClient()`** (`adminDb`) para el cleanup (bypass RLS real, sin cookies).
- Pasos: (1) lee `subscription_mp_id/status/tier`; (2) **cancela MP preapproval** best-effort si `active` y tier≠free; (3) **anonimiza PII de clients** (`full_name='[Eliminado]'`, `email=eliminado-<coachId>@anonymized.eva`, `phone=null`) preservando estructura de workout como IP del coach; (4) **borra health data**: `workout_logs`, `nutrition_meal_logs` (via `daily_nutrition_logs` del cliente), `check_ins`; (5) borra logo de Storage best-effort; (6) `auth.admin.deleteUser(coachId)` → **CASCADE** borra la fila `coaches` via FK.
- Exito → `redirect('/login?deleted=true')`. Fallo de auth-delete → error con `privacidad@eva-app.cl`.

### 4.8.4 Feature-prefs — `feature-prefs.actions.ts`

Capa **ENABLED** del modelo `visible = ENTITLED(billing) AND ENABLED(pref)`. Estas actions escriben SOLO la preferencia; **la preferencia solo achica, nunca widen-ea un entitlement**. El gate de dinero vive en el resolver server-side, NO aca.

**Invariantes load-bearing**:
- Un toggle escribe SOLO `*_feature_prefs.sections`/`preset`. **NUNCA toca `coaches.enabled_modules` ni `teams.enabled_modules`** (compra-only; los pisaria el trigger D1 y/o regalaria features pagas).
- Un toggle NUNCA borra/anula filas `nutrition_*` (CASCADE meal-logs = data-loss). Apagar = **ocultar**.

**Validacion Zod v4**: `sections` es `z.record(z.string(), z.boolean())` PARCIAL (el panel manda solo las keys que toca + `_enabled`), con `.refine` que rechaza keys fuera del allowlist `ALLOWED_SECTION_KEYS` (= `DOMAIN_ENABLED_KEY` + todas las section keys de `FEATURE_DOMAINS`). Gotcha: `z.record(z.enum(...))` seria EXHAUSTIVO (exige todas las keys) → se usa `z.string()` + refine. `preset ∈ {basico,intermedio,profesional}` (la migracion dropeo el CHECK → la app valida). `domain` string trim min1.

Tres actions (todas: `getClaims().sub` para el actor, NUNCA del body — anti-IDOR; cliente user-scoped, RLS authoritative; upsert idempotente):

| Action | Tabla / PK | onConflict | Scoping (gate real = RLS) | Revalida |
|---|---|---|---|---|
| `setCoachFeaturePrefs({domain,preset,sections})` | `coach_feature_prefs` (`coach_id,domain`) | `coach_id,domain` | `coach_id = getClaims().sub`; RLS `coach_feature_prefs_owner_all` | `/coach/settings` + `/coach/dashboard`(layout) |
| `setTeamFeaturePrefs({teamId,domain,preset,sections})` | `team_feature_prefs` (`team_id,domain`) | `team_id,domain` | RLS managers via `current_user_managed_team_ids` (un coach comun del pool NO pasa) | `/coach/settings` + `/coach/team` + dashboard(layout) |
| `setClientFeaturePrefs({clientId,domain,sections})` | `client_feature_prefs` (`client_id,domain`) | `client_id,domain` | RLS coach owner / managers de pool; **sin columna `preset`** (solo override de secciones, most-specific-wins) | `/coach/settings` + `/coach/clients/[clientId]`(page) + dashboard(layout) |

`teamId`/`clientId` validan `z.string().uuid()`. Error de upsert → `{ error: error.message }`.

---

## 4.9 GOTCHAS de grants de columna (compra-only) e invariantes de seguridad

Patron column-level grants (plan estrategia 03; migraciones `20260612140000_modules_compra_only_grants.sql` + `20260612140001_clients_scoping_grants.sql`):

- `coaches`, `teams`, `clients` tienen **GRANT de columna** para `authenticated`: `REVOKE UPDATE ON tabla FROM authenticated` + `GRANT UPDATE (allowlist) ON tabla TO authenticated`.
- **Toda columna nueva editable user-scoped EXIGE `GRANT UPDATE(col)` en la MISMA migracion que la crea.** Sin el grant, PostgREST devuelve **`42501`** recien en runtime (afecta tambien `apps/mobile` y `apps/enterprise`, que hablan PostgREST directo). Gotcha PG: `REVOKE UPDATE(col)` es no-op si el grant era de tabla; el patron correcto es REVOKE de tabla + GRANT por columnas.
  - Incidente real (memoria): white-label v2 migro 7 cols nuevas a `coaches` + 2 a `teams` SIN grant → el PATCH ENTERO de "Guardar marca" fallaba con `permission denied for table coaches` (fix `20260621220000`). Por eso `updateBrandSettingsAction` solo funciona porque esas cols branding ya tienen su `GRANT UPDATE`.
- **`coaches.enabled_modules`** (y `subscription_*`, `max_clients`, columnas de billing) es **compra-only**: escritura SOLO service-role. El standalone se sincroniza via **trigger D1 desde `coach_addons`** (override CEO = write-through `admin_grant`; el webhook materializa pagos). **Nadie escribe el jsonb directo.** Por eso las feature-prefs (4.8.4) JAMAS tocan `enabled_modules` — lo pisaria el trigger.
- **`teams.enabled_modules`/`seat_limit`**: toggle directo del CEO en `/admin/teams`; `seat_limit` ademas protegido por trigger `teams_guard_owner_fields` (ni el owner lo cambia).
- **Scoping de `clients`** (`org_id`/`team_id`/`coach_id`): service-role-only (ningun `authenticated` mueve un alumno de scope por PATCH).
- **`coaches.invite_code`** y `slug`: set-once a nivel DB (en branding NO se editan — confirmado en `updateBrandSettingsAction`).

**Invariantes de seguridad transversales del capitulo**:
1. El actor (`coachId`/`uid`) SIEMPRE viene de la sesion (`getClaims().sub` / `getUser`), **nunca del body** (anti-IDOR, CLAUDE.md).
2. Clientes user-scoped en todo Settings → **la RLS es el techo**; las guardas de app son defensa en profundidad (areas: doble candado app + `is_team_manager`).
3. Gates de dinero (branding Pro+, modulos) se re-chequean **server-side** aunque la UI los oculte (actions POSTeables).
4. Borrados que tocan historial son **soft** (areas) o preservan data (feature-prefs = ocultar, no borrar) para no disparar CASCADE de logs.
5. `service_role` solo en operaciones que deben bypassear RLS por diseno (delete account, no en el CRUD de areas ni en feature-prefs).
