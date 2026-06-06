# Auditoría de paridad — RN mobile (coach standalone) ↔ web/PWA/responsive

> **Documento vivo.** Se audita menú por menú el coach **standalone** comparando RN (`apps/mobile`) contra web (`apps/web`): **código a código, visual a visual, función a función**. Se completa de a poco; cada menú tiene su sección con hallazgos priorizados y acciones.

- **Fecha inicio:** 2026-06-05
- **Alcance:** solo coach standalone (no enterprise/alumno).
- **Fuentes:** `apps/mobile/app/coach/**` vs `apps/web/src/app/coach/**` + servicios/queries compartidos.
- **Regla:** la web es la referencia de función; RN puede mejorar UX móvil pero no perder datos/funciones.

## Leyenda de estado
- ✅ **Paridad** — función + datos equivalentes (visual puede diferir por plataforma).
- 🟡 **Parcial** — falta parte de función/datos o difiere material.
- 🔴 **Gap** — falta función/pantalla o bug que rompe paridad.
- 🔵 **Mejora RN** — RN supera a la web (dejar constancia).

## Severidad de hallazgos
- **S1** rompe función/datos (el coach ve algo incorrecto o vacío).
- **S2** degradación o divergencia notable (UX/visual/edge-case).
- **S3** cosmético / nice-to-have.

---

## Tracker maestro (menús coach standalone)

| # | Menú | Ruta RN | Ruta web | Estado | Auditado |
|---|------|---------|----------|--------|----------|
| 1 | **Dashboard** | `(tabs)/home.tsx` | `coach/dashboard` | 🟡 Parcial | ✅ (este doc) |
| 2 | **Alumnos** | `(tabs)/clientes.tsx` + `cliente/[id]` | `coach/clients` | 🟡 Parcial | ✅ (este doc) |
| 3 | **Programas** | `(tabs)/builder.tsx` + `program-builder.tsx` | `coach/builder` · `workout-programs` · `templates` | 🟡 Parcial | ✅ (este doc) |
| 4 | **Ejercicios** | `(tabs)/ejercicios.tsx` | `coach/exercises` | 🟡 Parcial | ✅ (este doc) |
| 5 | **Nutrición** | `(tabs)/nutricion.tsx` + `nutrition-builder.tsx` + `foods.tsx` | `coach/nutrition-plans` · `nutrition-builder` · `foods` · `recipes` · `meal-groups` | 🟡 Parcial | ✅ (este doc) |
| 6 | **Mi Marca** (settings) | `(tabs)/settings.tsx` | `coach/settings` | 🟡 Parcial | ✅ (este doc) |
| 7 | **Suscripción** | `(tabs)/subscription.tsx` | `coach/subscription` | 🟡 Parcial | ✅ (este doc) |
| 8 | **Soporte** | `(tabs)/support.tsx` | `coach/support` | 🟡 Parcial | ✅ (este doc) |
| 9 | **Huérfanos** | `(tabs)/check-ins.tsx`, `(tabs)/perfil.tsx` | `coach/*` | 🔴 Gap (sin nav) | ✅ (este doc) |

### Hallazgos transversales (todos los menús)
- **TX-1 (S2):** patrón de *catch silencioso* en fetches que degrada a vacío/local sin avisar (pulse de Alumnos — **ya corregido** `ff7f7d9`; **fallback del dashboard**, ver D-F1; **soft-errors de Supabase** no inspeccionados en `clients-directory.ts:135` y `coach-client-detail.ts:498-582`, ver A-F19). Los `.data ?? []` que ignoran `.error` son la variante más sutil (no lanzan). Auditar en cada menú.
- **TX-2 (S2):** menús **huérfanos** `check-ins.tsx` (218) y `perfil.tsx` (305) existen pero no tienen entrada de navegación.
- **TX-3 (S3):** botón **Bell/Noticias** del header (`CoachMobileChrome`) sin `onPress` = muerto. Web tiene novedades.
- **TX-4 (S2):** **org scoping implícito** — varias queries RN consultan Supabase **directo client-side** con `coach_id` pero **sin filtro `org_id` explícito** (dependen solo de RLS), y a veces sin `coach_id` en subqueries (visto en Alumnos: `clients-directory.ts:121`, `coach-client-detail.ts`, ver A-F7). La web filtra `org_id` en todo path. Auditar en cada menú con datos org-scoped.
- **TX-5 (S2):** **acciones sensibles sin diálogo de confirmación** en RN — reset-password y toggle-status disparan inmediato al tap (web usa `AlertDialog`), ver A-F11. Revisar toda mutación destructiva/irreversible en cada menú.
- **TX-6 (S2):** **lógica/validación compartida no reutilizada** — RN reimplementa fórmulas/validación localmente en vez de usar `packages/schemas` (Zod) + `packages/types`, y guarda **sin Zod** (solo checks ad-hoc). Anti-drift roto: RN puede persistir payloads que el validador web rechaza (visto en nutrición: macro-formula duplicada 3×, writes sin Zod, ver N-F19/N-F26). Auditar reuso de `packages/*` en cada feature con mutaciones.
- **TX-7 (S2):** **tier-gating ausente en RN** — features premium no verifican el límite de plan (`canUseNutrition`/`coach-tiers`) que la web sí bloquea con upsell (visto en Nutrición, N-F2; Programas, P-F11). Un coach de tier inferior accede a features de pago en móvil. Auditar cada feature gated por tier en cada menú.
- **TX-8 (S1/S2):** **mutaciones multi-tabla sin atomicidad ni capa de servicio** — RN ejecuta escrituras multi-tabla (delete-then-reinsert) **directo en el device** sin server action ni transacción → estado parcial ante fallo a mitad. Además suele **no desactivar el recurso activo previo** al crear uno nuevo (doble activo). Visto en Programas (`persistProgram`, P-F2/P-F14) y Nutrición (`saveClientPlan`/`propagateTemplate`, N-F15). Web usa server actions/`service` con validación. Auditar toda mutación multi-tabla en cada menú.
- **TX-9 (S1):** **ghost settings** — RN expone UI que **configura y persiste** un campo que su capa de render **ignora**: el coach ve el cambio en un preview/score local pero **no surte efecto real** para el alumno (falsa confianza). Visto en Mi Marca (loader: `EvaLoader` ignora `loader_text`/`loader_icon_mode`/`loader_text_color`, M-F1). Patrón probable donde RN portó la UI de config antes que el render. Por cada setting RN, verificar que exista un consumidor que lo renderice.

---

## 1. Dashboard (coach home)

### 1.1 Mapa de archivos

**Web** (`apps/web/src/app/coach/dashboard/`)
- `page.tsx` → `_components/DashboardContent.tsx` (RSC, `getCoachDashboardDataV2`) → `_components/DashboardShell.tsx` (client, layout + sheets).
- Secciones: `banners/BillingBanners`, `header/{GreetingHeader,QuickActionsBar}`, `CoachOnboardingChecklist`, `kpi/{KpiStrip,KpiTile}`, `focus/FocusList`, `cs/NextBestAction` (+ `_lib/nextBestAction.rules.ts`), `today/TodayAgenda`, `expiring/ExpiringPrograms`, `activity/ActivityFeed`, `@/components/coach/dashboard/DashboardCharts`, `sheets/{ClientStatsSheet,RevenueSheet}`, `FreeWelcomeModal`, `_components/payments/QuickAddPaymentModal`.
- Contrato de datos: `_data/types.ts → DashboardV2Data`.

**RN** (`apps/mobile`)
- `app/coach/(tabs)/home.tsx` (orquesta) → `components/coach/CoachDashboardSections.tsx` (3384 líneas, todas las `Mobile*`).
- Data: `lib/coach-dashboard.ts` (`getCoachDashboardDataMobile` con endpoint + fallback local; `MobileDashboardData`).
- Endpoint: `apps/web/src/app/api/mobile/coach/dashboard/route.ts` (reusa el cálculo web).

### 1.2 Composición / orden de secciones

| Orden | Web (`DashboardShell`) | RN (`home.tsx`) | Estado |
|------|------------------------|-----------------|--------|
| 1 | BillingBanners + Free/Growth banners | `MobileBillingBanners` + `MobileTierUsageBanners` | ✅ |
| 2 | GreetingHeader + QuickActionsBar + **AppOnlyBadge** | `MobileGreetingHeader` + `MobileQuickActionsBar` | ✅ (AppOnlyBadge N/A en app — correcto omitir) |
| 3 | CoachOnboardingChecklist | `MobileOnboardingChecklist` (+ free plan, loop strip, twin panels, carousel, nutrition tier block) | 🔵 RN más completo |
| 4 | KpiStrip (4 tiles) | `MobileKpiStrip` (4 tiles) | ✅ |
| 5 | FocusList (8/12) + NextBestAction (4/12) | `MobileFocusList` + `MobileNextBestAction` | ✅ (stack vertical en móvil) |
| 6 | TodayAgenda (8/12) + ExpiringPrograms (4/12) | `MobileTodayAgenda` + `MobileExpiringPrograms` | ✅ |
| 7 | ActivityFeed | `MobileActivityFeed` | ✅ |
| 8 | DashboardCharts (area+bar) | `MobileDashboardCharts` (area+line+bar, scrub Skia) | 🔵 RN scrub táctil |
| — | ClientStatsSheet, RevenueSheet, FreeWelcomeModal | `MobileClientStatsSheet`, `MobileRevenueSheet`, `MobileFreeWelcomeModal`, **`MobilePublicCodeRequiredModal`** | 🔵 RN extra (confirmación de invite code) |

**Veredicto composición:** ✅ todas las secciones del web están + RN agrega onboarding más rico, scrub en charts y el modal de invite-code. Orden equivalente (en móvil los grids 8/4 se apilan).

### 1.3 Capa de datos (función)

Web: `getCoachDashboardDataV2(userId)` → `DashboardV2Data` (kpi, activePlans, hasStudentSignal30d, clientList, clientPaymentSummary, **adherenceStats**, **nutritionStats**, recentActivities, expiringPrograms, topRiskClients, areaData, barData, agenda, pulse, subscriptionStatus, currentPeriodEnd, trialEndsAt).

RN: `getCoachDashboardDataMobile()` con **2 caminos**:
1. **Endpoint** `/api/mobile/coach/dashboard` → `mapApiDashboard` → rico (merge adherence+nutrition en `clientStats`). ✅ ~paridad.
2. **Fallback local** `getCoachDashboardDataMobileLocal()` si el endpoint tira error (try/catch).

Diferencias de contrato:
- RN fusiona `adherenceStats`+`nutritionStats` → `clientStats` (para el sheet). ✅ equivalente.
- RN **no** expone `subscriptionStatus/currentPeriodEnd/trialEndsAt` en `MobileDashboardData`; el banner usa `coach.*` (`MobileBillingBanners`). ✅ **Verificado:** `CoachProfile` (lib/coach.ts) sí trae `subscriptionStatus`, `currentPeriodEnd`, `trialEndsAt`, `hasCoachLogo` (select de `subscription_status/current_period_end/trial_ends_at/logo_url`). Banner con datos correctos.
- RN agrega `coach`, `publicCode`, `onboardingGuide` (necesarios para onboarding + modal invite). 🔵

### 1.4 Sección por sección

**Billing banners** — `MobileBillingBanners` replica estados web: `blocked` (cancelado + período vencido), `canceledGrace` (cancelado con días restantes + recomendación de tier), `trialActive`. ✅ Lógica equivalente. Nota: usa `coach.subscriptionStatus/currentPeriodEnd/trialEndsAt` (ver D-F2).

**Tier usage banners** — Free (`used/max` + barra + "Ver planes/Expandir límite") y Growth (elite ≥48). ✅ 1:1 con `FreeTierBanner`/`GrowthUpgradeBanner` web.

**Greeting + QuickActions** — saludo por hora + fecha es-ES + pendingCount. QuickActions: `+Alumno` (modal crear), `+Programa` (builder), `+Nutrición` (nutricion), `+Pago` (modal). ✅ Web QuickActionsBar idem. 🔵 RN: el alta de alumno/pago vive inline (modales nativos) — buena UX.

**Onboarding checklist** — 4 pasos (marca, alumno, plan, señal de uso) con auto/ manual-complete, telemetría (`onboarding_event`), free plan box, loop strip, twin panels (panel coach / app alumno), carousel, nutrition tier block. ✅+🔵 más completo que web. Persiste en AsyncStorage + endpoint.

**KPI strip** — 4 tiles: Ingresos del mes (+delta% vs anterior), Alumnos activos, En riesgo, Adherencia (hint Nutrición %). ✅ mapea `KpiSummary`. Tap: Ingresos→RevenueSheet, Alumnos→clientes, Riesgo/Adherencia→StatsSheet.

**FocusList** — top alumnos en riesgo con `attentionScore` (pill ámbar) + label + tap→perfil. ✅ equivalente a `FocusList` web.

**NextBestAction** — `resolveMobileNextBestAction` es **port verbatim** de `nextBestAction.rules.ts` (mismas reglas/umbrales/orden: vencidos → ≥3 riesgo → adherencia<60 → MRR≤-10% → agenda>0 → todo-ok). ✅ 1:1. CTAs ruteadas a equivalentes RN.

**TodayAgenda** — items con icono por `kind` (programa_vence/checkin_pendiente/sin_ejercicio) + tap→perfil. ✅.

**ExpiringPrograms** — pill "Vencido"/"Nd" + tap. ✅.

**ActivityFeed** — nuevo alumno / check-in (con foto) / workout + `timeAgo`. ✅. Nota fallback: el local sintetiza actividad básica.

**Charts** — `MobileSessionsChart` (área+línea 30d, scrub) + `MobileGrowthChart` (barras 6m). ✅ datos = `areaData`/`barData` (mismos builders que web). 🔵 scrub táctil Skia.

**Sheets** — `MobileRevenueSheet` (kpi + clientPaymentSummary) y `MobileClientStatsSheet` (clientStats: adherencia/nutrición/peso/streak/energía). ✅ con endpoint. ⚠️ con fallback local el sheet queda pobre (ver D-F1).

### 1.5 Hallazgos del Dashboard

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **D-F1** | **S1** | **Fallback local degradado + silencioso** | Si `/api/mobile/coach/dashboard` falla, `getCoachDashboardDataMobileLocal` devuelve datos pobres: adherencia **heurística** (100/65/45/0), `avgNutrition=0`, `clientStats` sin `weightHistory30d`/`adherenceHistory4w`/`streak`/`energy`/`oneRMDelta` → **ClientStatsSheet con sparklines vacíos** y KPI "Adherencia/Nutrición" engañosos. No se avisa al usuario (catch). | Mostrar estado "datos limitados / reintentar" cuando se usa el fallback (igual que el fix de pulse en Alumnos). Idealmente reintentar el endpoint antes de degradar. |
| **D-F2** | ~~S2~~ ✅ | Banner de billing vía `coach.*` — **OK** | `MobileBillingBanners` usa `coach.subscriptionStatus/currentPeriodEnd/trialEndsAt`. **Verificado:** `CoachProfile` los trae (select `subscription_status/current_period_end/trial_ends_at`). Sin gap. | Ninguna. |
| **D-F3** | S3 | NBA href web `/coach/programs` no existe | En web `nextBestAction.rules` el CTA de "vencidos" apunta a `/coach/programs` (la ruta real es `workout-programs`). RN ya rutea bien a `builder`. | Cosmético web; RN OK. Anotar para fix web. |
| **D-F4** | S3 | Fondo ambiental | Web `AmbientBackground` (blobs + grid). RN usa `CoachMainWrapper`. | Verificar que el wrapper tenga el fondo de marca (paridad visual). |
| **D-F5** | S2 | `recentActivities` fallback limitado | El local arma actividad solo de clients/checkins/workouts recientes (sin la riqueza del endpoint). | Cubierto por D-F1 (mismo origen). |

### 1.6 Veredicto Dashboard
**🟡 Parcial.** Estructura, secciones, KPIs, NBA y charts en **paridad (o mejor que web)**. El único riesgo real es **D-F1 (S1)**: cuando el endpoint falla, el dashboard degrada en silencio a datos heurísticos/vacíos (sparklines del StatsSheet vacíos, adherencia/nutrición engañosas). D-F2 verificado OK. Resto cosmético (D-F3/F4 S3). **Acción única recomendada: D-F1.**

---

## 2. Alumnos (coach clients — directorio + detalle)

