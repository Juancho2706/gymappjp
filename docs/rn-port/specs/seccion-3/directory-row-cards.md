# SPEC — Unidad `directory-row-cards` (Seccion 3, COACH)

> PORT 1:1. **Web = fuente de verdad.** Cada afirmacion cita `archivo:linea` del codigo real leido linea por linea.
> Alcance: las TARJETAS de alumno del directorio del coach — la fila de lista (`DirRowCard`) y la tarjeta de grid (`ClientCard`).
> Archivos PROPIOS (unicos editables por esta unidad):
> - `apps/mobile/components/coach/directory/DirRowCard.tsx` (161 L reales)
> - `apps/mobile/components/coach/ClientCard.tsx` (245 L reales)
> READ-ONLY citados: `directory/directory-shared.ts`, `directory/ClientActionsSheet.tsx`, `lib/clients-directory.ts`, `lib/typography.ts`, `components/ProgressRing.tsx`, `components/Badge.tsx`, `components/Sparkline.tsx`, `app/coach/(tabs)/clientes.tsx`.

---

## 0. Verdad web y su montaje

### 0.1 `DirRowCard` (fila de lista)
- Archivo web: `apps/web/src/app/coach/clients/DirRowCard.tsx` (172 L).
- Props: `{ client:any, pulse:DirectoryPulseRow|null|undefined, onActions:()=>void }` (web L62-66).
- Montado por `ClientsDirectoryClient.tsx` en la vista `view==='cards'` (default): L301-308 `visibleClients.map(client => <DirRowCard client pulse={pulseByClientId[client.id]} onActions={() => setActionsClient(client)} />)`. El state `view` es `'cards' | 'table'` (L123), default `'cards'`.
- El `onActions()` levanta el estado `actionsClient` en el PADRE, que renderiza UN solo `<ClientActionsSheet client={actionsClient} loginUrl onClose onEdit />` (L327-334). El web NO embebe el sheet por fila.

### 0.2 `ClientCardV2` (tarjeta de grid) — CODIGO MUERTO en web
- Archivo web: `apps/web/src/components/coach/ClientCardV2.tsx` (565 L) + `ClientCardV2Skeleton.tsx` (46 L).
- **No se renderiza en ninguna ruta** (grep `ClientCardV2` → solo `components/coach/ClientCardV2.tsx`, su `Skeleton`, y los barrels `components/organisms/index.ts` y `components/molecules/index.ts`). Confirmado por Ola 0 `ola0-hallazgos.json:10740` ("components/coach/ClientCardV2.tsx web esta sin uso en rutas (dead code)") y r5 `r5-audit-coach-core.md:100` (§2.5 "ClientCard (grid) … no auditados esta ronda").
- Consecuencia: el grid card mobile (`ClientCard.tsx`) usa `ClientCardV2` como **referencia de diseño** (layout/tokens), pero no hay una vista web viva que replicar pixel-a-pixel. El roster vivo del coach en web es la fila (`DirRowCard`) + `DirTableMobile` + `DesktopRosterTable`; la tarjeta rica de pulse equivale a `CoachWarRoom.tsx` (r5 `r5-audit-coach-core.md:136`). **No borrar** el grid card mobile: es funcionalidad RN viva montada por `clientes.tsx` (owner `directory-screen`).

---

## 1. `DirRowCard` — layout, jerarquia y tokens (web L88-171)

Contenedor raiz `<div role="button" tabIndex=0>` (web L89-97):
- Clases: `flex cursor-pointer items-center gap-3 rounded-card border border-subtle bg-surface-card p-3.5 shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-sunken`.
- `gap-3` = 12px; `p-3.5` = 14px; `rounded-card` = radius card; borde `border-subtle`; fondo `bg-surface-card`; sombra `shadow-[var(--shadow-xs)]` (globals.css:552 claro `0 1px 2px rgba(13,18,28,0.06)`, :643 oscuro `0 1px 2px rgba(0,0,0,0.5)`); hover→`bg-surface-sunken`.

Tres hijos en fila: [anillo 50px] · [bloque info flex-1] · [IconButton kebab].

### 1.1 Anillo de adherencia + inicial + dot (web L98-119)
- Wrapper `relative h-[50px] w-[50px] shrink-0` (L98).
- `<CircularProgressbar value={adherence} strokeWidth={5}>` con `pathColor=ringColor(adherence)`, `trailColor='var(--track)'`, `strokeLinecap:'round'` (L99-107).
  - `ringColor(a)`: `a>=75 → var(--sport-500)`; `a>=50 → var(--warning-500)`; resto `var(--danger-500)` (L33-37).
