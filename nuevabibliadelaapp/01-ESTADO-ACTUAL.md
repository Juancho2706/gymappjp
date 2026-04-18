# 01 — Estado Actual de EVA Fitness Platform

> **Actualizado:** 2026-04-18 America/Santiago (Sesión 7)
> **Fuentes:** ESTADO-PROYECTO.md, MAPA-MAESTRO.md, ESTADO-COMPONENTES.md, ROAD-TO-100.md + commits 2026-04-15/18
> **Completitud global estimada: ~97%** (Sesiones 1–7 completadas)

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js App Router + RSC + Server Actions | 16.1.6 |
| React | React + React Compiler | 19.2.3 |
| Estilos | Tailwind CSS v4 (PostCSS, sin tailwind.config) | ^4 |
| UI Components | shadcn/ui + @base-ui/react + Radix primitives | — |
| Estado | useState/useReducer/useTransition/Context | — |
| Animación | Framer Motion + tw-animate-css | — |
| Formularios | react-hook-form + Zod v4 | ^4.3.6 |
| Backend | Supabase (Auth, DB, Storage, RLS) | — |
| Charts | Recharts + react-circular-progressbar + react-activity-calendar | — |
| DnD | @dnd-kit/core + sortable | — |
| Virtualización | @tanstack/react-virtual | — |
| i18n | Custom LanguageContext + JSON (es/en) | parcial |
| PWA | Manual sw.js + manifests dinámicos (no next-pwa) | — |
| Testing | Vitest + Testing Library + Playwright | — |
| PDF | puppeteer (devDependencies — PrintProgramDialog) | — |

**Base de código:** 225+ archivos TypeScript/TSX · 24 tablas Supabase · 41 rutas · 11+ API routes · 3 funciones RPC (`get_client_current_streak`, `get_coach_clients_streaks`, `get_coach_workout_sessions_30d`)

---

## Estado por Módulo (Snapshot 2026-04-17)

| Módulo | % | Notas clave |
|--------|---|-------------|
| Dashboard Alumno | 98% | Completo. 9 Suspense boundaries, React.cache, compliance rings, PRs, nutrición |
| Nutrición Alumno | 97% | Completo. Datos reales, DayNavigator, adherencia 30d |
| Constructor de Planes | 97% | Completo. WeeklyPlanBuilder, DnD, A/B mode, BlockEditSheet. UX móvil mejorado (panel config oculto, gear button pulsante, hint banner, labels español) |
| Biblioteca de Programas | 95% | Completo. Filtros, preview panel, duplicate con snapshot |
| Perfil Alumno (Coach view) | 95% | Completo. 6 tabs (Overview/Análisis/Nutrición/Progreso/Plan/Facturación) |
| Nutrición Coach (núcleo) | 93% | Completo. Hub, PlanBuilder, FoodLibrary, ActivePlansBoard |
| Directorio de Clientes | 92% | Completo. War Room, attention score, tabla virtualizable |
| Pagos & Suscripciones | 96% | Completo. Grace period, upgrade mid-cycle, webhook HMAC |
| BD Alimentos | 100% | is_liquid+brand+ml+branded foods chilenos aplicados en producción. Scripts auditoría disponibles para futuras actualizaciones |
| Dashboard Coach Principal | 90% | Analytics MRR/sesiones/crecimiento/activity feed. Botones ayuda agregados |
| Registro Coach | 88% | Sprint 8 UX (badges, tabla resumen). Pendiente: verificación email |
| Workout Execution | 88% | BUG-001 cerrado. useOptimistic ya implementado. Fix UX edición sets. Pendiente: offline/retry |
| Historial fecha coach | 85% | DayNavigator en TrainingTab y NutritionTab. Pendiente: dots actividad ✅ |
| Check-in Alumno | 82% | Wizard 3 pasos, dual photos. Pendiente: medidas corporales |
| Mi Marca / Settings | 68% | Logo preview real-time, color fix. Pendiente: preview moderno |
| Pricing Page | 78% | CLP, 5 tiers, agrupación visual. Pendiente: testimonios, SEO |
| Landing Page | 72% | Hero animado, stats, pricing. Pendiente: SEO técnico, LCP |
| Catálogo Ejercicios Alumno | 68% | Búsqueda + filtro + modal GIF. Pendiente: favoritos, historial |
| Onboarding Alumno | 58% | Multi-step, localStorage draft. Pendiente: fotos, más validación |
| Login/Auth Alumno | 50% | Funcional. Sin rework visual |
| Login Coach | 40% | Funcional básico. Sin rework visual |
| Forgot/Reset Password | 40% | Flujo correcto con redirectTo |
| Ejercicios Coach | 40% | CRUD + catálogo. Pendiente: upload GIF, bulk edit |
| Testing | 28% | Vitest básico + Playwright. Sin cobertura real |
| Panel CEO / Superadmin | 0% | No implementado |

