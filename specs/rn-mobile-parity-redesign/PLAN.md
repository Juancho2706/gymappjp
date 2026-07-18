# RN Mobile 1:1 con Web PWA (EVA DS) — PLAN

**Status:** APPROVED
**Owner:** Juan (CEO) + Claude (arquitecto)
**Last updated:** 2026-07-08
**Spec:** `specs/rn-mobile-parity-redesign/SPEC.md`
**Tasks:** `specs/rn-mobile-parity-redesign/TASKS.md`

> Fuentes: `research/01-08` (recon), `research/gaps/G01-G11`, `research/09-critic.md` (checklist §10 resuelto acá), `research/10-task-inventory.md`.

---

## Arquitectura

### Principio rector

**Web = fuente de verdad.** La referencia visual/funcional de cada pantalla RN es el árbol mobile de la web (`md:hidden`, breakpoint único md=760px). El layout desktop (sidebar/bento/master-detail) NO se porta. Toda ambigüedad de producto se resuelve adoptando el comportamiento web (rulings D1-D8 en SPEC).

### Capa de datos mobile (política única)

Hoy mobile habla PostgREST directo (~28 tablas, 7 RPCs) + 8 endpoints `/api/mobile/*`. Política para todo lo nuevo:

| Caso | Vía | Por qué |
|---|---|---|
| Lecturas user-scoped con RLS confirmada | PostgREST directo (como hoy) | Latencia, offline, ya funciona |
| Lecturas de módulos pagos (coach y alumno read-only) | PostgREST SOLO tras confirmar RLS por módulo/`client_id`; si la RLS no gatea el módulo → endpoint con `assertModule` | La RLS de `clients` NO chequea `enabled_modules` (G10) |
| Mutaciones de módulos pagos, billing, scoping | SIEMPRE `/api/mobile/*` con `assertModule`/service-role | Money-safety; evasión de cobro imposible desde el cliente |
| Features sin superficie PostgREST razonable (notas nutrición, shopping list, off-plan, micros, recap) | Endpoints `/api/mobile/*` NUEVOS (trabajo web-side, ver §Web-side) | Sus queries web son server-only |
| Config/flags/kill-switch | `/api/mobile/config` (extender con entitlements) | Un solo punto de verdad remoto |

**Regla CODEX_HANDOFF "solo apps/mobile" queda formalmente RELAJADA para este proyecto:** hay trabajo web-side obligatorio (endpoints, packages, migraciones). Gate: web verde tras cada cambio web-side.

### Mapa canónico de packages (resuelve conflicto G03/G07/G10/G11)

Extracciones desde `apps/web/src` a `packages/`, en ESTE orden. Cada extracción = 1 PR que deja web verde (typecheck + vitest + build) consumiendo el package; mobile lo adopta en su etapa.

| Orden | Package | Contenido | Fuente web | Consumidores |
|---|---|---|---|---|
| 1 | `@eva/workout-engine` | session-logs reconcile/optimistic, workout-stepper, typed-keypad (lógica), timers, **workout-block-grouping**, **workout-areas**, duración/cap | `app/c/[coach_slug]/workout/*` + `lib/` | Ejecutor RN (E2), builder (grouping/areas), cola offline (G11) |
| 2 | `@eva/cardio` | zonas (Tanaka/Karvonen), pace, plantillas de intervalos, `hrRangeForZone` | `apps/web/src/domain/cardio` | Ejecutor (HR zones, E2), builder (E5), módulo cardio (E6) |
| 3 | `@eva/plan-builder` | `builderReducer` + lógica builder; **importa** grouping/areas de workout-engine (no duplica) | `lib/plan-builder/` | Builder RN (E5), web |
| 4 | `@eva/profile-analytics` | selectores de analytics de ficha (fijar firma leyendo las 3 fuentes web ANTES — logs anidados vs planos) | `lib/profile-analytics` | Ficha coach RN (E3/E5); mata la copia manual mobile |
| 5 | `@eva/bodycomp` | domain/bodycomp (BIA + ISAK); dueño: dominio módulos | `apps/web/src/domain/bodycomp` | Módulo bodycomp (E6), vistas alumno (E6) |
| 6 | `reconcileMeals` → `@eva/nutrition-engine` (ya existe) | propagación cascade-safe | `services/nutrition-propagation.reconcile.ts` | Fix data-loss mobile (E0), coach nutrición (E5) |

Copias locales de mobile a ELIMINAR al adoptar cada package: `lib/nutrition-utils.ts` (→ reexport de `@eva/nutrition-engine`, como hace web), `lib/macro-calculator.ts` (→ tdee del engine), `lib/profile-analytics*` (→ package), reducer fork del builder (→ `@eva/plan-builder`), `NAV_META` (→ `coach-nav` compartido, E7).

