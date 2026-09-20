---
status: active
owner: product-engineering
last_verified: "2026-09-20"
canonical: false
---

# TASKS — Vuelta nueva, salud y reloj

Ver [SPEC](./SPEC.md) · [PLAN](./PLAN.md). Todo `archivo:línea` verificado contra HEAD `67180893`
(`rnmobiledenuevo` = `master`).

> **Ningún checkbox se marca sin gate real ejecutado o QA del owner; al marcarlo se anota el
> resultado real (comando, archivos, tests).**

Convención: `[ ]` pendiente · `[x]` hecha, con una línea **Done:** que dice qué se corrió y qué dio.
Orden duro: **W0 → W1 → (W2 ‖ W3) → W4**. Reparto de archivos en [PLAN §2](./PLAN.md): ningún
archivo en dos workers de la misma ola.

**Alcance.** Este tren son los puntos 1 (ciclo), 4 (hero A/B) y 3 (salud). El **punto 2 (FC de toda
la sesión) salió del tren** por veredicto del jefe: no tiene checkboxes acá, va como bloque propio
en «Pendientes fuera de este tren» y su plan aparte arranca preguntándole a Movens qué banda usa.

**Estimación única** (la misma en SPEC, PLAN y el artifact): W0 0,5 · W1 4-6 · W2 7-9 · W3 4-5 · W4
3-4 ⇒ **18-25 h-agente** con Q7-A, **15-21** con Q7-B.

**Regla de las cuatro superficies.** Cada tarea de UI y cada punto de QA nombra su superficie y
cubre las cuatro: **web móvil/PWA · web desktop (≥ `md`) · app iOS · app Android**.

---

## W0 · CI de master en verde (prerrequisito, Sonnet)

> **Hecho 20-09, commit `70e23d8e`** (rama `worktree-vuelta-nueva-salud-reloj`). Gate real:
> `node scripts/check-docs.mjs` OK (282 Markdown activos, CURRENT.md 15 435 B; margen 949 B — W4
> tiene que escribir estado corto o podar otra vez). actionlint no está en local: W0.2 queda por
> confirmar en el job `hygiene` del primer push.

W0 **no** bloquea los tests: el job `unit` (`.github/workflows/ci.yml:75`, comando en `:96`) y el
job `hygiene` (`:98`) corren **sin `needs`**, así que la suite del tren ya se ejecuta en CI con
`quality` rojo. Lo que W0 destraba es `lint` (`:56`), `typecheck` (`:57`) y `check:tokens` (`:59`),
que hoy nunca llegan a correr porque `docs:check` (`:51`) corta antes. Va primero igual, como
higiene y para no hacer typecheck a ciegas. Commit propio, antes de repartir.

- [x] **W0.1 Enlace roto de `docs:check`.** El CI falla con `docs/specs/meta-app-events-ios/SPEC.md: enlace relativo roto: ../../../apps/mobile/AGENTS.md`. **Causa real:** el destino existe en disco pero **no está versionado** — `AGENTS.md` está en `.gitignore:2`, así que en el runner no existe; por eso `pnpm docs:check` pasa en Windows local y falla en CI (`scripts/check-docs.mjs:186` usa `fs.existsSync`). Arreglo mínimo: en `docs/specs/meta-app-events-ios/SPEC.md:61` reemplazar el link markdown por la ruta en backticks (`:181` ya la cita así y no falla). **No se toca `.gitignore`:** versionar `AGENTS.md` es decisión del owner, no de este tren.
      **Gate:** `pnpm docs:check` local **y** el job `quality` del CI en verde (el local no alcanza).
- [x] **W0.2 Shellcheck de `hygiene`.** `actionlint -color -ignore 'SC2155' -ignore 'SC2129'` reporta 3 avisos, todos anclados en `.github/workflows/ios-upload-ipa.yml:51:9` (inicio del bloque `run:`). Líneas reales del script: `:57` SC2086 (`AuthKey_${ASC_KEY_ID}.p8` sin comillas), `:58` SC2012 (`IPA=$(ls ipa/*.ipa | head -1)`), `:62` SC2086 (mismo `rm -f`). Comillas en las dos expansiones y `find`/glob en vez de `ls`, sin cambiar el comportamiento del upload.
      **Gate:** actionlint 1.7.12 local con los mismos `-ignore` + job `hygiene` de CI (`ci.yml:98`).
- [x] **W0.3 Podar `docs/status/CURRENT.md`.** Pesa 16.365 B contra el tope de 16.384 B de `docs:check`: quedan **19 bytes**. Si no se poda ahora, el commit de estado de W4 tumba el gate de cierre. **Gate:** `pnpm docs:check` verde con margen anotado (bytes reales tras la poda).

---

# OLA A — sin base de datos · deploy web + OTA

## W1 · Paquetes puros (Sonnet) — 4-6 h-a

> **Hecho 20-09, commit `f6f68e7a`** (lo ejecutó Opus por tocar el motor). Gates reales corridos
> por el jefe: `pnpm vitest run packages/workout-engine packages/profile-analytics
> tests/mobile/cycle-cursor-parity.test.ts` → 47 archivos, 947 tests, 0 fallos (3,0 s);
> `pnpm typecheck` OK; `pnpm --filter @eva/mobile exec tsc --noEmit` OK; `pnpm lint` 0 errores
> (576 avisos preexistentes). Diff del motor revisado línea a línea contra SPEC §3.2: orden
> canónico, `T` pre-override, `resolveWeeklyCursor` y salidas no-slot intactas.

Archivos: `packages/workout-engine/cycle-cursor.ts`, `cycle-cursor.test.ts`,
`cycle-cursor.fixtures.ts`, `cycle-completions.test.ts` (solo si el fixture lo pone rojo);
`packages/profile-analytics/health-intake.ts` (nuevo), `health-intake.test.ts` (nuevo), `index.ts`.

