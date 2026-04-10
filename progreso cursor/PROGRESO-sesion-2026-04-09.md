# Progreso Cursor — sesión 2026-04-09

Zona horaria de referencia: **America/Santiago** (los timestamps de Git en esta máquina pueden verse en **-0400**).

## Dónde está este archivo

- **Ruta en el repo:** `progreso cursor/PROGRESO-sesion-2026-04-09.md`
- Es decir: carpeta **`progreso cursor`** en la **raíz** del proyecto `gymappjp` (junto a `src/`, `docs/`, etc.).

---

## Consolidado Git (2026-04-09) + últimas ~3 h

Commits en `master` relevantes para “hoy” (orden del más reciente al más antiguo de la tarde):

| Hora (Git) | Hash | Mensaje |
|------------|------|---------|
| 21:45 -0400 | `9b474b3` | Actualización de componentes y mejoras en la interfaz de usuario |
| 21:11 -0400 | `d525996` | Mejoras en la interfaz móvil y ajustes de layout en el directorio de alumnos |
| 20:55 -0400 | `7777d50` | Implementación de mejoras en la interfaz móvil y ajustes en el layout |
| 20:44 -0400 | `7d42ff1` | Actualización de documentos de estado y mejoras en la interfaz de nutrición coach |
| 20:20 -0400 | `ba2c6f1` | feat: nutrición coach/alumno, directorio alumnos y UX móvil coach |

### `9b474b3` — Safe area, sheets, toasts, IMC, builder (último push típico)

- **`WeeklyPlanBuilder.tsx`**: banner “Tienes cambios sin guardar” en **móvil** como tarjeta **fija abajo** (`fixed`, `z-[72]`, `safe-area-inset-bottom` + hueco sobre nav ~`5rem`); en **`md:`** vuelve al estilo barra superior original.
- **`BlockEditSheet.tsx`**: sheet ancho **`w-full`** en móvil (`sm:w-[540px]`); sección **Progresión automática** en columna en móvil (`flex-col` → `sm:flex-row`); botones `+Peso/+Reps` en **grid 2 columnas**; input de valor **full width** en móvil (`sm:w-24`).
- **`sheet.tsx`**: overlay y contenido suben a **`z-[70]` / `z-[71]`** para quedar **por encima** del header móvil coach (`z-[55]`); botón cerrar con **`top` + `env(safe-area-inset-top)`**.
- **`FoodSearchDrawer.tsx`**: **`normalizeCategory()`** (NFD, sin acentos, mapeo proteína/carb/grasa/lácteo/etc.) para que los filtros coincidan con valores reales de BD; header con **padding-top** según safe-area.
- **`layout.tsx`**: `<Toaster />` pasa a **`position="bottom-center"`**.
- **`sonner.tsx`**: margen inferior con **`safe-area-inset-bottom`** + espacio sobre barra inferior (`~5rem` móvil, `md:mb-4`).
- **`profileBodyCompositionUtils.ts`**: **`bmiFromMetric`** tolera altura en **metros** (`height < 3` → ×100) y rechaza rangos absurdos (80–260 cm) para evitar IMC gigantes.

### `d525996` — Directorio + ficha alumno: causa raíz overflow

