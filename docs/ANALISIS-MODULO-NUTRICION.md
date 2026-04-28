# Análisis del Módulo de Nutrición — EVA Fitness Platform

> **Fecha:** 2026-04-27  
> **Alcance:** Arquitectura, flujos, integraciones, errores detectados, plan de mejora, estrategia de migración y visión multi-disciplinaria.  
> **Estado:** Sin modificaciones de código — análisis, recomendaciones y roadmap.

---

## 1. Visión General

El módulo de nutrición es uno de los más complejos del codebase. Cubre:

- **Coach:** Creación de plantillas, biblioteca de alimentos, asignación a alumnos, edición custom por alumno, seguimiento de adherencia.
- **Alumno:** Visualización de plan diario, marcar comidas completadas, resumen de macros, historial de adherencia 30 días, integración con dashboard.
- **Datos:** 13 tablas en PostgreSQL, servicio central `NutritionService`, búsqueda con `unaccent`, comidas guardadas reutilizables (`saved_meals`).

**Aclaración fundamental:** La unidad base del sistema son **alimentos** (`foods`). Los planes asignan alimentos a comidas (`meals`). No se usan recetas como objeto principal del flujo — la tabla `recipes` existe pero es periférica; no forma parte del flujo coach → alumno. El flujo correcto es: `Coach agrega alimento → define cantidad (g/un) → lo asigna a una comida → esa comida vive en el plan del alumno`.

**Completitud funcional:** ~85%. El core está sólido, pero hay brechas de UX, validación, offline y flexibilidad del plan que lo separan de un producto "next level".

---

## 2. Arquitectura Actual

### 2.1 Modelo de Datos (13 tablas activas)

```
PLANTILLAS (Coach)
──────────────────
nutrition_plan_templates
  └─ template_meals
      └─ template_meal_groups
          └─ saved_meals            ← Comidas reutilizables del coach
              └─ saved_meal_items   ← Alimentos en esa comida
                  └─ foods          ← Base de datos de alimentos

PLANES ACTIVOS (Alumnos)
────────────────────────
nutrition_plans  (is_active, is_custom, template_id)
  └─ nutrition_meals
      └─ food_items
          └─ foods

TRACKING DIARIO
───────────────
daily_nutrition_logs     ← Un log por alumno por día (snapshot de targets)
  └─ nutrition_meal_logs ← Estado completado/no de cada comida

CATÁLOGO DE ALIMENTOS
─────────────────────
foods  (name, calories, protein_g, carbs_g, fats_g, serving_size, unit, category, coach_id)

PERIFÉRICO (no parte del flujo principal)
─────────────────────────────────────────
recipes            ← Recetas con ingredientes, creadas por coach
recipe_ingredients ← Ingredientes de cada receta
meal_completions   ← LEGACY sin FK formal, candidata a deprecar
```

### 2.2 Flujo de Datos Coach → Alumno

```
1. Coach busca alimentos (foods) en biblioteca
       │
       ▼
2. Coach arma comidas (meals) + asigna alimentos con cantidad + unidad (g / un)
       │
       ▼
3. Coach guarda como plantilla (nutrition_plan_templates)
   → persiste en: template_meals → template_meal_groups → saved_meals → saved_meal_items
       │
       ▼
4. Coach asigna plantilla a cliente(s) → propagateTemplateChanges()
   → Desactiva plan previo (is_active = false)
   → Inserta nutrition_plans (is_custom = false, template_id = X)
   → Clona nutrition_meals + food_items
       │
       ▼
5. Alumno ve en /c/[slug]/nutrition
   → getActiveNutritionPlan() → meals + food_items + foods
   → getNutritionLogForDate() → daily_nutrition_logs + nutrition_meal_logs
   → toggleMealCompletion() → upsert log + revalidatePath
```

### 2.3 SYNCED vs CUSTOM

| Tipo | Origen | Editable por coach | Se actualiza al editar template |
|------|--------|-------------------|--------------------------------|
| **SYNCED** | Plantilla asignada | Sí, vía plantilla | Sí — propagación destruye y recrea (BUG) |
| **CUSTOM** | Edición directa en alumno | Sí, vía `/client/[id]` | No — desvinculado permanentemente |

**Problema crítico:** La propagación SYNCED es **destructiva**. Borra el plan e inserta uno nuevo con distinto `plan_id`. Los `daily_nutrition_logs` del alumno quedan huérfanos porque apuntan al `plan_id` anterior. Si el coach edita una plantilla → el alumno pierde su historial de racha y adherencia.

### 2.4 Rutas del Sistema

```
Coach:
  /coach/nutrition-plans              → NutritionHub (tabs: Plantillas | Planes activos | Asignar)
  /coach/nutrition-plans/new          → PlanBuilder (crear plantilla)
  /coach/nutrition-plans/[id]/edit    → PlanBuilder (editar plantilla)
  /coach/nutrition-plans/client/[id]  → PlanBuilder (plan custom del alumno)
  /coach/foods                        → Catálogo de alimentos
  /coach/meal-groups                  → Gestión de comidas guardadas
  /coach/clients/[id]                 → Perfil alumno (incluye NutritionTabB5)

Alumno:
  /c/[coach_slug]/nutrition           → Vista principal del plan
  /c/[coach_slug]/dashboard           → Incluye NutritionDailySummary widget
```

---

## 3. Integración con el Resto de la App

### 3.1 Dashboard del Alumno

- `NutritionDailySummary` (RSC) muestra resumen compacto con `MacroBar` + `MealCompletionRow`.
- `MealCompletionRow` usa `useOptimistic` + `toggleMealCompletion`. Al completar, hace `router.refresh()` para sincronizar dashboard.
- `ComplianceRing` muestra score de nutrición 30 días (días con log / 30).
- `RestDayCard` en días sin entreno linkea a nutrición.

**Evaluación:** Buena integración. El toggle rápido desde dashboard es UX clave. Funciona bien.

### 3.2 Perfil del Alumno (vista coach)

- `NutritionTabB5` muestra plan activo, badges SYNCED/CUSTOM, macros meta, gráfico pie, heatmap 30 días, gráfico compuesto 7 días, historial tabla, `DayNavigator`.
- Link directo a editar plan o "ver como alumno".

**Evaluación:** Muy completa. Es la vista más rica del módulo. El gráfico compuesto barras vs línea meta es el mejor insight para el coach.

### 3.3 Check-in

- El check-in guarda peso, energía, fotos en `check_ins`.
- **No hay vinculación directa** entre `check_ins.weight` y `daily_nutrition_logs`.
- El coach ve peso/energía en su dashboard, pero no hay ajuste automático de calorías ni alerta del tipo "Tu alumno bajó 2kg, ¿revisar plan?".

**Evaluación:** Oportunidad de alto valor no aprovechada. El peso del check-in debería cruzarse con adherencia para dar contexto al coach.

### 3.4 Directorio de Clientes (Coach)

- `ClientCardV2` tiene botón "Nutri" que va directo al plan del alumno.
- Muestra adherencia/peso/energía en la tarjeta.

**Evaluación:** Bien. Acceso rápido clave para operación diaria del coach.

### 3.5 Workout

- **Cero integración** entre entrenamiento y nutrición.
- No hay pre/post-workout meals destacadas, ni recomendaciones de timing, ni ajuste de carbs según tipo de entreno.
- `workout_logs` existe con tipo de entreno pero no se cruza con el plan nutricional.

**Evaluación:** Brecha importante. El plan es 100% estático frente al entrenamiento.

---

## 4. Fortalezas (Lo que está bien)

