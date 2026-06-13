# 03 · PLAN — Módulos compra-only (hardening RLS + catálogo read-only + override CEO + nav)

> Ejecuta la **Parte II** (incluido el modelo de activación §2.3) de la decisión de socios
> [Teams-first 2026-06-11](2026-06-11-teams-first-modulos-addons.md). Las decisiones de ese doc
> NO se re-litigan acá; este plan las implementa. Volver al [Director de estrategia](00-DIRECTOR.md).
>
> **Set de planes:** [01 archivado enterprise](01-PLAN-archivado-enterprise.md) ·
> [02 landing Teams](02-PLAN-landing-teams-ui.md) · **03 (este)** ·
> [04 consolidación de planes](04-PLAN-consolidacion-planes-ciclos.md) ·
> [05 billing add-ons self-service](05-PLAN-billing-addons-selfservice.md).
> Memorias aplicables: `project-teams-first-strategy`, `project-plan1-gate-pending`, `project-movida-commercial`.

## Objetivo

Los 4 módulos (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`) dejan de ser
self-toggle gratis y pasan a **compra-only**: (1) cerrar el hueco RLS por el que cualquier coach se
auto-activa módulos (y tier) vía PATCH directo a PostgREST — y el hueco hermano por el que puede mover
alumnos de scope en `clients` (mejora aprobada 2026-06-11); (2) Settings > Módulos se convierte en
**catálogo read-only con explicaciones ricas** (qué hace + dónde viven sus utilidades + CTA por contexto);
(3) el panel admin de coaches gana el bloque "Módulos habilitados" (**override del CEO** — única palanca
standalone hasta que exista el [plan 05](05-PLAN-billing-addons-selfservice.md)); (4) el nav agrupa los
módulos comprados bajo un divisor "MÓDULOS". Todo aditivo, compatible con el protocolo de branch efímero
del Director Movida §3.

## Contexto vivo (no chocar)

- **El GATE consolidado de Movida (7 migraciones `20260611*` + suites) sigue PENDIENTE y es prioridad 1**
  (memoria `project-plan1-gate-pending`). Este plan no lo bloquea ni lo retrasa: sus dos migraciones
  (la principal F2.1 + la hermana de clients F2.1b) son aditivas/idempotentes y van por default en un
  branch efímero propio POSTERIOR al gate (al del gate solo si F1 ya está desplegada en prod —
  condición dura en F2.1 y Orden #4).
- La tanda 1 pre-gate está en working tree sin commitear — las tandas de este plan se commitean aparte,
  sin pisar ese trabajo.
- **Movida exenta:** reunión el 12-jun; su contrato es custom (memoria `project-movida-commercial`).
  El catálogo de este plan **no publica precios** — solo estados (Activo/Disponible) y CTAs
  conversacionales. Los precios de lista llegan recién con el plan 05, post-cierre.
- **Decisiones del dueño (2026-06-11) integradas en este plan — RESUELTAS, no se re-litigan:**
  - Drop de `coaches_insert_own`/`coaches_delete_own`: **RATIFICADO** (ya estaba en F2.1).
  - CTA standalone interino mailto: **RATIFICADO** (D4), ahora con telemetría de intención por click
    incluyendo `module_key` (F1.2).
  - Persona e2e dedicada con módulos ON: **RATIFICADA** como 9na cuenta permanente con listas
    esperadas propias (D7/F4).
  - Bloque admin de módulos: **override universal visible** — aparece para TODO coach (D5/F1.3).
  - Precio de lista de módulos (D3 dueño): **$9.990/mes uniforme por módulo** — se publica recién
    cuando el plan 05 muestre precios; team va por contrato (referencia interna ~$29.990
    flat/team/módulo, JAMÁS pública). Este catálogo sigue sin precios pre-cierre.
  - IVA (D5 dueño): **silencio total** en cualquier copy de precios hasta constituir EVAapp SpA
    (en proceso, jun-2026). Este plan no publica precios, así que no hay copy que tocar acá; la tarea
    de revisión del copy al constituirse queda referenciada en F5 para el plan 05.
- **Restricción global del dueño:** cero servicios pagos NUEVOS — telemetría y checks con el stack ya
  contratado (PostHog, Supabase, Vercel, Resend, Upstash).

## El hueco (evidencia auditada)

1. **`coaches_update_own`** (`supabase/migrations/00000000000001_baseline.sql:2992`) permite UPDATE de la
   **fila completa** (`USING/WITH CHECK id = auth.uid()`): un coach hace
   `PATCH /rest/v1/coaches?id=eq.<su_id>` con `{"enabled_modules": {...}}` y se activa los 4 módulos
   gratis. Mismas condiciones para `subscription_tier`, `subscription_status`, `max_clients`. Existe
   además la policy legacy **duplicada** `"Coach can update their own profile"` (baseline.sql:2576).
2. **`coaches_insert_own`** (baseline.sql:2944) — hallazgo adicional de esta auditoría: TODOS los INSERT
   legítimos de `coaches` son service-role (`register.actions.ts:118+180`, `onboarding/complete/_actions/complete.actions.ts:96`,
   `api/mobile/auth/register-coach-free/route.ts:132`, admin/org/teams). La policy permite que cualquier
   usuario `authenticated` (¡incluso una cuenta de alumno!) inserte su propia fila `coaches` con
   `subscription_tier='elite'` + módulos ON. Misma clase de hueco; se cierra en la misma migración.
3. **`team_teams_manager_update`** (`20260609170000_team_rls_optimized_phase2_governance.sql:36-39`)
   permite al owner/co-gestor UPDATE de fila completa en `teams`. El trigger existente
   `teams_guard_owner_fields` (`20260609050855_team_foundation.sql:116-129`) solo bloquea
   `owner_coach_id`/`seat_limit` a NO-owners: el **owner** puede subirse el `seat_limit` él mismo, y
   **cualquier gestor** puede setear `teams.enabled_modules` por API, saltándose al CEO.
4. La UI actual escribe con cliente **user-scoped**: `saveModulesAction`
   (`app/coach/settings/modules/_actions/modules.actions.ts:21,35,41`) — tras el hardening deja de
   funcionar, por eso la secuencia código→migración es obligatoria (ver Orden).
5. **Scoping de `clients` abierto** (mejora aprobada por el dueño 2026-06-11):
   `clients_standalone_coach_manage` (`20260525180500_workspace_rls_sensitive_tables.sql:79-84`) hace
   WITH CHECK de `org_id`/`coach_id` pero NO ata `team_id`; `team_clients_member_all`
   (`20260609160000_team_rls_optimized.sql:103-105`) solo ata `team_id` — `coach_id`/`org_id` quedan
   libres. Un coach puede mover alumnos de scope vía `PATCH /rest/v1/clients` (colarse un `team_id`,
   pisarle `coach_id` a un par del pool). Se cierra con grants de columna en la migración hermana
   F2.1b, mismo branch efímero.

## Decisiones técnicas (juzgadas)

### D1 — Mecanismo de cierre: **REVOKE table-level + GRANT column-allowlist** (no trigger guard)

Se evaluaron las dos opciones del doc fuente §2.2:

| Criterio | Column grants (elegida) | Trigger guard (estilo `coaches_org_managed_guard`, `20260608190000`) |
|---|---|---|
| Capa | Privilegios, se evalúa ANTES de RLS — inmune a drift de policies (la duplicada de baseline:2576 es exactamente ese drift) | Después de RLS, plpgsql por fila en tabla caliente |
| Postura | **Default-deny**: una columna futura (ej. estado de `coach_addons` del plan 05) nace protegida | Denylist: columna nueva queda expuesta hasta que alguien la agregue al trigger |
| service_role | Intacto (grants por rol separados); SECURITY DEFINER (`transfer_team_ownership`, `20260609220000:44-66`) corre como owner → no se rompe | Necesita exención `auth.role()='service_role'` bien hecha; un bug ahí bloquea el **webhook MP** (riesgo fintech) |
| PostgREST | Respeta grants de columna nativo → `42501` claro | Error custom más amable (irrelevante: el catálogo read-only elimina la UI que escribía) |
| Costo | Mantener el allowlist (mitigado: auditoría de call sites abajo + suite SQL allow/deny + regla documentada en el .sql) | Cero mantenimiento de allowlist |

**Gotcha de PostgreSQL que define la implementación:** `REVOKE UPDATE(col)` solo es efectivo si el grant
era de columna; con grant a nivel de tabla (el default de Supabase) es un **no-op**. El patrón correcto es
`REVOKE UPDATE ON tabla FROM authenticated` + `GRANT UPDATE (col1, col2, …) ON tabla TO authenticated`.
Los triggers existentes (`teams_guard_owner_fields`, `coaches_org_managed_guard`) **se conservan**
como defensa en profundidad. **Excepción aprobada por el dueño (2026-06-11):** `teams_guard_owner_fields`
(`20260609050855_team_foundation.sql:116-129`) se endurece con un `CREATE OR REPLACE` mínimo (~3 líneas,
F2.1) para que NI el owner pueda cambiar `seat_limit` — segunda capa por si un GRANT futuro re-expone la
columna. La rama de `owner_coach_id` NO se toca (`transfer_team_ownership` SECURITY DEFINER sigue
funcionando — caso 5 de la suite SQL lo verifica). `coaches_org_managed_guard` queda intacto.

### D2 — Allowlist derivada de auditoría real de call sites user-scoped (verificada 2026-06-11)

Escritores user-scoped legítimos que DEBEN seguir funcionando:

- **`coaches`** — `app/coach/settings/_actions/settings.actions.ts:64` (branding: `full_name`,
  `brand_name`, `primary_color`, `use_brand_colors_coach`, `welcome_message`, `loader_text`,
  `use_custom_loader`, `loader_text_color`, `loader_icon_mode`, `welcome_modal_enabled`,
  `welcome_modal_content`, `welcome_modal_type`, `welcome_modal_version`, `welcome_modal_updated_at`,
  `updated_at`) y `:130` (`logo_url`); `app/coach/_data/public-code.queries.ts:33` (`invite_code` —
  backfill set-once de legacy, + `onboarding_guide`); `app/coach/_actions/public-code.actions.ts:36` y
  `app/coach/dashboard/_actions/onboarding-guide.actions.ts:61,102` (`onboarding_guide`, `updated_at`).
  `slug` queda FUERA (inmutable, `settings.actions.ts:44`).
- **`teams`** — `app/coach/team/_actions/team.actions.ts:423` (`updateTeamBrandAction`: `name`,
  `primary_color`, `accent_light`, `accent_dark`, `splash_bg_color`, `loader_text`, `loader_text_color`,
  `loader_icon_mode`, `use_custom_loader`, `neutral_tint`, `logo_url`, `logo_url_dark` — sin
  `updated_at`: teams NO tiene esa columna).
- **MOBILE (PostgREST directo con el JWT del coach — los grants lo afectan igual que a la web):**
  `apps/mobile/lib/coach-brand.ts:133-150` (update de marca: mismas columnas de branding de la web +
  `updated_at`) y `:182` (`logo_url` tras subir logo). Todas cubiertas por el allowlist de `coaches`.
  La auditoría y el grep DoD deben incluir SIEMPRE `apps/mobile` — la app móvil no pasa por server
  actions y un escritor móvil fuera del allowlist fallaría con 42501 recién en runtime.
- **`clients` (migración hermana F2.1b — mejora aprobada 2026-06-11):** el allowlist de UPDATE es
  "todas las columnas actuales MENOS `id`/`org_id`/`team_id`/`coach_id`" — la lista exacta se deriva del
  schema vivo al implementar (clients tiene muchas columnas; congelarla acá driftearía). Escritores
  user-scoped de columnas NO-scoping que siguen funcionando solos con ese diseño (auditados 2026-06-11):
  `apps/mobile/lib/alumno-onboarding.ts:59` (`onboarding_completed`, `age_confirmed_at`),
  `apps/mobile/lib/coach-client-detail.ts:806,844` (perfil + `is_archived`),
  `apps/mobile/app/change-password.tsx:33` (`force_password_change`),
  `services/client/client.service.ts:102` (`goal_weight_kg`),
  `infrastructure/db/cardio-profile.repository.ts:70` (perfil cardio).
  **Escritores user-scoped de `coach_id` detectados — refactor a service-role OBLIGATORIO ANTES de la
  migración hermana (patrón F1.1):** `apps/enterprise/lib/org-admin.ts:172-173` (reasignación de alumno
  por org admin) y verificar el cliente usado en `app/org/[slug]/_actions/org.actions.ts:603-606`
  (`coach_id = null` al desasignar — si es user-scoped, mismo refactor). INSERT/DELETE de `clients` NO
  cambian: el RLS ya los scopea y el INSERT necesita escribir `coach_id`/`org_id`/`team_id` (los ata el
  WITH CHECK).
- **EXCEPCIÓN CRÍTICA (fintech):** `app/api/payments/create-preference/route.ts:134-137` actualiza
  `subscription_tier/subscription_status/billing_cycle/max_clients/payment_provider/subscription_mp_id/superseded_mp_preapproval_id`
  con cliente **user-scoped** (`createClient` en `:24`) — es el ÚNICO escritor user-scoped de columnas de
  billing (webhook `:229`, confirm `:121`, cancel `:71`, activate-free `:91`, trial-expiry y
  `auth/confirm/route.ts:42` ya son service-role). **Se refactoriza a service-role en F1, ANTES de la
  migración** — si la migración llegara primero, el checkout standalone se rompe.

### D3 — Catálogo: extender `ModulesForm`, copy como constante TS pura

El componente (`app/coach/settings/modules/_components/ModulesForm.tsx:11-16,45-52`) ya tiene
labels/descripciones cortas y el estado read-only construido (banner + switches disabled). Se **extiende,
no se recrea**: el copy rico (qué hace + dónde vive) se saca a una constante pura unit-testeable sin
render — mismo patrón que `getVisibleNavItems` (función pura, `coach-nav.ts:89`). Juicio: separar data
de presentación permite testear cobertura exacta de `MODULE_KEYS` con vitest sin montar el client component.

**Ubicación (mejora aprobada 2026-06-11): `packages/module-catalog/`** — paquete puro nuevo (sin deps de
Next/Supabase, patrón `packages/calc`) en vez de `_components/`: la app RN futura reusa el MISMO copy
(anti-drift; ver nota al roadmap mobile en F5). **Estrategia i18n del paquete:** copy base en español
latam neutro indexado por `ModuleKey` (`Record<ModuleKey, { label, pitch, surfaces }>`); traducciones
futuras se agregan como mapas de locale paralelos con las mismas keys, sin tocar a los consumidores
(web `ModulesForm`, RN futuro).

### D4 — CTA standalone interino (hasta el plan 05)

El CTA final es `/coach/subscription#modulos → "Agregar"` ([plan 05](05-PLAN-billing-addons-selfservice.md)),
pero esa sección aún no existe — un link a un anchor inexistente es UX rota. Se agrega la constante
`SELF_SERVICE_ADDONS_ENABLED = false` en `lib/constants` y mientras esté en `false` el CTA standalone
muestra "Disponible — escríbenos a contacto@eva-app.cl" (mailto con asunto prellenado, mismo patrón del
callout de `/pricing`). El plan 05 la prende y el link al anchor se activa solo. Juicio: 1 constante evita
un deploy coordinado entre planes.

**RESUELTO — RATIFICADO por el dueño (2026-06-11).** Además:

- **Telemetría de intención de compra (mejora aprobada):** cada click de CTA del catálogo (mailto
  interino, "Conversemos" de gestor o "Agregar" futuro) dispara el evento PostHog
  `module_interest_cta_clicked` con `module_key`, `cta_context`
  (`standalone_mailto` / `team_manager_mailto` / `self_service`) y `tier` — PostHog ya está en el stack
  (`lib/posthog/events.ts`), cero servicios nuevos (restricción global del dueño).
- **Precio de lista cuando se muestre (D3 dueño):** $9.990/mes por módulo, uniforme — recién con el
  plan 05. Team por contrato; la referencia interna (~$29.990 flat/team/módulo) NO se publica nunca.
- **IVA (D5 dueño):** silencio total en cualquier copy de precios hasta constituir EVAapp SpA.

### D5 — Admin coaches: fetch on-demand, NO tocar el RPC paginado

La lista del admin viene del RPC `get_admin_coaches_paginated` (ver
`app/admin/(panel)/coaches/page.tsx`, info card "Cómo funciona"). Agregar `enabled_modules` ahí exigiría
recrear el RPC (otra migración). En su lugar, `CoachEditSheet` carga los módulos al abrir con una server
action admin-gated `getCoachModulesAction(coachId)` — patrón exacto de `getCoachNotesAction`
(`app/admin/(panel)/coaches/_actions/coach-actions.ts:434-443`). Juicio: cero migración extra, cero costo
en la lista, latencia imperceptible en un sheet.

**RESUELTO (default ratificado 2026-06-11):** el bloque es el **override universal visible** — aparece
para TODO coach en el sheet (standalone, team u org), siempre visible, sin gating por tier ni contexto.

### D6 — `modules_present`: no apagar módulos por accidente

`updateCoachAction` (`coach-actions.ts:125-147`) arma `updateData` desde formData con un loop truthy. Si
se le agrega `readModules` a secas, **cualquier caller que no mande checkboxes `module_*` apagaría los 4
módulos** (readModules devolvería todo `false`). Fix: el sheet agrega un hidden `modules_present=1` y la
action solo incluye `enabled_modules` cuando ese flag viene. `TeamEditSheet` no necesita esto (su action
tiene un solo caller), pero acá `updateCoachAction` se invoca también desde
`app/admin/(panel)/coaches/update/route.ts:6` con formularios variados.

### D7 — Persona E2E dedicada "con módulos" (fuera de la matriz)

Las 8 personas de la matriz quedan con `enabled_modules: {}` (el doc fuente §2.7 y
`module-matrix.spec.ts:31-33` lo exigen — assertan el orden EXACTO del nav SIN módulos). Para testear el
grupo "MÓDULOS" del nav y el catálogo con estado "Activo" se agrega UNA persona dedicada
`e2e-modules-coach@evatest.cl` (standalone, elite/active, los 4 módulos ON vía seed service-role) con sus
propias listas esperadas — opción recomendada por el doc fuente §2.7. Nunca purgearla (memoria de cuentas
de prueba permanentes). **RESUELTO — RATIFICADA por el dueño (2026-06-11)** como 9na cuenta permanente
del seed, con listas esperadas propias en los specs.

## F1 — Código compra-only (deploy ANTES de la migración)

### F1.1 — `create-preference` a service-role (prerrequisito fintech de F2)

- `app/api/payments/create-preference/route.ts`: la autenticación sigue user-scoped (`:24`); SOLO el
  UPDATE de `:134-137` pasa a `createServiceRoleClient()` (patrón ya usado en
  `cancel-subscription/route.ts:37,70`). El `eq('id', user.id)` se conserva (el id viene de la sesión,
  jamás del body).
- **Test (escritura):** caso en la suite SQL de F2 (las columnas de billing niegan a `authenticated`) +
  ítem manual "checkout standalone sandbox" en la matriz de verificación del gate.

### F1.2 — Settings > Módulos → catálogo read-only con explicaciones ricas

- **Nuevo paquete** `packages/module-catalog/` (puro, sin deps de Next/Supabase — D3): por cada
  `ModuleKey` → `label`, `pitch` (2-3 frases comerciales-honestas), `surfaces: string[]` (dónde viven sus
  utilidades cuando está activo). La web lo importa desde `ModulesForm`; el RN futuro reusa el mismo
  paquete (anti-drift). Estrategia i18n anotada en el paquete (D3: base es latam neutro, locales
  paralelos por key). Copy base (Product — vende sin hostigar, cero letra chica):
  - **Cardio / Resistencia** — "Prescribe cardio como prescribes fuerza: bloques por tiempo, ritmo o
    distancia con zonas de frecuencia cardíaca. Tu alumno lo ejecuta con timers guiados y tú ves el
    cumplimiento real." Superficies: ítem **Cardio** en el menú · bloques de cardio en el builder ·
    timers y registro de cardio en la app del alumno.
  - **Evaluación de movimiento** — "Screening de ingreso con 7 patrones de movimiento y reporte semáforo
    para priorizar el trabajo de cada alumno y mostrar su evolución. El diferenciador kine de tu
    servicio." Superficies: ítem **Movimiento** en el menú (wizard 7 patrones + reporte semáforo) · card
    de última evaluación en la ficha del alumno · pestaña de resultados en la app del alumno.
  - **Composición corporal** — "Antropometría ISAK de 5 componentes y bioimpedancia en un mismo
    historial: mediciones comparables en el tiempo, sin planillas." Superficies: sección **Composición
    corporal** en la ficha del alumno (pestañas BIA / ISAK).
  - **Nutrición por intercambios** — "Pautas por porciones e intercambios — el método de los
    nutricionistas — dentro de tu plan nutricional, exportables a PDF con tu marca." Superficies: modo
    **Intercambios** dentro del plan nutricional · PDF de pauta con tu marca.
- **`ModulesForm.tsx`** (extender, no recrear): switches → badge **"Activo"** / **"Disponible"**;
  pitch + lista de superficies por módulo; CTA por contexto:
  - standalone → "Agregar" a `/coach/subscription#modulos` gated por `SELF_SERVICE_ADDONS_ENABLED` (D4;
    interino: mailto `contacto@eva-app.cl`).
  - team **no-gestor** → texto "Pídelo al owner de tu equipo." (sin link).
  - team **gestor** → "Conversemos — contacto@eva-app.cl" (mailto, asunto "Módulos para mi equipo").
  - Entitlement ON pero `isModuleKilledByOperator()` (`services/entitlements.service.ts:36-40`) → badge
    "Activo" + nota "temporalmente en mantenimiento" (CSM: el coach pagó, no le mientas con "Disponible").
- **Telemetría de intención de compra (mejora aprobada — D4):** nuevo hook `useCaptureModuleInterest`
  en `lib/posthog/events.ts` (patrón exacto de `useCaptureUpgradeGate`, `events.ts:20-28`); TODO click
  de CTA del catálogo captura `module_interest_cta_clicked` con `module_key`, `cta_context` y `tier`.
  Respeta el consentimiento de cookies existente (PostHog ya gated por `CookieConsent`). Cero servicios
  nuevos.
- **`page.tsx` + `modules.queries.ts`**: `getModulesContext` (`_data/modules.queries.ts:29`) deja de
  habilitar edición — `canEdit` se renombra a `isTeamManager` (mismo cálculo
  `isCurrentUserTeamManager`, ahora solo discrimina el CTA). El copy del header
  ("Activá las funciones avanzadas…", `page.tsx:34`) pasa a "Conoce los módulos disponibles para tu cuenta".
- **Eliminar** `app/coach/settings/modules/_actions/modules.actions.ts` completo (junto con su import en
  `ModulesForm.tsx:9`) — typecheck garantiza que no queden referencias.
- Anti-hostigamiento (doc fuente §2.6): este catálogo es 1 de las 2 únicas superficies de venta. Cero
  banners nuevos en dashboard/builder/alumno.
- **Tests (escritura, se ejecutan con vitest por tanda — permitido):**
  - `packages/module-catalog/catalog.test.ts`: el catálogo cubre EXACTAMENTE `MODULE_KEYS` (ni más ni
    menos); `pitch` y `surfaces` no vacíos por módulo.
  - **Spec E2E (escritura, NO ejecutar):** `tests/separation/module-catalog.spec.ts` — TRES describes
    (el 3ro es mejora aprobada 2026-06-11):
    1. `PERSONAS.teamCoach`: la página no tiene switches habilitados ni botón Guardar, muestra badge
       "Disponible" y el texto "Pídelo al owner";
    2. `PERSONAS.teamOwner`: CTA "Conversemos";
    3. `PERSONAS.soloCoach` (standalone): CTA mailto interino visible (`contacto@eva-app.cl`) y CERO
       switches en la página.
    Reusar la disciplina de `module-matrix.spec.ts` (storageState, sin networkidle, guard de overlay).

### F1.3 — Admin coaches: bloque "Módulos habilitados" (override del CEO)

- Mover `app/admin/(panel)/teams/_components/module-labels.ts` →
  `app/admin/(panel)/_components/module-labels.ts` (compartido teams+coaches; actualizar imports de
  `TeamEditSheet.tsx:10` y `TeamCreateSheet`).
- `getCoachModulesAction(coachId)` en `coach-actions.ts`: service-role + `assertAdmin()`, lee
  `enabled_modules` (patrón `getCoachNotesAction`, `coach-actions.ts:434-443`).
- `CoachEditSheet.tsx`: bloque de checkboxes `module_<key>` — **copiar el patrón exacto de
  `TeamEditSheet.tsx:54-64`** — cargado on-open con la action anterior; hidden `modules_present=1` (D6).
- `updateCoachAction` (`coach-actions.ts:125-147`): si `formData.get('modules_present')` → `updateData.enabled_modules = readModules(formData)`
  (copiar/extraer el helper `readModules` de `teams.actions.ts:23-30` a un módulo compartido). El audit
  log existente (`logAdminAction(... 'coach.update' ..., updateData)`, `coach-actions.ts:144`) ya captura
  los módulos en el payload — espejo de `teams.actions.ts:160`. Actualizar también el import de
  `module-labels` en `TeamCreateSheet.tsx:12` (no solo `TeamEditSheet.tsx:10`).
- **Nota de integración con el [plan 05](05-PLAN-billing-addons-selfservice.md) (su D2):** este
  override escribe `enabled_modules` directo — es el camino INTERINO. Cuando exista `coach_addons` +
  trigger de sync, el override standalone se re-modela como fila `source='admin_grant'` (write-through;
  un write directo sería pisado por el trigger en la siguiente mutación de add-ons). Esa migración del
  camino es tarea del plan 05 F6; acá no se anticipa nada.
- **Tests (escritura):** unit del `readModules` compartido (checkbox on/true/ausente) + unit "sin
  `modules_present` el updateData NO incluye `enabled_modules`" (extraer el armado de `updateData` a una
  función pura si hace falta para testearlo sin server context).

