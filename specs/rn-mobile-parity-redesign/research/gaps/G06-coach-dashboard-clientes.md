# G06 — Gaps: Coach dashboard + directorio de clientes + ficha del alumno

Dominio: Coach núcleo relacional (NO builder/nutrición/ejercicios). Cubre:
- Dashboard coach (`/coach/dashboard`) — KPIs, PulseHero, Prioridad de hoy, agenda, novedades.
- Directorio de clientes (`/coach/clients`) — filtros, orden, import wizard, war-room.
- Ficha del alumno (`/coach/clients/[clientId]`) — hero + 5 pestañas, export PDF dossier, asignar programa.

Fuente de verdad = comportamiento móvil (`md:hidden`) de `apps/web`. Referencias verificadas contra código.
Insumos: research 01/02/04/06/07 + spot-check de código mobile.

Archivos mobile de este dominio:
- Dashboard: `apps/mobile/app/coach/(tabs)/home.tsx` (178 L, shell patrón B) → delega a `apps/mobile/components/coach/CoachDashboardSections.tsx` (patrón A, 87 className) + `lib/coach-dashboard.ts` (`GET /api/mobile/coach/dashboard`).
- Directorio: `apps/mobile/app/coach/(tabs)/clientes.tsx` (1224 L, **patrón B legacy, StyleSheet, 0 className en el shell**) + `components/coach/ClientCard.tsx`, `components/coach/AssignClientsSheet.tsx` + `lib/clients-directory.ts` (`GET /api/mobile/coach/clients/pulse`), `lib/client-actions.ts`, `lib/import-clients.ts`.
- Ficha: `apps/mobile/app/coach/cliente/[clientId].tsx` (444 L, **shell patrón B**) → `components/coach/clientDetail/*` (10 archivos, mezcla A/B) + `lib/coach-client-detail.ts`, `lib/profile-analytics.ts` (port manual), `lib/progress-pdf.ts` (expo-print).

---

## 1. Gaps visuales (pantalla por pantalla)

### 1.1 Dashboard coach — estado: PARCIALMENTE re-skineado (patrón A)
El dashboard es el mejor caso del dominio: `CoachDashboardSections.tsx` ya usa clases DS y su estructura sigue el orden móvil de la web (banners → header → PulseHero → Prioridad → Agenda → Novedades → onboarding → FAB). Gaps finos:

- **Header (3 tiles) divergente.** Web (`DashboardShell.tsx` ~L106-184, rama `md:hidden`) tiene 3 tiles de 40px: (1) Insights `Sparkles` → abre `ClientStatsSheet`; (2) `NewsBellButton` campana con **badge de no-leídos** + su propio Sheet de novedades; (3) `HeaderBrandTile` (logo `object-contain` o iniciales con anillo sport) que, si `workspaces.length > 1`, lleva caret `ChevronDown` y abre `WorkspaceSwitchSheet`, si no es Link a settings. Mobile (`home.tsx` L95-102, `MobileGreetingHeader`): `onInsights` → `router.push('/coach/(tabs)/settings')` (**incorrecto**, debería abrir el stats sheet); `onNotifications` → `router.push('/coach/(tabs)/check-ins')` (no hay campana con badge de no-leídos ni sheet propio); avatar → perfil (sin caret ni workspace switcher).
- **Sin glow de marca full-bleed** detrás del header/dashboard. Web lo agregó en el delta post-21-jun (`f2b2ba31`/`18c7dd76`, delta §1.4). No hay equivalente RN (`AmbientBrandGlow`/`GlowBorderCard` sin puerto — research 02 §glow).
- **PulseHero:** web muestra 3 stats (Activos/En riesgo/Adherencia) con `deltaView` (TrendingUp/Down/Minus placeholder) y `Sparkline` en Adherencia. Verificar que `MobilePulseHero` replique delta + sparkline (research 04 §1 los marca como placeholders derivados — no bloqueante, pero deben verse).
- **Banners de tier divergentes:** web `TeamsBridgeBanner` gatea en tier=elite y **≥80 alumnos**; mobile `home.tsx` L73-75 gatea `>= 48`. Umbral distinto → drift.
- **Error state legacy:** `home.tsx` L61 usa `fontFamily: 'Montserrat_700Bold'` (fuente legacy, no Archivo/Hanken). Deuda de fuentes.

