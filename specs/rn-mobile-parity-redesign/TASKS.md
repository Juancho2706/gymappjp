# RN Mobile 1:1 con Web PWA (EVA DS) — TASKS

**Status:** APPROVED
**Owner:** Juan (CEO) + Claude (arquitecto)
**Last updated:** 2026-07-08
**Spec:** `specs/rn-mobile-parity-redesign/SPEC.md`
**Plan:** `specs/rn-mobile-parity-redesign/PLAN.md`
**Inventario fuente:** `specs/rn-mobile-parity-redesign/research/10-task-inventory.md` (181 tareas, G01–G11)

> Este documento mapea las 181 tareas del inventario a las etapas E0–E8 del PLAN, resolviendo los 23
> solapamientos con dueño único (dedup) y añadiendo las tareas que el PLAN nombra y el inventario no
> tenía, marcadas `[NUEVO-PLAN]`. Convención de esfuerzo (del inventario): **S=1.5d · M=4d · L=7.5d · XL=15d** (días netos).
> Formato de cada tarea: `ID · [TIPO] [ESF] Título` / `Fuentes · Deps` / `Scope · Verificación`.

---

## Resumen ejecutivo

| Etapa | Foco | # tareas | S | M | L | XL | Días netos |
|---|---|---|---|---|---|---|---|
| E0 | Fundaciones y triage (0.A–0.G) | 41 | 23 | 16 | 2 | 0 | 113.5 |
| E1 | Alumno visual (re-skin) | 22 | 14 | 7 | 1 | 0 | 56.5 |
| E2 | Ejecutor alumno (rewrite visual+funcional) | 18 | 6 | 7 | 4 | 1 | 82.0 |
| E3 | Coach visual (re-skin de lo existente) | 22 | 8 | 12 | 2 | 0 | 75.0 |
| E4 | Alumno funcional (nutrición overhaul + periferia) | 23 | 11 | 8 | 4 | 0 | 78.5 |
| E5 | Coach funcional core | 23 | 8 | 12 | 3 | 0 | 82.5 |
| E6 | Módulos de pago (gated por 0.C) | 13 | 1 | 4 | 6 | 2 | 92.5 |
| E7 | Settings hub + team + chrome coach | 12 | 1 | 9 | 2 | 0 | 52.5 |
| E8 | Cierre 1:1 + hardening | 6 | 2 | 2 | 2 | 0 | 26.0 |
| **TOTAL** | | **180** | **74** | **77** | **26** | **3** | **659.0** |

> 180 tareas resultantes = 156 derivadas del inventario + 22 `[NUEVO-PLAN]` + 2 `[NUEVO-CEO]` (E1-21 splash
> brandeado, E1-22 walkthrough pre-login; agregadas 2026-07-08 por pedido del CEO). 25 tareas fuente quedaron
> absorbidas por dedup (ver §Trazabilidad). Los días netos ya descuentan los solapamientos del inventario
> (el bruto sin dedup era 658 d-persona). Es esfuerzo total; la planificación real corre etapas en paralelo por dominio.

---

## E0 — Fundaciones y triage

Habilitador puro: **nada de re-skin de pantallas todavía**. Cierra con el gate estándar + migración DB aditiva aplicada y verde.

> **Estado 2026-07-08: 40/41 hechas (G1: DSN cableado; source maps difieren de SENTRY_AUTH_TOKEN)** (3 waves multi-agente + fixes del arquitecto). Verificado: typecheck web+mobile EXIT 0 · vitest 1760+ passed · token parity 86 tokens OK · `expo export --platform android` exit 0 · auditoría DB = cero deltas (E0-B1 sin migración que aplicar; E0-B3 N/A por lo mismo). Las 4 restantes esperan insumos externos: **E0-A3** SHA256 del keystore prod (EAS credentials, CEO), **E0-G1** DSN de Sentry (crear proyecto, MT-40), **E0-G2** correr los 4 flows Maestro en device/emulador (escritos; faltan testIDs, ver `.maestro/README.md`), **E0-G3** confirmar dispositivos de la matriz QA (placeholders PENDIENTE-CEO). El batch de libs nativas (Sentry, view-shot) exige **un build EAS nuevo** antes del QA en device de E1.

### E0.A — Bugs vivos (P0, primero de todo)

- [x] **E0-A1** · [SEAM][M] Adoptar `@eva/nutrition-engine` (tdee+macros) y borrar copias locales
  - Fuentes: G04-B1, G08-B1, G10-T6 · Deps: ninguna
  - Scope: reexport de `nutrition-utils` desde el engine + borrar `lib/macro-calculator.ts` (como hace web); fix drift de macros coach↔alumno. · Verificación: mismo alumno arroja macros idénticos en web y app (test comparativo) + vitest engine verde.
- [x] **E0-A2** · [SEAM/FUNCIONAL][M] Fix data-loss nutrición: `reconcileMeals` compartido cableado en `saveClientPlan`/`propagateTemplate`
  - Fuentes: G08-B2 · Deps: E0-A1
  - Scope: extraer/compartir `nutrition-propagation.reconcile.ts`; solo borra comidas SIN logs (preserva historial). · Verificación: test de orfandad (existente en web) corrido contra paths mobile = cero borrado de comidas con logs.
- [x] **E0-A3** · [FUNCIONAL][S] Deep links Android — `assetlinks.json` con SHA256 real (P0)
  - Fuentes: G11-A2 · Deps: ninguna
  - Scope: reemplazar placeholder por fingerprint real del keystore de prod. · Verificación: smoke abre `/c/` e `/invite/` desde link externo en Android físico.
- [x] **E0-A4** · [FUNCIONAL][S] Universal links iOS — `associatedDomains` (applinks + webcredentials) + AASA (P0)
  - Fuentes: G11-A3, G02-B8 · Deps: ninguna
  - Scope: `associatedDomains` en config + `.well-known/apple-app-site-association` servido. · Verificación: smoke abre `/c/`+`/invite/` desde link externo en iPhone físico.
- [x] **E0-A5** · [FUNCIONAL][S] Verificación tabla `checkins` vs `check_ins` (nombre correcto) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.A) · Deps: ninguna
  - Scope: auditar referencias mobile a la tabla de check-ins y alinear al nombre canónico de prod. · Verificación: query de check-in del alumno devuelve filas en device (no 404/relation-not-found).

### E0.B — Prerrequisitos DB (auditoría + 1 migración aditiva)

- [x] **E0-B1** · [FUNCIONAL][M] Migración aditiva única: GRANT anon branding + GRANT UPDATE write-paths + RLS bucket/módulos `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.B) · Deps: ninguna
  - Scope: GRANT a `anon` de columnas branding; GRANT UPDATE de columnas nuevas (biometría, `client_intake.sex`, sustitución máquina); RLS bucket `checkins`; RLS lecturas alumno bodycomp/movement; protocolo snapshot + tx-rollback + advisors en LIVE (NUNCA branches). · Verificación: advisors 0 críticos; reversa (REVOKE) documentada en la misma migración.
- [x] **E0-B2** · [FUNCIONAL][S] Verificar/agregar GRANTs de columna por feature (checklist vivo)
  - Fuentes: G11-C2 · Deps: E0-B1
  - Scope: por cada write-path nuevo, confirmar `GRANT UPDATE(col)` antes de mergear (anti-42501). · Verificación: suite `module-grants.sql`-style contra `information_schema.column_privileges` sin drift.
- [x] **E0-B3** · [FUNCIONAL][S] Regenerar `database.types.ts` tras 0.B `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN Data Model) · Deps: E0-B1
  - Scope: `supabase db pull` + regen de tipos; propagar a web y mobile. · Verificación: `pnpm typecheck` verde en web y mobile con los tipos nuevos.

### E0.C — Entitlements foundation (UNA sola vez; los dominios solo consumen)

- [x] **E0-C1** · [SEAM/FUNCIONAL][L] Foundation de entitlements + adopción `@eva/feature-prefs`/`@eva/module-catalog` + wiring de packages
  - Fuentes: G10-T4 (dueño), G10-T3, G10-T5, G11-A1, G11-A4, G09-T8, G06-B2, G05-T8, G04-B3, G08-C1 · Deps: E0-C es habilitador; usa `/api/mobile/config`
  - Scope: `useEntitlements()` (fetch `enabled_modules` + kill-switch `EVA_DISABLED_MODULES` vía `/api/mobile/config`, cache + revalidación al foreground); espejo de `MODULE_KEYS` desde `@eva/feature-prefs`; paths tsconfig + Metro + reexport shims de todos los `@eva/*`; contrato server-side (mutaciones→`assertModule`, lecturas→RLS verificada). · Verificación: un coach SIN módulo no accede ni por PostgREST directo; `hasModuleClient` unit-tested; web verde tras el wiring.
- [x] **E0-C2** · [VISUAL][S] `ModuleOffNotice` RN (primitiva DS)
  - Fuentes: G10-T9 · Deps: E0-C1
  - Scope: aviso reutilizable de "módulo no disponible" con CTA contextual. · Verificación: render en device claro/oscuro + safe-area.
- [x] **E0-C3** · [FUNCIONAL][S] Gate de tab Nutrición en nav alumno (ocultar "Plan" si OFF)
  - Fuentes: G02-B4 · Deps: E0-C1
  - Scope: consumir entitlement para ocultar la sección de nutrición en el nav. · Verificación: alumno de coach sin nutrición no ve el tab; con nutrición sí.

### E0.D — Theming consolidation (gate de orden ANTES de cualquier re-skin)

- [x] **E0-D1** · [SEAM/VISUAL][S] Reconciliar 3 mismatches de token dark + duraciones de motion (ruling D3)
  - Fuentes: G01-F0.1 · Deps: ninguna
  - Scope: `surface-inverse` dark = neutro web; alinear los 3 tokens divergentes. · Verificación: test de paridad de tokens (E0-G5) pasa esos 3.
- [x] **E0-D2** · [FUNCIONAL][S] Frontera de theming (className vs objeto `theme`) + shim read-only
  - Fuentes: G01-F0.2 · Deps: ninguna
  - Scope: documentar la frontera; convertir `lib/theme.ts` en shim de solo-lectura sobre los mismos tokens. · Verificación: lint/regla que impide escritura al objeto `theme`.