- Inicial centrada absoluta: `font-display text-lg font-black uppercase text-strong` mostrando `client.full_name?.[0] ?? '?'` (L108-112). `text-lg` = 18px, `font-black` = 900.
- Dot de ultima actividad: `absolute -bottom-px -right-px h-[13px] w-[13px] rounded-full border-2 border-[var(--surface-card)]` + clase `dot` (L113-118).
  - `lastDot(days)`: `<3 → bg-success-500`; `<7 → bg-warning-500`; resto `bg-danger-500` (L39-43).
  - `dot = lastDot(daysSince==null ? 999 : daysSince)` → sin fecha ⇒ **dot ROJO danger-500** (L77).

### 1.2 Bloque de info (web L121-157) `min-w-0 flex-1`
Fila nombre (L122-137) `flex min-w-0 items-center gap-1.5` (gap 6px):
- Nombre: `truncate font-display text-[15.5px] font-black tracking-tight text-strong` con `{client.full_name}` (L123-125). `font-black`=900; `tracking-tight`≈ -0.025em ≈ -0.39px @15.5.
- Badge de severidad **solo si `pulse`** (L126): `inline-flex h-[19px] shrink-0 items-center gap-1 rounded-pill px-1.5 text-[10.5px] font-bold` + `sev.cls`, con `<SevIcon className="h-[11px] w-[11px]"/>` + `sev.label` (L127-135).
  - `severityMeta(score)`: `>=50 → {label:'Riesgo', cls:'bg-danger-100 text-danger-700', Icon:AlertOctagon}`; `>=25 → {label:'Atención', cls:'bg-warning-100 text-warning-700', Icon:AlertTriangle}`; resto `{label:'On track', cls:'bg-success-100 text-success-700', Icon:Check}` (L13-31). Icono hereda `currentColor` = mismo -700 del texto.

Fila meta (L138-156) `mt-1 flex flex-wrap items-center gap-2 text-xs text-muted` (gap 8px, texto 12px muted):
- `%` de adherencia SIEMPRE: `font-mono font-bold text-strong` → `{adherence}%` (L139). `adherence = pulse?.percentage ?? 0` (L71) → muestra `0%` sin pulse.
- Separador `·`: `text-[var(--border-strong)]` (L140).
- Label de ultima sesion: `<span>{lastLabel(daysSince)}</span>` (L141).
  - `lastLabel(days)`: `null → '—'`; `0 → 'Hoy'`; `1 → 'Ayer'`; resto `Hace ${days}d` (L45-50).
- Indicador nutricion, **solo si `hasNutritionData && nutriRisk`** (L142): `· ` + `<span className="inline-flex items-center gap-1 font-semibold text-[var(--ember-700)]"><Apple className="h-3 w-3"/>{nutritionPct}%</span>` (L143-149).
  - `nutritionPct = pulse?.nutritionPercentage ?? 0` (L79); `nutriRisk = flags.includes('NUTRICION_RIESGO') || nutritionPct < 60` (L80-81); `hasNutritionData = nutritionPct > 0` (L82). Con pct=0 NUNCA se muestra aunque el flag este.
  - `ember-700` scheme-aware: `#C23E14` claro (globals.css:357) / `#FFB79E` oscuro (globals.css:631); peso `font-semibold` (600).
- Badge de estado, **solo si `st.key !== 'active'`** (L151): `rounded-pill px-1.5 py-px text-[10.5px] font-bold` + `st.cls` (L152-154).
  - `statusMeta(client)`: `is_archived → {key:'archived', label:'Archivado', cls:'bg-surface-sunken text-subtle'}`; `is_active===false → {key:'paused', label:'Pausado', cls:'bg-ink-100 text-ink-600'}`; `force_password_change → {key:'pending_sync', label:'Pend. sync', cls:'bg-info-100 text-info-700'}`; resto `{key:'active', label:'Activo', cls:'bg-success-100 text-success-700'}` (L52-60). Los 3 no-activos tienen estilos distintos.

