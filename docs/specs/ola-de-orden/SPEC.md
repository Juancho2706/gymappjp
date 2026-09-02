---
status: done
owner: product-engineering
last_verified: "2026-09-01"
canonical: false
---

# SPEC — Ola de orden («La casa ordenada»): interruptores reales, nav sin piezas perdidas, Funciones todo-en-una

> **Estado: DONE (2026-09-01).** En producción web + OTA 1.1.2 con QA del owner verde; ejecución, decisiones del jefe y backlog heredado en [TASKS](TASKS.md) § «Cierre de la ola».

> **PLAN, no código.** Repo `D:\Proyectos\Antigravity\gymappjp` se leyó en modo SOLO LECTURA para
> escribir este documento — cero commits, cero archivos de producto tocados. Toda ruta/símbolo
> citada abajo fue verificada con Grep/Read en la sesión de escritura (31-08-2026, rama
> `rnmobiledenuevo`). El SQL/TS que aparece en bloques de código es **propuesto**, no implementado.

## 1. Problema (con evidencia)

EVA vende «todo incluido» desde el 31-08 (D1, §2), pero el código todavía actúa como si el
menú del coach fuera un catálogo de compra a medio construir. Tres síntomas, cada uno con cita
`archivo:línea`:

### 1.1 Interruptores que no interruptan parejo en las dos plataformas

El filtro genérico por los 5 dominios de `coach_feature_prefs` **sí existe y sí funciona** en el
sidebar web: `apps/web/src/app/coach/layout.tsx:130,136,364` arma `disabledDomains` con
`disabledDomainsFromPrefs(await readCoachDomainPrefs(...))`
(`apps/web/src/services/coach/persona.service.ts:235,272`, que itera los 5 `FEATURE_DOMAIN_KEYS`)
y se lo pasa a `<CoachSidebar disabledDomains={...} />`. `packages/coach-nav/nav.ts:186-192`
(`getVisibleNavItems`) ya sabe ocultar cualquier entrada cuyo `featureDomain` esté en ese set — el
mecanismo es genérico, no hardcodeado a nutrición (comentario propio, `nav.ts:140-143`).

En RN el mismo mecanismo **no está conectado**: `CoachMobileChrome.tsx:95-103` arma
`disabledDomains` así:

```ts
const visible = getVisibleNavItems({
  activeWorkspaceType: coachWorkspaceTypeFromKind(kind),
  subscriptionStatus: subscriptionState,
  enabledModules: { cardio: hasModule('cardio'), movement_assessment: hasModule('movement_assessment') },
  disabledDomains: nutritionEnabled ? undefined : new Set(['nutrition']),
})
```

Solo `nutrition` entra al set. Si un coach apaga `training`, `cardio`, `movement` o `bodycomp`
desde Funciones, la barra RN no se entera — el registro (`nav.ts`) está listo (`packages/coach-nav/nav.test.ts:85-186`
ya testea `disabledDomains` con `nutrition`, `training` y `cardio`/`movement` — corrección del
jefe: la base de tests a extender, no a crear de cero), pero el ÚNICO consumidor RN pasa un set de
un solo elemento.

### 1.2 Nav con piezas perdidas

- **`Equipo` se pierde en RN**: `CoachMobileChrome.tsx:114-117` arma la barra con
  `MOBILE_TAB_KEYS.map(...).filter(...).slice(0, 5)` — un corte ciego a 5 ítems sobre una lista
  que, en contexto `coach_team`, incluye `team` (`nav.ts:101`). Si `team` cae después de la
  posición 5 en `MOBILE_TAB_KEYS`, desaparece sin aviso ni «Más» que lo rescate.
- **Cardio y Movimiento nunca se pintan**, en ninguna plataforma, aunque el coach los tenga
  prendidos en Funciones: `nav.ts:114-115` declara esas dos entradas con **dos gates a la vez**,
  `entitlement: 'cardio'` / `entitlement: 'movement_assessment'` Y `featureDomain: 'cardio'` /
  `'movement'`. `getVisibleNavItems` (`nav.ts:189`) exige `enabledModules[item.entitlement] === true`
  — es decir, el módulo de PAGO viejo, no la preferencia. Con «compra apagada por env» (OUTLINE §6:
  0 módulos vendidos self-service), ese entitlement nunca es `true` para un coach nuevo → la
  entrada queda oculta pase lo que pase con el toggle de Funciones. Esto explica el reclamo
  literal del BRIEF §1.4 («incl. Cardio/Movimiento que hoy NUNCA se pintan»): no es un bug de
  agrupación del sidebar, es que el candado de compra sigue vivo encima del toggle de preferencia.

### 1.3 Cuatro pantallas para un concepto («Funciones»)

Hoy compiten cuatro superficies por el mismo trabajo — «elegí qué usa tu panel»:

| Pantalla | Ruta | Qué hace | Evidencia |
|---|---|---|---|
| Web «Mi panel» | `/coach/settings/funciones` | Especialidad + master switch de los 5 dominios + secciones de nutrición | `apps/web/src/app/coach/settings/funciones/page.tsx:9` (`metadata.title = 'Mi panel \| EVA'`), `:47` (`<h1>{isTeam ? 'Funciones del equipo' : 'Mi panel'}</h1>`) |
| Web «Módulos» | `/coach/settings/modules` | Catálogo de los 4 módulos de pago viejos, con copy de upsell | `apps/web/src/app/coach/settings/modules/_components/ModulesForm.tsx:29,42,62,105,139,160,178,186` («Incluido en tu plan», «Con plan pago», «Ver planes») |
| RN «Mi panel» | `apps/mobile/app/coach/settings/mi-panel.tsx` | Espejo RN de la especialidad + master switch (comentario propio: «cardio, movilidad y composición viven dentro de "Herramientas" y no tienen tab propio», línea 113) | `mi-panel.tsx:58,61,69,113,379,534-535` |
| RN «Funciones» (`features.tsx`) | `apps/mobile/app/coach/settings/features.tsx` | Detalle de secciones de nutrición por dominio, con copy de upsell («"Módulos" es lo que incluye tu plan», línea 173) y `locked = isPro && !entitled` (línea 338) | `features.tsx:22,69,85-86,165,173,211,217,262-264,337-338` |
| Web/RN «Herramientas» | `/coach/tools` | Launcher «Abrir» por módulo | `apps/web/src/app/coach/tools/_components/ToolsHub.tsx`, `apps/web/src/app/coach/tools/_data/tools.queries.ts` (existencia confirmada por Grep, contenido no auditado línea a línea en esta pasada) |

Cinco archivos, dos plataformas, un solo concepto real («qué usa este panel»), y ninguno de los
cinco borra candados de pago que ya no aplican (§8).

---

## 2. Decisiones cerradas del owner (textuales, `DECISIONS.md` 31-08-2026)

