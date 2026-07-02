# 1. Vision general, arquitectura, modelo de datos y gating

> Documento de rediseno con feature parity del **menu Nutricion del coach** de EVA. Esta seccion es la base: que es el menu, como fluye la data (capas), el modelo de datos completo (tablas, columnas clave, relaciones, la cascada critica), y las TRES capas de gating (tier, modulo de pago, preferencia de dominio/secciones). Enfasis en backend: que llega, que se calcula, donde se guarda, que servicio/RPC/tabla toca, e invariantes de seguridad de datos.

---

## 1.1 Que es el menu Nutricion del coach

El menu Nutricion es la superficie donde el coach **arma planes de alimentacion** (plantillas reutilizables y planes por alumno), gestiona su **biblioteca de alimentos**, y — si tiene el modulo de pago **Nutricion Pro** (`nutrition_exchanges`) — prescribe por **porciones/intercambios** (metodo chileno), con variantes de dia, equivalencias y PDF con marca.

Es una feature **Pro+**: el tier `free`/`starter` NO la ve (gate `canUseNutrition`, ver §1.5). Pro/Elite (y legacy growth/scale) si.

### Mapa de rutas / superficies (raiz `apps/web/src/app/coach/nutrition-plans/`)

| Ruta | Archivo | Que es |
|------|---------|--------|
| `/coach/nutrition-plans` | `page.tsx` → `_components/NutritionHub.tsx` | **Hub** con 4 tabs (Alumnos / Plantillas / Alimentos / Recetas, segun el codigo del hub). RSC que carga 6 datasets en paralelo. Si `!canUseNutrition` muestra el **upgrade gate** (paywall Pro). |
| `/coach/nutrition-plans/new` | `new/` | **PlanBuilder modo plantilla** (crear plantilla nueva). |
| `/coach/nutrition-plans/[templateId]/edit` | `[templateId]/edit/` | **PlanBuilder modo plantilla** (editar plantilla existente). |
| `/coach/nutrition-plans/client/[clientId]` | `client/[clientId]/` | **PlanBuilder modo plan-de-alumno** + capa **Pro** (intercambios/micros avanzados/objetivos por composicion). Unico lugar donde se arma el plan real del alumno. |
| `/coach/nutrition-plans/exchanges` | `exchanges/page.tsx` | **Gate del modulo Pro**: con modulo OFF muestra `ModuleOffNotice` (aviso amable hacia el catalogo); con modulo ON redirige a `/coach/nutrition-plans` (el editor de intercambios vive DENTRO del builder del plan, no aca). |
| `/coach/foods` | (fuera de este dir) | Biblioteca de alimentos (vista dedicada). |
| `/coach/meal-groups` | (fuera de este dir) | Grupos / comidas guardadas. |
| `/coach/recipes` | (fuera de este dir) | Recetas. |

> El hub tambien incrusta `OrgTemplatesSection` (plantillas a nivel organizacion, solo en workspace enterprise) por encima del `NutritionHub`.

### Estructura interna del modulo

- `_data/` — queries `React.cache` (read path): `nutrition-page.queries.ts`, `nutrition-coach.queries.ts`, `recipes.queries.ts`, `exchange.queries.ts`, `plan-builder-mappers.ts`.
- `_actions/` — server actions (write path): `nutrition-coach.actions.ts`, `food-library.actions.ts`, `recipes.actions.ts`, `recipe-photo.actions.ts`, `exchange.actions.ts`.
- `_components/` — UI `'use client'`: `NutritionHub`, `ActivePlansBoard`, `AssignModal`, `TemplateLibrary`, `FoodLibrary`, `OrgTemplatesSection`, `PlanBuilder/`, `recipes/`, `NutritionOnboarding`, `CoachNutritionGuideDialog`, etc.

---

## 1.2 Las capas (data flow obligatorio)

El menu respeta los 4 pilares (Clean Architecture + Feature-First). El flujo de lectura y el de escritura difieren:

**Lectura (RSC → render):**

```
page.tsx (RSC)
  └─ _data/*.queries.ts        (React.cache, getClaims local del JWT)
       └─ services/nutrition*    (logica: NutritionService, nutrition-utils, exchanges svc)
            └─ infrastructure/db/nutrition.repository.ts + exchanges.repository.ts
                 └─ Supabase (PostgREST + RLS)
```