### 1.3 Control trailing — kebab de acciones (web L159-169)
- `<IconButton size="sm" variant="ghost" aria-label={\`Acciones de ${client.full_name}\`} icon={<MoreVertical/>} onClick={(e)=>{ e.stopPropagation(); onActions() }} onKeyDown={(e)=>e.stopPropagation()} />` (L159-169).
- `IconButton` ghost sm (icon-button.tsx:22,27): `text-[var(--ink-700)]` (#2A323D claro / #C2C9D2 oscuro), 36x36px, icono 18px, `rounded-control`, `active:scale-0.92`.
- El `stopPropagation` evita que el tap del kebab dispare la navegacion del cuerpo.

### 1.4 Interaccion del cuerpo (web L92-95)
- `onClick={() => router.push(profileHref)}` con `profileHref = \`/coach/clients/${client.id}\`` (L86,92).
- `onKeyDown`: Enter → `router.push(profileHref)` (accesibilidad teclado, solo web).

---

## 2. `ClientCardV2` — tarjeta de grid (referencia de diseño, web L145-564)

> Diseño-fuente (aunque muerto en rutas). Estructura vertical dentro de `<Card interactive padding="none" className="group relative overflow-visible">` (L227-231), envuelto por `motion.div` con variants de entrada (hidden→show spring stiffness300 damping24) + `whileHover y:-6 boxShadow` (L211-226). Fondo radial `bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--sport-500),transparent_94%),transparent_70%)]` (L232). Contenido `relative z-10 space-y-4 p-5 md:p-6` (L234).

### 2.1 Header (L235-340) `flex gap-4`
- Anillo `relative h-[72px] w-[72px] shrink-0` (L236): `<CircularProgressbar value={adherencePct} strokeWidth={6}>` con `ringColor` `>80 → success-500 / >50 → warning-500 / else danger-500` (L187-192,246-254). Inicial `font-display text-xl font-black uppercase text-strong` = `client.full_name?.[0] ?? '?'` (L256-258).
  - Badge "!" de nutricion baja **si `nutritionRisk && hasNutritionData`** (L237-245): `absolute -right-1 -top-1 z-10 … h-5 min-w-5 rounded-full border border-rose-700 bg-rose-500 px-1 text-[9px] font-black text-white shadow-md`, `title=\`Nutrición baja: ${nutritionPct}%\``.
- Bloque nombre (L262-277): `<Link href={profileHref} className="font-display text-base font-black uppercase tracking-tighter text-strong hover:text-sport-600 truncate">{full_name}</Link>` (L266-271) + `<ClientCardV2AttentionBadge score streak/>` si `pulse` (L272). Email `truncate text-[10px] font-bold uppercase tracking-widest text-subtle` (L274-276).
  - `ClientCardV2AttentionBadge` (L110-143): `score>=50 → Badge tone=danger "Atención urgente" animate-pulse`; `>=25 → warning "Revisar"`; `score===0 && streak>10 → success "Destacado" icon=Star`; resto `success "On track"`. Todos `variant=soft size=sm uppercase tracking-widest`.
- Cluster de acciones (L278-337) `flex shrink-0 items-center gap-0.5`:
  - `<ResetPasswordButton clientId clientName/>` (L279-282).
  - `<ToggleStatusButton clientId clientName isActive={client.is_active!==false}/>` (L283-287).
  - Boton eliminar (L288-296): `h-10 w-10 rounded-control border border-danger-500/30 bg-danger-100 text-danger-600 hover:bg-danger-500 hover:text-white`, icono `<Trash2 h-5 w-5 strokeWidth=2.5>`, abre `setDeleteOpen(true)`.
  - `<DropdownMenu modal={false}>` (L297-336): trigger `h-10 w-10 rounded-control border border-subtle bg-surface-sunken text-strong` con `<MoreHorizontal>`. Items: **Ver perfil** (Eye → `router.push(profileHref)`), **Enviar WhatsApp** (Smartphone → `window.open(whatsappLink,'_blank')`, solo si `client.phone && loginUrl`), **Entrenamiento** (Dumbbell → `router.push(builderHref)`), **Nutrición** (Apple → `router.push(nutritionHref)`). `profileHref=/coach/clients/{id}` (L206), `builderHref=/coach/builder/{id}` (L207), `nutritionHref=/coach/nutrition-plans/client/{id}` (L208).

### 2.2 Mini-stats grid (L342-397) `grid grid-cols-2 gap-2 sm:grid-cols-4`
Cada tile `rounded-control border border-subtle bg-surface-sunken p-2`, label `text-[8px] font-bold uppercase tracking-widest text-muted`:
- **Adherencia** (L343-354): valor `font-display text-lg font-black text-strong {adherencePct}%` + barra `h-1 bg-track` con relleno `bg-sport-500 width:{adherencePct}%`.
- **Peso hoy** (L355-367): valor `{currentWeight!=null ? \`${currentWeight} kg\` : '—'}`; sub `text-[9px] font-bold text-muted` con `↑/↓{Math.abs(weightDelta)} (7d)`.
- **Energía** (L368-385): 5 `<Star h-3.5 w-3.5>`, i<=stars → `fill/text-warning-500`, resto `text-ink-300`. `stars = energy!=null ? clamp(round(energy/2),0,5) : 0` (L173-174).
- **Último log** (L386-396): dot `h-2 w-2 rounded-full` con `dotClass(days)` (`<3 success / <7 warning / else danger animate-pulse`, L104-108) + `text-xs font-bold text-strong {lastLog.label}`.

### 2.3 Sparklines (L399-410)
- Label `text-[9px] font-bold uppercase tracking-widest text-muted`: "Peso (30d)" y "Adherencia (4 sem)".
- `<SparkArea data color gradId/>`: recharts AreaChart height 32, `strokeWidth 1.5`, gradiente stop 0.35→0. Colores LITERALES (recharts no resuelve `var()`): peso `#2680FF`, adherencia `#1FB877` (L403-409). Sin data → "Sin datos" `text-[9px] uppercase tracking-widest text-muted` (L67-73).

### 2.4 Bloque nutricion (L412-446) — solo si `hasNutritionData`
`flex items-center gap-3 rounded-control border p-3`, tono: risk → `border-danger-500/25 bg-danger-100`, else `border-ember-500/20 bg-ember-100`. Apple icon + label ("Baja adherencia nutricional" | "Nutrición") + `{nutritionPct}%` + barra `h-1 bg-track` con relleno `bg-danger-500`|`bg-ember-500`.

### 2.5 Bloque programa (L448-485)
- Con programa: `space-y-2 rounded-control border border-sport-500/15 bg-sport-500/5 p-3` — Calendar sport-600 + label "Programa" + `activeProgramName` truncate + `Sem {weekCur ?? '—'}/{weekTot ?? '—'}` + barra `h-1.5` relleno `bg-sport-500 width:{weekPct}%`. Pie `text-[10px] text-muted`: `{remainingDays>0?remainingDays:0} días restantes` + ` · {weekTot} semanas totales`.
  - `weekPct = weekCur&&weekTot&&weekTot>0 ? clamp(round(weekCur/weekTot*100),0,100) : 0` (L182-185).
- Sin programa: `flex items-center gap-2 rounded-control border border-dashed border-default p-3 opacity-70` con Activity + "Sin programa asignado" `text-[10px] uppercase tracking-widest text-muted`.

### 2.6 Suscripcion (L487-502) — solo si `subscriptionDaysRemaining !== null`
`text-[9px] font-bold uppercase tracking-widest text-muted`: "Suscripción: " + `<span>` `<=5 → text-danger-600 / else text-sport-600`, `>0 → \`${n} días\` / else 'Vencida'`.

### 2.7 Footer de acciones (L504-533) `flex flex-wrap gap-2 border-t border-subtle pt-4`
Botones pill `flex-1 min-w-[120px] rounded-control … text-[10px] font-black uppercase tracking-widest`:
- **WA** (solo `client.phone && loginUrl`): `<a href={whatsappLink} target=_blank>` fondo `#25D366` texto blanco + Smartphone (L505-514).
- **Perfil** `<Link href={profileHref}>` border-default bg-surface-card + Eye (L515-520).
- **Workout** `<Link href={builderHref}>` + Dumbbell (L521-526).
- **Nutri** `<Link href={nutritionHref}>` + Apple (L527-532).

### 2.8 AlertDialog eliminar (L537-561)
Confirmacion con AlertTriangle destructive, "Eliminar alumno", body `¿Eliminar a {full_name}? No se puede deshacer.`, Cancelar + `Sí, eliminar`/`Eliminando…` (via `deleteClientAction`, L198-204).

### 2.9 Skeleton (`ClientCardV2Skeleton.tsx`)
`GlassCard` con `animate-shimmer space-y-4 p-5`: avatar 72px + 3 lineas + grid 4 tiles + 2 barras + bloque 20 + 4 botones (L14-42).

---

## 3. Estado RN actual (divergencias con cita RN)

### 3.1 `DirRowCard.tsx` (RN, 161 L) — YA REMEDIADO respecto a §2.2 r5

**IMPORTANTE:** el RN ya NO usa el `ChevronRight` decorativo que citaba el brief (P0 ALTO) ni el `displayBold(800)`. El codigo actual:
- Trailing = `<TouchableOpacity … onPress={() => setMenu(true)}><MoreVertical size={18} color={theme.mutedForeground}/></TouchableOpacity>` (RN L111-120) que abre un `<ClientActionsSheet visible={menu} … />` **embebido por fila** (RN L44,123-136). `accessibilityLabel={\`Acciones de ${item.fullName}\`}` (RN L114). → §2.2 r5 L83 (EST ALTO "falta MoreVertical") **RESUELTO**.
- Nombre `styles.name` = `fontSize:15.5, fontFamily:FONT.displayBlack, letterSpacing:-0.155` (RN L87,154). `displayBlack`=`Archivo_900Black` (typography.ts:39). → §2.2 r5 L81 (weight 800 vs 900) **RESUELTO**; queda solo el letterSpacing.
- Inicial `fontSize:18, fontFamily:FONT.displayBlack` (RN L77). → §2.2 r5 L82 **RESUELTO**.

**Gesto:** RN cuerpo `onPress={() => onOpen(item)}` (RN L65) = ficha; kebab = menu. Mismo gesto que web (cuerpo→ficha, kebab→acciones). **Sin cambio de gesto → no requiere decision CEO.** Divergencia estructural benigna: web levanta 1 sheet en el padre, RN embebe uno por fila (superset funcional, mismas acciones; Ola 0 `ola0-hallazgos.json:6698` lo marca "no es perdida").

Divergencias vivas (todas P1/P2 de Ola 0, ver §5):
- **Anillo sin pulse / badge de severidad INVERTIDO** (P1, Ola0 L6621-6625): RN `adherence = pulse?.percentage ?? null` (L45) oculta el `%` y su separador cuando null (L91-94); web muestra `0%` SIEMPRE. RN renderiza el Badge de severidad SIEMPRE con `score = pulse?.attentionScore ?? item.attentionScore` (L46,88); web lo condiciona a `pulse` (L126).
- **Dot/label sin entreno** (P1, Ola0 L6628-6632): RN `lastInfo(null) → {label:'Sin entrenos', dot:'#A8B1BD'}` (directory-shared.ts:44, consumido L49,82,95); web → `'—'` + dot ROJO danger-500.
- **Nutricion en riesgo: color/peso** (P1, Ola0 L6635-6639): RN usa `EMBER='#FF6A3D'` (ember-500 fijo) para icono y texto con `styles.metric`=`FONT.uiMedium` (500) (L99-100,157); web usa `ember-700` scheme-aware + `font-semibold` (600).
- **Visibilidad nutricion (edge pct=0 con flag)** (P2, Ola0 L6642-6646): RN `nutriRisk = flags.includes('NUTRICION_RIESGO') || (nutri>0 && nutri<60)` (L51) y render con solo `{nutriRisk ?…}` (L96) → muestra " 0%" cuando web lo oculta (`hasNutritionData = pct>0`).
- **Icono/texto del badge de severidad** (P2, Ola0 L6649-6653): RN icono `SEV_HEX[sev.tone]` = tono -500 (L88; directory-shared.ts:18) y texto vía Badge fg -600 (Badge.tsx:59,61); web usa -700 en ambos.
- **Geometria del Badge** (P2, Ola0 L6656-6660): Badge sm mobile = h20/px8/gap4/font11/ls0.2 (Badge.tsx:67,141); web = h19/px6/gap4/font10.5/sin ls (adaptacion al Badge canonico DS).
- **Archivado vs Pausado indistinguibles** (P2, Ola0 L6663-6667): RN ambos `tone:'neutral'` (directory-shared.ts:36-37) → identicos; web los distingue (surface-sunken/text-subtle vs ink-100/ink-600). Pend. sync RN `tone:'info'` → text-info-600; web info-700.
- **Sombra ausente** (P2, Ola0 L6670-6674): `styles.card` RN sin shadow/elevation (L142-149); web `shadow-[var(--shadow-xs)]`.
- **Kebab color/footprint** (P2, Ola0 L6677-6681): RN `MoreVertical size18 color=theme.mutedForeground` en `menuBtn` padding2 ~22px (L119,159); web IconButton ghost sm = ink-700, 36x36.
- **Gaps internos** (P2, Ola0 L6684-6688): RN nameRow gap7, metricsRow gap5 (L153,155); web gap-1.5(6) / gap-2(8).
- **letterSpacing nombre + fallback inicial** (P2, Ola0 L6691-6695): RN `letterSpacing:-0.155` (=-0.01em) (L154); web `tracking-tight`≈-0.39 (-0.025em). RN inicial `item.fullName.charAt(0)` sin fallback `'?'` (L78); web `?? '?'`.

Paridad correcta ya verificada (Ola0 L6698, no tocar): p14, border, radius20, gap12, anillo 50/stroke5 track scheme-aware, umbrales 75/50 del anillo, dot 13px border2 color card, umbrales severidad 50/25 y labels, separador `·` border-strong scheme-aware (RN `sepColor` L54 = `#A8B1BD`/`rgba(255,255,255,0.22)` = globals.css:415,602), umbrales dot 3/7. Extra RN benigno: animacion de entrada `MotiView` stagger por index (L57-61) — deleite anadido, no rompe paridad estatica; **no eliminar**.

### 3.2 `ClientCard.tsx` (RN grid, 245 L) — §2.5/2.6 r5 pendiente de auditoria fina

Estructura RN (contra `ClientCardV2` diseño-fuente):
- `<Card padding={14} radius="card" style={{gap:9, height:CLIENT_CARD_HEIGHT}}>` con `CLIENT_CARD_HEIGHT=362` (L12,71). Altura FIJA (usada por la animacion de stack de `clientes.tsx`, owner `directory-screen`). `CONTENT_W = window.width - 32 - 28` (L13) para dimensionar sparklines.
- Header (L73-94): `ProgressRing size56 stroke5` color por `adherence>80?SUCCESS:>50?WARNING:DANGER` (L52,74-85), inicial `fontSize20 Archivo_900Black` (L81); nombre `styles.name`=`fontSize15 Archivo_800ExtraBold ls-0.2` con `onPress={onPress}` (L88,218) + `<Badge tone={att.tone} variant=soft size=sm>{att.label}</Badge>` (L89); email `fontSize11` (L91,219); kebab `<TouchableOpacity onPress={()=>setMenu(true)}><MoreVertical size20/></TouchableOpacity>` (L93).
  - `attentionMeta(score,streak)` RN: `>=50 → {'Urgente','danger'}`; `>=25 → {'Revisar','warning'}`; `score===0&&streak>10 → {'Destacado','ember'}`; resto `{'On track','success'}` (L41-46). **Divergencia copy:** RN "Urgente" vs web `ClientCardV2AttentionBadge` "Atención urgente" (L112-116); RN tone `ember` para Destacado vs web `success` con icono Star (L125-136).
- Mini-stats (L96-113): 4 tiles `Mini` — Adherencia `{adherence}%`, Peso hoy `{currentWeight}` con sub `↑/↓{delta} 7d`, Energía 5 Stars, Último log dot+label. Label `fontSize8 HankenGrotesk_700Bold uppercase ls0.4` (L223); valor `fontSize14 Archivo_800ExtraBold` (L224). r5 §2.5 L93: web valor 15.5 font-black(900) sin uppercase → RN midio 17/800 con label uppercase (nota: r5 audito otra variante del componente; el codigo actual usa 14/800 — verificar en implementacion).
- Sparklines (L115-125): `Sparkline` width `CONTENT_W/2-6` height28, peso color `theme.cyan`, adherencia color `SUCCESS`; guard `>= 2` puntos, si no "Sin datos" (L119,123). Web usa recharts AreaChart height32 con gradiente; el `Sparkline` RN es de linea sin area (adaptacion documentada Ola0 L6616 — mismo componente que el resto del app).
- Bloque programa (L127-141): con programa `backgroundColor:theme.primary+'10' borderColor:+'22'` + Dumbbell + nombre + `Sem {weekCur}/{weekTot}` + `Bar`; sin programa `metaPill` dashed "Sin programa".
- Bloque nutricion (L143-153): solo si `nutri>0`, tono `(risk?DANGER:SUCCESS)+'12'/'28'` + Apple + label + `{nutri}%` + Bar. **Divergencia:** web usa EMBER (no SUCCESS) para el estado no-riesgo (ClientCardV2 L417 `bg-ember-100`).
- Suscripcion (L155-157): `Suscripción: {subDays>0?\`${subDays}d restantes\`:'vencida'}` color `<=5?DANGER:mutedForeground`. **Divergencia copy:** RN "{n}d restantes"/"vencida" vs web "{n} días"/"Vencida".
- Footer (L159-165): `FootBtn` WA(si onWhatsApp)/Perfil/Entreno/Nutri, `fontSize10 HankenGrotesk_700Bold uppercase ls0.4` (L239). **Divergencia copy:** RN "Entreno" vs web "Workout" (ClientCardV2 L525).
- **Menu propio (Modal, L167-182):** RN usa un `<Modal animationType=fade>` con backdrop + card, 4 items: **Compartir acceso**(Share2), **Pausar/Activar alumno**(Pause/Play), **Reset contraseña**(KeyRound), **Eliminar**(Trash2 danger) (L63-68). NO reusa `ClientActionsSheet`. Web `ClientCardV2` usa `DropdownMenu` con Ver perfil/WhatsApp/Entrenamiento/Nutrición (L310-334) + botones separados ResetPassword/ToggleStatus/Trash2. Los conjuntos difieren (ClientCardV2 es dead code → sin canon vivo estricto).

**Nota de disciplina:** el menu inline de `ClientCard.tsx` (Modal propio) es archivo PROPIO de esta unidad; `ClientActionsSheet.tsx` es READ-ONLY (owner `directory-sheets`). El `DirRowCard` SÍ debe seguir invocando `ClientActionsSheet` (ya lo hace).

---

## 4. Datos / queries / claves de dia

Las cards son **presentacionales**: reciben `DirectoryClient` + `PulseRow` ya computados. Sin queries propias.
- `DirectoryClient` (clients-directory.ts:56-73): id, fullName, email, phone, isActive, isArchived, forcePwChange, activeProgramName, planDaysRemaining, hasActiveProgram, attentionScore, attentionFlags, lastWorkoutDate, subscriptionStartDate.
- `PulseRow` (clients-directory.ts:29-44, 1:1 web `DirectoryPulseRow`): percentage, nutritionPercentage, weightHistory30d, adherenceHistory4w, currentWeight, weightDelta7d, latestEnergyLevel, streak, planCurrentWeek, planTotalWeeks, attentionScore, attentionFlags, lastWorkoutDate. Servido por `/api/mobile/coach/clients/pulse` (`getCoachDirectoryPulse`, L83-91).
- `attentionScore`/`attentionFlags` computados en `getCoachDirectoryClients` (clients-directory.ts:161-196): scoring INACTIVO+10, PENDIENTE_SYNC+10, SIN_PROGRAMA+20 | PLAN_VENCIDO+30, SIN_WORKOUT_7D+30, SIN_CHECKIN_1M+20, `min(100,score)`.
- `subscriptionDaysRemaining(startDate)` (clients-directory.ts:76-81): `start + 1 mes − hoy`, `Math.ceil(/86400000)`.
- **Clave de dia (gotcha 6d):** los diffs de dias en las cards usan `Math.floor((Date.now()-new Date(date))/86400000)` (DirRowCard usa `lastInfo` directory-shared.ts:45; ClientCard `lastLog` L35). Es un delta de milisegundos (no dia-calendario Santiago). El riesgo/estado aguas arriba (attentionScore) tampoco pasa por `getSantiagoIsoYmdForUtcInstant`. **Paridad con web es exacta** (web usa `differenceInDays(new Date(), new Date(last))`, DirRowCard web L76) — ambos usan delta local, NO dia Santiago. Mantener paridad = mantener el delta local; no introducir Santiago aqui salvo que se corrija tambien en web. Documentado, sin accion en esta unidad.

## 5. Estados vacio / carga / error
- **Sin pulse** (DirRowCard): web muestra `0%` + oculta badge severidad; RN oculta `%` + muestra badge (INVERTIDO, §3.1). Sin spinner: la card se pinta con lo que haya.
- **Sin entreno**: web `'—'` dot rojo; RN "Sin entrenos" dot gris (§3.1).
- **Sin sparkline data** (ClientCard): "Sin datos" (RN L119,123; web L67-73).
- **Sin programa** (ClientCard): pill dashed "Sin programa" (RN L138-140) / "Sin programa asignado" (web L479-484).
- Carga/skeleton: web `ClientCardV2Skeleton` (dead); el skeleton del directorio mobile lo maneja `clientes.tsx` (owner `directory-screen`), no las cards.

## 6. Accesibilidad
- Kebab DirRowCard: `accessibilityRole="button"` + `accessibilityLabel={\`Acciones de ${item.fullName}\`}` (RN L113-114) = web `aria-label` (L162). `hitSlop={8}` (RN L115).
- Cuerpo fila: `TouchableOpacity activeOpacity={0.75}` (RN L66) = adaptacion de `hover:bg-surface-sunken` web. `testID` en fila/kebab (RN L63,112).
- ClientCard kebab `hitSlop={8}` (L93). Menu items `client-actions-{key}` testIDs en ClientActionsSheet (READ-ONLY).

## 7. Animaciones
- DirRowCard: `MotiView` entrada `opacity/translateY` timing 300 delay `min(index*40,320)` (RN L57-61). Extra RN, no rompe paridad.
- ProgressRing: spring al cambiar value (ProgressRing.tsx:74-78), respeta reduce-motion. Web `CircularProgressbar` sin animacion de spring (paridad aceptable, Ola0).
- ClientCardV2 web: `motion.div` variants + `whileHover y:-6` (L211-226) — sin equivalente en `ClientCard.tsx` RN (grid montado en FlatList con animacion de stack del padre).

---

## 8. Hallazgos Ola 0 (grep `ola0-hallazgos.json`)
- `"DirRowCard"` — bloque de discrepancias `ola0-hallazgos.json:6618-6699`: 13 discrepancias (P1: adherencia/badge sin pulse, dot sin entreno, nutricion color; + P2 x10) + nota de paridad correcta L6698. Todas transcritas en §3.1/§5. Entrada de inventario L10711-10713.
- `"ClientCard"` grid — sin bloque de discrepancias propio (auditoria fina diferida, r5 §2.5). Inventario L10735-10740 ("ClientCard mobile (pulse de cliente)", webPath `CoachWarRoom.tsx`, "ClientCardV2 web dead code"). Sparkline compartido: L6599,6604,6616 (call sites `ClientCard.tsx:116,120` pasan width/height explicitos, guard `>=2`).
- `MoreVertical`/kebab: L6677-6681 (color/footprint P2).

## 9. Hallazgos ronda 5 (`r5-audit-coach-core.md`)
- §2.2 (L77-95) DirRowCard: nombre weight 800→**RESUELTO** (ahora displayBlack 900, RN L154); inicial weight 800→**RESUELTO** (RN L77); control trailing ChevronRight→**RESUELTO** (ahora MoreVertical→ClientActionsSheet, RN L111-136). Los items MetricChip/PulseCard (L93,95) pertenecen a otras unidades (DirectorySummary/PulseCard), no a esta.
- §2.5 (L100): "ClientCard (grid) / Import wizard — no auditados esta ronda (R5.2)".
- §2.6 (L110-111): ClientCard grid — nombre size 25 vs 24 ls, iniciales avatar 22 vs 20. (Referencia a `ClientCardV2` L202,253; el codigo RN actual `ClientCard.tsx` usa nombre 15/800 y avatar 20/900 en el header compacto — la variante auditada en r5 difiere del layout compacto actual; verificar en implementacion.)
- Cierre (L133-134): DirRowCard auditado 1:1; "ClientCard grid" pendiente R5.x.

---

## 10. Mapa de interacciones (todos los tocables web → efecto)

### DirRowCard (web L88-171)
| Tocable | Web (archivo:linea) | Efecto | RN actual |
|---|---|---|---|
| Cuerpo de la fila | L89-95 `onClick`/`onKeyDown Enter` | `router.push(/coach/clients/{id})` (ficha) | `onPress={()=>onOpen(item)}` (L65) → padre navega a ficha |
| Kebab MoreVertical | L159-169 `onClick stopPropagation → onActions()` | Abre `ClientActionsSheet` (levantado en padre) | `onPress={()=>setMenu(true)}` (L116) → `ClientActionsSheet` embebido (L123) |

### ClientActionsSheet (READ-ONLY, owner directory-sheets) — que abre el kebab
Web (`clients/ClientActionsSheet.tsx`): Ver ficha completa→`/coach/clients/{id}`; Enviar WhatsApp(si phone)→`window.open(wa.me…)`; Editar datos→`onEdit`; Resetear contraseña→confirm→`resetClientPasswordAction`; Pausar/Reactivar→confirm→`toggleClientStatusAction`; Archivar/Desarchivar→confirm→`archive/unarchiveClientAction`; Eliminar→confirm(escribe nombre)→`deleteClientAction`.
RN (`directory/ClientActionsSheet.tsx`): Ver ficha completa; Enviar WhatsApp(si onWhatsApp); Compartir acceso; Programa de entreno; Nutrición; Resetear contraseña; Pausar/Activar acceso; Eliminar. **Divergencia de items** (RN suma Compartir/Entreno/Nutrición, omite Editar datos/Archivar) — corresponde a `directory-sheets`, NO a esta unidad. Aqui solo se cablea el trigger (correcto).

### ClientCardV2 (grid, dead code web) → mapeo a ClientCard RN
| Tocable web | Web | Efecto | RN (`ClientCard.tsx`) |
|---|---|---|---|
| Nombre (Link) | L266-271 | `/coach/clients/{id}` | `onPress={onPress}` en nombre (L88) |
| ResetPasswordButton | L279-282 | reset password | via menu "Reset contraseña" → `onResetPw` (L66) |
| ToggleStatusButton | L283-287 | pausar/activar | via menu "Pausar/Activar" → `onToggleStatus` (L65) |
| Boton Trash2 | L288-296 | `setDeleteOpen` (AlertDialog) | via menu "Eliminar" → `onDelete` (L67) |
| Dropdown MoreHorizontal | L297-336 | menu Ver perfil/WA/Entreno/Nutri | kebab MoreVertical → `setMenu(true)` (L93), Modal propio (L167) con Compartir/Pausar/Reset/Eliminar |
| Footer WA | L505-514 | `whatsappLink` _blank | `FootBtn WA → onWhatsApp` (L161) |
| Footer Perfil | L515-520 | `/coach/clients/{id}` | `FootBtn Perfil → onPress` (L162) |
| Footer Workout | L521-526 | `/coach/builder/{id}` | `FootBtn Entreno → onWorkout` (L163) |
| Footer Nutri | L527-532 | `/coach/nutrition-plans/client/{id}` | `FootBtn Nutri → onNutrition` (L164) |
| AlertDialog "Sí, eliminar" | L552-558 | `deleteClientAction` | delegado a `onDelete` (padre confirma) |

> Los handlers `onWhatsApp/onShareLogin/onToggleStatus/onResetPw/onDelete/onWorkout/onNutrition/onPress` de `ClientCard` (Props L20-31) los provee `clientes.tsx` (owner `directory-screen`) — esta unidad NO define su logica, solo los cablea a los tocables.

---

## 11. Riesgos / gotchas de clase aplicables
- **6a (@gorhom -999):** N/A. Ni `DirRowCard` ni `ClientCard` usan `@gorhom/bottom-sheet`. El `ClientActionsSheet` (READ-ONLY) y el Modal inline de `ClientCard` usan `Modal` nativo RN (ClientActionsSheet.tsx:60; ClientCard.tsx:167) → sin bomba -999.
- **6b (fetch congelado):** N/A. Cards presentacionales, sin fetch propio.
- **6c (Fabric 45798 TextInput por focus):** N/A. Sin `TextInput` en las cards.
- **6d (dia Santiago):** los deltas de dias usan `Date.now()-new Date(date)` local, en paridad con web (`differenceInDays`); documentado en §4, sin accion en esta unidad.
- **6e (notificaciones):** N/A.

## 12. Adaptaciones idiomaticas RN (documentadas, preservan lo que el usuario ve/hace)
- `hover:bg-surface-sunken` → `activeOpacity={0.75}` (DirRowCard L66; ClientCard TouchableOpacity).
- `onKeyDown Enter` → sin equivalente tactil (solo teclado web); el tap ya cubre la accion.
- Web levanta 1 `ClientActionsSheet` en el padre; RN embebe uno por fila / usa Modal inline en grid → superset funcional, mismas acciones (no perdida).
- `recharts AreaChart` (area con gradiente) → `Sparkline` RN de linea (mismo componente del resto del app; Ola0 L6616). Cambio visual menor, no de gesto.
- **Sin cambios de GESTO** que requieran decision CEO en esta unidad: cuerpo→ficha y kebab→menu se preservan en ambas cards.
