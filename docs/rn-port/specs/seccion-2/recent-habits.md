# SPEC · §10 Actividad reciente + §11 Hábitos de hoy (key: `recent-habits`)

Fuente de verdad WEB:
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/history/RecentWorkoutsSection.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/history/WorkoutLogItem.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/habits/HabitsCard.tsx`
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/habits/HabitsTrackerWidget.tsx`
- Data-layer: `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`
- Server action: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/habits.actions.ts`
- Shell padre web: `apps/web/src/app/c/[coach_slug]/dashboard/page.tsx` (+ `_components/desktop/DashboardDesktop.tsx`), `_components/shared/SectionTitle.tsx`

Contraparte RN:
- `apps/mobile/components/alumno/home/RecentWorkouts.tsx`
- `apps/mobile/components/alumno/home/HabitsCard.tsx`
- Data-layer RN: `apps/mobile/lib/history.queries.ts`, `apps/mobile/lib/habits.queries.ts`
- Shell RN: `apps/mobile/app/alumno/(tabs)/home.tsx:382-396`

Toda afirmación cita `archivo:linea`. Cero especulación.

---

## PARTE A — §10 ACTIVIDAD RECIENTE (RecentWorkoutsSection + WorkoutLogItem)

### A.1 Arquitectura del componente y jerarquía
- `RecentWorkoutsSection` es **server component async** (`RecentWorkoutsSection.tsx:7` `export async function`). Recibe `{ userId, coachSlug }`.
- Flujo: resuelve `base = await getClientBasePath(coachSlug)` (`:8`), trae `logs = await getRecentWorkoutLogs(userId)` (`:9`), y **si `logs.length === 0` retorna `null`** (`:10`) → la sección entera (incluido su título) desaparece.
- Agrupa: `items = buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })` (`:12`).
- Render (`:15-24`): `<div>` con `<SectionTitle action="Historial" actionHref={base + '/workout-history'}>Actividad reciente</SectionTitle>` (`:17-19`) seguido de `<Card padding="none" className="border border-subtle bg-transparent shadow-none">` (`:20`) que envuelve `<WorkoutLogItems items={items} />` (`:21`).
- **El SectionTitle vive DENTRO del componente** (`:17`). Con 0 logs no se renderiza nada, ni el título ni el link "Historial". (Ola0 P1 «título huérfano», ver §A.8.)

### A.2 SectionTitle (título de sección) — `shared/SectionTitle.tsx`
- Contenedor: `<div className="mx-0.5 mb-2.5 mt-5 flex items-center justify-between">` (`SectionTitle.tsx:20`).
- Izquierda: `<span className="inline-flex items-center gap-2">` con:
  - Barra de acento: `<span aria-hidden className="h-3 w-[3px] shrink-0 rounded-sm" style={{ background: accent }} />` (`:22`). `accent` default = `'var(--sport-500)'` (`:10`). Para §10 NO se pasa accent → **default sport-500**.
  - Label: `<span className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-subtle">{children}</span>` (`:23`). Texto literal: **"Actividad reciente"** (render uppercase por CSS).
- Derecha (acción): `action && actionHref ? <Link href={actionHref} className="text-[12.5px] font-bold text-sport-600">{action}</Link> : null` (`:25-29`). Para §10: `action="Historial"`, `actionHref = base + '/workout-history'` (`RecentWorkoutsSection.tsx:17`). Color del link = **sport-600**.

### A.3 Card contenedor
- `<Card padding="none" className="border border-subtle bg-transparent shadow-none">` (`RecentWorkoutsSection.tsx:20`). Es decir: **fondo transparente, borde `border-subtle`, sin padding interno, sin sombra**. (Contraste RN en §A.8 P1.)

