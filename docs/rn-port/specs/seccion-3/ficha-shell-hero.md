# SPEC — Unidad `ficha-shell-hero` (Seccion 3, COACH)

> ARMAZON de la ficha del cliente: ruta `[clientId]`, fetch/estados, Hero, TabBar sticky, acciones flotantes (WhatsApp), export dossier PDF, helpers compartidos (`shared.tsx`).
> **Web = fuente de verdad.** Cada afirmacion cita `archivo:linea`. El CONTENIDO de los 5 tabs vive en unidades hermanas (`ficha-overview-progreso`, `ficha-analisis-plan`, `ficha-nutricion-facturacion`); aca SOLO el cableado por props.

## Archivos verdad (web) — leidos linea por linea
- `apps/web/src/app/coach/clients/[clientId]/page.tsx` (230 L) — RSC + fetch + montaje Hero/Dashboard.
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileHero.tsx` (442 L) — Hero (TopBar acciones + Card inversa + 4 chips).
- `apps/web/src/app/coach/clients/[clientId]/ProfileTabNav.tsx` (171 L) — TabBar sticky glass.
- `apps/web/src/app/coach/clients/[clientId]/ProfileFloatingActions.tsx` (171 L) — FAB WhatsApp.
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` (532 L) — orquesta TabNav + tabs + FAB (state activeTab).
- Soportes: `clientStatusUtils.ts` (re-export `deriveClientStatus`), `getProfileTopAlert.ts`, `ProfileTopAlertBanner.tsx`, `profileOverviewUtils.ts`, `_components/SectionTitle.tsx`.
- Puros compartidos: `packages/profile-analytics/client-status.ts`, `.../top-alert.ts`.

## Archivos RN propios (esta unidad)
- `apps/mobile/app/coach/cliente/[clientId].tsx` (381 L).
- `apps/mobile/components/coach/clientDetail/ClientHero.tsx` (249 L).
- `apps/mobile/components/coach/clientDetail/ClientTabBar.tsx` (115 L).
- `apps/mobile/components/coach/clientDetail/ProfileFloatingActions.tsx` (91 L).
- `apps/mobile/components/coach/clientDetail/shared.tsx` (105 L).

## Datos de referencia (data layer, NO propio — `apps/mobile/lib/coach-client-detail.ts`)
La ficha se alimenta de `getCoachClientDetail(clientId)` (L573-927) y `getCoachClientDayDetail(clientId, date)` (L931-993). No es archivo de esta unidad (se coordina por consumo).

---

## 1. LAYOUT / JERARQUIA

### 1.1 Contenedor de pantalla (web `page.tsx` + `ClientProfileDashboard`)
Web arma la pagina en RSC:
- `page.tsx:22` raiz `div.relative mx-auto max-w-[1600px] w-full min-w-0 space-y-8 animate-fade-in`.
- `page.tsx:23-31` fila back: `<Link href="/coach/clients">` con control `rounded-control bg-surface-sunken p-1.5` + `ArrowLeft h-3 w-3` + texto "Alumnos" (`text-[10px] font-black uppercase tracking-widest text-muted`, hover `text-sport-600`). `print:hidden`.
- `page.tsx:33-35` `<Suspense fallback={<ProfileSkeleton/>}>` → `ProfileContent`.
- `page.tsx:145-190` `div#coach-client-profile-print.space-y-8` monta `<ClientProfileHero/>` + `<ClientProfileDashboard/>`.
- `ClientProfileDashboard.tsx:243` raiz `@container/ficha min-w-0 max-w-full space-y-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0` → dentro: `<ProfileTabNav/>` (L244), skeleton `isPending` (L246-260), `<AnimatePresence mode="wait">` con las 5 motion.div de tabs (L262-523), y `<ProfileFloatingActions/>` al final (L525-529).

Jerarquia vertical web: **[back] → [Hero] → [TabNav sticky] → [tab activo] → [FAB WhatsApp]**.

### 1.2 RN actual (`[clientId].tsx`)
`[clientId].tsx:254-323`: `SafeAreaView edges=['top']` → `<AppBackground/>` (L256) → `<TopBar back title={client.full_name}/>` (L257) → `<ScrollView stickyHeaderIndices={[1]}>` (L259) con hijos:
- indice 0 = `<ClientHero/>` (L261-276)
- indice 1 = `<ClientTabBar/>` (L279) ← **sticky** (stickyHeaderIndices=[1])
- indice 2 = `<View styles.tabContent>` con el tab activo (L282-295)
→ fuera del ScrollView: `<ProfileFloatingActions/>` (L299), `<ActionSheet/>` menu (L302-316), `<NativeDialog>` editar (L318-320), `<PhotoLightbox/>` (L322).

Jerarquia RN: **[TopBar back+nombre] → [Hero] → [TabBar sticky] → [tab] → [FAB] + overlays**.

**DIVERGENCIA layout (idiomatica, documentada):** web usa back-link etiquetado "Alumnos" (destino) arriba del hero, y el nombre del alumno vive SOLO en el H1 del hero. RN usa `TopBar` nativo con flecha back + `title={client.full_name}` → el nombre aparece DUPLICADO (TopBar + hero H1). Preserva la accion (volver) pero cambia la etiqueta (destino → pagina actual) y agrega duplicacion. Aceptable como patron nativo; anotado.

---

## 2. HERO — `ClientProfileHero.tsx` (web) vs `ClientHero.tsx` (RN)

### 2.1 TopBar del hero (eyebrow + nombre + acciones)
Web `ClientProfileHero.tsx:196-237`:
- Contenedor raiz hero `div.relative flex min-w-0 max-w-full flex-col gap-3` (L195).
- Fila `div.flex items-start justify-between gap-3` (L197).
- Eyebrow `div.truncate text-[10px] font-bold tracking-widest text-muted uppercase` (L199) con `{eyebrow}`.
- Nombre `h1.font-display max-w-full text-2xl font-black tracking-tighter text-strong break-words md:text-3xl` (L202) con `{client.full_name}`.
- Acciones `div.flex shrink-0 items-center gap-1.5 print:hidden` (L206):
  - Boton export (L207-221): `h-10 w-10 rounded-control border border-default bg-surface-card text-strong shadow-[var(--shadow-sm)] hover:bg-surface-sunken disabled:opacity-70`; icono `Download h-[18px] w-[18px]` o `Loader2 animate-spin` cuando `exporting`; `aria-busy`, `aria-label`/`title` = "Generando PDF…"/"Exportar PDF".
  - Boton mas (L222-230): mismo shell; icono `MoreVertical h-[18px]`; `aria-label`/`title`="Más opciones".
  - `exportError` (L231-235): `<p role="alert" class="basis-full text-[11px] font-semibold text-[var(--danger-500)]">`.

