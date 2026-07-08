# Inventario pantalla-por-pantalla — App ALUMNO web (post-rediseño EVA DS)

Fuente: `apps/web/src/app/c/[coach_slug]/**` (rama `feat/pagos-flow-mercadopago`, master ya mergeado con EVA DS + Fase L + resiliencia ejecutor + dark tones). Este arbol se sirve tambien via proxy rewrite bajo `/t/[team_slug]/*` (pool/team) y `/e/[org_slug]/*` (enterprise); todos los links internos se construyen con `useBasePath()`/`getClientBasePath()`, NUNCA hardcodeando `/c/`.

Convenciones de lectura:
- **Breakpoint del DS = `md` (760px)**. Mobile = `< md` (columna unica, app-like), Desktop = `md:` (sidebar + bento/2-col). Para RN la referencia es SIEMPRE el arbol mobile (`md:hidden`).
- `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` = safe-area insets (utilidades globales). `h-dvh`/`min-h-dvh` en vez de `100vh`.
- Colores por token CSS: `--theme-primary` (color white-label del coach), rampa `--sport-*` (marca derivada), `--ember-*` (nutricion/racha), `--aqua-*` (hidratacion), `--success-*`, `--danger-*`, `--warning-*`, superficies `--surface-app/card/sunken/inverse`, texto `--text-strong/muted/subtle`, `on-dark`/`on-dark-muted` (sobre superficies oscuras).

---

## 0. CHROME GLOBAL DEL ALUMNO

### 0.1 Layout raiz — `layout.tsx` (`ClientBrandLayout`)
Archivo: `apps/web/src/app/c/[coach_slug]/layout.tsx`

Responsabilidades (todo server-side, lee headers del proxy/middleware, cero query extra para branding):
- **Metadata + viewport por coach** (`generateMetadata`, `generateViewport`): titulo = `brand_name`, theme-color = `x-coach-primary-color`, OG image, apple-web-app capable + `black-translucent`, iconos (logo del coach o `BRAND_APP_ICON` EVA).
- **Manifest PWA brandeado**: `<link rel="manifest" href="/api/manifest/[slug]" crossOrigin="use-credentials">` — inyectado RAW (no via metadata) para que viaje con cookies; sin cookies el manifest colapsa a la marca EVA/`/c`. **Apple splash screens**: 11 `<link rel="apple-touch-startup-image">` generados per-coach via `/api/splash/[slug]?w=&h=` (matriz de dispositivos `APPLE_SPLASH`). **apple-touch-icon**: logo raster del coach o EVA (iOS ignora SVG/WebP/data:).
- **Theming white-label completo** inyectado en un `<style>` inline con variables CSS. Gate por tier: `isBrandingAllowed(subscription_tier)` → `< Pro` fuerza EVA (`SYSTEM_PRIMARY_COLOR #007AFF` + `BRAND_APP_ICON`). Fuente del branding: headers `x-coach-*` (primary/secondary color, accent light/dark, neutral-tint, font-key, loader-variant, theme-preset-key, logo-url/logo-url-dark). Resuelve `resolveBrandTheme` + `generateBrandPalette` + `deriveSportTokens` (rampa `--sport-100..700`, `--cta-fill`, `--focus-ring`). Dark mode via clase `.dark` con accents propios. Preset curado (`theme_preset_key`) overridea color/fuente/loader salvo marca gestionada por org/team.
- **Variables loader white-label** (`--coach-loader-variant`, `--coach-loader-text`, `--coach-use-custom-loader`, `--coach-loader-color`, `--coach-loader-icon-mode`, `--coach-loader-config`) — sanitizadas anti-XSS (remueve `<>`, escapa comillas, valida hex/JSON).
- **Estructura del shell**: `<div className="flex flex-col md:flex-row min-h-dvh">` con data-attrs (`data-coach-slug`, `data-brand-name`, `data-primary-color`, `data-logo-url`, `data-logo-dark`, `data-loader-variant`) que el `InstallPrompt` global lee para auto-brandearse.
- Providers: `NetworkProvider` (offline screen) → `BasePathProvider` → `OfflineNutritionQueueSync` + `OfflineWorkoutQueueSync` (drenan colas offline) → `ClientNav` → `<main>` con children.
- **`<main>`**: `flex-1 overflow-auto bg-muted/20 pb-[var(--mobile-content-bottom-offset)] md:pb-0` — el padding inferior deja espacio para la capsula flotante; se anula en `/workout` (`.is-workout-page`).
- **Banner huerfano** (`x-workspace-orphan`): alumno enterprise cuyo coach dejo la org → banner ambar "Tu coach ya no esta disponible… habla con {org}".
- **Footer**: link "Potenciado por EVA" (solo tier free) + link "Privacidad · ARCO" (`mailto:privacidad@eva-app.cl`).
- Si no hay `x-coach-id` → `redirect('/not-found')`.
- **Gate de nav por modulos** (server-side, deduped): `getStudentMovementNavEnabled()`, `getStudentBodyCompositionNavEnabled()`, `getStudentNutritionNavEnabled()` → props `showMovement`/`showBodyComposition`/`showNutrition` de `ClientNav`.

### 0.2 Navegacion — `ClientNav.tsx`
Archivo: `apps/web/src/components/client/ClientNav.tsx` (`'use client'`)

**Se OCULTA** en login/register/forgot/onboarding, y **durante ejecucion de plan** (`/workout/[planId]` — `isWorkout`).

