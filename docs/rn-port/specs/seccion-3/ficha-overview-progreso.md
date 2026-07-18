# SPEC — Ficha coach: tabs Resumen + Progreso + WeeklyPRBanner

**Key:** `ficha-overview-progreso` · **Seccion 3 (coach)** · Web = fuente de verdad.

Cada afirmacion cita `archivo:linea` del codigo real leido linea por linea. Copy VERBATIM del web.

## Archivos

**PROPIOS (esta unidad edita):**
- `apps/mobile/components/coach/clientDetail/OverviewTab.tsx` (461 L) — tab Resumen.
- `apps/mobile/components/coach/clientDetail/ProgresoTab.tsx` (541 L) — tab Progreso.
- `apps/mobile/components/coach/clientDetail/WeeklyPRBanner.tsx` (123 L) — banner de PR semanal.

**READ-ONLY (otras unidades):**
- `apps/mobile/app/coach/cliente/[clientId].tsx` — monta los tabs (owner `ficha-shell-hero`). Cita clave: L282-295 render condicional de tabs; L284 monta `OverviewTab`, L286 `ProgresoTab`.
- `apps/mobile/components/coach/clientDetail/shared.tsx` — `StatCard`/`CardHeader`/`MetricBox`/`Pill`/`cd`/`formatDate`/`dayName`/`relativeDays` (owner `ficha-shell-hero`).
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx` — call-site del `WeeklyPRBanner` (L12, L62) → owner `ficha-analisis-plan`. **El banner se renderiza en el tab Entreno, NO en Resumen/Progreso** (RN: `AnalisisTab.tsx:62 <WeeklyPRBanner prs={prs} />`; grep confirma cero usos fuera de AnalisisTab). Cambios de cableado del banner van a `cambiosShell`.
- Charts: `apps/mobile/components/coach/charts/AreaTrend.tsx`, `RadialGauge.tsx`, `CalendarHeatmap.tsx`; `apps/mobile/components/ComplianceRing.tsx`, `ProgressBar`, `SegmentedTabs`, `Input`, `Button`, `Sheet`, `EmptyState` (primitivos DS).

## webFiles (verdad)

- Resumen: `apps/web/src/app/coach/clients/[clientId]/ProfileOverviewB3.tsx` (1005 L) + `ProfileCheckInSnapshot.tsx` (277 L) + `ProfileProgramSummaryCard.tsx` (161 L).
- Progreso: `apps/web/src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.tsx` (1017 L).
- PR banner: `WeeklyPRBanner` inline en `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx:47-101` (montado en L356 `<WeeklyPRBanner prs={weeklyPRs} />`).

---

## 0. Datos / cableado / congelamiento

- Los tres tabs reciben `data: CoachClientDetailData` por props desde `[clientId].tsx` (`OverviewTab.tsx:62-72`, `ProgresoTab.tsx:32`). **Sin fetch propio de los datos base** (perfil, checkIns, compliance, activeProgram, workoutDates371, sessions30d) — se pasan resueltos (`OverviewTab.tsx:74`, `ProgresoTab.tsx:36`).
- **Excepcion con fetch propio (gotcha 6b):**
  - `HerramientasSection` (Overview) hace fetch de estado de modulos entitled via `useEffect` de un solo disparo (`OverviewTab.tsx:237-266`): `getCardioClient`/`getClientFinals`/`getLastBodycompMeasuredAt`.
  - `CompositionSection` (Progreso) hace fetch a `body_composition_measurements` via `useEffect` (`ProgresoTab.tsx:372-391`).
  - **Gotcha 6b (congelamiento) NO aplica:** los tabs se renderizan con render CONDICIONAL (`[clientId].tsx:283-294` — ternario `tab === 'overview' ? … : …`), no con navegador de tabs de expo-router. Cambiar de tab DESMONTA el tab previo y MONTA el nuevo → el `useEffect` re-dispara en cada visita. No hay congelamiento porque no hay persistencia de la instancia. **Confirmado por lectura del padre.** (Si `ficha-shell-hero` cambiara a mantener tabs montados, estos `useEffect` de un disparo se volverian bug — anotar dependencia.)
- **Claves de dia (gotcha 6d):** ver §8 — hay deltas que usan `Date.now()`/`new Date()` crudos (TZ del device), no `getSantiagoIsoYmdForUtcInstant`. Divergencia menor de borde de dia, documentada.

---

## 1. TAB RESUMEN — web `ProfileOverviewB3.tsx`

### 1.1 Layout / jerarquia (web)
- Contenedor raiz `div.space-y-6` (`ProfileOverviewB3.tsx:275`), grid 2 columnas en container-query `@5xl/ficha` (`:279`); en panel angosto = 1 columna. **En RN (movil) siempre 1 columna** — adaptacion idiomatica valida.
- Orden web COL-IZQ (`:281-402`): Cumplimiento semanal → 5 KPIs → Programa → Metricas clave. COL-DER (`:404-475`): Habitos diarios → Ultimo check-in → Evolucion visual → Modulos. Full-bleed final (`:479-492`): boton "Editar plan".
- **Orden RN (`OverviewTab.tsx:127-217`):** TopAlertBanner (extra RN) → Cumplimiento semanal → CalendarHeatmap (extra RN) → KPI grid → Programa activo → Herramientas → Check-in snapshot → Evolucion de fotos → Biometria. **Sin boton "Editar plan" full-width, sin HabitsMiniWidget, sin card "Metricas clave" con variacion semanal** (ver Ola 0).

### 1.2 Cumplimiento semanal (3 rings)
- Web: `Card padding="md"` con `<SectionTitle>Cumplimiento semanal</SectionTitle>` (`:283-284`), grid 3 cols (`:285`) de `ComplianceRing` (`:286-304`):
  - **Entreno:** `percentage={workoutPct}` (`workoutPct = min(100, round(wThis/target*100))`, `:152`), `delta={workoutDelta}` (pts porcentuales, `null` si no hay prev real `:155-156`), `pathColor='var(--sport-500)'` (`:193, 290`).
  - **Nutricion:** `percentage={min(100, nutAvg)}`, `delta={nutDelta}` (`:160-161`), `pathColor=nutColor` (`nutAvg>=70` success / `>=50` warning / else danger, `:198`), **`onClick={onViewNutrition}`** → deep-link Zona A nutricion (`:297`, doc L103-105).
  - **Check-in:** `percentage={checkPct}`, `delta={checkDelta}` (`:165-166`), `pathColor` = `>=70` emerald / `>=40` amber / else red (`:303`).
- `ComplianceRing` (`:756-803`): `ProgressRing value size=84 stroke=8 color` (`:781`), label 12.5px bold strong (`:783`), delta 10.5px: `>0` success-600 / `<0` danger-600 / `=0` subtle (`:786-793`); texto: `=0` → `"— vs sem. ant."`, si no `"↑/↓ {abs} pts"` (`:795-797`); `null` ⇒ omite linea (`:784`). Wrapper `<button>` solo si `onClick` con `hover:bg-surface-sunken focus-visible:ring` (`:770-779`).
- **RN (`OverviewTab.tsx:131-138, 304-317`):** `StatCard` + `CardHeader icon={Flame} title="Cumplimiento semanal"` (icono no existe en web) + 3 `Ring`. `Ring` (`:304-317`): `ComplianceRing value size=68` (68 vs 84 web), `hint`=fraccion/%, `delta`=**conteo crudo** (`workoutsThisWeek - workoutsPrevWeek`, `:134`) con unit `""` entreno / `"pts"` nutricion/checkin; delta oculto si `=0` (`:310`), sin caso "sin prev", sin "— vs sem. ant.". **Ring de Nutricion NO clickeable** (View sin onPress).

### 1.3 KPIs (web = 5 · RN = 7)
- Web `kpiItems` (`:200-250`), cada uno `Card padding="md" flex-row` con `motion.div` (fade-in `opacity 0→1, y 8→0, delay i*0.05, duration 0.25`, `:311-316`), chip icono `h-9 w-9 rounded-md` tonal (`:318-325`, tonos `:252-256`), valor `font-display text-lg font-black` (`:327`), label+hint 10.5px muted con `MetricInfo` opcional (`:330-337`):
  1. **Mejor racha** — `Flame`, `"{longestStreak} día(s)"` (`:212`, plural), hint "histórico", ember.
  2. **Sesiones** — `Dumbbell`, `"{sessions30d}"`, hint "últimos 30 días", sport.
  3. **Adherencia entreno** — `PieChart`, `"{workoutPct}%"` (workout, NO nutricion), hint delta vs sem ant, sport, `infoTerm='adherencia'` (`:224-235`).
  4. **Δ Peso (30d)** — `Scale`, `"{weightDelta30d} kg"` o `"—"`, hint "check-ins", tone por signo (`:236-242`).
  5. **Sem. programa** — `CalendarRange`, `"{planCur} / {planTot}"`, hint "ciclo activo", sport (`:243-249`).
- **RN (`OverviewTab.tsx:147-155`):** `cd.grid2` con 7 `MetricBox` (sin icono, sin animacion, sin hint, sin MetricInfo): `bestStreak` "{n}d" (vs web "{n} días"), `sessions30d` "Sesiones 30d", `workoutDates371.length` "Entrenos (año)" (extra RN), **`nutritionWeeklyAvgPct%` label "Adherencia" — BUG: nutricion, no entreno** (Ola 0 P1), `delta30` "Δ peso 30d", `currentWeek/weeks` "Semana plan", `checkInCompliancePercent%` "Regularidad" (extra RN).

### 1.4 Programa
- Web `ProfileProgramSummaryCard` (`:347-354`, componente `ProfileProgramSummaryCard.tsx`):
  - **Sin programa (`:58-73`):** Card centrada `"Sin programa activo asignado."` + `<Link>` sport md `"Asignar programa"` icono `Plus` → `/coach/builder/{clientId}`.
  - **Con programa (`:75-159`):** Card `interactive` → `onOpenProgram` (`:78-79`). Header: nombre 15px black (`:84`) + `Badge vencido?'warning':'success'` `"Ciclo vencido"`/`"En track"` (`:87-89`). `ProgramPhasesBar` si hay fases (`:93-97`). "Semana {planCur} de {planTot}" + "{daysLeft} d restantes" (`:100-105`). Barra `pct=min(100,round(planCur/planTot*100))` bg-sport-500 (`:108-113`). **Boton nutricion SEPARADO** (`:117-141`): `onViewNutrition` con `stopPropagation`, bg danger-100/success-100, dot pulsante, `"Nutrición en riesgo"`/`"Nutrición en track"`. "Próximo entreno" (`:144-158`): `CalendarCheck`, `"Próximo entreno · {dayName}{· Hoy?}"` + `"{title} · {n} ejercicio(s)"`.
- **RN (`OverviewTab.tsx:158-189`):** `TouchableOpacity onPress={onEditProgram}` (→ builder, NO tab Programa) + `StatCard` + `CardHeader icon={LayoutGrid} title="Programa activo"`. Solo si `activeProgram ?` (`:158`) → **sin programa NO hay card ni ruta al builder** (Ola 0 P1). Nombre (`:162`); Pills: `program_structure_type` "Cíclico"/"Semanal", `ab_mode?"A/B"`, "{weeks} sem.", "{planCount} días" (`:163-168`); "Progreso del ciclo" + `ProgressBar` (`:169-177`); "Próximo:" `dayName · title` (`:178-186`). **Sin badge En track/Vencido, sin boton nutricion separado, sin barra de fases.**

### 1.5 Metricas clave (web) — AUSENTE en RN
- Web `:357-401`: card con **Peso actual** (`currentWeight` 22px black + " kg", `:364-368`) y **Variación semanal** (`weeklyWeightVariation.toFixed(1)` con signo, color `success-600` si `<=0` / `ember-700` si `>0`, `:371-389`; icono `ArrowUpRight` ember-600 / `ArrowDownRight` success-500 / `Minus` muted, `:382-388`) + `BiometricsEditDialog` (`:393-398`).
- **RN:** peso actual en `BiometriaCard` (`:403`), Δ 30d como KPI (`:152`). **La "Variación semanal" con flecha direccional NO existe en el tab** (Ola 0 P1).

### 1.6 Editor de biometria (web `BiometricsEditDialog` `:529-754`)
- Trigger: `Button secondary icon-sm` `Pencil`, aria-label `"Editar biometría inicial"` (`:712-719`).
- Responsive: `useIsDesktopMd` (`:507-513`) → desktop `Dialog`, movil `Sheet` bottom (`:720-751`). Titulo `"Editar biometría inicial"` (`:724-726, 742-744`).
- Body (`:591-685`): parrafo `"Necesario para calcular IMC {MetricInfo imc} y gasto energético (TDEE) {MetricInfo tdee}"` (`:593-598`). Inputs: **Altura** `number inputMode=numeric min=50 max=260` ph "cm" (`:608-618`); **Peso inicial** `inputMode=decimal min=20 max=400 step=0.1` ph "kg" (`:627-638`); **Sexo** radiogroup 2x2 (`:640-673`) `SEX_OPTIONS` (`:515-520`): Masculino/Femenino/Otro/**"Sin especificar"**; seleccionado `border-sport-500 bg-sport-100 text-sport-600`. Error `role=alert` danger-600 (`:676-683`).
- Footer (`:687-708`): Cancelar (secondary) + Guardar (sport) `"Guardando…"` si pending. `handleSave` → `updateClientBiometrics(clientId, {heightCm, weightKg, sex})` → cierra + `router.refresh()` (`:573-589`).
- **RN `BiometriaCard` (`OverviewTab.tsx:358-433`):** `StatCard` + `CardHeader icon={Ruler} title="Biometría"` con `Pencil` (aria-label `"Editar biometría"`, testID `ficha-edit-biometria`). Grid 2: Altura/Peso inicial/**Peso actual**/**Objetivo**/Sexo (extras RN legitimos). Sheet (`:409-430`): titulo `"Editar biometría"` (vs web "…inicial"), description texto plano `"Necesario para calcular IMC y gasto energético (TDEE)."` (SIN MetricInfo), `snapPoints={['88%']}` **(gotcha 6a — §5)**. Inputs `keyboardType numeric/decimal-pad` **sin min/max/step** (`:422-423`); Sexo `SegmentedTabs` `SEX_SEGMENTS` (`:29-34`) label `"Sin esp."` (vs web "Sin especificar"). Extra RN: **Peso objetivo** `updateCoachClient(goal_weight_kg)` (`:428, 387`). `parseBio` coma decimal (`:36-41`). Guarda `upsertClientBiometrics` (`:381`).

### 1.7 HabitsMiniWidget (web) — AUSENTE en RN
- Web `:405-406, 836-1005`: `Card "Hábitos diarios"` con badge "Hoy"/"prom. 7d", fila 3 celdas Agua/Pasos/Sueño (hoy con fallback a prom, `:891-911`), hint "Sin registro hoy · mostrando promedio de {n} días…", chips Suplementos, disclosure `"Ver 7 días"`/`"Ocultar"` (`ChevronDown` rota, `:941-954`) → tabla Día/Agua/Pasos/Sueño/Ayuno (`:958-993`), nota explicabilidad. Omite si `daysLogged===0` (`:846`). **Cero referencias en `OverviewTab.tsx`** (Ola 0 P1).

### 1.8 Ultimo check-in (web `ProfileCheckInSnapshot.tsx`)
- Sin check-in (`:120-138`): Card "Aún no hay check-ins registrados." + `Button link` `"Ver panel de progreso"` `ChevronRight` → `onViewHistory`.
- Con check-in (`:148-275`): `SectionTitle "Último check-in"` + relativo `formatDistanceToNow(...locale es)` (`:140-143, 150-153`). Foto (front||side||back, `:100-101`) tappable → `Dialog`(desktop)/`Sheet`(movil) "Foto del check-in" (`:155-208`). `MetricRow` Peso/Energía/Notas (`:210-226`): Peso `"{weight} kg"`/"—"; Energía `EnergyStars` (`round(level/2)` de 5, ember-500/ink-200, `:48-65`); Notas o "Sin notas". **Toggle revisado** (`:229-263`): optimista `markCheckInReviewed`/`unmarkCheckInReviewed` (`:105-118`), `Loader2` spin si pending, `"Revisado · des-marcar"` / `"Marcar como revisado"`, aria-pressed. Boton `"Ver historial en Progreso"` `ChevronRight` → `onViewHistory` (`:265-273`).
- **RN `CheckInSnapshot` (`OverviewTab.tsx:319-353`):** `StatCard` + `CardHeader icon={Check} title="Último check-in" right={formatDate}`. Foto tappable → `onOpenPhoto(photos,0)` (visor). `MetricBox` Peso "{weight} kg" + Energía "{level}/10" (**barra/numero, NO estrellas**). Si `reviewed_at` → `Pill "Revisado" success`; si no → `Button outline "Marcar revisado"` → `markCoachCheckInReviewed` + `Alert.alert` error + `reload()` (`:322-326`, **sin toggle optimista, sin des-marcar**). Notas `cd.sub`. **Sin boton "Ver historial en Progreso".**

### 1.9 Evolucion visual (web `:415-455`)
- `Card "Evolución visual"`. Con fotos: grid 3, `photo = front||side||back` (`:421`), `Image` overlay hover con fecha `toLocaleDateString('es-ES', day 2-digit month short)`. Sin fotos: **card se mantiene**, linea `bg-surface-sunken` icono `Camera` ink-300 + `"Sin fotos recientes de check-in."` (`:448-454`).
- **RN `:198-213`:** `StatCard` + `CardHeader icon={Activity} title="Evolución de fotos"`. `recentPhotos = checkIns.filter(front_photo_url).slice(0,3)` (`:95-98`) → **solo front, ignora side/back** (Ola 0 P1). Miniatura + fecha debajo (`formatDate`, adaptacion touch valida). **Sin empty-state — `recentPhotos.length ?` oculta toda la card** (Ola 0 P2).

### 1.10 Modulos (web) / Herramientas (RN)
- Web `:457-474`: `moduleCards` gateados por `moduleFlags` (`:259-272`): Cardio `HeartPulse` → `/coach/cardio/{id}`, Movimiento `PersonStanding` → `/coach/movement/{id}`, Composición `Scale` → `/coach/clients/{id}/bodycomp`. Tiles `flex-1` verticales `border-subtle`, icono `h-5 w-5 text-sport-600` uniforme + label 11.5px bold.
- **RN `HerramientasSection` (`:225-302`):** gateado por `useEntitlements().hasModule` (`cardio`/`movement_assessment`/`body_composition`). `StatCard` + `CardHeader icon={Wrench} title="Herramientas"`. `ToolRow` (lista vertical con chevron, `:288-302`): fetch subtitulo de estado (extra RN legitimo: "Perfil configurado"/"N evaluaciones · hace X"/"Última medición · hace X"), colores por modulo **hardcodeados** (`theme.destructive`, `theme.primary`, `#8B5CF6` `:275-281`), icono Movimiento = `Activity` (vs `PersonStanding`), label "Composición corporal" (vs "Composición"), ruta bodycomp `/coach/bodycomp/{id}` (vs `/coach/clients/{id}/bodycomp`). Sin modulo → seccion no aparece (`:268`).

