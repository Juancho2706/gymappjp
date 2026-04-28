# Análisis del Módulo de Nutrición — EVA Fitness Platform

> **Fecha:** 2026-04-27  
> **Alcance:** Arquitectura, flujos, integraciones, errores detectados y roadmap de mejora.  
> **Estado:** Sin modificaciones de código — solo análisis y recomendaciones.

---

## 1. Visión General

El módulo de nutrición es uno de los más complejos del codebase. Cubre:

- **Coach:** Creación de plantillas, biblioteca de alimentos, asignación a alumnos, edición custom por alumno, seguimiento de adherencia.
- **Alumno:** Visualización de plan diario, togglear comidas completadas, resumen de macros, historial de adherencia 30 días, integración con dashboard.
- **Datos:** 13 tablas en PostgreSQL, servicio central `NutritionService`, búsqueda con `unaccent`, recetas, comidas guardadas reutilizables.

**Completitud funcional:** ~85%. El core está sólido, pero hay brechas de UX, validación, offline y flexibilidad del plan que lo separan de un producto "next level".

---

## 2. Arquitectura Actual

### 2.1 Modelo de Datos (13 tablas)

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  nutrition_plan_templates   │     │          recipes            │
│  (moldes del coach)         │     │  (recetas con macros)       │
└─────────────┬───────────────┘     └─────────────┬───────────────┘
              │                                   │
    ┌─────────┴──────────┐              ┌─────────┴──────────┐
    │   template_meals   │              │ recipe_ingredients │
    └─────────┬──────────┘              └─────────┬──────────┘
              │                                   │
    ┌─────────┴──────────┐                       │
    │ template_meal_groups│◄─────────────────────┘
    └─────────┬──────────┘
              │
    ┌─────────┴──────────┐
    │    saved_meals     │◄──── Comidas guardadas reutilizables
    └─────────┬──────────┘
              │
    ┌─────────┴──────────┐
    │  saved_meal_items  │────► foods
    └────────────────────┘

┌─────────────────────────────┐
│      nutrition_plans        │◄──── Plan asignado a alumno
│   (SYNCED | CUSTOM)         │      (is_active, is_custom)
└─────────────┬───────────────┘
              │
    ┌─────────┴──────────┐
    │   nutrition_meals  │
    └─────────┬──────────┘
              │
    ┌─────────┴──────────┐
    │     food_items     │────► foods
    └────────────────────┘

┌─────────────────────────────┐
│   daily_nutrition_logs      │◄──── Log diario por cliente
└─────────────┬───────────────┘
              │
    ┌─────────┴──────────┐
    │  nutrition_meal_logs│◄──── Estado de completitud por comida
    └────────────────────┘
```

**Tablas legacy:** `meal_completions` (sin FK formal a `nutrition_meals`). Debería deprecarse y migrarse.

### 2.2 Flujo de Datos Coach → Alumno

```
Coach crea plantilla
    │
    ▼
 nutrition_plan_templates
    + template_meals
    + template_meal_groups
    + saved_meals / saved_meal_items
    │
    ▼
Asigna a cliente(s)
    │
    ▼
 propagateTemplateChanges()
    │
    ├── Desactiva plan previo (is_active = false)
    ├── Inserta nutrition_plans (is_custom = false)
    ├── Clona nutrition_meals
    └── Clona food_items
    │
    ▼
Alumno ve en /c/[slug]/nutrition
    ├── getActiveNutritionPlan → meals + food_items + foods
    ├── getNutritionLogForDate → daily_nutrition_logs + nutrition_meal_logs
    └── toggleMealCompletion → upsert log + revalidatePath