> Matiz real (no purista): varias queries del read-path del hub (`nutrition-coach.queries.ts`) hablan **PostgREST directo** con `createClient()` (cliente request-scoped, RLS = techo) en vez de pasar por el repository — es el patron vigente del modulo. El repository (`nutrition.repository.ts`) expone helpers tipados (`findNutritionPlansByCoach`, `findNutritionTemplatesByCoach`, `findNutritionMealsByPlan`, `findFoods`, `findRecipeById`) que se usan en otros call-sites. El "service de aplicacion" real es `NutritionService` (clase) para los write-paths complejos (crear/actualizar/propagar/duplicar plantilla) y el conjunto de funciones del modulo `nutrition-exchanges`.

**Escritura (server action → DB → revalidate):**

```
_actions/*.actions.ts ('use server', Zod en cliente y servidor)
  └─ services/nutrition.service.ts (NutritionService) | services/nutrition-exchanges/*
       └─ infrastructure/db/*.repository.ts + RPCs Supabase (apply_nutrition_template_to_client)
            └─ revalidatePath()
```

**Servicios de nutricion (en `apps/web/src/services/`):**

| Archivo | Rol |
|---------|-----|
| `nutrition.service.ts` (`NutritionService`) | CRUD de plantillas + **propagacion** a alumnos (RPC) + duplicar. |
| `nutrition-propagation.reconcile.ts` (`reconcileMeals`) | Funcion **PURA** del diff de comidas para la propagacion (cascade-safety). Testeada. |
| `nutrition-intake.service.ts` | Registro de ingesta. |
| `nutrition-notes.service.ts` | Notas privadas del coach + comentarios por comida. |
| `nutrition-recipes.service.ts` | Recetas. |
| `nutrition-shopping.service.ts` | Lista de compras derivada del plan. |
| `nutrient-targets.service.ts` | Objetivos de nutrientes. |
| `nutrition-exchanges/nutrition-exchanges.service.ts` | Modulo Pro: gating por recurso, targets de intercambio, variantes de dia, equivalencias, bitacora PDF, bundle del alumno. |
| `nutrition-exchanges/exchange-calc.ts` | Calculo PURO de macros por intercambios (Σ porciones × ref del grupo). |
| `nutrition-exchanges/meal-reconcile.ts` | Reconcile de comidas para el modo intercambios. |
| `feature-prefs.service.ts` | Resolver server-side de `visible = ENTITLED AND ENABLED` + master switch del dominio. |
| `entitlements.service.ts` | `hasModule` / `assertModule` (gate de los 4 modulos de pago). |

**Repositories (en `apps/web/src/infrastructure/db/`):**
- `nutrition.repository.ts` — helpers tipados sobre `nutrition_plans`, `nutrition_plan_templates`, `nutrition_meals`, `foods`, `recipes`.
- `exchanges.repository.ts` — todo el modulo Pro: `findPlanModuleContext`, grupos por scope, targets, variantes, equivalencias, `setPlanMode`, `setPlanLastEditedBy`, etc.

---

## 1.3 Modelo de datos completo

### Tablas core de nutricion (flujo "gramos", el default intacto)