### 1.11 Editar plan (web) — AUSENTE en RN
- Web `:479-492`: `<Link>` `buttonVariants sport lg w-full`, icono `PencilLine`, `"Editar plan"`, → `/coach/builder/{clientId}?programId=` (con programId si hay activo; SIEMPRE navega). Comentario "SIEMPRE al final". **RN no lo tiene** — unica via = tap en card Programa que solo existe con programa activo (Ola 0 P1).

---

## 2. TAB PROGRESO — web `ProgressBodyCompositionB6.tsx`

### 2.0 Empty global (0 check-ins)
- Web `:416-426`: `Card padding=lg` icono `Scale` + `"Sin check-ins todavía. La composición y tendencias aparecerán cuando el alumno registre peso y fotos."`.
- RN `ProgresoTab.tsx:60-62`: `EmptyState icon={Activity} title="Sin progreso" subtitle="Este alumno aún no registra check-ins."` (icono+copy distintos, Ola 0 P2).

### 2.1 Peso · tendencia + statboxes
- Web `:431-645`: `Card`, header `SectionTitle "Peso · tendencia"` + peso grande `lastWeight.toFixed(1)` 22px black + "kg" (`:433-441`), **delta7d** al lado (`:442-453`): `+X kg` 13px, color `success-600` si `<=0` / `ember-700` si `>0`. Curva SVG normalizada (`:457-531`, `n>1`) linea sport-500, puntos `<button>` tappables → `setDotDetail` (`:487-506`), **linea objetivo** punteada success-500 si `goalWeight` (`:465-475`) + leyenda `"Objetivo · X kg"` (`:508-522`). `n<=1` → **card SE MANTIENE** con placeholder 90px "Hace falta al menos dos pesos para la curva." (`:524-531`). Grilla 3 cols, 5 statboxes (`:533-644`): Inicial `firstWeight.toFixed(1)` (primer check-in con peso), Cambio total (color success/ember por signo), **Ritmo 30d** `sub "regresión"` + `MetricInfo regresion`, **Proyección 4 sem** rango `low–high kg` via `projectedWeightRangeKg` + badge `"estimado"` + hint `"extrapolación lineal, no una promesa"` + `MetricInfo proyeccion` (`:556-572`), Energía media `sub "7 días"` `"{avg}/10"`.
- **RN `ProgresoTab.tsx:66-106`:** `AreaTrend` solo si `points.length >= 2` (`:67`) → **card completa oculta con 0-1 pesos** (Ola 0 P1, pierde header+GoalWeightEditor+peso). `AreaTrend` (`:72-79`) con `referenceY={goal_weight_kg}`, `onActiveIndex` → tooltip inline al scrub (`:80-95`: foto 48x60 + fecha + "{weight} kg · Energía {e}/10" + notas 2 lineas). **Sin peso grande en header, sin delta7d** (Ola 0 P1). Grilla `cd.grid2` (`:100-106`): Peso inicial (`initial_weight_kg ?? series[0]`, **fuente distinta a web** Ola 0 P2, sin toFixed), Peso actual, Cambio total (`#EF4444`/success), **Ritmo 30d** (`slopePerDay*30`, sin MetricInfo), **Proyección 4 sem** (punto unico `actual+slope*28`, sub "regresión lineal", **sin rango/badge/hint** Ola 0 P1). **Sin statbox Energía media** (solo gauge, Ola 0 P2).