```

### 2.3 SYNCED vs CUSTOM

| Tipo | Origen | Editable por coach | Se actualiza al editar template |
|------|--------|-------------------|--------------------------------|
| **SYNCED** | Plantilla | Sí, vía plantilla | Sí, propagación destruye y recrea |
| **CUSTOM** | Directo en alumno | Sí, vía `/client/[id]` | No, desvinculado |

**Problema:** La propagación SYNCED es **destructiva**. Borra el plan anterior e inserta uno nuevo. Pierde historial de `daily_nutrition_logs` porque el `plan_id` cambia. Esto es un bug de diseño.

---

## 3. Integración con el Resto de la App

### 3.1 Dashboard del Alumno

- `NutritionDailySummary` (RSC) muestra resumen compacto con `MacroBar` + `MealCompletionRow`.
- `MealCompletionRow` usa `useOptimistic` + `toggleMealCompletion`. Al completar, hace `router.refresh()` para sincronizar dashboard.
- `ComplianceRing` muestra score de nutrición 30 días (días con log / 30).
- `RestDayCard` en días sin entreno linkea a nutrición.

**Evaluación:** Buena integración. El toggle rápido desde dashboard es útil. El `router.refresh()` es correcto pero podría optimizarse con `useOptimistic` a nivel global.

### 3.2 Perfil del Alumno (vista coach)

- `NutritionTabB5` muestra plan activo, badges SYNCED/CUSTOM, macros meta, gráfico pie, heatmap 30 días, gráfico compuesto 7 días, historial tabla, `DayNavigator`.
- Link directo a editar plan o "ver como alumno".

**Evaluación:** Muy completa. Es la vista más rica del módulo. El gráfico compuesto barras vs línea meta es excelente para el coach.

### 3.3 Check-in

- El check-in guarda peso, energía, fotos en `check_ins`.
- **No hay vinculación directa** entre `check_ins.weight` y `daily_nutrition_logs`.
- El coach ve peso/energía en su dashboard, pero no hay ajuste automático de calorías ni feedback al alumno del tipo "Tu peso bajó 2kg, ¿ajustar plan?".

**Evaluación:** Oportunidad perdida. El peso del check-in debería alimentar métricas de nutrición y sugerir ajustes.

### 3.4 Directorio de Clientes (Coach)

- `ClientCardV2` tiene botón "Nutri" que va directo al plan del alumno.
- Muestra adherencia/peso/energía en la tarjeta.

**Evaluación:** Bien. Acceso rápido es clave para operación diaria del coach.

### 3.5 Workout

- **Cero integración** entre entrenamiento y nutrición.
- No hay pre/post-workout meals destacadas, ni recomendaciones de timing, ni ajuste de carbs segén tipo de entreno.

**Evaluación:** Brecha importante. Un alumno que hace piernas necesita más carbs que en día de brazo. El plan es 100% estático.

---

## 4. Fortalezas (Lo que está bien)

1. **Modelo de datos robusto:** Templates, saved meals, planes custom, logs diarios, historial. Cubre casos reales de coaching.
2. **SYNCED/CUSTOM:** Patrón inteligente. Permite escalar (plantilla para 20 alumnos) y personalizar (ajuste para 1 alumno específico).
3. **Búsqueda de alimentos:** `unaccent` + `name_search` + índice + RPC `search_foods`. Rápido y tolerante a tildes.
4. **Recetas como alimentos:** Al guardar receta se crea un `foods` pseudo-alimento. El alumno la ve como ítem simple en su plan.
5. **UX del builder:** Drag & drop con `@dnd-kit`, cálculo de macros en tiempo real, preview de cantidad antes de agregar.
6. **Optimistic UI:** `useOptimistic` en toggles de comida. Se siente instantáneo.
7. **Cumplimiento de AGENTS.md:** Sin Redux/Zustand, RSC + Server Actions, `React.cache`, `dvh`, safe areas, `cn()`.
8. **Food library:** Infinita scroll, filtros por categoría, scope all/mine, sort. Escalable para miles de alimentos.
9. **Dashboard del coach:** Sparkline 7 días, kcal consumidas hoy, adherencia. Buen nivel de insight.
10. **Categorías y seed:** ~250+ alimentos precargados chilenos/globales con categorías.

---

## 5. Errores, Code Smells y Deuda Técnica

### 🔴 Errores de Diseño

| # | Problema | Impacto |
|---|----------|---------|
| **E1** | **Propagación SYNCED destruye plan_id** → Los logs históricos de adherencia quedan huérfanos porque apuntan al plan anterior. El alumno pierde su racha/historial si el coach edita la plantilla. | Alto. Pierde datos de adherencia visual en UI. |
| **E2** | **Sin Zod validation** en TODO el módulo de nutrición. `saveCustomFood`, `upsertCoachNutritionTemplate`, `upsertClientNutritionPlanJson` usan validación manual (`parseFloat`, `isNaN`). | Medio. Riesgo de datos corruptos, XSS, o crashes. |
| **E3** | **NutritionService opera con FormData indexado** (`meal_name_${i}`, `meal_${i}_food_${j}`). Es un protocolo frágil de strings. Si el índice salta, se pierden datos. | Medio. Deuda técnica que dificulta mantenimiento. |
| **E4** | **`meal_completions` legacy sin FK** a `nutrition_meals`. Tabla huérfana que confunde. | Bajo. Limpieza pendiente. |
| **E5** | **Unidades canónicas** `g`/`un` están bien, pero el builder y algunos componentes aún tienen compatibilidad con `ml`, `gr`, `cda`, `cdta`, `taza`, `porción`. Riesgo de inconsistencia. | Medio. El cálculo de macros puede desviarse si se mezclan. |

### 🟡 Code Smells

| # | Problema | Ubicación |
|---|----------|-----------|
| **C1** | `saveNutritionTemplate` y `saveCustomFood` son **actions legacy con FormData** que conviven con wrappers JSON modernos. Hay duplicación de lógica. | `nutrition-coach.actions.ts` |
| **C2** | `FoodSearch.tsx` (componente standalone) y `FoodBrowser.tsx` (página de catálogo) **duplican lógica** de búsqueda/filtros con UI distinta. | `coach/foods/`, `nutrition-plans/_components/` |
| **C3** | `getFoodLibrary` carga 120 items iniciales; `FoodSearchDrawer` carga 300 y filtra client-side. **Dos estrategias inconsistentes** para el mismo catálogo. | queries + drawer |
| **C4** | **No hay test coverage** dedicado para nutrición. Ni unitarios (Vitest) ni E2E (Playwright). | `tests/`, `src/**/*.test.*` |
| **C5** | `daily_nutrition_logs` guarda `target_*_at_log` pero el alumno **nunca puede registrar lo que realmente comió** (solo sí/no). Los targets se snapshotan pero no hay contraste real vs planificado. | `nutrition.actions.ts` |

### 🟠 Brechas Funcionales

| # | Problema | Impacto UX |
|---|----------|------------|
| **B1** | **Plan 100% estático.** No hay variación por día de semana (ej: más carbs en día de pierna), ciclos (refeed, dieta deficit/surplus), ni periodización. | El coach debe crear múltiples templates y rotar manualmente. |
| **B2** | **El alumno no puede ajustar cantidades.** Si el plan dice "150g pollo", el alumno solo puede marcar "comí" o "no comí". No puede registrar "comí 120g". | Datos de adherencia son binarios, no graduales. |
| **B3** | **Sin tracking de agua, pasos, suplementos, ayuno.** | Oportunidad de valor agregado perdida. |
| **B4** | **Sin integración check-in ↔ nutrición.** El peso no ajusta calorías automáticamente ni sugiere revisiones. | El coach debe hacerlo manualmente. |
| **B5** | **Offline = brick.** El SW ignora `/c/` y POST. Si el alumno marca una comida sin red, pierde el toggle. | Mala UX en móvil con red inestable. |
| **B6** | **Sin notificaciones/reminders.** El alumno no recibe "¡Hora del snack!" ni recordatorios de log. | Menor adherencia real. |
| **B7** | **Recetas no se pueden usar directamente en el plan del alumno como meal completa.** Solo aparecen como ítem dentro de una meal. | UX confusa: una "Receta" es un alimento, no una comida. |
| **B8** | **No hay intercambio de alimentos (food swaps).** Si el plan dice "manzana", el alumno no puede cambiarla por "pera" manteniendo macros. | Rígido; frustra al alumno. |

---

## 6. Opinión y Recomendaciones — "Next Level"

### 6.1 Arquitectura de Datos (Inmediato)

#### 6.1.1 Arreglar propagación SYNCED (P0)

**Problema:** `propagateTemplateChanges` borra el plan e inserta uno nuevo. El `plan_id` cambia, los logs quedan huérfanos.

**Solución:** Cambiar a modelo **versionado**.

```sql
-- Añadir a nutrition_plans:
ALTER TABLE nutrition_plans ADD COLUMN template_version_id UUID;
ALTER TABLE nutrition_plans ADD COLUMN is_synced BOOLEAN DEFAULT false;
```

- Al editar template: incrementar `template_version_id`.
- `propagateTemplateChanges` actualiza **in-place** los planes SYNCED (`UPDATE nutrition_plans SET ... WHERE template_id = X AND is_custom = false`).
- Borra e inserta solo `nutrition_meals` + `food_items` (hijos), pero mantiene el mismo `plan_id`.
- Los logs históricos permanecen válidos.

**Alternativa mínima:** Si mantener el `plan_id` es complejo, al menos hacer que `daily_nutrition_logs` use un `client_id + log_date` único como clave natural, y que los reports agreguen por fecha sin importar `plan_id`.

#### 6.1.2 Migrar de FormData a JSON + Zod (P1)

**Problema:** `NutritionService` parsea `FormData` con strings indexados. Es propenso a errores.

**Solución:**

```ts
// Schema canónico
const FoodItemSchema = z.object({
  food_id: z.string().uuid(),
  quantity: z.number().positive().max(5000),
  unit: z.enum(['g', 'un']),
});

const MealSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().nonnegative(),
  food_items: z.array(FoodItemSchema).max(20),
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

- Eliminar `saveNutritionTemplate` legacy.
- `NutritionService.createOrUpdateTemplate` recibe objetos tipados, no FormData.
- Validar en server action y re-validar en service.

#### 6.1.3 Deprecar `meal_completions` (P2)

```sql
-- Crear vista de compatibilidad si algo la usa
-- Luego DROP TABLE meal_completions;
```

### 6.2 UX del Alumno (Alto Impacto)

#### 6.2.1 Registro Gradual de Consumo (P1)

En vez de toggle binario, permitir:

- **Modo Simple (actual):** Toggle sí/no.
- **Modo Detallado (nuevo):** El alumno puede ajustar cantidad real consumida por alimento.

```ts
// nutrition_meal_logs añade:
consumed_quantity?: number;  // null = 100% (planificado)
consumed_unit?: 'g' | 'un';
```

- Si `consumed_quantity` es null → se asume 100% del plan.
- Si tiene valor → `calculateFoodItemMacros` usa ese valor para el resumen diario.
- El dashboard del coach muestra "Adherencia calórica" (suma real / meta) vs "Adherencia de comidas" (cuántas comidas hizo).

#### 6.2.2 Intercambio de Alimentos (Food Swaps) (P2)

