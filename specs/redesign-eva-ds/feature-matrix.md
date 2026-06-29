# Matriz de preservación de funciones — Rediseño EVA (AC5)

> **Propósito (AC5 · feature-preservation).** Garantizar que **ninguna función de cara al usuario** que existe hoy en la app (web `apps/web` + mobile `apps/mobile`) se pierda en el rediseño basado en el design-system de `docs/design-source`. Una función que **se movió** de lugar es válida — se registra su nuevo hogar. Una función **sin hogar** en ningún lado del diseño nuevo es **ORFANA** y se marca para decisión.

## Metodología

- **Lado autoridad (dónde va):** los 21 docs de pantalla del diseño nuevo `docs/design-source/uploads/menus/_md/*.md` (alumno-01..09, coach-01..12) + `SCREENS-INDEX.md` + screens `ui_kits/eva-app/screens/*.jsx`. Estos describen, pantalla por pantalla, qué función vive dónde en el rediseño.
- **Lado actual (qué existe hoy):** se recorrieron las carpetas reales de ruta — web `apps/web/src/app/coach/**` y `apps/web/src/app/c/[coach_slug]/**`, mobile `apps/mobile/app/coach/**` y `apps/mobile/app/alumno/**` (page.tsx + `_components` + `_actions` + `_data` + componentes cliente). No se adivinó: se enumeró cada botón / flujo / modal / toggle / dato mostrado / acción.
- **Granularidad:** una fila por función o por grupo apretado de funciones. Se anotan diferencias web↔mobile cuando son relevantes (`[web]` / `[mobile]`).
- **Estados:** ✅ mapeada (hogar claro) · ↪️ reubicada (cambió de pantalla/IA a propósito) · ⚠️ **ORFANA** (sin hogar en el diseño nuevo) · ❓ dudosa (hogar parcial/ambiguo — necesita confirmación).
- **Nota de paridad:** el diseño nuevo declara **RN mobile ≡ web responsive**. Por eso las funciones hoy "solo-web" (módulos de pago, Nutrición Pro, etc.) NO son orfanas — el diseño las da por presentes también en mobile; los huecos actuales de mobile se listan aparte como deuda de paridad, no como orfandad.

---

## Tabla 1 — ALUMNO  (`/c/[coach_slug]/*`, mobile `app/alumno/*`)

