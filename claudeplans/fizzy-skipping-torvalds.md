# Plan: Correcciones post-análisis nutrición — docs + UI/UX audit

## Context

Tras revisar el trabajo de Cursor en el rework de nutrición (planes A–H), se identificaron:
1. Un ajuste de documentación: sacar meals/recipes/barcode del porcentaje del módulo nutrición coach
2. Una revisión exhaustiva de UI/UX de los 4 módulos >80%: nutrición alumno, hub coach, PlanBuilder, dashboard alumno

---

## PARTE 1 — Documentación

### 1.1 `docs/ESTADO-COMPONENTES.md` — Reestructurar tabla nutrición coach

**Cambio:** Separar la tabla en "Núcleo (en scope)" y "Extensiones futuras (fuera de scope)". Eliminar la línea confusa "Resultado módulo completo: ~55%".

**Sección a reemplazar** (líneas 147–162):
```
### Módulo Nutrición del Coach
[tabla actual con meals/recipes/barcode mezclados]
Resultado — núcleo: ~93%
Resultado — módulo "completo" si se exigen meals + recipes + grupos al mismo nivel: ~55%
```

**Por:**
```markdown
### Módulo Nutrición del Coach

#### Núcleo (en scope — flujo principal alumno + coach)

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Hub + tabs | `/coach/nutrition-plans` | ✅ | 95% | NutritionHub 2000px, TemplateLibrary, ActivePlansBoard (sparkline 7d + kcal hoy), FoodLibrary, AssignModal |
| PlanBuilder + rutas | `…/new`, `…/[id]/edit`, `…/client/[clientId]` | ✅ | 95% | dnd-kit, FoodSearchDrawer, actions unificadas en nutrition-coach.actions.ts |
| Redirect legacy | `/coach/nutrition-builder/[clientId]` | 🔶 | 40% | Solo redirect; forms/modal legacy eliminados |
| Alimentos | `/coach/foods` | ✅ | 95% | FoodBrowser + FoodListCompact, AddFoodSheet, getFoodLibrary |

**Resultado núcleo: ~93%** — RLS migraciones en supabase/migrations/; validación E2E cuando TOTAL ESTIMADO > ~90%.

#### Extensiones futuras (fuera de scope — decisión producto 2026-04-09)

| Componente | Ruta | Estado | Notas |
|------------|------|--------|-------|
| Comidas | `/coach/meals` | ❌ Futuro | Prioridad baja hasta nueva decisión de producto |
| Grupos de Comidas | `/coach/meal-groups` | 🔶 Futuro | Sin rework UX |
| Recetas | `/coach/recipes` | ❌ Futuro | Fuera del núcleo acordado |
| Código de barras / import | — | ❌ Futuro | FoodImportRow no implementado |
```

### 1.2 `docs/ESTADO-COMPONENTES.md` — Tabla resumen

Fila del módulo nutrición coach en el resumen general (actualmente dice `~93%`):
```
| Módulo Nutrición Coach (núcleo) | ~93% (extensiones futuras excluidas) |
```

---

## PARTE 2 — Correcciones UI/UX

Organizadas por severidad. Solo se incluyen las reales y verificadas por los agentes.

### CRÍTICAS (Alta) — corregir en esta sesión

#### C1. `NutritionDailySummary.tsx` — commitear cambio pendiente en git
- El archivo aparece con `M` en git status. Verificar con `git diff` y si es el fix de macros reales, commitear.

#### C2. `PlanBuilder.tsx` — Orden en mobile incorrecto
- **Archivo:** `src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`
- **Problema:** En mobile (< lg), el canvas aparece ARRIBA del sidebar. El usuario ve el canvas vacío sin saber las metas de calorías.
- **Fix:** En el contenedor flex, cambiar el order: sidebar arriba en mobile (`order-first`), canvas abajo.
- Buscar el div con `lg:flex-row` y asegurar que `PlanBuilderSidebar` tenga `order-1 lg:order-2` y `MealCanvas` tenga `order-2 lg:order-1`.

#### C3. `FoodSearchDrawer.tsx` — Sin feedback cuando búsqueda falla
- **Archivo:** `src/app/coach/nutrition-plans/_components/PlanBuilder/FoodSearchDrawer.tsx`
- **Problema:** Si la búsqueda falla (error de red/BD), se resetea a `[]` silenciosamente. Usuario cree que no hay resultados.
- **Fix:** En el bloque de fetch (~línea 88-101), agregar manejo del error con `toast.error('Error al buscar alimentos')`.

#### C4. `PlanBuilder.tsx` — Guardar plan vacío sin validación
- **Archivo:** `src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`
- **Problema:** El coach puede guardar un plan sin ninguna comida.
- **Fix:** Antes de llamar la action de guardar (~línea 126-134), validar `meals.length === 0` y mostrar `toast.error('Agrega al menos una comida antes de guardar')`. No redirigir.

