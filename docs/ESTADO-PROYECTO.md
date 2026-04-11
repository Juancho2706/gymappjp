# Estado del Proyecto — GymApp JP (EVA)

> Documento vivo. Actualizar cada vez que se cierre un rework, se agregue deuda técnica, o cambie la prioridad de algo pendiente.

### Biblia del proyecto (junto a [`ESTADO-COMPONENTES.md`](ESTADO-COMPONENTES.md))

- Ambos documentos deben mantenerse **al día con el trabajo del día** cuando haya cambios sustanciales.
- Incluir **fecha y hora** en **America/Santiago** en la línea **Última actualización** inferior (formato: `YYYY-MM-DD HH:mm`).

**Última actualización:** 2026-04-11 America/Santiago — Quick wins §7 MAPA-MAESTRO: `.env.example` en raíz, títulos alumno con `font-display` (sin `var(--font-outfit)`), documentación canónica en `docs/` y material histórico movido a `docs/archive/`. Deuda técnica alineada con el código (callback auth, sw.js, puppeteer, select biblioteca, ClientCard V1).

---

## Actualización incremental (Sprint 6 + hotfixes)

> Nota: esta sección registra cambios recientes sin rehacer todavía la auditoría total 225+ archivos.

- **Dashboard coach (ENG-035/038/041):**
  - Refactor a patrón `_data/_components` en `src/app/coach/dashboard/`.
  - Alertas top 5 alumnos en riesgo (`attentionScore`) + quick actions visibles.
- **Mi Marca / Branding MVP (ENG-045/047/050 mínimo):**
  - Nuevo campo `coaches.welcome_message` + migración.
  - Form de branding actualizado y mensaje aplicado en login/dashboard del alumno.
- **Emails transaccionales (ENG-071/072/074):**
  - Templates en `src/lib/email/transactional-templates.ts`.
  - Hook de envío en alta de alumno y asignación de programa.
  - Evidencia y smoke en `docs/archive/RET-003-TRANSACTIONAL-EMAILS-SMOKE.md`.
- **Operación beta interna (post-sprint):**
  - Migración para subir coaches actuales a tier `scale` por 3 años.
  - Tiers ajustados para diferenciarse por límite de alumnos (no por features bloqueadas).
  - Metadata de íconos/favicons en rutas alumno corregida (`icon`, `shortcut`, `apple`).

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router, RSC, Server Actions) | 16.1.6 |
| React | React + React Compiler | 19.2.3 |
| Estilos | Tailwind CSS v4 (PostCSS, sin tailwind.config) | ^4 |
| UI Components | shadcn/ui + @base-ui/react + Radix primitives | — |
| Estado | useState/useReducer/useTransition/Context (sin Redux/Zustand) | — |
| Animación | Framer Motion + tw-animate-css | — |
| Formularios | react-hook-form + Zod v4 | ^4.3.6 |
| Backend | Supabase (Auth, DB, Storage, RLS) | — |
| Charts | Recharts + react-circular-progressbar + react-activity-calendar | — |
| DnD | @dnd-kit/core + sortable | — |
| Virtualización | @tanstack/react-virtual | — |
| Lottie | @lottiefiles/react-lottie-player | — |
| Confetti | canvas-confetti | — |
| Compresión img | browser-image-compression | — |
| i18n | Custom LanguageContext + JSON (es/en) | — |
| PWA | Manual sw.js + dynamic manifests (no next-pwa) | — |
| Testing | Vitest + Testing Library + Playwright | — |
| PDF | puppeteer (`devDependencies` — PrintProgramDialog) | — |

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
- `src/app/coach/workout-programs/components/` (4 componentes)
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
- **Nutrición (B5):** macro rings y adherencia con **datos reales** (comidas completadas + `food_items`), gráficos consumo vs meta, pie plan/consumido, heatmap o `AdherenceStrip`, acordeón comidas, historial con kcal consumidas donde aplica (Plan H)
- **Progreso (B6):** weight AreaChart + proyección 4 sem (regresión lineal), IMC + franja visual, gauge energía RadialBar, photo comparison slider, timeline check-ins
- **Programa (B7):** grid semanal/cíclico, variante A/B por semana, sheet ejercicio (GIF + prescripción + historial), enlace al builder
- **Facturación (B8):** timeline pagos, resumen CLP, agregar/eliminar pagos
- **UX (B9):** FAB móvil (WhatsApp/check-in/builder), `loading.tsx` con skeleton per-tab layout, skeletons al cambiar tab (`useTransition` + `isPending`)