### Entitlements — UNA foundation (resuelve duplicación en 9 dominios)

Tarea única en Etapa 0 de la que TODOS los dominios dependen (prohibido reimplementar):

- `useEntitlements()` en mobile: fetch de `enabled_modules` + kill-switch `EVA_DISABLED_MODULES` vía `/api/mobile/config` (extender endpoint existente), cache + revalidación al foreground.
- Espejo de `MODULE_KEYS` desde `@eva/feature-prefs` (ya expone `ModuleKey`).
- `ModuleOffNotice` RN (primitiva DS).
- Contrato server-side: mutaciones de módulo → endpoints con `assertModule`; lecturas → RLS verificada (auditoría E0.B).
- Adopción de `@eva/feature-prefs` completa (presets, master toggle, visibilidad por sección) — mata el drift de Funciones.

### Theming (consolidación, G01/G02)

- Matar la doble fuente de verdad: objeto `Theme` imperativo (`lib/theme.ts`) queda como **shim de solo-lectura** que lee los mismos tokens, hasta que la última pantalla migre (E8 lo elimina).
- Fix ANTES de todo re-skin (gate de orden): mapeo tipográfico de `tailwind.config.js` (`font-semibold`/`font-medium`/`font-display-extra` → hoy resiembran Inter/Montserrat).
- Dark mode: restaurar modo `system` (hoy el toggle solo alterna light/dark) + migración de AsyncStorage para usuarios ya fijados.
- Tokens formales de tipografía/spacing/sombras/viz (hoy números mágicos por componente).
- Ruling D3: `surface-inverse` dark = neutro web.
- **Test de paridad de tokens en CI**: script que compara `apps/web/src/app/globals.css` vs `apps/mobile/global.css` contra `specs/redesign-eva-ds/token-contract.md` — divergencia = CI rojo.

### Primitivas DS faltantes (fundación del re-skin)

Construir en E0.E (con historia en el catálogo que exista para mobile): Toast/feedback (paridad Sonner), Select/Picker DS, Switch DS, DropdownMenu/Popover, Textarea + Form wrapper, subcomponentes de Card (Header/Content/Footer/Title), GlassButton, tokens `--viz-*` charts, `GlowBorderCard`/`AmbientBrandGlow` (lo piden G01/G06/G09 — se hace UNA vez acá), **`ShareCard` motor único** (`react-native-view-shot`; lo piden G03/G05/G06 — UNA implementación), command palette base (búsqueda global, G01/G06/G09).

### Pantallas huérfanas — dueños asignados (critic §1)

| Pantalla | Dueño | Nota |
|---|---|---|
| `(auth)/verify-email` | E1 (auth compartido) | crear en RN |
| Re-skin auth COACH (login/register radio-cards) | E3 | el grupo `(auth)` es compartido; E1 hace alumno, E3 coach |
| Google Sign-In coach (funcional, lib nativa) | E5 (batch EAS) | SDK nativo + `signInWithIdToken`, NO iframe GIS |
| `coach/onboarding` + `complete` | E5 | port del intake post-registro |
| `coach/reactivate` | E7 | display + gate `cancelled` + link-out (ruling D7) |
| `coach/tools` (hub Herramientas) | E6 | launcher de módulos, puerta a G10 |
| `workspace/select` | — | cubierto por sheet switcher (ruling D5) |
| `coach/templates` | — | redirect legacy, ignorar (ruling D8) |

---

## Etapas

Orden: fundaciones → alumno visual → ejecutor → coach visual → alumno funcional → coach funcional → módulos → settings/team → cierre. Cada etapa termina en **gate**: typecheck + vitest + `expo export` android + smoke Maestro + QA CEO en device + estado releaseable.

### Etapa 0 — Fundaciones y triage (habilitador; nada de re-skin de pantallas todavía)

