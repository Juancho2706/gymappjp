# Auditoria de Nutricion EVA — Estado actual, brechas y plan para nivel profesional (Junio 2026)

> Documento para los dos socios (perfil tecnico + negocio). Sintetiza el mapa de estado actual del sistema, el mapa de mejores practicas 2026 y el panel de 14 roles. Distingue siempre **ya existe** de **falta**. Referencia archivos y areas reales del codigo.

---

## 1. Resumen ejecutivo

**Que tenemos hoy (lo que ya existe y funciona):**

1. Un constructor unico (`PlanBuilder`) que sirve para plantillas y planes de alumno, con sugeridor Mifflin-St Jeor, bloques de comidas con drag-and-drop y auto-sincronizacion de objetivos (kcal/P/C/F) contra los alimentos.
2. Matematica de macros pura, centralizada y testeada (`lib/nutrition-utils.ts` para gramos, `services/nutrition-exchanges/exchange-calc.ts` para intercambios), compartida entre web, mobile y PDF, con el caso documentado de liquidos (15 ml de aceite = 15 g de grasa).
3. Un modulo de intercambios (porciones) con arquitectura limpia ejemplar: dominio puro + calculo + reconciliacion + frontera de repositorio, grupos compuestos, variantes por dia, equivalencias, badge de "macros referenciales" y chequeos de tenant en profundidad.
4. Reconciliacion que preserva el id de comida para no romper las marcas de adherencia del alumno al editar el plan, mas snapshot automatico de historia antes de cada guardado de plan de alumno (`nutrition_plan_history`) con restore real.
5. Soporte offline/PWA y mobile nativo genuinamente robusto: read-model en localStorage/AsyncStorage, cola de toggles deduplicada que se vacia al reconectar y al volver al foreground, logging de 1 toque con UI optimista, haptics y confeti.
6. Snapshot de objetivos al momento del log (`target_*_at_log`) que mantiene correcta la adherencia historica tras editar el plan (se lee en web; en mobile se escribe pero no se lee — brecha).
7. Enforcement server-side real: el gate de tier corta en el RSC antes del fetch, toda mutacion de intercambios pasa por `assertExchangesModuleForPlan`, resolucion de contexto de recurso (pool gana sobre coach) y guards de money-safety P0 en la compra de add-ons.
8. Exportacion white-label a PDF/texto bien hecha (solo cliente, fallback EVA a prueba de fallos, disclaimer legal estampado).

**Los 5 problemas mas graves:**

9. **Techo de 4 macros (kcal/P/C/F).** No hay fibra, sodio, azucar, grasa saturada/insaturada ni micronutrientes en ninguna parte (`foods`, objetivos, logging, PDFs, alertas). Es un muro clinico duro: imposibilita hipertension, renal, diabetes, embarazo y deficiencias. Es **la** limitacion dominante y se propaga por todas las superficies.
10. **La adherencia tiene 2 formulas divergentes y 4 definiciones incompatibles mostradas a la vez.** `client-detail.service` cuenta hechas/totales sobre TODOS los logs (sin filtro de dia de semana); `dashboard.service` y el % de "hoy" si filtran via `nutritionMealAppliesOnIsoYmdInSantiago`. El anillo de Overview, el strip de Nutricion, el KPI de dashboard y el badge de hoy pueden discrepar legitimamente para el mismo alumno. La UI envia InfoTooltips de disculpa. No hay fuente unica de verdad; erosiona la confianza en el dato.
11. **Consumido = adherencia al plan, no ingesta real.** `calculateConsumedMacrosWithCompletionFallback` acredita las macros planeadas completas al completar. No hay entrada fuera de plan, ni porcion >100%, ni codigo de barras. Los anillos pueden marcar 100% mientras el cliente comio algo distinto. Streak/heatmap premian marcar-hecho → es gameable y puede reforzar autoreporte deshonesto.
12. **Corrupcion de datos en produccion (comidas/planes vacios) sin atender.** Auditoria 2026-04-30 (`audit-nutrition-empty-meals.mjs`, manual, no en CI/cron) encontro 17 comidas vacias en 6 clientes — 2 clientes con planes enteramente vacios aun acumulando logs diarios. Nada impide guardar una comida vacia o activar un plan vacio; alimentan la matematica de adherencia y exportan a PDF como validos.
13. **El bulk-assign de org es destructivo, no selectivo y sin transaccion.** `assignOrgNutritionPlanTemplateToClientsAction` siempre apunta a TODOS los clientes activos (la UI implica un subconjunto), desactiva incondicionalmente los planes previos e inserta planes solo-macros (sin comidas), barriendo la personalizacion del coach, sin transaccion → un fallo a mitad deja clientes con cero plan activo.

**Las 5 mayores oportunidades:**

14. **El nicho Chile/Latam esta abierto y sin construir:** base de alimentos verificada y etiquetada por fuente (INTA/SAFOODS + FatSecret + Open Food Facts + USDA) con codigo de barras, mas intercambios chilenos nativos (Manual de Porciones de Intercambio, UDD 2021). Ningun competidor PT (Trainerize, That Clean Life) cierra el "dietitian wedge"; EVA tiene el metodo y el PDF white-label, solo le falta el dato citable.
15. **Logging multimodal en mobile** (codigo de barras + foto IA como borrador + voz) sobre `expo-camera` ya instalado pero sin afordancia — el lever de adherencia mas grande sin usar, y el momento de demo que gana coaches en 2026.
16. **Consolidar la nutricion en un hogar canonico** (hoy 9 puntos de entrada en la ficha del alumno) → menor time-to-value, menos soporte, menos material de onboarding, y una sola superficie sobre la cual construir.
17. **De-silar el modulo de composicion corporal** ($9.990 aparte) hacia el motor de objetivos: TDEE adaptativo desde ISAK/BIA (Mifflin por defecto, Cunningham/Katch-McArdle cuando hay masa magra) — historia natural de upsell de los dos modulos juntos.
18. **Monetizar el modulo de planificacion avanzada** con el split probado de la industria (tracking gratis / generacion-de-plan paga), mapeando la licencia de la base de datos de alimentos de terceros sobre `coach_addons`.

