# Estado de Componentes — Rework Progress

> Seguimiento del nivel de optimización de cada componente principal.
> El objetivo es que cada módulo sea fluido para el coach/alumno, eficiente con la BD y bien integrado con el resto del sistema.
> **Última actualización:** 2026-04-09

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Rework completo — listo y optimizado |
| 🔶 | Parcialmente optimizado — funciona pero tiene deuda pendiente |
| ❌ | Pendiente de rework |
| 🚧 | En progreso actualmente |

---

## MÓDULO PÚBLICO / MARKETING

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Landing Page | `/` | ❌ | 0% | Existe pero sin rework |
| Pricing / Planes | `/pricing` | ❌ | 0% | Página estática — sin integración de pago real |
| Registro con pago | `/register` | ❌ | 0% | No hay método de pago real, no hay cuentas free — flujo completo pendiente |
| Login coach | `/login` | ❌ | 0% | Funcional básico, sin rework |
| Forgot / Reset password | `/forgot-password`, `/reset-password` | ❌ | 0% | Funcional básico, sin rework |

---

## MÓDULO COACH

### Dashboard Principal del Coach (`/coach/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | ❌ | 0% | Existe con estadísticas básicas — sin rework |
| `CoachDashboardClient` | ❌ | 0% | Existe — sin rework de UX ni optimización de queries |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente de rework**

---

### Mi Marca / Brand Settings (`/coach/settings`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | ❌ | 0% | Existe — sin rework |
| `BrandSettingsForm` | ❌ | 0% | Formulario de colores y datos de marca — sin rework |
| `LogoUploadForm` | ❌ | 0% | Upload de logo — sin rework |
| `loading.tsx` | ❌ | 0% | Sin rework |
| `settings/preview/` `StudentDashboardPreview` | ❌ | 0% | Preview de cómo ve el alumno la app — sin rework |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente de rework**

---

### Directorio de Clientes (`/coach/clients`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `CoachClientsShell` | ✅ | 100% | Orquestador limpio, maneja riskFilter |
| `CoachWarRoom` | ✅ | 100% | Stat cards animadas, banners de alerta por attention score |
| `DirectoryActionBar` | ✅ | 100% | Búsqueda, filtros, sort, toggle grid/tabla |
| `ClientsDirectoryClient` | ✅ | 100% | Vista grid + tabla unificada, filtros activos |
| `ClientsDirectoryTable` | ✅ | 100% | Virtualizable con @tanstack/react-virtual, columnas ordenables |
| `ClientsDirectoryEmpty` | ✅ | 100% | Empty state con Lottie |
| `ClientCard.tsx` (V1) | ❌ | 0% | **Huérfano** — nada lo importa, pendiente borrar |
| `ClientCardV2` | ✅ | 100% | Compliance ring, attention badge, sparklines, semáforo, quick actions |
| `CreateClientModal` | ✅ | 100% | Crea auth user + registro vía Admin API |
| `dashboard.service.ts` | ✅ | 100% | Motor de Attention Score, cálculo de riesgo, 1RM Epley |
| `actions.ts` | ✅ | 100% | CRUD completo: crear/borrar/toggle/resetPassword vía Admin API |

**Resultado del módulo: ~90%**

---