### F1.4 — Escritores de scoping de `clients` a service-role (prerrequisito de F2.1b)

Mejora aprobada 2026-06-11 (mismo patrón que F1.1: el código va ANTES que la migración):

- `apps/enterprise/lib/org-admin.ts:172-173` (`.update({ coach_id })` — reasignación de alumno por org
  admin): pasa a service-role server-side con guard de membership org admin (el id de la org sale del
  JWT, jamás del body).
- Verificar el cliente usado en `app/org/[slug]/_actions/org.actions.ts:603-606` (`coach_id = null` al
  desasignar): si es user-scoped, mismo refactor (el bloque vecino `:610` ya usa `admin`).
- Grep de cierre: `from('clients')` + `.update(` en `apps/web/src`, `apps/mobile` Y `apps/enterprise` —
  ningún call site user-scoped puede escribir `org_id`/`team_id`/`coach_id` tras esta tanda.
- **Tests (escritura):** los casos de negación van en la suite SQL de F2.2 (caso 8); ítem manual
  "reasignación org admin sigue funcionando" en la matriz del gate.

### F1.5 — Auditoría `assertModule` en las 4 superficies (mejora aprobada)

Verificación con grep + fix de gaps: TODA action y RSC de las 4 superficies de módulos debe gatear
server-side — con `assertModule` directo o delegando en un método del service que lo llame:

