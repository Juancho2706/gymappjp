# Inventario web — Lado COACH (núcleo) post-rediseño EVA DS

Fuente de verdad: `apps/web` (Next.js). Todas las rutas viven bajo `apps/web/src/app/coach/`.
Este informe cubre el NÚCLEO coach: dashboard, directorio de clientes, ficha del alumno
(todas las pestañas + export PDF), builder de programas (áreas dinámicas + bloques
polimórficos + drag), biblioteca de programas y ejercicios (catálogo + crear/editar + video).

Convenciones de layout compartidas (relevantes para RN):
- El shell coach (sidebar desktop / topbar / bottom-nav móvil) NO está en este informe — vive en `components/coach/*` y layout `coach/layout.tsx`. Aquí se documenta el CONTENIDO de cada pantalla.
- Patrón responsive universal en este código: bloques hermanos `className="md:hidden"` (móvil) y `className="hidden md:block"` (desktop) que renderizan estructuras DISTINTAS del mismo dato. Para RN interesa SIEMPRE la rama móvil (`md:hidden`).
- Tokens de color por CSS var: `--sport-*` (primario marca coach), `--surface-card/-sunken/-app/-inverse`, `--text-strong/-body/-muted/-subtle`, `--danger/-warning/-success/-ember-*`. Radios: `rounded-card`, `rounded-control`, `rounded-pill`, `rounded-sheet`.
- Muchos números están hardcodeados en px vía arbitrary values Tailwind (`text-[13.5px]`, `size-10`) — 1:1 con el kit de diseño.

---

## 1. DASHBOARD — `/coach/dashboard`

### Rutas y archivos
- Page RSC: `coach/dashboard/page.tsx` — `getCoach()`; si no hay coach → `redirect('/login')`. Normaliza `subscription_tier` (free/starter/pro/elite/growth/scale → default starter). Envuelve en `<Suspense fallback={<BrandCoachLoadingShell/>}>`.
- `coach/dashboard/_components/DashboardContent.tsx` — RSC: `Promise.all([getCoachDashboardDataV2(userId), listUserWorkspacesForRender(userId)])`.
- `coach/dashboard/_components/DashboardShell.tsx` — cliente, orquesta móvil vs desktop.
- Datos: `coach/dashboard/_data/dashboard.queries.ts` (`getCoachDashboardDataV2`), tipos en `coach/dashboard/_data/types.ts` (`DashboardV2Data`).

### Datos / origen (`DashboardV2Data`)
`kpi` (`KpiSummary`: mrr actual/previo/deltaPct, totalClients, riskCount, avgAdherence, avgNutrition), `activePlans`, `hasStudentSignal30d`, `clientList`, `clientPaymentSummary`, `adherenceStats[]`, `nutritionStats[]`, `recentActivities[]` (`ActivityItemClient`: type `nuevo alumno|check-in|workout`, title, href, date, photoUrl?, clientName?, reviewed?), `pendingCheckinsCount`, `expiringPrograms[]` (`ExpiringProgramItem`: id, name, endDate, clientId?, clientName?, daysLeft), `topRiskClients[]` (`RiskAlertItem`: clientId, clientName, attentionScore, flags[]), `areaData/barData` (`ChartPoint`), `agenda[]` (`AgendaItem`: kind `programa_vence|checkin_pendiente|sin_ejercicio`, label, href, dueAt), `pulse` (`DirectoryPulseRow`), `subscriptionStatus`, `currentPeriodEnd`, `trialEndsAt`.

### Estructura visual — MÓVIL (`DashboardShell.tsx`, bloque `md:hidden`, ~L106-184)
Orden vertical:
1. **Banners de billing** (`banners/BillingBanners.tsx`) con `empty:hidden` (colapsa sin avisos). Debajo: `FreeTierBanner` (si tier=free: barra progreso `used/max` alumnos + link a `/coach/subscription`) y `TeamsBridgeBanner` (si tier=elite y ≥80 alumnos: mailto EVA Teams). Ambos definidos inline en DashboardShell.
2. **Header móvil**: fila con fecha (`todayLabel()`) + `Hola, {firstName}` (font-display 28px black) a la izquierda; a la derecha 3 tiles 40px: botón Insights (icon `Sparkles`, abre `ClientStatsSheet`), `NewsBellButton` (campana con badge no-leídos + su propio Sheet), y avatar/tile de marca (`HeaderBrandTile`: logo del coach con `object-contain` o iniciales con anillo sport). Si `workspaces.length > 1` el avatar lleva caret `ChevronDown` y abre `WorkspaceSwitchSheet`; si no, es Link a `/coach/settings`.
3. **PulseHero** (`_components/PulseHero.tsx`): Card horizontal de 3 stats tocables — Activos / En riesgo / Adherencia. Cada uno: label uppercase 10.5px, número grande (`EvaCountUp`, `eva-metric` 27px, rojo si danger), delta de tendencia (`deltaView` con icono TrendingUp/Down/Minus, verde/rojo). Adherencia además muestra `Sparkline` (serie placeholder). onClick: Activos→`/coach/clients`, Riesgo→`/coach/clients?filter=risk`, Adherencia→abre insights sheet. NOTA: deltas y sparkline son PLACEHOLDERS derivados (la pipeline no calcula delta semana-a-semana).
4. **PriorityCard** (`_components/PriorityCard.tsx`) con `showNextStep`: zona oscura "Prioridad de hoy" (siempre inverse/dark). Eyebrow sport-400 + badge count. Si 0 en riesgo → estado "Ningún alumno en riesgo / Todo al día". Si hay: headline "{N} alumnos necesitan tu atención" + filas por alumno (Avatar, nombre, `flagLabel(flags[0])`, banda de riesgo con dot+label+score/100, ChevronRight) → link `/coach/clients/{id}`. Luego **NextStepInset** ("Tu próximo paso": reglas `resolveNextStep` — programas vencidos / riesgo≥3 / adherencia<60 / agenda pendiente / todo bajo control, cada uno con icono, título, CTA, href y tono warn/info/positive). Cierra con link "Ver todos en Alumnos".
5. **AgendaCard** (`_components/AgendaCard.tsx`) — items de agenda.
6. **NewsFeed** (`_components/NewsFeed.tsx`): "Novedades" con badge "{n} por revisar" (ember). Filtro segmentado pill (Todos / Por revisar / Revisados) que aparece SOLO si hay check-ins; filtra client-side items type=check-in por `reviewed`. Card lista mixta: `ProgramRow` (plan vence/venció, badge días/Vencido) y `ActivityRow` (icono por tipo o foto de check-in, texto con nombre en bold, marca revisado ✓/dot ember, timeAgo). Vacío → copy contextual.