#### `nutrition_plans` — plan del alumno (o draft)
Columnas: `id`, `client_id` (NOT NULL — siempre pertenece a un alumno), `coach_id` (NOT NULL), `org_id` (nullable, scope enterprise), `template_id` (nullable → de que plantilla nacio), `template_version_id` (nullable), `name`, `instructions`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`, `is_active` (bool), `is_custom` (bool nullable — `true` = editado a mano, no sincronizado con la plantilla), `plan_mode` (text, default `'grams'` | `'exchanges'` — switch del modulo Pro), `last_edited_by_coach_id` (nullable — awareness en pool/team), `created_at`, `updated_at`.

> **No hay tabla separada de plantilla vs plan a este nivel**: `nutrition_plans` es SIEMPRE el plan de un alumno. La plantilla vive en `nutrition_plan_templates` (tabla aparte). Ver §1.4 para la distincion plantilla vs plan.

#### `nutrition_meals` — comidas de un plan
Columnas: `id`, `plan_id` (FK → `nutrition_plans`, **ON DELETE CASCADE**), `name`, `description` (NOT NULL, default `''`), `order_index` (int — orden y clave de matching en propagacion), `day_of_week` (int nullable, 1=Lun…7=Dom; null = todos los dias), `day_variant_id` (FK → `nutrition_plan_day_variants`, nullable — modulo Pro), `created_at`.

#### `food_items` — alimentos dentro de una comida
Columnas: `id`, `meal_id` (FK → `nutrition_meals`, **ON DELETE CASCADE**), `food_id` (FK → `foods`, ON DELETE CASCADE), `quantity` (numeric), `unit` (text nullable, `'g'|'un'|'ml'`), `swap_options` (jsonb — hasta 8 alternativas con macros snapshoteadas, ver schema Zod).

#### `nutrition_meal_logs` — registro de adherencia del alumno (LA TABLA CRITICA)
Columnas: `id`, `daily_log_id` (FK → `daily_nutrition_logs`, **ON DELETE CASCADE**), `meal_id` (FK → `nutrition_meals`, **ON DELETE CASCADE**), `is_completed` (bool), `consumed_quantity` (numeric nullable, **0–100 = porcentaje** del plan de esa comida consumido; NULL = modo binario 100% si completed), `satisfaction_score` (int nullable, 1|2|3), `created_at`. UNIQUE `(daily_log_id, meal_id)`.

> **INVARIANTE CRITICA (data-loss):** `nutrition_meal_logs.meal_id → nutrition_meals(id)` es **ON DELETE CASCADE** (confirmado en `00000000000001_baseline.sql:2289`). **Borrar una comida elimina el historial de adherencia del alumno.** Cualquier rediseno que reordene/borre comidas DEBE preservar las comidas con logs. La propagacion lo respeta (ver §1.3, propagacion).

#### `daily_nutrition_logs` — un dia de registro de un alumno contra un plan
Columnas: `id`, `client_id` (FK → `clients`), `plan_id` (FK → `nutrition_plans`), `log_date` (date), y un **snapshot de objetivos del dia**: `plan_name_at_log`, `target_calories_at_log`, `target_protein_at_log`, `target_carbs_at_log`, `target_fats_at_log` (congela las metas vigentes ese dia para historico fiel aunque el plan cambie despues), `created_at`.

#### `foods` — catalogo de alimentos (system + custom del coach + org)
Columnas: `id`, `coach_id` (nullable — NULL = alimento system/global; set = custom del coach), `org_id` (nullable — alimento de organizacion), `name`, `name_search` (normalizado para busqueda ilike), `brand`, `category` (proteina/carbohidrato/grasa/lacteo/fruta/verdura/legumbre/bebida/snack/otro), `serving_size` (numeric), `serving_unit` (text, `'g'|'un'|'ml'`), `calories`, `protein_g`, `carbs_g`, `fats_g`, `is_liquid` (bool), **medida casera**: `household_grams` / `household_label` (display sobre gramos), **micros**: `fiber_g`, `sugar_g`, `sodium_mg`, `saturated_fat_g`, `unsaturated_fat_g` (nullable). **Mapeo a intercambios (modulo Pro):** `exchange_group_id` (FK → `exchange_groups`, nullable), `exchange_portion_grams`, `exchange_portion_label` (medida casera de la porcion de intercambio).

> El concepto `ExchangeFoodEquivalence` del dominio (`exchange.types.ts`) NO es una tabla aparte: se materializa con las columnas `exchange_group_id` / `exchange_portion_grams` / `exchange_portion_label` de `foods`. `findExchangeFoodsByGroupIds` las lee.

#### `nutrition_plan_templates` — plantilla reutilizable
Columnas: `id`, `coach_id` (nullable), `org_id` (nullable), `team_id` (nullable), `name`, `description`, `instructions`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`, `goal_type` (text nullable — objetivo), `tags` (text[] nullable), `is_favorite` (bool nullable), `plan_mode` (text, default `'grams'`), `created_at`, `updated_at`.