- [x] **E0-D3** · [VISUAL][M] Tokens formales de tipografía: escala + roles como helper RN
  - Fuentes: G01-F0.3 · Deps: E0-D1
  - Scope: escala y roles tipográficos como helper (mata números mágicos por componente). · Verificación: componentes DS usan el helper; sin literales de fontSize sueltos en primitivas.
- [x] **E0-D4** · [VISUAL][S] Fix mapeo tipográfico `tailwind.config.js` (gate anti-reseed Inter/Montserrat) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN §Theming, gate de orden) · Deps: E0-D3
  - Scope: `font-semibold`/`font-medium`/`font-display-extra` dejan de resembrar Inter/Montserrat → familias EVA (Archivo/Hanken). · Verificación: grep de re-skin no reintroduce fuentes legacy; render con familia correcta.
- [x] **E0-D5** · [VISUAL][S] Escala de sombras/elevación centralizada + glow-ember + retune dark
  - Fuentes: G01-F0.4 · Deps: E0-D2
  - Scope: escala de sombras + glow-ember como tokens. · Verificación: primitivas Card/Sheet consumen la escala; dark retuneado.
- [x] **E0-D6** · [VISUAL][S] Declarar paleta `--viz-1..6` en global.css + tailwind.config.js
  - Fuentes: G01-F0.5 · Deps: E0-D1
  - Scope: tokens de viz para charts (paridad web). · Verificación: presentes en `apps/mobile/global.css` y verificados por el test de paridad.
- [x] **E0-D7** · [FUNCIONAL][S] Dark mode: restaurar modo "system" + `ThemeToggle` DS + migración AsyncStorage
  - Fuentes: G01-F0.10 · Deps: E0-D2
  - Scope: modo `system` (hoy solo light/dark) + migración de usuarios ya fijados. · Verificación: cambiar tema del OS refleja en la app; usuarios previos no pierden preferencia.
- [x] **E0-D8** · [VISUAL][S] Tokens de spacing 4px como escala formal
  - Fuentes: G01-F1.8 · Deps: E0-D1
  - Scope: escala 4px formal (mata paddings mágicos). · Verificación: primitivas consumen la escala.

### E0.E — Primitivas DS faltantes (fundación del re-skin; batch de libs nativas al inicio)

- [x] **E0-E1** · [FUNCIONAL][M] Toast/Sonner provider + `useToast`
  - Fuentes: G01-F0.6 (dueño), G05-T1 · Deps: E0-D3, E0-D5
  - Scope: provider canónico de feedback (paridad Sonner). · Verificación: toasts de éxito/error en device; un solo provider (sin fork).
- [x] **E0-E2** · [FUNCIONAL][M] Switch DS + Select/Picker DS
  - Fuentes: G01-F0.7 · Deps: E0-D3
  - Scope: primitivas canónicas (Base UI Select quirk: `Value` con children explícitos). · Verificación: usadas por Mi Marca (E7) y Funciones sin reimplementar Switch.
- [x] **E0-E3** · [VISUAL][S] Subcomponentes de Card (Header/Content/Footer/Title/Description/Action)
  - Fuentes: G01-F0.8 · Deps: E0-D3, E0-D5
  - Scope: subcomponentes de Card paridad web. · Verificación: Cards del re-skin los usan.
- [x] **E0-E4** · [FUNCIONAL][M] Unificar Sheet/Dialog + quitar Montserrat del título
  - Fuentes: G01-F0.9 · Deps: E0-D3
  - Scope: Sheet/Dialog único; título con fuente DS. · Verificación: sheets del árbol usan el mismo componente.
- [x] **E0-E5** · [FUNCIONAL][M] DropdownMenu / Popover / ActionSheet
  - Fuentes: G01-F1.1 · Deps: E0-E4
  - Scope: primitivas de overlay. · Verificación: usadas por filtros/menús del re-skin.
- [x] **E0-E6** · [FUNCIONAL][M] Textarea + Form wrapper (rhf + zod)
  - Fuentes: G01-F1.2 · Deps: E0-E2
  - Scope: wrapper de formularios con validación Zod en cliente. · Verificación: un form del re-skin valida en cliente y servidor.
- [x] **E0-E7** · [VISUAL][S] GlassButton + unificar GlassCard con variantes web
  - Fuentes: G01-F1.4 · Deps: E0-D5
  - Scope: GlassButton + variantes de GlassCard. · Verificación: paridad visual con web md.
- [x] **E0-E8** · [VISUAL][M] `AmbientBrandGlow` / `GlowBorderCard` RN (Skia/gradiente)
  - Fuentes: G01-F1.5 · Deps: E0-D5, E0-D6
  - Scope: primitiva de glow de marca (la piden G06-A4/G09-T16/G03-A5 — se hace UNA vez acá). · Verificación: consumida por ClientHero (E3) y Mi Marca (E7) sin duplicar.
- [x] **E0-E9** · [FUNCIONAL][M] Command palette / búsqueda global base RN
  - Fuentes: G01-F1.6 · Deps: E0-E2
  - Scope: primitiva de command palette (base de búsqueda global coach G06-B8). · Verificación: abre/filtra/navega en device.
- [x] **E0-E10** · [VISUAL][S] InfoTooltip / MetricInfo touch (popover on tap)
  - Fuentes: G01-F1.7 · Deps: E0-E5
  - Scope: tooltip táctil. · Verificación: tap muestra info en métricas.
- [x] **E0-E11** · [FUNCIONAL][M] `ShareCard` motor único (react-native-view-shot) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN §Primitivas; lo piden G03-B10/G05-T13/G06) · Deps: E0-D5 (batch EAS de libs nativas E0)
  - Scope: renderer de canvas nativo para share-cards branded (UNA implementación). · Verificación: exporta imagen; consumido por E2-16 (workout) y E4-21 (perfil).
- [x] **E0-E12** · [FUNCIONAL][M] Player de video inline compartido (webview YouTube / expo-video) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN §Primitivas; lo piden G03-B13/G05-T12/G07-D2) · Deps: E0-D3
  - Scope: player inline reutilizable (YouTube webview / mp4 expo-video), soporta recorte. · Verificación: reproduce inline en técnica ejecución, catálogo y preview coach.
- [x] **E0-E13** · [VISUAL][S] Token color canal Android + re-skin estados transversales (OfflineBanner/SyncStatusPill/BiometricLock/error)
  - Fuentes: G11-B3 · Deps: E0-D1, E0-D5
  - Scope: color de canal de notificación Android + re-skin de estados transversales. · Verificación: banners y locks en DS claro/oscuro.

### E0.F — Seams wave 1 (extracciones; web verde tras cada seam)

- [x] **E0-F1** · [SEAM][L] Extraer `@eva/workout-engine` (+ shim web)
  - Fuentes: G03-B0 · Deps: ninguna (bloquea E2)
  - Scope: session-logs reconcile/optimistic, workout-stepper, typed-keypad (lógica), timers, **workout-block-grouping**, **workout-areas**, duración/cap 4h; web migra imports en el mismo PR. · Verificación: web verde (typecheck+vitest+build); tests del engine viajan con el código.
- [x] **E0-F2** · [SEAM][S] Extraer `domain/cardio` → `@eva/cardio`
  - Fuentes: G10-T1 · Deps: ninguna
  - Scope: zonas (Tanaka/Karvonen), pace, plantillas de intervalos, `hrRangeForZone`. · Verificación: web verde consumiendo el package.
- [x] **E0-F3** · [FUNCIONAL][M] Passthrough de campos desconocidos en el guardado del builder mobile (anti round-trip destructivo) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.F; riesgo SPEC) · Deps: ninguna (ANTES de que nadie toque el builder)
  - Scope: preservar `section_template_id` y campos polimórficos no editados al guardar. · Verificación: round-trip test — guardar un plan no borra campos no editados.

### E0.G — Infra QA / releases

- [x] **E0-G1** · [FUNCIONAL][M] Sentry RN + source maps EAS (P1)
  - Fuentes: G11-A5 · Deps: batch EAS libs nativas E0
  - Scope: telemetría de crashes y errores de red en prod mobile. · Verificación: crash de prueba visible en Sentry con symbolication.
- [ ] **E0-G2** · [FUNCIONAL][M] Maestro instalado + 4 smoke flows core `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.G) · Deps: ninguna
  - Scope: flows login alumno, ejecutar workout, completar comida, check-in. · Verificación: `maestro test` verde de los 4 flujos en CI/local.
- [x] **E0-G3** · [FUNCIONAL][S] Matriz de dispositivos QA `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.G; open question SPEC) · Deps: ninguna
  - Scope: definir mínimo 1 Android gama media + 1 iPhone (pantallas chicas incluidas). · Verificación: matriz documentada en `docs/audits/rn-parity-qa/`.
- [x] **E0-G4** · [FUNCIONAL][S] Flags locales `lib/flags.ts` (+ flag remoto para pantallas de alto riesgo) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN 0.G / Rollback) · Deps: E0-C1 (flag remoto lee `/api/mobile/config`)
  - Scope: ocultar pantallas incompletas dentro de una etapa; flag remoto apagable para el ejecutor (E2). · Verificación: toggle oculta pantalla sin release; flag remoto apaga E2 sin deploy.