### Perfil del Alumno (`/coach/clients/[clientId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `getClientProfileData` | ✅ | 100% | Suspense, fetch paralelo |
| `ClientProfileDashboard` | ✅ | 100% | Tabs, useTransition, orquestador |
| `ClientProfileHero` | ✅ | 100% | Training age, stat chips, attention score |
| `ProfileTabNav` | ✅ | 100% | Sticky, badges, spring animado, useReducedMotion |
| `ProfileOverviewB3` | ✅ | 100% | Compliance rings, heatmap, KPI grid, próximo entreno |
| `TrainingTabB4Panels` | ✅ | 100% | PR banner, RadarChart, BarChart + media móvil, StrengthCards |
| `NutritionTabB5` | 🔶 | 70% | Completo visualmente — falta `consumedCals` reales (depende de rework nutrición alumno) |
| `ProgressBodyCompositionB6` | ✅ | 100% | Weight chart + proyección lineal, IMC, gauge, photo slider |
| `ProgramTabB7` | ✅ | 100% | Grid semanal/cíclico, variante A/B, sheet ejercicio, link al builder |
| `BillingTabB8` | ✅ | 100% | Timeline pagos, resumen CLP, agregar/eliminar pagos |
| `ProfileFloatingActions` | ✅ | 100% | FAB móvil (WhatsApp / check-in / builder) |
| `loading.tsx` | ✅ | 100% | Skeleton per-tab layout |
| `profileTrainingAnalytics.ts` | ✅ | 100% | PR, volumen, tonelaje, sparklines |

**Resultado del módulo: ~94%**

---

### Constructor de Planes (`/coach/builder/[clientId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `WeeklyPlanBuilder` | ✅ | 100% | Rework completo, navegación días, A/B mode, bottom sheet mobile |
| `usePlanBuilder` | ✅ | 100% | Estado centralizado, DnD, undo/redo, balance muscular |
| `BlockEditSheet` | ✅ | 100% | series, reps, peso, tempo, RIR, notas, progresión. iOS safe-area |
| `DraggableExerciseCatalog` | ✅ | 100% | Sidebar + bottom sheet mobile |
| `MuscleBalancePanel` | ✅ | 100% | Balance en tiempo real |
| `DayColumn` + `ExerciseBlock` | ✅ | 100% | DnD completo |
| `ProgramConfigHeader` | ✅ | 100% | Nombre, fechas, fases |
| `TemplatePickerDialog` | ✅ | 100% | |
| `AssignToClientsDialog` | ✅ | 100% | Asignación masiva |
| `PrintProgramDialog` | 🔶 | 50% | Funcional, layout de impresión sin refinamiento |
| `actions.ts` | ✅ | 100% | save, sync, assign, duplicate con snapshot |

**Resultado del módulo: ~95%**

---

### Biblioteca de Programas (`/coach/workout-programs`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `WorkoutProgramsClient` | ✅ | 100% | Rework completo, orquestador limpio |
| `LibraryHeader` | ✅ | 100% | |
| `LibraryToolbar` | ✅ | 100% | Filtros Popover/Sheet responsive |
| `ProgramRow` | ✅ | 100% | |
| `ProgramPreviewPanel` | ✅ | 100% | Dialog desktop / Sheet móvil |
| `libraryStats.ts` | ✅ | 100% | Capa de dominio pura |
| `page.tsx` | 🔶 | 70% | `LIBRARY_PROGRAM_LIST_SELECT` duplicado respecto a `actions.ts` |
| `actions.ts` | ✅ | 100% | duplicate con snapshot + prepend local |

**Resultado del módulo: ~95%**

---

### Módulo Nutrición del Coach

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Biblioteca de Planes | `/coach/nutrition-plans` | ❌ | 0% | Existe — sin rework |
| Builder de Planes | `/coach/nutrition-builder/[clientId]` | ❌ | 0% | Existe — sin rework |
| Comidas | `/coach/meals` | ❌ | 0% | Existe — sin rework |
| Grupos de Comidas | `/coach/meal-groups` | ❌ | 0% | Existe — sin rework |
| Alimentos (BD) | `/coach/foods` | ❌ | 0% | Existe — sin rework |
| Recetas | `/coach/recipes` | ❌ | 0% | Existe — sin rework |
| Detalle Receta | `/coach/recipes/[recipeId]` | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente de rework**

---

### Ejercicios del Coach (`/coach/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Catálogo de ejercicios | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

### Templates (`/coach/templates`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Biblioteca de templates | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

## MÓDULO ALUMNO (CLIENT)

### Login & Cambio de Contraseña

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| `ClientLoginForm` | `/c/[slug]/login` | ❌ | 0% | Funcional, sin rework |
| `change-password/page` | `/c/[slug]/change-password` | ❌ | 0% | Funcional, sin rework |
| `suspended/page` | `/c/[slug]/suspended` | ❌ | 0% | Pantalla básica, sin rework |