---

## 2. Como funciona hoy la nutricion en TODA la app

Modelo mental general: **prescripcion + adherencia, nunca ingesta**. El alumno no puede registrar un alimento que el coach no pre-planeo; las macros "consumidas" son `macros planeadas × % de completitud`. Flujo de datos canonico: RSC `_data/*.queries.ts` (React.cache) → estado borrador de `PlanBuilder` → server actions `_actions/*` → `NutritionService` / Supabase directo → `revalidatePath`.

### 2.1 Recorrido del coach (autoria)

**Builder.** `/coach/nutrition-plans` es el hub con 3 pestanas (Plantillas / Alumnos / Alimentos). `PlanBuilder` maneja modo `template` y modo `client-plan` (bien: poca divergencia entre modos de autoria), con sidebar de objetivos (kcal/P/C/F), sugeridor Mifflin-St Jeor, auto-sync objetivos↔alimentos, bloques de comida con dnd, y `FoodSearchDrawer` (solo alimentos locales). **Pero** los intercambios solo se adjuntan a planes de alumno: **las plantillas no pueden ser de intercambios** (el metodo pago "de los nutricionistas" no es reutilizable como plantilla).

**Templates (tres almacenes, dos sin salida).**
- `nutrition_plan_templates` (coach/org/team) → `template_meals` → `template_meal_groups` → `saved_meals` → `saved_meal_items`. Nota: `saved_meals` esta sobrecargada como biblioteca de comidas del coach Y como contenedor interno de join (`Internal_<name>_<Date.now()>`).
- `org_nutrition_templates` (org, separada): **dead-end** — ningun codigo la consume hacia un plan; su rico campo `meal_names` no se propaga a ningun lado.
- `nutrition_plan_templates.team_id` (pool plano de team): **sin UI alguna**.
Conviven actions legacy en FormData con actions en JSON = dos formatos de serializacion vivos.

**Foods.** Dos rutas de creacion (`FoodSearchDrawer.addCoachCustomFood` en JSON vs `AddFoodSheet.saveCustomFood` en FormData) con validacion/redondeo duplicados, y dos UIs de navegacion (`FoodSearchDrawer` vs `FoodBrowser`). 343 filas (316 globales / 27 de coach / **0 de org**), per-100g, **solo 4 macros**, columnas INTEGER (perdida de precision en items bajos en kcal/altos en grasa), sin flag de fuente/verificacion.

**Exchanges (intercambios).** Modulo limpio y de forma clinica: `exchange_groups` (8 de sistema C/P/F/V/LAC/ARL/SP/G + LEG compuesto, macros de referencia por porcion, flag `macros_confirmed`) → `meal_exchange_targets` (porciones/grupo/comida) + `nutrition_plan_day_variants`. Es el modulo de referencia arquitectonica; pero solo client-plan, con auto-save por debounce de 700 ms (distinto del guardado atomico de gramos).

**Cycles (periodizacion).** `nutrition_plan_cycles` (bloques por rango de semanas en jsonb, 1 activo por cliente), avanzados a diario por el cron `nutrition-cycles`. Es un tercer modelo de persistencia (otra action mas).

**Recipes.** `/coach/recipes` (Edamam) es una superficie de nutricion **completamente separada**, no cableada al builder ni al food-search de mobile.

### 2.2 Coach viendo al alumno — LA FRAGMENTACION

La nutricion **no tiene hogar canonico** en ninguna parte. En la revision de un solo alumno se filtra en 4 de 6 pestanas mas el dashboard = **9 puntos de entrada**, cada uno con razon de confundir:

1. **Dashboard `KpiStrip`** — la nutricion es un string-pista diminuto bajo "Adherencia", no un KPI propio. *Confunde:* parece secundaria a un sub-texto del KPI de entrenamiento.
2. **Dashboard `ClientStatsSheet`** — la nutricion es una 2da pestana oculta. *Confunde:* hay que saber que existe para abrirla.
3. **Client `ProfileTabNav` badge** — sobrecargado: o un "!" de riesgo O un conteo de comidas. *Confunde:* el mismo glifo significa dos cosas distintas.
4. **Overview `ProfileOverviewB3`** — un 3er anillo de adherencia "Nutricion (7d)". *Confunde:* numero distinto al del strip y al del badge para el mismo alumno.
5. **Overview `ProfileProgramSummaryCard`** — un punto rojo "Nutri. en riesgo" **dentro de la tarjeta de entrenamiento**. *Confunde:* la nutricion aparece sepultada en el dominio equivocado.
6. **Alerta superior de Overview** — regla nutricion<60%, **silenciosamente suprimida** por reglas de workout/checkin en una cascada de prioridad. *Confunde:* el riesgo nutricional desaparece sin que el coach sepa por que.
7. **Pestana Progreso** — 3 graficos de nutricion ocultos bajo un toggle-pill de *composicion corporal*. *Confunde:* la nutricion vive bajo otra etiqueta de dominio.
8. **Pestana Nutricion** — `NutritionTabB5` (mega-componente de 1411 lineas, ~12 cards, edicion + analitica mezcladas). *Confunde:* todo junto, sin jerarquia, imposible de escanear.
9. **La pestana Nutricion enlaza HACIA AFUERA** al builder y a "ver como alumno". *Confunde:* la revision y la edicion no estan en el mismo lugar.