**MOBILE (`< md`) — CAPSULA FLOTANTE de vidrio esmerilado (iOS-26)** — ESTA ES LA REFERENCIA RN:
- `position: fixed`, `bottom: calc(safe-area-inset-bottom + 16px)`, `left/right: 14px`, `borderRadius: 30`, fondo `color-mix(surface-card 74%)` + `backdropFilter: blur(26px) saturate(180%)`, borde sutil, sombra en capas.
- Patron **"4 primarios + Mas"**: `Inicio` (Home) · `Nutricion` (Apple, solo si `showNutrition`) · `Aprender` (Dumbbell) · `Check-in` (CheckCircle) + boton `Mas` (MoreHorizontal).
- **Pildora deslizante** detras del tab activo (tinte `--theme-primary` 15%, borde 24%), animada con `--ease-spring`; indice calculado por `mobileActiveIndex`.
- Cada tile: icono 22px + label 10px; activo → color `--theme-primary`, glifo con `fill-opacity .18`, label peso 800, traslada -1px.
- **Hide-on-scroll**: al bajar >80px se `minimized` → capsula se encoge (insets 14→72, labels fade a 0, padding reducido). Listener en `window scroll` con rAF.
- **Sheet "Mas"** (bottom sheet, backdrop black/40, animacion spring `y:100%→0`, cierra al navegar): fila destacada **"Mi perfil"** (icono UserRound + "Racha, modulos, cuenta y mas" → `/perfil`), fila **Historial** (`/workout-history`), boton **Instalar la app** (`PwaNavButton`), boton **Cerrar sesion** (danger). Los modulos entitled se alcanzan desde /perfil (ya no se listan en el sheet).

**DESKTOP (`md:`) — SIDEBAR vertical** (`w-64` / `w-20` colapsable):
- Header: logo del coach + eyebrow "Mi Coach" + `brand_name` en `--theme-primary`, boton colapsar.
- Nav: base items + Historial + separador "Modulos" + moduleItems (Movimiento/Composicion si entitled). Activo = barra-acento izquierda 3px + fondo `--theme-primary` 10% + texto en color.
- Footer: `PwaNavButton` + toggle Tema (`ThemeToggle`) + Cerrar sesion.

Sign-out: `supabase.auth.signOut()` → `router.push(base+'/login')` + refresh.

### 0.3 Providers y utilidades globales
- **`OfflineScreen` / `NetworkProvider`** (`components/client/OfflineScreen.tsx`): escucha `online`/`offline`; offline → pantalla full-screen `z-[200]` con logo/inicial del coach + glow + "Sin conexion · No puedes entrenar sin internet". Bloquea toda la app.
- **`BasePathProvider` / `useBasePath()`** (`components/client/BasePathProvider.tsx`): contexto con el base path real (`/c/[slug]` | `/t/[team]` | `/e/[org]`). Todos los links lo usan.
- **`PwaNavButton`** (`components/client/PwaNavButton.tsx`): usa `useInstallPrompt`; oculto si ya instalada. Click → prompt nativo o dialog con instrucciones iOS/Android. Es la unica entrada manual a instalar (banner AppDownload removido por decision CEO). **Install prompt global**: `InstallPrompt` se monta una vez en el root `app/layout.tsx`, se auto-brandea leyendo los `data-*` del wrapper del layout de alumno.
- **`OfflineNutritionQueueSync` / `OfflineWorkoutQueueSync`**: montados en el layout, drenan las colas offline (nutricion + workout logs) al reconectar.
- **`AppBadgeSync`**: setea/limpia el badge del icono PWA (usado por CheckInBanner con count=1 y limpiado al abrir /check-in).

### 0.4 Boundaries
- `loading.tsx` → `BrandClientLoadingShell` → `ClientLoadingShell`/`EvaRouteLoader` brandeado (lee headers loader del coach: texto/color/icon-mode/logo).
- `error.tsx` (`'use client'`, `ClientShellError`): GlassCard "Algo salio mal" + digest + boton Reintentar; captura a Sentry. No rompe branding.
- `not-found.tsx` (`ClientNotFound`): 404 grande estilizado + "Pagina no encontrada" + CTA "Mi panel" → dashboard (respeta base path).

### 0.5 Root `page.tsx`
`getClientRootUser()` (via `getClaims`, verificacion local JWT ES256, sin round-trip) → si user `redirect(base+'/dashboard')`, si no `redirect(base+'/login')`.

---

## 1. LOGIN — `login/page.tsx`
Ruta: `/c/[coach_slug]/login` · Archivos: `page.tsx`, `ClientLoginForm.tsx`, `_components/LoginEntrance.tsx`, `_data/login.queries.ts`, `_actions/login.actions.ts`

**Proposito**: puerta de entrada branded del coach. Primera impresion (sin cache, sin nav).

**Datos**: `getClientLoginCoach(slug)` trae toda la marca (brand_name, primary_color, logo_url/dark, welcome_message, subscription_tier, secondary/accent colors, font-key, loader config, `theme_preset_key`, `login_layout_key`). Gate `isBrandingAllowed(tier)` → `< Pro` cae a EVA visual conservando el nombre. Si no hay coach → `notFound()`.

**4 layouts de login white-label** (`login_layout_key`, resueltos por `resolveLoginLayout`): `clasico` (default, hero full-bleed con color del coach), `minimal` (tipografia pura sobre fondo solido), `hero` (logo protagonista centrado con fundido), `energia` (entrada animada con el LOADER del coach — `CompositeLoaderView`/`LoaderVariantView`/`EvaRouteLoader`).

