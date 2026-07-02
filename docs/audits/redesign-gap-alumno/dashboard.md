# Gap de fidelidad — Dashboard alumno (Inicio · `/c/[coach_slug]/dashboard`)

Kit móvil (viewport primario <760): `docs/design-source/ui_kits/eva-app/screens/alumno-dashboard.jsx` (`StudentDashboard`) + `alumno.jsx`.
Kit desktop (≥760): `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` (`DesktopAlumnoDashboard`, líneas 351-454) + CSS `.dt-*`.
App: `apps/web/src/app/c/[coach_slug]/dashboard/**`.

## Veredicto de estructura
El **orden y las secciones** del móvil son 1:1 con el kit (`page.tsx:82-166`): header → racha ribbon → check-in banner → hero → coach presence → Momentum (semana+anillos) → Tu programa → Peso y records → Actividad reciente → Hábitos de hoy → Nutrición de hoy. El sticky-CTA, el estado "sin plan", rest-day y planDone existen. Desktop = bento 2-col con head + main/sidebar, coherente con `DesktopAlumnoDashboard` (más rico, documentado). No hay secciones faltantes. Los gaps son de **componente** (patrón/tokens dentro de una card), no de layout global.

---

## P0

### [P0] Hábitos de hoy renderiza el componente LEGACY (acordeón + paleta no-EVA), no el card del kit
- Kit: `alumno-dashboard.jsx:487-531` — card **siempre abierta** con 5 bloques inline visibles: Agua (icono aqua + contador "X / 3 L" + **barra de progreso** aqua-700 + chips de quick-add pill), Pasos (input mono), Sueño (7 botones **full-width** `flex:1`, sport-500 seleccionado), y una fila de **2 toggles** Ayuno/Suplementos (checkbox cuadrado, sport-500). Tokens EVA: `--aqua-700`, `--sport-500`, `--surface-sunken`, `--radius-control`.
- App: `_components/habits/HabitsTrackerWidget.tsx` delega en `apps/web/src/app/c/[coach_slug]/nutrition/_components/HabitsTracker.tsx` (compartido con nutrición, NO reskineado). Es un **acordeón colapsado por defecto** (`useState(false)`, `HabitsTracker.tsx:58`): en el dashboard el alumno ve solo una barra fina "Hábitos del día ▼", no el card rico del kit. Además usa **paleta Tailwind legacy** ajena al DS — `sky-500`/`emerald-500`/`violet-500`/`orange-500`/`rose-500`/`amber-500`, `text-muted-foreground`, `bg-card`, `border-border`, `rounded-2xl`/`rounded-lg` (`HabitsTracker.tsx:153,163,214,226,241,254,273,300,327`) en vez de aqua/sport/ember + `surface-*` + `radius-control`. No tiene la **barra de progreso de agua**; Sueño son chips que envuelven (11 opciones) en vez de 7 botones full-width; Ayuno y Suplementos son grids de chips en vez de los 2 toggles del kit.
- Diferencia: la sección "Hábitos de hoy" es el único bloque del dashboard que rompe el sistema visual (colapsado + paleta ajena). Root cause: se reusa el componente de nutrición sin migrarlo a EVA DS.
- Fix: crear un `HabitsTracker` reskineado para el dashboard (o migrar el compartido) — abierto por defecto, tokens EVA (aqua-700/sport/ember, surface-sunken, radius-control), barra de progreso de agua + chips, Sueño full-width `flex-1`, toggles Ayuno/Suplementos. Reemplazar la paleta sky/emerald/violet/orange/rose por los tokens del kit.
- **Verdict:** CONFIRMED — `page.tsx:18,153` (móvil `md:hidden`) y `DashboardDesktop.tsx:12,92` ambos montan `HabitsTrackerWidget`, cuyo único hijo es `nutrition/HabitsTracker` (`HabitsTrackerWidget.tsx:4,22`). Ese componente arranca colapsado (`HabitsTracker.tsx:58` `useState(false)`) y usa paleta Tailwind ajena al DS — `sky-500`/`emerald-500`/`violet-500`/`orange-500`/`rose-500`/`amber-500` + `border-border`/`bg-card`/`rounded-2xl` (líneas 153,163,214,241,259-262,273,300,327), sin barra de progreso de agua, con Sueño de 11 chips que envuelven (`SLEEP_OPTIONS` :30) y Ayuno/Suplementos como grids de chips en vez de 2 toggles. El card del kit (`alumno-dashboard.jsx:486-531`) es siempre-abierto, aqua/sport, con barra de agua, Sueño `flex:1` (7 opciones) y 2 toggles. Es el único bloque con paleta fuera de sistema → P0 justificado.

