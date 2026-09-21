---
status: done
owner: product-engineering
last_verified: "2026-09-21"
canonical: false
---

# PLAN — Vuelta nueva, salud y reloj

Ejecución del [SPEC](SPEC.md). Checkboxes en [TASKS.md](TASKS.md). Todo «archivo:línea» está
verificado contra HEAD `67180893` (`rnmobiledenuevo` = `master`). **Nada se implementa sin el OK del
owner** a Q1–Q7 (SPEC §2.1): las siete están pendientes de confirmar.

**Alcance.** El tren es **W0 + Ola A**: puntos 1 (ciclo), 4 (hero A/B) y 3 (salud). El **punto 2 (FC
de toda la sesión) SALE de este tren**: es AGREGA y no ARREGLA, en LIVE hay 0 series con
`metadata.hr` en 90 días y depende de saber qué banda usa Movens. Su diseño queda escrito en el SPEC
como plan aparte, y ese plan arranca preguntándole a Movens. No hay Ola B.

**Regla de las cuatro superficies.** Todo mockup, criterio de aceptación y punto de QA nombra su
superficie y cubre las cuatro: **web móvil/PWA · web desktop (≥ `md`) · app iOS · app Android**. 6
de los 10 alumnos de Movens entrenan por web. La hoja «Ya hiciste» tiene dos formas en la web:
bottom sheet en móvil y **modal centrado en `md+`** (`WorkoutDoneSheet.tsx:70`).

## 0. Orden, olas y estimación

```text
W0  CI verde (prerrequisito, commit propio)                                  0,5 h-a
│
└─ OLA A — sin base de datos · deploy web + OTA                             18-24 h-a
    W1 motor del ciclo (P1) + buildHealthIntakeView (P3)                       4-6
    ├─► W2 app RN (P4, P1 hoja + banner + arranque, P3 Salud, H1)              7-9
    └─► W3 web    (P1 hoja + banner + arranque, P3 Salud, candados)            4-5
    W4 juicio + gates + deploy web + OTA 1.1.3 y 1.1.2 + QA owner              3-4
```

- **Total: 18-25 h-agente con Q7-A; 15-21 con Q7-B.** Es la única estimación válida: el SPEC, TASKS
  y el artifact dicen estos mismos números. Subió respecto del borrador porque entraron W2.0 (upsert
  del alta), el fixture de W1.3b (~32 filas de log a mano), los candados de W3.4, las cuentas de QA
  de W4.8b y, si el owner elige Q7-A, el arranque en el paso 0 (+3-4 h).
- Orden duro: W1 → (W2 ‖ W3) → W4.
- **W0 no bloquea los tests.** El job `unit` (`ci.yml:75`, comando en `:96`) y el job `hygiene`
  (`ci.yml:98`) corren **sin `needs`**, así que `cycle-cursor.test.ts`, `tests/mobile/*` y
  `heroComplianceBundle.test.ts` se ejecutan hoy en CI aunque `quality` esté rojo. Lo que W0
  destraba es `lint` (`ci.yml:56`), `typecheck` (`:57`) y `check:tokens` (`:59`), que nunca llegan a
  correr porque `docs:check` (`:51`) corta antes. Va primero como higiene, no como bloqueo duro.
- **Causa real del enlace roto:** `apps/mobile/AGENTS.md` **no está versionado** (`.gitignore:2`),
  así que existe en disco y no en el runner; por eso `pnpm docs:check` pasa en local y falla en CI.
  El fix es sacar el link markdown de `docs/specs/meta-app-events-ios/SPEC.md:61` y dejar la ruta en
  backticks, como ya hace `:181`. **No se toca `.gitignore`**: versionar `AGENTS.md` es decisión del
  owner, no de este tren.
- **W0 suma podar `docs/status/CURRENT.md`:** pesa 16 365 B contra el tope de 16 384 B de
  `docs:check` ⇒ 19 bytes de margen, y W4 tiene que escribir estado ahí.

## 1. Mockups que el owner aprueba ANTES de UI

Los hace el jefe, contra componentes y tokens existentes del EVA DS, **fieles al código** (regla del
owner: diseño contra el CÓDIGO). Ningún worker de UI arranca sin el OK del mockup que le toca.

