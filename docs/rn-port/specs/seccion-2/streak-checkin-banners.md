# SPEC · §3 Racha (StreakRibbon) + §4 Check-in banner — key: `streak-checkin-banners`

Unidad de la Sección 2 (dashboard del alumno). Web = fuente de verdad.
Toda afirmación cita `archivo:linea`. Rutas web relativas a `apps/web/src/app/c/[coach_slug]/dashboard/_components/`; RN relativas a `apps/mobile/`.

Archivos web fuente:
- `streak/StreakRibbon.tsx` (client component, protagonista)
- `streak/StreakRibbonSection.tsx` (server wrapper: fetch RPC)
- `streak/StreakWidget.tsx` (chip legacy — ver nota de alcance)
- `checkin/CheckInBanner.tsx` (server component variant-aware)
- `checkin/CheckInBannerFrame.tsx` (client: pulso overdue)

Contraparte RN:
- `components/alumno/home/StreakRibbon.tsx`
- `components/alumno/home/CheckInBanner.tsx`
- Orquestador: `app/alumno/(tabs)/home.tsx` (fetch + derivación)
- Umbrales puros: `lib/checkin-thresholds.ts`

---

## 0. Orden y montaje en el shell

- Web mobile-column (`<div className="flex flex-col gap-3.5 md:hidden">`, `dashboard/page.tsx:80`): tras el header van, en orden:
  1. `<StreakRibbonSection userId={user.id}/>` envuelto en `<Suspense fallback={null}>` (`page.tsx:90-92`).
  2. `<CheckInBanner userId coachSlug/>` envuelto en `<Suspense fallback={<CheckInSkeleton/>}>` (`page.tsx:95-97`).
- El separador vertical entre secciones lo da `gap-3.5` (14px) del contenedor padre (`page.tsx:80`).
- RN: mismo orden en `home.tsx:306-312` — `<StreakRibbon streak={derived.streak}/>` (§3) seguido de `<CheckInBanner .../>` (§4) dentro de `content` con `gap: 14` (`home.tsx:425`). **Paridad de orden y gap OK.** RN además solo monta el CheckInBanner si `derived.ciVariant` es truthy (`home.tsx:310`), replicando el `<3d → null` del web (ver §4.4).

---

## §3 · StreakRibbon

### 3.1 Datos / fuente (NO re-derivar)
- Web: `StreakRibbonSection.tsx:5-7` es async server component; llama `getDashboardStreak(userId)` y pasa `streak` al ribbon.
- `getDashboardStreak` (`dashboard/_data/dashboard.queries.ts:29-37`): `supabase.rpc('get_client_current_streak', { p_client_id: clientId })`; en error retorna `0`; coacciona a número finito o `0` (`queries.ts:34-36`).
- RN: MISMO RPC en el fetch agregado del shell — `supabase.rpc('get_client_current_streak', { p_client_id: client.id })` (`home.tsx:116`), coacción idéntica a finito/0 (`home.tsx:119-120`), guardado en `data.streak` y pasado como `derived.streak` (`home.tsx:253, 267, 307`). **Fuente/regla en paridad — el StreakRibbon RN NO debe re-derivar.**
- Comentario que blinda esto: `home.tsx:112-115` (evita el drift de derivar local que exigía entrenar HOY e ignoraba nutrición).

### 3.2 Hito derivado (sin récord real)
- `MILESTONES = [7, 14, 30, 60, 100, 180, 365]` (web `StreakRibbon.tsx:17`).
- `nextMilestone(n)`: primer milestone `> n`, si no `Math.ceil((n+1)/365)*365` (`StreakRibbon.tsx:19-22`).
- Con racha: `goal = nextMilestone(streak)`, `toGoal = max(0, goal - streak)`, `pct = min(100, round(streak/goal*100))` (`StreakRibbon.tsx:62-64`).
- RN idéntico: `MILESTONES` (`StreakRibbon.tsx:17`), `nextMilestone` (`StreakRibbon.tsx:19-22`), `goal/toGoal/pct` (`StreakRibbon.tsx:51-53`). **Paridad confirmada** (ola0 notes: "MILESTONES y nextMilestone idénticos").

