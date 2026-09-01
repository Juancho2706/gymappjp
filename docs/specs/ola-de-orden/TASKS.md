---
status: active
owner: product-engineering
last_verified: "2026-09-01"
canonical: false
---

# TASKS — Ola de orden («La casa ordenada»)

Desglose ejecutable de `docs/specs/ola-de-orden/PLAN.md`. Nombres canónicos = OUTLINE §3 (no
inventar variantes). Cada tarea es atómica: archivo(s), qué cambia, criterio de verde verificable,
estimación en fracción de día-agente (d-a). `pref:<dominio>` = gate nuevo por `coach_feature_prefs`;
`module:<key>` = gate viejo por `enabled_modules` (D1: para todo coach con acceso vigente, siempre
ON salvo `EVA_DISABLED_MODULES` — deja de ser paywall, se conserva solo como kill-switch de
operador). Repo `D:\Proyectos\Antigravity\gymappjp` — todas las rutas verificadas con Grep/Glob/Read
en esta sesión o heredadas de `maps/wf-*.json` y `maps/ficha-y-gates.md` (ya citados `archivo:línea`).

Dependencias entre waves: **W2 depende de W1** (la barra RN y el sidebar necesitan que
`disabledDomains`/`domainsEnabled` ya lleguen reales desde W1). **W3 y W4 son independientes entre
sí** y de W2 en lo funcional, pero como comparten archivos con W1/W2 (settings hub, nav) conviene
correrlas después para no pisarse.

---

## W1 · Interruptores de verdad

Hace que apagar un dominio cierre la ruta de verdad (server-side en web, guard de pantalla en RN),
no solo el ítem de menú. Motor: `coach_feature_prefs` (ya existe, sin cambios de esquema) vía
`resolveDomainEnabled` (`packages/feature-prefs/index.ts:341`, pura, ya acepta `domain` genérico).

### Estado de ejecución W1 (2026-09-01) — 14 commits locales en `rnmobiledenuevo`, SIN push ni OTA

Precondición SPEC §6.3 cerrada antes de tocar código: `FEATURE_PREFS_ENABLED = true` vivo en Edge
Config (store `eva-config`, actualizado 17-jul); filas `_enabled=false` en LIVE: bodycomp 28/43 ·
cardio 27/43 · movement 25/43 · nutrition 22/58 · training 1/43; `team_feature_prefs` 1 fila sin
key; `client_feature_prefs` 0. Muestra QA: **kut** (nutrition+bodycomp OFF), **jesus-coach**
(cardio/movement/bodycomp OFF), **jpl** (persona nutrition; cardio/movement OFF). Mockup-lote
aprobado por el owner: artifact `9801fec7`, decisiones **1A 2A 3A 4A**.

| Tarea | Estado | Commit | Verde real |
|---|---|---|---|
| W1.10 retiro `FEATURE_PREFS_ENABLED` | ✅ | `11ebbbbc` | grep 0 fuera de docs; tests del service actualizados |
| W1.2 RN consume los 5 dominios | ✅ | `57e22de6` | tsc mobile; `tests/mobile-entitlements-domains.test.ts` |
| W1.6 hook `useDomainGuard` | ✅ | `de5c831a` | contrato documentado en `lib/domain-guard.ts` |
| W1.11 contrato `MOBILE_TAB_KEYS` ↔ `NAV_MODULES` | ✅ | `3bea5565` | `tests/mobile-nav-tab-keys-contract.test.ts` |
| W1.12 extensión `nav.test.ts` | ✅ | `04c2ef62` | 45 → 52 casos |
| W1.1 `/api/mobile/config` 5 dominios (+W1.13.d) | ✅ | `eb656674` | test de contrato del route handler |
| W1.3 resolvers + `assertDomainEnabled` (+W1.13.a) | ✅ | `01d57935` | `feature-prefs.service.test.ts` (+20 casos), `domain-off.test.ts` |
| W1.4a gates redirect (training, nutrition-v2, 4× nutrition-plans) | ✅ | `322d6911` | `workout-programs/page.test.tsx`, `nutrition-v2/page.test.tsx` |
| W1.4b status `domain_off` + `DomainOffNotice` web (+W1.13.c status) | ✅ | `c902b8a0` | cardio.queries (7) · movement.queries (5) · body-composition.queries (5) · DomainOffNotice (4) |
| W1.5 banner `notice=domain_off` | ✅ | `74bff737` | `DomainOffBanner.test.tsx` (9) |
| W1.6 componente `DomainOffNotice` RN (+W1.13.b) | ✅ | `30d14fbe` | `tests/mobile/domain-guard.test.ts` (6) · `domain-off.test.ts` (4) |
| W1.7 gates RN (7 pantallas) | ✅ | `aa36ea84` | tsc mobile; sin render tests (el repo no monta pantallas RN) |
| W1.8 ficha web | ✅ | `072c09b0` | `_lib/profile-tabs.test.ts` (9); incluye `CoachFichaPanel` (master-detail) |
| W1.9 ficha RN | ✅ | `29c4a669` | `tests/mobile/client-tabs.test.ts` (10) |
| W1.9B | anulada (R15) | — | — |

Suite completa (lint · typecheck · test · tsc mobile · tokens · boundaries · docs · expo export
android): ver CURRENT.md — se corre UNA vez al cierre. QA en device/navegador del owner: PENDIENTE
(lista abajo).

### Juicio del jefe (2026-09-01) — decisiones tomadas al ejecutar, con su porqué

1. **W1.10 primero.** Con el flag vivo en `true`, retirarlo es un no-op en prod; hacerlo antes que
   los gates evita que un gate nuevo lea una fuente que después cambia.
2. **`featurePrefsEnabled: true` y `nutritionEnabled` se conservan como espejo legacy** en
   `/api/mobile/config` (PLAN §1.8 decía borrarlos): binarios anteriores a este OTA (p. ej.
   `coach-client-detail.ts`) los leen; se retiran cuando el piso OTA los deje atrás.
3. **Enterprise (`clientOrgId` / `scope.orgId`) ⇒ 5 dominios ON sin leer** (SPEC §10: el coach
   enterprise no entra a Funciones; gatearlo sería un lockout sin puerta). Cambia el comportamiento
   de los 2 call-sites de `nutrition-plans` que pasaban `clientOrgId`.
4. **`resolveDomainsEnabled` agregador de UNA query** (base coach/team + override alumno) del que
   cuelgan los 5 wrappers boolean; PLAN §1.3 pedía 5 wrappers con lecturas propias.
5. **PLAN §1.6 «early return antes de hooks» rompe rules-of-hooks**: el contrato real (gatear el
   efecto de fetch + rama en el JSX) vive en el JSDoc de `apps/mobile/lib/domain-guard.ts`; el hook
   vive ahí y no en `feature-prefs.queries.ts`. `MOBILE_TAB_KEYS` se movió a `coach-tab-keys.ts`
   (puro) para que el test de contrato no arrastre RN.
6. **`settings/modules/_data/modules.queries.ts` conserva `resolveNutritionDomainEnabled`**: es
   lectura de estado del toggle, no gate; migrarlo a `assertDomainEnabled` encerraría al coach
   fuera de la pantalla donde re-prende.
7. **Precedencia pref → módulo en las DOS plataformas.** En web la decide la función `_data`
   (devuelve `domain_off` antes de llamar `assertModule`); el orden de los `if` en `page.tsx` es
   irrelevante porque los status son excluyentes. En RN es la cadena `!domain.enabled ?
   DomainOffNotice : !hasModule ? ModuleOffNotice : contenido`. Corrige la lectura del preflight
   W2/W4 (que veía «web module_off primero»): no hay divergencia.
8. **Copy compartido en `@eva/feature-prefs`** (`DOMAIN_LABELS`, `DOMAIN_GENDER`,
   `FUNCIONES_LABEL = 'Mi panel'`, `domainOffCopy`, `domainOffBannerCopy`): decisión 1A exige UNA
   constante web+RN y `apps/web/src/lib` no es alcanzable desde mobile. Las rutas sí son por app
   (`FUNCIONES_PATH` web `/coach/settings/funciones`; `MI_PANEL_PATH` RN `/coach/settings/mi-panel`).
   W3 renombra tocando `FUNCIONES_LABEL` + las dos rutas.
9. **Ficha: el override por-alumno NO oculta pestañas** (4A): `resolveDomainsEnabled` se llama SIN
   `clientId` en `[clientId]/page.tsx`, `ficha-panel.data.ts` y `bodycomp/_data`; el coachId es el
   DUEÑO del recurso (misma fuente que `getEnabledModulesForRender`).
10. **`cardio/[clientId]` web redirige al hub** (donde vive el aviso) en vez de duplicar el aviso;
    las subrutas RN `cardio/[clientId]` y `movement/[clientId]` (incl. wizard `?start=1`) sí se
    gatean porque comparten el patrón `hasModule + ModuleOffNotice`.
11. **Builder RN espera `training.ready`** (contrato del guard: «todavía no se sabe: no se pega a
    la DB»). Trade-off aceptado: en un arranque frío SIN caché con `/api/mobile/config` caído (y
    workspace resuelto), la pestaña Programas muestra el loader hasta el próximo foreground; el hub
    de Nutrición ya se comportaba así (`entitlements.ready`). Vigilar en QA.
12. **Banner W1.5 primero en la pila** (antes de VerifyEmail): responde al gesto que el coach
    acaba de hacer y se va solo; la × limpia la query con `history.replaceState` (sin
    `router.replace`, que refetchearía el RSC del dashboard entero).

### Pendientes declarados de W1 (no bloquean el cierre; entran a QA o a W2/W4)

- Subrutas web de Movimiento por alumno (`movement/[clientId]`, `/new`, `/print`) NO gatean por
  dominio: sus `_data` devuelven `null ⇒ notFound()`, sin patrón `status`. El hub y el nav sí
  cierran; un deep link directo con `movement` apagado sigue sirviendo (visibilidad, no permisos).
- `program-builder` RN y `/coach/builder/[id]` web (editores) no gatean `training`: W1.7 cubre la
  biblioteca (`builder.tsx`); el atajo «Programa» del Resumen RN cae a Resumen (no-op) en vez de
  abrir el editor.
- Resumen de la ficha (web y RN) sigue pintando el ring/tarjeta «Nutrición» y los widgets del
  dominio aunque esté apagado (solo se apaga el atajo a la pestaña en RN): los widgets por dominio
  son W2/W4.
- CTA RN a `/coach/settings/mi-panel` para coach de **team**: esa pantalla es solo-standalone y
  muestra su aviso «lo define el equipo»; no crashea. W3 unifica el destino.
- Bodycomp RN con dominio apagado muestra subtítulo «Alumno» (no lee el nombre: cero fetch).
- Sin cobertura automática del ctx exacto de `resolveDomainsEnabled` en `[clientId]/page.tsx`
  (no existe test de esa page; verificado por lectura). `ficha-panel.data.ts` tampoco tiene test.
- `builder.tsx` arrastra 3 errores previos de `react-hooks` (reglas nuevas) fuera del lint raíz.

### QA en device / navegador del owner — W1 (con kut · jesus-coach · jpl)

