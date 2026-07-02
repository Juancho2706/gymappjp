# 1. Como funcionan los modulos (arquitectura de entitlements)

EVA tiene **4 modulos de pago** que se prenden/apagan por tenant. La arquitectura es deliberadamente en **capas ortogonales**: una cosa es si el coach/team **pago** el modulo (entitlement), otra si el **operador** lo apago globalmente (kill-switch), y otra si el coach **quiere mostrarlo** (feature-prefs). El frontend (nav + paginas) es solo **espejo visual**; el techo de seguridad real es **server-side**, en cada accion/RSC del modulo.

---

## 1.1 Los 4 modulos y `MODULE_KEYS`

La **fuente de verdad** de las keys es `MODULE_KEYS` en `apps/web/src/services/entitlements.service.ts`:

```ts
export const MODULE_KEYS = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]
export type EnabledModules = Partial<Record<ModuleKey, boolean>>
```

Cualquier otro paquete que enumere modulos **debe** coincidir exactamente con esta lista (verificado en tests). El espejo comercial vive en `MODULE_CATALOG_KEYS` (`packages/module-catalog/catalog.ts`) y un test (`catalog.test.ts`) cruza ambas listas y **falla si divergen** (ni una mas, ni una menos).

| `ModuleKey` | Label comercial | Que entrega (backend) |
|---|---|---|
| `cardio` | Cardio / Resistencia | Prescripcion de cardio por tiempo/ritmo/distancia con zonas de frecuencia cardiaca; timers + registro del alumno; cumplimiento real |
| `movement_assessment` | Evaluacion de movimiento | Screening de ingreso de 7 patrones de movimiento + reporte semaforo; card de ultima evaluacion en la ficha; pestana de resultados del alumno |
| `body_composition` | Composicion corporal | Antropometria ISAK de 5 componentes + bioimpedancia (BIA) en un mismo historial comparable; pestanas BIA / ISAK en la ficha del alumno |
| `nutrition_exchanges` | Nutricion Pro | Pautas por porciones e intercambios, plantillas reutilizables, micronutrientes avanzados, objetivos por composicion corporal, PDF de pauta con marca |

> **Default OFF.** Si no hay fila/flag, el mapa es `{}` y todos los modulos resuelven `false`. La coercion vive en `asModules()` / `normalizeModules()`: cualquier valor que no sea exactamente `true` cuenta como apagado.

---

## 1.2 Las capas de resolucion

Para que una superficie de un modulo se muestre y/o ejecute, **TODAS** las capas que apliquen deben estar a favor. Son ortogonales (cada una puede apagar por su cuenta):

### Capa A — Entitlement (billing): `enabled_modules` jsonb

Es la capability comprada. Vive en columnas jsonb:
- `coaches.enabled_modules` — el dashboard propio del coach standalone.
- `teams.enabled_modules` — el pool/team (modo `team`, pool plano de coaches).

Lectores en `entitlements.service.ts`:

```ts
getCoachEnabledModules(db, coachId)  // -> coaches.enabled_modules
getTeamEnabledModules(db, teamId)    // -> teams.enabled_modules
```

**Regla LOCKED de resolucion por CONTEXTO DEL RECURSO** (no es una union, no es del usuario logueado):
- Contexto pool/team → manda `teams.enabled_modules`. **El pool gana.**
- Contexto standalone → manda `coaches.enabled_modules` (flags propios del coach).
- Los modulos del team **NO se filtran** a los clientes standalone personales del coach, ni viceversa.

El resolvedor central:

```ts
hasModule(db, key, ctx: { teamId?, coachId? }): Promise<boolean>
// teamId presente => decide el team (pool wins). Si no => flags propios del coach.

assertModule(db, key, ctx): Promise<void>
// throwing guard: lanza `Modulo no habilitado: ${key}` si hasModule es false.
```

**El techo de seguridad es server-side.** `assertModule` se llama al tope de cada `_data/*.queries.ts` / accion del modulo, ANTES de leer/escribir. Nunca se confia en `enabled_modules` mandado por el cliente. Ejemplo real (`apps/web/src/app/coach/cardio/_data/cardio.queries.ts`):