- **cardio:** `app/coach/cardio/{page.tsx, _actions/cardio.actions.ts, _data/cardio.queries.ts}` —
  baseline 2026-06-11: los tres referencian `assertModule`.
- **movimiento:** `app/coach/movement/{page.tsx, [clientId]/page.tsx, _data/movement.queries.ts}` +
  `services/assessment/movement-assessment.service.ts`. **Hallazgo baseline:**
  `app/coach/movement/_actions/movement.actions.ts` NO llama `assertModule` directo — delega en el
  service (que sí gatea). La auditoría debe confirmar que CADA export de ese archivo pasa por un método
  gateado del service; si alguna ruta lo bypasea → fix + unit test del gap.
- **composición corporal:** `app/coach/clients/[clientId]/bodycomp/_data/body-composition.queries.ts` +
  `services/bodycomp/body-composition.service.ts` (verificar también las actions del perfil de alumno
  que escriban mediciones).
- **intercambios:** `app/coach/nutrition-plans/{_data/exchange.queries.ts, _actions/exchange.actions.ts}`
  + `services/nutrition-exchanges/nutrition-exchanges.service.ts`.
- Método: grep de `assertModule` sobre esas rutas y cruzar contra la lista de exports de `_actions/*` y
  los `page.tsx`; cualquier entry point sin gate (directo o vía service) es un gap a corregir en esta
  misma tanda.

