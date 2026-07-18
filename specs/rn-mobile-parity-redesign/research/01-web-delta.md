# Delta de `apps/web` — 2026-06-20 → 2026-07-08

> Insumo para el plan de paridad RN. Baseline = auditoría funcional `docs/audits/rn-web-parity-2026-06-21.md` (21-jun, PRE-rediseño). Este documento cataloga TODO lo user-facing que aterrizó en `apps/web` después de esa auditoría y que `apps/mobile` NO tiene (o tiene en versión vieja).
> Método: `git log --since=2026-06-20 --until=2026-07-09 master -- apps/web packages` + `git show --stat` de los commits relevantes + lectura del árbol actual.

---

## 0. Contexto crítico: qué SÍ tocó mobile y qué NO

El rediseño "EVA DS" vivió en la rama `feat/redesign-eva-design-system` y se mergeó a master por fast-forward el 2026-07-04 (`3d0b404f`→`4ba9a160`, ~118 commits). Dentro de esa rama hay que distinguir dos etapas:

- **Fases 0–9 (2026-06-29, commits `a6ddfd83`…`411a5e4b`)**: sus mensajes dicen "web + mobile" y **SÍ tocaron `apps/mobile`** — la FUNDACIÓN del DS llegó a mobile: `apps/mobile/global.css` (+240), `apps/mobile/lib/theme.ts` (+114), `apps/mobile/tailwind.config.js` (+142), `apps/mobile/app/_layout.tsx`, librería de 13 componentes core, más re-skins de workout-exec, nutrición, dashboards, check-in (`cd954ff4`, `7c7ad951`, `ce50c280`, `5c8a7cc0`, `e46ad109`).
- **TODO lo posterior es WEB-ONLY**: Olas 0–7 desktop 1:1, waves 1–2, batches de feedback CEO, rondas QA 1–5, Fase M, Fase S, Fase L, landing v2, Google GIS, dossier PDF, share-cards v2, glow de marca, consolidación dark tones. `git log --since=2026-06-25 -- apps/mobile` muestra que después de las Fases 0–9 mobile solo recibió merges de master (check-in fotos, progresión) — CERO de la iteración fina.

**Conclusión para el arquitecto:** mobile probablemente tiene los TOKENS del DS pero pantallas a medio re-skin (estado intermedio de las Fases 0–9, sin las ~90 iteraciones posteriores). No es "lenguaje 100% viejo" ni "1:1"; es un DS-foundation parcial. Hay que verificar pantalla por pantalla el estado real de mobile antes de asumir. Este informe cubre solo el lado WEB (fuente de verdad).

Los commits del 2026-06-20/21 (cupones F2a–R2, branding W0–W4, coach-settings restructure, endpoints mobile-api) son contemporáneos a la auditoría; la auditoría ya contempla white-label v2 y módulos. Se listan igual porque varios NO llegaron a mobile, pero el foco del delta es el rediseño + Fases L/M/S.

---

## 1. TRANSVERSAL — Design System y chrome

### 1.1 Fundación DS "EVA DS" (visual, transversal) — el cambio más grande
- **Qué cambió:** sistema de tokens nuevo (rampas de color light-first, sport ramp, superficies, glass, motion, fuentes), 13 componentes core del DS, shell/navegación coach y alumno re-transcritos 1:1 desde "Claude Design". Consolidación posterior de tonos dark en una rampa neutra única (`edeb5683`).
- **Archivos web:** `apps/web/src/app/globals.css`, `apps/web/src/components/ui/*`, componentes atoms/molecules/organisms.
- **Paridad mobile:** mobile recibió la base (Fase 0-9) pero NO la consolidación dark ni las ~90 correcciones. **Debe replicarse:** auditar el `global.css`/`theme.ts`/`tailwind.config.js` de mobile contra el estado FINAL de `globals.css` web y re-sincronizar tokens (rampa neutra dark única, remapeo sport-500→tinte 70% en dark, `--theme-primary-rgb` con comas → `rgba(var(--x), a)` — gotcha documentado en memoria).

