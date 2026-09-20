---
status: active
owner: product-engineering
last_verified: "2026-09-20"
canonical: false
---

# SPEC — Vuelta nueva, salud y reloj

> Feedback del coach **Movens** del 19-09 (3 puntos) + un 4.º bug hallado al investigar. Hereda
> [ciclo-real-y-por-lado](../ciclo-real-y-por-lado/SPEC.md) y **no reabre D1 ni R1** (§2.2).
> Ejecución en [PLAN.md](PLAN.md); tareas y pendientes en [TASKS.md](TASKS.md). Verificado contra
> HEAD `67180893` (`rnmobiledenuevo`) y contra LIVE el 20-09. **El tren son 3 puntos: 1, 4 y 3.** El
> punto 2 (FC de toda la sesión) queda escrito en §6 como plan aparte y no se implementa acá.

## 0. Resumen

| # | Punto | Tipo | Dónde | Alcance real en LIVE (20-09) | Estado |
|---|---|---|---|---|---|
| 1 | Desde la 2.ª ronda del ciclo todas las tarjetas dicen «Hecho» y el alumno termina corrigiendo la semana pasada | Bug | Motor compartido ⇒ web + app | 19 programas `cycle` activos con alumno, de 10 coaches | En el tren |
| 4 | En semanales A/B la app muestra el entreno de la otra semana, y en los días de descanso anuncia un día que ya pasó | Bug | Solo app | 28 `weekly` con `ab_mode=true` activos: **10 con alumno activo**, **6 con plan B real**, **3 coaches**. El arreglo de «Próximo» (Q5-A) toca a los **249 `weekly` activos** | En el tren |
| 3 | Las lesiones y condiciones médicas que el alumno cargó al registrarse no se ven en la ficha | Hueco | Ficha del coach, web + app | 75 intakes con salud (6 de los 10 alumnos de Movens); **0 fichas placeholder con lesiones** | En el tren |
| 2 | La FC de la banda/reloj solo se mide en los bloques de cardio, no en toda la sesión | Feature | App + ficha coach + 1 tabla | **0 series con `metadata.hr` en 90 días** (métrica ciega, §6) | **Fuera del tren** (§6) |

- **Una sola ola, sin base de datos:** deploy web + OTA a runtimes 1.1.3 (master) y 1.1.2 (tag).
- **El punto 2 sale del tren** (Q3): es AGREGA y no ARREGLA y depende de una respuesta que no
  tenemos. §6 conserva flujo, DDL y límites, y suma un ARREGLA chico que sale de ahí (el promedio de
  FC contaminado entre bloques).
- **Prerrequisito W0:** CI de master verde. `docs:check` falla **solo en el runner** porque
  `docs/specs/meta-app-events-ios/SPEC.md` enlaza `apps/mobile/AGENTS.md`, que no está versionado
  (`.gitignore:2`): el arreglo es sacar el link markdown y dejar la ruta en backticks, no tocar
  `.gitignore`. `hygiene` falla por shellcheck en `.github/workflows/ios-upload-ipa.yml`.
- **Tamaño, una sola cifra:** W0 0,5 · W1 4-6 · W2 7-9 · W3 4-5 · W4 3-4 ⇒ **18-25 h-agente** (con
  Q7-B: 15-21). La misma cifra va en PLAN, TASKS y el artifact.
- Nada se implementa hasta el OK del owner a **Q1–Q7** (§2.1) y a los mockups.

### 0.1 Regla de las cuatro superficies

Todo mockup, criterio de aceptación y punto de QA nombra su superficie y cubre las cuatro: **web
móvil/PWA · web desktop (≥ md) · app iOS · app Android**. 6 de los 10 alumnos de Movens entrenan por
web: «lo probamos en el iPhone» no alcanza. Cada punto lleva su cuadro «Superficies». Copy de estado
de tarjeta: **«Hoy» / «Hecho {fecha}» / «Próximo»**; la palabra «Después» no existe en el producto
(`ActiveProgramSection.tsx:479-486`, `WorkoutPlanCard.tsx:98-107`) y no se introduce.

## 1. El problema en humano

**Punto 1 — «Ya existe» y la pantalla muerta.** Los programas de Movens son ciclos («Día A / Día B»).
La app pinta «Hecho» si ese día se hizo **alguna vez en los últimos 30 días**, no si se hizo **en esta
ronda**: desde la 2.ª ronda todas quedan «Hecho» y ninguna «Hoy», y al tocarlas sale «Ya hiciste este
entrenamiento». Sobre la segunda mitad de la queja («les deja repetir el día pero no les muestra
ejercicios ni tiempos») hay que ser exactos, porque de esto depende el aviso:

- **«Repetir hoy» (`?repetir=`) sí funciona:** el día sembrado entra por `defaultValue`, no como
  `logs` (web `workout-execution.queries.ts:172-177`, la serie **no** queda registrada; RN
  `ExecutorV3.tsx:415/760/1053`) ⇒ hay serie activa y hay reloj.
- **El camino roto es «Revisar y editar» (`?fecha=`):** carga los logs de ese día, están todas las
  series ⇒ `firstIncompleteStepIndex` devuelve el último paso (`workout-stepper.ts:86-90`), sin serie
  activa ni reloj.
- **El mismo síntoma aparece sin `?fecha=`, en el día hecho HOY:** esa hoja ofrece una sola acción,
  «Revisar y editar» (`ActiveProgramSection.tsx:283`, `WorkoutPlanCard.tsx:256`), que abre la sesión
  de hoy con todo registrado. Tras el arreglo del ciclo ese pasa a ser el camino frecuente. Es lo que
  decide Q7.

Evidencia: una alumna repitió Día A el 11-09 y Día B el 17-09 (23 series en 4 min); PostHog registra
aperturas con `fecha=` y `repetir=` en `/c/movens/` esos días.

**Punto 4 — Semanal A/B.** El hero busca el plan del día sobre **todos** los planes, sin mirar si toca
semana A o B, mientras la web y las tarjetas de abajo sí filtran (10 programas con alumno activo, 3
coaches; no Movens). Y hay un segundo bug más ancho: en los **días de descanso** la app anuncia como
«Próximo» el primer entreno de la semana aunque ya haya pasado (§4). Eso toca a los **249 `weekly`
activos**.

**Punto 3 — Lesiones invisibles.** El alumno llena «Salud y seguridad» al registrarse y se guarda en
`client_intake`, pero la ficha del coach no lo muestra: en web solo dentro del modal «Editar datos»
del listado, y en la app en ningún lado. En Movens, 6 de 10 cargaron lesiones y 3, condiciones
médicas.

## 2. Decisiones

### 2.1 Pendientes del owner (Q1–Q7) — ninguna está cerrada

Texto único: estas siete filas son idénticas, palabra por palabra, en TASKS «Bloqueos» y en el
artifact. **Todas pendientes de confirmar.**

