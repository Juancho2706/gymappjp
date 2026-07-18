# SPEC §9a — Peso (widget + quick log + sparkline) · key: weight-widget

Fuente de verdad web: `apps/web/src/app/c/[coach_slug]/dashboard/_components/weight/*` + `WeightFullChartSection.tsx` (nivel `_components/`).
Contraparte RN: `apps/mobile/components/alumno/home/WeightWidget.tsx`, `WeightQuickLog.tsx`; primitivo compartido `apps/mobile/components/Sparkline.tsx` (usar, NO poseer).
Cada afirmacion cita `archivo:linea`. Rutas web abreviadas a partir de `.../dashboard/_components/`.

---

## 0. Alcance y wiring

- La unidad la componen: `WeightWidget.tsx` (shell RSC async), `WeightHeadline.tsx` (count-up), `TrendArrow.tsx`, `WeightSparkline.tsx`, `WeightQuickLog.tsx` (client, server action). `WeightProgressChart.tsx` + `WeightFullChartSection.tsx` son el chart grande de 30d (recharts AreaChart) — pertenecen a la sub-vista "peso completo", separada del widget; se documentan como §9a-chart (ver §7) porque comparten data query, pero NO se montan dentro del widget.
- `WeightWidget` importa `WeightQuickLog` (`weight/WeightWidget.tsx:4`) — ambos en esta unidad.
- Web es async RSC: hace `getCheckInHistory30Days(userId)` el mismo (`weight/WeightWidget.tsx:29`). RN recibe `checkIns: CheckInPoint[]` ya derivado del fetch unico del shell (`home.tsx:366-371`), mas `clientId`, `onSaved`, `onCheckIn`.
- RN monta el widget en `home.tsx:366-372` bajo `SectionTitle "Peso y records"` (`home.tsx:363`), con `gap:12` al `PersonalRecordsCard` hermano (`home.tsx:364,373`). `onSaved={() => load()}` recarga el home (`home.tsx:369`); `onCheckIn={() => router.push('/alumno/check-in')}` (`home.tsx:370`).
- No hay P0 QA asignado a esta unidad: el grep de discrepancias del bloque WeightWidget/WeightQuickLog en `docs/rn-port/ola0-hallazgos.json` arroja solo P1/P2 (ver §8). Los 36 `severity:"P0"` del archivo pertenecen a otras unidades.

---

## 1. WeightWidget — layout y jerarquia

### 1.1 Estado CON datos (`weight/WeightWidget.tsx:60-73`)
Contenedor: `<Card padding="md" className="gap-0">` (`:61`). `gap-0` anula el `gap-4` base de la Card (`components/ui/card.tsx:54`) → el widget controla el ritmo con `mt-*` explicitos.
Orden vertical de hijos:
1. Fila header: `<div className="flex items-center justify-between">` (`:62`) con un solo `<span>` etiqueta "Peso actual" — `text-[11px] font-bold uppercase tracking-[0.06em] text-muted` (`:63`).
2. Fila valor+tendencia: `<div className="mt-1 flex items-end justify-between gap-2">` (`:65`) → `<WeightHeadline value={current}/>` (`:66`) a la izquierda, `<TrendArrow trend deltaKg={delta}/>` (`:67`) a la derecha. Alineacion `items-end` (baseline inferior).
3. Fecha relativa: `<p className="mt-1 text-xs text-muted">{formatRelativeDate(lastDay, todayIso)}</p>` (`:69`).
4. Sparkline: `<WeightSparkline data={spark}/>` (`:70`).
5. Quick log: `<WeightQuickLog coachSlug={coachSlug}/>` (`:71`).

Datos derivados:
- `withW = rows.filter(r => r.weight != null)` (`:30`).
- `last = withW[withW.length-1]`; `current = last.weight` (`:49-50`).
- `lastDay = last.date.slice(0,10)` — etiqueta por dia de medicion (`date`), NO por instante UTC de insercion; comentario corrige off-by-one TZ (`:51-53`).
- `spark = withW.slice(-14).map(r => ({ iso: r.date.slice(0,10), weight: r.weight }))` — ultimos 14 (`:55-58`).