**TOTAL GLOBAL: ~97%**

---

## Cuentas de Prueba Activas (2026-04-16)

| Email | Slug | Plan | Acceso hasta |
|-------|------|------|-------------|
| Joaquinamr7@gmail.com | joaquinamr7 | pro activo | 2026-05-16 |
| robertocarrasco154@gmail.com | robertocarrasco154 | pro activo | 2026-05-16 |
| Password provisional: `evaprueba123`, `max_clients: 50`

---

## Notas de Arquitectura Importantes

- **Colores por coach:** `--theme-primary` CSS var en `CoachLayout` y `ClientLayout`. `SYSTEM_PRIMARY_COLOR = '#007AFF'` cuando coach no activa branding. `BRAND_PRIMARY_COLOR = '#10B981'` (verde) es la marca propia de EVA.
- **Dark mode:** `ThemeProvider` default dark. Verificar variantes dark en componentes nuevos.
- **`GlassCard`:** Base de todas las cards del perfil y directorio.
- **Safe areas iOS/Android (Sesión 7):** Utilities `pt-safe/pb-safe/pl-safe/pr-safe` en `globals.css` + `--safe-area-inset-*` CSS vars. Headers (`CoachSidebar`, builder) requieren `pl-safe pr-safe` para no cortar botones en Dynamic Island/notch. `CoachMainWrapper` aplica offsets top+bottom automáticamente. Ver sección de móvil abajo.
- **Viewport units móvil (Sesión 7):** Usar siempre `h-dvh`/`min-h-dvh` en lugar de `h-screen`/`min-h-screen`. `dvh` (dynamic viewport height) se adapta cuando aparece/desaparece la barra del browser en iOS Safari y Chrome Android. `100vh` es fijo e ignora las barras dinámicas.
- **`overflow-x: clip` en `html` (Sesión 7):** Previene scroll horizontal sin crear scrollbar fantasma ni romper `position: sticky`. Fallback `overflow-x: hidden` para Safari < 16.
- **Base UI Select (Sesión 7):** `SelectPrimitive.Value` muestra el `value` crudo (e.g., "weeks") en lugar del label de la opción. Workaround: pasar children explícitos con un mapa de labels (`DURATION_LABELS`).
- **Variante A/B:** Lógica centralizada en `src/lib/workout/programWeekVariant.ts`. Semana impar → A, par → B.
- **Arquitectura `_data/_actions/_components`:** Patrón establecido en dashboard alumno y nutrición. Seguir en nuevos módulos.
- **React.cache:** Para queries deduplicadas en RSC. No usar `unstable_cache` (incompatible con Supabase SSR en prod).
- **PWA:** `public/sw.js` + manifests dinámicos por coach (`/api/manifest/[coach_slug]` + `/c/[slug]/manifest.webmanifest`).
- **24 tablas Supabase:** `coaches`, `clients`, `client_intake`, `client_payments`, `check_ins`, `exercises`, `workout_programs`, `workout_plans`, `workout_blocks`, `workout_logs`, `nutrition_plans`, `nutrition_plan_templates`, `nutrition_meals`, `food_items`, `foods`, `daily_nutrition_logs`, `nutrition_meal_logs`, `recipes`, `recipe_ingredients`, `saved_meals`, `saved_meal_items`, `template_meals`, `template_meal_groups`. 1 función RPC: `search_foods`.

### Arquitectura Móvil (Sesión 7)

**Layout del coach en móvil:**
- Top bar fija: `CoachSidebar` en `md:hidden fixed top-0` con altura `--mobile-top-bar-h: 3.5rem`
- Bottom nav fija: `CoachSidebar` en `fixed bottom-0` con altura `--mobile-bottom-bar-h: 80px`
- `CoachMainWrapper` compensa ambas con `pt-[var(--mobile-content-top-offset)]` + `pb-[var(--mobile-content-bottom-offset)]`
- En el builder (`/coach/builder/*`): la top bar y bottom nav del coach se ocultan (`hidden md:flex`); el builder tiene su propio header fijo