## F2 — Migraciones de hardening (SOLO después del deploy de F1)

### F2.1 — `supabase/migrations/20260611120000_modules_compra_only_grants.sql`

Aditiva, idempotente, replay-safe (REVOKE/GRANT/DROP POLICY IF EXISTS re-ejecutan limpio en el merge del
branch). Contenido:

```sql
-- Compra-only de modulos + proteccion de columnas de billing (plan estrategia 03).
-- REGLA DE MANTENIMIENTO: toda columna nueva de coaches/teams que el usuario deba editar
-- user-scoped REQUIERE un GRANT UPDATE(col) en la misma migracion que la crea.

-- ===== coaches =====
REVOKE INSERT, UPDATE, DELETE ON public.coaches FROM authenticated, anon;
GRANT UPDATE (
  full_name, brand_name, primary_color, use_brand_colors_coach, logo_url,
  welcome_message, loader_text, use_custom_loader, loader_text_color, loader_icon_mode,
  welcome_modal_enabled, welcome_modal_content, welcome_modal_type,
  welcome_modal_version, welcome_modal_updated_at,
  onboarding_guide, invite_code, updated_at
) ON public.coaches TO authenticated;
-- Policy legacy duplicada (USING-only, redundante con coaches_update_own — baseline:2576):
DROP POLICY IF EXISTS "Coach can update their own profile" ON public.coaches;
-- Sin call sites user-scoped (auditoria 2026-06-11): INSERT/DELETE own cierran la via de
-- auto-crear fila coach con tier/modulos arbitrarios (todos los INSERT reales son service-role).
DROP POLICY IF EXISTS "coaches_insert_own" ON public.coaches;
DROP POLICY IF EXISTS "coaches_delete_own" ON public.coaches;

-- ===== teams =====
REVOKE INSERT, UPDATE, DELETE ON public.teams FROM authenticated, anon;
-- OJO: teams NO tiene columna updated_at (verificado: 20260609050855 + 20260610000000) —
-- incluirla en el GRANT haria FALLAR la migracion con "column does not exist".
GRANT UPDATE (
  name, primary_color, accent_light, accent_dark, splash_bg_color,
  loader_text, loader_text_color, loader_icon_mode, use_custom_loader, neutral_tint,
  logo_url, logo_url_dark
) ON public.teams TO authenticated;

-- ===== teams_guard_owner_fields endurecido (mejora aprobada 2026-06-11 — segunda capa) =====
-- CREATE OR REPLACE de la funcion (20260609050855:116-129), cambio minimo (~3 lineas):
-- el cambio de seat_limit se bloquea para TODO caller authenticated (incluido el owner);
-- service-role exento. La rama de owner_coach_id queda INTACTA (transfer_team_ownership
-- SECURITY DEFINER — caso 5 de la suite). Red de seguridad si un GRANT futuro re-expone seat_limit.

-- ===== invite_code set-once a nivel DB (mejora aprobada 2026-06-11) =====
-- Trigger BEFORE UPDATE OF invite_code ON public.coaches: para authenticated solo se permite
-- NULL -> valor (el backfill legacy de public-code.queries.ts:35 sigue vivo); cambiar un valor
-- existente -> RAISE EXCEPTION; service-role exento. OJO: invite_code PERMANECE en el GRANT de
-- columnas de coaches — el set-once lo impone el trigger, no el grant. Memoria
-- project-coach-code-identity: el codigo es identificador primario, jamas debe mutar self-service.

-- ===== Clawback de modulos auto-activados (CINTURON — agregado 2026-06-12) =====
-- El REVOKE/GRANT cierra la auto-activacion A FUTURO, pero NO resetea lo ya activado por el
-- hueco mientras estuvo abierto (el hueco vive hasta que ESTA migracion despliegue). Reset
-- idempotente a '{}' de todo coach/team REAL, EXCLUYENDO las cuentas de prueba permanentes
-- (personas @evatest.cl — en especial e2e-modules-coach, que DEBE quedar ON — y los teams de
-- test). La lista exacta de exclusion se DERIVA AL SELLAR el .sql (join a auth.users por
-- email LIKE '%@evatest.cl' + ids/slugs de los teams de prueba), mismo criterio que los purges.
-- Verificado en prod 2026-06-12: 26/27 coaches reales ya estan en '{}' y los teams con modulos
-- son de test => este UPDATE es DEFENSA (cierra la ventana), no una migracion de datos masiva.
UPDATE public.coaches SET enabled_modules = '{}'::jsonb
WHERE enabled_modules <> '{}'::jsonb
  AND id NOT IN (
    SELECT c.id FROM public.coaches c JOIN auth.users u ON u.id = c.id
    WHERE u.email LIKE '%@evatest.cl'
  );
-- teams: mismo reset excluyendo los teams de prueba (lista de ids/slugs derivada al sellar).
```