```ts
const workspace = await resolvePreferredWorkspace(supabase, user.id)
if (workspace?.type === 'enterprise_coach') return { status: 'module_off' }
const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
try {
    await assertModule(supabase, 'cardio', {
        teamId: activeTeamId,
        coachId: activeTeamId ? null : user.id,
    })
} catch { return { status: 'module_off' } }
```

El patron se repite en cada modulo:
- `nutrition_exchanges`: `assertExchangesModuleForPlan(db, planId)` resuelve el contexto del PLAN (`findPlanModuleContext`) y aplica `moduleCtxForPlan` — si el alumno es de pool (`clientTeamId && !clientOrgId`) usa `teamId`, si no `coachId` del dueno del plan. La vista del alumno usa `hasExchangesModuleForClientContext` (mismo pool-wins, fail-closed).
- `body_composition`, `movement_assessment`, `cardio`: `assertModule` directo con el contexto del workspace activo.

> **Enterprise v1: OFF.** Si el workspace activo es `enterprise_coach`, los modulos retornan `module_off` antes de mirar el entitlement. Los modulos solo viven en `coach_standalone` y `coach_team`.

### Capa B — Kill-switch de operador: `EVA_DISABLED_MODULES`

Palanca de PLATAFORMA, **por encima** del entitlement del tenant. Es una env var CSV de `MODULE_KEYS`:

```
EVA_DISABLED_MODULES="cardio,body_composition"
```

Apaga el modulo para **TODOS** aunque el team/coach lo tenga ON. Requiere **redeploy** (es env var, no se flipea en caliente). Implementacion en `entitlements.service.ts`:

```ts
isModuleKilledByOperator(key): boolean          // ¿la key esta en el CSV?
applyOperatorKillSwitch(modules): EnabledModules // out[key] = modules[key]===true && !killed
```

`hasModule` ya cortocircuita con el kill-switch primero (`if (isModuleKilledByOperator(key)) return false`), asi que el gate server-side lo respeta gratis. La UI **no oculta** la fila del catalogo cuando esta killed: muestra un estado "Temporalmente en mantenimiento" (badge `Activo` + leyenda), porque el verdadero corte ya lo hace el server.

### Capa C — Feature-prefs (preferencia, ORTOGONAL al billing)

Es **preferencia, no capability**. El coach (o team, o por-alumno) puede **ocultar** una superficie que SI tiene comprada. Vive en `apps/web/src/services/feature-prefs.service.ts` sobre el motor puro `@eva/feature-prefs`. Tres niveles de filas:
- `coach_feature_prefs` (base del coach standalone)
- `team_feature_prefs` (base del pool; gana sobre la del coach si el alumno es de pool — `useTeamBase = clientTeamId && !clientOrgId`)
- `client_feature_prefs` (override por-alumno, tri-state heredar/mostrar/ocultar)

Modelo de oro: **`visible = ENTITLED (billing, fail-closed) AND ENABLED (preferencia)`**. La preferencia **solo achica**: si una seccion no esta entitled, ningun toggle la prende (garantizado por el resolver puro `resolveSections`). El choke point unico es `resolveFeaturePrefs()` — ningun componente lee `sections` jsonb directo.

Notas clave:
- **Reusa el entitlement, no lo reimplementa**: `entitledByModuleForNutrition` llama a `hasExchangesModuleForClientContext` (modulo `nutrition_exchanges`) y `hasModule` (`body_composition`), asi que pool-wins + kill-switch vienen GRATIS.
- Flag `FEATURE_PREFS_ENABLED` (Edge Config, **fail-OPEN**): ausente/false/Edge caido → comportamiento de HOY = mostrar TODO lo entitled (las preferencias se ignoran). Es el grandfathering transicional (nadie pierde superficie por no tener fila de prefs aun).
- **Master switch de dominio** (`resolveNutritionDomainEnabled`, `_enabled`): si el coach apaga el dominio Nutricion entero, su entrada del nav y todo su contenido se ocultan. Es pura preferencia (no mira entitlement). Tambien fail-OPEN.
- Solo `nutrition_exchanges` tiene capa de visibilidad de Funciones hoy; los otros 3 modulos no tienen toggle de feature-prefs (su unico gate es entitlement + kill-switch).

---

## 1.3 COMPRA-ONLY: Settings > Modulos es catalogo read-only