### 1.2 Loaders de marca (visual) — 6 variantes
- Commits `cd945d3c` (W3, 6 variantes porteadas del CEO), `59a8063b`, `73e6b9f0`, `b552e36d`, `beb480f7`, `2e5c07a5`, `3f54d476` (loader Radar).
- **Archivos:** `apps/web/src/components/loaders/variants.tsx`, `apps/web/src/components/ui/EvaRouteLoader.tsx`, `apps/web/src/lib/brand-composer.ts`, `apps/web/src/lib/brand-presets.ts`.
- **Qué cambió:** loader preset-aware; la elección explícita de fuente/loader del coach GANA a la sugerencia del tema; radar contenido con overflow. Gotcha resuelto: `rgb(var/slash)` inválido con `--theme-primary-rgb` de comas → todo a `rgba(var, comas)`.
- **Paridad:** mobile usa `@eva/brand-kit` compartido (audit lo daba 1:1), pero las 6 variantes visuales y la precedencia elección>tema deben verificarse. **Replicar** la lógica de precedencia (`brand-composer.ts` es lógica pura, portable).

### 1.3 Temas curados / "Mi Marca nueva era" (funcional + visual)
- Commit `995df126`, `49b76397`, `43a674b7`, `127ab9d0`.
- **Qué cambió:** presets de tema curados, bordes de marca (GlowBorderCard), Mi Marca reorganizada según kit, logo dark, "Importar" embebido, quitar-logo de team, dirty-tracking completo, preview del teléfono con la misma precedencia.
- **Archivos:** `apps/web/src/lib/brand-presets.ts`, `brand-composer.ts`, settings de Mi Marca en `/coach/opciones` (ver §3).
- **Paridad:** el editor Mi Marca de mobile la auditoría lo daba "high/lo supera". Con la nueva era de presets + glow borders + precedencia, mobile queda atrás. **Replicar** presets curados y glow de marca.

### 1.4 Glow de marca full-bleed (visual)
- Commits `f2b2ba31`, `18c7dd76`, `9bb522dc`, `066e9ce6`, `f7e1c760`.
- **Qué cambió:** glow de la marca del coach full-bleed en dashboard/topbar/ficha, marco animado en ficha, switcher de tema + logout en desktop.
- **Paridad:** efecto visual de marca; **replicar** en shell mobile (glow detrás del header/dashboard).

### 1.5 PWA instalación brandeada (funcional — web-only por naturaleza)
- Commit `6089140b`.
- **Archivos:** `apps/web/src/components/InstallPrompt.tsx` (reescrito), `PwaNavButton.tsx`, `apps/web/src/lib/pwa/{install-signals,screenshot-dimensions,use-install-prompt}.ts`, `api/manifest/default/route.ts`.
- **Paridad:** N/A directa (RN es app nativa, no PWA). El `AppDownloadBanner` fue eliminado. Mobile no necesita el prompt de instalación. **No replicar** — excepción intencional.

### 1.6 Badging API (funcional)
- Commit `0cf292da`.
- **Archivos:** `apps/web/src/components/client/AppBadgeSync.tsx`, `apps/web/src/lib/client/app-badge.ts`.
- **Qué cambió:** badge numérico en el ícono de la app (comidas/entrenos pendientes) vía Badging API del navegador.
- **Paridad:** RN tiene equivalente nativo (Notifee/expo-notifications setBadgeCountAsync). **Replicar** con API nativa.

### 1.7 Landing v2 "LandingPrism" (visual, público)
- Commits `e0858dfe`, `cbcdf474`, `16fcd8a1`, `cb94f745`, `f903ea73`.
- **Archivos:** `apps/web/src/app/page.tsx`, `apps/web/src/components/landing-v2/*` (Hero, FaqSection, CtaFinal, LandingNav +359, copy.ts), register paso 2 a radio-cards.
- **Paridad:** landing pública NO existe en mobile (la app arranca logueada/onboarding). **No replicar** la landing; SÍ revisar el flujo `/register` si mobile lo tuviera. Baja prioridad.

### 1.8 Cron gifs→webp estático (infra) — `711ed29b` (#107)
- No user-facing directo; mejora cuota de Image Transformations. Mobile consume las mismas URLs. **No replicar** (infra server).