> **Menú compuesto.** Cubre 2 pantallas RN: **directorio** (`(tabs)/clientes.tsx`) y **detalle** (`cliente/[clientId].tsx`) con sus **6 sub-tabs** (Resumen/Progreso/Análisis/Plan/Nutrición/Pagos), más todas las mutaciones CRUD. Consolida el trabajo previo de sesiones anteriores (handoff RN + commit `ff7f7d9` + el audit coarse `apps/mobile/AUDIT_RN_vs_WEB.md` 2026-06-02, ahora **superado** por esta pasada granular).
>
> **Consolidación previa:** la fila de Alumnos venía marcada "✅ sesiones previas (consolidar)" sin sección escrita. El directorio (lista/cards + 4 endpoints mobile bearer+service-role) y los panels de detalle se construyeron entre 2026-05-26 → 06-04. El **silent-catch del pulse ya está cerrado** (`ff7f7d9`: banner "Reintentar"), así que **no se re-abre** (ver TX-1). Esta sección documenta lo que **sigue abierto**.

### 2.1 Mapa de archivos

**Directorio — Web** (`apps/web/src/app/coach/clients/`)
- `page.tsx` (RSC) → `CoachClientsShell.tsx` (estado `riskFilter` compartido) → `CoachWarRoom.tsx` (panel triage: 6 stat-cards + banners + portal + crear) + `ClientsDirectoryClient.tsx` (search/sort/filtros/toggle vista) → `DirectoryActionBar.tsx`, `ClientsDirectoryTable.tsx` (tabla virtualizada `@tanstack/react-virtual`), `ClientsDirectoryEmpty.tsx`, `ClientCardV2` (grid).
- Datos: `_data/clients.queries.ts` (RSC `React.cache`: clients + pulse cacheado, **filtra `org_id`**). Lógica: `clientsDirectorySort.ts`, `directory-types.ts`.
- Mutaciones/modales: `CreateClientModal`, `EditClientDataModal`, `ArchiveClientButton`, `DeleteClientButton`, `ResetPasswordButton`, `ToggleStatusButton`, `import/` (wizard CSV 4 pasos). Server actions: `_actions/clients.actions.ts`.

**Directorio — RN** (`apps/mobile`)
- `app/coach/(tabs)/clientes.tsx` (1093 líneas, todo inline: screen + `ClientRow` lista + `OptionSheet` sort/filter + `CreateClientModal`).
- `components/coach/ClientCard.tsx` (vista cards, ≈ `ClientCardV2`).
- Datos: `lib/clients-directory.ts` (query Supabase **directa client-side** + `filterClients`/`sortClients`/`buildStats`). Acciones: `lib/client-actions.ts` (WA/share/delete/reset/status vía `/api/mobile/coach/clients/*`).

**Detalle — Web** (`apps/web/src/app/coach/clients/[clientId]/`)
- `page.tsx` (RSC, `getClientProfileData`) → `ClientProfileHero.tsx` + `ClientProfileDashboard.tsx` (909 líneas, estado de tabs + analítica inline). `ProfileTabNav.tsx`, `ProfileTopAlertBanner.tsx` (+ `getProfileTopAlert.ts`), `ProfileFloatingActions.tsx`.
- Tabs: `ProfileOverviewB3`, `TrainingTabB4Panels` (Análisis), `ProgramTabB7` (Plan), `NutritionTabB5` (+ `NutritionCoachAlertsPanel`, `NutritionCheckinContextCard`, `NutritionCycleHistorySection`), `ProgressBodyCompositionB6`, `BillingTabB8`. Print: `progress-print/page.tsx`.

**Detalle — RN** (`apps/mobile`)
- `app/coach/cliente/[clientId].tsx` (417 líneas, orquesta: `getCoachClientDetail`, derived memo, tabs, FAB, PaymentForm + EditClientForm dialogs, `exportProgressPdf`).
- `components/coach/clientDetail/`: `ClientHero`, `ClientTabBar`, `OverviewTab`, `ProgresoTab`, `AnalisisTab`, `PlanTab`, `NutricionTab`, `FacturacionTab`, `WeeklyPRBanner`, `shared.tsx`. Datos: `lib/coach-client-detail.ts` (Supabase **directo**), `lib/progress-pdf.ts` (expo-print).

**Nota estructural:** RN está **mejor factorizado** en el detalle (un archivo por tab) que la web (Overview vive inline dentro del dashboard de 909 líneas). El gap no es de arquitectura sino de cobertura de función/datos.

### 2.2 Composición / orden

**Directorio**

| # | Web (WarRoom + Directory) | RN (`clientes.tsx`) | Estado |
|---|---------------------------|---------------------|--------|
| 1 | H1 "Directorio" + subtítulo + botón **sync** | `ScreenHeader` "Alumnos" + `{active} activos · {total}` + pull-to-refresh | ✅ |
| 2 | **Portal alumnos** (loginUrl click-to-copy) | — | 🔴 (A-F25) |
| 3 | Botón **Nuevo Alumno** (header) | **FAB** flotante (UserPlus) | ✅ |
| 4 | **6 stat-cards** (Total/Activos/Atención/Riesgo/**Avg Adher.**/**Nutri. baja**) | **6 StatTiles** (Total/Activos/Atención/Riesgo/**On track**/**Sin plan**) | 🟡 (A-F10) |
| 5 | Banners triage: urgent, expired, pendingPassword, **nutritionLow**, **noCheckin1m** | Banners: urgent, expired, sync **+ pulseError "Reintentar"** 🔵 | 🟡 (A-F10) |
| 6 | ActionBar: search ⌘K, Filtros (3 dim.), Sort (6), toggle grid/tabla | Search + 3 icon-btns (toggle vista, filtro estado, sort) | 🟡 (A-F8/F9) |
| 7 | Tabla virtualizada (default) **o** grid `ClientCardV2` | FlatList `ClientRow` (default) **o** cards `ClientCard` (stack anim 🔵) | 🟡 (A-F4) |
| 8 | Empty state (Lottie + crear) | Empty state (icono Users) | ✅ |

**Detalle** — 6 tabs, **mismo orden y concepto de íconos** en ambos lados (mapeo 1:1, sin tabs huérfanos):

| Orden | RN (`ClientTab`) | Web (`ProfileTabNav`) | Estado |
|------|------------------|------------------------|--------|
| 1 | `overview` "Resumen" | `overview` (Overview B3) | ✅ |
| 2 | `progreso` "Progreso" | `progress` (B6) | ✅ |
| 3 | `analisis` "Análisis" | `workout` (B4) | ✅ |
| 4 | `plan` "Plan" | `program` (B7) | ✅ |
| 5 | `nutricion` "Nutrición" | `nutrition` (B5) | ✅ |
| 6 | `facturacion` "Pagos" | `billing` (B8) | ✅ |

**Veredicto composición:** estructura macro en paridad (6 tabs 1:1, directorio con cards ≈ web). Las divergencias son de **densidad de la vista lista**, **filtros/sort**, y **profundidad de cada tab** — no de arquitectura.

### 2.3 Capa de datos (función)

**Directorio** — Web: `getCoachClientsWithPrograms` + `getCoachClientsPulse` (RSC, server-side, `org_id`-aware, pulse rico cacheado). RN: `getCoachDirectoryClients()` (`clients-directory.ts:110`) consulta Supabase **directa client-side** + `getCoachDirectoryPulse()` → `/api/mobile/coach/clients/pulse`.

- **Org scoping (A-F7 / TX-4):** RN filtra solo `.eq('coach_id', coach.id)` (`clients-directory.ts:121`), **sin `org_id` explícito** (la web lo filtra en todo path). Los subqueries `workout_logs`/`check_ins` (`:123-132`) **no tienen filtro `coach_id`** — traen todo lo que permita RLS y unen por `client_id` en memoria. Funciona si RLS scoping es correcto, pero viola la convención de filtrado explícito y la regla de no bypassear el repository layer.
- **Doble fuente de `attentionScore` (A-F6):** RN calcula score/flags **localmente** (`clients-directory.ts:158-184`, fórmula aditiva propia + enum `AttentionFlag` distinto al de la web) **y** recibe el del pulse. La **lista** (`ClientRow`) usa el local; las **cards** usan el del pulse → mismo alumno puede mostrar distinto score según vista. La web usa pulse en ambas.
- **`PulseRow` subset:** RN tipa 13 de ~21 campos del `DirectoryPulseRow` web; descarta `oneRMDelta`, `planDaysRemaining` autoritativos en favor de su cálculo local.

**Detalle** — Web: `getClientProfileData` (RSC, rico). RN: `getCoachClientDetail()` (`coach-client-detail.ts:424`) — **NO** llama al endpoint mobile (`/[clientId]` solo implementa DELETE/PATCH), lee Supabase **directo** bajo sesión coach/RLS. Cobertura amplia (volumeSeries, strengthSeries, muscleVolumeReps, nutritionTimeline, workoutDates371, personalRecords, favoriteFoods), pero **omite campos canónicos** (A-F20): `attentionScore`, `oneRMDelta`, `planCurrentWeek/TotalWeeks/DaysRemaining` (en el detalle), `currentStreak` de workout, `client_intake`, `nutritionPlanCycles`, `nutritionTemplatesLite`, `nutritionPlanHistoryEntries`, `profileLastActivityAt`.

**Auth/seguridad (✅):** los 4 endpoints mobile autentican vía **Bearer → service-role `admin.auth.getUser`**, derivan `orgId` de `resolvePreferredWorkspace(auth.uid())` (nunca del body), y `ownsClient` verifica `coach_id` + org antes de DELETE/PATCH/reset-password. **No se leyó `org_id` del body en ningún lado.** Cumple la regla CLAUDE.md.

### 2.4 Sección por sección

**A) Directorio — search/filtros/sort/fila**

- **Search** ✅ — name+email ambos lados (RN sin ⌘K, esperado en móvil).
- **Filtros (A-F8) 🟡** — Web: 3 dimensiones (Estado incl. `pending_sync` · Riesgo `urgent/review/on_track/nutrition_low` · Programa `with/no/expired`). RN: solo Estado (`any/active/paused/archived`, **sin `pending_sync` seleccionable**), riesgo solo vía tap en StatTiles (no menú), **sin filtro de Programa** (el tipo `with_program` existe pero nunca se expone en UI).
- **Sort (A-F9) 🟡** — Web 6 opciones; RN 4 (faltan **Adherencia ↓** y **Peso: mayor cambio**). Dirección vía long-press.
- **Vista lista `ClientRow` (A-F4) 🔴** — omite adherencia (barra+%), peso±delta 7d, último-log (dot+fecha), flag nutrición y **acciones inline** (perfil/WA/editar/archivar/eliminar) que la tabla web da por fila. La vista **default** RN es mucho más pobre que la tabla web; todo eso vive solo en la vista **cards**.
- **Vista cards `ClientCard` (🔵) ✅** — paridad alta con `ClientCardV2`: ring adherencia, badge atención, 4 mini-stats, 2 sparklines (peso 30d / adherencia 4sem), bloque programa Sem X/Y, bloque nutrición, días suscripción, footer 4 botones + **menú "…" extra** (compartir/pausar/reset/eliminar).

**B) Mutaciones CRUD**

| Acción | Web | RN | Estado |
|--------|-----|-----|--------|
| Crear alumno | `CreateClientModal` + `createClientAction` (Zod `temp_password` min 8, `subscription_start_date`, **checkbox edad** Ley 21.719) | `CreateClientModal` → `POST /clients` (mismo schema server) | 🟡 A-F12 |
| Editar datos | `EditClientDataModal` → `updateClientDataAction` (name/phone **+ upsert `client_intake`**: peso/altura/objetivos/experiencia/disponibilidad/lesiones/médico) | `EditClientForm` **INALCANZABLE** | 🔴 A-F1 |
| Reset password | `ResetPasswordButton` (AlertDialog + PIN 6 díg.) | `resetClientPassword` (**sin confirmación**, Alert con PIN) | 🟡 A-F11 |
| Toggle estado | `ToggleStatusButton` (AlertDialog) | `setClientStatus` (**sin confirmación**) | 🟡 A-F11 |
| Eliminar | `DeleteClientButton` (confirm) | `deleteClient` (Alert destructivo) | ✅ |
| Archivar/Desarchivar | `ArchiveClientButton` (+email; unarchive recheck límite tier) | `setCoachClientArchived` (**sin email, sin recheck**, solo desde detalle) | 🟡 A-F13 |
| Import masivo CSV | wizard 4 pasos (`import/`) | — **ausente** | 🔴 A-F14 |

A-F12 detalle: RN valida solo "no vacío" en cliente, placeholder dice **"Min. 6 caracteres"** (contradice schema min 8 → 400 del server), **omite** `subscription_start_date`, y **hardcodea `ageConfirmed: true`** sin mostrar el checkbox de consentimiento de edad (Ley 21.719) → riesgo de compliance.

**C) Detalle — shell + hero + alert**

- **Hero (A-F18) 🟡** — RN: avatar-ícono, nombre/email, badge estado (incl. **Archivado** 🔵), racha, training-age, 4 chips KPI, WhatsApp + **Export PDF**. Web: inicial, **badge `Score: N · Urgente/Revisar/Estable`** (A-F6), **"Última actividad"** relativa (RN no la tiene), **"Cliente desde"**, 5 chips (incl. **"Programa Sem x/y"**, RN no), WA + Nutrición + Entrenamiento. La chip "Adherencia" RN usa **nutrición %** mientras la web usa **ratio de entrenos** — misma etiqueta, métrica distinta.
- **Top alert / next-best-action (A-F5) 🔴** — Web: `getProfileTopAlert.ts` = motor determinista de **7 reglas** (check-in stale >30d → sin workout ≥7d → nutrición <60% → plan vencido/≤3d → 1RM cayendo → racha ≥10) renderizado como banner por severidad. RN: solo string ad-hoc de **3 ramas** (`[clientId].tsx:136-139`), siempre rojo, dentro del hero. No portó el motor ni los casos `planDaysRemaining`/`lastWorkoutDate`/`oneRMDelta`/racha-éxito. **Recomendado:** portar `getProfileTopAlert` (lógica pura) a lib compartida + banner RN en `OverviewTab`.
- **FAB (A-F21) 🟡** — RN: WA + Editar programa + **Registrar pago**. Web `ProfileFloatingActions`: WA + **Check-in alumno** + Builder. RN tiene pago, le falta el atajo de check-in.

**D) Detalle — tabs**

- **Resumen (Overview) 🟡** — Paridad en rings de cumplimiento (Entreno/Nutrición/Check-in), heatmap de actividad 371d, check-in snapshot (foto/peso/energía/revisar), evolución de fotos, biometría. Gaps: sin banner de alerta (A-F5), rings **sin delta semana-vs-semana** (A-F22), program-summary más fino (sin `ProgramPhasesBar`/días-restantes/dot nutri-riesgo). 🔵 **biometría editable funciona** en RN (en web el diálogo "Editar Biometría" tiene botones **sin handlers** = muerto).
- **Progreso 🟡** — Fuerte paridad: área de peso interactiva, stats (inicial/actual/Δ/ritmo/proyección), IMC + barra, gauge energía 7d, timeline de check-ins. 🔵 RN dibuja **línea de objetivo** (goal_weight) que la web no tiene. **PDF export = ✅ paridad** (RN `exportProgressPdf` con **expo-print** branded vs web `progress-print` route — resuelto desde el audit 06-02). Gap: foto-comparación **estática** en vez de slider arrastrable (A-F17, S3).
- **Análisis ✅/🔵** — Equivalente = `TrainingTabB4Panels` web (no es RN-only). Misma analítica compartida (`findWeeklyWeightPRs`, `selectStrengthCardExercises`, `buildDailyTonnageSeries`, `detectVolumeImbalances`). `WeeklyPRBanner` es **port 1:1** (RN añade carrusel multi-PR + haptics 🔵). RN añade **session-history fling picker + SessionDetail** por día 🔵; web añade **filtro por grupo muscular** en strength cards que RN no tiene (A-F26, S3).
- **Plan 🟡** — Core presente (programa, estructura, días, sheet de ejercicio, editar en builder). Gaps: **A-F2 (S1) — RN no resuelve variante AB/cíclica** (`PlanTab.tsx:65` renderiza `workoutPlans` raw; web filtra variante activa con `filterPlansForStructureView`) → programas AB muestran **días incorrectos/duplicados**. Además **sin grilla semanal L–D** (lista vertical de días con plan), **sin `ProgramPhasesBar`**, **sin historial de logs por ejercicio** en el sheet, **empty state sin CTA** crear/asignar (A-F16).
- **Nutrición 🔴** — La mayor brecha. **A-F3 (S2): tab read-only — cero mutaciones**: sin editar plan, sin copiar a otro alumno, sin definir/editar ciclo de dieta, sin restaurar de historial, sin ver-como-alumno (web expone todas en `NutritionTabB5:478-547` + `NutritionCycleHistorySection`). Además (A-F15) faltan: **tabla de historial 30d**, **"último día registrado"**, **food swaps** del alumno (coach pierde visibilidad de sustituciones), badge **CUSTOM/SYNCED**, rings de macros, pie de meta, instrucciones, suplementos+nota. Umbral de badge nutrición-riesgo **40% (RN) vs 60% (web)** (A-F23).
- **Pagos (Facturación) ✅** — Paridad: KPIs, timeline/historial con estado + comprobante, registrar pago (`POST /payments`), eliminar pago, ver comprobante. Matices S3 (A-F24): `totalCobrado` suma **todos** los pagos (web solo `paid`); status del nuevo pago queda implícito al endpoint.

