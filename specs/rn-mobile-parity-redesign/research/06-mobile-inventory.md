# Inventario completo de apps/mobile (estado actual)

Fecha: 2026-07-08. Autor: subagente de investigacion (solo lectura).
Base: `apps/mobile` (Expo SDK 54, RN 0.81.5, expo-router v6, NativeWind 4.2.4, React 19.1).
Ruta raiz absoluta: `D:/Proyectos/Antigravity/gymappjp/apps/mobile`.

Todas las rutas de este informe son relativas a `apps/mobile/` salvo indicacion contraria.

---

## 0. Hallazgo transversal mas importante: DOS lenguajes visuales coexisten

El proyecto tiene un sistema de tokens EVA DS bien montado (`tailwind.config.js` con toda la rampa
ink/sport/ember/aqua + superficies/textos/bordes semanticos, fuentes Archivo/Hanken/JetBrains), PERO
la migracion visual esta a MEDIAS. Conviven dos patrones de estilado:

- **Patron A (EVA DS, nuevo):** clases NativeWind (`className="font-display-black text-strong bg-cta-fill ..."`),
  primitivas `Button`/`Card`/`Badge` que compilan clases DS estaticas, fuentes Archivo/Hanken/JetBrains.
  Ejemplos migrados: `app/alumno/(tabs)/home.tsx` (36 usos de className, totalmente re-skineada),
  `app/alumno/(tabs)/perfil.tsx` (14), `app/coach/(tabs)/ejercicios.tsx` (15), toda la carpeta `(auth)`,
  `codigo.tsx`, `onboarding.tsx`, `suspended.tsx`, `change-password.tsx`, y el coach dashboard via
  `components/coach/CoachDashboardSections.tsx` (87 usos de className).
- **Patron B (legacy, objeto `theme` + StyleSheet):** el componente llama `const { theme } = useTheme()`
  y pinta con `style={{ color: theme.foreground, backgroundColor: theme.card }}` + `StyleSheet.create`,
  con fuentes literales `Inter_*` / `Montserrat_*`. Este objeto `theme` vive en `lib/theme.ts`
  (dark/lightTheme) y NO usa las clases DS. La mayoria de las pantallas del coach y varias del alumno
  siguen en este patron: `app/index.tsx` (selector de rol, Montserrat), workout executor
  `app/alumno/workout/[planId].tsx` (constantes hex literales `INK_950`, `FONT_MONO`), `check-in.tsx`,
  `exercises.tsx`, `history.tsx`, `workout.tsx` (alumno); y `builder.tsx`, `clientes.tsx`, `nutricion.tsx`,
  `settings.tsx`, `subscription.tsx`, `support.tsx`, `check-ins.tsx`, `perfil.tsx`, `program-builder.tsx`,
  `nutrition-builder.tsx`, `foods.tsx`, `brand-preview.tsx`, `cliente/[clientId].tsx` (coach).

Matiz importante: incluso pantallas "modernas" mezclan A y B. `home.tsx` (alumno) usa clases DS para
tipografia/superficies pero sigue leyendo `theme.primary`, `theme.border`, `theme.cyan`, `theme.success`
para colores dinamicos y define constantes hex fijas (`EMBER_500='#FF6A3D'`, etc.). El white-label del
acento se resuelve por dos vias en paralelo: (1) objeto `theme` mutado por `applyCoachBranding()`, y (2)
CSS vars inyectadas por `brandVars()` en un `<View style={vars(...)}>` en `ThemeContext`. Ambas alimentadas
por `@eva/brand-kit`.

Conclusion para el plan: el re-skin no parte de cero; parte de un estado heterogeneo donde hay que (a)
unificar todo hacia el patron A, (b) matar el objeto `theme` legacy o reducirlo a un shim que devuelva
tokens DS, y (c) reemplazar literales hex por clases/tokens.

---

## (A) PANTALLAS — `apps/mobile/app/`

Estructura expo-router (file-based). `app/_layout.tsx` es la raiz. Grupos: `(auth)` (stack), `alumno/(tabs)`,
`coach/(tabs)`, mas pantallas sueltas fuera de tabs.

### Raiz / arranque

- **`app/_layout.tsx`** (217 L, patron: sin estilado propio). RootLayout: carga fuentes (Inter+Montserrat
  legacy Y Archivo/Hanken/JetBrains DS — ambos sets), monta `GestureHandlerRootView` >
  `SafeAreaProvider` > `BottomSheetModalProvider` > `ThemeProvider`. Maneja: splash (`EvaSplash`),
  `AppErrorBoundary` global (exportado como `ErrorBoundary` de expo-router), deep-links (parseo de hash
  `access_token`/`refresh_token`/`type=recovery` -> `supabase.auth.setSession` -> `/(auth)/reset-password`),
  listener de tap de notificaciones (`data.screen` -> `router.push`), gate de sesion (redirige a `/` si no
  hay sesion en zonas protegidas `coach` y `alumno` salvo `alumno/codigo`), sync de push token 1x por sesion,
  y bloqueo biometrico opt-in (`BiometricLock` al volver de background). Datos: `supabase.auth` (getSession,
  onAuthStateChange), `lib/push`, `lib/biometric`.

- **`app/index.tsx`** (153 L, patron B legacy — Montserrat_800ExtraBold, StyleSheet). Selector de rol
  ("Soy coach" / "Soy alumno"). Auto-login: si hay sesion persistida resuelve `getCoachProfile()` y hace
  `router.replace('/coach/home' | '/alumno/home')`. Visual: wordmark E-V-A con colores hardcodeados
  (`#8B5CF6`/`#06B6D4`/`#10B981` — NO son tokens DS), tagline, dos RoleCard con MotiView. Componentes:
  `AppBackground`, `EvaLoaderScreen`, RoleCard local. Datos: `lib/coach` (`getCoachProfile`), supabase.auth.
  **ESTA PANTALLA ES EL EJEMPLO MAS CLARO DE VISUAL VIEJO.**