| Q | Pregunta | A | B | Rec. |
|---|---|---|---|---|
| Q1 | ¿Cada semana debe empezar en A? | No cambiar la regla del ciclo: el que toca es el siguiente al último hecho. Si el alumno quiere A, toca A y elige «Entrenarlo hoy». | Agregar por programa «reiniciar el ciclo cada lunes» (8-12 h, cambia la regla, migración). | **A** |
| Q2 | Textos de la hoja «Ya hiciste» | «Entrenarlo hoy» destacada, «Corregir registros del {fecha}» secundaria, banner claro en corrección. Título sin cambio. | Solo arreglar el fondo; textos como están. | **A** |
| Q3 | ¿El pulso de toda la sesión sale de este tren? | Sí: plan aparte, y lo primero es preguntarle a Gerardo (banda dentro de EVA o en el reloj, marca, teléfono/reloj de sus alumnos). | No: entra acá con tabla nueva y prueba de banda real (+15-19 h). | **A** (existe una C escrita en el SPEC: solo import del reloj a nivel sesión) |
| Q4 | Alcance de «Salud» | Tarjeta de solo lectura en la ficha, web y app. | Además ícono en la lista de alumnos y salud en el informe. | **A** |
| Q5 | «Próximo» en los días de descanso | Arreglarlo: hoy la app muestra el primer entreno de la semana aunque ya pasó; pasa a mostrar el siguiente de esta semana y, tras el último, «Recupera bien…». Igual que la web. Visible en los 249 programas semanales. | Dejarlo como está. | **A** |
| Q6 | Días de la ronda anterior | Quedan como «Próximo», y tocarlos arranca esa sesión (es cómo funciona un ciclo). | Agregar una salida explícita para corregir una sesión de la ronda anterior (más UI, otro mockup). | **A** |
| Q7 | Cuando todo está registrado (día hecho hoy o corregir un día pasado) | Arreglarlo en este tren: el ejecutor abre en el primer ejercicio con series y reloj (+3-4 h). | Dejarlo para después; el aviso a Gerardo no dirá «arreglado». | **A** |

> **Decidido por el owner el 20-09 (tarde): A en las siete (Q1–Q7).** El tren queda en W0 + Ola A
> con Q7-A incluido (18-25 h-agente). Los mockups del artifact
> `https://claude.ai/artifact/BkBoXVKk3CoBgirD9FVZ1g` (M1–M4) quedan aprobados en la misma
> respuesta: una sola aprobación, regla del owner. Nada más se decide antes de construir.

Alcance exacto de Q7-A: solo el **arranque inicial** del ejecutor, web
`WorkoutExecutionClient.tsx:1862` y RN `ExecutorV3.tsx:2254`. Los cuatro usos de auto-avance y toggle
(web `:1906`, `:2076`; RN `:2318`, `:2360`) **no se tocan**.

### 2.2 Heredadas — NO se reabren

**D1** (ciclo-real): «hoy toca» = día siguiente al último completado; cursor por completitud, nunca
por calendario. No se tocan `todayPlanId`, `nextPlanId`, `todayState`, `programState` ni
`lastCompleted` (solo se reabre con Q1-B). **R1**: racha de ciclo en SQL. Un día cuenta como
completado solo al 100 % de series (`packages/workout-engine/cycle-completions.ts:192-199`). Reglas
del owner: ARREGLA > AGREGA · mockup aprobado antes de UI · paridad en las cuatro superficies (§0.1)
· nada por tier · diseño contra el código (EVA DS existente).

## 3. Punto 1 — Ciclo: tarjetas por ronda

### 3.1 Causa

`packages/workout-engine/cycle-cursor.ts:276-289` llena `doneDateByPlan` con cualquier completitud
dentro de `CYCLE_CURSOR_WINDOW_DAYS = 30` (`:120`) y el `.map` de `slots` (`:326-334`) aplica «`done`
gana a `today`». El cursor está bien; miente la tira de tarjetas. Superficies que leen `slots`:
**tres**, no dos — web `weekPendingWorkouts.ts:482-486`, app `home.tsx:467-487` y el bundle del hero
web `heroComplianceBundle.ts:283-292`, serializado al cliente en `:327`. La tercera hoy no se pinta
(carga muerta), pero `heroComplianceBundle.test.ts` afirma sobre esos slots (`:272`, `:310`, `:359`)
⇒ candado obligatorio al cerrar la ola.

### 3.2 Regla de slots (comportamiento esperado)

Helper interno nuevo `currentLapDoneDates` en `cycle-cursor.ts` (no exportado). Para cada plan del
ciclo: (1) si es el plan de hoy **y** `todayState !== 'done'` ⇒ `today` (gana siempre; también
arregla el «Ya hiciste» que hoy aparece a mitad de un entreno en progreso sobre un día «hecho»);
(2) si está en la **cadena de la ronda actual** ⇒ `done` con la fecha de esa completitud; (3) si no ⇒
`upcoming`.

**Orden canónico (obligatorio).** Antes de elegir `L` y de recorrer la cadena, el motor **ordena
internamente** las completitudes utilizables por `(dateIso desc, cycleIndex desc)`. No puede depender
del orden en que llegan: el productor desempata la misma fecha por `planId.localeCompare`
(`cycle-completions.ts:202`) y la elección de `L` desempata «empate ⇒ mayor índice»
(`cycle-cursor.ts:286`). Sin orden canónico, con dos días cerrados la misma fecha el resultado lo
decide un UUID. En LIVE hay **10 fechas con 2+ planes del mismo ciclo el mismo día, en 5 alumnos de 5
coaches** (incluida la alumna de Movens del 17-09).

**Ronda actual:** con `L` = última completitud (ya bajo el orden canónico) y `T` = día que calcula el
cursor **antes del override de `inProgress`**: si `todayState !== 'done'` y `T.index <= L.index`, el
ciclo dio la vuelta ⇒ ningún `done`. Si no, se recorren las completitudes hacia atrás desde `L`
aceptando índices estrictamente menores, saltando repeticiones del mismo índice (queda la fecha más
reciente) y cortando en el primer índice mayor.

### 3.3 Tabla de verdad

`H` = done · `▶` = today · `·` = upcoming. El cursor es idéntico antes y después.