### 2.5 Hallazgos de Alumnos

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **A-F1** | **S1** | **Editar datos del alumno roto** | `EditClientForm` se renderiza en `NativeDialog` pero `setEditOpen(true)` **nunca se invoca** (`[clientId].tsx:59,278-279`) → diálogo inalcanzable (dead code). Aun si fuera alcanzable, edita `goal_weight_kg`/`subscription_start_date` y **no toca `client_intake`** (peso/altura/objetivos/experiencia/disponibilidad/lesiones/médico). Coach en móvil **no puede mantener datos de onboarding/médicos**. | Cablear el botón que abre el diálogo + portar el set de campos `client_intake` real (escribir vía endpoint/RLS). |
| **A-F2** | **S1** | **Plan no resuelve variante AB/cíclica** | `PlanTab.tsx:65` renderiza `program.workoutPlans` raw; web resuelve la variante activa de la semana (`filterPlansForStructureView`, `ProgramTabB7.tsx:83-100`). Programas AB/cíclicos muestran **días incorrectos o duplicados**. | Portar `resolveActiveWeekVariantForDisplay` + filtrado de plans a RN. |
| **A-F3** | S2 | **Tab Nutrición read-only** | RN sin ninguna mutación: editar plan, copiar a otro alumno, definir/editar ciclo de dieta, restaurar historial, ver-como-alumno. Web las expone todas. | Añadir al menos enlace a `nutrition-builder` + copiar-a-alumno; evaluar ciclo/historial. |
| **A-F4** | S2 | **Vista lista (default) sin métricas ni acciones** | `ClientRow` omite adherencia, peso±delta, último-log, flag nutrición y acciones inline; todo vive solo en cards. La tabla web las trae por fila. | Enriquecer `ClientRow` o hacer cards la vista default. |
| **A-F5** | S2 | **Top alert / NBA del detalle no portado** | Motor de 7 reglas `getProfileTopAlert` + banner por severidad son web-only; RN tiene string de 3 ramas siempre rojo. Coach pierde triage proactivo (plan vencido, sin workout 7d, 1RM cayendo no se señalan). | Portar `getProfileTopAlert` (lógica pura) a lib compartida + banner RN en `OverviewTab`. |
| **A-F6** | S2 | **`attentionScore` divergente/ausente** | Detalle RN no expone el badge `Score: N` del hero web. En el directorio, score/flags se calculan **dos veces** (local en lista, pulse en cards) con **enum y fórmula distintos** a la web → mismo alumno, distinto score según vista. | Unificar fuente de verdad = pulse; portar `calculateAttentionScore` o consumir el del endpoint. |
| **A-F7** | S2 | **Org scoping sin filtro explícito** | `getCoachDirectoryClients` y `getCoachClientDetail` consultan Supabase directo con `coach_id` pero **sin `org_id`** (solo RLS). Subqueries `workout_logs`/`check_ins` sin `coach_id`. Viola convención de filtrado explícito + repository layer. | Añadir filtro `org_id` explícito (vía `getCoachOrgContext`) o mover a endpoint. Ver **TX-4**. |
| **A-F8** | S2 | **Filtros incompletos** | RN sin `pending_sync` seleccionable, sin filtro de Programa, sin menú de Riesgo (solo via StatTiles). | Exponer las 3 dimensiones de filtro web. |
| **A-F9** | S2 | **Sort incompleto** | Faltan **Adherencia ↓** y **Peso: mayor cambio** (web tiene 6, RN 4). | Añadir las 2 opciones a `OptionSheet`. |
| **A-F10** | S2 | **StatTiles y banners triage divergen** | RN: On track/Sin plan (vs web Avg Adher./Nutri. baja). Faltan banners **nutrición baja** y **sin check-in 1 mes**. | Alinear tiles + añadir banners faltantes. |
| **A-F11** | S2 | **Reset-pw y toggle-status sin confirmación** | RN dispara inmediato al tap del menú; web envuelve en AlertDialog. Un mis-tap resetea contraseña / pausa acceso sin undo. | Añadir confirmación. Ver **TX-5**. |
| **A-F12** | S2 | **Crear alumno: validación/consent/start-date** | Placeholder "Min. 6" vs schema min 8; falta `subscription_start_date`; `ageConfirmed` hardcoded `true` sin checkbox Ley 21.719. | Alinear validación cliente; añadir checkbox de edad + campo fecha. |
| **A-F13** | S2 | **Archive/unarchive: sin emails, sin recheck límite** | RN no envía email archived/unarchived y **no rechequea límite de tier** al reactivar (web bloquea si está lleno). Solo accesible desde detalle. | Rutear archive por endpoint service-role (emails + recheck) y exponer en lista. |
| **A-F14** | S2 | **Import masivo CSV ausente** | Wizard de 4 pasos (`import/`) es web-only. | Backlog: coaches móviles caen a web (aceptable corto plazo). |
| **A-F15** | S2 | **Nutrición: historial/foodswaps/metadata faltantes** | Sin tabla de log 30d, sin "último día registrado", **sin food swaps** del alumno, sin badge CUSTOM/SYNCED, rings, instrucciones, suplementos/nota. | Pasada dedicada al tab nutrición del detalle. |
| **A-F16** | S2 | **Plan: grilla/phases/historial/CTA** | Sin grilla semanal L–D, sin `ProgramPhasesBar`, sin historial de logs por ejercicio en el sheet, empty state sin CTA. | Enriquecer `PlanTab`. |
| **A-F17** | S3 | Foto-comparación estática | RN columnas before/after fijas; web tiene slider arrastrable `PhotoComparisonSlider`. (**PDF export ya en paridad** vía expo-print.) | Nice-to-have: slider gestual. |
| **A-F18** | S3 | Hero: campos faltantes | Sin "Última actividad" ni chip "Programa Sem x/y"; chip "Adherencia" mide nutrición% (web mide entrenos). | Añadir campos + corregir etiqueta. |
| **A-F19** | S2 | **Silent-catch residual (soft errors)** | `clients-directory.ts:135-137` y los 12 queries paralelos de `coach-client-detail.ts:498-582` leen `.data ?? []` **sin inspeccionar `.error`** (los soft-errors de Supabase no lanzan). Una query fallida degrada a vacío → todos "en riesgo" / charts vacíos, sin avisar. Familia TX-1 (distinto del pulse ya corregido). | Inspeccionar `.error` y mostrar estado "datos limitados / reintentar". |
| **A-F20** | S2 | **Contrato de datos del detalle incompleto** | RN omite `attentionScore`, `oneRMDelta`, `planCurrentWeek/TotalWeeks/DaysRemaining`, `currentStreak` workout, `client_intake`, `nutritionPlanCycles`, `templates`, `nutritionPlanHistoryEntries`, `profileLastActivityAt`. | Completar el fetch del detalle (habilita A-F1/F5/F6/F15/F18). |
| **A-F21** | S3 | FAB diverge | RN tiene "Registrar pago" pero omite "Check-in alumno" del web. | Añadir atajo check-in. |
| **A-F22** | S3 | Rings sin delta semanal | Web muestra ↑/↓ vs semana anterior; RN solo valor actual. | Añadir delta. |
| **A-F23** | S3 | Umbral nutrición 40% vs 60% | Badge RN dispara <40%, web <60% (e inconsistente con `getProfileTopAlert`). | Unificar umbral. |
| **A-F24** | S3 | Billing: total cobrado | `totalCobrado` RN suma todos los pagos; web solo `paid`. Status del nuevo pago implícito. | Sumar solo `paid`; fijar status explícito. |
| **A-F25** | S3 | Portal alumnos copiable | loginUrl click-to-copy del header web ausente en RN. | Añadir copy en header/settings. |
| **A-F26** | S3 | Filtro grupo muscular (Análisis) | Strength cards web filtran por grupo; RN muestra top-4 fijo. | Añadir pills de filtro. |

**Mejoras RN (🔵, constancia):** card `ClientCard` ≈ `ClientCardV2` + menú contextual + animación stack; **banner `pulseError` "Reintentar"** (`ff7f7d9`, cierra TX-1 de Alumnos); **biometría editable funcional** (web tiene diálogo muerto); Análisis con **session-history fling picker + SessionDetail** y `WeeklyPRBanner` multi-PR + haptics; Progreso con **línea de objetivo**; **PDF nativo branded** vía expo-print.

### 2.6 Veredicto Alumnos

**🟡 Parcial.** Estructura macro en paridad (directorio con cards ≈ web, 6 tabs de detalle 1:1, Facturación ✅, Análisis/Progreso fuertes con mejoras RN). Pero hay **2 S1 reales**: **A-F1** (editar datos del alumno inalcanzable + sin `client_intake` → coach no mantiene onboarding/médico) y **A-F2** (Plan no resuelve variante AB/cíclica → muestra días incorrectos). El resto son S2 concentrados en: **vista lista pobre** (A-F4), **Nutrición read-only** (A-F3/F15), **triage/alert no portado** (A-F5/F6/F10), **filtros/sort incompletos** (A-F8/F9), **org scoping implícito** (A-F7), **CRUD con gaps** (A-F11/F12/F13/F14) y **soft-error silent-catch** (A-F19/F20). **Acciones prioritarias: A-F1, A-F2, luego A-F3/A-F5/A-F4.**

---

## 3. Programas (coach)

> **Menú compuesto.** Cubre 2 pantallas RN: **biblioteca/hub** (`(tabs)/builder.tsx` — archivo confusamente llamado "builder" pero renderiza "Programas/Biblioteca") y **builder** (`program-builder.tsx`, modo cliente + plantilla). Web: `workout-programs` (hub + `builder/` template mode), `builder/[clientId]` (builder grande, 20 archivos), `templates` (= **redirect** a `workout-programs`). **Sin API mobile** → RN usa Supabase directo + **`lib/plan-builder/reducer.ts` (reducer web portado 1:1)**.
>
> **Consolidación previa:** builder UI construido en sesiones 2026-05 → 06 (handoff "Tandas 1–4 / A–E / O1–O8 / P1–P6", commits `4ac578c`/`c4d6a70`/`1bfb11e`/`1e16951`/`721c80c`). El audit viejo (borrado) decía "RN sin template mode / Sync stub" — **template mode hoy SÍ existe**; **Sync sigue stub** (confirmado). Mejoras nativas RN: draft autosave offline, swipe-entre-días, move-to-day chips, day-rail en cards.

### 3.1 Mapa de archivos

**Web** (`apps/web/src/app/coach/`)
- **Hub** `workout-programs/page.tsx` (RSC) → `WorkoutProgramsClientShell` → `WorkoutProgramsClient.tsx` (1045 líneas) + `components/{LibraryHeader,LibraryHeroBackdrop,LibraryToolbar,ProgramRow,ProgramPreviewPanel}`, `libraryStats.ts`. Datos: `_data/workout-programs.queries.ts`. `templates/page.tsx` = `redirect`.
- **Builder** `builder/[clientId]/page.tsx` (cliente) + `workout-programs/builder/page.tsx` (template) → `WeeklyPlanBuilder.tsx` (1807 líneas) + `hooks/usePlanBuilder.ts` (reducer) + `DraggableExerciseCatalog`, `components/{BlockEditSheet,ExerciseBlock,DayColumn,ProgramConfigHeader,ProgramPhasesBar,ProgramPreviewDialog,TemplatePickerDialog,MuscleBalancePanel,AssignToClientsDialog,PrintProgramDialog,BuilderOnboardingTour}`. Save: `_actions/builder.actions.ts` → `services/workout/workout.service.ts` (Zod `WorkoutProgramSchema`).

**RN** (`apps/mobile`)
- **Hub** `app/coach/(tabs)/builder.tsx` (1160 líneas, monolítico: screen + cards + mutaciones inline **org-aware**).
- **Builder** `app/coach/program-builder.tsx` (1198 líneas, pantalla única; modo por query-param) + `components/coach/{BlockEditorSheet,BuilderBlockCard,ExerciseSearchSheet,ProgramConfigSheet,ProgramPhasesBar,ProgramPreviewSheet,TemplatePickerSheet,BuilderOnboardingTour,ExercisePreviewSheet,MuscleBalanceSheet,AssignClientsSheet}`. Lógica: **`lib/plan-builder/{reducer,types,skeleton,arrayMove}`** (reducer/types = port verbatim). PDF: `lib/program-pdf.ts`.
- ⚠️ Dos paths de mutación que **divergen entre sí**: el hub (`builder.tsx`) es org-aware; el editor (`program-builder.tsx` `persistProgram`) no.

### 3.2 Composición / orden

**Hub**

| Elemento | Web | RN | Estado |
|----------|-----|-----|--------|
| Header + stats | ✅ 3 stats (plantillas/activos/total) | 🟡 4 stats (+**Sin plan** 🔵) | 🟡 P-F13 |
| Search | name+cliente | **name+cliente+ejercicios** 🔵 | ✅ |
| Segmentos (Todos/Plantillas/En curso) | ✅ Tabs | ✅ SegmentedTabs | ✅ |
| Filtros (estado/estructura/fases) | ✅ Selects en popover/sheet | 🟡 FilterPills inline (sin "Sin fases") | 🟡 P-F13 |
| Vista | grid/list toggle | densidad Cómoda/Compacta | ✅ |
| Card de programa | `ProgramRow` (+ fecha "Act.") | `ProgramCard` (+ day-rail, chips ejercicios, badge "Vinculado" 🔵; sin fecha edición) | 🟡 |
| Panel detalle desktop (2 col) | ✅ `DesktopDetailPanel` | n/a (móvil) | — |
| Acciones por card | dropdown kebab | botonera inline | ✅ |
| Crear | "Nueva plantilla" + FAB | FAB | ✅ |

**Builder** — ambos: modo cliente + modo plantilla (web por **ruta**, RN por **query-param** `?mode=template`/`?templateId=` vs `?clientId=`). Reducer **1:1** (12/12 acciones idénticas; RN añade `SET_DAY_BLOCKS` para DnD por secciones, 🔵). Estructura: semanal/cíclica, A/B variants, fases/mesociclos, días, bloques, secciones (cal/pri/enf), supersets, override, progresión — **tipos `DayState`/`BuilderBlock` byte-for-byte idénticos**.

**`/coach/templates`** = redirect a `workout-programs` (no es pantalla aparte); RN sin ruta `templates` → correcto.

### 3.3 Capa de datos (función)

- **Mecanismo:** RN escribe/lee Supabase **directo** desde los componentes. Hub (`builder.tsx`) y editor (`program-builder.tsx`) tienen **lógica de mutación separada que diverge**. Web pasa por server action → `workout.service.ts` con **Zod**.
- **Reducer/tipos compartidos ✅ (anti-drift bien hecho):** `lib/plan-builder/reducer.ts`+`types.ts` son port verbatim del hook web. **Pero los schemas NO** (`packages/schemas/workout.ts` no se usa en RN; cero matches) → save sin validación Zod (P-F5 · TX-6).
- **Org scoping (P-F4 · TX-4):** **hub org-aware** (usa `getCoachOrgContext`, setea `org_id` en inserts); **editor org-blind** (`program-builder.tsx` no importa `getCoachOrgContext`, no setea `org_id` en programa/planes, no filtra reads por org). En enterprise el editor escribe programas **org-null** y puede leer del workspace equivocado.
- **Auth ✅:** donde lee org, lo toma del JWT (`getCoachOrgContext`), nunca del body.
- **Mutaciones client-side sin atomicidad (P-F2/P-F14 · TX-8):** `persistProgram` hace **delete-then-reinsert** de planes+bloques directo en el device, sin server action ni transacción → riesgo de estado parcial ante fallo a mitad. Además **no desactiva el plan activo previo** del alumno (web sí) → posible **doble programa activo**.
- **Silent-catch (P-F10 · TX-1):** carga de catálogo `.catch(()=>{})`, carga de programa ignora `.error` (→ programa en blanco), `loadTemplate` ignora error, `loadLibrary` del hub silent-catch. Las mutaciones sí avisan vía `Alert`.