| Función actual | Dónde está hoy (web / mobile) | Dónde va en el diseño nuevo | Estado |
|---|---|---|---|
| **Shell / navegación inferior** (Inicio, Plan, Aprender, Check-in, +Historial, +Perfil) | `c/[coach_slug]/layout.tsx` (ClientNav) · mobile `alumno/(tabs)/_layout.tsx` (6 tabs) | alumno-01..09 nav base 4 (Inicio/Plan/Aprender/Check-in) + **"Más"** (AlumnoMas) que absorbe Historial y Perfil | ↪️ reubicada |
| Tabs condicionales por módulo: Movimiento / Composición | `layout.tsx` `showMovement`/`showBodyComposition` [web] | alumno-05 / alumno-06 (tabs condicionales por `movement_assessment` / `body_composition`); en UI-kit van bajo "Más › Módulos" | ↪️ reubicada |
| Gate de nutrición (master switch, oculta tab Plan) | `layout.tsx` `showNutrition` | alumno-01/02 master switch dominio (fail-OPEN) | ✅ mapeada |
| White-label (colores/logo/fuentes/loader) + BrandLoadingShell | `layout.tsx` + `BrandClientLoadingShell.tsx` · mobile branding fetch | alumno-09 (login brandeado, free→EVA visual, Pro+→full) + tema global | ✅ mapeada |
| Footer "Potenciado por EVA" (free) + Privacidad·ARCO | `layout.tsx` · mobile `perfil.tsx` | AlumnoMas (Cuenta) + footer free-tier | ✅ mapeada |
| Banner descarga de app | `layout.tsx` [web] | alumno-01 (sin pieza dedicada; promo app es opcional) | ❓ dudosa |
| Alerta reasignación de coach huérfano (org) | `layout.tsx` [web] | alumno-09 Team "Asignándote un coach" (holding pool) | ✅ mapeada |
| Toggle "Colores del coach" (preferencia alumno) | `client-root.actions.ts` `toggleClientBrandColors` [web] | alumno-01 ClientSettingsModal "Colores del Coach" (solo standalone) | ✅ mapeada |
| Sync colas offline (nutrición/workout) | `OfflineNutritionQueueSync` / `OfflineWorkoutQueueSync` · mobile auto-flush | alumno-02/07 colas offline (drenaje en layout `/c`) | ✅ mapeada |
| Gates suspended / force-password-change | proxy/layout · mobile `_layout.tsx` | alumno-09 (suspended, change-password; orden gates `/t`) | ✅ mapeada |
| **Dashboard:** racha (confetti 30d), saludo animado, fecha | `dashboard/_components/streak/StreakWidget`, `header/ClientGreeting` · mobile home | alumno-01 §StreakWidget + DashboardHeader | ✅ mapeada |
| Botón ajustes (gear) → ClientSettingsModal (tema, colores coach, alarma descanso, consent team) | `DashboardHeader.tsx` [web] | alumno-01 §ClientSettingsModal | ✅ mapeada |
| Pull-to-refresh | `DashboardPullToRefresh.tsx` · mobile | alumno-01 pull-to-refresh | ✅ mapeada |
| WeekCalendar 7d (done/dot/missed/active) | `calendar/WeekCalendar` · mobile | alumno-01 §WeekCalendar | ✅ mapeada |
| CheckInBanner (3 estados de aviso) | `checkin/CheckInBanner` · mobile | alumno-01 §CheckInBanner | ✅ mapeada |
| OrgAnnouncementBanner | `OrgAnnouncementBanner.tsx` [web] | alumno-01 §OrgAnnouncementBanner | ✅ mapeada |
| WelcomeModal (video/texto, mute, "no mostrar de nuevo") | `WelcomeModal.tsx` · mobile | alumno-01 §WelcomeModal (suprimido en team) | ✅ mapeada |
| WorkoutHeroCard (Empezar / Rápido / completado) + RestDayCard | `hero/WorkoutHeroCard`, `RestDayCard` · mobile | alumno-01 §HeroSection | ✅ mapeada |
| QuickLogSheet (+1 serie por ejercicio) | `hero/QuickLogSheet.tsx` [web] | alumno-01 §QuickLogSheet | ✅ mapeada |
| 3 anillos de compliance (entreno/nutri/check-in) | `compliance/ComplianceRing`, `ComplianceScoresCard` · mobile | alumno-01 §ComplianceScoresCard | ✅ mapeada |
| NutritionDailySummary + filas de comida toggle | `nutrition/NutritionDailySummary`, `MealCompletionRow` · mobile | alumno-01 §NutritionDailySummary | ✅ mapeada |
| Peso: widget, headline+flecha, sparkline 14d, **quick-log inline**, chart 30d | `weight/*` (`WeightQuickLog`, `WeightProgressChart`) · mobile sparkline | alumno-01 §WeightWidget + WeightFullChartSection | ✅ mapeada |
| HabitsTracker (acordeón agua/pasos/sueño/ayuno/suplementos) | `habits/HabitsTrackerWidget` · mobile | alumno-01 §HabitsTracker | ✅ mapeada |
| PersonalRecordsBanner | `records/PersonalRecordsBanner`, `PRBadge` · mobile | alumno-01 §PersonalRecordsBanner | ✅ mapeada |
| ActiveProgramSection + ProgramPhaseBar + grid de días | `program/*` · mobile | alumno-01 §ActiveProgramSection | ✅ mapeada |
| RecentWorkoutsSection ("ver historial →") | `history/RecentWorkoutsSection` · mobile | alumno-01 §RecentWorkouts | ✅ mapeada |
| **Nutrición:** DayNavigator (swipe, Hoy/Ayer, jump-to-today, dots) | `nutrition/_components/DayNavigator` · mobile | alumno-02 §DayNavigator | ✅ mapeada |
| AdherenceStrip 30d + NutritionStreakBanner | `AdherenceStrip`, `NutritionStreakBanner` · mobile | alumno-02 §AdherenceStrip / §racha | ✅ mapeada |
| MacroRingSummary (kcal + 3 macros) + MicrosPanel + PlatePanel | `MacroRingSummary`, `MicrosPanel`, `PlatePanel` · mobile (micros mínimo) | alumno-02 §MacroRingSummary/MicrosPanel/PlatePanel | ✅ mapeada |
| MealCard: toggle completar (optimista+offline), expandir, porción %, satisfacción | `MealCard.tsx` · mobile | alumno-02 §MealCard | ✅ mapeada |
| Favorito de alimento (corazón) | `MealIngredientRow.tsx` [web] | alumno-02 §MealIngredientRow (toggleClientFoodPreference) | ✅ mapeada |
| Swap / intercambio de alimento ("Aplicar") | `MealIngredientRow.tsx` [web] | alumno-02 "Opciones de cambio" (applyMealFoodSwap) | ✅ mapeada |
| Chips de intercambio + ExchangeEquivalencesSheet (Pro) | `ExchangeMealChips`, `ExchangeEquivalencesSheet` [web] | alumno-02 capa Pro `nutrition_exchanges` | ✅ mapeada |
| OffPlanLogger ("Registrar algo más") | `OffPlanLogger.tsx` [web] | alumno-02 §OffPlanLogger | ✅ mapeada |
| HabitsTracker nutrición + NotesThread (hilo con coach) | `HabitsTracker`, `NutritionShell`+NotesThread [web] | alumno-02 §HabitsTracker / §NotesThread | ✅ mapeada |
| "Indicaciones del coach" (acordeón) | nutrition shell · mobile acordeón explícito | alumno-02 §Indicaciones del coach | ✅ mapeada |
| ShoppingListView (check, alta/baja manual, compartir WA, copiar) | `ShoppingListView.tsx` [web] | alumno-02 §ShoppingListView | ✅ mapeada |
| RecipeIdeasSection + WeeklyRecapCard ("compartir mi semana") | `RecipeIdeasSection`, `WeeklyRecapCard` [web] | alumno-02 §RecipeIdeas / §WeeklyRecap | ✅ mapeada |
| WorkoutContextBanner (recordatorio hidratación/carbo) | `WorkoutContextBanner.tsx` · mobile | alumno-02 §WorkoutContextBanner | ✅ mapeada |
| Exportar nutrición (copiar detalle / resumen / PDF / Pauta PDF Pro) | `NutritionShell` `downloadNutritionDayPdf`/`downloadNutritionExchangePdf` · mobile WA only | alumno-02 §Exportar (PDF/WhatsApp) | ✅ mapeada |
| PushNotificationBanner ("activar recordatorios") | `PushNotificationBanner.tsx` [web] | alumno-02 §PushNotificationBanner | ✅ mapeada |
| Estados nutrición (domain-off, no-plan, offline/cache, día histórico read-only, section-flags) | `NutritionDomainOff`, `EmptyNutritionState`, `NutritionNoPlanFromServer` · mobile | alumno-02 estados + gates + offline | ✅ mapeada |
| **Rutina/Ejecución:** header progreso (N/M, %, Semana A/B) | `workout/[planId]/WorkoutExecutionClient` · mobile | alumno-07 §header pegajoso | ✅ mapeada |
| Secciones por área + superseries + scroll-a-siguiente + sesión anterior | `WorkoutExecutionClient.tsx` · mobile | alumno-07 §cuerpo por áreas | ✅ mapeada |
| LogSetForm polimórfico (fuerza/cardio/movilidad/roller) + RPE/RIR | `LogSetForm.tsx` · mobile (genérico kg/reps) | alumno-07 §LogSetForm / TypedLogHeader | ✅ mapeada |
| Timers: RestTimer (sonido/vibración/wake-lock), IntervalTimer, HoldTimer, Stopwatch (laps), settings/auto-timer | `RestTimer`/`IntervalTimer`/`HoldTimer`/`Stopwatch`/`WorkoutTimerSettingsPanel` · mobile (solo rest) | alumno-07 §temporizadores flotantes | ✅ mapeada |
| Modal técnica de ejercicio (video/GIF/MP4 + instrucciones) | `WorkoutExecutionClient` · mobile (link externo) | alumno-07 §Técnica del ejercicio | ✅ mapeada |
| Finalizar + WorkoutSummaryOverlay (PR Epley, confetti, volumen, compartir) | `WorkoutSummaryOverlay.tsx` · mobile WorkoutSummaryModal | alumno-07 §Resumen de sesión | ✅ mapeada |
| Cola offline de series + indicador | `LogSetForm`/`WorkoutExecutionClient` · mobile sync(N) | alumno-07 §offline | ✅ mapeada |
| Chip "Zona FC" enriquecido si módulo cardio ON | `WorkoutExecutionClient` (service-role acotado) | alumno-07 gate `cardio` | ✅ mapeada |
| **Historial:** lista días + toggle rango 90/180d + nota privacidad | `workout-history/WorkoutHistoryList` · mobile | alumno-08 §lista de días | ↪️ reubicada (entra desde "Más › Cuenta") |
| **Aprender:** buscador, chips músculo, grid (GIF/YT/MP4), infinite scroll 48, modal técnica on-demand | `exercises/ClientExerciseCatalog` · mobile | alumno-03 (catálogo read-only) | ✅ mapeada |
| **Check-in:** wizard 3 pasos (peso+energía / fotos WebP / notas+resumen), SuccessWaveOverlay, disclaimer | `check-in/CheckInForm` · mobile | alumno-04 §wizard | ✅ mapeada |
| **Movimiento (read-only):** AssessmentReportCard (semáforo, X/21, 7 patrones) + EvolutionCharts | `movimiento/page.tsx` StudentMovementView [web] · **mobile: NO existe** | alumno-05 (`/movimiento`, gate `movement_assessment`) | ✅ mapeada (deuda paridad mobile) |
| **Composición (read-only):** switcher BIA/ISAK, summaries count-up, tendencias | `bodycomp/page.tsx` StudentBodyCompositionView [web] · **mobile: NO existe** | alumno-06 (`/bodycomp`, gate `body_composition`) | ✅ mapeada (deuda paridad mobile) |
| **Acceso:** login brandeado, change-password, onboarding 3 pasos (bio/metas/salud+edad), suspended (WA + logout), join/[code] | `login`/`change-password`/`onboarding`/`suspended` · mobile equivalentes | alumno-09 §Acceso y Onboarding | ✅ mapeada |
| Borrador de onboarding en localStorage | `onboarding/OnboardingForm.tsx` [web] | alumno-09 §borrador local | ✅ mapeada |
| **Mobile · entrada por código de invitación** (typear código → resolver coach) | mobile `alumno/codigo.tsx` [mobile] | alumno-09 cubre `/join/[code]` (alta), no la pantalla "ingresá tu código para encontrar a tu coach" | ❓ dudosa |
| **Mobile · Perfil:** hero + info coach | mobile `perfil.tsx` | AlumnoMas hero (nombre, "Coach: …", badge programa) | ↪️ reubicada |
| Mobile · Perfil: info de cuenta (teléfono, peso objetivo, inicio suscripción) | mobile `perfil.tsx` | AlumnoMas (no muestra estos campos explícitos) | ❓ dudosa |
| Mobile · Perfil: cambiar contraseña + logout + tema | mobile `perfil.tsx` | AlumnoMas (Cuenta: Estados de acceso, Cerrar sesión; Apariencia: tema) | ✅ mapeada |
| Mobile · Perfil: **bloqueo biométrico (Face ID / huella)** | mobile `perfil.tsx` `biometric-lock-toggle` [mobile] | — sin pieza equivalente en AlumnoMas ni en ningún doc alumno | ⚠️ **ORFANA** |

