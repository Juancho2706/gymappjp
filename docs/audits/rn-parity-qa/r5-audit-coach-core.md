# R5 — Auditoría pixel COACH CORE (RN vs web md<760)

Ronda 5. Referencia = árbol web `apps/web/src/app/coach/{dashboard,clients}/**` en su rama md (mobile). RN = `apps/mobile/**`. Cada fila: **elemento → web (valor + archivo:línea) → RN (valor + archivo:línea) → DIFF**. COPY neutralizado (sin voseo). Clasificación: `PX` = diff pixel, `EST` = diff estructural.

Convenciones de fuente RN (lib/typography): `font-display-black`=Archivo_900Black, `font-display-bold`=Archivo_800ExtraBold, `font-sans-bold`=Hanken_700, `font-sans-extra`=Hanken_800ExtraBold(uiExtra), `font-sans-semibold`=Hanken_600. Web `font-black`=900, `font-extrabold`=800, `font-bold`=700.

Rutas cortas:
- RN dashboard: `apps/mobile/components/coach/CoachDashboardSections.tsx` (= **CDS**), `apps/mobile/app/coach/(tabs)/home.tsx`
- RN directorio: `apps/mobile/app/coach/(tabs)/clientes.tsx`, `apps/mobile/components/coach/directory/*`
- RN ficha: `apps/mobile/components/coach/clientDetail/*`, `apps/mobile/app/coach/cliente/[clientId].tsx`

---

## 1. DASHBOARD

### 1.1 GreetingHeader — web `dashboard/_components/header/GreetingHeader.tsx` · RN `CDS` MobileGreetingHeader (L1747)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Saludo (texto) | Hora-del-día `{greeting}, ` + firstName en `text-sport-500` (coloreado). greeting = "Buenos días / Buenas tardes / Buenas noches" (useTimeOfDayGreeting) — L11,22-24 | Hardcode `Hola, {firstName}`, todo `text-strong` sin color en el nombre — L1793 | **EST** — falta saludo por hora + falta firstName coloreado sport. Neutralizar: "Buenos días/tardes/noches". |
| Saludo (size/weight) | `font-display text-3xl(31) font-black tracking-[-0.03em]` (sm:4xl) — L22 | `font-display-black text-[28px]` ls -0.84 — L1789-1790 | **PX** — size 28 vs 31. |
| Fecha (eyebrow) | `text-xs(12) font-semibold uppercase tracking-[0.18em] text-muted` — L21 | `font-sans-semibold text-[13px] text-muted`, NO uppercase, sin tracking (solo capitaliza 1ª letra) — L1785 | **PX** — falta uppercase + tracking (0.18em·12≈2.16) + size 12 vs 13. |
| Subtítulo pendientes | `text-sm text-muted`: "Tienes N pendiente(s) hoy." / "Todo al dia. Buen momento para planificar." — L25-29 | AUSENTE (RN pone fila de botones de acción en su lugar) — L1797 | **EST** — falta la línea de pendientes. |

