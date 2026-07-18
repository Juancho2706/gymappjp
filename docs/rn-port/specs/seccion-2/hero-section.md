# SPEC §5 — Hero "que hago hoy" (key: hero-section)

Unidad del PORT 1:1 Seccion 2 (dashboard alumno). **Web = fuente de verdad.**
P0 QA asignado: **P0-2 overlay "Entrenamiento completado" sin scrim.**

## Fuentes (verdad web)
- Dispatcher: `apps/web/src/app/c/[coach_slug]/dashboard/_components/hero/HeroSection.tsx`
- `apps/web/.../hero/WorkoutHeroCard.tsx`
- `apps/web/.../hero/RestDayCard.tsx`
- `apps/web/.../hero/QuickLogSheet.tsx` (NO montado por el dispatcher; ver §QuickLog)

## Contraparte RN
- `apps/mobile/components/alumno/home/HeroSection.tsx` (WorkoutHero, HeroBlockRow, RestDayCard, NoPlanCard)
- Tipos: `apps/mobile/components/alumno/home/types.ts`
- Primitivos: `apps/mobile/components/Card.tsx`, `ProgressRing.tsx`, `Button.tsx`

---

## 1. Dispatcher / ramas de variante

**Web** (`HeroSection.tsx:34-48`): SOLO dos ramas.
- `if (hasWorkout && planId && planTitle)` → `<WorkoutHeroCard ...>` (`:34-46`).
- else → SIEMPRE `<RestDayCard>` (`:48`) — incluso sin programa asignado (web muestra "Día de descanso" al alumno sin programa).

**RN** (`HeroSection.tsx:41-49`): TRES ramas.
- `if (todayPlan)` → `WorkoutHero` (`:41-44`).
- `else if (hasProgram)` → `RestDayCard` (`:46-47`).
- else → `NoPlanCard` (`:49`) — variante EXTRA que no existe en web.

**NoPlanCard es funcionalidad RN existente (regla 2): NO eliminar.** Es divergencia deliberada UX mobile (Ola0 P2 `element: HeroSection — variante extra NoPlanCard`). El alumno sin programa ve en RN "Tu coach está armando tu plan" + CTA "Hacer un check-in" (`HeroSection.tsx:186-202`) donde web mostraría RestDayCard. Documentado como excepcion de paridad; se conserva.

Props web dispatcher (`:4-18`): `coachSlug, hasWorkout, planId, planTitle, blocks, isAlreadyLogged, totalSetsTarget, totalSetsLogged, baseLoggedPerBlock, nextWorkoutTitle, nextWorkoutDayLabel, nutritionEnabled=true`.
Props RN dispatcher (`:29-40`): `todayPlan, nextPlan, loggedByBlock (Map), isAlreadyLogged, hasProgram, coachName, nutritionEnabled, onStart, onRest, onNoPlan`. Navegacion web via `<Link>`; RN via handlers del shell (idiomatico, ver §Interactividad).

---

## 2. Variante A — WorkoutHeroCard / WorkoutHero

### 2.1 Contenedor
- **Web** (`WorkoutHeroCard.tsx:51`): `<Card variant="inverse" padding="lg" className="relative gap-0 shadow-[var(--shadow-lg)]">`. Override explicito a **shadow-lg** (`globals.css:555` light / `:646` dark), NO el shadow-md por defecto del inverse.
- **RN** (`HeroSection.tsx:73`): `<Card variant="inverse" padding="lg">` sin override → Card inverse aplica `SHADOWS.md` (`Card.tsx:95-96`). **Divergencia (Ola0 P2):** hero RN queda con menos elevacion. Fix: `style={SHADOWS[theme.scheme].lg}` (`lib/shadows.ts:33,43` tiene lg). NO tocar Card.tsx si no es de esta unidad → si se requiere prop `shadow` en Card, reportar en cambiosShell.
- Padding lg = 20px en ambos (`web card.tsx` p-5 ↔ `Card.tsx` PAD_TOKEN.lg=20 `:72`). Radio de card = `rounded-card`=20px ambos.
- **Entrada:** web sin animacion de entrada (`WorkoutHeroCard.tsx:50-133` estatico); RN envuelve en `MotiView from opacity:0 translateY:16 → animate opacity:1 translateY:0` timing 450 delay 80 (`:72`). Ola0 P2: motion DS mobile intencional, se conserva/documenta.

