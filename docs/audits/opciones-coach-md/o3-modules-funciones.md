# 3. Modulos y Funciones

> Esta seccion documenta las dos rutas hermanas del hub `/coach/settings` que gobiernan que features de pago tiene el coach (**Modulos** = capa de billing/entitlement, read-only) y que tan a fondo decide usarlas (**Funciones** = capa de preferencia ENABLED). Enfasis backend: que datos llegan, que se guarda, COMO se guarda (compra-only vs preferencia user-scoped), gating por tier y por modulo. La distincion central de todo el sistema es el modelo:
>
> `visible = ENTITLED (billing, server-side, fail-closed) AND ENABLED (preferencia, solo achica)`
>
> Modulos vive en el lado ENTITLED (no escribe nada — solo describe y lleva a comprar). Funciones vive en el lado ENABLED (escribe preferencias, nunca toca billing).

---

## 3.0 Conceptos transversales (backend) — leer antes que las pantallas

### 3.0.1 Las 4 keys de modulos de pago (fuente de verdad)

La lista canonica de modulos de pago vive en `apps/web/src/services/entitlements.service.ts`:

```
MODULE_KEYS = ['cardio', 'movement_assessment', 'body_composition', 'nutrition_exchanges']
```

- Tipo `ModuleKey = (typeof MODULE_KEYS)[number]`.
- Default de entitlements: **OFF** (`{}` => todos false).
- El paquete puro `@eva/module-catalog` (`packages/module-catalog/catalog.ts`) redeclara las mismas 4 keys en `MODULE_CATALOG_KEYS` y el paquete `@eva/feature-prefs` (`packages/feature-prefs/index.ts`) redeclara el tipo `ModuleKey` localmente. Los tres deben coincidir EXACTAMENTE; hay tests (`catalog.test.ts`, `feature-prefs.test.ts`) que cruzan cada key contra `MODULE_KEYS` y fallan si divergen (ni una mas, ni una menos). Razon: los paquetes son PUROS (cero Next/Supabase/React/RN) para que la misma copy y el mismo resolver corran tambien en `apps/mobile`.

| `ModuleKey` | Nombre comercial (`MODULE_CATALOG[key].label`) |
|---|---|
| `cardio` | Cardio / Resistencia |
| `movement_assessment` | Evaluacion de movimiento |
| `body_composition` | Composicion corporal |
| `nutrition_exchanges` | **Nutricion Pro** (la key sigue siendo `nutrition_exchanges` por compat; el label cambio a "Nutricion Pro") |

### 3.0.2 Donde se guardan los entitlements y por que NADIE los escribe desde aqui

Los entitlements viven en columnas `jsonb` `enabled_modules`:

- **Standalone:** `coaches.enabled_modules` (mapa `{ cardio: true, ... }`).
- **Team:** `teams.enabled_modules` (pool-wins: el team decide, no es union con el coach).

Ambas columnas son **COMPRA-ONLY / service-role-only** (CLAUDE.md, plan estrategia 03):

- `coaches`/`teams` tienen **GRANT de columna**: `REVOKE UPDATE ON tabla FROM authenticated` + `GRANT UPDATE (allowlist)`. `enabled_modules` NO esta en la allowlist => un `authenticated` (el propio coach) **no puede** escribirla por PostREST; intentarlo devuelve `42501` en runtime.
- La unica escritura legitima viene de:
  - El **webhook de pago** (service-role) que materializa una compra self-service.
  - El **override admin del CEO** (`/admin`, service-role), que es write-through via filas `coach_addons` (`syncAdminGrants` en `services/billing/addons.service.ts`).
- En standalone, `coaches.enabled_modules` se **recomputa solo** desde las filas vivas de `coach_addons` por el **trigger D1 `trg_coach_addons_sync`** (`sync_coach_enabled_modules`, SECURITY DEFINER) en cada INSERT/UPDATE/DELETE. Nadie escribe el jsonb directo — lo pisaria el trigger.
- En team, `teams.enabled_modules` lo togglea el CEO en `/admin/teams` (segunda capa: trigger `teams_guard_owner_fields` protege `seat_limit`).

**Consecuencia de diseno load-bearing para esta seccion:** la pantalla **Modulos** es deliberadamente un **catalogo read-only**. No tiene switches, no guarda nada, no puede activar un modulo gratis. Solo describe valor y enruta a comprar. Esto NO es una decision de UX: es la unica forma posible dado que la columna es compra-only (un switch ahi solo produciria `42501`).

### 3.0.3 Resolucion del estado "Activo / Disponible" (entitlement) + kill-switch de operador

El catalogo Modulos resuelve si un modulo esta `active` leyendo el `enabled_modules` del **workspace activo** (no del usuario): team => `teams.enabled_modules`; standalone => `coaches.enabled_modules` (ver 3.1.3).

