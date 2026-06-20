# Propuesta de diseño — Visibilidad de nutrición y preferencias del coach (EVA)

## 1. El problema, en simple

EVA está sumando muchas piezas de nutrición: micros (sodio, fibra, azúcar, grasas), método del plato, objetivos por composición corporal, recetas, lista de compras, hábitos, registro fuera de plan, notas. **Cada pieza es valiosa para algún coach, pero ninguna lo es para todos.**

Hay dos tipos de coach en EVA:
- **El coach de entrenamiento** (sin estudios de nutrición). Quiere lo básico: un plan, comidas, macros, y ver si el alumno cumple. Si le llenamos la pantalla de sodio, intercambios y composición corporal, se siente abrumado, no lo usa, y peor: **se lo pasa al alumno**, que también se abruma.
- **La nutricionista / coach con credenciales.** Quiere todo: micros finos, intercambios, plato, objetivos clínicos. Para ella, esconder eso sería castrar el producto.

Si mostramos todo a todos, perdemos a los dos: el simple se ahoga, y el avanzado no encuentra valor diferenciado. **La pantalla de nutrición tiene que verse distinta según quién la usa** — tanto en la ficha del alumno (vista coach) como en la app del alumno.

Por qué importa ahora: el overhaul está agregando features rápido. Si no construimos el sistema de visibilidad **antes** de seguir sumando, cada feature nueva nace encendida para todos y reconstruimos el "kitchen sink" que justamente queremos evitar (es un patrón estructural documentado de *feature bloat*: "config overload" y "competitor-parity paranoia" — *hellopm.co/feature-bloat*, *featurebloat.com*).

---

## 2. El modelo mental: ENTITLEMENT vs PREFERENCE (la distinción clave)

Hay **dos preguntas distintas**, y casi todos los productos las confunden. EVA no debe.

| | **ENTITLEMENT** (¿PUEDE?) | **PREFERENCE** (¿QUIERE mostrarlo?) |
|---|---|---|
| Pregunta | ¿El coach pagó / tiene derecho a esta capacidad? | ¿El coach eligió mostrar esta sección? |
| Dueño | Negocio / billing | El coach (personalización) |
| Dónde vive hoy | `coaches.enabled_modules` + `coach_addons` (módulo `nutrition_exchanges` = "Nutrición Pro"), escritura **solo service-role**, sincronizada por el trigger D1 | **No existe todavía** — es lo que vamos a construir |
| Se puede revertir | No por el coach (es plata) | Sí, instantáneo, sin cobro |

**La regla de oro: una sección se muestra solo si AMBOS son verdaderos.**

```
visible = ENTITLED (puede)  AND  ENABLED (quiere)
```

El consenso 2026 (Stigg, Schematic, WorkOS) es exactamente este: *entitlements responden "¿le está permitido?"; las preferences responden "¿lo quiere ver?"*. La preference **solo puede reducir** lo que ya está permitido — **nunca ampliar** acceso. Si la preference pudiera dar acceso, sería un bug de paywall: el alumno se baja el JS, flipea el toggle y ve features pagadas gratis. Por eso el entitlement **siempre se resuelve server-side** (ya lo hacés en `getNutritionProEnabledForClient`, fail-closed — perfecto, esa es la base a generalizar).

**Ejemplos concretos (esto aclara todo):**

- **Macros + adherencia** → no requiere Pro (free), siempre ON. No es toggleable: es el corazón.
- **Micros base (sodio, fibra)** → free (no requiere Pro), pero **OFF por default**. Un coach de entrenamiento nunca los ve a menos que los encienda. Una nutricionista los prende en 1 clic sin pagar nada extra.
- **Micros avanzados (azúcar, grasas sat/insat)** → requiere Pro **AND** que el coach los encienda. Si tiene Pro pero no los prende → no se ven. Si los prende pero no tiene Pro → no se ven (y mostramos el upsell). Esto **ya está modelado** en `getPlanDayMicros` (separa sodio/fibra base de azúcar/grasas Pro) — solo falta el toggle de preference encima.
- **Objetivos por composición corporal** → requiere Pro AND enabled.

