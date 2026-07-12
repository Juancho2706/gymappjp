# SPEC · Unidad `directory-summary` — Directorio: Resumen/WarRoom + AlertBanner

**Web = fuente de verdad.** Toda afirmacion cita `archivo:linea`.

- Web fuente: `apps/web/src/app/coach/clients/CoachWarRoom.tsx` (472 L) — bloque `md:hidden` (L253-389) = WarRoom movil.
- RN propios de esta unidad:
  - `apps/mobile/components/coach/directory/DirectorySummary.tsx` (206 L)
  - `apps/mobile/components/coach/directory/DirectoryAlertBanner.tsx` (74 L)
- RN READ-ONLY (owner `directory-screen`, coordinar, NO tocar): `apps/mobile/app/coach/(tabs)/clientes.tsx` (ScreenHeader L352-381, tools-card L254-270, montaje DirectorySummary L273-280, banners L283-294), `apps/mobile/components/coach/directory/directory-shared.ts`, `apps/mobile/lib/clients-directory.ts`.

> **Estado global de la unidad:** RN ya esta MUY alineado. El brief y la tabla R5 §2.3 se escribieron contra un RN mas viejo (pill Herramientas, metricas On track/Sin plan, no-colapsable). El codigo ACTUAL ya porto: colapsable+persistencia, metricas Total/Activos/Adher./Nutri., card Herramientas prominente, icon-buttons copiar-portal/importar. La verdad vigente es `ola0-hallazgos.json` (9 discrepancias, casi todas P2 cosmeticas). Este spec documenta el estado real + lo que resta.

---

## 1. Layout / jerarquia (web md:hidden)

Contenedor movil: `<div className="space-y-4 md:hidden">` (`CoachWarRoom.tsx:257`). Orden vertical:

1. **Header** (`CoachWarRoom.tsx:258-285`): fila `flex items-center gap-3`.
   - Izquierda `min-w-0 flex-1`: eyebrow "Tu seguimiento de hoy" + h1 "Alumnos".
   - Derecha `flex shrink-0 items-center gap-1.5`: IconButton copiar-portal (condicional a `loginUrl`) + IconButton importar.
2. **Card Herramientas** (`CoachWarRoom.tsx:289-305`) — solo si `toolsEnabled`.
3. **Resumen · hoy** (`CoachWarRoom.tsx:308-388`) — bloque colapsable `relative z-10`:
   - Boton toggle (eyebrow + linea colapsada + ChevronDown).
   - Si abierto: fila 2 PulseCards + grid-4 MetricChips.

**Reparto RN (divergencia estructural documentada, Ola0 nota L7054):** la contraparte RN de este bloque unico web esta REPARTIDA:
- Header (eyebrow/titulo/icon-buttons) → `ScreenHeader` en `clientes.tsx:352-381` (owner `directory-screen`).
- Card Herramientas → `clientes.tsx:254-270` (owner `directory-screen`, `headerNode`).
- Resumen colapsable (PulseCards + MetricChips) → `DirectorySummary.tsx` (esta unidad).
- AlertBanners → `clientes.tsx:283-300` montando `DirectoryAlertBanner` (esta unidad = el componente; el montaje es de `directory-screen`).

`DirectorySummary` contenedor RN: `styles.summary = { paddingHorizontal: 16, paddingBottom: 12, gap: 8 }` (`DirectorySummary.tsx:200`). El web usa `space-y-4` (16px) entre header/tools/resumen; en RN esos gaps los da `clientes.tsx` (`toolsCard.marginBottom: 12` L594; el header es ScreenHeader). Adaptacion idiomatica (mismo contenido visible, reordenado por el shell de tabs).

---

## 2. Header (eyebrow + titulo + icon-buttons)

### 2.1 Eyebrow + titulo
- Web eyebrow: texto "Tu seguimiento de hoy", `text-[12px] font-bold uppercase tracking-[0.08em] text-muted` (`CoachWarRoom.tsx:260-262`).
- Web h1: "Alumnos", `font-display text-[26px] font-black leading-[1.1] tracking-[-0.03em] text-strong` (`CoachWarRoom.tsx:263-265`).
- RN: `ScreenHeader title="Alumnos" subtitle="Tu seguimiento de hoy"` (`clientes.tsx:352-354`). ScreenHeader pinta el subtitulo DEBAJO del titulo, 13px sin uppercase, titulo ~21px Archivo Black (`components/ScreenHeader.tsx:17-22,47-48`).
- **Divergencia (Ola0 P2, L7032-7038):** orden invertido (web eyebrow ARRIBA vs RN subtitulo DEBAJO), casing (web uppercase vs RN no) y tamaño (web 26px vs RN 21px). Copy VERBATIM correcto en ambos. Owner del fix = `directory-screen` (ScreenHeader compartido). NO tocar desde esta unidad.