Consecuencia: una revision semanal obliga a saltar por 5+ lugares para reconciliar numeros que no reconcilian. Ademas los colores de macros difieren entre la pagina (orange/blue/yellow) y el dashboard (rose/amber/emerald) — el coach aprende dos lenguajes de color.

### 2.3 Recorrido del alumno

`/c/[slug]/nutrition` → `NutritionShell`: comidas con tap-to-complete, porcion en % (25/50/75/100), satisfaccion (emoji 1-3), swaps de alimentos acotados por el coach, habitos/streak/heatmap. **Offline:** read-model + cola de toggles que se vacia al reconectar/foreground; logging optimista con haptics y confeti.

**Macros y adherencia:** lo que se muestra como "consumido" es adherencia al plan, no ingesta. Los anillos pueden leer 100% sin reflejar lo comido. **Habitos:** `daily_habits`. **Persistencia split-brain:** gramos guarda atomico, intercambios auto-guarda con debounce 700 ms, ciclos via otra action — sin estado unificado de "este plan esta guardado".

### 2.4 Org / Teams

Tres formas de tenant (standalone / org / pool de team). El **bulk-assign de org** (`assignOrgNutritionPlanTemplateToClientsAction`) apunta a TODOS los activos, desactiva incondicionalmente, inserta solo-macros sin comidas, sin transaccion (fallo parcial = clientes sin plan). La **propagacion** (`propagateTemplateChanges`) recorre clientes en serie con muchas queries awaited, sin `Promise.all`, sin transaccion DB, ignorando la mayoria de errores → para un team de 300, miles de round-trips en serie; un error a mitad deja unos clientes mutados y otros intactos. El pool de team (`team_id` en plantillas) **no tiene UI**.

### 2.5 Mobile (apps/mobile)

Espejo de solo-lectura del web. **Gaps de paridad:** el alumno no puede aplicar swaps del coach (`activeSwapMealIds` cableado-muerto), el modulo de intercambios entero esta ausente, no hay logging fuera de plan, los dias historicos muestran objetivos en vivo (no el snapshot `target_*_at_log`). `expo-camera` instalado pero **sin afordancia de codigo de barras/foto** — la mayor capacidad nativa sin usar. El loop de streak/confeti premia marcar-hecho (gameable; potencialmente shame-inducing).

---

## 3. Modelo de datos y arquitectura

**15 tablas con RLS, scoping 3-vias** (standalone / org / pool de team).

- **Prescripcion:** `nutrition_plans` (1/cliente; daily_calories/protein_g/carbs_g/fats_g; plan_mode `grams|exchanges`; template_id; org_id) → `nutrition_meals` (day_of_week, day_variant_id) → `food_items` (food_id, qty, unit, swap_options jsonb) → `foods` (per-100g, **4 macros** INTEGER + serving_size, is_liquid, exchange_* cols; 343 filas).
- **Plantillas:** `nutrition_plan_templates → template_meals → template_meal_groups → saved_meals → saved_meal_items` (+ `org_nutrition_templates` separada y dead-end).
- **Intercambios:** `exchange_groups` (8 sistema + LEG compuesto, macros por porcion, `macros_confirmed`) → `meal_exchange_targets` + `nutrition_plan_day_variants`.
- **Logging:** `daily_nutrition_logs` (UNIQUE client+plan+date, **snapshots `target_*_at_log`**) → `nutrition_meal_logs` (is_completed, consumed_quantity %, satisfaction_score) + `nutrition_meal_food_swaps`.
- **Versionado/periodizacion:** `nutrition_plan_history` (snapshot jsonb), `nutrition_plan_cycles` (bloques por rango de semanas jsonb, 1 activo/cliente).
- **Prefs/habitos:** `client_food_preferences` (favoritos), `daily_habits`.

**Capas (Clean Architecture).** El modulo de intercambios respeta dominio puro → calculo/reconcile → repositorio → Supabase. El camino de **gramos (`NutritionService`) habla con Supabase directo, salteando `nutrition.repository.ts`** (read-only, cero funciones de escritura) — violacion de pilar declarada.

**RLS y grants (hallazgos).** Contrario a la doctrina de hardening de `clients` en CLAUDE.md, las columnas de scope (`client_id`/`coach_id`/`org_id`) en `nutrition_plans` y `foods` son **UPDATE-grantables a `authenticated`**, gateadas solo por RLS WITH CHECK. `foods` no tiene allowlist de columna → un coach podria poner `coach_id→NULL` para empujar un alimento privado hacia el pool global (envenenamiento de catalogo compartido). No cubierto por `tests/separation/module-grants.sql`.

**Modulos de pago / gating.** Dos gates paralelos sin resolver unificador: tier `canUseNutrition` inline en RSC vs `enabled_modules`/`coach_addons` via `assertModule`; la cross-dependencia nutricion↔composicion corporal se aplica a mano en solo 2-3 call sites. El modulo de nutricion ($9.990) y el de composicion corporal ($9.990) estan silados entre si. `coach_addons` no tiene dimension de licencia de datos de terceros.

**Crons.** `nutrition-reminder` (push si no hay log) y `nutrition-cycles` (avance de bloque): console-only, sin alerting, sin aislamiento por fila (una fila mala aborta toda la corrida del tenant), reminder sin batch ni rate-limit (riesgo de timeout de Vercel a escala) y dispara aun sin nada prescrito hoy.

---

## 4. Brechas vs best-in-class 2026

