# Analisis del Modulo de Nutricion  -  EVA Fitness Platform

> **Fecha:** 2026-04-30 
> **Alcance:** Arquitectura, flujos, integraciones, errores detectados, plan de mejora, estrategia de migracion y vision multi-disciplinaria. 
> **Estado:** Documento vivo. Incluye ejecucion incremental ya aplicada en codigo (desde 2026-04-27). Sincronizado con nuevabibliadelaapp sesion 11 (2026-04-27) + items hasta 2026-04-30.

---

## 1. Vision General

El modulo de nutricion es uno de los mas complejos del codebase. Cubre:

- **Coach:** Creacion de plantillas, biblioteca de alimentos, asignacion a alumnos, edicion custom por alumno, seguimiento de adherencia.
- **Alumno:** Visualizacion de plan diario, marcar comidas completadas, resumen de macros, historial de adherencia 30 dias, integracion con dashboard.
- **Datos:** 13 tablas en PostgreSQL, servicio central `NutritionService`, busqueda con `unaccent`, comidas guardadas reutilizables (`saved_meals`).

**Aclaracion fundamental:** La unidad base del sistema son **alimentos** (`foods`). Los planes asignan alimentos a comidas (`meals`). No se usan recetas como objeto principal del flujo  -  la tabla `recipes` existe pero es periferica; no forma parte del flujo coach  ->  alumno. El flujo correcto es: `Coach agrega alimento  ->  define cantidad (g/un)  ->  lo asigna a una comida  ->  esa comida vive en el plan del alumno`.

**Completitud funcional:** ~98%. Core solido + food swaps, favoritos, habitos, feedback emoji, registro gradual, ciclos, historial versiones, offline, tooltips, onboarding coach, macros sugeridos, creacion inline, exportacion, alertas, integracion check-in/workout implementados. Pendiente operativo: saneamiento planes vacios en prod + credenciales E2E estables.

---

## 2. Arquitectura Actual

### 2.1 Modelo de Datos (13 tablas activas)

```
PLANTILLAS (Coach)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
nutrition_plan_templates
 """? template_meals
 """? template_meal_groups
 """? saved_meals ? Comidas reutilizables del coach
 """? saved_meal_items ? Alimentos en esa comida
 """? foods ? Base de datos de alimentos

PLANES ACTIVOS (Alumnos)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
nutrition_plans (is_active, is_custom, template_id)
 """? nutrition_meals
 """? food_items
 """? foods

TRACKING DIARIO
" -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
daily_nutrition_logs ? Un log por alumno por dia (snapshot de targets)
 """? nutrition_meal_logs ? Estado completado/no de cada comida

CATALOGO DE ALIMENTOS
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
foods (name, calories, protein_g, carbs_g, fats_g, serving_size, unit, category, coach_id)

PERIF?RICO (no parte del flujo principal)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
recipes ? Recetas con ingredientes, creadas por coach
recipe_ingredients ? Ingredientes de cada receta
meal_completions ? Vista de solo lectura (derivada de `nutrition_meal_logs`); tabla legacy eliminada en migracion `20260428041909_meal_completions_view_and_nutrition_day_of_week.sql` (remoto y repo alineados).
```

### 2.2 Flujo de Datos Coach  ->  Alumno

```
1. Coach busca alimentos (foods) en biblioteca
 ",
 -
2. Coach arma comidas (meals) + asigna alimentos con cantidad + unidad (g / un)
 ",
 -
3. Coach guarda como plantilla (nutrition_plan_templates)
  ->  persiste en: template_meals  ->  template_meal_groups  ->  saved_meals  ->  saved_meal_items
 ",
 -
4. Coach asigna plantilla a cliente(s)  ->  propagateTemplateChanges()
  ->  Desactiva plan previo (is_active = false)
  ->  Inserta nutrition_plans (is_custom = false, template_id = X)
  ->  Clona nutrition_meals + food_items
 ",
 -
5. Alumno ve en /c/[slug]/nutrition
  ->  getActiveNutritionPlan()  ->  meals + food_items + foods
  ->  getNutritionLogForDate()  ->  daily_nutrition_logs + nutrition_meal_logs
  ->  toggleMealCompletion()  ->  upsert log + revalidatePath
```

### 2.3 SYNCED vs CUSTOM

| Tipo | Origen | Editable por coach | Se actualiza al editar template |
|------|--------|-------------------|--------------------------------|
| **SYNCED** | Plantilla asignada | Si, via plantilla | Si  -  propagacion destruye y recrea (BUG) |
| **CUSTOM** | Edicion directa en alumno | Si, via `/client/[id]` | No  -  desvinculado permanentemente |

**Problema critico:** La propagacion SYNCED es **destructiva**. Borra el plan e inserta uno nuevo con distinto `plan_id`. Los `daily_nutrition_logs` del alumno quedan huerfanos porque apuntan al `plan_id` anterior. Si el coach edita una plantilla  ->  el alumno pierde su historial de racha y adherencia.

### 2.4 Rutas del Sistema

```
Coach:
 /coach/nutrition-plans  ->  NutritionHub (tabs: Plantillas | Planes activos | Asignar)
 /coach/nutrition-plans/new  ->  PlanBuilder (crear plantilla)
 /coach/nutrition-plans/[id]/edit  ->  PlanBuilder (editar plantilla)
 /coach/nutrition-plans/client/[id]  ->  PlanBuilder (plan custom del alumno)
 /coach/foods  ->  Catalogo de alimentos
 /coach/meal-groups  ->  Gestion de comidas guardadas
 /coach/clients/[id]  ->  Perfil alumno (incluye NutritionTabB5)

Alumno:
 /c/[coach_slug]/nutrition  ->  Vista principal del plan
 /c/[coach_slug]/dashboard  ->  Incluye NutritionDailySummary widget
```

---

## 3. Integracion con el Resto de la App

### 3.1 Dashboard del Alumno

- `NutritionDailySummary` (RSC) muestra resumen compacto con `MacroBar` + `MealCompletionRow`.
- `MealCompletionRow` usa `useOptimistic` + `toggleMealCompletion`. Al completar, hace `router.refresh()` para sincronizar dashboard.
- `ComplianceRing` muestra score de nutricion 30 dias (dias con log / 30).
- `RestDayCard` en dias sin entreno linkea a nutricion.

**Evaluacion:** Buena integracion. El toggle rapido desde dashboard es UX clave. Funciona bien.

### 3.2 Perfil del Alumno (vista coach)

- `NutritionTabB5` muestra plan activo, badges SYNCED/CUSTOM, macros meta, grafico pie, heatmap 30 dias, grafico compuesto 7 dias, historial tabla, `DayNavigator`.
- Link directo a editar plan o "ver como alumno".

**Evaluacion:** Muy completa. Es la vista mas rica del modulo. El grafico compuesto barras vs linea meta es el mejor insight para el coach.

### 3.3 Check-in

- El check-in guarda peso, energia, fotos en `check_ins`.
- **No hay vinculacion directa** entre `check_ins.weight` y `daily_nutrition_logs`.
- El coach ve peso/energia en su dashboard, pero no hay ajuste automatico de calorias ni alerta del tipo "Tu alumno bajo 2kg, revisar plan - .

**Evaluacion:** Oportunidad de alto valor no aprovechada. El peso del check-in deberia cruzarse con adherencia para dar contexto al coach.

### 3.4 Directorio de Clientes (Coach)

- `ClientCardV2` tiene boton "Nutri" que va directo al plan del alumno.
- Muestra adherencia/peso/energia en la tarjeta.

**Evaluacion:** Bien. Acceso rapido clave para operacion diaria del coach.

### 3.5 Workout

- **Cero integracion** entre entrenamiento y nutricion.
- No hay pre/post-workout meals destacadas, ni recomendaciones de timing, ni ajuste de carbs segun tipo de entreno.
- `workout_logs` existe con tipo de entreno pero no se cruza con el plan nutricional.

**Evaluacion:** Brecha importante. El plan es 100% estatico frente al entrenamiento.

---

## 4. Fortalezas (Lo que esta bien)

1. **Modelo de datos robusto:** Templates, saved meals, planes custom, logs diarios, historial. Cubre casos reales de coaching.
2. **SYNCED/CUSTOM:** Patron inteligente. Permite escalar (plantilla para 20 alumnos) y personalizar (ajuste para 1 alumno especifico).
3. **Busqueda de alimentos:** `unaccent` + `name_search` + indice + RPC `search_foods`. Rapido y tolerante a tildes.
4. **Alimentos como pieza atomica:** Cada `food_item` en una comida tiene `food_id + quantity + unit (g/un)`. Simple, consistente, escalable.
5. **UX del builder:** Drag & drop con `@dnd-kit`, calculo de macros en tiempo real, preview de cantidad antes de agregar.
6. **Optimistic UI:** `useOptimistic` en toggles de comida. Se siente instantaneo.
7. **Cumplimiento de AGENTS.md:** Sin Redux/Zustand, RSC + Server Actions, `React.cache`, `dvh`, safe areas, `cn()`.
8. **Food library:** Infinite scroll, filtros por categoria, scope all/mine, sort. Escalable para miles de alimentos.
9. **Dashboard del coach:** Sparkline 7 dias, kcal consumidas hoy, adherencia. Buen nivel de insight.
10. **Categorias y seed:** ~250+ alimentos precargados chilenos/globales con categorias.

---

## 5. Errores, Code Smells y Deuda Tecnica

### Y" Errores de Diseno

| # | Problema | Impacto |
|---|----------|---------|
| **E1** | ~~**Propagacion SYNCED destruye `plan_id`**~~. Corregido: update in-place preservando `plan_id` y `meal_id`; ademas se bloquea propagacion de plantillas con comidas vacias. | **CERRADO.** |
| **E2** | ~~**Sin Zod validation**~~ en acciones principales. Corregido en flujos JSON y creacion de alimentos. | **CERRADO (principal).** |
| **E3** | ~~**NutritionService opera con FormData indexado**~~ como ruta principal. Corregido: flujo oficial JSON; ruta legacy redirigida al flujo moderno. | **CERRADO (flujo principal).** |
| **E4** | **`meal_completions` legacy** | **CERRADO (lectura).** Tabla sustituida por vista `meal_completions` (misma forma, solo SELECT). Codigo runtime ya no escribe en la tabla; script `purge-platform-email` deja de borrar esa relacion. |
| **E5** | **Unidades mixtas:** el builder y algunos componentes mantienen compatibilidad con `ml`, `gr`, `cda`, `cdta`, `taza`, `porcion`. Riesgo de inconsistencia de calculo. | **Medio.** Migracion 2026-04-13 normalizo datos pero el codigo legacy aun existe. |
| **E6** | **Planes activos con comidas vacias (`nutrition_meals` sin `food_items`)** detectados en produccion. | **Alto.** Distorsiona macros/adherencia percibida. Mitigado por fallback + bloqueo de guardado; requiere saneamiento operativo. |