### 2.2 Header (fila superior)
Web `:60-85` / RN `:74-99`. `flex-row items-start justify-between gap-3` (RN `gap:12`).
Columna izquierda `flex-1 min-w-0`:
- **Eyebrow "Hoy entrenás"** (web, con tilde `:63`) / **"Hoy entrenas"** (RN `:77`, latino neutro; copy VERBATIM del texto neutro). Estilo: `text-[11px] font-bold uppercase tracking-[0.1em] text-sport-400`. RN (`:76`): `fontSize:11, FONT.uiBold, uppercase, letterSpacing:1, className text-sport-400`.
  - **InfoTooltip** al lado (web `:64`, `content={t('section.workoutHero')}`, dentro de `flex items-center gap-2`). **RN AUSENTE** (Ola0 P2 `element: WorkoutHero — InfoTooltip`). No portado; anotar (regla 10).
- **Titulo** (web `:66-68`): `<h2 class="mt-1.5 truncate font-display text-[23px] font-black leading-tight tracking-[-0.02em] text-on-dark">{title}`. `truncate` = 1 linea + ellipsis. RN (`:79`): `numberOfLines={2}`, `textStyle('2xl', displayBlack, lh tight ls tight)`, `marginTop:6, fontSize:23`, `text-on-dark`. **Divergencia (Ola0 P2):** RN 2 lineas vs web 1. Fix paridad estricta `numberOfLines={1}`.
- **Subtitulo** (web `:69-71`): `mt-1 text-[13px] text-on-dark-muted` → `{blocks.length} {blocks.length===1?'ejercicio':'ejercicios'} · {totalSetsTarget} series`. RN (`:82-84`): `fontSize:13, marginTop:4, text-on-dark-muted font-sans` → `{plan.blocks.length} {plan.blocks.length===1?'ejercicio':'ejercicios'} · {totalTarget} series`. Copy VERBATIM.

**ProgressRing** (web `:73-84` / RN `:86-98`): `value={pct} size=64 stroke=7 color=var(--sport-500)`(web)/`theme.primary`(RN, equivalente white-label) `track="rgba(255,255,255,0.12)"`. Label centrado: `font-display text-[15px] font-black tabular-nums text-on-dark` → `{liveLogged}/{totalSetsTarget}` (web) / `{totalLogged}/{totalTarget}` (RN, `fontVariant tabular-nums`, `fontSize:15`). RN pasa `showValue={false}` (`:92`) = equivalente al comportamiento web (el ring oculta el % cuando hay label).

Calculo pct: web `totalSetsTarget>0 ? min(100,(liveLogged/totalSetsTarget)*100) : 0` (`:48`); RN idem con `totalLogged/totalTarget` (`:68`). RN deriva `totalTarget` y `totalLogged` localmente (`:66-67`, clampa por bloque con `Math.min(b.sets, loggedByBlock.get(b.id) ?? 0)`); web recibe totales del server. Diferencia de derivacion, resultado equivalente.

### 2.3 Lista de bloques
Web `:87-122` / RN `:101-114, 133-151`.
- `show = blocks.slice(0,4)` (web `:44` / RN `:64`); `more = blocks.length - show.length` (web `:45` / RN `:65`).
- Contenedor: web `<ul class="mt-4 mb-4 flex flex-col gap-px overflow-hidden rounded-control bg-white/[0.04]">` (`:87`). RN `View marginTop:16 marginBottom:16 borderRadius:12 overflow:hidden backgroundColor:'rgba(255,255,255,0.04)'` (`:102`). **Divergencia (Ola0 P2):** radio RN 12 vs `rounded-control`=14. Fix 14 / `className="rounded-control"`.
  - RN: si `show.length===0` renderiza spacer `View height:16` (`:112-114`) — mantiene ritmo. Web siempre tiene lista (sin bloques quedaria `<ul>` vacia). Adaptacion RN valida.