### A.4 WorkoutLogItems (lista de filas) — `WorkoutLogItem.tsx`
- `'use client'` (`:1`). Recibe `items: Array<{ dayKey, dateLabel, sets, subtitle }>` (`:13`).
- Wrapper animado: `<RevealStagger className="divide-y divide-[var(--border-subtle)]">` (`:16`) — cascada `whileInView` barata (solo opacity/transform), reduced-motion aware (comentario `:6-9`). Divisores entre filas = `divide-y` color `var(--border-subtle)`.
- Cada fila: `<RevealItem key={item.dayKey} variant="fadeUp">` (`:18`) con `<div className="flex items-center gap-3 px-4 py-3">` (`:19`):
  - Icono (izq): `<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-sport-600">` (`:20`) con `<Dumbbell className="h-[18px] w-[18px]" />` (`:21`). Contenedor 36×36 (`h-9 w-9`), `rounded-control`, fondo `bg-surface-sunken`, glifo hereda `text-sport-600`. **Sin `strokeWidth` → default lucide = 2** (`WorkoutLogItem.tsx:3,21`, import `lucide-react`).
  - Centro: `<div className="min-w-0 flex-1">` (`:23`) con:
    - `<p className="text-sm font-bold text-strong">{item.dateLabel}</p>` (`:24`) — 14px bold, `text-strong`.
    - `<p className="text-xs text-muted">{item.subtitle}</p>` (`:25`) — 12px, `text-muted`.
  - Derecha (badge): `<span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-subtle">{item.sets} {item.sets === 1 ? 'serie' : 'series'}</span>` (`:27-29`) — 12px bold `tabular-nums`, `text-subtle`, pluralización "serie"/"series".

### A.5 Datos / queries — `dashboard.queries.ts`
- `getRecentWorkoutLogs(clientId)` (`:145-157`): tabla `workout_logs`, select `id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks(plan_id)` (`:151`), filtro `.eq('client_id', clientId)` + `.gte('logged_at', thirtyDaysAgo)` (**ventana 30 días**, `:147-148,153`), `.order('logged_at', desc)` (`:154`), `.limit(200)` (`:155`).
- `buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })` (`:182-210`):
  - Agrupa por día calendario **America/Santiago** (`:186` `toLocaleString('en-US', { timeZone: 'America/Santiago' })`).
  - Ordena días `b.localeCompare(a)` (newest-first, `:192`), corta a `dayLimit` (5, `:193`).
  - Por día: `sets = dayLogs.length` (`:197`).
  - `dateLabel = new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })` (`:198-202`) → ej. **"lunes, 7 jul"** (weekday largo + día + mes corto, sin año).
  - `subtitle = \`${sets} ${sets === 1 ? 'serie registrada' : 'series registradas'}\`` (`:207`).
  - `dayKey = d` (YYYY-MM-DD, `:204`).

### A.6 Estados
- **Vacío (0 logs):** `RecentWorkoutsSection.tsx:10` retorna `null` → toda la sección (título + card) desaparece. No hay empty-state explícito; es ocultamiento total.
- **Carga:** es server component; no hay estado de carga cliente (render bloqueante en el servidor). No hay skeleton.
- **Error:** query sin try/catch; `data` cae a `[]` (`getRecentWorkoutLogs :156` `(data ?? [])`) → tratado como vacío → sección oculta.
- **Con datos:** hasta 5 filas (por día), animación cascada fadeUp.

### A.7 Animaciones / accesibilidad
- Cascada `RevealStagger`/`RevealItem variant="fadeUp"` (`WorkoutLogItem.tsx:16-18`), solo opacity/transform, `whileInView`, reduced-motion aware (comentario `:6-9`).
- Barra de acento del título tiene `aria-hidden` (`SectionTitle.tsx:22`).
- Badge `tabular-nums` para alineación de dígitos (`WorkoutLogItem.tsx:27`).