### 2.2 Icon-buttons del header
- Web copiar-portal (`CoachWarRoom.tsx:268-276`): `IconButton size="sm" variant="soft" aria-label="Copiar portal de alumnos" icon={copied ? <Check/> : <LinkIcon/>} onClick={handleCopy}`. Solo se renderiza si `loginUrl` truthy (L268). `variant soft` = 36px, icono 18, `bg-surface-sunken` sin borde, icono `--ink-800` (`components/ui/icon-button.tsx:22,28`).
- Web importar (`CoachWarRoom.tsx:277-283`): `IconButton size="sm" variant="soft" aria-label="Importar alumnos" icon={<FileUp/>} onClick={() => router.push('/coach/clients/import')}`.
- RN copiar-portal (`clientes.tsx:357-368`): TouchableOpacity `testID="directory-copy-portal"`, `accessibilityLabel="Copiar portal de alumnos"`, icono `copied ? Check (theme.primary) : LinkIcon (theme.foreground)`, `onPress={handleCopyPortal}`. Solo si `coachSlug` truthy (L357).
- RN importar (`clientes.tsx:369-378`): TouchableOpacity `testID="directory-import-btn"`, `accessibilityLabel="Importar alumnos"`, icono `FileUp`, `onPress={() => setShowImport(true)}`.
- **Divergencias:**
  - Estilo (Ola0 P2, L7039-7045): web `soft` (36px, sunken, sin borde, ink-800); RN 40x40, radius 12, `theme.card` + borde `theme.border`, Check en `theme.primary` (`clientes.tsx:593,364,366,375`). Owner = `directory-screen`.
  - **GESTO/flujo (importar) — PENDIENTE-DECISION-CEO:** web NAVEGA a pagina `/coach/clients/import` (`CoachWarRoom.tsx:282`); RN abre un `NativeDialog` in-app con `ImportClientsForm` (`clientes.tsx:374,503-511`). Cambia el destino (pagina dedicada vs modal). Owner = `directory-screen`; anotar, no auto-sancionar.

### 2.3 handleCopy
- Web (`CoachWarRoom.tsx:235-241`): `navigator.clipboard.writeText(loginUrl)` → `setCopied(true)` → `setTimeout(()=>setCopied(false), 2000)`. `loginUrl = ${appUrl}/c/${coachSlug}/login` (L220).
- RN (`clientes.tsx:197-202`): `Clipboard.setStringAsync(clientLoginUrl(coachSlug))` → `setCopied(true)` → `setTimeout 2000`. Paridad. Sin toast en ambos (solo swap de icono a Check).

---

## 3. Card Herramientas (gating `toolsEnabled`)

### 3.1 Gate
- Web: prop `toolsEnabled = false` default (`CoachWarRoom.tsx:191`), doc "solo si el coach tiene ≥1 modulo del hub activo (cardio/movimiento/composicion)" (L43-44,288). Render condicional `{toolsEnabled && (...)}` (L289).
- RN: `toolsEnabled = hasModule('cardio') || hasModule('movement_assessment') || hasModule('body_composition')` (`clientes.tsx:86-87`, `useEntitlements`). Render `{toolsEnabled && (...)}` (`clientes.tsx:254`). Paridad de gate.

### 3.2 Estructura
- Web (`CoachWarRoom.tsx:289-305`): `<Link href="/coach/tools">`, clases `eva-press flex w-full items-center gap-3 rounded-card border border-subtle bg-surface-card px-[13px] py-[11px] shadow-[var(--shadow-xs)]`.
  - Tile: `h-[38px] w-[38px] rounded-[11px] bg-sport-100 text-sport-600` con `LayoutGrid h-[19px] w-[19px]`.
  - Titulo: `text-sm font-bold text-strong` = "Herramientas".
  - Subtitulo: `text-[11.5px] text-muted truncate` = "Cardio · Movimiento · Composición".
  - Chevron: `ChevronRight h-[18px] w-[18px] text-[var(--ink-300)]`.
- RN (`clientes.tsx:254-270`): TouchableOpacity `testID="directory-tools-card"`, `onPress={() => router.push('/coach/tools')}`, `styles.toolsCard` = `{ bg theme.card, border theme.border, radius 18, px 13, py 11, gap 12 }` (L594).
  - Tile: 38x38 radius 11 `hexToRgba(theme.primary, 0.12)`, `LayoutGrid size 19 theme.primary` (L261,595).
  - Titulo: `fontSize 14 FONT.uiBold theme.foreground` = "Herramientas" (L265,596).
  - Subtitulo: `fontSize 11.5 FONT.ui theme.mutedForeground numberOfLines 1` = "Cardio · Movimiento · Composición" (L266,597).
  - Chevron: `ChevronRight size 18 theme.mutedForeground` (L268).
- **Divergencias (Ola0 P2, L7025-7031):** radius 18 vs `rounded-card`=20 (globals.css:130); RN sin `shadow-xs`; tile tint `primary@0.12` vs `bg-sport-100` (sport ramp), icono `theme.primary`(sport-500) vs `text-sport-600`; chevron `mutedForeground` vs `--ink-300`. Titulo/sub/tamaños EN PARIDAD. Owner = `directory-screen` (vive en clientes.tsx). Copy VERBATIM correcto.