### 3.4 Sección por sección

**A) Hub / biblioteca** — paridad alta en lista/segmentos/filtros/preview. Card RN **más rica** (day-rail, chips de ejercicios, badge "Vinculado", búsqueda por ejercicio, 4º stat "Sin plan", contador "n de n"). Gaps: filtros como pills sin "Sin fases", row sin fecha de última edición (P-F13); preview sin agrupación secciones/superset (P-F9); client-eligibility (`is_archived=false` vs web `is_active=true`) + sort (`updated_at` vs `created_at`) distintos (P-F12). **Sync = stub** (P-F1).

**B) Builder — estructura + reducer** — **núcleo a paridad 1:1** (reducer verbatim, tipos idénticos, A/B variants, fases, secciones, supersets, progresión, undo/redo `MAX_HISTORY=20`). Modo plantilla funciona. Save RN reimplementa inline sin Zod ni guard per-block (web bloquea save si `!sets || sets<1 || !reps`) → RN puede persistir bloques con sets/reps vacíos (P-F5). Cycle-length clamp inconsistente: RN 1–7 (load)/1–31 (skeleton) vs web sin clamp → cíclico de 8–31 días se trunca a 7 al abrir en RN (P-F8).

**C) Builder — componentes/UX** — **MuscleBalance y Assign SÍ existen en RN** (`MuscleBalanceSheet`, `AssignClientsSheet` — no son gaps). Catálogo de ejercicios, edición de bloque (sets/reps/peso/descanso/tempo/RIR/notas/progresión/superset/sección), copy-day, config, phases bar, onboarding tour, **PDF (HTML/CSS idéntico, expo-print)** → paridad. Gaps:
- **`is_override` sin badge en la card** (P-F7): web muestra Base/Modif. en el bloque; RN solo dentro del editor sheet → coach no ve de un vistazo qué bloques están modificados en programas vinculados a plantilla.
- **Assign más débil** (P-F6): RN solo multi-select de cliente; web añade start-date/flexible, duration-weeks, days-of-week filter, search, aviso de sobrescritura.
- S3: sin InfoTooltips (RIR/RPE/Tempo/Rest/Notes — 5 educativos, P-F15); notes sin contador (P-F16); phase color limitado a 6 presets vs hex (P-F17); preview de menor fidelidad sin stat-cards/muscle-chips/rest-days (P-F9); catalog preview sin YouTube inline (P-F18).
- 🔵 RN-extra: move-to-day chips explícitos, swipe-entre-días, draft autosave/recover offline.

**D) Mutaciones / data layer** — `persistProgram` (editor) **org-blind, sin `source_template_id`, sin desactivar previo, sin Zod** (P-F2/F3/F4/F5). El path del **hub** (`assignTemplateToClients`, `duplicateProgramAsTemplate`) **sí** es org-aware + setea `source_template_id` + desactiva-luego-activa + rollback — pero **ningún path RN envía el email de "programa asignado"** que web sí manda. **Sync stub** (P-F1) + **editor no vincula plantilla** (P-F3) → aunque Sync existiera, los programas asignados desde el editor no son sincronizables. Tier-gating ausente (P-F11 · TX-7, bajo impacto para programas). PDF a paridad (escaping RN más seguro, 🔵).

### 3.5 Hallazgos de Programas

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **P-F1** | **S1** | **Sync template→clientes = stub** | `(tabs)/builder.tsx:383` `onSync` = `Alert.alert('…queda para el siguiente micro-bloque')`. Web `syncProgramFromTemplateAction`+`mergeBlocksForSync` (merge in-place preservando `is_override`) no portado. Coach no puede propagar ediciones de plantilla a programas asignados. | Portar `mergeBlocksForSync` (lógica pura) + acción RN. |
| **P-F2** | **S1** | **Save no desactiva plan activo previo → doble activo** | `persistProgram` inserta `is_active:true` sin desactivar el programa activo anterior del alumno (web `workout.service.ts:231-236` sí). Crear un programa nuevo para un alumno con plan activo deja **dos programas activos**. | Desactivar el activo previo antes de insertar (como el hub). Ver **TX-8**. |
| **P-F3** | S2 | **Editor org-blind + no vincula plantilla** | `program-builder.tsx` no usa `getCoachOrgContext`, no setea `org_id` ni `source_template_id` en programa/planes (verificado: grep sin matches). Programas creados/asignados desde el editor quedan org-null y **no vinculados** → no muestran botón Sync. (El hub sí es org-aware.) | Unificar ambos paths en uno org-aware con `source_template_id`. |
| **P-F4** | S2 | Org scoping en reads del editor | `program-builder.tsx` carga programa/plantilla filtrando solo `client_id`/`id` (sin `org_id`). | Filtrar por org. Ver **TX-4**. |
| **P-F5** | S2 | Sin Zod + guard per-block | Save RN sin `WorkoutProgramSchema` ni guard `!sets||sets<1||!reps` (web lo aplica). RN puede guardar bloques con sets/reps vacíos. `packages/schemas/workout` no reusado. | Reusar schema Zod + guard. Ver **TX-6**. |
| **P-F6** | S2 | Assign más débil | RN solo multi-select cliente; faltan start-date/flexible, duration-weeks, days-of-week, search, aviso sobrescritura. Ningún path RN envía email "programa asignado". | Portar opciones de `AssignToClientsDialog` + email. |
| **P-F7** | S2 | `is_override` sin badge en card | Web muestra Base/Modif. en el bloque; RN solo en editor sheet. Coach no ve overrides de un vistazo en programas vinculados. | Añadir badge en `BuilderBlockCard`. |
| **P-F8** | S2 | Cycle-length clamp inconsistente | RN clampa 1–7 (load)/1–31 (skeleton); web sin clamp. Cíclico de 8–31 días (web) se trunca a 7 al abrir en RN. | Alinear el clamp con web. |
| **P-F9** | S2 | Preview de menor fidelidad | RN `ProgramPreviewSheet` sin agrupación secciones/superset, sin stat-cards, sin muscle-chips, sin rest-days (filtra `blocks>0`). | Portar agrupación + stats. |
| **P-F10** | S2 | Silent-catch en reads (builder + hub) | Catálogo `.catch(()=>{})`, load programa/plantilla ignora `.error` (→ programa en blanco), `loadLibrary` silent-catch. | Inspeccionar `.error` + UI de error. Ver **TX-1**. |
| **P-F11** | S3 | Tier-gating ausente | Sin recheck de límite al crear/asignar programa (bajo impacto: web tampoco hard-gatea conteo de programas). | Ver **TX-7**. |
| **P-F12** | S3 | Client-eligibility + sort mismatch | Clientes RN `is_archived=false` vs web `is_active=true`; sort RN `updated_at` vs web `created_at`. | Alinear predicado + orden. |
| **P-F13** | S3 | Hub: filtro "Sin fases" + fecha edición | RN sin pill "Sin fases" ni fecha "Act." en la card. | Añadir ambos. |
| **P-F14** | S2 | Mutaciones multi-tabla sin atomicidad | `persistProgram` delete-then-reinsert directo en device, sin transacción → estado parcial ante fallo. | Mover a server action/RPC transaccional. Ver **TX-8**. |
| **P-F15** | S3 | Sin InfoTooltips en editor | 5 tooltips educativos (RIR/RPE/Tempo/Rest/Notes) ausentes en RN. | Portar tooltips. |
| **P-F16** | S3 | Notes sin contador | Web x/1000 con warn; RN multiline sin límite visible. | Añadir contador. |
| **P-F17** | S3 | Phase color 6 presets | Web hex libre (`input type=color`); RN cicla 6 colores. | Picker de color. |
| **P-F18** | S3 | Catalog preview sin YouTube inline | Web iframe autoplay; RN thumbnail + deep-link. | Reproductor inline (opcional). |
| **P-F19** | S3 | `arrayMove` reimplementado | Algoritmo idéntico pero segunda fuente (no compartido). | Centralizar si se comparte el paquete. |

**Mejoras RN (🔵, constancia):** reducer/tipos **port verbatim 1:1** (anti-drift) + `SET_DAY_BLOCKS` extra; **draft autosave/recover offline**; **swipe-entre-días**; **move-to-day chips**; card de hub más rica (day-rail, chips, "Vinculado", búsqueda por ejercicio, "Sin plan" stat, "n de n"); PDF nativo con escaping más seguro; MuscleBalance + Assign presentes.

### 3.6 Veredicto Programas

**🟡 Parcial.** El **núcleo del builder está a paridad real 1:1** (reducer/tipos verbatim, A/B variants, fases, secciones, supersets, progresión, undo/redo, MuscleBalance, PDF) — el mejor-portado de los menús auditados, con varias mejoras nativas. Pero hay **2 S1**: **P-F1** (Sync template→clientes = stub, no se pueden propagar ediciones) y **P-F2** (save no desactiva plan activo previo → posible doble programa activo). Y una capa de **mutación divergente y frágil**: el editor (`program-builder.tsx`) es **org-blind, sin Zod, sin `source_template_id`, sin atomicidad** (P-F3/F4/F5/F14), mientras el hub sí es org-aware — deberían unificarse. S2 restantes: assign débil (P-F6), override sin badge (P-F7), cycle clamp (P-F8), preview (P-F9), silent-catch (P-F10). **Acciones prioritarias: P-F2, P-F1, unificar paths (P-F3/F14), luego P-F5/P-F6.**

---

## 4. Ejercicios (coach)