RN `ClientHero.tsx:102-132`:
- `styles.topbar` (L227) = `flexDirection row, alignItems flex-start, justifyContent space-between, gap 12`.
- Eyebrow (L105): `<Text numberOfLines={1} className="text-muted" style={styles.eyebrow}>` con `eyebrow`. `styles.eyebrow` (L228) = `fontSize 10, textTransform uppercase, letterSpacing 1.4, FONT.uiBold`.
- Nombre (L106): `<Text numberOfLines={2} className="text-strong" style={styles.name}>`. `styles.name` (L229) = `fontSize 24, letterSpacing -1.2, marginTop 2, FONT.displayBlack`.
- Acciones `styles.topActions` (L230, gap 6): export `HapticPressable` (L110-127) `rounded-control border border-default bg-surface-card`, `styles.iconBtn`= 40x40 (L231); `Download size 18 color={iconStrong}` o `ActivityIndicator color={theme.primary}` si `exportingPdf`; `accessibilityLabel="Exportar dossier PDF"`, `accessibilityState busy`. Mas (L128-130) `MoreVertical size 18 color={iconStrong}`, `accessibilityLabel="Más opciones"`.

**Estado RN vs web:** nombre 24/ls-1.2 = MATCH web `text-2xl(24) tracking-tighter(-0.05em≈-1.2)` (R5 §3.1 flag de 25/-0.6 YA RESUELTO). Eyebrow 10px uppercase ls1.4 ≈ web `text-[10px] uppercase tracking-widest(0.1em·10=1.0)` — RN ls 1.4 vs web ~1.0 (PX menor). Botones 40x40 = web `h-10 w-10`, icono 18 = web `h-[18px]`. `iconStrong = STRONG_ICON[resolvedScheme]` (ClientHero.tsx:21,98) = light `#101828` / dark `#F4F6F8` = text-strong por esquema (lucide toma color prop). MATCH.
**DIVERGENCIA (error export):** web muestra `exportError` inline (role=alert, danger-500) bajo los botones; RN muestra el fallo via `Alert.alert('No se pudo exportar', …)` desde `[clientId].tsx:247` (idiomatica — preserva "el usuario ve el error"; cambia inline→dialog nativo). Anotada.

### 2.2 Eyebrow "{PROGRAMA} · Semana {N}" (derivacion)
Web `ClientProfileHero.tsx:130-135`: `programName = activeProgramName?.trim() || null`; `eyebrow = programName ? \`${programName}${planCur!=null?\` · Semana ${planCur}\`:''}\` : planCur!=null ? \`Semana ${planCur}\` : 'Sin programa activo'`. `planCur = compliance.planCurrentWeek ?? null` (L127).
RN `[clientId].tsx:192-198`: identico string, pero `planCur = derived.planCurrentWeek` que se **computa client-side** (L156-162: `ceil((diasDesdeStart+1)/7)` acotado a `weeks_to_repeat`), no `compliance.planCurrentWeek`.
**DIVERGENCIA (logica, output identico):** web recibe `planCurrentWeek` del servidor (compliance); RN lo deriva de `activeProgram.start_date`+`weeks_to_repeat`. Mismo formato "Semana N"; riesgo de N distinto si el motor server difiere del ceil client. Anotar.

### 2.3 Card inversa: identidad (avatar + badge + email + meta)
Web `ClientProfileHero.tsx:245-298`:
- `<GlowBorderCard>` envuelve `<Card variant="inverse" padding="lg" className="gap-0 !border-transparent dark:!bg-[color-mix(in_srgb,var(--surface-card)_55%,var(--surface-app))]">` (L246).
- Avatar (L248-262): `span.relative flex h-16 w-16 rounded-full md:h-20 md:w-20`, `padding:2`, `background: var(--${TONE}-500)` (anillo por nivel de estado); inner `flex h-full w-full items-center justify-center rounded-full font-display text-xl font-extrabold tracking-[-0.02em] md:text-2xl`, `background var(--surface-inverse)`, `color var(--sport-400)`, `border 2px solid var(--surface-card)`; texto `initialsOf(full_name)` (L387-397: 2 primeras iniciales, uppercase, fallback '?').
- Cuerpo (L263-297): `div.min-w-0 flex-1 space-y-1.5`:
  - Fila badge (L264-277): `<Badge tone={STATUS_TONE[level]} size="sm" title={\`Score de atención: ${score}\`}>{status.label}</Badge>` + si `reasons.length>0` `<span class="min-w-0 text-[11.5px] text-on-dark-muted">{reasons.join(' · ')}</span>`.
  - Email (L278): `<p class="truncate text-[12.5px] text-on-dark-muted">{email}</p>`.
  - Meta (L279-296): `<p class="flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-on-dark-muted">` con 4 items inline (icono `h-3.5 w-3.5`=14):
    1. `Flame text-[var(--ember-400)]` + `{streakDays} d de racha de actividad`
    2. `Activity text-[var(--sport-400)]` + `formatRelativeLastActivity(profileLastActivityAt)`
    3. `Calendar` + `Desde {clientSinceLabel}` (L117-119: `toLocaleDateString('es-ES',{month:'short',year:'numeric'})`)
    4. `Target` + `~{trainingAge}` (`formatTrainingAgeLabel`, profileOverviewUtils L37-55)

RN `ClientHero.tsx:135-158`:
- `<GlowBorderCard>` → `<Card variant="inverse" padding={20} radius="card" style={{borderColor:'transparent', gap:0}}>` (L136).
- Avatar (L137-142): `View className={RING_CLASS[level]} styles.ring`(64x64 pad2 radius32) → inner `View className="bg-surface-inverse" style={ringInner border theme.card}` (L234: radius30 border2) → `Text className="font-display-bold text-sport-400" styles.initials`(L235: fs20 ls-0.4) = `initialsOf(name)` (L69-79, mismo algoritmo/fallback '?').
- Cuerpo (L143-157): badge `<Badge tone={STATUS_TONE[level]} size="sm">{statusLabel}</Badge>` (L145) + reasons `<Text numberOfLines={2} color ON_DARK_MUTED>` (L147); email `<Text numberOfLines={1} color ON_DARK_MUTED styles.email>`(L150, fs12.5); metaRow (L151-156) 4x `MetaItem` icono 14:
  1. `Flame color EMBER(#FF8A5B)` + `${streak} d de racha de actividad`
  2. `Activity color #5C9DFF` + `lastActivityLabel`
  3. `Calendar color ON_DARK_MUTED` + `Desde ${sinceLabel}`
  4. `Target color ON_DARK_MUTED` + `~${trainingAge}`