**Estructura MOBILE (`< md`, `max-w-md` centrado)**:
- Segun layout: hero de marca (brand-mark = logo del coach o iniciales; tagline = `welcome_message` o default) + panel del form.
- `LoginEntrance`/`LoginEntranceItem`: stagger de entrada (fade/slide up, reduced-motion aware).
- `ClientLoginForm`: campos Email (icono Mail) + Contraseña (icono Lock) con focus-ring `--theme-primary`; link "¿Olvidaste tu contraseña?" → `/forgot-password?coach_slug=`; boton submit "Entrar a {brand}" (color del coach) con estado pending "Ingresando…". Footer "con tecnologia de EVA".
- `InstallPrompt` al pie.

**Estructura DESKTOP (`md:`)**: split 2 panes (hero de marca grande a la izquierda + pane de form a la derecha `surface-card`), salvo `minimal` (columna unica ancha). Los ids del form se prefijan (`d-`) porque ambos arboles coexisten en el DOM.

**Mutacion — `clientLoginAction`** (server action):
1. `signInWithPassword` (Zod `ClientLoginSchema`).
2. Resuelve coach por `invite_code` (regex `[A-Z2-9]{5}`) o `slug`.
3. Lee `clients` (force_password_change, is_active, coach_id, org_id). Matchea workspace: standalone (coach_id propio), o enterprise (org_id + `organization_members` activo via service-role para entrar por slug de OTRO coach de la misma org).
4. Gate: sin acceso → signOut + error; `is_active === false` → signOut + "cuenta pausada".
5. `setLastWorkspace`. **Redirect**: `force_password_change` → `/change-password`, si no → `/dashboard`.
6. El form guarda sticky branding en localStorage (`last_coach_slug`, `coach_brand_name`, `coach_logo_url`) para "Intelligent Redirect".

**Estados**: error inline (`bg-danger-100`), pending. **Nota RN**: el login por password vive aqui; Google GIS login existe en web (fuera de este archivo).

---

## 2. ONBOARDING — `onboarding/page.tsx`
Ruta: `/c/[coach_slug]/onboarding` · Archivos: `page.tsx`, `OnboardingForm.tsx`, `_actions/onboarding.actions.ts`, `_data/onboarding.queries.ts`

**Proposito**: perfil inicial obligatorio (intake). Gate: si `onboardingCompleted` → redirect dashboard; sin user → login.

**Estructura**: `<main>` centrado, card `surface-card/80 backdrop-blur-xl`. Titulo "Completa tu perfil" + subtitulo + **disclaimer medico** (warning box "EVA no es un dispositivo medico…"). `OnboardingForm`.

**Form (3 pasos, `useActionState`, wizard con AnimatePresence)** — REFERENCIA RN de wizard:
- **Barra de progreso segmentada** (3 barras, animadas) + eyebrow "Paso X de 3".
- **Paso 1 "Tus datos"**: Peso (kg, icono Scale) + Estatura (cm, icono Ruler), validacion inline (requerido / valor valido).
- **Paso 2 "Tus metas"**: chips tappables (`Pick`, seleccionado = solido ink-950): Objetivo principal (5 opciones), Experiencia (3), Dias/semana (5).
- **Paso 3 "Salud y seguridad"**: disclaimer medico repetido; textareas Lesiones + Condiciones medicas (opcionales); **checkbox obligatorio** "Confirmo 14 años + acepto terminos/privacidad".
- **Draft en localStorage** (`onboarding_draft_{slug}`, guarda formData+step; se limpia al enviar OK). Los campos de pasos anteriores viajan como hidden inputs en el paso 3 (AnimatePresence desmonta los no-visibles).
- Navegacion: Atras / Siguiente / Finalizar registro. Errores server inline.

---

## 3. CHANGE-PASSWORD — `change-password/page.tsx`
Ruta: `/c/[coach_slug]/change-password` (`'use client'`, `use(params)`)

**Proposito**: primer acceso obligatorio (`force_password_change`). Icono ShieldCheck + "Crea tu contraseña". Form: Nueva + Confirmar (iconos Lock, focus-ring theme). **Chips reactivos de reglas** (viran a verde): "8+ caracteres" y "Coinciden" GATEAN el submit; "1 numero" y "1 mayuscula" son solo pistas. `changePasswordAction`: `updateUser({password})` + `clients.force_password_change=false` → redirect dashboard (base path real).

---

## 4. DASHBOARD (INICIO) — `dashboard/page.tsx`
Ruta: `/c/[coach_slug]/dashboard` · La pantalla mas compleja. Es la home tras login.

**Data flow**: `getClientDashboardUser` (=`getClientRootUser`, getClaims) → `getClientProfile` (`findDashboardClientById`, incluye coach anidado). `getActiveOrgAnnouncements` si tiene org. Team-aware: en contexto team (`x-workspace-brand-source==='organization'` o base `/t`) usa la marca del TEAM para el saludo y SUPRIME el welcome modal personal del coach.

**Shell**: `DashboardShell` → `min-h-dvh` + contenedor `max-w-xl` mobile / `max-w-[1240px]` desktop, `flex flex-col gap-3.5`. Envuelto en `DashboardPullToRefresh` (pull-to-refresh mobile).