- Quedan SOLO service-role: `coaches.enabled_modules/subscription_tier/subscription_status/max_clients/
  billing_cycle/current_period_end/subscription_mp_id/…` y `teams.enabled_modules/seat_limit/
  owner_coach_id/suspended_at/slug/invite_code/deleted_at`.
- `transfer_team_ownership` (SECURITY DEFINER, `20260609220000:44`) y el trigger
  `coaches_org_managed_guard` siguen funcionando sin cambios; `teams_guard_owner_fields` se endurece
  en esta misma migración (D1 — excepción aprobada por el dueño 2026-06-11, rama `owner_coach_id`
  intacta).
- El allowlist exacto se RE-VERIFICA en implementación con el grep DoD (abajo) antes de sellar el .sql —
  la lista de arriba es la auditada hoy.
- **Timestamp posterior a las 7 del gate** (`20260611090001…20260611093001`). **Default: branch
  efímero PROPIO, posterior al gate Movida** (mismo protocolo Director §3: crear → validar → merge
  en verde → **borrar el branch el MISMO día**). Entrar al MISMO branch del gate SOLO si el código
  de F1 ya está **desplegado en producción (master)** — commitear en `feat/movida-platform` NO
  alcanza: `merge_branch` aplica los grants a la DB de prod al instante y el código que corre en
  prod es el de master; si master aún tiene el `create-preference` user-scoped, el checkout
  standalone muere con 42501 en ese mismo momento.