> **D1.** TODO en TODOS los planes; se cobra solo cupo de alumnos; NO hay módulos pagos (palabras
> textuales del owner al pedir el megaplan). Implica: candados por módulo → toggles normales; muere
> el copy «Incluido/Con plan pago»; `EVA_DISABLED_MODULES` queda solo como palanca de incidentes
> del operador.
>
> **D2.** Mockups «La casa ordenada» aprobados en dirección («me gustó lo que me ofreciste»). Se
> toman las recomendadas: M1-A barra RN con «Más» adaptativa por especialidad · M2-A sidebar web
> agrupado · M3-A Funciones todo-en-una · M4-A alumno DESPUÉS · M5-A Bienestar como dominio propio
> cuando se haga Yoga F2 · M6-A mockups alcanzan para plan. Confirmación formal de letras: pendiente
> en la entrega (el owner no escribió letras, aprobó el conjunto).
>
> **D3.** El plan debe cubrir explícitamente: qué se prende/apaga lado coach vs lado alumno, ficha
> del alumno incluida, y que el estado prendido/apagado sea de USO real (no solo menú).
>
> **D4.** Versión económica del megaplan: workers baratos (Sonnet/Haiku) para grunt work, el jefe
> (Fable) juzga y escribe outline/artifact; reutilizar el inventario `wf-*.json` ya pagado. No
> quemar tokens del owner.
>
> **D5.** Sin plan del lado alumno reactivo en esta ola (D9-A firme); la SPEC deja el contrato
> listo para la wave futura (P4).
>
> **D6.** Aún sin fecha comprometida: compite con Cobros (P1–P8 abiertos) y Yoga/ánimo (P1–P7
> abiertos). La ola de orden se planifica para poder ejecutarse ANTES (reco del diagnóstico), pero
> el owner ordena el calendario.

---

## 3. Alcance / no-alcance

**EN:**
- **W1** — Interruptores reales: los 5 dominios controlan menú Y ruta, en web Y RN, parejo.
- **W2** — Navegación: barra RN con «Más» adaptativa (fix del `slice(0,5)`) + sidebar web agrupado
  (Principal / Tu trabajo / Gestión).
- **W3** — Pantalla «Funciones» todo-en-una (web + RN), absorbe Módulos/Mi panel/Funciones(RN) y el
  launcher de Herramientas.
- **W4** — Todo-incluido aplicado al código (D1) + demoliciones (§1.7 del BRIEF).

**FUERA:**
- Barra del alumno 4+«Más» (M4-A) — deuda del lado alumno, no de esta ola.
- Alumno reactivo a las prefs del coach (P4/D9-A) — la matriz (§4) documenta el estado actual y el
  contrato futuro, pero no lo implementa.
- Bienestar/Yoga F1-F3 — spec propia; esta ola solo deja la regla de plataforma (§7) para que
  entre sin fricción cuando exista.
- Resto de W8 del onboarding v2 — el checklist por persona vive en `coach-onboarding-v2`; esta
  ola toma solo las piezas que son del chasis de nav (nav RN por dominio, toast honesto, FAB por
  dominio).
- Billing/pagos — no aplica, no hay pagos de módulos.
- Cambios de esquema de base de datos — meta explícita: **cero migraciones** (§6).

---

## 4. La matriz — dominio × superficie × audiencia

Fuente: `maps/ficha-y-gates.md` (puntos de inserción de gates y ficha del alumno) y
`maps/alumno.md` (área del alumno), corregidos por `maps/CORRECCIONES.md`. `ON` = el coach dejó el
dominio prendido en Funciones (o nunca lo tocó — fail-open). `OFF` = el coach lo apagó.

Leyenda de columnas: **NavW** = sidebar web · **CápRN** = cápsula/tab bar RN del coach ·
**RutaW** = ruta web del dominio · **PantRN** = pantalla RN del dominio · **Ficha** = pestaña/sección
en la ficha del alumno (vista coach) · **Abrir** = fila «Abrir» en Funciones (launcher) ·
**AlumnoHOY** = app del alumno hoy, sin cambio por esta ola (D9-A) · **AlumnoP4** = contrato para la
wave futura reactiva.

### 4.1 `nutrition`

| Estado | NavW | CápRN | RutaW | PantRN | Ficha | Abrir | AlumnoHOY (D9-A) | AlumnoP4 (futuro) |
|---|---|---|---|---|---|---|---|---|
| **ON** | entrada «Nutrición» visible (`nav.ts:105`, ya filtrado hoy vía `disabledDomainsFromPrefs`) | tile «Nutrición» visible (`CoachMobileChrome.tsx:162`, HOY ya condicional a `nutritionEnabled`) | `/coach/nutrition-plans` sirve (guard ya existe: `resolveNutritionDomainEnabled`, `nutrition-plans/page.tsx:177-182`); `/coach/nutrition-v2` **sin guard hoy** (gap, W1) | RN nutrición **sin guard hoy** (`nutrition-v2/index.tsx`, `(tabs)/nutricion.tsx` — 0 matches de `domainEnabled`, `ficha-y-gates.md` §B.6) | pestaña «Nutrición» visible (hoy siempre, sin gate — `ProfileTabNav.tsx:13-19`) | fila «Nutrición → Abrir» activa | tab Nutrición visible, `nutritionEnabled` fijo en `true` para `scope.clientId` (`route.ts:112-119`) | tab visible si la preferencia real del coach (dueño del alumno) está ON |
| **OFF** | entrada oculta (funciona hoy) | tile oculto (funciona hoy) | `/coach/nutrition-plans` redirige (ya funciona); `/coach/nutrition-v2` **sigue sirviendo** hasta W1 | pantalla **sigue abriendo** hasta W1 (sin guard) | pestaña **sigue mostrándose** hasta W1 (BRIEF §1.2, literal) | fila oculta o con `DomainOffNotice` | **sin cambio** — el alumno sigue viendo Nutrición aunque su coach la apagó (D9-A, `route.ts:112-119`) | tab se oculta / `DomainOffNotice` en la app del alumno |

### 4.2 `training`

| Estado | NavW | CápRN | RutaW | PantRN | Ficha | Abrir | AlumnoHOY | AlumnoP4 |
|---|---|---|---|---|---|---|---|---|
| **ON** | entrada «Programas» visible (`nav.ts:102`, `core:true, defaultOn:true` — `packages/feature-prefs/index.ts:258-260`) | tile builder visible | `/coach/workout-programs` sirve | `builder.tsx` sirve | pestañas «Entreno»/«Programa» visibles | fila «Programas → Abrir» | sin gate — `training` no tiene master switch de entitlement, siempre disponible | sin cambio esperado (dominio core, rara vez se apaga) |
| **OFF** | entrada se oculta (mecanismo genérico ya listo, `nav.ts:190`) | tile **no se oculta hoy** — `training` no está en el set que arma `CoachMobileChrome.tsx:102` (gap W1) | `/coach/workout-programs` **sin guard** — «cero chequeo» salvo `redirect('/login')` (`page.tsx:13`; `ficha-y-gates.md` §B.1) | `builder.tsx` **sin guard** — 0 matches de `ModuleOffNotice`/`domainEnabled` (§B.5) | pestañas «Entreno»/«Programa» **siguen mostrándose** — 0 gate (§A.2) | fila oculta / `DomainOffNotice` | training es dominio core (fail-open casi siempre ON); si se apaga, hoy no hay ninguna señal al alumno | a definir en P4 si `training` llega a ser apagable para el alumno (dominio poco probable de apagar) |