### 1.2 Estado VACIO / sin registros (`weight/WeightWidget.tsx:33-47`)
Guard: `if (withW.length === 0)` (`:33`).
Contenedor: `<Card padding="lg" className="text-center">` (`:35`) — NOTA: NO pone `gap-0`, hereda `gap-4`(16px) de la Card base (`components/ui/card.tsx:54`).
Hijos:
1. `<Scale className="mx-auto h-10 w-10 text-muted" />` (`:36`) — icono 40px, centrado, sin `strokeWidth` explicito (default lucide = 2).
2. `<p className="text-sm font-bold text-strong">Aún sin registros de peso</p>` (`:37`).
3. `<Link href="{base}/check-in" className="inline-flex min-h-11 items-center justify-center rounded-control px-3 text-xs font-bold text-sport-600">Check-in completo →</Link>` (`:38-43`). `base = getClientBasePath(coachSlug)` (`:28`).
4. `<WeightQuickLog coachSlug={coachSlug}/>` (`:44`).

---

## 2. WeightHeadline — count-up (`weight/WeightHeadline.tsx`)

- Client component `'use client'` (`:1`). Prop `{ value: number }` (`:10`).
- Animacion: patron identico a `ComplianceRing` (comentario `:7-9`): `useMotionValue(0)` + `useSpring(mv, { stiffness: 60, damping: 20 })` (`:13-14`), `mv.set(value)` en effect (`:21`), y `useMotionValueEvent(spring,'change', v => setAnimated(v))` (`:24-26`).
- Reduced-motion: `useReducedMotion()` (`:11`); si `reduce` → estado inicial `= value` (`:12`), effect hace `setAnimated(value); return` (`:17-19`), `display = reduce ? value : animated` (`:28`) — salto directo, sin animar.
- Render (`:30-35`): `<span className="font-display text-[28px] font-black leading-none tracking-[-0.03em] tabular-nums text-strong">` con `{display.toFixed(1)}` y sufijo `<span className="ml-1 text-[13px] font-semibold text-muted">kg</span>`.

Tipografia clave: display font, 28px, weight black(900), line-height none(1), letter-spacing -0.03em, tabular-nums, color `text-strong`. Sufijo "kg": 13px, semibold(600), `text-muted`, `ml-1`(4px).

---

## 3. TrendArrow — pill de tendencia (`weight/TrendArrow.tsx`)

- Client component (`:1`). Prop `{ trend: 'up'|'down'|'stable', deltaKg: number }` (`:6,8`).
- Icono: `up→ArrowUp`, `down→ArrowDown`, `stable→Minus` (`:17`), tamaño `h-3.5 w-3.5`(14px) (`:31`), strokeWidth default(2).
- Pill classes (`:18-24`, contenedor `:26`):
  - Base: `flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-[13px] font-bold`.
  - `up`: `bg-[var(--danger-100)] text-[var(--danger-700,var(--danger-600))]` (subir peso = ROJO).
  - `down`: `bg-[var(--success-100)] text-[var(--success-700)]` (bajar peso = VERDE).
  - `stable`: `text-muted` (sin bg).
- Texto delta (`:33-38`): solo si `trend !== 'stable'`: `<span className="tabular-nums">{deltaKg > 0 ? '+' : ''}{deltaKg.toFixed(1)} kg</span>`. GOTCHA: como `computeTrend` pasa `Math.abs(delta)` para 'down' (`WeightWidget.tsx:23`), `deltaKg` siempre es > 0 → el web renderiza "+" TAMBIEN en 'down' (ej "+1.2 kg" con flecha abajo). Ola0 marca esto como probable bug web (ver §8).
- Animacion rebote (`:9-15,27-32`): `motion.span` con `animate` = `up:{y:[0,-4,0]}` / `down:{y:[0,4,0]}` / `stable:{y:0}`; `transition={{ duration:1.5, repeat:Infinity, delay:0.5 }}`. Gateado por `useReducedMotion()` (`:9`): si `reduced` → `animate=undefined, transition=undefined` (`:28-29`).

---

## 4. WeightSparkline — sparkline 14d (web, referencia) (`weight/WeightSparkline.tsx`)