- **Fila de bloque** (web `<li>` `:92-116` / RN `HeroBlockRow` `:133-151`): `min-h-[52px]` (RN `minHeight:52`), `px-3 py-2.5`(web=12/10) ↔ RN `paddingHorizontal:12 paddingVertical:10`, `gap-2.5`(10)↔`gap:10`, `overflow-hidden`. RN filas separadas por `borderTopWidth: first?0:1, borderTopColor:'rgba(255,255,255,0.04)'` (`:137`) = equivalente al `gap-px` sobre `bg-white/[0.04]` del web (hairline entre filas).
  - **Barra de relleno** (fondo de progreso): web `<span aria-hidden class="absolute inset-y-0 left-0 {full?'bg-[rgba(76,201,164,0.12)]':'bg-white/[0.07]'}" style=width:{(logged/b.sets)*100}%>` (`:93-100`). RN `View absolute left:0 top:0 bottom:0 width:'{fillPct}%' backgroundColor: full?'rgba(76,201,164,0.12)':'rgba(255,255,255,0.07)'` (`:138`). `fillPct = min(100,(logged/sets)*100)` (RN `:135`; web no clampa pero overflow-hidden lo hace irrelevante). PARIDAD OK.
  - `full = logged >= b.sets` (web `:90`) / RN `logged >= sets && sets>0` (`:134`, guard extra sin efecto visual).
  - Texto: nombre `truncate text-[13.5px] font-semibold text-on-dark` (web `:102`) ↔ RN `text-on-dark font-sans-semibold numberOfLines=1 fontSize:13.5` (`:140`). Prescripcion `text-[11px] text-on-dark-muted` → `{b.sets} × {b.reps}` (web `:103-105`) ↔ RN `FONT.ui fontSize:11 text-on-dark-muted` (`:141`).
  - Contador der.: `relative flex items-center gap-1 text-[11.5px] font-bold tabular-nums {full?'text-sport-500':'text-on-dark-muted'}` → `{logged}/{b.sets}` + `<Check h-3.5 w-3.5>` si full (web `:107-115`, Check hereda color). **RN (`:143-147`): `color: full?'#4CC9A4':'rgba(255,255,255,0.55)'` y `<Check size=14 color="#4CC9A4" strokeWidth=2.6>` — HEX MINT HARDCODEADO.** Ola0 **P1** (`element: WorkoutHero — color del contador/check de bloque completo`): debe ser `text-sport-500`/`theme.primary` (full) y `text-on-dark-muted` (resto), como web. El mint `#4CC9A4` en web SOLO existe como relleno de barra `rgba(76,201,164,0.12)` (que RN si replica bien en `:138`).
- **Fila "+N más"** (web `:119-121`): `<li class="px-3 py-2 text-[11px] font-semibold text-on-dark-muted">+ {more} ejercicios más</li>`. RN (`:106-110`): `FONT.uiSemibold fontSize:11 paddingHorizontal:12 paddingVertical:8 text-on-dark-muted` → `+ {more} ejercicios más`. Copy VERBATIM.

### 2.4 CTA
- **Web** (`:124-132`): `<div class="flex gap-2.5">` con un `<Link href={base}/workout/{planId} class={buttonVariants({variant:'sport',size:'lg'})} flex-1>` → `<Play h-5 w-5>` + label condicional.
- **RN** (`:116`): `<Button testID="home-hero-start" label={cta} variant="sport" size="lg" leftIcon={Play} full onPress={() => onStart(plan.id)} />`.
- **Label condicional (VERBATIM, identico ambos):** `isAlreadyLogged ? 'Ver registro' : liveLogged>0 ? 'Continuar' : 'Empezar entrenamiento'` (web `:130` / RN `:69`).
- Destino web: navega a `{base}/workout/{planId}`. RN: handler `onStart(planId)` del shell (idiomatico; navegacion no auditada aqui, es del shell home.tsx).

---

## 3. **P0-2 — Overlay "Entrenamiento completado" (SIN SCRIM) [FIX OBLIGATORIO]**