---

### Onboarding del Alumno (`/c/[slug]/onboarding`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `OnboardingForm` | ❌ | 0% | Existe — sin rework. Flujo intake, objetivos, foto inicial |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente (prioridad baja)**

---

### Dashboard del Alumno (`/c/[slug]/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `_data/*` + `_components/*` | 🔶 | ~92% | Checklist §11 del mega plan cerrado en código (shell md+, `quickLogWeight`, compliance §10, skeletons, E2E smoke). §12 manual (Lighthouse, móviles reales) sigue aparte — ver [`PROGRESO-jaunty-fluttering-spark.md`](progreso%20cursor/PROGRESO-jaunty-fluttering-spark.md) |
| `WeightProgressChart` | 🔶 | ~60% | Movido a `_components/weight/`; sigue sin objetivos/proyección avanzada |
| Hero / próximo entreno + A/B | 🔶 | ~80% | Variante semana vía `programWeekVariant.ts`; falta pulido §12 |
| Resumen nutrición en dashboard | 🔶 | ~50% | Conectado a plan + comidas; macros aproximados hasta rework `/nutrition` |
| Check-in / banner | 🔶 | ~85% | CTA táctil 44px, pulso atrasado con `prefers-reduced-motion`; flujo completo sigue en `/check-in` |

**Resultado del módulo: ~90% — Paridad con §11 del mega plan en código; QA §12 exhaustivo y macros finos siguen como deuda de producto**

---

### Ejecución de Entrenamiento (`/c/[slug]/workout/[planId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | 🔶 | 40% | Fetch plan + historial funcional, falta contexto de variante/streak |
| `WorkoutTimerProvider` | ✅ | 100% | Context limpio, expone `useWorkoutTimer()` |
| `WorkoutExecutionClient` | 🔶 | 50% | Funcional — UX mobile pendiente de pulir |
| `LogSetForm` | 🔶 | 50% | Funcional — sin optimistic update ni feedback animado |
| `RestTimer` | 🔶 | 50% | Funcional — sin audio/vibración ni personalización por ejercicio |
| `WorkoutSummaryOverlay` | 🔶 | 30% | Existe — contenido básico, falta datos de volumen y logros del día |
| `actions.ts` | 🔶 | 60% | `logSetAction` upsert funcional — falta manejo offline/retry |

**Resultado del módulo: ~50% — Funcional pero sin pulir (prioridad media)**

---

### Check-in del Alumno (`/c/[slug]/check-in`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `CheckInForm` | ❌ | 0% | Existe — sin rework. Flujo peso + fotos + energía desde mobile |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente (prioridad media)**

---

### Nutrición del Alumno (`/c/[slug]/nutrition`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `NutritionTracker` | ❌ | 0% | Existe — sin rework. Logueo de alimentos, plan activo, adherencia |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente (prioridad alta, desbloquea consumedCals en coach)**

---

### Catálogo de Ejercicios del Alumno (`/c/[slug]/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `ClientExerciseCatalog` | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

## PANEL CEO / SUPERADMIN

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Panel CEO / Superadmin | ❌ | 0% | **No existe aún.** Ruta secreta (ej. `/x/internal` o similar) protegida solo para vos y tu socio. Ver métricas globales: coaches activos, MRR, churn, alumnos totales, actividad de la plataforma |

**Resultado del módulo: 0% — No implementado**

---

## PAGOS Y SUSCRIPCIONES

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Método de pago real (coach) | ❌ | 0% | No implementado — sin Stripe/MercadoPago/etc. |
| Registro + pago obligatorio | ❌ | 0% | Flujo `/register` sin payment gate — no hay cuentas free |
| Webhooks de suscripción | ❌ | 0% | No implementado |
| Gestión de suscripción (coach dashboard) | ❌ | 0% | No implementado |
| Control de acceso por plan | ❌ | 0% | No hay feature flags por tier de suscripción |