1. **Modelo de datos robusto:** Templates, saved meals, planes custom, logs diarios, historial. Cubre casos reales de coaching.
2. **SYNCED/CUSTOM:** Patrón inteligente. Permite escalar (plantilla para 20 alumnos) y personalizar (ajuste para 1 alumno específico).
3. **Búsqueda de alimentos:** `unaccent` + `name_search` + índice + RPC `search_foods`. Rápido y tolerante a tildes.
4. **Alimentos como pieza atómica:** Cada `food_item` en una comida tiene `food_id + quantity + unit (g/un)`. Simple, consistente, escalable.
5. **UX del builder:** Drag & drop con `@dnd-kit`, cálculo de macros en tiempo real, preview de cantidad antes de agregar.
6. **Optimistic UI:** `useOptimistic` en toggles de comida. Se siente instantáneo.
7. **Cumplimiento de AGENTS.md:** Sin Redux/Zustand, RSC + Server Actions, `React.cache`, `dvh`, safe areas, `cn()`.
8. **Food library:** Infinite scroll, filtros por categoría, scope all/mine, sort. Escalable para miles de alimentos.
9. **Dashboard del coach:** Sparkline 7 días, kcal consumidas hoy, adherencia. Buen nivel de insight.
10. **Categorías y seed:** ~250+ alimentos precargados chilenos/globales con categorías.

---

## 5. Errores, Code Smells y Deuda Técnica

### 🔴 Errores de Diseño

| # | Problema | Impacto |
|---|----------|---------|
| **E1** | **Propagación SYNCED destruye `plan_id`** → Los logs históricos de adherencia quedan huérfanos. El alumno pierde su racha/historial si el coach edita la plantilla. | **Alto.** Pérdida de datos real en producción. |
| **E2** | **Sin Zod validation** en todo el módulo. `saveCustomFood`, `upsertCoachNutritionTemplate`, `upsertClientNutritionPlanJson` usan validación manual (`parseFloat`, `isNaN`). | **Medio.** Riesgo de datos corruptos o crashes. |
| **E3** | **NutritionService opera con FormData indexado** (`meal_name_${i}`, `meal_${i}_food_${j}`). Si el índice salta, se pierden comidas silenciosamente. | **Medio.** Deuda que dificulta mantenimiento y debug. |
| **E4** | **`meal_completions` legacy sin FK** a `nutrition_meals`. Tabla huérfana que confunde a cualquier lector del esquema. | **Bajo.** Limpieza pendiente. |
| **E5** | **Unidades mixtas:** el builder y algunos componentes mantienen compatibilidad con `ml`, `gr`, `cda`, `cdta`, `taza`, `porción`. Riesgo de inconsistencia de cálculo. | **Medio.** Migración 2026-04-13 normalizó datos pero el código legacy aún existe. |

### 🟡 Code Smells

| # | Problema | Ubicación |
|---|----------|-----------|
| **C1** | `saveNutritionTemplate` (legacy FormData) convive con wrappers JSON modernos. Lógica duplicada. | `nutrition-coach.actions.ts` |
| **C2** | `FoodSearch.tsx` y `FoodBrowser.tsx` duplican lógica de búsqueda/filtros con UI distinta. | `coach/foods/`, `nutrition-plans/_components/` |
| **C3** | `getFoodLibrary` carga 120 items; `FoodSearchDrawer` carga 300 y filtra client-side. Dos estrategias inconsistentes. | queries + drawer |
| **C4** | **Sin test coverage** dedicado para nutrición. Ni unitarios ni E2E. | `tests/`, `src/**/*.test.*` |
| **C5** | `daily_nutrition_logs` guarda `target_*_at_log` (snapshot de metas) pero el alumno **nunca registra lo que realmente comió** — solo sí/no. Los targets se snapshotan pero no hay contraste real vs planificado. | `nutrition.actions.ts` |
| **C6** | La cadena `template_meals → template_meal_groups → saved_meals → saved_meal_items` tiene 4 niveles de join para llegar a los alimentos de una plantilla. Overengineering vs su caso de uso real. | `nutrition-coach.queries.ts` |

### 🟠 Brechas Funcionales

| # | Problema | Impacto UX |
|---|----------|------------|
| **B1** | **Plan 100% estático.** Un plan tiene las mismas comidas todos los días. Sin variación por día de semana, ciclos o periodización. | El coach debe crear múltiples templates y rotar manualmente. |
| **B2** | **El alumno no puede ajustar cantidades.** Solo toggle sí/no. No puede registrar "comí 120g en vez de 150g". | Adherencia binaria, no datos reales de consumo calórico. |
| **B3** | **Sin tracking de agua, pasos, suplementos, ayuno.** | Oportunidad de valor agregado perdida. |
| **B4** | **Sin integración check-in ↔ nutrición.** El peso no cruza con calorías ni sugiere revisiones al coach. | El coach lo hace todo manualmente. |
| **B5** | **Offline = brick.** El SW ignora `/c/` y POST. Si el alumno marca una comida sin red, pierde el toggle. | Mala UX en móvil con red inestable. |
| **B6** | **Sin notificaciones/reminders.** El alumno no recibe alertas de comidas ni recordatorios de log. | Menor adherencia real. |
| **B7** | **Sin intercambio de alimentos (food swaps).** Si el plan dice "manzana", el alumno no puede cambiarla por "pera" con macros equivalentes. | Rígido; frustra al alumno. |
| **B8** | **Sin asignación masiva mejorada.** Se puede asignar a varios pero la UX no muestra cuántos ya tienen esa plantilla ni permite reasignación bulk. | Coach con 20+ alumnos pierde tiempo. |
| **B9** | **Sin exportación de plan.** El alumno no puede compartir su plan como PDF o texto para WhatsApp/impresión. | Friction para coaches que trabajan con alumnos poco digitales. |
| **B10** | **Sin cálculo de macros sugeridos.** No hay fórmula que sugiera kcal/proteína al coach según perfil del alumno. | El coach calcula manualmente en calculadoras externas. |

---

## 6. Estrategia de Retrocompatibilidad y Migración

**Principio rector:** Ninguna mejora puede romper los datos ni el flujo de trabajo de coaches que ya tienen planes activos. Todo cambio de esquema debe incluir migración de datos y los coaches no deben tener que "rehacer" sus planes.

### 6.1 Estado Actual de Datos a Preservar

Antes de cualquier modificación, estos datos deben permanecer intactos:

- `nutrition_plan_templates` existentes y sus relaciones.
- `nutrition_plans` (SYNCED y CUSTOM) con sus `nutrition_meals` y `food_items`.
- `daily_nutrition_logs` y `nutrition_meal_logs` históricos.
- `foods` del coach (alimentos custom creados por cada coach).
- `saved_meals` y `saved_meal_items` del coach.

### 6.2 Migración del Bug E1 (Propagación SYNCED)

**Situación actual:** Cuando un coach edita una plantilla y propaga, el sistema borra el plan e inserta uno nuevo. El `plan_id` cambia, los `daily_nutrition_logs` quedan huérfanos.

**Estrategia de corrección sin romper datos existentes:**

**Paso 1 — Schema migration (no destructiva):**
```sql
ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS template_version_id UUID,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

UPDATE nutrition_plans
SET template_version_id = template_id
WHERE is_custom = false AND template_id IS NOT NULL;
```

**Paso 2 — Cambiar `propagateTemplateChanges()`:**
- Mantener el mismo `nutrition_plans.id` (el `plan_id` NO cambia).
- Solo borrar e reinsertar los hijos: `nutrition_meals` + `food_items`.
- Actualizar `synced_at = NOW()` en el plan.
- Los `daily_nutrition_logs` apuntan al `plan_id` → siguen válidos.