| Ciclo | Caso | Completitudes | Hoy toca | Antes | Después |
|---|---|---|---|---|---|
| 2 | 1.ª ronda incompleta (el «empieza por B» de Movens) | `[A@d1]` | B | A H · B ▶ | igual |
| 2 | 2.ª inicio | `[A@d1,B@d2]` | A | **A H · B H (sin «Hoy»)** | A ▶ · B · |
| 2 | 2.ª ronda | `[…,A@d3]` | B | **A H · B H** | A H(d3) · B ▶ |
| 2 | 3.ª ronda | `[…,B@d4,A@d5]` | B | **A H · B H** | A H(d5) · B ▶ |
| 3 | 1.ª cerrada hoy | `[1,2,3@hoy]` | 3 hecho | 1H 2H 3H | igual |
| 3 | 2.ª inicio | `[1,2,3]` | 1 | **1H 2H 3H** | 1▶ 2· 3· |
| 3 | 2.ª ronda | `[1,2,3,1@d4]` | 2 | **1H 2H 3H** | 1H(d4) 2▶ 3· |
| 3 | 2.ª hoy cerrado | `[1,2,3,1@hoy]` | 1 hecho | 1H 2H 3H | 1H(hoy) 2· 3· |
| 3 | 3.ª ronda | `[…,1@d7,2@d8]` | 3 | **todo H** | 1H 2H 3▶ |
| 3 | Salta un día | `[1@lun,3@mar]`, hoy mié | 1 | **1H 2· 3H, sin «Hoy»** | 1▶ 2· 3· |
| 3 | Repite el mismo día | `[1@lun,1@mar]` | 2 | 1H 2▶ 3· | 1H(mar) 2▶ 3· |
| 3 | En progreso HOY sobre día hecho la ronda **anterior** | `[1,2,3]` + parcial de 1 hoy | 1 | **1H 2H 3H; web sin tarjeta en progreso; app abre «Ya hiciste» a mitad de entreno** | 1▶(en progreso) 2· 3· |
| 3 | **En progreso HOY sobre día hecho en ESTA ronda** (wrap con `T` pre-override) | `[1@d1,2@d2]` + parcial de 1 hoy | `T` = 3 (pre-override) | 1H 2H 3· | **1▶ 2H(d2) 3·**, NO `1▶ 2· 3·` |
| 3 | **«Entrenarlo hoy» sobre un día de esta ronda** | `[1@d1,2@d2,1@hoy]` | 1 hecho | 1H 2H 3· | **1H(hoy) 2· 3·** (la ronda se reinicia) |
| 11 | **Dos días cerrados la misma fecha; el productor manda primero el mayor índice** | `[{4,5,7}@30-07, 5@31-07]`, hoy 01-08 | 6 | 4H 5H 7H (+ resto) | **`done` = {5}**; 4 y 7 pasan a `·` |
| 11 | **Los mismos datos; el productor manda primero el menor índice** | `[{4,5,7}@30-07, 5@31-07]`, hoy 01-08 | 6 | 4H 5H 7H (+ resto) | **`done` = {5}**, idéntico: lo fija el orden canónico |
| 3 | Fuera de orden | `[3@lun,1@mar,2@mié]` | 3 | todo H | 1H 2H 3▶ |
| 3 | Ventana de 30 días | `[2@-31,3@-2]` | 1 | 1▶ 2· 3H | 1▶ 2· 3· |
| 1 | Ciclo de 1 día | `[1@ayer]` | 1 | **1H sin «Hoy»** | 1▶ |
| 3 | Parcial pasado | `[1@lun]` + parcial de 2 el mar | 2 | 1H 2▶ 3· | igual (el parcial no es completitud) |

### 3.4 Qué NO cambia — y qué sí cambia sin ser el arreglo

No cambian: las salidas del cursor fuera de `slots` (`todayPlanId`, `todayCycleIndex`, `todayState`,
`nextPlanId`, `nextCycleIndex`, `lastCompleted`, `programState`), byte a byte con test de guarda; la
rama `weekly` del motor (`cycle-cursor.ts:233-266`), hero, WeekStrip, Momentum, racha SQL, ficha del
coach y crons; las rutas y el guardado de `?fecha=` y `?repetir=`. Consecuencias aceptadas, todas
visibles para el alumno:

1. **Los días de la ronda anterior se abren de un toque, sin hoja** (lo confirma Q6). RN
   `ActiveProgramSection.tsx:105-110`: al sheet solo van `done` o `in_progress && !isToday`; el resto
   va a `onStart` (`:110`). En web igual: `WorkoutPlanCard.tsx:173` y `:194-197`, donde
   `buildWorkoutRepeatHref` sin fecha devuelve la ruta desnuda (`executor-recovery.ts:52-54`).
2. **Se pierde el camino a `?fecha=` desde el inicio, y en web también el dato.** Sin `doneDateIso`
   no hay fecha que abrir (`home.tsx:480`; `weekPendingWorkouts.ts:489`, `dateIso: slot.doneDateIso
   ?? ''`), y el pie de esa celda deja de decir **«Hecho {fecha}»** para decir «Próximo»
   (`WorkoutPlanCard.tsx:98-107`): la misma pantalla pierde el dato y el camino para corregirlo.
3. **«Entrenarlo hoy» reinicia la ronda.** Repetir hoy un día ya hecho en esta ronda mueve `L` a ese
   índice con fecha de hoy ⇒ los otros días cerrados vuelven a «Próximo» (fila de §3.3). Es coherente
   con la regla, pero lo provoca el botón que este tren asciende a primario: se prueba en el QA (§8,
   punto 4).

### 3.5 UX — copy final y jerarquía (una sola fuente)

**El título NO cambia:** «Ya hiciste este entrenamiento» (web `WorkoutDoneSheet.tsx:22`, prop
`heading` con ese default; RN literal en `ActiveProgramSection.tsx:301`), con `plan.title · Día A` y
la fecha debajo, como hoy. La queja «les sale que ya existe» se resuelve porque la hoja **deja de
aparecer** en la ronda nueva; cuando aparece, es verdad. Cambiarlo costaría una prop nueva en RN y no
arregla nada. **Ojo:** `ActiveProgramSection.tsx:301` tiene dos ramas; la de `incomplete`
(«Entrenamiento incompleto») no se toca.

| Elemento | Hoy | Después |
|---|---|---|
| Hoja, título | «Ya hiciste este entrenamiento» | **igual**, con `plan.title · Día A` y la fecha debajo |
| Hoja, primaria (día hecho antes de hoy) | «Revisar y editar» | **«Entrenarlo hoy»** (= `?repetir=`) · sub «Sesión nueva de hoy, con tus valores del {16 sept} ya cargados» · ícono `RotateCcw` |
| Hoja, secundaria | «Repetir hoy» | **«Corregir registros del {16 sept}»** (= `?fecha=`) · sub «Cambia lo que anotaste ese día. No cuenta como entreno de hoy.» · ícono `Pencil`/`SquarePen` |
| Hoja, día hecho HOY | «Revisar y editar» sola | **igual**, sin cambio de orden ni de copy; con Q7-A abre en el primer ejercicio |
| Banner del modo corrección | «Editando registros del {día}» + sub «Corrige tus series de ese dia» | **«Corrigiendo el {martes 16 sept}»** + sub **«No cuenta como entreno de hoy»** + acción **«Entrenar hoy»** |