**Estado RN vs web (R5 §3.1 — TODOS RESUELTOS):** iniciales 20 (web `text-xl(20)`) ✓; copy "d de racha de actividad" ✓; iconos meta 14 ✓; `Activity color #5C9DFF` = sport-400 (token `--color-sport-400: 92 157 255`) ✓; ring por nivel via `RING_CLASS` (bg-success/warning/danger/ink-500) ✓.
**DIVERGENCIA NUEVA (fondo hero dark):** web fuerza en dark `dark:!bg-[color-mix(in_srgb,surface-card_55%,surface-app)]` ≈ `#11151B` (near-black; comentario CEO L239-244: `#2A323D leia "plomo" y lavaba el texto`). RN `Card variant="inverse"` → `bg-surface-inverse` (`Card.tsx:51`) = dark `#2A323D` (global.css:196) = EXACTAMENTE el plomo que el CEO rechazo. En light ambos = ink-950 (`#0B0E13`) → MATCH; el gap es SOLO dark. **Recomendacion:** override del bg del hero Card en dark a near-black (mezcla card→app) para paridad. (PX/EST medio.)
**DIVERGENCIA (badge title/score):** web pone `title="Score de atención: N"` en el Badge (tooltip); RN Badge sin equivalente (sin score expuesto). Menor; RN no muestra el score.
**Tokens on-dark:** RN fija `ON_DARK=#F4F6F8` (ink-50), `ON_DARK_MUTED=#939DAB` (L16-17) porque la Card del hero es superficie ink en light+dark (mirror token-contract). Web usa clases `text-on-dark`/`text-on-dark-muted`. Valores equivalentes.

### 2.4 Grid 4 chips 2×2
Web `ClientProfileHero.tsx:301-340`: `div.mt-3.5 grid grid-cols-2 gap-2`, 4x `HeroStatChip`:
1. **Peso** (L302-320): value `${currentWeightKg} kg` si `>0` else `—`; sub por signo de `weightDeltaKg` — `0`: `Minus + "sin cambio"` (text-on-dark-muted); `>0`: `TrendingUp + "+"+abs.toFixed(1)+" kg"` (text-ember-400); `<0`: `TrendingDown + toFixed(1)+" kg"` (text-success-500).
2. **Adherencia** (L321-325): value `${adherencePct}%`; sub `<HeroChipBar value={adherencePct}/>`.
3. **Workouts** (L326-330): value `${workoutsThisWeek}/${workoutsTarget}`; sub "esta semana" (text-on-dark-muted).
4. **Comidas hoy** (L331-339): value `${mealsDone}/${mealsTotal}`; sub `${nutritionPct}% plan` con color `nutritionPct>=80 ? success-500 : warning-500`.
`HeroStatChip` (L410-442): contenedor `rounded-control border border-[var(--border-inverse)] bg-white/[0.07] p-2.5`; label `text-[10px] tracking-[0.03em] text-on-dark-muted`; value `font-display text-base font-black tabular-nums text-on-dark`; sub `text-[10.5px] font-bold`.
`HeroChipBar` (L399-408): `mt-1.5 h-1 rounded-pill bg-[var(--border-inverse)]` con fill `h-full rounded-pill bg-sport-500` width=`clamp(value,0,100)%`.

RN `ClientHero.tsx:160-170` (`styles.chipGrid` L242: `row wrap gap8 marginTop14`), 4x `HeroChip` (L215-223):
1. **Peso** (L162): value `chips.weightValue>0 ? \`${v} kg\` : '—'`; sub `<WeightDeltaSub delta={weightDelta}/>` (L186-204): null/0 → `Minus + "sin cambio"` (ON_DARK_MUTED); up → `TrendingUp + "+"+abs.toFixed(1)+" kg"` color EMBER; down → `TrendingDown + toFixed(1)+" kg"` color theme.success.
2. **Adherencia** (L163): value `${adherencePct}%`; sub `<ChipBar value color="#2680FF"/>` (L206-213).
3. **Workouts** (L164): value `${workoutsThisWeek}/${workoutsTarget}`; sub "esta semana".
4. **Comidas hoy** (L165-169): value `mealsDone!=null&&mealsTotal!=null ? \`${d}/${t}\` : '—'`; sub `${nutritionPct}% plan` color `nutritionPct>=80 ? theme.success : WARNING(#F5A524)`.
`HeroChip` (L215-223): `styles.chip` (L243) width'47%' flexGrow1 `bg rgba(255,255,255,0.07)` `border rgba(255,255,255,0.10)` bw1 radius14 pad10; label `styles.chipLabel`(fs10 ls0.4 uiSemibold color ON_DARK_MUTED); value `styles.chipVal`(fs16 ls-0.2 displayBlack tabular-nums color ON_DARK); sub `marginTop2`.
`ChipBar` (L206-213): `styles.barTrack`(L248: h4 radius99 overflow-hidden `bg rgba(255,255,255,0.10)` marginTop3) fill width%.

**Estado RN vs web (R5 §3.1 barra — RESUELTO):** track RN `rgba(255,255,255,0.10)` = `border-inverse` aplicado /10 (global.css:112 comentario "canal /10"); web track `bg-[var(--border-inverse)]`. fill RN `#2680FF` = sport-500 (`--color-sport-500: 38 128 255`) = web `bg-sport-500` ✓; altura 4 = web `h-1(4px)` ✓. value `font-display text-base(16)` ✓; RN value fs16 ✓.
**Nota tokens crudos:** RN usa hex crudos (`#2680FF`, `#F5A524`, `#FF8A5B`, `rgba(255,255,255,0.07/0.10)`) que son EQUIVALENTES a tokens (sport-500 / warning-500 / ember-400 / border-inverse) pero hardcoded. Son PRE-EXISTENTES (no nuevos) → no violan la regla 3; anotados como deuda de token para reskin futuro. NO introducir hex nuevos.

### 2.5 Animacion de entrada del hero
Web: el hero no anima por si mismo (la pagina usa `animate-fade-in` en el raiz, page.tsx:22). RN `ClientHero.tsx:101`: `<MotiView from={{opacity:0,translateY:12}} animate={{opacity:1,translateY:0}} transition={timing 360}>`. **DIVERGENCIA menor:** RN agrega slide-up de 360ms al hero (aditivo, mejora percibida). Anotar.

---

## 3. TAB BAR — `ProfileTabNav.tsx` (web) vs `ClientTabBar.tsx` (RN)