- [x] **E0-G5** · [SEAM][S] Test de paridad de tokens en CI `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN §Theming / AC SPEC) · Deps: E0-D1
  - Scope: script compara `apps/web/src/app/globals.css` vs `apps/mobile/global.css` contra `specs/redesign-eva-ds/token-contract.md`. · Verificación: divergencia = CI rojo.
- [x] **E0-G6** · [FUNCIONAL][S] Hook de OTA en foreground (`checkForUpdateAsync` + prompt) + política EAS/OTA documentada (P3)
  - Fuentes: G11-D1 · Deps: ninguna
  - Scope: chequeo de OTA al foreground; `runtimeVersion: appVersion`. · Verificación: OTA JS-only se aplica; política escrita en docs de operaciones.

**Gate E0:** `tsc --noEmit` (mobile) + vitest (packages/web tocados) verdes · `expo export --platform android` OK · migración 0.B aplicada + advisors 0 críticos + `database.types.ts` regenerado · smoke Maestro de los 4 flujos core · QA CEO en device (Android + iPhone) · test de paridad de tokens verde en CI · Sentry recibiendo eventos · **sin re-skin de pantallas visible** (estado releaseable = binario actual + fundaciones invisibles).

## E1 — Alumno visual (re-skin; la app "se siente PWA")

Excluido explícito: el **ejecutor** (lo reemplaza E2, no se re-skinea dos veces).

- [ ] **E1-01** · [VISUAL][L] Cápsula flotante del nav alumno (hide-on-scroll + píldora deslizante + sheet "Más") — 1:1 web
  - Fuentes: G02-A1 (dueño), G02-A2, G02-A3, G03-A4 · Deps: E0-E4 (Sheet)
  - Scope: reescribir `AlumnoMobileChrome`: Inicio/Nutrición/Aprender/Check-in + Más, minimizar >80px, píldora deslizante, sheet rico (perfil + Historial + Cerrar sesión). Es M-L, no 3×S (critic §6). · Verificación: paridad visual con web md; hide-on-scroll y sheet en device.
- [ ] **E1-02** · [VISUAL][M] Home alumno completo: StreakRibbon + Hero (ProgressRing) + Momentum + shell de 13 secciones
  - Fuentes: G03-A5 · Deps: E0-E3, E0-E8
  - Scope: header sticky, StreakRibbon, CheckInBanner, Hero, CoachPresence, Momentum, ActiveProgram/pendientes, Weight, PRs, RecentWorkouts, Habits (ruling D4), NutritionSummary, WelcomeModal. · Verificación: 13 secciones presentes; screenshot lado a lado con web md.
- [ ] **E1-03** · [FUNCIONAL][S] WeightQuickLog + TrendArrow en WeightWidget
  - Fuentes: G03-C2 · Deps: E1-02
  - Scope: quick-log de peso + flecha de tendencia. · Verificación: registrar peso actualiza el widget optimista.
- [ ] **E1-04** · [FUNCIONAL][S] PRDetailSheet (progresión del lift on-demand)
  - Fuentes: G03-C3 · Deps: E1-02, E0-E4
  - Scope: sheet con progresión del PR al tap. · Verificación: abre con datos correctos del lift.
- [ ] **E1-05** · [FUNCIONAL][S] ProgramPhaseBar + estados de plan (today/completed/pending/upcoming)
  - Fuentes: G03-C4 · Deps: E1-02
  - Scope: barra de fase + estados del programa. · Verificación: estados coinciden con web para el mismo alumno.
- [ ] **E1-06** · [VISUAL][M] Re-skin Check-in a EVA DS (Card/Button/Input + disclaimer + stepper + wave/confetti)
  - Fuentes: G05-T2 · Deps: E0-E1 (Toast), E0-E3
  - Scope: re-skin completo del check-in + primitiva SuccessWave. · Verificación: paridad con web md; confetti/wave en device.
- [ ] **E1-07** · [VISUAL][S] Re-skin Historial a Card/ListRow DS + reveal opcional
  - Fuentes: G05-T3 · Deps: E0-E3
  - Scope: lista de historial en DS. · Verificación: paridad visual.
- [ ] **E1-08** · [VISUAL][S] Completar Perfil (stats grid + fila Historial + card baja de cuenta)
  - Fuentes: G05-T4 · Deps: datos streak/totalWorkouts
  - Scope: grid de stats, acceso a Historial, card de baja. · Verificación: perfil con las mismas secciones que web.
- [ ] **E1-09** · [VISUAL][M] Re-skin Ejercicios / "Aprender" + FeaturedExerciseCard
  - Fuentes: G05-T5 · Deps: E0-E3
  - Scope: catálogo "Aprender" en DS + card destacada. · Verificación: paridad visual con web md.
- [ ] **E1-10** · [VISUAL][M] Login alumno brandeado (hero de marca + botón "Entrar a {brand}" + theming)
  - Fuentes: G02-A4 · Deps: E1-14 (branding.ts)
  - Scope: logo + brand_name + welcome_message; matar wordmark hex hardcodeado del index/selector de rol. · Verificación: login del coach muestra su marca (GRANT anon de E0-B1).
- [ ] **E1-11** · [VISUAL][S] Onboarding wizard 3 pasos (barra segmentada + AnimatePresence)
  - Fuentes: G02-A5 · Deps: ninguna
  - Scope: wizard visual de 3 pasos. · Verificación: transición segmentada en device.
- [ ] **E1-12** · [FUNCIONAL][S] Onboarding: draft en storage + checkbox de términos/privacidad
  - Fuentes: G02-B3 · Deps: E1-11
  - Scope: persistir draft + aceptación de términos. · Verificación: cerrar/reabrir conserva el draft; términos obligatorios.
- [ ] **E1-13** · [VISUAL][S] Suspended / change-pwd / forgot / reset pulido DS + fix typo "contraseña" + TopBar sin Montserrat
  - Fuentes: G02-A6 · Deps: ninguna
  - Scope: pulido DS de las pantallas de auth secundarias. · Verificación: sin Montserrat; typo corregido.
- [ ] **E1-14** · [SEAM][S] Ampliar `branding.ts` (welcome_message, tier, layout, colores)
  - Fuentes: G02-B1 · Deps: E0-B1 (GRANT anon)
  - Scope: expandir la lectura de branding del alumno. · Verificación: campos nuevos llegan al cliente vía anon.
- [ ] **E1-15** · [FUNCIONAL][S] Gate Pro+ del branding del login (`isBrandingAllowed`)
  - Fuentes: G02-B2 · Deps: E1-14
  - Scope: solo coaches Pro+ muestran branding en login. · Verificación: coach free cae a marca EVA.
- [ ] **E1-16** · [FUNCIONAL][S] Suspended team-aware + CTA WhatsApp
  - Fuentes: G02-B5 · Deps: E1-14 (o extensión perfil); dato de team de E7-01
  - Scope: pantalla suspended consciente de team + CTA WhatsApp. · Verificación: alumno de team ve el contacto correcto.
- [ ] **E1-17** · [FUNCIONAL][S] Login: validación de workspace/coach (email pertenece al coach)
  - Fuentes: G02-B6 · Deps: ninguna
  - Scope: validar que el email pertenece al coach del workspace. · Verificación: email ajeno rechazado con mensaje claro.
- [ ] **E1-18** · [FUNCIONAL][S] Limpieza autoritativa de `force_password_change` (endpoint service-role)
  - Fuentes: G02-B7 · Deps: backend
  - Scope: endpoint service-role que limpia el flag. · Verificación: tras cambio de contraseña el flag queda en false server-side.
- [ ] **E1-19** · [FUNCIONAL][M] Días pendientes de la semana en home (CTA "Recuperar Día X")
  - Fuentes: G03-C1 · Deps: E1-02
  - Scope: CTA de recuperación de días pendientes en el home (seam con ejecutor E2). · Verificación: días pendientes correctos vs web; CTA lanza la sesión.
- [ ] **E1-20** · [VISUAL][S] Pantalla `(auth)/verify-email` RN `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN huérfanas, dueño E1) · Deps: E0-E3
  - Scope: crear en RN la pantalla de verificación de email del grupo `(auth)` compartido. · Verificación: flujo de verificación abre y confirma.
- [ ] **E1-21** · [VISUAL][M] Arranque brandeado: splash EVA → splash/loader brandeado del coach → app `[NUEVO-CEO]`
  - Fuentes: NEW (CEO 2026-07-08; SPEC Goal 6) · Deps: E1-14
  - Scope: `expo-splash-screen` con `preventAutoHideAsync` hasta resolver el brand del último coach conocido/sesión (`@eva/brand-kit`); transición splash nativo EVA → pantalla brandeada (logo + color, paridad con splash PWA per-coach) sin flash genérico; fallback EVA si no hay coach conocido. · Verificación: video de arranque en device (frío y con sesión) sin flash blanco; branding correcto por coach seed.
- [ ] **E1-22** · [FUNCIONAL/VISUAL][M] Onboarding walkthrough pre-login (carrusel 3-5 slides, primer arranque) `[NUEVO-CEO]`
  - Fuentes: NEW (CEO 2026-07-08; SPEC Goal 7) · Deps: E0-E (primitivas), contenido de slides aprobado por CEO
  - Scope: carrusel EVA DS al primer arranque ANTES de login (flag AsyncStorage "seen"), skippeable, paginación con píldora, bypass total si se entra por deep link `/c/`/`/invite/`; propuesta de contenido: qué es EVA → entrena → nutrición/check-in → empieza con tu código. · Verificación: se muestra solo 1 vez, skip funciona, deep link salta directo al destino en device.

**Gate E1:** typecheck + vitest verdes · `expo export` android · smoke Maestro (core + login/onboarding alumno) · QA CEO device · checklist paridad de las pantallas alumno migradas (screenshots web md vs RN) · release/OTA según PLAN.

## E2 — Ejecutor alumno (reemplazo completo, visual + funcional)

Rewrite del monolito `workout/[planId].tsx` (~934L, paleta propia) a ~15 componentes DS sobre `@eva/workout-engine` (E0-F1). Pantalla de alto riesgo → flag remoto (E0-G4).

### E2.A — Core fuerza

- [ ] **E2-01** · [FUNCIONAL][M] Keypad numérico tipado RPE/RIR + flujo peso→reps→(RPE/RIR)
  - Fuentes: G03-B1 · Deps: E0-F1
  - Scope: keypad custom RN con flujo tipado. · Verificación: entrada numérica y validación RPE/RIR en device.
- [ ] **E2-02** · [FUNCIONAL][M] EffortScale / ScaleDots RN + chips de incremento de peso
  - Fuentes: G03-B2 · Deps: E2-01
  - Scope: escala de esfuerzo + chips de incremento. · Verificación: paridad con web.
