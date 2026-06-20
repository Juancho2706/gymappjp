# Plan mejorado — Consolidacion de menus + Preferencias del coach (EVA)

> Estado: PLAN (reemplaza/actualiza el borrador `docs/audits/nutrition-feature-visibility-{design,PLAN}-2026-06.md`).
> Fecha: 2026-06-18. Branch sugerido: `feat/menus-consolidacion-prefs`.
> Este plan esta anclado en codigo real (no en supuestos) y absorbe la auditoria de codigo,
> la investigacion 2026 y la revision de 14 roles.
> **Es un DESVIO consciente del overhaul de nutricion** — ver §9 para como se retoma.

---

## 0. TL;DR para el fundador (no tecnico)

Hoy el coach ve **demasiados menus** (8 a 10 botones, peor en celular donde quedan apretados en una
sola barra que se desliza de lado y esconde la mitad). Vamos a hacer dos cosas:

1. **Ordenar el menu** (consolidar): juntar "Mi Marca", "Suscripcion" y un nuevo boton "Opciones Coach"
   bajo un solo hub **"Opciones"**, y meter "Ejercicios" como un boton dentro de "Programas".
   En celular, copiar el patron que ya usa la app nativa (4 botones + "Mas"). Esto solo es ordenar; no
   cambia lo que el coach puede hacer.
2. **Darle al coach un panel de "Funciones"**: prender/apagar que partes de la app ven el coach y sus
   alumnos. Lo que apaga **se oculta, nunca se borra** (los datos quedan). Y nunca puede prender algo
   que no pago — eso sigue mandado por la facturacion.

**Regla de oro:** ningun coach actual puede abrir la app y encontrar que "le desaparecieron" funciones
que ya usaba. Por eso el paso clave es un **respaldo (backfill)** que deja prendido a cada coach
exactamente lo que ya estaba usando. Si no hacemos esto, rompemos a los coaches que mas usan EVA — y
eso es justo lo que el fundador prohibio.

---

## 1. El problema real (no es "un menu nuevo")

El pedido NO es agregar una pantalla. Son **cuatro problemas distintos** bajo un mismo paraguas:

- **(A) Clutter de menus**, sobre todo en responsive/mobile. El coach standalone ve 8 menus base
  (hasta 10 con modulos). En celular todos viven en **una sola barra horizontal que se desliza** y
  esconde ~la mitad fuera de pantalla. Esto es UX, no facturacion.
- **(B) El coach no puede elegir** que modulos/funciones (incluso funciones base como Nutricion) ve
  el o sus alumnos. Hoy: si esta "entitled" se muestra; el coach no puede ocultarlo.
- **(C) Falta un hub "Opciones"** con 3 botones claros (Mi Marca / Suscripcion / Opciones Coach) que
  recoja la cola de cuenta/ajustes que hoy esta dispersa.
- **(D) Ejemplo concreto de consolidacion:** "Ejercicios" deja de ser menu top-level y pasa a un boton
  "Lista de ejercicios" dentro de Programas.

**Restriccion dura del fundador:** NO romper lo que los coaches actuales usan. La revision de 14 roles
es unanime en que el riesgo #1 del borrador es justamente violar esto de forma silenciosa (ver §5).

**Decisiones cerradas (locked):** 3 presets (`basico`/`intermedio`/`profesional`); micros base
gratis-pero-OFF; preferencias por-coach Y por-alumno; modulos Pro mostrados bloqueados con upsell;
storage generico `coach_feature_prefs`/`client_feature_prefs` por `domain`; modelo
`visible = ENTITLED (billing, server-side) AND ENABLED (toggle coach)`, la preferencia **solo achica**.

**Decisiones del founder (2026-06-18, cerradas):**
1. **Fase A (declutter sin DB) se hace PRIMERO** como entrega independiente (quick-win), antes de B/C.
2. **Backfill por uso obligatorio** — coaches existentes conservan ON lo que ya usan; nuevos = `basico`. NO romper a nadie.
3. **Toggles top-level + secciones** — Movida 4 ENTRA en v1: el coach puede ocultar menus top-level enteros (ej. "Nutricion") ademas de secciones internas (gancho `featurePref` en `getVisibleNavItems`, con gate server-side intacto).
4. **Teams INCLUIDO** (un-deferido, ver §4.9): en modo team la capa "coach" se reemplaza por la capa **TEAM** — el **dueno + co-gestores** controlan `team_feature_prefs` (keyed `team_id`) = baseline para TODOS los coaches/alumnos del team + los overrides por-alumno. Coaches comunes del pool **heredan (read-only)**. Esto reemplaza la "capa de grupo" generica diferida con la entidad `teams` REAL (mejor). Capa de cohorte ARBITRARIA (no-team) sigue diferida.
Pendientes (no bloquean Fase A): #4 default-rewrite policy, #5 cleanup duplicados Nutricion, #6 telemetria.

---

## 2. Inventario REAL de menus y settings hoy (del audit) + diagnostico de clutter

### 2.1 Registro de nav (unica fuente de verdad)

`apps/web/src/components/coach/coach-nav.ts` → `NAV_MODULES` (12 entradas). Renderizado por
`apps/web/src/components/coach/CoachSidebar.tsx` (desktop = sidebar vertical; mobile = barra inferior
horizontal). Filtro puro `getVisibleNavItems(ctx)` + particion `splitNavItems` (`core` vs `modules`).
**Verificado en codigo:** el registro hoy solo conoce el gancho `entitlement` (linea 40) — NO existe
ningun gancho `preference`. Esto es load-bearing para §3 y §4.