**Utilities CSS disponibles (globals.css):**
```css
.pt-safe / .pb-safe / .pl-safe / .pr-safe   /* safe-area insets individuales */
.px-safe / .py-safe                           /* safe-area insets en par */
.h-dvh-safe                                   /* 100dvh - top - bottom safe areas */
.min-h-dvh-safe                               /* igual pero min-height */
.scroll-y-safe                                /* scroll con compensación bottom nav */
.scroll-y-plain                               /* scroll sin compensación bottom nav */
```

**Regla global en `html`/`body`:**
```css
html { overflow-x: hidden; overflow-x: clip; }
body { min-height: 100dvh; overscroll-behavior-y: none; }
```

---

## Historial de Sesiones

### Sesión 7 — 2026-04-17/18 — Optimización Móvil Completa + Builder UX

**Problema raíz:** La app ignoraba el *visual viewport* real del móvil y las *safe areas* de dispositivos modernos (iPhone Dynamic Island, Android Chrome con barra dinámica). 4 bugs visibles en capturas del usuario.

**Bugs corregidos:**

1. **Botón guardar cortado en builder (iPhone):** Header de `WeeklyPlanBuilder` carecía de `pl-safe pr-safe`. El Dynamic Island/notch agrega 8–12px de inset que cortaba el botón de guardar y el engranaje. Fix: añadir `pl-safe pr-safe` al `<header>`.

2. **Constraint DB roto al guardar programa:** Producción tenía constraint `duration_type IN ('weeks', 'days', 'indefinite')` pero el código envía `('weeks', 'calendar_days', 'async')`. Migración nunca aplicada. Fix: aplicar via MCP directo + guardar `supabase/migrations/20260417_fix_duration_type_constraint.sql`.

3. **Labels de duration type en inglés:** `SelectPrimitive.Value` de Base UI muestra el valor crudo, no el label. Fix: `DURATION_LABELS` map explícito en `ProgramConfigHeader.tsx`.

4. **Onboarding paso 3 con botón tapado por bottom nav:** `min-h-screen` + `justify-center` centraba en 100vh sin contar la barra del browser. Fix: `min-h-dvh` + `md:justify-center` (solo desktop centra).

**Mejoras de UX en builder:**

- **Config panel oculto por default:** `showConfig` inicializa en `false`; antes se abría si el programa era nuevo. Ahora siempre cerrado.
- **Gear button icon-only con animación:** Botón de configuración cambió a `w-10 h-10` puro icono (sin texto). Color ámbar (`text-amber-500`). Cuando el panel está cerrado: `animate-ping` permanente con `bg-amber-400/20` pulsando hacia afuera. Se detiene al abrir el panel.
- **Hint banner de primera visita:** Banner ámbar entre el header y `ProgramPhasesBar`. Se auto-descarta en 9 segundos. Se persiste en `localStorage` con key `'builder_config_hint_v1'`. Se puede cerrar manualmente.

**Barrido sistemático h-screen → h-dvh (25+ archivos):**

Todos los usos de `h-screen`/`min-h-screen` fuera de breakpoint `md:` reemplazados con `h-dvh`/`min-h-dvh` en: layouts de cliente y coach, workout execution, nutrition, exercises, check-in, onboarding, auth, not-found, global-error, legal, privacidad, pricing, settings preview.

**Primitivas globales añadidas a globals.css:**
- `overflow-x: clip` en `html` (no crea scrollbar fantasma, preserva `sticky`)
- `min-height: 100dvh` en `body`
- `overscroll-behavior-y: none` en `body`
- Nuevas utilities: `.h-dvh-safe`, `.min-h-dvh-safe`, `.px-safe`, `.py-safe`, `.scroll-y-safe`, `.scroll-y-plain`

**Navs actualizadas:**
- `ClientNav.tsx`: añadido `pl-safe pr-safe md:pl-0 md:pr-0`, `md:h-screen` → `md:h-dvh`
- `CoachSidebar.tsx`: mismo tratamiento

