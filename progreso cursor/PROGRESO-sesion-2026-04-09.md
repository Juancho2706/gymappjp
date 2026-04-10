# Progreso Cursor — sesión 2026-04-09

Zona horaria de referencia: **America/Santiago**.

---

## 20:07 — Alumnos: tabla responsive + filtros

- **`ClientsDirectoryTable.tsx`**: El encabezado sticky estaba **fuera** del contenedor con `overflow-x-auto`, así el `grid` con columnas fijas ensanchaba toda la página. Ahora hay un único bloque `overflow-x-auto` + `min-w-[920px]` que envuelve **cabecera y filas**; la tarjeta usa `overflow-hidden`; scroll vertical del virtualizer solo en el cuerpo.
- **`DirectoryActionBar.tsx`**: `DropdownMenu` con **`modal={false}`** para evitar bloqueo de scroll del documento en móvil (suele desencadenar saltos del `position: fixed` del nav inferior). Contenido del menú con ancho máximo usable en pantallas chicas.
- **`ClientsDirectoryClient.tsx`**: Búsqueda tolerante a `full_name` / `email` nulos (`?? ''`) para evitar errores en runtime.
- **`CoachWarRoom.tsx`**: `attentionFlags` con fallback `?? []` antes de `.includes`.

## 20:07 — PWA zoom (solo instalada) + layout coach

- **`PwaRegister.tsx`**: Si `display-mode: standalone` o `navigator.standalone` (iOS), se actualiza el meta viewport a `maximum-scale=1, user-scalable=no` (mantiene `viewport-fit=cover`). El layout raíz sigue permitiendo zoom en navegador normal.
- **`src/app/coach/layout.tsx`**: Contenedor principal con **`min-h-[100dvh]`** en móvil (columna) para reducir saltos por `100vh` vs barra de URL; desktop mantiene `md:min-h-screen`.
- **`CoachSidebar.tsx`**: `translateZ(0)` en el aside móvil para capa de composición; `md:h-[100dvh]` cuando el navegador lo soporta; se mantiene `pb-safe`.

## 20:07 — Plan `claudeplans/fizzy-skipping-torvalds.md` (código)

**No aplicado (instrucción de usuario):** edición de `docs/ESTADO-COMPONENTES.md` y `docs/ESTADO-PROYECTO.md` — quedaron **solo lectura**.

**No aplicado en esta sesión:** C1 (commit de `NutritionDailySummary`); A2 sustitución de `animate-fade-in` — la clase **sí existe** en `globals.css` (~línea 287).

**Aplicado:**

| Ítem | Archivo(s) |
|------|------------|
| C2, C4 | `PlanBuilder.tsx` — orden móvil sidebar primero; validación `meals.length === 0` |
| C3 | `FoodSearchDrawer.tsx` — `toast.error` si falla RPC |
| C5, A4 | `MealCard.tsx`, `MacroRingSummary.tsx` — `useReducedMotion`; anillos con `stroke-muted` / `stroke-destructive` |
| C6, A1 (board) | `ActivePlansBoard.tsx` — `Math.min(v,100)` en sparkline; `AlertDialog` en desasignar |
| C7 | `NutritionShell.tsx` — `toast.error` en catch del toggle |
| A1 (templates), M5 | `TemplateLibrary.tsx` — `AlertDialog` borrar; grid `md:grid-cols-2` |
| A3 | `FoodBrowser.tsx` — scope inicial `'all'` |
| A5 | `MealIngredientRow.tsx` — `Math.round` en macros y kcal |
| A6 | `MealCompletionRow.tsx` — `opacity-60` + `Loader2` si `pending` |
| A7 | `NutritionHub.tsx` — stats `grid-cols-2 sm:grid-cols-3` |
| A8 | `AssignModal.tsx` — spinner en botón asignar |
| M1 | `PlanBuilderSidebar.tsx` — sin warning de mismatch si meta = 0 |
| M2 | `FoodLibrary.tsx` — skeleton si `pending && displayed.length === 0` |
| M3 | `AdherenceStrip.tsx` — celdas más bajas en móvil |
| M4 | `NutritionStreakBanner.tsx` — texto sin emoji (icono `Flame` ya en el banner) |

## 20:14 — Base UI: menú alumnos (`MenuGroupRootContext`)

- **Error:** `Menu group parts must be used within <Menu.Group>` al abrir **Filtros** u **Ordenar (Urgencia)**.
- **Causa:** `DropdownMenuLabel` está implementado con `MenuPrimitive.GroupLabel`, que exige ancestro `Menu.Group`.
- **Fix:** `DirectoryActionBar.tsx` — cada bloque etiqueta + ítems envuelto en `<DropdownMenuGroup>` (tres grupos en Filtros, uno en Ordenar).

## 20:16 — Directorio alumnos: vista por defecto “simple” (tabla)

- **`ClientsDirectoryClient.tsx`**: estado inicial de `view` de `'grid'` → `'table'` para que al entrar se muestre la lista/tabla; el coach sigue pudiendo cambiar a cuadrícula con el toggle.

## 20:20 — Coach móvil iPhone: menos hueco bajo Dynamic Island

- **Problema:** `coach/layout` tenía `pt-safe` en todo el contenedor **y** el header móvil usaba `pt-[calc(env(safe-area-inset-top)+1rem)]` → **doble** `safe-area-inset-top` + 1rem extra.
- **Fix:** Quitar `pt-safe` del contenedor en `coach/layout.tsx`. Header móvil en `CoachSidebar.tsx` solo `pt-safe` (un solo `env(safe-area-inset-top)`), sin `+1rem`.

## 20:18 — ClientCardV2: botón “más opciones” visible (⋯)

- **`ClientCardV2.tsx`**: el trigger del menú pasó de `MoreVertical` a **`MoreHorizontal`** (tres puntos horizontales, estilo “…”). Fondo/borde suaves (`bg-muted/50`, `border`) y color de trazo explícito para que no se pierda en tema claro. `aria-label` → “Más opciones”. `modal={false}` en el dropdown por consistencia con la barra de alumnos.

## Verificación

- `npm run build` — **OK** (2026-04-09, tras los cambios).

---

## 20:25 — Cierre de sesión (registro)

Documento creado/actualizado con el detalle anterior. Próximos pasos opcionales: revisar C1 en git para `NutritionDailySummary`; si se desea zoom deshabilitado también en pestaña del navegador, habría que acordar impacto en accesibilidad.