---

## Tabla 2 — COACH  (`/coach/*`, mobile `app/coach/*`)

| Función actual | Dónde está hoy (web / mobile) | Dónde va en el diseño nuevo | Estado |
|---|---|---|---|
| **Nav / shell:** registro Inicio/Alumnos/Programas/Nutrición/Opciones + grupo Módulos (Cardio/Movimiento) | `components/coach/CoachSidebar` + `coach-nav.ts` · mobile `CoachMobileChrome` (10 tabs) | coach-01..12 nav 5 + "MÓDULOS"; mobile colapsa a 4 + **"Más"** | ↪️ reubicada |
| Colapso nav → solo "Reactivar" si suscripción bloqueada | `CoachSidebar` `SUBSCRIPTION_BLOCKED_STATUSES` | coach-09/README ("suscripción bloqueada → menú colapsa a Reactivar") | ✅ mapeada |
| SidebarCollapse, ThemeToggle, SignOut | `CoachSidebar` · mobile | coach-08 Opciones (tema, hero identidad) + nav SignOut | ✅ mapeada |
| WorkspaceSwitcher (multi-workspace) | `CoachSidebar` WorkspaceSwitcher | coach-12 §`/workspace/select` | ✅ mapeada |
| Link "Panel empresa" (org owner/admin) | `CoachSidebar` [web] | — enterprise/`/org` declarado **fuera de scope** del diseño | ❓ dudosa |
| **NewsBellButton** (campana de novedades, items markdown, unread, pin/CTA) | `NewsBellButton.tsx` + `news-actions.ts` · mobile | — ningún doc coach (01-12) tiene superficie de novedades | ⚠️ **ORFANA** |
| PublicCodeRequiredModal (coach legacy confirma su invite_code) | `_components/PublicCodeRequiredModal` + `public-code.actions` | coach-08 §Compartir (invite_code) cubre el código, no el modal forzado de migración | ❓ dudosa |
| ModuleOffNotice (gate por URL de 4 módulos → catálogo) | `components/coach/ModuleOffNotice` | coach-05/06/07/08 → CTA a `/coach/settings/modules` | ✅ mapeada |
| **Dashboard:** BillingBanners (blocked/grace/trial) | `dashboard/_components/banners/BillingBanners` · mobile | coach-01 §BillingBanners | ✅ mapeada |
| FreeTierBanner + TeamsBridgeBanner (elite≥80) | dashboard inline · mobile (umbral ≥48, *drift*) | coach-01 §FreeTierBanner / §TeamsBridgeBanner | ✅ mapeada |
| GreetingHeader + QuickActionsBar (+Alumno/+Programa/+Nutrición/+Pago) | `header/GreetingHeader`, `header/QuickActionsBar` · mobile | coach-01 §GreetingHeader / §QuickActionsBar | ✅ mapeada |
| CoachOnboardingChecklist (4 pasos, confetti, NutritionTierBlock) + sub-widgets | `dashboard/CoachOnboardingChecklist` + `onboarding/*` · mobile | coach-01 §CoachOnboardingChecklist | ✅ mapeada |
| KpiStrip (Ingresos+delta / Activos / Riesgo / Adherencia) | `kpi/KpiStrip`, `KpiTile` · mobile | coach-01 §KpiStrip | ✅ mapeada |
| FocusList (War Room), NextBestAction, TodayAgenda, ExpiringPrograms, ActivityFeed, DashboardCharts | `focus/`,`cs/NextBestAction`,`today/`,`expiring/`,`activity/`,DashboardCharts · mobile | coach-01 §FocusList…§DashboardCharts | ✅ mapeada |
| RevenueSheet, ClientStatsSheet, QuickAddPaymentModal, FreeWelcomeModal, AppOnlyBadge | `sheets/`,`payments/QuickAddPaymentModal`,`FreeWelcomeModal` · mobile | coach-01 §modales/sheets | ✅ mapeada |
| **Alumnos · War Room:** sync, copiar URL portal, Nuevo Alumno, 6 stat cards, banners triage | `clients/CoachWarRoom`, `DirectoryActionBar` · mobile | coach-02 §War Room | ✅ mapeada |
| Buscador ⌘K, filtros (estado/riesgo/programa), orden, toggle grilla/tabla, chips | `DirectoryActionBar` · mobile | coach-02 §Action Bar | ✅ mapeada |
| Tabla virtualizada + grilla (ClientCardV2) + estados vacíos | `ClientsDirectoryTable`, `ClientsDirectoryClient`, `ClientsDirectoryEmpty` · mobile | coach-02 §Tabla/§Grilla | ✅ mapeada |
| Mutaciones alumno: crear (gate cupo), editar, pausar/reactivar, archivar, eliminar, reset-pwd | `clients/_actions/clients.actions` + modales · mobile | coach-02 §modales/wizards | ✅ mapeada |
| Importar CSV (wizard 4 pasos, consent Ley 19.628/21.719) | `clients/import/ImportWizard` [web] · mobile (FAB básico) | coach-02 §Import wizard (gate `canImportClients`) | ✅ mapeada |
| **Ficha:** hero + 5 chips + ModuleLinksRow + ExportPdfLink + FAB | `clients/[clientId]/ClientProfileHero`, `ProfileFloatingActions` · mobile | coach-02 §Ficha hero + ModuleLinksRow | ✅ mapeada |
| ProfileTabNav 6 tabs (Overview/Progreso/Análisis/Plan/Nutrición/Facturación) | `clients/[clientId]/ProfileTabNav` · mobile | coach-02 §Tabs (6) | ✅ mapeada |
| Overview: TopAlertBanner, 3 anillos+5 KPIs, program summary, **check-in snapshot + "Marcar revisado"**, fotos, Editar Biometría | `ProfileOverviewB3`, `ProfileCheckInSnapshot` (`markCheckInReviewed`) · mobile | coach-02 §Overview | ✅ mapeada |
| Progreso: peso+proyección, comparativa fotos, peso-objetivo inline, 7 pills de gráficos | `ProgressBodyCompositionB6` · mobile | coach-02 §Progreso | ✅ mapeada |
| Análisis: 1RM Epley, balance muscular, tonelaje, historial DayNavigator read-only | `TrainingTabB4Panels`, `TrainingStrengthCards` · mobile | coach-02 §Análisis | ✅ mapeada |
| Plan: programa activo (A/B, fases), microciclo, sheet detalle ejercicio, "editar en builder" | `ProgramTabB7` · mobile | coach-02 §Plan | ✅ mapeada |
| Nutrición ficha 3 zonas: progreso / plan (editar, ver-como-alumno, **copiar a otro alumno**, comidas) / alertas | `NutritionTabB5`, `duplicatePlanToClient` · mobile | coach-02 §Nutrición (Zona A/B/C) | ✅ mapeada |
| Zona C: ClientFeaturePrefsPanel, alertas, restricciones alimentarias, hilo notas (reply coach), editor micro-umbrales, nota privada, **ciclo de dieta + historial-restore**, hábitos | `ClientFoodRestrictionsCard`, `CoachNutrientTargetsEditor`, `CoachPrivateNotesPanel`, `NutritionCycleHistorySection` [web] · mobile (huecos) | coach-02 §Nutrición Zona C | ✅ mapeada (deuda paridad mobile) |
| Facturación: KPIs + alta/baja pago + timeline (recibo) | `BillingTabB8`, `addPayment`/`deletePayment` · mobile | coach-02 §Facturación | ✅ mapeada |
| **Composición corporal (ficha):** BIA (11 métricas) / ISAK (wizard 4 pasos, ecuaciones, computeIsak), tendencias, borrar | `clients/[clientId]/bodycomp/*` [web] · mobile NO | coach-07 (`/coach/clients/[id]/bodycomp`) | ✅ mapeada (deuda paridad mobile) |
| **Progress-print** (HTML imprimible auto-print) | `clients/[clientId]/progress-print` [web] | coach-02 §Exportar PDF / `window.print()` | ✅ mapeada |
| **Programas · Biblioteca:** header (Nueva plantilla, Lista de ejercicios, Áreas), toolbar, ProgramRow (Asignar/Preview/Duplicar/Sincronizar/Editar/Eliminar), DetailPanel | `workout-programs/*` · mobile | coach-03 §Biblioteca | ✅ mapeada |
| Asignar programa (multi-cliente, modo inicio, duración, días, overwrite) | `AssignToClientsDialog` / `assignProgramToClientsAction` · mobile | coach-03 §Asignar | ✅ mapeada |
| **Builder:** toolbar (Plantillas/Preview/Asignar/Balance/Imprimir/Undo-Redo/Tour/Config/Sync/Save) | `builder/[clientId]/WeeklyPlanBuilder` · mobile `program-builder` | coach-03 §Builder header | ✅ mapeada |
| Builder mecánica: DnD catálogo→día/área, superseries A/B, áreas custom, override Base/Modif, copiar día, descanso, A/B mode, borrador local | `builder/[clientId]/*` · mobile (áreas fijas) | coach-03 §DayColumn/§A-B | ✅ mapeada |
| BlockEditSheet polimórfico (Fuerza/Cardio zonas FC+intervalos/Movilidad/Roller) | `components/BlockEditSheet` · mobile | coach-03 §BlockEditSheet | ✅ mapeada |
| ProgramConfigHeader (estructura semanal/ciclo, duración, fases editor) | `components/ProgramConfigHeader` · mobile | coach-03 §ProgramConfig | ✅ mapeada |
| MuscleBalancePanel, PrintProgramDialog, BuilderOnboardingTour, TemplatePickerDialog | `components/*` · mobile | coach-03 §modales | ✅ mapeada |
| EditedByBadge + detección de conflicto (team) | `WeeklyPlanBuilder` / `saveWorkoutProgramAction` | coach-03 §team (conflict + "editado por") | ✅ mapeada |
| **Ejercicios (catálogo):** buscador, filtros, toggles personalizados/con-video, crear ejercicio (recorte video), preview, clonar sistema→propio | `exercises/ExerciseCatalogClient`, `ExerciseFormModal`, `ExerciseMediaPicker` · mobile | coach-03 §Catálogo + §ExerciseFormModal | ↪️ reubicada (ya no es tab; botón dentro de Programas) |
| **Áreas del builder** (CRUD, system read-only, ejercicios→Principal, gate team) | `settings/areas/AreasManager` [web] · mobile NO | coach-03/coach-08 (`/coach/settings/areas`, link desde Biblioteca/builder) | ↪️ reubicada (fuera de nav y fuera del hub Opciones) |
| **Nutrición hub:** 4 tabs (Plantillas/Alumnos board SYNCED-CUSTOM/Alimentos/Recetas) + stats + Guía rápida | `nutrition-plans/NutritionHub` · mobile (3 tabs, sin Recetas) | coach-04 §Hub 4 tabs | ✅ mapeada |
| Plantillas: editar/duplicar/eliminar/asignar/ver; NutritionOnboarding | `TemplateLibrary`, `AssignModal`, `NutritionOnboarding` · mobile | coach-04 §Tab Plantillas | ✅ mapeada |
| Alumnos board: gestionar/quitar plan, "sin plan" → asignar draft | `ActivePlansBoard` · mobile | coach-04 §Tab Alumnos | ✅ mapeada |
| Alimentos: buscar/orden/scope, categorías, nuevo alimento (medida casera), borrar+undo | `FoodLibrary` + `/coach/foods` (`AddFoodSheet`, `FoodBrowser`) · mobile `foods` | coach-04 §Tab Alimentos | ✅ mapeada |
| Recetas (sistema NUEVO base): nueva (imagen WebP), compartir, editar, eliminar | `nutrition-plans/_components/recipes/*` [web] · mobile NO | coach-04 §Tab Recetas | ✅ mapeada (deuda paridad mobile) |
| **PlanBuilder:** add/reorder comidas, día-de-semana por comida, notas, add alimento (FoodSearchDrawer + alérgenos), cantidades, swap; MacroCalculator | `PlanBuilder/*`, `FoodSearchDrawer` · mobile `nutrition-builder` | coach-04 §PlanBuilder + §FoodSearchDrawer | ✅ mapeada |
| PlanBuilderSidebar: metas, auto-sync, macros Mifflin-St Jeor; **panel PRO bodycomp** (Katch-McArdle/Cunningham) | `PlanBuilderSidebar` [web] | coach-04 §ExchangeModePanel sidebar "Objetivos por composición" (gate `body_composition`) | ✅ mapeada |
| **Nutrición Pro (client-plan):** ExchangeModePanel (gramos↔porciones), ExchangeTargetsEditor, variantes de día, PDF branded | `PlanBuilder/ExchangeModePanel`, `ExchangeTargetsEditor`, `exchange.actions` [web] · mobile NO | coach-04 §ExchangeModePanel (gate `nutrition_exchanges`) | ✅ mapeada (deuda paridad mobile) |
| **Grupos de Alimentos** (saved_meals: crear grupo, items+cantidades, totales) | `meal-groups/MealGroupLibraryClient`, `MealGroupModal` [web] | — el hub coach-04 tiene 4 tabs (Plantillas/Alumnos/Alimentos/Recetas); **no hay tab "Grupos"** (el README IA lo menciona, la pantalla no) | ⚠️ **ORFANA** |
| Recetas sistema LEGACY (`/coach/recipes` Edamam) | `recipes/*` (redirige a `/coach/foods`) | coach-04 (sistema viejo ya redirige; no se preserva — dead code) | ✅ mapeada (deprecación intencional) |
| OrgTemplatesSection (plantillas nutrición enterprise) | `nutrition-plans/_components/OrgTemplatesSection` [web] | — enterprise fuera de scope del diseño | ❓ dudosa |
| **Cardio (módulo):** calculadora zonas FC, calculadora pace, galería intervalos, editor perfil alumno | `cardio/CardioToolsClient`, `cardio/[clientId]/CardioProfileForm` [web] · mobile NO | coach-05 (`/coach/cardio`, gate `cardio`) | ✅ mapeada (deuda paridad mobile) |
| **Movimiento (módulo):** hub semáforo, reporte+evolución+historial+borrar, wizard 8 pasos, print branded | `movement/*` [web] · mobile NO | coach-06 (`/coach/movement`, gate `movement_assessment`) | ✅ mapeada (deuda paridad mobile) |
| **Opciones (hub):** launcher Marca / Suscripción / Módulos / Funciones + DangerZone; variantes free-upsell y team | `settings/page.tsx` · mobile (split Mi Marca + Perfil) | coach-08 §Hub 3 variantes | ↪️ reubicada (10 tabs mobile → "Opciones") |
| Mi Marca (Brand Studio): logo, BrandScore, identidad+welcome modal, color+WCAG, **branding avanzado Pro**, loader, compartir QR/código, preview en vivo, tour, FAB guardar | `settings/brand` (`LogoUploadForm`,`BrandSettingsForm`,`BrandAdvancedSection`,`BrandThemePreview`,`BrandSettingsTour`) · mobile (sin avanzado) | coach-08 §Mi Marca | ✅ mapeada |
| Módulos (catálogo read-only $9.990 ×4) | `settings/modules/ModulesForm` [web] | coach-08 §Módulos | ✅ mapeada |
| Funciones (presets + master switch + secciones Base/Pro LOCKED) | `settings/funciones/FeaturePrefsPanel` [web] | coach-08 §Funciones | ✅ mapeada |
| DangerZone (eliminar cuenta, type ELIMINAR, Ley 21.719) | `settings/_components/DangerZone` [web] · mobile mailto | coach-08 §Zona de peligro | ✅ mapeada |
| `/coach/settings/preview` (redirect → brand) | `settings/preview/page.tsx` | coach-08 (redirect histórico) | ✅ mapeada |
| **Suscripción:** cupón SERNAC, plan actual+breakdown, add-ons (agregar/quitar prorrateado), cambiar plan (combo módulos), historial, cancelar | `subscription/page.tsx`, `CouponRedeemCard` [web] · mobile read-only | coach-09 §Suscripción | ✅ mapeada |
| Cambiar tarjeta (MP Secure Fields) + processing/upgrade/addon pollers + reactivate | `subscription/update-card`, `processing`, `reactivate/*` [web] | coach-09 §update-card/§processing/§reactivate | ✅ mapeada |
| **Equipo (Teams):** hero cupos/alumnos/módulos, TeamBrandStudio, TeamMembersManager (agregar/rol/co-gestor/transferir/sacar), TeamShareLink | `team/*` [web] · mobile NO | coach-10 (`/coach/team`, solo coach_team) | ✅ mapeada (deuda paridad mobile) |
| **Soporte:** form (tipo help/bug/idea, asunto, prioridad, descripción, adjunto Storage, rate-limit) | `support/SupportForm` [web] · mobile mailto+FAQ | coach-11 §formulario | ✅ mapeada (mobile debe adoptar form) |
| **Acceso coach:** login (CAPTCHA 3 fallos, Google), registro wizard 3 pasos (+add-ons), forgot, reset, verify-email, onboarding/complete (post-Google), workspace/select | `coach/onboarding/complete`, `/login`,`/register`… · mobile auth | coach-12 §Acceso y Onboarding | ✅ mapeada |
| **Mobile · tab Check-ins** (visor read-only de check-ins entre alumnos) | mobile `coach/(tabs)/check-ins.tsx` [mobile] | coach-01 ActivityFeed + coach-02 ficha (check-in snapshot + marcar revisado); **no hay bandeja/inbox dedicada** | ❓ dudosa |
| **Mobile · Perfil:** info cuenta/org/suscripción, alumnos count, "Mis alimentos", cambiar contraseña, logout | mobile `coach/(tabs)/perfil.tsx` | coach-08 Opciones (hero identidad) + coach-12 acceso | ✅ mapeada |
| **Mobile · toggle push notifications coach** | mobile `coach/(tabs)/perfil.tsx` `push-toggle` [mobile] | — ningún doc coach tiene ajuste de push del coach | ⚠️ **ORFANA** |