**Jerarquía = la que la web ya tiene, no relleno sólido.** Primaria `border-2 border-sport-500/55
bg-sport-100/60` + tile `bg-sport-500/18` con ícono + `ChevronRight` (`WorkoutDoneSheet.tsx:88-99`);
secundaria `border border-subtle bg-surface-card` + tile `bg-surface-sunken` (`:106`). En web solo
cambia **cuál de las dos lleva cada tratamiento**. En RN hoy las dos son byte-idénticas
(`ActiveProgramSection.tsx:331`, `:355`): la secundaria pasa a neutra. **Se conservan íconos y
chevrons en las dos.** El banner queda **neutro y full-bleed** como hoy: el ámbar es de «Recuperando».

**Implementación.** RN: `snapPoints={['42%']}` (`ActiveProgramSection.tsx:302`) no alcanza para los
subtítulos nuevos en un iPhone SE ⇒ `dynamicSizing` (o 52 %); el banner formatea con `weekdayEs()`,
que solo da el día de la semana, así que «martes 16 sept» reutiliza `fmtSheetDate`
(`ActiveProgramSection.tsx:18`) — en web ya hay utilidades de fecha. «Entrenar hoy» es un botón de
texto a la derecha, antes de la X, y navega a la ruta del plan **sin** query. Se intercambian
posición y destino: un worker distraído puede renombrar el botón sin mover el query. Archivos: web
`WorkoutDoneSheet.tsx` (`:22`, `:85-120`; props opcionales nuevas, p. ej. `sessionDateLabel`), caller
`WorkoutPlanCard.tsx:229-258`, banner `WorkoutExecutionClient.tsx:3222-3243`, eyebrow `:2959`; app
hoja `ActiveProgramSection.tsx:299-370`, banner `RecoveryBanner.tsx:84-100`.

| Superficies (punto 1) | Qué cambia | QA (§8) |
|---|---|---|
| Web móvil / PWA | Tarjetas del ciclo (`weekPendingWorkouts.ts:482-486` → `WorkoutPlanCard.tsx`); hoja como **bottom sheet**; banner full-bleed (`WorkoutExecutionClient.tsx:3222-3243`) | 1-8 |
| Web desktop (≥ md) | Lo mismo, pero la hoja es **modal centrado** (`WorkoutDoneSheet.tsx:70`, overrides `md:`) | 1, 3, 5, 8 |
| App iOS | `home.tsx:467-487` + `ActiveProgramSection.tsx` (hoja `:299-370`, `snapPoints`), banner `RecoveryBanner.tsx:84-100` | 1-8 |
| App Android | Idéntico a iOS (mismo bundle JS, OTA 1.1.2) | 1-8 |

Mockups obligatorios antes de implementar: hoja en app y en web desktop; banner en app y en web.

### 3.6 Criterios de aceptación

- CA1.1 Ciclo de 2 en 2.ª ronda: A «Hoy», B «Próximo»; tocar A abre el ejecutor con series y reloj;
  al cerrar, hero «Día A hecho · Próximo: Día B».
- CA1.2 Si `todayState !== 'done'`, exactamente un slot `today`; si `'done'`, cero `today` y el de hoy
  es `done` con fecha de hoy; en ronda recién empezada, ningún `done`.
- CA1.3 Día en progreso hoy sobre un día hecho la ronda **anterior**: tarjeta en progreso visible
  (web) y la app no abre «Ya hiciste». Sobre un día hecho en **esta** ronda, ese día sigue `done`.
- CA1.4 Casos C24…C34 + INV-1..4 verdes en `cycle-cursor.test.ts`; C6 ampliado con `slots`; fixture
  «2.ª ronda» verde en `tests/mobile/cycle-cursor-parity.test.ts` y en `cycle-completions.test.ts`.
- CA1.5 Hoja de día pasado: primaria «Entrenarlo hoy», secundaria «Corregir registros del …», con
  íconos y chevrons, en las cuatro superficies (desktop como modal centrado); título sin cambio; día
  hecho hoy sigue sin «Repetir». CA1.6 `heroComplianceBundle.test.ts` sigue verde.
- CA1.7 (solo si Q7-A) Con todas las series registradas, el ejecutor abre en el **primer** ejercicio,
  con serie activa y reloj, tanto en `?fecha=` como en el día hecho hoy.

## 4. Punto 4 — Hero y «Próximo» en la app (solo app)

**Causa.** `apps/mobile/app/alumno/(tabs)/home.tsx:404-409`: en `weekly`, `todayPlan` =
`plans.find(p => p.day_of_week === todayDbDay)` sobre TODOS los planes, sin mirar la variante, aunque
el cursor ya recibe los planes filtrados (`home.tsx:370-394`). Momentum (`:423`) marca planificados de
ambas variantes y la tira semanal del ejecutor (`ExecutorV3.tsx:1725-1784`) tampoco filtra.

**Premisa corregida (importa para Q5).** La app **ya** condiciona «Próximo» igual que la web:
`HeroSection.tsx:94` corta con `if (todayPlan)` y devuelve `WorkoutHero`, que no recibe `nextPlan`;
`nextPlan` se pinta **solo** dentro de `RestDayCard` (`:404-414`), o sea solo los días sin plan. El
bug de Q5 está ahí: con `todayPlan` nulo, `home.tsx:407-409` devuelve `plans[0]` de una lista ordenada
por `day_of_week` (`:267`) ⇒ un martes de un Lun/Mié/Vie el alumno lee «Próximo: <el del lunes> ·
Lun», un día que ya pasó. **Q5-A arregla un bug**, no es solo «alinear con la web». Después de Q5-A:
(a) martes y jueves dicen el siguiente día real; (b) sábado y domingo quedan en «Recupera bien para la
próxima sesión.» (`HeroSection.tsx:414`) porque `resolveWeeklyCursor` no da la vuelta a la semana
(`cycle-cursor.ts:249`), donde hoy mostraban el del lunes; (c) la web se comporta así desde siempre
(`heroComplianceBundle.ts:256`). Visible en los **249 `weekly` activos**.

**Solución.** Backend: nada (el select de `home.tsx` ya trae `ab_mode`, `start_date`,
`weeks_to_repeat` y `week_variant`). Frontend app: helper puro nuevo
`apps/mobile/components/alumno/home/hero-plans.ts` con `selectProgramPlans(plans, program, today)`
(mueve tal cual `home.tsx:370-383`) y `heroPlansFromCursor(cursor, planById)`; hero y «Próximo» leen
del cursor en `weekly` y `cycle`; Momentum sobre `programPlans`; la tira del ejecutor suma `ab_mode,
start_date, weeks_to_repeat` y `week_variant` al select (`ExecutorV3.tsx:1727`) y filtra con
`apps/mobile/lib/program-week-variant.ts`.