### Conducta WEB exacta que resuelve el P0 (fuente de verdad)
`WorkoutHeroCard.tsx:52-59`, render SOLO si `isAlreadyLogged`:
```
<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-card
     bg-[color-mix(in_srgb,var(--success-500)_22%,var(--surface-inverse))] backdrop-blur-sm">
  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-500)]
        text-white shadow-[0_0_24px_rgba(31,184,119,0.5)]">
    <Check className="h-7 w-7" />          {/* 28px, strokeWidth default 2 */}
  </span>
  <p className="font-display text-sm font-black text-on-dark">Entrenamiento completado</p>
</div>
```

**Semantica clave (por que NO se ve el contenido detras en web):**
- `bg-[color-mix(in_srgb,var(--success-500)_22%,var(--surface-inverse))]` → el fondo es **OPACO**. El `22%` es la cantidad de TINTE verde mezclado sobre `--surface-inverse` **opaco (sin alpha)**, NO la opacidad total. Resultado = superficie solida (oscura verdosa) que tapa el hero. Ademas `backdrop-blur-sm` desenfoca cualquier resto. `z-10` lo pone sobre todo el contenido. → Titulo, lista de bloques y CTA quedan CUBIERTOS; el alumno solo ve el check + "Entrenamiento completado".

**Valores de token para el mix opaco (scheme-aware):**
- `--success-500 = #1FB877 = rgb(31,184,119)` (`globals.css:376` / mobile `global.css:70`).
- `--surface-inverse` mobile: **light** `rgb(11,14,19)` = `#0B0E13` (`global.css:89`); **dark** `rgb(42,50,61)` = `#2A323D` (`global.css:196`).
- Mix `0.22*success + 0.78*surface-inverse`:
  - light → `rgb(15,51,41)` ≈ `#0F3329`
  - dark  → `rgb(40,79,74)` ≈ `#284F4A`

### Estado RN actual (BUG)
`HeroSection.tsx:118-126`, render SOLO si `isAlreadyLogged`:
```
<View style={{ position:'absolute', inset:0, borderRadius:22, alignItems:'center',
     justifyContent:'center', gap:8, backgroundColor:'rgba(31,184,119,0.22)' }}>
  <View style={{ width:48, height:48, borderRadius:24, ... backgroundColor:SUCCESS_500 }}>
    <Check size={26} color="#fff" strokeWidth={3} />
  </View>
  <Text className="text-on-dark" style={{ fontFamily:FONT.displayBlack, fontSize:14 }}>Entrenamiento completado</Text>
</View>
```
Defectos vs web (todos citados):
1. **`backgroundColor:'rgba(31,184,119,0.22)'` (`:120`) = TRANSLUCIDO al 22% de alpha** → el contenido del hero (titulo, bloques, CTA) se ve NITIDO detras. Es la lectura erronea del `22%`: en web el 22% es tinte sobre surface-inverse OPACO, no alpha. **← ESTE ES EL P0-2.**
2. Sin `backdrop-blur`: web difumina, RN no.
3. `borderRadius:22` hardcodeado (`:120`) ≠ `rounded-card`=20 (mobile `tailwind.config.js` card:'20px', `Card.tsx:64`). El overlay sobresale del recorte de la card (Ola0 P2 `element: radio del overlay`).
4. `inset:0` (`:120`) puede no resolver en RN viejo (New Arch/Fabric): usar `top/left/right/bottom:0` explicito.
5. Circulo `SUCCESS_500` **sin glow**; web `shadow-[0_0_24px_rgba(31,184,119,0.5)]`.
6. Check `size=26 strokeWidth=3` vs web `28 (h-7)` strokeWidth 2 (default).
7. Orden en arbol: RN renderiza el overlay DESPUES del Button (`:118` tras `:116`) sin z-index → en RN el paint order lo pone encima (funciona), pero la ausencia de fondo opaco es lo que rompe el scrim.

