---
status: draft
owner: product-engineering
last_verified: "2026-08-31"
canonical: false
---

# PLAN — Ola de orden («La casa ordenada»)

Slug SDD: `docs/specs/ola-de-orden/`. Repo `D:\Proyectos\Antigravity\gymappjp` en SOLO LECTURA para
este writer — toda ruta citada está verificada con Read/Grep en esta sesión (31-08-2026). Todo
bloque de código en este PLAN es **PROPUESTO**, no existe en el repo salvo que se cite lo
contrario explícitamente.

Jerarquía de fuentes: DECISIONS > OUTLINE > CORRECCIONES > maps. Este documento desarrolla el
CÓMO técnico de OUTLINE §4 (Waves) wave por wave. No repite el QUÉ/PARA QUIÉN (eso vive en
SPEC.md) ni la lista de tareas atómicas (TASKS.md).

## 0. Confirmaciones de alcance antes de las waves

- **Cero migraciones DB en las 4 waves.** `coach_feature_prefs`/`team_feature_prefs`/
  `client_feature_prefs` ya existen (`supabase/migrations/20260618200000_feature_prefs.sql` +
  backfill `20260618201000`) con los 5 dominios ya modelados en `packages/feature-prefs/index.ts`
  (`FEATURE_DOMAINS`, líneas 276+). El único cambio de "modelo" es de LECTURA (qué helper consume
  qué tabla), nunca de esquema. Ninguna wave de este PLAN toca `supabase/migrations/`.
- **`resolveDomainEnabled`** (`packages/feature-prefs/index.ts:341`) YA es genérico — toma
  `domain` como parámetro y no está atado a `nutrition`. Lo que falta es la CAPA DE SERVICIO por
  dominio (los wrappers con I/O + `cache()`), que hoy solo existe para nutrición
  (`resolveNutritionDomainEnabled`, `apps/web/src/services/feature-prefs.service.ts:311-346`).
  Esa es la pieza que W1 construye para los otros 4.
- **El retiro de `FEATURE_PREFS_ENABLED` (R1, OUTLINE §2) es puramente de código**, no de Edge
  Config: no hay que borrar la clave de Vercel (queda huérfana, inofensiva), solo dejar de leerla.
  El comentario ya vigente en `apps/web/src/app/coach/layout.tsx:124-127` documenta que el nav web
  YA ignora el flag a propósito — R1 generaliza esa decisión a todo el servicio.

---

## 1. W1 — Interruptores de verdad (4–5 d-a)

### 1.1 Objetivo

Que apagar un dominio en Funciones (a) saque la entrada del menú en AMBAS plataformas — hoy solo
pasa en web y solo para `nutrition` — y (b) cierre la ruta server-side/guard-side, no solo el
ítem de nav. Cubre las preguntas 1 y 2 del BRIEF §5.

### 1.2 Contrato nuevo de `/api/mobile/config`

`apps/web/src/app/api/mobile/config/route.ts` (252 líneas, verificado completo) hoy solo resuelve
`featurePrefs.nutritionEnabled` + `sections`, leyendo `FEATURE_PREFS_ENABLED` de Edge Config vía
`readFeaturePrefsEnabled()` (líneas 39-47) y pasándolo a `resolveNutritionPrefs()` (líneas
102-141). W1 agrega `featurePrefs.domains` con los 5 booleans y retira la lectura del flag:

```ts
// PROPUESTO — apps/web/src/app/api/mobile/config/route.ts
import { resolveDomainEnabled } from '@eva/feature-prefs' // ya importado, sin cambio de import

async function resolveDomainPrefs(
    admin: DB,
    scope: NutritionScope,
    applied: EnabledModules,
): Promise<Record<'nutrition' | 'training' | 'cardio' | 'movement' | 'bodycomp', boolean>> {
    // D9-A: audiencia ALUMNO nunca lee prefs — mismo corto-circuito que resolveNutritionPrefs hoy
    // (líneas 112-119), generalizado a los 5 dominios, ya SIN el flag FEATURE_PREFS_ENABLED.
    if (scope.clientId || (!scope.coachId && !scope.teamId)) {
        return { nutrition: true, training: true, cardio: true, movement: true, bodycomp: true }
    }
    const useTeamBase = !!scope.teamId && !scope.orgId
    const rows = await admin
        .from(useTeamBase ? 'team_feature_prefs' : 'coach_feature_prefs')
        .select('domain, preset, sections')
        .eq(useTeamBase ? 'team_id' : 'coach_id', useTeamBase ? scope.teamId! : scope.coachId!)
    const byDomain = new Map((rows.data ?? []).map((r) => [r.domain, r]))
    const out = {} as Record<string, boolean>
    for (const domain of ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'] as const) {
        const row = byDomain.get(domain)
        out[domain] = resolveDomainEnabled({
            domain,
            entitledByModule: { nutrition_exchanges: applied.nutrition_exchanges === true, body_composition: applied.body_composition === true },
            preset: (row?.preset ?? null),
            useTeamBase,
            coachSections: useTeamBase ? null : (row?.sections ?? null),
            teamSections: useTeamBase ? (row?.sections ?? null) : null,
            clientSections: null,
        })
    }
    return out as any
}
```

`resolveNutritionPrefs` (líneas 102-141) deja de recibir `prefsEnabled` — su rama `if
(!prefsEnabled || scope.clientId || ...)` (línea 117) se reduce a `if (scope.clientId || ...)`. La
respuesta final agrega el bloque nuevo y **conserva `nutritionEnabled` como espejo legacy durante
1 versión** (compatibilidad OTA, ver §1.6):

```ts
// PROPUESTO — bloque de respuesta final, reemplaza líneas 242-250
const domains = await resolveDomainPrefs(admin, scope, applied)
return NextResponse.json({
    enabledModules, disabledModules,
    featurePrefs: {
        nutritionEnabled: domains.nutrition, // ESPEJO LEGACY — retirar en la versión siguiente, ver §1.6
        sections,
        domains, // NUEVO — {nutrition, training, cardio, movement, bodycomp}
    },
    studentAccess: studentAccess ? { state: studentAccess.state, graceEndsAt: studentAccess.graceEndsAt } : null,
})
```

`readFeaturePrefsEnabled()` (líneas 38-47) y el campo `featurePrefsEnabled` de la respuesta
(línea 246) se ELIMINAN — nadie los consume fuera de este mismo endpoint tras el retiro (grep de
`featurePrefsEnabled` fuera de `route.ts` queda pendiente de correr por el implementador antes de
borrar, por si algún test de contrato lo espera).