| key | label / short | href | contexts | entitlement |
|---|---|---|---|---|
| dashboard | Dashboard / Inicio | `/coach/dashboard` | all | — |
| clients | Alumnos | `/coach/clients` | all | — |
| team | Equipo / Team | `/coach/team` | coach_team | — |
| programs | Programas / Planes | `/coach/workout-programs` | all | — |
| **exercises** | **Ejercicios / Ejer.** | **`/coach/exercises`** | **all** | **— (target de merge)** |
| nutrition | Nutricion / Nutri | `/coach/nutrition-plans` | all | — |
| brand | **Mi Marca** / Marca | `/coach/settings` | coach_standalone | — |
| settings_team | **Opciones** / Opcs. | `/coach/settings` | coach_team | — |
| billing | Suscripcion / Plan | `/coach/subscription` | coach_standalone | — |
| support | Soporte / Ayuda | `/coach/support` | all | — |
| cardio | Cardio | `/coach/cardio` | standalone+team | `cardio` |
| movement | Movimiento / Movim. | `/coach/movement` | standalone+team | `movement_assessment` |

Extra fuera del registro: link "Panel empresa" → `/org/{slug}` (solo org owner/admin, desktop).
`REACTIVATE_NAV_ITEM` colapsa todo a un solo boton "Reactivar" si el status esta bloqueado.

### 2.2 Hub `/coach/settings` (YA existe — NO es greenfield)

`apps/web/src/app/coach/settings/page.tsx`:
- **metadata title YA = "Opciones"** (no es nuevo).
- **team_managed:** YA renderiza un **hub de 3 cards** (Modulos / Areas / Mi Equipo) + DangerZone — es
  el patron visual exacto que el fundador quiere.
- **standalone con branding:** titulo "Personaliza la app de tus alumnos" + cards (Modulos, Areas) +
  `LogoUploadForm` + `BrandSettingsForm` + DangerZone (branding **inline**, no como card).
- **standalone sin branding (free):** pantalla de upsell + DangerZone.

Sub-paginas: `/coach/settings/modules` (`ModulesForm`, **catalogo READ-ONLY** de entitlements — sin
toggles, compra-only), `/coach/settings/areas` (`AreasManager`), `/coach/settings/preview`.

### 2.3 Rutas alcanzables fuera del nav (duplicacion / muertas)

- `/coach/foods` (Alimentos) — **duplica** la tab "Alimentos" del hub de Nutricion (mismo `FoodLibrary`).
- `/coach/recipes` → `redirect('/coach/foods')` (muerto/legacy); `/coach/recipes/[recipeId]` aun vive.
- `/coach/templates` → `redirect('/coach/workout-programs')` (muerto/legacy).
- `/coach/nutrition-plans/exchanges` → superficie "Nutricion Pro" (gated por modulo).
- Nutricion es a su vez un hub con tabs internas (Plantillas, Activos, **Alimentos**, **Recetas**).

### 2.4 Diagnostico de clutter (cuantificado)

| Superficie | Menus | Peor caso (modulos ON) | Escondidos |
|---|---|---|---|
| Web desktop (standalone) | 8 | 10 | ninguno (lista vertical) |
| **Web responsive (bottom bar)** | **8** | **10** | **~mitad fuera de pantalla, scroll horizontal — PEOR** |
| App nativa (primary tabs) | 4 | 4 | 6 detras de "Mas" |
| App nativa (total destinos) | 10 | 10 | — |

**El peor punto es la barra inferior web responsive** (`CoachSidebar.tsx` ~lineas 188-306): 8-10 tiles
planos en un solo scroll horizontal, sin "Mas", sin agrupacion, labels truncados ("Ejer.", "Nutri").
La **app nativa ya resolvio esto** (`apps/mobile/components/coach/CoachMobileChrome.tsx`:
`PRIMARY_TABS = ['home','clientes','builder','nutricion']` + overflow "Mas"). La web NO. Cada modulo
prendido **agrega otro tile** a ese scroll plano → la preferencia ENABLE es tambien palanca de declutter.

---

## 3. La consolidacion concreta (lista priorizada de movidas)

Cada movida con before/after y por que. Las movidas 1-3 son **IA pura sin migracion** (Fase A,
shippeable sola). Las movidas 4-5 dependen del sistema de prefs (Fase C).

### Movida 1 — Hub "Opciones" con 3 botones (RESTRUCTURE, no greenfield) [P0 de producto]

- **Before:** standalone tiene 2 menus separados (`brand` "Mi Marca" + `billing` "Suscripcion"); el
  branding vive inline en `/coach/settings`. team ya tiene un hub de 3 cards.
- **After:** **un solo menu "Opciones"** → `/coach/settings` con 3 cards grandes:
  1. **Mi Marca** → branding (mover `BrandSettingsForm`+`LogoUploadForm` a `/coach/settings/brand`).
  2. **Suscripcion** → `/coach/subscription` (sin cambios funcionales).
  3. **Opciones Coach** → NUEVA, hosting la zona "Funciones" (§4) + link al catalogo Modulos existente.
- **Por que:** colapsa 2 menus → 1 en web; reusa el layout de 3-cards que YA existe en team_managed.
- **CORRECCION del audit (naming clash):** la pagina YA se llama "Opciones" (metadata + key
  `settings_team`). El boton "Opciones Coach" choca con ese nombre. **Decision de nombres:** hub =
  **"Opciones"**; tercer card/zona de toggles = **"Funciones"** (NO "Opciones Coach"). Y un explainer
  de una linea distinguiendo **"Modulos"** (lo que compraste, read-only) de **"Funciones"** (lo que
  muestras, toggles gratis). Reusar copy de `@eva/module-catalog` para badges Pro/upsell.
- **Archivos:** `apps/web/src/app/coach/settings/page.tsx` (restructure a hub 3-card en standalone),
  nuevo `apps/web/src/app/coach/settings/brand/page.tsx`, `coach-nav.ts` (colapsar `brand`+`billing`
  en una entrada "Opciones").

### Movida 2 — Ejercicios → boton dentro de Programas [bajo riesgo, ejemplo canonico]

- **Before:** `exercises` es menu top-level en los 3 contextos. Audit confirma **0 links entrantes**
  in-app a `/coach/exercises` (solo el sidebar).