> **Default crítico (regla 2026, Stigg):** cuando se concede un entitlement nuevo (el coach compra Nutrición Pro), las preferences de sus features **arrancan en ON**, para que "pagar simplemente funcione" sin un segundo opt-in. Pagar y *además* tener que ir a prender cada toggle es fricción innecesaria.

---

## 3. La solución recomendada: PRESET + TOGGLES granulares

No hagas que el coach configure 9 toggles a mano (50 toggles en una pantalla congela al usuario — *uxpin.com*, *featurebloat.com*). Tampoco le des solo un modo rígido (algunos quieren control fino). La respuesta del research es **las dos cosas, en capas**:

### Capa 1 — PRESET (modo): el 90% de los coaches no toca nada más

Tres modos opinados que **setean los defaults** de todos los toggles de una:

- **Básico** — solo el core (plan, comidas, macros, adherencia). Todo lo opcional OFF. Para el coach de entrenamiento.
- **Intermedio** — core + micros base (sodio/fibra) + método del plato + recetas/lista de compras + hábitos. Nada que requiera Pro. Para el coach que "le mete un poco" sin ser nutricionista.
- **Profesional** — todo ON, incluido lo Pro (micros avanzados, objetivos por composición). *Solo tiene efecto real en lo Pro si además tiene el entitlement* — el preset setea la **intención**, el entitlement decide si se ve.

Esto es exactamente el patrón **"Simple es el default, Advanced es opt-in"** (RethinkDNS Simple vs Advanced; *NN/g*) + **preset persona-based** (Notion work/personal/school, Canva por caso de uso): elegir el modo carga un set curado en vez de una pared de opciones.

### Capa 2 — TOGGLES granulares (override por feature): el 10% que quiere afinar

Debajo del preset, una lista de toggles por sección con badge **Base** / **Pro**. El preset los pre-marca; el coach puede prender/apagar individualmente. Esto es el patrón de Everfit (lista plana de switches: training, meal plan, food journal, macros, hábitos…) — el más directamente aplicable a EVA.

Elegir un toggle a mano **no rompe el preset**: simplemente el coach pasa a "Profesional · personalizado" (como Linear: "Set as default" + overrides personales encima). Siempre hay **"Restaurar valores del modo"** como escape hatch.

> Inspiración citada: **Everfit** (per-client feature toggles con defaults de workspace), **Linear** (preset/default + override + reset), **RethinkDNS** (Simple/Advanced), **Kahunas** (control fino: esconder micros específicos de la vista del alumno — esto valida el override por-alumno de la Fase 2).

---

## 4. Tabla de secciones de nutrición

Convención: **Core = siempre ON, no toggleable.** Todo lo demás es opcional; lo avanzado arranca **OFF**.

| Sección | Core / Opcional | Default | Toggleable | Requiere Pro | Nota |
|---|---|---|---|---|---|
| Plan + comidas | Core | ON | No | No | El corazón. Si no hay plan asignado, la pestaña se oculta sola (presence-driven, como Trainerize). |
| Macros (4 macros + barras) | Core | ON | No | No | `MacroBar` / rings. Subset de macros visibles = Fase 2 (estilo Kahunas). |
| Adherencia | Core | ON | No | No | Motor canónico `computeNutritionAdherence`. |
| Micros base (sodio, fibra) | Opcional | **OFF** | Sí | No | Free pero apagado por default. `getPlanDayMicros` ya los separa. |
| Micros avanzados (azúcar, grasas sat/insat) | Opcional | **OFF** | Sí | **Sí** | `proEnabled` actual. Se ve solo con Pro AND enabled. |
| Método del plato (proporcional) | Opcional | **OFF** | Sí | No | `platePropFromMacros` ya existe (puro). |
| Objetivos avanzados (composición corporal) | Opcional | **OFF** | Sí | **Sí** | Liga con `body_composition`/Nutrición Pro. |
| Recetas / ideas | Opcional | **OFF** | Sí | No | — |
| Lista de compras | Opcional | **OFF** | Sí | No | — |
| Hábitos | Opcional | **OFF** | Sí | No | — |
| Registro fuera de plan | Opcional | **OFF** | Sí | No | Off-plan logging. |
| Notas / feedback | Opcional | **OFF** | Sí | No | — |