Debajo (compartido móvil+desktop): **CoachOnboardingChecklist** (`../CoachOnboardingChecklist`, motor de onboarding con señales reales + server actions). Fuera del flujo: **DashboardFab** (`_components/DashboardFab.tsx`), y sheets `ClientStatsSheet` (adherence/nutrition stats) + `WorkspaceSwitchSheet` (solo si multi-workspace).

### Estructura visual — DESKTOP (`_components/DesktopBento.tsx`, bloque `hidden md:block`)
Bento layout: header (fecha + saludo time-aware `greeting()` + botones Importar/Nuevo alumno — este último abre `CreateClientModal`), fila de 4 KPIs tocables (Alumnos/En riesgo/Adherencia/Sesiones hoy, cada uno tile con icono tonal, EvaCountUp, delta placeholder), y grilla `1.5fr/1fr`: izquierda card oscura "Prioridad de hoy" (warroom, filas de riesgo → ficha); derecha stack `ActiveProgramsCard` (programas por vencer → ficha o `/coach/workout-programs`) + `RecentActivityCard` (workouts recientes). Nota: la PriorityCard móvil y la card oscura desktop comparten concepto pero son 2 implementaciones distintas.

### Gating
Banners por `subscriptionTier` (free/elite). Sin gating de módulos en el dashboard.

### Responsive (referencia RN)
Móvil = stack vertical de cards apiladas full-width; header propio con 3 tiles; todo tocable navega a rutas coach. Es la referencia directa para el home coach en RN.

---

## 2. DIRECTORIO DE CLIENTES — `/coach/clients`

### Rutas y archivos
- Page RSC: `coach/clients/page.tsx` — `getCoach()` + `getPreferredWorkspaceForRender`. Resuelve orgId/activeTeamId. `Promise.all([getCoachClientsWithPrograms(coachId, {orgId, activeTeamId}), headers(), getCoachClientsPulse(coachId, orgId), resolveToolsEnabled()])`. `toolsEnabled` = ≥1 de cardio/movement_assessment/body_composition activo (gate módulos + kill-switch operador; enterprise → false).
- `CoachClientsShell.tsx` — cliente. Usa `useRosterView()` (contexto del layout) para el toggle Ficha/Tabla del topbar (solo activo mientras esta pantalla está montada). Arma `pulseByClientId`.
- Datos: `coach/clients/_data/clients.queries.ts` (`getCoachClientsWithPrograms`, `getCoachClientsPulse`). Pulse row: `DirectoryPulseRow` de `services/dashboard.service` (attentionScore, percentage, nutritionPercentage, lastWorkoutDate, planCurrentWeek, planDaysRemaining, attentionFlags[]).

### Sub-componentes clave
- `CoachWarRoom.tsx` — pulso de riesgo (SOLO móvil, sobre el directorio). Con filtro de riesgo (`DirectoryRiskFilter`) y `toolsEnabled`.
- `ClientsDirectoryClient.tsx` — orquestador con TODOS los filtros/orden client-side.
- `DesktopRosterTable.tsx` — vista TABLA desktop (full-bleed).
- `CoachRosterMasterDetail.tsx` — vista FICHA desktop (master-detail: rail + panel).
- `DirRowCard.tsx` / `DirTableMobile.tsx` — tarjetas / tabla densa móvil.
- `DirectoryActionBar.tsx` — barra búsqueda+orden+filtros+view móvil.
- Modales/sheets: `CreateClientModal`, `EditClientDataModal`, `ClientActionsSheet`, `ClientsDirectoryEmpty`.