### YY Code Smells

| # | Problema | Ubicacion |
|---|----------|-----------|
| **C1** | `saveNutritionTemplate` legacy aun existe por compatibilidad, pero ya delega al flujo JSON moderno. | `nutrition-coach.actions.ts` |
| **C2** | `FoodSearch.tsx` y `FoodBrowser.tsx` duplican logica de busqueda/filtros con UI distinta. M25 (Sesion 9) migro `FoodSearchDrawer` a portal + 2-stage UX + categorias, reduciendo la brecha. Duplicacion no eliminada del todo. | `coach/foods/`, `nutrition-plans/_components/` |
| **C3** | `getFoodLibrary` carga 120 items; `FoodSearchDrawer` carga 300 y filtra client-side. Dos estrategias inconsistentes. | queries + drawer |
| **C4** | Test coverage de nutricion aun incompleto: ya existen unit tests de `nutrition-utils`, schemas y `getWeeklyCompliance`, faltan E2E/flows completos. | `tests/`, `src/**/*.test.*` |
| **C5** | `daily_nutrition_logs` guarda `target_*_at_log` (snapshot de metas) pero el alumno **nunca registra lo que realmente comio**  -  solo si/no. Los targets se snapshotan pero no hay contraste real vs planificado. | `nutrition.actions.ts` |
| **C6** | La cadena `template_meals  ->  template_meal_groups  ->  saved_meals  ->  saved_meal_items` tiene 4 niveles de join para llegar a los alimentos de una plantilla. Overengineering vs su caso de uso real. | `nutrition-coach.queries.ts` |

### YY Brechas Funcionales

| # | Problema | Impacto UX |
|---|----------|------------|
| **B1** | **Plan por dia de semana (MVP).** `day_of_week` en `nutrition_meals` / `template_meals`, filtrado en alumno/dashboard/board, selector en PlanBuilder. Tabs dedicados por dia = mejora futura. | Coach puede asignar comidas a un dia fijo o a todos los dias. |
| **B2** | **El alumno no puede ajustar cantidades.** Solo toggle si/no. No puede registrar "comi 120g en vez de 150g". | Adherencia binaria, no datos reales de consumo calorico. |
| **B3** | ~~**Sin tracking de agua, pasos, suplementos, ayuno.**~~ **PARCIAL (2026-04-29):** `daily_habits` cubre `water_ml`, `steps`, `sleep_hours`, `notes`. Suplementos y ayuno no implementados. | Oportunidad de valor agregado parcialmente cubierta. |
| **B4** | **Sin integracion check-in  -  nutricion.** El peso no cruza con calorias ni sugiere revisiones al coach. | El coach lo hace todo manualmente. |
| **B5** | **Offline = brick.** El SW ignora `/c/` y POST. Si el alumno marca una comida sin red, pierde el toggle. | Mala UX en movil con red inestable. |
| **B6** | **Sin notificaciones/reminders.** El alumno no recibe alertas de comidas ni recordatorios de log. | Menor adherencia real. |
| **B7** | ~~**Sin intercambio de alimentos (food swaps).**~~ **CERRADO (2026-04-29):** swaps **por item de plan** (`food_items.swap_options` + tabla `nutrition_meal_food_swaps`); alumno elige solo entre alternativas del coach; cantidad/unidad **solo coach**; aplicable sin marcar comida completa (get/create `daily_nutrition_logs`). Ruta global `/coach/nutrition-plans/swaps` retirada. Pendiente menor: visibilidad agregada de swaps en mas vistas coach si hace falta. |  -  |
| **B8** | **Sin asignacion masiva mejorada.** Se puede asignar a varios pero la UX no muestra cuantos ya tienen esa plantilla ni permite reasignacion bulk. | Coach con 20+ alumnos pierde tiempo. |
| **B9** | Export: dos modos copiados desde alumno  -  **detalle del dia** (ingredientes) y **resumen corto** (por comida + meta). PDF / formatos avanzados pendientes. | Friction parcial pendiente. |
| **B10** | **Sin calculo de macros sugeridos.** No hay formula que sugiera kcal/proteina al coach segun perfil del alumno. | El coach calcula manualmente en calculadoras externas. |

---

## 6. Estrategia de Retrocompatibilidad y Migracion

**Principio rector:** Ninguna mejora puede romper los datos ni el flujo de trabajo de coaches que ya tienen planes activos. Todo cambio de esquema debe incluir migracion de datos y los coaches no deben tener que "rehacer" sus planes.

### 6.1 Estado Actual de Datos a Preservar

Antes de cualquier modificacion, estos datos deben permanecer intactos:

- `nutrition_plan_templates` existentes y sus relaciones.
- `nutrition_plans` (SYNCED y CUSTOM) con sus `nutrition_meals` y `food_items`.
- `daily_nutrition_logs` y `nutrition_meal_logs` historicos.
- `foods` del coach (alimentos custom creados por cada coach).
- `saved_meals` y `saved_meal_items` del coach.

### 6.2 Migracion del Bug E1 (Propagacion SYNCED)

**Situacion actual:** Cuando un coach edita una plantilla y propaga, el sistema borra el plan e inserta uno nuevo. El `plan_id` cambia, los `daily_nutrition_logs` quedan huerfanos.

**Estrategia de correccion sin romper datos existentes:**

**Paso 1  -  Schema migration (no destructiva):**
```sql
ALTER TABLE nutrition_plans
 ADD COLUMN IF NOT EXISTS template_version_id UUID,
 ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

UPDATE nutrition_plans
SET template_version_id = template_id
WHERE is_custom = false AND template_id IS NOT NULL;
```

**Paso 2  -  Cambiar `propagateTemplateChanges()`:**
- Mantener el mismo `nutrition_plans.id` (el `plan_id` NO cambia).
- Solo borrar e reinsertar los hijos: `nutrition_meals` + `food_items`.
- Actualizar `synced_at = NOW()` en el plan.
- Los `daily_nutrition_logs` apuntan al `plan_id`  ->  siguen validos.

**Paso 3  -  Alternativa minima** (si el Paso 2 es demasiado riesgoso):
- Hacer que los reports de adherencia agrupen por `client_id + log_date` en vez de por `plan_id`.
- Los logs huerfanos siguen siendo consultables; simplemente el JOIN cambia.
- No requiere tocar `propagateTemplateChanges`.

**Impacto en coaches actuales:** Cero. Los planes existentes siguen funcionando. El cambio es transparente.

### 6.3 Migracion de FormData a JSON (E3)

**Estrategia:** Coexistencia temporal, no Big Bang.

1. Crear `upsertCoachNutritionTemplateV2(payload: NutritionPlanSchema)` con Zod.
2. Migrar el PlanBuilder para usar el nuevo endpoint.
3. Mantener el legacy endpoint hasta confirmar que no hay trafico.
4. Deprecar `saveNutritionTemplate` con log de warning.
5. Drop del legacy en siguiente release mayor.

**Impacto en coaches actuales:** Cero. La UI cambia internamente; el coach no nota diferencia.

### 6.4 Migracion de Unidades (E5)

La migracion `20260413220000_normalize_food_units_to_g_un.sql` ya normalizo datos. Riesgo residual: codigo que aun mapea unidades legacy.

**Accion:** Eliminar el mapeo legacy del codigo. Las unidades `ml`, `gr`, `cda`, etc., ya no existen en DB  -  el codigo de compatibilidad es codigo muerto.

### 6.5 Deprecacion de `meal_completions` (E4)

Implementacion final (repo + remoto): migracion `20260428041909_meal_completions_view_and_nutrition_day_of_week.sql`  -  `DROP TABLE` legacy, `CREATE VIEW meal_completions` (solo lectura, `security_invoker`), columnas `day_of_week`. Tipos TypeScript regenerados desde Supabase (`src/lib/database.types.ts`).

### 6.6 Nuevas Features  -  Retrocompatibilidad

Cada feature nueva debe disenarse como **adicion, no modificacion** de lo que existe:

| Feature | Estrategia de compatibilidad |
|---------|------------------------------|
| Plan por dia de semana | `day_of_week` nullable en `nutrition_meals`. `NULL` = todos los dias (comportamiento actual). |
| Registro gradual | `consumed_quantity` nullable en `nutrition_meal_logs`. `NULL` = toggle binario actual. |
| Tracking habitos | Nueva tabla `daily_habits` independiente. No toca nada. |
| Food swaps | Nueva tabla `food_swap_groups`. Opt-in. No altera `food_items`. |
| Ciclos de dieta | Nueva tabla `nutrition_plan_cycles`. Planes sin ciclo siguen igual. |

---

## 7. Recomendaciones Tecnicas  -  "Next Level"

### 7.1 Arquitectura de Datos (Inmediato)

#### 7.1.1 Arreglar Propagacion SYNCED (P0)

Ver seccion 6.2. **Este es el bug mas critico del modulo.** Si un coach activo edita una plantilla hoy, sus alumnos pierden el historial de adherencia.

#### 7.1.2 Migrar a JSON + Zod (P1)

```ts
const FoodItemSchema = z.object({
 food_id: z.string().uuid(),
 quantity: z.number().positive().max(5000),
 unit: z.enum(['g', 'un']),
});

const MealSchema = z.object({
 name: z.string().min(1).max(100),
 order_index: z.number().int().nonneg(),
 food_items: z.array(FoodItemSchema).min(1).max(20),
});

const NutritionPlanSchema = z.object({
 name: z.string().min(1).max(120),
 daily_calories: z.number().int().min(500).max(15000),
 protein_g: z.number().min(0).max(1000),
 carbs_g: z.number().min(0).max(1000),
 fats_g: z.number().min(0).max(1000),
 instructions: z.string().max(2000).optional(),
 meals: z.array(MealSchema).min(1).max(10),
});
```

**Factibilidad:** Alta. El PlanBuilder ya trabaja con objetos tipados internamente.

#### 7.1.3 Simplificar la Cadena de Templates (P2)

La cadena de 4 niveles (`template_meals  ->  template_meal_groups  ->  saved_meals  ->  saved_meal_items`) fue disenada para reutilizar saved_meals entre plantillas. Si el coach no lo usa activamente, es overengineering.

**Recomendacion:** No tocar por ahora. Medir uso real de saved_meals reutilizados entre templates antes de migrar.