**Componentes actualizados:**
- `DayColumn.tsx`: `pb-safe` en scroll container
- `ProgramConfigHeader.tsx`: `max-h-[60vh]` → `max-h-[80dvh] md:max-h-[60vh]`
- `onboarding/page.tsx`: `min-h-screen` → `min-h-dvh`, `justify-center` → `md:justify-center`
- `c/[coach_slug]/layout.tsx`: `min-h-screen` → `min-h-dvh`

---

### Sesión 6 — 2026-04-17 — Botones de ayuda + Fix UX edición sets + Verificación DB completa

**Análisis realizado:**
- Verificación completa de sincronización entre documentos y código real.
- Confirmado via MCP que **toda** la base de datos está aplicada en producción: RLS, columnas, funciones, índices, alimentos.
- Discrepancia corregida: item 10.1 (useOptimistic) ya estaba implementado desde sesiones anteriores.

**Cambios implementados:**

- **Fix UX edición sets** (`LogSetForm.tsx`):
  - Hint visual `"Cambia los valores y presiona ✓ para actualizar"` debajo de cada serie guardada.
  - `aria-label` y `title` del botón checkmark actualizados a "Set guardado · toca para editar".
  - El bug era UX puro: los inputs nunca estuvieron deshabilitados; el color verde daba impresión de bloqueo.

- **Botones de ayuda por sección** (11 secciones, InfoTooltip existente reutilizado):
  - **Alumno:** WorkoutHeroCard (dashboard), ComplianceRingCluster (30d adherencia), WorkoutExecution header, Nutrición page, Check-in page, Catálogo de ejercicios.
  - **Coach:** Centro de Control (dashboard), Directorio War Room, Builder de planes, Biblioteca de programas, Mi Marca/Settings.
  - *(Nutrición Coach ya tenía HelpCircle amarillo propio — no se tocó.)*

- **i18n:** Claves `section.*` agregadas en `es.json` y `en.json` (12 claves nuevas).

- **Documentos `nuevabibliadelaapp/`:** Actualizados con estado real de DB, completitud global (~96%), migraciones pendientes eliminadas.

- **Migraciones `.sql` locales:** Eliminadas 13 archivos ya aplicados en producción (ver lista en `02-ROADMAP-PENDIENTES.md`).

---

### Sesión 5 — 2026-04-16 — BD Alimentos (is_liquid + brand + ml + scripts auditoría)

**Problema:** Inconsistencias nutricionales detectadas por el coach. Líquidos como la leche usaban `g` en lugar de `ml`. Productos de marca chilena (Colún, Quaker, Soprole) no existían.

**Cambios implementados:**

- **Migración `20260416120000_add_liquid_and_brand_support.sql`:**
  - Columnas `is_liquid boolean NOT NULL DEFAULT false` y `brand text` añadidas a `foods`
  - Todos los alimentos `category='bebida'` + nombres `leche%`, `jugo%`, `caldo%`, `kombucha`, `kéfir` → `is_liquid=true`, `serving_unit='ml'`, `serving_size=200`
  - Excepciones (`queso`, `crema`, `helado`) revertidas a `'g'`

- **Scripts de auditoría en `scripts/`:**
  - `audit-fresh-foods.mjs` — compara ~250 alimentos frescos contra USDA FoodData Central API. Genera `scripts/output/fresh-foods-audit.md` + `fresh-foods-corrections.sql` (solo ítems con delta > 10%)
  - `fetch-chilean-branded-foods.mjs` — busca en OpenFoodFacts productos de marca para Chile. Genera `branded-foods-review.csv` con 30+ búsquedas (avenas, leches, proteínas, panes, snacks)
  - `generate-branded-migration.mjs` — convierte el CSV aprobado (columna `APROBADO=S`) en migración SQL final

- **UI food picker:**
  - `FoodSearchDrawer.tsx`: `normalizeUnit` retorna `'ml'` para líquidos. Selector `[ml, un]` para líquidos, `[g, un]` para sólidos. Badge `ml` azul en resultados
  - `FoodItemRow.tsx`: `UNITS_SOLID/UNITS_LIQUID` separados. Muestra brand name si existe
  - `types.ts`: `FoodItemDraft.food` incluye `is_liquid` y `brand`
  - `nutrition-coach.queries.ts`: `getFoodLibrary` y `getCoachFoodsCatalog` retornan `is_liquid` y `brand`

- **Tipos:** `database.types.ts` actualizado con `is_liquid: boolean` y `brand: string | null`