### Filtros y orden (client-side, en `ClientsDirectoryClient.tsx`)
Estado: `search`, `sortKey` (default `attention_score`), `sortDir`, `view` (cards|table), `statusFilter` (any/active/paused/pending_sync/archived), `programFilter` (any/with_program/no_program/expired), `riskFilter` (all/urgent/review/on_track/expired_program/password_reset/nutrition_low), `visibleCount` (48, botón "Cargar más"). Filtros: `matchesRiskFilter` (por attentionScore: urgent≥50, review 25-50, on_track<25), `matchesStatusFilter`, `matchesProgramFilter`. Orden: `sortClientsByKey` (`clientsDirectorySort.ts`).

### Estructura visual — MÓVIL (`ClientsDirectoryClient.tsx`, bloque `space-y-4 md:hidden`)
1. `CoachWarRoom` (arriba, `mb-8 md:hidden`, en el shell).
2. `DirectoryActionBar` (búsqueda, sort, toggle cards/table, filtros status/program/risk, archivedCount, resultCount).
3. Lista: si 0 resultados → empty con `SearchX` + "Limpiar filtros"; si `view==='table'` → `DirTableMobile` (tabla densa ordenable, onOpen→ficha, onActions→sheet); si cards → stack de `DirRowCard`.
4. **DirRowCard**: fila con `CircularProgressbar` (react-circular-progressbar) 50px con inicial del nombre + dot de última actividad (verde<3d/warning<7d/danger); nombre display 15.5px black + badge severidad (Riesgo≥50 AlertOctagon / Atención≥25 AlertTriangle / On track Check); línea meta: adherencia% mono, lastLabel (Hoy/Ayer/Hace Nd), nutrición% si en riesgo (Apple), badge estado (Pausado/Pend.sync/Archivado). Botón `MoreVertical` → `ClientActionsSheet`.
5. **FAB "Nuevo alumno"** pill fixed abajo-derecha (`bottom: safe-area+96px`) → `CreateClientModal`.

### Estructura visual — DESKTOP
Toggle Ficha/Tabla vive en el topbar (RosterViewContext). Modo `ficha` → `CoachRosterMasterDetail` (hidden md:block); modo `tabla` → `DesktopRosterTable`.
- **DesktopRosterTable**: barra búsqueda + conteo; tabla `role=grid` navegable por teclado (↑/↓/Enter) con columnas checkbox / Alumno (avatar anillo estado + programa) / Estado (StatusBadge aldia/enriesgo/atrasada) / Adherencia (barra + %) / Semana / Última sesión / chevron. Estado derivado: `rosterStatus(pulse)` = atrasada si sin actividad≥7d, enriesgo si score≥25, si no aldia. Barra de acción masiva inferior (dark) con seleccionados: Asignar programa, Mensaje (WhatsApp masivo), Exportar CSV, limpiar.
- **CoachRosterMasterDetail**: rail izquierdo 240-340px (search + count + botón Herramientas gateado por `showTools` + botón Nuevo alumno; lista de alumnos con avatar anillo estado + nombre + subtítulo programa·semana + badge estado + adherencia%). Panel derecho: carga la ficha REAL vía server action `getClientFichaPanel(id)` (cacheada por id en estado), renderiza `CoachFichaPanel` (DetailEmpty/DetailError/DetailSkeleton). Auto-selecciona el primero solo en desktop real (matchMedia).

### Mutaciones / acciones
- `ClientActionsSheet` → editar datos, WhatsApp, resetear contraseña, pausar/reactivar, archivar, eliminar (`clients/_actions/clients.actions.ts`).
- `CreateClientModal`, `EditClientDataModal`.
- Import wizard: `/coach/clients/import` (Step1Upload→Step2MapColumns→Step3Preview→Step4Confirm, `import/_actions/import.actions.ts`).

### Gating
`toolsEnabled` gatea acceso a Herramientas (hub `/coach/tools`) en rail Ficha y en WarRoom. Enterprise coach → sin Herramientas.

### Responsive (referencia RN)
Móvil = WarRoom + ActionBar + cards/tabla + FAB. NO existe master-detail en móvil (es desktop-only). RN debe replicar la rama móvil: lista de DirRowCard con filtros y FAB.

---

## 3. FICHA DEL ALUMNO — `/coach/clients/[clientId]`

Es la pantalla más grande. 5 pestañas (Resumen/Progreso/Entreno/Programa/Nutrición) + hero + export PDF. NOTA IMPORTANTE: **Facturación fue REMOVIDA del chrome de la ficha** en el rediseño (dark-only, 5 pestañas). `BillingTabB8.tsx` existe pero está desconectado del switch de tabs.

### Rutas y archivos
- Page RSC: `coach/clients/[clientId]/page.tsx` — header con back-link a `/coach/clients`, `<Suspense fallback={<ProfileSkeleton/>}>` → `ProfileContent`.
- `ProfileContent` (en page.tsx): `getClientProfileData(clientId)` (server action → `services/client/client-detail.service`) + `Promise.all` de: `getCoachNutrientTargets`, `getCoachPrivateNotes`, `getCoachMealComments`, `resolveNutritionProEnabled`, `resolveNutritionDomainEnabled`, `resolveFeaturePrefs`, `resolveClientFeaturePrefsOverrideContext`, y `hasModule` para cardio/movement_assessment/body_composition (gate por contexto del recurso: team manda, luego coach; enterprise org_id → todo false). Calcula currentWeightKg/weightDeltaKg desde check-ins.
- Renderiza `ClientProfileHero` + `ClientProfileDashboard`.
- El MISMO bundle se ensambla en `[clientId]/_data/ficha-panel.data.ts` (`assembleClientFichaPanel`) para el panel del master-detail desktop, expuesto vía `getClientFichaPanel` server action.
- Actions: `[clientId]/_actions/client-detail.actions.ts` (addPayment, deletePayment, markCheckInReviewed/unmark, getWeeklyCompliance, getDynamicMetrics, getClientNutritionForDate, getClientWorkoutForDate, updateClientGoalWeight, updateClientBiometrics, getClientWorkoutActivityDates, getClientHabitsForDate, getClientNutritionActivityDates, `getClientDossier`).

