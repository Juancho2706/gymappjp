# Spec §9b — Records personales (banner + detalle)

**Key:** `personal-records`
**Unidad:** Dashboard alumno · card oscura de records personales + sheet de detalle/progresión.

**Fuente de verdad (web):**
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/records/PersonalRecordsCard.tsx` (RSC contenedor)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/records/PersonalRecordsList.tsx` (grilla cliente)
- `apps/web/src/app/c/[coach_slug]/dashboard/_components/records/PRDetailSheet.tsx` (sheet detalle)
- Data-layer: `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:281-466`
- Sparkline reusado: `apps/web/src/app/c/[coach_slug]/dashboard/_components/weight/WeightSparkline.tsx`

**Contraparte RN:**
- `apps/mobile/components/alumno/home/PersonalRecordsCard.tsx`
- `apps/mobile/components/alumno/home/PRDetailSheet.tsx`
- Data-layer RN: `apps/mobile/lib/history.queries.ts:95-228`
- Sparkline RN: `apps/mobile/components/Sparkline.tsx`
- Wiring: `apps/mobile/app/alumno/(tabs)/home.tsx:373-378`

---

## A. Contenedor / datos — PersonalRecordsCard

### A.1 Layout y jerarquía (web `PersonalRecordsCard.tsx`)
- Es un **RSC** (`export async function`, línea 15). Resuelve `getPersonalRecords(userId)` (línea 16) y el base path `getClientBasePath(coachSlug)` (línea 19).
- **Null-guard:** si `prs.length === 0` retorna `null` (línea 17) → la card no se monta.
- Envoltura: `<Card variant="inverse" padding="md">` (línea 22) — card OSCURA (inverse).
- Header: `<div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-sport-400">` con `<Trophy className="h-[13px] w-[13px]" />` seguido de literal `Records personales` (líneas 23-25).
  - Trophy hereda `currentColor` = `sport-400` (no se pasa prop `color`); `lucide-react` usa `strokeWidth` default **2** (no se pasa).
  - `--sport-400: #5C9DFF` (`apps/web/src/app/globals.css:351`).
- Debajo, `<PersonalRecordsList prs={prs} base={base} />` (línea 26).

### A.2 Query `getPersonalRecords` (dashboard.queries.ts:290-366)
- Type `PersonalRecordItem` (líneas 281-288): `{ exerciseId, exerciseName, weightKg, achievedAt, fresh }`. `fresh` = PR logrado en últimas **24 h** (JSDoc línea 286: "en las últimas 24 h").
- Dos queries en paralelo (líneas 296-311):
  - **recentLogs:** `workout_logs` select `weight_kg, block_id, logged_at`, `eq client_id`, `weight_kg not null`, `gte logged_at fourteenAgo` (14 días atrás, línea 294 `subDays(...,14)`), `order logged_at desc`, **limit 120**.
  - **histLogs:** `workout_logs` select `weight_kg, block_id`, `eq client_id`, `weight_kg not null`, **limit 3000** (sin filtro de fecha = máximo histórico).
- Si `recent.length === 0` → `return []` (línea 315).
- Resuelve `block_id → exercise_id` vía `workout_blocks` (líneas 320-328) y `exercise_id → name` vía `exercises` (líneas 331-333). Fallback nombre: `exName.get(exId) ?? 'Ejercicio'` (línea 356) — **nunca muestra id crudo.**
- `maxByExercise`: máximo peso histórico por ejercicio sobre `allW` (líneas 335-341).
- Para cada log reciente: un PR entra si `row.weight_kg >= histMax` y el ejercicio no fue visto (dedup por `exId`, líneas 347-361). `fresh = now - logged_at < dayMs` (`dayMs = 24*60*60*1000`, líneas 346, 359).
- Orden final: `prs.sort((a,b) => b.weightKg - a.weightKg)` (desc por peso) `.slice(0, 5)` (líneas 363-364). **La query devuelve hasta 5; la grilla renderiza solo 4 (ver B.2).**

---

## B. Grilla interactiva — PersonalRecordsList (web, cliente)