- **0.A Bugs vivos (P0, primero de todo):** data-loss nutrición (`saveClientPlan`/`propagateTemplate` → `reconcileMeals` compartido); drift macros (adoptar `@eva/nutrition-engine` tdee+macros, borrar copias); deep links (assetlinks.json SHA256 real + `associatedDomains` iOS + smoke `/c/`+`/invite/`); verificación `checkins` vs `check_ins`.
- **0.B Prerequisitos DB (auditoría + 1 migración aditiva):** GRANT a `anon` de columnas branding (login alumno brandeado); GRANT UPDATE de columnas nuevas que mobile escribirá (biometría, `client_intake.sex`, sustitución de máquina); RLS bucket `checkins` (upload directo alumno); RLS bodycomp/movement para lecturas alumno. Protocolo: snapshot + tx-rollback + advisors en LIVE aditivo (NUNCA branches Supabase — memoria).
- **0.C Entitlements foundation** (ver §Arquitectura).
- **0.D Theming consolidation** (ver §Arquitectura; incluye gate tipográfico).
- **0.E Primitivas DS faltantes** (ver §Arquitectura).
- **0.F Seams wave 1:** extraer `@eva/workout-engine` + `@eva/cardio`; adoptar engine de nutrición (viene de 0.A); passthrough de campos desconocidos en el guardado del builder mobile (anti round-trip destructivo — ANTES de que nadie toque el builder).
- **0.G Infra QA/releases:** Sentry RN; Maestro instalado + 4 smoke flows core (login alumno, ejecutar workout, completar comida, check-in); matriz de devices; flags locales (`lib/flags.ts`) para pantallas incompletas; política EAS/OTA documentada (abajo); CI: test de paridad de tokens.

### Etapa 1 — Alumno visual (re-skin; la app "se siente PWA")

**Arranque brandeado [NUEVO-CEO]:** cadena splash nativo EVA → splash/loader brandeado del coach (logo + color vía `@eva/brand-kit`, paridad con el splash PWA per-coach; `expo-splash-screen` `preventAutoHideAsync` hasta resolver el brand del último coach conocido/sesión) → app. Sin flash genérico. **Onboarding walkthrough pre-login [NUEVO-CEO]:** carrusel 3-5 slides EVA DS al primer arranque (flag AsyncStorage), skippeable, bypass si entra por deep link `/c/`/`/invite/`; contenido a definir con CEO (propuesta: qué es EVA → entrena → nutrición/check-in → empieza con tu código).

Chrome: cápsula flotante de nav (Inicio/Nutrición/Aprender/Check-in + Más) con hide-on-scroll y píldora deslizante — **es M-L, no 3×S** (critic §6), patrón central del árbol alumno. Dashboard alumno completo (13 secciones: header sticky, StreakRibbon, CheckInBanner, Hero, CoachPresence, Momentum, ActiveProgram/pendientes, Weight, PRs, RecentWorkouts, Habits→ruling D4, NutritionSummary, WelcomeModal). Perfil nuevo. Check-in re-skin. History re-skin. Exercises/"Aprender" re-skin. Auth alumno: login brandeado completo (logo + brand_name + welcome_message; GRANT de 0.B), codigo, onboarding, suspended, forgot/reset, verify-email, index selector de rol (matar wordmark hex hardcodeado). Excluido explícito: ejecutor (E2 lo reemplaza, no se re-skinea dos veces).

### Etapa 2 — Ejecutor alumno (reemplazo completo, visual+funcional)