- **After:** quitar la entrada `exercises` de `NAV_MODULES`; agregar boton **"Lista de ejercicios"**
  (`variant="outline"`/secundario, color distinto) en `LibraryHeader.tsx` junto a "Nueva plantilla".
  **Mantener la ruta `/coach/exercises` viva** (bookmarks, deep links, y la app alumno
  `/c/[coach_slug]/exercises` la referencia).
- **Por que:** patron 2026 de "contextual entry point" — la libreria se consume MIENTRAS construyes
  programas. Quita 1 tile del bar sin romper navegacion.
- **CORRECCION del audit:** `coach-nav.ts` es puro y **unit-testeado** (`coach-nav.test.ts`) y hay
  specs E2E que asertan titulos de nav (`collectNavTitles`, `aside nav a[title]`). Quitar la entrada
  **rompe esos tests** → actualizarlos en el MISMO cambio. Ademas mirror en `apps/mobile`
  (`CoachMobileChrome` NAV_META + overflow): quitar `ejercicios` del overflow, dejar el screen
  registrado para deep links.
- **Archivos:** `coach-nav.ts`, `apps/web/src/app/coach/workout-programs/.../LibraryHeader.tsx`
  (o `WorkoutProgramsClient.tsx`), `coach-nav.test.ts`, specs E2E de nav, `apps/mobile/...`.

### Movida 3 — Barra responsive web: patron "4 primary + Mas" [P0 del fundador, mayor impacto en clutter]

- **Before:** `CoachSidebar.tsx` <md vuelca 8-10 tiles en scroll horizontal plano.
- **After:** ~4 primary (Inicio · Alumnos · Planes · Nutri) + **"Mas"** (sheet/overflow) con la cola
  (Opciones, Soporte, modulos entitled). Reusar el split `core`/`modules` de `splitNavItems` y
  espejar `PRIMARY_TABS` de `CoachMobileChrome.tsx`.
- **Por que:** investigacion 2026 unanime (cap 3-5 tabs + "Mas"; nunca scroll plano de 10). Es **el**
  cambio que materializa el goal #1 del fundador y es **independiente del backend de prefs**.
- **Archivos:** `apps/web/src/components/coach/CoachSidebar.tsx`.

### Movida 4 — Funciones nav-level (ocultar menu base entitled) [requiere prefs; ver §4.6]

- **Before:** `getVisibleNavItems` solo conoce `entitlement`; no se puede ocultar un menu base
  (ej. Nutricion para un coach solo-entrenamiento).
- **After:** gancho `featurePref` en `NavModule` paralelo a `entitlement`, como **tercera condicion
  AND** en `getVisibleNavItems` (despues de `contexts` y `entitlement`). Goal (2) del fundador lo
  implica explicitamente ("prefs sobre funciones base, incluida la nav").
- **Decision del founder (ver §10):** v1 = ¿solo toggles in-screen, o tambien nav top-level? Si nav,
  esta movida entra; si no, se documenta como out-of-scope explicito.

### Movida 5 — Reconciliar duplicados de Nutricion (cleanup oportunista)

- `/coach/foods` (orphan) → dejar Nutricion hub como unica entrada o redirigir.
- `/coach/recipes` y `/coach/templates` ya son redirects muertos → documentar/limpiar.
- **No bloqueante**; se hace si sobra tiempo en Fase A.

---

## 4. El sistema de preferencias (entitlement x preference)

### 4.1 Modelo conceptual (correcto, conservar)

Tres capas, todas server-authoritative (investigacion Orb/Stigg + codigo EVA):

- **ENTITLEMENT** = lo que el coach PUEDE usar (billing). Relacional: `coach_addons` (fuente de verdad)
  → trigger D1 `sync_coach_enabled_modules` → `coaches.enabled_modules`/`teams.enabled_modules` (jsonb).
  Resolucion real: `hasModule` / `hasExchangesModuleForClientContext` + `findPlanModuleContext` (el
  **pool de team GANA** sobre el coach del plan) + `applyOperatorKillSwitch` (`EVA_DISABLED_MODULES`).
- **PREFERENCE** = lo que el coach ELIGE mostrar entre lo permitido. JSONB en tablas laterales nuevas.
- **Regla efectiva por seccion:**
  `visible = ENTITLED(context-aware, pool-wins, NOT killed) AND ENABLED(coach pref) [AND client override]`.
  **La preferencia SOLO achica, nunca amplia.** Generaliza el patron fail-closed existente
  `getNutritionProEnabledForClient`.

### 4.2 Storage generico (ya en disco; necesita correcciones)

`supabase/migrations/20260618200000_feature_prefs.sql` (NO aplicada). `coach_feature_prefs`
(PK `coach_id,domain`) + `client_feature_prefs` (PK `client_id,domain`), ambas con `sections jsonb` +
`preset` (solo coach). **Tablas laterales con grants a nivel de tabla** → esquivan a proposito el
column-grant gotcha de `coaches`/`clients` (esas son compra-only). Esto es **correcto**.

### 4.3 Config `FeatureSections` (codigo, no DB)

Paquete **compartido `@eva/feature-prefs`** (mirror del patron `@eva/module-catalog`): config pura de
secciones por dominio, mapas de preset, hook `requiresModule?: ModuleKey`, y el resolver
framework-agnostico. **Razon (Mobile Eng P0):** `apps/mobile` habla PostgREST directo y tiene su propia
nav; si el resolver vive solo en web, web y nativo **divergen** (viola la regla anti-drift de
`apps/mobile/AGENTS.md`). Mapeo de secciones nutricion:

| Seccion | preset min | requiresModule |
|---|---|---|
| plan / macros / adherencia (core) | basico | — (siempre ON, no toggleable) |
| micros base | intermedio | — (gratis, OFF por default) |
| metodo del plato | intermedio | — |
| registro fuera de plan | intermedio | — |
| notas / habitos | intermedio | — |
| micros avanzados | profesional | `nutrition_exchanges` |
| **objetivos por composicion corporal** | profesional | **`body_composition`** (NO `nutrition_exchanges`) |

**CORRECCION del audit (Frontend P2):** `goals_bodycomp` mapea a `body_composition`, no a
`nutrition_exchanges` — son add-ons distintos. Cada `requiresModule` se valida contra `MODULE_KEYS`
en un test estilo `catalog.test.ts`.