**MOBILE (`< md`, columna unica)** — orden vertical (cada seccion en `<Suspense>` con skeleton propio):
1. **OrgAnnouncementBanner** (si hay anuncios de la org).
2. **DashboardHeader** — header sticky (`sticky top-0 z-40 backdrop-blur-xl pt-safe`): eyebrow `brand_name`, saludo `{timeGreeting}, {firstName}` (`ClientGreeting`), fecha larga Santiago, `welcome_message` opcional. Datos: `getClientProfile`.
3. **StreakRibbonSection → StreakRibbon** — ribbon prominente de retencion. Datos: RPC `get_client_current_streak`. Si streak 0 → "Empieza tu racha hoy" (ember). Si >0 → llama pulsante + numero grande con count-up + "te faltan N para los M dias" (hitos 7/14/30/60/100/180/365) + barra de progreso al proximo hito.
4. **CheckInBanner** (variant-aware) — Datos: `getLastCheckIn`. Sin check-in → tarjeta "Registra tu primer check-in". `daysSince < 3` → null (oculto). 3-7d → warning ember "Check-in proximo". >7d → overdue danger "¡Check-in pendiente!" + `AppBadgeSync count=1`. Link → `/check-in`.
5. **HeroAndComplianceGroup → HeroSection** — el "que hago hoy". Datos: `getHeroComplianceBundle` (resuelve plan de hoy via programa/A-B/fecha asignada + logs de hoy). Dos variantes:
   - **WorkoutHeroCard** (hay entreno): Card OSCURA (inverse). Eyebrow "Hoy entrenas" + titulo del plan + "N ejercicios · M series" + **ProgressRing** (series logueadas/target, color sport). Lista de hasta 4 ejercicios con barra de progreso por bloque + "logged/sets" + check. Boton "Empezar entrenamiento" / "Continuar" / "Ver registro" → `/workout/[planId]`. Overlay verde "Entrenamiento completado" si `isAlreadyLogged`.
   - **RestDayCard** (descanso): Card sunken, luna animada, "Dia de descanso" + proximo entreno (`nextWorkoutTitle`/`Label`), link "Ver nutricion de hoy" (oculto si `nutritionEnabled=false`).
6. **CoachPresenceCard** — Card informativa (NO navega): avatar + nombre del coach + badge "Tu coach" + nota (`welcome_message` o linea fija). Datos: coach anidado en `clients`.
7. **MomentumCard** — FUSION tira semanal + 3 anillos. Datos: programa+planes+logs + `scores` del bundle. `MomentumWeekStrip` (7 dias L-D con estado hasWorkout/isCompleted/isToday) + divisor + `ComplianceRing` x3: Entrenos (sport), Nutricion (ember, oculto si `!nutritionEnabled`, "Sin datos" gris si sin logs), Check-ins (success). Grid 3-col o 2-col.
8. **ActiveProgramSection** — Datos: `getActiveProgram`+planes+logs. Sin programa → empty "Sin programa activo · pidele a tu coach". Card: nombre del programa + badge "Semana X de Y (· Sem A/B)" + `ProgramPhaseBar` (fases). **Cola de pendientes** (dias pasados sin registrar, recuperables hoy): CTA ember "Tenes N dias pendientes · Recuperar Dia X" → workout mas antiguo. `WorkoutPlanCards` (dias del programa con estado today/completed/pending/upcoming). Link "Ver entreno de hoy →".
9. **WeightWidget** (seccion "Peso y records") — Datos: `getCheckInHistory30Days`. Sin peso → empty + `WeightQuickLog`. Con datos: "Peso actual" + `WeightHeadline` (numero grande) + `TrendArrow` (up/down/stable vs promedio 7d) + fecha relativa + `WeightSparkline` (14d) + `WeightQuickLog` (registro rapido de peso).
10. **PersonalRecordsCard** — Datos: `getPersonalRecords` (max historico por ejercicio, PRs recientes 14d). Null si vacio. Card inverse "Records personales" (trophy) + `PersonalRecordsList` (grid, kg grande sport + lift + fecha + badge NUEVO). Tap → `PRDetailSheet` (progresion del lift, detalle on-demand por server action via `getExercisePRHistory`).
11. **RecentWorkoutsSection** ("Actividad reciente") — Datos: `getRecentWorkoutLogs` agrupado por dia (`buildWorkoutLogDaySummaries`, limit 5). Null si vacio. `WorkoutLogItems`. Link "Historial" → `/workout-history`.
12. **HabitsTrackerWidget → HabitsCard** ("Habitos de hoy") — Datos: `daily_habits` (agua/pasos/sueño/ayuno/suplementos). Interactivo: Agua (barra progreso 3L + chips quick-add 250-3000ml), Pasos (input numerico), Sueño (7 opciones flex 6-9h), toggles Ayuno (16h) + Suplementos. Mutacion: `upsertDailyHabits`/`getDailyHabits`. Solo editable dia de hoy.
13. **NutritionDailySummary** ("Nutricion de hoy") — Gate: `getDashboardNutritionDomainEnabled` (null si OFF). Datos: `getActiveNutritionPlan` + `getTodayNutritionBundle`. Sin plan → empty. Con plan: nombre + kcal hero (consumido/target) + badge "N restantes" + 3 `MacroBar` (P/C/G) + lista `MealCompletionRow` (toggle completar comida, optimista, offline-queue) + CTA "Ver plan completo con macros →".