`/coach/settings/modules` **NO** deja al coach auto-activar nada. Es un **catalogo read-only** (plan estrategia 03, F1.2): badges + pitch + superficies + CTA. No hay switches ni guardado.

- `page.tsx` (`CoachModulesPage`): obtiene `getModulesContext()`. Si `orgManaged` → redirige a `/coach/dashboard` (enterprise no aplica). Pasa a `ModulesForm` el mapa `modules`, `killedByOperator`, `isTeamManager`, `scope` (`'team'|'standalone'`), `tier`, `nutritionVisible`.
- `_data/modules.queries.ts` (`getModulesContext`, `React.cache`): deriva el contexto del **WORKSPACE ACTIVO** (separacion de flujos):
  - `coach_team` → `teams.enabled_modules` del team activo; `isTeamManager` solo cambia el CTA (gestor vs miembro).
  - standalone → `coaches.enabled_modules` propio.
  - enterprise → no aplica (`orgManaged=true`, la pagina redirige).
  - El cliente es user-scoped (RLS = techo); la **escritura quedo SOLO en service-role** (override admin del CEO).
- `_components/ModulesForm.tsx` (`'use client'`): por cada `MODULE_CATALOG_KEYS` renderiza badge `Activo`/`De pago`, el `pitch`, las `surfaces`, y un CTA por contexto. Cada CTA captura `module_interest_cta_clicked` (telemetria PostHog, gated por consentimiento de cookies). Es **1 de las 2 unicas superficies de venta** (anti-hostigamiento). El CTA `ModuleCta`:
  - team + miembro sin gestion → texto "Pidelo al owner de tu equipo" (sin link).
  - team + gestor → `mailto:contacto@eva-app.cl` conversacional.
  - standalone + `SELF_SERVICE_ADDONS_ENABLED` ON → link a `/coach/subscription#addons` ("Desbloquear").
  - standalone + flag OFF → `mailto` interino.
  - solo standalone muestra precio (`entry.priceClp` formateado `es-CL` "/ mes").

### El verdadero escritor: service-role

`coaches.enabled_modules` / `teams.enabled_modules` son **compra-only** a nivel DB: GRANT de columna `authenticated` con UPDATE revocado sobre esas columnas. Ningun `authenticated` puede escribir el jsonb directo. Escritores legitimos:
- **Override del CEO (write-through)**: `syncAdminGrants` (`services/billing/addons.service.ts`) NO escribe el jsonb directo — crea/cancela filas `coach_addons` con `source='admin_grant'` (`price_clp=0`, cortesia, nunca facturan). El **trigger D1** `sync_coach_enabled_modules` (SECURITY DEFINER, `trg_coach_addons_sync`) recomputa `coaches.enabled_modules` desde las filas vivas en CADA insert/update/delete (cero drift). Escribir el jsonb directo lo pisaria el trigger en la proxima mutacion de add-ons.
- **Webhook de pago** (service-role): materializa add-ons `self_service` pagados → el mismo trigger D1 prende el modulo.
- **Admin panel de teams**: toggle directo del CEO en `/admin/teams` escribe `teams.enabled_modules` (service-role). El `seat_limit` ademas protegido por trigger `teams_guard_owner_fields`.

> `buildCoachUpdateData` (admin coach-actions) **NO incluye** `enabled_modules` a proposito: la rama de modulos del override del CEO pasa por `readModules` (lee checkboxes `module_<key>`) + flag `modules_present` + `syncAdminGrants`. `readModules` devuelve los 4 en `false` si no vienen checkboxes — el caller DEBE gatear con `modules_present` o apagaria los 4 modulos de cualquier coach editado.

---

## 1.4 El catalogo comercial: `@eva/module-catalog`

`packages/module-catalog/catalog.ts` es un paquete **PURO TypeScript** (cero Next.js / Supabase / React / RN) → la MISMA copy corre en web (Settings > Modulos) y en la futura app RN (mata el drift de strings duplicados). Indexa por `ModuleKey`:

```ts
interface ModuleCatalogEntry {
    label: string      // nombre comercial latam neutro
    pitch: string      // 2-3 frases honestas, sin letra chica
    surfaces: string[] // donde viven las utilidades cuando esta activo
    priceClp: number   // precio mensual self-service standalone (lista, uniforme)
}
export const MODULE_CATALOG: Record<ModuleKey, ModuleCatalogEntry> = { ... }
getModuleCatalogEntry(key): ModuleCatalogEntry
```