| # | Mockup | Superficies que dibuja | Espera |
|---|---|---|---|
| M1 | Hoja «Ya hiciste». Título **sin cambio** («Ya hiciste este entrenamiento», web `WorkoutDoneSheet.tsx:22` y RN literal `ActiveProgramSection.tsx:301`), con `plan.title · Día A` y la fecha debajo. Primaria «Entrenarlo hoy» con la jerarquía que la web YA tiene (`border-2 border-sport-500/55 bg-sport-100/60` + tile `bg-sport-500/18` + ícono + chevron); secundaria «Corregir registros del {16 sept}» neutra (`border-subtle bg-surface-card` + tile `bg-surface-sunken`). **Se conservan íconos y chevrons.** En RN hoy las dos opciones son byte-idénticas (`:331`, `:355`): M1 **define** la jerarquía | app (bottom sheet) + web desktop (modal centrado `md+`); web móvil = igual que app | W2, W3 |
| M2 | Banner del modo corrección: **neutro y full-bleed como hoy** (RN `RecoveryBanner.tsx:84-100`, web `WorkoutExecutionClient.tsx:3222-3243`). Nada de ámbar: ese tono es de «Recuperando». Título «Corrigiendo el {martes 16 sept}», sub «No cuenta como entreno de hoy», acción «Entrenar hoy» como botón texto a la derecha, antes de la X | app + web móvil + web desktop | W2, W3 |
| M3 | Tarjeta «Salud» de solo lectura. Pie «Actualizado el {12 sept}», **sin autoría** y **sin chip «Lesión informada»**; texto completo, **sin «ver más»** | RN con lesiones · RN sin ficha · web desktop en su columna real (COL DER de `ProfileOverviewB3.tsx:443`, con Hábitos diarios y Último check-in debajo) · web móvil apilada | W2, W3 |
| M4 | Punto 4, dos frames **fieles**: (a) hero RN de un día con plan — eyebrow «Hoy entrenas» (`HeroSection.tsx:192`), título `plan.title`, sub «N ejercicios · M series» (`:198`), badge «Semana 2 de 8 · Sem B» debajo (`ActiveProgramSection.tsx:151-156`): Antes «Pierna A» (bug) / Después «Pierna B»; (b) `RestDayCard` un martes de un Lun/Mié/Vie: Antes «Próximo: Pierna A · Lun» (bug) / Después «Próximo: Torso B · Jue» | app iOS + Android. Web móvil y desktop: **sin cambio**, ya son correctas | W2 |

Nada de «Hoy · Semana B», «Prescrito para semana A» ni «Próximo» dentro del hero de un día con plan:
esa UI no existe y este tren no la construye.

## 2. Reparto de archivos — ningún archivo en dos workers de la misma ola

| Worker | Modelo | Escribe SOLO en | Archivos |
|---|---|---|---|
| W0 | Sonnet | docs + workflow | `docs/specs/meta-app-events-ios/SPEC.md` (`:61`), `.github/workflows/ios-upload-ipa.yml` (`:51-53`), `docs/status/CURRENT.md` (poda) |
| W1 | Sonnet | `packages/workout-engine/*`, `packages/profile-analytics/*` | `cycle-cursor.ts`, `cycle-cursor.test.ts`, `cycle-cursor.fixtures.ts`, `cycle-completions.test.ts` (solo si el fixture lo pone rojo); `health-intake.ts` (nuevo), `health-intake.test.ts` (nuevo), `index.ts` |
| W2 | Opus | `apps/mobile/**`, `tests/mobile/**` | `app/alumno/(tabs)/home.tsx`, `components/alumno/home/hero-plans.ts` (nuevo), `components/alumno/home/ActiveProgramSection.tsx`, `components/alumno/workout/RecoveryBanner.tsx`, `components/alumno/workout/v3/ExecutorV3.tsx` (tira semanal, acción del banner y arranque en paso 0 `:2254`), `components/coach/clientDetail/OverviewTab.tsx`, `lib/coach-client-detail.ts`, **`lib/alumno-onboarding.ts`**, `tests/mobile/home-hero-ab.test.ts` (nuevo), `tests/mobile/cycle-cursor-parity.test.ts`, `tests/mobile/executor-v3-weekly-streak.test.ts` |
| W3 | Opus | `apps/web/**` | `dashboard/_components/program/WorkoutDoneSheet.tsx`, `WorkoutPlanCard.tsx`, `WorkoutPlanCard.test.tsx`, `workout/[planId]/WorkoutExecutionClient.tsx` (banner, eyebrow y arranque en paso 0 `:1862`), `dashboard/_data/weekPendingWorkouts.test.ts`, `dashboard/_data/heroComplianceBundle.test.ts`, `coach/clients/[clientId]/ClientProfileDashboard.tsx`, `ProfileOverviewB3.tsx` |