- [x] **W1.1 (P1) Helper `currentLapDoneDates` con orden canónico.** Nuevo, **no exportado**, en `packages/workout-engine/cycle-cursor.ts`, junto a `resolveCycleModeCursor` (`:269`). Definición de «vuelta actual» en [SPEC §3.2](./SPEC.md). Insumo: las completitudes utilizables que hoy se filtran en `:276-289` (plan participante + `isWithinCycleWindow`, `CYCLE_CURSOR_WINDOW_DAYS = 30` en `:120`). **El helper ordena internamente por `(dateIso desc, cycleIndex desc)` antes de elegir `L` y recorrer la cadena**: no puede depender del orden del productor, que desempata la misma fecha por `planId.localeCompare` (`packages/workout-engine/cycle-completions.ts:202`) mientras el motor elige la cabeza por «empate ⇒ mayor índice» (`cycle-cursor.ts:286`). **Valida:** CA1.2 e INV-4.
- [x] **W1.2 (P1) Regla de slots.** Solo el `.map` de `slots` de `resolveCycleModeCursor` (`cycle-cursor.ts:326-334`, hoy con el comentario «`done` gana a `today`» en `:328`) pasa al orden `today` → `done` de la vuelta → `upcoming`. **No se toca** `resolveWeeklyCursor` (`:233-266`) ni ninguna salida fuera de `slots`. El wrap se evalúa con `T` **antes** del override de `inProgress` (`cycle-cursor.ts:306-314`): al armar `slots` en `:326` esas variables ya están mutadas, así que hay que capturar `T` antes. **Valida:** CA1.1, CA1.2, CA1.3 y la tabla de verdad de [SPEC §3.3](./SPEC.md).
- [x] **W1.3 (P1) Casos nuevos + INV-1..4 + guarda única.** En `cycle-cursor.test.ts`, además de C24…C34 de SPEC §3.3, **las cuatro filas nuevas del veredicto 2**, cada una con su caso:
      (a) **dos días cerrados la misma fecha, el mayor índice primero** y (b) **el menor primero** — mismos `planId`, distinto orden de entrada, mismo resultado tras el orden canónico (`done` = solo el de mayor índice). Ejemplo real de LIVE: `{4,5,7}@30-07` + `5@31-07`, hoy 01-08 ⇒ `done = {5}`;
      (c) **«Entrenarlo hoy» reinicia la vuelta**: `[1@d1, 2@d2, 1@hoy]`, hoy 1 hecho ⇒ `1H(hoy) 2· 3·`;
      (d) **wrap con `T` pre-override**: `[1@d1, 2@d2]` + parcial de 1 hoy ⇒ `1▶ 2H(d2) 3·`, **no** `1▶ 2· 3·` (es el caso que distingue las dos lecturas del wrap).
      **INV-4:** misma entrada **barajada** ⇒ mismos `slots` (test con permutaciones). INV-1..3 en bucle sobre todos los casos. **Guarda de D1, una sola definición:** snapshot **escrito a mano** de la salida **sin `slots`** de `resolveCycleModeCursor` para C1–C23 y los 4 fixtures existentes, comparado byte a byte tras el cambio (el «antes» ya no existe, así que no puede ser un diff automático); C24+ validan `slots`, no la guarda. Ampliar C6 (`cycle-cursor.test.ts:180-189`) para que revise `slots`. **Valida:** CA1.4, INV-4.
- [x] **W1.3b (P1) Fixture «2.ª vuelta» — contrato real.** Se agrega a `CYCLE_CURSOR_FIXTURES` (`cycle-cursor.fixtures.ts:96`) y lo consumen **tres** suites. `packages/workout-engine/cycle-completions.test.ts:206` impone que el fixture NO sea una lista de completitudes sino **filas de log crudas** (`CycleCompletionLogRow` con `block_id`, `set_number`, `logged_at` a **mediodía UTC** para que no se corra el día Santiago, `cycle-cursor.fixtures.ts:17-19`, y `workout_blocks.plan_id`) más `blocksByPlan`, y verifica `expectedCompletions` / `expectedInProgress`. Dos vueltas de un ciclo de 2 son ~8 días × 4 series = ~32 filas a mano: no es una tarea de 10 minutos. **Valida:** CA1.4.
- [x] **W1.4 (P3) `buildHealthIntakeView(intake)`.** Función pura nueva en `packages/profile-analytics/health-intake.ts` + test, exportada por `packages/profile-analytics/index.ts`. Clasifica campo vacío vs. ficha placeholder según [SPEC §5](./SPEC.md), **con la regla corregida: si `injuries` o `medical_conditions` traen texto se pintan SIEMPRE, con su pie de fecha**, y el aviso «Tu alumno aún no completa su ficha inicial» solo aparece (como nota al pie) con los cinco campos vacíos. Rótulos canónicos: «Lesiones o limitaciones», «Condiciones médicas», «Objetivo», «Experiencia», «Disponibilidad». El pie es **«Actualizado el {12 sept}»**, sin autoría: `client_intake` no guarda autor ni origen (`supabase/migrations/00000000000001_baseline.sql:788-800` + `sex` en `20260701120000_add_client_intake_sex.sql`) y el coach escribe esas mismas columnas desde `apps/web/src/app/coach/clients/EditClientDataModal.tsx:218-241`. **Valida:** CA3.2.
- [x] **W1.5 Gates de W1.** `pnpm vitest run packages/workout-engine packages/profile-analytics` **y** `pnpm vitest run tests/mobile/cycle-cursor-parity.test.ts packages/workout-engine/cycle-completions.test.ts` (el segundo porque el fixture cruza el project `tests/mobile`, excluido de los projects `web-*`: sin él W1 cierra verde y deja roja la paridad web ↔ RN, que es archivo de W2).

## Mockups de Ola A — bloqueantes del owner ([PLAN §1](./PLAN.md))

Los hace el jefe contra componentes y tokens existentes del EVA DS, **fieles al código**. **W2 y W3
no tocan UI sin el OK.** Cada mockup dice su superficie.