Cuando el alumno toca un alimento, ofrecer "Sustituir por equivalente":

```ts
// Lógica: buscar foods con similar macro dentro de ±15% calorías y ±20% proteína
const swapCandidates = await searchFoodSwaps(foodId, {
  calorieTolerance: 0.15,
  proteinTolerance: 0.20,
});
```

- El coach puede marcar alimentos como "intercambiables" (ej: dentro de una lista de frutas).
- Esto da flexibilidad sin romper el plan.

#### 6.2.3 Tracking de Agua + Pasos + Ayuno (P2)

Nuevas tablas pequeñas:

```sql
CREATE TABLE daily_habits (
  client_id UUID,
  log_date DATE,
  water_ml INT DEFAULT 0,
  steps INT DEFAULT 0,
  fasting_hours INT DEFAULT 0,
  notes TEXT,
  PRIMARY KEY (client_id, log_date)
);
```

- Widget en dashboard del alumno.
- El coach lo ve en el perfil del alumno.
- Bajo esfuerzo, alto valor percibido.

#### 6.2.4 Recordatorios y Streaks (P2)

- Notificación push vía SW (cuando tengamos push notifications).
- Banner de streak más emocional: "🔥 5 días seguidos cumpliendo tu plan. ¡Eres un fenómeno!"
- Recordatorio si a las 21:00 no ha logueado cena.

### 6.3 Flexibilidad del Plan (Diferenciador)

#### 6.3.1 Plan por Día de Semana (P1)

Actualmente un plan tiene las mismas comidas todos los días. Debería soportar:

```ts
type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface NutritionPlan {
  // ... campos actuales ...
  schedule: Record<DayOfWeek, MealDraft[]> | null; // null = mismo todos los días
}
```

- UI del builder: tabs "Lun Mar Mié ..." con opción "Replicar a todos".
- Esto permite: más carbs en días de pierna, refeed los sábados, ayuno intermitente ciertos días.

#### 6.3.2 Ciclos de Dieta (P2)

Permitir crear "bloques" de semanas:

```
Semana 1-4: Deficit 2000 kcal
Semana 5:    Refeed 2800 kcal
Semana 6-8:  Deficit 1900 kcal
```

- El sistema avanza automáticamente de semana en semana.
- El alumno ve "Semana 3 de 8" en su dashboard.

#### 6.3.3 Integración Workout ↔ Nutrición (P2)

En `workout_logs`, al guardar un entreno, etiquetar el tipo (fuerza, hipertrofia, cardio). El dashboard de nutrición puede mostrar:

- "Hoy es día de pierna → prioriza carbs alrededor del entreno."
- Ajuste automático de ±10% calorías según volumen de entrenamiento (si el coach activa la opción).

### 6.4 Offline y Resiliencia (P1)

El service worker actual ignora `/c/` y POST. Esto es un problema grave en móvil.

**Estrategia mínima viable:**

```js
// sw.js — Cache-first para GET de /c/[slug]/nutrition
// Queue para POST fallidos (background sync o IndexedDB)
```

- `Workbox` o solución manual: cachear el JSON del plan activo.
- Si el alumno marca una comida offline:
  1. Guardar en `localStorage` queue.
  2. Mostrar optimistic UI.
  3. Cuando vuelva la red, flush queue.
  4. Si hay conflicto (ej: ya existe log en server), resolver server-wins.

### 6.5 Analytics y Coach Experience (P1)

#### 6.5.1 Alertas Inteligentes en Dashboard Coach

Actualmente el coach ve sparklines. Debería ver:

- **Riesgo de abandono:** Alumno con <30% adherencia 7 días seguidos → badge rojo.
- **Estancamiento:** Peso igual 3 semanas + adherencia >80% → sugerir "Revisar plan o calorías".
- **Over-restriction:** Alumno con >95% adherencia pero energía promedio <4/10 → posible under-eating.

#### 6.5.2 Comparativa Antes/Después

En el perfil del alumno:

- Foto check-in día 1 vs último.
- Peso inicial vs actual con tendencia.
- Adherencia promedio por semana (línea).

### 6.6 Performance y Escalabilidad

| Issue | Solución |
|-------|----------|
| `getFoodLibrary` carga 120 inicial; búsqueda escanea 300 client-side | Paginación server-side siempre. Cursor-based para infinite scroll. |
| `FoodSearchDrawer` renderiza 300 items | Virtualizar con `@tanstack/react-virtual` (ya está en dependencias). |
| `nutrition-coach.queries.ts` tiene queries muy anidadas | Revisar índices en `template_meal_groups.saved_meal_id`, `food_items.meal_id`. |
| `daily_nutrition_logs` crecerá rápido | Política de retención: archivar logs >2 años a tabla `daily_nutrition_logs_archive`. |

---

## 7. Roadmap Priorizado

### Fase A — Correcciones Críticas (2 semanas)

1. **Arreglar propagación SYNCED** para no perder historial de logs.
2. **Implementar Zod schemas** en todas las server actions de nutrición.
3. **Refactorizar `NutritionService`** de FormData a JSON tipado.
4. **Eliminar `meal_completions`** legacy.
5. **Añadir tests unitarios** para `nutrition-utils.ts` (cálculo de macros).

### Fase B — UX Alumno (3 semanas)

6. **Registro gradual:** Permitir cantidad real consumida (`consumed_quantity`).
7. **Offline básico:** Cachear plan en SW + queue de toggles en `localStorage`.
8. **Plan por día de semana:** Tabs en builder (Lun–Dom).
9. **Recordatorios:** Notificación push + banner de streak mejorado.
10. **Food swaps:** Sustitución de alimentos manteniendo macros.

### Fase C — Diferenciadores Pro (4 semanas)

11. **Ciclos de dieta:** Bloques de semanas con transición automática.
12. **Tracking hábitos:** Agua, pasos, ayuno.
13. **Integración workout-nutrición:** Ajuste de carbs según tipo de entreno.
14. **Alertas coach:** Riesgo abandono, estancamiento, over-restriction.
15. **Comparativa antes/después:** Fotos + peso + adherencia.

---

## 8. Conclusión

El módulo de nutrición de EVA está **bien construido desde la base**: el modelo de datos es sólido, la UX del builder es fluida, y la integración dashboard-perfil funciona. Sin embargo, todavía opera como un "plan estático de papel digitalizado" en lugar de un "sistema de nutrición adaptativo".

**Los 3 cambios con mayor ROI:**

1. **Corregir propagación SYNCED** (evita pérdida de datos de adherencia).
2. **Registro gradual de consumo** (convierte adherencia binaria en datos reales de cumplimiento calórico).
3. **Plan por día de semana** (diferenciador competitivo inmediato; ninguna app white-label chilena lo hace bien).

Con esos tres + offline básico, el módulo pasa de "funcional" a "competitivo". Los demás items lo llevan a "líder de categoría".