Por encima del entitlement del tenant existe el **kill-switch de PLATAFORMA** (flag de operador), en `entitlements.service.ts`:

- `isModuleKilledByOperator(key)` lee la env `EVA_DISABLED_MODULES` (CSV de keys, ej. `"cardio,body_composition"`). Si la key esta listada => el modulo se apaga para TODOS, por encima del entitlement. Requiere **redeploy** (es env, no Edge Config).
- `hasModule(db, key, ctx)` (el gate real server-side) hace **fail-closed**: primero `if (isModuleKilledByOperator(key)) return false`, luego lee el jsonb del contexto (teamId gana sobre coachId).
- En la pantalla Modulos, el kill-switch NO oculta la fila: si el modulo esta `active` (entitlement ON) pero killed, se muestra el badge **Activo** + el aviso `Temporalmente en mantenimiento` (ver 3.1.6). El gate de verdad sigue siendo server-side via `hasModule`.

### 3.0.4 Entitlement vs feature-pref — la diferencia que rige Funciones

| | **Entitlement** (Modulos) | **Feature-pref** (Funciones) |
|---|---|---|
| Que es | Lo que **compraste** (billing) | Lo que **decides mostrar** de eso (preferencia) |
| Donde vive | `coaches.enabled_modules` / `teams.enabled_modules` (jsonb) | `coach_feature_prefs` / `team_feature_prefs` / `client_feature_prefs` (filas por dominio) |
| Quien escribe | **Solo service-role** (webhook/admin/trigger D1) | **El propio coach/owner** (authenticated, RLS authoritative) |
| Direccion | Es el techo (gate de dinero) | Solo **achica** — nunca amplia/widen-ea entitlement |
| Default | OFF (`{}`) | Dominio prendido (`_enabled` ausente => true); secciones segun preset |

El explainer que el codigo muestra al usuario (en `FeaturePrefsPanel`, una vez al pie): *"Modulos es lo que compraste (entitlements de pago). Funciones es lo que decides mostrar de eso. Apagar una funcion nunca cancela un modulo ni borra datos — solo la oculta."*

### 3.0.5 Gating por tier (canUseBranding) — aclaracion de alcance

El gating por **tier** (`SubscriptionTier`, leido como `coach.subscription_tier`) gobierna el **branding** (`canUseBranding`, Pro+). **Modulos y Funciones NO se gatean por tier.** En estas dos rutas el `tier` se lee solo para **telemetria de intencion de compra** (se pasa como propiedad del evento PostHog `module_interest_cta_clicked`, ver 3.1.7). El gate de Modulos es el entitlement por-modulo (no el tier); el gate de Funciones es el entitlement por-modulo de cada seccion Pro. Es decir: un coach FREE puede tener un modulo Pro activado (admin_grant del CEO) y verlo `Activo` aqui, independiente de su tier.

---

## 3.1 MODULOS — `/coach/settings/modules`

Catalogo read-only de los 4 modulos de pago. Por cada modulo: badge **Activo/Disponible**, pitch + superficies (donde viven sus utilidades), aviso de mantenimiento si aplica, y un CTA de desbloqueo contextual. Es **1 de las 2 unicas superficies de venta** de modulos (anti-hostigamiento; la otra es `/coach/subscription#addons`).

Archivos:
- `apps/web/src/app/coach/settings/modules/page.tsx` (RSC)
- `apps/web/src/app/coach/settings/modules/_data/modules.queries.ts` (loader)
- `apps/web/src/app/coach/settings/modules/_components/ModulesForm.tsx` (`'use client'`, render del catalogo)
- Copy: `@eva/module-catalog` (`packages/module-catalog/catalog.ts`)
- Entitlement helpers: `@/services/entitlements.service`

### 3.1.1 Guards de la pagina (RSC `page.tsx`)

`CoachModulesPage` llama `getModulesContext()` y aplica, en orden:

1. `if (!coachId) redirect('/login')` — sin coach autenticado.
2. `if (orgManaged) redirect('/coach/dashboard')` — coach enterprise (org-managed) **no** tiene zona Modulos. `orgManaged` = `coach.subscription_status === 'org_managed'` **OR** `workspace?.type === 'enterprise_coach'`.
3. `if (!ctx) redirect('/coach/dashboard')` — sin contexto valido.

Metadata: `title: 'Modulos | EVA'`.

### 3.1.2 Datos que llegan al render (`ModulesContext`)

El loader devuelve `{ coachId, orgManaged, ctx }`. La pagina pasa a `<ModulesForm>`:

| Prop | Tipo | Origen |
|---|---|---|
| `modules` | `Record<ModuleKey, boolean>` | `enabled_modules` del workspace activo, normalizado |
| `killedByOperator` | `Record<ModuleKey, boolean>` | `operatorKillMap()` (env `EVA_DISABLED_MODULES`) |
| `isTeamManager` | `boolean` | `isCurrentUserTeamManager` (solo discrimina el CTA en team) |
| `scope` | `'team' \| 'standalone'` | tipo de workspace activo |
| `tier` | `SubscriptionTier` | `coach.subscription_tier` (solo telemetria) |

`ctx` ademas trae `teamId`, `teamName` (para el header/back en team).

### 3.1.3 Como se resuelve el contexto (loader `getModulesContext`) — BACKEND

`getModulesContext` esta envuelto en `React.cache` (dedup por request). Pasos:

1. `createClient()` (cliente Supabase **user-scoped** — RLS authoritative; el loader NO usa service-role).
2. `getCoach()` — si no hay coach => `{ coachId: null, orgManaged: false, ctx: null }`.
3. `resolvePreferredWorkspace(supabase, coach.id)` — resuelve el **workspace activo** (separacion de flujos). Tipos posibles: `enterprise_coach`, `coach_team`, o standalone (ninguno).
4. `orgManaged` = `coach.subscription_status === 'org_managed' || workspace?.type === 'enterprise_coach'`.
5. `tier` = `coach.subscription_tier as SubscriptionTier`.
6. `killedByOperator` = `operatorKillMap()` — `{ key: isModuleKilledByOperator(key) }` para las 4 keys.

**Rama team** (`workspace.type === 'coach_team'`):
- `teamId = workspace.teamId`.
- En paralelo (`Promise.all`):
  - `supabase.from('teams').select('name, enabled_modules').eq('id', teamId).maybeSingle()` — lee SOLO `name` + `enabled_modules` (no `SELECT *`).
  - `isCurrentUserTeamManager(supabase, teamId)`.
- Devuelve `ctx` con `scope: 'team'`, `teamName` (fallback `'Equipo'`), `isTeamManager`, `modules: normalizeModules(team?.enabled_modules)`.

**Rama standalone** (default):
- `supabase.from('coaches').select('enabled_modules').eq('id', coach.id).maybeSingle()`.
- Devuelve `ctx` con `scope: 'standalone'`, `teamId: null`, `teamName: null`, `isTeamManager: false`, `modules: normalizeModules(own?.enabled_modules)`.

> Nota enterprise: la rama `enterprise_coach` no produce un `ctx` propio aqui; se captura por `orgManaged` y la pagina redirige. Por eso `ModulesContext.scope` es solo `'team' | 'standalone'`.

**Normalizacion (defensiva contra jsonb sucio):**
- `normalizeModules(value)`: `Object.fromEntries(MODULE_KEYS.map(k => [k, obj[k] === true]))`. Cualquier key extra en el jsonb se descarta; cualquier valor no-`true` => `false`. Garantiza un mapa exacto de las 4 keys.
- `operatorKillMap()`: idem pero con `isModuleKilledByOperator(k)`.

### 3.1.4 Render del catalogo (`ModulesForm`) — que muestra

`'use client'`. Itera `MODULE_CATALOG_KEYS` (orden fijo: cardio, movement_assessment, body_composition, nutrition_exchanges). Por cada `key`:

- `entry = MODULE_CATALOG[key]` (label, pitch, surfaces — copy canonica, ver tabla 3.1.5).
- `active = modules[key] === true` (entitlement del workspace).
- `inMaintenance = active && killedByOperator[key] === true`.

Cada item renderiza:
1. `entry.label` + badge:
   - `active` => badge **Activo** (icono CheckCircle2).
   - no `active` => badge **Disponible** (icono Sparkles).
2. `entry.pitch` (parrafo de valor).
3. Lista `entry.surfaces` (donde viven las utilidades del modulo cuando esta activo).
4. Si `inMaintenance` => linea `Temporalmente en mantenimiento.` (icono Wrench).
5. Si **no** `active` => `<ModuleCta>` (CTA de desbloqueo contextual).

> Backend-relevante: **no hay form, ni `<Switch>`, ni server action, ni `onSubmit`**. Es puramente presentacional + telemetria de click. El catalogo NO escribe entitlements (3.0.2). Si el modulo ya esta activo, no muestra CTA (no hay nada que comprar).

### 3.1.5 Copy canonica del catalogo (`@eva/module-catalog`)

Cada `ModuleCatalogEntry` = `{ label, pitch, surfaces[] }`. Espanol latam neutro, indexado por key (i18n futuro = mapas de locale paralelos con las mismas keys; el paquete NO publica precios).