#### `template_meals` → `template_meal_groups` → `saved_meals` → `saved_meal_items`
Cadena de la **estructura de comidas de una plantilla** (mas indireccion que el plan del alumno, que usa `nutrition_meals`/`food_items` directo):
- `template_meals`: comida de la plantilla (`template_id` FK ON DELETE CASCADE, `name`, `description`, `order_index`, `day_of_week`).
- `template_meal_groups`: une `template_meal_id` con `saved_meal_id` (`order_index`).
- `saved_meals`: comida guardada reutilizable (biblioteca del coach: `coach_id`, `org_id`, `name`). En la practica, al guardar una plantilla se crean `saved_meals` "internos" con nombre `Internal_<comida>_<timestamp>` (ver `NutritionService.createOrUpdateTemplateFromJson`).
- `saved_meal_items`: alimentos del saved_meal (`saved_meal_id` FK ON DELETE CASCADE, `food_id`, `quantity`, `unit`, `swap_options` jsonb).

> Este es tambien el catalogo de "comidas guardadas" / `/coach/meal-groups`: `getCoachSavedMeals` lee `saved_meals` + `saved_meal_items`.

#### `recipes` — recetas del coach
Columnas: `id`, `coach_id` (nullable), `name`, `description`, `instructions`, `image_url`, `prep_time_minutes`, `calories`, `protein_g`, `carbs_g`, `fats_g`, `source_api` / `source_api_id` (origen Edamam u otro), `created_at`, `updated_at`. (Existe ademas `nutrition_recipes`, tabla relacionada del servicio de recetas.)