- **`app/+native-intent.ts`** — `redirectSystemPath()` (corre fuera de React, nativo). Mapea universal
  links entrantes: `/c/<slug>` y `/invite/<code>` -> resuelve branding con `fetchBrandingByCoachIdentifier`
  (cachea en AsyncStorage) -> `/(auth)/login?role=alumno`. `/reset-password` ya mapea solo. No hay ruta
  espejo `/c/[slug]` en la app (decision: el alumno entra por login brandeado).

- **`app/change-password.tsx`** (104 L, patron A — 6 className). Cambio de clave forzado
  (`force_password_change`). Datos: supabase.auth, `lib/session-flags` (marca `pwChanged` para no re-forzar).

### Grupo `(auth)` — Stack sin header

- **`(auth)/_layout.tsx`** (5 L) — `<Stack screenOptions={{ headerShown:false }} />`.
- **`(auth)/login.tsx`** (208 L, patron A — 11 className, usa `Button`/`Card`/`Input`). Login con
  `role=coach|alumno` (query param). Valida con `LoginSchema` de `@eva/schemas`. `signInWithPassword`.
  Recuerda email en AsyncStorage (`eva_remember_email`), guarda `eva_user_role`. Traduce errores con
  `lib/auth-errors`. Icons lucide, LinearGradient. NO hay boton de Google (login Google es web-only por
  ahora en mobile). Datos: supabase.auth.
- **`(auth)/register.tsx`** (246 L, patron A — 13 className). Registro coach free. Usa `@eva/schemas` +
  `lib/api` (`registerCoachFree` -> `POST /api/mobile/auth/register-coach-free`).
- **`(auth)/forgot-password.tsx`** (139 L, patron A — 6 className). `resetPasswordForEmail`. Datos:
  supabase.auth.
- **`(auth)/reset-password.tsx`** (203 L, patron A — 6 className). Setea nueva clave tras deep-link
  recovery. Datos: supabase.auth.

### Alumno — `app/alumno/`

- **`alumno/(tabs)/_layout.tsx`** (67 L). Tabs con `tabBar={AlumnoMobileChrome}`. Gate de acceso a nivel
  navegacion: `getClientProfile()` -> si `blocked` va a `/alumno/suspended`, si `forcePasswordChange` va a
  `/change-password`. Flush de colas offline (`flushLogQueue`, `flushNutritionQueue`) al volver de
  background. Registra 7 screens; `workout` con `href:null` (se accede desde hero del home). Orden UI:
  Inicio, Nutricion(->"Plan"), Aprender(exercises), Check-in + "Mas" (Historial, Perfil).

- **`alumno/(tabs)/home.tsx`** (913 L, patron A — 36 className, RE-SKINEADA COMPLETA). Dashboard del
  alumno. Secciones: StreakRibbon (racha, ember fijo), CheckInBanner variant-aware, HERO (WorkoutHero
  inverse / RestHero sunken / NoPlanHero), coach card, "Momentum" (WeekStrip + 3 ComplianceItem con
  ProgressRing), ProgramCard (day-cards horizontales), WeightCard (Sparkline), PersonalRecordsBanner,
  RecentWorkouts, HabitsTracker, NutritionDailySummaryWidget, sticky CTA "Empezar entrenamiento", WelcomeModal.
  Gate onboarding: `getOnboardingStatus()` -> `/alumno/onboarding`. Datos: PostgREST directo
  (`workout_programs` + join `workout_plans`+`workout_blocks`, `workout_logs`, `daily_nutrition_logs`,
  `check_ins`, `coaches` para welcome_modal), `lib/client`, `lib/habits.queries`, `lib/date-utils`.
  Componentes: barrel `../../../components` (Avatar, Badge, Button, Card, HabitsTracker, ...), ProgressRing,
  EvaLoaderScreen, AppBackground, ScreenHeader, Sparkline.

- **`alumno/(tabs)/nutricion.tsx`** (563 L, patron mixto — 7 className + StyleSheet). Plan de nutricion del
  dia del alumno: comidas, macros, toggle de completado (con cola offline), habitos. Datos: PostgREST
  (`nutrition_plans`, `nutrition_meals`, `nutrition_meal_logs`, `daily_nutrition_logs`), `lib/nutrition.queries`,
  `lib/nutrition-utils`, `lib/nutrition-offline-cache`, `lib/habits.queries`, `lib/offline-cache`,
  `lib/use-online`. Componentes: MealCardExpandable, MacroRingSummary, NutritionDailySummaryWidget,
  HabitsTracker, FoodItemRow, DayNavigator. NOTA paridad: la web tiene "intercambios de nutricion"
  (exchanges) via `/api/mobile/nutrition/exchanges/*`; verificar si esta pantalla los consume (los endpoints
  existen en web pero no aparecen consumidos desde mobile en el grep — ver seccion C).

- **`alumno/(tabs)/exercises.tsx`** (260 L, patron B — 0 className, StyleSheet). "Aprender" — biblioteca de
  ejercicios/tecnica. Datos: PostgREST (`exercises`), `lib/client`.

- **`alumno/(tabs)/check-in.tsx`** (657 L, patron B — 0 className, StyleSheet — la mas grande sin migrar del
  alumno). Check-in semanal: peso, fotos (camara/galeria via expo-image-picker), energia, notas. Datos:
  PostgREST (`check_ins`, `checkins` — ojo dos nombres), `lib/client`, `lib/date-utils`. Sube fotos a Storage.

- **`alumno/(tabs)/history.tsx`** (181 L, patron B). Historial de entrenamientos. Datos: `lib/history.queries`
  (RPCs de series/PRs), `lib/client`.