### 3.3 Navegacion
- Ambos → `/coach/tools` (web Link L291, RN `router.push` L258). Destino read-only (`app/coach/tools.tsx`), fuera de alcance.

---

## 4. Resumen · hoy (colapsable) — `DirectorySummary.tsx`

### 4.1 Estado + persistencia
- Web: `const [resumenOpen, setResumenOpen] = useState(true)` (`CoachWarRoom.tsx:198`); `useEffect` lee `localStorage.getItem('eva.dir.resumenOpen') !== '0'` (L201-207); `toggleResumen` invierte y persiste `'1'/'0'` (L208-218).
- RN: `const [open, setOpen] = useState(true)` (`DirectorySummary.tsx:124`); `useEffect` lee `AsyncStorage.getItem('eva.dir.resumenOpen')` → si `'0'` cierra (L125-127); `toggleOpen` invierte y persiste `'1'/'0'` (L128-133). **Misma clave `eva.dir.resumenOpen`**, misma semantica. Paridad (Ola0 nota L7054).

### 4.2 Boton toggle (eyebrow + linea colapsada + chevron)
- Web (`CoachWarRoom.tsx:309-332`): `<button onClick={toggleResumen} className="flex w-full items-center gap-2.5 px-0.5 pb-2 pt-0.5 text-left">`.
  - Eyebrow: "Resumen · hoy", `text-[11px] font-black uppercase tracking-[0.08em] text-subtle` (L314).
  - Linea colapsada (solo `!resumenOpen`, L317-325): `{active} activos` + si `urgentCount>0`: ` · {urgentCount} en riesgo` en `font-bold text-[var(--danger-600)]` + ` · {avgAdherence}% adher.`. Clase contenedora `min-w-0 flex-1 truncate text-xs text-muted`.
  - ChevronDown `h-[18px] w-[18px] text-subtle transition-transform`; abierto → `ml-auto rotate-180`, cerrado → `ml-0` (L326-331).
- RN (`DirectorySummary.tsx:150-162`): TouchableOpacity `testID="directory-resumen-toggle"`, `onPress={toggleOpen}`, `styles.eyebrowRow = { flexDirection row, alignItems center, gap 10, paddingVertical 2 }` (L201).
  - Eyebrow: "Resumen · hoy", `fontSize 11 FONT.uiExtra uppercase letterSpacing 0.88 theme.mutedForeground` (L151,202). 0.08em×11=0.88 ✓.
  - Linea colapsada (solo `!open`, L152-160): `{stats.active} activos` + si `urgentCount>0`: ` · {urgentCount} en riesgo` en `DANGER + FONT.uiBold` + ` · ${avgAdherence}% adher.`. `styles.collapsed = { flex 1, fontSize 12, FONT.uiMedium }` (L203).
  - ChevronDown `size 18 theme.mutedForeground`; abierto → `marginLeft:'auto', rotate 180deg`, cerrado → `marginLeft:0, 0deg` (L161).
- **Divergencias:** eyebrow color web `text-subtle` vs RN `mutedForeground` (Ola0 P2, L7018-7024 — RN no expone token `subtle`); "en riesgo" web `--danger-600` vs RN `DANGER`(500) (Ola0 P1, L6997-7003); font-black(900) vs uiExtra(800) para eyebrow (Hanken tope cargado = 800, adaptacion). Estructura/copy/gesto/persistencia EN PARIDAD.

### 4.3 Bloque expandido
- Web (`CoachWarRoom.tsx:334-387`): `{resumenOpen && (<div className="animate-fade-in space-y-2">...)}`. Contiene `flex gap-2` (2 PulseCards) + `grid grid-cols-4 gap-1.5` (4 MetricChips).
- RN (`DirectorySummary.tsx:164-179`): `{open ? (<>...)}`. `styles.pulseRow = { flexDirection row, gap 8 }` (L204) + `styles.metricRow = { flexDirection row, gap 6 }` (L205).
- gap-2=8 ✓ (pulseRow), gap-1.5=6 ✓ (metricRow).
- **Divergencia (Ola0 P2, L7011-7017):** web `animate-fade-in` al expandir; RN sin animacion (aparicion instantanea).

---

## 5. PulseCard (2 tiles jerarquicos, boton-filtro)

### 5.1 Datos
Web tiles (`CoachWarRoom.tsx:338-359`):
- Riesgo: `tone="danger"`, `value={urgentCount}`, hint `urgentCount ? (===1 ? 'Necesita atención hoy' : 'Necesitan atención hoy') : 'Todo en orden'`, `selected={activeFilter==='urgent'}`, `onClick toggle 'urgent'`.
- Atención: `tone="warning"`, `value={reviewCount}`, hint `reviewCount ? 'Para revisar pronto' : 'Sin pendientes'`, `selected={activeFilter==='review'}`, `onClick toggle 'review'`.