| key | label | pitch (resumen) | surfaces |
|---|---|---|---|
| `cardio` | Cardio / Resistencia | Prescribe cardio como fuerza: bloques por tiempo/ritmo/distancia con zonas de FC; alumno ejecuta con timers guiados, coach ve cumplimiento real. | Item Cardio en el menu · Bloques de cardio en el builder · Timers y registro de cardio en la app del alumno |
| `movement_assessment` | Evaluacion de movimiento | Screening de ingreso con 7 patrones + reporte semaforo para priorizar y mostrar evolucion; el diferenciador kine. | Item Movimiento en el menu (wizard 7 patrones + reporte semaforo) · Card de ultima evaluacion en ficha del alumno · Pestana de resultados en la app del alumno |
| `body_composition` | Composicion corporal | Antropometria ISAK de 5 componentes + bioimpedancia en un mismo historial; mediciones comparables sin planillas. | Seccion Composicion corporal en ficha del alumno (pestanas BIA / ISAK) |
| `nutrition_exchanges` | Nutricion Pro | Plan de nutricion profesional: pautas por porciones e intercambios, plantillas reutilizables, micros avanzados y objetivos por composicion corporal; exportable a PDF con tu marca. | Modo Intercambios dentro del plan · Plantillas de plan reutilizables · Micronutrientes avanzados · Objetivos por composicion corporal · PDF de pauta con tu marca |

### 3.1.6 Aviso de mantenimiento (kill-switch en la UI)

- Condicion: `active && killedByOperator[key]` (el coach LO tiene comprado pero el operador apago el modulo via `EVA_DISABLED_MODULES`).
- Muestra `Temporalmente en mantenimiento.` (Wrench, tono ambar).
- El item sigue mostrando badge **Activo** (no degrada a Disponible — el entitlement no se perdio, solo esta pausado a nivel plataforma).
- No hay CTA en ese item (sigue siendo `active`).

### 3.1.7 CTA de desbloqueo (`ModuleCta`) — contextual + telemetria

Solo se renderiza para modulos **no activos**. Logica de ramas:

1. **Team, miembro NO gestor** (`scope === 'team' && !isTeamManager`): sin link. Texto guia: *"Pidelo al owner de tu equipo."* No captura evento (no hay click target).
2. **Team, gestor** (owner / co-gestor): `<a href={MAILTO_TEAM}>` -> `mailto:contacto@eva-app.cl?subject=Modulos para mi equipo`. CTA conversacional: *"Conversemos — contacto@eva-app.cl"*. onClick => `onCapture(key, 'team_manager_mailto', tier)`.
3. **Standalone con self-service ON** (`SELF_SERVICE_ADDONS_ENABLED === true`): `<a href="/coach/subscription#addons">` *"Agregar"*. onClick => `onCapture(key, 'self_service', tier)`. Es la ruta de compra real (el gate de dinero vive server-side en `/api/payments/addons*`, NO aqui).
4. **Standalone con self-service OFF** (CTA interino / fail-closed): `<a href={MAILTO_STANDALONE}>` -> `mailto:contacto@eva-app.cl?subject=Quiero activar un modulo` *"Agregar — escribenos a contacto@eva-app.cl"*. onClick => `onCapture(key, 'standalone_mailto', tier)`.

**`SELF_SERVICE_ADDONS_ENABLED`** (constants.ts): `process.env.NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED === 'true'` (igualdad estricta, fail-closed). Es **build-time inlined** (cliente+servidor) => el flip exige redeploy. Preview = `'true'`; Prod = sin setear (OFF) hasta el lanzamiento.

**Telemetria (`useCaptureModuleInterest`, `lib/posthog/events.ts`):** devuelve un callback `(moduleKey, ctaContext, tier)` que hace `ph?.capture('module_interest_cta_clicked', { module_key, cta_context, tier })`. PostHog ya esta gated por consentimiento de cookies (no-op sin `ph`); cero servicios nuevos. El evento NO toca DB ni billing — es puro analytics de intencion.

### 3.1.8 Modulos en TEAM — "quien puede"

- El catalogo lee `teams.enabled_modules` del **team activo** (pool-wins: los modulos del team NO se mezclan con los standalone del coach).
- `isTeamManager` (owner o co-gestor) determina **solo** el CTA: gestor => mailto conversacional; miembro comun => "Pidelo al owner". No habilita edicion (sigue siendo read-only/compra-only; en team el escritor es el CEO via `/admin/teams`).
- El back-link en team apunta a `/coach/team` (label "Mi Equipo"); en standalone a `/coach/settings` (label "Opciones").

---

## 3.2 FUNCIONES — `/coach/settings/funciones`

La capa **ENABLED** (preferencias). El coach (standalone) o el owner/gestor (team) eligen QUE superficies de cada dominio se muestran (Nutricion hoy; extensible a Ejercicios/Planes). Modelo `visible = ENTITLED AND ENABLED`: este panel **solo escribe ENABLED**. La preferencia solo achica; nunca prende algo no entitled.