### 4.3 `cardio`

| Estado | NavW | CápRN | RutaW | PantRN | Ficha | Abrir | AlumnoHOY | AlumnoP4 |
|---|---|---|---|---|---|---|---|---|
| **ON** | entrada existe en el registro (`nav.ts:114`) pero **hoy exige `entitlement:'cardio'`** además del dominio — con compra apagada por env, nunca se pinta (§1.2) | ídem (`CoachMobileChrome.tsx:99`, `hasModule('cardio')`) | `/coach/cardio` sirve solo si `assertModule` (viejo) da OK (`cardio/page.tsx:17-23`) | `cardio/index.tsx` ídem (`hasModule('cardio')`, comentario «gate + ModuleOffNotice; sin el módulo NO se listan alumnos») | botón «Cardio» en Resumen visible solo si `moduleFlags.cardio` (`ProfileOverviewB3.tsx:272-274`) — sin sección/pestaña propia | fila «Cardio → Abrir» | **el alumno no tiene NINGUNA pantalla de cardio dedicada, en ninguna plataforma** (`maps/alumno.md` §2.6, confirmado con Grep sin resultados en ambos árboles) — el cardio del alumno vive dentro del executor: `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx` (corrección del jefe, `CORRECCIONES.md` #1) | fuera de alcance mientras no exista superficie propia del alumno (§4.8 de `maps/alumno.md`: «una wave que active cardio para el alumno parte de CERO superficie») |
| **OFF** | entrada oculta (doble motivo: entitlement Y dominio) | ídem | `<ModuleOffNotice moduleKey="cardio">` con copy de upsell a demoler (§8) | RN `<ModuleOffNotice>` ídem | botón oculto | fila oculta / `DomainOffNotice` | sin cambio (no hay superficie) | sin cambio (no hay superficie) |

### 4.4 `movement`

| Estado | NavW | CápRN | RutaW | PantRN | Ficha | Abrir | AlumnoHOY | AlumnoP4 |
|---|---|---|---|---|---|---|---|---|
| **ON** | mismo problema que cardio: `entitlement:'movement_assessment'` + `featureDomain:'movement'` (`nav.ts:115`) | ídem (`hasModule('movement_assessment')`) | `/coach/movement` sirve si `assertModule` OK (`movement/page.tsx:16-19`) | `movement/index.tsx` (no verificado línea a línea, mismo patrón de carpeta que `cardio/index.tsx`, `ficha-y-gates.md` §B.7) | botón «Movimiento» en Resumen (`ProfileOverviewB3.tsx:275-277`), solo web — **en RN falta este botón** (`OverviewTab.tsx:838-839` solo tiene cardio+movement, sin bodycomp — ver 4.5) | fila «Movimiento → Abrir» | el alumno **sí tiene** pantalla propia: `alumno/(tabs)/movement.tsx`, oculta del tab bar (`href:null`), alcanzable desde Perfil; gate real: `hasModule('movement_assessment')` → sin módulo, `finals: []`, cero fetch (`movement.tsx:122,127,129-146`) | el gate de uso hoy es por entitlement de plan, no por `coach_feature_prefs` — P4 decidiría si suma un segundo `&&` con la preferencia real (`maps/alumno.md` §4.9), sin tocar el gate de entitlement |
| **OFF** | entrada oculta | ídem | `<ModuleOffNotice moduleKey="movement_assessment">` | ídem RN | botón oculto | fila oculta / `DomainOffNotice` | **sin cambio por esta ola** — hoy ya se oculta, pero por el entitlement de módulo, no por la preferencia del coach (D9-A: la preferencia no toca al alumno) | sección se oculta también si la preferencia real está OFF |

### 4.5 `bodycomp`

| Estado | NavW | CápRN | RutaW | PantRN | Ficha | Abrir | AlumnoHOY | AlumnoP4 |
|---|---|---|---|---|---|---|---|---|
| **ON** | **sin entrada top-level de nav en ninguna plataforma** — vive solo dentro de la ficha (`nav.ts` no tiene fila `bodycomp`); confirma OUTLINE §3 («bodycomp no tiene superficie top-level propia») | ídem — no hay tile | `/coach/clients/[clientId]/bodycomp` sirve si `assertModule` OK (`bodycomp/page.tsx:16-20`) | `bodycomp/[clientId].tsx` ídem, comentario «MONEY-SAFETY» (`:48-50`) | gráfico DENTRO de pestaña Progreso gateado por `bodycompEnabled={moduleFlags?.bodycomp}` (`ProgressBodyCompositionB6.tsx`, prop en `ClientProfileDashboard.tsx:322`) — botón de acceso directo en **web** (`ProfileOverviewB3.tsx:278-279`) **y en RN** (`OverviewTab.tsx:840`, `moduleFlags.bodycomp ? {...router.push('/coach/bodycomp/...')} : null`, gateado igual que cardio/movement — corrección del jefe: no hay drift, el botón ya existe; el hallazgo de un `OverviewTab.tsx:838-839` sin bodycomp era falso, no entra tarea a W1) | fila «Composición → Abrir» (nueva — hoy no hay launcher dedicado) | pantalla propia oculta (`alumno/(tabs)/bodycomp.tsx`), gate `hasModule('body_composition')`, mismo patrón que movement (`bodycomp.tsx:159,164`) | mismo tratamiento que movement: P4 sumaría preferencia real encima del entitlement, sin tocar el gate de money-safety |
| **OFF** | n/a (sin entrada top-level) | n/a | `<ModuleOffNotice moduleKey="body_composition">` | ídem RN | gráfico oculto; botón de acceso (web) oculto | fila oculta / `DomainOffNotice` | sin cambio por esta ola (mismo razonamiento que movement) | sección oculta si preferencia real OFF |

### 4.6 Ficha del alumno — resumen de huecos (de `maps/ficha-y-gates.md` §A.5)

| Pestaña/sección | Dominio | Gate hoy (web) | Gate hoy (RN) | Trabajo de W1 |
|---|---|---|---|---|
| Resumen | mixto | ninguno para la pestaña entera; botones «Módulos» sí gatean vía `moduleFlags` (sistema viejo) | ídem, sin botón bodycomp | pasar a leer `coach_feature_prefs` (§8) |
| Progreso | `bodycomp` (parcial) + training | gráfico gateado, resto no | ídem | sin cambio de gate, solo limpiar copy si aplica |
| Entreno | `training` | ninguno | ninguno | agregar gate de pestaña |
| Programa | `training` | ninguno | ninguno | agregar gate de pestaña |
| Nutrición | `nutrition` | ninguno | ninguno | agregar gate de pestaña |
| (sin pestaña) | `cardio`, `movement` | solo botón-link en Resumen | ídem | sin sección propia — fuera de alcance crear una nueva |

### 4.7 Nota de arquitectura que la matriz expone (a resolver en W1, no en esta SPEC)

`ficha-y-gates.md` §A.0 documenta que la ficha (web y RN) **no importa `feature-prefs` en
absoluto** (Grep de `coach_feature_prefs|FEATURE_DOMAINS|resolveFeaturePrefs` sobre
`apps/web/src/app/coach/clients/[clientId]/**`: 0 resultados) — hoy filtra por el sistema VIEJO de
módulos (`moduleFlags` desde `getEnabledModulesForRender`/`hasModuleFromMap`,
`apps/web/src/app/coach/clients/[clientId]/page.tsx:65-79,101-118`). W1 tiene que sumar una lectura
de `coach_feature_prefs` (los 5 dominios) a la carga de la ficha — el punto de inserción exacto es
ese mismo bloque de `page.tsx` (server component), en paralelo a `enabledModules`.

---

## 5. Semántica del gate

**Regla central**: el toggle de Funciones es **preferencia de visibilidad del coach**, nunca
autorización de datos. RLS y entitlements de Supabase no cambian por esta ola — un dato que ya era
legible/escribible sigue siéndolo a nivel de base; lo que cambia es si la UI lo ofrece.

- **Dominio prendido ⇒ usable**: entrada visible en el menú Y la ruta/pantalla sirve normal.
- **Dominio apagado ⇒ inusable desde el menú del coach**: la entrada desaparece del menú Y la
  ruta/pantalla se cierra server-side (web) o vía guard de pantalla (RN) — nunca solo una de las
  dos. Redirect canónico: `/coach/dashboard?notice=domain_off&domain=<key>`; el banner del
  dashboard lee ese `notice` (contrato nuevo, no existe hoy — Grep de `notice=domain_off` sobre
  `apps/web/src`: 0 resultados, es responsabilidad de W1 crearlo).
- **Jerarquía de gates** (de más a menos prioritaria):
  1. **Kill-switch de operador** `EVA_DISABLED_MODULES` — palanca de incidentes, por encima de
     todo. Sigue existiendo tal cual (D1, BRIEF §3): un módulo apagado acá se cae para TODOS los
     coaches, sin importar su preferencia.
  2. **Master switch del dominio** (`coach_feature_prefs._enabled`, `packages/feature-prefs/index.ts:309`)
     — la preferencia de esta ola.
  3. **Secciones internas** (solo `nutrition` las tiene — micros avanzados, etc., §8).
- **Fail-open sin fila**: coach sin fila en `coach_feature_prefs` para un dominio ⇒ `true`
  (comportamiento de HOY, no se rompe — comentario textual en `feature-prefs.service.ts:304-306`:
  «Flag OFF / ausente / Edge caído => `true`»).
- **`audience: 'student'` sigue forzando `true`** (D9-A, §6) — el gate de dominio nunca oculta nada
  al alumno en esta ola; eso es explícitamente P4.
- **Componer, no reemplazar (R6)**: en `cardio`/`movement`/`bodycomp` el guard de dominio nuevo
  (`assertDomainEnabled`/`useDomainGuard`) se agrega ENCIMA del gate de módulo viejo
  (`assertModule`/`hasModule`), que tras D1 pasa a ser semánticamente el kill-switch de operador —
  no se elimina ni se reescribe `_data/*.queries.ts` en esta ola. Una ruta de esos tres dominios
  puede fallar por dos motivos distintos ahora: módulo desactivado por operador (`ModuleOffNotice`,
  mensaje de incidente) o dominio apagado por el coach (`DomainOffNotice`, mensaje de preferencia)
  — ver §8.1 para cómo conviven los dos avisos.

```ts
// PROPUESTO — molde a replicar 4 veces (training/cardio/movement/bodycomp),
// calcado de resolveNutritionDomainEnabled (apps/web/src/services/feature-prefs.service.ts:311-339)
export const resolveTrainingDomainEnabled = cache(
  async (input: { coachId: string; clientId?: string | null; clientTeamId?: string | null; clientOrgId?: string | null; audience?: FeaturePrefsAudience }) => {
    if (input.audience === 'student') return true // D9-A
    return resolveDomainEnabled({ domain: 'training', ...input }) // packages/feature-prefs/index.ts:341
  },
)
```

---

## 6. Contrato `/api/mobile/config`

`apps/web/src/app/api/mobile/config/route.ts` hoy expone `featurePrefs: { nutritionEnabled,
sections }` (línea 245) más el flag global `featurePrefsEnabled` (línea 246, alimentado por
`readFeaturePrefsEnabled()` → Edge Config `FEATURE_PREFS_ENABLED`, línea 239). Esta ola:

1. **Agrega `featurePrefs.domains`** — los 5 booleans resueltos (master switch, ya con kill-switch
   aplicado):
   ```json
   {
     "featurePrefs": {
       "nutritionEnabled": true,
       "domains": { "nutrition": true, "training": true, "cardio": false, "movement": false, "bodycomp": true },
       "sections": { "...": "sin cambio" }
     }
   }
   ```
2. **`nutritionEnabled` se conserva 1 versión como espejo legacy** — `domains.nutrition` es la
   fuente nueva, pero apps viejas en runtime embebido (sin OTA aplicada) siguen leyendo el campo
   plano; se retira en la wave siguiente con comentario de fecha de baja en el propio `route.ts`.
3. **Se retira `FEATURE_PREFS_ENABLED`** (R1, OUTLINE §2): el sistema de prefs queda siempre-on.
   `readFeaturePrefsEnabled()` (`route.ts:239`) deja de leerse — la asimetría web/RN que hoy
   permite que el flag esté ON en un lado y OFF en el otro desaparece de raíz. Rollback de
   emergencia si algo sale mal: apagar dominios puntuales por SQL soporte, o
   `EVA_DISABLED_MODULES` para lo que sea módulo (no dominio).
   - **Precondición antes de ejecutar (hallazgo del jefe, riesgo·seguridad)**: hoy, si el flag
     `FEATURE_PREFS_ENABLED` falla o está ausente en Edge Config, la RUTA de `/coach/nutrition-plans`
     (no el nav, que ya lo ignora) bypasea filas guardadas con `_enabled:false` — retirar el flag
     activa de golpe cualquier fila inerte que exista hoy en `coach_feature_prefs`/
     `team_feature_prefs` sin que se haya cuantificado cuántas son. **Antes de ejecutar el ítem W1
     de este punto**: (a) confirmar el valor real vigente de `FEATURE_PREFS_ENABLED` en Edge Config
     (no asumir «está estable en prod» sin leerlo), y (b) contar por SQL cuántas filas con
     `_enabled=false` existen hoy para cada dominio. Si el conteo es alto o el flag está OFF en
     producción, W1.10 necesita coordinarse con soporte antes del merge, no después.
4. **`CoachMobileChrome.tsx`** deja de armar `disabledDomains` a mano con un solo `Set(['nutrition'])`
   condicional (línea 102) y pasa a construirlo desde `config.featurePrefs.domains` completo — los
   5 dominios, mismo patrón que ya usa `disabledDomainsFromPrefs` en web.

No hay cambio de esquema de tabla: `coach_feature_prefs` y `team_feature_prefs` ya soportan los 5
dominios (`domain text` libre, sin migración — comentario `packages/feature-prefs/index.ts:270-274`).

---

## 7. Regla de plataforma + checklist de alta de dominio nuevo

**Regla** (a codificar como norma en `AGENTS.md`/`docs/architecture`, no en esta ola — la SPEC solo
la enuncia): **ninguna feature nueva de coach entra al producto sin una fila en `FEATURE_DOMAINS`
(`packages/feature-prefs/index.ts:276-282`) y un default de visibilidad por especialidad**
(`resolvePersonaPrefs`, `packages/feature-prefs/index.ts:429`). Si no tiene dominio, no tiene
toggle, no tiene entrada en Funciones, y el coach no puede apagarla — eso es lo que esta ola busca
que deje de pasar.

Checklist de alta (genérico, para cualquier dominio futuro):

1. Agregar la key a `FEATURE_DOMAINS` (`packages/feature-prefs/index.ts:276-282`) con sus
   `FeatureSection[]` (aunque sea solo el `core` con `defaultOn: true`, como `training`/`bodycomp`
   hoy — líneas 258-265).
2. Sumar la key a `FEATURE_DOMAIN_KEYS` (línea 287-293) — es lo que arma `disabledDomainsFromPrefs`
   automáticamente (`persona.service.ts:272`), así que el sidebar web la respeta sin tocar código
   de nav.
3. Decidir el default por persona en `resolvePersonaPrefs`/el mapa `PERSONA_DOMAIN_ORDER`
   (`packages/feature-prefs/index.ts:429` y el nombre canónico del OUTLINE §3) — qué especialidades
   la ven prendida de entrada. Para la barra RN (M1-A), los valores de `PERSONA_DOMAIN_ORDER` se
   derivan de ese mismo mapa: dominios ON en el orden que ya declara, tomando los 2 primeros para
   los tabs fijos (R5) — default reversible, se afina en QA device.
4. Sumar la entrada a `NAV_MODULES` (`packages/coach-nav/nav.ts:98-116`) con `featureDomain` (nunca
   con `entitlement` salvo que sea un entitlement de PLAN real, no de dominio — la lección de §1.2
   es exactamente no repetir el error de mezclar los dos gates).
5. Crear el `resolveXDomainEnabled` de servicio (molde §5) y el guard de ruta al inicio del
   `page.tsx`/pantalla RN correspondiente.
6. Sumar la fila a la pantalla «Funciones» (§3, W3) — coach y RN.
7. Decidir su celda en la ficha del alumno (¿pestaña, sección, o ninguna? §4.6) y en el launcher
   «Abrir».
8. Documentar su fila en la matriz de este SPEC (o su sucesora) antes de mergear.

### Ejemplo resuelto (sin implementar): Bienestar / Yoga F2

Cuando `yoga-animo-screening` (proyecto activo, memoria del owner) llegue a su fase F2 de
«actividad externa» con dominio propio, entra así bajo esta regla:

1. `FEATURE_DOMAINS.wellness` (o el nombre que decida esa spec) con secciones mínimas
   (`core: true, defaultOn: false` — Bienestar no es un dominio que todo coach quiera prendido de
   entrada, a diferencia de `training`).
2. Se suma a `FEATURE_DOMAIN_KEYS` → el sidebar web ya lo respeta sin tocar `CoachSidebar.tsx`.
3. Persona: probablemente `defaultOn: false` salvo para personas de bienestar/yoga explícitas — la
   spec de Yoga F2 decide, no esta.
4. `NAV_MODULES` suma `{ key: 'wellness', href: '/coach/wellness', featureDomain: 'wellness' }` —
   **sin `entitlement`**, porque D1 ya mató los módulos de pago; si Yoga F2 alguna vez necesita un
   candado real (por ejemplo, un límite de plan distinto de cupo), sería una decisión de producto
   nueva y explícita, no el patrón viejo reflotado por descuido.
5-8. Igual que cualquier dominio — la SPEC de Yoga F2 hace su propia matriz de fila.

Esto es exactamente lo que responde la pregunta 3 del owner (BRIEF §5): «lo nuevo entra sin
ensuciar» porque el checklist es mecánico, no una negociación caso por caso.

---

## 8. Todo-incluido (D1) — qué muere y qué no se toca

### 8.1 Qué muere

- **Candados «con plan pago» → toggles normales**:
  - `micros_advanced` (micros avanzados de nutrición) — hoy gateado por el módulo
    `nutrition_exchanges` (comentario `apps/web/src/app/api/mobile/nutrition/micros/route.ts:19-21`:
    «GATEADO por el módulo `nutrition_exchanges`... fail-closed»; `feature-prefs.service.ts:284-294`
    resuelve `prefs.micros_advanced === true` a partir de `resolveFeaturePrefs`). Pasa a ser una
    sección más del dominio `nutrition` con `requiresModule: null` (como ya son las secciones
    `core`, `packages/feature-prefs/index.ts:260-263`) — deja de depender de `entitledByModule`.
  - `goals_bodycomp` (objetivos por composición) — mismo patrón, mismo archivo de test
    (`feature-prefs.service.test.ts:138`, `route.test.ts:132-157`), mismo tratamiento.
  - Ambos hoy también gatean con `isPro && !entitled` del lado RN
    (`apps/mobile/app/coach/settings/features.tsx:337-338`, `locked = isPro && !entitled`) — esa
    línea desaparece; `locked` deja de existir como concepto.
- **Copy «Incluido en tu plan» / «Con plan pago» / «Ver planes»** — `ModulesForm.tsx` (web,
  líneas 29,42,62,101,105,139,160,178,186) y el mismo lenguaje en `features.tsx` (RN, línea 173:
  «"Módulos" es lo que incluye tu plan»). Se reemplaza por lenguaje de preferencia («Prendido» /
  «Apagado», sin mención de plan).
- **`ModuleOffNotice` (web y RN)** — el copy actual cita literalmente la decisión CEO 2026-07-17
  superada («Este módulo viene incluido en cualquier plan pago de EVA», `ModuleOffNotice.tsx:67`,
  web; «Este módulo no está incluido en tu plan actual», `ModuleOffNotice.tsx:87-89`, RN) con CTA a
  `/coach/subscription`. Nuevo copy: «Prendé este dominio en Funciones» + CTA a
  `/coach/settings/funciones`. El componente en sí (RN ya soporta `cta` inyectable,
  `ModuleOffNotice.tsx` RN línea 56) se reutiliza como base de `DomainOffNotice` (nombre canónico
  OUTLINE §3) en vez de reescribirse desde cero.
  - **Cómo conviven `ModuleOffNotice` y `DomainOffNotice` (resuelve la tensión R6↔R8)**: W1 crea
    `DomainOffNotice` genérico para el gate NUEVO (preferencia del coach). R8 dice que W4 «migra y
    borra» `ModuleOffNotice` — eso aplica donde el gate viejo de módulo desaparece del todo
    (`nutrition`, `training`, que nunca tuvieron `assertModule` real). En `cardio`/`movement`/
    `bodycomp`, R6 exige que el guard nuevo se COMPONGA sobre el gate de módulo viejo, no lo
    reemplace — ese gate viejo sigue vivo como kill-switch de operador (§8.2), así que
    `ModuleOffNotice` **también sigue vivo ahí**, con el copy actualizado de este bullet (ya no
    habla de plan pago, habla de incidente/operador). Los dos componentes no compiten: se muestra
    `ModuleOffNotice` cuando el módulo está apagado por `EVA_DISABLED_MODULES`/`enabled_modules`
    (caso operador, raro) y `DomainOffNotice` cuando el coach apagó el dominio en Funciones (caso
    normal). W4 borra `ModuleOffNotice` solo en `nutrition`/`training`, donde no hay gate de
    operador que mostrarlo por debajo — TASKS W4.2 debe reflejar esta distinción por dominio, no un
    retemplado de copy uniforme.
- **`hasPaidModuleAccess` para coaches ACTIVOS** — deja de participar en gates de coach con acceso
  vigente (OUTLINE §2): «para coach con acceso vigente, TODOS los módulos = ON salvo
  `EVA_DISABLED_MODULES`». `getEnabledModulesForRender`/`hasModuleFromMap`
  (`apps/web/src/services/entitlements-render-cache.ts`) y `getWorkspaceEntitlements`
  (`apps/mobile/lib/entitlements.ts`) pasan a resolver `true` para los 4 `MODULE_KEYS`
  (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`,
  `apps/web/src/lib/module-keys.ts`) sin consultar `enabled_modules`/`coach_addons`, salvo
  `EVA_DISABLED_MODULES`.
- **El gate doble de `nav.ts:114-115`** (`entitlement` + `featureDomain` en cardio/movement) — se
  reduce a solo `featureDomain`. Es la línea que resuelve el «nunca se pintan» de §1.2. **Se
  ejecuta en W2, no en W4** (R2, ver §9 W2 y §10): es un cambio chico sobre el registro de nav más
  la extensión de `nav.test.ts`, adelantado para que el sidebar agrupado de W2 pinte cardio/movement
  completo desde el día uno. W4 conserva el resto de este §8.1 (copy, candados, upsells, poda de
  `TIER_CAPABILITIES`) — es más barato ejecutarlo después de que W3 ya movió las pantallas.
- **`TIER_CAPABILITIES` (`packages/tiers/index.ts:219-270`)**: ⚠ corregido el 2026-09-01 contra
  HEAD `7c20bac6` — de las 4 capacidades que el diagnóstico daba por muertas, **solo
  `canUseAdvancedReports` no tiene consumidores**; `canUseNutrition`, `canImportClients` y
  `canCreateCustomExercises` siguen gateando rutas reales de billing/importación/ejercicios
  (call sites listados en TASKS W4.5) y NO se podan en esta ola. **Quedan vivas** también
  `showsEvaBadge` (sello «Hecho con EVA», sigue siendo Pro/Elite vs Free/starter — decisión de
  pricing v3, no de esta ola, `packages/tiers/index.ts:29-30`) y cualquier otra ligada a
  cupo/branding, no a dominios. Si «todo en todos los planes» exige que esas tres dejen de gatear,
  es una tarea propia por call site, fuera de W4.
- **Demoliciones del BRIEF §1.7** (verificadas por Grep en esta pasada — todas existen):
  - `apps/mobile/app/coach/(tabs)/check-ins.tsx` — pantalla huérfana (confirmar con su propio
    `_layout.tsx` que no esté montada antes de borrar; no verificado línea a línea en esta pasada).
  - `apps/mobile/components/coach/CoachSearchPalette.tsx` — sin montar (confirmado por el archivo
    existir en el Grep de superficies, BRIEF ya lo marca como sin montar).
  - `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` — muerto: el tipo `ClientTab`
    en `apps/mobile/components/coach/clientDetail/ClientTabBar.tsx:13` todavía incluye
    `'facturacion'` en la unión aunque `[clientId].tsx` no la usa (`ficha-y-gates.md` §A.3, Grep de
    `FacturacionTab` sobre `[clientId].tsx`: 0 resultados) — se borra el archivo Y se achica el
    tipo union.
  - Deltas KPI hardcodeados (p. ej. «+1 esta semana») — candidatos en `apps/mobile/lib/client-kpi-cards.ts`
    (archivo confirmado en el Grep de superficies con lógica de KPI del coach; el texto exacto del
    delta hardcodeado no se verificó línea a línea en esta pasada — W4 lo audita al tocar el
    archivo).
  - Flags muertos `NEXT_PUBLIC_FF_WEEKLY_PLAN`, `NEXT_PUBLIC_FF_DETAILED_LOGGING` — **existen**,
    confirmado (R3): `apps/web/src/lib/feature-flags.ts:15,17` (+ test `feature-flags.test.ts:23`).
    El Grep original de esta pasada buscó en `apps/mobile` y por eso dio 0 resultados; corrección
    del jefe. W4 los demuele en esa ruta web.

### 8.2 Qué NO se toca

- Las tablas `coach_addons` y `enabled_modules` **se conservan** — quedan como histórico/cortesías
  y como la fuente que sigue mandando para coaches **INACTIVOS** (un coach sin suscripción vigente
  ya está bloqueado entero por el gate de suscripción, `SUBSCRIPTION_BLOCKED_STATUSES`,
  `nav.ts:37`; los módulos de ese coach son irrelevantes mientras esté bloqueado).
- Billing de suscripción — cupo (`max_clients`), ciclos, tiers de venta — **intacto**. Esta ola no
  toca `packages/tiers/index.ts` salvo la poda puntual de §8.1.
- `EVA_DISABLED_MODULES` — sigue siendo la palanca de incidentes del operador, por encima de todo
  (§5, jerarquía de gates).
- RLS y entitlements de datos en Supabase — cero cambio (§5, regla central del gate).
- `team_feature_prefs` sigue mandando sobre el pool de team — sin cambio de precedencia.

---

## 9. Criterios de aceptación por wave

### W1 · Interruptores de verdad (4–5 d-a)
- [ ] `/api/mobile/config` expone `featurePrefs.domains` con los 5 booleans; `nutritionEnabled`
      sigue presente (espejo) y coincide con `domains.nutrition`.
- [ ] `CoachMobileChrome.tsx` arma `disabledDomains` desde los 5 booleans, no desde un `Set` de un
      elemento — verificable apagando `training` en Funciones y confirmando que el tile
      correspondiente desaparece de la barra RN sin tocar código.
- [ ] Cada uno de los 4 dominios sin guard hoy (`training` web/RN, `nutrition-v2` web, `nutrition`
      RN — tabla §4.6/§B.9 de `ficha-y-gates.md`) tiene un `resolveXDomainEnabled` + redirect (web)
      o `useDomainGuard` + `DomainOffNotice` (RN) — probado con test de contrato (dominio OFF ⇒
      ruta no sirve contenido, redirige/avisa).
- [ ] La ficha del alumno (web y RN) filtra las 3 pestañas sin gate hoy (Entreno, Programa,
      Nutrición) por su dominio — apagar `nutrition` en Funciones oculta la pestaña Nutrición de la
      ficha de TODOS los alumnos de ese coach.
- [ ] `FEATURE_PREFS_ENABLED` (Edge Config) se retira del código — `readFeaturePrefsEnabled()`
      deja de invocarse; test de regresión confirma que el comportamiento con el flag ausente sigue
      siendo el mismo que con el flag ON (siempre-on, no hay diferencia observable).
- [ ] `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm test` (paquetes tocados) y
      `pnpm --filter web test` (si aplica) verdes.

### W2 · Navegación (2–3 d-a)
- [ ] `nav.ts:114-115` (cardio/movement) pierde el `entitlement`, deja solo `featureDomain` (R2,
      adelantado desde W4) — extiende `nav.test.ts`, no lo reemplaza. Verificable: coach con
      `cardio` prendido en Funciones ve la entrada, aunque nunca haya «comprado» el módulo viejo.
- [ ] `groupNavItems()` (nombre canónico OUTLINE §3) reemplaza `splitForSidebar` en el sidebar web
      — grupos Principal/Tu trabajo/Gestión visibles, con Cardio/Movimiento pintando completo desde
      este mismo tren (el gate doble ya se podó en el ítem anterior de este wave, no hace falta
      esperar a W4).
- [ ] Barra RN: tab `more` (label «Más», ruta `apps/mobile/app/coach/(tabs)/more.tsx`) reemplaza el
      `slice(0,5)` ciego — verificable: un coach `coach_team` con 6+ ítems visibles ve `Equipo`
      dentro de «Más», nunca desaparecido.
- [ ] Qué dos dominios entran fijos en la barra (fuera de Inicio/Alumnos/Más) se deriva de
      `PERSONA_DOMAIN_ORDER` (R5): los dominios ON de la persona del coach, en el orden que ya
      declara `resolvePersonaPrefs` (`packages/feature-prefs/index.ts:429`) — se toman los 2
      primeros ON. No es decisión del owner, es un default razonable y reversible; se afina con QA
      device, no bloquea el cierre de W2.
- [ ] **Caso «coach apaga los 5 dominios»**: la barra queda Inicio/Alumnos/Más (sin dominio fijo) y
      el sidebar web pierde el grupo «Tu trabajo» entero (grupo vacío, no se pinta). Ninguna
      pantalla queda rota, pero el coach no recibe copy explicando por qué su panel se vació — W2
      agrega un aviso in-app (banner o estado vacío en el dashboard) del tipo «Prendé al menos un
      dominio en Funciones para ver tu panel», con CTA a Funciones. D3/BRIEF §5.2 exige cubrir qué
      pasa cuando algo queda apagado; este es el caso límite que faltaba (hallazgo del jefe).
- [ ] Test de contrato que cruce `MOBILE_TAB_KEYS` (RN) con el registro web (`nav.test.ts`
      existente se extiende, no se reemplaza — CORRECCIONES #2) para que el drift de paridad no
      vuelva a pasar sin que CI lo marque.
- [ ] FAB del dashboard (si aplica) respeta dominios apagados — no ofrece accesos rápidos a un
      dominio OFF.

### W3 · Funciones todo-en-una (3–4 d-a)
- [ ] `apps/web/src/app/coach/settings/funciones/page.tsx` absorbe: especialidad arriba, switches
      de los 5 dominios, detalle de secciones de nutrición, filas «Abrir» por dominio. Título pasa
      de «Mi panel» a «Funciones» (`metadata.title`, `<h1>`).
  Fecha en `docs/status/MOBILE_PARITY.md` cuando cierre; nombre de pantalla y de commit coherentes
  con «Funciones», no «Mi panel», salvo el redirect legacy.
- [ ] `apps/mobile/app/coach/settings/funciones.tsx` — pantalla NUEVA equivalente. `mi-panel.tsx` y
      `features.tsx` quedan como archivos que solo redirigen a `funciones.tsx` (no se borran de
      golpe: deep links viejos y push notifications siguen apuntando ahí).
- [ ] `/coach/settings/modules` (web) y `/coach/modules` (RN, si existe con ese nombre — verificar
      al ejecutar) redirigen a Funciones. `/coach/tools` redirige a Funciones (las filas «Abrir»
      cubren su función).
- [ ] Opciones (hub) actualiza su card/enlace a apuntar a Funciones, no a Módulos ni a Mi panel.
- [ ] Ningún deep link o push existente a las rutas viejas rompe (verificado con la allowlist
      `eva://` y los links de correos transaccionales, per OUTLINE §5).

### W4 · Todo-incluido + demolición (2–3 d-a)
- [ ] `micros_advanced` y `goals_bodycomp` son secciones normales (`requiresModule: null`),
      verificable: un coach Free con esas secciones prendidas en Funciones las ve funcionando sin
      ningún candado ni mensaje de upgrade.
- [ ] Copy de upsell (`ModulesForm.tsx`, `ModuleOffNotice` web+RN, `features.tsx` RN línea 173)
      reemplazado; grep de `"Con plan pago"|"Incluido en tu plan"|"Ver planes"` sobre
      `apps/web/src/app/coach/settings` y `apps/mobile/app/coach/settings` da 0 resultados post-W4.
  Excepción a preservar: el copy real de precios en `/coach/subscription` (cupo, no módulos) sigue
  vivo — esta ola no toca esa pantalla.
- [ ] `TIER_CAPABILITIES` podado: solo `canUseAdvancedReports` se retira (verificado 01-09);
      `showsEvaBadge`, las capacidades de cupo/branding y las 3 que siguen gateando rutas
      (`canUseNutrition`, `canImportClients`, `canCreateCustomExercises`) quedan intactas;
      cualquier capacidad ligada a un `ModuleKey` de pago se retira o se documenta por qué sigue
      (si sobrevive alguna razón legítima no cubierta por esta SPEC, se anota como pregunta abierta,
      §10).
- [ ] Demoliciones (§8.1) ejecutadas: `check-ins.tsx`, `CoachSearchPalette.tsx`, `FacturacionTab.tsx`
      + tipo `ClientTab` sin `'facturacion'`, deltas KPI hardcodeados, flags muertos confirmados
      ausentes o retirados.
- [ ] Redirects legacy (W3) siguen funcionando después de la poda — no se borran junto con el
      código que reemplazan.
- [ ] `docs/status/MOBILE_PARITY.md` y `docs/status/CURRENT.md` actualizados con el cierre de la
      ola.

---

## 10. Riesgos y regresiones (de OUTLINE §5) + preguntas abiertas al owner

### Riesgos a vigilar por los críticos de la siguiente fase del megaplan

- **Gate de visibilidad ≠ autorización**: cualquier implementación que empiece a tocar RLS o
  entitlements de datos «para estar seguros» rompe la regla central (§5) y probablemente rompe al
  alumno — D9-A depende de que el gate de dominio NUNCA alcance las tablas de datos del alumno.
- **Deep links y push a rutas apagadas**: probar la allowlist `eva://` y los links de correos
  transaccionales contra un dominio OFF — el resultado esperado es redirect con aviso, nunca crash
  ni pantalla en blanco.
- **Guía de inicio / alumno demo**: los pasos que apuntan a un dominio que la persona del coach
  apagó por default deben seguir el filtro existente por persona — verificar que ningún CTA quede
  roto (link a una pantalla que ahora redirige).
- **Paridad web↔RN**: el test de contrato de `MOBILE_TAB_KEYS` (W2) es la defensa concreta contra
  el drift que ya pasó una vez (BRIEF, incidente del `slice(0,5)`).
- **OTA / apps viejas**: mientras `nutritionEnabled` siga de espejo (§6), un cliente en un binario
  viejo (sin OTA aplicada) sigue funcionando; retirarlo antes de la versión pactada rompe esas
  instalaciones.
- **Team/enterprise**: `team_feature_prefs` sigue mandando en el pool — no confundir con
  `coach_feature_prefs` individual al escribir los `resolveXDomainEnabled` nuevos (el molde de
  `resolveNutritionDomainEnabled` ya resuelve esto, replicar exacto). Enterprise no entra a
  Funciones — los redirects actuales para ese contexto se respetan sin tocar.
- **Retiro de `FEATURE_PREFS_ENABLED` sin cuantificar filas inertes (riesgo·seguridad)**: ver
  precondición en §6.3 — confirmar valor vivo de Edge Config y contar filas `_enabled:false`
  afectadas antes de W1.10, no asumir que «está estable en prod».
- **Coach apaga los 5 dominios a la vez (riesgo·producto-ux)**: caso límite sin copy hoy — ver
  ítem nuevo en §9 W2 («Caso "coach apaga los 5 dominios"»). D3/BRIEF §5.2 exige cubrir qué pasa
  cuando algo queda apagado; sin el aviso de ese ítem, el coach ve un panel vacío sin explicación.
- **Orden W2/W4 — resuelto (R2)**: el retiro del `entitlement` doble de `nav.ts:114-115` se adelanta
  a W2 (ver §8.1 y §9 W2); W4 conserva el resto del todo-incluido. El orden de ejecución queda
  W1→W2→W3→W4, igual al orden de numeración — ya no hay wave «a medias».

### Decisiones de diseño conscientes (post-críticos, RESOLUCIONES-2 — no son bugs)

- **R12 · Dos UX de «apagado», un solo copy**: rutas de dominio puro (training/nutrition) redirigen
  al dashboard con banner `notice=domain_off`; pantallas con patrón `status`
  (cardio/movement/bodycomp) muestran `DomainOffNotice` inline conservando el chasis de la página.
  El copy es idéntico en ambos: «Esta función está apagada — préndela en Opciones › Funciones».
- **R13 · Doble camino a Funciones es intencional**: la hoja «Más» (RN) lleva acceso directo a
  Funciones (shortcut) y el hub Opciones conserva su fila (hub completo). Patrón shortcut estándar.
- **R14 · Blast radius medido en LIVE (31-08, query read-only)**: `coach_feature_prefs` con
  `_enabled=false` — cardio 26/40, bodycomp 26/40, movement 24/40, nutrition 21/55, training 1/40
  (`team_feature_prefs`: 0 apagados). Las preferencias YA expresan elección real de especialidad;
  W1 las honra. Consecuencia visible: esos coaches pierden las puertas laterales que hoy saltan el
  gate (tools/ficha/deep link). QA de W1 muestrea 2-3 coaches reales apagados ANTES del deploy; el
  aviso siempre dice cómo re-prender. El retiro de `FEATURE_PREFS_ENABLED` activa el mismo conjunto
  de filas en rutas y `/api/mobile/config` (el nav web ya ignoraba el flag): mismo QA.

### Preguntas abiertas al owner (no bloquean escribir esta SPEC, sí bloquean ejecutar)

1. ~~¿W2 espera a W4?~~ — **cerrada (R2)**: el gate doble se poda en W2 mismo, el sidebar agrupado
   pinta las 5 entradas desde su propio tren.
2. ~~Deltas KPI y flags muertos (§8.1)~~ — **parcialmente cerrada (R3, R9)**: `NEXT_PUBLIC_FF_WEEKLY_PLAN`
   y `NEXT_PUBLIC_FF_DETAILED_LOGGING` SÍ existen — el Grep original buscó en `apps/mobile` cuando
   viven en `apps/web/src/lib/feature-flags.ts:15,17` (+ test `feature-flags.test.ts:23`); W4 los
   demuele en esa ruta. Deltas KPI: el jefe resuelve alcance acotado — W4 solo demuele el badge
   hardcodeado («+1 esta semana»); calcular el delta real queda en el backlog MIDE, fuera de esta
   ola (no ajusta d-a).
3. ~~Botón «Composición» faltante en RN~~ — **cerrada, sin trabajo**: verificación directa de
   `OverviewTab.tsx:840` confirma que el botón ya existe (`moduleFlags.bodycomp ? {...} : null`,
   mismo patrón que cardio/movement). El hallazgo de drift era falso; no se agrega tarea a W1.