| Capacidad | Lider de mercado | EVA hoy | Brecha | Prioridad |
|---|---|---|---|---|
| Base de alimentos verificada + provenance | Cronometer, Fitia (NCCDB/USDA, source-tagged) | 343 filas coach-typed, INTEGER, sin source/verified | No hay dato citable ni verificado; nicho INTA/SAFOODS abierto | P0 |
| Panel de micronutrientes | Cronometer 84+, Nutrium | Solo kcal/P/C/F | Imposible caso clinico (HTA, renal, diabetes, embarazo) | P0 |
| Codigo de barras | Kahunas 600k barcodes, MyFitnessPal | `expo-camera` instalado, sin afordancia | Captura mas rapida/precisa ausente | P0 |
| Logging multimodal (foto/voz/barcode/texto) | Cal AI, MacroFactor, Nutrola | Solo tap-to-complete de plan | ~3x tasa de logging que captura manual, no disponible | P0 |
| Ingesta real vs adherencia | MacroFactor, MyFitnessPal | Consumido = adherencia (gameable) | No hay entrada fuera de plan ni >100% porcion | P0 |
| Fuente unica de adherencia | Cualquier app seria | 2 formulas / 4 definiciones simultaneas | Numeros que no reconcilian; tooltips de disculpa | P0 |
| Intercambios chilenos (7 grupos) | Fitia (Latam) | Modulo de intercambios solido pero client-plan-only | No hay plantillas de intercambio; metodo no reutilizable | P1 |
| Auto-scaling deterministico de porciones | That Clean Life, EatLove | Manual / sugeridor opcional | No escala a 30-80+ clientes | P1 |
| PDF white-label de plan + portal | Promealplan, EatLove | PDF white-label OK | Branding al output existe; portal/app si (PWA) | Logrado parcial |
| Filtros de alergia/intolerancia | Promealplan 200+ filtros | `client_food_preferences` solo fija favoritos | No bloquea alergenos al prescribir/intercambiar | P1 |
| TDEE adaptativo + ecuacion por LBM | MacroFactor | Mifflin opcional, valor congelado | Sin adaptacion; modulo body-comp silado | P2 |
| Sync wearables / Apple Health / CGM | Cronometer Pro, Oura | Nada | Sin import de peso/gasto/sueno/glucosa | P3 |
| Templates de condicion (diabetes, CKD, PCOS, FODMAP) | That Clean Life 150+ | Ninguna | Sin cobertura clinica out-of-the-box | P1 |
| Recordatorios contextuales | Apps 2026 | Cron global, dispara sin prescripcion hoy | No al horario propio del cliente; entrena a desactivar push | P2 |
| Observabilidad de crons | Estandar SaaS | console-only, sin alerting | Fallo silencioso de recordatorios/ciclos indetectable | P1 |

---

## 5. Que necesita un NUTRICIONISTA PROFESIONAL que hoy no puede hacer

- **Manejar cualquier caso clinico** — no hay fibra, sodio, azucar, grasa saturada/insaturada ni micronutrientes (hierro/calcio/potasio/etc.); solo kcal/P/C/F. Bloquea HTA, renal, diabetes, embarazo, GI, deficiencias.
- **Confiar en el dato de alimentos** — sin provenance/source/verified, sin tabla USDA/INTA/nacional ni codigo de barras en el builder; macros tipeadas por el coach y redondeadas a INTEGER. Edamam solo vive en `/coach/recipes`, no en el builder ni en mobile.
- **Derivar objetivos desde la evaluacion** — `daily_calories` es practicamente texto libre; sin motor BMR/TDEE cableado mas alla del sugeridor Mifflin opcional; la nutricion esta silada del add-on `body_composition`, asi que los objetivos no consumen masa magra ISAK/BIA.
- **Forzar seguridad** — sin cross-check de kcal (`4P+4C+9F ≈ kcal` nunca validado); en modo intercambios las porciones prescritas pueden no alcanzar el objetivo de kcal/proteina (el banner de 5% es solo-gramos); unica baranda es la alerta hardcodeada kcal<1200 (sin tope superior, sin piso de proteina).
- **Modelar al cliente** — sin alergia/intolerancia/disgusto estructurado (`client_food_preferences` solo fija favoritos, nunca bloquea un alergeno); sin porcion comestible/crudo-cocido; sin timing por comida mas alla de una nota libre; sin hidratacion/suplemento/receta estructurados; sin notas clinicas/SOAP.
- **Construir artefactos RD-grade reutilizables** — el modo intercambios es client-plan-only (sin plantillas de intercambio); las plantillas de org no llevan comidas/alimentos/timing; sin "insertar comida guardada/receta" en el canvas (rearmar alimento por alimento cada vez).
- **Obtener monitoreo confiable** — la adherencia es "comidas marcadas", no cumplimiento de nutrientes vs objetivo; los numeros consumidos son estimados, no ingesta real; la periodizacion auto-avanza por calendario sin checkpoint que requiera revision RD antes del siguiente bloque.
- **Revisar eficientemente** — una revision semanal obliga a saltar entre el anillo de Overview, el punto rojo del programa, la alerta superior (a menudo suprimida), la pestana Nutricion (12 cards), los graficos ocultos de Progreso y el builder, con numeros de adherencia que no reconcilian.

**Neto:** EVA es una **herramienta competente de macros e intercambios para un coach de entrenamiento personal** — fuerte UX de loop diario, soporte offline real, metodo de lista de intercambios de forma clinica, gating disciplinado. El pitch pago "el metodo de los nutricionistas" vende el **artefacto** (un PDF de intercambios prolijo y con marca), no el **razonamiento** (evaluacion → calculo de requerimiento → adecuacion → monitoreo) que un dietista licenciado necesita.

---

## 6. Veredicto por rol (14 roles)