### 3.1 Set de tabs (5, sin Facturacion — RULING D2)
Web `ProfileTabNav.tsx:12-18`: `TABS = [overview:Resumen, progress:Progreso, workout:Entreno, program:Programa, nutrition:Nutrición]`. Comentario L9-11 explicita "5 pestañas (sin Facturación)... label-only (sin íconos)".
RN `[clientId].tsx:222-228`: `tabs = [overview:Resumen, progreso:Progreso, analisis:Entreno, plan:Programa, nutricion:Nutrición]`. Comentario L220-221 "sin Facturacion — removida del chrome, RULING D2".
**MATCH** de set + labels (R5 §3.2 confirmado). `FacturacionTab.tsx` existe pero NO se monta desde el shell (divergencia documentada permanente, no borrar).

### 3.2 Badges por tab
Web (`ClientProfileDashboard.tsx:195-205`, `tabBadges`): `progress = checkInTotal||undefined`; `workout = prCount>0?prCount:(workoutHistory.length||undefined)`; `program = programTrainingDayCount||undefined`; `nutrition = isNutritionAtRisk?'!':(mealDetailCount||undefined)`. `'!'` = alerta (isNutritionAtRisk = `nutritionCompliancePercent<60`, L141-143).
RN (`[clientId].tsx:224-227`): `progreso.badge = data.checkIns.length||null`; `analisis.badge = derived.weeklyPRs.length||null`; `plan.badge = data.activeProgram?.planCount||null`; `nutricion.badge = derived.attention && activeNutrition && nutritionWeeklyAvgPct<60 ? '!' : null`.
**DIVERGENCIA (fuente de conteos):** entreno RN=weeklyPRs.length vs web=prCount(records)||workoutHistory.length; programa RN=planCount vs web=programTrainingDayCount (filtrado por variante A/B efectiva, `ClientProfileDashboard.tsx:180-193`); progreso ambos=nº check-ins (MATCH); nutricion RN condiciona '!' a `derived.attention` ademas del <60% (web solo <60%). Numeros de badge divergentes. Anotar (los conteos "correctos" son responsabilidad de los tabs hermanos + data layer; el shell solo pinta).

### 3.3 Pill (estilo)
Web `ProfileTabNav.tsx:102-128`: boton `h-[38px] shrink-0 gap-1.5 rounded-pill border-[1.5px] px-3.5 text-[13.5px] font-bold`; activo `border-sport-500 bg-sport-500 text-[var(--text-on-sport)]`; inactivo `border-default bg-surface-card text-muted hover:text-strong`. Badge (L114-127): `h-[18px] min-w-[18px] rounded-pill px-1.5 text-[11px] font-extrabold tabular-nums`; alerta `bg-[var(--danger-500)] text-white`; activo `bg-white/25 text-white`; inactivo `bg-surface-sunken text-muted`.
RN `ClientTabBar.tsx:58-83`: `TouchableOpacity styles.tab`(L109: h38 gap6 px14) `className rounded-pill border-[1.5px]` + activo `bg-sport-500 border-sport-500` / inactivo `bg-surface-card border-default`; label `font-sans-bold` activo `text-on-sport` / inactivo `text-muted` `styles.label`(fs13.5); badge (L74-80) `styles.badge`(minW18 h18 px5) className `bg-danger-500`(alerta)/`bg-white/25`(activo)/`bg-surface-sunken`(inactivo), texto `font-sans-extra` `text-white`(alerta||activo)/`text-muted` `styles.badgeTxt`(fs11).
**MATCH** (R5 §3.2). Diferencia: RN `Haptics.selectionAsync()` al tap (L66) — aditivo idiomatico.

### 3.4 Fondo glass + sticky
Web `ProfileTabNav.tsx:78-90`: contenedor `sticky z-20 -mx-5 mb-2 border-b lg:-mx-6` (full-bleed contra gutter px-5), `top-[var(--safe-area-inset-top)] md:top-0`; fondo `bg-[color-mix(in_srgb,var(--surface-app)_80%,transparent)] [backdrop-filter:saturate(180%)_blur(12px)]` (glass). Estado **stuck** (L41-51, JS scroll listener): al pegarse → `border-default shadow-[0_6px_16px_-10px_rgba(0,0,0,0.28)]`; si no → `border-subtle`.
RN `ClientTabBar.tsx:37-47`: `View className="border-b border-subtle" styles.wrap`(L106: marginHorizontal -16 = full-bleed contra gutter 16). Glass = `<BlurView intensity={isDark?20:30} tint={isDark?'dark':'light'} experimentalBlurMethod="dimezisBlurView" style={absoluteFill}/>` (L40-46) + overlay `View bg rgba(10,13,18,0.8)`(dark)/`rgba(251,252,253,0.8)`(light)` (L47) = surface-app 80%. Sticky lo maneja `ScrollView stickyHeaderIndices={[1]}` en `[clientId].tsx:259`.
**Estado RN vs web (R5 §3.2 — RESUELTO):** el glass/blur YA fue portado (BlurView + overlay 80%). **GOTCHA 6a cumplido:** `experimentalBlurMethod="dimezisBlurView"` presente → blur real en Android (sin el, velo sin blur).
**DIVERGENCIA (stuck):** web eleva la barra (border-default + sombra) cuando queda pegada; RN mantiene siempre `border-subtle` sin sombra-al-pegar (no hay estado stuck). PX menor. Anotar.
**Overlay dark color:** RN usa `rgba(10,13,18,0.8)` = surface-app dark `#0A0D12` a 80% ✓; light `rgba(251,252,253,0.8)` = paper `#FBFCFD` a 80% ✓.

### 3.5 Fade + chevron de scroll horizontal
Web `ProfileTabNav.tsx:134-167`: cuando `canScrollRight` (overflow y no al final, L53-60), `motion.div` fade `w-16 md:hidden` con `background: linear-gradient(to right, transparent, var(--surface-app) 80%)`; si `showHint` (aun no scrolleado >10px, L59,75) chevron `ChevronRight h-4 w-4 text-muted-foreground/60` con loop `x:[0,4,0]` 1.1s (respeta `useReducedMotion`).
RN `ClientTabBar.tsx:86-99`: `canScrollRight = contentW>viewW+4 && scrollX+viewW<contentW-4` (L32); fade `styles.fade`(L113: w56) con `LinearGradient colors=['transparent', theme.background]` + `MotiView` chevron `ChevronRight size16 color theme.mutedForeground` loop translateX 0→4 1100ms repeatReverse.
**MATCH funcional.** Diferencia menor: web oculta hint tras primer scroll (`hintDismissed`), RN muestra el chevron mientras haya overflow a la derecha (sin dismiss persistente). Anotar (PX menor).

---