---

## 2. ZONA ALUMNO (`/c/[coach_slug]/*`)

### 2.1 Ejecución de rutina — reescritura masiva (visual + funcional) — EL GAP MÁS GRANDE
Directorio: `apps/web/src/app/c/[coach_slug]/workout/[planId]/`. Estado actual del árbol (componentes nuevos/reescritos):
`EffortScale.tsx`, `HoldTimer.tsx`, `IntervalTimer.tsx`, `LogSetForm.tsx`, `MuscleMapSvg.tsx`, `NumericKeypadSheet.tsx`, `PRShareCardModal.tsx`, `RestTimer.tsx`, `SingleExerciseCard.tsx`, `StepperExecution.tsx`, `Stopwatch.tsx`, `WorkoutExecutionClient.tsx`, `WorkoutKeypadProvider.tsx`, `WorkoutSummaryOverlay.tsx`, `WorkoutTimerProvider.tsx`, `WorkoutTimerSettingsPanel.tsx`, + lógica pura testeada: `typed-keypad.ts`, `session-logs.optimistic.ts`, `session-logs.reconcile.ts`, `session-summary.ts`, `muscle-map.ts`, `body-anatomy.ts`, `rest-timer-preferences.ts`.

Sub-features aterrizadas (todas WEB, mobile solo tiene la versión de Fase 9 intermedia):