### 1.3 Servicio web: wrappers de dominio + `assertDomainEnabled`

`apps/web/src/services/feature-prefs.service.ts` gana 4 wrappers análogos a
`resolveNutritionDomainEnabled` (líneas 311-346, patrón exacto a clonar) para `training`,
`cardio`, `movement`, `bodycomp`, y el retiro del flag en `prefsApplyFor` (líneas 102-105):

```ts
// PROPUESTO — reemplaza prefsApplyFor (líneas 102-105)
async function prefsApplyFor(audience: FeaturePrefsAudience | undefined): Promise<boolean> {
    return audience !== 'student' // D9-A se mantiene IGUAL; el flag Edge Config desaparece
}
```

Nombre canónico del guard de página (OUTLINE §3): `assertDomainEnabled(domain, ctx)`. **Contrato
final (arbitraje del jefe tras crítica F1, alineado con TASKS W1.3/W1.4)**: dos capas.
(1) CINCO resolvers boolean `resolve<Domain>DomainEnabled(ctx): Promise<boolean>` — molde exacto
de `resolveNutritionDomainEnabled` (líneas 311-339): mismo `cache()`, mismo fail-open, misma rama
`audience === 'student' → true` (D9-A). Los consumen las rutas con patrón `status`
(cardio/movement/bodycomp) y cualquier lector no navegacional.
(2) `assertDomainEnabled(domain, ctx): Promise<void>` — capa fina sobre esos resolvers que hace
`redirect('/coach/dashboard?notice=domain_off&domain=<domain>')` ella misma cuando da `false`
(semántica de assert: no retorna en fallo; server-side, sin flash). La usan SOLO las rutas de
redirect liso: `training` y `nutrition`.

```ts
// PROPUESTO — nuevo, mismo archivo (reemplaza resolveNutritionDomainEnabled por un alias)
const RESOLVERS: Record<FeatureDomain, (ctx: DomainCtx) => Promise<boolean>> = {
    nutrition: (ctx) => resolveDomainEnabledFor('nutrition', ctx),
    training: (ctx) => resolveDomainEnabledFor('training', ctx),
    cardio: (ctx) => resolveDomainEnabledFor('cardio', ctx),
    movement: (ctx) => resolveDomainEnabledFor('movement', ctx),
    bodycomp: (ctx) => resolveDomainEnabledFor('bodycomp', ctx),
}

export async function assertDomainEnabled(
    domain: FeatureDomain,
    ctx: { coachId: string; clientTeamId?: string | null; clientOrgId?: string | null },
): Promise<void> {
    const enabled = await RESOLVERS[domain](ctx)
    if (!enabled) redirect(`/coach/dashboard?notice=domain_off&domain=${domain}`)
}
// Uso en page.tsx de redirect liso (training, nutrition):
// await assertDomainEnabled('training', ctx)  // no retorna si el dominio está apagado
```

`getFeaturePrefsEnabled()` (líneas 83-93) se elimina completo junto con su import de
`@vercel/edge-config` en este archivo.

### 1.4 Guards de ruta web (por superficie, `ficha-y-gates.md` §B)

| Ruta | Archivo:línea (hoy) | Acción W1 |
|---|---|---|
| `/coach/workout-programs` | `apps/web/src/app/coach/workout-programs/page.tsx:13` (solo auth) | `await assertDomainEnabled('training', {coachId, clientTeamId, clientOrgId})` entre la línea 13 (auth) y la 15 (workspace) — B.1; el redirect con `?notice=` lo hace el assert |
| `/coach/nutrition-v2` | `apps/web/src/app/coach/nutrition-v2/page.tsx:43-46` | Mismo patrón con `'nutrition'` entre línea 43 (auth) y 46 (redirect enterprise) — B.3 |
| `/coach/nutrition-plans` (+`new`, `[templateId]/edit`, `client/[clientId]`) | verificado: `resolveNutritionDomainEnabled` + `redirect('/coach/dashboard')` LISO, sin `?notice=` (`nutrition-plans/page.tsx:182`, `new/page.tsx:54`) | Migrar los 4 call-sites al mismo `redirect('/coach/dashboard?notice=domain_off&domain=nutrition')` — **dato verificado en código, no en docs**: hoy NO llevan query, así que sin este cambio el banner de §1.5 nunca se dispara para `nutrition`, el dominio con más apagones esperables (criterio SPEC §9). Si TASKS mantiene "no tocar esas 4 rutas" queda en contradicción con este PLAN y con SPEC §9 — a resolver en la pasada de alineación, no aquí. |
| `/coach/cardio` | `apps/web/src/app/coach/cardio/page.tsx:17-23` | Sumar el gate de dominio DENTRO de `getCardioPageData()` (no verificado línea a línea, `_data/cardio.queries.ts`, fuera del recorte de `ficha-y-gates.md`): agregar `domain_off` como tercer `status` posible junto a `module_off`, y renderizar el mismo `<ModuleOffNotice>` con el copy nuevo de W4 — NO se reemplaza el gate de módulo, se COMPONE (kill-switch de operador sigue siendo defensa en profundidad) |
| `/coach/movement` | `apps/web/src/app/coach/movement/page.tsx:16-19` | Mismo patrón con `getMovementHub()` |
| `.../clients/[clientId]/bodycomp` | `apps/web/src/app/coach/clients/[clientId]/bodycomp/page.tsx:16-20` | Mismo patrón con `getClientBodyComposition()` |

Los 3 últimos NO usan `assertDomainEnabled` (que hace `redirect()`) porque su patrón establecido
es un `status` que la página interpreta para elegir componente (`ModuleOffNotice`), no un redirect
liso — se agrega `resolveCardioDomainEnabled`/etc. como una llamada más dentro de la función
`_data` existente, sin tocar su firma pública de retorno más que sumar el nuevo `status`.

### 1.5 Banner del dashboard (`notice=domain_off`)

`DashboardShell.tsx` (`apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx`) orquesta
la pila de banners; `VerifyEmailBanner.tsx` y `BillingBanners.tsx` viven en
`_components/banners/` (ambos verificados por Grep, contenido no abierto — fuera del recorte de
esta wave). Se propone un tercer banner en la misma carpeta:

```
apps/web/src/app/coach/dashboard/_components/banners/DomainOffNotice.tsx  (PROPUESTO, nuevo archivo)
```

Lee `searchParams.notice === 'domain_off'` + `searchParams.domain`, muestra copy corto
("Prendé Nutrición en Opciones › Funciones para volver a verla") con CTA a
`/coach/settings/funciones`, se auto-descarta al navegar (no persiste en DB — es un aviso de un
solo golpe, igual que el resto de banners de la pila que ya son stateless por request).