Archivos:
- `apps/web/src/app/coach/settings/funciones/page.tsx` (RSC)
- `apps/web/src/app/coach/settings/funciones/_data/funciones.queries.ts` (loader)
- `apps/web/src/app/coach/settings/_actions/feature-prefs.actions.ts` (`'use server'`, escritura)
- Panel: `@/components/coach/FeaturePrefsPanel` (`'use client'`)
- Config pura + resolver: `@eva/feature-prefs`
- Entitlement: `@/services/entitlements.service` (`hasModule`)

### 3.2.1 Guards de la pagina (RSC `page.tsx`)

`CoachFuncionesPage` llama `getFuncionesContext()`:

1. `if (!coachId) redirect('/login')`.
2. `if (orgManaged) redirect('/coach/dashboard')` — sin zona Funciones en enterprise v1.
3. `if (!ctx) redirect(orgManaged ? '/coach/dashboard' : '/coach/team')` — sin ctx => miembro de team sin gestion (no hay editor que mostrar) => lo manda a `/coach/team`.

Render condicional por scope:
- `scope === 'team'` => `<FeaturePrefsPanel scope="team" teamId={ctx.teamId!} domains={ctx.domains} />`.
- standalone => `<FeaturePrefsPanel scope="coach" domains={ctx.domains} />`.

Back-link/label: team => `/coach/team` "Mi Equipo"; standalone => `/coach/settings` "Opciones". Metadata: `title: 'Funciones | EVA'`.

### 3.2.2 Datos que llegan (`FuncionesContext`) — BACKEND

`getFuncionesContext` (envuelto en `React.cache`) devuelve `{ coachId, orgManaged, ctx }`. El `ctx` (`FuncionesContext`):

```
{ scope: 'coach' | 'team', teamId: string|null, teamName: string|null, domains: DomainFuncionesConfig[] }
```

`DomainFuncionesConfig` (una entrada por dominio de `FEATURE_DOMAINS`; hoy solo `nutrition`):

| Campo | Tipo | Que es |
|---|---|---|
| `domain` | `FeatureDomain` | `'nutrition'` |
| `label` | string | de `DOMAIN_META[domain].label` (`'Nutricion'`) |
| `sections` | `readonly FeatureSection[]` | catalogo de secciones del dominio (de `@eva/feature-prefs`) |
| `preset` | `Preset` | preset **guardado**, coercionado (`normalizePreset`, default `'basico'`) |
| `sectionPrefs` | `SectionPrefs` | mapa **crudo** guardado del jsonb `sections` (incluye `_enabled`) |
| `entitledByModule` | `Partial<Record<ModuleKey, boolean>>` | entitlement por modulo que gatea ese dominio (fail-closed) |

> Clave: el loader devuelve el ESTADO CRUDO del editor (preset + mapa `sections` tal cual estan guardados), no la visibilidad resuelta. El panel necesita lo crudo para hidratar el valor EXACTO de cada toggle (un toggle apagado debe verse apagado, no "resuelto a default"). El resolver `resolveSections` (que SI resuelve visibilidad efectiva) se usa en las superficies de render, no aqui.

### 3.2.3 Como resuelve el loader (`getFuncionesContext`) — DOBLE CLIENTE

Usa **dos clientes Supabase**:
- `userDb = await createClient()` — user-scoped (RLS). Para leer `teams.name` y resolver workspace/manager.
- `serviceDb = createServiceRoleClient()` — **service-role**. Para leer las filas de `*_feature_prefs` y para computar entitlement con `hasModule`.

Pasos:
1. `getCoach()` — si no => `{ coachId: null, orgManaged: false, ctx: null }`.
2. `resolvePreferredWorkspace(userDb, coach.id)`.
3. `orgManaged` (igual que en Modulos). Si `orgManaged` => `{ orgManaged: true, ctx: null }` (la pagina redirige).
4. **Rama team** (`workspace.type === 'coach_team'`):
   - En paralelo: `userDb.from('teams').select('name')`, `isCurrentUserTeamManager(userDb, teamId)`, y `resolveDomains(serviceDb, { teamId }, fetchPrefs)` donde `fetchPrefs(domain)` lee `team_feature_prefs.select('preset, sections').eq('team_id').eq('domain').maybeSingle()` (service-role).
   - **Si `!isManager` => `ctx: null`** (un miembro comun no debe ver el editor; ademas la RLS lo bloquearia al escribir — ocultar el editor evita un falso affordance).
   - Devuelve `scope: 'team'`, `teamId`, `teamName` (fallback `'Equipo'`), `domains`.
5. **Rama standalone** (default):
   - `resolveDomains(serviceDb, { coachId: coach.id }, fetchPrefs)` con `fetchPrefs(domain)` leyendo `coach_feature_prefs.select('preset, sections').eq('coach_id').eq('domain').maybeSingle()`.
   - Devuelve `scope: 'coach'`, `teamId: null`, `domains`.

