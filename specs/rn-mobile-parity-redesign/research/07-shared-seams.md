# Mapa de costuras compartidas — web / mobile / packages

Generado 2026-07-08. cwd analizado: `D:/Proyectos/Antigravity/gymappjp/.claude/worktrees/rnmobiledenuevo`.
Alcance: `packages/*` (paquetes `@eva/*`), `apps/web`, `apps/mobile`, `apps/enterprise`.

---

## A. Inventario de `packages/@eva/*`

Los 7 packages existen bajo `packages/`. Todos son `type: module`, `private: true`, sin build
step (se consumen como TS fuente vía workspace, `main`/`types` apuntan directo al `.ts`).

### 1. `@eva/brand-kit` (`packages/brand-kit/`)
- Archivos: `index.ts` (motor de color OKLCH, usa `culori`), `motion.ts`, `presets.ts`.
- Exporta: `BrandThemeTokens`, `BrandTheme`, `BrandThemeInput`, función principal de derivar
  theme claro/oscuro desde un color de marca (contraste WCAG AA garantizado). `motion.ts` y
  `presets.ts` no inspeccionados a fondo pero co-ubicados (presets de marca / tokens de motion).
- Puro: cero React/Next/DOM (declarado explícitamente en el docstring). Corre igual en web y RN.
- Importadores:
  - **web**: 15 archivos bajo `apps/web/src` (`grep -rl "@eva/brand-kit" apps/web/src`).
  - **mobile**: 4 archivos — `apps/mobile/components/IconButton.tsx`,
    `apps/mobile/lib/coach-tiers.ts`, `apps/mobile/lib/motion.ts`, `apps/mobile/lib/theme.ts`.
  - **enterprise**: 0 (no consume ningún `@eva/*`, ver sección E).

### 2. `@eva/calc` (`packages/calc/`)
- Archivos: `index.ts` (re-export de `./src/movement`), `src/movement.ts` + test.
- Exporta: cálculo puro de screening de Movimiento de Ingreso (módulo `movement_assessment`,
  7 patrones + semáforo, según docstring).
- Puro, sin IO.
- Importadores: **web** 8 archivos. **mobile**: 0. **enterprise**: 0.
- Nota: mobile NO tiene pantallas de `movement_assessment` en absoluto (ver sección B/C —
  gap funcional total, no hay duplicado que limpiar, hay que construir desde cero usando
  este paquete).

### 3. `@eva/feature-prefs` (`packages/feature-prefs/`)
- Archivo único `index.ts`. Exporta `ModuleKey` (espejo de `MODULE_KEYS` de
  `apps/web/src/services/entitlements.service.ts`, verificado por test cruzado), `Preset`
  (`'basico'|'intermedio'|'profesional'`), `PRESETS`, `NutritionSectionKey`, `PresetMap`, y
  el resolver puro del modelo `visible = ENTITLED (billing) AND ENABLED (preferencia)`.
- Puro. Docstring dice explícitamente que existe para que la MISMA config/resolver corra en
  web y en `apps/mobile` — pero mobile hoy no lo usa.
- Importadores: **web** 9 archivos. **mobile**: 0. **enterprise**: 0.
- Gap: mobile no tiene el sistema de preferencias de secciones por dominio en absoluto.

### 4. `@eva/module-catalog` (`packages/module-catalog/`)
- Archivo único `catalog.ts`. Exporta `MODULE_CATALOG_KEYS` (4 keys: `cardio`,
  `movement_assessment`, `body_composition`, `nutrition_exchanges`), `ModuleKey`,
  `ModuleCatalogEntry` (`label`, `pitch`, `surfaces`, `priceClp`), y `MODULE_CATALOG` (copy
  comercial en español latam neutro).
- Puro. Pensado explícitamente para reusar en RN (docstring).
- Importadores: **web** 3 archivos. **mobile**: 0. **enterprise**: 0.

### 5. `@eva/nutrition-engine` (`packages/nutrition-engine/`)
- Archivos: `index.ts` (barrel), `macros.ts`, `adherence.ts`, `micros.ts`, `tdee.ts`,
  `bodycomp.ts` (+tests). El paquete más grande y más central.