> **Menú simple (1 pantalla).** RN: `(tabs)/ejercicios.tsx` (catálogo + CRUD custom) + `ExerciseFormSheet` + `ExercisePreviewSheet` + `lib/exercises.ts`. Web: `exercises/page.tsx` → `ExerciseCatalogClient` + `_components/{ExerciseCreateButton,ExerciseFormModal,ExerciseMediaPicker}` + `_actions/{exercises,exercise-media}.actions.ts`. **Sin API mobile** → RN Supabase directo. (`ExerciseSearchSheet`/preview del builder ya cubiertos en #3.)
>
> **Consolidación previa:** pantalla construida en `2060eee`/`05800a1` (preview + source tabs + chips); `exerciseThumb` fallback chain 1:1 (`d676792`/`a64764b`); `selectWithFallback` DB-compat; tier-gate UI + `filterExercises` portado (sin usar en el catálogo). Fila #4 estaba `⏳ Pendiente` — esta es la primera pasada.

### 4.1 Mapa de archivos

| Capa | RN | Web |
|------|-----|-----|
| Pantalla | `(tabs)/ejercicios.tsx` (lista+card+chips+tabs inline) | `exercises/page.tsx` (RSC) → `ExerciseCatalogClient.tsx` |
| Preview | `ExercisePreviewSheet.tsx` (bottom sheet) | `ExercisePreviewModal` inline (`ExerciseCatalogClient.tsx:187-366`) |
| Form | `ExerciseFormSheet.tsx` | `_components/ExerciseFormModal.tsx` |
| Media picker | **ninguno** (2 campos URL crudos) | `_components/ExerciseMediaPicker.tsx` (tabs + upload) |
| Crear CTA | botón header inline | `_components/ExerciseCreateButton.tsx` |
| Datos/mutaciones | `lib/exercises.ts` (Supabase directo) | `_data/exercises.queries.ts` + `_actions/{exercises,exercise-media}.actions.ts` (server actions + Zod) |

`MUSCLE_GROUPS` (17), `EQUIPMENT_OPTIONS` (7), `DIFFICULTY_OPTIONS` (3) idénticos ambos lados ✅.

### 4.2 Composición / orden

| # | Web | RN | Estado |
|---|-----|-----|--------|
| 1 | Header + "{N} ejercicios" | Header + "{N} en biblioteca · {custom} propios" | ✅ |
| 2 | — | **Source tabs** Todos/Sistema EVA/Míos | 🔵 RN extra |
| 3 | Search + muscle **Select** dropdown | Search + muscle **chips** (solo músculos presentes) | 🟡 E-F12 |
| 4 | Grupos **colapsables** + pill tag-cloud (+ dot media) | `FlashList` agrupado por músculo, **filas con thumbnail**, no colapsable | 🟡 E-F13 |
| 5 | Empty + "Limpiar filtros" | Empty (Dumbbell) | ✅ |
| 6 | Preview modal (Dialog) | Preview sheet | 🟡 (ver 4.4) |

Card RN = thumbnail (gif→image→YT thumb→icon) + nombre + `muscle·equipment·difficulty` + badge "Propio". Card web = pill + dot de media (más compacta).

### 4.3 Capa de datos (función)

- **Read:** Web `getExerciseCatalog(coachId, orgId)` (RSC, `React.cache`, **org-aware**: rama `org_id.eq` para org). RN `listCoachExercises()` (Supabase directo + `selectWithFallback`). **Verificado (`exercises.ts:160-163`):** RN solo arma `and(coach_id.is.null,org_id.is.null),coach_id.eq.${coachId}` — **sin rama org** → ejercicios org-scoped (creados por org admin con `coach_id=null,org_id=X`) **invisibles en RN** (E-F5 · TX-4).
- **Auth ✅:** ambos leen `coach_id` de sesión, nunca del body. RN `createExercise` hardcodea `org_id: null` (`:195`) y `source:'coach'` (no puede escribir `source:'org'`).
- **Tier-gate:** RN gatea el botón crear por **tier de suscripción** (`canCreateCustomExercises`, Lock + Alert "Pro"); web gatea por **rol org** en UI y por **tier en la action** (`upgrade_required`). Divergencia (E-F6/E-F7 · TX-7). El gate RN es **solo UI** — `createExercise`/`updateExercise` no rechequean tier (`:175-212`).
- **Sin Zod (E-F9 · TX-6):** RN valida ad-hoc (name≥2, muscle presente); web usa `exerciseSchema` inline (refines de YouTube + prefijo de media). (Nota: ni la web centraliza el schema en `packages/schemas`.)
- **Silent-catch (E-F10 · TX-1):** `ejercicios.tsx:45-56` `try/finally` **sin catch** → pantalla vacía sin UI de error; `listCoachExercises` coalesce a `[]`. Las mutaciones sí devuelven `{ok,error}` ✅.

### 4.4 Sección por sección

- **Search (E-F3):** **verificado** `ejercicios.tsx:75` = `!e.name.toLowerCase().includes(q)` — solo nombre, accent-sensitive. No usa el `filterExercises` portado (existe en `lib/exercises.ts:112`, sin usar) que matchea name+muscle+body_part+equipment+secondary normalizado. Web sí usa el match amplio.
- **Filtros:** equipment/body-part/favoritos ausentes en **ambos** (paridad). Custom-vs-system: **RN lo tiene** (source tabs), web no (🔵).
- **Preview:** paridad en gif/imagen, badges (muscle/equipment), secundarios, instrucciones numeradas. Gaps: **sin YouTube inline** (RN thumbnail + deep-link; web autoplay iframe nocookie, E-F4); **sin card "Vista del alumno"** (web muestra cómo lo ve el alumno, E-F14). 🔵 RN muestra badge de dificultad que el preview web omite.
- **CRUD custom:** **RN tiene edit + delete funcionales** desde el preview del ejercicio propio (soft-delete `deleted_at`). **Verificado: la UI del catálogo web NO surface edit ni delete** (`ExerciseCatalogClient` solo abre el preview; las actions `updateExerciseAction`/`softDeleteExerciseAction` existen pero sin hook UI). → 🔵 **RN por delante** (deuda web). Falta en RN: **clone** (web `cloneExerciseAction`, copiar sistema→propio, E-F8) y **restore** (E-F11).
- **Form (campo por campo):** name, muscle (chips vs Select), equipment, difficulty, secundarios, instrucciones → paridad de datos. `body_part` sin UI en **ambos** (E-F16). **Media = el gap grande:** RN = 2 inputs de URL crudos ("Video YouTube" + "GIF URL"); web = `ExerciseMediaPicker` (tabs YouTube/GIF/Imagen + drag/paste/upload + compresión webp + upload firmado a Storage `exercise-media` + validación MIME/magic-byte/dimensiones + límites de tamaño + cuota 50MB + rate-limit). **Verificado:** create/update RN omiten `image_url` (`:191-208`,`:234-244`) — solo `video_url`+`gif_url`.

### 4.5 Hallazgos de Ejercicios

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **E-F1** | S2 | **Pipeline de subida de media ausente + sin `image_url`** | RN form = 2 URLs crudas; sin upload a Storage, sin tab imagen, sin compresión/validación/cuota/rate-limit; create/update omiten `image_url`. Coach no sube media desde el device. (Deferred en `exercises.ts:6-7`.) | Portar `ExerciseMediaPicker` + flujo de upload firmado (expo-image-picker + Storage). |
| **E-F2** | S2 | **Sin validación de URL de media** | `gif_url`/`video_url` aceptan cualquier string. Web exige `SUPABASE_MEDIA_PREFIX` (gif/image) + refine YouTube (video). RN parsea YouTube solo al mostrar. | Validar/normalizar URL al guardar. |
| **E-F3** | S2 | **Search solo por nombre + accent-sensitive** | `ejercicios.tsx:75` ignora el `filterExercises` portado (name+muscle+body_part+equipment+secondary, normalizado). | Usar `filterExercises` en el catálogo. |
| **E-F4** | S2 | **Sin YouTube inline en preview** | RN thumbnail + deep-link; web autoplay iframe nocookie in-modal. | Reproductor inline (WebView/embed). |
| **E-F5** | S2 | **Path org ausente (reads + create)** | `listCoachExercises` sin rama `org_id.eq` → ejercicios org invisibles; `createExercise` hardcodea `org_id:null`, sin `source:'org'`. | Añadir rama org (vía `getCoachOrgContext`). Ver **TX-4**. |
| **E-F6** | S2 | **Gate org-role ausente en create** | Web bloquea org `coach` role de crear; RN gatea solo por tier → org-coach en móvil crea ejercicio personal que web prohíbe. | Chequear rol org además de tier. Ver **TX-7**. |
| **E-F7** | S2 | **Tier-gate solo en UI, no en mutación** | `createExercise`/`updateExercise` no rechequean tier (web sí, `upgrade_required`). Default tier mismatch: RN null→`starter` (puede crear) vs web null→`free` (no). | Enforzar tier en la mutación + alinear default. |
| **E-F8** | S2 | **Clone ausente** | Web `cloneExerciseAction` (sistema→propio para personalizar); RN no lo tiene. | Portar clone. |
| **E-F9** | S2 | **Sin Zod / schema compartido** | RN valida ad-hoc; falta `name.max(100)`, `media_kind` enum, refines de URL. | Levantar `exerciseSchema` a `packages/schemas` y reusar. Ver **TX-6**. |
| **E-F10** | S2 | **Silent-catch en load** | `ejercicios.tsx:45-56` try/finally sin catch → pantalla vacía sin UI de error. | Inspeccionar error + UI de reintento. Ver **TX-1**. |
| **E-F11** | S3 | Restore ausente | Web `restoreExerciseAction`; RN solo soft-delete. | Portar restore. |
| **E-F12** | S3 | Filtro muscular difiere | Web Select 17 grupos siempre; RN chips solo de músculos presentes. | Listar todos los grupos. |
| **E-F13** | S3 | Layout difiere | Web grupos colapsables + pill tag-cloud + dot media; RN filas con thumbnail, no colapsable. | Cosmético. |
| **E-F14** | S3 | "Vista del alumno" ausente | Web preview muestra cómo lo ve el alumno; RN no. | Añadir card de vista alumno. |
| **E-F15** | S3 | Wording source line difiere | "Catálogo del sistema · EVA" vs "Catálogo global · ExerciseDB". | Alinear copy. |
| **E-F16** | S3 | `body_part` sin UI (ambos) | Campo existe en schema/DB; ningún form lo expone. | Nice-to-have ambos lados. |

**Mejoras RN (🔵, constancia):** **edit + delete funcionales** desde el preview (la UI del catálogo web no los surface — deuda web); **source tabs** custom-vs-system (web no tiene); badge de dificultad en preview; cards con thumbnail real; `selectWithFallback` DB-compat; `exerciseThumb` fallback chain 1:1.

### 4.6 Veredicto Ejercicios

**🟡 Parcial.** Menú pequeño con **buena paridad de CRUD de texto** (name/muscle/equipment/difficulty/secundarios/instrucciones) y RN incluso **por delante en edit/delete UX y filtro custom-vs-system**. Los gaps reales se concentran en **media** (sin pipeline de subida, sin `image_url`, sin validación de URL, sin YouTube inline — E-F1/E-F2/E-F4), **search degradado** (solo nombre, E-F3), **path org ausente** (E-F5), y **gating divergente / sin Zod / silent-catch** (E-F6/E-F7/E-F9/E-F10, familia transversal). Sin S1. Recipes-style: ningún gap rompe datos. **Acciones prioritarias: E-F1 (media), E-F3 (search), E-F5 (org).** Sin transversales nuevos — todo refuerza **TX-1/TX-4/TX-6/TX-7**.

---

## 5. Nutrición (coach)

> **Menú compuesto grande.** Cubre 5 sub-features web: **hub** (`nutrition-plans`), **builder** (template + plan por alumno: `new`, `[templateId]/edit`, `client/[clientId]`, `nutrition-builder/[clientId]`), **foods** (biblioteca), **recipes** (Edamam), **meal-groups** (`saved_meals`). RN: `(tabs)/nutricion.tsx` + `nutrition-builder.tsx` + `foods.tsx` + libs. **No hay API mobile de nutrición** → RN consulta Supabase **directo client-side** bajo sesión coach/RLS.
>
> **Consolidación previa:** mucho ya se construyó en sesiones 2026-06-02 → 06-04 (handoff RN + commits `2c6d298`/`0a5a235`/`11dd2dc`/`df69b6f`/`1e16951`) y **el audit viejo `apps/mobile/AUDIT_RN_vs_WEB.md` quedó obsoleto** (decía "RN sin templates / sin foods management / sin swaps" — **falso hoy**: RN tiene templates reales, pantalla de foods con CRUD, y swaps 1:1). Gaps conocidos-abiertos del handoff (cycles, propagación in-place) se confirman aquí, no se re-abren como nuevos.

### 5.1 Mapa de archivos

**Web** (`apps/web/src/app/coach/`)
- **Hub** `nutrition-plans/page.tsx` (RSC, tier-gate + fetch paralelo) → `_components/NutritionHub.tsx` (3 tabs) + `OrgTemplatesSection`, `ActivePlansBoard`, `TemplateLibrary`, `FoodLibrary`, `AssignModal`, `NutritionOnboarding`, `CoachNutritionGuideDialog`. Datos: `_data/nutrition-page.queries.ts`, `nutrition-coach.queries.ts`. Acciones: `_actions/nutrition-coach.actions.ts`, `food-library.actions.ts` + `services/nutrition.service.ts`.
- **Builder** 3 rutas (`new` / `[templateId]/edit` / `client/[clientId]`) + legacy `nutrition-builder/[clientId]` (solo `redirect`) → `_components/PlanBuilder/*` (PlanBuilder, MealCanvas, MealBlock, FoodItemRow, FoodSearchDrawer, **MacroCalculator**, PlanBuilderSidebar). Mappers: `_data/plan-builder-mappers.ts`.
- **Foods** `foods/page.tsx` → `FoodBrowser`, `AddFoodSheet`, `FoodSearch`. Datos: `foods/_data/foods.queries.ts`.
- **Recipes** `recipes/page.tsx` = **`redirect('/coach/foods')`** (deprecada; componentes huérfanos). Detalle `[recipeId]/page.tsx` aún vivo vía deep-link.
- **Meal-groups** `meal-groups/page.tsx` → `MealGroupLibraryClient`, `MealGroupModal` (CRUD de `saved_meals`).

**RN** (`apps/mobile`)
- **Hub** `app/coach/(tabs)/nutricion.tsx` (405 líneas, monolítico: 3 tabs + dialogs inline). Libs: `nutrition-templates.ts`, `nutrition-builder.ts`.
- **Builder** `app/coach/nutrition-builder.tsx` (444 líneas, **pantalla única**, distingue modo por query-params). `components/coach/FoodSearchSheet.tsx`, `FoodSwapSheet.tsx`. Lib: `nutrition-builder.ts`, `nutrition-utils.ts`.
- **Foods** `app/coach/foods.tsx` (CRUD). **Recipes/Meal-groups:** sin pantalla RN.
- Otros libs: `nutrition-coach-alerts.ts` (port), `nutrition-offline-cache.ts` (🔵 sin equiv web), `nutrition.queries.ts` (capa alumno).

### 5.2 Composición / orden

**Hub — 3 tabs idénticos ambos lados (`Plantillas · Alumnos · Alimentos`).**

| Elemento | Web | RN | Estado |
|----------|-----|-----|--------|
| Header + KPIs (3 stat) | ✅ (KPI medio = "Con plan") | 🟡 (KPI medio = "Alumnos") | 🟡 N-F25 |
| Tier-gate / upsell starter | ✅ pantalla upsell completa | 🔴 **ausente** | 🟡 N-F2 |
| Org templates section | ✅ cuando `orgId` | 🔴 ausente | 🟡 N-F4 |
| Tab Plantillas | ✅ cards ricas + Duplicate + search | 🟡 cards mínimas, sin Duplicate | 🟡 N-F8 |
| Tab Alumnos | ✅ **board all-clients** (sparkline/today-kcal/search/sort) | 🟡 **single-client** (chip → planes de 1) | 🟡 N-F6 |
| Tab Alimentos | ✅ `FoodLibrary` inline | 🟡 link-out a `/coach/foods` | 🟡 N-F24 |
| Assign modal | ✅ search + select-all + warnings | 🟡 checklist plano | 🟡 N-F7 |
| Onboarding 3-pasos | ✅ + dismiss-persist | 🔴 1 línea | 🟡 N-F23 |
| Guía logística (synced/custom) | ✅ | ✅ | ✅ |

**Builder — ambos soportan template mode + per-client mode** (web por **ruta**, RN por **query-params** `?mode=template`/`?templateId=` vs `?clientId=`/`?planId=`). Reorder: web **drag&drop** (@dnd-kit), RN **botones ↑/↓** (N-F17). RN entra a "Nuevo plan" sin `planId` → crea plan fresco en vez de editar el activo in-place (matiz N-F15).

**Sub-pantallas standalone:** Foods ✅ (RN tiene pantalla con CRUD); Recipes 🔴 RN (pero web deprecada → no es regresión, N-F22); Meal-groups 🔴 RN (gap real, N-F9).

### 5.3 Capa de datos (función)

- **Mecanismo:** RN escribe/lee **Supabase directo** desde libs (`nutrition-templates.ts`, `nutrition-builder.ts`), sin server actions, sin repository, sin `React.cache`. Web pasa por server action → `nutrition.service.ts` → repos con **Zod** (`packages/schemas/nutrition.ts`).
- **Shared logic NO reutilizada (N-F19/F26 · TX-6):** RN **no importa** `packages/schemas` ni `packages/types`; reimplementa la fórmula de macros **3 veces** (concuerdan hoy, sin fuente común → drift estructural) y **no valida con Zod** en writes (solo `name.length<2`). Puede persistir payloads que el validador web rechaza (comidas vacías, qty>5000, >8 swaps).
- **Org scoping (N-F5 · TX-4):** RN **inserta** `org_id` condicional en writes, pero **no filtra reads** por `org_id` (`listTemplates`/`getClientPlans`/`getTemplateDraft`/`searchFoods` solo `coach_id`/`client_id`/RLS). Web aplica `applyOrgScope` (`.eq('org_id')`/`.is('org_id',null)`) en todo read. Coach multi-workspace en RN puede ver el set de plantillas equivocado.
- **Auth ✅:** `getCoachOrgContext()` lee `org_id` solo del JWT (`app_metadata`), nunca del body. Cumple regla CLAUDE.md.
- **Silent-catch (N-F18 · TX-1):** todos los reads de nutrición RN descartan `.error` (`const { data } = …; data ?? []`) → un fallo de red se ve como "sin plantillas / sin favoritos / no encontrado". Peor: `propagateTemplate` es `void` y traga errores, pero `saveTemplate` igual retorna `{ok:true}` → el coach ve "guardado" mientras los alumnos sincronizados quedan con plan viejo.

### 5.4 Sección por sección

**A) Hub — Plantillas / Alumnos / Alimentos**
- **Plantillas:** RN lista/crea/edita/asigna/borra templates reales (`nutrition-templates.ts`) — **el viejo "RN no tiene templates" es falso**. Faltan: **Duplicate**, goal-badge, descripción, KPI macros, barra split, chips de comidas, contador "N activos", search (N-F8).
- **Alumnos:** RN = manager de 1 cliente (chip → planes, con **Activar / Copiar / Eliminar** 🔵). Web = **board de todos** con sparkline adherencia 7d + kcal-hoy + search/sort + roster "sin plan" (N-F6). Semántica distinta: web "unassign" (desactiva) vs RN `deletePlan` (hard-delete) (N-F12).
- **Alimentos:** link-out (N-F24). **Org templates** ausente (N-F4).
- **Assign:** RN checklist plano sin search/select-all/aviso "ya tiene plan activo → se reemplaza" (N-F7). Lógica subyacente `assignTemplateToClients` correcta (desactiva previo, inserta nuevo, sella `org_id`).

**B) Builder (plan + template)** — paridad fuerte en tablas/shape (`nutrition_plans→meals→food_items`, `swap_options` JSON 1:1, day-of-week, notas, favoritos, crear alimento custom, autosync de metas, validación comidas vacías). Gaps:
- 🔴 **Calculadora auto-target ausente** (N-F3): web Mifflin-St Jeor (peso/altura/edad/género/actividad/objetivo) → "Aplicar sugerencia"; RN ni recibe `clientProfile`.
- Sin **paso cantidad + preview** al agregar alimento (RN agrega `serving_size` directo) (N-F11); sin **barra progreso ni aviso desvío >5%** (`overMacroMismatch`) (N-F10); sin **filtro categoría** y búsqueda `limit 40` no virtualizada (N-F12); reorder por botones (N-F17); **cantidad redondeada a entero** pierde decimales (N-F20); sin entrada `org_template` pre-fill (N-F28).
- **Favoritos rotos (N-F1, S1):** `getClientFoodFavorites` consulta tabla **inexistente** `client_food_favorites` (real: `client_food_preferences` con `preference_type='favorite'`). **Verificado:** no está en `database.types.ts` ni en baseline (`:770` es `client_food_preferences`). Favoritos **siempre vacíos** (soft-error tragado). Afecta builder (`nutrition-builder.ts:343`) **y** detalle (`coach-client-detail.ts`).

**C) Foods** — RN `foods.tsx` con **create + edit + delete + unidad `ml`** → **RN va por delante**: web `/coach/foods` **no tiene edit y su delete está sin cablear** (`deleteCoachCustomFood` existe pero `FoodBrowser` no pasa `onDelete`). RN atrás solo en **discovery**: lista solo `coach_id=me`, sin browse del catálogo global / categoría / sort / scope-toggle, filtro nombre accent-sensitive (N-F21).

**D) Recipes (Edamam)** — **web deprecada** (`recipes/page.tsx` = `redirect('/coach/foods')`; componentes huérfanos; solo el detalle `[recipeId]` vive por deep-link). RN no la tiene → **no es regresión real** (N-F22, baja prioridad).

**E) Meal-groups (`saved_meals`)** — **gap real (N-F9, S2):** web tiene biblioteca CRUD de grupos reutilizables (`MealGroupLibraryClient`/`MealGroupModal`) + reuso en builder (`getCoachSavedMeals`). RN toca `saved_meals`/`saved_meal_items`/`template_meal_groups` **solo como backend de templates** (1 grupo/comida) — sin pantalla, sin reuse-in-builder. (Los **swaps por-alimento** sí están a paridad ✅ vía `FoodSwapSheet`.)

**F) Mutaciones / data layer** — ausentes en RN: **diet cycles** (`nutrition_plan_cycles`), **restore history** (`nutrition_plan_history`), **duplicate template** (N-F13). RN `saveClientPlan` **no escribe snapshot** a `nutrition_plan_history` → ediciones no versionadas/irrestaurables (N-F14). **Propagación de template no preserva in-place** (assign crea plan fresco; `propagateTemplate` borra+recrea meals) → orphana `nutrition_meal_logs` (N-F15). `duplicatePlanToClient` **omite `swap_options`** → swaps se pierden al copiar (N-F16). Alertas coach: **port 1:1, umbrales idénticos** ✅ (sin test en RN, `parseYmd` frágil — N-F27).

