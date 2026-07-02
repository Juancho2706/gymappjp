# Auditoría del sistema de módulos de pago del coach (EVA)

Auditoría de código del 2026-06-24. Trazada siguiendo imports desde `entitlements.service.ts`.

Los 4 módulos de pago son add-ons: `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges` (comercialmente "Nutrición Pro"). La fuente de verdad de las keys es `MODULE_KEYS` en `apps/web/src/services/entitlements.service.ts:19-24`. El catálogo comercial (label/pitch/superficies/precio) vive en el paquete puro `@eva/module-catalog` (`packages/module-catalog/catalog.ts`), con un test que cruza sus keys contra `MODULE_KEYS` y falla si divergen.

---

## 1. Cómo funcionan los módulos

El acceso efectivo a un módulo se resuelve por **capas**. Aplican en este orden:

### Capa A — Tier (`canUseX`)
No existe en estos 4 módulos un gate `canUseX` por tier de suscripción. El gate de tier vive en `SUBSCRIPTION_BLOCKED_STATUSES`: si el status del coach está bloqueado (`past_due`/`expired`/etc.), `getVisibleNavItems` colapsa TODO el nav a un único item "Reactivar" (`coach-nav.ts:111-115`) — es decir, un coach moroso no ve ningún módulo porque no ve ningún nav. Pero no hay un piso de tier ("solo Pro+ puede comprar cardio"): el gate de capability es directamente el entitlement de módulo (capa B). El tier sí se lee, pero solo como **telemetría de intención de compra** (`tier` se pasa a `module_interest_cta_clicked` en `ModulesForm.tsx`).

### Capa B — Entitlement de módulo (la capa que decide acceso)
La verdad de "este módulo está activo" vive en una columna `jsonb` `enabled_modules` (`Partial<Record<ModuleKey, boolean>>`, default `{}` = todo OFF):

- **Standalone**: `coaches.enabled_modules`
- **Pool/team**: `teams.enabled_modules` (regla LOCKED: *el pool gana, no es una unión* — los módulos del team NO se filtran a los clientes standalone personales del coach, y viceversa).

La resolución es **por contexto del recurso**, no por el coach:

```
hasModule(db, key, ctx):                       // entitlements.service.ts:69-82
  if isModuleKilledByOperator(key) -> false    // kill-switch de plataforma (capa B')
  if ctx.teamId  -> teams.enabled_modules[key] === true   (el pool decide)
  else if ctx.coachId -> coaches.enabled_modules[key] === true
  else -> false
```

`assertModule` (`:85-93`) es el guard que lanza (`throw new Error('Modulo no habilitado: …')`) y se invoca al tope de cada `_data`/RSC/action del módulo. **Este es el techo real de seguridad**: el nav/UI es solo espejo visual.