Rutas web con base `apps/web/src/app/c/[coach_slug]/` salvo las de `coach/clients/`, que cuelgan de
`apps/web/src/app/`. El jefe (W4) solo toca docs de estado (`docs/status/CURRENT.md`,
`docs/status/MOBILE_PARITY.md`, `docs/operations/MOBILE_RELEASES_OTA.md`) y este SDD; `CURRENT.md`
lo tocan W0 y W4, pero en waves distintas y secuenciales.

**H1 — W2 suma el arreglo del alta RN (BLOQUEA).** `apps/mobile/lib/alumno-onboarding.ts:45` escribe
el intake con `.insert()` y `:56` se traga el `23505`. Si el coach ya creó la fila placeholder, las
lesiones y condiciones que el alumno escribe **en la app** se pierden en silencio y la tarjeta Salud
del punto 3 diría «aún no completa su ficha» sobre un alumno que sí las cargó. Pasa a
`upsert({ … }, { onConflict: 'client_id' })`, exactamente como la web
(`apps/web/src/app/c/[coach_slug]/onboarding/_actions/onboarding.actions.ts:46-57`). Una línea, sin
migración, misma OTA; el objeto no incluye `sex`, así que el upsert no pisa lo que puso el coach.
Hoy 0 casos en LIVE, pero es pérdida silenciosa de dato sensible.

## 3. Gates por wave (comandos reales)

Scripts verificados en `package.json` raíz y `apps/web/package.json`. `apps/mobile` y los paquetes
no tienen script de typecheck propio: se usa `exec tsc`.

**`pnpm test` NO se usa como gate.** `package.json:14` es `"test": "vitest"` **sin `run`** y
`vitest.config.ts` no fija `watch: false` ⇒ fuera de CI arranca en modo watch y no termina nunca. El
comando correcto en todas las filas es `pnpm vitest run` (el CI no sufre el problema porque el job
`unit` usa `npx vitest run --shard=…`, `ci.yml:96`).