### 7.2 UX del Alumno (Alto Impacto)

#### 7.2.1 Registro Gradual de Consumo (P1)

**MVP en produccion:** columna `consumed_quantity` nullable en `nutrition_meal_logs` (0 - 100 % del plan por comida). `NULL` = modo binario (100 % del plan si completada). Opcional futuro: tabla `food_item_logs` por item.

#### 7.2.2 Intercambio de Alimentos / Food Swaps (P2)

```ts
// Algoritmo: macros similares (15% kcal, 20% proteina)
const swapCandidates = await searchFoodSwaps(foodId, {
 calorieTolerance: 0.15,
 proteinTolerance: 0.20,
});
```

**Variante controlada (mas simple):** El coach define listas de intercambio manualmente.

```sql
CREATE TABLE food_swap_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 coach_id UUID REFERENCES coaches(id),
 name TEXT NOT NULL,
 food_ids UUID[] NOT NULL,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 7.2.3 Tracking de Habitos (P2)

```sql
CREATE TABLE daily_habits (
 client_id UUID REFERENCES client_profiles(id),
 log_date DATE NOT NULL,
 water_ml INT DEFAULT 0,
 steps INT DEFAULT 0,
 fasting_hours SMALLINT DEFAULT 0,
 notes TEXT,
 PRIMARY KEY (client_id, log_date)
);
```

#### 7.2.4 Exportacion del Plan (P1)

Server action `exportNutritionPlanAsText(planId)`  ->  string formateado. Boton "Copiar para WhatsApp" / "Descargar PDF". Usar `@react-pdf/renderer` o HTML  ->  PDF en route handler.

#### 7.2.5 Recordatorios y Streaks (P2)

Push notifications via FCM/web-push cuando este implementado. Banner de streak emocional. Recordatorio nocturno si no se logueo cena.

### 7.3 Flexibilidad del Plan (Diferenciador Competitivo)

#### 7.3.1 Plan por Dia de Semana (P1)

```sql
ALTER TABLE nutrition_meals
 ADD COLUMN day_of_week SMALLINT DEFAULT NULL;
 -- NULL = aplica todos los dias (comportamiento actual)
 -- 0=Dom, 1=Lun, ..., 6=Sab
```

Query: `WHERE day_of_week = EXTRACT(DOW FROM NOW()) OR day_of_week IS NULL`. Cambio de una linea. UI: tabs Lun - Dom + "Replicar a todos".

#### 7.3.2 Ciclos de Dieta (P2)

```sql
CREATE TABLE nutrition_plan_cycles (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 coach_id UUID REFERENCES coaches(id),
 client_id UUID REFERENCES client_profiles(id),
 name TEXT NOT NULL,
 start_date DATE NOT NULL,
 blocks JSONB NOT NULL,
 -- [{week_start:1, week_end:4, template_id:"uuid", label:"Deficit 2000kcal"},
 -- {week_start:5, week_end:5, template_id:"uuid", label:"Refeed"},...]
 is_active BOOLEAN DEFAULT true,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Factibilidad:** Media. Requiere cron job o trigger por fecha.

#### 7.3.3 Calculo de Macros Sugeridos (P1)

```ts
function suggestMacros(profile: ClientProfile): MacroSuggestion {
 const bmr = profile.gender === 'M'
 ? 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5
 : 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161;
 const tdee = bmr * activityMultiplier[profile.activity_level];
 return adjustForGoal(tdee, profile.goal);
}
```

Solo como sugerencia visible al coach. ?l siempre puede sobrescribir.

### 7.4 Performance y Escalabilidad

| Issue | Solucion | Factibilidad |
|-------|----------|--------------|
| Busqueda client-side 300 items | Paginacion cursor-based + busqueda 100% server-side | Alta |
| `FoodSearchDrawer` renderiza 300 items | Virtualizar con `@tanstack/react-virtual` (ya en deps) | Alta |
| Queries anidadas en templates | Indices en `template_meal_groups.saved_meal_id`, `food_items.meal_id` | Alta |
| `daily_nutrition_logs` crecera | Archivar logs >2 anos a `daily_nutrition_logs_archive` | Media |

---

## 8. Perspectiva: Product Manager (PM)

### 8.1 OKRs del Modulo de Nutricion

**Objetivo:** Convertir nutricion de "feature de apoyo" a "pilar de retencion" de EVA.

| Key Result | Metrica | Baseline actual | Target 90 dias |
|-----------|---------|-----------------|----------------|
| KR1 | % alumnos con plan activo que loguean ?5 dias/semana | ~30% | 55% |
| KR2 | Tiempo promedio del coach para crear y asignar plantilla | ~15 min | <8 min |
| KR3 | Adherencia promedio semanal de alumnos con plan | ~45% | 65% |
| KR4 | Churn de coaches que usan nutricion vs los que no | (medir) | -20% churn en usuarios de nutricion |
| KR5 | NPS especifico del modulo | (sin medir) | >40 |

### 8.2 User Stories Prioritarias

**Coach:**
- Como coach, quiero que al editar mi plantilla los alumnos no pierdan su historial de adherencia, para que el progreso de mis clientes sea visible en el tiempo.
- Como coach, quiero crear un alimento nuevo directamente mientras armo un plan, sin tener que salir al catalogo, para no perder el contexto del plan que estoy editando.
- Como coach con 20+ alumnos, quiero ver de un vistazo que alumnos tienen baja adherencia esta semana, para priorizar mi tiempo de seguimiento.
- Como coach, quiero que el sistema me sugiera los macros segun el perfil del alumno, para ahorrar el tiempo de calcularlos en calculadoras externas.
- Como coach, quiero que mis alumnos puedan llevarse el plan por WhatsApp o PDF, para alcanzar a los alumnos que usan poco la app.

**Alumno:**
- Como alumno, quiero marcar una comida como hecha con un solo tap, para que sea facil y rapido registrar desde el celular.
- Como alumno, quiero ver exactamente que alimentos incluye cada comida y cuantas calorias aportan, para entender mi plan sin necesitar al coach.
- Como alumno, quiero poder sustituir un alimento del plan por otro similar, para tener flexibilidad cuando no consigo el alimento exacto.
- Como alumno, quiero que mi historial de adherencia no desaparezca cuando el coach actualiza mi plan, para ver mi racha de dias cumplidos.
- Como alumno, quiero que la app funcione aunque tenga mala senal en el gimnasio, para no perder el log de mis comidas.

### 8.3 Matriz Valor / Esfuerzo

```
ALTO VALOR, BAJO ESFUERZO (hacer primero)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
? Arreglar propagacion SYNCED (E1) [P0]
? Exportacion de plan (WhatsApp/PDF) [P1]
? Creacion de alimento inline en builder [P1]
? Calculo de macros sugeridos [P1]
? Plan por dia de semana [P1]

ALTO VALOR, ALTO ESFUERZO (planificar bien)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
? Registro gradual de consumo [P1]
? Alertas inteligentes para el coach [P2]
? Integracion check-in  -  nutricion [P2]
? Offline basico [P1]

BAJO VALOR, BAJO ESFUERZO (quick wins)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
? Alimentos favoritos del alumno [P1]
? Feedback por comida (emoji) [P2]
? Duplicar plan entre alumnos [P1]
? Deprecar meal_completions [P2]

BAJO VALOR, ALTO ESFUERZO (evaluar o descartar)
" -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ?
? Ciclos de dieta (cron job) [P2]
? ~~IA  ->  descripcion a plan~~ **DESCARTADO** (decision producto: no se implementa en EVA)
? ~~Marketplace de plantillas~~ **DESCARTADO** (2026-04-30)
```

### 8.4 Definicion de "Done" por Feature

Cada feature nueva debe cumplir antes de considerarse completa:
1. Funcionalidad implementada y probada en staging.
2. Retrocompatibilidad verificada: datos actuales no se rompen.
3. Tooltip de ayuda contextual en la UI (ver Seccion 11).
4. Coach puede testearla sin instrucciones adicionales.
5. Evento de analytics disparado (ver Seccion 13).
6. Revision legal si maneja datos de salud nuevos (ver Seccion 16).

---

## 9. Perspectiva: UX/UI Designer

### 9.1 Principios de Diseno para el Modulo

1. **Cero friccion para el alumno:** El alumno debe poder marcar una comida en <3 segundos. Cada tap extra tiene costo de adherencia.
2. **Coach = vista de control aerea:** El coach ve el estado de todos sus alumnos sin entrar uno por uno.
3. **Informacion progresiva:** Mostrar lo esencial primero, el detalle bajo demanda (expandible/modal).
4. **El plan habla por si solo:** Un alumno sin contexto debe entender que comer y cuanto, sin necesitar al coach.

### 9.2 Flujos UX Problematicos Actuales

| Flujo | Problema | Solucion propuesta |
|-------|----------|-------------------|
| Coach crea plan  ->  encuentra que falta alimento | Tiene que salir al catalogo, perder el contexto del builder | "Crear alimento" inline en FoodSearchDrawer |
| Alumno no entiende que es "proteina" o "macros" | Sin tooltips explicativos | Tooltips contextuales en todos los terminos tecnicos (ver Seccion 11) |
| Coach ve "SYNCED" badge sin saber que significa | Sin explicacion in-app | Tooltip: "Este plan se actualiza automaticamente cuando editas la plantilla" |
| Alumno no sabe que puede ver dias anteriores | DayNavigator no es visible de entrada | Redisenar DayNavigator como elemento mas prominente o tutorial de primer uso |
| Coach asigna plantilla  ->  no sabe a quien ya la asigno | Lista de asignados no es visible antes de confirmar | Modal de asignacion muestra lista con checkboxes y estado actual |

### 9.3 Estados Vacios (Empty States)

Cada estado vacio debe explicar QU? hacer, no solo decir "no hay datos".

| Pantalla | Empty state actual | Empty state mejorado |
|----------|-------------------|---------------------|
| Alumno sin plan | "No tienes plan activo" | "Tu coach aun no te ha asignado un plan nutricional. No dudes en escribirle." + CTA "Contactar coach" |
| Coach sin plantillas | Generic | "Crea tu primera plantilla para empezar a asignar planes a tus alumnos. Tarda menos de 5 minutos." + CTA "Crear plantilla" |
| Sin historial | Gray calendar | "Empieza a registrar tus comidas hoy. En 7 dias veras tu racha aqui." |
| Busqueda de alimentos sin resultados | "Sin resultados" | "No encontramos '{{query}}'. Quieres crearlo tu -  + CTA "Crear alimento" |

### 9.4 Microinteracciones Recomendadas

- **Toggle de comida:** Vibracion haptica leve + animacion de check (ya existe, esta bien).
- **Streak banner:** Animacion de llama cuando se incrementa el streak.
- **Macro ring:** Llenar el ring animado cuando se carga la pagina del dia.
- **Creacion de alimento inline:** El nuevo alimento aparece seleccionado automaticamente en el drawer sin cerrar y reabrir.
- **Asignacion de plantilla:** Confetti pequeno cuando se asigna con exito a varios alumnos.

### 9.5 Accesibilidad (A11y)

Issues actuales identificados:
- `MacroRingSummary` usa SVG/canvas sin `aria-label` descriptivos.
- `DayNavigator` no tiene navegacion por teclado documentada.
- Heatmap de 30 dias no tiene texto alternativo.
- Botones de drag en el builder no tienen `aria-describedby` para screen readers.

Acciones minimas:
```tsx
// MacroRingSummary
<svg aria-label={`Proteina: ${consumed}g de ${target}g objetivo`} role="img">

// Heatmap
<div role="grid" aria-label="Adherencia ultimos 30 dias">
 <div role="gridcell" aria-label={`${date}: ${completed ? 'Completado' : 'Sin registro'}`}>
```

### 9.6 Mobile-First Critico

- El alumno usa esto **desde el celular, en el gimnasio o en la cocina**. Cada elemento interactivo debe tener area de tap ?44px.
- El `FoodSearchDrawer` en mobile debe usar `height: 90dvh` con safe area respetada.
- El input de busqueda de alimentos debe abrir el teclado sin ocluir los resultados (scroll automatico).
- Los valores de macros en `MealIngredientRow` deben ser legibles en 320px de ancho.

---

## 10. Perspectiva: Frontend Developer

### 10.1 Arquitectura de Componentes para Nuevas Features

**Plan por dia de semana  -  PlanBuilder:**
```
PlanBuilder
 """? WeekdayTabs (Lun|Mar|Mie|Jue|Vie|Sab|Dom|Todos)
 """? MealCanvas (por dia seleccionado)
 """? MealBlock
 """? FoodItemRow
```

- `WeekdayTabs` mantiene `selectedDay: DayOfWeek | 'all'` en estado local.
- "Replicar a todos"  ->  clona las meals del dia seleccionado a todos los dias.
- La serializacion al server action incluye `day_of_week` por meal.

**Registro gradual  -  MealCard (alumno):**
```
MealCard
 """? MealIngredientRow
 """? [tap]  ->  QuantityModal (si modo detallado activo)
 """? input numerico + unidad + macro preview
```

- `MealCard` recibe prop `detailedMode: boolean` (opt-in del alumno, guardado en `localStorage`).
- En modo simple: tap en la tarjeta = toggle. En modo detallado: tap en item = editar cantidad.

### 10.2 Patterns de Estado

- Nunca usar estado global (sin Zustand/Redux). Conforme a AGENTS.md.
- El estado del builder vive en `useReducer` local dentro de `PlanBuilder.tsx`.
- Los logs del dia viven en RSC + revalidation. Sin estado cliente para logs (excepto optimistic).
- `useOptimistic` para toggles y quantity updates.

### 10.3 Virtualizacion del FoodSearchDrawer

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
 count: foods.length,
 getScrollElement: () => parentRef.current,
 estimateSize: () => 64, // altura estimada por row
 overscan: 5,
});
```

Esto resuelve el render de 300 items sin degradar el scroll.

### 10.4 Code Splitting

Las paginas del builder son pesadas (`@dnd-kit`, `recharts`). Usar:
```tsx
const PlanBuilder = dynamic(() => import('./_components/PlanBuilder'), {
 ssr: false,
 loading: () => <PlanBuilderSkeleton />,
});
```

### 10.5 Tooltip Component

Para el sistema de tooltips contextual (ver Seccion 11), usar un componente unificado:

```tsx
// components/ui/InfoTooltip.tsx
interface InfoTooltipProps {
 content: string;
 side?: 'top' | 'right' | 'bottom' | 'left';
 audience?: 'coach' | 'client' | 'both';
}
// Usa Radix UI Tooltip (ya en el proyecto via shadcn)
// Icon: (?) circulo pequeno gris, inline con el label
```

---

## 11. Perspectiva: Backend Developer

### 11.1 Row Level Security (RLS) en Supabase

Verificar que las nuevas tablas tengan RLS desde el inicio:

```sql
-- daily_habits
ALTER TABLE daily_habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_own_habits" ON daily_habits
 USING (client_id = auth.uid());