#### C5. `MealCard.tsx` + `MacroRingSummary.tsx` — Sin `useReducedMotion`
- **Archivos:** 
  - `src/app/c/[coach_slug]/nutrition/_components/MealCard.tsx`
  - `src/app/c/[coach_slug]/nutrition/_components/MacroRingSummary.tsx`
- **Problema:** Animaciones (scale, strokeDasharray) sin respetar `prefers-reduced-motion`. Otros componentes del proyecto ya usan `useReducedMotion()` de `framer-motion`.
- **Fix:** Importar `useReducedMotion` de `framer-motion`. Si `shouldReduceMotion`, usar `duration: 0` o desactivar animaciones.

#### C6. `ActivePlansBoard.tsx` — Sparkline sin cap a 100
- **Archivo:** `src/app/coach/nutrition-plans/_components/ActivePlansBoard.tsx`
- **Problema:** `(v / 100) * 100` sin `Math.min(v, 100)`. Si v > 100, la barra desborda.
- **Fix:** Línea ~109: `Math.max(6, Math.round((Math.min(v, 100) / 100) * 100))`.

#### C7. `NutritionShell.tsx` — Error silencioso en toggle
- **Archivo:** `src/app/c/[coach_slug]/nutrition/_components/NutritionShell.tsx`
- **Problema:** El `catch` (~línea 139) solo hace `console.error`. Usuario no sabe que el toggle falló.
- **Fix:** Agregar `import { toast } from 'sonner'` y `toast.error('Error al registrar comida')` en el catch.

---

### ALTAS — corregir en esta sesión

#### A1. `TemplateLibrary.tsx` + `ActivePlansBoard.tsx` — `confirm()` del browser
- **Archivos:**
  - `src/app/coach/nutrition-plans/_components/TemplateLibrary.tsx` (~línea 79)
  - `src/app/coach/nutrition-plans/_components/ActivePlansBoard.tsx` (~línea 28)
- **Problema:** Usan `confirm()` nativo del browser para confirmación de borrar/desasignar. Inconsistente con el resto del sistema que usa Dialog/Sheet.
- **Fix:** Reemplazar con un `AlertDialog` de shadcn. Cuando el usuario hace click en eliminar, abrir el AlertDialog con "¿Eliminar esta plantilla?" y botones Cancelar / Eliminar.

#### A2. `NutritionHub.tsx` — `animate-fade-in` no existe en Tailwind
- **Archivo:** `src/app/coach/nutrition-plans/_components/NutritionHub.tsx`
- **Problema:** `className="... animate-fade-in ..."` (~línea 47). Esta clase no existe en Tailwind estándar. Revisar si está en `tailwind.config.ts` como custom animation. Si no, cambiar a `animate-in fade-in duration-300`.
- **Fix:** Verificar config. Si no existe, usar `animate-in fade-in duration-300` (que sí es de tailwind-animate que el proyecto usa).

#### A3. `FoodBrowser.tsx` — scope inicial inconsistente
- **Archivo:** `src/app/coach/foods/_components/FoodBrowser.tsx`
- **Problema:** Inicia con scope `'mine'` pero `FoodLibrary.tsx` del hub inicia con `'all'`. Un coach nuevo que entra a `/coach/foods` ve "mis alimentos" (vacío) en lugar de el catálogo global.
- **Fix:** Cambiar scope inicial en FoodBrowser a `'all'` para consistencia con el hub.

#### A4. `MacroRingSummary.tsx` — dark mode en SVG
- **Archivo:** `src/app/c/[coach_slug]/nutrition/_components/MacroRingSummary.tsx`
- **Problema:** El stroke de "over" usa `#ef4444` hardcodeado (~línea 56). En dark mode, el anillo de fondo (track) es gris claro hardcodeado también.
- **Fix:** Usar variables CSS o clases Tailwind con `dark:` variant en lugar de hex hardcodeados. El track puede ser `stroke-muted` via className en lugar de color hardcodeado.

#### A5. `MealIngredientRow.tsx` — macros sin redondear
- **Archivo:** `src/app/c/[coach_slug]/nutrition/_components/MealIngredientRow.tsx`
- **Problema:** Muestra `macros.protein` sin `Math.round()`, mientras `MealCard.tsx` sí redondea.
- **Fix:** Aplicar `Math.round()` a todos los valores de macro en `MealIngredientRow`.

#### A6. `MealCompletionRow.tsx` — sin feedback visual de loading
- **Archivo:** `src/app/c/[coach_slug]/dashboard/_components/nutrition/MealCompletionRow.tsx`
- **Problema:** Durante `pending`, el botón se desactiva pero sin indicador visual (opacity, spinner).
- **Fix:** Agregar `opacity-60` o `disabled:opacity-50` al botón cuando `isPending`. Opcional: Loader2 icon mientras está pending.