- Tras el merge: `npx supabase db pull` + regenerar `database.types.ts` (los grants no cambian tipos,
  pero el protocolo del Director lo exige igual para detectar drift).

### F2.1b — Migración hermana `20260611120001_clients_scoping_grants.sql` (mejora aprobada — mismo branch efímero)

- `REVOKE UPDATE ON public.clients FROM authenticated, anon;` +
  `GRANT UPDATE (<todas las columnas actuales MENOS id/org_id/team_id/coach_id>) ON public.clients TO authenticated;`
  — la lista exacta se deriva del schema vivo al sellar el .sql (D2). INSERT/DELETE sin cambios.
- Cierra el hueco #5 (un coach mueve alumnos de scope por PATCH — policies
  `clients_standalone_coach_manage` y `team_clients_member_all` con WITH CHECK incompleto).
- **Prerrequisito duro (como F1.1):** el refactor F1.4 (escritores user-scoped de `coach_id` a
  service-role) debe estar **desplegado en prod/master** antes de mergear esta migración — si no, la
  reasignación de alumnos por org admin muere con 42501.
- Misma disciplina que F2.1: aditiva, idempotente, replay-safe; misma regla de mantenimiento comentada
  en el .sql (columna user-editable nueva de `clients` exige GRANT en su migración).
- Va hermana (archivo separado) y no fusionada: rollback y bisección independientes si un flujo de
  alumnos no auditado falla.

### F2.2 — Suite SQL (tarea de ESCRITURA; ejecución en el GATE)

`tests/separation/module-grants.sql` (patrón de `tests/separation/separation-invariants.sql`: SQL puro
ejecutable como `authenticated` con claims seteados, jamás `service_role` para los casos de negación):

1. Coach standalone (claims propios): `UPDATE coaches SET enabled_modules…` → **42501**; ídem
   `subscription_tier`, `subscription_status`, `max_clients`.
2. Mismo coach: `UPDATE coaches SET brand_name…` → OK; `onboarding_guide` → OK (allowlist viva).
3. `INSERT INTO coaches` como authenticated → denegado (policy dropeada + grant revocado).
4. Team manager (claims del owner E2E): `UPDATE teams SET enabled_modules…` → **42501**; ídem
   `seat_limit`; `UPDATE teams SET primary_color…` → OK (marca del team sigue self-service).
5. `transfer_team_ownership` invocada por el owner → OK (SECURITY DEFINER no afectado).
6. service-role: UPDATE de `enabled_modules` en coaches y teams → OK (admin/webhook siguen siendo los
   únicos escritores).
7. Regresión: el flujo de branding standalone y de marca del team (columnas del allowlist) → OK.
8. **Clients scoping (F2.1b):** coach standalone y coach de team: `UPDATE clients SET team_id/org_id/coach_id…`
   → **42501**; UPDATE de una columna de perfil (ej. `goal_weight_kg`, `is_archived`) → OK (allowlist
   de clients viva).
9. **invite_code set-once:** como authenticated, `NULL → valor` → OK (backfill legacy);
   `valor → otro valor` → excepción del trigger; como service-role → OK.
10. **Trigger endurecido de teams (defensa en profundidad):** en una transacción de test,
    `GRANT UPDATE (seat_limit)` temporal + UPDATE como owner → excepción de
    `teams_guard_owner_fields` + ROLLBACK (prueba que la segunda capa vive aunque un grant futuro
    re-exponga la columna; sin la transacción el caso observable sería el 42501 del grant, que no
    ejercita el trigger).
11. **Drift de grants (mejora aprobada — corre en el GATE):** asserts contra
    `information_schema.column_privileges` para `coaches`, `teams` y `clients` — el set de columnas
    con UPDATE para `authenticated` debe ser EXACTAMENTE el allowlist esperado declarado en la suite
    (ni una más, ni una menos). Detecta drift de migraciones futuras que re-expongan columnas.

## F3 — Nav: grupo "MÓDULOS"

### F3.1 — `splitNavItems` + reorden del registro

- `components/coach/coach-nav.ts`: nuevo helper **puro**
  `splitNavItems(items: NavModule[]): { core: NavModule[]; modules: NavModule[] }` — discriminador:
  `item.entitlement != null`. Se aplica SOBRE el resultado de `getVisibleNavItems` (los módulos OFF ya
  vienen filtrados en `coach-nav.ts:107`), así "grupo solo con ≥1 módulo ON" sale gratis
  (`modules.length === 0` ⇒ no se renderiza divisor).
- Mover `cardio` y `movement` (`coach-nav.ts:53-54`) al **final del registro** (después de `support`,
  `:61`): en mobile el bottom bar renderiza plano en orden de registro ⇒ módulos contiguos al final del
  scroll. En desktop el orden lo impone `splitNavItems`, no el registro.

### F3.2 — `CoachSidebar` desktop: divisor con label

- `components/coach/CoachSidebar.tsx:237-274`: render en dos bloques — `core` y, si
  `modules.length > 0`, divisor + `modules`. Divisor expandido: línea + label
  `MÓDULOS` (mismo tratamiento tipográfico que "Terminal", `:283`); colapsado (`isCollapsed`): solo la
  línea. Mobile (`<nav>` con scroll horizontal, `:219`): sin divisor, render plano `[...core, ...modules]`.
  El divisor NO es `<a title>` ⇒ no contamina `collectNavTitles` de los specs E2E
  (`module-matrix.spec.ts:59-62`).

### F3.3 — Tests del nav (escritura; vitest corre por tanda)

- `coach-nav.test.ts`: (a) los asserts de orden existentes (`:12`, `:24`, `:37`) **NO cambian** — con
  módulos OFF el filtro actúa antes del orden, mover cardio/movement al final no altera las listas sin
  módulos (verificarlo explícitamente con un assert nuevo, no asumirlo); (b) con módulos ON los keys
  `cardio`/`movement` quedan AL FINAL del array visible; (c) `splitNavItems`: discriminador, grupos
  disjuntos, `modules` vacío sin entitlements ON, orden estable.
- `module-matrix.spec.ts:31-33`: las listas `STANDALONE_MODULES`/`ENTERPRISE_MODULES`/`TEAM_MODULES`
  quedan **idénticas** (personas sin módulos). Solo se agregan listas nuevas para la persona de F4.2.

## F4 — Cuentas de prueba ON + specs E2E con módulos

- **Teams de prueba** ("Movida (test)"): el CEO ya puede activar módulos vía `/admin/teams`
  (`TeamEditSheet.tsx:54-64`) — hacerlo en la pasada manual del gate.