CREATE POLICY "coach_read_client_habits" ON daily_habits
 FOR SELECT USING (
 client_id IN (
 SELECT id FROM client_profiles WHERE coach_id = auth.uid()
 )
 );

-- food_swap_groups
ALTER TABLE food_swap_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_own_swap_groups" ON food_swap_groups
 USING (coach_id = auth.uid());
```

### 11.2 Transaccionalidad en Propagacion

`propagateTemplateChanges()` actualmente puede dejar datos parciales si falla a la mitad. Envolver en transaccion:

```ts
const { error } = await supabase.rpc('propagate_template_to_client', {
 p_template_id: templateId,
 p_client_id: clientId,
});
// La funcion PL/pgSQL corre en una transaccion atomica
```

La funcion SQL maneja la actualizacion in-place del plan manteniendo el `plan_id`.

### 11.3 Indices Recomendados

```sql
-- Cubrir la query mas frecuente del alumno
CREATE INDEX IF NOT EXISTS idx_nutrition_meals_plan_dow
 ON nutrition_meals(plan_id, day_of_week);

-- Cubrir busqueda de adherencia por fecha
CREATE INDEX IF NOT EXISTS idx_daily_nutrition_logs_client_date
 ON daily_nutrition_logs(client_id, log_date DESC);

-- Cubrir food_items por meal
CREATE INDEX IF NOT EXISTS idx_food_items_meal_id
 ON food_items(meal_id);
```

### 11.4 Snapshot de Plan en Logs

`daily_nutrition_logs` ya snapshotea `target_calories_at_log`. Extender para capturar tambien las comidas al momento del log (util para "que tenia el plan ese dia - ):

```sql
ALTER TABLE daily_nutrition_logs
 ADD COLUMN IF NOT EXISTS plan_snapshot JSONB;
 -- Guardado una vez al crear el log del dia; no mutable
```

Esto permite auditoria retroactiva y elimina la dependencia de `plan_id` para reports historicos.

---

## 12. Perspectiva: DevOps Engineer

### 12.1 Estrategia Zero-Downtime para Migraciones

Todas las migraciones de Fase A deben cumplir:

1. **Solo operaciones additive:** `ADD COLUMN IF NOT EXISTS`, no `DROP COLUMN` ni `ALTER TYPE`.
2. **Sin locks prolongados:** `ALTER TABLE ADD COLUMN` con DEFAULT es instantaneo en PostgreSQL moderno (sin full rewrite si la columna es nullable).
3. **Backup automatico antes de cada migracion critica**  ->  Verificar que Supabase tenga Point-in-Time Recovery activo.
4. **Rollback plan documentado:** Cada migracion tiene su `down.sql` correspondiente.

### 12.2 Feature Flags

Para features grandes (plan por dia de semana, registro gradual), usar feature flags antes de release general:

```ts
// lib/feature-flags.ts
const FEATURE_FLAGS = {
 WEEKLY_PLAN: process.env.NEXT_PUBLIC_FF_WEEKLY_PLAN === 'true',
 DETAILED_LOGGING: process.env.NEXT_PUBLIC_FF_DETAILED_LOGGING === 'true',
} as const;
```

- Flag OFF  ->  UI actual sin cambios.
- Flag ON  ->  nueva UI activada.
- Permite habilitar para coaches beta sin afectar produccion general.

### 12.3 Monitoreo Recomendado

Alertas a configurar en Supabase / Vercel:

| Metrica | Threshold | Accion |
|---------|-----------|--------|
| `propagateTemplateChanges` duration | >5s | Investigar locks o N+1 queries |
| `toggleMealCompletion` error rate | >1% | Alert on-call |
| `search_foods` RPC p99 latency | >200ms | Revisar indice `name_search` |
| `daily_nutrition_logs` insert rate | Spike >10x normal | Posible ataque o bug de loop |

### 12.4 Variables de Entorno

Para nuevas integraciones (push notifications, PDF):
```
NEXT_PUBLIC_FF_WEEKLY_PLAN=false
NEXT_PUBLIC_FF_DETAILED_LOGGING=false
FCM_SERVER_KEY=... # Para notificaciones push
PDF_SERVICE_URL=... # Si se externaliza generacion PDF
```

---

## 13. Perspectiva: Data Scientist / Analytics

### 13.1 Eventos de Analytics a Instrumentar

Actualmente no hay eventos de analytics en el modulo de nutricion. Antes de implementar nuevas features, instrumentar lo basico:

```ts
// Eventos a trackear (Posthog, Mixpanel, o similar)
track('nutrition_meal_toggled', {
 coach_id, client_id, meal_id, plan_id,
 is_completed, day_of_week, time_of_day
});

track('nutrition_plan_builder_opened', { coach_id, mode: 'new'|'edit'|'custom' });
track('nutrition_plan_assigned', { coach_id, template_id, client_count });
track('nutrition_food_searched', { coach_id, query, results_count, food_selected });
track('nutrition_plan_exported', { client_id, format: 'text'|'pdf' });
track('nutrition_food_swapped', { client_id, from_food_id, to_food_id });
```

### 13.2 Metricas Clave de Retencion

- **DAU/MAU de alumnos que loguean comidas:** Si un alumno logguea ?3 dias/semana, su churn es 3x menor.
- **Adherencia promedio por coach:** Indica calidad del plan y del seguimiento.
- **Tiempo entre creacion de plan y primer log del alumno:** >48h = onboarding fallido.
- **Alimentos mas usados por categoria:** Permite priorizar el catalogo de alimentos.
- **Comidas con mayor porcentaje de incumplimiento:** El coach puede redisenar esas comidas.

### 13.3 Modelo de Alerta de Abandono (Churn Risk)

Con los datos actuales (sin ML complejo):

```sql
-- Alumnos en riesgo esta semana
SELECT
 c.id,
 c.name,
 c.coach_id,
 COUNT(dnl.id) FILTER (WHERE dnl.log_date >= NOW() - INTERVAL '7 days') AS logs_7d,
 AVG(ci.energy_level) FILTER (WHERE ci.date >= NOW() - INTERVAL '7 days') AS avg_energy