### Conducta objetivo RN (paridad P0-2)
- Fondo **OPACO scheme-aware** = mix `0.22*success-500 + 0.78*surface-inverse` (light `#0F3329`, dark `#284F4A`), derivado del token `surface-inverse` del theme (NO nuevo hex crudo: computar desde tokens existentes; regla 3). Alternativa idiomatica valida (regla 10): `expo-blur` `BlurView` (tint dark, intensity alta) + capa de tinte success 22% encima — preserva lo que el usuario ve (contenido tapado). Cualquiera de las dos DEBE dejar el hero ILEGIBLE detras.
- `borderRadius: 20` (o `className="rounded-card"`) para no sobresalir del recorte.
- Reemplazar `inset:0` por `top:0,left:0,right:0,bottom:0`.
- Circulo con glow (`shadows`/`theme` success glow; equivalente a `shadow-[0_0_24px_rgba(31,184,119,0.5)]`).
- `Check size={28} strokeWidth={2}` (paridad tamaño/trazo web).
- Texto "Entrenamiento completado" `FONT.displayBlack` `text-sm`(14) `text-on-dark` — copy VERBATIM (ya OK en `:125`).
- Mantener render condicionado a `isAlreadyLogged` (ambos lados). El overlay debe **bloquear/cubrir el CTA** (semantica compartida: sesion ya registrada).

---

## 4. Variante B — RestDayCard

Web `RestDayCard.tsx:19-47` / RN `HeroSection.tsx:153-184`.
- Contenedor: `<Card variant="sunken" padding="lg" className="items-center gap-0 text-center">` (web `:22`) ↔ RN `<Card variant="sunken" padding="lg" style={alignItems:'center'}>` (`:158`). RN envuelto en MotiView entrada (`:157`).
- **Icono luna (animado):** web `<motion.div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-aqua-100 text-aqua-700" animate={{y:[0,-8,0]}} transition={{duration:3,repeat:Infinity,ease:'easeInOut'}} aria-hidden><Moon h-7 w-7></motion.div>` (`:23-30`). RN (`:159-166`): MotiView float `translateY:[0,-8,0]` timing 3000 loop, **respeta reduced-motion** (`motion.reduced` → sin animacion), circulo 56 (h-14) borderRadius 28, `<Moon size=26 color={theme.cyan} strokeWidth=2.25>` con `backgroundColor: theme.cyan + '22'`.
  - **Divergencia (Ola0 P1 `element: RestDayCard — colores del circulo/icono de luna`):** web usa `bg-aqua-100` / `text-aqua-700` (scheme-aware: light `#E3F5FB`/`#0A6E8D`, dark `rgba(24,171,212,.18)`/`#6FD3EA`); RN usa `theme.cyan`(=aqua-500 `#18ABD4`, constante ambos esquemas) + alpha `'22'`. Icono queda mas claro en light y mas oscuro en dark. Fix: usar tokens `aqua-100`/`aqua-700` (mobile `global.css:60,65,177,187`, clases `bg-aqua-100`/`text-aqua-700`). Moon size 26 vs web 28 (h-7) — menor.
- **Titulo** (web `:31`): `font-display text-xl font-black tracking-[-0.02em] text-strong` → "Día de descanso". RN (`:167`): `textStyle('xl', displayBlack, lh snug ls tight) textAlign:center text-strong` → "Día de descanso". Copy VERBATIM.
- **Subtitulo** (web `:32-39` / RN `:168-177`): `mt-1.5 max-w-[280px] text-[13.5px] leading-relaxed text-muted`. RN `fontSize:13.5 lineHeight:20 marginTop:6 maxWidth:280 text-muted font-sans textAlign:center`.
  - Con proximo plan: `Próximo: <span class="font-semibold text-body">{nextWorkoutTitle}</span>{nextWorkoutDayLabel ? ` · ${nextWorkoutDayLabel}` : null}` (web `:33-36`). RN: `Próximo: <Text text-body font-sans-semibold>{nextPlan.title}</Text>{nextPlan.day_of_week ? ` · ${DAY_SHORT[nextPlan.day_of_week]}` : ''}` (`:169-173`). `DAY_SHORT` = `['','Lun','Mar','Mié','Jue','Vie','Sáb','Dom']` (`types.ts:112`). Copy VERBATIM.
  - Sin proximo: "Recupera bien para la próxima sesión." (web `:38` / RN `:175`). VERBATIM.