---

## P1

### [P1] Hero: la lista de ejercicios es estática (sin quick-log inline con chip +/✓ ni relleno de progreso)
- Kit: `alumno-dashboard.jsx:304-319` (móvil) y `desktop-coach.jsx:392-403` (desktop) — cada ejercicio es un **botón tappable** que suma una serie: relleno de progreso por fila (`width = logged/sets`), nombre, `sets×reps`, contador mono `logged/sets`, y un **chip cuadrado 34×34** con `plus`→`check` a la derecha (sport-500 → verde al completar).
- App: `_components/hero/WorkoutHeroCard.tsx:86-98` — `<ul>` de solo lectura: nombre + `sets × reps`, sin contador, sin chip, sin relleno. El quick-log se reubicó a un sheet aparte (`QuickLogSheet`). La card del hero se ve notablemente más plana que el kit.
- Diferencia: falta el patrón visual distintivo del hero del kit (filas interactivas con add-chip + fill). Aplica a móvil y desktop (ambos usan `WorkoutHeroCard`).
- Fix: reintegrar el quick-log inline en las filas del hero (contador + chip +/✓ + relleno por fila) manteniendo `QuickLogSheet` como alternativa, o reemplazarlo.
- **Verdict:** CONFIRMED — `WorkoutHeroCard.tsx:86-98` es un `<ul>` de solo lectura (nombre + `sets × reps`), sin contador `logged/sets`, sin chip 34×34, sin relleno por fila; el quick-log vive en un `QuickLogSheet` aparte (:108-115). El kit tiene filas interactivas: móvil `alumno-dashboard.jsx:305-318` (botón `bump(i)` con relleno `logged/sets*100%`, mono `logged/sets`, chip plus→check) y desktop `desktop-coach.jsx:393-402` (`dt-alu-heroitem` botón con counter + chip). Como ambos árboles (móvil y `DashboardDesktop`) montan `WorkoutHeroCard` vía `HeroAndComplianceGroup`, aplica a los dos. El sheet preserva la función pero el card del hero queda visualmente más plano que el kit; en auditoría de fidelidad el gap es real → P1.

### [P1] "Tu programa": barra de fases sin etiquetas y con tratamiento de segmentos distinto
- Kit: `alumno-dashboard.jsx:397-411` — **dos filas**: (1) segmentos donde la fase **actual** es sport-500, pasadas sport-200, futuras sunken; (2) fila de **nombres de fase** justificados (actual en negrita sport-600). Desktop `desktop-coach.jsx:410-414` también rotula la fase dentro del segmento.
- App: `_components/program/ProgramPhaseBar.tsx:37-58` — una sola barra con segmentos de color uniforme (`p.color || sport 40%`) + un **punto circular** de progreso, **sin nombres de fase** y sin resaltar la fase actual vs pasadas/futuras.
- Diferencia: cuando el programa tiene `program_phases`, el alumno no ve los nombres ni la distinción actual/pasada/futura del kit.
- Fix: renderizar los labels de fase debajo de la barra y colorear segmentos por estado (actual/pasada/futura) como el kit; quitar o conservar el dot como extra.
- **Verdict:** CONFIRMED — `ProgramPhaseBar.tsx:40-49` pinta segmentos con color uniforme (`p.color || sport 40%`, sin lógica actual/pasada/futura) + un dot circular de progreso (:51-57), y NO renderiza ningún label de fase; `ActiveProgramSection.tsx:97` monta solo `<ProgramPhaseBar>` sin fila de nombres aparte (verificado: no hay labels en ningún lado). El kit móvil `alumno-dashboard.jsx:398-411` tiene dos filas (segmentos por estado sport-500/sport-200/sunken + nombres justificados, actual bold sport-600) y el desktop `desktop-coach.jsx:410-414` rotula la fase dentro del segmento. Gap real cuando el programa trae `program_phases` → P1.