El widget web usa ESTE componente recharts, NO el primitivo `Sparkline.tsx`. RN usa el primitivo compartido `components/Sparkline.tsx` (SVG propio) — ver §6 para el mapeo y las divergencias.
- Prop `{ data: Point[] }`, `Point = { iso, weight }` (`:7-12`).
- Guard: `if (chartData.length === 0) return null` (`:27`).
- Contenedor: `<div className="mt-3 h-[72px] w-full min-w-px">` (`:48`) — margen sup 12px, alto 72px.
- Chart: `<AreaChart width={chartWidth} height={72} margin={{top:4,right:0,left:0,bottom:0}}>` (`:50`), medido con ResizeObserver (`:18-25`).
- Gradiente `wGradDash`: `stopColor="var(--sport-500)"`, stopOpacity `0.25 → 0` (`:52-55`).
- Area: `type="monotone" dataKey="w" stroke="var(--sport-500)" strokeWidth={2} fill="url(#wGradDash)" dot={renderLastDot} isAnimationActive={!reduce}` (`:57`).
- Punto final (`:29-45`): `renderLastDot` dibuja `<circle r={4} fill="var(--sport-500)" stroke="var(--surface-card)" strokeWidth={2.5}>` SOLO en el ultimo indice (`index === lastIndex`); comentario cita kit `alumno-dashboard.jsx:447` (`:29`).
- Reduced-motion: `isAnimationActive={!reduce}` (`:13,57`).

---

## 5. WeightQuickLog — registro rapido (`weight/WeightQuickLog.tsx` + action)

### 5.1 Estructura (`weight/WeightQuickLog.tsx`)
- Client component (`:1`); prop `{ coachSlug }` (`:8`).
- Estado: `useActionState(quickLogWeightAction, initial)` → `[state, formAction, pending]` (`:9`); `initial = {}` (`:6`).
- `<form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-subtle pt-3">` (`:20`) — separador superior sutil `border-t border-subtle`, `pt-3`(12), `mt-3`(12).
- Hidden: `<input type="hidden" name="coach_slug" value={coachSlug}/>` (`:21`).
- Label + input (`:22-36`): `<label className="flex min-w-0 flex-1 flex-col gap-1">` con `<span className="text-[10px] font-semibold text-muted">Peso rápido (kg)</span>` (`:23`) e `<input ref name="weight" type="number" step="0.1" min={20} max={400} required placeholder="72.5" disabled={pending}>` (`:24-35`).
  - Input classes: `h-11 min-h-[44px] rounded-control border-[1.5px] border-subtle bg-surface-sunken px-3 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus-visible:border-sport-500` (`:32`).
- Boton submit (`:37-43`): `<button type="submit" disabled={pending} className="h-11 min-h-[44px] min-w-[44px] rounded-control bg-[var(--cta-fill)] px-4 text-xs font-bold text-on-sport transition-[transform,background-color] active:scale-[0.97] disabled:opacity-50">{pending ? '…' : 'Guardar'}</button>`.
- Mensajes (`:44-45`): error → `<p className="w-full text-xs font-semibold text-[var(--danger-600)]">{state.error}</p>`; exito → `<p className="w-full text-xs font-semibold text-[var(--success-700)]">Registrado.</p>`.
- Reset input tras exito: `useEffect` con ref (NO getElementById — el widget se monta 2x arbol movil+desktop; id colisionaria) → `if (state.success) inputRef.current.value = ''` (`:10-17`).

### 5.2 Server action `quickLogWeightAction` (`_actions/dashboard.actions.ts:12-44`)
- Valida con `QuickWeightSchema.safeParse({ weight, coach_slug })` (`:13-16`). Schema (`packages/schemas/client.ts:51-54`): `weight: z.coerce.number().min(20).max(400)`, `coach_slug: z.string().min(1)`.
- Falla validacion → `{ error: issues[0]?.message ?? 'Dato inválido' }` (`:17-19`).
- Auth: `supabase.auth.getUser()`; sin user → `{ error: 'No autenticado.' }` (`:22-25`). `client_id` sale de la sesion, nunca del cliente.
- Insert `check_ins` (`:28-34`): `{ client_id: user.id, weight, energy_level: null, notes: null, date: todayIso }`; `todayIso = getTodayInSantiago().iso` (`:27`).
- Insert error → `{ error: insertError.message }` (mensaje CRUDO de Supabase) (`:36-38`).
- Exito → `revalidatePath` dashboard + check-in + `/c` layout (`:40-42`), `return { success: true }` (`:43`).