## 4. FLOATING ACTIONS — `ProfileFloatingActions.tsx` (web) vs (RN)

Web `ProfileFloatingActions.tsx:38-155`:
- Solo boton WhatsApp full-width (comentario L30-37: se eliminaron check-in y builder).
- Contenedor sticky/fixed (L76): `static max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(env(safe-area-inset-bottom)+96px)] max-md:z-40 md:sticky md:bottom-0`; `pointerEvents:none` con hijos `auto`; padding/gap animados por `actMin` (L80-89): min → `padding 0 56px …` gap6; normal → `padding 0 20px …` gap8; transiciones `var(--dur-slow)/var(--dur-base)`.
- Estado `actMin` (L42, L46-61): scroll listener sobre el scroll-parent → `y<36`:false; `y-last>8`:true; `last-y>8`:false.
- Boton (L93-122): `<a href={waHref} target="_blank">` o (sin telefono) `<button disabled>`; `flex:1 height:actMin?38:44 gap:8 rounded-control background:#16A34A color:#fff fontSize14 fontWeight700 boxShadow:'0 10px 28px rgba(0,0,0,0.45),0 2px 8px rgba(0,0,0,0.35)'`; contenido `<WhatsAppGlyph/> WhatsApp`. `waHref = digits.length>=10 ? \`https://wa.me/${digits}\` : null` (L5-9,63-64) — SIN texto prellenado.

RN `ProfileFloatingActions.tsx:30-91`:
- `MotiView pointerEvents="box-none"` (L34) `animate paddingHorizontal:compact?56:20` `styles.wrap`(L63: absolute left0 right0, bottom `insets.bottom+12`).
- Boton shell `MotiView animate height:compact?38:44` `styles.btnShell`(L71: flex1 radius14 shadow dura `shadowOpacity 0.45 shadowRadius14 elevation12`).
- `<Pressable onPress>` (L44-56): `styles.btn` `bg WA_GREEN(#16A34A)` gap8 radius14; `<WhatsAppGlyph/>` + `<Text styles.label>WhatsApp</Text>`(fs14 uiBold white). `Haptics.selectionAsync()` (L46).
- `compact` viene de `[clientId].tsx:167-173` `onScroll` (`y<36`:false; `y-last>8`:true; `last-y>8`:false) — MISMA logica que web `actMin`.
- El handler `onWhatsApp` = `[clientId].tsx:105-110`: digits vacio → `Alert.alert('Sin telefono')`; si no → `Linking.openURL(\`https://wa.me/${digits}?text=${encode(msg)}\`)` con `msg="Hola {firstName}! Te escribo desde EVA."`.

**Estado RN vs web (R5 §3.3 — COINCIDE):** #16A34A, 44/38, gutter 20/56, radius14, label 14 bold, glifo identico (path 1:1), sombra dura. Sin diffs de estilo.
**DIVERGENCIA (gating + texto WhatsApp):** (a) web habilita solo con `digits.length>=10`, si no → boton `disabled` visible; RN abre con cualquier digit, si vacio → Alert "Sin telefono" (no hay boton disabled). (b) web `wa.me/{digits}` SIN texto; RN agrega `?text=Hola {firstName}! Te escribo desde EVA.` **Ambas cambian el comportamiento observable** (mensaje prellenado + estado disabled). PENDIENTE-DECISION-CEO leve: mantener el texto prellenado RN o igualar a web (sin texto)? El gesto (tap → WhatsApp) se preserva; solo cambia el payload. Anotar como decision de producto.

---

## 5. HELPERS COMPARTIDOS — `shared.tsx` (RN, owner=esta unidad)

`shared.tsx` (105 L) provee primitivos que los tabs hermanos importan read-only:
- `formatDate` (L7-9), `formatCurrency` (L10-12), `dayName` (L13-15), `relativeDays` (L16-28) — formateadores es-CL.
- `StatCard` (L31-37) = `<Card padding16 radius="card" gap12>`.
- `CardHeader` (L39-50) = titulo `text-muted font-sans-bold` uppercase + icono opcional (default `theme.primary`) + slot `right`.
- `Pill` (L52-60) = chip tono `warning/danger/success` con bg `c+'16'` border `c+'44'`.
- `MetricBox` (L63-72) = KPI `bg-surface-sunken border-subtle` value Archivo_900Black + label + sub.
- `cd`/`s` (L74-95) = StyleSheet compartido; `adherenceColor` (L100-105).

**No hay equivalente 1:1 web** (son primitivos DS mobile). Web usa `Card`/`Badge`/`SectionTitle` de shadcn. `SectionTitle` web (`_components/SectionTitle.tsx`) = `h3 font-display font-extrabold tracking-[-0.02em] text-strong fontSize17 margin '4px 0 10px'` — el mirror mobile mas cercano es `CardHeader`/titulos de los tabs (fuera de shell). **Regla 10 (esta unidad OWNER de shared.tsx):** cualquier cambio de firma aca impacta a las 3 unidades hermanas → cambios solo aditivos/compatibles; los tabs lo consumen sin editarlo.

---

## 6. ESTADOS (vacio / carga / error)

Web:
- **Carga:** `<Suspense fallback={<ProfileSkeleton/>}>` (page.tsx:33). `ProfileSkeleton` (L212-228): avatar `Skeleton w-24 h-24 rounded-2xl` + 2 lineas + barra + 2 cards. Ademas skeleton por transicion de tab (`ClientProfileDashboard.tsx:246-260`, `isPending` de `useTransition`).
- **Error:** el fetch server (`getClientProfileData`) lanza → boundary de Next; export PDF → `exportError` inline (Hero L231-235).
- **Vacio:** no hay estado "cliente no encontrado" explicito (Suspense + fetch; 404 via notFound del data layer, no visible aca).

RN `[clientId].tsx`:
- **Carga** (L175-181): `if (loading)` → `SafeAreaView` + `<EvaLoaderScreen subtitle="Cargando alumno…"/>`.
- **No encontrado / error** (L182-189): `if (!client||!data||!derived)` → `TopBar back title="Alumno"` + `<EmptyState icon={User} title="Alumno no encontrado" subtitle="Vuelve a la lista de alumnos."/>`. El fetch envuelve todo en try/catch (`load` L77-88 `console.warn`; el data layer devuelve `EMPTY` ante fallo parcial, coach-client-detail L923-926).
- **Sin transicion de tab pending:** RN NO tiene skeleton por cambio de tab (no usa useTransition) — el swap de View es inmediato.
**DIVERGENCIA:** web muestra skeleton al cambiar de tab (isPending); RN cambia instantaneo. Anotar (menor; RN carga los datos una vez, tabs son sincronos).