- [x] **M1 Hoja «Ya hiciste»** — app (bottom sheet) + **web desktop (modal centrado `md+`, `WorkoutDoneSheet.tsx:70`)**; web móvil = igual que app. Título **sin cambio** («Ya hiciste este entrenamiento»: web `heading` `WorkoutDoneSheet.tsx:22`, RN literal `ActiveProgramSection.tsx:301`). Jerarquía = la que la web ya tiene (borde 2 px + tinte), **no** relleno sólido, **conservando íconos y chevrons**; en RN hoy las dos opciones son byte-idénticas (`:331`, `:355`). Bloquea W2.2 y W3.1.
- [x] **M2 Banner del modo corrección** — app + web móvil + web desktop. **Neutro y full-bleed como hoy** (RN `RecoveryBanner.tsx:84-100`, web `WorkoutExecutionClient.tsx:3222-3243`); nada de ámbar, que es el tono de «Recuperando». Bloquea W2.3 y W3.2.
- [x] **M3 Tarjeta «Salud»** — RN con lesiones · RN sin ficha · web desktop **en su columna real** (COL DER de `ProfileOverviewB3.tsx:443`, con Hábitos diarios y Último check-in debajo) · web móvil apilada. Sin chip, sin «ver más», pie «Actualizado el {12 sept}». Contexto real en RN: `KeyMetricsCard` muestra «Peso actual» y «Variación semanal», no «Adherencia». Bloquea W2.4 y W3.3.
- [x] **M4 Punto 4, dos frames fieles** — app iOS + Android (web móvil y desktop no cambian). (a) Hero de un día con plan: eyebrow «Hoy entrenas» (`HeroSection.tsx:192`), título `plan.title`, sub «N ejercicios · M series» (`:198`), badge «Semana 2 de 8 · Sem B» debajo (`ActiveProgramSection.tsx:151-156`): Antes «Pierna A» (bug) / Después «Pierna B». (b) `RestDayCard` un martes: Antes «Próximo: Pierna A · Lun» (bug) / Después «Próximo: Torso B · Jue». Bloquea W2.1 y W2.1b.

## W2 · App RN (Opus) — depende de W1 — 7-9 h-a

> **Hecho 20-09** (mismo commit que W3). Gates reales corridos por el jefe sobre el monorepo
> entero: `pnpm vitest run` → 814 archivos, 11 340 tests, 0 fallos; `pnpm --filter @eva/mobile exec
> tsc --noEmit` OK; `pnpm lint` 0 errores. Juicio del diff: hoja con copy canónico e intercambio de
> destino, `snapPoints` 52 % (justificado: `dynamicSizing` es prop muerta bajo `nativeModal`),
> banner neutro con «Entrenar hoy», `initialStepIndex` solo en la hidratación (`:2346`; el
> interstitial de descanso `:2279` y el auto-avance `:2388` siguen con `firstIncompleteStepIndex`),
> hero y Momentum desde el cursor vía `hero-plans.ts`, tarjeta «Salud» sin analytics, `upsert` del
> alta. Fecha corta compartida con la web (`shortDayMonthEs`, tabla «sept»).

Archivos: `apps/mobile/app/alumno/(tabs)/home.tsx`, `components/alumno/home/hero-plans.ts` (nuevo),
`components/alumno/home/ActiveProgramSection.tsx`, `components/alumno/workout/RecoveryBanner.tsx`,
`components/alumno/workout/v3/ExecutorV3.tsx` (tira semanal, acción del banner y arranque en paso
0), `components/coach/clientDetail/OverviewTab.tsx`, `lib/coach-client-detail.ts`,
`lib/alumno-onboarding.ts`, `tests/mobile/home-hero-ab.test.ts` (nuevo),
`tests/mobile/cycle-cursor-parity.test.ts`, `tests/mobile/executor-v3-weekly-streak.test.ts`.

- [x] **W2.0 (H1, BLOQUEA) `upsert` en el alta del alumno.** `apps/mobile/lib/alumno-onboarding.ts:45` usa `.insert()` sobre `client_intake` y `:56` se traga el `23505` («ya existe intake (idempotente) → seguimos a marcar completado»): si el coach ya creó la fila placeholder, las lesiones y condiciones que el alumno escribe **en la app** se pierden en silencio y la tarjeta del punto 3 mentiría. Pasa a `upsert({ … }, { onConflict: 'client_id' })`, igual que la web (`apps/web/src/app/c/[coach_slug]/onboarding/_actions/onboarding.actions.ts:46-57`). Una línea, sin migración, misma OTA; el objeto no incluye `sex`, así que el upsert no pisa lo que puso el coach. Hoy 0 casos en LIVE. **Valida:** CA3.4.
- [x] **W2.1 (P4 · requiere M4) Hero, «Próximo» y Momentum desde el cursor.** `home.tsx:404-409`: hoy `todayPlan` y `nextPlan` en `weekly` salen de `plans.find(...)` sobre TODOS los planes; pasan a `cursor.todayPlanId` / `cursor.nextPlanId` (el cursor ya recibe `programPlans` filtrados por variante). Momentum (`home.tsx:423`) sobre `programPlans`. Lógica extraída a `components/alumno/home/hero-plans.ts` (`selectProgramPlans`, `heroPlansFromCursor`) para testearla sin montar la pantalla; actualizar el comentario de `home.tsx:401-403`.
      **Q5 es un ARREGLO, no una alineación cosmética.** RN ya gatea «Próximo» igual que la web: `HeroSection.tsx:94` corta con `if (todayPlan)` y `WorkoutHero` no recibe `nextPlan`; «Próximo» se pinta solo en `RestDayCard` (`:404-414`). El bug está en los días **sin** plan: `home.tsx:407-409` con `todayPlan` nulo devuelve `plans[0]` de una lista ordenada por `day_of_week` (`:267`) ⇒ un martes de un Lun/Mié/Vie dice «Próximo: el del lunes», un día que ya pasó. Con el arreglo dice «Mié»; sábado y domingo pasan a «Recupera bien…» porque `resolveWeeklyCursor` no da la vuelta (`cycle-cursor.ts:249`). Visible en **249 programas `weekly` activos** — ver [PLAN §4](./PLAN.md) y **Q5**. **Valida:** CA4.1, CA4.2, CA4.3, CA4.4, CA4.5.