- `macros.ts`: cálculo de macros por ítem de comida (`calculateFoodItemMacros`,
  `sumMealMacros`, `calculateConsumedMacros*`, `normalizeMealForMacros`, helpers de swap de
  alimentos). Docstring dice explícito: "Movido VERBATIM desde
  `apps/web/src/lib/nutrition-utils.ts`... No cambiar cuerpos ni firmas."
- `tdee.ts`: `computeMifflinStJeor`, `computeTDEE`, `deriveCalorieTarget`,
  `deriveMacroTargets`, constantes `ACTIVITY_FACTORS`, `GOAL_CALORIE_MULTIPLIER`,
  `GOAL_PROTEIN_G_PER_KG`, `GOAL_FAT_KCAL_FRACTION`. Es la fuente de verdad ACTUAL del cálculo
  de metas nutricionales (ver hallazgo crítico en sección C.1 — mobile tiene un duplicado
  desactualizado).
- Puro (cero Next/Supabase/React/RN/date-fns).
- Importadores: **web** 6 archivos. **mobile**: 0 (mobile NO importa este paquete pese a
  tener su propia reimplementación paralela — ver C.1 y C.2).
- `apps/web/src/lib/nutrition-utils.ts` (11 líneas) hoy es solo un **re-export shim**:
  `export * from '@eva/nutrition-engine'` — confirma que la migración a paquete se completó
  del lado web.

### 6. `@eva/schemas` (`packages/schemas/`)
- El paquete más grande por cantidad de archivos: `auth.ts`, `bodycomp.ts`, `brand.ts`,
  `client.ts`, `coach.ts`, `coupon.ts`, `index.ts`, `nutrition-exchanges.ts`, `nutrition.ts`,
  `org.ts`, `screening.ts`, `team.ts`, `workout.ts` (todos con Zod schemas).
- `index.ts` marca explícitamente qué está "SAFE FOR MOBILE" (brand, auth, client, nutrition,
  coach, workout) vs "SERVER-ONLY" (org, coupon, team, screening, bodycomp,
  nutrition-exchanges — estos últimos referencian `org_id`/`coach_id` de DB o son server-only
  por otras razones, aunque puramente estructuralmente serían Zod puro).
- Importadores: **web** 53 archivos (el más usado). **mobile**: 5 archivos —
  `app/(auth)/forgot-password.tsx`, `app/(auth)/login.tsx`, `app/(auth)/register.tsx`,
  `lib/coach-brand.ts`, `lib/coach-tiers.ts`. **enterprise**: 0.
- Gap: mobile solo consume la porción de auth; NO usa los schemas de `bodycomp`,
  `nutrition-exchanges`, `screening` pese a que packages ya los expone (aunque están
  marcados "SERVER-ONLY" en el comentario del index — habría que revisar si esa etiqueta
  sigue siendo correcta para los 3 módulos nuevos, que son estructuralmente puros).

### 7. `@eva/tiers` (`packages/tiers/`)
- Archivo único `index.ts`. Exporta `BillingCycle`, `SubscriptionTier`, `SaleTier`,
  `TierConfig`, `TierCapabilities`, `SALE_TIERS`, `LEGACY_TIERS`, `isSaleTier`,
  `TIER_CONFIG`, `getRecommendedTier`, `getTierCapabilities`, lógica de descuento trimestral.
- Docstring dice explícito que existe para matar el "drift del espejo a mano que antes vivía
  duplicado en `apps/mobile/lib/coach-tiers.ts`" — este caso YA se resolvió (ver mobile
  `coach-tiers.ts`, que hoy es un re-export + azúcares de capability, NO un duplicado).
- Importadores: **web** 20 archivos. **mobile**: 3 —
  `lib/coach-subscription.ts`, `lib/coach-tiers.ts`, `lib/coach.ts`. **enterprise**: 0.
- Este es el **modelo a seguir**: extracción completa, mobile re-exporta sin duplicar.

---

## B. Módulos parity-críticos en `apps/web` que NO están en `packages/*`

Búsqueda de lo pedido explícitamente en la tarea:

| Candidato pedido | ¿Existe en esa ruta? | Ubicación real |
|---|---|---|
| `apps/web/src/domain/*` (cardio, bodycomp, coach…) | Sí | `apps/web/src/domain/{assessment,auth,billing,bodycomp,cardio,client,coach,nutrition,org,workout}` |
| `lib/plan-builder/reducer.ts` | **No existe esa ruta.** El reducer real del builder de rutina vive en `apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts` (`builderReducer`, 463 líneas). |
| `lib/profile-analytics` | **No existe en web con ese nombre.** El análogo real está repartido en `apps/web/src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`, `profileOverviewUtils.ts`, `profileBodyCompositionUtils.ts` (co-ubicados con la página, no en `lib/`). |
| `lib/nutrition-utils` | Sí, pero ya es un shim de 11 líneas a `@eva/nutrition-engine` (ver A.5). |
| `lib/coach-nav.ts` | **No existe con ese nombre exacto.** Es `apps/web/src/components/coach/coach-nav.ts` (180 líneas, dentro de `components/coach/`, no de `lib/`). |
| `entitlements.service` | Sí — `apps/web/src/services/entitlements.service.ts` (93 líneas). |
| `macro-calculator` | **No existe en web.** El cálculo de metas vive inline como `calcMacros`/`calcMacrosBodyComp` dentro de `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilderSidebar.tsx`, y HOY delega en `@eva/nutrition-engine` (`computeMifflinStJeor`, `computeTDEE`, `deriveCalorieTarget`, `deriveMacroTargets` de `tdee.ts`). |

Conclusión de B: de los 6 candidatos que pedía la tarea, solo 3 existen tal cual (`domain/*`,
`nutrition-utils`, `entitlements.service`); los otros 3 (`plan-builder/reducer`,
`profile-analytics`, `coach-nav`, `macro-calculator`) están co-ubicados junto a la página/
componente que los usa (patrón Module Pattern de `CLAUDE.md`), no en `lib/` como archivo
suelto. Esto importa para el arquitecto: extraer estos a un paquete implica moverlos de una
ruta de feature a un paquete transversal, no solo renombrar un import.

---

## C. Candidatos a extracción — detalle por módulo

### C.1. Cálculo de metas nutricionales (macros) — **DRIFT CONFIRMADO, prioridad alta**

- **Web (fuente de verdad actual)**: `packages/nutrition-engine/tdee.ts` — funciones puras
  `computeMifflinStJeor`, `computeTDEE`, `deriveCalorieTarget`, `deriveMacroTargets`.
  Consumidas por `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilderSidebar.tsx`
  (líneas ~85-104, función local `calcMacros` que delega en el paquete).
  Fórmulas: `GOAL_CALORIE_MULTIPLIER` = `{lose: 0.85, maintain: 1, gain: 1.1}` (multiplicador
  % sobre TDEE), `GOAL_PROTEIN_G_PER_KG` = `{lose: 2.2, maintain: 1.8, gain: 1.6}`,
  `GOAL_FAT_KCAL_FRACTION` = `{lose: 0.3, maintain: 0.275, gain: 0.25}` (grasa como % de
  calorías, no gramos/kg fijo).
- **Mobile (duplicado desactualizado)**: `apps/mobile/lib/macro-calculator.ts` (51 líneas,
  NO importa `@eva/nutrition-engine`). Su comentario dice "Port 1:1 de la web
  (PlanBuilder/PlanBuilderSidebar.calcMacros)" — pero es un port de una versión ANTERIOR del
  cálculo web, antes de que este se migrara a `tdee.ts`. Fórmulas divergentes:
  - `GOAL_ADJUSTMENTS` usa **delta absoluto de kcal** (`cut: -400`, `maintain: 0`, `bulk:
    +300`) en vez del multiplicador porcentual `0.85/1/1.1` del paquete.
  - `proteinMultiplier` (`cut: 2.2, maintain: 1.8, bulk: 2.0`) — el valor de `bulk` (2.0)
    difiere del paquete (`gain: 1.6`).
  - `fats = weightKg * 0.9` (gramos/kg fijo) en vez de `GOAL_FAT_KCAL_FRACTION` (% de
    calorías) del paquete.
  - Resultado: para el mismo alumno/objetivo, mobile y web devuelven **números distintos**
    de calorías/macros objetivo. Riesgo directo de confusión coach/alumno si ambas
    superficies coexisten.