1. **Software Architect.** Herramienta de macros+intercambios bien construida con un modulo de intercambios genuinamente limpio, pero estructuralmente capada bajo grado clinico por el techo de 4 macros, dos generaciones de backend lado a lado y sin fuente unica de verdad de adherencia ni de estado "guardado". **P0:** elevar el esquema de `foods` (NUMERIC + nutrientes + source/verified) antes de cualquier UI.

2. **Backend Engineer.** Backend CRUD solido con un modulo limpio (intercambios) atornillado a un camino legacy directo-a-Supabase; correctitud minada por 2 formulas de adherencia, conflacion ingesta-vs-adherencia y bulk/propagacion sin transaccion que corrompen datos productivos. **P0:** extraer un servicio canonico de adherencia + consumidas y rutear gramos por el repositorio.

3. **Frontend Engineer (Web).** UX de loop diario fuerte sobre un grafo de componentes fragmentado: nutricion sin hogar canonico, 4 numeros de adherencia incompatibles en 9 puntos de entrada, y `NutritionTabB5` de 1411 lineas. **P0:** extraer un selector `useNutritionAdherence` unico + primitivas (`AdherenceRing`, `MacroBars`, `MealAdherenceList`, `ConsumedVsTarget`).

4. **Mobile Engineer.** PWA web-first competente con loop offline solido, pero la app RN es un espejo de solo-lectura que ignora cada afordancia nativa (camara/barcode/foto/HealthKit) que define 2026. **P0:** scanner de codigo de barras sobre `expo-camera` ya instalado, cableado a lookup de alimentos region-layered + logging fuera de plan.

5. **DevOps Engineer.** El sistema embarca features pero es operacionalmente ciego e inseguro a escala: crons console-only sin alerting, jobs bulk/propagacion sin transaccion que corrompen en fallo parcial, sin job de data-quality en CI, y gaps de grant que permiten re-scoping cross-tenant. **P0:** logging estructurado + alerting + heartbeats en ambos crons de nutricion.

6. **QA Automation Engineer.** La capa de calculo puro esta bien testeada; todo lo demas (flujo gramos build→assign→log→review, acuerdo de formula de adherencia, RLS de tablas legacy, invariantes de integridad, paridad mobile) sub-testeado o sin testear, y nada corre en CI. **P0:** un E2E "golden" para el flujo de gramos que ademas pinee el contrato de adherencia en las 4 superficies.

7. **Security Engineer.** Funcional pero no isolation-safe: grants de UPDATE a nivel columna en `nutrition_plans`/`foods` permiten re-scoping cross-tenant, y el producto maneja PII de salud sin etiquetar y sin hardening clinico. **P0:** REVOKE UPDATE tabla + GRANT allowlist de columnas excluyendo scope en `nutrition_plans`/`foods`.

8. **Product Manager.** EVA vende "el metodo de los nutricionistas" pero embarca el artefacto (un PDF con marca) sin el razonamiento que un RD real necesita; fragmentacion, techo de 4 macros y conflacion ingesta-vs-adherencia la capan bajo grado clinico y bajo lo que gana deals. **P0:** reposicionar el mensaje YA y fundar el piso clinico (micros + dato verificado) como inversion.

9. **UX/UI Designer.** El loop de logging diario es genuinamente fuerte, pero la experiencia coach es un laberinto fragmentado y poco confiable (9 puntos de entrada, 4 numeros de adherencia, builder partido) que se lee como herramienta de macros de PT disfrazada de nutricionista. **P0:** un solo hogar de Nutricion por alumno y matar los otros 8 puntos de entrada.

10. **Head of Sales (B2B).** Vendible hoy como herramienta white-label de coach con PDF de intercambios, pero pierde todo deal con un nutricionista licenciado en la sala — techo de 4 macros, numeros de "ingesta" falsos y base de alimentos no citable son tres objeciones que matan demo. **P0:** base de alimentos verificada, Chile-layered y source-tagged con codigo de barras.

11. **SDR.** EVA vende hoy un hermoso "PDF de intercambios" que gana coaches pero queda descalificada en las primeras tres preguntas de un nutricionista real (dato chileno, micros, verdad de ingesta) — el hook abre la puerta equivocada. **P0:** re-enmarcar el hook a lo que realmente tenemos ("intercambios chilenos + tu marca + app del alumno incluida").

12. **Customer Success Manager.** Trampa de adopcion para la persona a la que se vende: onboardea bien a un PT pero repele a un nutricionista licenciado (sin base verificada, sin micros, confusion ingesta-vs-adherencia, numeros que no reconcilian), y la fragmentacion garantiza carga de soporte recurrente. **P0:** colapsar la adherencia a UNA definicion y UN numero, identico en todas partes.

13. **Legal & Compliance (Chile).** EVA procesa datos de salud a escala sin capa de consentimiento, sin clasificacion de categoria, sin controles DPA y con columnas de tenant re-scopables — no cumple Ley 21.719 (vigente dic 2026) y carga exposicion medical-scope y SERNAC hoy. **P0:** consentimiento de salud explicito y versionado al asignar el plan.

14. **Fintech / Integraciones.** Nutricion auto-hospedada, coach-typed, con cero integraciones de dato externo y una capa de billing estructuralmente sana pero que vende el artefacto (PDF), no el dato citable. **P0:** agregar provenance source/verified a `foods` y luego layerear un catalogo region-tiered.

---

## 7. Recomendaciones priorizadas

Esfuerzo: S (dias) / M (1-2 semanas) / L (semanas) / XL (mes+). Impacto: alto/medio.

### P0 — Piso de credibilidad y correctitud (sin esto no se toma en serio ni es seguro)