**DESKTOP (`md:`) — `DashboardDesktop`**: bento 2-col (`lg:grid-cols-[1.5fr_1fr]`). Head (saludo + racha) → CheckInBanner full-width → MAIN (hero, coach, programa, actividad, habitos) + SIDEBAR sticky (momentum, peso/records, nutricion). Mismos componentes = misma data (React.cache dedup).

**WelcomeModal** (montado aparte): modal de bienvenida del coach (texto o video YouTube/Vimeo), gated por `welcome_modal_enabled` + version (localStorage `eva:welcome-dismissed-version`). Autoplay muteado con overlay "Activar sonido". Checkbox "No mostrar de nuevo". Suprimido en contexto team.

**Estados globales**: cada seccion tiene skeleton (`dashboard-skeletons.tsx`); empties propios; offline via NetworkProvider.

---

## 5. NUTRICION — `nutrition/page.tsx`
Ruta: `/c/[coach_slug]/nutrition` · La 2a pantalla mas rica. Archivos clave: `page.tsx`, `_components/NutritionShell.tsx` (~1240 lineas, el cerebro), + ~15 subcomponentes y ~10 queries/actions.

**Gate en cascada**:
1. Sin user/clientRow → login.
2. Sin plan activo → `NutritionNoPlanFromServer` (intenta copia local offline; si no, `EmptyNutritionState` "sin plan · pidele a tu coach").
3. `resolveNutritionDomainEnabled === false` (coach apago el dominio) → `NutritionDomainOff` (header + estado "Nutricion no disponible" + volver al inicio). NUNCA borra data.

**Datos (Promise.all masivo)**: `getActiveNutritionPlan`, `getNutritionLogForDate` (hoy), `getNutritionAdherence30d`, `getHeroComplianceBundle` (workout de hoy → banner contexto), `getStudentExchangeData` (modulo nutrition_exchanges/porciones), `getAssignedRecipesForClient` (recetas-idea), `getClientMealComments` (notas), `getShoppingList`, `getRecentIntakeFoods` (off-plan), `getPlanDayMicros`+`getMicroTargetsForClient` (micros), `getNutritionProEnabledForClient`, `resolveFeaturePrefs` (visibilidad por seccion → `sectionFlags`), `getNutritionWeeklyRecap`, `pdfBrandFromProxyHeaders`.

**Estructura pagina**: header sticky (`ArrowLeft` → dashboard + "Plan Nutricional" + nombre del plan + InfoTooltip) + glow decorativo. `<main max-w-lg md:max-w-5xl>`: PushNotificationBanner, WeeklyRecapCard (recap motivacional), indicaciones del coach (`<details>` colapsable), **NutritionShell**, RecipeIdeasSection (si `sectionFlags.recipes`).

**NutritionShell (cliente, motor)** — REFERENCIA RN de logging nutricional:
- **DayNavigator** (sticky): navega dias con chevrons + SWIPE horizontal (framer drag), "Hoy"/"Ayer"/fecha; dot ember si el dia tiene adherencia; "Volver a hoy". No permite futuro.
- **Layout**: mobile columna unica (orden kit: WorkoutContextBanner → banner dia historico/comidas-filtradas → **stats de un vistazo** [racha, anillos macros, micros, plato] → comidas → off-plan → notas → export → lista compras → adherencia). Desktop 2-col (comidas izq `1.5fr` + rail sticky derecho `1fr` con las mismas stat-cards).
- **Comidas — `MealCard`** (por comida, expandible): circulo de completar (44px, check animado + haptic vibrate, optimista instantaneo, solo dia hoy), nombre + kcal (con % si porcion parcial) + macros P/C/G, chips de intercambio (modulo exchanges). Expandido: ingredientes (`MealIngredientRow`, con favoritos + swaps de alimento), selector **porcion del plan** (25/50/75/100%/Plan completo), **satisfaccion** (emojis 😕😐😋).
- **MacroRingSummary**: anillos consumido/target (kcal + P/C/G), read-only en dias historicos.
- **Adherencia**: `AdherenceStrip` (30d) + `NutritionStreakBanner`.
- **Otras secciones (gated por sectionFlags)**: `MicrosPanel` (sodio/fibra + avanzados Pro), `PlatePanel` (proporcion del plato), `OffPlanLogger` (registro fuera de plan, quick-add), `NotesThread` (hilo bidireccional coach⇄alumno), `ShoppingListView` (lista compras colapsable), export (Copiar detalle/resumen WhatsApp + Descargar PDF con marca del coach).
- **Mutaciones**: `toggleMealCompletion` (serializada por comida, spam-safe, patch local instantaneo + write background + cola offline), `updateMealConsumedPortion`, `updateMealSatisfaction`, `applyMealFoodSwap`, `toggleClientFoodPreference` (favoritos), `addClientMealComment`.
- **Resiliencia offline**: read-model local (`nutrition-plan-local-cache`), cola de toggles (`nutrition-offline-queue`), banner "Sin conexion". Confetti al completar todas las comidas del dia.
- **Motor de macros**: `@eva/nutrition-engine` + `nutrition-utils` (swaps, porciones, completion-fallback).

---

## 6. EJECUCION DE RUTINA — `workout/[planId]/page.tsx`
Ruta: `/c/[coach_slug]/workout/[planId]` · **LA pantalla nucleo del producto**. `WorkoutExecutionClient.tsx` (~1978 lineas) + ~20 archivos de soporte. **La nav global se OCULTA aqui** (`.is-workout-page`, immersive).