- **`alumno/(tabs)/perfil.tsx`** (419 L, patron A — 14 className). Perfil del alumno: datos, toggle biometrico
  (`lib/biometric`), logout (`lib/auth-actions`), branding del coach (`lib/branding`). Datos: supabase,
  `lib/client`.

- **`alumno/(tabs)/workout.tsx`** (236 L, patron B). Pantalla intermedia de workout (lista de planes / dia).
  Datos: supabase, `lib/client`, `lib/offline-cache`.

- **`alumno/workout/[planId].tsx`** (934 L, patron B legacy pero con constantes DS hex — la pantalla mas
  grande e importante del alumno; NO usa className, define su propia paleta "gym mode" con literales
  `INK_950='#0B0E13'`, `FONT_MONO='JetBrainsMono_700Bold'`, etc.). Ejecutor de rutina inmersivo (siempre
  oscuro, espejo de `alumno-rutina.jsx` de web). Features presentes: keep-awake (`useKeepAwake`), confetti
  (`react-native-fast-confetti`), RestTimer, WorkoutSummaryModal, progresion (`lib/workout/progression`
  `computeEffectiveTarget`), variante por semana (`lib/program-week-variant`), cola offline
  (`enqueueLog`/`cachePlan`/`getCachedPlan`), OfflineBanner, NativeDialog, RPE/RIR con `clampIntInRange`,
  haptics. Datos: PostgREST (`workout_plans`+`workout_blocks`+`exercises`, `workout_logs`), `lib/client`,
  `lib/date-utils`, `lib/offline-cache`, `lib/motion`. **Es el unico consumidor de keep-awake.** Es el
  candidato mas costoso del re-skin por tamano y por paleta hardcodeada.

- **`alumno/codigo.tsx`** (135 L, patron A — 6 className). Ingreso del codigo/link del coach (fuera del gate
  de sesion). Resuelve branding (`fetchBrandingByCoachIdentifier` + `normalizeCoachIdentifier`), setea
  branding en contexto -> `/(auth)/login?role=alumno`. Componentes: Button, TopBar, AppBackground.

- **`alumno/onboarding.tsx`** (149 L, patron A — 11 className). Intake inicial del alumno antes del dashboard.
  Datos: `lib/alumno-onboarding` (toca `client_intake`).

- **`alumno/suspended.tsx`** (54 L, patron A — 3 className). Pantalla de alumno pausado/archivado. Solo logout
  (`lib/auth-actions`).

### Coach — `app/coach/`

- **`coach/(tabs)/_layout.tsx`** (35 L). Tabs con `tabBar={CoachMobileTabBar}`. Registra 10 screens. Primarios
  (barra docked): home(Dashboard), clientes(Alumnos), builder(Programas), ejercicios, nutricion. Overflow "Mas":
  settings(Opciones), support(Soporte), subscription(Suscripcion), check-ins, perfil(Mi cuenta). El comentario
  del archivo admite "parity debt" (web pliega Suscripcion dentro de Opciones).

- **`coach/(tabs)/home.tsx`** (178 L, patron B en el shell pero delega TODO el render a
  `components/coach/CoachDashboardSections.tsx` que SI usa DS — 87 className). Dashboard del coach.
  Secciones (todas exportadas de CoachDashboardSections): MobileBillingBanners, MobileClientStatsSheet,
  MobileFreeWelcomeModal, MobileFocusList, MobileGreetingHeader, MobileNovedades, MobileOnboardingGuideChip,
  MobilePublicCodeRequiredModal, MobilePulseHero, MobileQuickActionsFab, MobileTierUsageBanners,
  MobileTodayAgenda. Datos: `lib/coach-dashboard` (`getCoachDashboardDataMobile` -> `GET /api/mobile/coach/dashboard`).
  Wrapper: `CoachMainWrapper`.

- **`coach/(tabs)/clientes.tsx`** (1224 L, patron B — 0 className, 7 StyleSheet.create — pantalla gigante sin
  migrar). Directorio de alumnos con metricas ricas (pulse), crear/importar/editar/archivar/reset-password.
  Datos: `lib/clients-directory` (`GET /api/mobile/coach/clients/pulse`), `lib/client-actions`
  (`DELETE`/`PATCH`/`reset-password` a `/api/mobile/coach/clients/[clientId]`), `lib/coach`, `lib/api`,
  `lib/import-clients`, `POST /api/mobile/coach/clients` (crear). AssignClientsSheet, ClientCard.

- **`coach/(tabs)/builder.tsx`** (1279 L, patron B — sin migrar). Lista/gestion de programas de entrenamiento.
  Datos: PostgREST (`workout_programs`/`workout_plans`/`workout_blocks`), `lib/coach`, `lib/org`, `lib/db-compat`.

- **`coach/(tabs)/ejercicios.tsx`** (341 L, patron A — 15 className). Biblioteca de ejercicios del coach.
  Datos: `lib/exercises`, `lib/coach`. Componentes: ExerciseFormSheet, ExercisePreviewSheet, ExerciseSearchSheet.

- **`coach/(tabs)/nutricion.tsx`** (491 L, patron B). Plantillas/planes de nutricion del coach. Datos: supabase,
  `lib/coach`, `lib/nutrition-builder`, `lib/nutrition-templates`, `lib/coach-tiers`, `lib/api`. Componentes:
  FoodSearchSheet, FoodSwapSheet, TemplatePickerSheet.

- **`coach/(tabs)/settings.tsx`** (554 L, patron B). Opciones del coach: branding/marca (`lib/coach-brand`,
  `lib/branding`), tiers/entitlements (`lib/coach-tiers`), org (`lib/org`). Datos: `lib/api`, `lib/coach`.

- **`coach/(tabs)/subscription.tsx`** (138 L, patron B). Estado de suscripcion (solo-lectura; checkout es
  web-only). Datos: `lib/coach-subscription`.

- **`coach/(tabs)/support.tsx`** (83 L, patron B). FAQ de soporte. Datos: `lib/support-faq` (estatico).