- [ ] **E2-03** · [FUNCIONAL][L] Resiliencia de sesión (draft/snapshot + recuperación + cap 4h + duración)
  - Fuentes: G03-B3 · Deps: E0-F1
  - Scope: drafts/snapshot/optimistic (resiliencia PR #113), duración + cap 4h. · Verificación: cerrar la app a mitad de set recupera progreso; sesión >4h capada.
- [ ] **E2-04** · [FUNCIONAL][L] Modo Paso a paso (StepperExecution + toggle Lista/Pasos)
  - Fuentes: G03-B4 · Deps: E0-F1, E2-08
  - Scope: modo paso-a-paso con toggle. · Verificación: paridad de navegación con web.
- [ ] **E2-05** · [FUNCIONAL][M] Sustitución de ejercicio (SubstituteExerciseSheet + columnas log)
  - Fuentes: G03-B5 · Deps: E0-F1, E0-B1 (GRANTs columnas sustitución)
  - Scope: sheet de sustitución + columnas de log de máquina. · Verificación: sustitución persiste; sin 42501.
- [ ] **E2-06** · [VISUAL][S] Migrar ejecución (planId/RestTimer/SummaryModal) a tokens DS
  - Fuentes: G03-A1 · Deps: E0-D (theming)
  - Scope: reemplazar hex/fuentes literales por tokens DS. · Verificación: sin literales de color/fuente legacy.
- [ ] **E2-07** · [VISUAL][M] Re-skin BlockCard → SingleExerciseCard (dots, chip sobrecarga, cue técnica)
  - Fuentes: G03-A2 · Deps: E2-06
  - Scope: forma de SingleExerciseCard con dots + chip de sobrecarga + cue. · Verificación: paridad con web md.
- [ ] **E2-08** · [VISUAL][S] Header de ejecución: "Ejercicio X de Y · volumen · tiempo" + barra DS
  - Fuentes: G03-A3 · Deps: E2-06
  - Scope: header + barra de progreso DS. · Verificación: métricas coinciden con web.

### E2.B — Polimórfico

- [ ] **E2-09** · [FUNCIONAL][L] Timers polimórficos (Hold/Interval/Stopwatch + Provider + Settings + RestTimer protagonista)
  - Fuentes: G03-B6 · Deps: E0-F1
  - Scope: timers + provider + settings; descanso + celebraciones + audio (Fase M), háptica + wake-lock (Fase S). · Verificación: cada tipo de timer funciona; audio/háptica en device.
- [ ] **E2-10** · [FUNCIONAL][XL] Ejecución polimórfica cardio/mobility/roller (query tipada + TypedTargetGrid)
  - Fuentes: G03-B7 · Deps: E0-F1, E2-09
  - Scope: tipos cardio/mobility/roller con TypedTargetGrid. · Verificación: cada tipo se ejecuta y loguea correcto.
- [ ] **E2-11** · [FUNCIONAL][L] HR zones cardio (entitlement + `@eva/cardio` + endpoint + zonas FC)
  - Fuentes: G03-B8 · Deps: E0-C1 (gate), E0-F2, E2-10
  - Scope: zonas HR vía `@eva/cardio`, gated por módulo cardio. · Verificación: alumno sin módulo no ve zonas ni por API.
- [ ] **E2-12** · [FUNCIONAL][S] Superseries end-to-end (consumiendo `workout-block-grouping` compartido)
  - Fuentes: G03-B11 · Deps: E0-F1
  - Scope: superseries robustas sobre el grouping del engine. · Verificación: agrupación idéntica a web.
- [ ] **E2-13** · [FUNCIONAL][S] Áreas custom en ejecución (`workout-areas` + fetch)
  - Fuentes: G03-B12 · Deps: E0-F1
  - Scope: leer áreas en ejecución. · Verificación: áreas custom se muestran agrupadas.
- [ ] **E2-14** · [FUNCIONAL][S] Técnica video INLINE en modal
  - Fuentes: G03-B13 · Deps: E0-E12, E2-07
  - Scope: video de técnica inline (player compartido). · Verificación: reproduce YouTube/mp4 sin salir de la app.
- [ ] **E2-15** · [FUNCIONAL][M] WorkoutSummary a paridad (PR guard + mapa muscular SVG + conteo polimórfico + next hint)
  - Fuentes: G03-B9 · Deps: E0-F1, E2-05, E2-10
  - Scope: MuscleMapSvg + resumen con conteo polimórfico. · Verificación: resumen coincide con web para la misma sesión.

### E2.C — Periferia

- [ ] **E2-16** · [FUNCIONAL][M] Share-cards de workout branded (PR/progreso/racha/resumen)
  - Fuentes: G03-B10 · Deps: E0-E11 (ShareCard motor), E2-15
  - Scope: share-cards tras finalizar rutina (canvas nativo). · Verificación: exporta imagen branded correcta.
- [ ] **E2-17** · [FUNCIONAL][S] "Última vez" tap-to-autofill + "Supera tu marca" inline
  - Fuentes: G03-B14 · Deps: E2-07
  - Scope: autofill de último registro + hint de superación. · Verificación: autofill correcto por ejercicio.
- [ ] **E2-18** · [FUNCIONAL][M] Check-in P0 post-workout + banner de umbrales `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E2.C; seam con E4) · Deps: E2-15
  - Scope: disparo de check-in P0 al terminar + banner de umbrales. · Verificación: umbrales disparan el banner igual que web.

**Gate E2:** typecheck + vitest (workout-engine) verdes · `expo export` android · smoke Maestro (core + ejecutar workout polimórfico) · QA CEO device (fuerza + cardio/mobility) · checklist paridad ejecutor · flag remoto verificado (apagable) · release/OTA.

## E3 — Coach visual (re-skin de lo que EXISTE en mobile)

Builder + program-builder = **SOLO re-skin visual con passthrough** (E0-F3); la reconstrucción funcional es E5 (doble toque declarado en riesgos SPEC).

- [ ] **E3-01** · [VISUAL][S] Re-skin home.tsx error/loading states (quitar Montserrat → tokens DS)
  - Fuentes: G06-A1 · Deps: E0-D
  - Scope: estados de error/loading del dashboard en DS. · Verificación: sin Montserrat.
- [ ] **E3-02** · [VISUAL][M] Header dashboard coach (Insights sheet + campana badge + brand tile + switcher visual)
  - Fuentes: G06-A2 · Deps: E0-E4
  - Scope: PulseHero, PriorityCard+NextStepInset, AgendaCard, NewsFeed, banners billing (parte visual). · Verificación: paridad con web md.
- [ ] **E3-03** · [VISUAL][L] Re-skin completo de clientes.tsx (directorio) patrón B → A + empty-states
  - Fuentes: G06-A3 · Deps: E0-E (primitivas)
  - Scope: `clientes.tsx` (~1224L): War Room, DirectoryActionBar, DirRowCard, FAB; NO heredar crash 0-alumnos. · Verificación: empty-state sin crash; paridad visual.
- [ ] **E3-04** · [VISUAL][M] Re-skin shell de ficha [clientId] + ClientHero (tokens + glow)
  - Fuentes: G06-A4 · Deps: E0-E8 (glow)
  - Scope: shell + ClientProfileHero + pills sticky + FloatingActions. · Verificación: paridad con web md.
- [ ] **E3-05** · [VISUAL][S] ClientHero: 4 chips fijos 2×2 con mini-barra en Adherencia
  - Fuentes: G06-A5 · Deps: E3-04
  - Scope: alinear a 4 chips 2×2. · Verificación: layout idéntico a web.
- [ ] **E3-06** · [VISUAL][M] Re-skin de los tab-panels de ficha a DS
  - Fuentes: G06-A6 · Deps: E3-04
  - Scope: auditar y re-skinear los tab-panels (contenido). · Verificación: cada panel en DS.
- [ ] **E3-07** · [VISUAL][S] Chrome de tabs ficha: 5 tabs con nombres web (ruling D2)
  - Fuentes: G06-A7 · Deps: E3-04
  - Scope: Resumen/Progreso/Entreno/Programa/Nutrición (sin Facturación). · Verificación: 5 tabs con nombres web.
- [ ] **E3-08** · [SEAM][M] Extraer `profile-analytics` → `@eva/profile-analytics`
  - Fuentes: G06-B1 · Deps: leer las 3 fuentes web ANTES (logs anidados vs planos)
  - Scope: selectores de analytics de ficha; fijar la firma; matar la copia manual mobile. · Verificación: web verde; mismos números web/app.
- [ ] **E3-09** · [SEAM][S] Compartir `deriveClientStatus` + `getProfileTopAlert`
  - Fuentes: G06-B9 · Deps: E3-08
  - Scope: extraer los derivadores de estado/alerta. · Verificación: estado y alerta idénticos web/app.
- [ ] **E3-10** · [VISUAL][S] Re-skin ejercicios.tsx a paridad fina EVA DS + toggle "Con video"
  - Fuentes: G07-A1 · Deps: ninguna
  - Scope: re-skin + toggle "Con video". · Verificación: paridad visual.
- [ ] **E3-11** · [VISUAL][M] Re-skin ExerciseFormSheet + ExercisePreviewSheet a patrón A
  - Fuentes: G07-A2 · Deps: E3-10
  - Scope: sheets de ejercicio en DS. · Verificación: paridad con web.
- [ ] **E3-12** · [VISUAL][L] Re-skin program-builder.tsx (manteniendo modelo legacy) patrón B → A
  - Fuentes: G07-A3 · Deps: E0-F3 (passthrough)
  - Scope: re-skin visual con passthrough (~1234L); NO reconstrucción funcional. · Verificación: guardar no destruye campos (round-trip test de E0-F3).
- [ ] **E3-13** · [VISUAL][M] Re-skin BuilderBlockCard + BlockEditorSheet (fuerza) + SeriesStepper 44px
  - Fuentes: G07-A4 · Deps: E3-12
  - Scope: re-skin de tarjeta de bloque + editor fuerza + stepper 44px. · Verificación: paridad visual + toques 44px.
- [ ] **E3-14** · [VISUAL][M] Re-skin sheets de programa (Config/Phases/Preview/Template/MuscleBalance/Assign/Onboarding)
  - Fuentes: G07-A5 · Deps: E3-12
  - Scope: re-skin de los sheets del programa. · Verificación: cada sheet en DS.
- [ ] **E3-15** · [VISUAL][M] Re-skin builder.tsx (lista de programas) a EVA DS
  - Fuentes: G07-A6 · Deps: ninguna
  - Scope: lista de programas en DS. · Verificación: paridad visual.
- [ ] **E3-16** · [VISUAL][M] Re-skin hub de Nutrición (tabs+conteos, cards ricas, board sync/custom, buscador+filtros)
  - Fuentes: G08-A1 (dueño), G10-T8 · Deps: E0-E1, E0-E2
  - Scope: re-skin base del hub de nutrición coach (prerequisito de exchanges E6). · Verificación: paridad con web md.
- [ ] **E3-17** · [VISUAL][M] Re-skin builder de nutrición (TopBar, Cards, banner DS, purgar hardcoded)
  - Fuentes: G08-A2 · Deps: E0-E
  - Scope: re-skin del builder de nutrición. · Verificación: sin colores hardcodeados.
- [ ] **E3-18** · [VISUAL][S] Re-skin check-ins coach (Card DS + quitar Montserrat + estrellas energía + fecha relativa + visor foto)
  - Fuentes: G08-A3 · Deps: E0-E3
  - Scope: re-skin de la lista de check-ins coach. · Verificación: paridad visual.
- [ ] **E3-19** · [VISUAL][S] Re-skin foods.tsx o fusionarlo como tab embebido del hub (FoodLibrary)
  - Fuentes: G08-A4 · Deps: decisión de arquitectura (E3-16)
  - Scope: FoodLibrary en DS. · Verificación: paridad visual.
- [ ] **E3-20** · [VISUAL][S] Re-skin Suscripción display (subscription.tsx patrón B → DS)
  - Fuentes: G09-T1 · Deps: E0-E (primitivas)
  - Scope: re-skin del display actual de suscripción. · Verificación: paridad visual.
- [ ] **E3-21** · [VISUAL][M] Re-skin Mi Marca / brand studio (settings.tsx ~554L, patrón B → A)
  - Fuentes: G09-T2 · Deps: E0-E2 (Switch DS)
  - Scope: re-skin a patrón A; NO reimplementar Switch (usa E0-E2). · Verificación: paridad con web md.
- [ ] **E3-22** · [VISUAL][M] Re-skin auth COACH (login/register radio-cards "Tu plan") `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN huérfanas, dueño E3) · Deps: E0-E3, E0-E6
  - Scope: re-skin del grupo `(auth)` coach (radio-cards de plan). · Verificación: paridad con web md.