- **Acción recomendada**: eliminar `apps/mobile/lib/macro-calculator.ts` y hacer que su único
  importador (builder de nutrición RN, revisar `apps/mobile/lib/nutrition-builder.ts` /
  `app/coach/nutrition-builder.tsx`) consuma `@eva/nutrition-engine` (`tdee.ts`) directo,
  igual que hace ya `PlanBuilderSidebar.tsx` en web.

### C.2. `nutrition-utils` — duplicado exacto de tipos, ya resuelto solo en web

- **Web**: `apps/web/src/lib/nutrition-utils.ts` — shim de 11 líneas, re-exporta
  `@eva/nutrition-engine` completo.
- **Mobile**: `apps/mobile/lib/nutrition-utils.ts` — **235 líneas, copia local completa**
  (no importa el paquete). Contiene los mismos tipos (`FoodMacrosRow`, `FoodItemForMacros`,
  `MealWithFoodItems`, `NutritionMealMacroSource`) y funciones (`calculateFoodItemMacros`,
  etc.) que `packages/nutrition-engine/macros.ts`, pero como copia manual — con al menos una
  diferencia estructural detectada: la copia mobile omite el tipo `Json` y el campo
  `household_grams`/`household_label` de `FoodMacrosRow` que sí tiene el paquete (porciones
  caseras). No se verificó línea por línea el resto del archivo (235 líneas) pero el patrón
  de "copia manual en vez de import" es el mismo riesgo que C.1.
- **Acción recomendada**: reemplazar `apps/mobile/lib/nutrition-utils.ts` completo por
  `export * from '@eva/nutrition-engine'` (mismo patrón que ya usa web), revisando primero
  que ningún consumidor mobile dependa de la firma vieja sin `household_grams`.

### C.3. `profile-analytics` (mobile) — puerto manual sin paquete compartido, sin drift verificado pero de alto riesgo estructural

- **Mobile**: `apps/mobile/lib/profile-analytics.ts`, 276 líneas. Docstring: "Analítica de
  perfil de alumno — port 1:1 de la web (`profileTrainingAnalytics` + `profileOverviewUtils`
  + `profileBodyCompositionUtils`), adaptado a RN: logs PLANOS (no nested), sin date-fns,
  colores hex." Reimplementa fecha-helpers propios (`parseYmd`, `ymd`, `addDays`, `diffDays`,
  `diffMonths`, `startOfWeekMonday`) para evitar `date-fns` en RN.
  Exporta: `epleyOneRM`, `buildExerciseStrengthSeriesMap`, `selectStrengthCardExercises`,
  `selectStrengthCardsFromSeries`, `strengthTrendDeltaKg`, `maxOneRMIndex`,
  `findWeeklyWeightPRs`, `buildDailyTonnageSeries`, `detectVolumeImbalances`,
  `linearRegressionKgPerDay`, `bmiFromMetric`, `bmiCategory`, `avgEnergySince`,
  `energyColorHex`, `buildProfileActivityCalendar`, `longestActivityStreak`,
  `formatTrainingAgeLabel`, `checkInRegularityPercentAsOf`.
- **Web (fuente original)**: 3 archivos separados, co-ubicados junto a la ficha de alumno,
  NO en `lib/`:
  - `apps/web/src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`
  - `apps/web/src/app/coach/clients/[clientId]/profileOverviewUtils.ts`
  - `apps/web/src/app/coach/clients/[clientId]/profileBodyCompositionUtils.ts`
  - (hermanos relacionados en la misma carpeta, no analizados en detalle:
    `clientStatusUtils.ts`, `getProfileTopAlert.ts`, `profileDataHelpers.ts`,
    `profileProgramStructureUtils.ts`, `profileProgramUtils.ts`)
  - Consumidores web: `TrainingTabB4Panels.tsx`, `TrainingStrengthCards.tsx`,
    `ProgressBodyCompositionB6.tsx`, `ProfileOverviewB3.tsx`, `ClientProfileHero.tsx`, y
    también `app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx` y
    `app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts` (o sea, esta analítica también
    se usa del lado ALUMNO, no solo en la ficha del coach).