- **Web, kut (nutrition+bodycomp OFF):** `/coach/nutrition-v2` y `/coach/nutrition-plans` ⇒
  redirect al dashboard con el banner «Nutrición está apagada en tu panel.» + «Ir a Mi panel» + ×
  (la × limpia la URL; F5 no lo revive). Ficha de un alumno (standalone y panel desktop): sin
  pestaña Nutrición; `/coach/clients/<id>/bodycomp` ⇒ aviso in-page «Composición corporal está
  apagada en tu panel» con los dos botones. Dark mode y marca del coach en el ícono/botón.
- **Web, jesus-coach (cardio/movement/bodycomp OFF):** `/coach/cardio` ⇒ conserva el header
  «♥ Cardio · Módulo · Herramientas» + aviso; `/coach/cardio/<clientId>` ⇒ vuelve al hub;
  `/coach/movement` ⇒ aviso a pantalla completa. Prender Cardio en Mi panel y volver: la página
  carga normal.
- **RN, jesus-coach:** deep link `eva://coach/cardio`, `/coach/cardio/<id>`,
  `/coach/movement/<id>?start=1`, `/coach/bodycomp/<id>` ⇒ `DomainOffNotice` con header, CTA
  «Prender en Mi panel» abre Mi panel; sin flash de contenido ni request (ver Metro/Network).
- **RN, jpl (cardio/movement OFF, nutrition ON):** Programas (tab) y Nutrición cargan normal; la
  ficha muestra las 5 pestañas. Apagar Entrenamiento en Mi panel ⇒ Programas muestra «Programas» +
  aviso sin «Nueva»; la ficha pierde Entreno y Programa y cae a Resumen si estaba ahí.
- Transversal: safe areas (notch/home indicator no tapan el CTA), dark mode, marca custom, y que
  el aviso de bodycomp RN no confunda con «Alumno» en el subtítulo.


### Contrato / config

**W1.1 — `/api/mobile/config` expone los 5 dominios**
Archivo: `apps/web/src/app/api/mobile/config/route.ts` (bloque `resolveNutritionPrefs`,
líneas 102-141, y `readBaseNutritionPrefs` 56-86 como molde).
Qué cambia: agrega `featurePrefs.domains: {nutrition, training, cardio, movement, bodycomp}`
(booleans, master switch `_enabled` resuelto vía `resolveDomainEnabled` para cada uno, mismo
fail-open que hoy tiene nutrición). `nutritionEnabled` se conserva 1 versión como espejo legacy
(`nutritionEnabled === domains.nutrition`) con comentario de retiro fechado. Respeta D9-A: si
`scope.clientId` está presente (alumno), los 5 vienen `true` fijo — mismo `if` que hoy corta en
línea 112-119, extendido a los 5 en vez de solo nutrición.
Verde: test de contrato del route handler (ver W1.13.d) — `GET` devuelve las 5 keys booleanas;
para `scope.clientId` presente, las 5 son `true` sin importar las prefs guardadas.
Estimación: 0.5 d-a.

**W1.2 — RN consume los 5 dominios**
Archivos: `apps/mobile/lib/entitlements.ts:231-243` (agrega `domainsEnabled: Record<FeatureDomain,
boolean>` derivado de `s.config.featurePrefs.domains`; `nutritionEnabled` pasa a ser
`domainsEnabled.nutrition` para no duplicar la fuente) y `apps/mobile/components/coach/
CoachMobileChrome.tsx:102` (`disabledDomains` se arma desde los 5, no solo `nutrition`).
Verde: `pnpm --filter @eva/mobile exec tsc --noEmit` limpio; test de contrato W1.13.a/b confirma
que Programas/Cardio/Movimiento reaccionan, no solo Nutrición.
Estimación: 0.25 d-a.

### Gates de ruta — web

**W1.3 — 4 wrappers de resolución + `assertDomainEnabled`**
Archivo: `apps/web/src/services/feature-prefs.service.ts` (molde exacto: `resolveNutritionDomainEnabled`
líneas 311-339). Qué cambia (contrato exacto de PLAN §1.3 — TASKS lo copia literal, no lo
reinterpreta): se agregan 4 wrappers análogos — `resolveTrainingDomainEnabled`,
`resolveCardioDomainEnabled`, `resolveMovementDomainEnabled`, `resolveBodycompDomainEnabled` —
cada uno `Promise<boolean>` (mismo `cache()`, mismo `readCoachPrefs`/`readTeamPrefs`/
`readClientPrefs`, mismo fail-open, misma rama `audience === 'student' → true` de D9-A). Sobre esos
5 resolvers boolean (incluida `resolveNutritionDomainEnabled` ya existente) se agrega
`assertDomainEnabled(domain: FeatureDomain, ctx): Promise<void>` — llama al resolver vía un mapa
`RESOLVERS` y hace `redirect('/coach/dashboard?notice=domain_off&domain=<domain>')` si da `false`.
`assertDomainEnabled` la usan SOLO las rutas de redirect liso: `training` y `nutrition` (W1.4).
Cardio/movement/bodycomp NO usan `assertDomainEnabled` — consumen su resolver boolean directo,
compuesto dentro de la función `_data` existente (ver W1.4, patrón `status`).
Verde: test unitario de los 5 resolvers boolean — fila ausente ⇒ `true` (fail-open);
`audience:'student'` ⇒ `true` siempre, incluso con la fila guardada en `false`. Test separado de
`assertDomainEnabled` (mock del resolver): con `false` llama `redirect()` con la URL exacta; con
`true` no llama `redirect()`.
Estimación: 0.5 d-a.

**W1.4 — Gates en las 5 superficies web**
Archivos y punto de inserción exacto (de `maps/ficha-y-gates.md` §B y PLAN §1.4 — dos patrones
distintos, no uno solo; TASKS colisionaba con PLAN acá y queda corregido):
- `apps/web/src/app/coach/workout-programs/page.tsx` — insertar `await
  assertDomainEnabled('training', ctx)` entre línea 13 (`if (!coach) redirect('/login')`) y línea
  15 (`getPreferredWorkspaceForRender`): `training` sin guard hoy. Redirect liso.
- `apps/web/src/app/coach/nutrition-v2/page.tsx` — insertar `await
  assertDomainEnabled('nutrition', ctx)` entre línea 43 (auth) y línea 46 (redirect enterprise):
  `nutrition` sin guard hoy en el hub V2. Redirect liso.
- `apps/web/src/app/coach/nutrition-plans/*` (+`new`, `[templateId]/edit`, `client/[clientId]`,
  4 call-sites) — MIGRAR de `resolveNutritionDomainEnabled` + `redirect('/coach/dashboard')` liso a
  `assertDomainEnabled('nutrition', ctx)`, para que el redirect lleve `?notice=domain_off
  &domain=nutrition` (hoy no lleva query — sin esto el banner de W1.5 no tiene de qué disparar
  para el dominio con más apagones esperables). Corrige la instrucción anterior de TASKS («no
  tocar esas 4 rutas») que colisionaba con PLAN §1.4.
- `apps/web/src/app/coach/cardio/page.tsx:17-23`, `apps/web/src/app/coach/movement/page.tsx:16-19`,
  `apps/web/src/app/coach/clients/[clientId]/bodycomp/page.tsx:16-20` — estas 3 NO usan
  `assertDomainEnabled` (no hacen redirect liso, PLAN §1.4). Sumar `resolveCardioDomainEnabled`/
  `resolveMovementDomainEnabled`/`resolveBodycompDomainEnabled` DENTRO de la función `_data`
  existente (`getCardioPageData()`/`getMovementHub()`/`getClientBodyComposition()` — paso 0 de esta
  tarea: Grep/Read de confirmación de la función real, R7, no verificada línea a línea) como una
  llamada más; agregar `domain_off` como tercer `status` posible junto al `module_off` existente,
  SIN tocar la firma pública de retorno más que sumar el nuevo status. La página renderiza
  `DomainOffNotice` si `status === 'domain_off'`, `ModuleOffNotice` (kill-switch de operador, W4 le
  cambia el copy) si `status === 'module_off'` — se COMPONE, no se reemplaza (R6).
Verde: para `training`/`nutrition`(-v2 y los 4 `nutrition-plans/*`), con la fila de prefs en
`false`, la respuesta es un redirect a `/coach/dashboard?notice=domain_off&domain=<key>` (no 200).
Para cardio/movement/bodycomp, con la fila en `false`, la función `_data` devuelve
`status: 'domain_off'` y la página renderiza `DomainOffNotice` (sin redirect, sin 200 con
contenido).
Estimación: 1,0 d-a.

**W1.5 — Banner del dashboard lee `notice=domain_off`**
Archivo: `apps/web/src/app/coach/dashboard` (banner nuevo o extensión de la pila de banners
existente — `VerifyEmailBanner`/`BillingBanners` como vecinos). Qué cambia: si
`searchParams.notice === 'domain_off'`, pinta un aviso leve «Prendé `<dominio>` en Opciones ›
Funciones» con link a `/coach/settings/funciones` (ruta ya existe; el retitulado es W3).
Verde: QA manual — visitar `/coach/dashboard?notice=domain_off&domain=cardio` pinta el banner con
el nombre del dominio correcto.
Estimación: 0.25 d-a.

### Gates de ruta — RN

**W1.6 — Hook `useDomainGuard` + `DomainOffNotice`**
Archivos NUEVOS: `apps/mobile/lib/feature-prefs.queries.ts` (agrega
`useDomainGuard(domain: FeatureDomain): boolean`, lee `domainsEnabled` de W1.2) y
`apps/mobile/components/coach/DomainOffNotice.tsx` (patrón de `apps/mobile/components/
ModuleOffNotice.tsx:1-127` — reutiliza su prop `cta?: CtaProp` ya flexible, línea 56 — pero SIN el
copy de plan pago: «Prendé esta función en Opciones › Funciones» + CTA a `/coach/settings/mi-panel`
[el destino cambia a `/coach/settings/funciones` en W3, no antes de que exista la pantalla]).
Verde: test de componente (render con `cta` default vs custom) + `tsc --noEmit`.
Estimación: 0.5 d-a.

**W1.7 — Gates en las 5 superficies RN**
Archivos:
- `apps/mobile/app/coach/(tabs)/builder.tsx` — `useDomainGuard('training')` al inicio del
  componente, antes de cualquier fetch (cero guard hoy, confirmado B.5).
- `apps/mobile/app/coach/nutrition-v2/index.tsx` (y su re-export `apps/mobile/app/coach/(tabs)/
  nutricion.tsx`) — `useDomainGuard('nutrition')` (cero guard hoy en RN para el hub, a diferencia
  del web que ya tiene `nutrition-plans/*`, B.6).
- `apps/mobile/app/coach/cardio/index.tsx:34-41`, `apps/mobile/app/coach/movement/index.tsx`
  (mismo patrón de carpeta, no verificado línea a línea per CORRECCIONES/ficha-y-gates B.7),
  `apps/mobile/app/coach/bodycomp/[clientId].tsx:48-50` — SUMAR `useDomainGuard` junto al
  `hasModule(...)`/`ModuleOffNotice` existente (mismo criterio que W1.4: pref manda antes que
  módulo; módulo queda como kill-switch).
Verde: con la fila de prefs en `false`, cada pantalla renderiza `DomainOffNotice` en vez de
montar su fetch de datos (verificar con test o log que el fetch NO corre — mismo patrón
«MONEY-SAFETY: cero fetch» que ya usan `movement.tsx`/`bodycomp.tsx` del lado alumno).
Estimación: 0.75 d-a.

### Ficha del alumno (vista del coach)