### 5.5 Hallazgos de Nutrición

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **N-F1** | **S1** | **Favoritos: tabla inexistente** | `getClientFoodFavorites` consulta `client_food_favorites` (no existe; real `client_food_preferences`/`preference_type='favorite'`). Soft-error tragado → favoritos **siempre vacíos** en builder y detalle. | Cambiar a `client_food_preferences` + filtro `preference_type`. (`nutrition-builder.ts:343`, `coach-client-detail.ts`.) |
| **N-F2** | S2 | **Sin tier-gate (entitlement/revenue)** | `nutricion.tsx` no llama `canUseNutrition`; web bloquea starter con upsell. Coach no-Pro usa nutrición full en móvil. | Gate con `canUseNutrition` + pantalla upsell. Ver **TX-7**. |
| **N-F3** | S2 | **Builder sin calculadora auto-target** | Web Mifflin-St Jeor → "Aplicar sugerencia"; RN ni recibe `clientProfile`. Coach calcula metas a mano. | Portar `MacroCalculator`/`PlanBuilderSidebar` (lógica pura) a RN. |
| **N-F4** | S2 | Org templates ausente | `org_nutrition_templates` nunca leído en hub RN; web `OrgTemplatesSection`. Coaches enterprise pierden protocolos de la org. | Añadir sección + entrada `org_template` al builder (N-F28). |
| **N-F5** | S2 | Reads sin filtro `org_id` | RN inserta `org_id` pero no lo filtra en lecturas (solo RLS). | Filtrar reads por org. Ver **TX-4**. |
| **N-F6** | S2 | Sin board all-clients en tab Alumnos | RN = single-client; web = board con sparkline/today-kcal/search/sort/roster "sin plan". | Construir board de portafolio. |
| **N-F7** | S2 | Assign sin search/select-all/warnings | RN checklist plano; web avisa antes de reemplazar plan activo. Riesgo reemplazo silencioso. | Añadir search, select-all, aviso de plan activo. |
| **N-F8** | S2 | Template library sin Duplicate + metadata | Faltan Duplicate, goal-badge, desc, KPI macros, barra split, chips, contador, search. | Enriquecer cards + añadir Duplicate. |
| **N-F9** | S2 | Meal-groups (`saved_meals`) sin pantalla | Web CRUD + reuse-in-builder; RN solo backend de templates. | Pasada dedicada: librería + picker en builder. |
| **N-F10** | S2 | Builder sin barra progreso / aviso desvío | Web `Progress` + `overMacroMismatch` "Sincronizar"; RN solo texto. | Añadir barra + alerta de mismatch. |
| **N-F11** | S2 | Sin paso cantidad + preview al agregar | RN agrega `serving_size` directo; web pide cantidad con aporte estimado. | Añadir quantity-view con preview. |
| **N-F12** | S2 | Buscador sin categoría + `limit 40` | Web 11 chips + virtualizado 300; RN solo texto, 40 resultados. | Añadir filtro categoría + subir/virtualizar límite. |
| **N-F13** | S2 | Mutaciones ausentes | Sin diet cycles (`nutrition_plan_cycles`), restore history, duplicate template. | Portar las 3 (lib + UI). |
| **N-F14** | S2 | Plan save sin snapshot history | RN no escribe `nutrition_plan_history` → ediciones irrestaurables. | Snapshot antes de guardar. |
| **N-F15** | S2 | Propagación no in-place | Assign crea plan fresco; propagate borra+recrea meals → orphana `nutrition_meal_logs`. | Update in-place + match por `order_index` (como web "FIX E1"). |
| **N-F16** | S2 | `duplicatePlanToClient` pierde swaps | SELECT omite `swap_options` (`nutrition-builder.ts:557`). | Incluir `swap_options` en el clon. |
| **N-F17** | S2 | Reorder por botones, no drag | `react-native-draggable-flatlist` cableado pero no usado. | Migrar a drag&drop. |
| **N-F18** | S2 | Silent-catch en reads + propagate void | `.error` nunca inspeccionado; `saveTemplate` retorna ok pese a fallo de propagación. | Inspeccionar `.error`; propagar fallo de propagación al UI. Ver **TX-1**. |
| **N-F19** | S2 | Sin Zod + schemas no compartidos | RN no usa `packages/schemas`; valida ad-hoc. | Reusar schemas Zod compartidos. Ver **TX-6**. |
| **N-F20** | S2 | Cantidad redondeada a entero | `Math.round` pierde decimales (1.5un, 12.5g). | Permitir decimales. |
| **N-F21** | S3 | Foods sin browse global/categoría/sort | RN lista solo coach foods, filtro nombre accent-sensitive. | Añadir catálogo global + categoría + sort. |
| **N-F22** | S3 | Recipes ausente — **web deprecada** | `recipes/page.tsx` = redirect. RN sin ella = paridad con web actual. | Baja prioridad. |
| **N-F23** | S3 | Onboarding 3-pasos ausente | Empty-state RN = 1 línea. | Portar onboarding + dismiss-persist. |
| **N-F24** | S3 | Alimentos tab = link-out | Web embebe `FoodLibrary`. | Cosmético. |
| **N-F25** | S3 | KPI medio cuenta Alumnos vs "Con plan" | Métrica distinta bajo igual layout. | Alinear métrica. |
| **N-F26** | S3 | Macro formula duplicada 3× | Sin fuente compartida → drift risk. | Centralizar en lib compartida. Ver **TX-6**. |
| **N-F27** | S3 | Alertas: sin test + `parseYmd` frágil | Port 1:1 pero RN sin test del port; double-suffix de fecha. | Añadir test; limpiar `parseYmd`. |
| **N-F28** | S3 | Builder sin pre-fill `org_template` | Web crea template desde org-template. | Añadir entrada (depende N-F4). |

**Mejoras RN (🔵, constancia):** **Foods con edit+delete+`ml`** (web `/coach/foods` sin edit y delete sin cablear); **`nutrition-offline-cache`** (read-model alumno offline, sin equiv web); **`FoodSwapSheet`** bottom-sheet (mejor UX táctil que swap inline web); **Activar plan + Copiar-a-otro-alumno** directo desde el hub; `updateFood` (editar alimento) RN-only.

### 5.6 Veredicto Nutrición

**🟡 Parcial.** El núcleo está **mucho más completo de lo que decía el audit viejo**: templates reales, builder template+plan con tablas/macros/swaps 1:1, foods CRUD (por delante de la web), alertas port 1:1, y mejoras RN (offline cache, copiar/activar desde hub). Pero hay **1 S1** (**N-F1**, favoritos contra tabla inexistente → siempre vacíos) y una pila de **S2** concentrados en: **gating ausente** (N-F2), **calculadora de macros** (N-F3), **board all-clients / org templates** (N-F4/F6), **propagación e historial** (N-F13/F14/F15), **duplicate pierde swaps** (N-F16), **assign sin warnings** (N-F7), y la familia transversal de **org-scoping / silent-catch / sin-Zod** (N-F5/F18/F19). Recipes no es gap (web deprecada); Meal-groups sí (N-F9). **Acciones prioritarias: N-F1, N-F2, N-F3, luego N-F15/N-F16/N-F13.**

---

## 6. Mi Marca / Settings (coach)

