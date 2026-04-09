# Progreso: mega plan dashboard alumno (`jaunty-fluttering-spark`)

**Última actualización:** 2026-04-09 America/Santiago (cierre §11 + E2E smoke)

**Plan maestro (solo lectura, no modificar):** [`claudeplans/jaunty-fluttering-spark.md`](../../claudeplans/jaunty-fluttering-spark.md)

**Planes derivados en `docs/`:**

- [`PLAN-A-dashboard-fundamentos-y-datos.md`](../PLAN-A-dashboard-fundamentos-y-datos.md)
- [`PLAN-B-dashboard-shell-y-layout.md`](../PLAN-B-dashboard-shell-y-layout.md)
- [`PLAN-C-dashboard-header-calendario-checkin.md`](../PLAN-C-dashboard-header-calendario-checkin.md)
- [`PLAN-D-dashboard-hero-compliance-quicklog.md`](../PLAN-D-dashboard-hero-compliance-quicklog.md)
- [`PLAN-E-dashboard-nutricion-peso-prs.md`](../PLAN-E-dashboard-nutricion-peso-prs.md)
- [`PLAN-F-dashboard-programa-historial-loading-page-qa.md`](../PLAN-F-dashboard-programa-historial-loading-page-qa.md)

## Checklist implementación (sección 11 del maestro)

| Paso | Descripción | Estado |
|------|-------------|--------|
| 1 | `src/lib/date-utils.ts` | hecho |
| 2 | `src/lib/animation-presets.ts` | hecho |
| 3 | `_data/dashboard.queries.ts` (+ `heroComplianceBundle.ts` para deduplicar hero/anillos) | hecho |
| 4 | `DashboardShell.tsx` | hecho |
| 5 | `DashboardHeader` + `ClientGreeting` + `StreakWidget` | hecho |
| 6 | `WeekCalendar` + `CalendarDay` | hecho |
| 7 | `CheckInBanner` | hecho |
| 8 | `HeroSection` + `WorkoutHeroCard` + `RestDayCard` | hecho |
| 9 | `QuickLogSheet` | hecho |
| 10 | `ComplianceRingCluster` + `ComplianceRing` | hecho |
| 11 | Datos hero + compliance (bundle cacheado; `HeroAndComplianceGroup` + `ComplianceScoresCard`) | hecho |
| 12 | `NutritionDailySummary` + `MacroBar` + `MealCompletionRow` | hecho |
| 13 | `WeightWidget` + `WeightSparkline` + `TrendArrow` | hecho |
| 14 | `PersonalRecordsBanner` + `PRBadge` | hecho |
| 15 | `ActiveProgramSection` + `ProgramPhaseBar` + `WorkoutPlanCard` | hecho |
| 16 | `RecentWorkoutsSection` + `WorkoutLogItem` | hecho |
| 17 | `loading.tsx` con nuevos skeletons | hecho |
| 18 | `page.tsx` rewrite final + Suspense | hecho |
| 19 | Pull-to-refresh (`DashboardPullToRefresh`) | hecho |
| 20 | Pruebas E2E (`npm run test:e2e`, Chromium; `playwright.config` + `tests/auth.spec.ts`) | hecho (smoke) |

## ¿Se hizo “todo” el mega plan?

**Checklist §11 (implementación en código):** **sí** — incluye `quickLogWeightAction`, fórmula §10 de entreno en `heroComplianceBundle`, anillo nutrición “Sin datos”, `loading.tsx` alineado al shell (sidebar móvil + desktop), `SettingsModalTrigger.tsx`, `HeroAndComplianceGroup.tsx`, pulso check-in atrasado con `prefers-reduced-motion`, y E2E smoke (`test:e2e`).

**§12 (verificación manual exhaustiva):** sigue siendo **parcial** en el sentido del maestro (Lighthouse PWA ≥ 90, Safari iOS / Chrome Android en dispositivo real, auditoría de contraste completa, etc.); eso es QA de producto, no solo código.

## Pendientes y dependencias (BD, otros módulos, docs)

### Supabase / base de datos

- **`get_client_current_streak` (RPC):** el dashboard usa la misma RPC que ya emplean `dashboard.service.ts` y `coach/.../actions.ts`. Si en algún entorno falla, es **misma dependencia** que el resto del producto (no es un requisito nuevo solo del dashboard).
- **No se añadieron migraciones ni tablas nuevas** para este rework: todo apunta a tablas existentes (`clients`, `workout_programs`, `workout_plans`, `workout_blocks`, `workout_logs`, `check_ins`, `nutrition_*`, etc.). Si falta data (sin plan, sin logs), la UI muestra estados vacíos; no es fallo de esquema.

### Módulos del alumno que afectan calidad de datos o UX (ver [`ESTADO-COMPONENTES.md`](../ESTADO-COMPONENTES.md))