**UI/UX.** No hay componentes nuevos, pero **sí lleva mockup** (dos estados visibles, uno sobre 249
programas) y tiene que ser **fiel al código**: (a) hero de un día con plan en semana B = eyebrow «Hoy
entrenas» (`HeroSection.tsx:192`; `heroEyebrow` devuelve `undefined` en `weekly`, `:33`), título
`plan.title`, sub «N ejercicios · M series» (`:198`) y el badge «Semana 2 de 8 · Sem B» debajo
(`ActiveProgramSection.tsx:151-156`) — Antes «Pierna A» (bug) / Después «Pierna B»; (b) `RestDayCard`
un martes — Antes «Próximo: Pierna A · Lun» (bug) / Después «Próximo: Torso B · Jue». **Nada de**
«Hoy · Semana B», «Prescrito para semana A» ni una línea «Próximo» dentro del hero de un día con plan:
esos textos no existen.

| Superficies (punto 4) | Qué cambia | QA (§8) |
|---|---|---|
| App iOS | `home.tsx` (hero, «Próximo», Momentum) + `hero-plans.ts` + tira del ejecutor (`ExecutorV3.tsx:1727`) | 9-12 |
| App Android | Idéntico a iOS | 9-12 |
| Web móvil / PWA | **Sin cambio**: es la referencia de paridad (`heroComplianceBundle.ts:256`) | 9, 10, 11 (comparar) |
| Web desktop | **Sin cambio**, misma referencia | 9 (comparar) |

- CA4.1 Semana B, lunes con plan A y B ⇒ hero = plan B. CA4.2 Semana B, día que solo tiene plan A ⇒
  «Día de descanso». CA4.3 «Próximo» = siguiente día con plan de la variante activa, sin dar la vuelta.
- CA4.4 **Weekly sin A/B (Lun/Mié/Vie): martes ⇒ «Próximo» = el del miércoles** (hoy dice el del
  lunes); **sábado y domingo ⇒ sin «Próximo»**, igual que la web. Casos nuevos en
  `tests/mobile/home-hero-ab.test.ts`.
- CA4.5 `ab_mode=false` ⇒ `todayPlan` idéntico a la búsqueda vieja; `nextPlan` cambia a la regla de la
  web (esperado, no regresión); `cycle` ⇒ igual que hoy. Vive en **una** suite,
  `tests/mobile/home-hero-ab.test.ts`.
- CA4.6 Mismo fixture A/B da el mismo `todayPlan.id`/`nextPlan.id` en web (caso `ab_mode: true` nuevo
  en `heroComplianceBundle.test.ts`) y en app. CA4.7 **Tira semanal del ejecutor en semana B: marca
  solo los días de B** (hoy marca los de las dos), con test y punto de QA propio.

## 5. Punto 3 — Tarjeta «Salud» en la ficha (sin migración)

**Datos.** `public.client_intake` (`supabase/migrations/00000000000001_baseline.sql:788-800`, más
`sex` agregada por `20260701120000_add_client_intake_sex.sql:4`): `injuries` y `medical_conditions`
(nullable), `goals`, `experience_level`, `availability` (NOT NULL), `updated_at` (trigger
`handle_updated_at`), `UNIQUE (client_id)` (`baseline.sql:1651`). `archive_gate_client_intake` ya
existe. **Sin migración.**

**Contenido (solo lectura), en este orden y con estos rótulos:** «Lesiones o limitaciones» ·
«Condiciones médicas» · «Objetivo» · «Experiencia» · «Disponibilidad» · pie **«Actualizado el
{12 sept}»**.

- **Sin autoría.** `client_intake` no guarda quién escribió: no hay `created_by` ni `source`
  (`baseline.sql:788-800`), y el coach escribe las mismas columnas desde
  `apps/web/src/app/coach/clients/EditClientDataModal.tsx:218-241`. «Lo escribió el alumno» es
  inafirmable sobre un dato de salud. Y `updated_at` se mueve también cuando el coach edita talla o
  peso: por eso el pie dice «Actualizado» y no «Salud actualizada».
- **Sin chip «Lesión informada»**: es el ícono que Q4-B manda a pendientes, no entra por la hoja de
  diseño. **Sin «ver más»**: el texto libre se muestra **completo**, tal cual; la tarjeta crece.

**Estados vacíos — regla invertida.** La salud se pinta **aunque la ficha inicial esté incompleta**:
el coach puede escribir lesiones desde «Editar datos» dejando `goals`, `experience_level` y
`availability` en `''` (`EditClientDataModal.tsx:162-241`). Esconderlas sería afirmar algo falso sobre
un dato de salud.

| Situación | Cómo se detecta | Qué muestra |
|---|---|---|
| Lesiones o condiciones con texto | `injuries` o `medical_conditions` con contenido | **Siempre** el texto completo + pie de fecha, sin importar el resto de los campos |
| Campo de salud vacío | `injuries` / `medical_conditions` null o `''` | «Sin lesiones informadas» / «Sin condiciones médicas informadas» |
| Los **cinco** campos vacíos, o sin fila | sin fila, o los cinco vacíos (INSERT placeholder del coach: `apps/web/src/app/api/mobile/coach/clients/[clientId]/biometrics/route.ts:62-72` y `apps/web/src/services/client/client-detail.service.ts:950-959`) | «Tu alumno aún no completa su ficha inicial» **como nota al pie**, nunca en reemplazo de la tarjeta (sin pie de fecha) |

Lógica en la función pura `buildHealthIntakeView(intake)` en
`packages/profile-analytics/health-intake.ts` (+ `health-intake.test.ts`, export en `index.ts`) ⇒
mismo resultado en web y app.

**Tarea H1 (misma ola, una línea).** `apps/mobile/lib/alumno-onboarding.ts:45` guarda el intake con
`.insert()` y se traga el `23505` (`:57`): si el coach ya creó la fila placeholder, las lesiones que
el alumno escribió **en la app** se pierden en silencio. Pasa a `upsert({ … }, { onConflict:
'client_id' })`, como ya hace la web (`…/onboarding/_actions/onboarding.actions.ts:43-57`). Hoy son 0
casos en LIVE, pero sin esto la tarjeta puede mentirle al coach.

**Dónde va, con la línea exacta.** Web
(`apps/web/src/app/coach/clients/[clientId]/ProfileOverviewB3.tsx`): la página son dos columnas
(`:300`); la tarjeta va en la **COL DER (`:443`), como primer bloque, antes de «Hábitos diarios»** (y
por lo tanto antes de «Último check-in» y «Evolución visual»). En < 1024 px del contenedor la grilla
es de una columna, así que la salud queda **después de «Métricas clave»**, que cierra la COL IZQ. Los
datos ya llegan por `client_intake (*)` (`client-detail.service.ts:102`) y se pasan como prop desde
`ClientProfileDashboard.tsx:286-288`; componentes `Card` + `SectionTitle`. App
(`apps/mobile/components/coach/clientDetail/OverviewTab.tsx`): hermano **entre `KeyMetricsCard` y
`HabitsMiniWidget`** en el composer (`:298-306`); ojo que `KeyMetricsCard` muestra «Peso actual» y
«Variación semanal», no «Adherencia», y que `SectionTitle` en RN es una función local (`:97`), no un
componente del DS. Ampliar el select de `apps/mobile/lib/coach-client-detail.ts:812` a `injuries,
medical_conditions, goals, experience_level, availability, updated_at`.