### B.1 Estado y handlers (líneas 31-49)
- `'use client'`. Estados: `open` (bool), `selected` (PersonalRecordItem|null), `detail` (ExercisePRDetail|null), `loading` (`useTransition`).
- `openPr(pr)` (líneas 37-45): setea `selected`, limpia `detail`, `open=true`, y en `startLoad` (transición) llama `getExercisePRHistoryAction(pr.exerciseId)` → setea `detail`. **La web pre-carga el detalle vía server action con estado `loading` de `useTransition`.**
- `exercisesHref` (líneas 47-49): si hay `selected` → `${base}/exercises?q=${encodeURIComponent(selected.exerciseName)}`; si no → `${base}/exercises`. Deep-link al catálogo con el ejercicio pre-buscado.

### B.2 Grilla (líneas 53-74)
- Contenedor: `grid grid-cols-2 gap-2.5` (2 columnas, gap 10px).
- `prs.slice(0, 4)` — renderiza máximo **4** tiles (línea 54).
- Cada tile es `<button type="button">` con `key={`${pr.exerciseId}-${pr.achievedAt}`}` (línea 56), `onClick={() => openPr(pr)}` (línea 58).
- Clases tile (línea 59): `relative flex flex-col gap-1 rounded-control bg-white/[0.05] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.09] active:scale-[0.98]`.
  - `rounded-control` = **14px** (`globals.css:131`), gap-1 = **4px** entre líneas.
- **Badge NUEVO** (líneas 61-65): solo si `pr.fresh`. `<span className="absolute right-2 top-2 rounded-pill bg-[var(--cta-fill)] px-1.5 py-px text-[8px] font-extrabold tracking-[0.03em] text-white">NUEVO</span>`. Fuente UI/sans peso 800 (NO display).
- **Peso** (líneas 66-69): `<span className="font-display text-[19px] font-black tabular-nums text-sport-500">{pr.weightKg}<span className="text-[10px] font-semibold text-on-dark-muted"> kg</span></span>`.
- **Nombre** (línea 70): `<span className="text-[11px] font-semibold leading-tight text-on-dark-muted">{pr.exerciseName}</span>` — **sin truncado**, envuelve a varias líneas con `leading-tight`.
- **Fecha** (línea 71): `<span className="text-[10px] tabular-nums text-on-dark-muted/70">{fmtShort(pr.achievedAt)}</span>`.
- `fmtShort` (líneas 11-18): pasa iso por `getSantiagoIsoYmdForUtcInstant`, luego `new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })` → "12 jun".

### B.3 Sheet (líneas 76-83)
- `<PRDetailSheet open onOpenChange={setOpen} pr={selected} detail={detail} loading={loading} exercisesHref={exercisesHref} />`.

---

## C. Sheet de detalle — PRDetailSheet (web)

### C.1 Datos derivados (líneas 60-92)
- `name = detail?.exerciseName ?? pr?.exerciseName ?? 'Ejercicio'` (línea 61).
- `currentWeight = detail?.currentPr.weightKg ?? pr?.weightKg ?? null` (línea 62) — fallback instantáneo del tile mientras carga.
- `currentAt`, `exerciseId` mismo patrón (líneas 63-64).
- `sparkData = (detail?.history ?? []).map(p => ({ iso: p.date, weight: p.topWeightKg }))` (línea 67).
- `milestones = [...(detail?.milestones ?? [])].reverse()` — el más reciente arriba (línea 69).
- `latest1RM = detail?.history.length ? history[last].estimated1RM : null` (línea 70).
- **Share-card (P0, ver H):** `topMilestone` = último milestone (línea 76); `prevWeightKg` = `topMilestone.prevKg` si su `weightKg === currentWeight`, si no 0 (línea 77); `pct` = salto % redondeado a 1 decimal (líneas 78-81); `best1RM` = máximo 1RM del history (línea 82); `prCard` (WorkoutPRCardData) construido si `currentWeight != null` (líneas 83-92): `{ exerciseName, newWeightKg, prevWeightKg, pct, estimated1RM: best1RM>0 ? best1RM : latest1RM ?? currentWeight }`.

### C.2 Chrome del Sheet (líneas 122-134)
- `<Sheet open onOpenChange>` → `<SheetContent side="bottom" className="max-h-[88dvh] sm:max-w-md ..." data-side="bottom">`.
- `<SheetHeader><SheetTitle className="flex items-center gap-2"><Trophy className="h-[18px] w-[18px] shrink-0 text-sport-500" />{name}</SheetTitle></SheetHeader>` — **título con icono Trophy sport-500 18px + nombre.**