### 1.2 Directorio de clientes — estado: NO re-skineado (patrón B legacy)
`clientes.tsx` es una pantalla gigante en StyleSheet + objeto `theme` + hex literales (`SUCCESS/WARNING/DANGER/EMBER/INFO` hardcodeados L69-73, `hexToRgba` local). Estructura funcional presente (PulseCard de riesgo, StackCardItem con animación de apilado al scrollear, ClientCard, filtros search/sort/status/risk, import). Gaps visuales:

- **Todo el shell en patrón B:** no consume primitivas DS por className; colores vía `theme.*` y literales. Requiere re-skin a EVA DS.
- **DirRowCard vs ClientCard:** web `DirRowCard` usa `CircularProgressbar` (react-circular-progressbar) 50px con inicial + dot de última actividad; nombre display 15.5px black + badge de severidad (Riesgo≥50 `AlertOctagon` / Atención≥25 `AlertTriangle` / On track `Check`) + línea meta (adherencia mono, lastLabel, nutrición% si en riesgo, badge estado). Mobile usa `ProgressRing` propio + `severityMeta`/`statusMeta`/`lastInfo` helpers (mismos umbrales 50/25 — bien). El re-skin debe alinear tipografía/tokens, no la lógica.
- **DirectoryActionBar:** web tiene barra búsqueda + sort + toggle cards/table + filtros status/program/risk + archivedCount + resultCount. Mobile tiene los filtros pero en UI legacy; el toggle cards/table es desktop-only (N/A en RN).
- **FAB "Nuevo alumno":** web pill fixed abajo-derecha. Verificar equivalente mobile (existe `UserPlus`/`Upload` en imports).
- **Header:** web usa `CoachWarRoom` arriba (pulso de riesgo, `mb-8 md:hidden`). Mobile tiene `PulseCard` inline — conceptualmente equivalente pero visual distinto.

### 1.3 Ficha del alumno — estado: re-skin A MEDIAS (shell patrón B, tabs patrón A)
`cliente/[clientId].tsx` shell es patrón B (StyleSheet, `theme.*`). Los sub-componentes mezclan: `ClientTabBar` es patrón A (className DS, fiel), `ClientHero` es **patrón B con hex hardcodeados** (`TEXT_ON_DARK`, `DANGER_ON_DARK`, etc. L11-14). Gaps visuales:

- **Chrome de tabs divergente en CANTIDAD y nombres.** Web (rediseño) = **5 pestañas** Resumen · Progreso · **Entreno** · **Programa** · Nutrición, y **Facturación fue REMOVIDA del chrome** (`BillingTabB8.tsx` existe pero desconectado — research 04 §3). Mobile (`[clientId].tsx` L227-234, `ClientTabBar.tsx` L4) = **6 pestañas** Resumen · Progreso · **Análisis** · **Plan** · Nutrición · **Pagos**. Divergencias: mobile tiene "Análisis" (≈ web "Entreno") y "Plan" (≈ web "Programa") con nombres distintos, y **mantiene "Pagos"/Facturación como pestaña**, que la web sacó del chrome. Decidir si mobile alinea a 5 tabs + nombres web (Entreno/Programa) y saca Pagos, o si es una excepción móvil aceptada.
- **Hero sin GlowBorderCard.** Web hero es `inverse` (dark) envuelto en `GlowBorderCard` (marco animado de marca) — research 04 §Hero. Mobile `ClientHero` usa `Card variant="inverse"` plano, sin marco animado de marca. Gap visual de marca.
- **Chips del hero:** web = 4 chips fijos 2×2 (Peso+delta / Adherencia+barra / Workouts x/y / Comidas hoy). Mobile arma lista variable de hasta 6 chips (agrega "Última actividad" y "Programa Sem N", L219-225) — más data pero layout distinto (`width:'47%'`). Adherencia web trae mini-barra; mobile solo número.
- **Ubicación de acciones divergente.** Web: barra flotante `ProfileFloatingActions` persistente = **solo WhatsApp verde full-width** que se encoge al scrollear (>8px); Export PDF vive en el hero; check-in/builder removidos. Mobile: WhatsApp + Export PDF **como botones dentro del hero** (L92-101) + un **FAB de 4 acciones** (WhatsApp/Editar datos/Registrar pago/Editar programa, L295-300). No hay barra flotante WhatsApp encogible.
- **ClientHero hex hardcodeados** no dark-aware por token (usa literales fijos "válidos en dark" pero no derivan del tema). Re-skin a tokens.
- **ProfileTabNav efecto "stuck":** web tiene sombra al pegarse + fade+chevron animado si hay overflow. Mobile `ClientTabBar` sticky lo maneja el ScrollView (`stickyHeaderIndices={[1]}`), sin fade/chevron de overflow.