### A.8 Estado RN actual §10 — divergencias (con cita)
1. **[Ola0 P1] Card fondo+sombra.** RN `RecentWorkouts.tsx:28` `<Card padding="none" style={{ overflow: 'hidden' }}>` usa variante `default` (`Card.tsx:50` `bg-surface-card border border-subtle` + sombra `S.sm` `Card.tsx:92-99`). Web fuerza **fondo transparente + sin sombra** (`RecentWorkoutsSection.tsx:20`). Fix: variante sin fondo/sombra conservando `border-subtle` (no usar `outline` de `Card.tsx:53` que resuelve a `border-default`, token equivocado).
2. **[Ola0 P1] dateLabel distinto.** RN `history.queries.ts:65` usa `formatRelativeDate(dayKey, todayIso)` → "Hoy"/"Ayer"/"Hace N días"/"7 jul 2026" (`date-utils.ts:97-109`). Web usa es-CL weekday-long + day + month-short "lunes, 7 jul" (`dashboard.queries.ts:198-202`). **Texto visible completamente distinto.** Fix: mapear el label en el widget desde `d.dayKey` con el formato web (NO cambiar `getWorkoutDaySummaries`, que es compartida con la pantalla de historial mobile que sí declara paridad con `formatRelativeDate`).
3. **[Ola0 P1] Título huérfano (arquitectónico).** En web el SectionTitle vive DENTRO de `RecentWorkoutsSection` (`:17`) y con 0 logs desaparece (`:10`). En RN el shell renderiza el título fuera: `home.tsx:385` `<SectionTitle action="Historial" onAction={...}>Actividad reciente</SectionTitle>` incondicional (si `data?.client`), y `RecentWorkouts.tsx:24` retorna `null` con `days == null || length === 0`. Resultado: alumno sin registros (o durante carga/error por `.catch(() => setDays([]))` en `RecentWorkouts.tsx:21`) ve el título "ACTIVIDAD RECIENTE" + link "Historial" con nada debajo. Ver `cambiosShell`.
4. **[Ola0 P2] Ventana de datos.** RN `RecentWorkouts.tsx:21` llama `getWorkoutDaySummaries(clientId)` sin `daysBack` → default 90 días (`history.queries.ts:22,46`), luego `days.slice(0, 5)` (`:25`). Web usa **30 días** (`dashboard.queries.ts:147-148`). Fix: `getWorkoutDaySummaries(clientId, 30)`.
5. **[Ola0 P2] Tinte icono Dumbbell.** RN `RecentWorkouts.tsx:38` `color={theme.primary}` = sport-500 (`theme.ts:134,164,85`). Web hereda `text-sport-600` (`WorkoutLogItem.tsx:20`). Fix: usar sport-600 del brand ramp (`theme.ts:245,258`), no hardcodear.
6. **[Ola0 P2] strokeWidth Dumbbell.** RN `RecentWorkouts.tsx:38` `strokeWidth={2.25}`; web default lucide = 2 (`WorkoutLogItem.tsx:21`). Fix: quitar `strokeWidth`.
7. **[Ola0 P2] Color link "Historial".** RN `SectionTitle.tsx:40` `color: theme.primary` = sport-500; web `text-sport-600` (`SectionTitle.tsx:26`). (SectionTitle RN es archivo compartido de otra unidad → `cambiosShell`.)

**Paridad ya confirmada (no tocar):** layout fila gap-3/12 px-4/16 py-3/12; icono 36×36 rounded-control bg-surface-sunken; título 14px bold text-strong; subtítulo 12px text-muted mismo texto "N serie(s) registrada(s)"; badge 12px bold tabular-nums text-subtle "serie/series"; divisores border-subtle (hairline RN vs 1px web = adaptación idiomática); cascada fadeUp (RevealStagger web ↔ MotiView opacity/translateY 8→0 delay 60ms `RecentWorkouts.tsx:30-35`, adaptación idiomática — `whileInView` no existe en RN); navegación Historial (`base + '/workout-history'` web ↔ `router.push('/alumno/history')` RN, ruta equivalente); accent bar default sport-500 coincide (`ola0-hallazgos.json:6048`).

---

## PARTE B — §11 HÁBITOS DE HOY (HabitsCard + HabitsTrackerWidget)

### B.1 Arquitectura
- `HabitsTrackerWidget.tsx` es server wrapper (30 líneas): `getTodayHabits(userId, today)` con `today = getTodayInSantiago().iso` (`:18-19`), query `daily_habits` select `water_ml, steps, sleep_hours, fasting_hours, supplements, notes` `.eq(client_id).eq(log_date, today).maybeSingle()` (`:8-13`), y renderiza `<HabitsCard clientId={userId} coachSlug={coachSlug} logDate={today} isToday={true} initialData={data} />` (`:22-28`).
- `HabitsCard.tsx` es `'use client'` (`:1`). Props: `{ clientId, coachSlug, logDate, isToday, initialData }` (`:18-24`).
- **Título de sección "Hábitos de hoy" lo pone el shell padre**, NO el componente: web `page.tsx:146` `<SectionTitle accent="var(--aqua-700, #0A6E8D)">Hábitos de hoy</SectionTitle>` (idéntico en `DashboardDesktop.tsx:88`). Accent = **aqua-700** (dark-aware). Ver `cambiosShell`.