- **Standalone de prueba** (`juanmvr2706@gmail.com`): vía el bloque nuevo de F1.3.
- ⚠️ **NO activar módulos en las 8 personas de la matriz de separación** (`module-matrix.spec.ts:31-33`
  asserta el nav sin módulos; doc fuente §2.7).
- **Persona dedicada** `e2e-modules-coach@evatest.cl` (D7 — RATIFICADA por el dueño 2026-06-11): alta
  en el seed de personas (`tests/separation/personas.ts` + setup) con los 4 módulos ON por seed
  service-role. Es la **9na cuenta de prueba permanente**: nunca purgearla, excluirla de purges
  (memoria de cuentas permanentes).
- **Specs E2E (escritura, NO ejecutar):** extender `module-matrix.spec.ts` con el describe de la persona
  nueva: lista esperada exacta `['Dashboard','Alumnos','Programas','Ejercicios','Nutrición','Mi Marca','Suscripción','Soporte','Cardio','Movimiento']`
  (módulos al final) + divisor visible en desktop (locator por testid del divisor) + `/coach/cardio`
  carga sin redirect.

## F5 — Docs (misma PR de cada tanda)

- `CLAUDE.md` §Database: gotcha nuevo "coaches/teams/**clients** tienen column-level grants — columna
  user-editable nueva exige GRANT en su migración" + `enabled_modules` es compra-only (escritura solo
  service-role) + scoping de `clients` (`org_id`/`team_id`/`coach_id`) solo service-role.
- `docs/plans/movida/00-DIRECTOR.md` bitácora: módulos pasan a compra-only (decisión socios 2026-06-11).
- `docs/architecture/FLOWS_AND_COMPONENTS.md`: Settings > Módulos ahora es catálogo; flujo de activación
  (admin override hoy, self-service plan 05).
- **Roadmap mobile (mejora aprobada):** agregar al plan maestro mobile (`docs/audits`, memoria
  `project-mobile-roadmap`) la nota anti-drift: "módulos/catálogo deben replicarse en RN; el copy
  canónico vive en `packages/module-catalog` — la app RN consume ese paquete, no duplica strings".
- **Tarea diferida (D5 dueño):** al constituirse EVAapp SpA, revisar el copy de precios donde exista
  (aplica a los planes 02/05 — este catálogo no publica precios; se deja la referencia cruzada para que
  no se pierda).

## Archivos clave

`supabase/migrations/20260611120000_modules_compra_only_grants.sql` (nueva) ·
`supabase/migrations/20260611120001_clients_scoping_grants.sql` (nueva, hermana) ·
`packages/module-catalog/{catalog.ts, catalog.test.ts}` (nuevo paquete) ·
`app/coach/settings/modules/{_components/ModulesForm.tsx, _data/modules.queries.ts, page.tsx}` ·
`app/coach/settings/modules/_actions/modules.actions.ts` (**eliminar**) ·
`app/api/payments/create-preference/route.ts` ·
`apps/enterprise/lib/org-admin.ts` (refactor coach_id a service-role, F1.4) ·
`app/org/[slug]/_actions/org.actions.ts` (verificar `:603-606`, F1.4) ·
`lib/posthog/events.ts` (`useCaptureModuleInterest`) ·
`app/admin/(panel)/coaches/_components/CoachEditSheet.tsx` ·
`app/admin/(panel)/coaches/_actions/coach-actions.ts` ·
`app/admin/(panel)/_components/module-labels.ts` (movido) ·
`components/coach/{coach-nav.ts, coach-nav.test.ts, CoachSidebar.tsx}` ·
`lib/constants` (`SELF_SERVICE_ADDONS_ENABLED`) ·
`tests/separation/{module-matrix.spec.ts, module-catalog.spec.ts (nuevo), module-grants.sql (nuevo),
personas.ts}` · `lib/database.types.ts` (regenerar post-merge).

## Orden sugerido (secuencia DURA)

1. **F1 completa** (1 tanda de código): create-preference service-role + catálogo (paquete +
   telemetría) + admin coaches + refactor escritores de scoping de clients (F1.4) + auditoría
   `assertModule` (F1.5). `pnpm typecheck` + `pnpm test` por tanda (permitido por la regla 2026-06-10).
2. **F3** (tanda chica de código): splitNavItems + sidebar + tests unit. typecheck+vitest.
3. Commit de F1+F3 en `feat/movida-platform` (sin pisar la tanda 1 pre-gate del working tree).
4. **F2 migraciones (principal + hermana de clients)**: SOLO con el código de F1 (incluido F1.4)
   **desplegado en producción (master)** — "commiteado en la feature branch" o "en el mismo release"
   NO alcanza: `merge_branch` muta la DB de prod al instante y el deploy de Vercel tarda minutos.
   Regla absoluta: las migraciones JAMÁS llegan a prod antes que el código de F1 esté vivo en master
   (romperían el checkout standalone — fintech — y la reasignación org de alumnos).
   Default: branch efímero propio posterior al gate Movida (Director §3, borrar el MISMO día).
5. **F4** seed/persona + specs E2E (escritura).
6. **F5** docs.
7. **GATE DEL PLAN** (abajo) — ejecución de Playwright/SQL.

## Verification (matriz — se ejecuta en el GATE)

- **Grants:** suite `module-grants.sql` completa (F2.2, casos 1-11 — incluye clients scoping,
  invite_code set-once, trigger endurecido y **check de drift contra
  `information_schema.column_privileges`**) en el branch efímero ANTES del merge, como
  `authenticated`+claims; `get_advisors` security+performance sin críticos nuevos.
- **Clients no-regresión:** reasignación de alumno por org admin sigue funcionando (service-role,
  F1.4); perfil/flags de alumno (mobile onboarding, archive, goal weight) se guardan OK post-migración
  hermana; PATCH de `team_id`/`org_id`/`coach_id` con JWT de coach → 42501.
- **Fintech no-regresión:** checkout standalone sandbox crea preference y el coach queda
  `pending_payment` (create-preference ahora service-role); webhook MP responde; cancel/confirm/
  activate-free intactos (ya eran service-role).
- **Catálogo:** `module-catalog.spec.ts` (read-only por rol, badges, CTA por contexto — 3 describes:
  teamCoach, teamOwner, soloCoach); manual: coach standalone NO puede activarse nada desde la UI ni vía
  `PATCH` con su JWT (curl → 42501).
- **Telemetría:** click en un CTA del catálogo (con consentimiento de cookies aceptado) → evento
  `module_interest_cta_clicked` con `module_key` y `cta_context` visible en PostHog.
- **assertModule:** grep de F1.5 ejecutado y limpio — cero entry points de las 4 superficies sin gate
  server-side.
- **Admin override:** CEO activa módulos a `juanmvr` desde `/admin/coaches` → fila en
  `admin_audit_logs` con el payload de módulos → al coach le aparece el grupo MÓDULOS en el nav.