- [x] **W2.1b (P4 · requiere M4) Tira semanal del ejecutor.** `ExecutorV3.tsx`: el `.select(...)` del programa está en **`:1727`** (no `:1754`); `:1753-1755` es donde se mapea `rawPlans` y se llama `plannedDatesForWeek`. Sumar `ab_mode`, `start_date`, `weeks_to_repeat` al select del programa y `week_variant` al de planes, y filtrar `rawPlans` con `apps/mobile/lib/program-week-variant.ts` (`programWeekIndex1Based` `:7`, `weekIndexToVariantLetter` `:23`, `workoutPlanMatchesVariant` `:41`, `effectiveWeekVariantFromPlans` `:57`). Cuidado con el early-return de `:1749` (`program_structure_type === 'cycle'` ⇒ `setWeeklyStreak(null)`): esta tira no aplica a ciclos. **Valida:** CA4.7 (suite propia: `tests/mobile/executor-v3-weekly-streak.test.ts`; CA4.5 vive en `home-hero-ab.test.ts` y no se mezcla).
- [x] **W2.2 (P1, UI · requiere M1) Hoja «Ya hiciste».** `ActiveProgramSection.tsx`: `handleDayPress` arranca en `:105`, título en `:301`, `showRepeat` en `:283`. Para una sesión **pasada** de la vuelta actual, «Entrenarlo hoy» pasa a primaria y «Corregir registros del {16 sept}» a secundaria. Se intercambian **posición y destino** (`?repetir=` ↔ `?fecha=`), no solo el rótulo. Copy canónico, letra por letra: primaria **«Entrenarlo hoy»** / sub «Sesión nueva de hoy, con tus valores del {16 sept} ya cargados»; secundaria **«Corregir registros del {16 sept}»** / sub «Cambia lo que anotaste ese día. No cuenta como entreno de hoy.». **El título NO cambia** (`:301` es un literal con dos ramas: no tocar la rama `incomplete` = «Entrenamiento incompleto»). Las dos opciones hoy son byte-idénticas (`:331`, `:355`): la secundaria pasa a neutra, conservando íconos (`RotateCcw` primaria, `Pencil`/`SquarePen` secundaria) y chevrons. **`snapPoints={['42%']}` (`:302`) pasa a `dynamicSizing` (o 52 %):** el contenido nuevo no entra en un iPhone SE. El caso «hecho HOY» no cambia de orden ni de copy. **Valida:** CA1.5.
- [x] **W2.3 (P1, UI · requiere M2) Banner de corrección.** `RecoveryBanner.tsx:84-100` (rama `editDate`) dice hoy «Editando registros del {día}» / «Corrige tus series de ese dia»; pasa a título **«Corrigiendo el {martes 16 sept}»** y sub **«No cuenta como entreno de hoy»** (entra en 1 línea, `numberOfLines={1}` en `:97`), **manteniéndose neutro y full-bleed**. Suma la acción **«Entrenar hoy»** como botón texto a la derecha, antes de la X, que navega al plan **sin** query. **Hace falta un formateador día+mes:** `weekdayEs()` (`:31-34`) solo da el día de la semana; se reutiliza `fmtSheetDate` (`ActiveProgramSection.tsx:18`, hoy función local ⇒ exportarla), los dos archivos son de W2. Rutas y guardado de `?fecha=`/`?repetir=` no se tocan. **Valida:** CA1.5 y el invariante «guardado sin cambios» de [PLAN §4](./PLAN.md).
- [x] **W2.3b (P1 · solo si Q7-A) Arranque en el primer ejercicio.** Cuando TODO está registrado (día hecho **hoy** o «Corregir registros» de un día pasado), `firstIncompleteStepIndex` devuelve el último paso (`packages/workout-engine/workout-stepper.ts:86-90`) ⇒ sin serie activa ni reloj. Cambio acotado al **arranque inicial**: `ExecutorV3.tsx:2254`. **No se tocan** los usos de auto-avance/toggle (`:2318`, `:2360`), que son los que mueven el paso al registrar una serie. Ojo: el camino «hecho HOY» llega acá sin `?fecha=` — el sheet de un día cerrado hoy ofrece solo «Revisar y editar» (`ActiveProgramSection.tsx:283`). **Si el owner elige Q7-B, esta tarea no existe** y el sub del banner suma la línea de expectativa que dice el SPEC. **Valida:** CA1.5.
- [x] **W2.4 (P3, UI · requiere M3) Tarjeta «Salud» en la ficha del coach.** Ampliar el select de `apps/mobile/lib/coach-client-detail.ts:812` (hoy `'height_cm, weight_kg, sex'`) a `injuries, medical_conditions, goals, experience_level, availability, updated_at` y propagar el tipo. Sección «Salud» en `components/coach/clientDetail/OverviewTab.tsx` **como hermano entre `KeyMetricsCard` y `HabitsMiniWidget` en el composer (`:298-306`)**, con `StatCard` + `SectionTitle` (`SectionTitle` no es del DS: es función local de `OverviewTab.tsx:97`), pintando `buildHealthIntakeView`. Pie «Actualizado el {12 sept}», **sin chip** «Lesión informada» y **sin «ver más»**: el texto se muestra completo y la tarjeta crece. **Nada a PostHog ni Sentry.** **Valida:** CA3.1, CA3.2, CA3.3.
- [x] **W2.5 Gates de W2.** `pnpm vitest run tests/mobile` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint:mobile`.

## W3 · Web (Opus) — depende de W1, en paralelo con W2 — 4-5 h-a

> **Hecho 20-09** (mismo commit que W2). Gates reales: `pnpm vitest run` (monorepo) 11 340/0;
> `pnpm typecheck` OK; `pnpm lint` 0 errores. Juicio del diff: `WorkoutDoneSheet` con prop opcional
> `sessionDateLabel`, clases de jerarquía byte-idénticas, `heading` intacto, test que asserta los
> `href`; banner neutro «Corrigiendo el {martes 16 sept}» + «Entrenar hoy» sin query; eyebrow
> «Corrigiendo · martes 16»; sección «Salud» primera de la COL DER con `buildHealthIntakeView`.
> **Corrección del jefe (W4.1):** `enterExecV3Session` (`:1913`) también es arranque —«re-sincroniza»
> el paso al entrar a la sesión— y con TODO registrado deshacía Q7-A; ahora aplica la misma regla
> que el montaje. `:1906`/`:2076` reales (auto-avance y toggle) siguen intactos.

Archivos: `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/WorkoutDoneSheet.tsx`,
`WorkoutPlanCard.tsx`, `WorkoutPlanCard.test.tsx`,
`apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx`,
`dashboard/_data/weekPendingWorkouts.test.ts`, `dashboard/_data/heroComplianceBundle.test.ts`,
`apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`, `ProfileOverviewB3.tsx`.

- [x] **W3.1 (P1, UI · requiere M1) Hoja «Ya hiciste», móvil y desktop.** `WorkoutDoneSheet.tsx`: componente en `:19`, `heading` fijo «Ya hiciste este entrenamiento» en `:22` (**no cambia**), opción destacada «Revisar y editar» en `:84-100`, «Repetir hoy» en `:102-120`. La jerarquía ya existe y **se conserva tal cual**: primaria `border-2 border-sport-500/55 bg-sport-100/60` + tile `bg-sport-500/18` con ícono + `ChevronRight`; secundaria neutra `border-subtle bg-surface-card` + tile `bg-surface-sunken`. Lo que cambia es **cuál de las dos la lleva** y el copy canónico de W2.2 (idéntico letra por letra en las dos superficies). **Se prueba también en `md+`, donde la hoja es modal centrado (`:70`)** — es la superficie de 6 de los 10 alumnos de Movens. Props opcionales nuevas (p. ej. `sessionDateLabel`) para no romper al otro caller; el orden solo cambia cuando la sesión es pasada. Caller `WorkoutPlanCard.tsx:229-257`, con `showRepeat={sessionDate !== todayIso}` (`:256`) intacto. **Valida:** CA1.5 y el invariante «hecho HOY sin Repetir» en `WorkoutPlanCard.test.tsx`.
- [x] **W3.2 (P1, UI · requiere M2) Banner y eyebrow de corrección.** `WorkoutExecutionClient.tsx:3222-3243` (hoy «Editando registros del {día}», franja neutra con X descartable, estado `editBannerDismissed`: decidir con M2 si sigue siéndolo) pasa a «Corrigiendo el {martes 16 sept}» / «No cuenta como entreno de hoy» + acción «Entrenar hoy», **sin cambiar el tono neutro**; la web ya tiene utilidades de fecha para el formato día+mes. El eyebrow del inicio V3 (`:2959`) pasa a «Corrigiendo · {martes 16}» cuando hay `targetDate`. **Valida:** CA1.5.
- [x] **W3.2b (P1 · solo si Q7-A) Arranque en el primer ejercicio.** Mismo cambio que W2.3b, en el **arranque inicial** de la web: `WorkoutExecutionClient.tsx:1862`. **No se tocan** `:1906` ni `:2076` (auto-avance y toggle del stepper). Si el owner elige Q7-B, esta tarea no existe. **Valida:** CA1.5.
- [x] **W3.3 (P3, UI · requiere M3) Sección «Salud».** `ProfileOverviewB3.tsx` abre dos columnas en `:300`. La sección va en la **COL DER (`:443`), primera, antes de «Hábitos diarios»**; en < 1024 px el grid colapsa a una columna y queda después de «Métricas clave». («Entre Métricas clave y Evolución visual» no existe: son de columnas distintas.) `Card` + `SectionTitle` existentes y `buildHealthIntakeView`. **Sin tocar el query:** `client_intake (*)` ya viaja en `apps/web/src/services/client/client-detail.service.ts:102`; solo falta pasarlo como prop desde `ClientProfileDashboard.tsx:286-288` (hoy únicamente talla/peso/sexo). Pie «Actualizado el {12 sept}», sin chip, sin «ver más». **Valida:** CA3.1, CA3.2, CA3.3.
- [x] **W3.4 (P1/P4) Candados de test.** Caso `ab_mode: true` nuevo en `heroComplianceBundle.test.ts` (hoy solo `false`, `:74` y `:218`) y cobertura de `slots` de 2.ª vuelta en `weekPendingWorkouts.test.ts` (la tarjeta «Hoy» sale de `slot.state === 'today'`, `weekPendingWorkouts.ts:483`). **Ojo H7:** los asserts de slots que ya existen en `heroComplianceBundle.test.ts:272`, `:310` y `:359` afirman sobre la **tercera** superficie que lee `slots` (`heroComplianceBundle.ts:283-292`, serializada en **`:327`**, hoy sin componente que la pinte). Si la regla de W1 se ajusta, el rojo aparece acá. **Valida:** CA4.6, CA1.2, CA1.6.
- [x] **W3.5 Gates de W3.** `pnpm vitest run "apps/web/src/app/c/[coach_slug]/dashboard" "apps/web/src/app/coach/clients"` · `pnpm typecheck`.

## W4 · Juicio, gates, deploy, OTA y QA (jefe) — 3-4 h-a

- [ ] **W4.1 Juicio de los diffs de W1–W3** contra SPEC §3–§5 y el reparto de archivos; lo deficiente vuelve al MISMO worker con feedback concreto. Incluye revisar el candado de H7 (`heroComplianceBundle.test.ts:272/310/359`), que es archivo de W3 y cambio de W1, y que el copy de la hoja y el banner sea **idéntico letra por letra** entre web y app.
- [ ] **W4.2 Revisión de privacidad.** Grep de `captureAppEvent` / `posthog` / `Sentry` en los archivos tocados: cero eventos nuevos con lesiones o condiciones médicas. **Valida:** invariante de privacidad de [PLAN §4](./PLAN.md).
- [ ] **W4.3 Verificar que la OTA es JS puro.** El diff no toca `package.json`, lockfile, `apps/mobile/app.json`, `eas.json` ni `plugins/`.
- [ ] **W4.4 Gates de cierre.** `pnpm vitest run` · `pnpm typecheck` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint` · `pnpm lint:mobile` · `pnpm check:tokens` · `pnpm docs:check` · `pnpm build` · `pnpm --filter @eva/mobile exec expo export --platform android`. **`pnpm test` NO se usa:** `package.json:14` es `"test": "vitest"` sin `run` y `vitest.config.ts` no fija `watch: false` ⇒ queda en watch y no termina (el CI no sufre porque usa `npx vitest run --shard`, `ci.yml:96`).
- [ ] **W4.5 Deploy web.** Push a `master`; esperar el deploy READY de Vercel **antes** de las OTAs.
- [ ] **W4.6 OTA runtime 1.1.3 (iOS) desde `master`.** `mobile-ota.yml` con `platform=ios`, `branch=production`. Android 1.1.3 no existe (sin binario): no se publica.
- [ ] **W4.7 OTA runtime 1.1.2 (Android + flota iOS 1.1.2) desde tag.** Procedimiento de [PLAN §5.3](./PLAN.md): rama desde `ota/1.1.2-20260916`, `git cherry-pick 90d79075` (menú de dunning, hoy ausente en 1.1.2 — pendiente #7), cherry-pick del tren limitado a `apps/mobile/`, `packages/` y `tests/mobile/`, confirmar `app.json` en 1.1.2 y sin plugin de Meta, gates en la rama, tag nuevo y `mobile-ota.yml` una vez `android` y otra `ios`.
- [ ] **W4.8 E2E post-deploy.** `pnpm qa:prod:suave` (regla del owner: E2E solo al cierre).
- [ ] **W4.8b Preparar las cuentas de QA (antes de entregar el checklist).** Tabla de estados en [PLAN §7](./PLAN.md), **citados por nombre, no por número de punto**: (a) **ciclo de 2 en 2.ª vuelta** — para todos los puntos del **punto 1**, con dos días cerrados al 100 % de series en fechas pasadas dentro de la ventana de 30 días (`packages/workout-engine/cycle-completions.ts:192-199`, `cycle-cursor.ts:120`); (b) **semanal A/B en semana B** — para los del **punto 4** de A/B, con `ab_mode=true`, planes A y B reales y `start_date` en semana par (`apps/mobile/lib/program-week-variant.ts:7-21`) y `weeks_to_repeat` vigente; (c) **semanal sin A/B Lun/Mié/Vie** — para el del **punto 4** de «Próximo» (martes/jueves y sábado/domingo); (d) **alumno con lesiones y alumno sin ficha** — para los del **punto 3**. **Nunca sobre cuentas reales de coaches.** Se anota qué cuenta, qué programa y qué fechas se usaron.
- [ ] **W4.9 QA del owner.** Todos los puntos de [SPEC §8](./SPEC.md) en las **cuatro superficies**: web móvil/PWA, web desktop (≥ `md`), app iOS (1.1.3 y 1.1.2) y app Android (1.1.2). Con el QA verde el SDD pasa a `done`.
- [ ] **W4.10 Aviso a coaches (lo manda el owner, nunca la sesión).** Borradores de la sección «Aviso» de [SPEC §9](./SPEC.md), **en el idioma del coach**: sin «vuelta» («cuando terminan A y B y vuelven a empezar»), sin «listado/PDF» («en la ficha de cada alumno; en la lista y en el informe todavía no»), y sin usar «6 de tus 10 alumnos son web» como argumento. A Movens van cuatro bloques: (a) el «Ya existe» del ciclo; (b) el **«empieza por B»** con el ejemplo concreto y la salida («tocá A y elegí *Entrenarlo hoy*»); (c) lesiones y condiciones ya visibles en la ficha; (d) el pulso, con las **tres preguntas** — ¿la banda se conecta **dentro de EVA** en el bloque de cardio o la leen en el reloj?, marca y modelo, y qué teléfono y reloj usan los alumnos con app. Además: aviso a los 3 coaches con A/B real y a los 10 con ciclos activos. Entre el deploy web y la OTA, como en el tren de ciclos.

---

## Bloqueos

> **Decidido por el owner el 20-09 (tarde): A en las siete (Q1–Q7)** y mockups M1–M4 aprobados en
> la misma respuesta. Los bloqueos de decisión de abajo quedan levantados; siguen vigentes solo los
> de gate (ningún checkbox se marca sin gate real ejecutado o QA del owner).

1. **Q1–Q7 están PENDIENTES del owner.** Nada se implementa, commitea ni pushea hasta que las responda. Texto único (idéntico en [SPEC §2.1](./SPEC.md) y en el artifact); **las siete están pendientes de confirmar**:

| Q | Pregunta | A | B | Rec. |
|---|---|---|---|---|
| Q1 | ¿Cada semana debe empezar en A? | No cambiar la regla del ciclo: el que toca es el siguiente al último hecho. Si el alumno quiere A, toca A y elige «Entrenarlo hoy». | Agregar por programa «reiniciar el ciclo cada lunes» (8-12 h, cambia la regla, migración). | **A** |
| Q2 | Textos de la hoja «Ya hiciste» | «Entrenarlo hoy» destacada, «Corregir registros del {fecha}» secundaria, banner claro en corrección. Título sin cambio. | Solo arreglar el fondo; textos como están. | **A** |
| Q3 | ¿El pulso de toda la sesión sale de este tren? | Sí: plan aparte, y lo primero es preguntarle a Gerardo (banda dentro de EVA o en el reloj, marca, teléfono/reloj de sus alumnos). | No: entra acá con tabla nueva y prueba de banda real (+15-19 h). | **A** (existe una C escrita en el SPEC: solo import del reloj a nivel sesión) |
| Q4 | Alcance de «Salud» | Tarjeta de solo lectura en la ficha, web y app. | Además ícono en la lista de alumnos y salud en el informe. | **A** |
| Q5 | «Próximo» en los días de descanso | Arreglarlo: hoy la app muestra el primer entreno de la semana aunque ya pasó; pasa a mostrar el siguiente de esta semana y, tras el último, «Recupera bien…». Igual que la web. Visible en los 249 programas semanales. | Dejarlo como está. | **A** |
| Q6 | Días de la ronda anterior | Quedan como «Próximo», y tocarlos arranca esa sesión (es cómo funciona un ciclo). | Agregar una salida explícita para corregir una sesión de la ronda anterior (más UI, otro mockup). | **A** |
| Q7 | Cuando todo está registrado (día hecho hoy o corregir un día pasado) | Arreglarlo en este tren: el ejecutor abre en el primer ejercicio con series y reloj (+3-4 h). | Dejarlo para después; el aviso a Gerardo no dirá «arreglado». | **A** |

   Efecto de cada respuesta sobre las tareas: Q1-B reabre D1 y cambia el alcance del tren entero; Q2-B borra W2.2, W2.3, W3.1 y W3.2; Q3-B devuelve las waves de FC y duplica el tren; Q4-B suma los pendientes #18 y #19; Q5-B recorta el arreglo de W2.1 a los 10 programas A/B; Q6-B pide una salida nueva para corregir una sesión vieja (más UI y otro mockup); Q7-B borra W2.3b y W3.2b, y el aviso a Movens **no** puede decir «arreglado».

2. **Mockups M1–M4 sin aprobar.** Ninguna tarea marcada «UI · requiere Mx» arranca sin el OK del owner sobre su mockup (regla de la casa: mockup aprobado antes de UI, contra componentes y tokens existentes del EVA DS, y fiel al código).
3. **W0 no bloquea los tests, solo `lint`, `typecheck` y `check:tokens`.** El job `unit` (`ci.yml:75`, `:96`) y `hygiene` (`:98`) no tienen `needs` y corren hoy con `quality` rojo. W0 igual va primero, y W0.3 es condición para que el commit de estado de W4 no tumbe `docs:check`.

---

## Pendientes fuera de este tren

Único backlog de este tren (regla de `docs/README.md`: no hay segundo backlog en docs).

### Joaquín (`joaquinamr7`) — incidente de cobro 18-09, PRs #188–#191 ya en producción

1. **Esperar el cobro de Mercado Pago.** Si MP no recupera, el 26-09 12:14 (Chile) el panel lo manda a «Reactivar» y sus alumnos siguen registrando hasta el 03-10 12:14; nada manual. **Quién:** owner (solo mirar). **Cuándo:** 26-09.
2. **Leer el log del cron `mp-reconcile`.** La línea «GET /preapproval no-OK» dice con qué status HTTP responde MP por su suscripción. **Quién:** agente. **Cuándo:** 20-09, 07:00 Chile (10:00Z).
3. **La «causa raíz» del PR #189 no está probada.** El cobro rechazado del 18-09 vino del preapproval NUEVO `3d92cee3…`, no de uno heredado. **Quién:** agente. **Disparador:** el log del pendiente #2 o el panel de MP.
4. **Falsos `coach.period_drift` en el digest.** Para coaches en dunning, `next_payment_date` puede ser la fecha de REINTENTO ⇒ alertas falsas (solo ruido de alerta). **Quién:** agente. **Cuándo:** backlog.
5. **Log cosmético del webhook.** La línea «processed» imprime `internalStatus: expired` y `currentPeriodEnd: null` aunque la fila quede `past_due` con su corte. **Quién:** agente. **Cuándo:** backlog.
6. **Borrar la rama remota `claude/urgent-supabase-investigation-uzdhhk`:** ya está 100 % en master. **Quién:** owner. **Cuándo:** cuando quiera.
7. **El arreglo del menú de dunning falta en la OTA 1.1.2** (#188 solo salió en runtime 1.1.3). **Entra en este tren:** W4.7 lo cherry-pickea (`90d79075`). A Joaquín no le afecta: usa la web.

### CI

8. **CI de master rojo desde el 16-09:** `quality` por el enlace de `docs/specs/meta-app-events-ios/SPEC.md:61` e `hygiene` por shellcheck en `.github/workflows/ios-upload-ipa.yml:57, :58, :62`. **Se arregla como W0 de este tren** (agente), con la causa real corregida en W0.1: `AGENTS.md` está en `.gitignore:2`. No frena los tests (job `unit` sin `needs`), sí `lint`/`typecheck`/`check:tokens`.

### Del ciclo (punto 1) — fuera del mínimo

9. **Opción «reiniciar el ciclo cada lunes» por programa.** Cambia D1, ~8-12 h-agente + migración. **Quién:** owner decide, agente implementa. **Disparador:** solo si el owner elige Q1-B.
10. **Arrancar en el paso 0 cuando todo está registrado** en vez de saltar al último (`packages/workout-engine/workout-stepper.ts:86-90`). Son **seis** usos: arranque inicial (web `WorkoutExecutionClient.tsx:1862`, RN `ExecutorV3.tsx:2254`) y auto-avance/toggle (web `:1906`, `:2076`; RN `:2318`, `:2360`). **Es la pregunta Q7:** con Q7-A entran los **dos de arranque** en este tren (W2.3b y W3.2b) y los cuatro de auto-avance quedan acá; con Q7-B queda todo acá y el copy del banner lo dice. Afecta a los dos caminos: `?fecha=` y «entrené hoy y vuelvo a abrirlo». **Quién:** owner decide (Q7), agente implementa.
11. **`limit(200)` de la lectura de logs del cursor** puede recortar la vuelta en ciclos largos (degradación visual, no afecta al cursor). **Quién:** agente. **Cuándo:** backlog.

### Del hero A/B (punto 4) — fuera del mínimo

12. **`weeks_to_repeat` vencido congela la variante A/B** (2 de los programas A/B reales): decidir si sigue alternando tras el fin del programa. Igual en web y app. **Quién:** owner (producto).
13. **`cycle` + `ab_mode` = dos relojes** (variante por calendario vs. día por completitud); 1 programa real en LIVE. **Quién:** owner. **Ligado a:** Q1.
14. **Mover `programWeekVariant` a `@eva/workout-engine`** (hoy duplicado: `apps/web/src/lib/workout/programWeekVariant.ts` y `apps/mobile/lib/program-week-variant.ts`). **Quién:** agente. **Cuándo:** backlog.
15. **RN usa medianoche local del teléfono para la semana** (`apps/mobile/app/alumno/(tabs)/home.tsx:362`): solo afecta a zonas al este de UTC. **Quién:** agente. **Cuándo:** backlog.
16. **Etiqueta «Mañana» del próximo en weekly:** la web la muestra, la app muestra el día. Cosmético. **Quién:** agente. **Cuándo:** backlog.
17. **Tab oculta `apps/mobile/app/alumno/(tabs)/workout.tsx` sin variante:** inalcanzable por navegación (`apps/mobile/app/alumno/(tabs)/_layout.tsx:129`, `href: null`), candidata a borrar. **Quién:** agente.

### De salud (punto 3) — fuera del mínimo

18. **Ícono «tiene lesiones» en el listado de alumnos** (web + app): exige tocar el query del roster, no la ficha. **Quién:** owner decide (Q4-B), agente implementa.
19. **Lesiones y condiciones en el PDF/dossier del alumno:** hoy `apps/web/src/services/client/client-dossier.ts` no las incluye. **Quién:** owner decide (Q4-B), agente implementa.
20. **El alumno no puede reeditar su ficha de salud después del onboarding** (ni web ni app), y la app del coach tampoco la edita: solo el modal web `apps/web/src/app/coach/clients/EditClientDataModal.tsx:163-238`. **Quién:** owner (producto). **Cuándo:** backlog.
25. **Decidir si los miembros del team deben ver la salud del alumno.** `team_client_intake_member_all` (`supabase/migrations/20260609160000_team_rls_optimized.sql:113-116`) es `FOR ALL`: cualquier miembro activo del team **lee y escribe** lesiones y condiciones médicas, no solo el coach dueño. Hoy son **0 alumnos con `team_id`** en LIVE ⇒ ninguna fila real expuesta, por eso no entra al tren. Si la respuesta es «no», hace falta policy nueva o vista acotada (deja de ser «sin migración»). Dato sensible, Ley 21.719. **Quién:** owner decide, agente implementa.

### Punto 2 — FC de toda la sesión (SALIÓ de este tren, plan aparte)

Bloque propio por veredicto del jefe: es AGREGA y no ARREGLA, en LIVE hay **0 series con
`metadata.hr` en 90 días en toda la plataforma**, sirve como mucho a 4 de los 10 alumnos de Movens y
depende de una respuesta que todavía no tenemos. **No arranca código hasta el pendiente 24**, salvo
el 27, que es un ARREGLA chico y es condición previa a cualquier «dejá la banda puesta».

27. **El promedio de FC se acumula entre bloques y contamina el segundo cardio (ARREGLA, nuevo).** `apps/mobile/lib/ble-hr.ts:412-417` reinicia `sum`/`count`/`max` **solo** en conexión fresca (`reconnectAttempts === 0`) y `:435-443` promedia toda la conexión; `useBleHr` no desconecta al desmontar (`:503-512`) y `CardioScreenV3` nunca llama `disconnect()`. Si el alumno deja la banda puesta, el `actual_avg_hr` del segundo bloque de cardio sale mezclado con la fuerza intermedia: el coach lee un número más bajo que el real. La curva por serie (`metadata.hr`) está bien, se reinicia por serie. Hoy **0 ocurrencias en LIVE** (nadie usa banda dentro de EVA). **Quién:** agente. **Cuándo:** primera tarea de código del plan aparte, antes de invitar a dejar la banda puesta.
24. **Preguntarle a Movens qué banda usa y si sus alumnos iOS tienen Apple Watch.** Es la **primera tarea del bloque** y bloquea todo lo demás: define si sirve banda, reloj o ambos, y si existe hardware para el QA. La pregunta es de tres partes: (i) ¿la banda se conecta **dentro de EVA** o la leen en el reloj / otra app?; (ii) marca y modelo; (iii) qué teléfono y reloj usan los alumnos con app. Si la respuesta es «no tengo banda BLE», el plan entero se archiva y lo que queda es la opción C de Q3 (import del reloj a nivel sesión). **Quién:** owner. **Cuándo:** antes de escribir el SDD.
26. **Escribir y ejecutar el SDD del plan aparte.** El diseño ya está hecho y queda en el SPEC (flujo banda + import del reloj a nivel sesión + fila «FC de la sesión» para el coach, tabla `public.workout_session_hr` con su DDL, límites y precedencia banda > reloj), con dos correcciones obligatorias: el DDL suma `revoke delete on public.workout_session_hr from authenticated;` — las default privileges del baseline (`supabase/migrations/00000000000001_baseline.sql:3824`) dan ALL a `authenticated`, así que el `grant select, insert, update` no revoca nada — y la matriz RLS suma el caso «alumno intenta DELETE». Condiciones de arranque: actualizar `apps/web/src/app/privacidad/page.tsx:79` (fuente HealthKit / Health Connect y destinatarios coach y team) y el texto del permiso Bluetooth. ~15-19 h-agente + 1 migración aditiva. **Quién:** agente. **Disparador:** respuesta del pendiente 24.
21. **FC con la pantalla bloqueada en iOS:** exige `UIBackgroundModes: bluetooth-central` ⇒ build de tienda. De paso, corregir el texto del permiso Bluetooth que dice «durante el cardio» (`apps/mobile/app.json:35`). **Quién:** agente. **Disparador:** próxima build nativa.
22. **FC de sesión en web/PWA:** solo Chrome Android; iPhone web no tiene Bluetooth ni Salud. **Quién:** owner decide. **Cuándo:** después del plan aparte.
23. **Curva y zonas de FC visibles para el coach:** hoy `metadata.hr.zone_sec` y `samples` no se muestran en ningún lado. **Quién:** agente. **Cuándo:** después del plan aparte.