Default global = **modo Básico** (solo las 3 filas Core). El coach sube desde ahí. *Nunca al revés* — defaultear con todo encendido entierra el valor core para el novato (pitfall del research).

---

## 5. Granularidad: por-coach (Fase 1) + override por-alumno (Fase 2)

**Recomendación firme: empezar por-coach. El override por-alumno es Fase 2, no Fase 1.**

- **Por-coach (base, Fase 1):** las preferences aplican a **todos sus alumnos** por igual. Un coach de entrenamiento esconde micros para todos. Cubre el 95% del dolor del founder con un costo de esquema mínimo. Es lo que el founder pidió.
- **Por-alumno (override, Fase 2):** una capa que **solo estrecha o amplía dentro de lo ya permitido por el coach**, para el caso real "tengo un alumno clínico al que sí le sigo micros/composición, pero al resto no". Esto es exactamente el modelo de Everfit (default de workspace + override por cliente) y Kahunas (esconder nutrientes por cliente).

Resolución de capas (la preference más específica gana, sin nunca pasar el entitlement):

```
ENTITLED (server, Pro)  AND  ( override_alumno ?? preferencia_coach ?? default_del_preset )
```

**Dos invariantes de seguridad del research que NO se pueden romper:**
1. **Defaults aplican solo a alumnos nuevos, nunca retroactivo** (Everfit). Si el coach cambia su preset, no le destapamos/escondemos cosas de golpe a alumnos existentes con configuración propia. Recompute ciego = sorpresa (pitfall explícito).
2. **Apagar una sección OCULTA, no BORRA.** Crítico en EVA: `nutrition_meal_logs.meal_id` es `ON DELETE CASCADE`. Un toggle de visibilidad **jamás** debe tocar datos — solo el render. Re-prender restaura el historial intacto (Everfit hace exactamente esto).

---

## 6. Dónde vive la config y cómo se ve

**Dónde:** en el **hub de nutrición del coach** (no enterrado en Settings generales). Es donde el coach piensa "nutrición", tiene el información-scent correcto. Un acceso secundario desde Settings > Módulos está bien, pero el hogar es el hub.

**Cómo se ve** (una sola pantalla, sin niveles anidados — máximo 2 niveles de disclosure, *NN/g*):