- **`CoachMainWrapper.tsx`**: `<main>` con **`min-w-0`**, **`overflow-x-hidden overflow-y-auto`**; contenedor interior **`w-full min-w-0 max-w-full`** + `max-w-[1600px|2000px]`.
- **`coach/layout.tsx`**: contenedor flex con **`min-w-0`**.
- **`DirectoryActionBar.tsx`**: eliminado **`-mx-4`**; **`w-full max-w-full min-w-0`**; padding móvil ajustado.
- **`CoachWarRoom.tsx`**: grid stats **`min-w-0`**, sin **`scale` en hover** (solo `y`), `ring-offset` móvil 0; tarjetas más compactas en pantalla chica.
- **`ClientProfileDashboard.tsx`**: grids y columnas **`min-w-0`** en overview, progress, workout, program, nutrition, billing; skeleton mantiene `animate-pulse`.
- **`ProfileTabNav.tsx`**: sin márgenes negativos problemáticos; **`w-full min-w-0`**.
- **`ProfileTopAlertBanner.tsx`**: **`w-full max-w-full min-w-0`** en contenedor externo.
- **`ClientProfileHero.tsx`**: metadata con **`break-words` / `[overflow-wrap:anywhere]`**; grid de chips stats responsive; **`HeroStatChip`** con **`min-w-0`**.
- **`coach/clients/page.tsx`**, **`[clientId]/page.tsx`**: contenedores con **`overflow-x-hidden`** / **`min-w-0`** según ya aplicado en ese commit.

### `7777d50` — Alumno (PWA/layout) + builder chips catálogo

- **`c/[coach_slug]/layout.tsx`**: quitar **`pt-safe` duplicado** en contenedor global.
- **`DashboardHeader` / `DashboardShell` / `loading`**: header fijo móvil + **`pt-[calc(safe-area + altura header)]`** en contenido.
- Varias pantallas alumno: **`pt-safe`** donde corresponde (nutrición, ejercicios, check-in, workout, login, onboarding, suspended, change-password).
- **`WeeklyPlanBuilder.tsx` + `DraggableExerciseCatalog.tsx`**: **`catalogMuscleFilter`** compartido; chips del sheet aplican el mismo filtro que el select.

### `7d42ff1` — Docs ESTADO + inputs numéricos + coach chrome builder

- **`docs/ESTADO-COMPONENTES.md`**, **`docs/ESTADO-PROYECTO.md`**: actualización de estado del proyecto.
- **`clamped-int-input.tsx`**: nuevo componente para enteros con borrado correcto en móvil.
- **`ProgramConfigHeader.tsx`**, **`PlanBuilderSidebar.tsx`**, **`BlockEditSheet.tsx`**: integración clamped / progresión texto.
- **`CoachMainWrapper.tsx`**, **`CoachSidebar.tsx`**: padding top móvil bajo header fijo; header builder visible; ajustes altura/`min-h-0`.
- **`WeeklyPlanBuilder.tsx`**: menos doble safe-area en padding inferior del carrusel.

### `ba2c6f1` — Feature grande (resumen)

- Nutrición coach: hub, plan builder, plantillas, asignación, catálogo, acciones y queries; alumno: tracker, queries, componentes (MealCard, anillos, adherencia, etc.).
- Directorio alumnos: tabla virtualizada, War Room, filtros, pulse cache, tarjetas V2.
- PWA: **`PwaRegister`** viewport en standalone.
- Planes Claude y docs de planes A–F, `database.types`, `nutrition.service`, etc.

### Fuera del repo (seguimiento manual)

- **Dominio / Supabase / Vercel:** orientación al usuario sobre **Site URL**, **Redirect URLs**, **`NEXT_PUBLIC_APP_URL`** (no referenciada en código actual), claves Supabase sin cambiar con dominio, revisar webhooks Mercado Pago. *No hay commits asociados.*

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

## 20:27 — Biblia: `ESTADO-COMPONENTES` + `ESTADO-PROYECTO`

- Nutrición coach: subsecciones **Núcleo** vs **Extensiones futuras**; eliminada la línea confusa del ~55%; resumen general con texto “extensiones excluidas”.
- Directorio alumnos: notas alineadas al código (tabla default, scroll, Base UI, PWA, `ClientCardV2`).
- Enlaces rotos (`PROGRESO-nutricion-rework`, `PROGRESO-jaunty-*`) sustituidos por rutas válidas o `ESTADO-PROYECTO`.
- `ESTADO-PROYECTO`: bloque *Coach panel móvil / PWA*, pulido `fizzy-skipping-torvalds`, nota **safe area** corregida (sin `pt-safe` duplicado en layout).