### 1.2 PulseHero — web `dashboard/_components/PulseHero.tsx` · RN `CDS` MobilePulseHero (L2102)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Métrica (número) | `eva-metric text-[27px] leading-none` (clase métrica web — verificar familia mono/tabular) — L104 | `font-display-black text-[27px]` lh 28 (Archivo) — L2178-2179 | **PX** — familia: web `eva-metric` vs RN display-black. Confirmar la familia real de `.eva-metric` en globals.css y espejarla. |
| Delta color bueno/malo | `var(--success-600)` / `var(--danger-600)` — L34 | `#10B981` / theme.destructive(#F4365A) — L2091 | **PX** — success-600 light=#0F7D50 (más apagado) vs #10B981; danger-600=#BE183C vs #F4365A. |
| Label eyebrow | `text-[10.5px] font-extrabold uppercase tracking-[0.06em]` — L100 | `font-sans-extra text-[10.5px] uppercase tracking-[0.6px]` — L2174 | OK (0.06em·10.5≈0.63). |

### 1.3 PriorityCard / FocusList — web `dashboard/_components/PriorityCard.tsx` · RN `CDS` MobileFocusList (L2325)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Eyebrow "Prioridad de hoy" | `text-[11px] font-extrabold(800) uppercase tracking-[0.08em] text-sport-400` — L160 | `font-sans-bold(700) uppercase text-[11px] tracking-[1px] text-sport-400` — L2363 | **PX** — weight 700 vs 800. |
| Badge conteo | `text-[11px] font-extrabold(800)` color ink-950 — L164 | `font-sans-bold(700)` color #0B0E13 — L2370 | **PX** — weight 700 vs 800. |
| Avatar fila-riesgo | `<Avatar size="sm">` SIN ring — L211 | `<Avatar size="sm" ring="sport">` — L2413 | **PX** — RN agrega ring="sport" inexistente en web. |
| Inset "Tu próximo paso" (NextStepInset) | icono tono-específico (CalendarX/OctagonAlert/Activity/CalendarClock/CheckCircle2) en `size-8 rounded-full bg-white/8` color=tono; eyebrow **"Tu próximo paso"** `text-[10px] font-extrabold uppercase tracking-[0.07em]` color=tono; título `text-[13.5px] font-bold`; CTA color=tono + ArrowRight; radius `rounded-[10px]` — L90-125 | Sparkles pelado (sin círculo, siempre theme.primary); SIN eyebrow "Tu próximo paso"; AGREGA descripción de 2 líneas; título `text-[13px]`; CTA siempre `text-sport-400` sin flecha; radius `rounded-xl`(17) — L2441-2459 | **EST** — reconstruir: icono por tono en círculo + eyebrow "Tu próximo paso" tono + SIN descripción + CTA tono+flecha + radius 10. |
| "Ver todos en Alumnos" | `font-extrabold(800) text-[13px] rounded-sm` + ArrowRight 14 — L248 | `font-sans-bold(700) text-[13px]` + ArrowRight 14 — L2466 | **PX** — weight 700 vs 800. |

### 1.4 TodayAgenda — web `dashboard/_components/today/TodayAgenda.tsx` · RN `CDS` MobileTodayAgenda (L2626)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Título | `font-display text-lg(18) font-black(900)` + CalendarClock `size-4`(16) sport-500 — L22-24 | `font-display-bold(800) text-[17px]` + CalendarClock 17 primary — L2634-2635 | **PX** — size 18 vs 17, weight 900 vs 800, icon 16 vs 17. |
| Icono de fila | EMOJI ⏳/📷/💪 en `size-8`(32) `rounded-full bg-surface-sunken` (círculo neutro) — L10-14,48-52 | LUCIDE Clock/Camera/Dumbbell color=primary en `h-7 w-7`(28) `rounded:8`(7px) bg primary/0.1 — L2652-2663 | **EST** — web usa emoji en círculo neutro 32px; RN usa lucide brand en squircle 28px. |

### 1.5 Novedades / NewsFeed — web `dashboard/_components/NewsFeed.tsx` · RN `CDS` MobileNovedades (L2803)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Tono/icono actividad | ACT_TONE: nuevo alumno=sport-100/**sport-600 (AZUL)**; check-in=success-100/**success-600 (VERDE)**; workout=ember-100/**ember-700 (NARANJO)**. ACT_ICON check-in=**CheckCircle** — L12-22 | nuevo alumno=**#10B981 (VERDE)**; check-in=**#3B82F6 (AZUL)**; else=primary. check-in icon=**Camera** (ActivityTypeIcon) — L2724-2728,2916 | **EST** — colores verde/azul INVERTIDOS vs web; workout usa brand no ember; icono check-in Camera vs CheckCircle. |
| Layout fila actividad | 1 línea truncada (nombre bold inline, SIN subtítulo) + señal review + hora `text-[11.5px] text-subtle` — L192-244 | ListRow con title + **subtitle** (2 líneas) + hora `text-[11px] text-muted` — L2922-2957 | **EST** — web = 1 línea; RN = 2 líneas (ListRow). |
| Icono fila programa | bg `var(--danger-100)`/`var(--warning-100)` (tokens sólidos), color danger-600/warning-600 — L171-178 | bg rgba(244,54,90,0.12)/rgba(245,158,11,0.14), color #F4365A(danger-**500**)/#F59E0B — L2891-2896 | **PX** — tint rgba vs token-100; color -500 vs -600. |
| Filtro segmentado | pill tablist custom `rounded-pill bg-surface-sunken p-1`, activo `bg-surface-card shadow-sm text-[12px] font-bold` — L106-139 | `<SegmentedTabs size="sm">` — L2853-2862 | **PX** — verificar paridad visual de SegmentedTabs. |
| Título "Novedades" | `font-display text-[17px] font-extrabold(800) tracking-[-0.02em]` | `font-display-bold(800) text-[17px]` — L2844 | OK. |

### 1.6 Banners — web `dashboard/_components/banners/BillingBanners.tsx` · RN `CDS` MobileBillingBanners (L137)
No auditado a fondo esta ronda. RN usa tonos hardcode (#F43F5E/#F59E0B) — confirmar contra tokens danger/warning del banner web. Pendiente R5.1.

---

## 2. DIRECTORIO

### 2.1 Action bar — web `clients/DirectoryActionBar.tsx` · RN `clientes.tsx` (BarButton L463, actionBar L510)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Botón barra activo | fill sólido ink: `border-text-strong bg-text-strong text-surface-card`, `size-12`(48) `rounded-control border-[1.5px]` — L56-60 | tint marca: `bg-primary/0.12 border-primary`, 48×48 radius 14 bw 1.5 — L488-493,517-524 | **EST/PX** — estado activo relleno-ink vs tint-marca. |
| Iconos barra | `h-4 w-4`(16) — L223,231,237 | size 18 — L347,350,353 | **PX** — 18 vs 16. |
| Sheet Filtros | UN sheet, 3 grupos: **Estado + Riesgo + Programa** (SheetCheckRow, check sport-600) + footer "Ver resultados" + título "Filtros" — L266-339 | Botón Filtrar abre SOLO opciones de **Estado** (DirectoryOptionSheet); sin grupo Riesgo ni Programa — L433-441 | **EST** — faltan grupos Riesgo y Programa en el sheet de filtros (riesgo solo vía tiles del Resumen). |
| Línea conteo | `text-xs(12) text-muted`: "N alumnos · {orden}" — L258-263 | "N resultados · {orden} (↑/↓)" — L280-282 | **PX/copy** — dice "resultados" no "alumnos"; agrega flecha dirección inexistente en web. |
| Chip X | `opacity-70` — L33 | opacidad plena — L269 | **PX** — falta opacity-70. |

### 2.2 DirRowCard — web `clients/DirRowCard.tsx` · RN `directory/DirRowCard.tsx`

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Nombre | `font-display font-black(900) text-[15.5px] tracking-tight`(-0.155) — L123 | FONT.displayBold(800) 15.5 ls -0.2 — L112 | **PX** — weight 800 vs 900. |
| Inicial del anillo | `font-display text-lg(18) font-black(900)` — L109 | FONT.displayBold(800) 18 — L59 | **PX** — weight 800 vs 900. |
| Control trailing | IconButton **MoreVertical** → abre ClientActionsSheet (acciones por fila) — L159-169 | **ChevronRight** decorativo (sin menú de acciones) — L93 | **EST** — falta el botón de acciones por fila (MoreVertical). |
| Separadores "·" | `text-[var(--border-strong)]` — L140 | theme.border — L76,80 | **PX** — border vs border-strong. |

### 2.3 WarRoom móvil / DirectorySummary — web `clients/CoachWarRoom.tsx` (bloque `md:hidden`) · RN `directory/DirectorySummary.tsx` + `clientes.tsx` ScreenHeader

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Header | eyebrow "Tu seguimiento de hoy" `text-[12px] font-bold uppercase tracking-[0.08em]` + h1 "Alumnos" `text-[26px] font-black leading-[1.1] tracking-[-0.03em]`; a la derecha IconButtons **copiar-portal (LinkIcon)** + **importar (FileUp)** size-sm soft — L257-285 | ScreenHeader subtítulo "N activos · N total"; trailing = pill Herramientas; SIN botón copiar-portal; importar es FAB — L313-331 | **EST** — eyebrow distinto, faltan icon-buttons copiar-portal/importar en header. |
| Entrada Herramientas | card full-width `rounded-card border bg-surface-card` con tile `h-[38px] w-[38px] rounded-[11px] bg-sport-100 text-sport-600 LayoutGrid 19` + "Herramientas" `text-sm font-bold` + subtítulo "Cardio · Movimiento · Composición" `text-[11.5px]` + chevron — L289-305 | pill chica en header: Wrench 15 + "Herramientas" 13 — L317-329 | **EST** — reconstruir como card prominente con subtítulo. |
| Métricas secundarias | grid-4: Total · Activos · **Adher. %** · **Nutri.** (nutrition-low) — L362-385 | grid-4: Total · Activos · **On track** · **Sin plan** — L124-129 | **EST** — set de métricas distinto (faltan Adher.% y Nutri.; sobran On track y Sin plan). |
| MetricChip valor/label | valor `font-display text-[15.5px] font-black(900)`; label `text-[9.5px] font-semibold` sin uppercase — L166,174 | valor 17 displayBold(800); label 9.5 uiBold UPPERCASE ls 0.5 — L162-163 | **PX** — size 17 vs 15.5, weight 800 vs 900, label uppercase de más. |
| "Resumen · hoy" | eyebrow `text-[11px] font-black uppercase tracking-[0.08em] text-subtle` + **colapsable** (ChevronDown, línea-resumen colapsada) — L308-332 | eyebrow 11 uiExtra uppercase ls 1, **no colapsable** — L133,168 | **PX/EST** — falta comportamiento colapsable + persistencia. |
| PulseCard valor/label | valor `text-[30px] font-black`; label `text-[11.5px] font-black tracking-[0.02em]` — L122,109 | valor 30 displayBlack lh32; label 12 uiExtra ls 0.2 — L155-156 | **PX** — label 12 vs 11.5. |

### 2.4 FABs (clientes.tsx) — nota
RN tiene 2 FABs: primario pill "Nuevo alumno" (L412-421) + secundario Importar `Upload` (L402-410). El web md<760 no usa FABs (nuevo-alumno/importar viven como icon-buttons del header WarRoom). **EST** de patrón — decisión de chrome móvil; baja prioridad, pero confirmar con CEO si se mantiene el doble-FAB.

### 2.5 ClientCard (grid) / Import wizard — no auditados esta ronda (R5.2).

---

## 3. FICHA

### 3.1 ClientHero — web `clients/[clientId]/ClientProfileHero.tsx` · RN `clientDetail/ClientHero.tsx`

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Nombre | `font-display text-2xl(24) font-black tracking-tighter`(-0.05em≈-1.2) — L202 | 25 displayBlack ls -0.6 — L229 | **PX** — size 25 vs 24, ls -0.6 vs ≈-1.2. |
| Iniciales avatar | `font-display text-xl(20) font-extrabold(800) tracking-[-0.02em]` — L253 | 22 displayBold(800) ls -0.4 — L235 | **PX** — size 22 vs 20. |
| Meta racha (copy) | "N d de racha de actividad" — L282 | "N d de racha" — L152 | **PX/copy** — falta "de actividad". |
| Iconos meta | `h-3.5`(14) — L281,285,289,293 | size 13 — L152-155 | **PX** — 13 vs 14. |
| Delta peso | `.toFixed(1)` → "+1.5 kg" — L312,316 | crudo → "+2 kg" — L201 | **PX** — falta formateo a 1 decimal. |
| Barra adherencia | `h-1 bg-[var(--border-inverse)]` fill `bg-sport-500` — L399-405 | height 4 bg rgba(255,255,255,0.14) fill primary — L210,248 | **PX** — track border-inverse vs rgba-white; fill sport vs brand. |
| Icono Activity meta | `text-sport-400` (fijo) — L285 | theme.primary (brand) — L153 | **PX** — sport-400 vs brand. |

### 3.2 ClientTabBar — web `clients/[clientId]/ProfileTabNav.tsx` · RN `clientDetail/ClientTabBar.tsx`
Set de tabs y estilo de pill **COINCIDEN**: 5 tabs Resumen · Progreso · Entreno · Programa · Nutrición (RN cliente/[clientId].tsx L222-227, sin Facturación); pill `h-38 px-3.5 gap-1.5 border-1.5` activo sport-500, badges `h-18` OK.

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Fondo contenedor | `bg-color-mix(surface-app 80%) backdrop-blur(12px)` (glass translúcido) — L87 | `bg-surface-app` sólido, sin blur — L36 | **PX** — falta el glass/blur del contenedor sticky. |

### 3.3 ProfileFloatingActions — web `clients/[clientId]/ProfileFloatingActions.tsx` · RN `clientDetail/ProfileFloatingActions.tsx`
**COINCIDE**: WhatsApp #16A34A, alto 44/38 compact, gutter 20/56, radius control(≈14), label 14 bold, glifo idéntico, sombra dura. Sin diffs.

### 3.4 Paneles de tabs (Overview/Progreso/Entreno/Programa/Nutrición) + dossier — no auditados a fondo (R5.3). Cada `clientDetail/*Tab.tsx` requiere pasada propia vs su panel web (`ProfileOverviewB3`, `ProgressBodyCompositionB6`, `TrainingTabB4Panels`, `ProgramTabB7`, `NutritionTabB5`).

---

## Resumen de cobertura
- **Auditado 1:1**: GreetingHeader, PulseHero, PriorityCard/FocusList, TodayAgenda, Novedades/NewsFeed, DirectoryActionBar, DirRowCard, WarRoom/DirectorySummary, ClientHero, ClientTabBar, ProfileFloatingActions.
- **Pendiente (R5.x)**: BillingBanners, ClientCard grid, Import wizard, 5 paneles de tab de la ficha, dossier PDF, sheets de acciones (ClientActionsSheet vs DirectoryOptionSheet).
- **Match limpio (sin diffs)**: ProfileFloatingActions, set+estilo de ClientTabBar.

Prioridad para el fixer (mayor impacto visual): #1.3 NextStepInset (EST), #1.5 tonos actividad invertidos (EST), #1.4 emoji vs lucide agenda (EST), #2.3 métricas Resumen distintas (EST), #2.1 sheet de filtros incompleto (EST), #1.1 saludo por hora + nombre sport (EST).