### B.2 Constantes (idénticas web↔RN)
- `WATER_OPTIONS = [250,500,750,1000,1500,2000,2500,3000]` (`HabitsCard.tsx:27`).
- `WATER_TARGET_ML = 3000` (`:28`).
- `SLEEP_OPTIONS = [6,6.5,7,7.5,8,8.5,9]` (`:29`).
- `FASTING_DEFAULT_H = 16` (`:33`).
- `SUPPLEMENTS_GENERIC = 'Suplementos'` (`:34`).

### B.3 Estado local y sincronización
- `useTransition()` → `isPending` (`:37`).
- Estados: `data` (`:39`), `waterMl` (`:40`), `steps` (`:41`), `sleepHours` (`:42`), `fastingHours` (`:43`), `supplements` (`:44`), `stepsInput` (`:45`), todos inicializados desde `initialData?.*`.
- **Refetch al montar** (`:47-57`): `useEffect(() => getDailyHabits(clientId, logDate).then(d => setData/setWaterMl/.../setStepsInput), [clientId, logDate])`. Re-sincroniza TODO el estado desde el servidor al montar y al cambiar clientId/logDate.

### B.4 Persistencia — función `save`
- `save(patch: Partial<HabitsData>)` (`:59-76`): si `!isToday` retorna (`:61`). Construye `next` combinando patch con estado actual para todos los campos (`:62-69`), incluyendo `notes: patch.notes ?? data?.notes ?? null` (`:68`). Ejecuta en `startTransition` (`:70`): `const { success, error } = await upsertDailyHabits({ clientId, logDate, coachSlug, ...next })` (`:71`), y **`if (!success) toast.error(error ?? 'Error al guardar hábitos')`** (`:72`).
- Server action `upsertDailyHabits` (`habits.actions.ts:8-40`): valida `UpsertHabitsSchema.safeParse` → si falla `{ success:false, error: issues[0].message }` (`:11-12`). Autoriza: `user.id !== clientId` → `{ success:false, error:'No autorizado' }` (`:19`). Upsert a `daily_habits` con `onConflict:'client_id,log_date'` (`:21-34`), `updated_at: now` (`:31`). Error DB → `{ success:false, error: error.message }` (`:36`). Éxito → `revalidatePath('/c/${coachSlug}/nutrition')` (`:38`) + `{ success:true }`.
- **RN llama endpoint diferente:** `apps/mobile/lib/habits.queries.ts:22-31` escribe directo a Supabase `upsert onConflict:'client_id,log_date'`. NO usa server action ni `coachSlug`. Es diferencia de data-layer, no visual. NO es endpoint `/api/*` nuevo de la rama → sin fallback especial.

### B.5 Handlers de interacción (toggle-off al repetir valor)
- `handleWater(ml)` (`:78-82`): `next = waterMl === ml ? null : ml` → set + `save({ water_ml: next })`. (Toca chip ya activo = desactiva.)
- `handleSleep(h)` (`:84-88`): `next = sleepHours === h ? null : h` → set + `save({ sleep_hours: next })`.
- `toggleFasting()` (`:90-94`): `next = fastingHours && fastingHours > 0 ? null : FASTING_DEFAULT_H (16)` → set + save.
- `toggleSupps()` (`:96-100`): `next = supplements.length > 0 ? [] : [SUPPLEMENTS_GENERIC]` → set + save.
- `handleStepsBlur()` (`:102-107`): `v = parseInt(stepsInput, 10)`; `next = isNaN(v) || v < 0 ? null : v` → set + save.

### B.6 Derivados
- `waterL = (waterMl ?? 0) / 1000` (`:109`).
- `fastingOn = !!fastingHours && fastingHours > 0` (`:110`).
- `suppsOn = supplements.length > 0` (`:111`).
- `toggles = [{ label: fastingOn ? \`Ayuno ${fastingHours}h\` : 'Ayuno', on: fastingOn, onClick: toggleFasting }, { label: 'Suplementos', on: suppsOn, onClick: toggleSupps }]` (`:113-116`).