| ID | Titulo | Descripcion | Esfuerzo | Impacto | Area |
|---|---|---|---|---|---|
| P0-1 | Esquema de alimentos verificado y con micros | Migrar `foods` a NUMERIC + nutrientes (fibra/sodio/azucar/sat/insat primero, panel vit/min como nullable o sidecar `food_nutrients`); agregar `source` (inta_safoods\|fatsecret\|open_food_facts\|usda\|coach) + `verified` + external id; rankear verificado/local primero. Aditiva, forward-only. Desbloquea todo lo clinico. | XL | alto | DB |
| P0-2 | Adherencia: una funcion pura unica | Extraer `computeAdherence(plan, logs, date\|range, tz)` day-of-week-aware en `lib/nutrition-utils`, consumida por client-detail, dashboard, anillo, strip, badge y PDF; borrar la formula divergente y los InfoTooltips. | M | alto | Backend/FE |
| P0-3 | Etiquetar consumido como adherencia | Renombrar todo "consumido" a "cumplimiento del plan (estimado)" en web/mobile/PDF hasta que exista ingesta real. Cambio de copy, cero schema. | S | alto | FE/Mobile |
| P0-4 | Hardening de grants de scope | REVOKE UPDATE tabla + GRANT allowlist de columnas en `nutrition_plans` y `foods` excluyendo client_id/coach_id/org_id; cerrar `foods.coach_id→NULL`. Extender `tests/separation/module-grants.sql`. | S | alto | DB/Security |
| P0-5 | Guard de planes/comidas vacios + limpieza | CHECK/trigger bloqueando activacion de plan sin comidas y guardado de comida sin items; limpiar las 17 comidas / 2 planes vacios conocidos; promover `audit-nutrition-empty-meals.mjs` a cron con alerting. | M | alto | DB/DevOps |
| P0-6 | Bulk-assign y propagacion transaccionales | Reimplementar como RPC SECURITY DEFINER set-based, all-or-nothing, selectivo (honrar el subconjunto de la UI), con errores surfaceados; propagar `meal_names` o matar la tabla muerta. | L | alto | Backend/DB |
| P0-7 | Codigo de barras en mobile | `expo-camera` → Open Food Facts (gratis) → FatSecret (SKUs Latam) con source/verified; escribir a una fila de ingesta fuera de plan; confirmacion de 1 toque antes de guardar. | L | alto | Mobile |
| P0-8 | Observabilidad de crons | Wrapper con start/finish estructurado (filas/errores/duracion), heartbeat dead-man's-switch, error a Sentry + alerta, tabla `cron_runs`. Aislamiento por fila + batch/rate-limit del reminder + early-exit si nada prescrito hoy. | M | alto | DevOps |
| P0-9 | Consentimiento de salud (Ley 21.719) | Capturar consentimiento granular y versionado antes de mostrar/almacenar el primer plan (proposito, categorias, procesadores, timestamp, retiro); bloquear visibilidad hasta consentir. | M | alto | Legal/Backend |

### P1 — Habilitacion profesional / nicho abierto

| ID | Titulo | Descripcion | Esfuerzo | Impacto | Area |
|---|---|---|---|---|---|
| P1-1 | Catalogo region-tiered Chile/Latam | Ingesta INTA/SAFOODS (manual, sin API) + FatSecret API (marcas/barcodes Latam) + Open Food Facts + USDA fallback; verificado/local primero; cablear al builder y al food-search de mobile; reusar el patron del adapter de Edamam. | XL | alto | DB/Backend |
| P1-2 | Ingesta real fuera de plan | Fila de ingesta desacoplada de la prescripcion (resultado de barcode, quick-add, recientes/copiar comida) + snapshot de macros por log; separar "siguio el plan" de "cumplio el objetivo". | XL | alto | Backend/Mobile |
| P1-3 | Intercambios chilenos como plantilla + swaps macro-matched | Adoptar el Manual de Porciones de Intercambio (7 grupos, UDD 2021); auto-scaling deterministico a objetivos por cliente; swaps de 1 toque alergia-aware; plantillas de intercambio (hoy client-plan-only). | XL | alto | Backend/FE |
| P1-4 | Filtros de alergia/intolerancia | Promover `client_food_preferences` de "fija favoritos" a capa estructurada que BLOQUEA/advierte al agregar un alergeno y alimenta swaps alergia-aware; panel persistente en el builder. | L | medio | FE/Backend |
| P1-5 | Snapshot de nutrientes por log + reconciliacion por id | Snapshot de macros consumidas en `nutrition_meal_logs` (patron `target_*_at_log`) para que editar un alimento no reescriba historia; cambiar reconciliacion de gramos de `order_index` a id. | M | medio | Backend/DB |
| P1-6 | Resolver unico de entitlement | `canUseNutritionFor(actor, planMode)` que resuelve tier + `enabled_modules`/`coach_addons` + cross-dependencia en un solo lugar; todo RSC y mutacion lo llama. | M | medio | Backend/Security |
| P1-7 | Consolidar nutricion en un hogar canonico | Una pestana Nutricion canonica; degradar los otros 8 puntos a deep-links consistentes; partir `NutritionTabB5` en review vs edit; estado dirty/saved unico; una ruta de crear-alimento, una de navegar; plegar `/coach/recipes` al food-search. | L | medio | FE |
| P1-8 | Suite RLS gramos + invariantes en el gate | `tests/separation/nutrition-grams-isolation.sql` (tx+ROLLBACK, claims, nunca service_role) sobre `nutrition_plans/meals/food_items/daily_nutrition_logs/nutrition_meal_logs` + asserts de invariante (sin plan activo sin comidas). | M | alto | QA |
| P1-9 | Derechos ARCOP del alumno | Export de 1 toque (nutricion+adherencia+body-comp) y flujo delete/anonimizar que barre las 15 tablas + snapshots jsonb + caches AsyncStorage; politica de retencion. | L | alto | Legal/Backend |
| P1-10 | DPAs + registro de sub-procesadores | Acuerdos escritos con Edamam/FatSecret/Open Food Facts; base de transferencia internacional; minimizar payload (strings de alimento, nunca identificadores de cliente); lista en la politica de privacidad. | M | alto | Legal |