**`resolveDomains`** itera `DOMAIN_KEYS` (las keys de `FEATURE_DOMAINS`). Por dominio, en paralelo:
- `fetchPrefs(domain)` (callback inyectado, tipado por tabla; se inyecta para evitar que un helper generico colapse la union de columnas `coach_id`/`team_id` de PostgREST y rompa el `.eq`).
- `resolveEntitlement(serviceDb, gatingModulesFor(sections), ctx)` — solo los modulos que gatean ESE dominio.

`gatingModulesFor(sections)` = set de `section.requiresModule` no nulos. Para nutrition => `{ nutrition_exchanges, body_composition }` (las dos secciones Pro). `resolveEntitlement` hace `hasModule(db, key, ctx)` por cada uno => mapa `entitledByModule` fail-closed (incluye kill-switch). En team el ctx es `{ teamId }` (pool-wins); en standalone `{ coachId }`.

Coerciones defensivas: `normalizePreset(prefs?.preset)` (desconocido/ausente => `'basico'`); `asSections(prefs?.sections)` (no-objeto/array => `{}`).

> Extensibilidad: agregar un dominio a `FEATURE_DOMAINS` (+ su entrada en `DOMAIN_META`/`DOMAIN_ICONS`) lo hace aparecer automaticamente como una nueva "area" sin tocar el loader ni el panel.

### 3.2.4 Catalogo de secciones del dominio Nutricion (`@eva/feature-prefs`)

Cada `FeatureSection` = `{ key, label, tooltip, core, defaultOn, requiresModule, presets }`. `presets` es un `PresetMap { basico, intermedio, profesional }` (en que presets aparece prendida).

| key | label | core | requiresModule | basico | inter. | prof. |
|---|---|---|---|---|---|---|
| `plan` | Plan | si | null | ON | ON | ON |
| `macros` | Macros | si | null | ON | ON | ON |
| `adherence` | Adherencia | si | null | ON | ON | ON |
| `micros_base` | Micronutrientes (base) | no | null | off | ON | ON |
| `plate` | Metodo del plato | no | null | off | ON | ON |
| `off_plan_log` | Registro fuera de plan | no | null | off | ON | ON |
| `notes` | Notas | no | null | off | ON | ON |
| `habits` | Habitos | no | null | off | ON | ON |
| `recipes` | Recetas | no | null | off | ON | ON |
| `shopping` | Lista de compras | no | null | off | ON | ON |
| `micros_advanced` | Micronutrientes (avanzado) | no | **`nutrition_exchanges`** | off | off | ON |
| `goals_bodycomp` | Objetivos por composicion corporal | no | **`body_composition`** | off | off | ON |

- **core** (`plan`/`macros`/`adherence`): SIEMPRE ON, no toggleables, no gateables. El panel las salta (`filter(s => !s.core)`).
- **opcionales gratis** (`micros_base`...`shopping`): entran en `intermedio`/`profesional`.
- **Pro** (`micros_advanced`, `goals_bodycomp`): entran solo en `profesional` y requieren modulo. Si no hay entitlement => LOCKED (ver 3.2.7).

### 3.2.5 Presets, master switch y el resolver (modelo de visibilidad)

- `PRESETS = ['basico','intermedio','profesional']` (menor a mayor amplitud). Default seguro `'basico'`. La migracion dropeo el CHECK de DB => la app valida con Zod (`presetSchema = z.enum(PRESETS)`).
- **Master switch del dominio:** key reservada `DOMAIN_ENABLED_KEY = '_enabled'` dentro del jsonb `sections`. Si vale `false` => el dominio entero se oculta (menu + TODAS las secciones, incluidas las `core`). Ausente => `true` (no rompe coaches backfilleados). NO es una `NutritionSectionKey` — nunca se itera como seccion.
- **Resolver puro `resolveSections(input)`** (usado en superficies de render, no en este editor):
  - Honra primero `resolveDomainEnabled` (master switch): si `false`, TODAS las secciones (incluso core) => `false`.
  - Con dominio prendido, por seccion: `core` => `true`; si no, `entitled = requiresModule ? entitledByModule[req] === true : true`; `wants = clientSections?.[k] ?? base?.[k] ?? section.presets[preset]` (base = team si `useTeamBase`, si no coach); resultado = `core || (entitled && wants)`.
  - **Invariante de oro:** la preferencia NUNCA amplia. Si la seccion no esta entitled, ningun `wants=true` la prende.
- Resolucion de capas (most-specific-wins): `clientSections` (override por-alumno) > base (team si team, coach si standalone) > preset default.