- **`coach/(tabs)/check-ins.tsx`** (246 L, patron B — usa Inter/Montserrat legacy). Revision de check-ins de
  alumnos con fotos firmadas. Datos: PostgREST (`check_ins`), `lib/coach`, `lib/api` (`signCheckinPhotos` ->
  `POST /api/mobile/coach/checkin-photos`).

- **`coach/(tabs)/perfil.tsx`** (306 L, patron B). Cuenta del coach: logout, push. Datos: supabase,
  `lib/auth-actions`, `lib/coach`, `lib/org`, `lib/push`.

- **`coach/cliente/[clientId].tsx`** (444 L, patron B — shell; delega a `components/coach/clientDetail/*`
  con tabs). Ficha del alumno del coach (Overview/Plan/Nutricion/Progreso/Analisis/Facturacion). Datos:
  `lib/coach-client-detail`, `lib/profile-analytics`, `lib/progress-pdf`, `lib/api` (registrar pago ->
  `POST /api/mobile/coach/payments`), `lib/date-utils`. Componentes: `components/coach/clientDetail/`
  (AnalisisTab, ClientHero, ClientTabBar, FacturacionTab, NutricionTab, OverviewTab, PlanTab, ProgresoTab,
  WeeklyPRBanner, shared).

- **`coach/program-builder.tsx`** (1234 L, patron B — sin migrar). Editor completo de programa/plan (bloques,
  ejercicios, supersets, progresion). Datos: supabase, `lib/db-compat`, `lib/coach`, `lib/org`,
  `lib/muscle-colors`, `lib/exercises`, `lib/program-pdf`. Componentes: BlockEditorSheet, BuilderBlockCard,
  ExerciseSearchSheet, ProgramConfigSheet, ProgramPhasesBar, ProgramPreviewSheet, MuscleBalanceSheet,
  BuilderOnboardingTour. Usa `lib/plan-builder/` (reducer, arrayMove, skeleton, types) y draggable-flatlist.

- **`coach/nutrition-builder.tsx`** (504 L, patron B). Editor de plan de nutricion. Datos: `lib/macro-calculator`,
  `lib/nutrition-builder`, `lib/nutrition-utils`, `lib/nutrition-templates`.

- **`coach/foods.tsx`** (274 L, patron B). Gestion de alimentos. Datos: `lib/nutrition-builder` (toca `foods`,
  `food_items`, `saved_meals`, `saved_meal_items`).

- **`coach/brand-preview.tsx`** (136 L, patron B — 0 useTheme). Preview del branding del coach.

---

## (B) COMPONENTES — `apps/mobile/components/`

Barril principal `components/index.ts` (37 exports) + barriles atomic vacios de contenido real
(`atoms/index.ts`, `molecules/index.ts`, `organisms/index.ts` solo RE-EXPORTAN los mismos componentes de
la raiz — NO existen carpetas atoms/molecules/organisms con archivos propios; es un mapeo atomic nominal
sobre los mismos ficheros de `components/*`). Es decir: la clasificacion atomic es puramente un barrel, no
una estructura de carpetas real.

### Primitivas / atoms (raiz de components/)
Lenguaje visual: las primitivas modernas (`Button`, `Card`, `Badge`) usan **patron A** (clases DS estaticas
compiladas por NativeWind) + leen `useTheme()` solo para shadows/glow e iconos (colores literales para
`lucide`/`ActivityIndicator` porque RN exige color literal).

- **`Button.tsx`** — variantes: primary, sport, electric(alias sport), secondary, outline, ghost, danger,
  destructive, glass. Clases: `bg-action-primary`, `bg-cta-fill`, `text-on-dark`, etc. Sizes sm/md/lg.
  Haptics + scale 0.97 (Moti). Glow via `theme.shadowGlowBlue`.
- **`Card.tsx`** — variantes: default, inverse, sport, outline, sunken, highlighted, success, destructive.
  Clases `bg-surface-card border-subtle`, `bg-surface-inverse`, radios `rounded-card/control`. Shadows literales
  cool-tinted.
- **`Input.tsx`, `Avatar.tsx`, `Badge.tsx`, `ProgressBar.tsx`, `Skeleton.tsx`** — primitivas base.
- **`IconButton.tsx`** — importa `@eva/brand-kit` (linea 84).
- **`Tag.tsx`, `ListRow.tsx`, `Section.tsx`(+InfoRow), `StatCard.tsx`, `SegmentedTabs.tsx`, `Accordion.tsx`,
  `EmptyState.tsx`, `ErrorState.tsx`, `HapticPressable.tsx`, `AnimatedNumber.tsx`, `ScreenHeader.tsx`,
  `TopBar.tsx`, `TabBar.tsx`, `GlassCard.tsx`, `AppBackground.tsx`, `NativeScreen.tsx`, `NativeDialog.tsx`,
  `BottomSheet.tsx`** (usa @gorhom/bottom-sheet).

### Feedback / estados
- **`AppErrorBoundary.tsx`** (error boundary global), **`EvaSplash.tsx`** (splash animado), **`EvaLoader.tsx`**
  (loader + `EvaLoaderScreen`, soporta loader custom del coach via branding), **`OfflineBanner.tsx`**,
  **`SyncStatusPill.tsx`**, **`BiometricLock.tsx`** (overlay de bloqueo biometrico), **`WelcomeModal.tsx`**,
  **`WorkoutContextBanner.tsx`**.

### Graficos / metricas (usan react-native-svg; algunos Skia)
- **`Sparkline.tsx`, `ProgressRing.tsx`, `ComplianceRing.tsx`, `ChartCard.tsx`, `StreakCounter.tsx`,
  `StreakWidget.tsx`, `PersonalRecordsBanner.tsx`, `MacroPill.tsx`, `MacroRingSummary.tsx`,
  `NutritionDailySummaryWidget.tsx`, `AdherenceStrip.tsx`, `HabitsTracker.tsx`, `PhotoLightbox.tsx`,
  `DayNavigator.tsx`, `FoodItemRow.tsx`, `MealCardExpandable.tsx`.**