### 3.3 Estado vacío (`streak <= 0`)
Web `StreakRibbon.tsx:47-60`:
- Contenedor: `flex items-center gap-3 rounded-card border border-ember-200 bg-ember-100 px-4 py-3.5`.
- Halo: `span` 44×44 (`h-11 w-11`) con `span absolute inset-0 rounded-full bg-ember-500/15` + `<Flame className="relative h-6 w-6 text-ember-700"/>`.
- Título: `<p className="font-display text-[15px] font-black text-strong">Empieza tu racha hoy</p>`.
- Subtítulo: `<p className="text-xs font-semibold text-ember-700/90">Entrena hoy y enciende la primera llama</p>`.
- Sin animación de contenedor; sin handlers (no navega).

RN `StreakRibbon.tsx:28-49`: halo 44×44 (`width/height 44, borderRadius 22`), Flame `size={24} color={EMBER_700}`, título `FONT.displayBlack fontSize 15` `text-strong`, subtítulo `FONT.uiSemibold fontSize 12 color EMBER_700` `numberOfLines={1}`. Copy verbatim OK.

### 3.4 Estado con racha (`streak > 0`)
Web `StreakRibbon.tsx:66-99`:
- Contenedor: `relative overflow-hidden rounded-card border border-ember-200 bg-[linear-gradient(118deg,var(--ember-100),color-mix(in_srgb,var(--ember-100)_45%,var(--surface-card)))] px-4 py-3.5` (`:67`).
- Fila: `flex items-center gap-3` (`:68`).
- Halo icono: `span` 46×46 (`h-[46px] w-[46px]`); `motion.span absolute inset-0 rounded-full bg-ember-500/[0.18]`, pulso `scale [1,1.12,1]` + `opacity [0.18,0.28,0.18]`, `duration 2.6 repeat Infinity easeInOut` (`:70-75`); Flame `relative h-[26px] w-[26px] text-ember-700` (`:76`).
- Número count-up: `<span className="font-display text-[30px] font-black leading-none tabular-nums text-strong">{shown}</span>` (`:80`).
- Sufijo: `<span className="whitespace-nowrap text-sm font-extrabold text-ember-700">días de racha</span>` (`:81`).
- Copy hito: `<div className="mt-1 truncate text-xs font-semibold text-ember-700/90">` con `toGoal === 0 ? '¡Alcanzaste el hito! Sigue así.' : \`Te ${toGoal === 1 ? 'falta' : 'faltan'} ${toGoal} para los ${goal} días\`` (`:83-87`).
- Barra: track `mt-3 h-1.5 overflow-hidden rounded-pill bg-ember-500/[0.18]` (`:90`); fill `motion.div h-full rounded-pill bg-[linear-gradient(90deg,var(--ember-500),var(--ember-400))]`, `initial width 0 → animate width ${pct}%`, `transition duration 1 ease [0.16,1,0.3,1]` (reduce → duration 0) (`:91-96`).

RN `StreakRibbon.tsx:55-93`: contenedor 46×46 halo con `MotiView` pulso `scale [1,1.12,1]`/`opacity [0.18,0.28,0.18]` `duration 2600 loop` (`:63-68`), Flame `size 26` (`:69`), `AnimatedNumber` para el número (`:73-76`), sufijo `FONT.uiExtra fontSize 14` (`:77`), copy hito (`:79-81`), barra track `height 6, borderRadius 999, bg EMBER_500+'2E'` + fill `MotiView width 0→${pct}%` (`:84-90`). Copy y métricas de layout en paridad (ola0 notes).

### 3.5 Count-up (número)
- Web `StreakRibbon.tsx:24-45`: estado `shown` (inicial `reduce ? streak : 0`); RAF con `dur = 1000`, `ease = 1 - (1-t)^3` (easeOutCubic); si `useReducedMotion()` → set directo a `streak` sin animar (`:29-31`).
- RN: `AnimatedNumber` (`StreakRibbon.tsx:73`); `AnimatedNumber.tsx:16` default `duration = 700`, mismo easeOutCubic, respeta reduce (`AnimatedNumber.tsx:18-22`). **Divergencia: 700ms RN vs 1000ms web** (ola0 P2, ver Estado RN §3.7).