---

## 7. QUERIES / DATOS (tablas, filtros, limites, claves de dia)

Fetch principal `getCoachClientDetail` (`coach-client-detail.ts:573-927`) — 16 queries en `Promise.all` (L655-758):
- `clients` (L602-604): select `id, full_name, email, phone, is_active, is_archived, goal_weight_kg, subscription_start_date, created_at` eq id.
- `client_intake` (L676): `height_cm, weight_kg, sex` (biometria; placeholder 0→null L858).
- `check_ins` (L680-686): `selectWithFallback` (3 tiers por columnas faltantes) `order date desc limit 200`.
- `client_payments` (L687-690): fallback 2 tiers, `order payment_date desc limit 20`.
- `workout_programs` (L691-705): programa activo (`is_active=true`) + planes + bloques + ejercicios.
- `nutrition_plans` (L706-720): plan activo + meals + food_items + foods.
- RPCs agregadas en Postgres (zona Santiago): `get_client_workout_day_counts`(30d, L722), `get_client_muscle_volume`(30d, L735), `get_client_exercise_prs`(L737), `get_client_strength_series`(L739), `get_client_daily_tonnage`(21d, L741), `get_client_weekly_prs`(L743), `get_client_activity_dates`(371d, L745).
- `daily_nutrition_logs` (L723-728): 30d de logs con `nutrition_meal_logs`.
- `workout_sessions` (L729-733): `date_completed` >= 14d (semana actual/previa).
- `workout_logs` (L747-751): crudo minimo 30d para volumen-por-series.
- `client_food_preferences` (L752-757): favoritos limit 20.

**Claves de dia (GOTCHA 6d — CUMPLIDO):** `getTodayInSantiago().iso` (L638), `isoDateAddDays` (L639-641), `getSantiagoUtcBoundsForDay` (día detail, L932). Las RPC devuelven `day` en zona Santiago (comentarios L800,805). `checkInRegularityPercent`/`buildActivityWindow`/`buildNutritionTimeline`/`nutritionStreakDays` iteran por fecha Santiago. `[clientId].tsx:67,142` usa `getTodayInSantiago().iso` para `selectedDate` y lookup del `today` de la timeline. ✓

Day detail `getCoachClientDayDetail` (L931-993): `workout_logs`+`daily_nutrition_logs`+`daily_habits` acotados por `getSantiagoUtcBoundsForDay(date)` (workout: gte startIso/lt endIso; nutrition/habits: eq log_date). Disparado por `useEffect([clientId, selectedDate])` (L91-101).

**Derivados del hero (`[clientId].tsx:134-165` `useMemo`):**
- `currentWeight`/`weightDelta` (L136-138): serie check_ins con `weight!=null` ordenada; delta = `round1(ultimo - penultimo)`.
- `streak` (L139-140): `longestActivityStreak(buildProfileActivityCalendar(workoutDates371, checkIns.dates))`.
- `trainingAge` (L141): `formatTrainingAgeLabel(subscription_start_date, created_at)`.
- `today` (L143): timeline del dia Santiago o `[0]`.
- `attention` (L147-150): `checkInCompliancePercent<40` → "Check-ins irregulares — conviene contactar."; elif `activeNutrition && nutritionWeeklyAvgPct<60` → "Adherencia nutricional baja esta semana."; elif `checkIns[0] && !reviewed_at` → "Hay un check-in sin revisar."
- `lastActivityIso` (L153-155): max(lastWorkout, lastCheckin).
- `planCurrentWeek` (L156-162): ceil client-side sobre start_date.

`heroChips` (`[clientId].tsx:209-218`): `adherencePct = min(100, round(workoutsThisWeek/workoutsTarget*100))` (L212, espejo web `ClientProfileHero.tsx:123`); `nutritionPct = compliance.nutritionWeeklyAvgPct` (L217).
> **Nota web vs RN (comidas hoy / nutritionPct):** web hero recibe `compliance.nutritionCompliancePercent` (L124) y `todayMealsDone/Total` (L125-126); RN pasa `nutritionWeeklyAvgPct` como `nutritionPct` (L217) y `derived.today.mealsDone/Total` (L215-216, del timeline del dia). Fuente distinta (compliance server vs timeline client). Numeros pueden diferir. Anotar.

---

## 8. ANIMACIONES

- Hero: MotiView slide-up 360ms (RN L101; web sin anim propia, aditivo).
- Tab swap: web `AnimatePresence mode="wait"` opacity/y 0.18s con `useReducedMotion` (`ClientProfileDashboard.tsx:232-240,262`); **RN sin transicion** entre tabs. DIVERGENCIA.
- TabBar chevron: loop translateX 0→4 1100ms (ambos; web respeta reduced-motion, RN loop siempre).
- FAB: padding/gap/height animados por scroll (ambos; web CSS transition, RN Moti timing 180/220ms).
- Web `animate-fade-in` en el raiz de pagina (page.tsx:22) — RN no lo replica a nivel pantalla (usa loader→contenido).

---

## 9. ACCESIBILIDAD

Web: botones export/mas con `aria-label`+`title` (Hero L211-213,225-227); `exportError` `role="alert"` (L232); Badge con `title` score (L268); WhatsApp `aria-label="Contactar por WhatsApp"` (FAB L98) / disabled `aria-label="Sin teléfono para WhatsApp"` (L127).
RN: export `accessibilityRole="button" accessibilityLabel="Exportar dossier PDF" accessibilityState={busy}` (ClientHero L114-116); mas `accessibilityLabel="Más opciones"` (L128); tabs `testID ficha-tab-{value}` (ClientTabBar L67); FAB `accessibilityRole="button" accessibilityLabel="Contactar por WhatsApp" testID="ficha-whatsapp"` (ProfileFloatingActions L49-51). `testID` de shell: `ficha-export-pdf`, `ficha-more` (ClientHero L117,128).
**Gap a11y:** RN no expone el score de atencion (web `title`); reasons legibles como texto plano. Menor.

---

## 10. HALLAZGOS OLA 0 (`docs/rn-port/ola0-hallazgos.json`)