### [P1] "Tu programa": los días son una lista vertical, el kit es un carrusel horizontal de day-cards
- Kit: `alumno-dashboard.jsx:413-424` (móvil, `overflow-x:auto` + cards de 96px) y `desktop-coach.jsx:415-423` (`.dt-alu-days`) — **scroll horizontal** de tarjetas compactas: label uppercase, icono check/play/chevron, título, "Día N".
- App: `_components/program/WorkoutPlanCard.tsx:25-63` — **grid vertical** `grid-cols-1 gap-2` de filas full-width con un badge de día 48×48 a la izquierda + título + "Día N" + chevron/check.
- Diferencia: cambia el patrón de layout de la sección (tira horizontal compacta → lista apilada).
- Fix: pasar los day-cards a un carrusel horizontal (`overflow-x:auto` + `hide-scrollbar`, cards ~96px) replicando `alumno-dashboard.jsx:413-424`.
- **Verdict:** CONFIRMED — `WorkoutPlanCard.tsx:26` es `grid grid-cols-1 gap-2` (lista vertical apilada), con filas full-width, badge de día 48×48 (`h-12 w-12`, :43-52), título + "Día N" + chevron/check (:53-57). El kit móvil `alumno-dashboard.jsx:413-424` es `overflowX:'auto'` con cards de `width:96` (label uppercase + icono + título + "Día N") y el desktop `desktop-coach.jsx:415-423` (`dt-alu-days`) es la misma tira horizontal. Cambio de patrón de layout dentro de la sección, no global → P1.

### [P1] "Nutrición de hoy": falta el titular grande de kcal + badge "restantes"; las calorías se muestran como barra
- Kit: `alumno-dashboard.jsx:536-542` — la card lidera con el **número de kcal 27px** black + "/ target kcal" + un **Badge ember "X restantes"** (icono flame). Desktop igual (`desktop-coach.jsx:442`, `.dt-alu-kcal` métrica grande).
- App: `_components/nutrition/NutritionDailySummary.tsx:158-173` — las calorías se renderizan como una **barra de progreso etiquetada** ("Calorías" + "consumido / target kcal"), sin número hero ni badge de restantes. (La app además agrega un header apple+nombre-plan y CTA inferior que el kit no tiene — extras OK, pero entierran la métrica de kcal.)
- Diferencia: se pierde el hero de calorías + "restantes", tratamiento visual clave del card del kit.
- Fix: mostrar kcal consumidas como métrica grande (`font-display ~27px`) + "/ target kcal" + Badge ember "N restantes"; mantener macros abajo como ProgressBars.
- **Verdict:** CONFIRMED — `NutritionDailySummary.tsx:158-173` renderiza las calorías como barra de progreso etiquetada ("Calorías" + `{consumedCal} / {tCal} kcal` + `<div>` bar), sin número hero ni Badge de restantes; además agrega header apple+nombre-plan (:141-154) y CTA inferior (:191-196) que el kit no trae. El kit móvil `alumno-dashboard.jsx:538-541` lidera con `eva-metric` 27px + "/ target kcal" + `Badge tone="ember"` "N restantes" (flame), y el desktop `desktop-coach.jsx:442` (`dt-alu-kcal`) también lidera con la métrica grande. Se pierde el hero de kcal → P1.