- Precio de lista **uniforme $9.990/mes** los 4 modulos (informativo en la UI). El cobro real lo **congela** `coach_addons.price_clp` por compra (webhook). En modo team el precio es por contrato (no se usa `priceClp`).
- Estrategia i18n (D3): copy base en espanol latam neutro indexada por key; traducciones futuras = mapas de locale paralelos con las MISMAS keys, sin tocar consumidores.

---

## 1.5 El espejo en el nav: `NAV_MODULES`

`apps/web/src/components/coach/coach-nav.ts` es el **registro unico del menu del coach** (nav como registro de modulos). Cada entrada `NavModule`:

```ts
type NavModule = {
    key, href, label, shortLabel?, icon,
    contexts: ReadonlyArray<CoachWorkspaceType>, // donde existe el modulo
    entitlement?: ModuleKey,   // gancho de billing: solo visible con el entitlement ON
    featureDomain?: string,    // dominio de feature-prefs; si el master switch esta OFF, se oculta
}
```

- `contexts` controla en que workspace aparece la entrada (`coach_standalone` / `enterprise_coach` / `coach_team`). Ej: "Equipo" solo en `coach_team`; "Opciones" (hub marca+suscripcion) solo en `coach_standalone`.
- Las dos entradas toggleables del nav son `cardio` (`entitlement: 'cardio'`) y `movement` (`entitlement: 'movement_assessment'`), ambas en `['coach_standalone', 'coach_team']` (enterprise excluido). Estan **al final del registro** a proposito: en mobile el bottom bar renderiza plano por orden de registro → los modulos comprados quedan contiguos al final. `body_composition` y `nutrition_exchanges` no son entradas top-level del nav (sus superficies viven dentro de la ficha del alumno y del plan de nutricion).
- `nutrition` lleva `featureDomain: 'nutrition'` (se oculta si el coach apaga el master switch).

Funciones PURAS (unit-testeables sin render):

```ts
getVisibleNavItems(ctx): NavModule[]
// 1. Status bloqueado (SUBSCRIPTION_BLOCKED_STATUSES: past_due/expired/...) => solo "Reactivar".
// 2. Cada item solo en sus `contexts` (sin workspace => standalone).
// 3. Managed (org_managed/team_managed) nunca ve "Opciones" standalone.
// 4. item.entitlement && enabledModules?.[entitlement] !== true => oculto (default OFF).
// 5. item.featureDomain en disabledDomains => oculto (preferencia, no capability).

splitNavItems(items): { core, modules }
// discrimina por item.entitlement != null. `modules` = comprados/toggleables.
// Si vacio, el sidebar no renderiza el divisor "MODULOS".
```

> El layout (`apps/web/src/app/coach/layout.tsx`) resuelve `enabledModules` del contexto activo (team → pool; standalone → propios; enterprise → `{}`) y le aplica `applyOperatorKillSwitch` ANTES de pasarlo al `CoachSidebar`. Tambien resuelve `disabledDomains` via `resolveNutritionDomainEnabled` (fail-OPEN). Esto es **espejo visual**: el gate real sigue siendo `assertModule` server-side. Un coach que fuerce la URL `/coach/cardio` sin el entitlement obtiene `status: 'module_off'`, no datos.

---

## 1.6 Resumen del flujo de resolucion (de mas fuerte a mas debil)

1. **Kill-switch de operador** (`EVA_DISABLED_MODULES`, redeploy) — apaga global, gana sobre todo.
2. **Entitlement por contexto del recurso** (`enabled_modules`, pool-wins, fail-closed, default OFF) — la capability comprada; enforce con `assertModule` server-side.
3. **Feature-prefs** (`coach/team/client_feature_prefs`, fail-OPEN con `FEATURE_PREFS_ENABLED`) — solo achica lo entitled; preferencia, no capability.
4. **Nav** (`getVisibleNavItems`/`splitNavItems`) — espejo visual de 2 y 3; nunca es seguridad.

Escritura del entitlement: **solo service-role** (override CEO write-through `coach_addons` → trigger D1 → `enabled_modules`; webhook de pago; toggle admin de teams). El coach **nunca** se auto-activa: Settings > Modulos es catalogo read-only de compra.