**Kill-switch de operador (capa B', por encima del entitlement del tenant):** `EVA_DISABLED_MODULES="cardio,body_composition"` (env var, requiere redeploy) apaga el módulo para TODOS aunque el team/coach lo tenga ON (`isModuleKilledByOperator`, `:36-40`). En `hasModule` cortocircuita a `false` antes de mirar la DB.

### Capa C — Feature-prefs (preferencia del coach, ortogonal al billing)
Algunos módulos tienen además una capa de **visibilidad/preferencia** (`featureDomain` en el nav, `sectionFlags` en el builder). Es ORTOGONAL al entitlement: el coach puede tener el módulo comprado (capability) pero apagar su master switch de dominio (preferencia) y entonces se oculta. Aplica notablemente a `nutrition_exchanges`, que vive bajo el dominio `nutrition` de feature-prefs:
- En el nav: una entrada con `featureDomain` en `disabledDomains` se oculta (`coach-nav.ts:131-132`).
- En el builder: `exchangeEnabled = !!exchange && mode === 'client-plan' && microsAdvancedVisible`, donde `microsAdvancedVisible` = `sectionFlags.micros_advanced === true` (entitlement AND preferencia). (`PlanBuilder.tsx:112-118`).

### Compra-only (escritura solo service-role)
Settings > Módulos es un **catálogo READ-ONLY**. No hay switches ni guardado: el coach NO se auto-activa módulos (`ModulesForm.tsx` comentario `:21-28`, y `modules.queries.ts:48-54`). La escritura de `enabled_modules` quedó SOLO en service-role:
- Pago self-service materializado por el webhook de MercadoPago (vía tabla `coach_addons` → trigger D1 que recomputa `coaches.enabled_modules`).
- Cortesía del CEO (override admin, `admin_grant` price 0).

El CTA del catálogo es por contexto (`ModulesForm.tsx` `ModuleCta`):
- Standalone + `SELF_SERVICE_ADDONS_ENABLED` ON → "Desbloquear" → `/coach/subscription#addons`.
- Standalone + flag OFF → mailto `contacto@eva-app.cl`.
- Team gestor → mailto "Conversemos".
- Team miembro → "Pídelo al owner de tu equipo" (sin link).

---

## 2. DÓNDE SE EJECUTA / ACCEDE CADA MÓDULO HOY (clave del informe)

Confirmado contra el código. Resumen:

| Módulo | Tipo | Es nav item? | Entrada (superficie) | Cómo elige al alumno |
|---|---|---|---|---|
| `cardio` | Por-alumno + transversal | **SÍ** (top-level) | `/coach/cardio` (hub) | Selector dentro del hub |
| `movement_assessment` | Por-alumno | **SÍ** (top-level) | `/coach/movement` (hub) | Lista de alumnos en el hub |
| `body_composition` | Por-alumno | **NO** | Ficha del alumno → `/coach/clients/[clientId]/bodycomp` | El alumno YA está fijado por la ficha |
| `nutrition_exchanges` | Capa dentro del plan | **NO** | Toggle dentro del PlanBuilder (modo client-plan) | El alumno YA está fijado por el plan |

### Cardio (`cardio`)
- **Nav top-level**: `coach-nav.ts:72` — `{ key:'cardio', href:'/coach/cardio', entitlement:'cardio', contexts:['coach_standalone','coach_team'] }`. Visible SOLO con el entitlement ON.
- **Hub**: `/coach/cardio/page.tsx` → gating en `cardio.queries.ts:getCardioPageData` (`assertModule('cardio', …)` por workspace activo; enterprise = OFF). Si OFF → `<ModuleOffNotice moduleKey="cardio" />`. El hub renderiza `CardioToolsClient` con la **lista completa de clientes** (`listCardioClients`) — calculadoras de zonas/pace/intervalos transversales + selector de alumno.
- **Por-alumno**: `/coach/cardio/[clientId]/page.tsx` → `getCardioClientData` (mismo `assertModule` + scope 3-vías). Edita el perfil cardio del alumno (fecha nacimiento, FC reposo, FCmax override, ref 5k) → deriva zonas Z1–Z5. Si OFF → `redirect('/coach/cardio')`.
- **Naturaleza**: es **mixto** — tiene utilidades transversales (calculadoras en el hub) Y una vista por-alumno. La elección de alumno ocurre dentro del hub.

### Movimiento (`movement_assessment`)
- **Nav top-level**: `coach-nav.ts:73` — `{ key:'movement', href:'/coach/movement', entitlement:'movement_assessment', contexts:['coach_standalone','coach_team'] }`. Visible SOLO con el entitlement ON.
- **Hub (lista de alumnos)**: `/coach/movement/page.tsx` → `getMovementHub` (`assertModule('movement_assessment')`). Si OFF → `ModuleOffNotice`. Renderiza `MovementHubList` (lista de alumnos del coach/pool).
- **Reporte por-alumno**: `/coach/movement/[clientId]/page.tsx` → `getMovementClientReport`. (El wizard de nueva evaluación — `/[clientId]/new` — usa `getMovementWizard`; el service ya validó scope 3-vías + `assertModule` en contexto del alumno.)
- **Naturaleza**: **puro por-alumno** (screening de 7 patrones + reporte semáforo + evolución). El alumno se elige desde la lista del hub.

### Composición corporal (`body_composition`)
- **NO tiene item de nav** (confirmado: no aparece en `NAV_MODULES`). No hay entrada top-level.
- **Entrada**: desde la **FICHA del alumno**. `clients/[clientId]/page.tsx:185-224` (`ModuleLinksRow`) hace `Promise.all` de `hasModule` para cardio/movement/bodycomp y, si bodycomp está ON, renderiza un chip-link `{ href:'/coach/clients/${clientId}/bodycomp', label:'Composición corporal', Icon: Scale }`. (Espejo visual; el gate real es `assertModule` en la página.)
- **Página**: `/coach/clients/[clientId]/bodycomp/page.tsx` → `getClientBodyComposition` (`assertModule('body_composition')` + write-access). Si OFF → `ModuleOffNotice`; alumno inexistente/sin acceso → `notFound()` seco. Renderiza `BodyCompositionTabB6b` (pestañas BIA / ISAK).
- **Naturaleza**: **puro por-alumno** (antropometría ISAK + bioimpedancia, historial por alumno). El alumno YA viene fijado por la ruta de la ficha — no hay selector propio. **Importante**: el mismo `ModuleLinksRow` de la ficha también ofrece accesos a cardio y movement por-alumno (`/coach/cardio/[clientId]`, `/coach/movement/[clientId]`), así que la ficha ya es hoy un punto de entrada por-alumno para 3 de los 4 módulos.

### Intercambios / Nutrición Pro (`nutrition_exchanges`)
- **NO es nav item ni pantalla propia de trabajo.** Es una **CAPA dentro del PlanBuilder de nutrición**, solo en modo `client-plan` (plan de un alumno concreto).
- **Dónde vive realmente**: `/coach/nutrition-plans/client/[clientId]/page.tsx` arma el bundle `exchange` (vía `getHasExchangesModule` → `hasModule`) y lo pasa a `<PlanBuilder mode="client-plan" … exchange={…} sectionFlags={…} />`. Dentro, `ExchangeModePanel.tsx` aparece (`PlanBuilder.tsx:623`) con el toggle **Gramos ↔ Porciones**, totales derivados vs objetivo, variantes de día y PDF branded. El gate efectivo: `exchangeEnabled = !!exchange && mode === 'client-plan' && microsAdvancedVisible` (`PlanBuilder.tsx:118`).
- **Ruta `/coach/nutrition-plans/exchanges/page.tsx`**: NO es una pantalla de trabajo. Es solo una "landing" del módulo: si OFF → `ModuleOffNotice`; si ON → `redirect('/coach/nutrition-plans')`. Existe para que un deep-link al módulo apagado muestre aviso amable en vez de error seco. (`exchanges/page.tsx:11-39`).
- **Naturaleza**: **capa de plan, NO herramienta por-alumno autónoma**. El alumno YA viene fijado porque el modo intercambios solo existe dentro del plan de ESE alumno (no en plantillas: `mode === 'client-plan'`). No tiene ni puede tener un launcher con selector de alumno: vive incrustado en el editor de plan.

---

## 3. La inconsistencia actual

Las 4 superficies de los módulos viven en lugares estructuralmente DISTINTOS, sin un patrón único:

1. **Cardio y Movimiento** = items de nav top-level que **aparecen/desaparecen** según el entitlement (`item.entitlement && enabledModules?.[…] !== true → filtrado` en `getVisibleNavItems`). Un coach sin el add-on simplemente no ve el ítem; al comprarlo, aparece. Esto hace que el menú "respire" según lo que el coach pagó.
2. **Composición corporal** = SIN nav; entra como **chip-link dentro de la ficha del alumno** (`ModuleLinksRow`).
3. **Intercambios (Nutrición Pro)** = SIN nav y SIN pantalla; es una **capa/toggle incrustado en el PlanBuilder** del plan de un alumno.

Y además el render del nav difiere por plataforma:

- **Desktop (`CoachSidebar.tsx`)**: `splitNavItems` separa `core` (sin `entitlement`) de `modules` (con `entitlement`). Los módulos comprados se agrupan al final, bajo un **divisor "MÓDULOS"** (`CoachSidebar.tsx:334-356`). Si no hay módulos comprados, el divisor no se renderiza (grupo gratis vacío).
- **Mobile web (`CoachSidebar.tsx`)**: el patrón real es **"4 primarios + Más"**, NO un scroll horizontal plano. Los primarios son fijos por key — `MOBILE_PRIMARY_KEYS = ['dashboard','clients','programs','nutrition']` (`:58`). Todo lo demás (Opciones, Soporte, **cardio, movement**, Equipo) cae en el overflow detrás del botón **"Más"** (sheet en `grid-cols-2`, `:448-449`). Es decir, en mobile los módulos comprados NO están contiguos al final de un scroll horizontal: están escondidos dentro del sheet "Más".

> **Corrección al supuesto del encargo:** el comentario en `coach-nav.ts:67-73` describe la *intención de diseño* ("en mobile el bottom bar renderiza plano por orden de registro ⇒ los módulos quedan contiguos al final del scroll horizontal"). Pero el componente real (`CoachSidebar.tsx`) NO implementa eso: implementa "4 + Más", y cardio/movement caen en el overflow "Más", no en un scroll horizontal. El comentario del registro está desalineado con la implementación. (En la app RN `apps/mobile` los 4 módulos de pago aún no están implementados — 0% de paridad — así que ahí no hay bottom bar de módulos en absoluto.)

**Síntoma de la inconsistencia:** el coach no tiene un lugar mental único de "mis herramientas avanzadas". Para cardio/movement va al menú (si los compró); para composición corporal tiene que entrar a un alumno; para intercambios tiene que abrir el plan de un alumno y togglear. Tres modelos de navegación distintos para cuatro add-ons del mismo "nivel".

---

## 4. Implicaciones para un rediseño a 5 slots de nav fijos

Rediseño propuesto: nav con 5 slots FIJOS (Inicio, Alumnos, Programas, Nutrición, Opciones). Implicaciones por módulo:

### Qué pasa con cardio/movement (hoy nav items)
Hoy ocupan slots de nav variables (aparecen/desaparecen). Con 5 slots fijos **dejan de ser items de nav**. Hay que reubicar su entrada. Son ambos herramientas **por-alumno**:
- `movement_assessment` es 100% por-alumno (hub = lista de alumnos → reporte/wizard por alumno).
- `cardio` es por-alumno con un extra transversal (calculadoras del hub que no necesitan alumno), pero su valor central (perfil cardio + zonas) es por-alumno.

Ambos encajan en un **launcher de herramientas con selección de alumno**: una entrada (p. ej. dentro de "Alumnos" o como sección de la ficha) que lista las herramientas avanzadas activas y pide elegir alumno. Esto es de hecho coherente con lo que YA existe: `ModuleLinksRow` en la ficha ya ofrece "Perfil cardio" y "Screening de movimiento" por-alumno (`clients/[clientId]/page.tsx:201-205`). El rediseño consolidaría ese patrón en vez de mantener el doble acceso (nav + ficha).

Nota: el extra transversal de cardio (calculadoras sin alumno) es el único pedazo que no es estrictamente por-alumno; un launcher tendría que dejarlo accesible sin selección, o moverlo a una sub-pestaña del hub.

### Qué módulos son "herramientas por-alumno" (encajan en el launcher)
- **`cardio`** → sí (con la salvedad de las calculadoras transversales).
- **`movement_assessment`** → sí, encaje limpio.
- **`body_composition`** → sí, ya ES por-alumno y ya entra desde la ficha (`/coach/clients/[clientId]/bodycomp`). Ya está en el patrón correcto; el launcher solo lo unificaría con cardio/movement.

Estos tres comparten la forma "elegir alumno → abrir herramienta", y los tres ya conviven en `ModuleLinksRow`. Son los candidatos naturales de un launcher por-alumno.

### Cuál NO encaja en el launcher (vive en el plan)
- **`nutrition_exchanges` (Nutrición Pro)** → **NO** es una herramienta por-alumno autónoma. Es una **capa del plan de nutrición**: el modo Intercambios solo existe dentro del `PlanBuilder` en `mode === 'client-plan'` (`PlanBuilder.tsx:118`), gobernado además por la sección `micros_advanced` de feature-prefs. No tiene (ni debería tener) selector de alumno propio, porque el alumno ya está fijado por el plan que se está editando. Su hogar natural es **Nutrición → plan del alumno**, no un launcher de herramientas. Meterlo en un launcher rompería su modelo (no hay "abrir intercambios para un alumno" fuera de su plan). La ruta `/coach/nutrition-plans/exchanges` solo es un aviso/redirect, no una pantalla a la que mover.

### Resumen para el rediseño
- 3 módulos (cardio, movement, bodycomp) = herramientas **por-alumno** → launcher con selección de alumno (ya prefigurado por `ModuleLinksRow` de la ficha). Cardio arrastra calculadoras transversales como caso especial.
- 1 módulo (nutrition_exchanges) = **capa del plan** → se queda dentro de Nutrición / PlanBuilder, fuera del launcher.
- El gate sigue siendo `assertModule` server-side en cada superficie; cualquier launcher nuevo es solo espejo visual (mismo principio que el nav hoy). El divisor "MÓDULOS" del desktop y el overflow "Más" del mobile desaparecen al sacar cardio/movement del nav.

---

## Archivos clave (rutas absolutas)

- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\services\entitlements.service.ts` — `MODULE_KEYS`, `hasModule`, `assertModule`, kill-switch.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\components\coach\coach-nav.ts` — `NAV_MODULES`, `getVisibleNavItems`, `splitNavItems` (espejo visual del entitlement).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\components\coach\CoachSidebar.tsx` — render desktop (divisor "MÓDULOS", `:334-356`) y mobile ("4 + Más", `:58`, `:110-118`, `:482-503`).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\settings\modules\page.tsx` + `_components\ModulesForm.tsx` + `_data\modules.queries.ts` — catálogo read-only (compra-only).
- `D:\Proyectos\Antigravity\gymappjp\packages\module-catalog\catalog.ts` — copy comercial canónico de los 4 módulos.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\cardio\page.tsx` + `[clientId]\page.tsx` + `_data\cardio.queries.ts` — hub + por-alumno.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\movement\page.tsx` + `[clientId]\page.tsx` + `_data\movement.queries.ts` — hub + por-alumno.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\clients\[clientId]\bodycomp\page.tsx` — composición corporal (entra desde la ficha).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\clients\[clientId]\page.tsx:185-224` — `ModuleLinksRow` (accesos por-alumno cardio/movement/bodycomp en la ficha).
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\nutrition-plans\_components\PlanBuilder\ExchangeModePanel.tsx` + `PlanBuilder.tsx:112-118,623` — capa intercambios.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\nutrition-plans\client\[clientId]\page.tsx` — monta PlanBuilder client-plan con el bundle exchange.
- `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\nutrition-plans\exchanges\page.tsx` — landing/redirect del módulo (no pantalla de trabajo).
