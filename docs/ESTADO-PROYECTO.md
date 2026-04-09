# Estado del Proyecto — GymApp JP

> Documento vivo. Actualizar cada vez que se cierre un rework, se agregue deuda técnica, o cambie la prioridad de algo pendiente.
> **Última actualización:** 2026-04-09

---

## Reworks y optimizaciones completados

### Biblioteca de Programas (Workout Programs)
**Fecha:** 2026-04-08

**Qué se hizo:**
- Reescritura total de `WorkoutProgramsClient.tsx` — de monolito a orquestador
- Nuevos componentes: `LibraryHeader`, `LibraryToolbar`, `ProgramRow`, `ProgramPreviewPanel`
- `libraryStats.ts` — capa de dominio cliente con tipos y lógica de filtrado pura
- Preview responsive: Dialog en desktop, Sheet en móvil (`useSyncExternalStore` + matchMedia)
- Filtros avanzados: Popover desktop / Sheet móvil
- Motion con `useReducedMotion`, sticky header con blur
- `duplicateWorkoutProgramAction` mejorada para devolver snapshot y hacer prepend local sin refresh

**Archivos clave:**
- `src/app/coach/workout-programs/WorkoutProgramsClient.tsx`
- `src/app/coach/workout-programs/libraryStats.ts`
- `src/app/coach/workout-programs/components/` (4 componentes: `LibraryHeader`, `LibraryToolbar`, `ProgramRow`, `ProgramPreviewPanel`)
- `src/app/coach/builder/[clientId]/actions.ts` (duplicate con snapshot)

---

### Builder de Plantillas / Programas (WeeklyPlanBuilder)
**Fecha:** 2026-04-08

**Qué se hizo:**
- Rework completo del builder de semanas (`WeeklyPlanBuilder.tsx`)
- Navegación entre días con flechas izq/der en desktop
- Semanas A/B (`ab_mode`): toggle, variante activa, lógica de alternancia impar→A / par→B en `programWeekVariant.ts`
- Bottom sheet drag en mobile para catálogo de ejercicios
- Detección correcta de `isBuilder` en `CoachMainWrapper` para rutas `/coach/workout-programs/builder`
- `BlockEditSheet` para editar prescripción de ejercicio (series, reps, peso, tempo, RIR, notas, progresión automática)

**Archivos clave:**
- `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`
- `src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx`
- `src/lib/workout/programWeekVariant.ts`
- `src/components/coach/CoachMainWrapper.tsx`

---

### Directorio de Alumnos — War Room (Plan A)
**Fecha:** 2026-04-08

**Qué se hizo:**
- War Room header con stat cards animadas (`useMotionValue` + `useSpring`)
- Banners de alerta inteligentes por attention score
- ActionBar: búsqueda, filtros (estado/riesgo/programa), sort, toggle grid/tabla
- `ClientCardV2`: compliance ring, attention badge, sparklines, semáforo actividad, quick actions, stagger con `useReducedMotion`
- Tabla virtualizable (`@tanstack/react-virtual`) con columnas ordenables
- Skeletons y empty states con Lottie
- Attention Score motor de datos en `dashboard.service.ts`

**Archivos clave:**
- `src/app/coach/clients/ClientsDirectoryClient.tsx`
- `src/app/coach/clients/CoachWarRoom.tsx`
- `src/app/coach/clients/DirectoryActionBar.tsx`
- `src/app/coach/clients/ClientsDirectoryTable.tsx`
- `src/components/coach/ClientCardV2.tsx`
- `src/services/dashboard.service.ts`

---

### Perfil del Alumno — Radiografía Completa (Plan B)
**Fecha:** 2026-04-08

**Qué se hizo (6 tabs completos):**
- **Hero:** `ClientProfileHero` con training age, stat chips, export print, attention score
- **TabNav:** sticky, badges por tab, indicador spring animado, `useReducedMotion`, offset mobile corregido (`top-[3.5rem] md:top-0`)
- **Overview (B3):** alerta prioritaria, compliance rings, heatmap actividad, KPI grid, resumen programa con `ProgramPhasesBar` y próximo entrenamiento, check-in snapshot con foto ampliable
- **Entrenamiento (B4):** PR banner + confetti, RadarChart volumen muscular, BarChart tonelaje con **media móvil 7 sesiones**, StrengthCards con 1RM estimado (Epley) y AreaChart
- **Nutrición (B5):** macro rings circulares, pie chart distribución, heatmap 30d adherencia, acordeón comidas, historial logs con highlight <60%
- **Progreso (B6):** weight AreaChart + proyección 4 sem (regresión lineal), IMC + franja visual, gauge energía RadialBar, photo comparison slider, timeline check-ins
- **Programa (B7):** grid semanal/cíclico, variante A/B por semana, sheet ejercicio (GIF + prescripción + historial), enlace al builder
- **Facturación (B8):** timeline pagos, resumen CLP, agregar/eliminar pagos
- **UX (B9):** FAB móvil (WhatsApp/check-in/builder), `loading.tsx` con skeleton per-tab layout, skeletons al cambiar tab (`useTransition` + `isPending`)