- **Bloqueo de extracción a paquete puro**: no confirmado con certeza — no se leyeron los 3
  archivos web completos (fuera del alcance de tiempo de esta pasada), pero por convención
  del repo (`domain/` es la capa pura) y por el hecho de que estos archivos NO están en
  `domain/` sino co-ubicados con la ruta `app/coach/clients/[clientId]/`, es probable que
  reciban filas de Supabase con forma "nested" (join anidado) directamente como input, lo
  cual mobile ya resolvió aplanando (`WorkoutLogRow` plano). Si es así, extraer a paquete
  puro requiere primero definir un tipo de entrada neutro (plano) en ambos lados — el
  arquitecto debe leer esos 3 archivos web antes de decidir la forma del paquete.
- **Riesgo**: al ser un "port manual" en vez de import, cualquier fix de bug o cambio de
  fórmula en la web (p. ej. ventana de `checkInRegularityPercentAsOf`, umbral de
  `detectVolumeImbalances`) no se propaga a mobile salvo que alguien recuerde replicarlo a
  mano. No se detectó una divergencia numérica concreta (no se diffearon los 3 archivos web
  contra el mobile línea por línea), pero el patrón es idéntico al de C.1 — candidato de alto
  valor para extraer a `packages/profile-analytics` o similar.

### C.4. `entitlements.service` / `MODULE_KEYS` — gap total en mobile, no hay duplicado