**Gate E3:** typecheck + vitest (profile-analytics) verdes · `expo export` android · smoke Maestro (core + login coach) · QA CEO device · checklist paridad de pantallas coach re-skineadas · round-trip test builder verde · release/OTA.

## E4 — Alumno funcional (nutrición overhaul + periferia)

Cuello de botella: endpoints web nuevos (notas, shopping, off-plan, micros, recap) — hacer PRIMERO. Gating por sección **fail-open EXACTO** al de web.

- [ ] **E4-01** · [VISUAL][S] Header nutrición + glow de marca; purgar `theme.*` del shell
  - Fuentes: G04-A1 (dueño), G10-T7 · Deps: E0-D, E0-E8
  - Scope: re-skin base del shell de nutrición alumno a patrón A puro. · Verificación: sin `theme.*`; glow correcto.
- [ ] **E4-02** · [VISUAL][S] Purgar Montserrat + hex fijos en nutricion.tsx → tokens/fuentes DS
  - Fuentes: G04-A2 · Deps: E4-01
  - Scope: purga tipográfica/color. · Verificación: grep sin Montserrat/hex.
- [ ] **E4-03** · [VISUAL][M] Re-skin MealCardExpandable a fidelidad MealCard (círculo 44px, tokens)
  - Fuentes: G04-A3 · Deps: E4-02
  - Scope: re-skin de la card de comida. · Verificación: paridad con web md.
- [ ] **E4-04** · [VISUAL][S] DayNavigator (swipe/dots) + banners DS + banner "comidas filtradas"
  - Fuentes: G04-A4 · Deps: E4-01
  - Scope: navegación de día + banners. · Verificación: swipe/dots en device.
- [ ] **E4-05** · [VISUAL][S] Verificar/re-skin MacroRingSummary + AdherenceStrip + NutritionStreakBanner
  - Fuentes: G04-A5 · Deps: E4-02
  - Scope: re-skin de resúmenes de macros/adherencia. · Verificación: paridad visual.
- [ ] **E4-06** · [SEAM][S] Reemplazar loop de racha/adherencia por `computeNutritionAdherence`
  - Fuentes: G04-B2 · Deps: E0-A1
  - Scope: usar el motor único de adherencia. · Verificación: racha idéntica web/app.
- [ ] **E4-07** · [FUNCIONAL][L] Módulo exchanges/equivalencias alumno (Nutrición Pro por-alumno, gated)
  - Fuentes: G04-B4 (dueño), G10-T16 · Deps: E0-A1, E0-C1, E6-06 (cableado exchanges)
  - Scope: chips exchanges/equivalencias gated `nutrition_exchanges`; vista en porciones. · Verificación: sin el módulo no aparece; con módulo cablea a `/api/mobile/nutrition/exchanges/*`.
- [ ] **E4-08** · [FUNCIONAL][M] Swaps de alimento interactivos + favoritos (recálculo de macros)
  - Fuentes: G04-B5 · Deps: E0-A1, E4-03
  - Scope: swaps aplicables + favoritos. · Verificación: recálculo de macros correcto tras swap.
- [ ] **E4-09** · [FUNCIONAL][M] Panel de micros (base + avanzados Pro) con topes del coach
  - Fuentes: G04-B6 · Deps: E0-A1, E0-C1, endpoint micros
  - Scope: panel de micronutrientes con topes. · Verificación: micros base sin gate; avanzados solo Pro.
- [ ] **E4-10** · [FUNCIONAL][S] Plato visual (PlatePanel / proporción)
  - Fuentes: G04-B7 · Deps: E0-A1
  - Scope: plato visual de proporciones. · Verificación: proporción coincide con macros del día.
- [ ] **E4-11** · [FUNCIONAL][M] Off-plan logger (quick-add + recientes, día de hoy)
  - Fuentes: G04-B8 · Deps: endpoint intake
  - Scope: registro off-plan con recientes. · Verificación: log off-plan persiste y suma al día.
- [ ] **E4-12** · [FUNCIONAL][M] Notas coach ⇄ alumno (NotesThread)
  - Fuentes: G04-B9 · Deps: endpoint notas
  - Scope: hilo de notas bidireccional. · Verificación: mensajes van y vuelven.
- [ ] **E4-13** · [FUNCIONAL][M] Lista de compras (por pasillo, marcar, agregar, compartir)
  - Fuentes: G04-B10 · Deps: endpoint shopping
  - Scope: lista de compras completa. · Verificación: marcar/agregar persiste; compartir funciona.
- [ ] **E4-14** · [FUNCIONAL][S] Weekly recap card
  - Fuentes: G04-B11 · Deps: recap engine/endpoint
  - Scope: card de recap semanal. · Verificación: números del recap coinciden con web.
- [ ] **E4-15** · [FUNCIONAL][S] Recetas-idea asignadas
  - Fuentes: G04-B12 · Deps: query recetas
  - Scope: RecipeIdeas asignadas al alumno. · Verificación: recetas correctas por alumno.
- [ ] **E4-16** · [FUNCIONAL][M] Export día: PDF branded (expo-print) + Copiar detalle/WhatsApp con macros
  - Fuentes: G04-B13 · Deps: E0-A1
  - Scope: PDF del día (mismo patrón que ruling D6) + copiar/compartir. · Verificación: PDF con macros correctas.
- [ ] **E4-17** · [FUNCIONAL][S] Pulido: porción "Plan completo" + confetti día-completo + PushBanner + medidas caseras + HabitsTracker
  - Fuentes: G04-B14 · Deps: E4-03, E0-A1
  - Scope: pulidos varios; HabitsTracker vive en Dashboard (ruling D4, E1-02), no en Nutrición. · Verificación: confetti al completar; medidas caseras "120 g (1 taza)".
- [ ] **E4-18** · [FUNCIONAL][S] Check-in: prefill peso/energía + limpiar badge nativo
  - Fuentes: G05-T6 · Deps: E1-06, E4-22 (badge)
  - Scope: prefill + `setBadgeCountAsync(0)`. · Verificación: badge se limpia al abrir check-in.
- [ ] **E4-19** · [FUNCIONAL][M] Perfil: preferencia "Alarma de descanso" (AsyncStorage + preview)
  - Fuentes: G05-T7 · Deps: E1-08
  - Scope: preferencia de alarma de descanso con preview. · Verificación: preferencia persiste y suena en preview.
- [ ] **E4-20** · [FUNCIONAL][L] Ejercicios: paginación server + instrucciones on-demand + video + deep-link
  - Fuentes: G05-T12 · Deps: E1-09, E0-E12
  - Scope: catálogo "Aprender" funcional. · Verificación: paginación server; video inline; deep-link abre ejercicio.
- [ ] **E4-21** · [FUNCIONAL][L] Share-cards v2 desde perfil (Progreso/Racha/Resumen mensual branded)
  - Fuentes: G05-T13 · Deps: E0-E11, E1-08
  - Scope: share-cards desde perfil (motor compartido). · Verificación: exporta imágenes branded correctas.
- [ ] **E4-22** · [FUNCIONAL][S] Badge numérico nativo (`setBadgeCountAsync`) (P2)
  - Fuentes: G11-B2 · Deps: ninguna
  - Scope: mecanismo de badge nativo (UNA vez; lo consume E4-18). · Verificación: badge refleja el conteo.
- [ ] **E4-23** · [SEAM][L] Cola offline generalizada + idempotencia por `client_log_id`
  - Fuentes: G11-C1 · Deps: E0-F1 (reconcile puro del engine)
  - Scope: cola offline alineada con optimistic+reconcile web. · Verificación: doble envío con mismo `client_log_id` no duplica; sync tras reconexión.

**Gate E4:** typecheck + vitest verdes · endpoints web nuevos verdes (typecheck+vitest+build) · `expo export` android · smoke Maestro (core + completar comida + off-plan) · QA CEO device · checklist paridad nutrición alumno · release/OTA.

## E5 — Coach funcional core

Reconstrucción funcional del builder (≠ re-skin E3). Batch EAS de la etapa: Google Sign-In coach.

- [ ] **E5-01** · [SEAM][L] Extraer `builderReducer` + tipos → `@eva/plan-builder` (importa grouping/areas de workout-engine)
  - Fuentes: G07-B1 · Deps: E0-F1 (workout-engine dueño de grouping/areas)
  - Scope: `builderReducer` puro + tipos; NO duplica grouping/areas (los importa de `@eva/workout-engine`). · Verificación: web verde consumiendo el package.