### 3.2.6 Panel `FeaturePrefsPanel` — que muestra y como interactua

`'use client'`. Recibe `{ scope, teamId?, domains }`. Renderiza un `<DomainFuncionesGroup>` por dominio (con 1 dominio => expandido y no colapsable; con varios => cada area colapsable). Al pie, **una sola vez**, el explainer Modulos-vs-Funciones (texto en 3.0.4).

Cada `DomainFuncionesGroup` (estado optimista LOCAL, borrador):
1. **Selector de PRESET** (radiogroup, 3 opciones: Basico/Intermedio/Profesional con hint). Cambiar preset => `applyPreset(next)` re-siembra las secciones a su default (`sectionsForPreset(toggleable, next)`) **preservando** el master switch `_enabled`.
2. **Master switch del dominio** (`<Switch>` sobre `_enabled`): "Mostrar Nutricion". Texto: *"Apaga esto si no usas el modulo. Oculta el menu y su contenido para ti y tus alumnos. No borra ningun dato."* `toggleDomain(next)` => set `_enabled`.
3. **Expander "Ajustar secciones"** (deshabilitado si `_enabled === false`): lista de secciones toggleables (skip core). Por seccion:
   - badge **Base** (`requiresModule === null`) o **Pro** (`requiresModule !== null`) + `InfoTooltip` con `section.tooltip`.
   - `entitled = requiresModule ? config.entitledByModule[req] === true : true`; `locked = isPro && !entitled`.
   - `checked = (sections[key] ?? section.presets[preset]) === true` (pref guardada/borrador, si no el default del preset).
   - Si **locked**: en vez de `<Switch>`, un link `<a href="/coach/subscription#addons">` "Desbloquear con {label del modulo}" (icono Lock) + sublinea con el nombre del modulo (`MODULE_CATALOG[req].label`). Es decir, una seccion Pro sin entitlement NO se puede prender desde aqui — enruta a comprar.
   - Si no locked: `<Switch checked onCheckedChange={toggleSection}>`.

**Modelo de guardado (borrador):** los toggles/preset son SOLO estado local (no persisten por toggle, para no re-renderizar a cada rato). Se commitean UNA vez con **"Guardar configuracion"** (boton habilitado solo si `dirty`). `dirty` = `preset !== saved.preset || JSON.stringify(sections) !== JSON.stringify(saved.sections)`. Hay boton **"Descartar"** (revierte al ultimo guardado). En error de la action NO revierte (el coach reintenta); en exito actualiza `saved` y toast "Funciones guardadas."

### 3.2.7 Locks Pro + CTA — la diferencia con Modulos

- Las secciones Pro sin entitlement aparecen **LOCKED** con CTA "Desbloquear con {modulo}" -> `/coach/subscription#addons` (la superficie de compra, NO la pantalla Modulos).
- Aunque el usuario manipulara el estado, la preferencia **no puede** prender una seccion no entitled: el resolver server-side (`resolveSections`) la deja en `false` (entitled gate). Es decir el lock es defensa en profundidad, no la unica barrera.

### 3.2.8 Escritura de preferencias (`feature-prefs.actions.ts`) — BACKEND

Archivo `'use server'` — exporta SOLO async functions (3 actions) + tipos (alias locales seguros). Modelo: escriben SOLO la capa ENABLED. Invariantes load-bearing (en el header del archivo):
- Un toggle escribe SOLO `*_feature_prefs.sections`/`preset`. **NUNCA** toca `coaches.enabled_modules` ni `teams.enabled_modules` (compra-only: lo pisaria el trigger D1 y/o regalaria features pagas).
- Un toggle **NUNCA** borra/anula filas `nutrition_*` (CASCADE de meal-logs = data-loss). Apagar = ocultar, no borrar.

**Validacion Zod v4 (cliente + servidor):**
- `presetSchema = z.enum(PRESETS)`.
- `sectionsSchema`: `z.record(z.string(), z.boolean())` + `.refine` que rechaza keys fuera del allowlist `ALLOWED_SECTION_KEYS` (= todas las section keys de todos los dominios + `_enabled`). Gotcha documentado: `z.record(z.enum(...))` en Zod v4 es EXHAUSTIVO (exige TODAS las keys) => se usa `z.string()` + refine para aceptar un subconjunto parcial (el panel manda solo lo que toca + `_enabled`). Valores no-boolean se rechazan.

**Autorizacion (anti-IDOR):** el `coachId`/sesion viene SIEMPRE de `supabase.auth.getClaims().sub`, **nunca del body**. El upsert corre como el **usuario autenticado** (no service-role) => la **RLS es authoritative**.

Las 3 actions:

| Action | Tabla | onConflict (PK) | RLS gate | Tiene `preset`? | revalidatePath |
|---|---|---|---|---|---|
| `setCoachFeaturePrefs` | `coach_feature_prefs` | `coach_id,domain` | `coach_feature_prefs_owner_all` (owner) | si | `/coach/settings`, `/coach/dashboard`(layout) |
| `setTeamFeaturePrefs` | `team_feature_prefs` | `team_id,domain` | manager via `current_user_managed_team_ids` | si | `/coach/settings`, `/coach/team`, `/coach/dashboard`(layout) |
| `setClientFeaturePrefs` | `client_feature_prefs` | `client_id,domain` | coach owner / managers de pool | **no** (solo override de secciones) | `/coach/settings`, `/coach/clients/[clientId]`(page), `/coach/dashboard`(layout) |

- `setCoachFeaturePrefs(input)`: parsea `coachPrefsSchema` `{ domain, preset, sections }`; deriva `coachId` de la sesion; upsert `{ coach_id, domain, preset, sections, updated_at }`.
- `setTeamFeaturePrefs(input)`: parsea `teamPrefsSchema` `{ teamId(uuid), domain, preset, sections }`; valida autenticacion; upsert `{ team_id, domain, preset, sections, updated_at }`. **El `teamId` SI viene del input** pero la RLS (manager) es el unico gate de quien puede escribir ese team — un coach comun del pool no pasa. En modo team la capa "coach" se reemplaza por esta.
- `setClientFeaturePrefs(input)`: parsea `clientPrefsSchema` `{ clientId(uuid), domain, sections }` (sin `preset`); upsert `{ client_id, domain, sections, updated_at }`. Capa mas especifica (override por-alumno). No se invoca desde `/coach/settings/funciones` (vive en la ficha del alumno) pero comparte el archivo de actions.

Retorno: `{ success: true }` o `{ error: string, fieldErrors? }`. El panel solo invoca `setCoachFeaturePrefs`/`setTeamFeaturePrefs` segun `scope`, con `sections as Record<string, boolean>`.

### 3.2.9 Funciones en TEAM vs standalone (resumen backend)

- **Standalone:** edita `coach_feature_prefs` propio (PK `coach_id,domain`). Entitlement por `{ coachId }`.
- **Team:** solo el gestor (owner/co-gestor) ve y edita; escribe `team_feature_prefs` (PK `team_id,domain`). Entitlement por `{ teamId }` (pool-wins). El miembro comun: la pagina lo redirige a `/coach/team` (`ctx === null`).
- **Enterprise:** sin zona Funciones (orgManaged => redirect).

---

## 3.3 Notas para el rediseno (feature parity — que NO romper)

1. **Modulos NO escribe.** Cualquier rediseno que ponga un switch/boton "activar" en `/coach/settings/modules` produce `42501` (columna compra-only). El catalogo debe seguir enrutando a comprar (`/coach/subscription#addons` self-service, o mailto interino), no auto-activar.
2. **`SELF_SERVICE_ADDONS_ENABLED` es build-time** (NEXT_PUBLIC). El CTA standalone cambia de "Agregar -> #addons" (ON) a "mailto" (OFF) segun esa env; el flip exige redeploy. No asumir un estado fijo.
3. **El kill-switch de operador** (`EVA_DISABLED_MODULES`) debe seguir mostrandose como "Activo + en mantenimiento" (no como Disponible) y el gate real sigue siendo `hasModule` server-side.
4. **Funciones solo achica.** El resolver `resolveSections` es la barrera real: las secciones Pro LOCKED no se prenden ni manipulando el estado. Mantener el lock + CTA a `#addons`.
5. **Borrador con un solo commit.** Los toggles de Funciones NO persisten por interaccion; se guardan con "Guardar configuracion" (idempotente por upsert con onConflict PK `(scope, domain)`).
6. **Apagar = ocultar, jamas borrar.** Ninguna preferencia puede borrar filas `nutrition_*` (CASCADE meal-logs = data-loss). El master switch `_enabled` solo oculta.
7. **anti-IDOR / RLS authoritative.** `coachId` siempre de la sesion; el upsert corre como el usuario (no service-role). En team, la RLS de manager es el gate.
8. **Telemetria:** preservar `module_interest_cta_clicked` con `{ module_key, cta_context, tier }` en los 3 contextos de CTA (`standalone_mailto`/`team_manager_mailto`/`self_service`).
9. **Extensibilidad por dominio:** Funciones se arma desde `FEATURE_DOMAINS`/`DOMAIN_META`/`DOMAIN_ICONS`. Un dominio nuevo aparece solo. El rediseno no debe hardcodear "Nutricion".
10. **Cross-link Modulos <-> Funciones:** el explainer del panel define la relacion conceptual; el lock de Funciones enruta a `#addons` (compra), no a Modulos. Mantener la separacion entitlement (compra) vs feature-pref (mostrar).