## 20:25 — Cierre de sesión (registro)

Documento creado/actualizado con el detalle anterior. Próximos pasos opcionales: revisar C1 en git para `NutritionDailySummary`; si se desea zoom deshabilitado también en pestaña del navegador, habría que acordar impacto en accesibilidad.

---

## 20:42 — Inputs numéricos: poder borrar y reescribir (móvil)

- **Problema:** `type="number"` + `parseInt(...) || 1` (o `|| 0`) reinyectaba un valor mínimo al quedar vacío → en iOS/Android el retroceso parecía no borrar.
- **Nuevo:** `src/components/ui/clamped-int-input.tsx` — `ClampedIntInput` y `OptionalClampedIntInput` (texto + `inputMode="numeric"`, string local, clamp en `blur`).
- **Integración:** `ProgramConfigHeader.tsx` (semanas / fases / días opcionales), `PlanBuilderSidebar.tsx` (metas manuales), `BlockEditSheet.tsx` (series + `BlockProgressionValueInput` para progresión decimal).

## 20:42 — Creador de planes (móvil): hueco bajo la lista + barra superior coach fija

- **`WeeklyPlanBuilder.tsx`:** raíz deja `h-[100dvh]` por `flex-1 min-h-0` para encajar en `<main>` y evitar scroll del documento que “se lleva” el encabezado; `paddingBottom` del carrusel de día pasa de `sheetHeight vh + safe-bottom + 0.5rem` a `sheetHeight vh + 6px` (el sheet ya aplica `env(safe-area-inset-bottom)` — se evita **doble** reserva y el hueco rojo bajo la lista).
- **`CoachSidebar.tsx`:** header móvil (logo, tema, cerrar sesión) **ya no se oculta** en rutas builder; pasa de `sticky` a **`fixed`**, `z-[55]`, `pt-safe`.
- **`CoachMainWrapper.tsx`:** en móvil, `pt-[calc(env(safe-area-inset-top,0px)+3.5rem)]` y `md:pt-0` para que el contenido (incl. creador) quede **debajo** del header fijo; `min-h-0` + `flex` en `<main>` para que el flex hijo pueda encoger.

**Verificación:** `npm run build` — OK (tras estos cambios).

## 20:50 — Creador móvil: chips musculares del sheet aplican el mismo filtro que el Select

- **Problema:** En el estado intermedio del bottom sheet, al tocar p. ej. «Pectorales» solo se abría el catálogo a altura completa sin fijar el grupo; la lista seguía en «Todos».
- **Fix:** Estado `catalogMuscleFilter` en `WeeklyPlanBuilder.tsx` compartido entre sidebar (tablet/desktop) y catálogo del sheet; chips llaman `setCatalogMuscleFilter(m)` antes de `setSheetHeight(80)`.
- **`DraggableExerciseCatalog.tsx`:** props opcionales `selectedMuscleGroup` + `onSelectedMuscleGroupChange` para modo controlado (sin romper usos sin props).

## 21:05 — Vista alumno (iPhone): hueco negro arriba + header del dashboard fijo

- **Causa del hueco:** `c/[coach_slug]/layout.tsx` tenía `pt-safe` en el contenedor **y** `DashboardHeader` añadía `pt-[env(safe-area-inset-top)]` → **doble** reserva superior.
- **Layout alumno:** se quitó `pt-safe` global; cada pantalla pone `pt-safe` solo donde corresponde.
- **`DashboardHeader.tsx`:** en móvil/tablet (`< lg`) el encabezado pasa a **`fixed`** `top-0 left-0 right-0 z-40`, `pt-safe`, `bg-background/95`; en `lg:` vuelve a flujo normal (`lg:static`) sin borde/fondo de barra.
- **`DashboardShell.tsx` + `dashboard/loading.tsx`:** `pt-[calc(env(safe-area-inset-top,0px)+3.5rem)]` para que el scroll empiece bajo el header fijo + `lg:pt-4` en escritorio.
- **`pt-safe` añadido** en cabeceras o contenedores: nutrición (`page` + `EmptyNutritionState`), ejercicios, check-in, workout (`WorkoutExecutionClient`), suspended, change-password, login y onboarding.