- [ ] **E5-02** · [SEAM][M] Mobile adopta `@eva/plan-builder` (borra fork reducer/types)
  - Fuentes: G07-B2 · Deps: E5-01
  - Scope: reemplazar el fork local por el package. · Verificación: sin reducer/types locales; typecheck mobile verde.
- [ ] **E5-03** · [FUNCIONAL][M] Cargar `areas: WorkoutArea[]` en el builder mobile
  - Fuentes: G07-C1 · Deps: E5-02
  - Scope: fetch de áreas dinámicas. · Verificación: áreas cargan correcto.
- [ ] **E5-04** · [FUNCIONAL][L] Reemplazar agrupación 3 secciones por ÁREAS (AreaDropZone + buildAreaVMs + draggable-flatlist)
  - Fuentes: G07-C2 · Deps: E5-03
  - Scope: áreas dinámicas con drag-to-area. · Verificación: drag entre áreas persiste `section_template_id`.
- [ ] **E5-05** · [FUNCIONAL][L] Reconstruir BlockEditorSheet como editor polimórfico (strength/cardio/mobility/roller)
  - Fuentes: G07-C3 · Deps: E5-02, E0-C1 (gate cardio), E0-F2
  - Scope: bloques polimórficos typed (duration/distance/pace/HR/interval/side_mode/load); paridad web (1009L vs mobile 272L). · Verificación: cada tipo edita y guarda correcto; cardio gated.
- [ ] **E5-06** · [FUNCIONAL][M] Chip resumen typed en BuilderBlockCard (typedBlockSummary + icono + "Incompleto")
  - Fuentes: G07-C4 · Deps: E5-05
  - Scope: chip de resumen por tipo. · Verificación: resumen e "Incompleto" correctos.
- [ ] **E5-07** · [FUNCIONAL][M] Validación de guardado por TIPO + serialización `effectiveAreaKey` + conflicto `expectedUpdatedAt`
  - Fuentes: G07-C5 · Deps: E5-05
  - Scope: validación typed + conflicto de versión. · Verificación: guardado con `expectedUpdatedAt` desactualizado rechaza; round-trip test verde.
- [ ] **E5-08** · [FUNCIONAL][S] Añadir `exercise_type` (EXERCISE_TYPE_OPTIONS) al ExerciseFormSheet
  - Fuentes: G07-D1 · Deps: E5-01 (tipos)
  - Scope: campo de tipo de ejercicio. · Verificación: tipo persiste.
- [ ] **E5-09** · [FUNCIONAL][M] Recorte de video (start/end) + reproducción INLINE con recorte
  - Fuentes: G07-D2 · Deps: E3-11, E0-E12
  - Scope: trim de video + inline con recorte (si viable). · Verificación: recorte se aplica en reproducción.
- [ ] **E5-10** · [FUNCIONAL][S] Alinear gate de creación de ejercicios con regla workspace (no por tier) (ruling D1)
  - Fuentes: G07-D3 · Deps: E0-C1
  - Scope: gate por workspace (regla web). · Verificación: gate coincide con web.
- [ ] **E5-11** · [FUNCIONAL][S] Cablear historial del ejercicio en el editor de bloque
  - Fuentes: G07-D4 · Deps: E5-05
  - Scope: historial del ejercicio en el editor. · Verificación: historial correcto por ejercicio.
- [ ] **E5-12** · [FUNCIONAL][M] Editores de ficha: biometría (altura/sexo/peso inicial) + goal weight con línea objetivo
  - Fuentes: G06-B5 · Deps: E3-06, E0-B1 (GRANTs)
  - Scope: write-paths de biometría + goal weight. · Verificación: sin 42501; línea objetivo en el chart.
- [ ] **E5-13** · [FUNCIONAL][M] Export dossier PDF (portar buildClientDossier o formalizar progress-pdf; spike D6)
  - Fuentes: G06-B6 · Deps: E3-06
  - Scope: spike expo-print/share nativo; si fidelidad insuficiente → link-out web documentado (ruling D6). · Verificación: dossier con fotos o link-out funcional.
- [ ] **E5-14** · [FUNCIONAL][M] Import wizard de clientes multi-paso (mapeo columnas + preview + confirm + tier-gate)
  - Fuentes: G06-B7 · Deps: E3-03
  - Scope: wizard 4 pasos (parser ya portado, sin UI). · Verificación: import mapea/previsualiza/confirma; tier-gate aplica.
- [ ] **E5-15** · [FUNCIONAL][S] Alinear forma MobileDashboardData vs DashboardV2Data (bridge si hace falta)
  - Fuentes: G06-B10 · Deps: ninguna
  - Scope: verificar/alinear la shape del dashboard V2. · Verificación: dashboard coach con datos V2 correctos.
- [ ] **E5-16** · [FUNCIONAL][S] Check-ins: firmar/mostrar `side_photo_url` + "Marcar como revisado" (toggle + badge/filtro)
  - Fuentes: G08-B3 · Deps: E3-18
  - Scope: snapshot en ficha con 3 fotos (side incluida — hoy se pierde) + toggle revisado optimista. · Verificación: 3 fotos visibles; toggle persiste.
- [ ] **E5-17** · [FUNCIONAL][S] Builder: surface de alérgenos/intolerancias/disgustos en FoodSearchSheet (bloqueante)
  - Fuentes: G08-B4 · Deps: E3-17
  - Scope: alérgenos/intolerancias visibles y bloqueantes (correctness). · Verificación: alimento con alérgeno bloquea/advierte.
- [ ] **E5-18** · [FUNCIONAL][M] Pantalla Grupos de comidas + acción "guardar comida como grupo"
  - Fuentes: G08-C3 · Deps: E3-17
  - Scope: meal-groups + guardar como grupo. · Verificación: grupo se crea y reutiliza.
- [ ] **E5-19** · [FUNCIONAL][M] Tab/pantalla Recetas (RecipeLibrary, crear/asignar/editar)
  - Fuentes: G08-C4 · Deps: E3-16
  - Scope: librería de recetas coach. · Verificación: crear/asignar/editar receta funciona.
- [ ] **E5-20** · [FUNCIONAL][S] Panel Pro "objetivos por composición corporal" (goals_bodycomp)
  - Fuentes: G08-C6 · Deps: E0-C1
  - Scope: targets de nutrición por composición (gated Pro). · Verificación: solo visible con entitlement.
- [ ] **E5-21** · [FUNCIONAL][S] Medidas caseras completas (household_grams/label) en custom-food-form + cálculo
  - Fuentes: G08-C7 · Deps: E0-A1
  - Scope: medidas caseras en food custom. · Verificación: cálculo de gramos por medida correcto.
- [ ] **E5-22** · [FUNCIONAL][M] Google Sign-In coach nativo (signInWithIdToken + client IDs) (P1)
  - Fuentes: G11-B1 · Deps: build EAS nuevo (batch de la etapa)
  - Scope: SDK nativo + `signInWithIdToken` (NO iframe GIS). · Verificación: login Google coach funciona en device.
- [ ] **E5-23** · [FUNCIONAL][M] `coach/onboarding` + `complete` (port del intake post-registro) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN huérfanas, dueño E5) · Deps: E0-E6
  - Scope: portar el intake post-registro del coach. · Verificación: onboarding coach completa y persiste.

**Gate E5:** typecheck + vitest (plan-builder) verdes · web verde tras seams · `expo export` android · smoke Maestro (core + crear/editar programa) · QA CEO device · checklist paridad builder/ficha/nutrición coach · round-trip test builder verde · release/OTA.

## E6 — Módulos de pago (todo gated por E0.C)

Empty-states en TODO (bug web 0-alumnos NO se hereda). Charts: victory-native/Skia con tokens `--viz-*`. Vistas alumno gated con RLS confirmada (E0-B1).

- [ ] **E6-01** · [SEAM][M] Extraer `domain/bodycomp` (12 archivos) → `@eva/bodycomp`
  - Fuentes: G10-T2 · Deps: ninguna
  - Scope: BIA + ISAK; confirmar portabilidad client-side (`@eva/schemas/bodycomp`, marcados SERVER-ONLY). · Verificación: web verde; lo que sea server-only queda tras endpoint.
- [ ] **E6-02** · [FUNCIONAL][M] `coach/tools` hub (launcher de módulos + picker de alumno) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN huérfanas, dueño E6) · Deps: E0-C1
  - Scope: launcher de módulos + selector de alumno (puerta a los módulos). · Verificación: solo módulos entitled aparecen.
- [ ] **E6-03** · [FUNCIONAL][L] Cardio: hub (SegmentedTabs Zonas/Pace/Plantillas) + perfil del alumno + empty-state
  - Fuentes: G10-T10 · Deps: E0-F2, E0-C1, E0-C2
  - Scope: calculadora de zonas, plantillas de intervalos, perfil por cliente (`@eva/cardio`). · Verificación: sin módulo no accede; empty-state 0-alumnos.
- [ ] **E6-04** · [FUNCIONAL][XL] Movement assessment coach (hub risk-band + wizard 7 patrones + reporte + evolución)
  - Fuentes: G10-T11 (vista alumno → E6-08) · Deps: E0-C1, E0-C2
  - Scope: wizard 7 patrones (autosave/resume/consentimiento), reporte + evolución. · Verificación: wizard resume; reporte correcto; gated.
- [ ] **E6-05** · [FUNCIONAL][XL] Body composition coach (BIA ~14 métricas + ISAK 4 pasos ~22 medidas + IsakResultCard + tendencia)
  - Fuentes: G10-T12 (vista alumno → E6-09) · Deps: E6-01, E0-C1, E0-C2
  - Scope: captura BIA/ISAK + paneles de tendencia (`@eva/bodycomp`). · Verificación: captura persiste; trends correctos; gated.
- [ ] **E6-06** · [FUNCIONAL][L] Nutrición Pro exchanges en el builder coach (gramos↔porciones + targets + PDF equivalencias)
  - Fuentes: G10-T15 (dueño), G08-C2 · Deps: E0-C1, E3-17, esquemas
  - Scope: modo intercambios + exchange targets; mutaciones vía endpoint + `assertModule`. · Verificación: sin módulo no muta ni por API; PDF equivalencias correcto.