- **CTA "Ver nutrición de hoy"** (condicionado por `nutritionEnabled`/`showNutritionLink`): web `<Link href={base}/nutrition class={buttonVariants({variant:'secondary',size:'lg'})} mt-4>Ver nutrición de hoy <ArrowRight h-5 w-5></Link>` (`:40-45`). RN `<Button label="Ver nutrición de hoy" variant="secondary" size="lg" rightIcon={ArrowRight} onPress={onRest} style={marginTop:16}>` (`:178-180`). Copy VERBATIM. Destino web `{base}/nutrition`; RN handler `onRest` del shell.
  - `nutritionEnabled=false` → oculta el link/boton (master switch dominio Nutricion, web `HeroSection.tsx:16-17,48`; RN `:47,178`).

---

## 5. Variante C — NoPlanCard (RN-only; conservar)

`HeroSection.tsx:186-202`. **NO existe en web** (Ola0 P2, ver §1). Regla 2: no eliminar.
- `<Card padding="lg" style={alignItems:'center'}>` (default) en MotiView entrada.
- Circulo 60 (`:191`) `backgroundColor: theme.primary + '1A'`, `<Dumbbell size=28 color={theme.primary} strokeWidth=2.25>`.
- Titulo "Tu coach está armando tu plan" (`:194`), texto "{coachName ?? 'Tu coach'} está preparando tu programa. Te avisamos apenas esté listo." (`:195-197`).
- CTA "Hacer un check-in" `variant="sport" size="lg" rightIcon={ArrowRight} onPress={onNoPlan}` (`:198`).

---

## 6. QuickLogSheet (contexto — NO montado por el dispatcher)

`QuickLogSheet.tsx` existe en web pero **NO lo renderiza `HeroSection.tsx` ni sus hijas** (grep del dispatcher: sin import). Es un Sheet independiente (trigger "Rápido", `:53-55`) con logueo rapido de series via `logSetAction` (`:41`, server action). **Fuera del alcance visible de esta unidad**: el WorkoutHeroCard web (`:124-132`) solo monta el CTA principal, sin el chip "Rápido". No hay contraparte en `WorkoutHero` RN. Si se decide portar el QuickLog, es unidad separada; aqui NO se especifica su UI. (Endpoint/server-action → si se portara, aplicaria regla 8: fallback local fail-invisible.)

---

## 7. Estados / datos

- **isAlreadyLogged** (bool): activa overlay §3 y cambia CTA a "Ver registro". Web prop directa; RN prop directa (`:33,55`).
- **Sin bloques** (`show.length===0`): RN inserta spacer 16px (`:112-114`); web dejaria `<ul>` vacia (raro — el hero solo aparece con plan de hoy).
- **more>0**: fila "+N ejercicios más".
- **Carga/error:** ni web ni RN manejan loading/error DENTRO del hero — el shell (home.tsx) hace el fetch y decide que variante montar (`types.ts:5-10,64-81`). Datos hero: `blocks` (id,name,sets,reps `types.ts:13-18`), `todayLoggedByBlock: Map<blockId,seriesHoy>` (`types.ts:73-74`), `streak`, etc. Sin validaciones de formulario en el hero (el QuickLog, no montado, si tiene guard `currentSets>=maxSets` `:33`).
- **nutritionEnabled**: oculta CTA nutricion en RestDayCard.

## 8. Accesibilidad
- Web overlay: sin role especifico; icono decorativo. RN Check sin `accessibilityLabel` — el texto "Entrenamiento completado" da el contexto.
- Luna: web `aria-hidden` (`:28`); RN no marca accessible pero es decorativa.
- **InfoTooltip web** (`:64`) aporta ayuda `t('section.workoutHero')`: AUSENTE en RN (Ola0 P2). Portar como Pressable→popover si se aborda.
- CTA: web `<Link>` (rol link) / RN `<Button>` (accessibilityRole button via Button primitive).