**Resultado del módulo: 0% — No implementado**

---

## INFRAESTRUCTURA / COMPARTIDOS

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `middleware.ts` | ✅ | 100% | Auth, branding por slug, client suspension |
| `CoachMainWrapper` | ✅ | 100% | isBuilder detection corregido |
| `CoachSidebar` | ✅ | 100% | Navegación coach completa |
| `ClientNav` | 🔶 | 50% | Funcional — sin revisión post-rework del módulo cliente |
| `GlassCard` | ✅ | 100% | Base de cards del sistema |
| `ProgramPhasesBar` (shared) | ✅ | 100% | Usada en builder, perfil, biblioteca |
| `programWeekVariant.ts` | ✅ | 100% | Lógica A/B centralizada, 3+ módulos |
| `dashboard.service.ts` | ✅ | 100% | Attention Score, DirectoryPulse, 1RM |
| `supabase/server.ts` | ✅ | 100% | Client + AdminClient |
| `supabase/queries/workout-programs-library.ts` | 🔶 | 50% | Existe pero select no unificado |
| UI primitives (shadcn) | ✅ | 100% | button, card, dialog, input, form, sheet, etc. |
| PWA / manifests | 🔶 | 60% | Funcional básico — sin rework de UX offline |

---

## Resumen General

| Módulo | % Completado |
|--------|-------------|
| Directorio de Clientes (coach) | 90% |
| Perfil del Alumno (coach) | 94% |
| Constructor de Planes | 95% |
| Biblioteca de Programas | 95% |
| Infraestructura / Shared | 85% |
| Workout Execution (alumno) | 50% |
| Dashboard Coach Principal | 0% |
| Mi Marca / Brand Settings | 0% |
| Módulo Nutrición Coach | 0% |
| Ejercicios Coach | 0% |
| Templates | 0% |
| Dashboard Alumno | ~90% |
| Check-in Alumno | 0% |
| Nutrición Alumno | 0% |
| Catálogo Ejercicios Alumno | 0% |
| Onboarding Alumno | 0% |
| Login / Auth Alumno | 0% |
| Landing / Pricing / Marketing | 0% |
| **Pagos & Suscripciones** | **0%** |
| **Panel CEO / Superadmin** | **0%** |
| **TOTAL ESTIMADO** | **~35%** |

---

## Próximos Reworks (por prioridad)

### 🔴 Alta
1. **Nutrición del alumno** (`/c/[slug]/nutrition`) — logueo de alimentos. Desbloquea `consumedCals` en NutritionTabB5 del coach.
2. **Pagos & Suscripciones** — integrar Stripe o MercadoPago, registro obligatorio con pago, webhooks.

### 🟠 Media
3. **Dashboard del alumno** — ~~rework base~~ hecho en gran parte (ver progreso Cursor); pendiente §12 QA, macros alimentarios alineados con `/nutrition`, preview coach.
4. **Workout Execution** — optimistic updates, WorkoutSummaryOverlay con datos reales, RestTimer con audio/vibración.
5. **Check-in del alumno** — flujo mobile: peso + fotos + energía.
6. **Dashboard principal del coach** (`/coach/dashboard`) — rework de UX y queries.
7. **Mi Marca** (`/coach/settings`) — rework del flow de branding y preview.

### 🟡 Baja
8. **Panel CEO / Superadmin** — ruta secreta para supervisión global de la plataforma.
9. **Módulo Nutrición Coach** — nutrition-plans, nutrition-builder, meals, foods, recipes.
10. **Ejercicios Coach** — catálogo con rework.
11. **Onboarding alumno** — intake, objetivos, foto inicial.
12. **Landing / Pricing** — rework de marketing y conexión al flujo de registro+pago.
13. **Deuda técnica menor:** borrar `ClientCard.tsx` V1, unificar `LIBRARY_PROGRAM_LIST_SELECT`, `useReducedMotion` en child components del perfil.