### 3.6 Accesibilidad / motion
- Web: halo pulsante lleva `aria-hidden` (`StreakRibbon.tsx:71`); todo el motion respeta `useReducedMotion()` (`:25,29,73-74,95`). Sin rol interactivo (no es link/button).
- RN: reduce vía `useEvaMotion()` en halo/barra (`StreakRibbon.tsx:65-66,88`). El número reduce lo maneja `AnimatedNumber`.

### 3.7 Nota de alcance — StreakWidget (chip legacy)
- `StreakWidget.tsx:8-9` (confetti `canvas-confetti` lazy), `:15-50`: chip pill (`rounded-pill border border-ember-200 bg-ember-100`), pulso si `streak>=3` (`:36,42-43`), glow si `streak>=7` (`:38,41`), confetti one-shot por sesión si `streak>=30` (`:24-30`), empty `streak===0` → `<p className="text-[10px] text-muted">Empieza tu racha</p>` (`:32-34`).
- Este chip **NO se renderiza en la columna móvil**: el docstring del ribbon dice "Reemplaza el chip pequeño del header por el ribbon prominente" (`StreakRibbon.tsx:8-9`) y `page.tsx` mobile-column solo monta `StreakRibbonSection` (`page.tsx:90-92`). **No portar StreakWidget en esta unidad** (no eliminar el `StreakWidget.tsx` top-level de RN si existe — está fuera de alcance).

---

## §4 · CheckInBanner (variant-aware)

### 4.1 Datos / cómputo de variante
Web `checkin/CheckInBanner.tsx:9-56` (server component):
- `base = getClientBasePath(coachSlug)` (`:10`); `last = getLastCheckIn(userId)` (`:11`); `todayIso = getTodayInSantiago().iso` (`:12`).
- `getLastCheckIn` (`dashboard.queries.ts:39-51`): `check_ins` `.eq('client_id')` `.order('date', desc)` `.order('created_at', desc)` `.limit(1).maybeSingle()`, select `id, weight, energy_level, date, created_at`.
- Sin check-in (`!last?.date`) → variante `first` (`:14-30`).
- **Mapeo timezone-safe (P1 de esta unidad):** `lastDay = getSantiagoIsoYmdForUtcInstant(last.date)` (`:35`) y `daysSince = daysSinceSantiagoInstant(last.date, todayIso)` (`:36`). El comentario `:32-34` es explícito: mapear el instante UTC al día calendario de Santiago ANTES de contar evita el off-by-one del prefijo UTC cerca de la medianoche chilena.
  - `getSantiagoIsoYmdForUtcInstant` (`apps/web/src/lib/date-utils.ts:99-104`).
  - `daysSinceSantiagoInstant` (`apps/web/src/lib/date-utils.ts:114-118`) = `differenceInCalendarDays` a mediodía.
- `daysSince < 3` → `return null` (banner oculto) (`:38-40`).
- `variant = daysSince > 7 ? 'overdue' : 'warning'` (`:42`).

RN: la lógica vive en `lib/checkin-thresholds.ts` (`computeCheckInReminder`, `:43-51`), llamada en `home.tsx:255` con `checkIns[checkIns.length-1].date` y `todayIso`. Umbrales: `>7 overdue`, `>=3 warning`, `<3 null` (`checkin-thresholds.ts:49`) + `!lastCheckInDate → 'first'` (`:44-45`). `home.tsx:310` solo renderiza si `ciVariant` truthy → replica `first/warning/overdue` visibles y oculta `<3d`. **Umbrales en paridad** (ola0 notes b).
- Datos RN: `check_ins` `.select('date, weight')` ventana 30d `.order('date', asc)` (`home.tsx:96-102`); se toma el ÚLTIMO del array asc (`home.tsx:255`).