- **Nav:** `coach-nav.test.ts` + `module-matrix.spec.ts` (listas sin módulos IDÉNTICAS + describe nuevo
  de `e2e-modules-coach`).
- **Marca intacta:** branding personal del coach y marca del team se guardan OK post-migración
  (allowlist viva) — incluir la pasada en la **app móvil** ("Mi Marca" + subir logo en
  `apps/mobile`, que escribe `coaches` por PostgREST directo).
- `pnpm typecheck` / `pnpm test` / `pnpm build` verdes; `database.types.ts` sin drift post-merge.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Migración aplicada antes del deploy de F1 → checkout standalone roto (fintech) | Secuencia dura del Orden #4 (condición = F1 viva en prod/master, no "commiteada"); ítem fintech en la matriz; la migración vive en el branch efímero hasta entonces |
| Allowlist incompleta → 42501 en un flujo legítimo no auditado | Grep DoD pre-sellado del .sql; el fallo es ruidoso (toast/500), no corrupción; rollback = 1 `GRANT UPDATE(col)` aditivo |
| `updateCoachAction` apaga módulos por caller sin checkboxes | Hidden `modules_present` (D6) + unit test |
| `module-matrix` rojo por reorden del registro | Las listas sin módulos no cambian (F3.3 lo prueba unit); cualquier rojo = revisar registro antes de tocar specs |
| Branch efímero olvidado (cobra USD/h; créditos no lo cubren) | Protocolo Director §3: `delete_branch` el MISMO día (memoria `project-plan1-gate-pending`) |
| Filtrar precios antes del cierre Movida (reunión 12-jun) | El catálogo NO muestra precios; CTAs conversacionales; precios recién en plan 05 post-cierre (lista $9.990/módulo ya decidida — D3 dueño) |
| Drop de `coaches_insert_own` rompe un alta no auditada | Auditoría 2026-06-11: todos los INSERT son service-role (F2.1); caso INSERT en la suite SQL; rollback = recrear la policy del baseline. Drop RATIFICADO por el dueño 2026-06-11 |
| Allowlist de `clients` incompleta → 42501 en perfil/flags de alumno | Allowlist por exclusión (solo se niegan 3 columnas de scoping — todo lo demás queda concedido); grep DoD extendido a `clients` y a `apps/enterprise`; rollback = 1 `GRANT UPDATE(col)` aditivo |
| Reasignación org/team de alumnos rota por el revoke de `coach_id` | Escritores detectados en D2 se refactorizan a service-role ANTES de la migración hermana (F1.4 — prerrequisito duro de F2.1b); ítem manual en la matriz |
| Trigger set-once de `invite_code` bloquea un flujo legítimo | Auditoría: el único escritor user-scoped es el backfill NULL→valor (`public-code.queries.ts:35`), que sigue permitido; cambios excepcionales quedan vía service-role (admin); caso 9 de la suite |

## Definition of Done

- Ningún rol `authenticated` puede escribir `enabled_modules`, `subscription_*`, `max_clients` (coaches)
  ni `enabled_modules`, `seat_limit` (teams) — verificado por suite SQL; la escritura queda SOLO en
  service-role (admin override + futuro webhook del plan 05). `seat_limit` además queda bloqueado por
  el trigger endurecido (segunda capa) incluso para el owner.
- Ningún rol `authenticated` puede mover `clients` de scope: `org_id`/`team_id`/`coach_id` solo
  service-role (migración hermana F2.1b); la reasignación org admin funciona vía service-role (F1.4).
- `invite_code` es set-once a nivel DB para `authenticated` (solo NULL→valor; trigger de F2.1).
- **Clawback ejecutado (cinturón):** todo coach/team REAL queda en `enabled_modules='{}'` tras la
  migración F2.1 (excluidas las cuentas de prueba permanentes, en especial `e2e-modules-coach` que
  conserva sus 4 módulos ON); ningún coach real arranca con módulos gratis. Caso de verificación en la
  suite SQL: post-UPDATE, `COUNT(coaches con módulos AND no-test) = 0`.
- Check de drift de grants (caso 11 de la suite) verde: `information_schema.column_privileges` ==
  allowlist esperado para `coaches`/`teams`/`clients`.
- Copy del catálogo vive en `packages/module-catalog` (puro, estrategia i18n anotada) y todo click de
  CTA registra `module_interest_cta_clicked` con `module_key` en PostHog.
- Las 4 superficies de módulos auditadas (F1.5): toda action/RSC gatea con `assertModule` directo o vía
  service; gaps corregidos con unit test.
- Settings > Módulos es catálogo read-only con pitch + superficies + estado + CTA por contexto; cero
  upsells fuera de las 2 superficies permitidas.
- CEO activa/desactiva módulos a CUALQUIER coach standalone desde `/admin/coaches` con audit log
  (paridad con `/admin/teams`).
- Nav agrupa módulos ON bajo "MÓDULOS" (desktop divisor, mobile al final del scroll); sin módulos, el
  nav es byte-idéntico al actual.
- Branding personal/team, checkout MP, onboarding guide e invite_code legacy funcionan igual que antes.
- Cuentas de prueba manuales con módulos ON; las 8 personas de la matriz intactas.
- Grep DoD ejecutado y limpio: `from('coaches')`/`from('teams')`/`from('clients')` + `.update(`/`.insert(`
  en `apps/web/src`, `apps/mobile` **y `apps/enterprise`** — cero call sites user-scoped escribiendo
  columnas fuera del allowlist (la app móvil y la de enterprise hablan con PostgREST directo: los grants
  las afectan igual).

## GATE DEL PLAN — ejecución de tests

**⚠️ ANTES DE CORRER: preguntar al usuario — tiene tests pendientes de otros planes (gate Movida) y la
regla 2026-06-10 exige autorización explícita.** Por tanda solo `pnpm typecheck` + `pnpm test` (vitest);
TODO lo que toca Supabase remota o Playwright se ejecuta únicamente acá, con OK explícito:

1. Suite SQL `tests/separation/module-grants.sql` completa en el branch efímero (pre-merge) — casos
   1-11: incluye clients scoping (caso 8), invite_code set-once (9), trigger endurecido (10) y el
   **check de drift de grants** contra `information_schema.column_privileges` (11). Compartir la
   sesión del gate consolidado de Movida SOLO si F1 ya está desplegada en prod/master (condición
   dura del Orden #4); si no — el caso esperable, porque el gate es prioridad 1 — branch efímero
   propio posterior.
2. `npx playwright test tests/separation/module-matrix.spec.ts tests/separation/module-catalog.spec.ts --workers=1`
   (module-catalog con sus 3 describes: teamCoach, teamOwner, soloCoach).
3. Pasada manual: PATCH directo con JWT de coach (42501, coaches Y clients scoping) · admin override a
   juanmvr · checkout sandbox · marca personal/team se guarda · reasignación org admin de alumno OK ·
   click CTA del catálogo → evento `module_interest_cta_clicked` en PostHog.
4. `get_advisors` + snapshot + merge (ambas migraciones) + `db pull` + regen types + **borrar branch el
   mismo día**.