### C.3 Body (línea 136): `flex flex-col gap-5 overflow-y-auto p-5 pt-4` (gap **20px**, padding 20, pt 16).

**Bloque "Record actual" (líneas 137-157):**
- Card: `rounded-card border border-border bg-muted/25 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]`.
- Label: `text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground` → "Record actual".
- Número: `font-display text-[34px] font-black leading-none tabular-nums text-sport-500` → `{currentWeight ?? '—'}` + `<span className="text-sm font-semibold text-muted-foreground">kg</span>` (baseline gap-1.5).
- Fecha (si `currentAt`): `mt-1.5 text-xs text-muted-foreground` → "Logrado el {fmtLong(currentAt)}".
- 1RM (si `latest1RM != null && > 0`, líneas 151-156): línea `text-[11px] text-muted-foreground` → "1RM estimado: " + `<span className="font-semibold text-foreground tabular-nums">{latest1RM} kg</span>` (el valor con **énfasis foreground + semibold + tabular**).
- `fmtLong` (líneas 39-47): `day:'numeric', month:'long', year:'numeric'` es-CL Santiago → "12 de junio de 2026".

**Bloque "Progresión" (líneas 159-167):** solo si `sparkData.length >= 2`.
- Label: `mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground` con `<TrendingUp className="h-3 w-3" />` + "Progresión".
- `<WeightSparkline data={sparkData} />`.

**Bloque "Hitos" (líneas 169-206):**
- **Carga:** si `loading && milestones.length === 0` (líneas 170-174): dos skeletons `h-11 animate-pulse rounded-control bg-muted/40 dark:bg-white/[0.04]` separados por `space-y-2` (8px). `h-11` = **44px**, `rounded-control` = 14px.
- **Datos:** si `milestones.length > 0` (líneas 175-206):
  - Label: `mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground` → "Cada vez que subiste la marca".
  - `<ul className="flex flex-col gap-1.5">`; cada `<li key={`${m.date}-${m.weightKg}`}>` con `flex items-center justify-between gap-3 rounded-control border border-border bg-muted/20 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]`.
  - Contenido izquierdo (span `font-semibold tabular-nums text-foreground`):
    - Si `m.prevKg > 0`: `{m.prevKg} <span className="text-muted-foreground">→</span> {m.weightKg} kg <span className="ml-1.5 text-xs font-bold text-sport-500">+{m.deltaKg}</span>` (flecha muted, delta sport-500 bold).
    - Si `m.prevKg === 0`: `{m.weightKg} kg <span className="ml-1 text-xs font-medium text-muted-foreground">primer registro</span>` (**sin '·'**).
  - Fecha derecha: `<span className="shrink-0 text-xs text-muted-foreground">{fmtShort(m.date)}</span>`.
  - `fmtShort` del sheet (líneas 29-36): re-convierte `m.date` (que YA es ymd Santiago) por `getSantiagoIsoYmdForUtcInstant` antes de formatear → **doble conversión, ver P1 en H**.

**Botón "Compartir mi récord" (P0, líneas 208-219):** solo si `prCard && exerciseId`.
- `<button type="button" onClick={handleShareRecord} disabled={sharing} className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-sport-500 px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">`.
- Icono: `sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />` + literal "Compartir mi récord".
- `handleShareRecord` (líneas 94-120): guard `sharing || !prCard`; `setSharing(true)`; `renderWorkoutPRCardToBlob(prCard, readShareCardBrand())`; si `!blob` → `toast.error('No pudimos generar la imagen. Intenta de nuevo.')`; construye `File` `record-${slugify(name)}.png`; si `canShareFiles([file])` → `share({ files, title: 'Récord personal', text: `Nuevo récord personal en ${name}` })`; si no → descarga vía `<a download>` + `toast.success('Imagen guardada')`; `finally setSharing(false)`.

**CTA "Ver técnica" (líneas 221-227):**
- `<Link href={exercisesHref} className="flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-border bg-muted/40 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]">` → "Ver técnica" + `<ArrowUpRight className="h-4 w-4" />`.