### B.7 Layout y tokens (línea por línea)
Contenedor: `<div className="flex flex-col gap-4 rounded-card border border-subtle bg-surface-card p-4 shadow-sm">` (`:119`) — gap-4, `rounded-card`, `border-subtle`, `bg-surface-card`, `p-4`, **`shadow-sm`**.

**Bloque AGUA** (`:120-157`):
- Header (`:122-129`): fila `justify-between`. Izq: `<span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-strong">` (`:123`) con `<Droplets className="h-[15px] w-[15px] text-aqua-700" />` (`:124`) + " Agua". Der: `<span className="text-[12.5px] font-bold tabular-nums text-muted">` (`:126`) con `<span className="text-aqua-700">{waterL.toFixed(waterL % 1 ? 1 : 0)}</span> / 3 L` (`:127`) — valor en `aqua-700`, sufijo "/ 3 L" en `text-muted`, `toFixed(1)` solo si hay decimal.
- Barra progreso (`:130-135`): track `<div className="mb-2.5 h-2 overflow-hidden rounded-pill bg-surface-sunken">` (`:130`); fill `<div className="h-full rounded-pill bg-[var(--aqua-700)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]" style={{ width: Math.min(100, ((waterMl ?? 0)/3000)*100)% }} />` (`:131-134`). Transición ancho **220ms `--dur-base` / `--ease-out` cubic-bezier(0.22,1,0.36,1)**.
- Chips quick-add (`:136-156`): `<div className="hide-scrollbar flex gap-1.5 overflow-x-auto">` (scroll horizontal sin scrollbar). Cada `<button>` (`:140-153`): `on = (waterMl ?? 0) >= v` (**acumulativo**, `:138`), `disabled={!isToday || isPending}` (`:143`), `onClick={() => handleWater(v)}` (`:144`). Clase base `shrink-0 rounded-pill border-[1.5px] px-2.5 py-1.5 text-[12px] font-bold transition-colors` (`:146`); on = `border-aqua-700 bg-aqua-100 text-aqua-700`, off = `border-subtle bg-transparent text-subtle` (`:147-150`). Label: `v < 1000 ? v : \`${v/1000}L\`` (`:152`).

**Bloque PASOS** (`:159-173`):
- Header (`:161`): `text-[13px] font-bold text-strong` con `<Footprints className="h-[15px] w-[15px] text-sport-600" />` (`:162`) + " Pasos".
- Input (`:164-172`): `value={stepsInput}`, `onChange={e => setStepsInput(e.target.value.replace(/\D/g, ''))}` (`:166`, filtro solo dígitos), `onBlur={handleStepsBlur}` (`:167`), `inputMode="numeric"` (`:168`), `disabled={!isToday || isPending}` (`:169`), `placeholder="Ej: 8000"` (`:170`). Clase: `h-[42px] w-full rounded-control border-[1.5px] border-subtle bg-surface-sunken px-3 font-mono text-sm font-bold text-strong outline-none placeholder:text-subtle disabled:opacity-50` (`:171`) — **42px alto, mono bold 14px, `placeholder:text-subtle`, `disabled:opacity-50` (único control con dimming en disabled)**.

**Bloque SUEÑO** (`:175-199`):
- Header (`:177-178`): `text-[13px] font-bold text-strong` con `<Moon className="h-[14px] w-[14px] text-muted" />` (`:178`) + " Sueño " + `<span className="font-semibold text-subtle">· horas</span>`. (Moon icon 14px `text-muted`.)
- Fila (`:180`): `<div className="flex gap-1.5">` con 7 botones flex-1. Cada `<button>` (`:184-195`): `on = sleepHours === v` (`:182`), `disabled={!isToday || isPending}` (`:187`), `onClick={() => handleSleep(v)}` (`:188`). Clase base `flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-control border-[1.5px] text-[12.5px] font-bold transition-colors` (`:190`); on = `border-sport-500 bg-sport-100 text-sport-600`, off = `border-subtle bg-transparent text-subtle` (`:191`). Label `{v}` (`:194`).