**Datos — `getWorkoutExecutionData(planId)`** (getClaims, RLS self):
- Plan + `workout_blocks` (prescripcion polimorfica: sets/reps/target_weight/tempo/rir/rest_time/warmup_rest/notes/section/superset_group/progression + campos tipados cardio/mobility/roller: exercise_type_override, side_mode, reps/load/distance/duration, target_pace, hr_zone, interval_config) + exercise anidado (nombre/muscle/video/gif/instructions).
- Programa (fases, A/B, cycle, weeks_to_repeat), `activeWeekVariant`, `currentWeek`.
- `logs` de HOY (por bloque, con sustituciones). `previousHistory` ("sesion anterior" por exercise_id, sobrevive borrado de bloque). `lastSessionByBlock` (doble progresion). `exerciseMaxes`+`exerciseMaxDates` (PRs). `areas` (nombres de areas custom, via service-role). `cardio` (zonas FC personalizadas si modulo ON).

**Estructura (fondo oscuro `--ink-950`, `text-on-dark`)**:
- **Header sticky** (`pt-safe backdrop-blur`): boton Salir (ArrowLeft → dashboard), titulo del plan + badge "Semana A/B", subtitulo fase/dia. **Toggle segmentado "Lista / Pasos"** (`stepperEnabled`, opt-in device-scoped, `STEPPER_MODE_KEY` localStorage). Boton tuerca (Settings → descanso/alarma). **Barra de progreso** global (completionPct sport) + linea "Ejercicio X de Y · N/M series · volumen · tiempo transcurrido · %".
- **Banner offline** sticky ambar si `isOffline`.
- **Dos modos de render**:
  - **Modo Lista** (default): secciones (Calentamiento/Bloque Principal/Enfriamiento) con titulo + barra-acento; cada seccion mapea grupos (`renderGroup`) → `SingleExerciseCard` o `SupersetGroupCard`.
  - **Modo Paso a paso** (`StepperExecution`): pager UN ejercicio/superserie a la vez. Rail de progreso tappable (segmentos active/done/upcoming), botones prev/next SIEMPRE presentes, SWIPE horizontal (framer drag, `touch-action: pan-y`), transicion direccional. Auto-avance al completar. El RestTimer/header/barra quedan FUERA del pager.
- **`SingleExerciseCard`** (card por ejercicio): fila tipo·musculo + acciones (Detalles disclosure, "Cambiar" sustitucion, "Tecnica" → modal). Badge de sustitucion + deshacer. Nombre grande + dots de progreso de series / check. Prescripcion (sets×reps · kg · desc · tempo · RIR) + chip sobrecarga. **"Ultima vez"** (tap autollena la serie activa) + "Supera tu marca". Cue de tecnica. Detalles: tecnica completa/nota del coach/sobrecarga/historial. Luego N `LogSetForm` (una por serie). Para cardio/mobility/roller: `TypedTargetGrid` + `TypedBlockTimerButton` + tabla tipada.
- **`LogSetForm`** (~1079 lineas, registro de serie) + **`NumericKeypadSheet`** (teclado numerico custom bottom-sheet): captura peso/reps (o campos tipados min/metros/FC/seg/pasadas), chips de incremento de peso configurables, paso de esfuerzo RPE/RIR (`EffortScale`/`ScaleDots`), objetivo prescrito siempre visible. Optimista + reconciliacion server + cola offline (`workout-offline-queue`).
- **Timers** (`WorkoutTimerProvider`): `RestTimer` (descanso auto/manual, sonido/alarma configurable), `HoldTimer`, `IntervalTimer`, `Stopwatch`. `WorkoutTimerSettingsPanel` (auto-timer toggle + sonido). Wake-lock de pantalla (`use-screen-wake-lock`).
- **Barra "Finalizar" fija** (bottom, `pb-safe`): boton descanso manual (90s) + "Finalizar entrenamiento" → `WorkoutSummaryOverlay` (portal): resumen de sesion (series, volumen, duracion, PRs detectados con guard anti-PR-falso para sustituidos, `PRShareCardModal`, proximo hint) → volver al dashboard.
- **Sheets/modales**: `SubstituteExerciseSheet` (sustituir ejercicio por maquina ocupada, solo strength antes del 1er set), modal Tecnica (video YouTube/mp4/gif/instrucciones), Dialog descanso.
- **Mutaciones**: `logSetAction`, `revalidateWorkoutViewAction`, substitution actions. `markFirstWorkoutCompleted` (señal PWA).

**Sub-modelos puros con tests**: `session-logs.reconcile`, `session-logs.optimistic`, `session-summary`, `typed-keypad`, `muscle-map`, `workout-stepper`.

---

## 7. CHECK-IN — `check-in/page.tsx`
Ruta: `/c/[coach_slug]/check-in` · Archivos: `page.tsx`, `CheckInForm.tsx`, `_actions/check-in.actions.ts`, `_data/check-in.queries.ts`

**Datos — `getCheckInPageData`**: user (getClaims) + coach primary_color + `lastCheckIn` (weight/energy/created_at). Sin color → redirect dashboard.