### C.4 Query `getExercisePRHistory` (dashboard.queries.ts:388-466)
- Types (líneas 369-378): `PRHistoryPoint {date, topWeightKg, estimated1RM}`, `PRMilestone {date, weightKg, prevKg, deltaKg}`, `ExercisePRDetail {exerciseId, exerciseName, currentPr:{weightKg,achievedAt}, history[], milestones[]}`.
- Query (líneas 393-403): `workout_logs` select `weight_kg, reps_done, logged_at`, `eq client_id`, `eq exercise_id`, `weight_kg not null`, `order logged_at asc`, **limit 2000**; en paralelo `exercises` name (`maybeSingle`).
- Si `rows.length === 0` → `null` (línea 406).
- Agrupa por **día calendario Santiago** (`getSantiagoIsoYmdForUtcInstant`): `topWeightKg` = peso máx del día, `best1RM` = mejor Epley del día, `topAt` = instante del set tope (líneas 408-426). `reps = max(1, reps_done ?? 1)`, Epley `weight*(1+reps/30)` (reps>1).
- `history` ordenado asc por fecha, `estimated1RM` redondeado a 1 decimal (líneas 428-434).
- `milestones` = cada día que superó el `runningMax` acumulado; `prevKg`=máx previo (0 en primer registro), `deltaKg` redondeado a 1 decimal (líneas 438-450).
- `currentPr` = mayor `topWeightKg` de toda la historia con su `topAt` exacto (líneas 452-460).

---

## D. Colores claro/oscuro (web)
- Card contenedor `variant="inverse"` (siempre oscura, independiente del scheme).
- Tokens del sheet **flipean por scheme** vía `dark:` variants: card PR `bg-muted/25 dark:bg-white/[0.03]`; filas hito `bg-muted/20 dark:bg-white/[0.03]`; CTA `bg-muted/40 dark:bg-white/[0.05]` hover `dark:hover:bg-white/[0.1]`; bordes `border-border dark:border-white/10`; skeletons `bg-muted/40 dark:bg-white/[0.04]`.
- `text-sport-500`, `text-muted-foreground`, `text-foreground`, `text-on-dark-muted` resuelven por CSS var del theme.

---

## E. Accesibilidad / interacción (web)
- Tiles son `<button type="button">` reales (foco/teclado). CTA técnica es `<Link>` (navegación real). Botón share es `<button>` con `disabled` durante `sharing`.
- Sheet DS (Radix): backdrop, cierre por overlay/Esc, foco atrapado (heredado de `@/components/ui/sheet`).
- Sin `aria-label` explícitos añadidos (el texto visible es la etiqueta).

---

## F. WeightSparkline (web, reusado en el sheet)
- `WeightSparkline.tsx`: recibe `data: {iso, weight}[]`. Recharts `AreaChart` responsive (ResizeObserver).
- Contenedor `mt-3 h-[72px] w-full` (línea 48).
- Línea: `<Area type="monotone" dataKey="w" stroke="var(--sport-500)" strokeWidth={2} fill="url(#wGradDash)" ... isAnimationActive={!reduce}>` (línea 57); gradiente `stopOpacity 0.25 → 0` (líneas 53-54).
- **Punto final marcado** (líneas 31-45): en el último índice `<circle r={4} fill="var(--sport-500)" stroke="var(--surface-card)" strokeWidth={2.5} />`.
- `useReducedMotion` desactiva animación (línea 13, 57).

---

## G. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