- Dependencias graficas instaladas: `@shopify/react-native-skia` 2.2.12, `victory-native` 41.20.3,
  `react-native-svg` 15.12.1, `react-native-qrcode-svg`.

### Alumno
- **`alumno/AlumnoMobileChrome.tsx`** — tab bar del alumno. Contiene `NAV_META` HARDCODEADO
  (home->Inicio, nutricion->"Plan", exercises->Aprender, check-in->Check-in, history->Historial,
  perfil->Perfil). `PRIMARY_TABS=['home','nutricion','exercises','check-in']`; el resto en sheet "Mas".
  Usa BlurView, MotiView, `theme.primary`/`theme.mutedForeground` (patron B para colores) + fuente
  `Inter_600SemiBold` (legacy). `hexToRgba` local para tints.

### Coach (carpeta mas poblada)
- **`coach/CoachMobileChrome.tsx`** — `CoachMobileTabBar`. `TABS` HARDCODEADO (home->Inicio, clientes->Alumnos,
  builder->Programas, nutricion->Nutricion, settings->Opciones) con indicador deslizante. BlurView.
- **`coach/CoachDashboardSections.tsx`** — TODAS las secciones del dashboard coach (12 componentes Mobile*),
  patron A (87 className). Hace fetch a `/api/mobile/coach/dashboard` y `/api/mobile/coach/payments`,
  `/api/mobile/coach/clients`.
- **`coach/CoachMainWrapper.tsx`, `CoachDashboardSections.tsx`, `ClientCard.tsx`, `AssignClientsSheet.tsx`.**
- Builder: `BlockEditorSheet`, `BuilderBlockCard`, `BuilderOnboardingTour`, `ProgramConfigSheet`,
  `ProgramPhasesBar`, `ProgramPreviewSheet`, `TemplatePickerSheet`, `MuscleBalanceSheet`.
- Ejercicios: `ExerciseFormSheet`, `ExercisePreviewSheet`, `ExerciseSearchSheet`, `ExerciseSetRow`.
- Nutricion: `FoodSearchSheet`, `FoodSwapSheet`.
- Charts: `coach/TrendChart.tsx`, `coach/WeightTrendChart.tsx`, y `coach/charts/` (`AreaTrend.tsx` y
  `BarComposed.tsx` usan **Skia**; `CalendarHeatmap.tsx`, `MuscleRadar.tsx`, `RadialGauge.tsx`).
- Ficha alumno: `coach/clientDetail/` (10 archivos: AnalisisTab, ClientHero, ClientTabBar, FacturacionTab,
  NutricionTab, OverviewTab, PlanTab, ProgresoTab, WeeklyPRBanner, shared.tsx).

### Workout
- **`workout/RestTimer.tsx`**, **`workout/WorkoutSummaryModal.tsx`** (consumidos por el ejecutor).

---

## (C) CAPA DE DATOS — `apps/mobile/lib/`