**Estructura**: `min-h-dvh bg-surface-app pb-24 pt-safe`, `max-w-lg`. **Wizard 3 pasos** (`CheckInForm`, AnimatePresence direccional) — REFERENCIA RN:
- TopBar: boton atras → dashboard + "Paso X de 3" + "Check-in mensual". Stepper animado (3 barras, activa se ensancha, color del coach). Disclaimer medico (ShieldAlert).
- **Paso 1**: tarjeta "Tu ultimo check-in" (peso·energia·fecha). **Peso** con stepper +/- 0.1kg (numero grande 5xl). **Nivel de energia** slider 1-10 (accent color coach). Boton Continuar.
- **Paso 2 — FOTOS**: dos slots (frontal + espalda/perfil), aspect 3/4. `input file accept="image/*"`. **Compresion en la SELECCION** (`browser-image-compression` → JPEG, timeout 15s, convierte HEIC de iPhone), estado "Optimizando…". Preview + quitar. Gate laxo (bloquea solo no-imagenes >12MB). Nota privacidad. Opcionales.
- **Paso 3**: textarea notas (1000 chars) + tarjeta Resumen (peso/energia/fotos). Boton Enviar (con estado Enviando/Reintentar).
- **Submit — `handleAction`**: fotos ya comprimidas → **upload DIRECTO al bucket** via URL firmada (`createCheckinUploadUrlsAction`, patron anti-WAF Cloudflare: los bytes nunca pasan por eva-app.cl) → POST del check-in solo con los PATHs (`submitCheckinAction`). **Best-effort**: foto que no sube se suelta con warning; el check-in SIEMPRE sale.
- **Exito**: `SuccessWaveOverlay` (wave brandeada) + confetti + pantalla "¡Check-in enviado!" + volver al inicio. `clearAppBadge` al abrir (limpia badge PWA).

---

## 8. APRENDER (catalogo de ejercicios) — `exercises/page.tsx`
Ruta: `/c/[coach_slug]/exercises` · Archivos: `page.tsx`, `ClientExerciseCatalog.tsx`, actions/queries.

**Datos — `getClientExerciseCatalogData(q)`**: user + coachBranding + primera pagina de ejercicios (paginado server) + muscleGroups del scope + hasMore + total. Deep-link `?q=` (desde PRs del dashboard) precarga la busqueda.

**Estructura**:
- MOBILE: header sticky branded (icono Dumbbell sport + "Aprender · Tecnica de cada ejercicio").
- DESKTOP: eyebrow + titulo grande.
- **`ClientExerciseCatalog`** (cliente): barra de busqueda (48px mobile / 36px desktop inline, debounce 250ms) + chips de grupo muscular (scroll horizontal, "Todos" + grupos; activo = color del coach). **Ejercicio Destacado** (`FeaturedExerciseCard`, banner grande) solo en vista default. Grid 2-col mobile / auto-fill desktop de `ExerciseCard` (thumbnail lazy + badge musculo + nombre + equipo). Paginacion manual "Ver mas (N restantes)". Empty state.
- **Modal detalle** (bottom-sheet mobile `rounded-t-28` / centrado desktop): banner media (gif / video YouTube [`ExerciseVideo`] / mp4 / imagen / fallback play) + nombre + musculo·equipo + instrucciones numeradas (on-demand via `getExerciseInstructions`) + boton Cerrar.
- Mutaciones: `loadClientExercisesAction` (paginacion/filtro), `getExerciseInstructions`.

---

## 9. MOVIMIENTO (modulo de pago) — `movimiento/page.tsx`
Ruta: `/c/[coach_slug]/movimiento` · Gate por modulo (`getStudentMovement` → `!view.enabled` → `notFound()`). Vista read-only.

**`StudentMovementView`** (`components/movement/StudentMovementView.tsx`): header sticky (back + icono PersonStanding sport + titulo/intro i18n) + `<main max-w-2xl>`: ultimo reporte final (`AssessmentReportCard`) + `EvolutionCharts` (si ≥2 evaluaciones) + `MovementDisclaimer`. Empty: card "sin evaluaciones" + disclaimer. Datos: `MovementAssessmentWithItems[]` (solo finales, RLS self-select).

---

## 10. COMPOSICION CORPORAL (modulo de pago) — `bodycomp/page.tsx`
Ruta: `/c/[coach_slug]/bodycomp` · Gate por modulo (`getStudentBodyComposition` → `!view.enabled` → `notFound()`). Read-only.

**`StudentBodyCompositionView`** (`components/bodycomp/StudentBodyCompositionView.tsx`): header sticky (back + titulo i18n + badge "Modulo") + `<main max-w-2xl>`: switcher de metodo BIA/ISAK (solo si ambos tienen data) + summary + trend (si ≥2 mediciones, si no `NeedTwo`) + Disclaimer. Count-up + draw-in charts (reduced-motion aware). Datos: `BodyCompositionRow[]` bia/isak (RLS self-select). Empty: card + disclaimer.

---

## 11. HISTORIAL DE ENTRENOS — `workout-history/page.tsx`
Ruta: `/c/[coach_slug]/workout-history?range=` · Datos: `getWorkoutHistoryDayCounts` (RPC agregado en DB, dias con series). Default 90d ("3 meses"), extendido 180d ("6 meses") via `?range=180`.

**Estructura** `max-w-2xl`: header inline (back + icono Dumbbell theme + "Historial de entrenos · Dias con series (ultimos N meses)"). Empty: icono Calendar + "Aun no hay series registradas". Con datos: Card con `WorkoutHistoryList` (`RevealStagger`/`RevealItem` fade-up al scroll): filas dia (icono + fecha capitalizada + "N series registradas" + badge "N series"). Boton "Ver ultimos 6 meses" (si no extendido). Nota "Solo ves tus propios registros".