#### A7. Stats cards grid en mobile — `NutritionHub.tsx`
- **Archivo:** `src/app/coach/nutrition-plans/_components/NutritionHub.tsx`
- **Problema:** Stats cards usan `grid-cols-3` (~línea 125-137). En mobile 375px, 3 columnas son ilegibles.
- **Fix:** Cambiar a `grid-cols-2 sm:grid-cols-3` o `grid-cols-3 gap-2 sm:gap-4`.

#### A8. `AssignModal.tsx` — botón sin spinner mientras asigna
- **Archivo:** `src/app/coach/nutrition-plans/_components/AssignModal.tsx`
- **Problema:** `isAssigning` desactiva botón pero no muestra spinner (~línea 64-79).
- **Fix:** Agregar `{isAssigning && <Loader2 className="w-4 h-4 animate-spin" />}` en el botón de asignar.

---

### MEDIAS — incluir en esta sesión si hay tiempo, sino backlog

#### M1. `PlanBuilderSidebar.tsx` — `pctDiff()` con target 0
- **Archivo:** `src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilderSidebar.tsx`
- **Problema:** Si el coach crea plan sin definir meta de calorías (target = 0), `pctDiff()` hace división por 0.
- **Fix:** `if (target === 0) return null` en pctDiff, y no mostrar el warning badge.

#### M2. `FoodLibrary.tsx` — Sin skeleton inicial
- **Archivo:** `src/app/coach/nutrition-plans/_components/FoodLibrary.tsx`
- **Problema:** La lista de alimentos no tiene skeleton mientras carga por primera vez.
- **Fix:** Agregar 4-5 rows de skeleton (div animate-pulse) cuando `foods.foods.length === 0 && isLoading`.

#### M3. `AdherenceStrip.tsx` — grid ilegible en mobile
- **Archivo:** `src/app/c/[coach_slug]/nutrition/_components/AdherenceStrip.tsx`
- **Problema:** `grid-cols-10` en 375px hace cuadros de ~30px, legible pero apretado. La leyenda puede quedar en 2+ líneas.
- **Fix:** En mobile, reducir a cuadros más pequeños (`w-2 h-2`) o usar flex-wrap en lugar de grid fijo.

#### M4. `NutritionStreakBanner.tsx` — emoji 🔥 por ícono Lucide
- **Archivo:** `src/app/c/[coach_slug]/nutrition/_components/NutritionStreakBanner.tsx`
- **Problema:** Emoji puede no renderizar igual en todos los dispositivos/OS.
- **Fix:** Reemplazar `🔥` por `<Flame className="w-4 h-4 text-orange-500" />` de lucide-react.

#### M5. `TemplateLibrary.tsx` — grid mobile
- **Archivo:** `src/app/coach/nutrition-plans/_components/TemplateLibrary.tsx`
- **Problema:** `grid-cols-1 lg:grid-cols-2` deja 1 columna en tablet (768-1023px).
- **Fix:** Cambiar a `grid-cols-1 md:grid-cols-2`.

---

## Archivos a modificar (ordenados por prioridad)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `docs/ESTADO-COMPONENTES.md` | Reestructurar tabla nutrición coach (PARTE 1) |
| 2 | `NutritionShell.tsx` | Toast error en catch (C7) |
| 3 | `MealCard.tsx` | useReducedMotion (C5) |
| 4 | `MacroRingSummary.tsx` | useReducedMotion + dark mode SVG (C5, A4) |
| 5 | `MealIngredientRow.tsx` | Math.round en macros (A5) |
| 6 | `PlanBuilder.tsx` | Validación plan vacío + orden mobile (C4, C2) |
| 7 | `FoodSearchDrawer.tsx` | Toast error en búsqueda fallida (C3) |
| 8 | `ActivePlansBoard.tsx` | Cap sparkline a 100 + AlertDialog (C6, A1) |
| 9 | `TemplateLibrary.tsx` | AlertDialog en borrar + grid md (A1, M5) |
| 10 | `NutritionHub.tsx` | animate-fade-in check + stats grid mobile (A2, A7) |
| 11 | `MealCompletionRow.tsx` | opacity loading state (A6) |
| 12 | `AssignModal.tsx` | Spinner en botón asignar (A8) |
| 13 | `FoodBrowser.tsx` | scope inicial 'all' (A3) |
| 14 | `NutritionStreakBanner.tsx` | emoji → Flame icon (M4) |
| 15 | `AdherenceStrip.tsx` | cuadros mobile (M3) |
| 16 | `PlanBuilderSidebar.tsx` | pctDiff target 0 (M1) |

---

## Verificación

1. `git diff src/app/c/\[coach_slug\]/dashboard/_components/nutrition/NutritionDailySummary.tsx` — commitear si es el fix de macros
2. `npm run build` — sin errores de TypeScript tras los cambios
3. Verificar `animate-fade-in` en `tailwind.config.ts` antes de cambiarlo
4. Verificar que AlertDialog de shadcn ya existe en el proyecto (`src/components/ui/alert-dialog.tsx`) antes de usarlo