| Superficies (punto 3) | Dónde queda la tarjeta | QA (§8) |
|---|---|---|
| Web desktop (≥ 1024 px del contenedor) | COL DER (`ProfileOverviewB3.tsx:443`), primera, sobre «Hábitos diarios» | 13, 14 |
| Web móvil / PWA | Una sola columna: después de «Métricas clave» | 13, 14 |
| App iOS | `OverviewTab.tsx:298-306`, entre «Métricas clave» y «Hábitos diarios» | 13, 14, 15 |
| App Android | Idéntico a iOS | 13, 14, 15 |

Mockups obligatorios: RN con lesiones · RN sin ficha (solo la nota al pie) · web desktop con la
tarjeta en su columna real (con «Hábitos diarios» y «Último check-in» debajo) · web móvil apilada.

**Privacidad.** Solo lectura. Quién la ve: el **coach dueño** (`client_intake_coach`) **y los miembros
activos del team** del alumno — `team_client_intake_member_all` es `FOR ALL` sobre `client_id IN
(select public.current_user_pool_client_ids())`
(`supabase/migrations/20260609160000_team_rls_optimized.sql:113-116`). En LIVE hay **0 alumnos con
`team_id`** (de 184 activos) ⇒ ninguna fila real queda expuesta, pero el SDD no puede decir «solo el
coach». **No se agrega migración en este tren**: «¿el team debe ver salud?» va a TASKS como decisión
del owner. Nada a PostHog ni Sentry. Ley 21.719: dato sensible ya almacenado, no se copia.

- CA3.1 Alumno con lesiones: la ficha web (desktop y móvil) y la app muestran el texto completo y
  «Actualizado el {12 sept}», sin autoría y sin chip.
- CA3.2 Lesiones cargadas por el coach con ficha incompleta ⇒ **se ven las lesiones** + nota al pie
  «Tu alumno aún no completa su ficha inicial». Campo vacío ⇒ «Sin … informadas». Los cinco vacíos o
  sin fila ⇒ solo la nota al pie.
- CA3.3 Métricas clave y edición de biometría sin cambios. CA3.4 Alta desde la app sobre una fila
  placeholder guarda lesiones y condiciones (H1).

## 6. Punto 2 — FC de la sesión: **fuera de este tren** (plan aparte)

**Nada de esta sección se implementa acá.** Queda escrita para que el SDD siguiente arranque con el
diseño hecho. Razones de la salida (las confirma Q3): es AGREGA y no ARREGLA; ~15-19 h-agente y una
tabla nueva; sirve a lo sumo a 4 de los 10 alumnos de Movens; y depende de una respuesta que no
tenemos.

**Precisión sobre el número.** «0 series con `metadata.hr` en 90 días» **no** prueba que nadie use
banda: `metadata.hr` solo se escribe desde `CardioScreenV3`, o sea solo en series de **cardio** con la
pantalla montada; una banda emparejada al reloj o a otra app no deja ninguna fila. Lo que sí prueba:
en 90 días nadie emparejó una banda **dentro de EVA** ni importó del reloj (Movens: 5 series con
`actual_avg_hr` a mano, 0 con curva).

**Pendiente que sale de acá y es ARREGLA, no AGREGA** (va al plan aparte, TASKS): el promedio de FC
que EVA guarda y muestra en un segundo bloque de cardio viene **contaminado con la fuerza
intermedia** — `apps/mobile/lib/ble-hr.ts:412-417` reinicia `sum/count` solo con
`reconnectAttempts === 0` y `:435-443` promedia toda la conexión; `useBleHr` no desconecta al
desmontar (`:503-512`) y `CardioScreenV3` nunca llama `disconnect()`. Hoy son 0 ocurrencias en LIVE,
pero es **condición previa** a decirle a cualquier coach «dejá la banda puesta toda la sesión».

**Primera tarea de ese plan, antes de una línea de código:** preguntarle a Movens (pendiente #24 de
TASKS) **(i)** si la banda se conecta dentro de EVA, en el bloque de cardio, o la leen en el reloj u
otra app; **(ii)** marca y modelo; **(iii)** qué teléfono y reloj usan los alumnos con app. Otras
condiciones de arranque: actualizar `apps/web/src/app/privacidad/page.tsx` (fuente HealthKit/Health
Connect, destinatarios coach + team) y corregir `NSBluetoothAlwaysUsageDescription`
(`apps/mobile/app.json:35` dice «durante el cardio»), que es build nativa.

**Opción C de Q3 — solo import del reloj a nivel sesión.** Variante barata: no se toca BLE ni se pide
banda; solo el target sintético «Sesión completa» del import de salud y la fila del coach. Cubre a los
alumnos con reloj y **sin** banda BLE, que según los datos son la mayoría. Sigue necesitando la tabla
y su RLS, pero no la prueba con banda real.

### 6.1 Flujo

- **Banda (app):** chip «Conectar banda» en el inicio de sesión si `isBleAvailable()`, reusando
  `ConnectSensorSheet`. El controlador BLE es un singleton (`ble-hr.ts:234`, instancia `:492`) que
  sigue emitiendo fuera del cardio: se exporta `bleHrStore` y el hook
  `apps/mobile/components/alumno/workout/v3/use-session-hr.ts` acumula en un **ref** con
  `createZoneSession`/`addSample` de `@eva/cardio` (dedupe por `lastSampleAtMs`), sin `useBleHr` en
  `ExecutorV3` (no redibuja a 1 Hz). Solo en fase `session`, corta en `finalizeSession`
  (`ExecutorV3.tsx:1443`), **no** en `editDate`.
- **Reloj (app):** `watchImportTargets` (`ExecutorV3.tsx:1595-1622`) suma un target sintético
  `blockId: '__session__'`, «Sesión completa», si hay salud disponible y `sessionWindow`; el resumen
  deja de exigir cardio (`:2750-2753`). Matching con `matchHubWorkoutToWindow`
  (`packages/cardio/hub-workout.ts:69-93`); sin permisos nuevos.
- **Guardado:** `apps/mobile/lib/session-hr.ts`, upsert con `onConflict:
  client_id,plan_id,session_date`; si falla, pendiente en AsyncStorage. **Nunca bloquea «Finalizar»**
  ni usa la cola de logs. Puras en `packages/cardio`: `buildSessionHrFromHub` y `formatSessionHrLine`;
  el `hr` es un `HrMetadataV1` (`packages/cardio/types.ts:62-87`).