### Cliente Supabase / auth
- **`lib/supabase.ts`** — `createClient` con `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  storage AsyncStorage, `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false`. Cliente unico
  compartido. **La app habla PostgREST DIRECTO (anon key + JWT del usuario, RLS-scoped) para casi todo.**
- Auth = Supabase GoTrue (`signInWithPassword`, `resetPasswordForEmail`, `setSession`). Bearer token del
  usuario se adjunta solo cuando se llama a los endpoints `/api/mobile/*` via `apiFetch(..., authenticated:true)`.

### Bridge HTTP a apps/web — `lib/api.ts`
- `apiFetch<T>(path, {authenticated, body, ...})`: base URL `EXPO_PUBLIC_API_URL || https://eva-app.cl`.
  Adjunta `Authorization: Bearer <access_token>` de la sesion. Maneja 401: refresca sesion 1x y reintenta;
  si sigue 401 -> `signOut()`. Clase `ApiError` con status/code.
- Helpers tipados en `api.ts`: `registerCoachFree` (`POST /api/mobile/auth/register-coach-free`),
  `signCheckinPhotos` (`POST /api/mobile/coach/checkin-photos`).

### Endpoints `/api/mobile/*` que la app CONSUME hoy (verificado por grep en mobile)
1. `POST /api/mobile/auth/register-coach-free` — `lib/api.ts` (registro coach free).
2. `POST /api/mobile/coach/checkin-photos` — `lib/api.ts` / `check-ins.tsx` (firma URLs de fotos, bucket privado).
3. `GET /api/mobile/coach/clients/pulse` — `lib/clients-directory.ts` (metricas ricas por alumno, 1:1 web).
4. `DELETE|PATCH /api/mobile/coach/clients/[clientId]` — `lib/client-actions.ts` (borrar / archivar-activar).
5. `POST /api/mobile/coach/clients/[clientId]/reset-password` — `lib/client-actions.ts` (temp 6 digitos).
6. `GET /api/mobile/coach/dashboard` — `lib/coach-dashboard.ts` (dashboard coach) + `POST` desde
   `CoachDashboardSections.tsx` (acciones de dashboard, ej. dismiss novedades/onboarding).
7. `POST /api/mobile/coach/clients` — `CoachDashboardSections.tsx` y `clientes.tsx` (crear alumno).
8. `POST /api/mobile/coach/payments` — `cliente/[clientId].tsx` y `CoachDashboardSections.tsx` (registrar pago manual).

### Endpoints `/api/mobile/*` que EXISTEN en apps/web pero NO se consumen desde mobile (gap de paridad)
Estos routes existen en `apps/web/src/app/api/mobile/` pero NO aparecen invocados en el codigo mobile —
son features de modulos de pago / entitlements aun NO cableadas en la app (coincide con la auditoria
rn-web-parity-2026-06-21 que dice que faltan modulos pagos/entitlements):
- `bodycomp/[id]`, `bodycomp/bia`, `bodycomp/isak` (composicion corporal / body composition).
- `cardio/profile` (modulo cardio).
- `coach/slug`, `coach/support`.
- `config` (`/api/mobile/config` — flags/config remota).
- `movement/*` (assessment, draft, finalize, item — evaluacion de movimiento).
- `nutrition/exchanges/*` (meal-variant, set-mode, targets, variants — intercambios de nutricion).
- `team/add-coach` (modo team).
Verificar en el plan cuales de estos deben cablearse.

### Tablas tocadas por PostgREST directo (conteo de `.from(...)` en lib+app+components)
`workout_programs`(29), `clients`(22), `nutrition_plans`(21), `workout_logs`(20), `nutrition_meals`(16),
`food_items`(10), `coaches`(10), `workout_plans`(9), `exercises`(9), `daily_nutrition_logs`(9),
`check_ins`(9), `nutrition_plan_templates`(8), `workout_blocks`(6), `nutrition_meal_logs`(5), `foods`(5),
`client_payments`(4), `daily_habits`(3), `template_meals`(2), `push_tokens`(2), `logos`(2),
`client_food_preferences`(2), `workout_sessions`(1), `template_meal_groups`(1), `saved_meals`(1),
`saved_meal_items`(1), `organizations`(1), `client_intake`(1), `checkins`(1 — nombre alterno, revisar).

### RPCs tocadas (`.rpc(...)`)
`get_client_workout_day_counts`(2), `get_client_weekly_prs`, `get_client_strength_series`,
`get_client_muscle_volume`, `get_client_exercise_prs`, `get_client_daily_tonnage`,
`get_client_activity_dates`. (Todas de analytics del alumno; viven en `lib/history.queries.ts`,
`lib/profile-analytics.ts`, `lib/coach-client-detail.ts`.)

### db-compat shim — `lib/db-compat.ts`
Resiliencia ante DB standalone vs enterprise (columnas v2 como `org_id`, `reviewed_at` pueden faltar).
- `isMissingColumnError(err)` — detecta PGRST204 / 42703 / PGRST200 / "does not exist" / "schema cache".
- `selectWithFallback(rich, minimal)` — intenta query con columnas enterprise; si falla por columna
  faltante reintenta la minima. Usado por `lib/client.ts`, `lib/branding.ts`, `builder.tsx`,
  `program-builder.tsx`.
- `optionalCol(key, value)` — spread condicional para inserts.

### Perfiles / identidad
- **`lib/client.ts`** — `getClientProfile()`: lee `clients` (RICH con org_id / MIN sin), computa `blocked`
  (archivado o inactivo), `forcePasswordChange`. Es el gate de acceso del alumno.
- **`lib/coach.ts`** — `getCoachProfile()` y afines; importa `@eva/tiers` (lineas 2,3,13). Identidad coach.
- **`lib/branding.ts`** — resuelve branding por `invite_code` (regex `^[A-Z2-9]{5}$`) o `slug`
  (`^[a-z0-9-]{3,50}$`) desde tabla `coaches`; `normalizeCoachIdentifier` parsea codigos y links `/c/<x>`.
  Cachea en AsyncStorage (`eva_coach_branding`). Campos de loader custom (M-F1) con fallback DB-compat.
  **invite_code es el identificador primario del alumno** (coincide con memoria del proyecto).

### Offline / colas — `lib/offline-cache.ts` + `lib/nutrition-offline-cache.ts`
- Cola de logs de entreno: `enqueueLog` / `flushLogQueue` (dedup select-then-update/insert por
  client+block+set dentro del dia Santiago, per-item resiliente, preserva timestamp), `getPendingLogCount`.
  Cache de plan por `eva_plan_<id>` (`cachePlan`/`getCachedPlan`).
- Cola de nutricion: `enqueueNutritionToggle` / `flushNutritionQueue` (via `toggleMealCompletion`),
  `getPendingNutritionCount`. Keys: `eva_log_queue`, `eva_nutrition_queue`.
- Flush disparado al volver de background (en `alumno/(tabs)/_layout.tsx`). `lib/use-online.ts` +
  `@react-native-community/netinfo` para estado online.

### Push — `lib/push.ts`
- `syncPushToken(userId, supabase)`: pide permisos, obtiene Expo push token (projectId de expoConfig.extra.eas),
  upsert en tabla `push_tokens` (`onConflict: user_id,device_id`), device_id ESTABLE persistido
  (`eva_device_id`, `Crypto.randomUUID`). `revokePushToken` (borra fila de este device en logout).
  `configurePushHandler`, `setupAndroidChannel` ('default', importance MAX, lightColor `#007AFF`).

### Biometria — `lib/biometric.ts`
- `expo-local-authentication` + `expo-secure-store`. `isBiometricAvailable`, `authenticate(reason)`,
  `isBiometricLockEnabled`/`setBiometricLockEnabled` (pref opt-in en Keychain/Keystore, key `eva_biometric_lock`).
  Consumido por `_layout.tsx` (BiometricLock overlay) y `perfil.tsx` (toggle).

### Keep-awake
- `expo-keep-awake` `useKeepAwake()` usado SOLO en `alumno/workout/[planId].tsx` (mantiene pantalla
  encendida durante el entreno).

### Otros lib destacados
- `lib/theme.ts` (objeto Theme dark/light + `applyCoachBranding` + `brandVars`/`hexToChannels` — puente
  con `@eva/brand-kit`). `lib/motion.ts` (`useEvaMotion`, importa @eva). `lib/haptics.ts`. `lib/date-utils.ts`
  (Santiago tz, muy usado). `lib/auth-actions.ts` (logout centralizado — revoca push). `lib/auth-errors.ts`
  (traduccion errores GoTrue). `lib/session-flags.ts` (flag efimero `pwChanged`).
- Nutricion: `lib/nutrition.queries.ts`, `lib/nutrition-utils.ts`, `lib/nutrition-builder.ts`,
  `lib/nutrition-templates.ts`, `lib/nutrition-coach-alerts.ts`, `lib/macro-calculator.ts`.
- Coach: `lib/coach-dashboard.ts`, `lib/coach-subscription.ts` (@eva), `lib/coach-tiers.ts` (@eva),
  `lib/coach-brand.ts` (@eva), `lib/coach-client-detail.ts`, `lib/clients-directory.ts`, `lib/client-actions.ts`,
  `lib/import-clients.ts`, `lib/org.ts`, `lib/clients-directory.ts`.
- Builder: `lib/plan-builder/` (reducer.ts, arrayMove.ts, skeleton.ts, types.ts), `lib/exercises.ts`,
  `lib/muscle-colors.ts`, `lib/program-week-variant.ts`, `lib/workout/progression.ts`.
- PDF: `lib/program-pdf.ts`, `lib/progress-pdf.ts` (expo-print). `lib/support-faq.ts` (estatico).
- `lib/profile-analytics.ts`, `lib/profile-top-alert.ts`, `lib/history.queries.ts`, `lib/habits.queries.ts`,
  `lib/use-async-data.ts`.

### Autenticacion server-side del bridge — `apps/web/src/lib/mobile-auth.ts`
`verifyMobileBearer(token)`: verifica firma JWT localmente con JWKS (jose, sin red) para el camino rapido;
token EXPIRADO -> 401 local; cualquier otra cosa (iss/aud drift, JWKS caido, kid/alg) degrada a
`admin.auth.getUser` (autoritativo, red). Nota critica del propio archivo: SOLO para GET read-only; las
MUTACIONES de cuenta deben usar `getUser` directo (jose no consulta revocacion). AUDIENCE='authenticated'.

---

## (D) PACKAGES `@eva/*` — que importa hoy y que NO

`packages/` disponibles: `brand-kit`, `calc`, `feature-prefs`, `module-catalog`, `nutrition-engine`,
`schemas`, `tiers`.

`tsconfig.json` de mobile SOLO declara paths para 3:
```
"@eva/schemas":   ../../packages/schemas/index.ts
"@eva/brand-kit": ../../packages/brand-kit/index.ts
"@eva/tiers":     ../../packages/tiers/index.ts
```
(Ademas `package.json` de mobile NO lista NINGUN `@eva/*` como dependencia — se resuelven via tsconfig paths
+ Metro/monorepo, no como workspace deps declaradas.)

- **IMPORTADOS hoy (verificado):**
  - `@eva/schemas` — `(auth)/login.tsx`, `register.tsx`, `forgot-password.tsx` (LoginSchema, etc.).
  - `@eva/brand-kit` — `lib/theme.ts` (`resolveBrandTheme`, `deriveSportTokens`), `lib/motion.ts`,
    `lib/coach-brand.ts`, `components/IconButton.tsx`.
  - `@eva/tiers` — `lib/coach.ts`, `lib/coach-subscription.ts`, `lib/coach-tiers.ts`.
- **AUSENTES / NO importados (confirmado — no hay path en tsconfig y 0 imports):**
  - `@eva/feature-prefs` — NO usado. (La auditoria decia "ausente"; CONFIRMADO.)
  - `@eva/nutrition-engine` — NO usado. La nutricion mobile reimplementa/consume via `lib/nutrition-*`
    propios y RPCs, en vez del motor compartido `computeNutritionAdherence`. (Auditoria decia "ausente";
    CONFIRMADO — riesgo de drift vs web.)
  - `@eva/calc` — NO usado (mobile tiene `lib/macro-calculator.ts` propio; posible duplicacion de logica).
  - `@eva/module-catalog` — NO usado (fuente de verdad de MODULE_KEYS/entitlements; su ausencia explica
    que los modulos de pago no esten cableados en mobile).

Implicacion para el plan: la paridad funcional de nutricion, entitlements y modulos de pago exige adoptar
`@eva/nutrition-engine`, `@eva/module-catalog` y probablemente `@eva/feature-prefs`/`@eva/calc`, o justificar
por que se mantienen implementaciones mobile separadas.

---

## (E) NAVEGACION — expo-router

- Estructura file-based (arriba). Grupos `(auth)` (Stack), `alumno/(tabs)` y `coach/(tabs)` (Tabs con
  tabBar custom). Raiz `_layout.tsx` monta un unico `<Stack headerShown:false>`.
- **NAV_META / TABS hardcodeados en los chrome components** (NO se derivan de un registro central):
  - Alumno (`AlumnoMobileChrome.tsx`): `NAV_META` mapea 6 rutas; `PRIMARY_TABS` = home, nutricion,
    exercises, check-in (+ "Mas" con history, perfil). `workout` oculto (`href:null`, HIDDEN_FROM_OVERFLOW).
    Labels: Inicio · Plan · Aprender · Check-in · Mas.
  - Coach (`CoachMobileChrome.tsx`): `TABS` = home(Inicio), clientes(Alumnos), builder(Programas),
    nutricion(Nutricion), settings(Opciones) en barra docked con indicador deslizante. En el layout el
    overflow "Mas" incluye support, subscription, check-ins, perfil.
  - Divergencia de labels: el layout del alumno pone `title:'Nutrición'` pero el chrome lo muestra como
    "Plan"; el layout coach pone `title:'Dashboard'` en home pero el chrome muestra "Inicio". Los labels
    reales que ve el usuario los decide el chrome (hardcode), no el `options.title` del layout.
- Tab bars usan `expo-blur` BlurView + MotiView; colores desde objeto `theme` (patron B).
- Deep linking: manejado en `+native-intent.ts` (nativo) + `_layout.tsx` (recovery hash). `expo-linking`.

---

## (F) CONFIG — app.json / eas.json / plugins

### app.json (`expo`)
- name "EVA", slug "eva", scheme "eva", version "1.0.0", orientation portrait, `newArchEnabled:true`
  (New Architecture / Fabric ON), `userInterfaceStyle:automatic`.
- Iconos: `./assets/icon.png` (base), iOS `./assets/icon-ios.png`, Android adaptiveIcon
  (`adaptive-icon.png` sobre `#000000`). Splash: `./assets/eva-icon.png` contain sobre `#07080C`.
  (Icono+splash son EVA-only por decision — coincide con el brief.)
- **iOS** (`ios`): bundleId `cl.evaapp.eva`, buildNumber "3", `supportsTablet:false`. infoPlist:
  NSCameraUsageDescription, NSPhotoLibraryUsageDescription, NSMotionUsageDescription, NSFaceIDUsageDescription,
  ITSAppUsesNonExemptEncryption:false, **NSAppTransportSecurity.NSAllowsArbitraryLoads:true** (permite HTTP,
  usado por staging con IP local).
  **`associatedDomains` AUSENTE** — CONFIRMADO: no hay universal links iOS configurados (los deep links
  https solo estan cableados en Android via intentFilters). Gap para paridad iOS.
- **Android** (`android`): package `cl.evaapp.eva`, versionCode 1. Permisos: RECEIVE_BOOT_COMPLETED, VIBRATE,
  USE_BIOMETRIC, USE_FINGERPRINT, RECORD_AUDIO. **intentFilters (App Links autoVerify)** para
  `https://eva-app.cl` con pathPrefix `/c/`, `/invite/`, y path `/reset-password`.
- **plugins**: `expo-router`, `expo-updates`, `expo-image-picker` (photosPermission custom),
  `./plugins/with-android-cleartext`, `./plugins/with-gradle-jvmargs`, `./plugins/with-privacy-manifest`
  (3 config plugins locales en `plugins/`), `expo-secure-store`.
- **updates**: EAS Update url `https://u.expo.dev/a5f4f7c0-...`, `fallbackToCacheTimeout:0`,
  runtimeVersion policy `appVersion`. projectId `a5f4f7c0-861c-48b1-9ed6-fc46e7843844`. owner `juandeveva`.

### eas.json
- cli `>=14.0.0`, `appVersionSource: remote`, `promptToConfigurePushNotifications:false`.
- Perfiles build: `development` (devClient, sim iOS), `prodpreview` (APK android, iOS store Release,
  credentialsSource local, env APP_ENV=production + EXPO_ROUTER_APP_ROOT=apps/mobile/app,
  image macos-sequoia-15.6-xcode-26.0), `staging` (channel staging, env con SUPABASE_URL a IP local
  `http://10.93.54.116:54321` + anon key publishable), `production` (channel production, autoIncrement).
- submit: iOS appleId jvillegas.dev@gmail.com, ascAppId 6770426633, teamId 5GKWMMZ46Q; Android
  serviceAccount `./google-service-account.json`, track internal.

### Fuentes / dependencias clave (package.json)
- Fuentes: Inter + Montserrat (legacy) Y Archivo + Hanken Grotesk + JetBrains Mono (EVA DS). Todas cargadas
  en `_layout.tsx`. NativeWind 4.2.4 + tailwindcss 3.4.17 (dev) + react-native-css-interop.
- Nativas relevantes: @gorhom/bottom-sheet 5, @shopify/flash-list 2.3, @shopify/react-native-skia 2.2,
  victory-native 41, react-native-reanimated 4 + worklets, moti, react-native-gesture-handler,
  react-native-draggable-flatlist, react-native-fast-confetti, react-native-qrcode-svg,
  react-native-webview, react-native-svg 15. Expo: camera, image, image-manipulator, image-picker,
  keep-awake, local-authentication, notifications, print, secure-store, updates, blur, linear-gradient,
  linking, clipboard, document-picker, file-system, crypto, device, constants, haptics.
- zod 4.3.6, @supabase/supabase-js 2.108, lucide-react-native 1.16.

---

## Resumen de gaps para el plan (derivados del inventario)

1. **Visual heterogeneo:** ~50% de las pantallas en patron B (objeto `theme` + StyleSheet + fuentes
   Inter/Montserrat). Las mas grandes sin migrar: `coach/builder.tsx` (1279), `coach/program-builder.tsx`
   (1234), `coach/clientes.tsx` (1224), `alumno/workout/[planId].tsx` (934, paleta hex propia),
   `alumno/check-in.tsx` (657). `app/index.tsx` es el mas obviamente viejo.
2. **`tailwind.config.js` DS ya existe y es completo** — el re-skin es "adoptar clases", no crear tokens.
   Pero el objeto `theme` legacy (lib/theme.ts) duplica esos tokens como JS y hay que reconciliarlo.
3. **NAV labels/tabs hardcodeados** en los dos chrome — cualquier reordenamiento de paridad se hace ahi.
4. **Packages compartidos infrautilizados:** faltan `@eva/nutrition-engine`, `@eva/module-catalog`,
   `@eva/feature-prefs`, `@eva/calc` — raiz de los gaps funcionales (nutricion divergente, sin
   entitlements/modulos de pago).
5. **Endpoints mobile del backend sin cablear:** bodycomp, cardio, movement, nutrition/exchanges, config,
   team/add-coach existen en web pero no se consumen -> features de modulos ausentes en la app.
6. **iOS sin `associatedDomains`** -> universal links solo funcionan en Android (App Links). Gap de paridad.
7. **Excepciones intencionales confirmadas presentes:** no hay checkout/pagos in-app (subscription.tsx es
   solo-lectura; pagos manuales de coach via API); icono+splash EVA-only.