### G.1 PersonalRecordsCard / List (bloque líneas 5752-5818)
| Sev | Elemento | Web | RN actual | Fix |
|---|---|---|---|---|
| **P1** | Badge NUEVO — ventana de frescura | `fresh` = últimas **24h** (queries.ts:286,346,359) | `FRESH_MS = 14*86400000` (PersonalRecordsCard.tsx:13,46) → dura 14 días | Cambiar a `24*3600000` o calcular `fresh` en `history.queries.ts` espejando el data-layer web |
| **P1** | Icono Trophy header — color/stroke | hereda `text-sport-400` `#5C9DFF`, strokeWidth default 2 | `color="#7FB2FF" strokeWidth={2.4}` (línea 41) — color equivocado + stroke grueso | Usar token sport-400 `#5C9DFF` (vía useTheme como el Text adyacente) y quitar strokeWidth |
| **P2** | Radio del tile | `rounded-control` 14px | `borderRadius: 12` hardcodeado (línea 53) | `rounded-control` / 14 |
| **P2** | Gap vertical tile | `gap-1` = 4px | `gap: 2` (línea 53) | gap 4 |
| **P2** | Nombre ejercicio | sin truncado, multilínea `leading-tight` | `numberOfLines={1}` (línea 63) | quitar/subir a 2 líneas + lineHeight ~13-14 |
| **P2** | Layout PRs impares | `grid grid-cols-2` → tile impar ocupa media fila | `width:'47.5%', flexGrow:1` (línea 53) → tile solo se estira a 100% | quitar flexGrow (usar flexBasis 47.5% + maxWidth) |
| **P2** | Tipografía badge NUEVO | `text-[8px] font-extrabold` UI/sans | `FONT.displayBlack fontSize 8 letterSpacing 0.3` (línea 57) | FONT UI de mayor peso; letterSpacing 0.24 |
| **P2** | Fecha del tile | `text-[10px] tabular-nums` | sin `fontFamily` (fuente sistema) ni `tabular-nums` (línea 64) | añadir FONT.ui + fontVariant tabular-nums |
| **P2** | Fallback nombre (data-layer) | `?? 'Ejercicio'` (queries.ts:356) | `?? exId` muestra UUID (history.queries.ts:141,148) | cambiar fallback a `'Ejercicio'` en history.queries.ts:148 |

Paridad confirmada (notes 5818): Card inverse/md ambos; header mb-3/gap/11px bold uppercase sport-400 ≈ RN; gap grilla 10px; tile bg-white/[0.05] px-3 py-2.5; peso 19px displayBlack tabular sport-500 + kg 10px semibold; `slice(0,4)`; key idéntica; fmtShort es-CL Santiago idéntico; null si 0 records; tap abre sheet; hover/active ↔ TouchableOpacity activeOpacity 0.8 (adaptación idiomática). **No toca paridad de 86 tokens de color (check-token-parity.mjs).**

### G.2 PRDetailSheet (bloque líneas 5867-5933)
| Sev | Elemento | Web | RN actual | Fix |
|---|---|---|---|---|
| **P0** | **Botón "Compartir mi récord" + share-card** | PRDetailSheet.tsx:74-120,208-219 (sharing, prCard, handleShareRecord, toasts, botón bg-sport-500 Share2/Loader2) | **ausente** — RN no tiene botón ni cálculo prevWeightKg/pct (salta de Hitos:109 a CTA:112) | Reusar `apps/mobile/components/ShareCard.tsx` (mirror de workout-pr-card-canvas.ts; ya usado en WorkoutSummaryOverlay.tsx:454-465); botón bg-sport-500 con ActivityIndicator; derivar prevWeightKg/pct/best1RM como web:76-92 |
| **P1** | Fecha corta de hito (off-by-one) | fmtShort re-convierte por Santiago (líneas 29-36) → muestra "11 jun" para hito del 12 (**doble conversión, probable bug web**) | fmtShort usa `${iso}T12:00:00Z` directo (líneas 17-19) → "12 jun" (aritméticamente correcto) | **Decisión de producto**: arreglar web fmtShort (no re-convertir) o alinear mobile — NO copiar a ciegas |
| **P2** | Icono Trophy en título del sheet | Trophy 18px sport-500 + nombre (líneas 130-133) | ausente — solo `title={exerciseName}` (línea 64); Sheet.tsx:101-115 sin slot de icono | añadir slot `titleIcon`/`headerLeading` a Sheet.tsx + Trophy sport-500 |
| **P2** | Acentos tipográficos de hitos | flecha muted, `+delta` sport-500 bold xs, "primer registro" muted medium xs (líneas 186-200) | un solo Text text-strong plano; inserta '·' que web no tiene (líneas 101-103) | Text anidados: flecha/"primer registro" muted 12 uiMedium, +delta sport-500 uiBold 12; quitar '·' |
| **P2** | Énfasis "1RM estimado" | valor en span `font-semibold text-foreground tabular-nums` (líneas 151-156) | toda la línea `text-muted font-sans` 11; valor sin foreground/semibold/tabular (líneas 73-75) | Text anidado text-strong uiSemibold tabular-nums para el valor |
| **P2** | Sparkline: dot final, alto, margen, trazo | dot r=4 fill sport-500 stroke surface-card 2.5; `mt-3 h-[72px]`; línea strokeWidth 2; gradiente 0.25→0 (WeightSparkline.tsx:31-57) | Sparkline sin dot final, strokeWidth 1.75, gradiente 0.35→0; montado height={64} sin margen (línea 85) | prop opcional `endDot` (Circle r=4), height 72, marginTop 12, strokeWidth 2, stopOpacity 0.25 |
| **P2** | Skeletons de hitos: alto/radio | `h-11` (44) `rounded-control` (14) (líneas 170-174) | `height:40 borderRadius:10` hardcodeado (líneas 91-94) | height 44 + rounded-control token |
| **P2** | Separación vertical del contenido | `gap-5` (20) `p-5 pt-4` (línea 136) | Sheet.tsx:143 contentContainerStyle `gap:14` default (no configurable) | exponer `contentGap` en SheetProps o envolver hijos en View gap 20 |
| **P2** | Tintes de superficie | `bg-muted/25`, `/20`, `/40` (líneas 138,184,224) | los tres usan `bg-surface-sunken` opaco (líneas 66,100,116) → más oscuros en claro | NativeWind alpha: `bg-surface-sunken/25`, `/20`, `/40` |