### 4.2 Mensaje y subtítulo (copy verbatim)
Web `CheckInBanner.tsx:43-49`:
- `message = variant === 'overdue' ? '¡Check-in pendiente!' : daysSince === 3 ? 'Check-in próximo' : \`Check-in próximo — hace ${daysSince} días\`` (`:43-48`).
- `dateText = \`Último: ${formatRelativeDate(lastDay, todayIso)}\`` (`:49`).
- Estado `first` — título `Registra tu primer check-in`, subtítulo `Peso y energía en segundos` (`:24-26`).

RN `CheckInBanner.tsx:56-58`: `title` idéntico (`:56-57`); `sub = lastRelative ? \`Último: ${lastRelative}\` : 'Peso y energía en segundos'` (`:58`); `first` título/subtítulo verbatim (`:44-45`). `lastRelative = formatRelativeDate(ci.lastDay, todayIso)` (`home.tsx:258`). **Copy verbatim OK** (ola0 notes c).
- `formatRelativeDate` (`apps/mobile/lib/date-utils.ts:97-109`): Hoy/Ayer/`Hace N días`/`Hace 1 semana`/`Hace N semanas`/`Hace 1 mes`/fecha larga es-CL.

### 4.3 Estilo por variante
Web `CheckInBanner.tsx:51-71`:
- `overdue = variant === 'overdue'` (`:51`).
- `box = overdue ? 'border-[var(--danger-200,var(--danger-100))] bg-[var(--danger-100)]' : 'border-ember-200 bg-ember-100'` (`:52-54`).
- `accentText = overdue ? 'text-[var(--danger-700,var(--danger-600))]' : 'text-ember-700'` (`:55`).
- `iconChip = overdue ? 'bg-[var(--danger-500)]' : 'bg-ember-500'` (`:56`).
- Layout: `<Link href={\`${base}/check-in\`} className="flex items-center gap-3 p-3">` (`:62`); chip `flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-white ${iconChip}` con `ClipboardCheck h-[18px] w-[18px]` (`:63-65`); título `text-sm font-bold ${accentText}` (`:67`); subtítulo `text-xs ${accentText} opacity-90` (`:68`); `ChevronRight h-[18px] w-[18px] shrink-0 ${accentText}` (`:70`).
- Estado `first` (`:16-28`): `flex items-center gap-3 rounded-card border border-subtle bg-surface-sunken p-3`; chip `h-9 w-9 rounded-control bg-surface-card text-muted`; `ChevronRight ... text-muted`.

RN `CheckInBanner.tsx:53-83`: `overdue` (`:53`); `accent = overdue ? DANGER_500 : EMBER_500` (`:54`); `fg = overdue ? DANGER_600 : EMBER_700` (`:55`); contenedor `borderRadius 20, borderWidth 1, borderColor accent+'38', backgroundColor accent+'1A'` (`:66`); chip 34×34 `borderRadius 10 backgroundColor accent`, ClipboardCheck 18 `#fff` (`:74-75`); título `FONT.uiBold fontSize 13.5 color fg` (`:78`); subtítulo `FONT.ui fontSize 12 color fg` (`:79`); ChevronRight 18 `fg` (`:81`). Estado `first` (`:30-49`): `rounded-card bg-surface-sunken border border-subtle`, chip 36×36 `rounded-control bg-surface-card`, ClipboardCheck 18 `theme.mutedForeground`, chevron `theme.mutedForeground`.

### 4.4 Interacción / navegación
- Web: TODO el banner (las 3 variantes) es un `<Link href={\`${base}/check-in\`}>` (`:16-17` first; `:62` warning/overdue). Sin toast; navegación directa a la página de check-in. `base` = `getClientBasePath(coachSlug)` (`:7,10`).
- RN: `onPress` prop → el shell pasa `() => router.push('/alumno/check-in')` (`home.tsx:311`); `TouchableOpacity testID="home-checkin-banner" activeOpacity={0.82}` en ambas ramas (`CheckInBanner.tsx:33-35, 68-70`). **Navegación en paridad** (ola0 notes d). Adaptación idiomática válida: `Link`→`router.push` + `TouchableOpacity` (documentada).