FROM client_profiles c
LEFT JOIN daily_nutrition_logs dnl ON dnl.client_id = c.id
LEFT JOIN check_ins ci ON ci.client_id = c.id
WHERE c.has_active_nutrition_plan = true
GROUP BY c.id, c.name, c.coach_id
HAVING COUNT(dnl.id) FILTER (WHERE dnl.log_date >= NOW() - INTERVAL '7 days') < 2
 OR AVG(ci.energy_level) FILTER (WHERE ci.date >= NOW() - INTERVAL '7 days') < 4;
```

Este query puede correr como funcion programada y alimentar los badges de alerta en el dashboard del coach.

### 13.4 A/B Testing Framework

Para features como "registro gradual vs toggle binario", configurar experimento:
- Grupo A: solo toggle (actual).
- Grupo B: toggle + opcion de cantidad.
- Medir: adherencia a 30 dias, tiempo en pantalla, NPS.
- Decision a 30 dias con al menos 50 usuarios por grupo.

---

## 14. Perspectiva: Product Marketing Manager (PMM)

### 14.1 Naming de Features en Espanol (Para UX Copy)

| Nombre tecnico | Nombre UX para el usuario |
|---------------|--------------------------|
| SYNCED plan | "Plan sincronizado" (badge azul) |
| CUSTOM plan | "Plan personalizado" (badge verde) |
| Food swaps | "Intercambiar alimento" |
| Plan por dia de semana | "Plan semanal" |
| Ciclos de dieta | "Programa nutricional por ciclos" |
| Registro gradual | "Registrar cantidad real" |
| Tracking de habitos | "Habitos diarios" |
| Macro target | "Meta del dia" |
| Adherencia | "Cumplimiento" (mas entendible para el alumno promedio) |

### 14.2 Comunicacion de Updates al Coach

Cuando se lance Plan Semanal:
- **In-app banner** al abrir el builder por primera vez post-update: "Ahora puedes tener comidas distintas para cada dia de la semana. Prueba las tabs Lun - Dom."
- **Tooltip en la pestana del dia:** "Quieres variar la alimentacion segun el tipo de entreno? Configura comidas distintas por dia."
- **Email (si se tiene CRM):** "Nueva funcionalidad: Plan Semanal. Tus alumnos con mas entreno de pierna ahora pueden comer mas carbohidratos ese dia."

### 14.3 Diferenciacion Competitiva

Features que EVA tendra que ninguna app white-label chilena tiene bien:
1. **Plan semanal configurable** (lunes diferente a sabado).
2. **Alerta automatica de bajo cumplimiento** al coach.
3. **Exportacion en un tap** para WhatsApp.
4. **Calculo de macros sugerido** integrado al perfil del alumno.

Estos cuatro puntos son el argumento de venta del modulo de nutricion redisenado.

---

## 15. Perspectiva: Customer Success Manager

### 15.1 Problemas Mas Comunes que Reportaran Coaches

Anticipar tickets de soporte:

| Problema probable | Causa raiz | Solucion proactiva |
|-------------------|-----------|-------------------|
| "Mis alumnos perdieron la adherencia" | Bug E1 (propagacion SYNCED) | Arreglar E1 antes de cualquier otra feature |
| "No encuentro el alimento que quiero" | Catalogo limitado o busqueda sin tildes | `unaccent` ya resuelve tildes; comunicar al coach como crear alimentos custom |
| "Un alumno me dice que no puede marcar la comida" | Offline o bug de toggle | Offline PWA basico (Fase B) |
| "No se como cambiar el plan de solo un alumno" | SYNCED vs CUSTOM no es claro | Tooltip explicativo en badge + guia rapida in-app |
| "Como copio el plan de Juan a Pedro -  | Feature no existe para CUSTOM | Feature "Duplicar plan" (Fase C) |

### 15.2 Onboarding del Coach para Nutricion

Flujo de primer uso (wizard de 3 pasos):

```
Paso 1: "Agrega tus alimentos mas usados al catalogo"
  ->  Pre-seleccion de alimentos del seed chileno
  ->  CTA: "Agrega tus propios alimentos"

Paso 2: "Crea tu primera plantilla de plan"
  ->  Template de ejemplo prellenado (desayuno/almuerzo/cena/snack)
  ->  CTA: "Personalizar esta plantilla"

Paso 3: "Asigna el plan a tu primer alumno"
  ->  Lista de alumnos actuales
  ->  CTA: "Asignar"
```

Sin este onboarding, muchos coaches llegaran a `/coach/nutrition-plans` y veran una pagina vacia sin saber por donde empezar.

### 15.3 Metricas de Adopcion de Nutricion

- % de coaches que crean ?1 plantilla en primeros 7 dias.
- % de alumnos con plan activo.
- % de alumnos que loguean en primera semana de tener plan.
- Tiempo promedio entre "plan asignado" y "primer log".

Si un coach no crea una plantilla en 7 dias  ->  trigger de email/notificacion: "Necesitas ayuda para configurar tu primer plan nutricional - 

---

## 16. Perspectiva: Legal / Privacidad

### 16.1 Clasificacion de Datos del Modulo

Los datos nutricionales son **datos de salud** bajo GDPR/CCPA y equivalentes latinoamericanos (Ley 19.628 en Chile):

| Dato | Clasificacion | Requiere |
|------|--------------|----------|
| Peso (check_in) | Dato de salud | Consentimiento explicito |
| Calorias consumidas | Dato de salud | Consentimiento explicito |
| Fotos de check-in | Dato de salud / biometrico | Consentimiento explicito + opt-in doble |
| Nivel de energia | Dato de salud | Consentimiento explicito |
| `daily_nutrition_logs` | Dato de salud (historial alimentario) | Consentimiento explicito |
| Alimentos favoritos | Dato personal normal | Aviso de privacidad |

### 16.2 Recomendaciones Legales Minimas

1. **Consentimiento explicito** al activar el modulo de nutricion para un alumno nuevo: "Al activar el plan nutricional, autorizas a [Coach] a registrar y analizar tu informacion alimentaria y de salud."

2. **Politica de retencion de datos:** Definir cuanto tiempo se mantienen los `daily_nutrition_logs`. Recomendacion: 3 anos desde la ultima actividad, luego anonymize o delete.

3. **Derecho al olvido (RTBF):** Si un alumno solicita eliminar sus datos, el flujo debe borrar cascada: `daily_nutrition_logs  ->  nutrition_meal_logs  ->  check_ins  ->  fotos`.

4. **Acceso del coach:** El coach solo debe ver datos de sus alumnos activos. RLS ya implementa esto, pero verificar que al desvincularse un alumno, el coach pierde acceso inmediatamente.

5. **Datos de terceros:** Si se implementa integracion con APIs externas de alimentos (USDA, Edamam), revisar los terminos de uso de esas APIs. No almacenar datos de terceros sin licencia.

6. **Notificaciones push:** Requieren opt-in explicito del usuario con boton de bienvenida del navegador. No mostrar push notifications sin este consentimiento.

### 16.3 Checklist Legal para Nuevas Features

Antes de lanzar cualquier feature que maneje datos de salud nuevos:
- [ ] Se agrega un nuevo tipo de dato de salud?  ->  Actualizar politica de privacidad.
- [ ] El dato se comparte con terceros?  ->  Revisar acuerdos de procesamiento de datos.
- [ ] El dato tiene valor de perfil (segmentacion, analitica)?  ->  Avisar explicitamente al usuario.
- [ ] Se puede exportar?  ->  Incluir en el flujo de "exportar mis datos" (RTBF).

---

## 17. Perspectiva: QA Engineer

### 17.1 Caminos Criticos a Testear (E2E)

**Flujo Coach:**
1. Coach crea plantilla  ->  agrega 3 comidas  ->  agrega 5 alimentos por comida  ->  guarda  ->  verifica macros totales.
2. Coach asigna plantilla a 2 alumnos  ->  verifica que ambos tienen plan activo.
3. Coach edita plantilla  ->  propaga  ->  verifica que logs historicos de alumnos **no se borran** (test para E1).
4. Coach crea plan CUSTOM para alumno  ->  edita plantilla original  ->  verifica que el plan CUSTOM **no cambio**.
5. Coach busca alimento con tilde (ej: "avena")  ->  verifica que aparece aunque este en DB como "Avena".

**Flujo Alumno:**
1. Alumno abre plan  ->  ve comidas del dia  ->  marca una comida  ->  verifica UI optimistic  ->  verifica en DB.
2. Alumno marca una comida  ->  va al dashboard  ->  verifica que el widget de nutricion se actualizo.
3. Alumno navega a fecha pasada  ->  verifica que los logs anteriores son correctos.
4. Alumno sin plan activo  ->  ve empty state correcto.

**Flujo Offline:**
1. Alumno abre plan con conexion  ->  desconectar red  ->  marca comida  ->  verifica optimistic UI  ->  reconectar  ->  verifica sync al server.

### 17.2 Edge Cases a Cubrir

- Plan con 0 comidas (si la validacion falla).
- Alimento con 0 calorias (aceite de coco, etc.)  -  no dividir por cero.
- Coach edita plan de alumno que esta viendo su plan en ese momento  ->  que ve el alumno?
- Alimento eliminado del catalogo que ya existe en un plan activo  ->  el plan no debe romperse.
- Dos coaches con el mismo alumno (si es posible)  ->  conflicto de planes.
- Fecha 29 de febrero en anos bisiestos para `daily_nutrition_logs`.
- Alumno en zona horaria distinta al server  ->  el "dia actual" puede diferir.

### 17.3 Test Coverage Minimo para Fase A

```ts
// nutrition-utils.test.ts  -  Calculo de macros
describe('calculateFoodItemMacros', () => {
 it('calcula macros para 100g de avena (base 100g)');
 it('calcula macros para 1 unidad de huevo (base 50g serving)');
 it('devuelve 0 macros si quantity es 0');
 it('redondea a 1 decimal');
 it('no devuelve NaN para alimentos sin datos completos');
});