**Archivos clave:**
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`
- `src/app/coach/clients/[clientId]/ProfileTabNav.tsx`
- `src/app/coach/clients/[clientId]/` — todos los tabs B3–B8 + utils
- `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`

---

### Dashboard del Alumno — Rework Total (`jaunty-fluttering-spark`)
**Fecha:** 2026-04-09

**Qué se hizo:**
- Reescritura total de `page.tsx` — server component con Suspense por sección (9 boundaries independientes)
- Arquitectura nueva: `_data/` (React.cache), `_components/` (por dominio), `_actions/`
- `dashboard.queries.ts` — todas las queries cacheadas con timezone Santiago
- `heroComplianceBundle.ts` — bundle cacheado que calcula hero + 3 scores de compliance
- `DashboardShell` — grid responsive 1 col mobile / 2 cols desktop con sidebar sticky
- 30+ componentes: Header, Calendar, Hero, Compliance, Nutrition, Weight, PRs, Program, History, PullToRefresh
- E2E smoke test (Playwright, Chromium) OK
- `npm run build` OK

**Deuda residual (baja):**
- §12 QA manual: Lighthouse PWA, iOS/Android real, auditoría contraste
- `goal_weight` no existe en schema — sin línea target en `WeightProgressChart`

**Archivos clave:**
- `src/app/c/[coach_slug]/dashboard/` (page, _data, _components, _actions, loading)
- `src/lib/animation-presets.ts`, `src/lib/date-utils.ts`

---

### Rework Nutrición — Alumno + Coach (planes A–H + cierre hacia maestro)
**Fecha inicio núcleo:** 2026-04-09 · **Ampliaciones:** 2026-04-10

**Qué se hizo (resumen):**
- **Alumno** (`/c/[slug]/nutrition`): arquitectura `_data` / `_actions` / `_components`; `NutritionShell` con día navegable, macros reales, adherencia 30 días, streak; eliminado `NutritionTracker` monolítico.
- **Coach — hub**: `NutritionHub` (layout ancho 2000px), plantillas, alumnos SYNCED/CUSTOM, board enriquecido con sparklines 7d + kcal hoy, biblioteca alimentos con lista compacta.
- **Coach — PlanBuilder** y rutas `new` / `edit` / `client/[clientId]`; queries + actions unificadas.
- **Perfil coach** tab Nutrición (B5): datos reales — macros, adherencia, kcal, enlaces editor.
- **BD / Supabase:** migraciones versionadas en `supabase/migrations/`; historial y snapshots adicionales en `supabase/migrations_backup/`. Workflow: README + `docs/archive/SUPABASE-MIGRATION-WORKFLOW.md`.

**Archivos clave:**
- `src/app/c/[coach_slug]/nutrition/`, `src/app/coach/nutrition-plans/`, `src/app/coach/foods/`
- `src/components/coach/FoodListCompact.tsx`, `src/lib/nutrition-utils.ts`

---

### Rework Workout Execution + Check-in
**Fecha:** 2026-04-10

**Qué se hizo (workout):**
- `page.tsx` — `resolveActiveWeekVariantForDisplay`, query `exerciseMaxes` con exclusión de bloques del plan actual
- `WorkoutSummaryOverlay.tsx` reescrito: desglose por ejercicio, PRs con 1RM Epley, volumen por grupo muscular, confetti, `useReducedMotion`, animaciones stagger
- `WorkoutExecutionClient.tsx` — barra de progreso, badge Semana A/B, headers de sección, bloques completados con check, scroll al siguiente bloque, fechas relativas en historial
- `LogSetForm.tsx` — `motion` en fila y botón, slider RPE opcional post-log
- `actions.ts` — `revalidatePath` del perfil coach tras log exitoso

**Qué se hizo (check-in):**
- Migración `back_photo_url` en `check_ins` (aplicada vía MCP)
- `page.tsx` — título/metadata mensual, query directa `lastCheckIn`, header sticky + `pt-safe`
- `CheckInForm.tsx` — wizard 3 pasos con indicadores, compresión dual (front + back), animaciones direction-aware, `formatRelativeDate` en banner
- `actions.ts` — schema `back_photo`, upload a bucket `checkins` con path `-back-`, insert `back_photo_url`
- `loading.tsx` nuevo

**Verificación:** `npm run build` OK (Next.js 16.1.6 / Turbopack)

**Archivos clave:**
- `src/app/c/[coach_slug]/workout/[planId]/` (page, client, summary, logset, actions)
- `src/app/c/[coach_slug]/check-in/` (page, form, actions, loading)

---

### iOS Bug Fixes (builder + workout-programs)
**Fecha:** 2026-04-08 | Reportados por tester en iPhone 16

| Bug | Archivo | Fix |
|-----|---------|-----|
| Label "Alumnos (0)" pegado al combobox | `WorkoutProgramsClient.tsx` | `space-y-2` → `space-y-3` |
| Título ejercicio chocaba con notch/Dynamic Island | `BlockEditSheet.tsx` | `pt-[max(1.5rem,env(safe-area-inset-top))]` en SheetHeader |
| Day tabs del builder desplazadas hacia abajo | `WeeklyPlanBuilder.tsx` | Removido `paddingTop: env(safe-area-inset-top)` erróneo + `mt-2→mt-1` |

---

### Coach panel móvil / PWA (refinamiento 2026-04-09)

- **Safe area:** se quitó `pt-safe` del contenedor del layout coach (evitaba **doble** inset con el header móvil). Solo el header móvil (`CoachSidebar`) usa `pt-safe` bajo Dynamic Island.
- **Directorio alumnos:** vista **tabla** por defecto; tabla con scroll horizontal único; menús Base UI con `DropdownMenuGroup`; `modal={false}` en dropdowns.
- **PWA:** `PwaRegister` ajusta viewport en `standalone` (sin zoom); layout coach con `min-h-[100dvh]` en móvil.
- **Tarjetas:** menú "más opciones" con icono visible (`MoreHorizontal`).

---

## Deuda técnica pendiente

### Alta prioridad (bloquea monetización o producción)

#### Workflow de migraciones SQL (seguimiento)
La carpeta `supabase/migrations/` ya existe y se está usando en sprints recientes (incluye migraciones Sprint 5/6).  
**Trabajo pendiente:** mantener disciplina de versionado y asegurar que toda migración aplicada en producción quede commiteada en el mismo sprint.

---

#### Higiene de variables de entorno
`.env.example` en la raíz del repo (alineado con README y `process.env` usado en código).  
**Trabajo pendiente:** revisar trimestralmente variables huérfanas y alinear ejemplos con Vercel/GitHub Secrets activos.

---

#### ~~Auth callback error redirect~~ *(cerrado)*
`src/app/auth/callback/route.ts` redirige en error a `/login?error=auth_callback_failed` (ruta correcta para coach).

---

### Media prioridad

#### Inconsistencia de moneda Pricing vs Landing
`/pricing` muestra tiers en USD (Starter $49, Pro $99, Elite $199). La landing (`/page.tsx`) muestra tiers en CLP (14.990–89.990). Deben alinearse antes de monetizar.
**Trabajo:** Decisión de producto sobre moneda y tiers definitivos. Actualizar ambas páginas.

---

#### ~~`sw.js` cache name~~ *(cerrado)*
`public/sw.js` usa `eva-pwa-cache-v1`.

---

#### Cobertura de tests mínima
Solo existe 1 unit test (`Button.test.tsx`) y 1 Playwright spec (`auth.spec.ts` — verifica títulos de landing y login). Vitest + Playwright están configurados pero sin cobertura real.
**Trabajo:** Escalar tests antes de monetización. Priorizar: server actions críticas (pagos, auth, logSet), flujos E2E (registro→login→workout→check-in), RLS validación.

---

#### ~~`puppeteer` en dependencies~~ *(cerrado)*
`puppeteer` está en `devDependencies`. **Opcional futuro:** alternativa ligera para PDF si se quiere evitar Chromium en entornos de build.

---

#### ~~`consumedCals` en tab Nutrición del perfil~~ *(cerrado 2026-04-09)*
Cerrado — kcal consumidas implementadas via `food_items` de comidas completadas.

---

#### ~~Unificar `LIBRARY_PROGRAM_LIST_SELECT`~~ *(cerrado)*
`page.tsx` de biblioteca e `actions.ts` del builder importan el mismo fragmento desde `src/lib/supabase/queries/workout-programs-library.ts`.

---

#### `goal_weight` en tabla `clients` — línea target en chart de peso
El `WeightProgressChart` no tiene línea de objetivo porque `goal_weight` no existe en schema.
**Trabajo cuando aplique:** Agregar columna `goal_weight_kg numeric` en `clients`, pasar al componente, mostrar `<ReferenceLine>`.

---

#### ~~`ClientCard.tsx` V1~~ *(cerrado)*
Eliminado del repo; el directorio usa `ClientCardV2`.

---

### Baja prioridad / UX futura

#### `ProgramPhasesBar` en filas de biblioteca
Las filas solo tienen badge "Fases". Las cards antiguas mostraban la barra visual.

#### Ordenación y agrupación en biblioteca
El orden actual viene del servidor (`created_at DESC`). Opciones: nombre, última actividad, cliente. Agrupar plantillas vs en curso.

#### `useReducedMotion` en todos los child components del perfil
No aplicado en todos los componentes hijo del perfil (hovers de imágenes, animaciones internas de B3–B8).

#### ~~`font-outfit` en rutas alumno~~ *(cerrado)*
Títulos en login / change-password / exercises / suspended del alumno usan la clase `font-display` (Montserrat vía `--font-display` en tema).

#### `admin-raw.ts` untyped client
`src/lib/supabase/admin-raw.ts` usa `any` para el service-role client. Deuda de tipado.

---

## Módulos pendientes de rework (próximos planes)

> Estado revisado contra código real 2026-04-10 (auditoría completa).

| Módulo | Estado actual | % | Pendiente | Prioridad |
|--------|--------------|---|-----------|-----------|
| ~~**Nutrición (alumno + núcleo coach)**~~ | Completado | ~93-96% | — | ~~Alta~~ → **COMPLETADO** |
| ~~**Dashboard del alumno**~~ | Completado | ~98% | §12 QA manual | ~~Media~~ → **COMPLETADO** |
| ~~**Workout execution rework**~~ | Rework abril 10 | ~82% | Optimistic updates, offline/retry | ~~Media~~ → **COMPLETADO (parcial)** |
| ~~**Check-in rework**~~ | Rework abril 10 | ~80% | Medidas corporales, notas | ~~Media~~ → **COMPLETADO (parcial)** |
| **Pagos & Suscripciones** | Sprint 2 casi cerrado | ~85% | Validar webhook token en producción + checklist Go/No-Go final | **CRÍTICA (revenue)** |
| **Dashboard coach** | Sprint 6 comercial base | ~68% | Completar comparativas avanzadas (ENG-037/039/042/043/044) | Media |
| **Mi Marca / Settings** | Sprint 6 branding MVP | ~62% | Preview actualizado + branding extendido (secondary/font) | Media |
| **Ejercicios coach** | Funcional básico | ~40% | Upload GIF, bulk edit | Baja |
| **Onboarding** | Multi-step con draft | ~58% | Progress bar, foto, validación | Baja |
| **Catálogo ejercicios alumno** | Funcional | ~68% | Rework visual, favoritos, historial | Baja |
| **Login/Auth coach** | Funcional | ~40% | Rework visual, rate limiting | Baja |
| **Registro coach** | Funcional con gate + activación automática | ~78% | Smoke E2E final en producción antes de Sprint 3 | **Alta (con pagos)** |
| **Landing/Pricing** | Sustancial | ~60/25% | Unificar moneda, SEO, testimonios | Media |
| **Panel CEO / Superadmin** | Inexistente | 0% | Métricas globales | Baja |
| **Testing** | Mínimo | 10% | Cobertura razonable | Media-Alta |

---

## Notas de arquitectura

- **Colores por coach:** `--theme-primary` CSS var en `CoachLayout` y `ClientLayout`. Respetar en todos los charts y elementos de énfasis.
- **Dark mode primario:** Verificar variantes dark en todos los componentes nuevos. `ThemeProvider` default dark.
- **`GlassCard`:** Base de todas las cards del perfil y directorio. No crear cards custom sin revisar si aplica.
- **Safe area iOS:** Usar `env(safe-area-inset-top/bottom)` en fixed/sticky en mobile. En **coach móvil**, el **header superior** (`CoachSidebar`) lleva `pt-safe`; el contenedor del layout **no** debe duplicar `pt-safe`.
- **Variante A/B:** Lógica centralizada en `src/lib/workout/programWeekVariant.ts`. Semana impar del programa → A, par → B. Usada en builder, perfil, dashboard cliente, workout execution.
- **Arquitectura `_data/_actions/_components`:** Patrón establecido en dashboard alumno y nutrición. Seguir en nuevos módulos.
- **React.cache:** Usar para queries deduplicadas en RSC. Patrón establecido en dashboard queries.
- **24 tablas Supabase:** `coaches`, `clients`, `client_intake`, `client_payments`, `check_ins`, `exercises`, `workout_programs`, `workout_plans`, `workout_blocks`, `workout_logs`, `nutrition_plans`, `nutrition_plan_templates`, `nutrition_meals`, `food_items`, `foods`, `daily_nutrition_logs`, `nutrition_meal_logs`, `recipes`, `recipe_ingredients`, `saved_meals`, `saved_meal_items`, `template_meals`, `template_meal_groups`. 1 función RPC: `search_foods`.
- **PWA manual:** `public/sw.js` + manifests dinámicos por coach (`/api/manifest/[coach_slug]` + `/c/[slug]/manifest.webmanifest`). No usa next-pwa.
- **i18n parcial:** `LanguageContext` con `es.json`/`en.json`. Implementado en landing, no consistente en toda la app.