### 2.2 IMC + Energia media
- Web `:648-762`: dos cards. **IMC** (`:649-736`): titulo "IMC" + `MetricInfo imc`, valor `bmi.toFixed(1)` 22px + categoria (`bmiCategory`) color `success-600` si "Normal" / `ember-700` si no. Barra 8px gradiente continuo `sport-300→success-500→warning-500→danger-500` (`:695-697`) rango **16–36** (`:368-369`), marker circular 14px. Labels numericos `16/18.5/25/30/36` font-mono (`:713-726`). Linea `"Altura {n} cm · de la ficha intake"` (`:727-733`). `bmi==null` → **"Añade altura en la ficha del alumno (intake) para ver IMC y la escala."** (`:683-686`). **Energía media · 7 días** (`:738-761`): `Gauge` semicircular SVG + numero 26px "/10" + `EnergyStars`; empty "Sin niveles de energía en la última semana." (`:740-743`). Umbrales color: `>=70` success / `>=40` warning / else danger (`:378-384`).
- **RN `:108-125`:** **IMC** `StatCard` solo si `bmi != null` (`:109`, **oculta card sin altura** vs web que pide altura, Ola 0 P2). `CardHeader icon={TrendingUp} title="Índice de masa corporal" right={Pill bmiCategory}` (Pill color primary, sin verde/rojo). Valor `bmi.toFixed(1)` 30px. `BmiBar` (`:209-230`): rango **15–40** (`:23-24`, ≠ web 16-36 → marker en otra posicion), 4 segmentos DISCRETOS hex `#3B82F6/#10B981/#F59E0B/#EF4444` (`:26-29`), marker rectangular 5x20 `#FFFFFF`/border `#0F172A` (`:521`, invisible en dark), labels TEXTO "Bajo/Normal/Sobre/Obes." (≠ numericos web). **Sin linea de altura, sin MetricInfo.** **Energía gauge** `:118-125`: `RadialGauge` solo si `energy7d != null` (oculta sin dato vs web empty). `energyColorHex(round)` umbrales **>=8/>=5** (≠ web 70/40 → 7.5 verde en web, ambar en RN, Ola 0 P1). **Sin EnergyStars.**