**Bloque AYUNO + SUPLEMENTOS** (`:201-225`):
- `<div className="flex gap-2.5">` (`:202`), map `toggles`. Cada `<button>` (`:204-223`): `disabled={!isToday || isPending}` (`:207`), `onClick={t.onClick}` (`:208`). Clase base `flex flex-1 items-center gap-2 rounded-control border-[1.5px] px-3 py-2.5 transition-colors` (`:210`); on = `border-sport-500 bg-sport-100`, off = `border-subtle bg-transparent` (`:211`).
  - Checkbox: `<span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-white">` (`:214-216`) con on = `bg-sport-500`, off = `border-2 border-strong` (`:217`). Si `t.on`: `<Check className="h-[13px] w-[13px]" />` (`:220`).
  - Label: `<span className={cn('text-[12.5px] font-bold', t.on ? 'text-strong' : 'text-muted')}>{t.label}</span>` (`:222`).

**Nota solo-lectura** (`:227`): `!isToday && <p className="text-center text-[10px] text-subtle">Solo se puede editar el día de hoy</p>`.

### B.8 Claro/oscuro (tokens dark-aware, de Ola0)
- `--aqua-700`: `#0A6E8D` light / `#6FD3EA` dark (`globals.css:366,632`). `--aqua-100`: `#E3F5FB` light / `rgba(24,171,212,0.18)` dark (`:371,618`).
- `--sport-600`: `#1462DC` light / `#7FB0FF` dark (`:349,628`). `--sport-100`: `#E8F1FF` light / `rgba(38,128,255,0.20)` dark (`:354,616`).
- `--text-subtle`: `#646F7D` light / `#86919E` dark (`:403,596`). `--text-muted (ink-500)`: `#5A6573` light / `#98A2B0` dark (`:402,595`).
- `--border-strong (ink-300)`: `#A8B1BD` light / `rgba(255,255,255,0.22)` dark (`:415,340,602`).
- `--radius-control`: 14px (`:131`).

### B.9 Estados
- **Vacío (sin hábitos hoy):** todos los controles en off/null; barra 0%; input vacío con placeholder "Ej: 8000". No hay empty-state especial — la card siempre se muestra (para `isToday`).
- **Carga:** server component trae `initialData`; el `useEffect` (`:47-57`) refresca al montar. No hay skeleton.
- **Guardando:** `isPending` deshabilita TODOS los controles (`disabled={!isToday || isPending}` en `:143,169,187,207`).
- **Error al guardar:** `toast.error(error ?? 'Error al guardar hábitos')` (`:72`).
- **Día no editable (`!isToday`):** todos los controles `disabled`; nota "Solo se puede editar el día de hoy" (`:227`). En web los botones deshabilitados NO cambian de apariencia (sin clases `disabled:` en chips/toggles; solo el input tiene `disabled:opacity-50`, `:171`).

### B.10 Validaciones
- Pasos: filtro `replace(/\D/g,'')` en onChange (`:166`); parse en blur, `NaN || <0 → null` (`:104`).
- Agua/sueño: toggle-off al repetir (`:79,85`).
- Server: Zod `UpsertHabitsSchema` (`habits.actions.ts:11`) + auth `user.id === clientId` (`:19`).

### B.11 Accesibilidad
- Iconos decorativos sin aria explícito; controles son `<button type="button">` (`:140,184,204`) e `<input inputMode="numeric">` (`:164,168`).
- `tabular-nums` en el contador de agua (`:126`).