---

## P2

### [P2] Saludo móvil 20px vs 25px del kit
- Kit: `alumno-dashboard.jsx:230` — h1 saludo `fontSize: 25` (condensado 17). App: `_components/header/ClientGreeting.tsx:33` usa `text-xl` (20px). Un escalón de tipografía por debajo del kit. Fix: subir a ~`text-[25px]`.

### [P2] Header móvil no muestra el chip de racha condensado al hacer scroll
- Kit: `alumno-dashboard.jsx:233-238` — al condensar (scroll >56px) aparece un chip ember con la racha. App `DashboardHeader.tsx` es sticky pero no expone el chip condensado. Detalle de motion; menor. Fix opcional: chip de racha condensado en el header sticky.

### [P2] Rest-day: CTA es un link de texto, el kit usa un Button secundario
- Kit: `alumno-dashboard.jsx:272` — `<Button variant="secondary" size="lg">Ver nutrición de hoy</Button>` (arrow-right). App: `_components/hero/RestDayCard.tsx:38-41` — link de texto "Ver nutrición →". Fix: usar un Button secundario lg como el kit.

### [P2] Check-in banner: iconografía y patrón de tap distintos
- Kit: `alumno-dashboard.jsx:248-255` — card **entera tappable** con icono `clipboard-check` (ambos variantes) + chevron-right como afordancia. App: `_components/checkin/CheckInBanner.tsx:57-72` — icono `AlertCircle`/`CheckCircle2` + botón explícito "Check-in" (no chevron). Fix: unificar a `clipboard-check` + card tappable con chevron.

### [P2] Sparkline de peso sin punto final; el kit marca el último dato
- Kit: `alumno-dashboard.jsx:447` — dot 10px en el último punto de la sparkline. App: `_components/weight/WeightSparkline.tsx:39` usa recharts con `dot={false}`. Fix: pintar el punto final (último dato) sobre la curva.

### [P2] Nutrición: filas de comida son cards bordeadas sin kcal; el kit es checklist con kcal por comida
- Kit: `alumno-dashboard.jsx:548-554` — filas planas (checkbox 24×24 + nombre + `N kcal` mono, separadas por línea fina). App: `_components/nutrition/MealCompletionRow.tsx:86-117` — cada comida es un **botón bordeado** (`border-subtle bg-surface-card rounded-control`, checkbox 32×32) **sin kcal por comida**. Fix: filas planas con divisor + kcal por comida como el kit.

### [P2] "Actividad reciente": header interno en vez del SectionTitle con barra de acento
- Kit: `alumno-dashboard.jsx:472` — usa `Dash_SectionTitle action="Historial"` (barra de acento + label uppercase + acción a la derecha) y luego la card sin header. App: `_components/history/RecentWorkoutsSection.tsx:16-27` — NO usa `SectionTitle`; mete "Actividad reciente" como header interno de la card (font-display sm, sentence-case, `border-b`) y baja el link "Ver historial completo →" al pie. Rompe el ritmo del resto de secciones (todas con SectionTitle). Fix: envolver con `<SectionTitle action="Historial" actionHref=…>Actividad reciente</SectionTitle>` como las demás.

### [P2] Hero sin badge "Sem N · variante" y con icono dumbbell extra en el título
- Kit: `alumno-dashboard.jsx:294-297` — eyebrow "Hoy entrenás" + badge pill "Sem N · variante"; título sin icono. App: `_components/hero/WorkoutHeroCard.tsx:60-67` — sin badge de semana/variante y agrega un `Dumbbell` dentro del `<h2>`. Menor. Fix: agregar el badge Sem/variante y quitar el icono del título para calzar con el kit.

---

Verificado 1:1