describe('NutritionPlanSchema (Zod)', () => {
 it('valida plan correcto');
 it('rechaza plan sin comidas');
 it('rechaza food_item con unidad invalida');
 it('rechaza calorias fuera de rango (500-15000)');
});
```

### 17.4 Regression Checklist Post-Deploy

Antes de cualquier release del modulo de nutricion:
- [ ] Toggle de comida funciona en mobile (iOS Safari + Android Chrome).
- [ ] Macros del plan suman correctamente.
- [ ] El badge SYNCED/CUSTOM aparece correctamente en NutritionTabB5.
- [ ] FoodSearchDrawer abre y cierra sin memory leaks.
- [ ] El heatmap de 30 dias muestra el dia de hoy como el mas reciente.
- [ ] La pagina del alumno carga en <2s en conexion 4G simulada.

---

## 18. Ideas Adicionales  -  Evaluar Factibilidad

### 18.1 ~~Plantillas Publicas / Marketplace (P3)~~
**DESCARTADO (2026-04-30):** Requiere sistema de permisos entre coaches + monetizacion + moderacion de contenido nutricional. Fuera del alcance actual de EVA.

### 18.2 Generacion automatica de planes desde texto (descartado)
**Decision producto (2026):** no se implementara generacion de planes con modelos de lenguaje ni integraciones tipo Claude/OpenAI dentro del modulo de nutricion de EVA. Motivos tipicos: cumplimiento, responsabilidad profesional del coach, coste operativo y mantenimiento. El coach sigue armando planes con el builder, plantillas, duplicacion y macros sugeridos (Mifflin-St Jeor).

### 18.3 Alimentos Favoritos del Alumno (P1)
```sql
CREATE TABLE client_food_preferences (
 client_id UUID, food_id UUID,
 preference_type TEXT CHECK (preference_type IN ('favorite', 'dislike')),
 PRIMARY KEY (client_id, food_id)
);
```
El coach ve preferencias al crear el plan. **Factibilidad:** Alta.

### 18.4 Feedback por Comida  -  Emoji (P2)
`satisfaction_score SMALLINT` nullable en `nutrition_meal_logs`. 1=no me gusto, 2=regular, 3=muy rico. El coach lo ve en perfil. **Factibilidad:** Alta.

### 18.5 Duplicar Plan entre Alumnos (P1)
`duplicatePlanToClient(sourcePlanId, targetClientId)` clona meals + food_items como plan CUSTOM al target. **Factibilidad:** Alta.

### 18.6 Historial de Versiones del Plan (P2)
Tabla `nutrition_plan_history` con JSON snapshots. Rollback si el coach se equivoca. **Factibilidad:** Media.

### 18.7 Creacion de Alimento Inline en el Builder (P1)
Modal embebido en `FoodSearchDrawer`. El nuevo alimento queda seleccionado sin cerrar el drawer. **Factibilidad:** Alta.

### 18.8 Integracion Workout  -  Nutricion (P2)
`WorkoutContextBanner` en vista de nutricion del alumno: "Hoy es dia de piernas  ->  prioriza carbohidratos." Solo informativo, no modifica el plan. **Factibilidad:** Media.

### 18.9 Integracion Check-in  -  Nutricion (P2)
Alertas para el coach basadas en cruce de peso + adherencia. Ver metricas en Seccion 13.3. **Factibilidad:** Media.

---

## 19. Sistema de Tooltips  -  Especificacion Completa

Los tooltips son **fundamentales** para que coaches y alumnos entiendan el sistema sin necesitar soporte. Un tooltip bien redactado es mejor que 3 paginas de documentacion.

### 19.1 Componente Base

```tsx
// components/ui/InfoTooltip.tsx
// Icono: "~ o ? en circulo gris pequeno, inline con el label
// Trigger: hover en desktop, tap en mobile
// Posicion: auto (Radix Tooltip adjusts to viewport)
// Delay: 300ms en desktop, inmediato en mobile
<InfoTooltip content="Texto explicativo aqui" />
```

### 19.2 Tooltips para el Coach

**En NutritionHub  -  Tabs:**

| Elemento | Tooltip |
|----------|---------|
| Tab "Plantillas" | "Tus plantillas son modelos de plan reutilizables. Crea una vez y asignala a varios alumnos. Si la editas, todos los alumnos con ese plan se actualizaran automaticamente." |
| Tab "Planes activos" | "Vista de todos los alumnos con un plan de nutricion activo. Muestra el cumplimiento de la semana y las calorias consumidas hoy." |
| Badge "SYNCED" | "Este plan esta vinculado a una plantilla. Si editas la plantilla y propagas los cambios, este plan se actualizara automaticamente. El historial de adherencia se conserva." |
| Badge "CUSTOM" | "Este plan fue editado directamente para este alumno. No se vincula a ninguna plantilla, por lo que cambios en las plantillas no lo afectan." |
| Sparkline de adherencia (grafico de linea 7 dias) | "Porcentaje de comidas completadas cada dia en los ultimos 7 dias. 100% = el alumno marco todas sus comidas como realizadas." |

**En PlanBuilder:**

| Elemento | Tooltip |
|----------|---------|
| Campo "Calorias diarias" | "Suma total de calorias que el alumno debe consumir en un dia. Se calcula automaticamente segun los alimentos que agregues, o puedes establecerlo manualmente como meta." |
| Campo "Proteina (g)" | "Gramos de proteina al dia. Para ganancia muscular: 1.6 - 2.2g por kg de peso corporal. Para mantencion: 1.2 - 1.6g/kg." |
| Campo "Carbohidratos (g)" | "Gramos de carbohidratos al dia. Son la principal fuente de energia. Ajusta segun el nivel de actividad del alumno." |
| Campo "Grasas (g)" | "Gramos de grasa al dia. Esenciales para hormonas y absorcion de vitaminas. No bajar de 0.5g por kg de peso corporal." |
| Campo "Instrucciones" | "Notas visibles para el alumno en su plan. ssalas para agregar contexto: horarios sugeridos, tip de preparacion, o recordatorios especificos para este alumno." |
| Boton "Agregar comida" | "Una comida es un momento del dia (Desayuno, Almuerzo, etc.). Dentro de cada comida agregaras los alimentos con sus cantidades." |
| Campo de cantidad (g) en alimento | "Cantidad en gramos. Los macros se calculan automaticamente en base a los 100g del alimento. Ejemplo: 80g de avena = 80% de los macros de 100g." |
| Campo de cantidad (un) en alimento | "Cantidad en unidades. Un huevo = 1 un. Los macros se calculan segun el tamano de porcion registrado en el alimento." |
| Boton "Replicar a todos los dias" (Plan semanal) | "Copia las comidas de este dia a todos los demas dias de la semana. Despues puedes ajustar cada dia individualmente." |
| Boton "Propagar cambios" | "Aplica los cambios de esta plantilla a todos los alumnos que tienen este plan asignado. Sus planes se actualizaran automaticamente. El historial de adherencia no se borrara." |
| Widget de "Macros sugeridos" | "Sugerencia calculada con la formula Mifflin-St Jeor segun el peso, altura, edad y nivel de actividad del alumno. Es una referencia  -  tu defines los valores finales." |

**En Perfil del Alumno (NutritionTabB5):**

| Elemento | Tooltip |
|----------|---------|
| Grafico pie de macros | "Distribucion porcentual de las calorias del plan entre proteina, carbohidratos y grasas. Referencia: 30% proteina / 40% carbos / 30% grasas para hipertrofia." |
| Heatmap 30 dias | "Cada cuadrado es un dia. Verde = el alumno completo al menos una comida ese dia. Gris = sin registro. No indica si cumplio el 100%, solo que logueo." |
| Grafico compuesto 7 dias | "Barras azules = calorias consumidas (suma de comidas completadas). Linea naranja = meta calorica diaria del plan." |
| "Adherencia calorica" | "Promedio de calorias consumidas vs calorias objetivo en los ultimos 7 dias. stil para ver si el alumno esta en deficit o excedente real." |
| "Adherencia de comidas" | "Porcentaje de comidas individuales marcadas como completadas sobre el total de comidas del plan en el periodo." |

**En Catalogo de Alimentos (/coach/foods):**

| Elemento | Tooltip |
|----------|---------|
| Filtro "Mis alimentos" | "Alimentos que tu has creado o importado. Solo tu y tus alumnos pueden verlos." |
| Filtro "Todos" | "Incluye los alimentos del catalogo general de EVA (~250 alimentos chilenos y globales) mas los tuyos." |
| Campo "Por 100g" | "Los macros deben ingresarse por cada 100 gramos del alimento. Al agregar el alimento al plan, la cantidad se ajusta proporcionalmente." |
| Campo "Unidad de porcion" | "Si el alimento se mide en unidades (huevo, platano, etc.), ingresa el peso en gramos de 1 unidad. Esto permite al alumno ver '2 huevos' en lugar de '100g'." |

**En Asignacion de Plantillas:**

| Elemento | Tooltip |
|----------|---------|
| Lista de alumnos con checkbox | "Los alumnos marcados recibiran esta plantilla como plan activo. Si ya tienen un plan, se reemplazara. El historial anterior se conserva." |
| Alumnos marcados como "Ya asignados" | "Este alumno ya tiene esta plantilla asignada. Volver a asignar actualizara su plan con los cambios mas recientes de la plantilla." |

### 19.3 Tooltips para el Alumno

**En /c/[slug]/nutrition  -  Vista del Plan:**

| Elemento | Tooltip |
|----------|---------|
| `MacroRingSummary`  -  anillo de calorias | "Meta calorica diaria definida por tu coach. Si completaste todas tus comidas, estaras cerca del 100%." |
| `MacroRingSummary`  -  anillo de proteina | "La proteina ayuda a mantener y construir musculo. Tu meta diaria esta definida en tu plan." |
| `MacroRingSummary`  -  anillo de carbos | "Los carbohidratos son tu fuente principal de energia. Son especialmente importantes en dias de entrenamiento." |
| `MacroRingSummary`  -  anillo de grasas | "Las grasas saludables son esenciales para el equilibrio hormonal y la absorcion de vitaminas." |
| Boton de completar comida (check) | "Toca aqui cuando hayas terminado esta comida. Tu coach vera tu progreso en tiempo real." |
| `AdherenceStrip`  -  heatmap | "Cada cuadrado es un dia. Los cuadrados verdes son dias en los que registraste tus comidas. Intenta mantener la racha." |
| `NutritionStreakBanner`  -  racha | "Dias consecutivos en los que registraste al menos una comida. Manten la racha para ver mejores resultados!" |
| `DayNavigator` | "Navega a dias anteriores para ver tu historial de comidas y macros consumidos." |
| Columna de macros en alimento | "Valores nutricionales para la cantidad exacta indicada en tu plan (no por 100g). Lo que veras cuando consumas esa porcion." |
| Icono de alternativas (swap) en la fila del alimento | "Tu coach dejo opciones de cambio para este alimento. Elige una y pulsa Aplicar; la porcion es la que definio tu coach." |
| Input de cantidad real (modo detallado, cuando este implementado) | "Si consumiste una cantidad diferente a la planificada, ajustala aqui. Los macros se recalcularan automaticamente." |

**En /c/[slug]/dashboard  -  Widget de Nutricion:**

| Elemento | Tooltip |
|----------|---------|
| `ComplianceRing`  -  anillo de nutricion | "Porcentaje de dias en los ultimos 30 dias en los que registraste tus comidas. Objetivo: mantenerlo sobre el 80%." |
| `MealCompletionRow` | "Toca el check para marcar esta comida como realizada. Tambien puedes hacerlo desde la seccion Nutricion." |

---

## 20. Roadmap Priorizado (Vista Consolidada)

### 20.0 Estado de Ejecucion (2026-04-30)

- o. **Food swaps (B7 / seccion 20.3):** columnas `swap_options` en `food_items`, tabla `nutrition_meal_food_swaps` (migraciones `20260428260000`, `20260428270000`, `20260428280000` en repo; aplicar en remoto al desplegar). PlanBuilder configura alternativas por alimento; alumno en `MealIngredientRow` / `NutritionShell`; macros en dashboard con `applyMealFoodSwaps`. Tests: `nutrition-utils`, `nutrition-day-scope`, smoke Playwright `tests/nutrition-student-smoke.spec.ts` (opcional con env E2E).
- o. **Favoritos alumno:** `client_food_preferences.food_id` referencia **`foods(id)`** (migracion `20260428290000`); corazon coherente entre planes; panel en `NutritionTabB5`; `toggleClientFoodPreference` revalida ficha coach.
- o. E1 cerrado: propagacion SYNCED in-place (sin romper historial).
- o. E2 cerrado en flujos principales: Zod activo en acciones core.
- o. E3 cerrado en flujo principal: JSON tipado; legacy puenteado.
- o. Mitigacion de produccion: fallback de macros por % de comidas completadas cuando faltan `food_items`.
- o. Test base anadidos: `nutrition-utils`, schemas, `getWeeklyCompliance`; suite Vitest + `tsc` verificados antes de release.
- Ys **Saneamiento planes vacios:** IGNORADO por decision de producto. Los scripts de auditoria quedan en `scripts/` para uso futuro si se necesita.
- o. `meal_completions`: tabla legacy reemplazada por vista homonima + columnas `day_of_week` en comidas (migracion `20260428041909`, aplicada en remoto via MCP y archivo local con el mismo nombre).
- o. **Auto-sync goals en PlanBuilder (M24, Sesion 9):** PlanBuilder recalcula y sincroniza automaticamente `daily_calories`, `protein_g`, `carbs_g`, `fats_g` del plan con los totales reales de las comidas configuradas. Coach ya no necesita ingresar los macros objetivo manualmente; los valores se actualizan al agregar/quitar alimentos.
- o. PlanBuilder: selector **Dia del plan** (todos los dias vs lun - dom), responsive; persiste `day_of_week` al guardar.
- o. **Registro gradual (B11):** columna `consumed_quantity` en `nutrition_meal_logs` (migracion local `20260428183000_nutrition_meal_logs_consumed_quantity.sql` + aplicacion remota via MCP `nutrition_meal_logs_consumed_quantity`). UI alumno (`NutritionShell` / `MealCard`), acciones, queries y agregados coach/dashboard alineados.
- o. PlanBuilder: layout desktop  -  aviso ?oReparacion asistida? fuera del `flex-row` para no comprimir la columna ?oComidas del plan?; aviso ?oComida vacia? con `min-w-0` / `w-full`.
- o. **Creacion inline de alimento (B8):** `FoodSearchDrawer` tiene `view: 'search'|'create'|'quantity'`; formulario inline completo; auto-selecciona el nuevo alimento al crear.
- o. **Macros sugeridos (B9):** widget Mifflin-St Jeor en `PlanBuilderSidebar`; visible en modo plan-cliente con peso+talla; sugiere kcal/P/C/G.
- o. **Tracking habitos (C17):** `HabitsTracker.tsx` alumno + `habits.actions.ts` + tabla `daily_habits` (`water_ml`, `steps`, `sleep_hours`, `notes`).
- o. **Feedback emoji por comida (C18):** `satisfaction_score` en `nutrition_meal_logs`; UI en `MealCard.tsx`; accion `updateMealSatisfaction`.
- o. **Accesibilidad nutricion (A11y, 2026-04-29 22:19 UTC-4):** `MacroRingSummary`, `AdherenceStrip` y heatmap coach (`NutritionTabB5`) con `role`/`aria-label` (`img`, `progressbar`, `grid`, `gridcell`).
- o. **Ciclos + historial (P2 #24-25, 2026-04-29 22:38 UTC-4):** migracion `20260430103000_nutrition_plan_history_and_cycles.sql`; snapshots automaticos antes de guardar plan custom + rollback; UI coach para definir bloques de ciclo y restaurar versiones.
- o. **Ciclos  -  job HTTP (sin IA, 2026-04-29):** `GET /api/cron/nutrition-cycles` (Bearer `CRON_SECRET` opcional) + `nutrition-cycle-automation.ts` + columnas `last_applied_week` / `last_applied_template_id` (`20260430114500_nutrition_plan_cycles_last_applied.sql`). **No** se anadio IA al producto.
- o. **fasting_hours en daily_habits (2026-04-30):** migracion `20260430120000_daily_habits_fasting_hours.sql`; action `upsertDailyHabits` + `getDailyHabits` actualizados; `HabitsTracker.tsx` con selector de ayuno (12h/14h/16h/18h/20h/24h, color naranja, icono Timer).
- o. **AssignModal B8 (2026-04-30):** `AssignModalTemplate` incluye `assigned_client_ids[]`; modal muestra "Ya tiene esta plantilla" (verde) vs "Plan activo diferente (se reemplazara)" (ambar) por alumno. `TemplateLibrary` pasa IDs desde `template.assigned_clients`.
- o. **E5 codigo legacy unidades (2026-04-30):** eliminado `|| unitLower === 'ml' || unitLower === 'gr'` de `calculateFoodItemMacros`. Unidades canonicas post-migracion: solo `g` y `un`.
- o. **Directorio swaps vacio eliminado (2026-04-30):** `/coach/nutrition-plans/swaps/` era stub sin implementacion; eliminado. El flujo de swaps vive en el PlanBuilder por alimento.
- o. **vercel.json + CRON_SECRET (2026-04-30):** `vercel.json` creado con cron `0 11 * * *` (8am Santiago) para `GET /api/cron/nutrition-cycles`; `CRON_SECRET` documentado en `.env.example`.
- Ys **IA en nutricion:** descartada por decision producto; no hay endpoints ni UI de ?otexto  ->  plan? con LLM en el repo.
- Ys **Marketplace plantillas:** descartado (2026-04-30).
- o. **Validacion tecnica ejecutada (2026-04-29 22:38 UTC-4):** `npm run typecheck` OK, Vitest OK (`MacroRingSummary`, `nutrition-plan-cycle-resolver`, `nutrition-plan-cycle-schema`), linter sin errores en archivos tocados.

### Fase A  -  Correcciones Criticas (2 semanas)
> **Sin estas correcciones, todo lo demas se construye sobre barro.**

1. **[P0] Arreglar propagacion SYNCED**  - [OK] **Hecho**.
2. **[P1] Implementar Zod schemas**  - [OK] **Hecho en acciones core**.
3. **[P1] Refactorizar `NutritionService`**  - [OK] **Hecho en flujo principal**.
4. **[P2] Eliminar `meal_completions` legacy**  - [OK] **Hecho:** vista `meal_completions` + DROP tabla; tipos `database.types` actualizados.
5. **[P1] Tests unitarios** para `nutrition-utils.ts` y schemas Zod.  - [OK] **Hecho**.
6. **[P1] Sistema de tooltips base**  -  `InfoTooltip` component + tooltips Fase A (todos los que no requieren features nuevas).  -  o. **Base implementada**.

### Fase B  -  UX Alumno + Quick Wins (3 semanas)

7. **[P1] Exportacion de plan**  - [OK] **Hecho (MVP):** texto para WhatsApp + PDF diario (`nutrition-day-pdf.ts` + boton en `NutritionShell`).
8. **[P1] Creacion de alimento inline**  - [OK] **Hecho (MVP):** `FoodSearchDrawer` tiene `view: 'search'|'create'|'quantity'`; formulario de creacion inline completo; auto-selecciona el nuevo alimento tras crearlo.
9. **[P1] Calculo de macros sugeridos**  - [OK] **Hecho (MVP):** widget Mifflin-St Jeor en `PlanBuilderSidebar`; se muestra cuando el plan es de cliente (tiene weight+height); sugiere kcal/P/C/G con actividad configurable.
10. **[P1] Alimentos favoritos del alumno** - [OK] **Hecho (MVP):** `client_food_preferences` + FK catalogo `foods`, UI alumno + listado coach en nutricion del perfil.
11. **[P1] Registro gradual de consumo** - [OK] **Hecho (MVP):** `consumed_quantity` 0-100 en logs, UI porciones en comida completada, macros proporcionales; PDF / modo por item (`food_item_logs`) pendiente si se exige.
12. **[P1] Offline basico** - [OK] **Hecho (MVP+):** queue + `OfflineNutritionQueueSync`; cache local con `dailyLog`, `adherence`, `clientUserId`, puntero `last_viewed` por slug; hidratacion al montar sin red (`NutritionShell`: log del dia + tira adherencia si props vacios); recuperacion solo sin red si el servidor no devuelve plan (`NutritionNoPlanFromServer` + `tryLoadNutritionRecoveryBundle` + `router.refresh` al volver online); con red y sin plan activo se muestra vacio. SW reforzado: precache de `/offline.html` + fallback navegaciones `/c/` + cache-first para imagenes/fuentes.
13. **[P1] Onboarding de nutricion** - [OK] **Hecho (MVP):** onboarding coach + storage de estado + guia contextual.
14. **[P1] Tooltips Fase B** - [OK] **Hecho (MVP):** ayuda contextual en alumno para entreno-nutricion (`WorkoutContextBanner`), racha (`NutritionStreakBanner`), habitos (`HabitsTracker`), estado sin plan (`EmptyNutritionState`); Fase A sigue en macros/comidas donde ya existia.

### Fase C  -  Flexibilidad del Plan (3 semanas)

15. **[P1] Plan por dia de semana**  - [OK] **Hecho (MVP):** `day_of_week` en DB + propagacion/saves + filtrado alumno/coach + **selector en PlanBuilder**. Mejora opcional futura: tabs por dia en lugar de dropdown por comida.
16. **[P2] Food swaps**  - [OK] **Hecho (MVP):** intercambios por alimento en plan (no grupos globales); UI coach en PlanBuilder; UI alumno; persistencia por dia en `nutrition_meal_food_swaps`. Mejoras futuras: tooltips dedicados, informes agregados, equivalencia estricta de macros si se exige negocio.
17. **[P2] Tracking de habitos**  - [OK] **Hecho (MVP):** tabla `daily_habits` (`water_ml`, `steps`, `sleep_hours`, `notes`); `HabitsTracker.tsx` en vista alumno; `habits.actions.ts`; migracion aplicada.
18. **[P2] Feedback por comida**  - [OK] **Hecho (MVP):** `satisfaction_score` en `nutrition_meal_logs`; UI emoji en `MealCard.tsx`; accion `updateMealSatisfaction`.
19. **[P2] Duplicar plan entre alumnos**  - [OK] **Hecho (MVP):** `duplicatePlanToClient()` + flujo UI desde perfil nutricion coach.
20. **[P2] Alertas basicas de bajo cumplimiento**  - [OK] **Hecho (MVP):** badge rojo/indicadores de riesgo nutricional en directorio.

### Fase D  -  Diferenciadores Pro (4 semanas)

21. **[P2] Alertas inteligentes coach**  - [OK] **Hecho (MVP):** panel en `NutritionTabB5` con reglas de riesgo abandono, over-restriction, estancamiento e inactividad.
22. **[P2] Integracion check-in  -  nutricion**  - [OK] **Hecho (MVP):** `recentCheckIns` en `NutritionTabB5` + tarjeta de contexto peso/adherencia.
23. **[P2] Integracion workout  -  nutricion**  - [OK] **Hecho (MVP):** `WorkoutContextBanner` en vista alumno + `hasTodayWorkout` desde query server.
24. **[P2] Ciclos de dieta**  - [OK] **Hecho (MVP):** tabla `nutrition_plan_cycles`, validador Zod, resolver por semana, UI coach de bloques y job HTTP `GET /api/cron/nutrition-cycles` (configurar `CRON_SECRET` + programador en hosting).
25. **[P2] Historial de versiones del plan**  - [OK] **Hecho (MVP v1):** `nutrition_plan_history` con snapshots JSON automaticos pre-save + rollback desde perfil del alumno (vista coach).
26. **[P3] IA  -  Descripcion a plan**  - [NO] **Descartado (decision producto).** No se implementa generacion con LLM ni integraciones Anthropic/OpenAI en nutricion.

---

## 20.1 Checklist Operativo  -  Saneamiento Planes Vacios (Sin perder historial)

Objetivo: corregir planes activos con comidas vacias sin perder adherencia ni logs historicos.

1. Abrir plan afectado en modo edicion coach.
2. Completar cada comida marcada como vacia con al menos 1 alimento.
3. Guardar in-place (mismo plan, mismas comidas cuando aplique).
4. Verificar en vista alumno:
 - el check de comida sigue disponible,
 - anillos/barra suben al marcar comidas.
5. Verificar en vista coach:
 - adherencia historica intacta,
 - macros del dia visibles.
6. Repetir por cada alumno afectado hasta llegar a 0 comidas vacias.

Regla de seguridad: no borrar `daily_nutrition_logs` ni `nutrition_meal_logs`.

Soporte operativo implementado:
- `npm run audit:nutrition-empty-meals` genera reporte Markdown en `scripts/output/`.
- `node scripts/audit-nutrition-empty-meals.mjs --json` agrega export JSON para analitica / BI.
- `node scripts/audit-nutrition-empty-meals.mjs --csv` genera matriz CSV para PM/CS (priorizacion por coach/alumno).
- `node scripts/audit-nutrition-empty-meals.mjs --only-with-logs` prioriza casos con actividad real (mejor ROI de saneamiento).
- `npm run audit:nutrition-empty-meals:runbook` genera runbook accionable por coach/alumno (`scripts/output/nutrition-empty-meals-remediation-runbook.md`).
- `npm run audit:nutrition-empty-meals:priority` genera ranking por score para atacar primero los casos de mayor impacto.
- `npm run audit:nutrition-empty-meals:baseline` guarda baseline del corte actual.
- `npm run audit:nutrition-empty-meals:delta` compara baseline vs corte actual y muestra resueltas/nuevas.
- `npm run audit:nutrition-empty-meals:strict` corta con exit code 2 si detecta comidas vacias (gate en CI/ops).
- Confirmacion legal/operativa: el saneamiento no borra historial ni tablas de logs; solo identifica filas para correccion manual en builder.

## 20.2 Progreso Global (estimado)

Estimacion practica para este roadmap (no matematica estricta):

- **Completado:** ~98%
- **Parcial en curso:** ~1%
- **Pendiente:** ~1% (fijar credenciales E2E estables en entorno seguro; suplementos en `daily_habits`)

Resumen por bloques:

- **Fase A (critico):** ~95% (`meal_completions` cerrado; cobertura tests ampliable; Zod en acciones core, JSON tipado [OK]).
- **Fase B (quick wins):** ~99% (export PDF+WhatsApp [OK], registro gradual [OK], favoritos [OK], creacion inline [OK], macros sugeridos [OK], auto-sync goals [OK], onboarding [OK], offline cliente + tooltips Fase B [OK], SW reforzado [OK]).
- **Fase C:** ~99% (`day_of_week` [OK], food swaps [OK], habitos [OK], feedback emoji [OK], duplicar plan [OK], alertas basicas [OK]).
- **Fase D:** ~98% (21-25 [OK]; #26 IA explicitamente fuera de alcance; configurar cron `nutrition-cycles` en prod pendiente de `CRON_SECRET` y scheduler hosting).

Cobertura E2E hardening (implementado):
- `tests/nutrition-student-smoke.spec.ts` usa guard centralizado de credenciales y `try/finally` para restaurar red en prueba offline.
- CI agrega job `nutrition-smoke` condicionado a secretos E2E presentes (evita ruido por entornos sin credenciales).
- Nuevo preflight `npm run e2e:check-env` (`scripts/validate-e2e-env.mjs`) valida secretos requeridos antes de correr smoke.
- CI sube artefactos `playwright-report` en `e2e` y `nutrition-smoke` para trazabilidad QA/CS.

---

## 20.3 Redefinicion oficial Food Swap (requerimiento producto)

> Esta seccion reemplaza el enfoque previo de "grupos globales de intercambio por coach" como flujo principal.

### Objetivo UX/Producto

El food swap debe definirse **dentro del creador de planes nutricionales del coach**, por alimento especifico del plan:

1. Coach agrega alimento base a una comida.
2. En ese mismo alimento, coach configura opciones de cambio (1..N alimentos alternativos), definiendo tambien **cantidad y unidad** por cada alternativa.
3. Coach guarda plan.
4. Alumno, al ver ese alimento en su plan, tiene boton de intercambio en esa fila.
5. Alumno pulsa, elige una alternativa permitida por su coach, y se reemplaza en su ejecucion diaria.

### Reglas funcionales

- Las opciones de swap son **contextuales al plan y al alimento** (no catalogo global desconectado).
- Un alimento puede no tener swaps; en ese caso no se muestra boton al alumno.
- Cada opcion swap debe almacenar su propia cantidad/unidad (`g`/`un`/`ml`) para que el macro preview sea realista desde el builder.
- El alumno solo puede elegir entre opciones configuradas por coach para ese alimento.
- **Cantidad y unidad de la alternativa aplicada** las fija el coach en cada fila de `swap_options`; el alumno **no** las edita (evita desviaciones y simplifica soporte). El servidor persiste `swapped_quantity` / `swapped_unit` leyendo esa definicion.
- Puede aplicarse swap **sin** marcar antes la comida como completada: se obtiene o crea `daily_nutrition_logs` para la fecha.
- El coach debe poder ver en su vista nutricional del alumno:
 - que swaps fueron usados,
 - que alimento original se cambio,
 - cual alternativa eligio el alumno,
 - con que cantidad/unidad quedo registrado el cambio.

### Decision de transicion

- El flujo anterior basado en gestion separada de grupos globales (`/coach/nutrition-plans/swaps`) queda deprecado para evitar doble logica.
- Implementacion nueva sera incremental:
 1. limpiar/desactivar UI anterior,
 2. modelar swaps por item del plan,
 3. exponer configuracion en PlanBuilder,
 4. habilitar consumo en alumno,
 5. reflejar uso en vista coach,
 6. cubrir tests unitarios + integracion + regresion.

### Criterio de aceptacion (Definition of Done)

- Backend y frontend alineados para coach y alumno.  -  o. **MVP cumplido (2026-04-29).**
- Persistencia completa de configuracion y uso real de swaps.  -  o. **MVP cumplido.**
- Visibilidad coach de swaps usados (p. ej. timeline / detalle dia con `nutrition_meal_food_swaps` y nombres de `foods`).  -  o. **Parcial:** presente en flujos de log/historial; ampliar si el negocio pide vista dedicada.
- No regresiones en: favoritos, porciones (`consumed_quantity`), satisfaccion emoji, adherencia y macros.  -  o. **Verificado en codigo + Vitest**; E2E opcional con credenciales.
- Suite de pruebas minima pasando antes de avanzar al siguiente punto.  -  o. **Vitest** (`nutrition-utils`, `nutrition-schemas`, `nutrition-day-scope`, `date-utils`, etc.).

---

## 21. Conclusion

El modulo de nutricion de EVA esta **bien construido desde la base**: el modelo de datos es solido, la UX del builder es fluida, y la integracion dashboard-perfil funciona. Sin embargo, todavia opera como un "plan estatico de papel digitalizado" en lugar de un "sistema de nutricion adaptativo".

**Los 3 cambios con mayor ROI:**

1. **Corregir propagacion SYNCED**  -  Bug real con impacto en produccion. Un coach que edita una plantilla hoy borra el historial de adherencia de sus alumnos.
2. **Plan por dia de semana**  -  Diferenciador competitivo inmediato. Cambio de schema minimal (`day_of_week` nullable), impacto enorme en el valor del producto.
3. **Registro gradual de consumo**  -  Convierte adherencia binaria en datos reales de cumplimiento calorico. Da al coach informacion accionable para ajustar el plan.

**Los tooltips son el cuarto pilar:** Un sistema bien pensado de ayuda contextual reduce la carga de soporte y acelera la adopcion del modulo tanto en coaches nuevos como en alumnos.

**La Regla de Oro de la Migracion:** Cada cambio de schema es nullable o additive. Nunca se eliminan columnas usadas por planes activos sin migracion previa. El historial de un alumno activo es sagrado.

Con esos tres cambios tecnicos + el sistema de tooltips + offline basico, el modulo pasa de "funcional" a "competitivo". Los demas items lo llevan a "lider de categoria".