| Wave | Gate | Comando |
|---|---|---|
| W0 | Docs y workflows | `pnpm docs:check` · actionlint 1.7.12 local o el job `hygiene` de CI (`ci.yml:98`) |
| W1 | Motor + salud | `pnpm vitest run packages/workout-engine packages/profile-analytics` |
| W1 | Cruces del fixture (H6) | `pnpm vitest run tests/mobile/cycle-cursor-parity.test.ts packages/workout-engine/cycle-completions.test.ts` |
| W2 | RN | `pnpm vitest run tests/mobile` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint:mobile` |
| W3 | Web | `pnpm vitest run "apps/web/src/app/c/[coach_slug]/dashboard" "apps/web/src/app/coach/clients"` · `pnpm typecheck` |
| W4 | Cierre de ola | `pnpm vitest run` · `pnpm typecheck` · `pnpm --filter @eva/mobile exec tsc --noEmit` · `pnpm lint` · `pnpm lint:mobile` · `pnpm check:tokens` · `pnpm docs:check` · `pnpm build` · `pnpm --filter @eva/mobile exec expo export --platform android` |
| W4 | E2E (solo al cierre, regla del owner) | `pnpm qa:prod:suave` tras el deploy |

El gate extra de W1 existe porque `CYCLE_CURSOR_FIXTURES`
(`packages/workout-engine/cycle-cursor.fixtures.ts`) lo consumen tres suites y el gate de paquetes
solo ve una: `cycle-completions.test.ts` impone que el fixture se escriba como **filas de log
crudas** (`CycleCompletionLogRow` con `block_id`, `set_number`, `logged_at` a mediodía UTC y
`workout_blocks.plan_id`) más `blocksByPlan`, y verifica `expectedCompletions` /
`expectedInProgress`; y `tests/mobile/cycle-cursor-parity.test.ts` vive en el project
`tests/mobile`, excluido de los projects `web-*`. Sin esas dos, W1 cierra en verde y deja roja la
paridad web ↔ RN, que es archivo de W2.

Ningún gate se declara verde sin ejecución real; el resultado (archivos/tests/errores) queda anotado
en TASKS al marcar el checkbox.

## 4. Qué no se rompe y cómo se prueba

| Invariante | Cómo se garantiza |
|---|---|
| D1 y R1 intactos: `todayPlanId`, `nextPlanId`, `todayState`, `programState`, `lastCompleted` iguales byte a byte | Solo cambia el `.map` de `slots` (`packages/workout-engine/cycle-cursor.ts:326-334`). **Guarda única (una sola definición en los tres .md):** snapshot escrito a mano de la salida **sin `slots`** de `resolveCycleModeCursor` para C1–C23 y los 4 fixtures existentes, comparado byte a byte tras el cambio. Los casos nuevos (C24+) validan `slots`, no la guarda |
| Exactamente una tarjeta «Hoy» si `todayState !== 'done'`; ninguna si ya cerró hoy | INV-1 e INV-2 en bucle sobre todos los casos de `cycle-cursor.test.ts` |
| **INV-4 — determinismo: la salida no depende del orden de entrada** | El motor ordena internamente las completitudes utilizables por `(dateIso desc, cycleIndex desc)` antes de elegir `L` y recorrer la cadena. Hace falta porque el productor desempata la misma fecha por `planId.localeCompare` (`packages/workout-engine/cycle-completions.ts:202`) mientras el motor elige la cabeza por «empate ⇒ mayor índice» (`cycle-cursor.ts:286`): con dos días cerrados el mismo día, hoy la tira depende del UUID. En LIVE hay **10 fechas con 2+ planes del mismo ciclo el mismo día, en 5 alumnos de 5 coaches**. Test: misma entrada **barajada** ⇒ mismos `slots` (permutaciones) |
| Paridad web ↔ RN del ciclo | Fixture «2.ª vuelta» en `cycle-cursor.fixtures.ts` corre en `tests/mobile/cycle-cursor-parity.test.ts:62-90` (compara `slots`) |
| Guardado de series, rutas `?fecha=` y `?repetir=` sin cambios | P1 solo toca copy/orden de la hoja y el banner; cero diff en `executor-recovery.ts`, `workout-execution.queries.ts`, `workout-session.ts` y la cola offline |
| **Q7-A toca solo el arranque inicial del ejecutor** | Cambian `WorkoutExecutionClient.tsx:1862` y `ExecutorV3.tsx:2254`. **No** se tocan los cuatro usos de auto-avance/toggle (`:1906`, `:2076`; `:2318`, `:2360`), que son los que mueven el paso tras registrar una serie. Si Q7 queda en B, estas dos líneas no se tocan y el copy del banner lo dice |
| Caso «hecho HOY»: la hoja sigue con «Revisar y editar» sola | `showRepeat` falso cuando la sesión es de hoy (`ActiveProgramSection.tsx:283`, web `WorkoutPlanCard.tsx:256`), cubierto en `WorkoutPlanCard.test.tsx`. Lo que cambia con Q7-A es a dónde lleva: el ejecutor abre en el primer ejercicio en vez de saltar al último paso (`workout-stepper.ts:86-90`) |
| Ciclo y `todayPlan` del semanal: hero igual que hoy | `tests/mobile/home-hero-ab.test.ts` con `ab_mode=false` y con `CYCLE_CURSOR_FIXTURES` |
| **«Próximo» del semanal SÍ cambia (arreglo, no regresión)** | RN ya gatea «Próximo» igual que la web: `HeroSection.tsx:94` corta con `if (todayPlan)` y `WorkoutHero` no recibe `nextPlan`; «Próximo» se pinta solo en `RestDayCard` (`:404-414`), o sea los días **sin** plan. El bug está ahí: `home.tsx:407-409` con `todayPlan` nulo devuelve `plans[0]` de una lista ordenada por `day_of_week` (`:267`) ⇒ un martes de un Lun/Mié/Vie dice «Próximo: el del lunes», un día que ya pasó. Con Q5-A dice «Mié», y sábado/domingo pasa a «Recupera bien…» porque `resolveWeeklyCursor` no da la vuelta (`cycle-cursor.ts:249`). Visible en **249 programas `weekly` activos**. Casos en `home-hero-ab.test.ts` + QA de martes/jueves y sábado/domingo. **Depende de Q5** |
| Web ya correcta en A/B, ahora con candado | Caso `ab_mode: true` nuevo en `heroComplianceBundle.test.ts` (hoy solo `:74`, `:218` con `false`) |
| CA4.5 vive en **una** suite | `tests/mobile/home-hero-ab.test.ts`. La tira semanal del ejecutor es **CA4.7** y se prueba aparte, en `tests/mobile/executor-v3-weekly-streak.test.ts`, con su propio punto de QA |
| Tercera superficie que lee `slots` (candado, no UI) | `heroComplianceBundle.ts:283-292` arma `HeroCycleView.slots` y lo serializa al cliente (**`:327`**); hoy ningún componente lo pinta, pero `heroComplianceBundle.test.ts:272`, `:310` y `:359` afirman sobre esos slots. Archivo de W3, cambio de W1: el rojo aparece ahí. W4.1 lo revisa |
| Datos de salud nunca a PostHog/Pixel/Sentry | P3 no agrega eventos; revisión de diff en W4 con grep de `captureAppEvent`/`posthog`/`Sentry` en los archivos tocados |
| Quién ve la salud del alumno | Sin cambio de RLS: `client_intake_coach` (`supabase/migrations/00000000000001_baseline.sql:2833-2837`) **más** `team_client_intake_member_all` (`supabase/migrations/20260609160000_team_rls_optimized.sql:113-116`, `FOR ALL`): los miembros activos del team leen y escriben. Hoy **0 alumnos con `team_id`** en LIVE ⇒ riesgo teórico. Decidir si el team debe ver salud queda en pendientes |
| OTA sin nativo | W4 verifica que el diff no toca `package.json`, lockfile, `app.json`, `eas.json` ni `plugins/` |

## 5. Deploy y OTA

### 5.1 Web
`master` = `rnmobiledenuevo`. Push a `master` ⇒ deploy de Vercel; esperar READY antes de las OTAs
(orden de trenes anteriores, `docs/operations/MOBILE_RELEASES_OTA.md:71`).

### 5.2 OTA runtime 1.1.3 (iOS) desde `master`
`mobile-ota.yml` es `workflow_dispatch` con inputs `platform` (android | ios, nunca `all`),
`message` y `branch=production`. Correr desde `master` con `platform=ios`. Android 1.1.3 no existe
(no hay binario): no se publica.

### 5.3 OTA runtime 1.1.2 (Android + flota iOS 1.1.2) desde un tag
`master` tiene `app.json` en `1.1.3` (`apps/mobile/app.json:6`, con el SDK nativo de Meta), así que
1.1.2 sale de una rama/tag aparte. Procedimiento real del 16-09 (`MOBILE_RELEASES_OTA.md:71`): tag
`ota/1.1.2-20260916` = `64ad9615`, base `55c3568e` (último `master` con `app.json` en 1.1.2) + solo
los archivos móviles y de paquetes del tren, sin Meta.

1. Rama local desde `ota/1.1.2-20260916`.
2. `git cherry-pick 90d79075` (arreglo del menú de dunning, hoy ausente en 1.1.2). Verificado: sus 5
   archivos móviles/paquete (`packages/coach-nav/nav.ts`, `nav.test.ts`,
   `apps/mobile/lib/coach-access.ts`, `coach-nav-state.ts`,
   `apps/mobile/app/coach/(tabs)/subscription.tsx`) son idénticos entre el tag y `90d79075^` ⇒ entra
   limpio. Los archivos web del commit no afectan al bundle.
3. Cherry-pick de los commits del tren **limitados a `apps/mobile/`, `packages/` y
   `tests/mobile/`**. Verificado: todos los archivos de Ola A son hoy idénticos entre el tag y HEAD.
4. Confirmar `apps/mobile/app.json` sigue en `1.1.2` y sin plugin de Meta; si cambió un
   `package.json`, `pnpm install --lockfile-only`.
5. Gates en la rama: `tsc` mobile + `pnpm vitest run tests/mobile packages` + `expo export`.
6. Tag nuevo `ota/1.1.2-AAAAMMDD`, push del tag y `mobile-ota.yml` con «Use workflow from» = el tag,
   una vez `android` y otra `ios`.
7. Gotcha conocido: el clasificador de auto-mode bloquea commits/pull en rutas con «ota»; pedir
   permiso y reintentar.

### 5.4 Migraciones
**Este tren no lleva ninguna.** La tabla `workout_session_hr` y su DDL (con el `revoke delete` que
le faltaba) se van con el plan aparte del punto 2; su procedimiento —EXPLAIN, transacción con
ROLLBACK, matriz RLS con JWT reales, purge de cuenta— queda escrito en el SPEC.

## 6. Rollback

| Qué | Cómo |
|---|---|
| W0 (enlace, shell del workflow, poda de `CURRENT.md`) | `git revert` del commit; no toca producción |
| Ola A — web (hoja, banner, arranque, tarjeta Salud, slots del ciclo) | Promote del deploy anterior en Vercel (instantáneo) + `git revert` |
| Ola A — app (mismo alcance + upsert del alta) | Republicar por `mobile-ota.yml` el commit anterior (1.1.3 desde `master` revertido; 1.1.2 desde el tag previo `ota/1.1.2-20260916`, que ya incluye todo lo vigente salvo dunning) |

Ola A no tiene estado persistente nuevo: revertir es volver a pintar como antes, sin datos que
migrar. El único cambio con efecto en datos es el upsert de H1, y su reversión no borra nada.

## 7. Cuentas de QA — se preparan ANTES del QA del owner

El QA de SPEC §8 exige estados que hoy no existen y que no se improvisan la noche del deploy. Tarea
propia de W4, **siempre sobre cuentas de prueba, nunca sobre coaches ni alumnos reales**. Los
estados se citan **por nombre**, no por número de punto, para que no se desincronicen con el SPEC:

| Estado necesario | Para qué puntos del QA | Qué hay que dejar armado |
|---|---|---|
| Ciclo de 2 en **2.ª vuelta** | todos los del **punto 1** (ciclo), incluidos «Entrenarlo hoy», «en progreso sobre día hecho esta ronda» y «entrené hoy y vuelvo a abrirlo» | Alumno de prueba con programa `cycle` de 2 planes y **dos días cerrados al 100 % de series** en fechas pasadas (`packages/workout-engine/cycle-completions.ts:192-199`: nada por debajo del 100 % cuenta), dentro de la ventana de 30 días (`cycle-cursor.ts:120`) |
| Semanal **A/B en semana B** | los del **punto 4** de A/B (hero y tira del ejecutor), solo app | Programa `weekly` con `ab_mode=true`, planes A y B reales y `start_date` en una semana par según `apps/mobile/lib/program-week-variant.ts:7-21`, con `weeks_to_repeat` vigente |
| Semanal **sin A/B, Lun/Mié/Vie** | el del **punto 4** de «Próximo» (martes/jueves y sábado/domingo) | Programa `weekly` corriente con planes en lunes, miércoles y viernes; se mira un martes o jueves y un sábado o domingo |
| Alumno **con lesiones** y alumno **sin ficha** | los del **punto 3** (salud) | Uno con `injuries` y `medical_conditions` con texto; otro con fila placeholder (`goals`/`experience_level`/`availability` = `''`) o sin fila de `client_intake` |

Se anota en TASKS qué cuenta, qué programa y qué fechas se usaron, y quién lo dejó armado.