### P2 — Retencion, loop de coaching y diferenciacion

| ID | Titulo | Descripcion | Esfuerzo | Impacto | Area |
|---|---|---|---|---|---|
| P2-1 | UX adherencia-neutral | Streaks reiniciables ("5 de 7 dias"), sin estilo rojo de over-budget, sin shame pop-ups; afordancia "comi algo distinto / fuera del plan". | M | medio | FE/Mobile |
| P2-2 | Sistema de diseno de macros + WCAG 2.2 AA | Un set de tokens P/C/F compartido web/dashboard/PDF/mobile; color nunca como unica senal (labels para daltonicos); contraste ≥4.5:1 en ambos temas; targets 44/48px; Dynamic Type; aria-labels en emoji/iconos. | M | alto | FE/Mobile |
| P2-3 | TDEE adaptativo + ecuacion por LBM | Reverse-calcular TDEE desde ingesta logueada + tendencia de peso; Mifflin por defecto, Cunningham/Katch-McArdle cuando hay masa magra del modulo body-comp; defaults protein-forward; cross-check `4P+4C+9F≈kcal` server-side. | L | medio | Backend |
| P2-4 | Recordatorios contextuales | Batch + rate-limit (Upstash), saltar clientes sin prescripcion hoy, disparar al horario propio del cliente (o ~30 min tras ventana perdida), fallback ~18:00 Santiago. | M | medio | Backend/DevOps |
| P2-5 | Check-in como pegamento | Unir nutricion + entrenamiento + fotos + mensajeria en un portal con historia trackeada; inbox unico de revision de nutricion ranqueado por riesgo. | M | medio | FE/Producto |
| P2-6 | Templates de condicion | Diabetes, CKD, PCOS, low-FODMAP, cardiaco como plantillas de intercambio reutilizables. | L | medio | Producto/DB |
| P2-7 | Harness behavioral mobile (Maestro/Detox) | Flujo offline toggle + drain dedup; assert de lectura de `target_*_at_log` historico; base para cubrir captura barcode/foto. | L | medio | QA |

---

## 8. Plan por fases

### Fase 0 — Consolidar la fragmentacion (semanas 1-3)
*Objetivo: dejar de contradecirnos en pantalla y detener la corrupcion silenciosa antes de construir nada nuevo.*

Entregables: P0-2 (adherencia unica), P0-3 (etiquetar consumido), P0-4 (grants), P0-5 (guard vacios + cron), P0-8 (observabilidad crons), P1-7 (hogar canonico de nutricion, fase de colapso), P2-2 (tokens de macro + accesibilidad). DoD: un solo numero de adherencia en las 4 superficies; cero planes activos vacios; ambos crons con heartbeat y alerta; colores de macro unificados; copy "cumplimiento del plan" en web/mobile/PDF.

### Fase 1 — Fundaciones (semanas 3-8)
*Objetivo: el piso de credibilidad de dato y la seguridad de las mutaciones a escala.*

Entregables: P0-1 (esquema verificado + micros), P0-6 (bulk/propagacion transaccional), P0-9 (consentimiento), P1-5 (snapshot por log + reconciliacion por id), P1-6 (resolver de entitlement), P1-8 (suite RLS gramos), P1-10 (DPAs). DoD: `foods` NUMERIC con source/verified backfilleado; bulk-assign selectivo y atomico; consentimiento bloqueante; historia reproducible; gate de modulo unico.

### Fase 2 — Features pro (semanas 8-16)
*Objetivo: cerrar el dietitian wedge y la captura real.*

Entregables: P1-1 (catalogo region-tiered), P0-7 + P1-2 (barcode + ingesta fuera de plan), P1-3 (intercambios chilenos como plantilla + auto-scaling + swaps), P1-4 (alergias), P1-9 (ARCOP), P2-3 (TDEE adaptativo de-silando body-comp), P2-6 (templates de condicion). DoD: alumno escanea y registra fuera de plan en mobile; plantillas de intercambio reutilizables; objetivos derivados de evaluacion; export/delete de datos del alumno.

### Fase 3 — Diferenciacion / IA (semanas 16+)
*Objetivo: la frontera 2026.*

Entregables: foto IA como borrador confirm/correct con confidence (post P1-2), sync Apple Health / Health Connect (peso primero), CGM Dexcom/Libre para clientes metabolicos, widget de pantalla de inicio / lock-screen quick-log, voz, modo nutricionista (notas SOAP, checkpoint de revision antes de avanzar ciclo). DoD: captura multimodal en el momento de comer; import de tendencia de peso; experiencia clinica de revision.

---

## 9. Ideas atrevidas / diferenciadores