### 5.3 Validaciones (resumen)
- Rango peso: 20–400 kg (schema `:52`; input `min={20} max={400}` `:29-30`).
- `step="0.1"`, `type="number"` (`:27-28`).
- `required` (`:31`).

---

## 6. Mapeo RN del primitivo Sparkline (`apps/mobile/components/Sparkline.tsx`) — USAR, NO POSEER

Contrato actual del primitivo: `{ values: number[], width?, height?, color?, filled? }` (`:5-12`). Render SVG con `react-native-svg`: `<Defs><LinearGradient/></Defs>` + `<Path area>` + `<Path line>` (`:49-60`).
- Guard `< 2` valores → `<View style={{width,height}}/>` (reserva hueco) (`:24-26`).
- Formula Y: `height - ((v-min)/range)*(height-2) - 1` (inset 1px) (`:35`).
- Line: `strokeWidth={1.75}` (`:58`); gradiente `stopOpacity 0.35 → 0` (`:53-54`); id unico por color `spark-${stroke...}` (`:47`).
- NO tiene punto final (endDot) ni animacion de dibujo.

Este primitivo es compartido (coach ClientCard, PRDetailSheet, WeightWidget). Regla de la unidad: NO editar el archivo del primitivo desde esta unidad; los ajustes visuales (endDot, height, strokeWidth, gradiente) se reportan en `cambiosShell`. Ver §8 discrepancias P1/P2 del sparkline.

---

## 7. §9a-chart — WeightProgressChart / WeightFullChartSection (contexto, fuera del widget)

Se documenta porque comparte la data query, pero es la vista "peso completo" (chart 30d), no el widget. RN no tiene contraparte montada en el home.
- `WeightFullChartSection` (`_components/WeightFullChartSection.tsx:4-15`): RSC async, `getCheckInHistory30Days(userId)` (`:5`), filtra `weight != null`, mapea `date → "{YYYY-MM-DD}T12:00:00"` (ancla mediodia local, corrige off-by-one; comentario `:8-10`), `.reverse()` (`:11-12`), renderiza `<WeightProgressChart data coachSlug/>` (`:14`).
- `WeightProgressChart` (`weight/WeightProgressChart.tsx`): AreaChart recharts, color `var(--sport-500)` (`:12`).
  - Estado no-montado: skeleton `h-64 animate-pulse bg-surface-sunken/40` (`:44-56`).
  - Estado vacio: titulo "Progreso de Peso" + `CardDescription "Aún no hay datos suficientes"` + `Scale` + texto "Realiza tu primer check-in para medir tu progreso." + CTA `<Link ... "Registrar Peso Hoy">` con `Plus` icon, `style={{backgroundColor:'var(--cta-fill)'}}`, `text-on-sport` (`:58-86`).
  - Con datos: titulo "Evolución de Peso" con `TrendingUp text-sport-500` (`:99-103`); gradiente `colorWeight` 0.3→0 (`:114-118`); `CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity 0.5` (`:120`); X `displayDate` es-ES `day numeric, month short` (`:90,121-127`); Y domain `[min - pad, max + pad]`, `pad = (max-min)*0.2 || 5` (`:93-95,128-134`), tickFormatter `${val.toFixed(1)}kg`; Tooltip con tokens `var(--card)/--border/--foreground/--muted-foreground` (`:135-144`); Area `type="monotone" strokeWidth={3} isAnimationActive={!reduce}` (`:145-153`).

---

## 8. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

Inventario (`:10534-10549`): `WeightWidget` (prioridad ALTA, `:10535-10541`), `WeightQuickLog` (prioridad MEDIA, `:10543-10549`), `Sparkline (dashboard coach)` (prioridad MEDIA, `:10703-10708`, mismo primitivo RN). No hay P0 en el bloque de esta unidad.