#### `org_nutrition_templates` — plantillas a nivel organizacion (enterprise)
Columnas leidas por `getCoachOrgNutritionTemplates`: `id`, `org_id`, `name`, `description`, `goal_type`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`, `instructions`, `meal_names` (jsonb: `{ name, order_index, description? }[]`), `created_at`. Solo se cargan si el workspace activo es enterprise.

#### Tablas auxiliares de nutricion (descubiertas)
- `nutrition_plan_cycles` — ciclos de plan (A/B, periodizacion): `blocks` jsonb, `last_applied_template_id`, `last_applied_week`, `start_date`, `is_active`. (El cron de ciclos invoca el RPC de propagacion con `p_coach`.)
- `nutrition_plan_history` — snapshots historicos del plan (`snapshot` jsonb, `label`, `source`).
- `nutrition_meal_food_swaps` — swaps de alimentos hechos por el alumno por dia (FKs a `clients`/`daily_log`/`meal`/`foods` todas ON DELETE CASCADE).
- `food_swap_groups` — grupos de intercambio de alimentos del coach (`food_ids` text[]).
- `meal_completions` — VIEW de solo lectura derivada de `nutrition_meal_logs` completados (reemplazo de tabla legacy).

### Tablas del modulo Pro `nutrition_exchanges`

#### `exchange_groups` — grupos de intercambio (catalogo)
Columnas: `id`, `coach_id` (nullable), `team_id` (nullable), `is_system` (bool — grupo global EVA), `slug`, `code` (chip corto: 'C','P','F','V','LAC','ARL','SP','G','LEG' — termino de dominio, NO se traduce), `name`, **macros de referencia POR PORCION**: `ref_calories`, `ref_protein_g`, `ref_carbs_g`, `ref_fats_g`, `macros_confirmed` (bool — `false` ⇒ UI/PDF muestran "macros referenciales"), `color` (hex nullable, null = paleta derivada por `sort_order`), `sort_order`, `composed_of` (jsonb nullable — grupo compuesto, ej. Legumbres = 1P + 1C), `deleted_at` (soft delete), `created_at`, `updated_at`.

Scope 3-vias: system (coach_id+team_id NULL) + propios del coach + del team activo.

#### `meal_exchange_targets` — porciones prescritas por grupo en una comida
Columnas: `id`, `meal_id` (FK → `nutrition_meals`), `exchange_group_id` (FK → `exchange_groups`), `portions` (numeric >0 hasta 99, permite 0.5), `notes` (nullable), `created_at`. Es lo que el coach prescribe en modo intercambios.

#### `nutrition_plan_day_variants` — variantes de dia de una pauta
Columnas: `id`, `plan_id` (FK → `nutrition_plans`), `name` ('Descanso' | 'Entreno AM' …), `sort_order`, `created_at`. Maximo 6 variantes por pauta. Una comida apunta a una variante via `nutrition_meals.day_variant_id`.

#### Equivalencias alimento→porcion
Materializadas en `foods` (`exchange_group_id`, `exchange_portion_grams`, `exchange_portion_label`), no en tabla propia.

---

## 1.4 Plantilla vs plan-de-alumno a nivel de datos

| Concepto | Tabla raiz | Estructura de comidas | Identificador de "es plantilla" |
|----------|-----------|------------------------|-------------------------------|
| **Plantilla** (reutilizable, por objetivo) | `nutrition_plan_templates` | `template_meals` → `template_meal_groups` → `saved_meals` → `saved_meal_items` | Vive en su propia tabla; NO tiene `client_id`. Se scopea por `coach_id` (+ `org_id`/`team_id`). |
| **Plan de alumno** (asignado, ejecutable) | `nutrition_plans` | `nutrition_meals` → `food_items` | Tiene `client_id` NOT NULL. `is_active` marca el plan vigente. `template_id` apunta a la plantilla origen. `is_custom = true` = editado a mano (no sincroniza con la plantilla). |

Reglas de negocio observadas:
- Un **plan activo SIN comidas es un DRAFT** (auto-creado al "Asignar"): se trata como "sin plan" hasta tener ≥1 comida. No aparece en el board ni lo ve el alumno. (`planHasMeals`, filtro `nutrition_meals(count) > 0` en `page.tsx`, `getActiveClientPlans`, `getCoachClients`.)
- `is_active` distingue el plan vigente del historico. `order_index` ordena comidas (y es la clave de matching estable en la propagacion).
- `day_of_week` (1–7, null = todos) define en que dias aplica una comida; `nutritionMealAppliesOnIsoYmdInSantiago` lo evalua para adherencia.
- `plan_mode` (`'grams'` default | `'exchanges'`) es el switch del modulo Pro **por plan/alumno** (no por plantilla en uso).

### Propagacion de plantilla → planes de alumnos (backend critico)

`NutritionService.propagateTemplateChanges`:
1. Resuelve los clientes afectados = seleccionados + los que ya tienen plan activo con ese `template_id` (`is_custom=false`).
2. Valida que **todos** pertenezcan al workspace activo (RLS + check explicito; lanza si alguno no pertenece — anti-IDOR).
3. Por alumno, decide IN-PLACE vs nuevo plan:
   - **Con plan existente** (mismo `template_id`): actualiza IN-PLACE (mismo `plan_id`) → preserva `daily_nutrition_logs` historicos. Matching de comidas por `order_index`. **Cascade-safety:** averigua que comidas huerfanas tienen logs ANTES de borrar (`nutrition_meal_logs`), y la pure-fn testeada **`reconcileMeals`** SOLO borra comidas SIN logs (las que tienen historial se conservan). El diff (`toDelete`/`toUpdate`/`toInsert`) se aplica ATOMICAMENTE via RPC `apply_nutrition_template_to_client` (1 statement = 1 transaccion por alumno).
   - **Cliente nuevo** para la plantilla: `plan_id` fresco (sin logs → seguro), `mode: 'create'`, inserta todas las comidas.
4. Por-alumno atomico: si uno falla NO aborta a los demas; se acumula y se reporta para reintentar (re-correr es idempotente por `order_index`).
5. `assertTemplateMealsAreComplete`: lanza si la plantilla tiene comidas sin alimentos.

> **Invariante de oro de la propagacion (data-loss):** el match por `order_index` + `reconcileMeals` garantiza que jamas se borra una comida con logs. Limitacion conocida (registrada en CLAUDE.md): reordenar puede sobreescribir contenido de una comida con logs (no la borra) — fix completo requiere `template_meal_id` estable. Cualquier rediseno de la propagacion debe preservar el test de orfandad.

> Seguridad del RPC: `p_coach` SOLO lo honra `apply_nutrition_template_to_client` bajo service_role (cron de ciclos sin `auth.uid()`); en sesion de coach gana `auth.uid()` y `p_coach` se ignora (sin impersonacion).

---

## 1.5 Gating — tres capas combinadas (backend)

La visibilidad de una superficie/seccion de nutricion es el AND de tres capas. El modelo canonico (de `@eva/feature-prefs`): **`visible = ENTITLED (billing, fail-closed) AND ENABLED (preferencia coach/team/cliente)`**. La preferencia SOLO ACHICA, nunca amplia (invariante de oro).

### Capa 1 — TIER (`canUseNutrition`)
- Fuente: `getTierCapabilities(tier).canUseNutrition` en `@eva/tiers` (re-exportado por `lib/constants`).
- Valores: `free=false`, `starter=false`, `pro=true`, `elite=true`, `growth=true`, `scale=true` (legacy true).
- **Donde se aplica:** guard en `page.tsx` del hub. Si `!capabilities.canUseNutrition` → renderiza el **upgrade gate** (paywall Pro con precio mensual/anual de `getTierPriceClp('pro', …)`, mockup, features, CTA a `/coach/subscription?upgrade=pro`, y `UpgradeGateTracker gate="nutrition"`). No se carga nada de la DB de nutricion.
- Es el "upgrade driver": free/starter ven el paywall, no el producto.

### Capa 2 — MODULO de pago `nutrition_exchanges` (entitlement, fail-closed)
- Fuente: `hasModule(db, 'nutrition_exchanges', ctx)` / `assertModule(...)` en `entitlements.service.ts`.
- Resolucion por **contexto del RECURSO (regla LOCKED)**: si el alumno/plan es de un **pool/team** ⇒ decide `teams.enabled_modules` (el POOL gana, no es union); si no ⇒ `coaches.enabled_modules` del coach dueno del plan. Default OFF (`{}`). Los modulos del team NO se filtran a los clientes standalone del coach.
- Sobre el entitlement del tenant esta el **kill-switch de operador** `EVA_DISABLED_MODULES` (CSV, requiere redeploy): apaga el modulo para TODOS aunque el tenant lo tenga ON (`isModuleKilledByOperator`).
- **Escritura del entitlement es compra-only** (service-role): `coaches.enabled_modules` se sincroniza via el trigger D1 desde `coach_addons`; nadie escribe el jsonb directo (CLAUDE.md). El modulo se llama comercialmente **"Nutricion Pro"** ($9.990/mes, `ADDON_CONFIG.nutrition_exchanges`).
- **Donde se aplica server-side:**
  - `/coach/nutrition-plans/exchanges/page.tsx`: gate por workspace (`hasModule` con `teamId`/`coachId`); enterprise o modulo OFF → `ModuleOffNotice`; ON → redirect al hub.
  - `assertExchangesModuleForPlan(db, planId)`: carga `findPlanModuleContext` y lanza si el modulo no esta habilitado para ese contexto. Lo invocan **todas** las acciones del modulo (guardar targets, set mode, variantes de dia, bitacora PDF).
  - `getStudentExchangeBundle`: fail-closed; si `plan_mode !== 'exchanges'` o el modulo no esta habilitado para el contexto del alumno → `EMPTY_BUNDLE`.
- Coercion server-side: `verifyGroupsVisibleToActor` valida que todo `exchangeGroupId` del payload resuelva contra los grupos VISIBLES al actor (el FK no valida visibilidad — esta verificacion si). Defensa en profundidad: `groupMatchesTenant` (un id cross-tenant copiado jamas resuelve).

### Capa 3 — PREFERENCIA (feature-prefs: dominio + secciones)
- Fuente: `feature-prefs.service.ts` (resolver server-side) sobre el paquete puro `@eva/feature-prefs`. Gobernado por el flag de Edge Config **`FEATURE_PREFS_ENABLED`** (fail-OPEN: ausente/false/Edge caido ⇒ se IGNORAN las prefs = comportamiento de HOY, "mostrar todo lo entitled" — grandfathering).
- **Master switch del DOMINIO** (`resolveNutritionDomainEnabled`): key reservada `_enabled` del jsonb `sections`. Si `false`, el menu de Nutricion **entero** y todo su contenido se ocultan (incluidas las secciones `core`). Resolucion mas-especifico-gana: `clientSections._enabled ?? base._enabled ?? true` (base = team si `useTeamBase`, si no coach). **Donde se aplica:** en `page.tsx` del hub, `if (!nutritionDomainEnabled) redirect('/coach/dashboard')` — atrapa refresh/visita directa aunque el menu este oculto (render-only, NO borra data). No mira entitlement (es pura preferencia).
- **Secciones del dominio nutricion** (`resolveFeaturePrefs` → `Record<NutritionSectionKey, boolean>`), catalogo en `@eva/feature-prefs#NUTRITION_SECTIONS`:
  - **core (siempre ON, no toggleables):** `plan`, `macros`, `adherence`.
  - **opcionales gratis (default-OFF, entran en preset `intermedio`):** `micros_base`, `plate`, `off_plan_log`, `notes`, `habits`, `recipes`, `shopping`.
  - **gateadas por modulo (preset `profesional`):** `micros_advanced` (requiere `nutrition_exchanges`), `goals_bodycomp` (requiere `body_composition`).