- **Teclado numérico custom touch-only** (`b310bbb7`): `apps/web/src/lib/client/keypad-logic.ts`, `useCoarsePointer.ts`. Objetivo visible mientras se teclea. **Replicar** — keypad nativo RN.
- **Keypad tipado con paso RPE/RIR opcional** (`18973500`): `NumericKeypadSheet.tsx` (+375), `EffortScale.tsx`, `WorkoutKeypadProvider.tsx`, `typed-keypad.ts`. Flujo peso→reps→(RPE/RIR opcional). **Replicar.**
- **Modo "paso a paso" opt-in** (`b07ed301`, `f7e23133`): un ejercicio a la vez, `StepperExecution.tsx`, `SingleExerciseCard.tsx`, lógica `workout-stepper.ts`. **Replicar.**
- **Sustitución de máquina ocupada** (`ef4bf7e2`, `e4fd7c32`, `c22624d9`): el alumno hace swap de ejercicio por sesión, visible al coach. DB: columnas de sustitución en `workout_logs` (migración). Schema en `packages/schemas/workout.ts` (compartible). **Replicar** — es funcional + schema compartido.
- **Fase M — foco/descanso protagonista** (`33c6ce22`): descanso a pantalla protagonista, warmup rest, celebraciones (confetti + audio `apps/web/src/lib/audioUtils.ts`), resumen con mapa muscular. **Replicar.**
- **Fase S rework ejecución** (`9c24ff79`, 12 decisiones CEO): `apps/web/src/lib/client/haptics.ts`, `use-screen-wake-lock.ts`. Háptica + keep-awake (mobile ya tenía keep-awake nativo per audit). **Replicar** háptica nativa.
- **Resumen post-entreno cuenta cardio/movilidad/roller** (`4231d324`): `session-summary.ts`. **Replicar.**
- **P0 holds no se borran al guardar + confetti** (`42e22e89`): `session-logs.optimistic.ts` (optimistic + reconcile). **Replicar** la lógica de reconciliación optimista.
- **Workout no reaparece vacío/a medias al reentrar** (`699ddd05`, PR #113 resiliencia): drafts/snapshot, recuperación de sesión. **Replicar** — correctness.
- **Mapa muscular anatómico** (`386fed21`, `33c6ce22`): `MuscleMapSvg.tsx`, `muscle-map.ts`, `body-anatomy.ts`. SVG anatómico que resalta músculos trabajados. **Replicar** (SVG portable).
- **Timers polimórficos** (`IntervalTimer`, `HoldTimer`, `Stopwatch`, `RestTimer`, `WorkoutTimerSettingsPanel`): ya identificado como gap XL en el audit (mobile solo 1 rest timer). El rediseño los re-skineó. **Replicar.**
- **Prescripción cardio/movilidad + doble-progresión** (`e46ad109` #101, `ea08d7bd` #97, `a9a26a00` #98): sobrecarga progresiva visible al alumno en PWA, prescripción polimórfica. El commit `e46ad109` dice "doble-progresión mobile" — verificar si mobile lo recibió. **Replicar/verificar.**

> **Prioridad:** este cluster es P0 visual+funcional. La ejecución de rutina es el core-loop del alumno y es donde web más se alejó.

### 2.2 Superseries robustas de punta a punta (funcional)
- Commit `1f743185`.
- **Archivos:** `apps/web/src/lib/workout-block-grouping.ts` (+146, lógica pura testeada), builder + ejecución alumno + superficies coach.
- **Paridad:** `workout-block-grouping.ts` es lógica pura portable. **Replicar** agrupación/render de superseries en ejecución mobile.

### 2.3 Días pendientes de la semana (funcional)
- Commit `bf75cf58`.
- **Archivos:** `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/{ActiveProgramSection,WorkoutPlanCard}.tsx`, `_data/weekPendingWorkouts.ts` (+181, lógica pura).
- **Qué cambió:** el alumno ve los días de entreno pendientes de la semana y puede recuperarlos hoy.
- **Paridad:** lógica `weekPendingWorkouts.ts` portable. **Replicar** — feature funcional de dashboard alumno.

### 2.4 Share-cards v2 con marca del coach (funcional + visual)
- Commits `14782ab0`, `2f684be9`, `ec6b613e`, `PRShareCardModal.tsx`.
- **Archivos:** `apps/web/src/lib/workout-pr-card-canvas.ts` (canvas render, evolucionó +530/+275/+238), `apps/web/src/lib/date-utils.ts`.
- **Qué cambió:** cards de racha, resumen mensual y PR con logo+nombre del coach (no la inicial), iconos vectoriales, footer legible, mensual legible.
- **Paridad:** el audit ya notaba share nativo en mobile como ventaja; pero las cards v2 (canvas branded, racha, resumen mensual) son nuevas. **Replicar** el diseño de las cards (canvas → RN puede usar view-shot o canvas).

### 2.5 Dashboard alumno + Perfil re-skin (visual)
- Commits `928ee1a4` (versión ALUMNO: cápsula flotante, dashboard 1:1, pantalla Perfil nueva), `3e87f9ad`, `31fb59dd` (dashboard-nutrición alumno).
- **Árbol actual dashboard alumno** (`.../dashboard/_components/`): calendar, checkin, coach, compliance, habits, header, hero, history, momentum, nutrition, program, records, streak, weight, desktop, + `HeroAndComplianceGroup`, `WelcomeModal`, `DashboardPullToRefresh`, `OrgAnnouncementBanner`.
- **Paridad:** dashboard alumno recibió base en Fase 3/9 pero no la cápsula flotante final ni Perfil nuevo. **Replicar** el layout final.

### 2.6 Quick-wins alumno — lenguaje sin culpa / "supera tu marca" inline (funcional + copy)
- Commit `0cf292da`, `995df126` (records con historia).
- **Qué cambió:** lenguaje sin culpa en adherencia, "supera tu marca" inline, records con historia.
- **Paridad:** copy + lógica de records. **Replicar** copy y presentación de records.

### 2.7 Composición corporal fusionada en Progreso (funcional, gated)
- Commits `3b0d118f`, `59078078` (matar Panel de Progreso Unificado + MetricInfo explicabilidad), `1d942701`, `afbcc41d` (editar biometría guarda), `091170f8`, `3a9b392a` (`client_intake.sex`).
- **Qué cambió:** composición corporal (body-comp) fusionada en pestaña Progreso del alumno con teaser gateado; explicabilidad global (MetricInfo); IMC/TDEE desbloqueado por `client_intake.sex`.
- **Nota:** el árbol alumno tiene `/c/[coach_slug]/bodycomp` y `/movimiento` — módulos gated que el audit daba 0% en mobile. **Replicar** (ya era gap P1 del audit; ahora con vista Progreso fusionada).

### 2.8 Login alumno brandeado (visual + funcional)
- Commit `995df126` (`login/page.tsx` +273), `53c3c0b2` (W4 login pre-auth brandeado + gate Pro+).
- **Qué cambió:** login del alumno con logo + brand_name + welcome_message + color + fuente + dark, gateado Pro+.
- **Paridad:** el audit ya marcaba que mobile aplica color pero NO logo/brand_name/welcome_message. **Replicar** login brandeado completo.

### 2.9 Check-in — cola de revisados (funcional, lado coach pero feed) + fotos direct-to-Storage
- `46bb111b` (cola de revisados: unmark + badge + filtro — es superficie COACH del feed de check-ins).
- `25ef0161` (#105) / `5c8a7cc0` (#103) / `8b7b3583` (#104): fotos de check-in direct-to-Storage con URL firmada, best-effort, HEIC iPhone no bloquea, timeout duro a compresión. Estos SÍ tocaron mobile (`web+mobile`). **Verificar** que mobile tenga la versión final.

---

## 3. ZONA COACH (`/coach/*`)

### 3.1 Shell + navegación coach re-skin (visual) — Olas 0–7 desktop 1:1
- Commits `99e300ef`…`51ffbae1` (Olas 1–7), `515d79e0`/`2f5ddbd0` (waves), `e6545256`, `c5401620`.
- **Qué cambió:** shell "eva-desktop" desktop 1:1, chrome, rail de navegación, topbar, logo del coach como avatar legible, glow, switcher tema + logout desktop.
- **Paridad:** el audit ya marcaba que mobile hardcodea `NAV_META` y no importa `coach-nav.ts`. El rediseño consolidó settings en hub "Opciones". **Replicar** el nav registry compartido + consolidación (era gap L del audit).

### 3.2 Búsqueda global del topbar (funcional)
- Commit `949ec767`.
- **Archivos:** `apps/web/src/app/api/coach/search/route.ts` (+62, endpoint nuevo), `apps/web/src/components/coach/CoachTopBar.tsx`, `apps/web/src/lib/rate-limit.ts`.
- **Qué cambió:** búsqueda global funcional (alumnos, programas, etc.) desde el topbar del coach.
- **Paridad:** endpoint `/api/coach/search` reutilizable. **Replicar** — búsqueda global en topbar mobile (feature funcional nueva).

### 3.3 Campanita de noticias / news bell (funcional)
- Commits `386fed21` (campanita coach viva), `c22624d9` (campana móvil), `5023a4a9` (campana scroll/alineación).
- **Paridad:** el audit marcaba news bell ausente en mobile. Ahora está "viva". **Replicar.**

### 3.4 Ficha del alumno (coach) — reescritura (visual + funcional)
- Commits `d6c0f365`, `53895747`, `1604ec69` (Fase 4), `4649be5a` (2-col por container-query), `59078078`, `1d942701`, `afbcc41d`, `091170f8`, `31fb59dd` (ficha coach flotante), `c22624d9` (sustitución visible en ficha + media en modal Programa).
- **Qué cambió:** ficha 1:1 con CD nuevo (chrome + 5 pestañas), cosecha de datos que el alumno ya ingresa, badge único, rachas, adherencia 30d honesta, proyección de rango, editar biometría con write-path, panel angosto (PWA) vs 2-col (desktop ancho).
- **Paridad:** el audit daba ficha "high" pero pre-rediseño. Ahora hay pestañas y write-paths nuevos (editar biometría). **Replicar** estructura de pestañas + write-path biometría.

### 3.5 Export ficha PDF — dossier (funcional) — PR #106
- Commit `15fd5cb3`, merge `6b46578c`.
- **Qué cambió:** exportar ficha del alumno como dossier PDF real en tema oscuro, un solo botón con estados exporting/error. `getClientDossier` coexiste con `getClientFichaPanel`.
- **Paridad:** genera PDF client-side (jsPDF). **Replicar** con generación PDF nativa (expo-print) o dejar web-only si es marginal. Media prioridad.

### 3.6 Builder — grupos de comidas + superseries + áreas + programa activo (funcional)
- `c4332f2b` (grupos de comidas usables en builder + hardening), `1f743185` (superseries en builder), `386fed21` (builder con programa activo), `b6c10773` (Editar plan abre programa activo `?programId=`), `2018d19b` (Fase 5 constructor 3-paneles).
- **Paridad:** el audit ya marcaba builder áreas/tipos polimórficos como gap XL. Grupos de comidas + superseries son nuevas superficies. **Replicar.**

### 3.7 Reorg "Mi Marca" / settings hub "Opciones" (funcional + visual)
- Commits `36439ea3` (IA restructure F1-F6), `b3e74437` (quick-wins), `49b76397` (reorg completa según kit), `43a674b7`, `af10ef3b` (W2.11 form branding avanzado), `10b32448` (W2.10 panel dark+color2+fuente), `bac65ece` (Herramientas en el rail + gating), `eb2e46db` (Fase 8 opciones).
- **Qué cambió:** hub "Opciones" 2-panel, Áreas/Funciones/Módulos/Equipo consolidados, branding avanzado (color2/fuente/dark/loader) con previews, gating Pro+, "Herramientas" en el rail.
- **Paridad:** el audit marcaba settings hub (Áreas/Funciones/Módulos/Equipo) salvo Mi Marca = ausente en mobile (gap P3). Sigue siendo gap grande. **Replicar** hub completo.

### 3.8 Aprender optimizado (visual + funcional)
- Commits `127ab9d0`, `51ffbae1` (Ola 7 aprender), `0cf292da` (Aprender optimizado).
- **Paridad:** sección Aprender re-skineada. Verificar estado mobile. Media prioridad.

### 3.9 Equipo / Team (visual) — Ola 5
- Commit `b284274a` (Equipo maestro-detalle desktop 1:1), `eb2e46db` (Fase 8 teams).
- **Paridad:** el audit marcaba Mi Equipo ausente en mobile (gap XL P3). Sigue. **Replicar.**

### 3.10 Módulos cardio/movimiento/composición coach (visual) — Fase 7
- Commit `1a85e0d2` (Fase 7 módulos web), `c4332f2b` (cardio).
- Directorios coach: `/coach/cardio/[clientId]`, `/coach/movement`, `/coach/bodycomp` (verificar nombres). El audit los daba 0% en mobile (gap P1). **Replicar** (ya priorizado).

---

## 4. ZONA AUTH / transversal público

### 4.1 Login Google con marca propia via GIS (funcional) — PRs #108/#109
- Commits `d24ecc4e` (#108), `3d0b404f` (#109 SW cross-origin fix), `7324db8a` (fallback re-estilizado DS).
- **Archivos:** `apps/web/src/lib/auth/google-gis.ts` (+139), `apps/web/src/lib/auth/post-google-auth.ts` (+70), `apps/web/src/app/(auth)/register/page.tsx`.
- **Qué cambió:** login Google con Google Identity Services + `signInWithIdToken` (botón GIS es iframe de Google, no estilizable; fallback re-estilizado DS). Gotcha: el SW NO debe interceptar requests cross-origin (rompía GIS). Requiere `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Paridad:** el audit marcaba Google OAuth ausente en mobile (gap M). Ahora web usa GIS. **Replicar** con Google Sign-In nativo (expo-auth-session / @react-native-google-signin) + `signInWithIdToken` de Supabase. NO copiar el flujo web (iframe GIS); usar SDK nativo.
- **Nota:** login Google del ALUMNO está DIFERIDO por decisión CEO (memoria `project_alumno_google_login_deferred.md`). Este GIS es login/register de COACH.

### 4.2 Register paso 2 "Tu plan" a radio-cards (visual)
- Commit `f903ea73`. **Replicar** si mobile tiene registro de coach.

### 4.3 HIBP PIN numérico (funcional) — `3b1dda37` (#36)
- Reset de contraseña de alumno: PIN numérico rechazado por HIBP. `generateStudentTempPassword`. Server-side, pero afecta flujo. Verificar que mobile use el mismo generador.

### 4.4 Banner de cookies flotante (visual) — `cb94f745`. Web-only (RN no tiene cookies-banner). **No replicar.**

---

## 5. BILLING / cupones (contemporáneo al audit, 2026-06-20/21)

Cluster cupones (`b8ed509e`…`84b96b3e`, `100f3ceb`, `bd5ab619`, `673ab426`): código de descuento en registro, canje al reactivar, cupón en proración de upgrade, disclosure SERNAC, admin mint en `/admin/codigos`.
- **Paridad:** son flujos de dinero/checkout = **web-only por money-safety** (excepción intencional confirmada). El descuento vive en `getCompositeAmountClp`. Mobile solo debería DISPLAY (audit gap P4 subscription-status). **No replicar acciones**; sí el display del payload rico si aplica.

---

## 6. Endpoints mobile-api añadidos (infra, habilitan paridad)

Estos NO son pantallas pero fueron creados en la ventana para servir a mobile — el arquitecto debe saber que ya existen:
- `ce8456e6` (#3 endpoints `assertModule` para escrituras de módulos pagos)
- `6c273f32` (endpoint config: kill-switch + prefs flag + support)
- `816c6c18` (checkin-photos acepta Bearer)
- `7710593f` (endpoint team/add-coach)
- `995df126` (`api/mobile/coach/clients` tocado)
- `949ec767` (`api/coach/search` — no es `/api/mobile` pero reutilizable)

**Implicación:** parte de la infra server para gating de módulos y config ya está expuesta a mobile. El gap es el CLIENTE RN que la consuma.

---

## 7. Resumen de prioridades para el plan (delta post-audit)

| # | Cluster delta | Zona | Tipo | Prioridad |
|---|---|---|---|---|
| 1 | Reescritura ejecución de rutina (keypad tipado, stepper, timers polimórficos, sustitución, Fase M/S, mapa muscular, resiliencia, optimistic) | alumno | visual+func | **P0** |
| 2 | Sincronizar tokens DS finales (rampa dark neutra, sport remap, glow marca) | transversal | visual | **P0** |
| 3 | Dashboard alumno + ficha coach re-skin (cápsula flotante, pestañas, cosecha datos, editar biometría) | ambos | visual+func | **P0/P1** |
| 4 | Días pendientes semana + superseries + share-cards v2 | alumno | func | **P1** |
| 5 | Nav registry compartido + hub Opciones + búsqueda global + campanita | coach | visual+func | **P1** |
| 6 | Login Google nativo (GIS→SDK nativo) + login alumno brandeado completo | auth/alumno | func | **P1** |
| 7 | Módulos gated (cardio/movement/bodycomp) — ya era gap del audit, ahora con vista Progreso fusionada | ambos | func | **P1/P2** |
| 8 | Loaders 6 variantes + temas curados + Mi Marca nueva era | transversal | visual | **P2** |
| 9 | Export PDF dossier / Badging (equivalentes nativos) | coach/alumno | func | **P2/P3** |
| 10 | Landing v2, cookies banner, PWA install, cupones checkout | público/billing | — | **NO replicar** (web-only / excepción intencional) |

---

## 8. Vacíos y advertencias de este informe (honestidad)

- **NO verifiqué el estado real de `apps/mobile`** pantalla por pantalla (fuera de scope: mi tarea es el delta WEB). El arquitecto debe cruzar cada ítem contra el código mobile actual, porque las Fases 0–9 SÍ tocaron mobile y algunas cosas podrían estar parcialmente hechas.
- Los commits `18973500`/`bf75cf58`/`42e22e89` requirieron `git show --stat` sin filtro de grep (paths largos de la ruta `[coach_slug]/workout/[planId]`) — sus archivos están confirmados en §2.1.
- No abrí cada uno de los ~90 commits del rediseño; agrupé por feature usando mensajes + stats de los representativos. Detalles de micro-fixes de QA (rondas 1–5) están sintetizados, no enumerados uno a uno.
- Migraciones DB relevantes al delta: columnas sustitución en `workout_logs` (`e4fd7c32`), `client_intake.sex` (`3a9b392a`), branding v2 (`ee6bf8b0`). Todas aditivas/LIVE. Mobile habla PostgREST directo → necesita GRANTs de columna (gotcha CLAUDE.md) ya aplicados en esas migraciones.