**Pendiente (usuario):**
1. `USDA_API_KEY` en `.env.local` (obtener gratis en `fdc.nal.usda.gov/api-key-signup.html`)
2. `node scripts/audit-fresh-foods.mjs` → revisar `scripts/output/fresh-foods-audit.md` → aplicar correcciones
3. `node scripts/fetch-chilean-branded-foods.mjs` → revisar CSV con coach → marcar `APROBADO=S`
4. `node scripts/generate-branded-migration.mjs` → `supabase db push`

---

### Sesión 4 — 2026-04-16 — Onboarding inline validation + Escalabilidad doc

**Cambios implementados:**

- **15.3 ✅ Validación inline onboarding:**
  - `OnboardingForm.tsx`: `touched` state por campo, `handleBlur` marca como visitado, `fieldError()` retorna mensaje si vacío post-blur. Botón "Siguiente" muestra todos los errores del step al hacer click. Borde rojo + mensaje `text-xs text-red-400` bajo cada campo requerido.

- **23.2 ✅ Forgot/reset password verificado:** flujo correcto: `resetPasswordForEmail` con `redirectTo = /auth/callback?next=/reset-password`; reset-password usa `coach_slug` param para redirigir al login correcto; Zod validation en ambas acciones.

- Nuevo documento `ESCALABILIDAD-Y-MODELO-NEGOCIO.md` creado.

---

### Sesión 3 — 2026-04-16 — Bug fixes críticos + Color system

**Cambios implementados:**