- Resolucion por seccion (con dominio prendido): `resultado = core || (entitled && wants)`, donde `entitled = requiresModule ? entitledByModule[requiresModule] === true : true` y `wants = clientSections[k] ?? base[k] ?? section.presets[preset]`. Capas de preferencia: **coach o team** (base, `useTeamBase = clientTeamId && !clientOrgId`) + **override por-alumno** (`client_feature_prefs`, mas especifico). La preferencia SOLO ACHICA: si la seccion no esta entitled, ningun `wants=true` la prende (lo garantiza `resolveSections`).
- Tablas de preferencias: `coach_feature_prefs`, `team_feature_prefs`, `client_feature_prefs` (cada una: `domain`, `preset` solo coach/team, `sections` jsonb). Lectura: base + entitlement via **service-role**; el override del alumno se lee request-scoped (RLS techo). El override del alumno usa `resolveClientFeaturePrefsOverrideContext` (devuelve `baseEffective` + `override` crudo + `entitledByModule` + master switch base/override) para pintar el tri-state "heredar / mostrar / ocultar".
- Conveniencia: `getNutritionProEnabledForClient` = `resolveFeaturePrefs(...).micros_advanced === true` (reemplaza al legacy del mismo nombre, fail-closed + React.cache).

### Como se combinan (orden efectivo en el hub)
1. **Tier** (`canUseNutrition`): si NO → paywall, fin (no se carga DB).
2. **Master switch del dominio** (`resolveNutritionDomainEnabled`): si NO → `redirect('/coach/dashboard')`.
3. Se cargan los 6 datasets (§1.6) y se renderiza el hub.
4. Dentro de cada plan/alumno, la **capa 2 (modulo)** decide si aparece el modo intercambios / micros avanzados, y la **capa 3 (secciones)** decide que sub-superficies muestra `resolveFeaturePrefs` para ese alumno.