- **Web**: `apps/web/src/services/entitlements.service.ts` (93 líneas). Exporta
  `MODULE_KEYS` (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`),
  `ModuleKey`, `EnabledModules`, `isModuleKilledByOperator` (kill-switch de operador vía
  `EVA_DISABLED_MODULES`), `applyOperatorKillSwitch`, `getTeamEnabledModules`,
  `getCoachEnabledModules`, `hasModule`, `assertModule`. Depende de `SupabaseClient` y
  `Database` (`@/lib/database.types`) — **no es puro**, es un service de infraestructura
  (habla directo con Supabase vía `db.from('teams'|'coaches')`), por diseño (server-side
  gating, "nunca confiar en lo que manda el cliente").
- **Mobile**: `grep -rln "MODULE_KEYS|enabled_modules" apps/mobile` → **0 resultados**.
  Mobile no tiene NINGUNA referencia a módulos de pago, ni lee `enabled_modules` de
  `coaches`/`teams`, ni aplica el kill-switch de operador. Confirma el hallazgo de la
  auditoría previa (`docs/audits/rn-web-parity-2026-06-21.md`, referenciada en memoria del
  proyecto): "faltan módulos pagos/entitlements/feature-prefs" en mobile.
- **Bloqueo de extracción**: el gating real (`hasModule`/`assertModule`) NO debería
  extraerse tal cual — es lógica server-side de Next.js/Supabase (aunque mobile habla
  PostgREST directo, no Next). Lo extraíble a paquete puro es solo `MODULE_KEYS`/`ModuleKey`/
  `EnabledModules`/`isModuleKilledByOperator`/`applyOperatorKillSwitch` (constantes + lógica
  de kill-switch, sin IO) — de hecho **`@eva/feature-prefs` YA declara un `ModuleKey` espejo
  de `MODULE_KEYS`** (ver A.3) pensado exactamente para esto, pero mobile todavía no lo
  consume. El fetch de `enabled_modules` desde `coaches`/`teams` sí debe reimplementarse en
  mobile hablando PostgREST directo (patrón ya usado por otros `lib/*.queries.ts` de mobile),
  no vía paquete compartido.
- **Nota de riesgo de seguridad**: si mobile construye pantallas de cardio/movimiento/
  composición corporal/intercambios sin replicar el gate server-side (`assertModule`) en
  cada mutación, quedaría expuesto a que un alumno/coach sin el módulo activo igual pueda
  invocar la funcionalidad vía PostgREST directo — el arquitecto debe diseñar el equivalente
  RLS/RPC-side de este gate, no solo el mirror de UI.

### C.5. `coach-nav.ts` — sin equivalente en mobile (arquitectura de nav distinta)

- **Web**: `apps/web/src/components/coach/coach-nav.ts` (180 líneas). Función pura
  `getVisibleNavItems` (unit-testeable), consumida por `CoachSidebar.tsx` y
  `CoachTopBar.tsx`. Ya declara el gancho `entitlement`/`ModuleKey` de
  `entitlements.service` para los módulos toggleables (cardio, antropometría,
  intercambios), aunque el enforcement real está pendiente para esos módulos nuevos.
- **Mobile**: `grep -riln "coach-nav" apps/mobile` → sin resultados; no hay archivo
  equivalente. Mobile usa expo-router (navegación basada en archivos, `app/coach/(tabs)/`),
  arquitectura de navegación fundamentalmente distinta a un array de config + sidebar React.
- **Conclusión**: no es un caso de "extraer a paquete" en el sentido de C.1-C.3 — el *dato*
  (qué módulos existen, en qué `contexts` de workspace, qué ícono/label) sí podría vivir en
  un paquete puro (candidato natural: extender `@eva/module-catalog`, que ya tiene
  `label`/`pitch`/`surfaces` por `ModuleKey`, con `contexts` y algún identificador de ícono
  neutro no acoplado a `lucide-react`), pero el *reducer de visibilidad de nav* en sí
  (`getVisibleNavItems`) es specific a la UI de sidebar web y no se traduce 1:1 a expo-router
  tabs. El arquitecto debe decidir si mobile necesita su propia función de "qué tabs mostrar"
  alimentada por los mismos datos de `module-catalog`, en vez de reusar `coach-nav.ts` tal
  cual.

### C.6. Builder de rutina (`usePlanBuilder`/`builderReducer`) — mobile NO lo porta, construye distinto

- **Web**: `apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts` (463 líneas).
  Exporta `DAYS_OF_WEEK`, `BuilderAction` (tipo), `builderReducer` (reducer puro de
  useReducer), y el hook `usePlanBuilder(initialDays, areas)`. El reducer en sí (los `case`
  de las acciones) es candidato natural a paquete puro si se ignoran los imports de React.
- **Mobile**: `apps/mobile/app/coach/program-builder.tsx` (1234 líneas). Se buscó
  `useReducer`/patrón `case '...'` y no se encontró — el builder mobile NO usa el mismo
  patrón de reducer que web; aparenta ser una implementación con estado local (`useState`)
  distinta, no un "port" ni un duplicado del reducer web.
- **Conclusión**: no hay duplicado de código a limpiar aquí — hay una **reimplementación
  paralela con arquitectura de estado distinta**. Esto es un gap más profundo que C.1-C.3:
  no basta con "extraer y reusar", hay que decidir si vale la pena reescribir el builder
  mobile sobre el mismo `builderReducer` (requeriría separar el reducer puro del hook
  `usePlanBuilder` que sí usa React, algo que HOY están en el mismo archivo) o mantener
  las dos implementaciones independientes y solo alinear resultado/UX.

### C.7. `domain/cardio` y `domain/bodycomp` — puros, listos para extraer, mobile no tiene pantallas

- **`apps/web/src/domain/cardio/`**: `pace.ts`, `types.ts`, `zones.ts` (+ tests). Grep de
  imports en los `.ts` (no test) no encontró ningún `next`/`supabase`/`react` — son puros.
- **`apps/web/src/domain/bodycomp/`**: `anthropometry.ts`, `bodyfat.ts`, `fixtures.ts`,
  `index.ts`, `phantom.ts`, `somatotype.ts`, `types.ts` (+ tests) — 12 archivos, el domain
  más grande. No se verificó import-por-import pero por convención de capa (`domain/` no
  puede importar `lib/`/`app/`/Supabase según CLAUDE.md) se asume puro.
- **Mobile**: `find apps/mobile/app -iname "*cardio*" -o -iname "*bodycomp*" -o -iname
  "*movement*"` → **0 resultados**. No existe NINGUNA pantalla de cardio, composición
  corporal ni evaluación de movimiento en mobile. Coincide con `@eva/calc` (screening de
  movimiento) también sin consumidor mobile.
- **Conclusión**: estos son los candidatos MÁS limpios de extraer — ya son puros, ya tienen
  tests, y no hay riesgo de romper nada en mobile porque no hay nada que migrar (mobile
  parte de cero). El trabajo es 100% "construir la pantalla en mobile importando el domain
  ya existente" (posiblemente moviéndolo de `apps/web/src/domain/{cardio,bodycomp}` a
  `packages/` primero, replicando el patrón `@eva/nutrition-engine`), no "resolver drift".

### C.8. Otros `domain/*` — solo tipos, no bloqueados

`assessment`, `auth`, `billing`, `client`, `coach`, `nutrition` (2 archivos:
`exchange.types.ts`, `types.ts`), `org` (`permissions.ts` + `types.ts`), `workout` — cada uno
1-2 archivos, mayormente `types.ts` puro. `org/permissions.ts` no se leyó en detalle (posible
lógica de permisos, no solo tipos) — el arquitecto debería revisarlo si el plan toca
`/org/*` en mobile (fuera del alcance "alumno primero" declarado en la tarea, probablemente
baja prioridad).

---

## D. Resumen priorizado para el arquitecto

1. **C.1 (macro-calculator) y C.2 (nutrition-utils)** — drift/duplicado CONFIRMADO y de bajo
   costo de arreglo (borrar el archivo mobile, importar el paquete que YA existe y YA está
   probado). Máxima prioridad, mínimo esfuerzo.
2. **C.4 (entitlements/MODULE_KEYS)** — gap total, bloqueante para construir CUALQUIER
   pantalla de cardio/movimiento/bodycomp/nutrition_exchanges en mobile sin abrir un agujero
   de seguridad. Debe resolverse (al menos el mirror de `ModuleKey`/kill-switch vía
   `@eva/feature-prefs`, más el gate server-side equivalente) ANTES de C.7.
3. **C.7 (domain/cardio, domain/bodycomp, @eva/calc)** — los módulos "nuevos" (cardio,
   bodycomp, movement) no tienen NADA en mobile; construir requiere primero mover/exponer
   estos domains como paquete (ya son puros) y luego construir UI RN desde cero.
3. **C.3 (profile-analytics)** — alto valor pero requiere que el arquitecto lea los 3
   archivos web fuente (`profileTrainingAnalytics.ts`, `profileOverviewUtils.ts`,
   `profileBodyCompositionUtils.ts`, ~no medidos en líneas) antes de diseñar la forma del
   paquete, por el tema de logs anidados vs planos.
4. **C.5 (coach-nav) y C.6 (builder reducer)** — no son "duplicados a limpiar" sino
   decisiones de arquitectura (¿comparten dato pero no lógica de render/reducer?). Bajo
   riesgo inmediato, pero conviene que el arquitecto los tenga en el radar para no
   reinventar el catálogo de módulos dos veces.

## E. `apps/enterprise`

Es una app Expo separada (`@eva/enterprise`, propio `package.json`, propio `expo-router`),
NO importa ningún paquete `@eva/*` (0 en los 7 greps). No usa `@supabase/ssr`, usa
`@supabase/supabase-js` directo + `expo-*`. Fuera del alcance funcional de esta tarea (la
meta declarada es alumno+coach en `apps/mobile`, no enterprise), se documenta solo para que
el arquitecto no asuma por error que comparte código con `apps/mobile`.

---

## F. Metodología / limitaciones de esta pasada

- Todo grep de imports fue `grep -rl "@eva/<pkg>" <dir> --include=*.ts --include=*.tsx`,
  excluyendo `node_modules`. No se diferenció import de tipo (`import type`) vs valor.
- No se leyó línea por línea el contenido completo de `domain/bodycomp/*` (12 archivos),
  `profileTrainingAnalytics.ts`/`profileOverviewUtils.ts`/`profileBodyCompositionUtils.ts`,
  ni el resto de `apps/mobile/lib/nutrition-utils.ts` (235 líneas, se comparó cabecera de
  tipos y una función contra el paquete, no las 235 líneas completas) — por límite de tiempo
  de esta pasada de investigación. Cualquier plan de implementación debe releer esos
  archivos completos antes de escribir el diff.
- No se ejecutó `pnpm typecheck` ni tests — este informe es puramente de lectura/grep, cero
  escritura de código de producto (regla de la tarea).