---

## ⚠️ ORFANAS / DUDOSAS — requieren decisión

### ORFANAS (sin hogar en el diseño nuevo)

1. **⚠️ Campana de novedades del coach (NewsBellButton)** — `apps/web/.../components/coach/NewsBellButton.tsx` + `coach/_actions/news-actions.ts` + `NewsFeedProvider`. Feed de novedades/anuncios (items markdown, unread badge, pin, CTA, imagen). **Ningún** doc coach-01..12 contempla una superficie de novedades. → Decidir: ¿se incorpora al dashboard (coach-01) o a Opciones, o se discontinúa?
2. **⚠️ Grupos de Alimentos / saved_meals (meal-groups)** — `apps/web/.../coach/meal-groups/*`. CRUD de "grupos de alimentos" reutilizables en el builder. El README IA del diseño los lista ("Plantillas · … · Alimentos · **Grupos** · Recetas"), pero el doc-autoridad coach-04 define el hub con **4 tabs sin Grupos**. → Decidir: agregar 5ª tab "Grupos" al hub de Nutrición, o confirmar deprecación.
3. **⚠️ Bloqueo biométrico del alumno (Face ID / huella)** — mobile `apps/mobile/app/alumno/(tabs)/perfil.tsx` `biometric-lock-toggle`. Seguridad de app nativa; AlumnoMas (Más) no tiene equivalente y ningún doc alumno lo menciona. → Decidir: agregar a "Más › Cuenta" (mobile) o discontinuar.
4. **⚠️ Toggle de notificaciones push del coach** — mobile `apps/mobile/app/coach/(tabs)/perfil.tsx` `push-toggle`. Sin ajuste de push del coach en coach-08 Opciones ni en otro doc. → Decidir: agregar a Opciones (mobile/web) o discontinuar.