> **Menú de 1 pantalla** (editor de marca) + sub-ruta web `settings/preview` (preview full-screen). RN: `(tabs)/settings.tsx` + `EvaLoader.tsx` (loader real) + `WelcomeModal.tsx` (consumer alumno) + libs `coach-brand.ts`/`branding.ts`/`theme.ts`. Web: `settings/page.tsx` → `BrandSettingsForm` + `LogoUploadForm` + `_components/{BrandThemePreview,WhatChangesList,DangerZone,BrandSettingsTour}` + `preview/StudentDashboardPreview`. **Sin API mobile** → Supabase directo bajo RLS `coaches_update_own`. (`perfil.tsx` = #9, excluido.)
>
> **Consolidación previa:** RN ya tiene welcome modal (text/video + version bump), logo en header/perfil/Mi Marca, brand score, UI de loader, colores custom + `use_brand_colors_coach`, org-managed lock, share nativo, deep-links `/c/<slug>`. Conocido-abierto: QR "falta lib qrcode" (handoff). Fila #6 era `⏳` — primera pasada.

### 6.1 Mapa de archivos

| Capa | RN | Web |
|------|-----|-----|
| Pantalla | `(tabs)/settings.tsx` (410 ln, monolítico) | `settings/page.tsx` (RSC, tier-gate) → `BrandSettingsForm.tsx` (763 ln) |
| Logo | inline en settings.tsx (`uploadCoachLogo`) | `LogoUploadForm.tsx` (card aparte) |
| Loader (render real) | `components/EvaLoader.tsx` | `components/ui/EvaRouteLoader.tsx` |
| Preview en-form | card chica inline (`BrandWordmark`) | `_components/BrandThemePreview.tsx` (phone mock 4 tabs + dark) |
| Preview full-screen | **ninguno** | `settings/preview/page.tsx` + `StudentDashboardPreview.tsx` |
| Welcome modal (consumer) | `components/WelcomeModal.tsx` (YouTube/Vimeo embed) | (alumno) |
| Danger zone | **ninguno** | `_components/DangerZone.tsx` |
| Tour | **ninguno** | `_components/BrandSettingsTour(Client).tsx` (9 pasos) |
| Datos/mutaciones | `lib/coach-brand.ts` (Supabase directo, validación ad-hoc) | `_actions/settings.actions.ts` (admin client + Zod `@eva/schemas`) + `_data/settings.queries.ts` |

### 6.2 Composición / orden

| Web (page + BrandSettingsForm) | RN (settings.tsx) | Estado |
|--------------------------------|-------------------|--------|
| Tier-gate → paywall si `!canUseBranding` | **sin gate** | 🔴 M-F4 |
| `WhatChangesList` intro (6 ítems) | — | 🔴 M-F18 |
| Logo card (drag-drop + preview) | brand score + bar | 🟡 |
| Brand score + badge "Sin guardar" | **live-preview card** (logo+nombre+swatch+loader) | 🟡 M-F6/M-F16 |
| **Identidad**: full_name, brand_name, **slug (+lock 30d)**, welcome_message, welcome modal | brandName + welcome_message + welcome modal (**sin full_name, sin slug editable**) | 🔴 M-F2/M-F3 |
| **Color**: presets + picker nativo + contraste WCAG + paleta + reset | presets + hex TextInput + `useBrandColors` toggle (**sin picker/contraste/paleta/reset**) | 🟡 M-F8/M-F9 |
| **Loader**: toggle + texto + icon-mode + gradient/solid (**renderizado**) | misma UI (**pero no renderiza — ghost**) | 🔴 M-F1 |
| Share/QR card | Share card (code + URL + share nativo, **sin QR**) | 🟡 M-F7 |
| `BrandThemePreview` sticky + link a `/preview` | — | 🔴 M-F6 |
| DangerZone (eliminar cuenta) | — | 🔴 M-F5 |
| Tour 9 pasos | — | 🔴 M-F10 |

### 6.3 Capa de datos (función)

- **Read:** web `getCoachSettingsForUser` (~40 cols, RSC). RN `getCoachBrandSettings` (`coach-brand.ts:46`, 17 cols brand, Supabase directo). Ambos `.eq('id', user.id)` (own-row RLS). **Auth ✅** — `org_id` del JWT (`getCoachOrgContext`), nunca del body; **org scoping correcto aquí** (own-row, no aplica TX-4).
- **Write:** web `updateBrandSettingsAction` (admin client + `BrandSettingsSchema` Zod). RN `updateCoachBrandSettings` (`coach-brand.ts:73`, user session/RLS, validación ad-hoc). **Verificado (`:97-111`):** payload escribe brand/color/loader/welcome/modal+version pero **NO `full_name` ni `slug`**.
- **Logo:** ambos suben al bucket `logos` con cache-bust. RN `uploadCoachLogo` resize→PNG 512 (`expo-image-manipulator`) — normaliza (mitiga MIME/tamaño) 🔵 pero sin guard explícito. Web valida ≤2MB + magic-bytes.
- **Sin Zod compartido (M-F11 · TX-6):** existe `BrandSettingsSchema` en `packages/schemas/coach.ts` (web lo usa); RN no lo importa → falta límites welcome(240)/loader(10)/modal(1000) + refine video YouTube/Vimeo.
- **Silent-catch (M-F12 · TX-1):** `getCoachBrandSettings`/`getCoachOrgContext` ignoran `.error` → pantalla en estado default sin avisar. Mutaciones sí devuelven `{ok,error}` ✅.

### 6.4 Sección por sección

- **Identidad:** brand_name + welcome_message ✅. **full_name no editable** (M-F2), **slug no editable** (M-F3, web tiene lock 30d + uniqueness + previous_slugs).
- **Color:** presets (sets distintos: web 8 sin `#007AFF`, RN 9 con `#007AFF` — M-F19) + hex. Faltan: **picker nativo** (M-F9), **badge contraste WCAG**, **paleta generada (5 swatches)**, **reset** (M-F8) → coach puede elegir color ilegible sin feedback.
- **Loader (el gap grande):** la UI de loader (toggle, texto, icon-mode eva/coach/none, gradient/solid) existe y **persiste**, pero **`EvaLoader.tsx` la ignora por completo** — props solo `size`/`subtitle`, render hardcodeado "EVA" multicolor. **Verificado.** El coach configura, ve el cambio solo en el preview de settings (`BrandWordmark`), el brand-score sube, guarda — y el loader real del alumno **nunca cambia** (M-F1). Web `EvaRouteLoader` sí honra `iconMode`/`coachLogoUrl`/texto.
- **Welcome message/modal:** ✅ paridad (enable, text/video, version bump). Falta: límites de caracteres (M-F14), errores por-campo (M-F17).
- **Preview:** RN solo card chica; sin `BrandThemePreview` (phone mock 4 tabs + dark) ni ruta full-screen `/preview` (M-F6).
- **Share:** code + URL + **share nativo** 🔵; **sin QR** (M-F7).
- **Danger Zone:** **ausente** (M-F5) — web `deleteCoachAccountAction` (Ley 21.719: cancela MP, anonimiza PII, borra logs/checkins, `deleteUser`). Requiere service-role → endpoint, no client-side.
- **Tour:** ausente (M-F10).

### 6.5 Hallazgos de Mi Marca

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **M-F1** | **S1** | **Loader = ghost setting** | UI de loader (texto/icon-mode/color/gradient) se configura y **persiste**, pero `EvaLoader.tsx` (loader real) la **ignora** — siempre "EVA" multicolor (props solo size/subtitle). Coach ve el cambio solo en el preview de settings + sube brand-score, pero el alumno nunca lo ve. Web `EvaRouteLoader` sí lo renderiza. | Cablear `EvaLoader` para consumir `loader_text`/`loader_icon_mode`/`loader_text_color`/`use_custom_loader`. Ver **TX-9**. |
| **M-F2** | S2 | `full_name` no editable | `updateCoachBrandSettings` no escribe `full_name` (verificado); web sí (requerido, billing/soporte). | Añadir campo + write. |
| **M-F3** | S2 | `slug` (URL app) no editable | Web permite cambiar slug (lock 30d + uniqueness + previous_slugs); RN read-only. | Portar edición de slug (idealmente vía endpoint). |
| **M-F4** | S2 | Sin tier-gate `canUseBranding` | RN gatea solo `orgManaged`; free-tier edita/guarda branding que web bloquea con paywall. | Gate por capability. Ver **TX-7**. |
| **M-F5** | S2 | Danger Zone / eliminar cuenta ausente | Web `deleteCoachAccountAction` (erasure Ley 21.719). RN sin equivalente. Legal/compliance. | Endpoint service-role + UI de borrado. |
| **M-F6** | S2 | Sin preview dashboard alumno | Web `/preview` full-screen + `BrandThemePreview` (4 tabs + dark); RN card chica. | Portar preview navegable. |
| **M-F7** | S2 | Sin QR del link | Web `QRCodeSVG`; RN solo share link. (Conocido: falta lib.) | Añadir `react-native-qrcode-svg`. |
| **M-F8** | S2 | Sin contraste WCAG / paleta / reset | Web muestra AA/fail + ratio + 5 swatches + restaurar; RN nada → color ilegible sin feedback. | Portar `getContrastInfo` + swatches. |
| **M-F9** | S2 | Sin color picker nativo | Web `<input type=color>` (brand + loader solid); RN solo hex TextInput. | Picker de color RN. |
| **M-F10** | S2 | Sin onboarding tour | Web 9 pasos spotlight; RN nada. | Portar tour (ya hay patrón en builder). |
| **M-F11** | S2 | Sin Zod / schema compartido | RN no usa `BrandSettingsSchema` (`@eva/schemas`); valida ad-hoc → falta límites + refine video. RN puede guardar URL de video inválida / contenido sobre-largo. | Reusar el schema. Ver **TX-6**. |
| **M-F12** | S2 | Silent-catch en load | `getCoachBrandSettings`/`getCoachOrgContext` ignoran `.error`. | Inspeccionar error + UI. Ver **TX-1**. |
| **M-F13** | S3 | Brand-score formula diverge | Pesos distintos; RN no puntúa el modal (loader 20 en vez de 15+15). | Alinear fórmula. |
| **M-F14** | S3 | Sin límites/contadores de texto | welcome 240 / modal 1000 no enforced en RN. | Añadir maxLength + counter. |
| **M-F15** | S3 | Logo sin guard tamaño/MIME | RN resize→PNG mitiga, pero sin validación explícita. | Validar antes de subir. |
| **M-F16** | S3 | Sin indicador "sin guardar" | Web badge dirty + beforeunload; RN nada. | Añadir dirty state. |
| **M-F17** | S3 | Errores por-campo ausentes | RN un solo string genérico; web por campo. | Mapear errores. |
| **M-F18** | S3 | `WhatChangesList` intro ausente | Grid de 6 ítems web; RN no. | Cosmético. |
| **M-F19** | S3 | Presets de color distintos | Web 8 (sin `#007AFF`) vs RN 9 (con `#007AFF`). | Alinear set. |

**Mejoras RN (🔵, constancia):** share nativo (`Share.share`) apropiado para móvil; logo normalizado a PNG 512 (sidestep MIME/tamaño); welcome modal completo + consumer con embed YouTube/Vimeo + dismiss por versión; org-managed lock; theming runtime vía `@eva/brand-kit`.

### 6.6 Veredicto Mi Marca

**🟡 Parcial.** La config de marca **se ve completa** (color, logo, loader, welcome modal, share, brand score) y varias piezas están a paridad, pero esconde **1 S1 grave**: **M-F1** — el loader es un **ghost setting** (se configura/persiste/puntúa pero `EvaLoader` lo ignora → el alumno nunca lo ve; falsa confianza). Más una pila de S2: **campos no editables** (full_name M-F2, slug M-F3), **sin tier-gate** (M-F4), **Danger Zone/erasure ausente** (M-F5, legal), **sin preview navegable/QR/contraste/picker/tour** (M-F6..F10), y la familia transversal **sin-Zod/silent-catch** (M-F11/M-F12). **Acciones prioritarias: M-F1 (ghost loader), M-F5 (erasure legal), M-F2/M-F3 (campos), M-F4 (gate).**

---

## 7. Suscripción (coach)

> **Menú chico, mayormente link-out por diseño.** Web: `subscription/page.tsx` (538 ln: plan actual, picker, ciclos, modal upgrade, historial pagos, cancelar) + `subscription/processing/page.tsx` (poll MercadoPago). RN: `(tabs)/subscription.tsx` (135 ln) + libs `coach-subscription.ts`/`coach-tiers.ts`. **MercadoPago NO es nativo en móvil** (documentado `CODEX_HANDOFF.md:151` "web-only por diseño, NO portar") → RN muestra plan/uso/renovación + **link-out** a la web para pagos/cambios. La mayoría de "gaps" son **intencionales**.
>
> **Consolidación previa:** screen llegó con el lote de AppBackground + billing banners (`6d61c8c`/`7d5ef96`). Fila #7 era `⏳` — primera pasada.

### 7.1 Mapa de archivos

| Capa | RN | Web |
|------|-----|-----|
| Pantalla | `(tabs)/subscription.tsx` (135 ln) | `subscription/page.tsx` (538 ln) |
| Processing/poll MP | **ninguno** (checkout corre en el browser) | `subscription/processing/page.tsx` |
| Datos | `lib/coach-subscription.ts` (`getCoachSubscriptionOverview`) + `lib/coach.ts` | `api/payments/subscription-status/route.ts` |
| Tier config | `lib/coach-tiers.ts` (copia manual `{label,maxClients}`) | `lib/constants.ts` (`TIER_CONFIG`+`TIER_CAPABILITIES`+precios+ciclos) |
| Mutaciones MP | **ninguna** (link-out) | `api/payments/{create-preference,cancel-subscription,confirm-subscription,webhook}` |

### 7.2 Composición / orden

| RN (subscription.tsx) | Web (page.tsx) | Estado |
|-----------------------|----------------|--------|
| Plan actual (tier + badge binario success/muted) | Plan actual (icono tier + pill 5 estados + range + precio) | 🟡 SU-F5 |
| **Uso ALUMNOS** (clientCount/max + ProgressBar) 🔵 | (sin medidor — solo range label estático) | 🔵 RN más rico |
| Renovación (fecha) | Próximo cobro (fecha **+ precio**) | 🟡 SU-F6 |
| Org-managed lock **o** botón "Gestionar plan en la web" (link-out) | Cambiar plan (picker + ciclos + grid pricing) + modal + cancelar + **historial pagos** | 🔵 intencional / 🔴 SU-F4 |

### 7.3 Capa de datos (función)

- **Read:** RN `getCoachSubscriptionOverview` (`Promise.all([getCoachProfile, getCoachOrgContext])` + count de `clients`). Web `/api/payments/subscription-status` (+ 50 `subscription_events`). Mismos 4 campos core de `coaches` (`subscription_status/tier/current_period_end/trial_ends_at` + `max_clients`). RN **no lee** `billing_cycle`, `payment_provider`, ni `subscription_events`.
- **Tier config (SU-F2 · TX-6):** **duplicado a mano** en `coach-tiers.ts` (no `@eva/types`/`packages`). `maxClients` **6/6 coincide con web ✅** (sin S1 de límite incorrecto; además el `max` real viene de `coaches.max_clients` en DB, escrito por web). Pero la copia es **incompleta**: sin precios, sin billing cycles, solo `canUseNutrition` (1 de 5 capabilities web). Label interno inconsistente: `coach-tiers` `'Free'` vs `coach-subscription` `'Gratis'` (web `'Free'`).
- **Mutaciones MP:** **ninguna nativa** — `Linking.openURL('https://eva-app.cl/coach/subscription')`. **Intencional** (MP no nativo). 🔵
- **Auth/org ✅:** `org_id` del JWT (`getCoachOrgContext`), nunca del body. Org-managed lock correcto.
- **Silent-catch (SU-F3 · TX-1):** `coach-subscription.ts` ignora `.error` del count → falla coalesce a `clientCount:0` → barra "0 / max" falsa. `coach.ts`/`org.ts` también tragan error.

### 7.4 Sección por sección

- **Plan/tier:** RN label + badge binario; web icono + pill de 5 estados color. RN omite precio en la línea de período (SU-F6).
- **Uso:** RN **más rico** (medidor clients/max + ProgressBar + "ilimitados"); el screen web no tiene medidor aquí. 🔵
- **Estados trial/grace/canceled:** RN maneja `trialing` ✅. **Pero `canceled` mal etiquetado** (SU-F1): `renewLabel` solo bifurca trialing → muestra "Próxima renovación" + `currentPeriodEnd` para canceled (verificado `:59`); web muestra "Acceso hasta" + copy de gracia. Sin estado `pending_payment`/`org_managed` en `STATUS_LABELS` → string crudo (SU-F5).
- **Upgrade/cancel/processing/reactivate:** **link-out a web, intencional** (MP no nativo). 🔵 No son gaps reales.
- **Historial de pagos:** RN no carga `subscription_events` (SU-F4) — read-only, podría mostrarse nativo.

### 7.5 Hallazgos de Suscripción

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **SU-F1** | S2 | **Estado "canceled" mal etiquetado** | `renewLabel` (`:59`) solo bifurca `trialing`; para `canceled` muestra "Próxima renovación" + `currentPeriodEnd` (web: "Acceso hasta" + gracia). Coach cancelado ve fecha engañosa. | Añadir rama `canceled` → "Acceso hasta". |
| **SU-F2** | S2 | **Tier config duplicado a mano + incompleto** | `coach-tiers.ts` copia manual (no `packages`); sin precios/ciclos, solo 1 de 5 capabilities; label `'Free'` vs `'Gratis'` (coach-subscription) vs web. `maxClients` 6/6 ✅ (sin S1). Drift hazard. | Extraer módulo de tier compartido. Ver **TX-6**. |
| **SU-F3** | S2 | **Silent-catch → "0 alumnos" falso** | `coach-subscription.ts` ignora `.error` del count → falla coalesce a `clientCount:0` → barra de uso falsa. `coach.ts`/`org.ts` igual. | Inspeccionar error + estado de error. Ver **TX-1**. |
| **SU-F4** | S2 | **Historial de pagos no cargado** | Web tabla `subscription_events`; RN no consulta ni muestra (read-only, mostrable nativo). | Cargar + render historial. |
| **SU-F5** | S3 | Status labels/colores faltantes | Sin `pending_payment`/`org_managed` en `STATUS_LABELS` (→ string crudo); badge binario vs 4 estados color web. | Completar labels + colores. |
| **SU-F6** | S3 | Sin precio en renovación | RN no lee `billing_cycle` → renewal card sin precio (web "Próximo cobro · $X"). | Mostrar precio (si se decide). |
| **SU-F7** | S3 | URL "Gestionar plan" hardcodeada a prod | `https://eva-app.cl/...` no derivada de env → build staging deep-linkea a prod. | Derivar de `NEXT_PUBLIC_SITE_URL`. |
| **SU-F8** | S3 | Señal org-managed divergente | RN usa JWT `org_id` presence; web usa `subscription_status==='org_managed'` → pueden discrepar durante enrollment. | Alinear señal. |

**Intencionales (🔵, NO son gaps):** upgrade/cambio de plan, cancelar, processing/poll, reactivar = **link-out a web** (MP no nativo, por diseño, no portar). **Mejoras RN:** medidor de uso (clients/max + ProgressBar) **más rico que web**; org-managed lock correcto; `maxClients` 6/6 + `getRecommendedTier` + `canUseNutrition` idénticos a web; `org_id` del JWT.

### 7.6 Veredicto Suscripción

**🟡 Parcial (cerca de paridad).** Por diseño el menú es **view + gestionar-en-web** (MP no nativo), así que la mayoría de "faltantes" (checkout, cancelar, processing, reactivar) son **link-out intencional** y NO gaps. RN incluso es **más rico** en el medidor de uso. Sin S1. Los pocos S2 reales: **SU-F1** (canceled mal etiquetado — correctness), **SU-F2** (tier config duplicado/incompleto — drift), **SU-F3** (silent-catch → "0 alumnos" falso), **SU-F4** (sin historial de pagos). **Acciones prioritarias: SU-F1, SU-F3, luego SU-F2.** Sin transversales nuevos — refuerza **TX-1** y **TX-6**.

---

## 8. Soporte (coach)

> **Menú chico con enfoques DISTINTOS.** Web = **formulario de ticket estructurado** (`SupportForm` → server action). RN = **FAQ accordion + `mailto:` + link a /ayuda** (`(tabs)/support.tsx`, sin lib). No es un port: cada lado eligió un canal distinto. **Sin API mobile.** Fila #8 era `⏳` — primera pasada (auditada leyendo los 4 archivos a mano).

### 8.1 Mapa de archivos

| Capa | RN | Web |
|------|-----|-----|
| Pantalla | `(tabs)/support.tsx` (78 ln: FAQ + 2 botones de contacto) | `support/page.tsx` → `SupportForm.tsx` (295 ln, rhf + Zod) |
| Envío | `Linking.openURL('mailto:soporte@eva-app.cl')` | `_actions/support.actions.ts` (`sendSupportMessage`) |
| Adjunto | — | `supabase.storage.from('support-attachments')` |
| Validación | — | `SupportMessageSchema` (`@eva/schemas`) + rate-limit + email (Resend) |

### 8.2 Composición / orden

| Web (SupportForm) | RN (support.tsx) | Estado |
|-------------------|------------------|--------|
| Header "Centro de Ayuda" + intro | Header "Soporte / Ayuda y contacto" | ✅ |
| **Tipo** (help/bug/idea chips) | — | 🔴 SO-F1 |
| **Asunto** (req, 3–200) | — | 🔴 SO-F1 |
| **Prioridad** (solo bug: baja/media/alta) | — | 🔴 SO-F1 |
| **Descripción** (req, 10–5000) | — | 🔴 SO-F1 |
| **Adjunto** (PNG/JPG/PDF ≤2MB) | — | 🔴 SO-F2 |
| Submit → email con metadata | botón **"Escribinos por email"** (`mailto:`) + **"Centro de ayuda"** (`/ayuda`) | 🟡 SO-F1 |
| — | **FAQ accordion (6 preguntas)** | 🔵 RN extra |

### 8.3 Capa de datos (función)

- **Web:** `sendSupportMessage` (server action) — auth → **rate-limit** (`rateLimitSupport`) → **Zod** (`SupportMessageSchema`) → fetch coach (`full_name/brand_name`) → `buildSupportEmail` → `sendTransactionalEmail` (Resend) a `SUPPORT_EMAIL_TO`, `replyTo` = email del coach, **metadata** (url/userAgent/timestamp/coachId). Adjunto sube a bucket `support-attachments`.
- **RN:** **sin capa de datos** — `mailto:soporte@eva-app.cl` abre el cliente de correo del device (sin prefill, sin metadata, sin rate-limit, sin adjunto). FAQ es **estática hardcodeada** (6 ítems en el archivo). Si el device no tiene cliente de correo configurado, el botón no hace nada (`.catch(() => {})`).

### 8.4 Sección por sección

- **Contacto:** web = ticket estructurado in-app; RN = `mailto:` + link a centro de ayuda. RN pierde tipo/prioridad/asunto/descripción estructurados, adjunto y la metadata de triage; depende del cliente de correo del device.
- **FAQ:** **RN tiene 6 preguntas en accordion** (agregar alumno, crear programa, crear ejercicios, personalizar marca, cobrar, seguridad/Ley 21.719); **web no tiene FAQ** en esta pantalla. 🔵 RN ahead en self-service. (Nota: la FAQ menciona "Planes" — el tab real es "Programas"/builder, copy menor, SO-F5.)

### 8.5 Hallazgos de Soporte

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **SO-F1** | S2 | **Sin formulario de ticket estructurado** | Web: tipo/asunto/prioridad/descripción + email con metadata + rate-limit + Zod. RN: `mailto:` plano (sin prefill/tipo/prioridad/metadata; depende del cliente de correo del device → botón muerto si no hay correo configurado). Soporte pierde metadata de triage. | Portar el form (server action/endpoint) **o** al menos prefill el `mailto:` con asunto/cuerpo + versión app + coachId. |
| **SO-F2** | S3 | Sin adjuntar archivo | Web permite screenshot/PDF (≤2MB) para bug reports; RN no. | Añadir adjunto (expo-image-picker/document-picker). |
| **SO-F3** | S3 | `mailto:` sin prefill | Sin asunto/cuerpo template ni contexto (tipo, versión app, plataforma). | Prefill el mailto. |
| **SO-F4** | S3 | Metadata de triage ausente | Web envía url/userAgent/timestamp/coachId; RN nada. | Incluir metadata en el prefill/payload. |
| **SO-F5** | S3 | FAQ copy "Planes" vs "Programas" | La FAQ dice "En 'Planes'" pero el tab es "Programas"/builder. | Corregir copy. |

**Mejoras RN (🔵, constancia):** **FAQ accordion (6 preguntas)** que la web **no tiene** en esta pantalla — mejor self-service; link directo a "Centro de ayuda" (`/ayuda`); contacto por `mailto:` + help link son patrones móviles razonables.

### 8.6 Veredicto Soporte

**🟡 Parcial (enfoques distintos).** No es un port 1:1: web prioriza un **ticket estructurado** (tipo/prioridad/adjunto + metadata de triage + rate-limit + Zod), RN prioriza **self-service** (FAQ que la web no tiene) + contacto `mailto:`. Sin S1 — el coach puede contactar soporte por ambos lados. El gap real es **SO-F1** (sin form estructurado → soporte pierde metadata y el `mailto:` depende del cliente de correo del device); el resto es S3 (adjunto, prefill, metadata, copy). **Acción prioritaria: SO-F1** (mínimo: prefill el mailto con metadata). Sin transversales nuevos.

---

## 9. Huérfanos (coach — pantallas sin navegación)

> **No es un menú web** sino un defecto de navegación **interno de RN**: dos pantallas construidas (`(tabs)/check-ins.tsx`, `(tabs)/perfil.tsx`) que **no tienen entrada de navegación intencional**. Es el sujeto de **TX-2**. Auditado leyendo `_layout.tsx`, `CoachMobileChrome.tsx` y ambas pantallas a mano + grep de referencias.

### 9.1 Mapa de archivos

| Pantalla huérfana | Qué es | Equivalente web |
|-------------------|--------|-----------------|
| `(tabs)/check-ins.tsx` (218 ln) | Feed **cross-alumno** de check-ins (últimos 40, todos los alumnos): nombre, fecha, peso, energía + barra, fotos (lightbox), notas | **Ninguno** — web ve check-ins **por alumno** (detalle Progreso, #2) o en la agenda del dashboard. Feed agregado = concepto solo-móvil |
| `(tabs)/perfil.tsx` (305 ln) | Perfil/cuenta del coach: hero (logo/nombre/slug), org, suscripción (+ link web), conteo alumnos, **toggle push**, **cambiar contraseña**, **Mis alimentos**, **logout** | Disperso en web: logout (nav), identidad (settings), change-password (ruta), push (browser) |

Nav chrome: `components/coach/CoachMobileChrome.tsx` (`CoachMobileHeader` + `CoachMobileTabBar`).

### 9.2 Composición / navegación

- **`_layout.tsx`** declara **8** `<Tabs.Screen>`: home, clientes, builder, ejercicios, nutricion, settings, subscription, support. **NO** declara `check-ins` ni `perfil`.
- **`CoachMobileTabBar`** muestra 4 PRIMARY (home/clientes/builder/nutricion) + sheet **"Más"** con el overflow (ejercicios, settings, subscription, support). **`NAV_META` no tiene entrada para check-ins/perfil** → si expo-router las auto-registrara en `state.routes`, aparecerían en "Más" con **label crudo** ("check-ins"/"perfil") e icono genérico (exposición no intencional); si no, **inalcanzables**. En ambos casos: sin entrada de navegación deliberada.
- **Grep confirmado:** no hay `router.push('/coach/check-ins')` ni `router.push('/coach/perfil')` en ningún lado de `apps/mobile`.

### 9.3 Capa de datos (función)

- `check-ins.tsx`: Supabase directo — `clients` del coach (no archivados) → `check_ins` `.in(client_id)` limit 40. **Silent-catch** (`load().catch(()=>setLoading(false))` + queries ignoran `.error`) → TX-1.
- `perfil.tsx`: `getCoachProfile` + `getCoachOrgContext` + count de `clients` activos + `subscription_tier/period/trial`. Toggle push vía `syncPushToken` + `expo-notifications`. Logout = `supabase.auth.signOut()`.

### 9.4 Sección por sección (qué se pierde por el orphan)

- **Logout:** ✅ **también está en el header** (`CoachMobileHeader:177-185`, `LogOut` → `handleSignOut`) → **no se pierde**.
- **Mis alimentos:** ✅ reachable también desde el hub de Nutrición (Alimentos → `/coach/foods`, #5) → no se pierde.
- **Suscripción/identidad:** redundante con el tab Suscripción (#7) y Mi Marca (#6).
- **Push notifications toggle:** 🔴 **solo en `perfil.tsx`** → inaccesible. El coach no puede gestionar push desde la UI (riesgo: no recibe alertas de alumnos).
- **Cambiar contraseña:** 🔴 **solo en `perfil.tsx`** (→ `/change-password`) → inaccesible.
- **Feed de check-ins cross-alumno:** 🔴 pantalla construida y funcional, **desperdiciada** (no navegable). Buena feature solo-móvil sin exponer.
- **Header Bell/Noticias:** muerto (sin `onPress`, `:160-167`) = **TX-3**. Web tiene novedades.

### 9.5 Hallazgos de Huérfanos

| ID | Sev | Hallazgo | Detalle | Acción propuesta |
|----|-----|----------|---------|------------------|
| **O-F1** | S2 | **2 pantallas sin entrada de navegación** | `check-ins.tsx` y `perfil.tsx` no están en `_layout.tsx` ni `NAV_META`, ni hay `router.push` hacia ellas. Funciones únicas inaccesibles: **toggle push** y **cambiar contraseña** (solo en perfil). Feed de check-ins cross-alumno desperdiciado. (Logout→header y foods→Nutrición sí reachable.) | Decidir: (a) añadir `perfil` y `check-ins` al overflow "Más" con `NAV_META` propio + entrada de nav, o (b) mover push-toggle/change-password a Mi Marca y borrar las pantallas muertas. |
| **O-F2** | S3 | **Bell/Noticias header muerto** | `CoachMobileHeader:160-167` sin `onPress`. Web tiene novedades. = **TX-3**. | Cablear a novedades o quitar el botón. |
| **O-F3** | S3 | Silent-catch en `check-ins.tsx` | `load().catch(()=>setLoading(false))` + queries ignoran `.error` → feed vacío sin avisar. = **TX-1**. | Inspeccionar error + UI. |
| **O-F4** | S3 | `perfil.tsx` `TIER_LABELS` incompleto | Solo starter/pro/elite (faltan free/growth/scale). Orphan igual. | Completar si se rescata la pantalla. |

**Nota:** `check-ins.tsx` no tiene equivalente web (feed agregado = concepto solo-móvil), así que no es un gap de paridad vs web sino una **feature móvil sin exponer**. `perfil.tsx` consolida funciones que en web están dispersas.

### 9.6 Veredicto Huérfanos

**🔴 Gap (navegación).** Dos pantallas funcionales construidas pero **sin entrada de navegación intencional** (TX-2). El impacto real es acotado porque **logout (header) y foods (hub Nutrición) sí son alcanzables** por otra vía; lo que queda **inaccesible** es el **toggle de push notifications** y **cambiar contraseña** (únicos en `perfil.tsx`), más el **feed de check-ins cross-alumno** desperdiciado. Plus el **Bell muerto** (TX-3). **Acción prioritaria: O-F1** — exponer `perfil` (al menos push + change-password) en "Más", o reubicar esas funciones y borrar lo muerto. Refuerza **TX-2** y **TX-3**; sin transversales nuevos.

---

## Estado del tracker

**9/9 menús coach standalone auditados** (este doc): #1 Dashboard, #2 Alumnos, #3 Programas, #4 Ejercicios, #5 Nutrición, #6 Mi Marca, #7 Suscripción, #8 Soporte, #9 Huérfanos. Fuera de alcance (por diseño): enterprise/alumno.

---

## Estado de remediación (implementación)

> Sin cambios de schema (solo columnas/tablas existentes). Cada tanda valida `tsc` + `expo export`. Estados: ✅ hecho · 🔧 en curso · ⏳ pendiente.
>
> **Implementado a la fecha (~57 ítems, todos validados verde):** los 7 S1 · TX-4(safe)/5/6(local)/7/9 · A-F3/F4/F5/F6/F8/F9/F10/F11/F13(parcial)/F14/F22/F24 · N-F1/F2/F3/F5/F7/F15/F16/F21/F6(full)/F25 · P-F1/F2/F3/F4/F5/F7/F8 · M-F1/F2/F3/F4/F7/F8/F9/F11/F14 · E-F1/F2/F3/F5/F7/F8 · SU-F1/F5 · SO-F1/F3/F4/F5 · O-F1/F2. **Dep:** `react-native-qrcode-svg`. **Endpoint nuevo:** `api/mobile/coach/slug`.
>
> **Quedan SOLO 2 con blocker duro** (no por código): **M-F5** (destructivo → confirmación explícita) y **P-F14** (RPC Supabase → vedado por "no tocar Supabase"). Lo demás del documento está implementado.
> **Restante = límite real:** (a) **bloqueado por dep** (el usuario corre `pnpm install`): M-F7 QR, M-F9 picker, TX-6 `@eva/schemas`; (b) **bloqueado por endpoint server**: M-F5 borrar-cuenta, M-F3 slug, A-F13 archive-emails; (c) **net-new grande que necesita endpoint de adherencia**: N-F6 board all-clients, A-F14 import CSV; (d) **diferido por riesgo standalone**: TX-4 org-filter reads, E-F5, P-F3/F14 unify transaccional; (e) **polish S3**.

### Wave 0 — S1 correctness ✅ (validada tsc + export)
| ID | Estado | Qué se hizo |
|----|--------|-------------|
| N-F1 | ✅ | `getClientFoodFavorites` apunta a `client_food_preferences` + `preference_type='favorite'` (antes tabla inexistente → favoritos siempre vacíos). |
| D-F1 | ✅ | `getCoachDashboardDataMobile` reintenta el endpoint 1× antes de degradar; el fallback marca `degraded:true`; `home.tsx` muestra banner "Datos limitados — Reintentar". |
| M-F1 | ✅ | `CoachBranding` + fetch ahora traen `logo_url/use_custom_loader/loader_text/loader_icon_mode/loader_text_color` (fallback de columnas); `EvaLoader` los honra (logo coach / texto+color / icon-mode) — el loader deja de ser ghost. |
| A-F1 | ✅ (alcanzable) | Acción "Editar datos" añadida al FAB del detalle → abre `EditClientForm` (antes inalcanzable). *Pendiente ampliar a `client_intake` (Wave 2).* |
| A-F2 | ✅ | Nuevo `lib/program-week-variant.ts` (port 1:1); `PlanTab` resuelve variante AB/cíclica activa con `filterPlansForStructureView` + pill "A/B · X esta sem." (antes días duplicados/incorrectos). |
| P-F2 | ✅ | `persistProgram` desactiva el programa activo previo del alumno antes de activar el nuevo (evita doble activo), en ambas ramas (crear/editar). |
| P-F1 | ✅ | Sync template→alumno implementado: `mergeBlocksForSync` (respeta overrides) + `syncProgramFromTemplate` + `confirmSync` cableado en la card (antes era stub). |

### Wave 1 — Transversales (parcial) 🔧
| TX | Estado | Nota |
|----|--------|------|
| TX-5 confirmaciones | ✅ | `handleToggle`/`handleReset` (clientes.tsx) ahora confirman con `Alert` antes de pausar/resetear. |
| TX-7 tier-gate | ✅ | `coach-tiers.ts` ahora tiene `TIER_CAPABILITIES` 1:1 web + `canUseBranding/canCreateCustomExercises/canImportClients`. **Gate aplicado**: Nutrición (upsell si !Pro, N-F2) + Mi Marca (upsell si !Starter y no org, M-F4). Falta enforcement en mutación de ejercicios (E-F7, Wave 2). |
| TX-9 ghost sweep | ✅ | Loader cableado (M-F1). Barrido: no se hallaron otros settings que persistan sin consumidor. |
| TX-1 silent-catch | 🔧 parcial | Cerrados: pulse (`ff7f7d9`), dashboard (D-F1). Resto (directorio A-F19, nutrición N-F18, ejercicios E-F10, etc.) se cierra **por-menú en Wave 2** (necesitan estado de error/retry en cada pantalla). |
| TX-4 org-scope reads | ✅ (paths principales) | Resuelto **seguro** con `selectWithFallback` (rich con `org_id` → fallback sin org si la columna no existe en prod vieja). Aplicado: directorio de alumnos (`getCoachDirectoryClients`), ejercicios (`listCoachExercises` + rama org, E-F5), plantillas de nutrición (`listTemplates`, N-F5). |
| TX-6 Zod/schemas | ⛔ bloqueado | `@eva/schemas`/`@eva/types` **no** son deps de `apps/mobile` (solo `zod ^4.3.6`). Reuso real requiere agregar el workspace dep + `pnpm install` (lo hace el usuario). Alternativa parcial: validación Zod local por-write. |

### Wave 2 — S2 por menú 🔧

**Alumnos** (parcial):
| ID | Estado | Qué |
|----|--------|-----|
| A-F4 | ✅ | `ClientRow` (vista lista default) ahora muestra adherencia% + último-log (dot+label) + peso±Δ7d desde el pulse. |
| A-F5 | ✅ | `lib/profile-top-alert.ts` (port 7 reglas) + banner de triage en `OverviewTab` (check-in stale, sin workout 7d, nutrición<60, plan vencido/≤3d, racha). |
| A-F8 | ✅ | Filtro de estado `pending_sync` ("Cambio de contraseña pendiente") añadido. |
| A-F9 | ✅ | Sorts **Adherencia** + **Peso: mayor cambio** (threading `pulseById` a `sortClients`). |
| A-F11 | ✅ | (vía TX-5) reset-pw + toggle-status con confirmación. |
| A-F3 | ✅ (CTA) | Tab Nutrición ahora enlaza a `nutrition-builder` (editar/asignar) + empty-state con CTA. *Mutaciones avanzadas (ciclo/historial) pendientes.* |
| A-F1 | 🔧 | Reachable (Wave 0). *Pendiente: campos `client_intake`.* |
| A-F10 | ✅ (parcial) | Banner de triage "adherencia nutricional baja" (cuenta desde pulse) + filtro `nutrition_low` cableado. |
| A-F13 | ✅ (parcial) | Reactivar alumno ahora **rechequea el límite del plan** client-side (bloquea si está lleno). El **email** sigue necesitando endpoint server. |
| A-F6/F15/F16/F18–F26 | ⏳ | Pendientes (score unificado, nutrición deep, plan grid, hero). |

**Suscripción** (parcial): SU-F1 ✅ (estado "canceled" → "Acceso hasta"), SU-F5 ✅ (`STATUS_LABELS` + `pending_payment`/`org_managed`). SU-F4 (historial) ⏳.

**Soporte** ✅: SO-F1/F3/F4 (mailto prefijado con versión app + plataforma + cuerpo template), SO-F5 (copy "Planes"→"Programas"). SO-F2 (adjunto) ⏳.

**Huérfanos** ✅: O-F1 (`perfil` "Mi cuenta" + `check-ins` expuestos en tab layout + NAV_META → accesibles vía "Más"; push-toggle + cambiar-contraseña ya alcanzables), O-F2 (Bell muerto removido del header).

**Ejercicios** (parcial): E-F3 ✅, E-F7 ✅, E-F8 ✅, E-F1 ✅ (subir imagen del device → resize PNG → Storage `exercise-media` → `image_url`; create/update ahora escriben `image_url`). Falta: E-F5 org path (riesgo standalone), E-F2 validación URL.

**Mi Marca** (mayormente ✅): M-F1 · M-F2 · M-F4 · M-F8 · M-F14 · M-F7 QR · M-F9 picker · M-F11 zod · **M-F3 ✅ slug editable** (nuevo endpoint `api/mobile/coach/slug` con uniqueness + lock 30d + previous_slugs; UI en Identidad; ambos typechean limpio). Restante: M-F5 danger-zone (**destructivo → requiere confirmación explícita**), M-F6 preview navegable (pantalla nueva).

**Programas** (parcial): P-F1/F2/F3/F4/F5/F7/F8 ✅ (P-F5 = guard de bloques sets≥1+reps en el save). P-F6 ✅ (assign con duración + aviso). Falta: P-F9 (fidelidad del preview, cosmético), P-F14 (atomicidad → idealmente server RPC).

**Facturación (Alumnos):** A-F24 ✅ (total cobrado solo `paid`).

**Nutrición** ✅ (núcleo completo): N-F1/F2/F3/F5/F7/F15/F16/F21/F25 + **N-F6-full ✅** (board de adherencia 7d: sparkline + kcal hoy + avg%, peor-primero, **client-side** sin endpoint). Resta solo N-F26/F27 (refactor/test, S3).

**Programas** +P-F8 ✅ (cycle clamp 7→31 al abrir).

### Bloqueados — actualizado
- ~~Deps~~ ✅ **RESUELTO**: instalé `react-native-qrcode-svg` → M-F7 QR hecho; M-F9 picker hecho **sin** dep extra (paleta HSL); TX-6 cubierto con **zod local** (M-F11) hasta poder compartir `@eva/schemas`.
- **M-F3** ✅ (endpoint `api/mobile/coach/slug`). **N-F6-full** ✅ (board client-side). **A-F14** ✅ (import por pegado, reusa el endpoint de crear alumno). **A-F13** ✅ parcial (recheck de límite; el email sigue siendo un side-effect de bajo valor).
- **Quedan exactamente 2 features con blocker DURO** (no por falta de código):
  - **M-F5 eliminar-cuenta** → **destructivo/irreversible** (borra cuenta + PII + cancela MP). NO se construye sin tu "sí" explícito (regla de seguridad de acciones irreversibles).
  - **P-F14 builder transaccional** → requiere **RPC/migración en Supabase**, vedado por tu regla "no tocar el Supabase live / sin modificar tablas".
  - Resto = **polish S3 cosmético** (A-F18 chips de hero, A-F23 umbral, P-F9 fidelidad de preview, M-F6 preview navegable, N-F26/F27 refactor/test).

### Features grandes restantes (net-new multi-archivo)
N-F6 board all-clients (pantalla nueva), N-F15 propagación in-place (riesgo orphan logs → idealmente server), E-F1 media pipeline (expo-image-picker + Storage), P-F3/F14 unificar editor builder org-aware + transaccional, M-F6 preview navegable, A-F14 import CSV.

### Wave 3 — Polish S3 🔧 (A-F22 ✅, M-F14 ✅ límites de texto; restan A-F18/F23, P-F15–F19, N-F20, etc.)