### B.12 Estado RN actual §11 — divergencias (con cita)
1. **[Ola0 P1] Color aqua hardcodeado → dark roto.** RN `HabitsCard.tsx:54,58,62,73,75` usan constante `AQUA_700` (= `#0A6E8D`, `types.ts:104`); fondo chip 'on' = `AQUA_700 + '1F'` (`:73`). En dark el teal oscuro queda ilegible; web muestra `#6FD3EA`. Fix: usar clases NativeWind `text-aqua-700`/`bg-aqua-100`/`border-aqua-700` (tokens dark-aware ya en `global.css:60,177,65,187`) y eliminar la constante.
2. **[Ola0 P1] Error al guardar falla en silencio.** RN `HabitsCard.tsx:29-32` `void upsertDailyHabits(...)` descarta el resultado (que incluye `error` de Supabase, `habits.queries.ts:22-31`). Web muestra `toast.error` (`HabitsCard.tsx:72`). Fix: await + toast estándar + revertir optimista.
3. **[Ola0 P2] Sin refetch al montar / no sincroniza con pull-to-refresh.** RN `HabitsCard.tsx:23-27` inicializa solo desde `initialData` y nunca re-sincroniza; el pull-to-refresh del home recarga `habitsToday` (`home.tsx:178,186,297,394`) pero los `useState` no se reinicializan. Web refetch en mount (`HabitsCard.tsx:47-57`). Fix: useEffect con `getDailyHabits` (existe en `habits.queries.ts:12-20`) o key/efecto de sync.
4. **[Ola0 P2] Token off = text-subtle vs text-muted.** RN `HabitsCard.tsx:75,97,120` usan `theme.mutedForeground` (text-muted); web usa `text-subtle` para chips off/placeholder/chips-sueño-off (`:149,171,191`). Además el `textMutedDark` del shim (`#8A95A3`, `theme.ts:92,98,146,176`) no coincide con el text-muted dark web (`#98A2B0`). Fix: usar token subtle + alinear shim.
5. **[Ola0 P2] On sport plano vs sport-600/sport-100.** RN `HabitsCard.tsx:118,120,135` usan `theme.primary` (sport-500 `#2680FF`) para borde y texto y fondo `theme.primary + '1A'` (10%). Web: texto `text-sport-600`, fondo `bg-sport-100` (dark 20%). Fix: clases `bg-sport-100 border-sport-500 text-sport-600`.
6. **[Ola0 P2] Checkbox off borde.** RN `:137` `borderColor: theme.foreground` (casi negro/blanco); web `border-strong` gris medio (`:217`). Fix: token `border-strong`.
7. **[Ola0 P2] Radio 10px vs rounded-control (14).** RN `:118,135` `borderRadius: 10` hardcodeado; web `rounded-control` = 14px (`:190,210`). Fix: `theme.radius.control` (14) / className.
8. **[Ola0 P2] Sombra card ausente.** RN `:49` sin sombra; web `shadow-sm` (`:119`).
9. **[Ola0 P2] Icono Footprints sport-600 vs primary.** RN `:85` `theme.primary` (sport-500); web `text-sport-600` (`:162`).
10. **[Ola0 P2] Barra de agua sin animación.** RN `:62` width % sin animación (salto instantáneo); web `transition-[width] 220ms ease-out` (`:132`). Fix: Reanimated `withTiming ~220ms`.
11. **[Ola0 P2] Sin estado isPending.** RN `:70,95,115,132` solo `disabled={!isToday}`; web `!isToday || isPending` con useTransition (`:37`) → RN permite upserts concurrentes.
12. **[Ola0 P2] Dimming extra de chips off en días no-hoy (estilo que web NO tiene).** RN `:73,118,135` añaden `opacity: !isToday && !on ? 0.5 : 1`; web solo atenúa el input de pasos (`:171`). Fix: quitar el opacity condicional de chips/toggles.
- **Menor no listado (Ola0 notes):** la nota solo-lectura RN (`:145`) no fija `fontFamily` → cae al system font en vez de la face UI del DS.

**Paridad ya confirmada (no tocar):** constantes WATER/SLEEP/FASTING/SUPPLEMENTS idénticas; layout card p-4 gap-4 rounded-card border-subtle bg-surface-card; headers 13px bold text-strong iconos 15/15/14; contador agua 12.5px bold tabular-nums `toFixed` condicional; barra h-2 rounded-pill bg-surface-sunken; chips agua px-2.5 py-1.5 12px bold, lógica on acumulativa `>= v`, formato `v<1000?v:v/1000+'L'`; scroll horizontal sin scrollbar; input pasos h-42 border-1.5 mono bold 14px placeholder 'Ej: 8000' filtro `\D` parse-en-blur; sueño 7 chips flex-1 h-42; toggles flex-1 px-3 py-2.5 checkbox 22×22 rounded-md check 13 blanco, labels 'Ayuno {h}h'/'Suplementos' 12.5px bold text-strong/text-muted; nota `!isToday` 10px text-subtle centrada; toda la lógica de handlers idéntica. Adaptaciones idiomáticas aceptadas: TouchableOpacity/activeOpacity vs transition-colors+hover, ScrollView vs overflow-x-auto, escritura directa a Supabase vs server action (data-layer), onEndEditing+onBlur duplicado.