---

## 12. MI PERFIL — `perfil/page.tsx`
Ruta: `/c/[coach_slug]/perfil` · Pantalla completa "Mas" (destino de la fila destacada del sheet mobile).

**Datos**: streak (RPC) + `getWorkoutHistoryDayCounts(365)` (total entrenos = dias) + programa activo + `getStudentMovementNavEnabled`/`getStudentBodyCompositionNavEnabled` + `getMonthlyRecap` (sesiones/volumen del mes). brandName team-aware.

**`ProfileClient`** (`max-w-2xl`, `pt-safe`):
- Header "Mi perfil".
- **Hero identidad** (Card inverse): avatar iniciales (ring sport) + nombre + "Coach: {brand}" + badge programa activo.
- **Stats grid 2-col**: Entrenos (Dumbbell sport) + Racha (Flame ember, "dias").
- **CTA "Compartí tu logro"** → sheet selector de 3 plantillas de share-card: Progreso (`ProgressShareCardModal`), Racha (`StreakShareCardModal`), Resumen mensual (`MonthlySummaryShareCardModal`) — todas con marca del coach.
- **Apariencia**: fila Tema (`ThemeToggle`).
- **Preferencias**: Alarma de descanso (Select sonido del timer: Digital/Campana/Clasico/Boxeo, preview `playTimerSound`, localStorage `restTimerSound`).
- **Modulos** (read-only, solo entitled): filas Movimiento (`/movimiento`) + Composicion (`/bodycomp`) con badge "Ver".
- **Cuenta**: Historial de entrenos (`/workout-history`), Ayuda (`mailto:` SALES_EMAIL), Cerrar sesion.
- **Zona de peligro**: "Solicitar baja de cuenta" (`mailto:privacidad@eva-app.cl`, derechos ARCO).
- Footer version.

---

## 13. SUSPENDIDO — `suspended/page.tsx`
Ruta: `/c/[coach_slug]/suspended` · Cuenta pausada. `getSuspendedCoachData` (team-aware: usa marca del team, sin WhatsApp personal). Icono Pause (warning) + "Acceso pausado" + "{coach/equipo} pauso tu acceso · contacta a {brand}" + "tus datos estan a salvo". CTA WhatsApp del coach (si existe, no en team) + Cerrar sesion (`/auth/signout`).

---

## NOTAS TRANSVERSALES PARA PARIDAD RN

1. **Breakpoint unico `md` (760px)**: el arbol mobile (`md:hidden`) es la referencia RN 1:1. El desktop (sidebar + bento) NO aplica a RN.
2. **Nav = capsula flotante bottom "4 + Mas"** con hide-on-scroll y pildora deslizante — patron central a replicar. Se oculta en workout/login/onboarding.
3. **Theming white-label**: todo via `--theme-primary` + rampa `--sport-*`/`--ember-*`/etc. En RN esto debe mapear a `@eva/brand-kit` (`resolveBrandTheme`/`deriveSportTokens`) resuelto por coach. Gate `isBrandingAllowed(tier)` (< Pro = EVA).
4. **Gating server-side**: nutricion (master switch `resolveNutritionDomainEnabled`), movimiento + bodycomp (modulos de pago, `notFound()` si OFF), secciones de nutricion (`resolveFeaturePrefs` → sectionFlags). El nav espeja estos flags.
5. **Excepciones intencionales (solo web, NO RN)**: no hay checkout/pagos/cambio-tarjeta en el arbol alumno (esos viven en /coach y web). El arbol alumno NO tiene pantallas de pago.
6. **Offline/resiliencia** es central: NetworkProvider (bloqueo total), colas offline nutricion + workout, read-model local nutricion, drafts localStorage (onboarding), wake-lock en workout.
7. **PWA/branding**: manifest per-coach, apple splash generados, install prompt (deprecado como banner, vive como boton manual en nav/perfil). En RN esto se reemplaza por la app nativa (icono/splash = EVA-only por decision).
8. **Data flow canonico**: RSC (`_data/*.queries.ts` con React.cache + getClaims) → props → client components → server actions (`_actions/*.actions.ts`) → optimistic/offline-queue. `getClientRootUser` (getClaims, verificacion local JWT) es la raiz de auth deduped.
9. **Flujo de entrada**: `/` → login o dashboard; login → change-password (si force) | dashboard; onboarding gate (si no completo). Redirects respetan base path (`/c` | `/t` | `/e`).
10. **Wizards multi-paso** (onboarding 3, check-in 3) con AnimatePresence direccional + stepper + draft/optimismo — patron reusable en RN.

### Cosas NO encontradas / a confirmar
- No existe pantalla de "ajustes" dedicada separada de `/perfil` (ajustes = tema + sonido dentro de /perfil).
- No hay pantalla de mensajeria/chat con el coach (CoachPresenceCard es informativa; contacto = WhatsApp en suspended o notas en nutricion).
- El detalle interno de `LogSetForm`, `RestTimer`, `NumericKeypadSheet`, `WeightQuickLog`, `WorkoutSummaryOverlay`, `SupersetGroupCard`, `MacroRingSummary`, `AdherenceStrip` no se transcribio linea a linea (se leyo firma/estructura); si el plan RN los ataca, requieren lectura dedicada.