- **Fix ✅ 404 botón NUTRICION:** `CoachDashboardClient.tsx` → `href="/coach/nutrition"` → `href="/coach/nutrition-plans"`
- **Fix ✅ Sistema de colores verde/azul:** `SYSTEM_PRIMARY_COLOR = '#007AFF'` en `brand-assets.ts`. `coach/layout.tsx` y `middleware.ts` usan el nuevo valor cuando `use_brand_colors_coach === false` (antes usaban `BRAND_PRIMARY_COLOR` verde #10B981). Fallback `hexToRgb` corregido a `'0, 122, 255'`.
- **Fix ✅ NutritionModal responsive:** `w-[95vw] sm:max-w-2xl md:max-w-4xl`, grid `2→4 cols`, header `flex-wrap`, `MacroItem` simplificado sin corte de texto.
- **Fix ✅ Emails legales:** `/legal` y `/privacidad` → `opcoach49@gmail.com` → `contacto@eva-app.cl`
- **04.4 ✅ Banner trial:** Confirmado ya implementado en `CoachDashboardClient.tsx` (líneas 207-228).

---

### Sesión 2 — 2026-04-15/16 — Dashboard Analytics + Core Features

**Seguridad:**
- **F1 ✅** Email drip endpoint `/api/internal/email-drip/run` → migrado a `Authorization: Bearer` exclusivo. Query param inseguro eliminado.
- **F2 ✅** `/api/recipes/search` → rate limiting Upstash 30 req/min (`ratelimit:recipes`).

**Dashboard Coach Analytics:**
- **11.1 ✅** Stat card "MRR Estimado" con delta % vs mes anterior (desde `subscription_events`)
- **11.2 ✅** `AreaChart` "Sesiones 30 días" — unique sessions/día deduplicadas por `client+day`
- **11.3 ✅** `BarChart` "Crecimiento de Alumnos" — nuevos clientes por mes (últimos 6 meses)
- **11.4 ✅** Activity feed — tipos check-in/workout/nuevo alumno, color coding, thumbnail foto check-in
- `DashboardCharts.tsx` (nuevo en `src/components/coach/dashboard/`) encapsula los 2 charts

**Core Loop Features:**
- **06.4 ✅** Dots de actividad en `DayNavigator` — server actions `getClientWorkoutActivityDates` + `getClientNutritionActivityDates` en `actions.ts`. Cargadas on-mount en `TrainingTabB4Panels` y `NutritionTabB5`.
- **09 ✅** Goal weight: migración `20260415120000_goal_weight_kg.sql`, server action `updateClientGoalWeight`, input inline en Panel de Progreso, `<ReferenceLine>` amarilla dashed en `WeightProgressChart`.

**UX Polish:**
- **07.4 ✅** KPI card sidebar: padding reducido (`p-4`), blur decorativo eliminado, "Racha Interact." duplicada removida.
- **12.2 ✅** Logo preview en tiempo real con `URL.createObjectURL` + limpieza en unmount.
- **B3 ✅** Dark mode completo en `/coach/subscription`.
- **B4 ✅** `src/app/not-found.tsx` — página 404 personalizada con branding EVA.
- **B5 ✅** `aria-label` en botones de ícono (sidebar coach, nav alumno, workout, exercise block).

**Performance:**
- **G1 ✅** `getFoodLibrary` + `getCoachFoodsCatalog` — `SELECT *` → columnas específicas.

---

### Sesión 1 — 2026-04-14/15 — Pagos Hardening + RLS

**Pagos:**
- **P2.4 ✅** Webhook upgrade: cuando nuevo preapproval se `authorized`, cancela el anterior en MP y actualiza `subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id`.
- **P2.6 ✅** Coach en `canceled` que reactiva: `start_date = now + 60s` (no hereda fecha anterior).
- **04.1 ✅** Register action: slug generation con race-condition guard, redirect correcto con query params.
- **04.2 ✅** Processing page: si polling detecta `pending_payment` tras 5 min, muestra "Hubo un problema" + link a `/coach/reactivate`.
- **04.3 ✅** Middleware + `/coach/reactivate/`: status `bloqueado` redirige con mensaje claro.
- **05.2 ✅** `/coach/subscription/page.tsx`: historial de pagos formateado en `es-CL`.

**RLS:**
- **Migración `20260414183000_superseded_preapproval_and_rls.sql`** — RLS en 24 tablas críticas.
- **`supabase db push` PENDIENTE** (usuario debe ejecutar).

**Performance & loading.tsx:**
- 6 nuevos `loading.tsx` creados: `/coach/builder/[clientId]/`, `/coach/meals/`, `/coach/nutrition-plans/[templateId]/edit/`, `/coach/nutrition-plans/new/`, `/coach/recipes/`, `/coach/workout-programs/builder/`
- `WeeklyPlanBuilder` y `PlanBuilder` → `next/dynamic` con skeletons.

---

### Sesiones previas (Sprint 8 — 2026-04-14)

- Grace period cancelación: `canceled` preserva `current_period_end`. Gate chequea fecha antes de bloquear. Banner amarillo en dashboard.
- Upgrade mid-cycle: `create-preference` pasa `startDate = current_period_end` → coach no pierde acceso.
- Pricing: dos grupos visuales ("sin nutrición" / "con nutrición"), FAQs extendidos, callout empresarial.
- Register: paso 2 con badges nutrición/ciclo, paso 3 con tabla resumen.

---

### Sprints anteriores — Reworks completados

| Módulo | Fecha | Resultado |
|--------|-------|-----------|
| Dashboard Alumno | 2026-04-09 | Reescritura total. 9 Suspense, React.cache, 30+ componentes |
| Nutrición Alumno + Coach | 2026-04-09/10 | Arquitectura `_data/_actions/_components`. Macros reales. |
| Workout Execution | 2026-04-10 | A/B variant, PRs summary, confetti, barra progreso |
| Check-in Alumno | 2026-04-10 | Wizard 3 pasos, dual photos, compresión |
| Directorio + War Room | 2026-04-08 | Attention Score, ClientCardV2, virtualización |
| Perfil Alumno (6 tabs) | 2026-04-08 | B3–B8 completos, Spring indicator, FAB móvil |
| Builder de Planes | 2026-04-08 | Undo/redo, DnD completo, BlockEditSheet |
| Biblioteca de Programas | 2026-04-08 | Preview panel, filtros avanzados, duplicate snapshot |
| BUG-001 workout reset | 2026-04-13 | Filtro de fecha en logs y upsert de logSetAction |

---

## Commits 2026-04-17/18 — Resumen técnico

| Hash | Fecha | Cambio |
|------|-------|--------|
| `b89acbd` | 2026-04-18 | fix(ui): ajuste tamaños de botones y layout para responsividad móvil |
| `d92eae4` | 2026-04-17 | Merge branch 'EstiloDos': optimización móvil completa + builder UX |
| `cbfec3e` | 2026-04-17 | fix(builder): elimina ref a setConfigPulse + config panel oculto por default |
| `120d44d` | 2026-04-17 | fix(mobile): safe-areas (pl/pr-safe en headers), dvh viewport (25 archivos), constraint duration_type |
| `320e97c` | 2026-04-17 | Refactor estructura código para mayor legibilidad |
| `8aa02c6` | 2026-04-17 | Añade documentación de estrategia de negocio y operaciones de pago para EVA |

---

## Commits 2026-04-15/16 — Resumen técnico

| Hash | Fecha | Cambio |
|------|-------|--------|
| `b8b1368` | 2026-04-16 | Layout responsiveness: min-width en DraggableExerciseCatalog, WeeklyPlanBuilder, ExerciseBlock, DayColumn |
| `3d08706` | 2026-04-16 | CoachLayout: mejor height handling en builder mode. CoachSidebar: height condicional por builder state |
| `d676792` | 2026-04-16 | Exercise data fetching: fallback query para columnas recientes faltantes en entorno |
| `785e589` | 2026-04-16 | Caching: `unstable_cache` → `React.cache` en directory pulse (fix producción Supabase SSR) |
| `f6fc2f7` | 2026-04-16 | CoachLayout: dynamic import de SuccessAnimationProvider → direct import de CoachSuccessAnimationLazy |
| `7a93792` | 2026-04-16 | Performance: `ENABLE_PERF_LOGS` en `.env.example`. Medición server en `getPersonalRecords` y `getCoachDashboardData`. Queries SQL optimizadas. `getCoach()` unificado para session management |
| `68504f3` | 2026-04-16 | BD Alimentos: script correcciones USDA, columnas `is_liquid`+`brand`, alimentos líquidos actualizados, branded foods chilenos seedeados |
| `279e676` | 2026-04-16 | Refactor estructura código para legibilidad |
| `02dbb26` | 2026-04-16 | OnboardingForm: validación inline (touched/blur/fieldError). Doc escalabilidad B2B |
| `430ff07` | 2026-04-16 | Docs: ESTADO-PROYECTO, ESTADO-COMPONENTES, ARQUITECTURA-COMPONENTES, ROAD-TO-100 actualizados con Sesión 3 |
| `1e50144` | 2026-04-16 | Docs: build session. Types: `video_start_time`/`video_end_time` en exercises |
| `27b227e` | 2026-04-16 | Fix: NutritionModal responsive, 404 nav, color system, emails legales |
| `ae332ef` | 2026-04-15 | Types: `video_start_time`/`video_end_time` en exercises.Row/Insert/Update |
| `3f3edb7` | 2026-04-15 | Types: database.types.ts UTF-8 (fix build Vercel "is not a module") |
| `329d7da` | 2026-04-15 | `client_payments` table con security policies |
| `0708850` | 2026-04-15 | Docs: smoke test MercadoPago. loading.tsx para 6 rutas. not-found.tsx |

---

## Estado de la Base de Datos en Producción (verificado 2026-04-17)

**Todo aplicado en producción via MCP.** No hay migraciones pendientes.

| Elemento | Estado |
|----------|--------|
| RLS en 24 tablas (`rowsecurity = true`) | ✅ Activo |
| `clients.goal_weight_kg` | ✅ Existe |
| `coaches.superseded_mp_preapproval_id` | ✅ Existe |
| `coaches.welcome_message` | ✅ Existe |
| `foods.is_liquid`, `foods.brand`, `foods.serving_unit` | ✅ Existen |
| `client_payments` table | ✅ Existe con RLS |
| `coach_onboarding_events`, `coach_email_drip_events` | ✅ Existen |
| Función `get_coach_workout_sessions_30d` | ✅ Existe |
| Función `get_coach_clients_streaks` | ✅ Existe |
| Función `get_client_current_streak` | ✅ Existe |
| Índices perf `workout_logs`, `daily_nutrition_logs` | ✅ Existen |
| Alimentos chilenos de marca (Colún, Quaker, etc.) | ✅ Seedeados |

**Nota sobre `supabase_migrations`:** Las migraciones se aplicaron vía MCP directo, por lo que solo 9 aparecen registradas en la tabla `supabase_migrations`. Esto es normal para este flujo de trabajo. Los archivos `.sql` locales correspondientes fueron eliminados para evitar confusión.

| Elemento | Estado |
|----------|--------|
| `workout_programs_duration_type_check` constraint (Sesión 7) | ✅ Corregido — ahora acepta `('weeks', 'calendar_days', 'async')` |
| Migración `20260417_fix_duration_type_constraint.sql` | ✅ Guardada en `supabase/migrations/` |