Equivalencias verificadas NO reportadas (notes 5933): CTA "Ver técnica" web Link a exercisesHref ↔ RN `onTecnica(name)` → `router.push('/alumno/exercises',{q:name})` (home.tsx:376) = mismo deep-link; sparkline color theme.primary ↔ var(--sport-500) ambos brand-overridable; fetch on-demand en RN (useEffect 48-55) vs props detail/loading web = arquitectura, mismos estados de carga; Sheet chrome (backdrop 60%, título uppercase display, radio 28, handle) paridad DS; `max-h-[88dvh]` ↔ `snapPoints ['55%','88%']` idiomático; fmtLong idéntico; card "Record actual" en paridad salvo lo reportado.

---

## H. P0 asignado a esta unidad — conducta web exacta que lo resuelve

**P0: Botón "Compartir mi récord" ausente en RN** (ola0 líneas 5869-5874).

Conducta web a replicar (fuente `PRDetailSheet.tsx`):
1. **Derivar `prCard`** (líneas 74-92): `topMilestone` = `detail.milestones.at(-1)`; `prevWeightKg` = `topMilestone.prevKg` si `topMilestone.weightKg === currentWeight`, si no `0`; `pct` = `Math.round(((currentWeight - prevWeightKg)/prevWeightKg)*1000)/10` cuando `prevWeightKg>0`, si no `0`; `best1RM` = `max(history[].estimated1RM)`; `prCard = { exerciseName: name, newWeightKg: currentWeight, prevWeightKg, pct, estimated1RM: best1RM>0 ? best1RM : latest1RM ?? currentWeight }`. Solo si `currentWeight != null`.
2. **Renderizar botón** solo si `prCard && exerciseId` (líneas 208-219): full-width `min-h-11` (44), `bg-sport-500 text-white font-bold text-sm`, `disabled:opacity-60`; icono `Share2` normal / `Loader2 animate-spin` cuando `sharing`; label **"Compartir mi récord"** (verbatim).
3. **`handleShareRecord`** (líneas 94-120): guard `sharing || !prCard`; `setSharing(true)`; generar imagen (RN: `apps/mobile/components/ShareCard.tsx`, mirror de `workout-pr-card-canvas.ts`, ya usado en `WorkoutSummaryOverlay.tsx:454-465`); si falla → toast error **"No pudimos generar la imagen. Intenta de nuevo."**; compartir vía share nativo con `title: 'Récord personal'`, `text: `Nuevo récord personal en ${name}``; fallback descarga + toast **"Imagen guardada"**; `finally setSharing(false)`.
4. Ubicación: entre el bloque de Hitos y la CTA "Ver técnica" (`mt-1`), como en web.

> Nota P1 fechas (líneas 5876-5881): el off-by-one de `fmtShort` en hitos es un **probable bug de WEB** (doble conversión Santiago). NO copiar la conducta web a ciegas; requiere decisión de producto. La versión RN actual (`${iso}T12:00:00Z` directo) es aritméticamente correcta porque `m.date` ya es ymd Santiago.

---

## I. Estado RN actual — divergencias más obvias (con citas RN)