> Resumen de "donde se aplica": **page guard** (tier + dominio en `page.tsx`; modulo en `exchanges/page.tsx`) + **`assertModule` server-side** en cada accion del modulo + **fail-closed** en el bundle del alumno. La UI solo espeja para show/hide; el gate de dinero es 100% server-side.

---

## 1.6 Que datos llegan al abrir el hub

Tras pasar los guards de tier y dominio, `page.tsx` resuelve el **workspace activo** (`getPreferredWorkspaceForRender(coachId)`) que define `orgId` (enterprise), `activeTeamId` (team) o standalone, y carga **6 datasets en paralelo** (`Promise.all`):

| # | Llamada | Devuelve | Notas backend |
|---|---------|----------|---------------|
| 1 | `getCoachTemplates(coachId, orgId)` | Plantillas del coach con comidas anidadas (`template_meals` → groups → `saved_meals` → items + macros de cada `food`) y **alumnos asignados** (de `nutrition_plans` con `is_active`). Filtra `assigned_clients` a planes activos. | Scope org via `applyOrgScope`. Orden por `created_at` desc; comidas por `order_index`. |
| 2 | `getActivePlansBoardData(coachId, scope)` | Board "War Room": planes activos + **sparkline 7d de adherencia** + **kcal consumidas hoy** (zona Santiago) + `dailyTargetCalories`. Tipo `ActivePlanBoardRow[]`. | Internamente `getActiveClientPlans` (scope 3-vias, tope `ACTIVE_PLANS_BOARD_LIMIT=500`, excluye drafts sin comidas). Calcula adherencia con `nutritionMealAppliesOnIsoYmdInSantiago` (denom = comidas aplicables ese dia, num = logs completados) y kcal con `calculateConsumedMacrosWithCompletionFallback` + `portionPctMapFromMealLogs`. Lee `daily_nutrition_logs` (7d) + `nutrition_meals` por plan. |
| 3 | `getCoachClients(coachId, scope)` | Alumnos del workspace con sus `nutrition_plans (id, name, is_active, nutrition_meals(count))`. | `applyClientScope` 3-vias. La page deriva `assignClients` (alumnos + plan activo con comidas) y `clientsWithoutPlan` (sin plan activo con comidas). |
| 4 | `getFoodLibrary(coachId, { page:0, pageSize:120, orgId })` | `{ foods, total }` — catalogo system + custom del coach (o + org foods en enterprise), paginado, con `count: 'exact'`. | `foodWorkspaceFilter` arma el `.or()` segun standalone vs enterprise. Soporta `search` (ilike sobre `name_search` normalizado), `category`, `maxCalories`, y `mine` (solo custom del coach, SERVER-SIDE). RLS sigue siendo el techo. |
| 5 | `orgId ? getCoachOrgNutritionTemplates(orgId) : []` | Plantillas a nivel organizacion (`org_nutrition_templates`) con `meal_names` jsonb. | Solo en workspace enterprise; se renderiza en `OrgTemplatesSection` por encima del hub. |
| 6 | `getCoachRecipes({ coachId, teamId: activeTeamId })` | Recetas del coach/team. | De `recipes.queries.ts`. |