### 2.3 Composicion corporal
- Web `:764-773`: **`bodycompEnabled ? <CompositionSection> : <CompositionTeaser>`**. `CompositionTeaser` (`:128-211`): preview fake difuminado `blur-sm opacity 0.55` (tiles "% Grasa 18.4%"/"Masa muscular 34.2 kg", polyline sport-500), icono `Ruler` en circulo, titulo "Composición corporal", copy `"%Grasa, masa muscular y antropometría (protocolo ISAK). Parte del módulo Composición corporal."` + CTA `<Link href="/coach/settings/modules">` `"Desbloquear"` bg cta-fill (`:201-206`). `CompositionSection` (`:216-282`): reusa `BiaTrendPanel`/`IsakTrendPanel`, `SegmentedControl` Bioimpedancia/Antropometría (`:263-270`), series NUNCA mezcladas; empty "Sin mediciones todavía. Captura bioimpedancia o antropometría (ISAK) desde el {link} módulo Composición corporal." (`:230-256`).
- **RN `ProgresoTab.tsx:127-128, 366-473`:** `<CompositionSection clientId hasModule={hasBodyComp} />` **renderizado SIEMPRE que exista client** (sin gate del padre). `CompositionSection`: `loading` inicia `true` (`:369`), `useEffect` retorna temprano si `!hasModule` **SIN apagar loading** (`:372-374`) → **card PERMANENTEMENTE en "Cargando mediciones…" con el modulo OFF** (`:406-413`). **NO existe teaser ni CTA de desbloqueo** (Ola 0 **P0**). Con datos: `CardHeader icon={Ruler}` + `Pill bcDeviceLabel`, `SegmentedTabs` Bioimpedancia/Antropometría solo si hay ambas (`:449-459`), `BiaTiles`/`IsakTiles` de la ULTIMA medicion (`:481-510`), UNA tendencia fija "% Grasa · tendencia" `AreaTrend` (`:463-468`), boton "Nueva medición" → `/coach/bodycomp/{id}`. **Sin toggle de serie (masa muscular/adiposa sin curva), sin lista de mediciones historicas, sin accion eliminar** (Ola 0 P1). Query PostgREST `body_composition_measurements` cols `BC_COLUMNS` (`:351, 378-385`), `deleted_at IS NULL`, orden `measured_at desc`, RLS techo. Empty (con modulo, sin mediciones): "Sin mediciones todavía. Captura bioimpedancia (BIA) o antropometría (ISAK)…" + boton (`:415-425`).