### Discrepancias WeightWidget / TrendArrow / Sparkline (bloque `:5460-5510`)
- **P1 TrendArrow colores del pill** (`:5461-5467`): web up=`danger-100/danger-700`, down=`success-100/success-700`, scheme-aware; RN usa `DANGER_600`+`SUCCESS_500` fijos con `bg = color+'1F'` (`WeightWidget.tsx:94-95`), tier equivocado y NO dark-aware. Fix: clases `bg-danger-100 text-danger-700` / `bg-success-100 text-success-700` (tokens en `global.css`).
- **P1 Sparkline altura** (`:5469-5474`): web 72px (`WeightSparkline.tsx:48,50`); RN `height={56}` (`WeightWidget.tsx:84`), 22% mas bajo. Fix: `height={72}` (mt-3=12 ya coincide en `:83`).
- **P1 Sparkline punto final** (`:5476-5481`): web dibuja circle r=4 fill sport-500 stroke surface-card sw 2.5; RN ausente. Fix: prop `endDot` en Sparkline + activar en WeightWidget.
- **P2 Sparkline trazo/curva/gradiente/anim** (`:5483-5488`): RN sw 1.75 (web 2), polilinea recta (web monotone suavizada), gradiente 0.35 (web 0.25), sin anim de dibujo.
- **P2 TrendArrow rebote + strokeWidth** (`:5490-5495`): web bounce infinito gateado por reduce-motion + icon sw default 2; RN icono estatico sw 2.5 (`WeightWidget.tsx:98`).
- **P2 TrendArrow signo '+' en down** (`:5497-5502`): web muestra "+1.2 kg" con flecha abajo (`TrendArrow.tsx:35`); RN muestra "1.2 kg" sin '+' (`WeightWidget.tsx:101`). Divergencia real; ola0 sugiere el '+' web es bug — decidir fuente de verdad y documentar.
- **P2 Estado vacio ritmo vertical** (`:5504-5508`): web Card base `gap-4`(16) no anulado en vacio (`WeightWidget.tsx:35`); RN sin gap, solo `marginTop:8` en el texto (`WeightWidget.tsx:53`) → mas compacto. Ademas Scale RN sw 1.75 (`:52`) vs default 2 web. Fix: `gap:16` en la Card vacia + quitar sw 1.75 del Scale.

### Discrepancias WeightQuickLog (bloque `:5514-5556`)
- **P1 color exito "Registrado."** (`:5516-5521`): web `text-[var(--success-700)]` (dark-aware); RN `color: SUCCESS_500` fijo (`WeightQuickLog.tsx:72`), tier 500 y no dark-aware. Fix: clase `text-success-700`.
- **P1 color error** (`:5523-5528`): web `text-[var(--danger-600)]` dark-aware; RN `color: DANGER_600` fijo (`WeightQuickLog.tsx:71`), coincide en claro pero en oscuro queda carmesi oscuro. Fix: clase `text-danger-600`.
- **P2 focus del input** (`:5530-5535`): web `focus-visible:border-sport-500` (`WeightQuickLog.tsx:32`); RN borderColor estatico `theme.border`, sin onFocus/onBlur. GOTCHA Fabric #45798: NO estilo condicional por focus en el wrapper del TextInput — si se agrega ring, hacerlo por opacity con arbol estable.
- **P2 feedback press boton** (`:5537-5542`): web `active:scale-[0.97]` sin opacidad; RN `activeOpacity={0.85}` (fade) sin scale. Fix: Pressable con `scale: pressed ? 0.97 : 1`.
- **P2 min-w boton** (`:5544-5549`): web `min-w-[44px]` (`WeightQuickLog.tsx:40`); RN sin minWidth (`:67`) — con label '…' puede caer bajo 44px. Fix: `minWidth:44`.
- **P2 copy error servidor** (`:5551-5556`): web muestra `insertError.message` crudo; RN muestra generico "No se pudo guardar. Intenta de nuevo." (`WeightQuickLog.tsx:37`). Divergencia de copy; el generico RN es mejor UX — decidir canonico y documentar.

---

## 9. Estado RN actual — divergencias ya visibles (citas RN)