---

## HALLAZGOS OLA 0 (docs/rn-port/ola0-hallazgos.json)

Entradas de esta unidad:
- **HabitsTrackerWidget** (`ola0-hallazgos.json:10559-10564`): webPath `habits/HabitsTrackerWidget.tsx`, mobilePath `components/alumno/home/HabitsCard.tsx`. Nota `:5750`: la auditoría línea-a-línea se hizo contra `HabitsCard.tsx` (el widget es solo wrapper de fetch). 12 discrepancias (`:5664-5748`): 2×P1 (aqua hardcodeado dark-roto; error silencioso) + 10×P2 (refetch/sync, token subtle, sport on, checkbox borde, radio 10 vs 14, sombra, Footprints, animación barra, isPending, dimming extra). **Sin P0.**
- **RecentWorkoutsSection** (`:10599-10604`): webPath `history/RecentWorkoutsSection.tsx`, mobilePath `components/alumno/home/RecentWorkouts.tsx`. 6 discrepancias (`:5997-6046`): 3×P1 (card fondo+sombra; dateLabel; título huérfano) + 3×P2 (ventana 30d, tinte Dumbbell, strokeWidth) + link Historial color (P2, en SectionTitle compartido). **Sin P0.** Nota `:6048` lista paridades OK.

**P0 asignado a esta unidad:** ninguno (ambos componentes tienen severidad máxima P1). No hay conducta web que resolver por P0.

---

## CAMBIOS SHELL / ARCHIVOS COMPARTIDOS (cambiosShell — NO tocados aquí)

1. **`home.tsx:382-388` (§10) — título huérfano [Ola0 P1].** El SectionTitle "Actividad reciente" se renderiza en el shell incondicionalmente; en web vive dentro de `RecentWorkoutsSection` y desaparece con 0 logs. Necesita: o mover el SectionTitle dentro de `RecentWorkouts` (aceptando el `onAction` del router como prop) o exponer callback/estado para que `home.tsx` oculte el bloque §10 completo cuando no hay días. **Conservar** el link cuando SÍ hay datos (`testID="home-history-link"`, `home.tsx:385`).
2. **`home.tsx:385` + `components/alumno/home/SectionTitle.tsx:40` — color link "Historial" [Ola0 P2].** Usa `theme.primary` (sport-500); web `text-sport-600` (`SectionTitle.tsx:26`). Fix afecta a todos los SectionTitle del home → cambio en el primitivo compartido, no en mi unidad.
3. **`home.tsx:393` (§11) — accent bar "Hábitos de hoy".** Shell RN pasa `accent={AQUA_700}` (constante `#0A6E8D`); web `page.tsx:146` usa `accent="var(--aqua-700, #0A6E8D)"` (dark-aware → `#6FD3EA` en dark). Divergencia dark en la barra de acento del título. Reportar para que el shell use el token aqua-700 resuelto por scheme, no la constante.
4. **`components/Card.tsx` (§10) — variante sin fondo/sombra.** Para replicar `bg-transparent shadow-none border-subtle` de web (`RecentWorkoutsSection.tsx:20`), el widget necesita una variante que resuelva a fondo transparente + sin sombra conservando `border-subtle`. La `outline` actual (`Card.tsx:53`) usa `border-default`, token equivocado. Decisión de la unidad Card / DS.
5. **`lib/history.queries.ts` — NO cambiar `getWorkoutDaySummaries`.** Es compartida con la pantalla de historial mobile (paridad con `formatRelativeDate`). El fix del dateLabel (§10 P1) y de la ventana 30d (§10 P2) deben hacerse EN el widget `RecentWorkouts.tsx`, no en la query compartida.
6. **`lib/theme.ts` — exponer sport-600 y alinear `textMutedDark`.** Varios fixes de tinte (Dumbbell sport-600, link sport-600, chips sport on) requieren el valor sport-600 del brand ramp (`theme.ts:245,258`) expuesto en el objeto theme; y `textMutedDark` debería alinearse a `#98A2B0` (contrato). Cambio en shim de tokens compartido.