| Módulo | Estado en doc | Relación con el dashboard |
|--------|---------------|---------------------------|
| **Nutrición** (`/c/.../nutrition`) | Marcado rework pendiente / alta prioridad | El dashboard **sí está conectado** (plan activo, `daily_nutrition_logs`, `toggleMealCompletion`). Los **macros del resumen** son una **aproximación** por % de comidas completadas; cuando el rework de nutrición alumno tenga consumos reales por alimento, conviene **alinear** `NutritionDailySummary` con la misma lógica que `NutritionTracker`. |
| **Check-in** (`/c/.../check-in`) | Rework pendiente | El dashboard lee `check_ins` (peso, fechas). Si el flujo de check-in mejora (fotos, validaciones), el dashboard **se beneficia** sin cambio obligatorio de esquema. |
| **Ejecución de entreno** (`/c/.../workout/[planId]`) | ~50% rework | **Quick log** y conteos de series dependen de `logSetAction`. Mejoras ahí (optimistic, offline) **mejoran** la percepción del hero/dashboard pero no bloquean la pantalla. |
| **`ClientNav`** | 🔶 50% | Navegación inferior; conviene **revisión visual** después del nuevo layout (safe area, bottom padding). |
| **Preview coach** (`StudentDashboardPreview` en settings) | ❌ 0% | **No refleja** el nuevo dashboard hasta que alguien actualice ese preview. |

### Módulo coach (perfil)

- **`NutritionTabB5`** (🔶 70%): el doc indica que faltan **`consumedCals` reales** y que eso **depende del rework nutrición alumno**. El dashboard alumno no sustituye ese trabajo; comparte el mismo “cuello de botella” de datos finos de consumo.

### Cosas que el maestro pide y siguen como deuda explícita

- **§12:** Lighthouse PWA, pruebas en **dispositivos reales** (iOS/Android), auditoría de contraste y lectura de red en condiciones lentas.
- Pulido **responsive** fino si hace falta tras uso (tablet intermedia vs diagrama §5).
- **`react-circular-progressbar` + tema:** validar en transición de hidratación si aparece parpadeo.

## ¿El dashboard “no se conecta” con el resto?

**Sí se conecta:** usa las mismas entidades que perfil coach, builder y rutas de alumno (programa activo, planes, logs, check-ins, nutrición, streak RPC). Lo que describe `ESTADO-COMPONENTES` es que **otros módulos** (nutrición detallada, check-in UX, workout execution, onboarding) siguen **en rework**; eso **no desconecta** el dashboard de la BD, pero **limita** qué tan “ricos” son los números (sobre todo **macros reales** y **preview del coach**).

## Ajustes respecto al documento maestro (para Claude Code)

- **Nutrición:** el esquema usa `nutrition_meal_logs` ligados a `daily_log_id` (no `log_date` en meal logs). El resumen del dashboard aproxima macros consumidos con el ratio de comidas completadas del día × targets del plan (la página `/nutrition` sigue siendo la fuente detallada).
- **`WeightProgressChart`:** movido a [`src/app/c/[coach_slug]/dashboard/_components/weight/WeightProgressChart.tsx`](../../src/app/c/[coach_slug]/dashboard/_components/weight/WeightProgressChart.tsx); el maestro seguía citando la ruta antigua en raíz del dashboard.
- **`SettingsModalTrigger`:** [`src/components/client/SettingsModalTrigger.tsx`](../../src/components/client/SettingsModalTrigger.tsx) usado dentro de `ClientSettingsModal`.
- **Anillos + hero:** `HeroAndComplianceGroup` (columna principal) + `ComplianceScoresCard` (sidebar) comparten `getHeroComplianceBundle` con `React.cache`.

## Cronología

### 2026-04-09 01:04 — Documentación

- Carpeta `docs/progreso cursor/` y planes A–F generados por extracto del mega plan (`scripts/split-megaplan.mjs`). El archivo maestro no se editó.

### 2026-04-09 01:22 — Implementación dashboard (Cursor)

- Implementados utilidades, queries cacheadas, shell con columna lateral en desktop, pull-to-refresh, skeletons, `loading.tsx` alineado al layout, y `page.tsx` con límites `Suspense` por sección.
- `toggleMealCompletion` ahora también hace `revalidatePath` del dashboard.
- `npm run build` completado correctamente.

### 2026-04-09 01:27 — Aclaración alcance mega plan + dependencias

- Documentadas en este archivo: diferencia entre §11 implementado vs §12/paridad; dependencias con `ESTADO-COMPONENTES.md`; Supabase sin migraciones nuevas; nutrición/check-in/workout como módulos vecinos.

### Pendiente / siguiente paso sugerido

- **§12 manual:** Lighthouse, dispositivos reales, contraste exhaustivo.
- **Producto:** alinear resumen de macros del dashboard con futuro rework de `/nutrition` y actualizar `StudentDashboardPreview` del coach cuando toque Mi Marca.

### 2026-04-09 — Cierre brechas §10–§12 (código)

- `quickLogWeightAction` + `WeightQuickLog` en `WeightWidget`; `nutritionHasLogs` y anillo gris; workout score §10 en bundle; `CheckInBannerFrame`; `useReducedMotion` en saludo, calendario y racha; skeletons (`HeroOnlySkeleton`, `ComplianceRingsSkeleton`, `DashboardSidebarSkeleton`, etc.) y `loading.tsx` como `DashboardShell`; `npm run build` OK; `npm run test:e2e` (Chromium) OK.