### 1.6 Guards RN + contrato móvil

`apps/mobile/lib/entitlements.ts` — `EntitlementsValue` (líneas 200-210) gana `domains`:

```ts
// PROPUESTO — extiende la interfaz (línea ~208) y useEntitlements() (líneas 231-238)
export interface EntitlementsValue {
    // ...existentes (nutritionEnabled se queda 1 versión, ver nota legacy abajo)
    domains: Record<'nutrition' | 'training' | 'cardio' | 'movement' | 'bodycomp', boolean>
}
export function useEntitlements(): EntitlementsValue {
    return useConfigStore((s) => ({
        // ...existentes
        domains: s.config.featurePrefs.domains,
    }))
}
```

Hook canónico (OUTLINE §3) — nuevo archivo, junto a `feature-prefs.queries.ts`:

```
apps/mobile/lib/feature-prefs.queries.ts → agrega useDomainGuard()  (PROPUESTO, mismo archivo)
```

**Contrato corregido tras crítica F5 (riesgo de fuga-por-flash, TASKS W1.7 "cero fetch antes del
aviso")**: `useDomainGuard` NO redirige — devuelve el booleano y la pantalla decide, ANTES de
llamar a su fetch de datos, si monta `DomainOffNotice` o el contenido real. Un `redirect()` en
`useEffect` corre DESPUÉS del primer render, así que si el fetch de la pantalla arranca en el mismo
render (patrón común en las 5 pantallas de esta tabla) el guard llega tarde. (En web es distinto:
`assertDomainEnabled` sí redirige, porque `redirect()` de Next en un Server Component corta el
render server-side y no hay flash posible — §1.3.)

```ts
// PROPUESTO
import { useEntitlements } from './entitlements'

export function useDomainGuard(domain: keyof EntitlementsValue['domains']): boolean {
    const { domains } = useEntitlements()
    return domains[domain]
}
```

Componente de aviso `DomainOffNotice` — nuevo, calcado del patrón ya existente de
`apps/mobile/components/ModuleOffNotice.tsx:1-127` (que YA soporta `cta?: CtaProp` inyectable,
línea 56 — más flexible que la versión web, dato de `ficha-y-gates.md` §B.7), pero apuntando a
`/coach/settings/funciones` en vez de `Ver mi plan`/`RefreshPlanButton`.

Consumo por pantalla — **patrón obligatorio, no opcional**: el `if (!enabled) return
<DomainOffNotice ... />` va ANTES de cualquier `useEffect`/hook de fetch de la pantalla (early
return al principio del componente), nunca en un `useEffect` de la pantalla misma — así las 5
pantallas comparten el mismo punto de corte y no dependen de que cada implementador lo recuerde:

| Pantalla RN | Guard hoy | Acción W1 |
|---|---|---|
| `apps/mobile/app/coach/(tabs)/builder.tsx` (training) | ninguno | `const enabled = useDomainGuard('training'); if (!enabled) return <DomainOffNotice domain="training" />` — ANTES del fetch del builder |
| `apps/mobile/app/coach/nutrition-v2/index.tsx` + `(tabs)/nutricion.tsx` | ninguno | mismo patrón con `'nutrition'` en ambas, antes de su fetch |
| `apps/mobile/app/coach/cardio/index.tsx:34-41` (ya tiene `hasModule('cardio')` + `ModuleOffNotice`) | módulo viejo | Componer: `useDomainGuard('cardio')` se evalúa junto al `hasModule` existente, mismo early-return antes del fetch (mismo criterio de composición que web §1.4) |
| `apps/mobile/app/coach/movement/index.tsx` | mismo patrón asumido por convención (no verificado línea a línea) | mismo tratamiento que cardio |
| `apps/mobile/app/coach/bodycomp/[clientId].tsx:48-50` | `hasModule('body_composition')` + `ModuleOffNotice` | componer con `useDomainGuard('bodycomp')`, mismo early-return |

`CoachMobileChrome.tsx:95-103` — el punto exacto del bug (CORRECCIONES.md #2, `nav.test.ts` YA
cubre `disabledDomains` genérico en 128-217, el registro está listo, el consumidor no):

```ts
// HOY (línea 95-103)
const visible = getVisibleNavItems({
  // ...
  disabledDomains: nutritionEnabled ? undefined : new Set(['nutrition']),
})

// PROPUESTO
const { domains } = useEntitlements()
const disabledDomains = new Set(
  (['nutrition', 'training', 'cardio', 'movement'] as const).filter((d) => !domains[d]),
)
// bodycomp no tiene entrada de nav (nav.ts no declara featureDomain 'bodycomp' en ningún NavModule)
const visible = getVisibleNavItems({ /* ... */ disabledDomains })
```

### 1.7 Ficha del alumno (web + RN)

Punto de inserción exacto (`ficha-y-gates.md` §A): la ficha hoy NO importa `feature-prefs` en
absoluto (0 hits de Grep), solo el sistema viejo de módulos vía `moduleFlags`. W1 agrega, en
**PARALELO** a `moduleFlags` (no lo reemplaza — `moduleFlags` sigue gateando el gráfico de
composición y el link a `/coach/cardio`/`/coach/movement`), un mapa `enabledDomains`:

- Web: `apps/web/src/app/coach/clients/[clientId]/page.tsx:65-79` (donde ya se arma
  `enabledModules` vía `Promise.all`) suma una llamada a los 5 `resolveXDomainEnabled` (o a un
  helper agregador `resolveAllDomainsEnabled(ctx)` nuevo en `feature-prefs.service.ts`, para no
  hacer 5 queries sueltas). El resultado baja como prop a `ClientProfileDashboard.tsx`.
- `ProfileTabNav.tsx:13-19` — `TABS` deja de ser `const` module-level y pasa a recibir
  `enabledDomains` como prop, filtrando `nutrition`→`nutrition`, `workout`/`program`→`training`.
  `overview` y `progress` NUNCA se ocultan (BRIEF no pide sacarlas, solo ocultar lo que depende
  100% de un dominio apagado) — dentro de Progreso, el bloque de composición ya gatea con
  `bodycompEnabled={moduleFlags?.bodycomp}` (línea 322, SIN CAMBIOS, es el sistema de módulo).
- RN: `apps/mobile/app/coach/cliente/[clientId].tsx:616-638` — mismo filtro sobre el array
  `tabs` local, alimentado por el mismo `enabledDomains` (nuevo fetch en el `useFocusEffect` de
  línea 341-350, junto al `getWorkspaceEntitlements` existente — el payload ya trae `domains`
  desde §1.6, cero request nueva).
- **Fuera de alcance de W1** (D9-A firme): NINGÚN cambio en `client_feature_prefs` ni en las
  superficies `/c/[coach_slug]/*` del alumno — los dos call-sites de D9-A
  (`route.ts:112-119` y `client-root.queries.ts:149-167`, CORRECCIONES.md #3) no se tocan.

### 1.8 Retiro de `FEATURE_PREFS_ENABLED` — checklist de código

**Paso 0 (crítica F5, transversal)**: antes de borrar la lectura, confirmar el valor VIVO de
`FEATURE_PREFS_ENABLED` en Edge Config y correr un `count(*)` de filas
`coach_feature_prefs`/`team_feature_prefs` con `sections->>'_enabled' = 'false'` (o ausente,
default OFF) que hoy el flag mantiene inertes por la RUTA server-side (el nav ya lo ignora, §0 —
la ruta es la que aún puede bypasear `_enabled:false` si el flag está caído/ausente). Si el
conteo es material, avisar al owner antes de fusionar — el retiro deja esas filas activas de
golpe, no es un cambio puramente inofensivo como asume §0.

1. `apps/web/src/services/feature-prefs.service.ts`: borrar `getFeaturePrefsEnabled()` (83-93),
   simplificar `prefsApplyFor` (§1.3).
2. `apps/web/src/app/api/mobile/config/route.ts`: borrar `readFeaturePrefsEnabled()` (39-47) y el
   campo `featurePrefsEnabled` de la respuesta.
3. Grep final de `FEATURE_PREFS_ENABLED` sobre `apps/web/src` y `apps/mobile` antes de cerrar la
   wave — debe quedar 0 hits de código (la clave puede seguir viva en Edge Config sin uso, no
   rompe nada leerla y no encontrarla en el código).

### 1.9 Rollback de R1

No hay kill-switch de infraestructura nuevo (Edge Config ya no se lee) — el rollback es a nivel
de **deploy**, proporcional al tamaño del cambio (lectura, no escritura):

- **Rollback de plataforma**: revert del commit / rollback instantáneo de Vercel a la versión
  anterior del deploy — restaura el flag-gate tal cual estaba (comportamiento conocido y ya en
  producción hoy). Documentar el SHA pre-W1 en el PR.
- **Rollback puntual por coach** (si un coach individual queda con una fila de
  `coach_feature_prefs` que lo manda a un `domain_off` inesperado, sin necesidad de revertir el
  deploy entero) — SQL de soporte, aditivo, no destructivo:

```sql
-- PROPUESTO — soporte fuerza el master switch de un dominio a ON para un coach puntual
UPDATE coach_feature_prefs
SET sections = jsonb_set(coalesce(sections, '{}'::jsonb), '{_enabled}', 'true')
WHERE coach_id = $1 AND domain = $2;
```

- `EVA_DISABLED_MODULES` (kill-switch de operador ya existente, BRIEF §3) sigue siendo la palanca
  para el sistema de MÓDULOS (billing histórico), no para el de dominios/preferencia — no se toca
  y no reemplaza este rollback.

### 1.10 Gates W1

```bash
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm --filter @eva/web exec vitest run src/services/feature-prefs.service.test.ts   # si no existe, crearlo
pnpm --filter @eva/mobile exec vitest run lib/feature-prefs.queries.test.ts          # useDomainGuard
pnpm exec vitest run packages/coach-nav/nav.test.ts                                  # ya cubre disabledDomains, no debe romperse
pnpm lint    # archivos tocados de apps/web/src/{services,app/coach}/**
pnpm docs:check
```
No corre `pnpm build` completo en esta wave (regla de gates proporcionales — la suite completa va
UNA vez antes del push final del wave, ver §5).

---

## 2. W2 — Navegación (2–3 d-a, depende de W1)

### 2.1 Por qué depende de W1

W2 pinta Cardio/Movimiento en el sidebar y agrupa por dominios "ON" — necesita que `disabledDomains`
ya viaje completo desde RN (§1.6) y que el registro compartido siga respondiendo igual (ya lo hace,
`nav.test.ts:125-188` prueba el filtro genérico). W2 NO toca ningún guard de ruta.

### 2.2 `groupNavItems()` reemplaza `splitForSidebar()`

`packages/coach-nav/nav.ts:228-236` — `splitForSidebar` hoy separa `primary`/`secondary` por
`entitlement != null || key === 'support'`, y `CoachSidebar.tsx:188` solo destructura `primary`
(el bug documentado en `wf-webIA.json` observación #1: Cardio, Movimiento y Soporte nunca se
pintan). Se reemplaza por una función de 3 grupos:

```ts
// PROPUESTO — packages/coach-nav/nav.ts, reemplaza splitForSidebar (líneas 228-236)
export type NavGroup = 'principal' | 'trabajo' | 'gestion'

const GROUP_OF: Record<string, NavGroup> = {
    dashboard: 'principal', clients: 'principal',
    programs: 'trabajo', nutrition: 'trabajo', cardio: 'trabajo', movement: 'trabajo',
    team: 'gestion', funciones: 'gestion', options: 'gestion', settings_team: 'gestion', support: 'gestion',
}

export function groupNavItems(items: NavModule[]): Record<NavGroup, NavModule[]> {
    const out: Record<NavGroup, NavModule[]> = { principal: [], trabajo: [], gestion: [] }
    for (const item of items) out[GROUP_OF[item.key] ?? 'trabajo'].push(item)
    return out
}
```

**R2 — adelanto del retiro de `entitlement` en cardio/movement**: `packages/coach-nav/nav.ts:114-115`
hoy oculta `cardio`/`movement` del registro compartido cuando `enabledModules.cardio`/
`movement_assessment` no está ON (línea 189, capa de billing histórico). R2 adelanta a **esta
wave** (no W4) borrar `entitlement: 'cardio'` / `entitlement: 'movement_assessment'` de esos dos
literales — cambio de una línea por item, sin tocar `featureDomain` (que sigue gateando por
`disabledDomains`, §1.6) — para que el sidebar agrupado de §2.2 pinte Cardio/Movimiento completos
desde W2 sin esperar la poda de `TIER_CAPABILITIES`/`hasPaidModuleAccess` de W4 (§4.2/4.3, que
sigue en W4 sin cambio). Se extiende `nav.test.ts` (§2.3) con el caso "cardio/movement visibles
sin `enabledModules` seteado, ocultos solo por `disabledDomains`".

`bodycomp` queda fuera de `GROUP_OF` a propósito (OUTLINE §3: "no tiene superficie top-level
propia, entra cuando exista") — no se agrega entrada de nav para bodycomp en esta wave.

Nueva entrada `funciones` en `NAV_MODULES` (`nav.ts:98-116`), contexts
`['coach_standalone', 'coach_team']` (OUTLINE §3):

```ts
// PROPUESTO — agregar a NAV_MODULES, después de 'support' (línea 112)
{ key: 'funciones', href: '/coach/settings/funciones', label: 'Funciones', shortLabel: 'Func.', icon: 'SlidersHorizontal', contexts: ['coach_standalone', 'coach_team'] },
```

`CoachSidebar.tsx:31,188` — cambia el import y la destructuración:

```ts
// HOY: import { getVisibleNavItems, splitForSidebar, ... }
// HOY: const { primary: primaryNavItems } = splitForSidebar(visibleNavItems)
// PROPUESTO:
import { getVisibleNavItems, groupNavItems, ... } from '@eva/coach-nav'
const { principal, trabajo, gestion } = groupNavItems(visibleNavItems)
```
El render (línea 319, hoy `{primaryNavItems.map(...)}`) pasa a 3 bloques con encabezado
("Tu trabajo", "Gestión") — `principal` sin encabezado, igual que hoy.

### 2.3 `nav.test.ts` — extensión

Agregar (no reemplazar) casos que prueben `groupNavItems`: Cardio/Movimiento caen en `trabajo`
solo cuando `entitlement` Y `disabledDomains` lo permiten (reusa exactamente el fixture de las
líneas 152-168 ya existentes, "entitlement y dominio COMPONEN"), y que `funciones`/`support` caen
siempre en `gestion`.

### 2.4 Barra RN: tab `more`

Diseño objetivo (BRIEF §1.3): Inicio · Alumnos · 2 dominios según especialidad · Más. Requiere
`PERSONA_DOMAIN_ORDER` (OUTLINE §3, nombre canónico) en `packages/feature-prefs/index.ts`, junto a
`resolvePersonaPrefs` (línea 429) que ya mapea persona → `_enabled` de los 5 dominios:

**Corrección tras crítica F5 sobre R5**: R5 pide derivar el orden "del orden en que
`resolvePersonaPrefs` declara los dominios" — verificado que ESE orden (el de las claves del
objeto que arma el helper `prefs()`, líneas 432-439) es un literal FIJO
(`nutrition,training,cardio,movement,bodycomp`) igual para las 5 personas; lo que sí varía por
persona son los `_enabled: true/false` de cada rama (líneas 442-486). Derivar literalmente "los
dominios ON, en ese orden fijo" rompe para persona `nutrition`: sin `alsoOther`, los únicos ON son
`nutrition` y `bodycomp` (línea 452-458) — y `bodycomp` no tiene tile de nav (§2.2, no está en
`GROUP_OF`/`NAV_MODULES`), así que tras el filtro de bodycomp (línea ~420) la barra queda con 1
solo dominio, no los 2 de M1-A.

Ajuste (dentro del margen que R5 ya habilita — "default razonable, reversible, ajustable en QA",
no decisión del owner): `PERSONA_DOMAIN_ORDER` toma, por persona, los dominios ON de
`resolvePersonaPrefs` (sin `alsoOther`) en el orden fijo de sus claves, seguidos de los dominios
OFF en ese mismo orden fijo como relleno — así el corte a 2 tras filtrar `bodycomp` siempre tiene
de dónde sacar el segundo tile (cada persona tiene 4 dominios no-`bodycomp`, nunca se queda corta):

```ts
// PROPUESTO — packages/feature-prefs/index.ts, junto a resolvePersonaPrefs (línea 429)
// ON primero (según resolvePersonaPrefs sin alsoOther, orden fijo de sus claves), después el resto
// como relleno — garantiza 2 dominios navegables tras filtrar 'bodycomp' (§2.4) para las 5 personas.
export const PERSONA_DOMAIN_ORDER: Record<Persona, readonly FeatureDomain[]> = {
    strength: ['training', 'nutrition', 'cardio', 'movement', 'bodycomp'],
    nutrition: ['nutrition', 'bodycomp', 'training', 'cardio', 'movement'],
    rehab: ['training', 'movement', 'nutrition', 'cardio', 'bodycomp'],
    endurance: ['training', 'cardio', 'nutrition', 'movement', 'bodycomp'],
    other: ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'],
}
```
(Valores derivados mecánicamente de `resolvePersonaPrefs` + relleno — el owner los confirma/ajusta
en QA device, R5 ya lo prevé.)

`CoachMobileChrome.tsx` — reemplazo del bloque `MOBILE_TAB_KEYS` + `.slice(0,5)` (líneas 39,
113-117, el bug de CORRECCIONES/`wf-rnIA.json` observación #2 que hoy pierde "Equipo"):

**Corrección tras crítica F5**: `useWorkspace()` (`apps/mobile/lib/workspace.ts:373-382`, verificado)
NO tiene campo `persona` — 0 matches. La persona real vive en `apps/mobile/lib/coach-persona.ts`,
detrás de un fetch async + caché (`getCachedCoachPersonaStatus(): CoachPersonaStatus | null`,
líneas 189+) — puede ser `null` mientras no resolvió o si el coach no la contestó (persona
`other` es un valor legítimo, no el fallback de "sin dato"). `CoachMobileChrome.tsx` es
síncrono: usa el snapshot cacheado, con `'other'` como default explícito de "todavía no sé" (igual
efecto que la rama `other` de `resolvePersonaPrefs`, panel completo, sin bloquear el render):

```ts
// PROPUESTO — reemplaza el cálculo de barItems (líneas 113-117)
import { getCachedCoachPersonaStatus } from '../../lib/coach-persona'
const persona = getCachedCoachPersonaStatus()?.persona ?? 'other' // snapshot síncrono; null ⇒ 'other' (panel completo) hasta que resuelva el fetch async ya disparado en otro punto del árbol
const domainOrder = PERSONA_DOMAIN_ORDER[persona] ?? PERSONA_DOMAIN_ORDER.other
const visibleDomainKeys = domainOrder
    .filter((d) => d !== 'bodycomp') // bodycomp no tiene item de nav, igual que hoy
    .map((d) => (d === 'nutrition' ? 'nutrition' : d === 'training' ? 'programs' : d))
    .filter((key) => byKey.has(key))
    .slice(0, 2)
const barItems = [byKey.get('dashboard'), byKey.get('clients'), ...visibleDomainKeys.map((k) => byKey.get(k))]
    .filter((item): item is NavModule => !!item)
// 'more' es un slot FIJO, no compite por el corte de 5 — siempre se agrega al final
```
El tab `more` en sí no es un `NavModule` del registro compartido (no tiene ruta de contenido
propia con gate de dominio/entitlement, es un agregador RN-only) — vive como slot sintético en
`NAV_ROUTE` + un nuevo archivo de pantalla:

```
apps/mobile/app/coach/(tabs)/more.tsx   (PROPUESTO, nuevo)
```
Registrado en `apps/mobile/app/coach/(tabs)/_layout.tsx` (no abierto línea a línea en esta pasada,
fuera del recorte de los mapas — el implementador debe agregar el `Tabs.Screen` siguiendo el
patrón de las 12 pantallas ya registradas ahí). Contenido de la hoja: Equipo (si team),
Funciones, dominios secundarios (los que no entraron en los 2 slots), Opciones, Soporte — todos
ya son rutas vivas, `more.tsx` es una lista de navegación, no una pantalla nueva de datos.

### 2.5 Otros items de W2

- **FAB del dashboard respeta dominios**: `apps/mobile/app/coach/(tabs)/home.tsx`, botón
  "Programa" del FAB — hoy sin gate (`wf-rnIA.json` `always_on_surfaces`). Envolver con
  `domains.training` (de `useEntitlements()`, ya disponible desde W1).
- **Toast honesto de Mi panel**: el toast "Listo, ya se ve" que hoy se dispara para `training` sin
  que el nav reaccione (`wf-rnIA.json` observación "Mi panel promete efecto visible... pero el nav
  RN nunca reacciona a 'training'") queda automáticamente correcto una vez que §1.6/§2.4 hacen que
  RN sí reaccione a los 5 — no requiere cambio de copy, solo dejar de ser mentira.

### 2.6 Gates W2

```bash
pnpm exec vitest run packages/coach-nav/nav.test.ts    # + los casos nuevos de groupNavItems
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm lint    # CoachSidebar.tsx + más.tsx + CoachMobileChrome.tsx
pnpm docs:check
```

---

## 3. W3 — Funciones todo-en-una (3–4 d-a, independiente de W2)

### 3.1 Web: `/coach/settings/funciones` absorbe todo

Ruta existente sin cambio (`apps/web/src/app/coach/settings/funciones/page.tsx` +
`_actions`/`_components`/`_data`, confirmado por `ls`). Cambios:

- Título: "Mi panel" (standalone) / "Funciones del equipo" (team) → "Funciones" en ambos
  contextos (unifica el nombre, BRIEF §1.5).
- Absorbe el catálogo de `/coach/settings/modules` (badges "Incluido"/"Con plan pago" MUEREN en
  W4, no en W3 — W3 solo mueve la fila "qué domino existe" al mismo panel, sin tocar copy todavía)
  y el launcher "Abrir" por dominio que hoy vive en `/coach/tools` (botón que navega a
  `/coach/cardio`, `/coach/movement`, picker de alumno para bodycomp — mismo destino, nueva
  ubicación).
- Especialidad (persona) sube arriba del todo (BRIEF §1.5 "Especialidad arriba"), reusando el
  bloque ya existente del panel "Mi panel" actual (5 tiles + segunda pregunta + checkbox "Ordenar
  mi panel según mi especialidad").
- El pane del rail desktop (`CoachSettingsDesktop` CATS, grupo "Entrenamiento") pierde la entrada
  "Módulos" (redirect, §3.3) y renombra "Mi panel" → "Funciones".

### 3.2 RN: pantalla nueva `funciones.tsx`

```
apps/mobile/app/coach/settings/funciones.tsx   (PROPUESTO, nuevo archivo)
```

No parte de cero: reusa las libs de datos que YA existen y ya resuelven el contrato completo:
- `apps/mobile/lib/mi-panel.ts` — `MI_PANEL_DOMAINS`, `loadMiPanelDomains`,
  `buildDomainSwitchPayload`, `saveMiPanelPersona`, `reseedDemoStudent` (persona + 5 switches +
  alumno de ejemplo + guía — TODO el contenido de `mi-panel.tsx` hoy).
- `apps/mobile/lib/feature-prefs.queries.ts` — `loadFeaturePrefs`, `saveFeaturePrefs`,
  `DomainPrefs` (el detalle de secciones de Nutrición — TODO el contenido de `features.tsx` hoy).
- El launcher "Abrir" reusa la lógica de `apps/mobile/app/coach/tools.tsx` (ordena por persona,
  filas `hasModule(key)`) pero ahora también consultando `domains` (§1.6) para decidir si el botón
  dice "Abrir" o "Prendé este dominio" en vez de bloquear con candado de plan.

`funciones.tsx` compone estos 3 bloques en una sola pantalla con scroll, orden: Especialidad →
"Qué se ve en tu panel" (5 switches con botón "Abrir" a la derecha de cada fila ON) → Detalle de
Nutrición (solo si `nutrition` ON) → Alumno de ejemplo → guía.

### 3.3 Redirects (compatibilidad de enlaces viejos)

Patrón de referencia ya existente en el repo: `apps/mobile/app/coach/foods.tsx` (redirect simple a
`/coach/nutricion?tab=foods`, citado en `wf-rnIA.json`) y `/coach/settings/preview` → 
`/coach/settings/brand` en web (`wf-webIA.json` observación de rutas vivas).

| Ruta vieja | Plataforma | Redirect a |
|---|---|---|
| `apps/mobile/app/coach/settings/mi-panel.tsx` | RN | `/coach/settings/funciones` |
| `apps/mobile/app/coach/settings/features.tsx` | RN | `/coach/settings/funciones` |
| `apps/mobile/app/coach/modules.tsx` | RN | `/coach/settings/funciones` |
| `apps/mobile/app/coach/tools.tsx` | RN | `/coach/settings/funciones` |
| `apps/web/src/app/coach/settings/modules/page.tsx` | web | `redirect('/coach/settings/funciones')` server-side |
| `apps/web/src/app/coach/tools/page.tsx` | web | `redirect('/coach/settings/funciones')` server-side |

Los archivos viejos NO se borran (rompería cualquier deep link/push/bookmark guardado) — se
vacían a un `export default function() { return <Redirect href="/coach/settings/funciones" /> }`
(RN, patrón `foods.tsx`) o a un Server Component de una línea con `redirect()` (web).

### 3.4 Opciones (hub) actualizado

`apps/mobile/app/coach/(tabs)/settings.tsx` — colapsa 3 filas ("Módulos", "Mi panel", "Funciones
de nutrición") en 1 ("Funciones" → `/coach/settings/funciones`). Web: el hub `/coach/settings`
(móvil: cards; desktop: rail) pierde la card/pane "Módulos" (queda "Funciones" sola).

### 3.5 Analítica: `domain_toggled`

Único evento nuevo (OUTLINE §3): se dispara en el handler de cada switch de dominio, en ambas
plataformas — web dentro del `onCheckedChange` del componente de switches de
`_components/` de `/coach/settings/funciones`, RN dentro de `buildDomainSwitchPayload` /
el `onPress` del switch en la nueva `funciones.tsx`:

```ts
// PROPUESTO, ambas plataformas
posthog.capture('domain_toggled', { domain, enabled, from: 'funciones' })
```

### 3.6 Gates W3

```bash
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm exec vitest run apps/web/src/app/coach/settings/funciones   # tests existentes del pane, no deben romper
pnpm lint
pnpm check:tokens     # pantalla nueva RN + pane ampliado web tocan colores/spacing
pnpm docs:check
```

---

## 4. W4 — Todo-incluido + demolición (2–3 d-a, independiente de W2/W3)

### 4.1 Candados → toggles normales

`packages/feature-prefs/index.ts` — las 2 secciones con `requiresModule` no-null
(`FEATURE_DOMAINS.nutrition`, línea 192 `micros_advanced: requiresModule: 'nutrition_exchanges'`;
línea 201 `goals_bodycomp: requiresModule: 'body_composition'`) pasan a `requiresModule: null`
(D1: "NO hay módulos pagos" — el candado por entitlement en la capa de PREFERENCIA deja de tener
sentido; el `resolveSections` de línea 398-399 ya cae al `entitled = true` cuando
`requiresModule` es `null`, cero cambio de lógica adicional). Esto también saca el candado visual
en el editor de secciones web (`FeaturePrefsPanel`) y RN (`features.tsx`/`funciones.tsx`).

### 4.2 Copy de "módulo pago" muere — y tensión R8/R6 sin resolver

**Nota de alineación (crítica F5, transversal)**: R8 pide que W4 "migre los usos de
`ModuleOffNotice` a `DomainOffNotice` y borre el viejo — no conviven a largo plazo". R6 pide
COMPONER, no reemplazar, el gate de módulo con el de dominio en cardio/movement/bodycomp
(§1.4/§1.6) — y ese gate de módulo es justamente el que renderiza `ModuleOffNotice` cuando
`status === 'module_off'`. Mientras el kill-switch de operador (`EVA_DISABLED_MODULES`) siga vivo
como defensa en profundidad (R6, sin fecha de retiro), cardio/movement/bodycomp necesitan un
componente que muestre ESE estado — no hay reemplazo limpio de `ModuleOffNotice` por
`DomainOffNotice` sin perder la superficie que R6 pidió conservar. Este PLAN no puede resolver la
tensión unilateralmente (contradice a R6 o a R8 según qué lado cede) — lo que sigue es lo máximo
que W4 puede hacer sin decidir por el owner: retitular `ModuleOffNotice` para que ya no hable de
"plan pago" (abajo) y dejarlo vivo como el aviso de `module_off` (kill-switch), mientras
`DomainOffNotice` (W1) cubre `domain_off` (preferencia) — dos componentes, un estado cada uno, en
vez de la fusión que pide R8. Marcar como pendiente de decisión del owner antes de W4.

- `apps/web/src/components/coach/ModuleOffNotice.tsx:67-74` — reemplaza "Este módulo viene
  incluido en cualquier plan pago de EVA" + botón "Ver planes" (→`/coach/subscription`) por
  "Prendé este dominio en Funciones" + botón → `/coach/settings/funciones`.
- `apps/mobile/components/ModuleOffNotice.tsx:87-91` — mismo copy, mismo cambio de CTA por-defecto
  (deja de ser `<RefreshPlanButton />`, pasa a navegar a `/coach/settings/funciones`; el prop
  `cta?: CtaProp` ya soporta la inyección sin tocar cada call-site, dato de `ficha-y-gates.md` §B.7).
- `/coach/settings/modules` (web) y `apps/mobile/app/coach/modules.tsx` — el CONTENIDO del
  catálogo ("Incluido"/"Con plan pago") se demuele (la ruta ya es redirect desde W3, §3.3 — en W4
  se borra el componente que ya no se renderiza en ningún lado).
- `hasPaidModuleAccess` (`apps/web/src/services/entitlements.service.ts`, citado en
  `wf-machinery.json` gap "coaches.enabled_modules es casi cosmético") — se deja de invocar en
  los call-sites de UI que aún lo hagan para pintar badges; `deriveModulesForPaidAccess` (que
  fuerza los 4 módulos ON para todo coach activo) NO se toca — sigue siendo la fuente real de
  entitlement técnico (kill-switch de operador y coach inactivo dependen de ella).

### 4.3 `TIER_CAPABILITIES` — poda

`packages/tiers/index.ts` — de las 6 capacidades (`canUseNutrition`, `canUseBranding`,
`canUseAdvancedReports`, `canCreateCustomExercises`, `canImportClients`, `showsEvaBadge`),
**se retira SOLO `canUseAdvancedReports`** (comentada "gate not active yet", cero consumidores de
producción). **CORRECCIÓN 2026-09-01 (preflight, sesión paralela):** la versión anterior de este
párrafo ordenaba podar también `canUseNutrition`, `canCreateCustomExercises` y `canImportClients`
apoyándose en `wf-machinery.json`; ese mapa estaba desactualizado — las tres siguen gateando
rutas vivas (pagos en `create-preference`/`confirm-enrollment`, importación masiva y creación de
ejercicios, 9 call sites; ver TASKS W4.5 y SPEC §«capabilities»). Quien ejecute W4.5 sigue a
TASKS/SPEC, no a este párrafo viejo. Antes de borrar el campo, grep de su nombre sobre `apps/` y
`packages/`: los 4 hits que quedan son tests (`pricing-v3.test.ts:40`, `pricing-v2.test.ts:147,159`,
`constants.test.ts:108`) y se actualizan en el MISMO commit (snapshots `toEqual` + acceso tipado:
sin tocarlos, `pnpm test` y `pnpm typecheck` quedan rojos).

### 4.4 Demoliciones (BRIEF §1.7)

| Qué | Archivo(s) | Acción |
|---|---|---|
| Pantalla Check-ins huérfana | `apps/mobile/app/coach/(tabs)/check-ins.tsx` (378 líneas, 0 `router.push` apunta acá) | Borrar archivo + su `Tabs.Screen` en `(tabs)/_layout.tsx` |
| CoachSearchPalette sin montar | componente + `lib/coach-search.ts` (no verificados línea a línea, confirmado NO montado en ningún header) | Borrar ambos si el implementador confirma 0 imports fuera de sí mismos |
| FacturacionTab muerto | Web: `components/coach/clientDetail/FacturacionTab.tsx` (si existe espejo web, no verificado en esta pasada) · RN: `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` + `'facturacion'` en el union `ClientTab` de `ClientTabBar.tsx:13` | Borrar componente(s) + sacar `'facturacion'` del tipo |
| CTA "Ir a facturacion" | `CoachDashboardSections.tsx:2146` (next-best-action del dashboard RN, apunta a superficie inexistente) | Quitar la rama que genera esa acción |
| Deltas KPI hardcodeados | `DesktopBento.tsx` (web, literales "+1 esta semana", "+3 vs. semana previa") | Quitar el texto o calcularlo real (fuera de alcance del cálculo real si no hay fuente de datos — mínimo: quitar el literal falso) |
| Flags muertos | `apps/web/src/lib/feature-flags.ts` — `NEXT_PUBLIC_FF_WEEKLY_PLAN`, `NEXT_PUBLIC_FF_DETAILED_LOGGING` | Borrar las constantes y su lectura de env; grep de sus nombres antes, por si algún componente V1 de nutrición muerto los sigue importando |

`EVA_DISABLED_MODULES` NO se toca (BRIEF §3: sigue existiendo como palanca de incidentes del
operador, distinta de paywall).

### 4.5 Gates W4 — y gate final de la ola

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm check:tokens
pnpm check:nutrition-v2-boundaries   # W4 toca requiresModule de nutrition_exchanges/body_composition
pnpm docs:check
```

Por ser la wave que más superficie transversal toca (tipos compartidos, `packages/tiers`, copy en
ambas plataformas) y por la regla del repo de correr la suite completa UNA vez antes del push
final, W4 es el punto natural para `pnpm build` (web) completo antes de abrir el PR hacia
`master`, en vez de repetirlo en cada wave.

---

## 5. Estrategia de entrega

- Cada wave es un PR propio contra una rama de trabajo con `master` mergeado al día (regla del
  repo: "OTAs solo desde rama con master mergeado" — vale igual para el deploy web).
- **W1** y **W2** tienen dependencia estricta (W2 después de W1 en `master`); **W3** y **W4** son
  independientes entre sí y de W2, pueden mergearse en cualquier orden relativo una vez W1 está en
  `master` (W3 asume que `assertDomainEnabled`/`useDomainGuard` existen si su launcher los usa
  para el copy "Prendé este dominio"; si W3 se adelanta a W1 en el calendario, su launcher debe
  degradar a mostrar el botón "Abrir" sin el aviso nuevo hasta que W1 aterrice — decisión de
  secuencia real la fija el owner, este PLAN documenta la dependencia técnica, no la impone).
- Por wave: deploy web (Vercel, rama → preview → promote) + 2 OTAs (android/ios) al runtime
  vigente (1.1.2 al 31-08) desde la MISMA rama con `master` mergeado, igual que el patrón de
  entregas recientes (`docs/status/CURRENT.md`, tren 28/29/30-08).
- **Cero cambio nativo** en ninguna wave (ni permiso, ni plugin, ni dependencia con código nativo
  nuevo) — las 4 waves viajan por OTA sin binario nuevo. Si el implementador introduce una
  dependencia nueva en cualquier wave, esa afirmación deja de sostenerse y debe revisarse contra
  `apps/mobile/AGENTS.md` §"Cambios nativos y releases" antes de continuar.
- **Cero migraciones DB** confirmado en §0 — ninguna wave requiere el protocolo de
  Branching/fallback aditivo de `AGENTS.md` raíz.

## 6. Riesgos que el crítico debe presionar

**Actualizado tras crítica y arbitraje final del jefe (RESOLUCIONES-2 R10/R11)**: contrato
cerrado — web `assertDomainEnabled: Promise<void>` redirige ella misma (server-side, sin flash);
RN `useDomainGuard: boolean` con early-return ANTES del fetch; resolvers boolean para las rutas
con patrón `status`. `PERSONA_DOMAIN_ORDER` (§2.4) ya no depende de un orden que no existe.
Las dos tensiones que este documento dejaba abiertas están resueltas: (a) los 4 call-sites de
`nutrition-plans` SE MIGRAN a `assertDomainEnabled` (TASKS W1.4 ya lo ordena; sin eso el banner
`notice=domain_off` jamás dispara para nutrición); (b) tensión R6/R8 → R11: `ModuleOffNotice` no
se borra en esta ola — W4 unifica copy y estilo con `DomainOffNotice` (sin upsell) y deja la
fusión física como deuda anotada; R8 queda enmendada así.

- W1 compone DOS sistemas de gate (módulo viejo + dominio nuevo) en cardio/movement/bodycomp en
  vez de reemplazar uno por otro — es la decisión más discutible del PLAN (ver §1.4/§1.6): manda
  la ambigüedad de `ficha-y-gates.md` §B.8 ("cualquier gate nuevo de ruta debería decidir contra
  cuál de las dos fuentes valida, para no sumar una TERCERA"). Este PLAN elige COMPONER, no
  reemplazar, para no tocar `_data/cardio.queries.ts`/`movement.queries.ts`/
  `body-composition.queries.ts` (no verificados línea a línea, fuera del recorte de los mapas) —
  el crítico debería verificar que esa composición no introduce un redirect-loop entre el guard
  de módulo y el de dominio.
- El deep link `eva://coach/guia` (allowlist de `+native-intent.ts`, citado en `wf-rnIA.json`) y
  cualquier otro deep link a una ruta que W1 empieza a gatear necesitan probarse contra el nuevo
  `useDomainGuard` — OUTLINE §5 ya lo marca como vigilancia obligatoria.
- El banner `notice=domain_off` (§1.5) es diseño nuevo; si el owner prefiere reusar
  `ModuleOffNotice` en vez de un banner de dashboard, cambia el diseño de W1 — este PLAN toma la
  opción banner porque el patrón `redirect()` liso de `nutrition-plans` (B.0) no deja lugar para
  un componente de aviso in-page.