- **2.A Core fuerza:** rewrite del monolito `workout/[planId].tsx` (934L, paleta propia) a ~15 componentes DS sobre `@eva/workout-engine`: keypad numérico tipado RPE/RIR, stepper de peso, modo paso-a-paso (StepperExecution), drafts/snapshot/optimistic (resiliencia PR #113), duración + cap 4h, descanso + celebraciones + audio (Fase M), háptica + wake-lock (Fase S), mapa muscular (MuscleMapSvg), sustitución de máquina (columnas + GRANTs de 0.B), superseries.
- **2.B Polimórfico:** tipos cardio/mobility/roller, timers Interval/Hold/Stopwatch, zonas HR vía `@eva/cardio`, agrupación por áreas, técnica/video inline.
- **2.C Periferia:** días pendientes, búsqueda, share-card de workout (motor de 0.E), check-in P0 post-workout + banner umbrales (seam con E4).

### Etapa 3 — Coach visual (re-skin de lo que EXISTE en mobile)

Dashboard coach (completar: PulseHero, PriorityCard+NextStepInset, AgendaCard, NewsFeed, banners billing). Directorio clientes re-skin (`clientes.tsx` 1224L; War Room, DirectoryActionBar, DirRowCard, FAB) + empty-states (no heredar crash 0-alumnos). Ficha re-skin: 5 tabs nombres web (ruling D2), ClientProfileHero, pills sticky, FloatingActions. Builder + program-builder **SOLO re-skin visual** con passthrough (0.F) — la reconstrucción funcional es E5; se declara el doble toque. Mi Marca re-skin a patrón A. Suscripción re-skin (display actual). Support re-skin. Auth coach re-skin (login/register radio-cards "Tu plan"). Foods/nutrition-builder re-skin visual.

### Etapa 4 — Alumno funcional (nutrición overhaul + periferia)

Endpoints web nuevos (notas, shopping, off-plan, micros, recap — cuello de botella: hacer primero). Luego RN: swaps aplicables, chips exchanges/equivalencias (gated `nutrition_exchanges`), panel micros, plato visual, off-plan logger, hilo de notas coach↔alumno, recetas (RecipeIdeas), lista de compras, recap semanal, medidas caseras ("120 g (1 taza)"), gating por sección fail-open EXACTO al de web, PDF del día (mismo patrón que ruling D6). Badging nativo (`setBadgeCountAsync` — UNA vez, seam G05/G11). Cola offline: idempotencia por `client_log_id` (alinear con optimistic+reconcile web).

### Etapa 5 — Coach funcional core

Builder: reconstrucción sobre `@eva/plan-builder` — áreas dinámicas (`section_template_id`, drag-to-area con draggable-flatlist), bloques polimórficos typed (duration/distance/pace/HR/interval/side_mode/load), BlockEditSheet paridad (web 1009L vs mobile 272L). Ficha: write-paths (editar biometría, sexo), dossier PDF (spike D6). Directorio: import wizard 4 pasos + tier-gate (parser ya portado, sin UI). Nutrición coach: recetas library, meal-groups, alérgenos/intolerancias visibles y bloqueantes en builder (correctness), medidas caseras, propagación segura (ya de 0.A). Check-ins coach: snapshot en ficha con 3 fotos (side incluida — hoy se pierde), toggle revisado optimista. Ejercicios: crear/editar según ruling D1 (workspace), filtros "Con video"/"Personalizados", video (trim si viable). Google Sign-In coach nativo + onboarding coach port (batch EAS de la etapa). Dashboard V2 data (endpoint bridge si hace falta).

### Etapa 6 — Módulos de pago (todo gated por 0.C)

`coach/tools` hub (launcher + picker de alumno). Cardio: calculadora de zonas, plantillas de intervalos, perfil por cliente (`@eva/cardio`). Movement: hub risk-band, wizard 7 patrones (autosave/resume/consentimiento), reporte + evolución, vista alumno read-only. Bodycomp: BIA (~14 métricas), ISAK 4 pasos (~22 medidas), paneles tendencia, vista alumno (`@eva/bodycomp`, `@eva/schemas/bodycomp` — confirmar portabilidad client-side, marcados SERVER-ONLY). Nutrición Pro: modo intercambios coach + exchange targets (mutaciones vía endpoint + `assertModule`). Catálogo Módulos + CTA add-on (display; compra link-out). Charts: victory-native/Skia con tokens `--viz-*`. Empty-states en TODO (bug web 0-alumnos NO se hereda; fix web aparte ya en memoria). Vistas alumno gated con RLS confirmada (0.B).

### Etapa 7 — Settings hub + team + chrome coach

`getWorkspaceContext` mobile ÚNICO (bloqueante del dominio; sirve a switcher, suspended team-aware, settings, suscripción). Hub Opciones (HubCards como web). Funciones (FeaturePrefsPanel: preset + master + toggles con lock Pro). Áreas CRUD. Mi Equipo completo (brand studio, miembros, asientos, invite, módulos team). Suscripción display rica (consumir `subscription-status`: precio compuesto, add-ons + "Cortesía EVA", tarjeta brand+last4, historial; acciones link-out). Reactivate (ruling D7) + gate estado `cancelled` en los guards de acceso mobile. Workspace switcher (sheet). News bell viva. Búsqueda global coach (command palette + `/api/coach/search`). Nav registry: extraer `coach-nav.ts` a package y derivar tabs Expo + sheet "Más" (mata `NAV_META`; tabs gated por módulos, tab Reactivar).

### Etapa 8 — Cierre 1:1 + hardening

Barrido de paridad pantalla-por-pantalla contra checklist (web md vs RN, todos los estados). Purga final: `lib/theme.ts`, Inter/Montserrat (408 usos/69 archivos — acá se termina, venía bajando por etapa), `db-compat` obsoleto. Rendimiento (listas grandes, charts). Accesibilidad básica RN. Universal links E2E ambos OS. QA CEO final + release estable. Documentación canónica actualizada (PROJECT_STRUCTURE, FLOWS_AND_COMPONENTS, TEST_STATUS, AGENTS.md mobile) + memoria. Cierre = a partir de acá, features nuevas web DEBEN nacer con tarea espejo mobile (regla anti-drift en CLAUDE.md).

---

## Trabajo web-side consolidado (critic §2.4/2.5)

1. Endpoints `/api/mobile/*` nuevos: nutrición (notas, shopping, off-plan, micros, recap), bridge `subscription-status`, dashboard V2 shape si aplica, extensión de `config` (entitlements + kill-switch).
2. Extracciones a packages (tabla §Arquitectura) — web migra sus imports en el mismo PR.
3. Migraciones DB (0.B) — aditivas, protocolo LIVE.
4. Fix web del crash 0-alumnos en `/coach/cardio`+`/coach/movement` (memoria `project_module_pages_crash_no_clients`) — hermana del trabajo E6.
5. Gate permanente: cada PR web-side deja `pnpm typecheck` + vitest + build verdes.

## Estrategia QA (critic §2.1)

- **Por tanda:** `tsc --noEmit` (mobile) + vitest (packages/web tocados). Regla memoria: E2E/dispositivo solo en gates con OK explícito.
- **Por etapa (gate):** `expo export --platform android`; smoke Maestro (4 flujos core + los flujos de la etapa); QA CEO en device real (matriz mínima: 1 Android gama media + 1 iPhone; pantallas chicas incluidas); checklist de paridad visual de la etapa (screenshot lado a lado web md vs RN por pantalla migrada).
- **Regresión visual (prioridad #1 CEO — fidelidad IDÉNTICA):** carpeta `docs/audits/rn-parity-qa/` con pares de screenshots lado a lado (web md vs RN) por CADA pantalla migrada, en light Y dark, con branding de coach de prueba aplicado (seed josefit). Es parte del gate: pantalla sin su par archivado y aprobado = etapa no cierra. Flujo por pantalla: capturar web md (Playwright, viewport 390×844) → capturar RN (device/emulador mismo tamaño) → revisión de desviaciones (spacing, tipografía, tokens, radios, glow, motion) → correcciones → re-captura. Desviaciones aceptadas solo con justificación técnica RN documentada en el checklist.
- **Tests unitarios:** cada package extraído conserva/gana tests (los de web se mueven con el código); round-trip test del builder; test de orfandad de reconcileMeals (existe en web, correr contra mobile paths).

## Estrategia de releases + EAS/OTA (critic §2.2/2.3)

- **Rama:** trunk de proyecto = `rnmobiledenuevo`; 1 PR por tanda hacia la rama de proyecto o directo a master al cierre de etapa (decisión operativa del CEO por etapa; default: PR draft por etapa → merge a master en gate).
- **Release a stores SOLO al cierre de etapa** (estado consistente). Sin congelar stores: hotfixes de la app actual siguen saliendo.
- **OTA (`expo-updates`)** para cambios JS-only entre releases; `runtimeVersion: appVersion` ya configurado.
- **Libs nativas** (fuerzan build EAS + submit): batch al INICIO de la etapa que las necesita — E0: Sentry, view-shot, Maestro-friendly; E5: Google Sign-In; evaluar notifee solo si badging lo exige. Nunca gotear libs nativas mid-etapa (fragmenta versiones en campo).
- **SDK 54 congelado** todo el proyecto (SPEC Non-Goal). EAS CLI pineado en `eas.json`/CI.
- **Flags locales** (`lib/flags.ts`) ocultan pantallas incompletas dentro de una etapa; se borran al cerrar la etapa (no acumular flags muertos).

## Data Model

- DB: migración aditiva única en 0.B (GRANTs anon branding, GRANT UPDATE columnas write-path mobile, verificación RLS bucket/módulos). Nada destructivo.
- RLS: sin policies nuevas salvo que la auditoría 0.B encuentre huecos en lecturas de módulos (entonces: policy o endpoint, según §capa de datos).
- `database.types.ts`: regenerar tras 0.B.

## Test Plan

Ver §Estrategia QA. Resumen por PR: typecheck + vitest dominio tocado; por etapa: export + Maestro + QA CEO + checklist paridad.

## Rollback Plan

- Cada etapa es un conjunto de PRs revertibles; releases solo en gates → rollback = re-release del binario/OTA anterior (`runtimeVersion` compatible para OTA; binario anterior sigue en stores para phased rollout halt).
- Migración DB 0.B es aditiva (GRANTs) — reversa = REVOKE documentado en la migración.
- Extracciones de packages: web sigue funcionando con el package (mismo código movido); reversa = revert del PR de extracción.
- Los flags locales permiten apagar una pantalla nueva rota sin release (si el flag lee de `/api/mobile/config`, apagable remoto — implementar flags remotos para pantallas de riesgo alto: ejecutor E2).