```
┌─ Cómo trabajas la nutrición ───────────────────────────┐
│  ( ) Básico     (•) Intermedio     ( ) Profesional      │   ← preset selector
│      Plan + macros · lo esencial                         │
│                                                          │
│  ▸ Ajustar secciones (avanzado)          [Restaurar]    │   ← un solo "Advanced", expander
│    ┌──────────────────────────────────────────────────┐ │
│    │ Micros base (sodio, fibra)      [Base]   ●ON      │ │
│    │ Micros avanzados (azúcar, grasas)[Pro]   ○OFF  🔒 │ │   ← 🔒 si no tiene Pro → upsell
│    │ Método del plato                [Base]   ●ON      │ │
│    │ Objetivos por composición       [Pro]    ○OFF  🔒 │ │
│    │ Recetas · Lista compras · Hábitos…[Base] …        │ │
│    └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- **Badge Base / Pro** en cada fila (ya existe el principio §5b InfoTooltips + badges).
- **Tooltip** por sección: qué muestra y a quién le sirve — el "information scent" obligatorio para que esconder no sea enterrar (*NN/g*: nunca un gear icon pelado).
- Filas **Pro sin entitlement** se muestran **bloqueadas (🔒) con upsell**, no escondidas — el coach descubre qué gana pagando (no enterramos el valor comercial).

**Onboarding — una sola pregunta** (research: 1-2 preguntas máx, cada minuto extra baja conversión ~3%):

> **"¿Qué tan a fondo trabajas la nutrición con tus alumnos?"**
> ◦ Lo básico: plan y macros → **Básico**
> ◦ Le meto un poco más (micros, plato, hábitos) → **Intermedio**
> ◦ Soy nutricionista / lo trabajo a nivel profesional → **Profesional**

Esa respuesta elige el preset. Nada más en el wizard de nutrición — el resto se descubre en contexto (progressive profiling). **El preset es un default, no una cárcel:** siempre puede entrar a "Ajustar secciones" después.

> ⚠️ Gotcha EVA del research: el preset "Profesional" **NO concede el módulo pagado**. `enabled_modules`/`coach_addons` son compra-only/service-role; si el preset escribiera ahí, el trigger D1 lo pisa y/o regalaría features pagas. El preset setea **solo intención de UI**; el entitlement sigue viniendo de billing.

---

## 7. Arquitectura

Generaliza el `proEnabled` actual a un resolver de flags por sección. Cuatro piezas:

### a) Config tipado `NUTRITION_SECTIONS` (espejo de `MODULE_CATALOG`)

Paquete puro (mismo patrón que `@eva/module-catalog`: cero Next/Supabase/React, corre en web y RN). Fuente de verdad de qué secciones existen y sus reglas:

```ts
// packages/nutrition-sections/sections.ts  (PURO)
export type NutritionSectionKey =
  | 'plan' | 'macros' | 'adherence'        // core
  | 'micros_base' | 'micros_advanced'
  | 'plate' | 'goals_bodycomp'
  | 'recipes' | 'shopping' | 'habits' | 'off_plan_log' | 'notes'