### 4.4 Resolver server-side (generaliza `proEnabled`) — CORRECCIONES CRITICAS

**Borrador (malo):** `resolveNutritionPrefs(coachId, clientId?)` + `resolveProEntitlement(coachId)`.

**Corregido (consenso de 8 roles, P0):**

```
resolveFeaturePrefs({ domain, coachId, clientId?, planId?, clientTeamId?, clientOrgId? })
```

- Para filas `requiresModule`, llamar **verbatim** `hasExchangesModuleForClientContext` /
  `findPlanModuleContext` / `hasModule` (ya hacen pool-wins + kill-switch `EVA_DISABLED_MODULES`).
  **NO reimplementar** entitlement. Un resolver coachId-only mis-gatea a TODO alumno de pool (Movida
  es un team vivo) e ignora el kill-switch.
- `preset` nulo/desconocido → **`'basico'` deterministico** (nunca `presets[undefined]` → seccion OFF
  silenciosa). El write-action **Zod-valida** `preset ∈ {basico,intermedio,profesional}` y `domain`
  (la migracion dropeo el CHECK a proposito por genericidad → la app es ahora el unico validador).
- Merge most-specific-wins: `wants = clientPrefs?.[key] ?? coachPrefs.sections[key] ?? section.presets[preset]`.
- **Regla:** fila de alumno ausente = **heredar coach**, NO forzar OFF.
- Envolver en `React.cache` (como `getNutritionProEnabledForClient`).
- **Choke point unico:** ningun componente lee `prefs.sections` directo. Un solo resolver consumido en
  TODAS las superficies (incluido dashboard, §4.5).

### 4.5 Gating de widgets dependientes (no solo la tab)