### 1.4 Sub-pantallas de ficha (contenido de tabs)
- `OverviewTab`, `ProgresoTab`, `AnalisisTab`, `PlanTab`, `NutricionTab`, `FacturacionTab` — no leídos línea a línea; por el shell (patrón B) y `ClientHero` presumo mezcla A/B. Requieren auditoría de re-skin individual. Web equivalentes son enormes (`ProfileOverviewB3` 1005 L, `ProgressBodyCompositionB6` 1017 L, `TrainingTabB4Panels` 778 L, `ProgramTabB7` 817 L, `NutritionTabB5` 1722 L).

---

## 2. Gaps funcionales (features/datos que web tiene y mobile no o diverge)

### 2.1 Ficha — MÓDULOS de pago ausentes por completo (gap grande)
Web Resumen (`ProfileOverviewB3`) tiene sección **Módulos** con accesos gateados a cardio (`/coach/cardio/{id}`), movement (`/coach/movement/{id}`), body_composition (`/coach/clients/{id}/bodycomp`), resueltos por `hasModule` por contexto de recurso (team manda; enterprise → false). **Mobile no tiene NADA de módulos** (research 06 §C.4/07 §C.4/C.7: `grep MODULE_KEYS|enabled_modules apps/mobile` = 0). La ficha mobile omite la sección Módulos entera. Esto es también gap del builder/nutrición pero aterriza visualmente aquí.

### 2.2 Ficha — Progreso sin composición corporal
Web `ProgressBodyCompositionB6` tiene **Composición corporal** (gated `bodycompEnabled`), Peso·tendencia con línea de objetivo, Energía media 7d, comparativa de fotos, historial de check-ins. Mobile `ProgresoTab` no tiene bodycomp (módulo no cableado). Ver 2.1.

### 2.3 Ficha — editores de datos divergentes (goal weight / biometría)
- Web: **Peso objetivo** se edita en la pestaña Progreso (`updateClientGoalWeight`, dibuja línea punteada en la curva); **biometría** (peso inicial/altura/sexo) se edita en Resumen (`updateClientBiometrics`). Mobile: goal weight + startDate se editan en un `EditClientForm` (modal, L394-431) vía `updateCoachClient` PATCH; no hay editor de biometría (altura/sexo) ni peso inicial expuesto, ni el write-path `updateClientBiometrics`. Divergencia de UX + posible gap de columnas (sexo → `client_intake.sex`, delta §2.7).

