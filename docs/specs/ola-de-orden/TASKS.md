---
status: draft
owner: product-engineering
last_verified: "2026-08-31"
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

### QA en device — W1
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