**W1.8 — Web: `ProfileTabNav` deja de ser hardcodeado**
Archivos: `apps/web/src/app/coach/clients/[clientId]/page.tsx:65-79,144-158` (agrega fetch de los
5 dominios junto al `enabledModules` existente — reusar `assertDomainEnabled` en batch, no crear
una tercera fuente per CORRECCIONES #4), `apps/web/src/app/coach/clients/[clientId]/
ProfileTabNav.tsx:13-19` (`TABS` pasa de `const` module-level a función de `enabledDomains`: oculta
`nutrition` si el dominio está off), `apps/web/src/app/coach/clients/[clientId]/
ClientProfileDashboard.tsx:333,421,449` (si el `activeTab` activo corresponde a un dominio recién
apagado, cae a `overview` en vez de renderizar `TrainingTabB4Panels`/`ProgramTabB7`/`NutritionTabV2`
vacíos).
Verde: test unitario de la función de filtro de `TABS` (5 casos: cada dominio off oculta su
pestaña; los 5 on muestra las 5) + QA manual en `/coach/clients/[clientId]`.
Estimación: 0.5 d-a.

**W1.9 — RN: `[clientId].tsx` deja de ser hardcodeado**
Archivo: `apps/mobile/app/coach/cliente/[clientId].tsx:616-638` (`tabs` local se envuelve en el
mismo filtro por `domainsEnabled` — paralelo exacto de W1.8; si `tab` activo corresponde a un
dominio apagado, cae a `'overview'`).
Verde: test unitario del filtro (mismo criterio que W1.8) + `tsc --noEmit`.
Estimación: 0.5 d-a.

**~~W1.9B~~ — ANULADA (RESOLUCIONES-2 R15)**: la R4 original afirmaba que faltaba el botón
Composición en `OverviewTab.tsx` RN; verificación directa (`OverviewTab.tsx:840`,
`moduleFlags.bodycomp ? {…} : null`) confirma que YA existe, con el mismo patrón que
cardio/movement. Sin trabajo. Se conserva el número para no renumerar referencias.

### Retiro de asimetría

**W1.10 — Retiro de `FEATURE_PREFS_ENABLED`**
Paso 0 (hallazgo transversal de seguridad, antes de tocar código): confirmar el valor VIVO del
flag en Edge Config (no asumir «está estable en prod» sin mirarlo) y contar cuántas filas de
`coach_feature_prefs`/`team_feature_prefs` tienen `_enabled:false` guardado. Hoy, si el flag
falla/está ausente, la RUTA (no el nav, que ya lo ignora) bypasea ese `_enabled:false` — retirar el
flag activa de golpe esas filas inertes. Si el conteo es significativo, avisar antes de continuar
en vez de asumir impacto cero.
Archivos: `apps/web/src/services/feature-prefs.service.ts:88`, `apps/web/src/app/api/mobile/
config/route.ts:43` — quitar el flag Edge Config (R1 del OUTLINE §2); el sistema de prefs queda
siempre-on. Actualizar el comentario de `coach/layout.tsx:124-127` que hoy documenta ignorarlo a
propósito (ya no aplica: nav y ruta comparten la misma fuente).
Verde: paso 0 documentado con el valor real + el conteo; `grep -rn FEATURE_PREFS_ENABLED apps/` sin
resultados fuera de docs históricos; tests que fijaban el flag (`vi.mock` de Edge Config en tests
de `feature-prefs.service`) se actualizan o se eliminan si quedan sin sentido.
Estimación: 0.25 d-a.

### Tests de contrato (los 4 pedidos)

**W1.11 — Cruce `MOBILE_TAB_KEYS` ↔ registro `NAV_MODULES`**
Archivo NUEVO: `tests/mobile-nav-tab-keys-contract.test.ts` (convención raíz `tests/mobile-*`, no
dentro de `packages/coach-nav` porque `MOBILE_TAB_KEYS` vive en `apps/mobile/components/coach/
CoachMobileChrome.tsx:39`, un import cruzado que `packages/coach-nav/nav.test.ts` no puede hacer
sin acoplar el paquete puro a `apps/mobile`). Qué verifica: cada key de `MOBILE_TAB_KEYS` (tras
W2.5, ya no será el array viejo — este test se escribe contra el array vigente al momento de W1 y
se actualiza en W2.5 junto con el rediseño) existe en `NAV_MODULES`; ninguna key inventada.
**Gotcha a vigilar** (ya mordió antes, memoria `project_ci_root_test_mobile_dep_gotcha.md`): un
test en `tests/` que importa algo de `apps/mobile` puede arrastrar dependencias nativas al runner
raíz — replicar el patrón de import que ya usan los ~49 tests `tests/mobile-*.test.ts` existentes
(mock de `expo-router` etc.), no un import directo del componente RN completo si trae JSX nativo.
Verde: `pnpm test -- mobile-nav-tab-keys-contract` verde.
Estimación: 0.25 d-a.

**W1.12 — Extensión de `packages/coach-nav/nav.test.ts`**
Archivo: `packages/coach-nav/nav.test.ts` (YA testea `disabledDomains` con `cardio`/`movement`,
líneas 128-217 y el caso de dominio desconocido 181-186 — CORRECCIONES #2: extender, no inventar
el concepto). Qué se agrega: casos para `training` (ya existe un `disabledDomains: new Set
(['training'])` en línea 136, verificar que sigue verde con el registro real) y confirmar que
`bodycomp` (sin entrada en `NAV_MODULES` — OUTLINE §3, «no tiene superficie top-level propia») cae
en el mismo camino que el caso `'workouts'/'unknown'` ya cubierto (181-186): no rompe
`getVisibleNavItems` aunque nunca tenga efecto visible en el nav (su gate vive solo en la ruta,
W1.4/W1.7).
Verde: `pnpm --filter @eva/coach-nav test` (o el runner que corresponda) verde, con los casos
nuevos incluidos en el conteo.
Estimación: 0.25 d-a.

**W1.13 — Gate de ruta dominio OFF ⇒ redirect (los 5, ambas plataformas)**
Sub-tareas:
  a. Test unitario de `assertDomainEnabled` (W1.3) parametrizado por los 5 dominios × {fila
     ausente, fila `false`, fila `true`, `audience:'student'`} — 20 casos.
  b. Test unitario de `useDomainGuard` (W1.6) con `domainsEnabled` mockeado, mismos 5 dominios.
  c. Test de integración web: snapshot de `redirect()` llamado con la URL correcta para
     `training`/`nutrition` (incluidos los 4 call-sites de `nutrition-plans/*`, ahora migrados);
     snapshot de `status: 'domain_off'` devuelto por la función `_data` (sin `redirect()`) para
     cardio/movement/bodycomp.
  d. Test de contrato de `/api/mobile/config` (W1.1): la forma `featurePrefs.domains` tiene
     exactamente las 5 keys booleanas; `nutritionEnabled === domains.nutrition`.
Verde: los 4 sub-tests verdes, corridos junto al resto de la suite de `feature-prefs`.
Estimación: 0.5 d-a (incluye a-d).

**Total W1: 5,75 d-a** (antes 5,5; W1.4 sube 0,75→1,0 al migrar los 4 call-sites de
`nutrition-plans/*` y precisar el patrón `status` de cardio/movement/bodycomp, per PLAN §1.4; +0,25
por W1.9B, R4).

### QA en device — W1 (lista original de la SDD; la ejecutable con kut/jesus-coach/jpl está arriba)
- Deep link `eva://coach/cardio` (o el que corresponda por allowlist de `+native-intent.ts`) con el
  dominio Cardio apagado: debe caer en `DomainOffNotice` o redirect, nunca crash ni pantalla en
  blanco.
- Push que enlaza a una pantalla de dominio apagado (p. ej. recordatorio de plan de nutrición con
  `nutrition` off): mismo comportamiento, sin crash.
- Dark mode en `DomainOffNotice` (RN) y en el banner `notice=domain_off` (web): contraste legible.
- Safe areas: `DomainOffNotice` RN respeta el notch/home indicator (no tapa el CTA).
- White-label: el copy nuevo («Prendé esta función en Opciones › Funciones») no lleva color de
  marca EVA hardcodeado que choque con la marca del coach.
- Matriz coach standalone / coach_team / enterprise_coach: los 5 gates nuevos usan
  `team_feature_prefs` como base cuando hay `team_id` (`useTeamBase`), y NO deben aplicarse a
  enterprise (enterprise no entra a Funciones, OUTLINE §5) — verificar que el gate no rompe las
  rutas enterprise que ya redirigen aparte (p. ej. `nutrition-v2` enterprise se queda en cockpit
  V1, `nutrition-v2/page.tsx:46`).

---

## W2 · Navegación

Sidebar web agrupado (pinta Cardio/Movimiento por fin) + barra RN con «Más» adaptativa. Depende de
W1 (necesita `domainsEnabled` reales).

### Estado de ejecución W2 (2026-09-01) — mockup «Menú, Más y Funciones» `bff90120`, decisiones 1A 2A 3A 4A

| Tarea | Estado | Commit | Verde real |
|---|---|---|---|
| W2.1 `PERSONA_DOMAIN_ORDER` | ✅ | `dd637047` | feature-prefs.test.ts 44 → 49 (prefijo = dominios ON de resolvePersonaPrefs) |
| W2.1B retiro `entitlement` cardio/movement | ✅ | `dd637047` | nav.test.ts reescrito (52 → 71) |
| W2.2 entrada `funciones` | ✅ | `dd637047` | standalone + team, no enterprise, no managed |
| W2.3 `groupNavItems` | ✅ | `dd637047` (+`60e4ca54`: «Reactivar» a Principal, `splitForSidebar`/`splitNavItems` retiradas) | 3 contextos × 4 sets de dominios |
| W2.4 sidebar en 3 grupos | ✅ | `60e4ca54` | eslint; sin test de render (lógica en coach-nav) |
| W2.5 barra RN «2 dominios + Más» | ✅ | `3ef12925` | `buildMobileBar` ×13 casos (nav.test.ts 76); contrato MOBILE_TAB_KEYS |
| W2.6 hoja «Más» (`(tabs)/more.tsx`) | ✅ | `3ef12925` | tsc mobile · eslint |
| W2.7 FAB por dominio (web + RN) | ✅ | `0726dfea` | quick-actions.test.ts (4) |
| W2.8 copy honesto «Listo, ya se ve» | ✅ | `f7e532e2` (RN `lib/funciones-copy.ts`) · web verificado sin cambio | funciones-copy.test.ts (8) |

### Juicio del jefe — W2
1. `funciones` se oculta a coaches administrados igual que `options` (la pantalla los rechaza).
2. El label «Funciones» del registro adelantó el renombre; `FUNCIONES_LABEL` se cambió al cierre
   de W3 (`6a33a52d`) — coach-nav no importa feature-prefs a propósito.
3. `groupNavItems` NO filtra (recibe lo ya visible) y manda «Reactivar» a Principal: cuando aparece
   es lo único visible y bajo «Gestión» se leía raro.
4. `MORE_NAV_ITEM` es un slot de barra, no una entrada de `NAV_MODULES` (en web el nav se pinta
   entero). `buildMobileBar` recibe `domainOrder` como `readonly string[]` para no acoplar paquetes.
5. Cardio y Movimiento en la barra RN son pantallas de STACK (`tab: null`): al tocarlas se hace push,
   la cápsula queda debajo y se vuelve con ←. Alternativa descartada: re-exportarlas como tabs
   rompía el ← de sus headers.
6. La cápsula móvil WEB (viewport < md) conserva su `MOBILE_TAB_KEYS` local + `.slice(0,5)`: fuera
   del alcance de la SDD (W2.5 es RN). Brecha declarada abajo.
7. `funciones` no tiene `NAV_ROUTE` propio en RN: la hoja «Más» navega por el `href` compartido.


**W2.1 — `PERSONA_DOMAIN_ORDER`**
Archivo: `packages/feature-prefs/index.ts` (junto a `resolvePersonaPrefs`, línea 429). Qué cambia:
exporta `PERSONA_DOMAIN_ORDER: Record<Persona, FeatureDomain[]>` (mapa persona → dominios
ordenados, reusa la misma tabla que ya siembra `_enabled` en `resolvePersonaPrefs` para no
duplicar el mapeo persona→dominios).
Verde: test unitario — las 5 personas (`strength|nutrition|rehab|endurance|other`) tienen un
array de exactamente 5 dominios, sin duplicados.
Estimación: 0.25 d-a.

**W2.1B — Retiro del `entitlement` legado en `NAV_MODULES` (cardio/movement)**
R2: el jefe adelanta este retiro a W2 (antes vivía en W4) para que el sidebar agrupado (W2.4)
pinte Cardio/Movimiento completos desde esta wave, no recién en W4. W4 conserva el resto del
todo-incluido (copy, candados, upsells, poda `TIER_CAPABILITIES`).
Archivo: `packages/coach-nav/nav.ts:114-115` (entradas `cardio`/`movement` hoy llevan un
`entitlement` heredado del gate viejo por plan pago — D1 ya lo volvió irrelevante como paywall).
Qué cambia: se retira el campo `entitlement` de esas 2 entradas; la visibilidad del ítem queda
gobernada solo por `featureDomain` + `disabledDomains` (reales desde W1).
Verde: extensión de `packages/coach-nav/nav.test.ts` (mismo archivo que W1.12 toca) — con
`disabledDomains` vacío, cardio/movement aparecen en `getVisibleNavItems` sin que el resultado
dependa de ningún campo `entitlement`; grep de `entitlement` en las entradas cardio/movement de
`nav.ts` = 0 resultados.
Estimación: 0.25 d-a.

**W2.2 — Entrada de nav `funciones`**
Archivo: `packages/coach-nav/nav.ts` (`NAV_MODULES`, línea 98). Qué cambia: nueva entrada
`{ key: 'funciones', route: '/coach/settings/funciones', contexts: ['coach_standalone',
'coach_team'] }` (no `entitlement`, no `featureDomain` — siempre visible dentro de Gestión).
Verde: `nav.test.ts` — caso nuevo que confirma `funciones` aparece en standalone y team, no en
enterprise.
Estimación: 0.25 d-a.

**W2.3 — `groupNavItems()` reemplaza `splitForSidebar`**
Archivo: `packages/coach-nav/nav.ts:228` (`splitForSidebar` hoy devuelve `{primary, secondary}` y
`secondary` nunca se pinta — observación wf-webIA: Soporte + Cardio + Movimiento invisibles). Qué
cambia: nueva función pura `groupNavItems(items): {principal: NavModule[]; trabajo: NavModule[];
gestion: NavModule[]}` — `principal` = `dashboard`+`clients`; `trabajo` = dominios ON con
`featureDomain` (`programs`, `nutrition`, `cardio`, `movement` — `bodycomp` queda fuera, sin
entrada de nav per OUTLINE §3); `gestion` = `team`/`settings_team` (si aplica), `funciones`,
`options`/`settings_team`, `support`. `splitForSidebar` se retira (0 consumidores tras W2.4).
Verde: test unitario — para cada contexto (standalone/team/enterprise) y cada combinación de
`disabledDomains`, `trabajo` contiene exactamente los dominios ON con nav propia.
Estimación: 0.5 d-a.

**W2.4 — `CoachSidebar` pinta los 3 grupos**
Archivo: `apps/web/src/components/coach/CoachSidebar.tsx:188` (hoy destructura solo `primary` de
`splitForSidebar`). Qué cambia: consume `groupNavItems`, pinta «Principal» / «Tu trabajo» /
«Gestión» como secciones con encabezado — Cardio y Movimiento aparecen en el sidebar por primera
vez (drift web↔RN #1 de `wf-machinery.json` cerrado del lado del nav; el gate de ruta ya lo cerró
W1).
Verde: QA manual — con los 5 dominios ON, «Tu trabajo» muestra Programas/Nutrición/Cardio/
Movimiento; con `cardio` OFF, desaparece de «Tu trabajo» pero la ruta redirige igual si se entra
por URL directa (W1.4 sigue vigente). Con los 5 dominios OFF a la vez (BRIEF §5.2, caso sin cubrir
en ninguna versión previa): la sección «Tu trabajo» completa deja de renderizarse (sin encabezado
vacío) — «Principal» y «Gestión» se pintan igual.
Estimación: 0.5 d-a.

**W2.5 — Barra RN: `more` + rediseño de `MOBILE_TAB_KEYS`**
Archivo: `apps/mobile/components/coach/CoachMobileChrome.tsx` (hoy `MOBILE_TAB_KEYS` línea 39 +
`.slice(0,5)` línea 117 — el bug que tira «Equipo» para coaches de team). Qué cambia: la barra deja
de ser un slice de un array fijo; se arma como `[dashboard, clients, ...2 dominios de
PERSONA_DOMAIN_ORDER[persona] que estén ON, more]` — siempre 5 slots, sin cortar nada a la fuerza.
El slot `more` reemplaza el quinto/sexto ítem variable.
Fuente de `persona` (corrige una premisa equivocada de una versión anterior de este documento, que
asumía `useWorkspace().persona` — verificado por Grep: ese hook, `apps/mobile/lib/workspace.ts`,
NO tiene campo `persona`, 0 matches): usar `getCachedCoachPersonaStatus()` de
`apps/mobile/lib/coach-persona.ts:189` — lectura SÍNCRONA de una caché que puede ser `null` (se
llena vía `resolveCoachPersonaGate()`, ya corrido en el flujo de auth/gate antes de llegar al
chrome del coach). Si es `null` (carga en curso o coach sin persona respondida), la barra usa
`PERSONA_DOMAIN_ORDER.other` como fallback — mismo default que ya usa W2.1 para persona
desconocida — y re-renderiza cuando el gate resuelve (el componente ya se re-monta con el resto
del chrome tras `resolveCoachPersonaGate`, no hace falta un listener nuevo).
Con los 5 dominios OFF a la vez (BRIEF §5.2 exige cubrir este caso, ninguna versión previa de
TASKS lo hacía): la barra queda `[dashboard, clients, more]` — 3 slots, sin rellenar con dominios
inexistentes ni duplicar `more`.
Verde: test de contrato (extiende W1.11) — para un coach de `team` con persona `strength`, «Equipo»
YA NO desaparece (antes: bug confirmado, `dashboard/clients/programs/nutrition/settings_team`
llenaba los 5 slots y `team` quedaba fuera); para las 5 personas, los 2 dominios mostrados
coinciden con `PERSONA_DOMAIN_ORDER`; caso persona `null` cae en `PERSONA_DOMAIN_ORDER.other`; caso
5 dominios OFF arma `[dashboard, clients, more]`.
Estimación: 0.5 d-a.

**W2.6 — Pantalla `more.tsx` + hoja «Más»**
Archivo NUEVO: `apps/mobile/app/coach/(tabs)/more.tsx` (registrar `Tabs.Screen` en
`apps/mobile/app/coach/(tabs)/_layout.tsx`, junto a las 12 existentes). Qué es: hoja simple (no
modal) con filas: dominios secundarios (los 3 de `PERSONA_DOMAIN_ORDER` que no entraron en la
barra, si están ON), Equipo (si `coach_team`), Funciones, Opciones, Soporte — BRIEF §1.3.
Con los 5 dominios OFF a la vez: la hoja muestra 0 filas de dominio secundario, sin sección vacía
con encabezado (mismo criterio que W2.4).
Nota abierta (hallazgo del jefe, no se resuelve acá): tras W3.5 el hub Opciones colapsa Módulos +
Mi panel + Funciones-de-nutrición en 1 fila «Funciones», y esa fila YA vive en la hoja «Más»
también — quedan dos caminos a la misma pantalla (Más→Funciones directo, y Más→Opciones→
Funciones anidado). Ningún doc SDD decide si es intencional; se deja como pregunta para el owner
en la ronda de QA de W3, no se retira ninguna fila acá sin esa decisión.
Verde: QA manual — abrir «Más» en los 3 contextos (standalone/team/enterprise) pinta las filas
correctas; con un dominio secundario OFF, no aparece la fila (ni rota el layout); con los 5 OFF,
0 filas de dominio sin romper el layout.
Estimación: 0.5 d-a.

**W2.7 — FAB del dashboard respeta dominios**
Archivo: FAB de acciones rápidas del dashboard móvil (`Crear alumno · Importar · Programa` —
`wf-webIA.json` nav «Dashboard móvil › FAB acciones rápidas»). Qué cambia: la acción «Programa»
(→ `/coach/workout-programs` o `/coach/builder`) se oculta si `training` está OFF (paralelo al
gate de ruta W1.4/W1.7 — el FAB no debe ofrecer un atajo a una ruta que redirige).
Verde: QA manual con `training` OFF — el FAB muestra solo «Crear alumno» / «Importar».
Estimación: 0.25 d-a.

**W2.8 — Auditoría de copy «toast honesto» en Mi panel**
Archivos: `apps/mobile/app/coach/settings/mi-panel.tsx`, `apps/web/src/app/coach/settings/
funciones` (pane «Mi panel»). Qué cambia: el toast que hoy dice «Listo, ya se ve» al prender un
dominio (observación wf-rnIA: antes mentía para `training`, que nunca reaccionaba en RN) ahora es
cierto para los 5 — solo hace falta confirmar que ningún copy quedó redactado asumiendo que
Cardio/Movimiento/Composición «no hacen nada visible» (ya lo hacían W1+W2).
Verde: lectura manual de los 5 strings de confirmación, sin código que quede diciendo lo
contrario de lo que ahora pasa.
Estimación: 0.25 d-a.

**Total W2: 3,25 d-a** (antes 3,0; suma W2.1B — R2 adelanta el retiro del `entitlement` legado de
cardio/movement a esta wave).

### QA en device — W2
- Barra RN en los 3 contextos (standalone / coach_team / enterprise_coach) con al menos 2 personas
  distintas (`strength`, `nutrition`) — confirmar que los 2 dominios mostrados cambian con la
  persona y que «Equipo» es alcanzable para todo coach de team (bug cerrado).
- Dark mode + safe areas en la hoja «Más» (RN) y en las 3 secciones nuevas del sidebar web.
- White-label: el sidebar web con marca de coach custom no rompe el agrupamiento visual de las 3
  secciones (Principal/Tu trabajo/Gestión).
- Guía de inicio con un dominio apagado: el paso de la guía que apunta a ese dominio (si existe)
  no debe quedar como CTA roto — seguir el filtro por persona ya existente en `packages/onboarding`
  (BRIEF §5.3, verificar que no queden pasos huérfanos).
- Deep link a una ruta que ahora vive solo detrás de «Más» (p. ej. `/coach/team` con la barra
  reducida) sigue abriendo directo, sin pasar por la hoja.

---

## W3 · Funciones todo-en-una

Reemplaza Módulos (catálogo) + Mi panel + Funciones-de-nutrición y absorbe el launcher
Herramientas, en web y RN.

### Estado de ejecución W3 (2026-09-01) — decisiones 5A 6A 11B

| Tarea | Estado | Commit | Verde real |
|---|---|---|---|
| W3.1 web `/coach/settings/funciones` absorbe todo | ✅ | `52c41357` | DomainsCard.test.tsx · domain-open-routes.test.ts · MiPanelPane.test.tsx |
| W3.2 web redirects modules/tools | ✅ | `52c41357` | modules/page.test.tsx · tools/page.test.tsx |
| W3.3 RN `settings/funciones.tsx` | ✅ | `f7e532e2` | tsc mobile · tests/mobile 1539 |
| W3.4 RN redirects (mi-panel, features, modules, tools) | ✅ | `f7e532e2` | `<Redirect>` (molde foods.tsx; TASKS decía router.replace) |
| W3.5 hub Opciones RN: 1 fila «Funciones» | ✅ | `f7e532e2` | — |
| W3.6 rail desktop sin pane «Módulos», «Mi panel» → «Funciones» | ✅ | `52c41357` | — |
| W3.7 enlaces cruzados (web Alumnos ×3, Equipo; RN guía, Equipo, Herramientas de Alumnos, 6 CTAs a /coach/modules) | ✅ | `52c41357` · `f7e532e2` | grep de rutas viejas = 0 en código (quedan los redirects) |
| Renombre `FUNCIONES_LABEL` → «Funciones» | ✅ | `6a33a52d` | tests de copy actualizados |

### Juicio del jefe — W3
1. Team: las filas de dominio son de SOLO lectura (pitch + «Abrir», sin Switch) porque no existe
   write-action de `team_feature_prefs._enabled` por dominio; el detalle de nutrición sigue
   editable por el gestor. Si el owner quiere el switch por dominio del pool, es tarea aparte
   (server action + RLS).
2. RN: el master switch de nutrición NO se repite en «Detalle de nutrición» para standalone (única
   fuente = «Qué se ve en tu panel»), pero SÍ se pinta para team (su bloque 2 no existe): sin eso
   el team perdía la única forma de apagar nutrición que tenía en `features.tsx`.
3. «Abrir» de Nutrición apunta a `/coach/nutrition-v2` (hub V2), no al href `/coach/nutrition-plans`
   del registro: divergencia deliberada (`_lib/domain-open-routes.ts`).
4. Composición corporal no tiene ruta propia: «Abrir» abre el selector de alumno (mudado del
   launcher); la lista de alumnos se lee siempre (no solo con el dominio prendido) y ya no se gatea
   por `enabled_modules`.
5. Los 4 redirects RN usan `<Redirect href>` (patrón real del repo), no `router.replace`.
6. 11B completo: fuera «Pro» Y «Base» de `SectionBadge` (un chip en todas las secciones no
   informa nada); el explainer del panel dejó de decir «Módulos es lo que compraste».
7. Coach ORG-gestionado: la fila «Funciones» del hub RN lo lleva al aviso «lo administra tu
   organización» — mismo callejón que tenía «Funciones de nutrición»; el nav ya se la oculta en la
   barra. Se deja para W4/owner.
8. `team.tsx` (RN) sigue mostrando `activeModuleCount` bajo «Funciones»: con todo incluido es 4
   para todos. Pendiente declarado.


**W3.1 — Web: `/coach/settings/funciones` absorbe todo**
Archivo: `apps/web/src/app/coach/settings/funciones/page.tsx` (ruta existente, título cambia de
«Mi panel» a «Funciones» per OUTLINE §3). Qué se suma sobre lo que YA tiene (especialidad + 5
switches + detalle nutrición, `wf-webIA.json` config_screens «Mi panel»): (1) el catálogo que hoy
vive en `/coach/settings/modules` (lista de qué existe, sin badges de plan pago — el copy final es
W4), (2) un botón «Abrir» por cada dominio ON que hoy solo se llega desde `/coach/tools` (launcher).
Verde: QA manual — desde Funciones, el botón «Abrir Cardio» navega a `/coach/cardio`; con Cardio
OFF, el botón no aparece (coherente con W1.4).
Estimación: 0.75 d-a.

**W3.2 — Web: redirects de compatibilidad**
Archivos: `apps/web/src/app/coach/settings/modules/page.tsx` → `redirect('/coach/settings/
funciones')`; `apps/web/src/app/coach/tools` (ruta, si tiene `page.tsx` propio — verificar, B.1
nota que `/coach/tools` no se abrió línea a línea en el mapa) → mismo redirect.
Verde: `curl -I` (o test de ruta) a ambas URLs devuelve 307/308 hacia `/coach/settings/funciones`;
ningún link vivo del repo sigue apuntando a las rutas viejas sin pasar por el redirect (grep de
`/coach/settings/modules` y `/coach/tools` en `apps/web/src` — los que queden, actualizarlos
directo en vez de depender del redirect, ver W3.7).
Estimación: 0.25 d-a.

**W3.3 — RN: pantalla `funciones.tsx` nueva**
Archivo NUEVO: `apps/mobile/app/coach/settings/funciones.tsx`. Espejo funcional de W3.1: especialidad
(5 tiles + segunda pregunta + «Ordenar mi panel según mi especialidad», hoy en `mi-panel.tsx`),
master switch de los 5 dominios (hoy repartido entre `mi-panel.tsx` para los 5 y `features.tsx`
para solo nutrición — observación wf-rnIA «doble control del mismo dato»: esta pantalla es la
ÚNICA fuente de ahí en adelante), detalle de nutrición (preset + secciones, hoy en `features.tsx`),
botón «Abrir» por dominio (hoy en `tools.tsx`), alumno de ejemplo (borrar/re-sembrar, hoy en
`mi-panel.tsx`).
Verde: `tsc --noEmit` limpio + QA manual paralela a W3.1 (misma matriz de casos).
Estimación: 0.75 d-a.

**W3.4 — RN: redirects de compatibilidad**
Archivos: `apps/mobile/app/coach/settings/mi-panel.tsx`, `apps/mobile/app/coach/settings/
features.tsx`, `apps/mobile/app/coach/modules.tsx`, `apps/mobile/app/coach/tools.tsx` — los 4 pasan
a `router.replace('/coach/settings/funciones')` (Expo Router, patrón ya usado en los alias legacy
`/coach/foods`, `/coach/meal-groups`, `/coach/nutrition-builder`).
Verde: navegar a cada una de las 4 rutas viejas aterriza en `funciones.tsx` sin pantalla
intermedia visible (replace, no push).
Estimación: 0.5 d-a.

**W3.5 — RN: hub Opciones actualizado**
Archivo: `apps/mobile/app/coach/(tabs)/settings.tsx` (`wf-rnIA.json` config_screens «Opciones»
lista hoy Módulos, Mi panel, Funciones de nutrición como 3 filas separadas). Qué cambia: las 3
filas colapsan en una sola «Funciones» → `funciones.tsx`. Ver nota abierta de W2.6: esto deja la
hoja «Más» con dos caminos a la misma pantalla (directo y anidado vía Opciones); pendiente de
decisión del owner, no se retira la fila de «Más» en esta tarea.
Verde: QA manual — el hub Opciones ya no lista 3 entradas para el mismo concepto.
Estimación: 0.25 d-a.

**W3.6 — Web: rail desktop consolidado**
Archivo: `SettingsShell` / `CoachSettingsDesktop` (CATS del rail, `wf-webIA.json` config_screens
«Opciones (hub)» — grupo «Entrenamiento» hoy mezcla Módulos + Mi panel + Áreas + Importar). Qué
cambia: el pane «Módulos» se retira del rail (absorbido en W3.1); el pane pasa a llamarse
«Funciones».
Verde: QA manual desktop — el rail de Opciones ya no tiene un pane «Módulos» separado.
Estimación: 0.25 d-a.

**W3.7 — Enlaces cruzados actualizados**
Archivos: card «Ver mi guía de inicio» (`/coach/guia`, sin cambio de destino pero verificar que la
guía no linkee a `/coach/settings/modules`/`mi-panel` internamente), `packages/onboarding/index.ts`
+ `guide-mode.ts` (si algún paso de la guía referencia las rutas viejas), correos/push que citen
Módulos o Mi panel (grep de `settings/modules|settings/mi-panel` fuera de `apps/*` en
`docs/`/templates de correo si los hay).
Verde: grep de las 2 rutas viejas en el repo (excluyendo los propios archivos de redirect de
W3.2/W3.4) da 0 resultados fuera de tests que verifican el redirect a propósito.
Estimación: 0.5 d-a.

**Total W3: 3,25 d-a.**

### QA en device — W3
- Web y RN lado a lado: Funciones ofrece el mismo set de controles con el mismo resultado (mismo
  toggle de dominio prendido en RN se refleja en web al refrescar — misma tabla `coach_feature_prefs`).
- Guía de inicio con un dominio apagado, ahora que Funciones es la única puerta: el paso que
  invita a «configurar tu panel» debe llevar a `/coach/settings/funciones` en ambas plataformas,
  no a una ruta redirigida (evitar el salto doble).
- Dark mode + safe areas de la pantalla nueva `funciones.tsx` (RN) — es una pantalla grande,
  revisar scroll y el bottom sheet/botón «Guardar» con teclado abierto (detalle de nutrición).
- White-label: el botón «Abrir <dominio>» no debe llevar iconografía de marca EVA cruda (gotcha
  histórico `whitelabel_iconos_lucide` — usar `branding.primaryColor`, no un color crudo).
- Coach team vs standalone: en team, la pantalla se titula «Funciones del equipo» y NO muestra
  especialidad ni alumno de ejemplo (mismo gate que hoy tiene `mi-panel.tsx`/`funciones/page.tsx`).
- Enterprise: sigue SIN acceso a Funciones (redirect actual se respeta, OUTLINE §5).
- Decisión pendiente del owner (nota de W2.6/W3.5): ¿la hoja «Más» conserva su fila «Funciones»
  directa ahora que Opciones→Funciones existe también? Preguntar en esta ronda de QA.

---

## W4 · Todo-incluido + demolición

Convierte los últimos candados de «plan pago» en toggles normales y elimina UI/código muerto.
Independiente de W2/W3 en lo funcional (comparte archivos con W1, correr después para no pisarse).

### Estado de ejecución W4 (2026-09-01) — decisiones 7C 8A 9A 10A; ejecutada en gran parte por la sesión «Asistente Principal» bajo juicio del jefe

| Tarea | Estado | Commit | Verde real |
|---|---|---|---|
| W4.1 micros avanzados / objetivos por composición sin candado | ✅ web `a8878555` · RN dentro de `f7e532e2` (funciones.tsx nace sin candados) | — | vitest components/coach 27/27; tsc mobile |
| W4.2 `ModuleOffNotice` retemplado (web + RN) | ✅ | `319d32a8` (+ test gemelo `9ad81c6b`) | grep `Ver planes|plan pago|no está incluido` = 0 |
| W4.3 demolición «Módulos» (catálogo) web + RN | ✅ | `52c41357` · `f7e532e2` | ModulesForm/modules.queries/ToolsHub/tools.queries/ModuleToolRow borrados |
| W4.4 `entitlements.service` un solo criterio | ✅ | `e0d80dd1` (+ comentarios RN `9ad81c6b`) | derive.test.ts verde; firma pública intacta |
| W4.5 `TIER_CAPABILITIES`: solo `canUseAdvancedReports` | ✅ | `ead241bf` | tiers 113/113 + constants.test; los 9 call sites de las otras 3 siguen |
| W4.6a tab «Check-ins» huérfana | ✅ | `cacc017c` | grep `check-ins\.tsx` / `name="check-ins"` = 0; tsc mobile |
| W4.6b buscador global RN | ✅ (9A: cablear la lupa) | `b2c8aea9` | lupa en `MobileGreetingHeader` (home), `coach-search-trigger` |
| W4.6c FacturacionTab / CTA «Ir a facturación» | ⏸ no aplica (10A) | — | bloqueado por la SDD de Cobros (SPEC:1127, PLAN:466,470) y por la alerta «MRR cayendo» viva |
| W4.7 flags muertas | ✅ | `a3c972d7` | feature-flags.test |
| W4.7 deltas KPI | ✅ fase 1 (7C: deltas REALES) | `b64b8648` · `9d275345` · `be2d0cdb` | contrato `kpi.deltas` servido por el servidor; kpi-deltas.test · dashboard.queries.test (primer test de esa capa); RN nunca inventa |
| W4.8 verificación final | ✅ | — | suite completa UNA vez al cierre (ver CURRENT) |

### Juicio del jefe — W4
1. W4.2: `nutrition_exchanges` NO se borra del `Record<ModuleKey>` (TASKS lo pedía):
   `nutrition-plans/exchanges/page.tsx` la consume y el tipo exige las 4 keys. Copy nuevo
   «temporalmente no disponible» + «Volver al inicio»/«Volver»; sin CTA de pago (Apple 3.1.1).
2. W4.4 es SOLO renombre (`hasActiveModuleAccess`, `deriveModulesForActiveAccess`) + JSDoc; cero
   cambio de lógica; el kill-switch de operador sigue por encima en `hasModule`/`hasModuleFromMap`.
3. W4.5: los 4 hits de test se actualizaron en el mismo commit (el criterio «grep = 0» de TASKS era
   inaprobable tal cual). PLAN §4.3 corregido antes de ejecutar.
4. W4.7 (7C, ruling del owner): fase 1 sin queries nuevas ni migración — Alumnos (altas 7 d,
   `is_demo` excluido), Adherencia (semana vs. previa desde `adherenceHistory4w`), Sesiones hoy
   (vs. ayer desde `areaData`); «En riesgo» conserva caption fija (no hay historial honesto sin
   snapshot diario ⇒ **fase 2 = pendiente declarado**, ~1,5 d-a + protocolo Supabase). Bug
   colateral cerrado: `riskCount` estaba topeado a 5 por el `.slice(0,5)` del top de riesgo.
   Sparkline del PulseHero no se toca en esta ola. Efecto visible: el alumno de ejemplo deja de
   contar como alta en el BarChart de 6 meses.
5. W4.6b: anclaje B (lupa en el header del dashboard, gesto = topbar web). «Reach global» (trigger
   en el layout de tabs) = pendiente declarado.
6. W4.6c: no se toca hasta que el owner decida Cobros (P1–P8). `client-tabs.ts` conserva
   `'facturacion'` fuera de `CLIENT_TAB_DOMAIN` (nunca se oculta por dominio).

### Pendientes declarados de W2–W4 (no bloquean; entran a QA o a la siguiente ola)
- Cápsula móvil WEB (< md): sigue con lista fija + `.slice(0,5)` (un coach de team pierde «Equipo»
  en mobile web; Soporte/Cardio/Movimiento no aparecen ahí). Paralelo de W2.5 para web.
- Cardio/Movimiento desde la barra RN: push de stack (la cápsula queda debajo). Si en QA molesta,
  registrarlas como tabs re-exportadas exige quitar el ← de sus headers.
- Team: switch por dominio del pool en «Funciones del equipo» (hoy solo lectura).
- Coach org-gestionado: fila «Funciones» del hub RN lleva a un aviso sin acción.
- `team.tsx` RN: `activeModuleCount` bajo «Funciones» ya no significa nada (siempre 4).
- 6 CTAs RN «Ver módulos»/«Ver mi plan»/`onUpgrade` (nutrition-v2 builder, QuickEdit ×2, ProgresoTab,
  `NUTRITION_PRO_UPGRADE_HREF`) siguen gateados por `nutrition_exchanges`/`body_composition` y con
  copy de plan («no incluido en tu plan actual»): con D1 son código muerto o mentiroso — revisar.
- `SubscriptionContent.tsx:758` conserva «Con plan pago» para la lista de módulos de la pantalla de
  suscripción.
- `apps/mobile/lib/mi-panel.ts` mantiene nombres `MI_PANEL_*` salvo la ruta (renombre integral
  pendiente); `apps/web/src/app/coach/tools/loading.tsx` borrado con el launcher.
- 7C fase 2 (delta de «En riesgo» y saldo neto de alumnos con snapshot diario por coach; molde
  `api/cron/weekly-snapshot`) y «reach global» del buscador RN (overlay en `(tabs)/_layout.tsx`).
- Theme RN no expone `success-600`/`danger-600` (el hero usa el 500 vía `theme.success`/
  `theme.destructive`): escalones en `lib/theme.ts` si se quiere 1:1 con el web.
- Adherencia: el denominador es el programa actual (mismo sesgo que el número principal).
- No existe test de `ModuleOffNotice` RN (el web sí).
- W4.6c (Facturación RN) espera la decisión de Cobros.

### QA del owner — W2/W3/W4 (contra el PREVIEW de la rama: ver CURRENT)
- **Web desktop (kut, jesus-coach, jpl):** sidebar en 3 grupos con encabezados; con cardio OFF
  desaparece de «Tu trabajo»; con los 4 OFF desaparece la sección entera; colapsado (768–1079 px)
  separadores finos; «Reactivar» en Principal si el status está vencido (cuenta de prueba).
  Opciones › Funciones: 5 filas con «Abrir» solo en dominios prendidos; Composición abre el
  selector de alumno; `/coach/settings/modules` y `/coach/tools` redirigen; rail sin «Módulos»;
  hub con una sola card «Funciones». Dashboard desktop: los 4 KPI con delta real (Alumnos «+N esta
  semana»/«sin altas esta semana», Adherencia «±N pts vs. semana previa», Sesiones hoy «±N vs.
  ayer», En riesgo «requieren revisión»); alumno de ejemplo no cuenta como alta en el BarChart de
  6 meses; «En riesgo» puede mostrar más de 5 por primera vez. Hero móvil WEB a 390 px: la línea de
  delta envuelve a 2 líneas sin sufijo «sem.» y la sparkline de Adherencia baja de fila (flex-wrap).
- **RN (cable adb + Metro contra la rama):** barra = Inicio · Alumnos · 2 dominios por especialidad ·
  Más (kut nutrición: Nutrición · Programas; jesus-coach fuerza: Programas · Nutrición; team con
  «Equipo» dentro de Más); hoja «Más» con «Tu trabajo» (dominios sobrantes prendidos) y «Gestión»
  (Equipo, Funciones, Opciones, Soporte); con todo apagado, barra de 3 y «Más» sin sección de
  trabajo. Opciones › Funciones: 5 bloques, «Abrir ›» por dominio prendido, detalle de nutrición
  sin candados; deep links `eva://coach/settings/mi-panel`, `/coach/settings/features`,
  `/coach/modules`, `/coach/tools` aterrizan en Funciones sin pantalla intermedia; tab «Check-ins»
  desaparecida (`eva://coach/check-ins` cae al índice); lupa en el header del dashboard abre el
  buscador (cluster del header con 4 botones: que no apriete en pantallas angostas); FAB sin
  «Programa» con Entrenamiento apagado. Hero del dashboard RN: deltas reales o ninguno (nunca
  «+1/+3» inventados); la frase del delta envuelve a 2 líneas.
- Transversal: dark mode, safe areas, white-label (marca custom en tiles/íconos de «Más» y
  Funciones), matriz standalone / team_owner / team_member / enterprise.


### Todo-incluido

**W4.1 — Micros avanzados / objetivos por composición dejan de estar candados**
Archivos: `FeaturePrefsPanel` (web, dentro de `funciones/page.tsx` tras W3.1) y la sección
equivalente de `funciones.tsx` (RN, tras W3.3) — hoy las 2 secciones Pro del preset «Profesional»
(`micros_advanced` requiere `nutrition_exchanges`, `goals_bodycomp` requiere `body_composition`,
`packages/feature-prefs/index.ts` notas de `wf-machinery.json`) se muestran con candado si
`!hasModule(...)`. Qué cambia: se muestran como toggle normal, sin candado ni copy de módulo — ya
no hay distinción de plan pago que las bloquee (D1).
Verde: QA manual — con cualquier plan (incluido free), las 2 secciones son togglables sin mensaje
de upgrade.
Estimación: 0.5 d-a.

**W4.2 — `ModuleOffNotice` retemplado (web + RN)**
Tensión R6↔R8 RESUELTA por el jefe (RESOLUCIONES-2 R11, con la distinción por dominio de SPEC §8
«Cómo conviven `ModuleOffNotice` y `DomainOffNotice`»): los dos componentes no compiten — se
distinguen por CAUSA del apagón. `DomainOffNotice` (W1) cubre el caso normal «el coach apagó el
dominio en Funciones»; `ModuleOffNotice` queda vivo SOLO en cardio/movement/bodycomp para el caso
operador (`EVA_DISABLED_MODULES`/`enabled_modules`, raro) con el copy retemplado de esta tarea
(sin «plan pago», sin CTA a `/coach/subscription` — habla de mantenimiento/incidente). En
`nutrition`/`training` no hay gate de operador que mostrar por debajo ⇒ ahí `ModuleOffNotice` sí
se borra en esta misma tarea. R8 queda enmendada así; nada se reabre.
Archivos: `apps/web/src/components/coach/ModuleOffNotice.tsx:67,69-74` (quita «Este módulo viene
incluido en cualquier plan pago de EVA» + botón «Ver planes» → `/coach/subscription`),
`apps/mobile/components/ModuleOffNotice.tsx:87-91` (quita «Este módulo no está incluido en tu plan
actual» + `<RefreshPlanButton />` como CTA por defecto). Qué queda: el componente sigue existiendo
para el ÚNICO caso real que le queda (kill-switch `EVA_DISABLED_MODULES` de operador, ver W1.4/W1.7
— la pref ya se resuelve antes, este componente ya no es el gate principal); copy nuevo:
«Temporalmente no disponible» sin mención a plan.
Verde: grep de `Ver planes|plan pago|no está incluido en tu plan` sobre ambos archivos = 0
resultados.
Estimación: 0.5 d-a.

**W4.3 — Demolición de la página «Módulos» (catálogo)**
Archivos: contenido viejo de `apps/web/src/app/coach/settings/modules/page.tsx` (ya es un redirect
desde W3.2 — esta tarea borra la UI vieja que quedó sin usar, badges «Incluido»/«Con plan pago»,
chips de superficie) y `apps/mobile/app/coach/modules.tsx` (ídem, ya redirige desde W3.4).
Verde: `grep -rn "Incluido\"|Con plan pago" apps/web/src/app/coach/settings/modules apps/mobile/
app/coach/modules.tsx` = 0 resultados (solo queda el redirect de 1-2 líneas).
Estimación: 0.25 d-a.

**W4.4 — `entitlements.service.ts` simplificado**
Archivo: `apps/web/src/services/entitlements.service.ts` (`deriveModulesForPaidAccess` línea ~90,
`hasPaidModuleAccess` — hoy fuerza los 4 módulos ON para cualquier coach con acceso vigente pero
sigue distinguiendo «plan pago» de «free» en el nombre/comentario). Qué cambia: se simplifica a un
solo criterio «coach con acceso vigente ⇒ todos ON salvo `EVA_DISABLED_MODULES`» — sin la
distinción de plan pago que ya no existe (D1). El kill-switch de operador (`isModuleKilledByOperator`)
se conserva intacto.
Verde: test unitario existente de `entitlements.service` sigue verde con el nombre/lógica
actualizados; ningún consumidor rompe (`hasModuleFromMap`, `getEnabledModulesForRender`).
Estimación: 0.5 d-a.

**W4.5 — `TIER_CAPABILITIES` podado**
Archivo: `packages/tiers/index.ts` (`TIER_CAPABILITIES`). ⚠ **Corregido el 2026-09-01 (preflight
contra HEAD `7c20bac6`)**: la premisa de `wf-machinery.json` («4 de 6 capacidades muertas») era
falsa para 3 de las 4. Solo `canUseAdvancedReports` no tiene consumidores fuera de
`tiers/index.ts`. Las otras tres **siguen gateando rutas reales** y NO se podan en esta ola:
`canUseNutrition` (`apps/web/src/app/coach/nutrition-plans/page.tsx:45`, `register.actions.ts:423`,
`api/payments/create-preference/route.ts:171,447`, `confirm-enrollment/route.ts:270`,
`SubscriptionContent.tsx:834`, wrapper mobile `apps/mobile/lib/coach-tiers.ts:46-47`),
`canImportClients` (`clients/import/_actions/import.actions.ts:84,185`,
`api/mobile/coach/clients/import/route.ts:246`, `apps/mobile/.../clientes.tsx:1069`) y
`canCreateCustomExercises` (`exercises/_actions/exercise-media.actions.ts:75`,
`exercises.actions.ts:260,336`). Qué cambia: se retira SOLO `canUseAdvancedReports`; quedan vivas
las otras cinco. Si la regla «todo en todos los planes» exige que esas tres dejen de gatear, es una
tarea aparte (revisar cada call site, no borrar la capability).
Verde: `grep -rn "canUseAdvancedReports" apps/ packages/` — cero consumidores vivos antes de
borrar; el mismo grep sobre las otras tres debe seguir dando los call sites de arriba (no se tocan).
Estimación: 0.1 d-a.

### Demolición (checklist explícito, BRIEF §1.7)

**W4.6 — Demolición A: check-ins huérfana + CoachSearchPalette + FacturacionTab/CTA**
- [ ] `apps/mobile/app/coach/(tabs)/check-ins.tsx` — eliminar archivo + su `Tabs.Screen` en
  `apps/mobile/app/coach/(tabs)/_layout.tsx:40`. Confirmado huérfano: 0 `router.push` en toda la
  app fuera del propio archivo/layout (wf-rnIA observación).
- [ ] `apps/mobile/components/coach/CoachSearchPalette.tsx` + `apps/mobile/lib/coach-search.ts` —
  eliminar (nunca montado en ningún header, componente + backend construidos sin cablear).
- [ ] `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` — eliminar archivo; quitar
  `'facturacion'` de la unión `ClientTab` en `apps/mobile/components/coach/clientDetail/
  ClientTabBar.tsx:13`; quitar el next-best-action «Ir a facturacion» de
  `CoachDashboardSections.tsx:2146` (CTA hacia una superficie que en RN no existe, wf-rnIA).
Verde: `grep -rn "check-ins.tsx\|CoachSearchPalette\|coach-search\|FacturacionTab\|Ir a
facturacion" apps/mobile` — 0 resultados; `pnpm --filter @eva/mobile exec tsc --noEmit` limpio
(confirma que nada quedó importando lo borrado).
Estimación: 0.5 d-a.

**W4.7 — Demolición B: deltas KPI hardcodeados + flags muertos**
- [ ] `apps/web/src/app/coach/dashboard/_components/DesktopBento.tsx:104,113,123` — quitar los 3
  literales (`'+1 esta semana'`, `'requieren revisión'`, `'+3 vs. semana previa'`); el SPEC decide
  si se reemplaza por un cálculo real o se retira el badge de delta — esta tarea solo demuele el
  hardcode, no inventa el cálculo (fuera de alcance de esta ola si no hay fuente de dato real).
- [ ] `apps/web/src/lib/feature-flags.ts:15-17` — retirar `nutritionWeeklyPlan`
  (`NEXT_PUBLIC_FF_WEEKLY_PLAN`) y `nutritionDetailedLogging` (`NEXT_PUBLIC_FF_DETAILED_LOGGING`,
  código de gating muerto desde la poda V2 per `wf-machinery.json` gap); actualizar
  `apps/web/src/lib/feature-flags.test.ts`. Verificar primero que no queden consumidores (grep de
  `nutritionWeeklyPlan|nutritionDetailedLogging|FF_WEEKLY_PLAN|FF_DETAILED_LOGGING` en
  `apps/web/src`) — si aparece alguno vivo, esa flag NO se borra en esta ola, se documenta como
  excepción.
Verde: grep de los 3 literales de delta = 0 resultados fuera de un posible cálculo real nuevo;
grep de las 2 flags = 0 resultados fuera de `feature-flags.ts`/`.test.ts` (si se conservan por
consumidor vivo, esta tarea se marca «no aplica» con la evidencia del grep).
Estimación: 0.5 d-a.

**W4.8 — Verificación final de gates**
Comando: `pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check && pnpm check:tokens &&
pnpm check:nutrition-v2-boundaries && pnpm --filter @eva/mobile exec tsc --noEmit` (comandos base
de `CLAUDE.md`). Qué verifica: ninguna demolición de W4.6/W4.7 ni ninguna simplificación de
W4.1-W4.5 dejó algo roto que los gates individuales de cada tarea no hayan cubierto.
Verde: los 7 comandos en verde, corridos una sola vez al final de la wave (regla «gates
proporcionales», no correr la suite completa en cada tarea).
Estimación: 0.25 d-a.

**Total W4: 3,0 d-a.**

### QA en device — W4
- Con cualquier tier (incluido free), micros avanzados y objetivos por composición son togglables
  sin candado ni mensaje de upgrade, en web y RN.
- `ModuleOffNotice` (ahora solo por kill-switch de operador) sigue siendo legible en dark mode y
  respeta safe areas — es una pantalla que casi nadie va a ver en producción normal, pero si el
  operador activa `EVA_DISABLED_MODULES` en un incidente, tiene que verse bien igual.
- White-label: el copy nuevo de `ModuleOffNotice` no asume la marca EVA (mismo gotcha que W3 QA).
- Confirmar en device que las rutas demolidas (check-ins, CoachSearchPalette, FacturacionTab) no
  dejan un ítem de menú fantasma ni un deep link que ahora 404ee de forma fea (`eva://coach/
  check-ins` si estuviera en la allowlist — verificar que NO lo esté).
- Coach team vs standalone vs enterprise: correr la demolición no debe cambiar ningún gate de
  contexto existente (Equipo, Enterprise redirects) — regresión rápida de los 3 flujos completos.

---

## Totales

| Wave | Contenido | Estimación |
|---|---|---|
| W1 | Interruptores de verdad (config, gates web+RN, ficha del alumno, retiro Edge Config, 4 tests de contrato) | 5,75 d-a |
| W2 | Navegación (retiro entitlement legado R2, sidebar agrupado, barra RN «Más», fix slice(0,5), FAB, copy honesto) | 3,25 d-a |
| W3 | Funciones todo-en-una (web + RN, redirects, enlaces cruzados) | 3,25 d-a |
| W4 | Todo-incluido + demolición (candados, ModuleOffNotice, TIER_CAPABILITIES, 2 demoliciones, verificación final) | 3,0 d-a |
| **Total** | | **15,25 d-a** (antes 14,75; sube por W1.4 —migrar 4 call-sites de `nutrition-plans/*` +
precisar el patrón `status` de cardio/movement/bodycomp per PLAN §1.4— y W2.1B —R2 adelanta el
retiro del `entitlement` legado a W2—; W1.9B quedó anulada por R15. Queda 0,25 d-a sobre el techo
de 15 del OUTLINE §4 — se declara tal cual, no se fuerza el número a la baja para calzar) |

Dependencias: W2 arranca después de W1 (necesita `domainsEnabled`/`disabledDomains` reales). W3 y
W4 pueden correr en paralelo entre sí una vez cerrado W1 (comparten poco código con W2), pero W4.1
(candados de Funciones) es más simple de escribir DESPUÉS de que exista `funciones.tsx`/
`funciones/page.tsx` consolidada (W3.1/W3.3) — si se corre W4 antes que W3, W4.1 apunta a los
archivos viejos (`FeaturePrefsPanel` standalone, `features.tsx` RN) y hay que re-tocarlo tras la
consolidación. Orden recomendado: W1 → W2 → W3 → W4.

---

## Anexo — Preflight solo-lectura de W2 y W4 (2026-09-01, sesión paralela; 8 verificadores + 5 refutadores)

Correcciones a incorporar en las tareas de W2/W4 ANTES de ejecutarlas (verificadas contra `HEAD`
tras los 14 commits de W1). PLAN §4.3 ya fue corregido en el mismo cierre de W1.
- **W2.1B — reemplazar «extensión de `nav.test.ts`» por**: «Reescritura de `packages/coach-nav/nav.test.ts`: retirar `entitlement` de las entradas cardio/movement invalida los describes de `getVisibleNavItems — módulos toggleables` (~157-234) y el test «discriminador: items con entitlement van a modules» (270-279). Decidir además qué pasa con `splitNavItems` (`nav.ts:212-219`) y `splitForSidebar` (`nav.ts:228-235`), que usan `item.entitlement != null` como discriminador general y cambian de comportamiento aunque nadie los pidió tocar.»
- **W2.1B — corregir el criterio Verde**: «Verde: `grep -n "entitlement" packages/coach-nav/nav.ts` no devuelve hits en las entradas `cardio`/`movement` (líneas 114-115). El campo sigue existiendo en el tipo y en `getVisibleNavItems`, así que el grep global NO puede dar 0.»
- **W2.2 — agregar nota**: «La ruta `/coach/settings/funciones` YA EXISTE (feature «Mi panel» del onboarding-v2, commit `d8286e95`, 21-08): la nueva entrada de nav apunta a una página real, no a un placeholder.»
- **W2.3 — precisar**: «La entrada de nav se llama `programs` pero su `featureDomain` es `'training'` (los 5 dominios válidos son nutrition/training/cardio/movement/bodycomp). `bodycomp` no tiene entrada de nav.»
- **W2.5 — corregir refs**: «`MOBILE_TAB_KEYS` vive en `apps/mobile/components/coach/coach-tab-keys.ts:10` desde W1.11 (commit `3bea5565`), NO en `CoachMobileChrome.tsx:39`; el import está en `CoachMobileChrome.tsx:21` y el uso en 115-118. El `.slice(0, 5)` está en la línea **118**. El test de contrato a actualizar es `tests/mobile-nav-tab-keys-contract.test.ts` (raíz de `tests/`), no `tests/mobile/*`.»
- **W2.5 / W2.6 — agregar dependencia dura**: «Bloqueada por W2.1: `PERSONA_DOMAIN_ORDER` no existe en código (0 matches en `apps/` y `packages/`), solo en la SDD.»
- **W2.6 — corregir la premisa del patrón de ocultamiento**: «Las tabs NO se ocultan con `href: null` (0 hits de `href` en `_layout.tsx`). El patrón real es un tabBar custom: `<Tabs tabBar={(props) => <CoachMobileTabBar {...props} />}>` (`_layout.tsx:25`); las 12 screens quedan registradas y navegables por `router.push`, y solo se filtra qué botones pinta la barra (`CoachMobileChrome.tsx:115-118`).»
- **W2.7 — completar el archivo y el plumbing**: «Archivos: `apps/web/src/app/coach/dashboard/_components/DashboardFab.tsx` (acciones en :30-34), montado en `DashboardShell.tsx:282`. Plumbing: llamar `resolveDomainsEnabled` (`services/feature-prefs.service.ts:340`) en `DashboardContent.tsx` y encadenar `domainsEnabled` por `DashboardShell` → `DashboardFab`, replicando el patrón de `coach/clients/[clientId]/page.tsx:83,168`. Coordinar con W1, que edita `DashboardShell.tsx` sin commitear.»
- **W2.7 — agregar el FAB RN**: «Existe un FAB gemelo en RN con las mismas 3 acciones: `MobileQuickActionsFab` (`apps/mobile/components/coach/CoachDashboardSections.tsx:692-820`, «Programa» → `/coach/(tabs)/builder`), montado en `home.tsx:223-228`. Decidir si entra en el alcance; si entra, usa `useDomainGuard('training')` (`apps/mobile/lib/domain-guard.ts:53`) sin plumbing extra.»
- **W2.8 — precisar el alcance real**: «El riesgo no está en un string de UI sino en el comentario y el `Set` de `apps/mobile/app/coach/settings/mi-panel.tsx:108-118` (`DOMAINS_VISIBLE_IN_NAV = ['nutrition','training']`), que es honesto HOY y solo queda mintiendo una vez que W2.5 le dé lugar a cardio/movement. En web, `domainToggleMessage` (`_actions/mi-panel.actions.ts:211-219`) ya devuelve «Listo, ya se ve.» para cardio/movement aunque el sidebar todavía no los pinte: es una mentira preexistente que W2.4 cierra. Ejecutar W2.8 solo DESPUÉS de W2.4 y W2.5.»
- **W4.1 — retargetear el half RN**: «Mientras W3.3 no exista, el archivo RN es `apps/mobile/app/coach/settings/features.tsx` (candado :336-338, CTA :368-379), no `funciones.tsx`. El half web es ejecutable hoy sobre `apps/web/src/components/coach/FeaturePrefsPanel.tsx` (:354-360, :392-399).»
- **W4.2 — precisar la convivencia**: «`domain_off` y `module_off` son ramas EXCLUYENTES (nunca se pintan juntas) con la MISMA precedencia en ambas plataformas: preferencia antes que módulo. En web la decide la función `_data` (devuelve `domain_off` antes de llamar `assertModule`; el orden de los `if` en `page.tsx` no cambia nada); en RN, la cadena `!domain.enabled ? DomainOffNotice : !hasModule ? ModuleOffNotice : contenido`. [Corregido por el jefe de W1: el preflight leía «web module_off primero» a partir del orden de los `if` de la page.] W4.2 solo cambia el copy de `ModuleOffNotice`.»
- **W4.3 — agregar bloqueo de secuencia**: «Bloqueada por W3.2 y W3.4: `apps/web/src/app/coach/settings/modules/page.tsx` (48 líneas de UI con `<ModulesForm>`) y `apps/mobile/app/coach/modules.tsx` (219 líneas) NO son redirects todavía, y siguen siendo la única vía de acceso real (6+ consumidores web, 11+ RN). Demoler ahora deja esas rutas sin contenido.»
- **W4.5 — corregir el criterio Verde**: «Verde: `grep -rn "canUseAdvancedReports" apps/ packages/` devuelve cero consumidores **de producción**; los 4 hits de test (`packages/tiers/pricing-v3.test.ts:40`, `packages/tiers/pricing-v2.test.ts:147,159`, `apps/web/src/lib/constants.test.ts:108`) se actualizan en el MISMO commit — son `toEqual` de snapshot exacto y acceso de propiedad tipada, así que sin tocarlos `pnpm test` y `pnpm typecheck` quedan rojos.»
- **W4.5 — agregar advertencia**: «`docs/specs/ola-de-orden/PLAN.md:654-661` (§4.3) todavía ordena podar también `canUseNutrition`, `canImportClients` y `canCreateCustomExercises`. Ese texto está OBSOLETO y debe corregirse antes de ejecutar: esas 3 capabilities gatean pagos, importación masiva y creación de ejercicios en 9 call sites vivos.»
- **W4.6 — corregir el criterio Verde**: «Verde: `grep -rn --exclude-dir=dist --exclude-dir=node_modules "check-ins.tsx\|CoachSearchPalette\|coach-search\|FacturacionTab\|Ir a facturacion\|mrr-cayendo\|onRevenuePress" apps/mobile` = 0. Sin `--exclude-dir=dist` el bundle de `expo export` (`apps/mobile/dist/*.hbc`, ignorado por git) produce falsos rojos. El comentario de `ejercicios.tsx:45` debe reescribirse, no contarse como hit.»
- **W4.6a — agregar prerrequisito**: «Ruling del owner previo: `docs/status/REDESIGN_FEATURE_MATRIX.md:162,179` marca el tab Check-ins como ❓ dudoso, pendiente de decidir si se acepta la distribución o hace falta un inbox. Si se borra, actualizar esas dos filas en el mismo commit. Nunca confundir con `apps/mobile/app/alumno/(tabs)/check-in.tsx`, destino vivo del cron `api/cron/checkin-reminder/route.ts:132`.»
- **W4.6b — agregar colaterales y scope**: «El borrado arrastra `apps/mobile/components/CommandPalette.tsx` + sus 2 líneas de barrel en `components/index.ts:9-10`, `apps/web/src/app/api/mobile/coach/search/route.ts`, y el `useFocusEffect` de `ejercicios.tsx:86-92`. Scope del grep OBLIGATORIO `apps/mobile tests`, nunca `apps/`: existe `apps/web/src/services/search/coach-search.service.ts` vivo en producción con símbolos homónimos. Gate: `pnpm typecheck` completo, no solo el de mobile.»
- **W4.6c — marcar bloqueo por SDD hermana**: «Contradice `docs/specs/cobros-coach-alumno/SPEC.md:1127` y `PLAN.md:466,470`, versionadas en el mismo commit `edf6a07c`, que declaran `FacturacionTab.tsx`, la unión `ClientTab` y el CTA `:2146` como puntos de inserción verificados. Además el bloque `mrr-cayendo` (`CoachDashboardSections.tsx:2141-2150`) NO es código muerto: `MobileFocusList` está montado en `home.tsx:184` y la alerta se dispara con `mrrDeltaPct <= -10`. Requiere ruling del owner antes de tocar.»
- **W4.7 — corregir alcance y agregar el paso de tipo**: «Son CUATRO literales (`:104`, `:113`, `:123` y `:132 'registradas'`), y `'requieren revisión'` es caption honesto de `riskCount` real — `PLAN.md:672` solo pide borrar los dos numéricos inventados. El campo `delta` es REQUERIDO en el tipo (`DesktopBento.tsx:95`) y se pinta sin guarda en `:201`: hay que volverlo opcional (o eliminar el badge completo, `:200-202`) o `pnpm typecheck` falla con TS2741. En `feature-flags.ts` el bloque a borrar es **14-17** (incluye los JSDoc) y además queda huérfano el helper `envIsTrue` (`:5-7`).»
- **W4.8 — precisar**: «Secuencial: corre al final de la wave, no en paralelo. El 7mo comando no es un script nombrado sino `pnpm --filter @eva/mobile exec tsc --noEmit`.»

### Orden de ejecución sugerido por el preflight
**Bloque 0 — antes de tocar código (jefe/owner, no worker)**
1. Corregir `docs/specs/ola-de-orden/PLAN.md:654-661` (poda de capabilities) — prerrequisito duro de W4.5.
2. Ruling del owner sobre: tab Check-ins (`REDESIGN_FEATURE_MATRIX.md:179`), buscador global RN (borrar vs cablear la lupa), y `FacturacionTab`/CTA vs la SDD de Cobros.
3. Commitear W1 (o al menos `packages/feature-prefs/*` y `DashboardShell.tsx`) para liberar los dos archivos compartidos.

**Ola A — paralelizable, archivos disjuntos, sin bloqueos**
- **W2.1** (`packages/feature-prefs/index.ts` + su test) — desbloquea W2.5/W2.6. Coordinar con W1 en ese archivo.
- **W2.2** (`packages/coach-nav/nav.ts`, entrada `funciones`) — puede correr antes o después de W2.1B si se secuencia dentro del mismo worker de nav.
- **W4.2** (`ModuleOffNotice.tsx` web + RN, `nutrition-plans/exchanges/page.tsx`).
- **W4.4** (`entitlements.service.ts` + `derive.test.ts`).
- **W4.1 half web** (`FeaturePrefsPanel.tsx`).
- **W4.7 paso 1** (flags en `feature-flags.ts` + `.test.ts`) — aislado y barato.

**Ola B — cadena de nav (un solo worker, secuencial, mismo archivo)**
- **W2.1B** → **W2.3** → **W2.4** sobre `packages/coach-nav/nav.ts` + `nav.test.ts` + `CoachSidebar.tsx`. No paralelizar: los tres tocan el mismo archivo y `splitNavItems`/`splitForSidebar` comparten discriminador.
- En paralelo con la ola B (archivos disjuntos): **W4.5** (tras el bloque 0) sobre `packages/tiers/*` + 2 tests; **W4.7 paso 2-3** sobre `DesktopBento.tsx`; **W4.6a** sobre `check-ins.tsx` + `_layout.tsx`.

**Ola C — RN, depende de W2.1**
- **W2.5** (`coach-tab-keys.ts`, `CoachMobileChrome.tsx`, `tests/mobile-nav-tab-keys-contract.test.ts`) → luego **W2.6** (`more.tsx`, `_layout.tsx`, `settings.tsx`). Secuencial entre sí.
- En paralelo: **W2.7** (`DashboardFab.tsx` + `DashboardContent.tsx` + `DashboardShell.tsx`) solo con W1 ya commiteado.

**Ola D — depende de W2 cerrada o de rulings**
- **W2.8** (auditoría de copys) — solo tras W2.4 y W2.5, o daría falso verde.
- **W4.6b / W4.6c** — solo con ruling del owner; W4.6c en tres commits separados y coordinado con W1.9 en `client-tabs.ts`.
- **W4.3** — bloqueada hasta W3.2 y W3.4.
- **W4.1 half RN** — bloqueada hasta W3.3, o retargeteada a `features.tsx`.

**Cierre**
- **W4.8**: suite completa una sola vez, al final, con W4.5/W4.6/W4.7 ya cerradas.