### Hero — `ClientProfileHero.tsx`
- TopBar: eyebrow "{PROGRAMA} · Semana {N}" (o "Sin programa activo") + nombre (font-display 2xl/3xl black). A la derecha: botón **Exportar PDF** (`Download`, `handleExport` → `getClientDossier(clientId)` → `downloadClientDossierPdf` de `@/lib/pdf/client-dossier-pdf`; estados exporting/Loader2, error inline) + botón `MoreVertical` → `ClientActionsSheet` (mismo del directorio).
- Hero inverse (dark) con `GlowBorderCard` (marco animado de marca): avatar con anillo de tono según status (danger/warning/success), badge de estado unificado (`deriveClientStatus`, con score en tooltip) + motivos, email, línea de meta (racha días Flame, última actividad, "Desde {mes año}", edad de entreno Target).
- 4 chips 2×2: Peso (kg + delta con TrendingUp/Down/Minus), Adherencia (% + barra), Workouts (x/y esta semana), Comidas hoy (done/total + % plan).
- Botones de módulos de pago (cardio/movement/bodycomp) — NOTA: en el rediseño se movieron; WhatsApp+check-in+builder viven en la barra flotante, módulos al final del Resumen. El hero ya no los duplica.

### Chrome de tabs — `ClientProfileDashboard.tsx` + `ProfileTabNav.tsx`
- `ProfileTabNav`: barra sticky de pills scrollables horizontalmente (label-only, sin iconos): Resumen · Progreso · Entreno · Programa · Nutrición. Pill activa = fondo sport-500 texto on-sport. Badges por tab (`ProfileTabBadges`): progress=nº check-ins, workout=nº PRs o nº historial, program=nº días de entreno, nutrition='!' si en riesgo o nº comidas. Efecto "stuck" (sombra al pegarse), fade+chevron animado a la derecha si hay overflow (móvil). Full-bleed contra gutter (`-mx-5 lg:-mx-6`).
- Cambio de tab vía `useTransition` (skeleton mientras pending), animación `AnimatePresence` framer-motion (fade+y).
- `ProfileFloatingActions.tsx`: barra flotante persistente — SOLO botón WhatsApp verde (#16A34A) full-width (los botones de check-in/builder fueron removidos). Se encoge al scrollear (>8px). Móvil: fixed sobre bottom-nav (`bottom: safe-area+96px`); desktop: sticky bottom-0.

### Pestaña RESUMEN (`overview`) — `ProfileOverviewB3.tsx` (1005 líneas)
`ProfileTopAlertBanner` (alerta calculada por `getProfileTopAlert`) + `ProfileOverviewB3`. Secciones (SectionTitle): **Cumplimiento semanal** (rings), **Métricas clave** (KPIs: Adherencia entreno, Δ Peso 30d, Peso actual…), **Programa** (resumen programa activo → abre tab Programa), **Evolución visual** (fotos check-in), **Módulos** (accesos gateados cardio/movement/bodycomp → rutas `/coach/cardio/{id}`, `/coach/movement/{id}`, `/coach/clients/{id}/bodycomp`), **Hábitos diarios**, editor de peso inicial/altura/sexo (biometrics). Props: workoutHistory, checkIns, compliance, activeProgram, lastCheckIn, checkInsWithPhotos, currentWeight, weeklyWeightVariation, moduleFlags, dailyHabitsSummary/dailyHabits, callbacks onViewNutrition/onViewProgress/onOpenProgram.

### Pestaña PROGRESO (`progress`) — `ProgressBodyCompositionB6.tsx` (1017 líneas)
Card editor de **Peso objetivo (kg)** (form → `updateClientGoalWeight`, dibuja línea punteada en la curva). Luego `ProgressBodyCompositionB6`. Secciones: **Composición corporal** (si `bodycompEnabled`), **Peso · tendencia** (curva con objetivo), **Energía media · 7 días**, **Comparativa de fotos**, **Historial de check-ins**. Props: checkIns, heightCm, goalWeight, bodyComposition, bodycompEnabled, colores de chart (grid/axis/tooltip pasados desde el dashboard según tema).

### Pestaña ENTRENO (`workout`) — `TrainingTabB4Panels.tsx` (778 líneas)
Panels + **Historial de sesiones** (SectionTitle). Debajo grid: **Récords de peso (máx. registrado)** (lista PR con peso×reps + `SharePRButton`) y **Volumen últimos 30 días** (Σ peso×reps por grupo muscular con Progress bars). Props: workoutHistory, muscleVolumeByGroup, santiagoTodayIso, colores chart. Meta = prescrito.

### Pestaña PROGRAMA (`program`) — `ProgramTabB7.tsx` (817 líneas)
Secciones: **Estructura del ciclo · {N} semanas**, **Microciclo (L–D)** o **Días del programa**. Props: activeProgram, workoutHistory, planCurrentWeek/planTotalWeeks/planDaysRemaining. Usa `resolveEffectiveWeekVariant`/`workoutPlanMatchesVariant` (A/B). Deep-link a editar en builder.

### Pestaña NUTRICIÓN (`nutrition`) — `NutritionTabB5.tsx` (1722 líneas — la más grande)
Estructura por ZONAS (hogar único de nutrición):
- **Zona A · Progreso** (`id="nutrition-zone-a-progreso"`): números canónicos del motor de adherencia (adherence30d, monthlyAvg, streak, weekly vs prev-weekly, macros hoy/target).
- **Zona B · Plan y comidas**: plan activo + lista de comidas del plan (cards colapsables por comida), ciclos, plantillas.
- **Zona C · Alertas y contexto** (coach): editor de **umbrales de micros** (bajo `nutritionProEnabled`), **nota privada del coach** (el alumno no la ve), **hilo bidireccional de comentarios** del día (Santiago), panel **"Funciones para este alumno"** (override tri-state heredar/mostrar/ocultar de secciones de nutrición).
- Gating: `nutritionDomainEnabled` (master switch por alumno; false → oculta todo), `nutritionSectionFlags` (visibilidad por sección = entitled AND wants), `nutritionProEnabled` (micros avanzados). Props enormes (ver ClientProfileDashboard L482-518): timeline, mealDetails, adherence30d, todayMacros, cycles, templatesLite, historyEntries, coachNutrientTargets/PrivateNotes/MealComments, recentCheckIns.

### Export PDF (dossier)
`getClientDossier(clientId)` (server action) → `getClientProfileDataService` + `buildClientDossier` (`services/client/client-dossier`, con URLs firmadas de fotos TTL 600s) → cliente descarga con `downloadClientDossierPdf` (`@/lib/pdf/client-dossier-pdf`, jsPDF tema oscuro). Botón en el hero.

### Sub-ruta bodycomp — `/coach/clients/[clientId]/bodycomp`
Page + `BodyCompositionTabB6b`, formularios BIA (`BiaCaptureForm`, `BiaTrendPanel`) e ISAK (`IsakCaptureForm`, `IsakResultCard`, `IsakTrendPanel`). Actions: `bodycomp/_actions/body-composition.actions.ts`. Gateado por módulo `body_composition`.

### Responsive (referencia RN)
El chrome (tabs pills scrollables sticky + barra WhatsApp flotante) es la estructura móvil. Cada tab es una columna full-width de cards. Los charts usan colores según tema (pasados por props). Para RN: replicar tabs scrollables + los 5 paneles; nutrición es el más complejo (3 zonas, gating múltiple).

---

## 4. BUILDER DE PROGRAMAS — `/coach/builder/[clientId]` (y plantillas `/coach/workout-programs/builder`)

`WeeklyPlanBuilder.tsx` = 1774 líneas, el componente más complejo del coach.

### Rutas y archivos
- Page RSC: `coach/builder/[clientId]/page.tsx` — `getBuilderData(clientId, programId)` + `getCoach()`. `searchParams`: `planId` (ignorado), `programId` (edita existente). Sin user→login; sin client→`/coach/clients`. Ruta plantilla: `coach/workout-programs/builder/page.tsx` (sin clientId → plantilla global).
- Datos: `coach/builder/[clientId]/_data/builder.queries.ts` (`getBuilderData`): resuelve workspace activo (team/enterprise/standalone) y scopea client + exercises + areas + cardio. Devuelve `{ user, client, exercises, initialProgram (con workout_plans→workout_blocks→exercises), lastEditor, areas (WorkoutArea[]), cardio (BuilderCardioContext) }`. El filtro de exercises espeja RLS (system + propios/pool, sin personales en team).
- Actions: `_actions/builder.actions.ts` (`saveWorkoutProgramAction`, `syncProgramFromTemplateAction`, `assignProgramToClientsAction`, `duplicateWorkoutProgramAction`, `deleteWorkoutProgramAction`, `getExerciseHistoryAction`).
- Hook estado: `hooks/usePlanBuilder.ts` (reducer con historia undo/redo; exporta `DAYS_OF_WEEK`, acciones addExercise, removeBlock, updateBlock, updateDayTitle, copyDay, toggleRestDay, toggleSuperset, setBlockArea, toggleBlockOverride, SET_DAYS, TRANSFER_BLOCK, MOVE_BLOCK, SET_BLOCK_AREA).
- Tipos: `types.ts` (`BuilderBlock`, `DayState`, `ProgramPhase`, `BuilderCardioContext`, `BuilderSection`).
- Áreas VM: `area-ui.ts` (`buildAreaVMs`: clásicas warmup/main/cooldown con colores fijos + paleta estable para áreas custom; fallback 3 clásicas).

### Modelo de datos (`BuilderBlock` — clave para RN)
Campos comunes: uid, exercise_id, exercise_name, muscle_group, gif/video/thumbnail_url, dayId, sets, reps, target_weight_kg, tempo, rir, rest_time, warmup_rest_time, notes, superset_group, progression_type (weight|reps), progression_value, progression_mode (weekly_linear|double|session_linear|adaptive), section (warmup|main|cooldown), section_template_id (área, preferente sobre section legacy), is_override.
**Polimórfico** (opcional, legacy intacto): exercise_type / exercise_type_override (strength|cardio|mobility|roller), side_mode (per_side|alternating), reps_value/reps_unit, load_type/load_value/load_unit, distance_value/distance_unit, duration_sec, target_pace_sec_per_km, hr_zone, instructions, interval_config, is_unilateral, extra_targets.
`DayState`: id, name, title, blocks[], is_rest?, week_variant? (A|B).

### Estado del componente
A/B mode: dos instancias `usePlanBuilder` (builderA/builderB), `activeVariant`. Program config: programName, weeksToRepeat, durationType (weeks|async|calendar_days), durationDays, startDateFlexible, startDate, programNotes, programPhases, sourceTemplateId, programStructureType (weekly|cycle), cycleLength. Autosave draft a localStorage cada 3s (`builder_draft_{id|new}`), banner de restaurar. Undo/redo (Ctrl+Z / Ctrl+Shift+Z). Onboarding tour (short/full, localStorage). `isMobile` por resize<768.

### Estructura visual
**Header** (sticky): back-link (→ ficha o templates), título programa (desktop: título + badge "cambios sin guardar" + `EditedByBadge`; móvil: tap-to-edit inline). Acciones desktop (lg+): Plantillas, Vista previa, Asignar (solo plantilla), Balance muscular, Imprimir/PDF, Undo/Redo, botón Guía (`CircleHelp`), botón **Configurar** (pill warning con ping), Sync plantilla (si vinculado), **Guardar** (o "Guardar y enviar"/"Guardar plantilla"). Tablet (md-lg): overflow dropdown ⋮. Móvil: overflow bottom-sheet ⋮ + Guardar en FAB inferior. `ProgramPhasesBar` bajo el header.

**Board** (`DndContext` con MouseSensor/TouchSensor(delay 300ms)/KeyboardSensor):
- Barra A/B: toggle "Activar semanas A/B" + selector Semana A/B; flechas scroll días (desktop).
- **Desktop**: catálogo lateral `DraggableExerciseCatalog` (350px, colapsable en tablet) + fila horizontal scrollable de `DayColumn` (300-320px c/u).
- **Móvil**: selector de días chips scrollable (con dot de estado / Moon si descanso) + carrusel swipeable (translateX) de `DayColumn` full-width (`narrowLayout`). FAB "+" (abre catálogo bottom-sheet 80dvh) + Guardar pill, stack abajo-derecha.

**DayColumn** (`components/DayColumn.tsx`): header (label día, título editable, toggle descanso Moon/Sun, copiar día — popover desktop / bottom-sheet móvil con selección de días destino, contador ej/series + dots de músculos). Cuerpo: droppable, agrupa bloques por ÁREA con `AreaDropZone` (header punteado desktop / dot+label+conteo móvil). Renderiza `ExerciseBlock` por bloque + conectores de superserie (link/unlink, badge "SS·{letra}", validación misma área). Empty state: día vacío (móvil "toca +") o zonas de área punteadas (desktop).

**ExerciseBlock** (`components/ExerciseBlock.tsx`, `useSortable`): thumbnail (`exerciseThumbnailUrl`), nombre, badge de área (shortLabel color), chip resumen: strength→"sets × reps" (editable inline doble-click, quick edit ± sets + reps) o "Incompleto" en rojo; tipos no-strength→`typedBlockSummary` con icono `EXERCISE_TYPE_META`. Chips: descanso ⏱, SS·letra, progresión ↑, grupo muscular (color). Selector de área (Popover "Mover a área" + link "Gestionar áreas" → `/coach/settings/areas`), botón ayuda (áreas + superserie). Móvil: rail de reordenar por tap (ChevronUp/Down) + mini-fila (SS toggle, Base/Modif., eliminar Trash2). Borde izquierdo color músculo.

**BlockEditSheet** (`components/BlockEditSheet.tsx`, 1000+ líneas — editor polimórfico, bottom-sheet móvil / panel lateral desktop). Selector de tipo (strength/cardio/mobility/roller de `EXERCISE_TYPE_META`). Campos por tipo:
- **strength**: Series (SeriesStepper táctil 44px), reps, target_weight, RIR/RPE, Tempo, Descanso, Descanso calentamiento (opcional), Progresión automática (weight/reps + valor), historial del ejercicio (`getExerciseHistoryAction`, solo strength+clientId).
- **cardio**: Zona de FC objetivo (chips `HR_ZONES`/zonas del alumno), Intervalos (`INTERVAL_TEMPLATES`, `interval_config`), Duración (min), Distancia, Series del bloque.
- **mobility**: Series (holds), duración/reps por lado (side_mode), Descanso entre holds.
- **roller**: Duración (seg) o pasadas.
- Comunes no-strength: instrucciones, etc.

**Diálogos**: `TemplatePickerDialog` (aplicar plantilla, maneja A/B), `ProgramPreviewDialog` (vista previa), `AssignToClientsDialog` (solo plantillas), `MuscleBalancePanel` (balance), `ProgramConfigSheet` (estructura/duración/fases/A-B), `PrintProgramDialog` (imprimir/PDF), `BuilderOnboardingTour`.

### Guardado (`handleSave`)
Valida: nombre, ≥1 ejercicio, completitud POR TIPO (`blockIncomplete`: strength exige sets+reps; cardio exige duración|distancia|intervalos; mobility exige sets+duración|reps; roller exige duración|reps), rangos numéricos. Serializa días con `sanitizeSupersets` + `effectiveAreaKey`; reps siempre poblado (strength=texto coach, otros=`legacyRepsSummaryFor`). `saveWorkoutProgramAction` con `expectedUpdatedAt` (detección de conflicto de edición concurrente en pool → toast warning "Ver lo nuevo"/"Guardar igual"). Éxito → limpia draft, redirige a ficha (`?tab=entrenamiento`) o `/coach/templates`.

### Gating
Cardio chips/plantillas gateados por `BuilderCardioContext.enabled` (módulo cardio del alumno). Áreas custom por workspace. Enterprise: sin cardio, solo áreas system.

### Responsive (referencia RN)
Móvil = selector de días chips + carrusel swipe de columnas full-width + FAB catálogo bottom-sheet + editor bottom-sheet con steppers táctiles 44px. El drag&drop existe (TouchSensor delay 300ms) pero móvil prioriza tap-to-add + rail de reordenar por tap. Es LA pantalla más costosa de portar.

---

## 5. BIBLIOTECA DE PROGRAMAS — `/coach/workout-programs`

### Rutas y archivos
- Page RSC: `coach/workout-programs/page.tsx` — `getWorkoutProgramsWithClients(coachId, {orgId, activeTeamId})` → `{programs, clients, areas}`.
- `WorkoutProgramsClientShell.tsx` → `WorkoutProgramsClient.tsx`.
- Datos: `_data/workout-programs.queries.ts`. Modelo: `ProgramListModel` (`libraryStats.ts` con `matchesProgramFilters`). Componentes: `components/ProgramRow.tsx` (`ProgramRow`/`ProgramCard`), `ProgramPreviewPanel.tsx`, `LibraryHeader/Toolbar/HeroBackdrop.tsx`.

### Estructura visual
Estado: search, filterType (all|templates|assigned), sort (Recientes|Nombre). Filtros/orden client-side.
- **Móvil**: header "Biblioteca / Programas" + botón "Nueva"; nav a Ejercicios (`/coach/exercises`) y Áreas (`/coach/settings/areas`); búsqueda + orden (popover); tabs-stats accionables (Todos/Plantillas/En curso con contadores `eva-metric`); lista de `ProgramRow` → abre `ProgramPreviewPanel`. Empty state contextual (`LibraryEmptyState`).
- **Desktop**: header con botones Ejercicios/Áreas/Nueva plantilla; chips filtro; grid `auto-fill minmax(240px)` de `ProgramCard`.

### Mutaciones (via builder.actions)
- **Asignar programa** (`assignProgramToClientsAction`): dialog desktop / bottom-sheet móvil. Selección de alumnos (con badge "Con plan"), config: Inicio (Hoy/Fecha/Flexible), Duración (semanas), Días a copiar (Lun-Dom, filtro 1-7). Confirmación de sobreescritura si el alumno ya tiene plan activo. `InfoTooltip` con explicación.
- **Duplicar** (`duplicateWorkoutProgramAction`): dialog con nombre único (2-100 chars).
- **Sincronizar desde plantilla** (`syncProgramFromTemplateAction`): AlertDialog (respeta bloques override).
- **Eliminar** (`deleteWorkoutProgramAction`): AlertDialog.
- `ProgramPreviewPanel`: acciones Editar (→ builder), Asignar, Duplicar, Sync, Eliminar.

### Responsive (referencia RN)
Móvil = header + nav chips + búsqueda + tabs-stats + lista de ProgramRow + preview panel (bottom-sheet). Asignar = bottom-sheet.

---

## 6. EJERCICIOS — `/coach/exercises`

### Rutas y archivos
- Page RSC: `coach/exercises/page.tsx` — `getCoach()` + `getCoachOrgContext()` + workspace. `canCreateExercises` = team member true; enterprise coach false (solo org admin). `getExerciseCatalog(coachId, orgId, activeTeamId)` → `{globalExercises, customExercises, byMuscle}`.
- `ExerciseCatalogClient.tsx`. Componentes: `_components/ExerciseCreateButton.tsx`, `ExerciseFormModal.tsx`, `ExerciseMediaPicker.tsx`.
- Datos: `_data/exercises.queries.ts` (`getExerciseCatalog`, filtro RLS-espejo: system + team/org/coach). Actions: `_actions/exercises.actions.ts` (`createExerciseAction`, `updateExerciseAction`), `exercise-media.actions.ts`.
- Video: `components/exercise/ExerciseVideo.tsx` (player YouTube con start/end), `@/lib/youtube` (`extractYoutubeVideoId`, `exerciseThumbnailUrl`).

### Estructura visual — `ExerciseCatalogClient.tsx`
- Filtros (card): búsqueda (deep-link `?q=` desde topbar), Select grupo muscular (`MUSCLE_GROUPS`), toggles "Personalizados" y "Con video" (video = YouTube ID válido, NO gif de ExerciseDB en video_url).
- Lista agrupada por grupo muscular (colapsable, `AnimatePresence`): cada ejercicio = chip botón (dot animado si tiene media) → abre `ExercisePreviewModal`. Botón `ExerciseCreateButton` (si `canCreateExercises`). Empty state con limpiar filtros.
- **ExercisePreviewModal**: área media (player YouTube `ExerciseVideo` con recorte start/end, o img directa gif/image_url, o placeholder), título, badges (grupo muscular, equipo, músculos secundarios), instrucciones numeradas (limpia prefijo "Step:N"), preview "Vista del alumno" (thumbnail), badge de origen (personalizado/catálogo global ExerciseDB).

### Crear/editar — `ExerciseFormModal.tsx`
Dialog con `useActionState`. Campos: nombre, grupo muscular (`MUSCLE_GROUPS`), equipo (`EQUIPMENT_OPTIONS`), dificultad (beginner/intermediate/advanced), **tipo polimórfico** (`EXERCISE_TYPE_OPTIONS`: strength/cardio/mobility/roller), músculos secundarios, instrucciones (Textarea), y **ExerciseMediaPicker** (`MediaValue`) con recorte de video (mm:ss ↔ segundos: `video_start_time`/`video_end_time`).

### Gating
`canCreateExercises`: standalone/team member sí; enterprise coach no (solo org admin). Catálogo scopeado por workspace (system + team/org/coach), personales NO listados en contexto team (anti-fantasma).

### Responsive (referencia RN)
Filtros apilables (`flex-col md:flex-row`); grupos colapsables; modal preview con video. RN: catálogo con búsqueda+filtros+grupos colapsables + preview con player YouTube y crear/editar con media picker.

---

## Notas transversales para paridad RN

1. **Doble render móvil/desktop**: cada pantalla tiene ramas `md:hidden` (móvil, la referencia RN) y `hidden md:block` (desktop). Las vistas desktop-only (master-detail de directorio, tabla roster, catálogo lateral del builder) NO se portan tal cual.
2. **Datos vía server actions / RSC queries**: RN consume estos datos por endpoints `api/mobile/coach/*` (ver `api/mobile/coach/dashboard`, `/clients`, `/clients/[clientId]`, `/payments`, `/slug`, `/support`). Verificar que esos endpoints devuelvan la forma que el rediseño necesita (el gap funcional está en `docs/audits/rn-web-parity-2026-06-21.md`).
3. **Gating de módulos** (cardio/movement/body_composition/nutrition_exchanges) es central en ficha, builder y directorio (`toolsEnabled`). Se resuelve server-side con `hasModule`/`resolveFeaturePrefs` por contexto del recurso (team manda). RN debe replicar el gate o recibirlo resuelto.
4. **Excepciones intencionales confirmadas en el código**: Facturación fue removida del chrome de la ficha (5 tabs). Checkout/pagos no aparecen en estas pantallas núcleo (viven en `/coach/subscription`, solo web).
5. **Componentes con dependencias web-only a re-implementar en RN**: `react-circular-progressbar` (DirRowCard), `@dnd-kit` (builder — RN usa otra lib DnD o tap-first), `framer-motion` (animaciones tabs/listas → Reanimated), jsPDF (`downloadClientDossierPdf` — el PDF es descarga de navegador; RN necesitaría share/print nativo o mantener export solo-web), `recharts`/charts (curvas peso/volumen/energía).
6. **Rutas de navegación coach usadas por links** (para el router RN): `/coach/clients`, `/coach/clients?filter=risk`, `/coach/clients/{id}`, `/coach/clients/{id}/bodycomp`, `/coach/builder/{clientId}?programId=`, `/coach/workout-programs`, `/coach/workout-programs/builder`, `/coach/exercises`, `/coach/cardio/{id}`, `/coach/movement/{id}`, `/coach/settings`, `/coach/settings/areas`, `/coach/subscription`, `/coach/tools`.

### Archivos NO leídos exhaustivamente (referencia, no cubiertos línea a línea)
- Interior completo de los 5 paneles de tab de ficha (ProfileOverviewB3 1005L, TrainingTabB4Panels 778L, ProgramTabB7 817L, ProgressBodyCompositionB6 1017L, NutritionTabB5 1722L) — se documentaron props, secciones (SectionTitle) y data-origin, no cada sub-card.
- `usePlanBuilder.ts` (reducer) — se documentó su API pública, no la implementación del reducer/historia.
- `BlockEditSheet.tsx` — leídas ~130L + grep de secciones por tipo; la estructura polimórfica está mapeada pero no cada input.
- `AgendaCard`, `DashboardFab`, `ClientStatsSheet`, `WorkspaceSwitchSheet`, `CoachWarRoom`, `DirectoryActionBar`, `DirTableMobile`, modales de cliente, `ProgramRow/ProgramCard`, `ProgramPreviewPanel`, `ExerciseMediaPicker` — identificados por rol/ruta, no leídos completos.