### DUDOSAS (hogar parcial o ambiguo)

5. **❓ Tab "Check-ins" del coach (mobile)** — `coach/(tabs)/check-ins.tsx`: lista read-only de check-ins recientes entre alumnos. En el diseño la revisión de check-ins se reparte (dashboard ActivityFeed + ficha snapshot + "marcar revisado"), pero **no hay una bandeja/inbox transversal**. → Confirmar si se acepta la distribución o se necesita un inbox de check-ins.
6. **❓ Entrada por código de invitación (mobile alumno)** — `alumno/codigo.tsx`: pantalla para typear el código y resolver al coach. alumno-09 cubre `/join/[code]` (alta), no la pantalla de "ingresá tu código para encontrar tu app". → Confirmar dónde vive el primer contacto sin URL/QR.
7. **❓ Info de cuenta del alumno (mobile)** — teléfono, peso objetivo, fecha de inicio de suscripción en `alumno/perfil.tsx`. AlumnoMas muestra hero + stats (entrenos/racha) pero no estos campos. → Confirmar si se preservan en "Más".
8. **❓ "Panel empresa" + WorkspaceSwitcher hacia `/org`** — `CoachSidebar`. Enterprise/`/org`/`/admin` están **fuera de scope** del diseño. El selector de workspace coach existe (coach-12), pero el salto a panel empresa no tiene pantalla en el diseño. → Confirmar (probablemente intencional: enterprise archivado).
9. **❓ OrgTemplatesSection (plantillas nutrición enterprise)** — `nutrition-plans/_components/OrgTemplatesSection`. Misma razón: enterprise fuera de scope. → Confirmar deprecación o fold-in.
10. **❓ PublicCodeRequiredModal (migración invite_code legacy)** — modal forzado para coaches viejos sin código confirmado. coach-08 cubre el código de invitación pero no este flujo transicional. → Confirmar si sigue siendo necesario.
11. **❓ Banner de descarga de app (alumno web)** — `c/[coach_slug]/layout.tsx`. Promo de instalación PWA/app; no hay pieza dedicada en alumno-01..09. → Confirmar si se conserva como banner suelto.