### 2.4 Ficha — Export PDF: dossier (web) vs progress-pdf (mobile)
Web (PR #106, delta §3.5) exporta un **dossier** completo: `getClientDossier` → `buildClientDossier` (URLs firmadas de fotos TTL 600s) → `downloadClientDossierPdf` (jsPDF tema oscuro). Mobile (`[clientId].tsx` L168-201) usa `exportProgressPdf` de `lib/progress-pdf.ts` (expo-print) con un subconjunto de datos armado a mano (peso/energía/nutrición/sesiones/PRs/check-ins). **Es un PDF distinto y más pobre**, no el dossier. Gap: portar el dossier o aceptar el PDF nativo como equivalente.

### 2.5 Ficha — Nutrición: gating de 3 zonas + prefs ausente
Web `NutritionTabB5` (1722 L) es 3 zonas (A Progreso / B Plan y comidas / C Alertas y contexto coach) con triple gate: `nutritionDomainEnabled` (master por alumno), `nutritionSectionFlags` (entitled AND wants, vía `@eva/feature-prefs`), `nutritionProEnabled` (micros). Mobile `NutricionTab` no consume `@eva/feature-prefs` (research 07 §A.3 = 0 imports) → **sin sistema de preferencias por sección ni gate de dominio por alumno**. (Detalle profundo de nutrición es dominio de otro gap-doc; aquí se marca la costura del gate.)

### 2.6 Directorio — Import wizard simplificado (sin mapeo de columnas)
Web `/coach/clients/import` = wizard 4 pasos (Step1Upload → Step2MapColumns → Step3Preview → Step4Confirm). Mobile usa `parseClientsCsv` (`lib/import-clients.ts`) vía `DocumentPicker` + `FileSystem` — probablemente 1 paso sin **mapeo de columnas** ni preview estructurado. Gap funcional (verificar el flujo real de `import-clients`).

### 2.7 Directorio — acciones de cliente: paridad razonable pero verificar
Web `ClientActionsSheet` = editar datos, WhatsApp, resetear contraseña, pausar/reactivar, archivar, eliminar. Mobile `client-actions.ts` tiene `deleteClient`, `setClientStatus`, `resetClientPassword`, `openWhatsApp`, `shareLogin`, `clientLoginUrl` — cubre lo esencial. Verificar que "pausar/reactivar" (`setClientStatus`) y reset-password (temp 6 dígitos, gotcha HIBP) estén 1:1.

### 2.8 Dashboard — WorkspaceSwitcher + NewsBell + búsqueda global
- **WorkspaceSwitchSheet:** web lo abre desde el brand tile si multi-workspace. Mobile no lo tiene (avatar → perfil directo).
- **NewsBell:** campana con badge de no-leídos + sheet de novedades propio. Mobile enruta a check-ins, sin badge de no-leídos.
- **Búsqueda global (topbar):** delta §3.2 (`949ec767`, endpoint `/api/coach/search`). No aparece en mobile. Gap funcional nuevo post-21-jun.

### 2.9 Dashboard — datos vía endpoint mobile (verificar forma)
Mobile consume `GET /api/mobile/coach/dashboard` (`lib/coach-dashboard.ts`, `MobileDashboardData`). Web usa `getCoachDashboardDataV2` (`DashboardV2Data`: kpi, activePlans, hasStudentSignal30d, clientList, clientPaymentSummary, adherenceStats, nutritionStats, recentActivities, pendingCheckinsCount, expiringPrograms, topRiskClients, areaData/barData, agenda, pulse, subscriptionStatus, currentPeriodEnd, trialEndsAt). Verificar que el endpoint mobile devuelva paridad de forma tras el rediseño (research 04 nota transversal §2). Los charts `areaData/barData` (recharts en web) no se ven consumidos en el dashboard mobile.

### 2.10 Delta post-21-jun específico del dominio
- Ficha coach reescritura (delta §3.4): badge único (`deriveClientStatus`), rachas, adherencia 30d honesta, proyección de rango, editar biometría write-path, cosecha de datos que el alumno ya ingresa. Verificar que mobile refleje `deriveClientStatus` (mobile arma status inline en L248-249 con is_archived/is_active, no el derive unificado con score en tooltip).
- Sustitución de ejercicio visible en ficha (delta §3.4/`c22624d9`) + media en modal de Programa. Mobile: verificar si `PlanTab` muestra sustituciones.

---

## 3. Costuras (compartir vía packages/ o API, no duplicar) — cita 07-shared-seams.md

- **C.3 `profile-analytics` (ALTO riesgo de drift).** `apps/mobile/lib/profile-analytics.ts` (276 L) es un **port manual** de los 3 archivos web co-ubicados (`profileTrainingAnalytics.ts`, `profileOverviewUtils.ts`, `profileBodyCompositionUtils.ts`) — NO un import compartido. La ficha mobile lo usa intensamente (`[clientId].tsx` L31-41: `epleyOneRM`, `findWeeklyWeightPRs`, `buildProfileActivityCalendar`, `longestActivityStreak`, `linearRegressionKgPerDay`, `bmiFromMetric`, `avgEnergySince`, `formatTrainingAgeLabel`). Cualquier fix de fórmula en web NO se propaga. **Recomendación:** extraer a `packages/profile-analytics` (o `@eva/nutrition-engine`-style) con tipo de entrada plano/neutro; el arquitecto debe leer los 3 archivos web antes de fijar la firma (logs anidados web vs planos mobile). No verificado drift numérico, pero patrón idéntico a C.1.
- **C.4 `entitlements` / `MODULE_KEYS` (bloqueante para módulos de ficha).** Para renderizar la sección Módulos de la ficha (2.1) sin abrir agujero de seguridad, mobile necesita (a) el mirror puro `ModuleKey`/kill-switch vía `@eva/feature-prefs`/`@eva/module-catalog` (ya existen, 0 imports en mobile), y (b) leer `enabled_modules` de `coaches`/`teams` por PostgREST directo + respetar el gate server-side (`assertModule`, endpoints `/api/mobile/coach/*` de módulos ya creados, delta §6). Ver 07 §C.4/C.7.
- **C.7 `domain/bodycomp`, `domain/cardio`, `@eva/calc`.** Puros, con tests, SIN consumidor mobile. Para la pestaña Progreso con composición corporal (2.2) hay que mover/exponer `apps/web/src/domain/bodycomp` a `packages/` y construir la UI RN desde cero. Los endpoints `bodycomp/{bia,isak,[id]}`, `cardio/profile`, `movement/*` ya existen en web-api sin cablear (research 06 §C).
- **`@eva/tiers` (modelo a seguir, ya OK).** `lib/coach.ts`/`coach-tiers.ts`/`coach-subscription.ts` ya re-exportan sin duplicar. El dashboard/ficha deben seguir ese patrón (banners de tier).
- **`clientStatusUtils.ts` / `getProfileTopAlert.ts` (web).** Mobile calcula `attention` inline (`[clientId].tsx` L146-150) con reglas propias (check-in <40%, nutrición <60%, check-in sin revisar). Web usa `getProfileTopAlert`/`deriveClientStatus`. Candidato a extraer para no divergir la lógica de "alerta/estado del alumno".

---

## 4. Tareas propuestas

### OLA A — Re-skin visual (EVA DS), sin cambiar lógica ni datos

- **A1 [VISUAL] S** — Re-skin `home.tsx` error/loading states: quitar `Montserrat_700Bold` legacy → Archivo/Hanken; usar tokens DS. Dep: ninguna.
- **A2 [VISUAL] M** — Corregir header del dashboard (`MobileGreetingHeader`): Insights → abrir `MobileClientStatsSheet` (no settings); campana con **badge de no-leídos** + sheet propio; brand tile con caret + workspace switcher si multi-workspace. Alinear tier banner (elite ≥80, no ≥48). Dep: A? (independiente); parte funcional de campana/switcher se solapa con B-func.
- **A3 [VISUAL] L** — Re-skin completo de `clientes.tsx` (directorio) de patrón B → A: reemplazar `theme.*`/hex literales por clases DS + primitivas; alinear `ClientCard` a `DirRowCard` (tipografía, badges de severidad, dot de actividad, meta line). Mantener filtros/orden/StackCardItem. Dep: primitivas DS (ya existen).
- **A4 [VISUAL] M** — Re-skin shell de ficha `cliente/[clientId].tsx` (patrón B → A) + `ClientHero` (hex hardcodeados → tokens; agregar marco/glow de marca estilo `GlowBorderCard`). Dep: primitiva glow (P2 en research 02) — puede diferirse el glow.
- **A5 [VISUAL] S** — `ClientHero`: alinear a 4 chips fijos 2×2 con mini-barra en Adherencia (o decidir mantener 6 chips como mejora móvil). Dep: A4.
- **A6 [VISUAL] M** — Auditar y re-skinear los 6 tab-panels de ficha (Overview/Progreso/Analisis/Plan/Nutricion/Facturacion) a DS. Dep: A4.
- **A7 [VISUAL] S** — Decisión de chrome de tabs: alinear a 5 tabs web + nombres (Entreno/Programa) y sacar Pagos del chrome, o documentar la excepción móvil. Dep: A4 + decisión de producto.

### OLA B — Funcional (posterior al re-skin)

- **B1 [SEAM] M** — Extraer `profile-analytics` a paquete compartido (`packages/*`) y hacer que web + mobile importen; matar `apps/mobile/lib/profile-analytics.ts`. Dep: leer los 3 archivos web fuente. (Reduce drift C.3.)
- **B2 [SEAM] L** — Cablear entitlements en mobile: adoptar `@eva/feature-prefs` + `@eva/module-catalog`, leer `enabled_modules`, respetar gate server-side. Bloqueante de B3/B4. Dep: ninguna (packages existen).
- **B3 [FUNCIONAL] L** — Sección **Módulos** en Resumen de ficha (cardio/movement/bodycomp gated) + navegación a las sub-pantallas. Dep: B2 + construcción de pantallas de módulo (otro dominio).
- **B4 [FUNCIONAL] L** — Pestaña Progreso con **composición corporal** (mover `domain/bodycomp` a packages, cablear endpoints `bodycomp/*`). Dep: B2, C.7.
- **B5 [FUNCIONAL] M** — Editores de datos ficha: editor de **biometría** (altura/sexo/peso inicial) vía `updateClientBiometrics` + goal weight en Progreso con línea de objetivo (paridad web). Dep: A6; verificar GRANTs de columna (`client_intake.sex`).
- **B6 [FUNCIONAL] M** — Export **dossier** PDF (portar `buildClientDossier` + render nativo) o formalizar `progress-pdf` como equivalente aceptado. Dep: A6.
- **B7 [FUNCIONAL] M** — Import wizard de clientes multi-paso (mapeo de columnas + preview + confirm) sobre `parseClientsCsv`. Dep: A3.
- **B8 [FUNCIONAL] M** — Dashboard: WorkspaceSwitchSheet + NewsBell con badge + búsqueda global (`/api/coach/search`). Dep: A2.
- **B9 [SEAM] S** — Extraer/compartir `deriveClientStatus` + `getProfileTopAlert` para que la "alerta/estado" del alumno no diverja entre web y el cálculo inline de mobile. Dep: B1 (mismo paquete candidato).
- **B10 [FUNCIONAL] S** — Verificar/alinear forma de `MobileDashboardData` vs `DashboardV2Data` tras el rediseño (charts area/bar, pulse, trialEndsAt). Dep: ninguna.

---

## 5. Riesgos

- **Drift silencioso de analítica (C.3):** `profile-analytics.ts` mobile es copia manual; fórmulas de PRs/tendencia/racha/BMI pueden ya diferir de web sin que nadie lo note. No se diffeó línea a línea. Mitigar con B1.
- **Seguridad de módulos (C.4):** si se construye la sección Módulos en ficha sin replicar `assertModule` server-side, un coach sin el módulo podría invocar funcionalidad vía PostgREST directo. B2/B3 deben incluir el gate, no solo el mirror de UI.
- **Divergencia de chrome de tabs (5 vs 6):** cambiar la cantidad/nombres de pestañas de ficha es decisión de producto; portar "a lo web" rompe la costumbre actual del coach en mobile (tiene Pagos como tab). Requiere señal del arquitecto/CEO.
- **GRANTs de columna:** editores nuevos (biometría/sexo) escriben columnas que exigen `GRANT UPDATE(col)` para `authenticated` (mobile habla PostgREST directo). Gotcha CLAUDE.md — 42501 en runtime si falta.
- **PDF nativo vs jsPDF:** el dossier web usa jsPDF con URLs firmadas TTL 600s; portar a expo-print puede perder fidelidad de layout. Riesgo de esfuerzo mal estimado (podría quedarse web-only).
- **Doble sistema de theming en el shell:** `[clientId].tsx` y `clientes.tsx` en patrón B mezclan `theme.*` imperativo con algún className; el re-skin debe consolidar sin romper el white-label (dos vías paralelas: `brandVars` + objeto `theme`, research 02 §C).
- **Endpoint dashboard como cuello de botella:** toda la paridad de datos del dashboard depende de que `/api/mobile/coach/dashboard` devuelva la forma V2; si no, gaps de datos invisibles hasta runtime.