### 2.4 Comparativa de fotos
- Web `:775-874`: `Card "Comparativa de fotos"` (si `photoCheckIns.length >= 2`). Selects **Base**/**Comparar** con opciones `"{format d MMM yyyy} · {weight} kg"` (`:789-794, 806-811`). Δ Peso + Δ Energía coloreados. Boton secondary full-width `"Abrir comparativa"` (`Images`, disabled si falta foto o base==comparar) → `PhotoComparisonSlider` (slider superpuesto antes/después con fechas).
- **RN `PhotoComparator` (`:232-295`):** `StatCard` + `CardHeader icon={GitCompare} title="Comparador antes / después"` (titulo ≠ web). `CompCol` Antes/Después lado a lado (`:274-286`), tap → `onOpenPhoto([url],0)` (**visor individual, NO slider superpuesto**, Ola 0 P2). MetricBox Δ peso/Δ energía. Chips selectores `SelChip` con **solo fecha, sin peso** (`:261, 267`, Ola 0 P2). `withPhoto` filtra `front_photo_url` (`:234-236`).

### 2.5 Historial de check-ins + modal detalle
- Web `:876-951`: `SectionTitle "Historial de check-ins"` + cards `sortedDesc`. Cada: fecha **con hora** `format(..., 'd MMM yyyy · HH:mm')` (`:889`), thumbnail 60x60 tappable → `setDotDetail`, peso 17px + kg, `EnergyStars` (`:931-933`), notas o **"Sin notas" italica** (`:939-945`). **Modal detalle** (`Dialog` `:953-1014`): titulo "Check-in · {fecha}", foto grande aspect-3/4, peso 20px, `EnergyStars` + "{level}/10", notas completas 13.5px.
- **RN `CheckInRow` (`:297-327`):** `styles.ciCard`. Fecha **sin hora** (`formatDate`, `:303`). Peso primary. Energía = **barra de progreso** `energyColorHex` (`:306-314`, NO estrellas). Notas `cd.sub`; **sin "Sin notas"** (oculto). Fotos front/side/back tappables → `onOpenPhoto(photos, i)` (visor generico, `:316-323`). **Sin modal de detalle con foto grande + notas integras** (Ola 0 P2). (Extra RN: side/back — superset legitimo.)

### 2.6 GoalWeightEditor (RN — extra)
- RN `:146-207`: trigger en header del chart de peso (`:69-71`). Con objetivo → `Pill "Objetivo {n} kg"` + `Pencil`; sin objetivo → `"Definir objetivo"` (`Target`). Sheet titulo "Peso objetivo" desc "Dibuja la línea de objetivo en el chart de peso." `snapPoints={['55%']}` **(gotcha 6a — §5)**. Input decimal, valida 20–400 kg (`:164`), guarda `updateCoachClient(goal_weight_kg)`. Web declara que el editor vive en el dashboard padre (`ProgressBodyCompositionB6.tsx:43-44`) → **superset legitimo RN, no eliminar.**

---

## 3. WeeklyPRBanner — web `TrainingTabB4Panels.tsx:47-101`

- **Web (`:72-99`):** `Card padding="md" gap-0 border-ember-200` con `background: linear-gradient(135deg, var(--ember-100), var(--sport-100))` (claro). Header `Trophy h-5 w-5` + `"Récord de la semana"` 13px black uppercase color `var(--ember-700)`. Linea: `exerciseName` 16px black + `"{newWeightKg} kg × {newReps}"` xl black + `Badge success "+{pctChange}% 1RM"` (si `pctChange != null`). **Subline SIEMPRE visible** (`:95-98`): `"Antes: {prevWeightKg} kg × {prevReps} · e1RM {prevOneRm} → {newOneRm} kg{ · +N ejercicio(s) más}"`. Confetti `canvas-confetti` respeta `useReducedMotion` y dispara **UNA vez** (`fired.current`, `:48-65`). Muestra **solo `prs[0]`** (`:69`), sin pager; "+N ejercicios más" indica el resto.
- **RN (`WeeklyPRBanner.tsx:38-105`):** card SOLIDA naranja `#F59E0B` texto blanco (`:66`), `borderRadius theme.radius.xl`. Header `Trophy` en circulo blanco + kicker `"¡NUEVO RÉCORD ESTA SEMANA!"` (≠ web "Récord de la semana") + `exerciseName` 18px black + `muscleGroup` (extra RN). **Pager 1/N** con `next()` ciclando (`:53-57`, extra RN) + haptics `selectionAsync`. 3 stat-boxes: "{newWeightKg} kg × {newReps}" "Mejor serie", "{newOneRm} kg" "1RM estimado", "▲ {pctChange}%" "vs {prevOneRm} kg" (solo si `pctChange != null`). **El "Antes" (prevWeightKg × prevReps) NUNCA se muestra** (Ola 0 P1). Confetti Moti (`:12-35`) **re-dispara en cada mount/next SIN chequeo reduce-motion** (`:43-48, 53-57`, Ola 0 P1). Haptics `notificationAsync Success` en aparicion. `CONFETTI_COLORS` hex fijos (`:9`).
- Tipo `WeeklyWeightPR` viene del package compartido `@eva/profile-analytics` (RN `lib/profile-analytics.ts` reexporta todo, `:4`; web `profileTrainingAnalytics.ts:32` re-exporta). Calculo de paridad OK (mismo kernel).

---

## 4. Tokens / claro-oscuro (regla dura #3)

- **Web usa SOLO tokens** en semaforos: `var(--sport-500)`, `var(--success-500)`, `var(--danger-500)`, `var(--warning-500)`, `var(--ember-*)` (`ProfileOverviewB3.tsx:193-198, 252-256`).
- **RN con hex crudos que NO adaptan a dark ni a white-label** (Ola 0 P1):
  - `OverviewTab.tsx`: `:53` `'#F59E0B'/'#10B981'`, `:135-136,148` `'#F59E0B'`, `:152` `'#EF4444'`, `:281` `'#8B5CF6'`.
  - `ProgresoTab.tsx`: `:26-29` BMI_SEGMENTS hex, `:103-104,255-256,478` `'#EF4444'`, `:521` bmiMarker `#FFFFFF`/`#0F172A`.
  - `WeeklyPRBanner.tsx`: `:9` CONFETTI_COLORS, `:66` `#F59E0B`.
  - `shared.tsx:54,103` `'#F5A524'/'#F59E0B'` warning.
- **Gap de token confirmado:** `apps/mobile/lib/theme.ts` expone `primary`/`destructive`/`success` (L166-176) pero **NO `warning`** → de ahi el `#F59E0B`/`#F5A524`. Los canales `--color-warning-*` SI existen en `global.css` (rampa clara+oscura, `:74, 168-182, 379`). Para portar sin hex nuevo hay que **exponer `warning` en `lib/theme.ts`** (archivo READ-ONLY de otra unidad → `cambiosShell`).
- **NO tocar `global.css`/`tailwind.config.js`** (regla #3). Los fixes de color consumen tokens existentes o un alias `warning` en `theme.ts`.

---

## 5. Gotcha 6a — sheets con snapPoints fijos (BOMBA -999)

- `OverviewTab.tsx:409-414` `<Sheet snapPoints={['88%']}>` (editor biometria) y `ProgresoTab.tsx:189-194` `<Sheet snapPoints={['55%']}>` (editor peso objetivo): usan `components/Sheet.tsx` en el **path @gorhom** (NO pasan `nativeModal` ni `dynamicSizing`).
- `Sheet.tsx:337` con `dynamicSizing=false` usa `snapPoints` FIJOS (no `enableDynamicSizing`). Segun el doc del prop (`Sheet.tsx:116-145`): el fallo `dynamicSizing` (contenido mide 0) NO aplica (snap fijo), **pero el cold-start `containerHeight = -999`** (primer `present()` antes del commit de layout bajo reanimated 4) SI puede afectar: `88%`/`55%` resolveria contra `-999` → sheet off-screen en el primer tap desde una pantalla recien montada, sanando tras re-layout.
- **Criticidad:** ambos son **acciones de edicion de datos que el coach necesita alcanzar** (biometria alimenta IMC/TDEE; objetivo dibuja la linea del chart). No bloquean lectura pero SI edicion.
- **RECOMENDACION:** migrar ambos a `nativeModal` (`Sheet.tsx:270-330`, patron Modal RN probado en KeypadHost) — API identica, solo se agrega el flag. **Obligatorio probar el primer present en device** (regla del brief). Si abren bien al primer tap, pueden quedarse en @gorhom con snap fijo.
- No cambian gesto/flujo (siguen siendo bottom-sheets con los mismos campos) → migrar a nativeModal es auto-sancionable.

---

## 6. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

**ProfileOverviewB3 (bloque L7056-7151):**
- P1 — HabitsMiniWidget completo ausente (`:7059-7063`).
- P1 — KPI "Adherencia" usa `nutritionWeeklyAvgPct` en vez de `workoutPct` (`OverviewTab.tsx:151`) (`:7065-7071`).
- P1 — Card "Métricas clave" con Variación semanal + flechas ausente (`:7072-7078`).
- P1 — Ring Nutrición NO clickeable (falta `onViewNutrition`) (`:7079-7085`).
- P1 — Botón "Editar plan" full-width ausente; sin programa no hay ruta al builder (`:7086-7092`).
- P1 — Evolución de fotos ignora side/back (solo front) (`:7093-7099`).
- P1 — Colores hardcodeados fuera del theme (`:7100-7106`).
- P2 — Deltas de rings: fabricación sin prev, conteo vs pts, estado cero (`:7107-7113`).
- P2 — KPIs sin chip tonal ni animación escalonada; "Mejor racha" "5d" vs "N días" (`:7114-7120`).
- P2 — MetricInfo (adherencia/IMC/TDEE) ausente (`:7121-7127`).
- P2 — Módulos: tiles, icono Movimiento (`Activity` vs `PersonStanding`), label "Composición" (`:7128-7134`).
- P2 — Empty-state "Evolución visual" (card desaparece sin fotos) (`:7135-7141`).
- P2 — Editor biometría: título "…inicial" y label "Sin especificar" (`:7142-7148`).

**ProgressBodyCompositionB6 (bloque L7421-7537):**
- **P0** — módulo OFF: RN monta CompositionSection y queda "Cargando mediciones…" para siempre; falta teaser+CTA (`:7423-7429`).
- P1 — Proyección 4 sem sin rango low–high + badge "estimado" + hint (`:7430-7436`).
- P1 — Delta 7 días junto al peso actual ausente (`:7437-7443`).
- P1 — Card de peso con n<=1 se oculta entera (`:7444-7450`).
- P1 — Composición con datos: sin toggle de serie, sin lista, sin eliminar (`:7451-7457`).
- P1 — Umbrales de color del gauge de energía (>=8/>=5 vs 70/40) (`:7458-7464`).
- P1 — Colores semánticos hardcodeados (deltas #EF4444, BMI hex, marker #0F172A invisible en dark) (`:7465-7471`).
- P2 — Escala IMC: rango 15-40 vs 16-36, labels texto vs numéricos, sin línea de altura (`:7472-7478`).
- P2 — Statbox "Energía media · 7d" ausente en la grilla (`:7479-7485`).
- P2 — Tooltips MetricInfo (regresión/proyección/IMC) ausentes (`:7486-7492`).
- P2 — Comparativa de fotos: sin slider superpuesto, chip sin peso, título distinto (`:7493-7499`).
- P2 — Línea de objetivo en gris (mutedForeground) vs success-500 + leyenda (`:7500-7506`).
- P2 — Historial: sin hora, energía en barra vs estrellas, sin "Sin notas" (`:7507-7513`).
- P2 — Detalle de check-in: sin foto grande + notas íntegras desde la curva (`:7514-7520`).
- P2 — Fuente del "Peso inicial" distinta (`client.initial_weight_kg` vs primer check-in) (`:7521-7527`).
- P2 — Empty global: icono/copy distintos (`:7528-7534`).

**WeeklyPRBanner (bloque TrainingTab, L7362-7375):**
- P1 — Banner PR: identidad visual (naranja sólido vs gradient ember/sport claro), el "Antes" nunca se muestra, confetti sin reduce-motion (`:7369-7375`).
- P1 — colores hardcodeados `#F59E0B`/`CONFETTI_COLORS` (`:7362-7368`).

**Superset RN legítimo (NO eliminar, regla #2):** TopAlertBanner de triage (`OverviewTab.tsx:51-60,120-129`), CalendarHeatmap 371d (`:141-144`), KPIs "Entrenos (año)"/"Regularidad" (`:150,154`), Biometría visible + peso objetivo editable (`:396-428`), subtítulos de estado en Herramientas (`:243-263`), GoalWeightEditor inline (`ProgresoTab.tsx:146-207`), fotos side/back en historial, pager+muscleGroup del banner. (Notas Ola 0 `:7150, 7536, 7419`.)

---

## 7. Hallazgos Ronda 5

- `docs/audits/rn-parity-qa/r5-audit-coach-core.md:128` **§3.4** declara explícito: los 5 paneles de tab (incluidos `ProfileOverviewB3`, `ProgressBodyCompositionB6`) **NO fueron auditados a fondo en R5** — "cada `clientDetail/*Tab.tsx` requiere pasada propia vs su panel web". Reafirmado en `:134` (pendiente R5.x: "5 paneles de tab de la ficha").
- R5 SÍ cerró (sin diffs) el shell alrededor: `ClientTabBar` set+estilo de pills COINCIDE (5 tabs Resumen·Progreso·Entreno·Programa·Nutrición, `:118-119`), `ProfileFloatingActions` match limpio (`:126`). Único diff del contenedor: falta el glass/blur del sticky (`:123`) — pertenece a `ficha-shell-hero`.
- **Conclusión:** esta SPEC ES la pasada propia que R5 dejó pendiente para Overview+Progreso. No hay tabla R5 de estos paneles; la base es Ola 0 + esta lectura línea-por-línea.

---

## 8. Estado RN actual — divergencias con cita (prioridad de cierre)

1. **P0 ProgresoTab.tsx:128,369-374** — módulo body_composition OFF → spinner "Cargando mediciones…" infinito; falta teaser+CTA "Desbloquear". FIX: con `!hasModule` renderizar teaser (o al menos `loading=false`).
2. **P1 OverviewTab.tsx:151** — KPI "Adherencia" muestra nutrición, no entreno.
3. **P1 OverviewTab.tsx:135-136,310** — deltas de rings en conteo crudo (no pts %), sin caso "sin prev".
4. **P1 OverviewTab.tsx:135,304-317** — Ring Nutrición sin `onPress` (falta deep-link).
5. **P1 OverviewTab.tsx** — ausentes: HabitsMiniWidget, card "Métricas clave" (variación semanal + flecha), botón "Editar plan".
6. **P1 OverviewTab.tsx:95-98,206** — evolución de fotos solo `front` (ignora side/back).
7. **P1 ProgresoTab.tsx:67** — card de peso oculta con n<=1 (pierde header+peso+editor).
8. **P1 ProgresoTab.tsx:53,105** — proyección punto único (sin rango/badge/hint).
9. **P1 ProgresoTab.tsx** — sin delta7d en el header del chart.
10. **P1 ProgresoTab.tsx:118-125** — umbrales de energía 80/50 vs web 70/40.
11. **P1 (tokens)** — hex crudos §4 (requiere exponer `warning` en `theme.ts` → cambiosShell).
12. **P1 WeeklyPRBanner.tsx:59-102** — sin línea "Antes: …", confetti sin reduce-motion, naranja sólido vs gradient.
13. P2 (varios §6) — MetricInfo, EnergyStars, IMC rango/labels, empty-states, "Sin notas", slider de fotos, hora en historial.

**Gotcha 6d (claves de día):**
- `OverviewTab.tsx:85-90` (Δ peso 30d) usa `Date.now() - 30*86400000` y `new Date(c.date)` — corte en TZ del device, no día Santiago. `:107` `new Date().getDay()` para "próximo entreno".
- `ProgresoTab.tsx:56` energía 7d usa `Date.now() - 7*86400000`; `:51` regresión usa `created_at ?? date`.
- El web computa compliance/"esta semana" server-side (Santiago) y los tabs consumen el número resuelto; los cómputos RN client-side de borde de día pueden diferir ~1 día. Divergencia menor; anotar. NO reintroducir prefijo UTC.

---

## 9. Mapa de interacciones (el lente de cableado verifica contra esta lista)

### Tab Resumen (web `ProfileOverviewB3`)
| Tocable | Efecto web | Cita web | Estado RN |
|---|---|---|---|
| Ring Entreno | (no interactivo) | `:286-291` | View (OK) |
| Ring Nutrición | deep-link Zona A nutrición (`onViewNutrition`) | `:292-298` | **View sin onPress (FALTA)** `OverviewTab.tsx:135` |
| Ring Check-in | (no interactivo) | `:299-304` | View (OK) |
| KPI Adherencia (icono info) | `MetricInfo term=adherencia` popover | `:334-336` | ausente |
| Card Programa (con activo) | `onOpenProgram` → tab Programa | `ProfileProgramSummaryCard.tsx:78-79` | `onEditProgram` → **builder** (destino distinto) `OverviewTab.tsx:159` |
| Botón nutrición en card Programa | `onViewNutrition` (stopPropagation) | `:117-141` | ausente |
| Botón "Asignar programa" (sin activo) | `<Link>` → `/coach/builder/{id}` | `:64-70` | ausente (sin card sin activo) |
| Botón editar biometría (Pencil) | abre Dialog/Sheet | `:712-719` | `openEditor()` Sheet `OverviewTab.tsx:398` |
| Sexo (radio/segment) | set sex | `:652-671` | `SegmentedTabs onChange` `:426` |
| Cancelar / Guardar biometría | close / `updateClientBiometrics`+refresh | `:687-708` | Cancelar / `save()`→upsert+updateCoachClient+reload `:417-418` |
| Foto check-in (snapshot) | abre Dialog/Sheet "Foto del check-in" | `ProfileCheckInSnapshot.tsx:157-172` | `onOpenPhoto(photos,0)` visor `OverviewTab.tsx:334` |
| Toggle "Marcar como revisado" | optimista mark/unmark | `:229-263` | `markCoachCheckInReviewed`+reload, **sin unmark/optimista** `:322-326` |
| "Ver historial en Progreso" | `onViewHistory` → tab Progreso | `:265-273` | **ausente** |
| Miniaturas Evolución visual | (hover muestra fecha) | `:428-443` | tap → `onOpenPhoto(photos,0)` `OverviewTab.tsx:205` |
| Habits "Ver 7 días" / "Ocultar" | toggle tabla 7d | `:941-954` | ausente (widget entero falta) |
| Tiles Módulos (Cardio/Mov/Comp) | `<Link>` → ruta módulo | `:462-471` | `ToolRow onPress` router.push `OverviewTab.tsx:275-281` |
| Botón "Editar plan" full-width | `<Link>` → builder (siempre) | `:479-492` | **ausente** |

### Tab Progreso (web `ProgressBodyCompositionB6`)
| Tocable | Efecto web | Cita web | Estado RN |
|---|---|---|---|
| Puntos de la curva de peso | `setDotDetail` → modal detalle | `:487-506, 953-1014` | scrub → tooltip inline (sin modal) `ProgresoTab.tsx:80-95` |
| Editor peso objetivo | (web: vive en padre) | `:43-44` | `GoalWeightEditor` trigger→Sheet `ProgresoTab.tsx:175` (extra RN) |
| Cancelar/Guardar objetivo | — | — | `updateCoachClient(goal_weight_kg)` `:166` |
| SegmentedControl BIA/ISAK | `setMethod` | `:263-270` | `SegmentedTabs onChange` `:453` |
| CTA "Desbloquear" (módulo OFF) | `<Link>` → `/coach/settings/modules` | `:201-206` | **ausente (P0 spinner infinito)** |
| Botón "Nueva medición" | — (web usa panel) | — | router.push `/coach/bodycomp/{id}` `:404,422,470` (extra RN) |
| Eliminar medición (por fila) | `deleteBodyCompositionAction` | (BiaTrendPanel) | **ausente** |
| Select Base/Comparar | set base/compare | `:784-812` | chips `SelChip onPress` `:261,267` (sin peso) |
| Botón "Abrir comparativa" | `PhotoComparisonSlider` superpuesto | `:851-864` | **ausente** (CompCol tap→visor individual) `:251-252` |
| Fotos CompCol | — | — | `onOpenPhoto([url],0)` `:279` |
| Thumbnail historial | `setDotDetail` → modal | `:894-915` | `onOpenPhoto(photos,i)` visor `:319` |
| Modal detalle check-in (cerrar) | `onOpenChange` | `:954` | ausente (no hay modal) |

### WeeklyPRBanner
| Tocable | Efecto web | Cita | Estado RN |
|---|---|---|---|
| (banner completo) | estático, solo `prs[0]` | web `:69` | pager `next()` cicla PRs + haptics `WeeklyPRBanner.tsx:78,53-57` |
| Pager "{i+1}/{N}" | — (web usa "+N más") | `:97` | `next()` avanza índice (extra RN) `:78` |

---

## 10. Adaptaciones idiomáticas RN (auto-sancionadas — preservan lo que el usuario ve/hace)

- 1 columna en móvil (web 2-col por container-query). Válido.
- `Sheet` bottom RN vs `Dialog`/`Sheet` responsive web (matchMedia). Mismo contenido.
- `TouchableOpacity`/`Pressable` vs `:hover`; fecha de foto DEBAJO de la miniatura vs overlay hover.
- `ProgressRing`/`ComplianceRing` size 68 vs 84 (ancho de pantalla).
- Coma decimal en `parseBio` (`OverviewTab.tsx:36-41`).
- `SegmentedTabs` vs `SegmentedControl`; `AreaTrend`/`RadialGauge` SVG-nativo vs recharts.
- Scrub táctil en charts vs hover.

**PENDIENTE-DECISION-CEO (cambian un GESTO/flujo — NO auto-sancionar):**
- **Detalle de check-in (Progreso):** web = tap en punto/thumbnail abre MODAL con foto grande + notas íntegras (`ProgressBodyCompositionB6.tsx:953-1014`); RN = scrub del chart → tooltip compacto con notas truncadas 2 líneas y sin foto ampliada (`ProgresoTab.tsx:80-95`). El usuario RN NO puede abrir la foto grande ni leer las notas completas desde la curva. Decisión: ¿portar un Sheet de detalle tappable, o aceptar el tooltip?
- **Comparativa de fotos:** web = slider superpuesto antes/después (`PhotoComparisonSlider`); RN = fotos lado a lado que abren el visor individual. Cambia el gesto de comparación. Decisión: ¿portar el slider o mantener side-by-side?
- **Card Programa (Resumen) destino del tap:** web abre el TAB Programa (`onOpenProgram`); RN abre el BUILDER (`onEditProgram`). Distinto destino/expectativa. Decisión: ¿alinear a tab Programa o mantener builder?

---

## 11. cambiosShell (archivos ajenos — NO editar aquí)

- `apps/mobile/lib/theme.ts` — exponer canal `warning` (hoy solo `primary/destructive/success`, L166-176) para eliminar `#F59E0B`/`#F5A524` sin hex nuevo. Owner del shim de theme.
- `apps/mobile/app/coach/cliente/[clientId].tsx` — si Overview necesita `onViewNutrition`/`onOpenProgram`/`onViewHistory` (deep-links a otros tabs), el padre debe pasarlos (hoy solo `onEditProgram`, L284). Owner `ficha-shell-hero`.
- `apps/mobile/components/coach/charts/AreaTrend.tsx` — para la línea de objetivo en `theme.success` (hoy `mutedForeground`, `:84-92`) hace falta prop de color; primitivo compartido → cambiosShell salvo que ninguna otra ficha-unit lo use.
- `apps/mobile/components/coach/clientDetail/shared.tsx` — si `MetricBox` necesita `icon`+tono de fondo (paridad KPI web), extender el primitivo. Owner `ficha-shell-hero`.
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx` — call-site del `WeeklyPRBanner`; los fixes del banner (línea "Antes", reduce-motion) viven en el componente propio, pero cualquier cambio de props/cableado es cambiosShell.

---

## Gate

Esta SPEC NO modifica archivos `.ts/.tsx` de `apps/mobile` → `npx tsc --noEmit` no se ve afectado (baseline verde). El gate de tsc aplica cuando el ejecutor implemente los fixes.