Grep segun brief:
- `"ClientProfileHero"` / `"ProfileTabNav"` / `"ProfileFloatingActions"` = **0 hits** de hallazgo propio (confirmado por grep). El hero/tabbar/FAB del shell se auditan por **R5 §3.1/§3.2/§3.3**, no por Ola 0.
- `"ProfileOverviewB3"` = 14 hits (L7060-7150, entrada catalogo L10743-10744). **TODOS pertenecen al CONTENIDO del tab Resumen** (KPIs, rings, metricas, check-in fotos, modulos, "Editar plan") → propiedad de `ficha-overview-progreso` (READ-ONLY para esta unidad). Ninguno toca el armazon/hero/tabbar/FAB. No accionables aqui; se listan para trazabilidad:
  - 7067 KPI "Adherencia entreno"; 7074 variacion peso semanal; 7081 ComplianceRing deep-link nutricion; 7088 boton "Editar plan" (→ builder); 7095 fotos check-in por cualquier angulo; 7102 semaforos por token; 7109 deltas en puntos; 7116 KPI cards con motion; 7123 MetricInfo; 7130 tiles modulos; 7137 empty fotos; 7144 editor biometria.
- Componentes DS referenciados (L9900 MetricInfo/InfoTooltip, L9988 ProgressRing) tambien son de contenido de tabs, no shell.

**Conclusion Ola 0:** el shell de esta unidad no tiene hallazgos Ola 0 propios; su fuente de verdad de diffs es la R5 (§11).

---

## 11. HALLAZGOS RONDA 5 (`docs/audits/rn-parity-qa/r5-audit-coach-core.md` §3)

### §3.1 ClientHero — 7 diffs PX listados → **TODOS RESUELTOS en el RN actual**
| R5 flag | Web | RN al momento R5 | RN ACTUAL (cita) | Estado |
|---|---|---|---|---|
| Nombre | 24 / ls≈-1.2 | 25 / -0.6 | fs24 ls-1.2 (`ClientHero.tsx:229`) | ✅ RESUELTO |
| Iniciales | 20 / 800 | 22 | fs20 displayBold (`L235`) | ✅ |
| Copy racha | "…de actividad" | "N d de racha" | "…d de racha de actividad" (`L152`) | ✅ |
| Iconos meta | 14 | 13 | size 14 (`L152-155`) | ✅ |
| Delta peso | `.toFixed(1)` | crudo | `.toFixed(1)` (`L201`) | ✅ |
| Barra adherencia | track border-inverse / fill sport-500 | rgba white 0.14 / brand | track `rgba(255,255,255,0.10)`=border-inverse/10, fill `#2680FF`=sport-500 (`L248,163`) | ✅ |
| Icono Activity | sport-400 | brand | `#5C9DFF`=sport-400 (`L153`) | ✅ |

### §3.2 ClientTabBar — 1 diff PX (fondo glass) → **RESUELTO**
- R5: web `bg color-mix(surface-app 80%) backdrop-blur(12px)` vs RN `bg-surface-app` solido sin blur. RN ACTUAL: `BlurView experimentalBlurMethod="dimezisBlurView"` + overlay 80% (`ClientTabBar.tsx:40-47`). ✅
- Nota: el set+estilo de pill ya COINCIDIA (R5 §3.2).

### §3.3 ProfileFloatingActions → **COINCIDE** (sin diffs; verificar no-regresion).

**Diffs R5 que PERSISTEN / no cubiertos por R5:** (nuevos hallazgos de esta pasada)
- Fondo Card hero en **dark**: RN `surface-inverse #2A323D` (plomo) vs web near-black `color-mix(card 55%, app)`. (§2.3) — NO estaba en R5.
- TabBar sin estado **stuck** (sombra/border al pegar). (§3.4)
- Sin **transicion** de tab (web AnimatePresence). (§8)
- **Menu de acciones** reducido (§12). (§12)

---

## 12. ESTADO RN ACTUAL — divergencias con cita RN

1. **Menu ⋮ reducido** (`[clientId].tsx:302-316`): RN `ActionSheet` con SOLO 2 acciones — "Editar datos" (→ `NativeDialog` + `EditClientForm` L318-320) y "Archivar/Reactivar alumno" (`confirmArchive` L117-131, Alert de confirmacion). **Web `ClientActionsSheet`** (importado en `ClientProfileHero.tsx:40,351-368`) expone 6: editar datos, WhatsApp, resetear contraseña, pausar, archivar, eliminar + link de login (`loginUrl`). **DIVERGENCIA de funcionalidad (regla 2 — anotada, no removida):** RN carece de reset-password, pausar, eliminar, WhatsApp-en-menu y del `loginUrl`. El port 1:1 de `ClientActionsSheet` excede el shell (componente compartido con el directorio); se anota como gap. NO borrar el ActionSheet actual.

2. **Status del hero (logica)** — RN computa inline (`[clientId].tsx:200-205`): `neutral/Archivado` si `is_archived`; `neutral/Inactivo` si `!is_active`; `attention/Atención` si `derived.attention`; else `ok/Al día`. **NUNCA produce `urgent`**. Web usa `deriveClientStatus` (`packages/profile-analytics/client-status.ts:24-74`) → niveles `ok/attention/urgent` (score≥50 / ciclo vencido / 14d sin actividad = urgent) o `statusProp` server; y **nunca** muestra `neutral/archivado` en el badge. **DIVERGENCIA de logica de estado:** (a) RN puede mostrar "Archivado/Inactivo" (nivel neutral) que web no; (b) RN nunca escala a "Urgente" (rojo) que web si. `HeroStatusLevel` incluye `neutral` (`ClientHero.tsx:23`) mapeado a tono `neutral`/ring `ink-500` (L25-37) — extension RN sin equivalente web. **Recomendacion:** evaluar usar `deriveClientStatus` (puro, ya compartido) para paridad de niveles, o formalizar la extension `neutral` como decision RN. (No cambia gesto; cambia el badge que el usuario VE → PENDIENTE-DECISION-CEO.)

3. **Fondo hero dark plomo** (§2.3): `Card variant="inverse"` → `#2A323D`. Web lo oscurece a near-black por feedback CEO. Recomendacion: override dark.

4. **planCurrentWeek client-side** (§2.2): RN deriva la semana (ceil) vs web server compliance.

5. **Badges de tab con fuentes distintas** (§3.2).

6. **Congelamiento tras editar (GOTCHA 6b)** — `[clientId].tsx` hace fetch propio via `load()` en `useEffect([clientId])` (L89) y day-detail en `useEffect([clientId, selectedDate])` (L91-101). Es ruta stack-push (no tab persistente), pero al navegar a `program-builder`/`nutrition-builder` (`openBuilder` L112-115; `onEditNutrition` L292-293) y VOLVER, la pantalla NO se remonta → `load()` no re-corre → **datos stale** (ej. plan editado no se refleja). **NO usa `useFocusEffect`.** Riesgo real de la ficha desactualizada tras editar. **Recomendacion:** envolver `load()` en `useFocusEffect` (o señal de refresh al volver del builder), respetando gotcha 6b. Anotado como hallazgo accionable de esta unidad.