1. **Card/grilla (`PersonalRecordsCard.tsx`)**: badge NUEVO dura 14 días (`FRESH_MS = 14*86400000`, línea 13; `Date.now() - achievedAt < FRESH_MS`, línea 46) vs 24h web. Trophy `color="#7FB2FF" strokeWidth={2.4}` (línea 41) ≠ sport-400/stroke 2. `borderRadius:12` + `gap:2` hardcodeados (línea 53). `numberOfLines={1}` en nombre (línea 63). `width:'47.5%', flexGrow:1` (línea 53) estira tile impar. Badge en `FONT.displayBlack` (línea 57). Fecha sin fontFamily/tabular (línea 64).
2. **Data-layer (`history.queries.ts`)**: `getPersonalRecords` (líneas 95-152) espeja el web pero **NO calcula `fresh`** (el tipo RN local en el componente omite `fresh` y lo recalcula mal); fallback nombre `?? exId` muestra UUID (líneas 148, 130). Query RN además selecciona `exercise_id` directo (snapshot P1-3) además del block map — mejora funcional que preserva huérfanos, no una regresión.
3. **Sheet (`PRDetailSheet.tsx`)**: **falta el botón "Compartir mi récord"** (P0) — el body salta de Hitos (línea 109) a CTA técnica (línea 112). Título sin icono Trophy (`title={exerciseName}`, línea 64). Hitos como string plano con '·' inventado (`${m.prevKg} → ${m.weightKg} kg  +${m.deltaKg}` / `${m.weightKg} kg · primer registro`, líneas 101-103) sin acentos de color. Línea 1RM toda muted sin énfasis (líneas 73-75). Sparkline `height={64}` sin dot final ni margen (línea 85). Skeletons `height:40 borderRadius:10` (líneas 91-94). Superficies `bg-surface-sunken` opaco en los tres bloques (líneas 66,100,116) sin la gradación 20/25/40%. `fmtShort` RN (líneas 17-19) no re-convierte Santiago (P1, ver H).
4. **Paridad correcta ya presente**: `getExercisePRHistory` RN (líneas 171-228) es espejo 1:1 del web (mismo Epley, agrupación Santiago, milestones, currentPr). CTA "Ver técnica" wired vía `onTecnica` → catálogo pre-buscado (home.tsx:376). fmtLong idéntico. Card "Record actual" en paridad. Sheet snapPoints `['55%','88%']` (línea 64) = adaptación idiomática de `max-h-[88dvh]`.

---

## J. Adaptaciones idiomáticas RN válidas (preservar)
- `TouchableOpacity activeOpacity={0.8}` ↔ web `hover:bg-white/[0.09] active:scale-[0.98]` (press-feedback).
- Deep-link catálogo: web `<Link href="${base}/exercises?q=name">` ↔ RN `onTecnica(name)` → `router.push({ pathname:'/alumno/exercises', params:{ q:name } })` (home.tsx:376). Mismo destino y query.
- Fetch on-demand dentro del sheet RN (useEffect, `PRDetailSheet.tsx:48-55`) ↔ web pre-carga vía server action + `useTransition`. Mismos estados visibles (fallback nombre/peso + skeletons de hitos).
- `snapPoints ['55%','88%']` ↔ `max-h-[88dvh]`.
- Sheet nativo (bottom sheet DS) ↔ Radix Sheet — chrome equivalente.

## K. Reglas duras aplicables
- **Regla 7 (Fabric #45798):** el sheet **no tiene TextInput** — no aplica el gotcha de focus. Si al implementar el share-card se añadiera algún input, no usar estilos condicionales por focus en el wrapper.
- **Regla 3/4:** usar tokens (`text-sport-500`, `bg-surface-sunken/25`, `rounded-control`) — no valores crudos nuevos; no tocar `global.css`/`tailwind.config.js`.
- **Regla 8:** el share-card se genera **client-side** (`ShareCard.tsx`/canvas), sin endpoint `/api/*` — sin riesgo de 404 en prod.
- **Regla 9 (cambiosShell):** el fix P2 del icono en el título del sheet requiere un slot nuevo (`titleIcon`) en `apps/mobile/components/Sheet.tsx` (compartido) — NO tocarlo desde esta unidad; reportar en `cambiosShell`. Igual el `contentGap` de Sheet.tsx (gap 20 vs 14). El fix de fallback nombre toca `history.queries.ts:148` (data-layer de esta unidad, sí editable aquí).