- **Coach:** fila «FC de la sesión» en el detalle del día — web `TrainingTabB4Panels.tsx`, app
  `AnalisisTab.tsx` (`SessionDetail`): «prom 132 · máx 171 · 58 min con señal · Banda» + zonas si hay
  perfil FC. Sin fila ⇒ no se pinta nada. **Precedencia:** banda > reloj.

### 6.2 DDL — `public.workout_session_hr` (migración aditiva, del plan futuro)

RLS copiada de `workout_logs` (`baseline.sql:3347`, `:3351` solo SELECT;
`20260609160000_team_rls_optimized.sql:118-121` solo SELECT), `archive_gate_*` RESTRICTIVE con
`private.student_data_read_gate` sin `coalesce`
(`20260801023414_archive_client_access_and_nutrition_v2_history.sql:82`) y `student_write_gate_*` con
`private.student_write_allowed` (`20260718120000_student_access_grace_gate.sql:101`, `:140-161`).

```sql
create table public.workout_session_hr (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  session_date date not null,                 -- día Santiago (criterio de eva_santiago_day)
  source text not null check (source in ('ble', 'health_import')),
  hr jsonb not null,                          -- HrMetadataV1
  avg_hr smallint check (avg_hr between 25 and 250), max_hr smallint check (max_hr between 25 and 250),
  started_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index workout_session_hr_one_per_day on public.workout_session_hr (client_id, plan_id, session_date);
create index workout_session_hr_client_date on public.workout_session_hr (client_id, session_date desc);
create trigger handle_updated_at before update on public.workout_session_hr
  for each row execute function public.handle_updated_at();
alter table public.workout_session_hr enable row level security;
create policy workout_session_hr_client on public.workout_session_hr to authenticated
  using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));
create policy workout_session_hr_coach_read on public.workout_session_hr for select to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = workout_session_hr.client_id and c.coach_id = (select auth.uid())));
create policy team_workout_session_hr_member_read on public.workout_session_hr for select
  using (client_id in (select public.current_user_pool_client_ids()));
create policy archive_gate_workout_session_hr on public.workout_session_hr as restrictive for all to authenticated
  using (private.student_data_read_gate(client_id)) with check (private.student_data_read_gate(client_id));
create policy student_write_gate_ins_workout_session_hr on public.workout_session_hr
  as restrictive for insert to authenticated
  with check (client_id <> (select auth.uid()) or private.student_write_allowed(client_id));
create policy student_write_gate_upd_workout_session_hr on public.workout_session_hr
  as restrictive for update to authenticated using (true)
  with check (client_id <> (select auth.uid()) or private.student_write_allowed(client_id));
-- sin el revoke, la tabla nace con DELETE para `authenticated` (baseline.sql:3824)
revoke all on public.workout_session_hr from anon;
revoke delete on public.workout_session_hr from authenticated;
grant select, insert, update on public.workout_session_hr to authenticated;
grant all on public.workout_session_hr to service_role;
```

**El `revoke delete` no es opcional:** `baseline.sql:3824` fija `ALTER DEFAULT PRIVILEGES … GRANT ALL
ON TABLES TO "authenticated"`; sin él, con la policy del alumno `FOR ALL`, el alumno puede borrar sus
filas de FC (el gate RESTRICTIVE solo cubre INSERT y UPDATE). Antes de aplicar: EXPLAIN + tx con
ROLLBACK + **matriz RLS con JWT reales** (alumno propio, ajeno, coach dueño, coach ajeno, miembro de
team, archivado, gracia vencida y **«alumno intenta DELETE»**, que debe fallar por permiso, no por
policy). Tipos en `apps/web/src/lib/database.types.ts`; purga en `scripts/purge-platform-email.mjs`.

### 6.3 Límites honestos y privacidad

Pantalla bloqueada en iOS: el BLE se suspende; `app.json:35` no tiene `UIBackgroundModes:
bluetooth-central` y agregarlo es build de tienda ⇒ la vista del coach dice «X min con señal», no
«duración de la sesión». Web/PWA (móvil y desktop): sin FC de sesión — Safari/iPhone no tiene Web
Bluetooth ni acceso a Salud, así que los 6 alumnos web de Movens siguen con FC escrita a mano. Nada de
FC a PostHog, Pixel ni Sentry (tampoco en breadcrumbs), guideline 5.1.3; Ley 21.719: tabla con RLS,
purga incluida, coach y team en solo lectura. Invariantes y QA de este punto (cardio por serie
intacto, promedio por bloque arreglado, dedupe del acumulador, `editDate` no escribe, matriz RLS,
prueba con banda real y Apple Watch) viajan con su propio SDD.

## 7. Qué no se rompe (invariantes con test) — los 3 puntos del tren

| Punto | Invariante | Test |
|---|---|---|
| 1 | Salidas no-slot del cursor idénticas (D1 intacto) | **Guarda única:** snapshot escrito a mano de la salida sin `slots` de `resolveCycleModeCursor` para C1–C23 y los 4 fixtures existentes, comparado byte a byte tras el cambio (C24+ validan `slots`). En `cycle-cursor.test.ts` |
| 1 | ≤ 1 `today`; exactamente 1 si `todayState !== 'done'`; 0 `done` en ronda nueva | INV-1..3 en `cycle-cursor.test.ts` |
| 1 | **INV-4: la salida no depende del orden de entrada** — la misma lista de completitudes barajada da los mismos `slots` | test con permutaciones en `cycle-cursor.test.ts` |
| 1 | C15, C7/C23, C12 y fixtures 1-4 verdes sin cambios; paridad web/app de `slots` | suite existente + `tests/mobile/cycle-cursor-parity.test.ts` (fixture 5) |
| 1 | Slots del bundle del hero (3.ª superficie) sin cambio de salida | `heroComplianceBundle.test.ts:272/310/359` |
| 1 | Día hecho hoy: hoja sin «Repetir» | `WorkoutPlanCard.test.tsx` |
| 4 | `ab_mode=false` y `cycle`: `todayPlan` igual que antes (CA4.5) y tira del ejecutor en semana B (CA4.7) | `tests/mobile/home-hero-ab.test.ts`, **una sola suite** |
| 4 | Web = app en A/B | caso `ab_mode: true` en `heroComplianceBundle.test.ts` |
| 3 | Lesiones visibles con ficha incompleta; los cinco vacíos ⇒ nota al pie | `packages/profile-analytics/health-intake.test.ts` |
| 3 | El alta desde la app no pierde el intake existente (H1) | revisión de diff de `alumno-onboarding.ts` |
| Todos | Sin cambios en `workout_logs`, su cola offline ni nativo; OTA JS puro | revisión de diff |

## 8. QA del owner (checklist corta, por superficie)

**W-mov** = web móvil/PWA · **W-desk** = web desktop (≥ md) · **iOS** = app iOS (1.1.3 y 1.1.2) ·
**And** = app Android 1.1.2.