Investigacion B2B2C + diff vivo: `MacroBar.tsx`, `ComplianceRing.tsx`, `NutritionDailySummary.tsx`,
`MacroRingSummary.tsx`, `ComplianceScoresCard.tsx`, `heroComplianceBundle.ts`, `dashboard.service.ts`
consumen nutricion y **NO pasan por** `NutritionShell`/`NutritionTabB5`. Si el coach apaga nutricion y
el hero ring del dashboard sigue renderizando → superficie "rota/cargando" (pitfall NN/g). El resolver
DEBE consumirse tambien en `heroComplianceBundle.ts`/`dashboard.service.ts`. **Distinguir OFF (ocultar
nav + widgets juntos) de ON-pero-vacio (empty state guiado, "registra una comida para ver tus
macros", nunca blanco).**

### 4.6 Funciones nav-level (gancho `featurePref`)

Si Movida 4 entra: agregar `featurePref?: { domain: string; sectionKey: string }` a `NavModule` y una
3ra condicion AND en `getVisibleNavItems` que lea el resolver. Mantener el gate server-side intacto
(`assertModule` por ruta) — ocultar en cliente NO es control de seguridad.

### 4.7 Presets y defaults (locked)

3 presets: `basico` (solo core), `intermedio` (micros base + plato + registro + notas), `profesional`
(+ micros avanzados + bodycomp si entitled). Default para **coach NUEVO** = `basico`. Default para
**coach EXISTENTE** = derivado de uso (§5, NO `basico` ciego). Onboarding: **una** pregunta, descartable,
default `intermedio` al saltar (no `basico`, para no despojar al coach "intermedio").

### 4.9 Capa TEAM (INCLUIDO — el dueno controla, decision founder 2026-06-18)

En modo team la capa "coach" se **reemplaza** por la capa TEAM (no se suman). Funciona igual que standalone, pero el toggler es el dueno del team, no cada coach.

- **Tabla nueva `team_feature_prefs`** (PK `team_id, domain`; `preset` + `sections jsonb`), paralela a `coach_feature_prefs`. **Escritura SOLO dueno + co-gestores** (RLS via `current_user_managed_team_ids()` / `is_team_manager`); coaches comunes del pool y alumnos **solo LEEN**. Backfill por uso a nivel team.
- **Entitlement** sigue siendo `teams.enabled_modules` (pool-wins, ya resuelto por `findPlanModuleContext`) — sin cambios.
- **Resolver en contexto team:** la base pasa a ser el team, no el coach →
  `wants = clientPrefs?.[key] ?? teamPrefs.sections[key] ?? section.presets[teamPrefs.preset]`.
  El `resolveFeaturePrefs` ya recibe `clientTeamId` (§4.4) → ramifica a `team_feature_prefs` cuando el cliente pertenece a un team.
- **Override por-alumno** lo setean dueno/co-gestores (no el coach comun) → `client_feature_prefs` escribible por managers del pool (ya cubierto por `client_feature_prefs_team_all` con `current_user_pool_client_ids()`).
- **UI:** en el area de administracion del team (`/coach/team` para el dueno, y/o `/admin/teams`), NO en cada coach. Reusa la misma zona "Funciones" con scope team.
- **RLS (extiende §8.1.3):** agregar `team_feature_prefs_client_read` (alumno de team lee la pref de SU team via `clients.team_id`) y `team_feature_prefs_pool_read` (coach del pool lee, no escribe). Sin esto el alumno/coach de team lee 0 → todo OFF.
- **Coexistencia:** un coach standalone usa `coach_feature_prefs`; un coach dentro de un team ignora su `coach_feature_prefs` y hereda `team_feature_prefs`. El resolver elige la capa por contexto (igual que el entitlement elige `coaches` vs `teams.enabled_modules`).

### 4.8 Correcciones del audit plan-vs-code (resumen)

| # | El borrador tenia | Correccion |
|---|---|---|
| 1 | resolver coachId-only | context-aware + reusa `hasExchangesModuleForClientContext` + kill-switch |
| 2 | `goals_bodycomp` → `nutrition_exchanges` | → `body_composition` |
| 3 | "Opciones" como hub nuevo | restructure de `/coach/settings` (ya titulado "Opciones"); naming clash → "Funciones" |
| 4 | sin backfill | backfill por uso obligatorio (§5) |
| 5 | trigger `nutrition_set_updated_at` en tablas genericas | renombrar `feature_prefs_set_updated_at` |
| 6 | 3 policies permissive stacked | consolidar SELECT; correr `get_advisors` |
| 7 | `preset` sin validacion | Zod en write + fallback `basico` en resolver |
| 8 | nav sin gancho preference | agregar `featurePref` (si Movida 4) |
| 9 | DROP TABLE incondicional | confirmar 0 filas + comentario defensivo |

**FALSA ALARMA corregida:** un agente de audit marco `clients.id = auth.uid()` como bug P0 (asumio
`clients.user_id`). **Verificado en codigo:** EVA usa identidad legacy `clients.id = auth.uid()` (no
existe `clients.user_id`; ver `20260613120000_bodycomp_student_self_select`). Las policies client-read
de la migracion son **CORRECTAS**. NO cambiarlas a `user_id` (rompria toda lectura de alumno). 3 de
los 14 roles (Architect, Backend, QA) confirmaron esto independientemente.

---

## 5. NO romper coaches actuales (el riesgo #1, unanime en 14 roles)

**El problema:** el modelo `visible = ENTITLED AND ENABLED` toma ENABLED de `coach_feature_prefs`. Al
deploy, **el 100% de los coaches actuales no tiene fila**. Si "sin fila" → `basico`, entonces cada
coach que hoy usa recetas/micros/plato/registro-fuera-de-plan/notas **pierde esas secciones** en su
app Y en la de sus alumnos, sin error, sin aviso, sin upsell. Se lee como "EVA borro mis funciones".
La investigacion (GitLab MR122467, fly.io) es categorica: **un default de columna/blob NO da
grandfathering a filas existentes — hay que backfillear explicitamente.**

### 5.1 Backfill por uso observado (OBLIGATORIO, mismo release que el schema)

Migracion **separada, batched, idempotente, forward-only** (re-ejecutable porque `merge_branch`
re-corre todo el historial). Logica por coach:
- Tiene `nutrition_meal_logs` / planes con micros/recetas/habitos poblados → seed `profesional` o
  `intermedio` + secciones que ya usa **ON**.
- Sin uso de nutricion → `basico`.
- **Separar el DDL (crear tablas) del DML (backfill)** — nunca UPDATE largo dentro del ALTER.
- Marcar **provenance** (`seeded_from = 'usage' | 'default'`) — evidencia para disputa/SERNAC (Legal).

`client_feature_prefs` NO necesita backfill si el resolver hereda del coach cuando falta la fila de
alumno (regla §4.4).

### 5.2 Grandfathering asimetrico + fail-open transicional

- **Existentes = ON** (lo que ya usan); **nuevos = OFF** (`basico`). Forma canonica de grandfathering
  (GrowthBook/Unleash).
- **Rollout seguro (CSM):** primero shippear el resolver con "sin fila = mostrar lo entitled actual"
  (fail-open a comportamiento de hoy); correr el backfill; SOLO despues flipear el default-para-nuevos
  a `basico`. Cero coach existente ve algo desaparecer.
- **Kill-switch del feature (DevOps/CSM/Fintech):** flag Edge Config `FEATURE_PREFS_ENABLED`
  (fail-OPEN: ausente/Edge caido → mostrar todo lo entitled, como hoy), espejo de `PROXY_USE_GETCLAIMS`.
  Reversa en segundos si el resolver se porta mal en prod.

### 5.3 Nada se esconde de golpe + comunicacion

- Al primer ingreso post-deploy a "Funciones": banner una linea — "Detectamos que ya usabas micros y
  recetas; los dejamos encendidos. Ajustalos cuando quieras." Usar el News bell existente para
  changelog. Convierte un cambio silencioso en momento de confianza.
- **Cambios de default futuros NO reescriben** prefs ya elegidas por un coach (leccion GitLab #512298).

### 5.4 Invariante de acceso del alumno (Legal P0 — Ley 19.628 / 21.719)

Los logs de nutricion/antropometria/check-in son datos personales (categoria salud) **del alumno**.
Un toggle del coach puede ocultar una **superficie de coaching** pero **nunca** el camino del alumno a
**ver/exportar sus propios datos**. El link Privacidad·ARCO (que `CoachSidebar` ya renderiza) debe
seguir alcanzable sin importar `client_feature_prefs`. Test: con todas las secciones de cliente OFF, el
alumno aun llega a su export de datos. "Ocultar-nunca-borrar" cubre retencion, NO acceso.

---

## 6. Best practices 2026 aplicadas (citadas)

- **Contextual entry point (Movida 2):** anidar una herramienta de soporte dentro de la pagina que
  sirve (libreria de ejercicios dentro del builder). [pencilandpaper.io/articles/ux-pattern-analysis-navigation]
- **Settings hub (Movida 1):** un ecosistema de configuracion con categorias logicas; evita el
  anti-patron "feature nueva → toggle tirado en una tab random". [memorable.design/saas-settings-page-examples]
- **Mobile nav 3-5 tabs + "Mas" (Movida 3):** cap duro 5 tabs; overflow "Mas" es el escape estandar;
  nunca scroll plano de 10; escalera responsive sidebar→rail→bottombar+Mas. [uxpin.com mobile-navigation; m2.material.io navigation-drawer; developer.android.com layout-and-nav-patterns]
- **Role-based nav:** mostrar solo lo que el rol concede; declutter en la fuente. [lollypop.design saas-navigation-menu-design]
- **Entitlement vs preference (separar capas):** entitlement = comercial/permiso; preference = UX;
  resolucion most-specific-wins. [withorb.com what-are-entitlements; stigg.io feature-gating]
- **Don't break existing users (§5):** un default NO back-popula filas viejas; backfill explicito;
  grandfather existentes-ON / nuevos-OFF; no auto-reescribir defaults futuros. [GitLab MR122467 + issue 512298; fly.io backfilling-data]
- **Toggle UX:** hide-don't-delete, dato se preserva y reaparece al re-activar; un padre apagado debe
  ocultar tambien widgets dependientes; on-pero-vacio = empty state guiado, nunca blanco. [Everfit/Kajabi help docs; nngroup.com empty-state-interface-design]
- **Un-entitled = upsell card (no toggle muerto); entitled-pero-off = toggle simple.** [stigg.io; Beehiiv]

---

## 7. Veredicto por rol (14 roles)

1. **Software Architect** — APPROVE WITH CHANGES. Modelo correcto y bien alineado. P0: resolver debe
   tomar resource-context (team-pool gana) y reusar `hasExchangesModuleForClientContext`; backfill de
   existentes. Mejora top: gating de widgets dependientes via mismo resolver.
2. **Backend Engineer** — Conditional GO. P0: gap de lectura para alumno de pool en `coach_feature_prefs`
   (no hay policy client-pool-read → alumno pooled lee 0 prefs → todo OFF); resolver context-aware.
   Confirma `clients.id = auth.uid()` correcto.
3. **Frontend (Web)** — APPROVE WITH CHANGES. P0: fila ausente debe preservar lo visible hoy; gatear
   widgets del dashboard junto a la seccion. `goals_bodycomp` mapea mal (→ `body_composition`).
4. **Mobile Engineer** — Conditional GO. P0: el plan es web-only; empaquetar resolver+catalogo como
   `@eva/feature-prefs` consumido por `apps/mobile`; sin assertModule en nativo → prefs = narrowing de
   presentacion, entitlement sigue siendo el gate duro en RLS/RPC.
5. **DevOps** — GO tras migration-safety. P0: colision de `nutrition_set_updated_at()` (ya existe en
   `20260618180001` con otro body, search_path distinto) → renombrar; backfill; DROP guardado.
   Sugiere kill-switch Edge Config para el resolver.
6. **QA Automation** — NOT test-ready aun. P0: backfill + test "coach existente conserva superficies";
   matriz entitled×preference (incl. pool, kill-switch, core-siempre-ON). Confirma RLS correcta.
7. **Security** — Conditional GO. P0: probar (tx-rollback authenticated) que el alumno NO puede
   escribir `client_feature_prefs`; el invariante "preference solo achica" no tiene enforcement DB →
   choke point unico + tests; resolver con kill-switch.
8. **Product Manager** — APPROVE WITH CHANGES. P0: backfill por uso; separar Fase A (declutter, sin DB)
   de Fase B/C (prefs) para no rehenear el quick-win; resolver el naming clash.
9. **UX/UI Designer** — APPROVE direccion. P0: el goal #1 (clutter mobile) apenas se aborda → adoptar
   "4 + Mas" en web; locked-Pro como CTA "Desbloquear con Pro", no toggle gris muerto.
10. **Head of Sales** — CONDITIONAL GO. Cierra el gap competitivo vs Everfit (overrides por cliente).
    P0: grandfather loss = evento de churn/refund/SERNAC; shippear consolidacion primero; "preview como
    alumno" reduce ansiedad del coach.
11. **Staff/SDR Backend** — APPROVE direccion. P0: backfill; drift out-of-band (las tablas
    `*_nutrition_prefs` nunca fueron creadas por migracion — existen por SQL crudo en prod) → confirmar
    0 filas antes del DROP; resolver context+kill-switch.
12. **Customer Success** — APPROVE WITH CHANGES. P0: regresion silenciosa = tickets/churn; backfill +
    banner "dejamos prendido lo que usabas"; gatear widgets dependientes; plan de comunicacion.
13. **Legal & Compliance (Chile)** — Condicional. P0: modificacion unilateral de servicio contratado
    (Ley 19.496/SERNAC) sin grandfathering; derecho de acceso/portabilidad del alumno a SUS datos
    (Ley 19.628 + 21.719 con Agencia+multas hacia dic-2026) debe sobrevivir cualquier toggle; audit
    trail de quien toggleo que.
14. **Fintech / Integrations** — Conditional GO. Fintech surface (addons/webhook) correctamente
    intacta. P0: backfill; helpers de pool llamados **sin** prefijo `public.` en la migracion (lineas
    37/64) → bug RLS para coaches de pool; resolver context+kill-switch.

**Consenso transversal (≥8 roles):** (a) backfill por uso es no-negociable; (b) resolver debe ser
context-aware + reusar entitlement + kill-switch; (c) gatear widgets dependientes; (d) `@eva/feature-prefs`
compartido para no romper paridad mobile; (e) correr `get_advisors`.

---

## 8. Backend / seguridad (RLS, gotchas, fail-closed)

### 8.1 Correcciones a la migracion `20260618200000_feature_prefs.sql` (ANTES de aplicar)

1. **Colision de funcion (DevOps P0):** `20260618180001_nutrient_targets.sql` ya define
   `public.nutrition_set_updated_at()` con body distinto y SIN `SET search_path`. Esta migracion la hace
   `CREATE OR REPLACE` con `search_path=''`. `merge_branch` re-corre todo en orden de timestamp → el
   ultimo gana y muta la funcion para las 6 tablas de nutricion. **Fix:** NO redefinir; renombrar la
   nueva a `public.feature_prefs_set_updated_at()` (grep antes por un `set_updated_at` generico).
2. **Helpers de pool sin schema-qualify (Fintech P0):** lineas 37/64 llaman
   `current_user_pool_coach_ids()` / `current_user_pool_client_ids()` **sin** `public.`. El resto de
   EVA siempre las califica. En cuerpo de policy se evalua con el search_path del rol que consulta →
   puede no resolver para coaches de pool (Movida). **Fix:** prefijar `public.` en ambas.
3. **Gap de lectura alumno-de-pool (Backend P0):** `coach_feature_prefs_client_read` usa
   `clients c WHERE c.id = auth.uid() AND c.coach_id = coach_feature_prefs.coach_id`. En pool, el plan
   (y las prefs que deben regir su vista) puede pertenecer a OTRO coach del pool. **Fix:** agregar rama
   client-pool-read que matchee via el coach del plan/team del alumno (espejo de como `sections.queries`
   resuelve entitlement via `findPlanModuleContext`), o el alumno pooled lee 0 prefs → todo OFF.
4. **Policies permissive stacked (varios P1/P2):** `coach_feature_prefs` tiene `owner_all` (FOR ALL,
   incluye SELECT) + `client_read` (SELECT) + `team_read` (SELECT) = 3 permissive en SELECT (la clase
   `multiple_permissive_policies` que el audit DB bajo 575→510). Igual en `client_feature_prefs`. **Fix:**
   split owner en INSERT/UPDATE/DELETE + UNA policy SELECT consolidada (owner OR client OR pool); correr
   `get_advisors` post-apply (0 nuevos warnings).
5. **DROP TABLE guardado (Security/Legal/DevOps):** lineas 6-7 dropean `coach_nutrition_prefs`/
   `client_nutrition_prefs` incondicional. Esas tablas **nunca fueron creadas por migracion** (drift
   out-of-band). Confirmar via `list_tables`/`execute_sql` que tienen 0 filas; comentario defensivo;
   snapshot `_bak` por protocolo.
6. **Zod en write + fallback resolver (varios):** `preset`/`domain` sin CHECK (genericidad). El
   write-action Zod-valida; el resolver coacciona `preset` desconocido → `basico`.

### 8.2 Gotchas de schema (CLAUDE.md)

- **Column-grant (coaches/clients):** las tablas laterales **evitan** el gotcha porque tienen grant a
  nivel de tabla. NO tocar `enabled_modules` desde el toggle (lo pisaria el trigger D1 y/o regalaria
  features pagas). **Regla PR:** un toggle de Funcion escribe SOLO en `*_feature_prefs.sections`/`preset`.
- **CASCADE meal-logs (data-loss):** `nutrition_meal_logs.meal_id → nutrition_meals ON DELETE CASCADE`.
  **Regla PR (peso de checklist):** un toggle NUNCA borra/anula una fila `nutrition_*`. Apagar = ocultar.
- **Defaults:** migracion aditiva/idempotente/forward-only; el default de columna NO grandfatherea (§5).

### 8.3 Entitlement server-side fail-closed

El gate de dinero vive en `assertModule`/`hasModule` (server). La preferencia es **input no confiable
que solo resta**. RLS no puede expresar "el jsonb solo puede restar" → enforcement por **choke point
unico** (`resolveFeaturePrefs`) + tests. Tests RLS negativos (tx-rollback `SET LOCAL ROLE authenticated`
+ `request.jwt.claims`): (a) alumno NO escribe `client_feature_prefs`; (b) coach A no lee/escribe prefs
de coach B; (c) co-coach de pool si/no segun diseno; (d) alumno SELECT solo su fila. Agregar a
`tests/separation/` + `tests/enterprise/rls-isolation.spec.ts`.

---

## 9. Plan por fases (archivos reales + DoD) y encaje con nutricion

### Fase A — Consolidacion IA pura (SIN migracion, shippeable sola) [quick-win]

- **A1** Hub "Opciones" 3-card en standalone (Movida 1): restructure `coach/settings/page.tsx`, nuevo
  `coach/settings/brand/page.tsx`, colapsar `brand`+`billing` en `coach-nav.ts`.
- **A2** Ejercicios → boton (Movida 2): `coach-nav.ts`, `LibraryHeader.tsx`, `coach-nav.test.ts`,
  specs E2E de nav, mirror `apps/mobile/CoachMobileChrome`.
- **A3** Barra responsive "4 + Mas" (Movida 3): `CoachSidebar.tsx`.
- **DoD:** `pnpm typecheck` + `pnpm lint` + `pnpm test` verde; `coach-nav.test.ts` y specs E2E de nav
  actualizados; `/coach/exercises` aun 200; ruta brand alcanzable; cero cambio de capability.

### Fase B — Fundaciones de prefs (DB + paquete compartido)

- **B1** Corregir `20260618200000_feature_prefs.sql` (§8.1 items 1-6). Confirmar 0 filas pre-DROP.
- **B2** **Backfill por uso** (migracion separada, batched, idempotente, provenance) (§5.1).
- **B3** Paquete `@eva/feature-prefs`: config `FeatureSections` nutricion + presets + `requiresModule`
  + test `catalog.test.ts`-style. (Mobile P0).
- **B4** `resolveFeaturePrefs` context-aware reusando `hasExchangesModuleForClientContext`/
  `findPlanModuleContext`/kill-switch; `React.cache`; write-action con Zod.
- **B5** Flag Edge Config `FEATURE_PREFS_ENABLED` (fail-open) (§5.2).
- **DoD:** `get_advisors` security+perf = 0 criticos / 0 nuevos `multiple_permissive`; tests RLS
  negativos verde; tests resolver (matriz entitled×preference, pool, kill-switch, core-siempre-ON,
  preset-basura→basico, sin-fila→hereda); `database.types.ts` regenerado; snapshot `_bak`.

### Fase C — Zona "Funciones" + wiring de superficies

- **C1** Zona "Funciones" en "Opciones Coach"/`/coach/settings` (toggles + presets), explainer
  Modulos-vs-Funciones, locked-Pro como CTA "Desbloquear con Pro" → `/coach/subscription#addons`.
  Wire a `/coach/settings/preview` ("preview como alumno", Sales).
- **C2** Wire resolver en `NutritionShell`/`NutritionTabB5`/`sections.queries.ts` **y** en widgets
  dependientes (`heroComplianceBundle.ts`, `dashboard.service.ts`, `MacroBar`, `ComplianceRing`,
  `NutritionDailySummary`, `MacroRingSummary`, `ComplianceScoresCard`). Empty states guiados (§4.5).
- **C3** Paridad mobile: consumir `@eva/feature-prefs` en `apps/mobile` (coach + alumno); test de
  lectura RLS bajo JWT de alumno real.
- **C4** (Movida 4, si el founder lo aprueba) gancho `featurePref` en `getVisibleNavItems`.
- **C5** Onboarding 1-pregunta de preset (descartable, default `intermedio`).
- **DoD:** E2E entitled×preference (incl. locked-upsell, override por cliente, pool); banner de
  grandfathering; invariante de acceso del alumno testeado; banner/News changelog; flip de
  `FEATURE_PREFS_ENABLED` controlado.

### Encaje con el overhaul de nutricion (este es un DESVIO)

El plan maestro de nutricion (`docs/audits/nutrition-*`, memory
`project_nutrition_overhaul_plan`) sigue siendo la prioridad de producto. Este trabajo es un desvio
que **habilita** ese overhaul: el motor unico `computeNutritionAdherence`, las 4 paletas→canonica y el
hogar de 3 zonas conviven con el resolver (las secciones que el overhaul reorganiza son las mismas que
"Funciones" gatea). **Retomar:** al cerrar Fase C, volver al plan de nutricion en el punto del motor
unico de adherencia; la config `FeatureSections` ya deja las secciones declaradas y testeadas, lo que
reduce el riesgo del overhaul. No mezclar ambos branches.

---

## 10. Riesgos + decisiones que faltan del founder

### Riesgos (con mitigacion)

| Riesgo | Severidad | Mitigacion |
|---|---|---|
| Regresion silenciosa a coaches existentes (todo OFF al deploy) | **CRITICO** | Backfill por uso + fail-open transicional + kill-switch Edge Config (§5) |
| Alumno de pool lee 0 prefs (RLS gap) → todo OFF en pool/Movida | Alto | Rama client-pool-read (§8.1.3) + test bajo JWT alumno |
| Drift web vs mobile (resolver web-only) | Alto | `@eva/feature-prefs` compartido (§4.3) |
| Fuga de feature paga via preference | Alto | Choke point unico + entitlement server-side + tests (§8.3) |
| Colision `nutrition_set_updated_at` en replay | Alto | Renombrar `feature_prefs_set_updated_at` (§8.1.1) |
| Acceso del alumno a SUS datos bloqueado (Legal) | Alto | Invariante de acceso + ARCO siempre alcanzable (§5.4) |
| Perf regression (policies stacked) | Medio | Consolidar SELECT + `get_advisors` (§8.1.4) |
| Tests de nav rotos sin actualizar | Medio | Actualizar `coach-nav.test.ts` + E2E en el mismo cambio (Movida 2) |
| Confusion Modulos (pago) vs Funciones (toggle) | Medio | Explainer 1-linea + reusar copy `@eva/module-catalog` |

### Decisiones que faltan del founder

1. **¿Toggles solo in-screen, o tambien nav top-level?** (Movida 4 / gancho `featurePref`). Si el coach
   puede ocultar el menu "Nutricion" entero (no solo secciones dentro), entra C4. Define el alcance v1.
2. **Grandfathering de existentes:** ¿secciones hoy-visibles-a-todos quedan **ON** para existentes
   (backfill `intermedio`/`profesional`), o se acepta reduccion anunciada a `basico`? (Recomendacion
   unanime: ON por uso.)
3. **¿Capa de cohorte/grupo entre coach-default y override-por-alumno?** Everfit (gold standard) tiene
   default→grupo→cliente. Hoy proponemos solo per-coach + per-alumno. Para un team de 300 (Movida)
   configurar alumno-por-alumno a mano no escala. ¿Entra una capa de grupo en v1 o se difiere?
4. **¿Cambiar un default del coach mas adelante reescribe alumnos existentes o solo aplica a nuevos?**
   (Leccion GitLab: hacerlo decision explicita, no cascada silenciosa.)
5. **¿Limpiar duplicados de Nutricion** (`/coach/foods`, redirects muertos) en este branch (Movida 5) o
   diferir al overhaul de nutricion?
6. **Telemetria:** ¿instrumentar que secciones se apagan mas y que preset gana, desde el dia 1? (Sales/PM
   lo piden para tunear defaults y pricing.)

---

## Apendice — Archivos reales clave

- Nav registro: `apps/web/src/components/coach/coach-nav.ts` (+ `coach-nav.test.ts`)
- Nav render (clutter): `apps/web/src/components/coach/CoachSidebar.tsx`
- Hub Opciones (ya existe): `apps/web/src/app/coach/settings/page.tsx`
- Catalogo entitlement (read-only): `apps/web/src/app/coach/settings/modules/_components/ModulesForm.tsx`
- Entitlement engine: `apps/web/src/services/entitlements.service.ts`,
  `nutrition-exchanges.service.ts` (`hasExchangesModuleForClientContext`),
  `exchanges.repository.ts` (`findPlanModuleContext`)
- Pro fail-closed a generalizar: `sections.queries.ts` (`getNutritionProEnabledForClient`)
- Widgets dependientes: `MacroBar.tsx`, `ComplianceRing.tsx`, `NutritionDailySummary.tsx`,
  `MacroRingSummary.tsx`, `ComplianceScoresCard.tsx`, `_data/heroComplianceBundle.ts`,
  `services/dashboard.service.ts`
- Consolidacion Ejercicios: `apps/web/src/app/coach/exercises/page.tsx` →
  `apps/web/src/app/coach/workout-programs/.../LibraryHeader.tsx`
- Mobile nav (patron a espejar/paridad): `apps/mobile/components/coach/CoachMobileChrome.tsx`,
  `apps/mobile/app/coach/(tabs)/_layout.tsx`, `apps/mobile/lib/coach-client-detail.ts`
- Migracion a corregir: `supabase/migrations/20260618200000_feature_prefs.sql`
- RLS alumno-self de referencia: `supabase/migrations/20260613120000_bodycomp_student_self_select.sql`
- Helpers pool: `supabase/migrations/20260609160000_team_rls_optimized.sql`
- Catalogo a espejar: `packages/module-catalog/catalog.ts` (+ `catalog.test.ts`)
- Draft reemplazado: `docs/audits/nutrition-feature-visibility-{design,PLAN}-2026-06.md`