Todo con `React.cache` (dedup por request) y `getClaims()` (verificacion local del JWT ES256, sin round-trip a `/user`; el proxy ya valido la sesion). El cliente DB es request-scoped → **RLS coach/team/org es el techo de todo el read-path** del hub.

### Scoping 3-vias (invariante de aislamiento, sin cruce de contextos)
- **enterprise** (`orgId` set): `coach_id = me AND org_id = orgId`.
- **team/pool** (`activeTeamId` set): `org_id IS NULL AND` alumnos del pool (planes pueden ser de OTRO coach del team — colaborativo; RLS valida la fila). En `getActiveClientPlans` el team resuelve `getPoolClientIds` y filtra por `client_id IN (...)`.
- **standalone**: `coach_id = me AND org_id IS NULL AND team_id IS NULL`. Usa **allowlist** de clientes standalone (no denylist por embed: si RLS oculta el client, un denylist `!team_id` incluiria el plan — fail-open). Mismo patron que workout.

---

## 1.7 Invariantes de seguridad de datos (resumen para el rediseno)

1. **Cascada destructiva:** `nutrition_meal_logs.meal_id → nutrition_meals ON DELETE CASCADE`. Borrar/recrear comidas borra adherencia. La propagacion (`reconcileMeals`) NUNCA borra comidas con logs. Preservar.
2. **Gate de dinero 100% server-side:** tier (`canUseNutrition`) + modulo (`assertModule`/`hasModule`, fail-closed, pool-wins, kill-switch). La UI solo espeja.
3. **Preferencia solo achica:** `@eva/feature-prefs` garantiza que ninguna pref prende lo no-entitled; flag `FEATURE_PREFS_ENABLED` fail-OPEN (sin flag = mostrar todo lo entitled). `enabled_modules` es compra-only (service-role).
4. **Aislamiento por workspace:** scope 3-vias (standalone/team/enterprise) en TODA query; la propagacion valida pertenencia explicita (anti-IDOR). RLS request-scoped es el techo; service-role solo donde el resolver de prefs lo necesita (catalogo de grupos/flags del tenant).
5. **Snapshot de objetivos:** `daily_nutrition_logs.target_*_at_log` + `plan_name_at_log` congelan las metas del dia → el historico es fiel aunque el plan cambie.
6. **Modulo Pro context-aware:** gating por el contexto del RECURSO (plan/alumno), no del actor; `getStudentExchangeBundle` fail-closed; bitacora PDF (`pdf_generate`) SOLO para coach en contexto team (Ley 21.719).