RN tiles (`DirectorySummary.tsx:136-139,166-170`): array `pulseTiles` con label 'Riesgo'/'Atención', value `stats.urgentCount`/`stats.reviewCount`, mismos hints VERBATIM, tone danger/warning, icon `AlertOctagon`/`AlertTriangle`, `selected={riskFilter===t.filter}`, `onPress={() => onToggleRisk(t.filter)}`. Paridad de datos + copy (Ola0 nota L7054).

### 5.2 Estilo (`DirPulseCard` web L79-133 / `PulseCard` RN L17-63)
| Prop | Web | RN | Nota |
|---|---|---|---|
| Contenedor | `flex min-w-0 flex-1 flex-col gap-[5px] rounded-card border-[1.5px] px-3.5 py-[13px]` (L102) | `flex:1 minWidth:0 gap:5 padding:14 borderRadius:20 borderWidth:1.5` (L185) | radius 20 ✓, gap 5 ✓, padding web 14/13 vs RN 14/14 (Ola0 P2 L7046) |
| Icono top-derecha (value>0) | `ArrowRight h-[15px] w-[15px]` (L117) | `ChevronRight size 15` (L57) | **Ola0 P2 L7004-7009: glifo distinto (ArrowRight vs ChevronRight)** |
| Label | icon `h-3.5`(14) + texto `text-[11.5px] font-black tracking-[0.02em]` (L109,113) | `Icon size 14` + `fontSize 11.5 FONT.uiExtra letterSpacing 0.23` (L54-55,188) | 0.02em×11.5=0.23 ✓; weight 900 vs 800 |
| Valor | `font-display text-[30px] font-black leading-none` (L122) | `fontSize 30 lineHeight 32 FONT.displayBlack fontVariant tabular-nums` (L59,189) | web leading-none=30 vs RN lh 32; tabular en ambos |
| Hint | `text-[11px] font-semibold` (L128) | `fontSize 11 FONT.uiSemibold numberOfLines 1` (L60,190) | ✓ |
| Selected bg/border | sel: `t.solid`+`t.border` (danger/warning-500 solido); unsel: `t.bg`+`border-subtle` (danger/warning-100 tint) (L103) | sel: `color`+`color`; unsel: `color+'1A'`(≈10%)+`theme.border` (L45-46) | Ola0 P1 L6997: web tint 100 (dark 0.18) vs RN alpha 0.10 |
| Color fg | danger `--danger-600`, warning `--warning-700` (L65-77) | `DANGER`(#F4365A 500), `WARNING`(#F5A524 500) (L37, shared L14-15) | Ola0 P1: 600/700 degradado a 500 |
| Texto selected | label `text-white/95` (L110), valor `text-white` (L123), hint `text-white/80` (L128) | label/valor `#fff` (L55,59), hint `rgba(255,255,255,0.85)` (L60) | Ola0 P2 L7047: opacidades 0.95/0.80 vs pleno/0.85 |
| Valor color (unsel) | `value>0 ? t.fg : 'text-subtle'` (L123) | `value>0 ? color : theme.mutedForeground` (L59) | subtle vs muted (Ola0 P2 L7018) |

`AnimatedNumber` (web L47-61, useSpring stiffness 120/damping 22) usado en valor PulseCard (L126) → RN `Text` estatico (L59). Ola0 P2 L7011.

---

## 6. MetricChip (grid-4)

### 6.1 Datos
Web (`CoachWarRoom.tsx:362-385`):
- Total: `value={total}`, `fg="var(--text-strong)"`, `selected={allClear}` (allClear = `activeFilter==='all'` L249), `onClick={() => onFilterChange('all')}`.
- Activos: `value={active}`, `fg="var(--sport-600)"`, sin onClick (chip informativo).
- Adher.: `value={avgAdherence}`, `suffix="%"`, `fg="var(--text-strong)"`, sin onClick.
- Nutri.: `value={nutritionLowCount}`, `fg="var(--ember-700)"`, `selected={activeFilter==='nutrition_low'}`, `onClick toggle 'nutrition_low'`.

RN (`DirectorySummary.tsx:141-146,172-176`): array `metricTiles`:
- Total: `stats.total`, color `theme.foreground`, `selected riskFilter==='all'`, `onPress onSetAllRisk`.
- Activos: `stats.active`, color `theme.primary`(sport-500), sin onPress.
- Adher.: `avgAdherence`, suffix `%`, color `theme.foreground`, sin onPress.
- Nutri.: `nutritionLowCount`, color `EMBER`(#FF6A3D 500), `selected riskFilter==='nutrition_low'`, `onPress onToggleRisk('nutrition_low')`.

Paridad de labels VERBATIM (Total/Activos/Adher./Nutri.) y semantica de filtro (Ola0 nota L7054). Divergencia tono: web `sport-600`/`ember-700` vs RN `theme.primary`(500)/`EMBER`(500) (Ola0 P1 L6997-7003).

> **Nota:** el docblock RN `DirectorySummary.tsx:13` dice "Total / Activos / On track / Sin plan" — COMENTARIO OBSOLETO; la implementacion (L141-146) es Total/Activos/Adher./Nutri., que SI coincide con web (Ola0 nota L7054). No es bug.

### 6.2 Estilo (`DirMetricChip` web L136-182 / `MetricChip` RN L66-105)
| Prop | Web | RN | Nota |
|---|---|---|---|
| Contenedor | `flex min-w-0 flex-col gap-px rounded-[var(--radius-md)] border-[1.5px] px-[7px] py-2` (L157) | `flex:1 minWidth:0 gap:1 paddingHorizontal:8 paddingVertical:9 borderRadius:14 borderWidth:1.5` (L194) | radius-md=14 ✓; gap 1 ✓; padding web 7/8 vs RN 8/9 (Ola0 P2 L7046) |
| Interactividad | `onClick ? 'eva-press cursor-pointer' : 'cursor-default'` (L158) | `disabled={!onPress} activeOpacity={onPress?0.8:1}` (L87-89) | ✓ |
| Valor | `font-display text-[15.5px] font-black leading-none` (L166) | `fontSize 15.5 lineHeight 17 FONT.displayBlack fontVariant tabular-nums numberOfLines 1` (L98,195) | ✓ (900 vs 900) |
| Label | `truncate text-[9.5px] font-semibold` (L174) | `fontSize 9.5 FONT.uiSemibold numberOfLines 1` (L102,196) | ✓ sin uppercase ambos |
| **Selected (P0)** | bg `bg-[var(--text-strong)]` + border `border-strong`; valor `text-[var(--surface-card)]` (inverso real); label `text-[var(--surface-card)] opacity-70` (L159,166,175) | bg+border `theme.foreground`; valor `#fff`; label `rgba(255,255,255,0.72)` (L93-94,98,102) | **Ola0 P0 L6989-6996** |

**HALLAZGO P0 (texto invisible en dark, Ola0 L6989-6996):** el web usa `--surface-card` para el texto del chip seleccionado — su inverso REAL en ambos temas (dark: pill blanca + texto tinta; light: pill tinta + texto blanco); el comentario web L162-164 advierte que `text-white` solo funciona en claro. RN pinta el fondo con `theme.foreground` (dark = `#F4F6F8`, `lib/theme.ts:97,175`) pero el texto con `#fff` → blanco sobre casi-blanco = ilegible en dark. **Fix:** usar `theme.card` (inverso real: `#161B22` dark / blanco light, `lib/theme.ts:100,136,166`) para valor y label (label opacity 0.7). Cero tokens nuevos.

`AnimatedNumber` tambien en cada MetricChip web (L169) → RN Text estatico (L98). Ola0 P2 L7011.

---

## 7. DirectoryAlertBanner (`DirectoryAlertBanner.tsx`) — RN-NATIVO ADITIVO

**Sin contraparte directa en `CoachWarRoom.tsx`.** El grep de banners en web solo halla `ProfileTopAlertBanner` (ficha por-alumno, otra unidad). El WarRoom web surfacea urgencia via las PulseCards, no via banner. Por tanto `DirectoryAlertBanner` es un **patron RN-nativo aditivo** (swipe-to-dismiss) — funcionalidad RN existente que NO debe eliminarse (regla dura 2).

### 7.1 Estructura (`DirectoryAlertBanner.tsx:12-55`)
- `Swipeable` (react-native-gesture-handler) con `renderRightActions`/`renderLeftActions` = `hideAction` (EyeOff 15 + "Ocultar", `styles.dismiss` bg `color+'22'`), `onSwipeableOpen={onDismiss}`, `overshootRight/Left={false}`, `friction={1.6}` (L33-40).
- `TouchableOpacity` `styles.wrap`: `bg theme.card`, `borderColor theme.border`, `borderLeftWidth 3 borderLeftColor color`, `onPress`, `activeOpacity 0.8` (L41-46).
- Mensaje: `Text color theme.foreground flex:1 numberOfLines 2` (L47).
- CTA: `Text "Ver" color={color}` + `ChevronRight 14 color` (L48-51).
- Estilos: `wrap { marginHorizontal 16, marginBottom 8, borderRadius 14, borderWidth 1, row, alignItems center, px 14, py 11, gap 8 }` (L58-68); `text { fontSize 13 FONT.uiSemibold }` (L69); `ctaText { fontSize 11 FONT.uiExtra uppercase letterSpacing 0.5 }` (L71); `dismiss { width 96, ... }` (L72).

### 7.2 Montaje (owner `directory-screen`, `clientes.tsx:283-300`)
Cuatro banners condicionales + dismiss persistente:
- Urgente: `stats.urgentCount>0 && !isDismissed('urgent',...)` → msg `` `${n} alumno${s} con atención urgente` ``, color `DANGER`, `onPress setRiskFilter('urgent')`, `onDismiss dismissAlert('urgent', n)` (L283-285).
- Vencido: `stats.expiredProgramCount>0` → `` `${n} programa${s} vencido${s}` ``, `WARNING`, filtro `expired_program` (L286-288).
- Sync: `stats.pendingSyncCount>0` → `` `${n} alumno${s} con cambio de contraseña pendiente` ``, `INFO`, filtro `password_reset` (L289-291).
- Nutricion: `nutritionLowCount>0` → `` `${n} alumno${s} con adherencia nutricional baja` ``, `EMBER`, filtro `nutrition_low` (L292-294).
- Ademas banner de error de pulse (no es DirectoryAlertBanner): `pulseError` → retry (`clientes.tsx:295-300`).

### 7.3 Dismiss persistente (`clientes.tsx:169-179`)
- `todayIso = new Date().toISOString().slice(0,10)` (L170). **GOTCHA 6d (clave de dia):** usa UTC ISO, NO `getSantiagoIsoYmdForUtcInstant`. Es clave de *dismiss local* (oculta hasta el dia siguiente o hasta que cambie el conteo), no una clave de negocio del pulse — pero difiere del contrato de dia Santiago. Anotar como PENDIENTE-DECISION (bajo impacto: solo controla cuando reaparece un banner ya visto). Owner = `directory-screen`.
- `isDismissed(key,count)`: true si `d.date===todayIso && d.count===count` (L171-174).
- `dismissAlert(key,count)`: persiste en AsyncStorage `eva_alumnos_alerts_dismissed` JSON (L175-179).

---

## 8. Queries / datos / claves de dia

- Pulse llega **por props**, NO fetch propio dentro de `DirectorySummary`/`DirectoryAlertBanner` → **sin bomba -999, sin gotcha 6b en esta unidad.** El fetch vive en `clientes.tsx:140-145` (`getCoachDirectoryPulse().then(setPulseById).catch(setPulseError)`), owner `directory-screen`.
- `stats = buildStats(clients)` (`clientes.tsx:147`; `clients-directory.ts:204-206`): `reviewCount` = attentionScore [25,50), `urgentCount` = ≥50, `onTrackCount` = <25.
- `avgAdherence` (`clientes.tsx:163-166`): media de `p.percentage` sobre `pulseById.values()`, `Math.round`, 0 si vacio. Espejo web `CoachWarRoom.tsx:226-229`.
- `nutritionLowCount` (`clientes.tsx:158-161`): cuenta pulse con `attentionFlags.includes('NUTRICION_RIESGO')` OR `nutritionPercentage>0 && <60`. Web (`CoachWarRoom.tsx:231-233`): solo `attentionFlags.includes('NUTRICION_RIESGO')`. **Divergencia menor:** RN agrega el fallback `<60` → RN cuenta ≥ que web. Owner del dato = `directory-screen`. Anotar.
- Claves de dia del pulse (Adher.%/Nutri.): se computan server-side en el endpoint del pulse (fuera de esta unidad); esta unidad solo consume numeros ya calculados. **GOTCHA 6d** no aplica a codigo de esta unidad (salvo el `todayIso` del dismiss, §7.3).

---

## 9. Estados (vacio / carga / error)

- **Carga:** `clientes.tsx:340-347` (owner) muestra `EvaLoaderScreen` — DirectorySummary no se monta hasta `loading=false`. Sin skeleton propio.
- **Vacio (0 alumnos):** `stats.total=0` → PulseCards muestran 0 con hint "Todo en orden"/"Sin pendientes" (L137-138); MetricChips en 0. `emptyNode` (lista) es de `directory-screen` (L326-338).
- **Error pulse:** banner retry (`clientes.tsx:295-300`, owner). Adher./Nutri. quedan en 0 hasta reintento. DirectorySummary no gestiona error propio (recibe `avgAdherence`/`nutritionLowCount` = 0).
- Web: sin loading.tsx especial para este bloque; el pulse llega ya resuelto del RSC.

---

## 10. Accesibilidad

- Web PulseCard: `<button aria-pressed={selected}>` (L100). MetricChip: `<button aria-pressed={selected}>` (L155). Icon-buttons: `aria-label` (L271,279).
- RN PulseCard/MetricChip: `TouchableOpacity` con `testID` pero **sin `accessibilityRole="button"` ni `accessibilityState={{selected}}`** (`DirectorySummary.tsx:40-51,84-97`). **Divergencia a11y menor:** falta el rol/estado accesible (web usa aria-pressed). Anotar.
- RN header icon-buttons SI tienen `accessibilityRole="button"` + `accessibilityLabel` (`clientes.tsx:360-361,371-373`).
- RN AlertBanner: sin accessibilityRole (TouchableOpacity, L41).
- testIDs RN: `directory-resumen-toggle` (L150), `directory-pulse-{urgent|review}` (L168), `directory-metric-{total|active|adherence|nutrition}` (L174), `directory-alert-{urgent|expired|sync|nutrition}` (clientes.tsx L284-293), `directory-tools-card` (L255), `directory-copy-portal`/`directory-import-btn` (L358,370).

---

## 11. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json:6988-7054`)

Bloque emparejado (con la ADVERTENCIA DE EMPAREJAMIENTO L7054: el par asignado ClientCard.tsx estaba mal mapeado; la contraparte real es DirectorySummary + clientes.tsx). 9 discrepancias:

1. **P0 (L6989-6996)** — MetricChip seleccionado texto invisible en dark (`#fff` sobre `theme.foreground`). Fix: `theme.card`. **Owner: esta unidad (`DirectorySummary.tsx:93,98,102`).**
2. **P1 (L6997-7003)** — tonos 600/700 degradados a 500 fijos (PulseCard fg, colapsado "en riesgo", Activos, Nutri.). **Owner: esta unidad + shared.**
3. **P2 (L7004-7009)** — PulseCard value>0 usa ChevronRight; web usa ArrowRight. **Owner: esta unidad (`DirectorySummary.tsx:57`, import L4).**
4. **P2 (L7011-7017)** — sin AnimatedNumber (count-up spring) ni fade-in al expandir. **Owner: esta unidad.**
5. **P2 (L7018-7024)** — subtle vs muted en eyebrow/chevron/valor-0. **Owner: esta unidad (necesita token `textSubtle` en theme).**
6. **P2 (L7025-7031)** — card Herramientas: radius 18 vs 20, sin sombra, tint. **Owner: `directory-screen` (clientes.tsx:594,261,268).**
7. **P2 (L7032-7038)** — header eyebrow/titulo (ScreenHeader). **Owner: `directory-screen`.**
8. **P2 (L7039-7045)** — icon-buttons soft vs card+borde. **Owner: `directory-screen`.**
9. **P2 (L7047-7052)** — opacidades selected 0.95/0.80 y paddings 14/13 · 7/8. **Owner: esta unidad + clientes.tsx.**

**En paridad confirmada (NO reportar, Ola0 L7054):** labels/hints 1:1, semantica toggle-filtro, persistencia colapso (clave `eva.dir.resumenOpen`), formato linea colapsada, gate `toolsEnabled`, copy-portal Check 2s, radios 20/14, borde 1.5, tipografias (11.5 extra / 30 displayBlack / 15.5 / 9.5), tabular-nums, chevron rotate-180.

`grep "DirectoryActionBar"` en ola0 = 0 hits (confirmado por brief).

---

## 12. Hallazgos ronda 5 (`docs/audits/rn-parity-qa/r5-audit-coach-core.md` §2.3, L86-95)

> La tabla R5 §2.3 refleja un RN mas VIEJO. Verificacion contra el codigo actual:

| R5 fila | R5 decia (RN viejo) | Estado ACTUAL |
|---|---|---|
| Header (L90) | ScreenHeader "N activos · N total", sin copiar-portal, importar=FAB | **PARCIAL-CORREGIDO:** subtitle="Tu seguimiento de hoy" (clientes L354), copiar-portal presente (L357-368), importar=icon-button (L369). Resta: eyebrow arriba/uppercase/26px (Ola0 P2 #7). |
| Herramientas (L91) | pill chica Wrench 15 en header | **CORREGIDO:** card prominente LayoutGrid 19 + subtitulo (clientes L254-270). Resta: radius/sombra/tint (Ola0 P2 #6). |
| Metricas (L92) | grid-4 Total·Activos·On track·Sin plan | **CORREGIDO:** Total·Activos·Adher.·Nutri. (DirectorySummary L141-146). |
| MetricChip (L93) | valor 17 displayBold(800), label uppercase | **CORREGIDO:** 15.5 displayBlack(900), label sin uppercase (L195-196). |
| Resumen colapsable (L94) | no colapsable | **CORREGIDO:** colapsable + persistencia (L124-133). |
| PulseCard label (L95) | label 12 uiExtra ls 0.2 | **CORREGIDO:** 11.5 uiExtra ls 0.23 (L188). |

Neto R5: casi todo lo EST de §2.3 ya esta portado. Lo vigente = los 9 items Ola0 (mayoria cosmeticos + el P0 de contraste).

---

## 13. Estado RN actual — divergencias con cita

1. **[P0] MetricChip selected `#fff` en dark** → `DirectorySummary.tsx:98,102`; usar `theme.card`. (Ola0 #1)
2. **[P1] Tonos 500 vs 600/700 web** → `DirectorySummary.tsx:37,143,145,156`, `directory-shared.ts:14-16`. (Ola0 #2)
3. **[P2] ChevronRight vs ArrowRight en PulseCard** → `DirectorySummary.tsx:57`, import L4. (Ola0 #3)
4. **[P2] Sin count-up ni fade-in** → `DirectorySummary.tsx:59,98,164`. (Ola0 #4)
5. **[P2] subtle vs muted** → `DirectorySummary.tsx:59,151,161`. (Ola0 #5)
6. **[P2] paddings 14/14 vs 14/13 (pulse) y 8/9 vs 7/8 (chip); opacidades selected pleno vs 0.95/0.80** → `DirectorySummary.tsx:185,194,55,60`. (Ola0 #9)
7. **[a11y] falta `accessibilityRole="button"` + estado selected en PulseCard/MetricChip** → `DirectorySummary.tsx:40-51,84-97`.
8. **[datos menor] nutritionLowCount RN agrega fallback `<60`** vs web solo flag → `clientes.tsx:158-161` vs `CoachWarRoom.tsx:231-233` (owner directory-screen).
9. **[clave-dia] dismiss usa `todayIso` UTC** no Santiago → `clientes.tsx:170` (owner directory-screen; bajo impacto).

Divergencias owner `directory-screen` (coordinar, NO tocar desde esta unidad): header/ScreenHeader (Ola0 #7), icon-buttons soft (Ola0 #8), tools-card radius/sombra/tint (Ola0 #6), gesto importar modal-vs-pagina (§2.2 PENDIENTE-DECISION-CEO).

---

## 14. Mapa de interacciones (todos los tocables — el lente de cableado verifica contra esto)

| # | Tocable | Ubicacion RN | Efecto | Web ref |
|---|---|---|---|---|
| 1 | Toggle "Resumen · hoy" | `DirectorySummary.tsx:150` `directory-resumen-toggle` | Colapsa/expande + persiste `eva.dir.resumenOpen` | `CoachWarRoom.tsx:311` |
| 2 | PulseCard Riesgo | `DirectorySummary.tsx:168` `directory-pulse-urgent` | `onToggleRisk('urgent')` → filtra directorio a riesgo (toggle a 'all' si ya activo) | `CoachWarRoom.tsx:350` |
| 3 | PulseCard Atención | `DirectorySummary.tsx:168` `directory-pulse-review` | `onToggleRisk('review')` → filtra a atencion (toggle) | `CoachWarRoom.tsx:358` |
| 4 | MetricChip Total | `DirectorySummary.tsx:174` `directory-metric-total` | `onSetAllRisk()` → `setRiskFilter('all')` (limpia filtro riesgo) | `CoachWarRoom.tsx:368` |
| 5 | MetricChip Activos | `DirectorySummary.tsx:174` `directory-metric-active` | Sin onPress (informativo, `disabled`) | `CoachWarRoom.tsx:370-374` (sin onClick) |
| 6 | MetricChip Adher. | `DirectorySummary.tsx:174` `directory-metric-adherence` | Sin onPress (informativo) | `CoachWarRoom.tsx:375` (sin onClick) |
| 7 | MetricChip Nutri. | `DirectorySummary.tsx:174` `directory-metric-nutrition` | `onToggleRisk('nutrition_low')` → filtra nutricion baja (toggle) | `CoachWarRoom.tsx:381-383` |
| 8 | Card Herramientas | `clientes.tsx:255` `directory-tools-card` (owner) | `router.push('/coach/tools')` | `CoachWarRoom.tsx:291` (Link) |
| 9 | Icon-button copiar-portal | `clientes.tsx:358` `directory-copy-portal` (owner) | `handleCopyPortal` → Clipboard + Check 2s | `CoachWarRoom.tsx:274` |
| 10 | Icon-button importar | `clientes.tsx:370` `directory-import-btn` (owner) | `setShowImport(true)` → NativeDialog (web: navega a `/coach/clients/import`) | `CoachWarRoom.tsx:282` |
| 11 | AlertBanner (tap) | `DirectoryAlertBanner.tsx:41` (montado clientes.tsx:283-294) | `onPress` → `setRiskFilter(<filtro>)` segun banner (urgent/expired_program/password_reset/nutrition_low) | sin equivalente web (RN-nativo) |
| 12 | AlertBanner (swipe izq/der) | `DirectoryAlertBanner.tsx:33-40` | `onSwipeableOpen` → `onDismiss` → `dismissAlert(key,count)` persiste (oculta hasta manana o cambio de conteo) | sin equivalente web |
| 13 | Banner retry pulse | `clientes.tsx:296` `directory-pulse-retry` (owner) | `loadPulse()` reintenta metricas | sin equivalente web |

Tocables 2/3/7/11 comparten el mismo mecanismo de filtro (`riskFilter`); tocable 4 lo limpia. Verificar cableado 1:1 contra columna "Efecto".

---

## 15. Adaptaciones idiomaticas RN (documentadas)

- **Reparto del bloque md:hidden** en ScreenHeader + tools-card (clientes.tsx) + DirectorySummary + AlertBanners — preserva contenido/gestos visibles; reordenado por el shell de tabs RN. (§1)
- **Importar = NativeDialog** en vez de navegar a pagina dedicada (§2.2) — **PENDIENTE-DECISION-CEO** (cambia destino). Owner directory-screen.
- **DirectoryAlertBanner = patron RN-nativo aditivo** (swipe-to-dismiss) sin contraparte web; funcionalidad existente a preservar. (§7)
- Hanken tope = `uiExtra`(800): web `font-black`(900) en texto UI se aproxima a 800 (no hay cara 900 de Hanken cargada). displayBlack SI es 900. (`typography.ts:33,39`)

---

## 16. GATE

`npx tsc --noEmit` en `apps/mobile` debe quedar limpio. Esta unidad es SPEC-only (no toca codigo); el gate aplica a la unidad de implementacion que la consuma.