export interface NutritionSection {
  key: NutritionSectionKey
  label: string
  tooltip: string
  core: boolean                 // true => siempre ON, no toggleable
  defaultOn: boolean            // default cuando no es core
  requiresModule: ModuleKey | null   // 'nutrition_exchanges' = Pro, o null
  presets: Record<'basico'|'intermedio'|'profesional', boolean>
}
```

### b) Tabla side coach-scoped (NO tocar el column-grant de `coaches`)

```sql
-- migración aditiva, idempotente
create table coach_nutrition_prefs (
  coach_id uuid primary key references coaches(id) on delete cascade,
  preset text not null default 'basico'
    check (preset in ('basico','intermedio','profesional')),
  sections jsonb not null default '{}'::jsonb,  -- overrides por key: {"micros_base": true}
  updated_at timestamptz not null default now()
);
alter table coach_nutrition_prefs enable row level security;
-- RLS: SELECT/INSERT/UPDATE propio (coach_id = auth.uid()); preference NO es plata, el coach SÍ escribe.
```

Decisión clave del research: **preferences = JSONB (sin migración por toggle nuevo, merge sobre defaults al leer); entitlements = relacional (`coach_addons`, ya existe).** Side-table evita el gotcha de column-grant de `coaches` (no widening). Como es tabla **nueva**, su RLS es libre (no hereda el REVOKE de `coaches`) — el coach escribe sus propias prefs sin service-role.

**Fase 2** — override por-alumno: tabla hermana `client_nutrition_prefs (client_id, sections jsonb)` o columna en la asignación. Misma forma, una capa más en el merge.

### c) Resolver server-side `resolveNutritionPrefs(coachId, clientId?)`

Generaliza `getNutritionProEnabledForClient`. Una sola función, `React.cache`, devuelve los flags ya resueltos:

```ts
// services/nutrition-prefs.service.ts
export const resolveNutritionPrefs = cache(
  async (coachId: string, clientId?: string): Promise<Record<NutritionSectionKey, boolean>> => {
    // 1. ENTITLEMENT server-side (reusa hasExchangesModuleForClientContext / enabled_modules)
    const proEnabled = await resolveProEntitlement(coachId, clientId)
    // 2. PREFERENCE: preset -> defaults, override por key, (fase 2) override por alumno
    const coachPrefs = await getCoachNutritionPrefs(coachId)         // tabla side
    const clientPrefs = clientId ? await getClientNutritionPrefs(clientId) : null
    // 3. AND-compose por sección
    return Object.fromEntries(NUTRITION_SECTIONS.map(s => {
      if (s.core) return [s.key, true]                              // core: siempre
      const wants = clientPrefs?.[s.key]
        ?? coachPrefs.sections[s.key]
        ?? s.presets[coachPrefs.preset]                             // default del preset
      const entitled = s.requiresModule ? proEnabled : true
      return [s.key, Boolean(entitled && wants)]                    // ENTITLED AND ENABLED
    }))
  }
)
```

Invariante: la preference **nunca** amplía — `entitled && wants`. Y se re-chequea server-side en cada render (un client cache viejo no puede re-abrir acceso revocado).

### d) Los shells renderizan condicional

Ambas vistas leen el mismo resolver en su `_data` y pasan flags a los shells:

- **Vista coach** (`apps/web/.../clients/[clientId]/NutritionTabB5.tsx`): `resolveNutritionPrefs(coachId, clientId)` → la pestaña Nutrición de la ficha solo pinta las secciones con flag `true`.
- **Vista alumno** (`apps/web/.../c/[coach_slug]/nutrition/_components/NutritionShell.tsx` + `sections.queries.ts`): mismo resolver → el `MicrosPanel`, plato, objetivos, etc. se montan condicional. Generaliza el `proEnabled` que ya pasás ahí.

Una sola fuente de verdad → **ambas vistas siempre coinciden** (el coach no ve una sección que el alumno no ve, ni viceversa). Esto mata por construcción el bug "el dashboard calcula macros distinto" que ya tenés anotado.

---

## 8. Pitfalls del research y cómo los evitamos

| Pitfall | Cómo lo evitamos en EVA |
|---|---|
| **Demasiados toggles → parálisis** (50 switches congelan) | Preset hace el 90%; toggles detrás de un solo "Ajustar secciones". |
| **Más de 2 niveles de disclosure** (usuario se pierde) | Exactamente 2: preset visible + un expander "avanzado". Nada anidado. |
| **Esconder = enterrar** (nadie lo encuentra) | Badges Base/Pro + tooltips por fila + filas Pro bloqueadas visibles con upsell (information scent). |
| **Defaults malos / todo OFF por default** entierra el core | Core siempre ON; default global = Básico (core completo, nunca vacío). |
| **Preference como gate de acceso** (bypass de paywall) | Entitlement server-side, fail-closed; preference solo `&&`, nunca amplía. Re-check en cada render. |
| **Doble opt-in** (pagar y además prender) | Al conceder Pro, sus toggles arrancan ON. |
| **Recompute retroactivo sorprende a alumnos** | Defaults solo a alumnos nuevos; cambiar preset no re-pinta a existentes con override. |
| **Toggle borra datos** (CASCADE en `nutrition_meal_logs`) | Visibilidad = solo render. Jamás toca filas. Re-prender restaura historial. |
| **JSONB para datos que hay que enforcer** | Solo prefs van a JSONB; entitlements quedan relacionales en `coach_addons`. |
| **Blobs viejos sin la key nueva** | Al leer, merge sobre defaults de `NUTRITION_SECTIONS` (sección nueva ausente → su `defaultOn`/preset). |
| **Flags sin sunsetting reconstruyen el kitchen sink** | `NUTRITION_SECTIONS` es la única lista; agregar/quitar una sección es editar ese archivo (auditable). |
| **Olvidar el GRANT de columna** (PostgREST 42501) | No aplica: es tabla side nueva con su propia RLS, no columna en `coaches`. |

---

## 9. Plan de trabajo y por qué conviene PRONTO

**Por qué pronto, no después:** el overhaul sigue agregando features. Si el sistema de visibilidad no existe, **cada feature nueva nace encendida para todos** y hay que retro-esconderla una por una (caro, y ya abrumaste a coaches en el camino). Con el sistema en pie, la regla pasa a ser: **toda sección nueva de nutrición nace con su entrada en `NUTRITION_SECTIONS` (core/opcional, default, requiresModule, presets) — sin eso, no se mergea.** El toggle deja de ser trabajo extra y pasa a ser parte de la definición de "hecho". Es la diferencia entre prevenir el bloat y limpiarlo después.

**Fases:**

- **Fase 0 — Cimiento (1 sprint).** `NUTRITION_SECTIONS` (paquete puro) + tabla `coach_nutrition_prefs` (migración aditiva) + `resolveNutritionPrefs(coachId)` server-side. Tests del resolver (AND-composition, core siempre ON, preference no amplía). Sin UI todavía: cablear los shells para leer los flags (generalizar `proEnabled`). **Esto entrega valor solo: las secciones avanzadas pasan a OFF por default ya.**
- **Fase 1 — UI coach + onboarding (1 sprint).** Preset selector + lista de toggles en el hub de nutrición; la pregunta de onboarding. Default Básico para coaches existentes (no retroactivo a alumnos).
- **Fase 2 — Override por-alumno (1 sprint, cuando haya demanda real).** `client_nutrition_prefs` + capa extra en el merge + UI por-alumno en la ficha. También: subset de macros/micros visibles por alumno (Kahunas).
- **Continuo — regla de gobernanza.** Cada feature nueva de nutrición = una fila en `NUTRITION_SECTIONS` con su default. PR sin eso, se rechaza.

---

## 10. Las 4 decisiones del founder para arrancar

1. **¿Tres presets (Básico / Intermedio / Profesional)?** Recomiendo sí, tres exactos. Dos quedan cortos (no hay lugar para el "le meto un poco"); cuatro reintroducen parálisis de elección (research: ≤6 opciones, y acá 3 es el dulce). **Decisión: confirmar los 3 nombres y qué secciones trae cada uno** (la tabla §4 es mi propuesta).

2. **¿Micros base (sodio/fibra) son free o Pro?** Mi recomendación: **free pero OFF por default** (cualquiera los prende sin pagar; los avanzados —azúcar/grasas— sí son Pro). Esto hace al modo Intermedio valioso sin paywall y reserva el músculo comercial para lo realmente avanzado. **Decisión: confirmar la línea free/Pro** (define cuánto vende Nutrición Pro).

3. **¿Override por-alumno entra en Fase 1 o Fase 2?** Recomiendo **Fase 2**. Por-coach cubre el dolor que describiste; por-alumno agrega esquema y UI por un caso (el alumno clínico) que conviene validar con demanda real antes de construir. **Decisión: confirmar que arrancamos por-coach.**

4. **¿El preset "Profesional" se ofrece a coaches sin Pro?** Mi recomendación: **sí, pero las secciones Pro aparecen bloqueadas con upsell** (no escondidas) — descubren qué ganan pagando. El preset nunca concede el módulo (es compra-only/service-role). **Decisión: confirmar que mostramos lo Pro bloqueado vs. ocultarlo.**

---

**Archivos relevantes (rutas absolutas):**
- Patrón a imitar para el config puro: `D:\Proyectos\Antigravity\gymappjp\packages\module-catalog\catalog.ts`
- `proEnabled` actual a generalizar: `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\nutrition\_data\sections.queries.ts` (`getNutritionProEnabledForClient`, `getPlanDayMicros`, `getMicroTargetsForClient`, `platePropFromMacros`)
- Shell alumno a cablear: `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\c\[coach_slug]\nutrition\_components\NutritionShell.tsx` y `MicrosPanel.tsx`
- Vista coach (ficha) a cablear: `D:\Proyectos\Antigravity\gymappjp\apps\web\src\app\coach\clients\[clientId]\NutritionTabB5.tsx`
- Entitlement Pro server-side (reusar): `hasExchangesModuleForClientContext` en `apps\web\src\services\nutrition-exchanges\nutrition-exchanges.service.ts` y `findPlanModuleContext` en `apps\web\src\infrastructure\db\exchanges.repository.ts`
- Nuevos a crear: `packages\nutrition-sections\sections.ts` (puro), `apps\web\src\services\nutrition-prefs.service.ts` (resolver), migración aditiva `coach_nutrition_prefs`