### 4.5 Animación de pulso (overdue)
- Web `CheckInBannerFrame.tsx:7-20` (client): si `!overdue || reduce` → `<div>` plano (`:9-11`); si overdue+motion → `motion.div` que anima `boxShadow ['0 0 0 0 rgba(239,68,68,0.35)','0 0 0 6px rgba(239,68,68,0)','0 0 0 0 rgba(239,68,68,0.35)']`, `duration 2.2 repeat Infinity easeInOut` (`:12-19`). Es un **anillo exterior** que se expande; el contenido nunca pierde opacidad.
- El Frame envuelve el banner warning/overdue (`CheckInBanner.tsx:59`), y dentro va `<AppBadgeSync count={1}/>` (`:61`) + el Link (`:62`).
- RN `CheckInBanner.tsx:61-67`: `MotiView` que anima `opacity [1,0.72,1]` `duration 2200 loop` si overdue+`!motion.reduced`. **Divergencia de efecto** (fade del banner completo vs glow exterior) — ola0 P2, ver §4.7. Reduce-motion respetado en ambos (Frame `:9-10` / RN `:64-65`).

### 4.6 App badge (PWA / notif) — P1
- Web `CheckInBanner.tsx:60-61`: `<AppBadgeSync count={1}/>` dentro del banner warning/overdue → `AppBadgeSync.tsx:15-18` hace `setAppBadge(count)` al montar (badge en el ícono; se limpia al entrar a `/check-in`).
- RN: **AUSENTE el SET.** Mobile solo LIMPIA el badge al abrir check-in (`app/alumno/(tabs)/check-in.tsx:23` importa `clearAppBadge`); existe helper `setAppBadge` en `lib/badge.ts:18-24` pero ni `CheckInBanner.tsx` ni `home.tsx:310-312` lo llaman cuando `ciVariant` es warning/overdue (ola0 P1). Fix esperado: efecto en `home.tsx` — `ciVariant ∈ {warning, overdue} → setAppBadge(1)`; `null → clearAppBadge()`.

### 4.7 Accesibilidad
- Web: banner es `<Link>` (rol link nativo, navegable por teclado); textos no truncan (contenedor `min-w-0 flex-1` sin `truncate`, `:66`), envuelven a 2ª línea.
- RN: `TouchableOpacity` con `testID` pero **sin `accessibilityLabel`/`accessibilityRole="button"`**; títulos con `numberOfLines={1}` (`:78-79`) → elipsan en pantallas angostas (ola0 P2 — quitar/subir a 2 para igualar wrapping).

---

## Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Inventario: `StreakRibbon` (name, `:10567-10572`, priority media) y `CheckInBanner` (name, `:10623-10628`, priority media). `AdherenceStrip` aparece en el grep pero es de nutrición (`:4621-4633`) — NO es de esta unidad.

### StreakRibbon (bloque `:5820-5865`)
- **P0 — Colores dark bypaseados por constantes** (`:5822-5827`): web usa tokens que FLIPEAN en dark (`border-ember-200 bg-ember-100 text-ember-700/90`, `StreakRibbon.tsx:49,52,56,76,81,83`; dark `--ember-100 rgba(255,106,61,0.20)`, `--ember-700 #FFB79E` globals.css:617,631). RN usa `EMBER_500/600/700` FIJOS de `types.ts:101-103`, iguales en light/dark → texto naranja oscuro ilegible en dark y fondo alpha ~0.10 vs 0.20. Tokens themed SÍ existen en `apps/mobile/global.css:51-57` (light) y `:175-186` (dark). **Conducta web que lo resuelve (§Fix P0 abajo).**
- **P1 — Gradiente 118° ausente** (`:5830-5834`): web `StreakRibbon.tsx:67` distingue el estado con racha (gradiente ember-100→mezcla con surface-card) del empty (plano); RN `:59` usa fondo plano idéntico al empty. Fix: `expo-linear-gradient` ~118°.
- **P2 — Fill de barra gradiente 90° ausente** (`:5837-5841`): web `:92` `ember-500→ember-400 (#FF8C66)`; RN `:89` plano `EMBER_500`.
- **P2 — Copy motivacional ember-600 vs ember-700/90** (`:5844-5848`): web `:83` `text-ember-700/90`; RN `:79` `EMBER_600`.
- **P2 — Timings count-up/barra** (`:5851-5855`): count-up web 1000ms (`:35`) vs RN 700ms (`AnimatedNumber.tsx:16`); barra web `duration 1 ease [0.16,1,0.3,1]` (`:93-95`) vs RN `900` sin ease-out expo (`:88`).
- **P2 — Animación de entrada añadida** (`:5858-5862`): web sin mount-anim (server + `<Suspense fallback={null}>` `page.tsx:90-92`); RN envuelve ambos estados en `MotiView from opacity0/translateY10` (`:30,56`) y NO respeta `motion.reduced`. Fix: condicionar a reduce o quitar.
- Notes (`:5865`): paridad correcta en MILESTONES, copy, métricas de layout, reduced-motion; sin handlers interactivos en ninguna plataforma.