1. **Logging por foto con IA como borrador** — `expo-camera` → draft por item con indicador de confianza, reconciliado contra el catalogo verificado, correccion de 1 toque. Asistivo, nunca auto-commit (platos latinoamericanos bajan la precision de IA a 60-75%).
2. **Base de alimentos Chile/Latam verificada y source-tagged** — INTA/SAFOODS + FatSecret + Open Food Facts + USDA, rankeando verificado/local primero. El moat mas fuerte vs apps US.
3. **Intercambios chilenos pro (7 grupos, UDD 2021)** como afordancia de autoria primaria con cards de equivalencia y swaps macro-matched alergia-aware — distinto de las listas ADA estadounidenses.
4. **Codigo de barras → SKU de supermercado chileno** via FatSecret/Open Food Facts: el momento de demo que gana coaches en 2026.
5. **Integracion Apple Health / Health Connect** — import de peso/gasto/sueno para alimentar TDEE adaptativo y sacar la pesada manual del check-in.
6. **Modo nutricionista** — campo de credencial profesional, notas SOAP, gating de scope-of-practice, checkpoint de revision RD antes de aplicar el siguiente bloque de periodizacion.
7. **TDEE adaptativo** que reverse-calcula desde ingesta logueada + tendencia de peso (converge en 2-3 semanas) en vez de congelar el valor del calculador de signup, con ecuacion gateada por captura de masa magra.
8. **Inbox unico de revision de nutricion** cross-cliente ranqueado por riesgo (baja adherencia, plan vacio, sin log en N dias) con feedback timely-specific y video async.
9. **Widget de pantalla de inicio / lock-screen** con anillo/barras de hoy y relog de 1 toque de comidas recientes — pone el logging frente al usuario con tax casi cero (el fallo #1 del foto-logging es olvidar antes de comer).
10. **CGM Dexcom/Libre** nativo para clientes metabolicos — cada vez mas esperado en trabajo metabolico.
11. **De-silado nutricion ↔ composicion corporal** como upsell combinado ("compra los dos modulos, trabajan juntos"): los objetivos consumen ISAK/BIA del modulo body-comp.
12. **Panel "cumple DRI" vs "cumple objetivo de entrenamiento"** — separar el piso de salud del objetivo de performance (proteina 1.6-2.2 g/kg).
13. **CGM + diet-pattern / ventana de ayuno** como modos de engagement matcheados al lever real del cliente.

---

## 10. Riesgos y mitigaciones

### Tecnicos
- **Corrupcion de datos a escala de team** (bulk/propagacion sin transaccion) → RPCs transaccionales set-based con aislamiento por fila y reporte de fallo (P0-6); guard de invariantes en CI (P0-5); harness de regresion failing-first contra una branch de Supabase antes de tocar un team de 300.
- **Historia no reproducible** (edicion de alimentos reescribe logs pasados; reconciliacion posicional) → snapshot de nutrientes por log + reconciliacion por id (P1-5).
- **Fallo silencioso de crons** → heartbeat + alerting + `cron_runs` (P0-8).
- **Dos generaciones de backend / deuda compuesta** → rutear gramos por `nutrition.repository.ts`, colapsar a un formato de serializacion (JSON), resolver el destino de las tablas/pools muertos.

### Legales (Chile)
- **Ley 21.719 (datos sensibles de salud, vigente dic 2026; multas hasta ~UTM 5.000 / ~10% ingresos)** → consentimiento explicito y versionado (P0-9); ARCOP (P1-9); clasificar tablas como datos de salud + Registro de Actividades de Tratamiento; auditoria de acceso en lecturas cross-actor (reusar patron `org_audit_logs`/`audit_log_checksums`).
- **Scope medico / profesion regulada** — coach sin credencial prescribiendo planes bajo marca clinica → campo de credencial + gating de scope + disclaimer en cada render de plan (no solo en el PDF) + barandas de seguridad (piso/techo de kcal, piso de proteina, cross-check `4P+4C+9F`).
- **SERNAC / publicidad enganosa** — el claim "el metodo de los nutricionistas" vs lo entregado → substanciar (plantillas RD-validadas, intercambios per Manual chileno, biblioteca de recetas validada) o suavizar el copy; guardar evidencia datada. Evidencia de billing contradictoria (adherencia con 2 formulas, consumido que no es ingesta, PDFs de planes vacios) → fuente unica de adherencia + etiquetado honesto + guard de vacios.
- **Transferencias internacionales** (Edamam, FatSecret, foto IA) → DPAs + registro de sub-procesadores + base de transferencia (P1-10).

### De producto
- **Posicionamiento vs realidad** — vendemos un producto de nutricionista que no tenemos → reposicionar el mensaje YA (P0-3 + reframe del hook a "intercambios chilenos + tu marca + app del alumno incluida") y fundar el piso clinico como inversion.
- **Metrica gameable / autoreporte deshonesto** — streak/heatmap premian marcar-hecho → UX adherencia-neutral + ingesta real (P1-2, P2-1).
- **Fragmentacion que infla soporte y onboarding** → hogar canonico (P1-7).
- **Paridad mobile rota** (swaps muertos, intercambios ausentes, objetivos en vivo) → cerrar paridad en Fase 2; mientras tanto, cablear `activeSwapMealIds` y leer `target_*_at_log` historico (quick wins).

---

### Quick wins inmediatos (transversales, bajo esfuerzo, alto retorno)
- Re-etiquetar "consumido" → "cumplimiento del plan (estimado)" en web/mobile/PDF.
- Colapsar adherencia a una formula day-of-week-filtered y borrar los InfoTooltips de disculpa.
- REVOKE UPDATE + allowlist de columnas en `nutrition_plans` y `foods` (cierra el hueco de re-scope; espeja la doctrina de `clients`).
- Guard de comidas/planes vacios + promover `audit-nutrition-empty-meals.mjs` a cron con alerta; limpiar las 17 comidas / 2 planes conocidos.
- Cambiar reconciliacion de gramos de `order_index` a id.
- Cross-check `4P+4C+9F ≈ kcal` y tope superior de kcal sobre la baranda existente <1200.
- Early-exit del reminder cuando no hay nada prescrito hoy.
- Unificar colores de macro entre pagina y dashboard.
- Cablear `activeSwapMealIds` en mobile y leer `target_*_at_log` historico.
- Cablear `/coach/recipes` (Edamam) al food-search del builder en vez de dejarlo huerfano.
- Agregar `foods.source` + `foods.verified` (default coach_custom/false) como groundwork de provenance antes de la ingesta del catalogo.