- [ ] **E6-07** · [FUNCIONAL][L] Sección Módulos en Resumen de ficha (cardio/movement/bodycomp gated)
  - Fuentes: G06-B3 · Deps: E0-C1, E6-03, E6-04, E6-05
  - Scope: entradas gated a los módulos desde la ficha. · Verificación: solo módulos entitled visibles.
- [ ] **E6-08** · [FUNCIONAL][L] Vista Movimiento read-only del alumno (reporte + evolución + disclaimer)
  - Fuentes: G05-T10 (dueño; absorbe la clausula "vista alumno" de G10-T11) · Deps: E0-C1, E0-B1 (RLS)
  - Scope: vista read-only del alumno gated con RLS confirmada. · Verificación: alumno sin módulo no lee ni por PostgREST.
- [ ] **E6-09** · [FUNCIONAL][L] Vista Composición corporal read-only del alumno (BIA/ISAK + trend + disclaimer)
  - Fuentes: G05-T11 (dueño; absorbe la clausula "vista alumno" de G10-T12) · Deps: E6-01, E0-C1, E0-B1 (RLS)
  - Scope: vista read-only alumno (`@eva/bodycomp`). · Verificación: RLS gatea la lectura por módulo/`client_id`.
- [ ] **E6-10** · [FUNCIONAL][L] Pestaña Progreso de ficha con composición corporal (coach, `@eva/bodycomp`)
  - Fuentes: G06-B4 · Deps: E6-01, E0-C1
  - Scope: mover domain/bodycomp a la pestaña Progreso coach. · Verificación: trends coach coinciden con la captura.
- [ ] **E6-11** · [FUNCIONAL][M] Filas de perfil alumno read-only "Movimiento"/"Composición" gated
  - Fuentes: G05-T9 · Deps: E0-C1
  - Scope: entradas gated en el perfil del alumno hacia E6-08/E6-09. · Verificación: filas aparecen solo con entitlement/RLS.
- [ ] **E6-12** · [FUNCIONAL][M] Catálogo de Módulos en settings (cards read-only + CTA + evento)
  - Fuentes: G10-T13 (dueño), G09-T9 · Deps: E0-C1
  - Scope: display de `@eva/module-catalog` + CTA add-on (compra por link-out). · Verificación: display correcto; compra abre navegador externo (Non-Goal IAP).
- [ ] **E6-13** · [FUNCIONAL][S] i18n exchanges (portar dict `es`, solo si se cablea exchanges)
  - Fuentes: G11-D2 · Deps: E6-06
  - Scope: dict `es` de exchanges. · Verificación: strings de exchanges localizadas.

**Gate E6:** typecheck + vitest (cardio/bodycomp) verdes · web verde tras seams (+ fix web crash 0-alumnos, hermana) · `expo export` android · smoke Maestro (core + un módulo gated) · QA CEO device (coach con módulo + alumno read-only + coach sin módulo bloqueado por API) · checklist paridad módulos · release/OTA.

## E7 — Settings hub + team + chrome coach

`getWorkspaceContext` es bloqueante del dominio (sirve a switcher, suspended team-aware, settings, suscripción). El cableado de endpoints mobile no usados (G11-C3: cardio/movement/bodycomp/exchanges en E6; **team en E7-06**) queda distribuido — ver Trazabilidad.

- [ ] **E7-01** · [SEAM/FUNCIONAL][M] `getWorkspaceContext` mobile único (standalone/team/enterprise)
  - Fuentes: G09-T7 · Deps: ninguna dura
  - Scope: contexto de workspace único (bloqueante del dominio). · Verificación: resuelve el contexto correcto por cuenta.
- [ ] **E7-02** · [FUNCIONAL][M] Hub de Opciones (pantalla-índice HubCards + brand studio a ruta hija, context-aware)
  - Fuentes: G09-T3 · Deps: E7-01
  - Scope: hub Opciones como web (HubCards); ruling D5 (switcher cubre `workspace/select`). · Verificación: hub navega a hijas correctas por contexto.
- [ ] **E7-03** · [FUNCIONAL][L] Suscripción display rico (consumir `subscription-status`)
  - Fuentes: G09-T4 · Deps: E7-01, E0-C1
  - Scope: precio compuesto, add-ons + "Cortesía EVA", tarjeta brand+last4, historial; acciones link-out. · Verificación: desglose coincide con web; acciones abren navegador externo.
- [ ] **E7-04** · [FUNCIONAL][M] Funciones (FeaturePrefsPanel: presets + master switch + toggles con lock Pro + resolver visible)
  - Fuentes: G09-T10 (dueño), G10-T14, G08-C5 · Deps: E0-C1, E7-02
  - Scope: panel de Funciones + resolver `visible = ENTITLED AND ENABLED`; aplica a secciones de nutrición. · Verificación: toggle oculta sección; lock Pro donde corresponde.
- [ ] **E7-05** · [FUNCIONAL][S] Áreas del builder (CRUD) + scope team/standalone + lock no-gestor
  - Fuentes: G09-T11 · Deps: E7-01, E7-02
  - Scope: CRUD de áreas con scope + lock. · Verificación: no-gestor no edita; scope correcto.
- [ ] **E7-06** · [FUNCIONAL][L] Mi Equipo / Team completo
  - Fuentes: G09-T12 · Deps: E7-01, E0-C1
  - Scope: hero + rol + stats + ShareLink + BrandStudio + MembersManager + asientos + invite + módulos team (cablea endpoints team — parte de G11-C3). · Verificación: gestión de miembros/asientos/módulos team funciona.
- [ ] **E7-07** · [FUNCIONAL][M] Workspace switcher (bottom-sheet, null si ≤1)
  - Fuentes: G09-T13 · Deps: E7-01
  - Scope: sheet de cambio de workspace (cubre ruling D5). · Verificación: cambia contexto; oculto si ≤1 workspace.
- [ ] **E7-08** · [FUNCIONAL][M] News bell global con unreadCount + bottom-sheet de feed
  - Fuentes: G09-T14 · Deps: ninguna dura
  - Scope: campana viva con conteo + feed. · Verificación: badge y feed correctos.
- [ ] **E7-09** · [SEAM][M] Nav registry compartido (extraer `coach-nav.ts` + `getVisibleNavItems` + tabs Expo + sheet "Más")
  - Fuentes: G09-T15 (dueño), G01-F1.3 · Deps: E7-01, E0-C1
  - Scope: separar dato de `coach-nav.ts` a package; derivar tabs Expo + sheet "Más" (mata `NAV_META`); tabs gated por módulos + tab Reactivar. · Verificación: tabs coinciden con web; gating por módulo.
- [ ] **E7-10** · [VISUAL/FUNCIONAL][M] Mi Marca avanzada (logo oscuro + ThemeGallery + LoginLayoutPicker + BrandAdvanced + glow + loader)
  - Fuentes: G09-T16 · Deps: E3-21, E7-02
  - Scope: features avanzadas del brand studio. · Verificación: cada control persiste y refleja.
- [ ] **E7-11** · [FUNCIONAL][M] Búsqueda global coach (command palette + `/api/coach/search`)
  - Fuentes: G06-B8 · Deps: E0-E9
  - Scope: búsqueda global coach (switcher/news del header cubiertos por E7-07/E7-08). · Verificación: búsqueda devuelve y navega a resultados.
- [ ] **E7-12** · [FUNCIONAL][M] `coach/reactivate` (display + gate estado `cancelled` + link-out) (ruling D7) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN huérfanas, dueño E7) · Deps: E7-01, E7-09 (tab Reactivar)
  - Scope: display in-app + gate de estado `cancelled` en guards de acceso mobile + acción por link-out (patrón pagos). · Verificación: coach cancelado ve reactivate; acción abre navegador externo.

**Gate E7:** typecheck + vitest verdes · `expo export` android · smoke Maestro (core + hub/team/switcher) · QA CEO device (standalone + team) · checklist paridad settings/team/chrome coach · release/OTA.

## E8 — Cierre 1:1 + hardening

- [ ] **E8-01** · [FUNCIONAL][L] Barrido de paridad pantalla-por-pantalla vs checklist (web md vs RN, todos los estados) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E8 / AC SPEC) · Deps: E1–E7 cerradas
  - Scope: misma estructura, estados (loading/empty/error/offline) y gating por pantalla. · Verificación: checklist de paridad completado y firmado en QA de cierre.
- [ ] **E8-02** · [VISUAL][L] Purga de Inter/Montserrat (incremental, finaliza acá; 408 usos/69 archivos)
  - Fuentes: G01-D.1 · Deps: E0-D4, re-skins por etapa
  - Scope: purga final de fuentes legacy (venía bajando por etapa). · Verificación: grep = 0 usos de Inter/Montserrat.
- [ ] **E8-03** · [SEAM][M] Purga final `lib/theme.ts` (objeto legacy) + `db-compat` obsoleto `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E8) · Deps: última pantalla migrada
  - Scope: eliminar el shim `lib/theme.ts` y `db-compat` obsoleto. · Verificación: typecheck mobile verde sin el objeto legacy.
- [ ] **E8-04** · [FUNCIONAL][M] Rendimiento (listas grandes, charts) + accesibilidad básica RN `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E8) · Deps: E1–E7
  - Scope: optimizar listas/charts + a11y básica. · Verificación: sin jank en listas grandes; labels/roles básicos presentes.