### CheckInBanner (bloque `:6158-6238`)
- **P1 — Texto overdue** (`:6161-6165`): web `:55` `text-[var(--danger-700,var(--danger-600))]` (light #A8163A / dark #FF9CB0); RN `:55` `DANGER_600 '#BE183C'` fijo, sin flip dark.
- **P1 — Texto warning** (`:6168-6172`): web `:55` `text-ember-700` (light #C23E14 / dark #FFB79E); RN `EMBER_700 '#C2410C'` fijo (ni siquiera coincide con token light #C23E14).
- **P1 — Fondo/borde warning/overdue** (`:6175-6179`): web `:52-54` pasteles sólidos por token (`ember-100 #FFEDE6` / `danger-100 #FCDDE4`, dark 0.18-0.20 alpha); RN `:66` `accent+'38'`/`accent+'1A'` alpha ~0.10 derivado del acento.
- **P1 — App badge ausente** (`:6182-6186`): ver §4.6.
- **P1 — Off-by-one día del check-in** (`:6189-6193`): web mapea a Santiago ANTES de contar (`:32-36`); RN `checkin-thresholds.ts:47` toma prefijo UTC `String(...).slice(0,10)` — el patrón que el web documenta como bug. Afecta cuándo aparece/oculta el banner, la variante y `Último: …`. `home.tsx` YA importa `getSantiagoIsoYmdForUtcInstant` (`:11`) → disponible para el fix.
- **P2**: chip 34×34 r10 vs web 36×36 rounded-control (`:6196-6200`); título fontSize 13.5 vs 14 (`:6203-6207`); gap 11 vs 12 (`:6210-6214`); subtítulo sin opacity 0.9 (`:6217-6221`); pulso `opacity fade` vs glow anillo (`:6224-6228`); `numberOfLines={1}` vs wrap (`:6231-6235`).
- Notes (`:6238`): variante `first`, umbrales, mensajes, navegación y radio 20px en paridad. Constantes `DANGER_600/EMBER_700` de `types.ts:101-108` son raíz de varios hallazgos; `EMBER_700='#C2410C'` no coincide con el contrato (#C23E14) → auditar impacto en otros consumidores por separado.

---

## Fix del P0 asignado (StreakRibbon · colores dark) — conducta web exacta

El P0 de esta unidad es `StreakRibbon` dark-mode (ola0 `:5822-5827`). La conducta web a replicar:

1. **Fondo/borde deben flipear por scheme.** Web usa clases token: empty `border-ember-200 bg-ember-100` (`StreakRibbon.tsx:49`); con racha `border-ember-200` + gradiente sobre `--ember-100` (`:67`). En dark, `--ember-100` pasa a `rgba(255,106,61,0.20)` (globals.css:617). RN debe usar los tokens `border-ember-200`/`bg-ember-100` (clases NativeWind, con overrides dark de `apps/mobile/global.css:175-186`) en vez de `EMBER_500+'38'`/`EMBER_500+'1A'` fijos (`StreakRibbon.tsx:33,59`).
2. **Textos ember deben aclararse en dark.** Web: sufijo/copia `text-ember-700` y `text-ember-700/90` (`:76,81,83`) → dark `--ember-700 #FFB79E` (globals.css:631). RN debe usar `text-ember-700` (token, no `EMBER_700 '#C2410C'` de `types.ts:103`).
3. **El número usa `text-strong` / `theme.foreground`** — ya en paridad (RN `StreakRibbon.tsx:75` `theme.foreground` ≡ `text-strong`, ola0 notes `:5865`); no cambiar.
4. Corregir de paso `EMBER_700` a `#C23E14` si se conserva la constante para otros usos (ola0 fixHint `:5827`).

> Restricción del proyecto: NO tocar `apps/mobile/global.css` ni `tailwind.config.js` (los overrides dark ember `:175-186` YA existen). El fix es cambiar el componente para consumir clases/tokens themed, no re-derivar la rampa.

Nota: el CheckInBanner NO tiene P0 (su tope es P1: dark tokens danger/ember, app-badge, off-by-one). Se documentan arriba para el porteo pero no son el P0 obligatorio de esta unidad.

---

## Estado RN actual — divergencias más obvias (con citas)

1. **[P0] StreakRibbon dark:** `StreakRibbon.tsx:33,59,69,77,79` usa `EMBER_*` fijos de `types.ts:101-103` → sin flip dark, texto ilegible y fondo sub-tinte. (§Fix P0.)
2. **[P1] StreakRibbon gradiente 118° ausente:** `StreakRibbon.tsx:59` fondo plano = estado vacío; web `:67` gradiente.
3. **[P1] CheckInBanner off-by-one:** `checkin-thresholds.ts:47` prefijo UTC vs web Santiago-first (`CheckInBanner.tsx:35`). RN ya tiene el helper importado (`home.tsx:11`).
4. **[P1] CheckInBanner dark tokens:** `CheckInBanner.tsx:54-55,66` `DANGER_*/EMBER_*` fijos + alpha del acento vs pasteles-token del web (`:52-55`).
5. **[P1] App badge ausente:** ni `CheckInBanner.tsx` ni `home.tsx:310-312` llaman `setAppBadge(1)` en warning/overdue (helper existe `lib/badge.ts:18-24`); web `CheckInBanner.tsx:60-61`.
6. **[P2] StreakRibbon mount-anim no respeta reduce:** `MotiView` en `:30,56` sin condicionar a `motion.reduced` (web no tiene mount-anim).
7. **[P2] CheckInBanner pulso:** fade de opacidad del banner (`:63-65`) vs glow exterior del web (`CheckInBannerFrame.tsx:15`).
8. **[P2] CheckInBanner metrics/a11y:** chip 34×34 r10 (`:74`), título 13.5 (`:78`), gap 11 (`:72`), subtítulo sin opacity 0.9 (`:79`), `numberOfLines={1}` (`:78-79`), sin `accessibilityLabel/Role`.

### Paridad ya correcta (no romper)
- Fuente de racha = RPC `get_client_current_streak` (`home.tsx:116`), NO re-derivar (§3.1).
- MILESTONES / nextMilestone / goal-toGoal-pct (§3.2), copy verbatim ambos componentes.
- Umbrales check-in `<3 null / 3-7 warning / >7 overdue` + variante `first` (`checkin-thresholds.ts:49,44`), navegación a check-in (`home.tsx:311`), radio 20px, padding p-3.

### Adaptaciones idiomáticas RN válidas (documentadas)
- `Link`→`router.push('/alumno/check-in')` + `TouchableOpacity` (§4.4).
- `framer-motion`→`moti/useEvaMotion`; `useReducedMotion`→`useEvaMotion().reduced`.
- Count-up React state → `AnimatedNumber` (corregir duration a 1000ms para paridad exacta).
- Mount-anim del home mobile (`MotiView` fade/translateY) es patrón de entrada del shell; si se conserva, condicionar a `motion.reduced` (ola0 P2 `:5862`).