**Paso 3 — Alternativa mínima** (si el Paso 2 es demasiado riesgoso):
- Hacer que los reports de adherencia agrupen por `client_id + log_date` en vez de por `plan_id`.
- Los logs huérfanos siguen siendo consultables; simplemente el JOIN cambia.
- No requiere tocar `propagateTemplateChanges`.

**Impacto en coaches actuales:** Cero. Los planes existentes siguen funcionando. El cambio es transparente.

### 6.3 Migración de FormData a JSON (E3)

**Estrategia:** Coexistencia temporal, no Big Bang.

1. Crear `upsertCoachNutritionTemplateV2(payload: NutritionPlanSchema)` con Zod.
2. Migrar el PlanBuilder para usar el nuevo endpoint.
3. Mantener el legacy endpoint hasta confirmar que no hay tráfico.
4. Deprecar `saveNutritionTemplate` con log de warning.
5. Drop del legacy en siguiente release mayor.

**Impacto en coaches actuales:** Cero. La UI cambia internamente; el coach no nota diferencia.

### 6.4 Migración de Unidades (E5)

La migración `20260413220000_normalize_food_units_to_g_un.sql` ya normalizó datos. Riesgo residual: código que aún mapea unidades legacy.

**Acción:** Eliminar el mapeo legacy del código. Las unidades `ml`, `gr`, `cda`, etc., ya no existen en DB — el código de compatibilidad es código muerto.

### 6.5 Deprecación de `meal_completions` (E4)

```sql
SELECT COUNT(*) FROM meal_completions;
CREATE OR REPLACE VIEW meal_completions_compat AS
  SELECT nml.id, nm.plan_id, nm.id AS meal_id, nml.is_completed, nml.created_at
  FROM nutrition_meal_logs nml
  JOIN nutrition_meals nm ON nm.id = nml.meal_id;
-- Verificar 0 dependencias → DROP TABLE meal_completions;
```

### 6.6 Nuevas Features — Retrocompatibilidad

Cada feature nueva debe diseñarse como **adición, no modificación** de lo que existe:

| Feature | Estrategia de compatibilidad |
|---------|------------------------------|
| Plan por día de semana | `day_of_week` nullable en `nutrition_meals`. `NULL` = todos los días (comportamiento actual). |
| Registro gradual | `consumed_quantity` nullable en `nutrition_meal_logs`. `NULL` = toggle binario actual. |
| Tracking hábitos | Nueva tabla `daily_habits` independiente. No toca nada. |
| Food swaps | Nueva tabla `food_swap_groups`. Opt-in. No altera `food_items`. |
| Ciclos de dieta | Nueva tabla `nutrition_plan_cycles`. Planes sin ciclo siguen igual. |

---

## 7. Recomendaciones Técnicas — "Next Level"

### 7.1 Arquitectura de Datos (Inmediato)

#### 7.1.1 Arreglar Propagación SYNCED (P0)

Ver sección 6.2. **Este es el bug más crítico del módulo.** Si un coach activo edita una plantilla hoy, sus alumnos pierden el historial de adherencia.

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

La cadena de 4 niveles (`template_meals → template_meal_groups → saved_meals → saved_meal_items`) fue diseñada para reutilizar saved_meals entre plantillas. Si el coach no lo usa activamente, es overengineering.

**Recomendación:** No tocar por ahora. Medir uso real de saved_meals reutilizados entre templates antes de migrar.

### 7.2 UX del Alumno (Alto Impacto)

#### 7.2.1 Registro Gradual de Consumo (P1)

Columna `consumed_quantity NUMERIC` nullable en `nutrition_meal_logs` (o nueva tabla `food_item_logs`). `NULL` = 100% del plan (toggle binario, comportamiento actual). Si tiene valor → macros proporcionales.

#### 7.2.2 Intercambio de Alimentos / Food Swaps (P2)

```ts
// Algoritmo: macros similares (±15% kcal, ±20% proteína)
const swapCandidates = await searchFoodSwaps(foodId, {
  calorieTolerance: 0.15,
  proteinTolerance: 0.20,
});
```

**Variante controlada (más simple):** El coach define listas de intercambio manualmente.

```sql
CREATE TABLE food_swap_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coaches(id),
  name TEXT NOT NULL,
  food_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 7.2.3 Tracking de Hábitos (P2)

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

#### 7.2.4 Exportación del Plan (P1)

Server action `exportNutritionPlanAsText(planId)` → string formateado. Botón "Copiar para WhatsApp" / "Descargar PDF". Usar `@react-pdf/renderer` o HTML → PDF en route handler.

#### 7.2.5 Recordatorios y Streaks (P2)

Push notifications via FCM/web-push cuando esté implementado. Banner de streak emocional. Recordatorio nocturno si no se logueó cena.

### 7.3 Flexibilidad del Plan (Diferenciador Competitivo)

#### 7.3.1 Plan por Día de Semana (P1)

```sql
ALTER TABLE nutrition_meals
  ADD COLUMN day_of_week SMALLINT DEFAULT NULL;
  -- NULL = aplica todos los días (comportamiento actual)
  -- 0=Dom, 1=Lun, ..., 6=Sáb