RN esta funcionalmente completo (con datos + vacio + quick log + trend + sparkline). Divergencias observadas (ademas de las Ola0):
- **Trend color semantica invertida vs texto**: RN `color = up? DANGER_600 : down? SUCCESS_500` (`WeightWidget.tsx:94`) preserva la semantica web (subir=rojo, bajar=verde). OK conceptual, pero tiers/dark rotos (P1 arriba).
- **Sparkline: RN NO usa el equivalente de `WeightSparkline` (recharts monotone + endDot)**; usa el primitivo `Sparkline` con line recta, `height={56}`, `color={theme.primary}`, `width={width-64}` (`WeightWidget.tsx:84`). `theme.primary` ≡ `var(--sport-500)` bajo white-label (ola0 `:5909`).
- **AnimatedNumber vs WeightHeadline**: RN usa `<AnimatedNumber value format={n=>n.toFixed(1)}>` (`WeightWidget.tsx:73-77`) con `fontSize:28, lineHeight:30, letterSpacing:-1, fontVariant tabular-nums, FONT.displayBlack` + `<Text>kg</Text>` fontSize 13 semibold `text-muted` marginLeft 4 (`:78`). Paridad razonable con web (28px, black, tracking -0.03em≈-0.84px vs RN -1; count-up con spring). Adaptacion idiomatica valida — preserva lo que el usuario ve.
- **Estado vacio RN** (`WeightWidget.tsx:49-61`): Scale 40 `strokeWidth={1.75}` (web sin sw), texto marginTop 8, CTA `TouchableOpacity onPress={onCheckIn}` (web es `<Link href="{base}/check-in">`) → adaptacion idiomatica valida (navegacion via handler del shell). Falta `gap:16` (P2). Copy "Check-in completo →" verbatim (`:55`).
- **WeightQuickLog RN insert DIRECTO a Supabase** (`WeightQuickLog.tsx:30-34`) en vez de server action: `supabase.from('check_ins').insert({ client_id: clientId, date: getTodayInSantiago().iso, weight: w })`. NOTA: RN NO setea `energy_level:null, notes:null` explicitos (web `:31-32`), no requiere `coach_slug`, no hace revalidatePath (usa `onSaved()` `:42`). Adaptacion valida (RN no tiene RSC cache). Validacion 20–400 replicada (`:25`), parse `replace(',', '.')` (`:24`), sanitiza input `replace(/[^0-9.,]/g,'')` (`:52`), `keyboardType="decimal-pad"` (`:54`). Copy verbatim: "Peso rápido (kg)" (`:48`), "Guardar"/"…" (`:69`), "Registrado." (`:72`), placeholder "72.5" (`:54`). Error generico "No se pudo guardar. Intenta de nuevo." (`:37`) — diverge del crudo web (P2).
- **testIDs presentes** en RN (`weight-quick-log-input` `:50`, `weight-quick-log-save` `:62`) — NO eliminar (regla 2).

---

## 10. Cambios de shell / archivos compartidos requeridos (cambiosShell)

Reportar (NO tocar desde esta unidad):
- `apps/mobile/components/Sparkline.tsx` (primitivo compartido): agregar prop opcional `endDot` (Circle r=4 fill=stroke, stroke=`theme.card`/surface-card, strokeWidth 2.5), permitir `strokeWidth` param (2 en vez de 1.75), gradiente stopOpacity 0.25 (o param), y opcionalmente suavizado monotone. Consumido tambien por coach ClientCard + PRDetailSheet → cambios detras de props opcionales para no romper call sites.
- Tokens dark-aware: confirmar que `text-danger-600/700`, `text-success-700`, `bg-danger-100`, `bg-success-100` existen en `apps/mobile/global.css` (ola0 cita `:76-79,166,170-183`) para reemplazar constantes `DANGER_600/SUCCESS_500` de `types.ts:105,108` en TrendArrow y WeightQuickLog. NO editar `global.css` (regla 4) — solo consumir via clases NativeWind.

---

## 11. Accesibilidad / touch targets
- Inputs/botones a ≥44px: web `h-11 min-h-[44px]` input, `min-h-[44px] min-w-[44px]` boton (`WeightQuickLog.tsx:32,40`); CTA vacio `min-h-11` (`WeightWidget.tsx:40`). RN replica height 44 (`WeightQuickLog.tsx:58,67`), CTA vacio `minHeight:44` (`WeightWidget.tsx:54`) pero falta `minWidth:44` en el boton (P2).
- Reduced-motion: web lo respeta en Headline (`WeightHeadline.tsx:11`), TrendArrow (`TrendArrow.tsx:9`), Sparkline (`WeightSparkline.tsx:13`). RN: AnimatedNumber (verificar respeto reduce-motion en su impl), Sparkline sin anim (trivialmente OK).