**0. Antes de empezar (bloquea el QA).** Preparar las cuentas con pasos exactos: alumno con ciclo de 2
en **2.ª ronda** (dos días cerrados al 100 % en fechas pasadas), alumno con A/B cuyo `start_date`
caiga en **semana B**, y alumno con lesiones. **Nunca sobre cuentas reales de coaches.** Quién y cómo:
PLAN/TASKS.

**Punto 1 — ciclo (ocho puntos)**

1. Inicio: A «Hoy», B «Próximo». — W-mov, W-desk, iOS, And.
2. Tocar A ⇒ ejecutor con series y reloj; cerrar ⇒ «Día A hecho · Próximo: Día B». — W-mov, iOS, And.
3. Tocar un día hecho **en esta ronda** ⇒ hoja con «Entrenarlo hoy» primera y destacada (borde + tile
   con ícono) y «Corregir registros del {fecha}» neutra debajo; en desktop es **modal centrado**, en
   móvil y app bottom sheet. — las cuatro.
4. Elegir «Entrenarlo hoy» ⇒ sesión nueva de hoy con los valores cargados; al volver al inicio la tira
   queda `1H(hoy) 2· 3·`: los otros días de la ronda vuelven a «Próximo». ¿Se acepta? — W-mov, iOS.
5. Elegir «Corregir registros del {fecha}» ⇒ banner «Corrigiendo el {martes 16 sept}» + «No cuenta
   como entreno de hoy» + «Entrenar hoy» que funciona. Con Q7-A abre en el primer ejercicio con serie
   activa y reloj; con Q7-B, en el último paso y sin reloj. — W-mov, W-desk, iOS, And.
6. **Entrené hoy y vuelvo a abrirlo** (hero «Ya hiciste» o tarjeta del día): con Q7-A abre en el primer
   ejercicio con series y reloj; con Q7-B sigue sin serie activa ni reloj. — W-mov, iOS, And.
7. Empezar a medias un día sobre otro ya hecho **en esta ronda**: se ve «En progreso», no aparece la
   hoja «Ya hiciste» y el día hecho sigue diciendo «Hecho {fecha}». — W-mov, iOS.
8. Tocar un día de la ronda **anterior** ⇒ arranca esa sesión de una, sin hoja, y esa tarjeta ya no
   dice «Hecho {fecha}» ni ofrece corregir desde el inicio. ¿Se acepta? (Q6). — las cuatro.

**Punto 4 — semanal (cuatro puntos; cambia solo la app, la web es la referencia)**

9. Alumno A/B en semana B: hero = plan B del día; si B no tiene ese día ⇒ «Día de descanso». Comparar
   con la misma cuenta en web. — iOS, And (vs. W-mov/W-desk).
10. **Martes o jueves** de un Lun/Mié/Vie sin A/B: «Próximo» deja de decir el del **lunes** (día que ya
    pasó) y dice el del miércoles o viernes. — iOS, And (vs. W-mov).
11. **Sábado y domingo** del mismo programa: «Recupera bien para la próxima sesión.», donde antes
    mostraba el del lunes. Es el cambio de Q5-A sobre 249 programas. — iOS, And (vs. W-mov).
12. Ejecutor en semana B: la **tira semanal** marca solo los días de B (CA4.7); Momentum, también. —
    iOS, And.

**Punto 3 — salud (tres puntos)**

13. Ficha de un alumno con lesiones: tarjeta «Salud» con el texto **completo**, los cinco rótulos y el
    pie «Actualizado el {12 sept}» (sin autoría, sin chip). En desktop, columna derecha arriba de
    «Hábitos diarios»; en móvil, después de «Métricas clave». — las cuatro.
14. Lesiones cargadas por el coach con ficha incompleta ⇒ **se ven** con la nota al pie; alumno sin
    nada ⇒ solo la nota al pie. — W-desk, W-mov, iOS.
15. Alta desde la app sobre una ficha que el coach ya tocó ⇒ las lesiones quedan guardadas (H1). —
    iOS, And.

## 9. Aviso (lo manda el owner, nunca la sesión)

Como en el tren de ciclos (`docs/specs/ciclo-real-y-por-lado/TESTING-QA.md` §11). Momento: entre el
deploy web y la OTA. Borradores en TASKS. Regla de redacción: **si una palabra no aparece en el
mensaje de Gerardo ni en la pantalla que él ve, no va** (nada de «vuelta», «slots», «listado», «PDF»).

**A Movens (Gerardo), respuesta a sus 3 mensajes:**

- **El «ya existe».** Cuando terminan el Día A y el Día B y vuelven a empezar, el Día A vuelve a decir
  «Hoy» en vez de «Hecho», y al tocarlo entran directo a entrenar. Antes les aparecía el aviso de que
  ya lo habían hecho y terminaban cambiando números de la semana pasada.
- **El «a veces les empieza por el B».** EVA no mira el calendario: mira el último día que cerraron. Si
  una semana hacen A y B, la siguiente abre en A; si hacen solo A, la siguiente abre en B. Si igual
  querés que partan por A, que toquen la tarjeta del Día A y elijan **«Entrenarlo hoy»**: queda
  registrado como el entreno de hoy.
- **Los dolores y lesiones.** Ya se ven en la ficha de cada alumno, en la web y en la app, con la fecha
  de la última actualización. En la lista de alumnos y en el informe todavía no.
- **El pulso de toda la sesión.** Hoy no sale nada nuevo; el diseño ya está hecho y queda para el
  próximo trabajo. Necesitamos tres cosas de vos: (i) ¿la banda se conecta dentro de EVA, en el bloque
  de cardio, o la leen en el reloj o en otra app?; (ii) marca y modelo de la banda; (iii) qué teléfono
  y qué reloj usan los alumnos que entrenan con la app.
- **Si el owner elige Q7-A**, se suma: cuando vuelvan a abrir un día que ya registraron, ahora abre en
  el primer ejercicio, con los tiempos de trabajo y descanso a la vista.

**A los 3 coaches con A/B real** (y, si Q5-A, con la mención del cambio en los días de descanso): «la
pantalla de inicio de la app ya muestra el entreno de la semana que corresponde». **A los 10 coaches
con ciclos activos:** sus alumnos verán «Hoy» donde antes veían «Hecho». Una línea, sin pedirles nada.
Quién: el owner. La sesión solo entrega el texto.

## 10. Fuera de alcance

Todo lo demás (Joaquín y el resto de billing, CI más allá de W0, «reiniciar el ciclo cada lunes»,
arranque en el paso 0 si Q7 queda en B, `limit(200)`, `weeks_to_repeat` vencido, `cycle` + `ab_mode`,
ícono de lesiones en el listado, salud en el informe, reedición de la ficha por el alumno, «¿el team
debe ver salud?», el arreglo del promedio de FC entre bloques y todo el punto 2 con sus dependencias)
→ ver [TASKS.md](TASKS.md) § «Pendientes fuera de este tren».