## 9. Animaciones
- Web: unica animacion es float de luna (RestDay `:25-26`); hero workout estatico.
- RN: MotiView entrada (opacity+translateY 450/delay80) en las 3 variantes (`:72,157,189`) — motion DS mobile, no en web; float de luna con reduced-motion (mejora). whileTap del Button lo da el primitivo.

---

## Hallazgos Ola 0 (docs/rn-port/ola0-hallazgos.json, bloque hero `:5384-5457`)
Componentes: "HeroSection (dashboard alumno)", "WorkoutHeroCard".
1. **P1** — Contador/check de bloque full: RN hex `#4CC9A4` (`:144,147`) vs web `text-sport-500`/`text-on-dark-muted` (`WorkoutHeroCard.tsx:107-114`). Usar theme.primary/token.
2. **P1** — RestDay luna: RN `theme.cyan+'22'`/`theme.cyan` (`:163-165`) vs web `bg-aqua-100`/`text-aqua-700`. Usar tokens aqua-100/700.
3. **P2** — InfoTooltip "Hoy entrenas" ausente en RN.
4. **P2 (= P0-2 de esta unidad)** — Overlay completado sin blur/mezcla opaca/glow: RN `rgba(31,184,119,0.22)` translucido (`:120`) vs web `color-mix(...22%,surface-inverse) backdrop-blur-sm` + glow + Check 28/stroke 2. **Elevado a P0-2 aqui.**
5. **P2** — Radio overlay: RN 22 (`:120`) vs `rounded-card`=20.
6. **P2** — Radio lista bloques: RN 12 (`:102`) vs `rounded-control`=14.
7. **P2** — Elevacion card: RN shadow-md vs web shadow-lg (`:73` vs `:51`).
8. **P2** — Titulo: RN `numberOfLines=2` (`:79`) vs web `truncate` (1 linea).
9. **P2** — NoPlanCard variante extra RN (conservar).
10. **P2** — MotiView entrada RN no en web (conservar/documentar).
Notas Ola0 (`:5457`): paridad ya correcta en padding lg 20, eyebrow, subtitulo, ProgressRing 64/7, lista de bloques (min-h52 px12/py10 gap10 fill rgba(76,201,164,.12)/white.07), CTA sport lg con labels condicionales VERBATIM, RestDay sunken. Ring theme.primary↔var(--sport-500) equivalente white-label.

## Estado RN actual — divergencias mas obvias (citas RN)
- `HeroSection.tsx:120` overlay `backgroundColor:'rgba(31,184,119,0.22)'` translucido → **P0-2** (contenido visible detras).
- `HeroSection.tsx:120` `inset:0` (riesgo Fabric RN viejo) + `borderRadius:22` (≠20).
- `HeroSection.tsx:144,147` mint `#4CC9A4` hardcodeado (P1).
- `HeroSection.tsx:163-165` luna `theme.cyan+'22'` (P1, no tokens aqua).
- `HeroSection.tsx:79` titulo 2 lineas; `:102` lista radio 12; `:73` sin shadow-lg.
- `HeroSection.tsx:76-78` sin InfoTooltip.
- `HeroSection.tsx:118-125` overlay sin blur ni glow, Check 26/stroke3.

## cambiosShell (archivos fuera de esta unidad — NO tocar aqui)
- **`apps/mobile/components/Card.tsx`**: para igualar shadow-lg del hero (Ola0 #7) sin pasar `style` crudo, exponer prop `shadow?: 'sm'|'md'|'lg'|'glow'` o permitir override. Alternativa dentro de la unidad: `style={SHADOWS[theme.scheme].lg}` en `HeroSection.tsx:73` (no requiere tocar Card). Preferir la alternativa in-unit.
- **`apps/mobile/components/InfoTooltip.tsx`**: si se porta la ayuda contextual (Ola0 #3), reutilizar el primitivo existente (ya disponible). No modificarlo, solo consumirlo.
- Ninguna otra unidad requiere cambios para el P0-2 (el fix del overlay es 100% local a `HeroSection.tsx`, derivando el mix opaco del token `surface-inverse` ya presente en theme).