**Archivos clave:**
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`
- `src/app/coach/clients/[clientId]/ProfileTabNav.tsx`
- `src/app/coach/clients/[clientId]/` — TrainingTabB4Panels, NutritionTabB5, ProgressBodyCompositionB6, ProgramTabB7, BillingTabB8, ProfileOverviewB3, ProfileFloatingActions, ProfileCheckInSnapshot, ProfileProgramSummaryCard
- `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`
- `src/app/coach/clients/[clientId]/loading.tsx`

---

### iOS Bug Fixes (builder + workout-programs)
**Fecha:** 2026-04-08 | Reportados por tester en iPhone 16

| Bug | Archivo | Fix |
|-----|---------|-----|
| Label "Alumnos (0)" pegado al combobox | `WorkoutProgramsClient.tsx` | `space-y-2` → `space-y-3` |
| Título ejercicio chocaba con notch/Dynamic Island | `BlockEditSheet.tsx` | `pt-[max(1.5rem,env(safe-area-inset-top))]` en SheetHeader |
| Day tabs del builder desplazadas hacia abajo | `WeeklyPlanBuilder.tsx` | Removido `paddingTop: env(safe-area-inset-top)` erróneo + `mt-2→mt-1` |

---

## Deuda técnica pendiente

### Media prioridad

#### `consumedCals` en tab Nutrición del perfil
El chart de Nutrición muestra solo calorías objetivo vs % adherencia. No hay calorías consumidas reales porque el alumno no loguea alimentos desde su dashboard todavía.

**Trabajo cuando aplique:**
1. Que el alumno pueda loguear alimentos desde su dashboard (parte del rework módulo nutrición)
2. Calcular `consumed_calories` sumando kcal de `food_items` de comidas completadas, o agregar columna en `daily_nutrition_logs`
3. Actualizar `NutritionTabB5.tsx` para mostrar `consumedCals` vs `targetCals` en ComposedChart

**Dependencia:** Rework del módulo de nutrición del alumno

---

#### Unificar `LIBRARY_PROGRAM_LIST_SELECT`
El string de select de la biblioteca está duplicado en `actions.ts` y en `page.tsx`.
**Trabajo:** Extraer a `src/lib/supabase/queries/workout-programs-library.ts`.

---

#### `ClientCard.tsx` V1 — archivo huérfano
`src/components/coach/ClientCard.tsx` sigue en el repo pero nada lo importa (el directorio usa `ClientCardV2`).
**Trabajo:** Confirmar con `grep` y borrar.

---

### Baja prioridad / UX futura

#### `ProgramPhasesBar` en filas de biblioteca
Las filas de la biblioteca solo tienen badge "Fases". Las cards antiguas mostraban la barra visual.
**Opción:** Mostrar en vista previa o al hover (tooltip desktop).

---

#### Ordenación y agrupación en biblioteca
El orden actual viene del servidor (`created_at DESC`).
**Opciones:** Ordenar por nombre / última actividad / cliente. Agrupar plantillas vs en curso con encabezados sticky.

---

#### `useReducedMotion` en todos los child components del perfil
Aplicado en tab transitions, FAB y grid del directorio. No aplicado en todos los componentes hijo del perfil (hovers de imágenes, animaciones internas de B3–B8).

---

## Módulos pendientes de rework (próximos planes)

| Módulo | Descripción | Prioridad |
|--------|-------------|-----------|
| **Nutrición del alumno** | Dashboard del alumno para loguear alimentos, ver plan activo, adherencia. Desbloquea `consumedCals` en perfil del coach. | Alta |
| **Dashboard del alumno** (`/c/[coach_slug]/dashboard`) | Rework general del dashboard que ve el alumno. | Media |
| **Workout execution** (`/c/[coach_slug]/workout/[planId]`) | Logging de series/reps durante el entrenamiento — mejoras pendientes. | Media |
| **Check-in del alumno** | Flujo de check-in de peso + fotos + energía desde mobile. | Media |
| **Onboarding** | Flujo inicial para nuevo alumno (intake, objetivos, foto inicial). | Baja |

---

## Notas de arquitectura

- **Colores por coach:** `--theme-primary` CSS var en `CoachLayout`. Respetar en todos los charts y elementos de énfasis.
- **Dark mode primario:** Verificar variantes dark en todos los componentes nuevos.
- **`GlassCard`:** Base de todas las cards del perfil y directorio. No crear cards custom sin revisar si aplica.
- **Safe area iOS:** Usar `env(safe-area-inset-top/bottom)` en fixed/sticky en mobile. El layout raíz del coach aplica `pt-safe` — no re-aplicar en hijos dentro del flow normal.
- **Variante A/B:** Lógica centralizada en `src/lib/workout/programWeekVariant.ts`. Semana impar del programa → A, par → B. Usada en builder, perfil (tab Programa, badges, `resolveNextProgramWorkout`) y dashboard cliente.