```

Query: `WHERE day_of_week = EXTRACT(DOW FROM NOW()) OR day_of_week IS NULL`. Cambio de una línea. UI: tabs Lun–Dom + "Replicar a todos".

#### 7.3.2 Ciclos de Dieta (P2)

```sql
CREATE TABLE nutrition_plan_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coaches(id),
  client_id UUID REFERENCES client_profiles(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  blocks JSONB NOT NULL,
  -- [{week_start:1, week_end:4, template_id:"uuid", label:"Déficit 2000kcal"},
  --  {week_start:5, week_end:5, template_id:"uuid", label:"Refeed"},...]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Factibilidad:** Media. Requiere cron job o trigger por fecha.

#### 7.3.3 Cálculo de Macros Sugeridos (P1)

```ts
function suggestMacros(profile: ClientProfile): MacroSuggestion {
  const bmr = profile.gender === 'M'
    ? 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5
    : 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161;
  const tdee = bmr * activityMultiplier[profile.activity_level];
  return adjustForGoal(tdee, profile.goal);
}
```

Solo como sugerencia visible al coach. Él siempre puede sobrescribir.

### 7.4 Performance y Escalabilidad

| Issue | Solución | Factibilidad |
|-------|----------|--------------|
| Búsqueda client-side 300 items | Paginación cursor-based + búsqueda 100% server-side | Alta |
| `FoodSearchDrawer` renderiza 300 items | Virtualizar con `@tanstack/react-virtual` (ya en deps) | Alta |
| Queries anidadas en templates | Índices en `template_meal_groups.saved_meal_id`, `food_items.meal_id` | Alta |
| `daily_nutrition_logs` crecerá | Archivar logs >2 años a `daily_nutrition_logs_archive` | Media |

---

## 8. Perspectiva: Product Manager (PM)

### 8.1 OKRs del Módulo de Nutrición

**Objetivo:** Convertir nutrición de "feature de apoyo" a "pilar de retención" de EVA.

| Key Result | Métrica | Baseline actual | Target 90 días |
|-----------|---------|-----------------|----------------|
| KR1 | % alumnos con plan activo que loguean ≥5 días/semana | ~30% | 55% |
| KR2 | Tiempo promedio del coach para crear y asignar plantilla | ~15 min | <8 min |
| KR3 | Adherencia promedio semanal de alumnos con plan | ~45% | 65% |
| KR4 | Churn de coaches que usan nutrición vs los que no | (medir) | -20% churn en usuarios de nutrición |
| KR5 | NPS específico del módulo | (sin medir) | >40 |

### 8.2 User Stories Prioritarias

**Coach:**
- Como coach, quiero que al editar mi plantilla los alumnos no pierdan su historial de adherencia, para que el progreso de mis clientes sea visible en el tiempo.
- Como coach, quiero crear un alimento nuevo directamente mientras armo un plan, sin tener que salir al catálogo, para no perder el contexto del plan que estoy editando.
- Como coach con 20+ alumnos, quiero ver de un vistazo qué alumnos tienen baja adherencia esta semana, para priorizar mi tiempo de seguimiento.
- Como coach, quiero que el sistema me sugiera los macros según el perfil del alumno, para ahorrar el tiempo de calcularlos en calculadoras externas.
- Como coach, quiero que mis alumnos puedan llevarse el plan por WhatsApp o PDF, para alcanzar a los alumnos que usan poco la app.

**Alumno:**
- Como alumno, quiero marcar una comida como hecha con un solo tap, para que sea fácil y rápido registrar desde el celular.
- Como alumno, quiero ver exactamente qué alimentos incluye cada comida y cuántas calorías aportan, para entender mi plan sin necesitar al coach.
- Como alumno, quiero poder sustituir un alimento del plan por otro similar, para tener flexibilidad cuando no consigo el alimento exacto.
- Como alumno, quiero que mi historial de adherencia no desaparezca cuando el coach actualiza mi plan, para ver mi racha de días cumplidos.
- Como alumno, quiero que la app funcione aunque tenga mala señal en el gimnasio, para no perder el log de mis comidas.

### 8.3 Matriz Valor / Esfuerzo

```
ALTO VALOR, BAJO ESFUERZO (hacer primero)
──────────────────────────────────────────
• Arreglar propagación SYNCED (E1)         [P0]
• Exportación de plan (WhatsApp/PDF)       [P1]
• Creación de alimento inline en builder   [P1]
• Cálculo de macros sugeridos              [P1]
• Plan por día de semana                   [P1]

ALTO VALOR, ALTO ESFUERZO (planificar bien)
────────────────────────────────────────────
• Registro gradual de consumo              [P1]
• Alertas inteligentes para el coach       [P2]
• Integración check-in ↔ nutrición         [P2]
• Offline básico                           [P1]

BAJO VALOR, BAJO ESFUERZO (quick wins)
───────────────────────────────────────
• Alimentos favoritos del alumno           [P1]
• Feedback por comida (emoji)              [P2]
• Duplicar plan entre alumnos              [P1]
• Deprecar meal_completions                [P2]

BAJO VALOR, ALTO ESFUERZO (evaluar o descartar)
────────────────────────────────────────────────
• Ciclos de dieta (cron job)               [P2]
• IA → descripción a plan                  [P3]
• Marketplace de plantillas                [P3]
```

### 8.4 Definición de "Done" por Feature

Cada feature nueva debe cumplir antes de considerarse completa:
1. Funcionalidad implementada y probada en staging.
2. Retrocompatibilidad verificada: datos actuales no se rompen.
3. Tooltip de ayuda contextual en la UI (ver Sección 11).
4. Coach puede testearla sin instrucciones adicionales.
5. Evento de analytics disparado (ver Sección 13).
6. Revisión legal si maneja datos de salud nuevos (ver Sección 16).

---

## 9. Perspectiva: UX/UI Designer

### 9.1 Principios de Diseño para el Módulo

1. **Cero fricción para el alumno:** El alumno debe poder marcar una comida en <3 segundos. Cada tap extra tiene costo de adherencia.
2. **Coach = vista de control aérea:** El coach ve el estado de todos sus alumnos sin entrar uno por uno.
3. **Información progresiva:** Mostrar lo esencial primero, el detalle bajo demanda (expandible/modal).
4. **El plan habla por sí solo:** Un alumno sin contexto debe entender qué comer y cuánto, sin necesitar al coach.

### 9.2 Flujos UX Problemáticos Actuales

| Flujo | Problema | Solución propuesta |
|-------|----------|-------------------|
| Coach crea plan → encuentra que falta alimento | Tiene que salir al catálogo, perder el contexto del builder | "Crear alimento" inline en FoodSearchDrawer |
| Alumno no entiende qué es "proteína" o "macros" | Sin tooltips explicativos | Tooltips contextuales en todos los términos técnicos (ver Sección 11) |
| Coach ve "SYNCED" badge sin saber qué significa | Sin explicación in-app | Tooltip: "Este plan se actualiza automáticamente cuando editas la plantilla" |
| Alumno no sabe que puede ver días anteriores | DayNavigator no es visible de entrada | Rediseñar DayNavigator como elemento más prominente o tutorial de primer uso |
| Coach asigna plantilla → no sabe a quién ya la asignó | Lista de asignados no es visible antes de confirmar | Modal de asignación muestra lista con checkboxes y estado actual |

### 9.3 Estados Vacíos (Empty States)

Cada estado vacío debe explicar QUÉ hacer, no solo decir "no hay datos".

| Pantalla | Empty state actual | Empty state mejorado |
|----------|-------------------|---------------------|
| Alumno sin plan | "No tienes plan activo" | "Tu coach aún no te ha asignado un plan nutricional. No dudes en escribirle." + CTA "Contactar coach" |
| Coach sin plantillas | Generic | "Crea tu primera plantilla para empezar a asignar planes a tus alumnos. Tarda menos de 5 minutos." + CTA "Crear plantilla" |
| Sin historial | Gray calendar | "Empieza a registrar tus comidas hoy. En 7 días verás tu racha aquí." |
| Búsqueda de alimentos sin resultados | "Sin resultados" | "No encontramos '{{query}}'. ¿Quieres crearlo tú?" + CTA "Crear alimento" |

### 9.4 Microinteracciones Recomendadas

- **Toggle de comida:** Vibración háptica leve + animación de check (ya existe, está bien).
- **Streak banner:** Animación de llama cuando se incrementa el streak.
- **Macro ring:** Llenar el ring animado cuando se carga la página del día.
- **Creación de alimento inline:** El nuevo alimento aparece seleccionado automáticamente en el drawer sin cerrar y reabrir.
- **Asignación de plantilla:** Confetti pequeño cuando se asigna con éxito a varios alumnos.

### 9.5 Accesibilidad (A11y)

Issues actuales identificados:
- `MacroRingSummary` usa SVG/canvas sin `aria-label` descriptivos.
- `DayNavigator` no tiene navegación por teclado documentada.
- Heatmap de 30 días no tiene texto alternativo.
- Botones de drag en el builder no tienen `aria-describedby` para screen readers.

Acciones mínimas:
```tsx
// MacroRingSummary
<svg aria-label={`Proteína: ${consumed}g de ${target}g objetivo`} role="img">

// Heatmap
<div role="grid" aria-label="Adherencia últimos 30 días">
  <div role="gridcell" aria-label={`${date}: ${completed ? 'Completado' : 'Sin registro'}`}>
```

### 9.6 Mobile-First Crítico

- El alumno usa esto **desde el celular, en el gimnasio o en la cocina**. Cada elemento interactivo debe tener área de tap ≥44px.
- El `FoodSearchDrawer` en mobile debe usar `height: 90dvh` con safe area respetada.
- El input de búsqueda de alimentos debe abrir el teclado sin ocluir los resultados (scroll automático).
- Los valores de macros en `MealIngredientRow` deben ser legibles en 320px de ancho.

---

## 10. Perspectiva: Frontend Developer

### 10.1 Arquitectura de Componentes para Nuevas Features

**Plan por día de semana — PlanBuilder:**
```
PlanBuilder
  └─ WeekdayTabs (Lun|Mar|Mié|Jue|Vie|Sáb|Dom|Todos)
      └─ MealCanvas (por día seleccionado)
          └─ MealBlock
              └─ FoodItemRow
```

- `WeekdayTabs` mantiene `selectedDay: DayOfWeek | 'all'` en estado local.
- "Replicar a todos" → clona las meals del día seleccionado a todos los días.
- La serialización al server action incluye `day_of_week` por meal.

**Registro gradual — MealCard (alumno):**
```
MealCard
  └─ MealIngredientRow
      └─ [tap] → QuantityModal (si modo detallado activo)
          └─ input numérico + unidad + macro preview
```

- `MealCard` recibe prop `detailedMode: boolean` (opt-in del alumno, guardado en `localStorage`).
- En modo simple: tap en la tarjeta = toggle. En modo detallado: tap en ítem = editar cantidad.

### 10.2 Patterns de Estado

- Nunca usar estado global (sin Zustand/Redux). Conforme a AGENTS.md.
- El estado del builder vive en `useReducer` local dentro de `PlanBuilder.tsx`.
- Los logs del día viven en RSC + revalidation. Sin estado cliente para logs (excepto optimistic).
- `useOptimistic` para toggles y quantity updates.

### 10.3 Virtualización del FoodSearchDrawer

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

Las páginas del builder son pesadas (`@dnd-kit`, `recharts`). Usar:
```tsx
const PlanBuilder = dynamic(() => import('./_components/PlanBuilder'), {
  ssr: false,
  loading: () => <PlanBuilderSkeleton />,
});
```

### 10.5 Tooltip Component

Para el sistema de tooltips contextual (ver Sección 11), usar un componente unificado:

```tsx
// components/ui/InfoTooltip.tsx
interface InfoTooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  audience?: 'coach' | 'client' | 'both';
}
// Usa Radix UI Tooltip (ya en el proyecto via shadcn)
// Icon: (?) círculo pequeño gris, inline con el label
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

### 11.2 Transaccionalidad en Propagación

`propagateTemplateChanges()` actualmente puede dejar datos parciales si falla a la mitad. Envolver en transacción:

```ts
const { error } = await supabase.rpc('propagate_template_to_client', {
  p_template_id: templateId,
  p_client_id: clientId,
});
// La función PL/pgSQL corre en una transacción atómica
```

La función SQL maneja la actualización in-place del plan manteniendo el `plan_id`.

### 11.3 Índices Recomendados

```sql
-- Cubrir la query más frecuente del alumno
CREATE INDEX IF NOT EXISTS idx_nutrition_meals_plan_dow
  ON nutrition_meals(plan_id, day_of_week);

-- Cubrir búsqueda de adherencia por fecha
CREATE INDEX IF NOT EXISTS idx_daily_nutrition_logs_client_date
  ON daily_nutrition_logs(client_id, log_date DESC);

-- Cubrir food_items por meal
CREATE INDEX IF NOT EXISTS idx_food_items_meal_id
  ON food_items(meal_id);
```

### 11.4 Snapshot de Plan en Logs

`daily_nutrition_logs` ya snapshotea `target_calories_at_log`. Extender para capturar también las comidas al momento del log (útil para "¿qué tenía el plan ese día?"):

```sql
ALTER TABLE daily_nutrition_logs
  ADD COLUMN IF NOT EXISTS plan_snapshot JSONB;
  -- Guardado una vez al crear el log del día; no mutable
```

Esto permite auditoría retroactiva y elimina la dependencia de `plan_id` para reports históricos.

---

## 12. Perspectiva: DevOps Engineer

### 12.1 Estrategia Zero-Downtime para Migraciones

Todas las migraciones de Fase A deben cumplir:

1. **Solo operaciones additive:** `ADD COLUMN IF NOT EXISTS`, no `DROP COLUMN` ni `ALTER TYPE`.
2. **Sin locks prolongados:** `ALTER TABLE ADD COLUMN` con DEFAULT es instantáneo en PostgreSQL moderno (sin full rewrite si la columna es nullable).
3. **Backup automático antes de cada migración crítica** → Verificar que Supabase tenga Point-in-Time Recovery activo.
4. **Rollback plan documentado:** Cada migración tiene su `down.sql` correspondiente.

### 12.2 Feature Flags

Para features grandes (plan por día de semana, registro gradual), usar feature flags antes de release general:

```ts
// lib/feature-flags.ts
const FEATURE_FLAGS = {
  WEEKLY_PLAN: process.env.NEXT_PUBLIC_FF_WEEKLY_PLAN === 'true',
  DETAILED_LOGGING: process.env.NEXT_PUBLIC_FF_DETAILED_LOGGING === 'true',
} as const;
```

- Flag OFF → UI actual sin cambios.
- Flag ON → nueva UI activada.
- Permite habilitar para coaches beta sin afectar producción general.

### 12.3 Monitoreo Recomendado

Alertas a configurar en Supabase / Vercel:

| Métrica | Threshold | Acción |
|---------|-----------|--------|
| `propagateTemplateChanges` duration | >5s | Investigar locks o N+1 queries |
| `toggleMealCompletion` error rate | >1% | Alert on-call |
| `search_foods` RPC p99 latency | >200ms | Revisar índice `name_search` |
| `daily_nutrition_logs` insert rate | Spike >10x normal | Posible ataque o bug de loop |

### 12.4 Variables de Entorno

Para nuevas integraciones (push notifications, PDF):
```
NEXT_PUBLIC_FF_WEEKLY_PLAN=false
NEXT_PUBLIC_FF_DETAILED_LOGGING=false
FCM_SERVER_KEY=...          # Para notificaciones push
PDF_SERVICE_URL=...         # Si se externaliza generación PDF
```

---

## 13. Perspectiva: Data Scientist / Analytics

### 13.1 Eventos de Analytics a Instrumentar

Actualmente no hay eventos de analytics en el módulo de nutrición. Antes de implementar nuevas features, instrumentar lo básico:

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

### 13.2 Métricas Clave de Retención

- **DAU/MAU de alumnos que loguean comidas:** Si un alumno logguea ≥3 días/semana, su churn es 3x menor.
- **Adherencia promedio por coach:** Indica calidad del plan y del seguimiento.
- **Tiempo entre creación de plan y primer log del alumno:** >48h = onboarding fallido.
- **Alimentos más usados por categoría:** Permite priorizar el catálogo de alimentos.
- **Comidas con mayor porcentaje de incumplimiento:** El coach puede rediseñar esas comidas.

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

Este query puede correr como función programada y alimentar los badges de alerta en el dashboard del coach.

### 13.4 A/B Testing Framework

Para features como "registro gradual vs toggle binario", configurar experimento:
- Grupo A: solo toggle (actual).
- Grupo B: toggle + opción de cantidad.
- Medir: adherencia a 30 días, tiempo en pantalla, NPS.
- Decisión a 30 días con al menos 50 usuarios por grupo.

---

## 14. Perspectiva: Product Marketing Manager (PMM)

### 14.1 Naming de Features en Español (Para UX Copy)

| Nombre técnico | Nombre UX para el usuario |
|---------------|--------------------------|
| SYNCED plan | "Plan sincronizado" (badge azul) |
| CUSTOM plan | "Plan personalizado" (badge verde) |
| Food swaps | "Intercambiar alimento" |
| Plan por día de semana | "Plan semanal" |
| Ciclos de dieta | "Programa nutricional por ciclos" |
| Registro gradual | "Registrar cantidad real" |
| Tracking de hábitos | "Hábitos diarios" |
| Macro target | "Meta del día" |
| Adherencia | "Cumplimiento" (más entendible para el alumno promedio) |

### 14.2 Comunicación de Updates al Coach

Cuando se lance Plan Semanal:
- **In-app banner** al abrir el builder por primera vez post-update: "Ahora puedes tener comidas distintas para cada día de la semana. Prueba las tabs Lun–Dom."
- **Tooltip en la pestaña del día:** "¿Quieres variar la alimentación según el tipo de entreno? Configura comidas distintas por día."
- **Email (si se tiene CRM):** "Nueva funcionalidad: Plan Semanal. Tus alumnos con más entreno de pierna ahora pueden comer más carbohidratos ese día."

### 14.3 Diferenciación Competitiva

Features que EVA tendrá que ninguna app white-label chilena tiene bien:
1. **Plan semanal configurable** (lunes diferente a sábado).
2. **Alerta automática de bajo cumplimiento** al coach.
3. **Exportación en un tap** para WhatsApp.
4. **Cálculo de macros sugerido** integrado al perfil del alumno.

Estos cuatro puntos son el argumento de venta del módulo de nutrición rediseñado.

---

## 15. Perspectiva: Customer Success Manager

### 15.1 Problemas Más Comunes que Reportarán Coaches

Anticipar tickets de soporte:

| Problema probable | Causa raíz | Solución proactiva |
|-------------------|-----------|-------------------|
| "Mis alumnos perdieron la adherencia" | Bug E1 (propagación SYNCED) | Arreglar E1 antes de cualquier otra feature |
| "No encuentro el alimento que quiero" | Catálogo limitado o búsqueda sin tildes | `unaccent` ya resuelve tildes; comunicar al coach cómo crear alimentos custom |
| "Un alumno me dice que no puede marcar la comida" | Offline o bug de toggle | Offline PWA básico (Fase B) |
| "No sé cómo cambiar el plan de solo un alumno" | SYNCED vs CUSTOM no es claro | Tooltip explicativo en badge + guía rápida in-app |
| "¿Cómo copio el plan de Juan a Pedro?" | Feature no existe para CUSTOM | Feature "Duplicar plan" (Fase C) |

### 15.2 Onboarding del Coach para Nutrición

Flujo de primer uso (wizard de 3 pasos):

```
Paso 1: "Agrega tus alimentos más usados al catálogo"
  → Pre-selección de alimentos del seed chileno
  → CTA: "Agrega tus propios alimentos"

Paso 2: "Crea tu primera plantilla de plan"
  → Template de ejemplo prellenado (desayuno/almuerzo/cena/snack)
  → CTA: "Personalizar esta plantilla"

Paso 3: "Asigna el plan a tu primer alumno"
  → Lista de alumnos actuales
  → CTA: "Asignar"
```

Sin este onboarding, muchos coaches llegarán a `/coach/nutrition-plans` y verán una página vacía sin saber por dónde empezar.

### 15.3 Métricas de Adopción de Nutrición

- % de coaches que crean ≥1 plantilla en primeros 7 días.
- % de alumnos con plan activo.
- % de alumnos que loguean en primera semana de tener plan.
- Tiempo promedio entre "plan asignado" y "primer log".

Si un coach no crea una plantilla en 7 días → trigger de email/notificación: "¿Necesitas ayuda para configurar tu primer plan nutricional?"

---

## 16. Perspectiva: Legal / Privacidad

### 16.1 Clasificación de Datos del Módulo

Los datos nutricionales son **datos de salud** bajo GDPR/CCPA y equivalentes latinoamericanos (Ley 19.628 en Chile):

| Dato | Clasificación | Requiere |
|------|--------------|----------|
| Peso (check_in) | Dato de salud | Consentimiento explícito |
| Calorías consumidas | Dato de salud | Consentimiento explícito |
| Fotos de check-in | Dato de salud / biométrico | Consentimiento explícito + opt-in doble |
| Nivel de energía | Dato de salud | Consentimiento explícito |
| `daily_nutrition_logs` | Dato de salud (historial alimentario) | Consentimiento explícito |
| Alimentos favoritos | Dato personal normal | Aviso de privacidad |

### 16.2 Recomendaciones Legales Mínimas

1. **Consentimiento explícito** al activar el módulo de nutrición para un alumno nuevo: "Al activar el plan nutricional, autorizas a [Coach] a registrar y analizar tu información alimentaria y de salud."

2. **Política de retención de datos:** Definir cuánto tiempo se mantienen los `daily_nutrition_logs`. Recomendación: 3 años desde la última actividad, luego anonymize o delete.

3. **Derecho al olvido (RTBF):** Si un alumno solicita eliminar sus datos, el flujo debe borrar cascada: `daily_nutrition_logs → nutrition_meal_logs → check_ins → fotos`.

4. **Acceso del coach:** El coach solo debe ver datos de sus alumnos activos. RLS ya implementa esto, pero verificar que al desvincularse un alumno, el coach pierde acceso inmediatamente.

5. **Datos de terceros:** Si se implementa integración con APIs externas de alimentos (USDA, Edamam), revisar los términos de uso de esas APIs. No almacenar datos de terceros sin licencia.

6. **Notificaciones push:** Requieren opt-in explícito del usuario con botón de bienvenida del navegador. No mostrar push notifications sin este consentimiento.

### 16.3 Checklist Legal para Nuevas Features

Antes de lanzar cualquier feature que maneje datos de salud nuevos:
- [ ] ¿Se agrega un nuevo tipo de dato de salud? → Actualizar política de privacidad.
- [ ] ¿El dato se comparte con terceros? → Revisar acuerdos de procesamiento de datos.
- [ ] ¿El dato tiene valor de perfil (IA, segmentación)? → Avisar explícitamente al usuario.
- [ ] ¿Se puede exportar? → Incluir en el flujo de "exportar mis datos" (RTBF).

---

## 17. Perspectiva: QA Engineer

### 17.1 Caminos Críticos a Testear (E2E)

**Flujo Coach:**
1. Coach crea plantilla → agrega 3 comidas → agrega 5 alimentos por comida → guarda → verifica macros totales.
2. Coach asigna plantilla a 2 alumnos → verifica que ambos tienen plan activo.
3. Coach edita plantilla → propaga → verifica que logs históricos de alumnos **no se borran** (test para E1).
4. Coach crea plan CUSTOM para alumno → edita plantilla original → verifica que el plan CUSTOM **no cambió**.
5. Coach busca alimento con tilde (ej: "avena") → verifica que aparece aunque esté en DB como "Avena".

**Flujo Alumno:**
1. Alumno abre plan → ve comidas del día → marca una comida → verifica UI optimistic → verifica en DB.
2. Alumno marca una comida → va al dashboard → verifica que el widget de nutrición se actualizó.
3. Alumno navega a fecha pasada → verifica que los logs anteriores son correctos.
4. Alumno sin plan activo → ve empty state correcto.

**Flujo Offline:**
1. Alumno abre plan con conexión → desconectar red → marca comida → verifica optimistic UI → reconectar → verifica sync al server.

### 17.2 Edge Cases a Cubrir

- Plan con 0 comidas (si la validación falla).
- Alimento con 0 calorías (aceite de coco, etc.) — no dividir por cero.
- Coach edita plan de alumno que está viendo su plan en ese momento → ¿qué ve el alumno?
- Alimento eliminado del catálogo que ya existe en un plan activo → el plan no debe romperse.
- Dos coaches con el mismo alumno (si es posible) → conflicto de planes.
- Fecha 29 de febrero en años bisiestos para `daily_nutrition_logs`.
- Alumno en zona horaria distinta al server → el "día actual" puede diferir.

### 17.3 Test Coverage Mínimo para Fase A

```ts
// nutrition-utils.test.ts — Cálculo de macros
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
  it('rechaza food_item con unidad inválida');
  it('rechaza calorías fuera de rango (500-15000)');
});
```

### 17.4 Regression Checklist Post-Deploy

Antes de cualquier release del módulo de nutrición:
- [ ] Toggle de comida funciona en mobile (iOS Safari + Android Chrome).
- [ ] Macros del plan suman correctamente.
- [ ] El badge SYNCED/CUSTOM aparece correctamente en NutritionTabB5.
- [ ] FoodSearchDrawer abre y cierra sin memory leaks.
- [ ] El heatmap de 30 días muestra el día de hoy como el más reciente.
- [ ] La página del alumno carga en <2s en conexión 4G simulada.

---

## 18. Ideas Adicionales — Evaluar Factibilidad

### 18.1 Plantillas Públicas / Marketplace (P3)
Un coach puede marcar plantilla como pública. Otros coaches la usan como base. **Factibilidad:** Media-baja. Requiere permisos y posiblemente monetización.

### 18.2 IA — Descripción a Plan (P3)
Coach escribe "Plan de volumen para mujer de 60kg, presupuesto bajo" → Claude API genera propuesta con alimentos del catálogo. **Factibilidad:** Media. Requiere Claude API + mapeo a `food_ids` reales.

### 18.3 Alimentos Favoritos del Alumno (P1)
```sql
CREATE TABLE client_food_preferences (
  client_id UUID, food_id UUID,
  preference_type TEXT CHECK (preference_type IN ('favorite', 'dislike')),
  PRIMARY KEY (client_id, food_id)
);
```
El coach ve preferencias al crear el plan. **Factibilidad:** Alta.

### 18.4 Feedback por Comida — Emoji (P2)
`satisfaction_score SMALLINT` nullable en `nutrition_meal_logs`. 1=no me gustó, 2=regular, 3=muy rico. El coach lo ve en perfil. **Factibilidad:** Alta.

### 18.5 Duplicar Plan entre Alumnos (P1)
`duplicatePlanToClient(sourcePlanId, targetClientId)` clona meals + food_items como plan CUSTOM al target. **Factibilidad:** Alta.

### 18.6 Historial de Versiones del Plan (P2)
Tabla `nutrition_plan_history` con JSON snapshots. Rollback si el coach se equivoca. **Factibilidad:** Media.

### 18.7 Creación de Alimento Inline en el Builder (P1)
Modal embebido en `FoodSearchDrawer`. El nuevo alimento queda seleccionado sin cerrar el drawer. **Factibilidad:** Alta.

### 18.8 Integración Workout ↔ Nutrición (P2)
`WorkoutContextBanner` en vista de nutrición del alumno: "Hoy es día de piernas → prioriza carbohidratos." Solo informativo, no modifica el plan. **Factibilidad:** Media.

### 18.9 Integración Check-in ↔ Nutrición (P2)
Alertas para el coach basadas en cruce de peso + adherencia. Ver métricas en Sección 13.3. **Factibilidad:** Media.

---

## 19. Sistema de Tooltips — Especificación Completa

Los tooltips son **fundamentales** para que coaches y alumnos entiendan el sistema sin necesitar soporte. Un tooltip bien redactado es mejor que 3 páginas de documentación.

### 19.1 Componente Base

```tsx
// components/ui/InfoTooltip.tsx
// Icono: ⓘ o ? en círculo gris pequeño, inline con el label
// Trigger: hover en desktop, tap en mobile
// Posición: auto (Radix Tooltip adjusts to viewport)
// Delay: 300ms en desktop, inmediato en mobile
<InfoTooltip content="Texto explicativo aquí" />
```

### 19.2 Tooltips para el Coach

**En NutritionHub — Tabs:**

| Elemento | Tooltip |
|----------|---------|
| Tab "Plantillas" | "Tus plantillas son modelos de plan reutilizables. Crea una vez y asígnala a varios alumnos. Si la editas, todos los alumnos con ese plan se actualizarán automáticamente." |
| Tab "Planes activos" | "Vista de todos los alumnos con un plan de nutrición activo. Muestra el cumplimiento de la semana y las calorías consumidas hoy." |
| Badge "SYNCED" | "Este plan está vinculado a una plantilla. Si editas la plantilla y propagas los cambios, este plan se actualizará automáticamente. El historial de adherencia se conserva." |
| Badge "CUSTOM" | "Este plan fue editado directamente para este alumno. No se vincula a ninguna plantilla, por lo que cambios en las plantillas no lo afectan." |
| Sparkline de adherencia (gráfico de línea 7 días) | "Porcentaje de comidas completadas cada día en los últimos 7 días. 100% = el alumno marcó todas sus comidas como realizadas." |

**En PlanBuilder:**

| Elemento | Tooltip |
|----------|---------|
| Campo "Calorías diarias" | "Suma total de calorías que el alumno debe consumir en un día. Se calcula automáticamente según los alimentos que agregues, o puedes establecerlo manualmente como meta." |
| Campo "Proteína (g)" | "Gramos de proteína al día. Para ganancia muscular: 1.6–2.2g por kg de peso corporal. Para mantención: 1.2–1.6g/kg." |
| Campo "Carbohidratos (g)" | "Gramos de carbohidratos al día. Son la principal fuente de energía. Ajusta según el nivel de actividad del alumno." |
| Campo "Grasas (g)" | "Gramos de grasa al día. Esenciales para hormonas y absorción de vitaminas. No bajar de 0.5g por kg de peso corporal." |
| Campo "Instrucciones" | "Notas visibles para el alumno en su plan. Úsalas para agregar contexto: horarios sugeridos, tip de preparación, o recordatorios específicos para este alumno." |
| Botón "Agregar comida" | "Una comida es un momento del día (Desayuno, Almuerzo, etc.). Dentro de cada comida agregarás los alimentos con sus cantidades." |
| Campo de cantidad (g) en alimento | "Cantidad en gramos. Los macros se calculan automáticamente en base a los 100g del alimento. Ejemplo: 80g de avena = 80% de los macros de 100g." |
| Campo de cantidad (un) en alimento | "Cantidad en unidades. Un huevo = 1 un. Los macros se calculan según el tamaño de porción registrado en el alimento." |
| Botón "Replicar a todos los días" (Plan semanal) | "Copia las comidas de este día a todos los demás días de la semana. Después puedes ajustar cada día individualmente." |
| Botón "Propagar cambios" | "Aplica los cambios de esta plantilla a todos los alumnos que tienen este plan asignado. Sus planes se actualizarán automáticamente. El historial de adherencia no se borrará." |
| Widget de "Macros sugeridos" | "Sugerencia calculada con la fórmula Mifflin-St Jeor según el peso, altura, edad y nivel de actividad del alumno. Es una referencia — tú defines los valores finales." |

**En Perfil del Alumno (NutritionTabB5):**

| Elemento | Tooltip |
|----------|---------|
| Gráfico pie de macros | "Distribución porcentual de las calorías del plan entre proteína, carbohidratos y grasas. Referencia: 30% proteína / 40% carbos / 30% grasas para hipertrofia." |
| Heatmap 30 días | "Cada cuadrado es un día. Verde = el alumno completó al menos una comida ese día. Gris = sin registro. No indica si cumplió el 100%, solo que logueó." |
| Gráfico compuesto 7 días | "Barras azules = calorías consumidas (suma de comidas completadas). Línea naranja = meta calórica diaria del plan." |
| "Adherencia calórica" | "Promedio de calorías consumidas vs calorías objetivo en los últimos 7 días. Útil para ver si el alumno está en déficit o excedente real." |
| "Adherencia de comidas" | "Porcentaje de comidas individuales marcadas como completadas sobre el total de comidas del plan en el período." |

**En Catálogo de Alimentos (/coach/foods):**

| Elemento | Tooltip |
|----------|---------|
| Filtro "Mis alimentos" | "Alimentos que tú has creado o importado. Solo tú y tus alumnos pueden verlos." |
| Filtro "Todos" | "Incluye los alimentos del catálogo general de EVA (~250 alimentos chilenos y globales) más los tuyos." |
| Campo "Por 100g" | "Los macros deben ingresarse por cada 100 gramos del alimento. Al agregar el alimento al plan, la cantidad se ajusta proporcionalmente." |
| Campo "Unidad de porción" | "Si el alimento se mide en unidades (huevo, plátano, etc.), ingresa el peso en gramos de 1 unidad. Esto permite al alumno ver '2 huevos' en lugar de '100g'." |

**En Asignación de Plantillas:**

| Elemento | Tooltip |
|----------|---------|
| Lista de alumnos con checkbox | "Los alumnos marcados recibirán esta plantilla como plan activo. Si ya tienen un plan, se reemplazará. El historial anterior se conserva." |
| Alumnos marcados como "Ya asignados" | "Este alumno ya tiene esta plantilla asignada. Volver a asignar actualizará su plan con los cambios más recientes de la plantilla." |

### 19.3 Tooltips para el Alumno

**En /c/[slug]/nutrition — Vista del Plan:**

| Elemento | Tooltip |
|----------|---------|
| `MacroRingSummary` — anillo de calorías | "Meta calórica diaria definida por tu coach. Si completaste todas tus comidas, estarás cerca del 100%." |
| `MacroRingSummary` — anillo de proteína | "La proteína ayuda a mantener y construir músculo. Tu meta diaria está definida en tu plan." |
| `MacroRingSummary` — anillo de carbos | "Los carbohidratos son tu fuente principal de energía. Son especialmente importantes en días de entrenamiento." |
| `MacroRingSummary` — anillo de grasas | "Las grasas saludables son esenciales para el equilibrio hormonal y la absorción de vitaminas." |
| Botón de completar comida (check) | "Toca aquí cuando hayas terminado esta comida. Tu coach verá tu progreso en tiempo real." |
| `AdherenceStrip` — heatmap | "Cada cuadrado es un día. Los cuadrados verdes son días en los que registraste tus comidas. Intenta mantener la racha." |
| `NutritionStreakBanner` — racha | "Días consecutivos en los que registraste al menos una comida. ¡Mantén la racha para ver mejores resultados!" |
| `DayNavigator` | "Navega a días anteriores para ver tu historial de comidas y macros consumidos." |
| Columna de macros en alimento | "Valores nutricionales para la cantidad exacta indicada en tu plan (no por 100g). Lo que verás cuando consumas esa porción." |
| Botón "Intercambiar" (food swap, cuando esté implementado) | "Sustituye este alimento por otro con macros similares. Tu coach definió las opciones disponibles." |
| Input de cantidad real (modo detallado, cuando esté implementado) | "Si consumiste una cantidad diferente a la planificada, ajústala aquí. Los macros se recalcularán automáticamente." |

**En /c/[slug]/dashboard — Widget de Nutrición:**

| Elemento | Tooltip |
|----------|---------|
| `ComplianceRing` — anillo de nutrición | "Porcentaje de días en los últimos 30 días en los que registraste tus comidas. Objetivo: mantenerlo sobre el 80%." |
| `MealCompletionRow` | "Toca el check para marcar esta comida como realizada. También puedes hacerlo desde la sección Nutrición." |

---

## 20. Roadmap Priorizado (Vista Consolidada)

### Fase A — Correcciones Críticas (2 semanas)
> **Sin estas correcciones, todo lo demás se construye sobre barro.**

1. **[P0] Arreglar propagación SYNCED** — Mantener `plan_id`. Los logs históricos no se pierden más.
2. **[P1] Implementar Zod schemas** — Validación en todas las server actions de nutrición.
3. **[P1] Refactorizar `NutritionService`** — De FormData indexado a JSON tipado.
4. **[P2] Eliminar `meal_completions` legacy** — Vista de compatibilidad + DROP.
5. **[P1] Tests unitarios** para `nutrition-utils.ts` y schemas Zod.
6. **[P1] Sistema de tooltips base** — `InfoTooltip` component + tooltips Fase A (todos los que no requieren features nuevas).

### Fase B — UX Alumno + Quick Wins (3 semanas)

7. **[P1] Exportación de plan** — Botón "Copiar para WhatsApp" / PDF.
8. **[P1] Creación de alimento inline** — Desde `FoodSearchDrawer` sin salir al catálogo.
9. **[P1] Cálculo de macros sugeridos** — Widget en el builder basado en perfil del alumno.
10. **[P1] Alimentos favoritos del alumno** — Tabla `client_food_preferences`.
11. **[P1] Registro gradual de consumo** — `consumed_quantity` nullable en logs + UI opt-in.
12. **[P1] Offline básico** — Cachear plan en SW + queue de toggles en `localStorage`.
13. **[P1] Onboarding de nutrición** — Wizard de 3 pasos para coach nuevo.
14. **[P1] Tooltips Fase B** — Todos los tooltips de features nuevas de esta fase.

### Fase C — Flexibilidad del Plan (3 semanas)

15. **[P1] Plan por día de semana** — `day_of_week` en `nutrition_meals`, tabs en builder.
16. **[P2] Food swaps** — Grupos de intercambio definidos por coach + UI del alumno.
17. **[P2] Tracking de hábitos** — Agua, pasos, ayuno. Tabla `daily_habits`.
18. **[P2] Feedback por comida** — Emoji satisfaction en `nutrition_meal_logs`.
19. **[P2] Duplicar plan entre alumnos** — `duplicatePlanToClient()`.
20. **[P2] Alertas básicas de bajo cumplimiento** — Badge rojo en directorio de clientes.

### Fase D — Diferenciadores Pro (4 semanas)

21. **[P2] Alertas inteligentes coach** — Estancamiento, over-restriction, riesgo abandono.
22. **[P2] Integración check-in ↔ nutrición** — Cruzar peso con adherencia en perfil del alumno.
23. **[P2] Integración workout ↔ nutrición** — `WorkoutContextBanner` informativo.
24. **[P2] Ciclos de dieta** — Bloques de semanas con transición automática.
25. **[P2] Historial de versiones del plan** — Snapshots + rollback.
26. **[P3] IA — Descripción a plan** — Claude API genera propuesta con alimentos del catálogo.

---

## 21. Conclusión

El módulo de nutrición de EVA está **bien construido desde la base**: el modelo de datos es sólido, la UX del builder es fluida, y la integración dashboard-perfil funciona. Sin embargo, todavía opera como un "plan estático de papel digitalizado" en lugar de un "sistema de nutrición adaptativo".

**Los 3 cambios con mayor ROI:**

1. **Corregir propagación SYNCED** — Bug real con impacto en producción. Un coach que edita una plantilla hoy borra el historial de adherencia de sus alumnos.
2. **Plan por día de semana** — Diferenciador competitivo inmediato. Cambio de schema minimal (`day_of_week` nullable), impacto enorme en el valor del producto.
3. **Registro gradual de consumo** — Convierte adherencia binaria en datos reales de cumplimiento calórico. Da al coach información accionable para ajustar el plan.

**Los tooltips son el cuarto pilar:** Un sistema bien pensado de ayuda contextual reduce la carga de soporte y acelera la adopción del módulo tanto en coaches nuevos como en alumnos.

**La Regla de Oro de la Migración:** Cada cambio de schema es nullable o additive. Nunca se eliminan columnas usadas por planes activos sin migración previa. El historial de un alumno activo es sagrado.

Con esos tres cambios técnicos + el sistema de tooltips + offline básico, el módulo pasa de "funcional" a "competitivo". Los demás items lo llevan a "líder de categoría".