- [ ] **E8-05** · [FUNCIONAL][S] Universal links E2E ambos OS (verificación de cierre) `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E8; cierra E0-A3/E0-A4) · Deps: E0-A3, E0-A4
  - Scope: E2E de deep/universal links en Android e iOS. · Verificación: ambos OS abren rutas `/c/`+`/invite/` desde link externo.
- [ ] **E8-06** · [FUNCIONAL][S] Documentación canónica + memoria + regla anti-drift `[NUEVO-PLAN]`
  - Fuentes: NEW (PLAN E8) · Deps: E8-01
  - Scope: actualizar PROJECT_STRUCTURE, FLOWS_AND_COMPONENTS, TEST_STATUS, AGENTS.md mobile + memoria; agregar regla en CLAUDE.md (features web nuevas nacen con tarea espejo mobile). · Verificación: docs actualizadas; regla anti-drift presente.

**Gate E8 (cierre del proyecto):** typecheck + vitest verdes · `expo export` android · smoke Maestro (todos los flujos) · QA CEO final en device (matriz completa) · checklist de paridad firmado · universal links E2E ambos OS · Sentry sin errores nuevos · **release estable a stores**. Desde aquí, toda feature web nueva DEBE nacer con tarea espejo mobile.

---

## Universal Definition of Done (adaptada a mobile)

Toda tarea, además de su verificación específica, debe cumplir antes de mergear:

- [ ] `tsc --noEmit` en `apps/mobile` verde.
- [ ] `vitest` del/los package(s) de dominio tocados verde (web + packages `@eva/*`).
- [ ] **Cero copias de lógica web**: la lógica compartible se consume desde `packages/@eva/*` (workout-engine, plan-builder, cardio, bodycomp, profile-analytics, nutrition-engine); nada re-implementado en `apps/mobile/lib`.
- [ ] Si la tarea abre un **write-path nuevo**: GRANT de columna + RLS confirmados ANTES (cero 42501 en runtime).
- [ ] **Dark mode + safe-area** verificados en device (`h-dvh`/`min-h-dvh`, `pl/pr/pt/pb-safe`).
- [ ] **Paridad visual con web md** contrastada (screenshot lado a lado en `docs/audits/rn-parity-qa/`).
- [ ] **Sin fuentes Inter/Montserrat nuevas** ni tokens mágicos (usar helpers de E0.D).
- [ ] Si la tarea gatea un **módulo pago**: mutaciones vía `/api/mobile/*` con `assertModule`; nunca solo UI.
- [ ] **Sentry** sin errores nuevos en el smoke.
- [ ] Web verde (typecheck + vitest + build) tras cualquier cambio web-side (endpoint, package, migración).

---

## Trazabilidad

**Regla de cobertura:** las 181 tareas del inventario aparecen exactamente una vez, sea como tarea propia (dueña) o absorbida bajo la dueña (listada en su campo `Fuentes:`).

| Métrica | Cantidad |
|---|---|
| Tareas fuente (inventario G01–G11) | 181 |
| Tareas resultantes en este doc | **178** |
| — de ellas, derivadas del inventario | 156 |
| — de ellas, `[NUEVO-PLAN]` (PLAN nombra, inventario no tenía) | 22 |
| Tareas fuente absorbidas por dedup | **25** |

Verificación: 156 derivadas + 25 absorbidas = **181** fuente ✓ · 156 derivadas + 22 nuevas = **178** resultantes ✓.

### Tareas fuente absorbidas (25) — dueña que las contiene

| Fuente absorbida | Absorbida en | Concepto (§ overlap inventario) |
|---|---|---|
| G10-T3 | E0-C1 | Entitlements: paths tsconfig + deps (§2.1) |
| G10-T5 | E0-C1 | Entitlements: wiring `/api/mobile/config` + cache (§2.1) |
| G11-A1 | E0-C1 | Entitlements: adoptar `@eva/*` + Metro + re-export (§2.1) |
| G11-A4 | E0-C1 | Entitlements: hook `useEntitlements` (§2.1) |
| G09-T8 | E0-C1 | Adopción feature-prefs/module-catalog (§2.1) |
| G06-B2 | E0-C1 | Adopción entitlements (§2.1) |
| G05-T8 | E0-C1 | Adopción feature-prefs + getStudentModuleNav (§2.1) |
| G04-B3 | E0-C1 | Adopción feature-prefs (gating secciones/nav) (§2.1) |
| G08-C1 | E0-C1 | Gating de módulos mobile (§2.1) |
| G08-B1 | E0-A1 | Adoptar nutrition-engine (borrar macro-calculator) (§2.11) |
| G10-T6 | E0-A1 | Borrar macro-calculator/nutrition-utils (§2.11) |
| G02-B8 | E0-A4 | Universal links iOS (`associatedDomains`) (§2.21) |
| G05-T1 | E0-E1 | Fundación de toast DS (§2.10) |
| G02-A2 | E1-01 | Hide-on-scroll del nav alumno (§2.13) |
| G02-A3 | E1-01 | Sheet "Más" del nav alumno (§2.13) |
| G03-A4 | E1-01 | Cápsula 1:1 web (transversal) (§2.13) |
| G10-T8 | E3-16 | Re-skin nutrición coach (§2.15) |
| G10-T7 | E4-01 | Re-skin nutrición alumno (§2.15) |
| G10-T16 | E4-07 | Vista alumno exchanges/porciones (§2.18) |
| G09-T9 | E6-12 | Catálogo de Módulos (§2.16) |
| G08-C2 | E6-06 | Modo intercambios builder coach (§2.18) |
| G10-T14 | E7-04 | Modelo Funciones vs Módulos + resolver (§2.17) |
| G08-C5 | E7-04 | Feature-prefs de secciones de nutrición (§2.17) |
| G01-F1.3 | E7-09 | Nav registry declarativo (2 chrome) (§2.14) |
| G11-C3 | E6-03/04/05/06 + E7-06 | Cablear endpoints sin usar — distribuido (cardio/movement/bodycomp/exchanges + team) |

### Dedups resueltos por dependencia (NO absorción — ambas tareas sobreviven)

Estos overlaps del inventario se resuelven con **una dueña + consumidores que dependen de ella**, sin borrar tareas:

- **§2.2 `@eva/cardio`**: dueña E0-F2; consumen E2-11 (HR zones), E5-05 (editor cardio), E6-03.
- **§2.3 `@eva/bodycomp`**: dueña E6-01; consumen E6-05, E6-09, E6-10.
- **§2.4/2.5 grouping/areas**: dueña E0-F1 (`@eva/workout-engine`); `@eva/plan-builder` (E5-01) los importa; consumen E2-12/E2-13, E5-03/E5-04.
- **§2.6 session-logs.reconcile**: dueña E0-F1; consume E4-23 (cola offline) y E2-03 (resiliencia).
- **§2.7 ShareCard motor**: dueña E0-E11; consumen E2-16, E4-21.
- **§2.8 glow de marca**: dueña E0-E8; consumen E1-02, E3-04, E7-10.
- **§2.9 command palette**: dueña E0-E9; consume E7-11.
- **§2.12 Switch DS**: dueña E0-E2; consume E3-21.
- **§2.19 vistas alumno movement/bodycomp**: dueñas E6-08 (movement) y E6-09 (bodycomp); absorben la clausula "vista alumno" de G10-T11/G10-T12 (que siguen como builds coach E6-04/E6-05).
- **§2.20 video inline**: dueña E0-E12; consumen E2-14, E4-20, E5-09.
- **§2.22 badge nativo**: dueña E4-22; consume E4-18.
- **§2.23 reconcileMeals**: dueña E0-A2 (en `@eva/nutrition-engine`); usada por E5-18/propagación coach.

### Tareas `[NUEVO-PLAN]` creadas (22)

Lista completa (22): **E0-A5** (checkins vs check_ins), **E0-B1** (migración aditiva), **E0-B3** (regen types), **E0-D4** (gate tipográfico tailwind), **E0-E11** (ShareCard motor), **E0-E12** (video-inline player), **E0-F3** (passthrough anti round-trip), **E0-G2** (Maestro flows), **E0-G3** (matriz devices), **E0-G4** (flags locales), **E0-G5** (test paridad tokens CI), **E1-20** (verify-email), **E2-18** (check-in P0 post-workout), **E3-22** (auth coach re-skin), **E5-23** (coach onboarding+complete), **E6-02** (tools hub), **E7-12** (reactivate ruling D7), **E8-01** (barrido paridad), **E8-03** (purga theme.ts/db-compat), **E8-04** (rendimiento+a11y), **E8-05** (universal links E2E), **E8-06** (docs+memoria+anti-drift).

> Conteo: 22 IDs `[NUEVO-PLAN]`. Origen: motor/gate/huérfanas que el PLAN nombra pero el inventario no aislaba (ShareCard, video-inline, gate tipográfico, passthrough builder) + huérfanas (verify-email, coach-onboarding, tools-hub, reactivate) + infra QA/DB/releases (migración 0.B, regen types, Maestro, matriz, flags, test paridad, checkins) + cierre E8.

**Tareas del inventario sin ubicar: 0.** Las 181 quedan mapeadas (156 dueñas + 25 absorbidas).

---

## Notas

- **Orden de fundaciones (E0):** el gate tipográfico (E0-D4) va ANTES de cualquier re-skin (riesgo "font-semibold→Inter" resiembra fuentes). El passthrough del builder (E0-F3) va ANTES de que E3 toque el builder (anti round-trip destructivo). Los bugs vivos (E0.A) son P0 y primeros.
- **Doble toque del builder declarado:** re-skin visual con passthrough (E3-12/E3-13) ≠ reconstrucción funcional (E5-04/E5-05). No se estima como una sola L (riesgo SPEC).
- **Money-safety:** toda superficie de módulo pago (E6, exchanges E4-07/E6-06) gatea server-side con `assertModule`; checkout/compra/cambio de tarjeta son link-out (Non-Goals SPEC — IAP Apple/Google).
- **Batch de libs nativas por etapa** (nunca gotear mid-etapa): E0 = Sentry + react-native-view-shot + Maestro; E5 = Google Sign-In. OTA (`expo-updates`) solo para JS-only. SDK 54 congelado (EAS CLI pineado).
- **Releases solo al cierre de etapa** (estado consistente); flags locales (E0-G4) ocultan pantallas incompletas dentro de una etapa; flag remoto para el ejecutor (E2, alto riesgo).
- **Estimación:** 651 días netos es esfuerzo total de una persona; el trabajo corre en paralelo por dominio y depende de la cadencia de gates/QA del CEO. No es un cronograma calendario.
- **Rulings pendientes de veto CEO:** D1–D4 (defaults aplicados en E5-10, E3-07, E0-D1, E1-02/E4-17; no bloquean E0).
- **Trabajo web-side obligatorio** (regla CODEX_HANDOFF relajada): endpoints `/api/mobile/*` nuevos (E4), extracciones a packages (E0.F/E3/E5/E6), migración 0.B (E0.B), fix web crash 0-alumnos (hermana de E6). Gate: web verde tras cada cambio web-side.