7. **WhatsApp con texto prellenado + gating por Alert** (§4): divergencia de payload/gating vs web.

8. **Sin skeleton de transicion de tab** (§6/§8).

---

## 13. MAPA DE INTERACCIONES (todos los tocables — el lente de cableado verifica contra esta lista)

### Web (fuente de verdad)
| # | Tocable (archivo:linea) | Efecto exacto |
|---|---|---|
| W1 | Back "Alumnos" `page.tsx:24` | `<Link href="/coach/clients">` → navega al directorio |
| W2 | Boton Export PDF `Hero:207-221` | `handleExport` (L180-192): `getClientDossier(clientId)` → `downloadClientDossierPdf(dossier)`; spinner+disabled; error → `exportError` inline |
| W3 | Boton Mas `Hero:222-230` | `setActionsOpen(true)` → `<ClientActionsSheet/>` (editar/WhatsApp/reset-pass/pausar/archivar/eliminar) |
| W4 | ClientActionsSheet `onEdit` `Hero:366` | `setEditingClient({id,name})` → `<EditClientDataModal/>` (L369-376) |
| W5 | Badge estado `Hero:265-271` | `title="Score de atención: N"` (tooltip, no navega) |
| W6 | Pills tab x5 `ProfileTabNav:102-128` | `onChange(tab.id)` → `handleTabChange` (`Dashboard:70-74`, useTransition setActiveTab) |
| W7 | FAB WhatsApp `ProfileFloatingActions:93-122` | `<a href="https://wa.me/{digits}" target=_blank>` (digits≥10) o `<button disabled>` |
| W8 | (deep-links internos del overview, fuera de shell) | `goToProgressHistory`/`goToNutritionProgress` (`Dashboard:207-230`) → cambian tab + scrollIntoView. Cableados desde ProfileOverviewB3 (unidad hermana) |

### RN actual (`[clientId].tsx` + componentes propios)
| # | Tocable (archivo:linea) | Efecto exacto | Espejo web |
|---|---|---|---|
| R1 | TopBar back `[clientId].tsx:257` | `router.back()` | W1 (destino distinto: back nativo vs link a /coach/clients) |
| R2 | Hero Export PDF `ClientHero:110-127` → `onExportPdf` | `handleExportPdf` (`[clientId].tsx:234-252`): `exportClientDossierPdf(clientId, data, {statusLabel,statusLevel,streak,trainingAge,lastActivityIso,planCurrentWeek})`; spinner `exportingPdf`; error → `Alert.alert` | W2 (share sheet vs download; Alert vs inline) |
| R3 | Hero Mas `ClientHero:128-130` → `onMore` | `setMoreOpen(true)` → `<ActionSheet/>` (2 acciones) | W3 (reducido) |
| R4 | ActionSheet "Editar datos" `[clientId].tsx:307` | `setEditOpen(true)` → `<NativeDialog>` + `EditClientForm` (L318-320,337-373) | W4 |
| R5 | ActionSheet "Archivar/Reactivar" `[clientId].tsx:308-314` | `confirmArchive` (L117-131) → Alert confirm → `setCoachClientArchived(id, archiving)` → `load()` | (parte de W3; web via ClientActionsSheet) |
| R6 | Pills tab x5 `ClientTabBar:63-83` → `onChange` | `setTab(value)` (`[clientId].tsx:279`); + `Haptics.selectionAsync()` | W6 (sin useTransition) |
| R7 | FAB WhatsApp `ProfileFloatingActions:44-56` → `onWhatsApp` | `openWhatsApp` (`[clientId].tsx:105-110`): sin digits → `Alert.alert('Sin telefono')`; else `Linking.openURL(wa.me/{digits}?text=...)` | W7 (texto prellenado; sin disabled) |
| R8 | EditClientForm "Guardar" `[clientId].tsx:370` | `submit` (L346-359): valida nombre≥2 → `updateCoachClient(id,{full_name,phone,goal_weight_kg,subscription_start_date})` → `onDone`→`load()` | W4 (EditClientDataModal) |
| R9 | EditClientForm "Cancelar" `[clientId].tsx:369` | `onCancel` → `setEditOpen(false)` | — |
| R10 | Fotos check-in (via tabs) `[clientId].tsx:230,284-293` → `onOpenPhoto` | `setLightbox({photos,index})` → `<PhotoLightbox/>` (L322) | (contenido de tabs; el shell provee el handler) |
| R11 | Selector de fecha (via tabs analisis/nutricion) `[clientId].tsx:288,292` → `onSelectDate` | `setSelectedDate` → dispara `useEffect` day-detail (L91-101) | (contenido de tabs) |
| R12 | Editar programa (via overview/plan) `[clientId].tsx:284,290` → `onEditProgram`/`onEdit` | `openBuilder` (L112-115): `router.push('/coach/program-builder?clientId=&clientName=')` | (contenido; deep-link) |
| R13 | Editar nutricion (via nutricion) `[clientId].tsx:292-293` → `onEditNutrition` | `router.push('/coach/nutrition-builder?clientId=&clientName=')` | (contenido; deep-link) |
| R14 | PhotoLightbox cerrar `[clientId].tsx:322` | `setLightbox(null)` | — |

**Tocables SOLO-web ausentes en RN (gap de menu):** reset contraseña, pausar, eliminar, WhatsApp-desde-menu, link de login (`loginUrl`) — todos dentro de `ClientActionsSheet` (W3). Ver §12.1.

---

## 14. GATE / verificacion
- `npx tsc --noEmit` en `apps/mobile` debe quedar limpio tras cualquier edicion.
- No tocar archivos ALUMNO/ejecutor (Secciones 1-2).
- No tocar `global.css`/`tailwind.config.js`; cero hex crudos NUEVOS (los existentes = deuda anotada, no ampliar).
- Copy VERBATIM del web (ya latino neutro): "Al día", "Atención", "Urgente", "d de racha de actividad", "Desde {mmm}", "esta semana", "% plan", "sin cambio", labels de tab.

## 15. PENDIENTE-DECISION-CEO (cambios de gesto/flujo)
1. **Status neutral/urgent** (§12.2): RN muestra "Archivado/Inactivo" (web no) y nunca "Urgente" (web si). Decision: adoptar `deriveClientStatus` o formalizar extension RN.
2. **WhatsApp con texto prellenado** (§4): mantener "Hola {firstName}! Te escribo desde EVA." o igualar a web (sin texto).
3. **Menu ⋮ reducido** (§12.1): portar `ClientActionsSheet` completo (reset-pass/pausar/eliminar/login-url) o dejar 2 acciones. (Componente compartido — coordinar con directorio.)