## 21:20 — Coach: directorio de alumnos + ficha alumno responsive (móvil)

- **`CoachWarRoom.tsx`:** contenedor `min-w-0 max-w-full overflow-x-hidden`; título con `break-words` / `text-balance` y tamaños `text-2xl`→`md:text-5xl`; bloque “Portal alumnos” en columna en móvil con URL `break-all` y caja ancho completo; banners de alerta con `min-w-0 break-words` y botones `shrink-0`.
- **`coach/clients/page.tsx` + `[clientId]/page.tsx`:** `w-full min-w-0 overflow-x-hidden`; enlace “Directorio…” con `max-w-full break-words`.
- **`ClientsDirectoryClient.tsx`**, **`ClientProfileDashboard.tsx`**, **`ClientProfileHero.tsx`:** `min-w-0 max-w-full`; nombre y email sin truncar de forma rígida (`break-words` / `break-all`).
- **`ProfileTopAlertBanner.tsx`:** texto del aviso con `min-w-0 flex-1 break-words [overflow-wrap:anywhere]` para que no se corte a la derecha.
- **`ProfileTabNav.tsx`:** `max-w-full min-w-0` en el contenedor sticky y en la fila con scroll.
- **`CoachSidebar.tsx` (nav móvil):** deja de usar `flex-1` por ítem (aplastaba etiquetas); `flex-nowrap overflow-x-auto` + ítems `shrink-0`; `shortLabel` para Inicio, Planes, Ejer., Marca; `title={item.label}` en cada `Link`.

---

## Cursor (posterior) — Builder: GIFs al editar plan guardado + buscador de alimentos

*Registro añadido tras trabajo en el asistente; no implica commit automático.*

### Planificador semanal (`WeeklyPlanBuilder.tsx`)

- **Problema:** Al abrir un programa ya guardado, los bloques no mostraban GIF (ni vídeo directo) aunque el ejercicio lo tuviera en catálogo.
- **Causa probable:** Los medios salían solo de `workout_blocks.exercises` en el `select` anidado; el embed puede venir vacío (RLS) o como **array** de un elemento en PostgREST, y entonces `b.exercises?.gif_url` fallaba.
- **Fix:** Helpers `embeddedExerciseRow`, `mapDbBlockToBuilderBlock` y `enrichDaysWithExerciseMedia`: normalizar el embed, rellenar `gif_url` / `video_url` (y nombre/grupo si faltan) desde el **mapa del catálogo** ya cargado (`exercise_id` → fila). Tipos `Client` / `Exercise` movidos arriba para usar esos helpers. Al aplicar plantilla, `onApply` enriquece días con el mismo criterio.

### Plan nutrición — `FoodSearchDrawer` + `PlanBuilder.tsx`

- **Problema:** Con “Todos” u otros chips, la lista quedaba vacía si no escribías al menos 2 caracteres.
- **Causa:** El efecto hacía `setResults([])` cuando `searchTerm.length < 2` y solo entonces llamaba a `search_foods`.
- **Fix:** Carga vía **`searchCoachFoodLibrary(coachId, …)`** (misma lógica que la biblioteca: globales + del coach), hasta **200** ítems sin texto; con texto, filtro por nombre en servidor. Filtros por categoría siguen en cliente (`normalizeCategory`). Prop obligatoria **`coachId`** desde `PlanBuilder`. Estados de **carga** (`Loader2`) y mensajes vacíos (sin catálogo / sin búsqueda / categoría sin coincidencias). Placeholder: “Buscar por nombre (opcional)…”. Eliminado uso de `createClient` + RPC en este drawer.