> **Nota — deuda de paridad mobile (NO orfandad):** estas funciones existen hoy solo en web pero el diseño nuevo declara RN ≡ web responsive, así que su hogar de diseño existe; lo que falta es construirlas en mobile. Lista (no exhaustiva): módulos Cardio / Movimiento / Composición (0% mobile), Nutrición Pro (intercambios/porciones/variantes/PDF), objetivos PRO bodycomp, Equipo (Brand Studio/Members), import CSV, Recetas, settings Módulos/Funciones, branding avanzado, restricciones-alimentarias/nutrient-targets/notas-privadas/ciclo en ficha, flujos de dinero (add-ons/cambio-plan/cancelar/cupones/cambio-tarjeta/reactivate), eliminar cuenta, y del lado alumno: off-plan logger, lista de compras, recetas-idea, recap semanal, swap/intercambios, push opt-in, quick-log de peso. Soporte en mobile hoy es mailto+FAQ; el diseño pide el formulario.

---

## Reubicaciones notables (movimientos de IA deliberados del diseño)

1. **Navbar coach 10 → 5 tabs.** Hoy mobile tiene 10 tabs (`coach/(tabs)/_layout.tsx`: Dashboard, Alumnos, Programas, Ejercicios, Nutrición, Mi Marca, Suscripción, Soporte, Check-ins, Mi cuenta). El diseño los colapsa a **Inicio · Alumnos · Programas · Nutrición · Opciones** + un menú **"Más"** que agrupa Opciones/Soporte/Equipo/módulos. (`readme.md` IA + `CoachSidebar` split-nav.)
2. **Navbar alumno 6 → 5 tabs + "Más".** Hoy mobile tiene 6 tabs (Inicio, Nutrición, Aprender, Check-in, **Historial, Perfil**). El diseño deja 4 base (Inicio/Plan/Aprender/Check-in) + **"Más" (AlumnoMas)** que absorbe **Historial, Perfil, Movimiento, Composición, Notificaciones, Ayuda, Cerrar sesión, Eliminar cuenta** y el tema. (`ui_kits/eva-app/screens/alumno.jsx` §AlumnoMas + `mobile/.../(tabs)/_layout.tsx`.)
3. **Hub/Launcher de Módulos del coach ("Herramientas").** El diseño introduce `coach-modules-hub.jsx` ("Herramientas") **bajo la tab Alumnos** (no es 6º tab): el coach **usa** los módulos que compró (Cardio / Movimiento / Composición / Nutrición Pro) eligiendo módulo→alumno (ModulePickStudent, single-select). **Comprar ≠ usar:** el catálogo de **compra** queda en Opciones › Módulos. Hoy esas funciones viven como rutas top-level dispersas (`/coach/cardio`, `/coach/movement`, `/coach/clients/[id]/bodycomp`) y como `ModuleLinksRow` en la ficha.
4. **"Ejercicios" y "Áreas del builder" salen del nav.** Ya no son ítems de menú: se llegan con botones dentro de la Biblioteca de Programas (coach-03). "Áreas" además sale del hub Opciones (antes en `/coach/settings` → ahora linkeado desde el builder). Las rutas siguen vivas para deep-links y la app del alumno.
5. **"Soporte" pasa a ítem propio, fuera de Opciones.** README IA: "Soporte — contacto (ítem propio, fuera de Opciones)"; en mobile va agrupado bajo "Más".
6. **"Mi Marca" y "Suscripción" desaparecen en contexto Team.** En `team_managed` la marca se edita en el **Brand Studio dentro de `/coach/team`** (coach-10) y no hay tarjeta de Suscripción (gestionado por el equipo). El hub Opciones team muestra Mi Equipo / Módulos del equipo / Funciones del equipo.
7. **Composición corporal = ruta independiente.** Separada de la tab "Progreso" de la ficha hacia `/coach/clients/[id]/bodycomp` (coach-07); el peso sigue en check_ins/Progreso.
8. **Recetas: del menú/sistema viejo al tab del hub.** `/coach/recipes` (Edamam legacy) redirige a `/coach/foods`; el sistema nuevo de recetas vive como **tab "Recetas"** del hub de Nutrición (coach-04).
9. **Catálogo de Módulos único.** `/coach/settings/modules` es el catálogo canónico read-only ($9.990), destino de todos los CTA `ModuleOffNotice` y del link "Módulos" del Equipo.
10. **Movimiento / Composición del alumno → bajo "Más › Módulos".** En el UI-kit (`AlumnoMas`) los módulos read-only del alumno se agrupan en "Más"; los docs-autoridad alumno-05/06 los describen además como tabs condicionales por entitlement. (Tope de bottom-bar = 6 ítems: 4 base + movimiento + composición.) Esta es la "mini-menú de módulos del alumno" que el rediseño reorganiza.

> **Tensión a resolver (autoridad vs UI-kit):** para el alumno, los docs `menus_md` (alumno-05/06) describen Movimiento/Composición como **tabs condicionales** del nav, mientras el UI-kit (`AlumnoMas`) los pone bajo **"Más › Módulos"**. Ambos son hogares válidos (ninguna función queda orfana), pero conviene fijar uno antes de construir.
