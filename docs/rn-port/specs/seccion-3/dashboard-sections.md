# SPEC — Unidad `dashboard-sections` (Seccion 3, COACH)

> **Monolito** `apps/mobile/components/coach/CoachDashboardSections.tsx` (4405 L) — dueño único de esta unidad.
> Web = fuente de verdad. Cada afirmación cita `archivo:lineas`. Copy VERBATIM neutro (regla 5).
> **Rutas citadas**: web bajo `apps/web/src/`; mobile bajo `apps/mobile/`; el monolito abreviado `CDS.tsx`.

---

## 0. Fuente de verdad de la estructura móvil

La rama móvil del dashboard web NO es `DashboardContent`/`DesktopBento`; es el bloque `md:hidden` de
`app/coach/dashboard/_components/DashboardShell.tsx:106-184`. Orden de secciones móvil (LA referencia del screen):

1. `BillingBanners` + `FreeTierBanner`/`TeamsBridgeBanner` (`DashboardShell.tsx:91-104`, fuera del árbol de diseño, `mb-4 empty:hidden`).
2. `header` — fecha `todayLabel()` + `Hola, {firstName}` + cluster (Insights, `NewsBellButton`, avatar/workspace) (`:108-157`).
3. `PulseHero` (`:159`).
4. `PriorityCard` con `showNextStep` (`:161-171`, `mb-[22px]`).
5. `AgendaCard` (`:173-175`, `mb-6`) ← **NO** `today/TodayAgenda.tsx` (ver §7 / Ola0).
6. `NewsFeed` (`:177-183`, `mb-[18px]`).
7. `CoachOnboardingChecklist` (`:191-194`, `mt-5`, compartido con desktop).

El contenedor raíz monta `<AmbientBrandGlow />` como primer hijo con `-z-10 isolate` (`:86-87`).

**Orden RN actual** (`app/coach/(tabs)/home.tsx:107-167`): banners → tier banners → GreetingHeader → PulseHero →
FocusList → TodayAgenda → **Novedades** → OnboardingGuideChip → sheets. Coincide 1:1 salvo: (a) usa
`MobileOnboardingGuideChip` (chip colapsable) en vez de portar `CoachOnboardingChecklist`; (b) no monta `AmbientBrandGlow`
(pendiente shell — ver cambiosShell); (c) el checklist va DESPUÉS de Novedades vs web `mt-5` bajo el bento.

**Nota fuente-de-verdad del header**: el header de `DashboardShell.tsx:108-157` (md:hidden) hardcodea `Hola, {firstName}`
28px, sin saludo-por-hora, sin línea de pendientes, sin `sport-500`. El brief nombra `header/GreetingHeader.tsx` +
`_hooks/useTimeOfDayGreeting.ts` como fuente → esos SÍ traen saludo-por-hora + `firstName` en `text-sport-500` + línea de
pendientes. **RN sigue `GreetingHeader.tsx`** (correcto per brief), no el header simplificado del shell. Documentado como
decisión de fuente en §7.

---

## 1. Inventario de exports (CDS.tsx) y su fuente web

| Export RN | RN L | Web fuente | Montado en home.tsx |
|---|---|---|---|
| `MobileBillingBanners` | 138 | `banners/BillingBanners.tsx` | Sí (107) |
| `MobileTierUsageBanners` | 205 | `DashboardShell.tsx:98-103` (FreeTier/TeamsBridge) | Sí (109) |
| `MobilePublicCodeRequiredModal` | 356 | (RN-nativo, sin espejo web directo) | Sí (163) |
| `MobileFreeWelcomeModal` | 448 | `FreeWelcomeModal.tsx` | Sí (162) |
| `MobileOnboardingChecklist` | 625 | `CoachOnboardingChecklist.tsx` + `_components/onboarding/*` | **NO** (dead export; home usa el chip) |
| `MobileQuickActionsBar` | 1059 | `header/QuickActionsBar.tsx` | **NO** (dead export) |
| `MobileQuickActionsFab` | 1112 | `DashboardFab.tsx` | Sí (171) |
| `MobileOnboardingGuideChip` | 1209 | (RN-específico; espejo del chip de `coach-dashboard.jsx`) | Sí (149) |
| `MobileGreetingHeader` | 1748 | `header/GreetingHeader.tsx` + `_hooks/useTimeOfDayGreeting.ts` | Sí (113) |
| `CoachNewsBell` | 1985 | `components/coach/NewsBellButton.tsx` | Sí (interno a GreetingHeader, CDS.tsx:1822) |
| `MobilePulseHero` | 2117 | `PulseHero.tsx` + `EvaCountUp.tsx` + `Sparkline.tsx` | Sí (122) |
| `MobileKpiStrip` | 2226 | `kpi/KpiStrip.tsx` + `KpiTile.tsx` | **NO** (dead export; es la tira del bento desktop) |
| `MobileFocusList` | 2340 | `PriorityCard.tsx` (+ `focus/FocusList.tsx` para el bento) | Sí (130) |
| `MobileNextBestAction` | 2587 | `cs/NextBestAction.tsx` + `_lib/nextBestAction.rules.ts` | **NO** (dead export; embebido dentro de FocusList) |
| `MobileTodayAgenda` | 2659 | `AgendaCard.tsx` (móvil) / `today/TodayAgenda.tsx` (bento) — **CONFLICTO §7** | Sí (139) |
| `MobileExpiringPrograms` | 2707 | `expiring/ExpiringPrograms.tsx` | **NO** (dead export; bento) |
| `MobileActivityFeed` | 2768 | `activity/ActivityFeed.tsx` | **NO** (dead export; bento) |
| `MobileNovedades` | 2841 | `NewsFeed.tsx` | Sí (142) |
| `MobileDashboardCharts` | 3012 | (charts del bento) | **NO** (dead export) |
| `MobileRevenueSheet` | 3161 | `sheets/RevenueSheet.tsx` | **NO** (dead export; no hay MRR tile en home) |
| `MobileClientStatsSheet` | 3269 | `sheets/ClientStatsSheet.tsx` | Sí (157) |

Exports **no** usados por `home.tsx` = espejos de piezas del `DesktopBento` (ola0 L6829 confirma "posible código muerto a
auditar aparte"). **NO eliminar sin nota** (regla 2): son ports válidos reutilizables; su ausencia en el screen móvil es
correcta porque el screen móvil web tampoco los renderiza (usa PulseHero+PriorityCard+AgendaCard+NewsFeed).

---

## 2. Datos / queries (todos por props del shell)

Todos los widgets reciben `data: MobileDashboardData` desde `home.tsx` (fetch único `getCoachDashboardDataMobile()`,
`home.tsx:40`). **Sin queries propias** salvo `CoachNewsBell` (§4.10). Campos consumidos: `coach` (CoachProfile),
`kpi` (MobileKpiSummary), `topRiskClients`, `agenda`, `expiringPrograms`, `recentActivities`, `clientStats`,
`clientList`, `activePlans`, `hasStudentSignal30d`, `pendingCheckinsCount`, `publicCode`.

- **Claves de día (gotcha 6d)**: NINGÚN widget de esta unidad usa `getSantiagoIsoYmdForUtcInstant`. El único cálculo
  temporal por-hora es el saludo (`CDS.tsx:1769` `new Date().getHours()`) y `timeAgo`/`newsRelativeDate` (deltas relativos,
  tz-agnósticos). El saludo usa hora del **device**, igual que web (`useTimeOfDayGreeting.ts:9`). Ver §7 (recomendación 6d).
- Escrituras POST del cliente (fuera del render de datos): `confirm_public_code`, `onboarding_event`,
  `persist_onboarding_guide` (`/api/mobile/coach/dashboard`); `create client` (`/api/mobile/coach/clients`);
  `payment` (`/api/mobile/coach/payments`); `markCoachNewsRead` (`lib/coach-news.ts:33`).

---

## 3. Tokens / tipografía / claro-oscuro (patrones transversales)

- **Fuentes** (via `lib/typography` `FONT.*`, aplicadas por `fontFamily` o `className`): `font-display-black`
  (Archivo 800), `font-display-bold`, `font-sans` / `font-sans-semibold` / `font-sans-bold` / `font-sans-extra`
  (Hanken Grotesk), `font-mono-bold`. Tokens de color: `text-strong`, `text-muted`, `text-subtle`, `text-body`,
  `text-on-dark`, `text-on-dark-muted`, `text-sport-400/500`, `bg-surface-card/inverse/sunken`, `border-subtle`.
- **Colores fijos on-dark** (PriorityCard/FocusList son SIEMPRE oscuras → no usar tokens que flipean): `#F4365A`
  (danger-500), `#1FB877` (success-500), `#4FD9A0`, `#FFC861`, `#939DAB`, `#0B0E13`/`#0B0E13`, `rgba(255,255,255,0.10)`
  = border-inverse. ola0 L6829 confirma estos idénticos a los tokens web.
- **Scheme-aware helpers RN** (los tokens `-100/-600/-700` divergen por tema en `globals.css`, y `theme.*` no cubre
  todos): `pulseDeltaView(...scheme)` (`CDS.tsx:2093-2109`) y `activityTone(type, scheme)` (`CDS.tsx:2761-2766`) resuelven
  el par [bg,fg] por `resolvedScheme`. Correcto.
- `useGlassStyle()` (`CDS.tsx:1727-1740`) + `CardGlass` (`CDS.tsx:112-135`) = espejo de `bg-black/40 backdrop-blur-xl`
  (BlurView `experimentalBlurMethod="dimezisBlurView"` — cumple gotcha del blur Android).

---

## 4. Spec por export (con evidencia)

### 4.1 `MobileBillingBanners` (CDS.tsx:138) ← `banners/BillingBanners.tsx`
- **Lógica idéntica**: `blocked`/`canceledGrace`/`trialActive` (RN 142-150 = web 24-28). `showRec = days<=7 &&
  activeClientCount>0`; `getRecommendedTier`/`TIER_CONFIG` (RN 162-164 = web 41-43).
- **Copy VERBATIM**: "Tu suscripcion esta cancelada. Reactiva para recuperar acceso." (RN 155 = web 33); "Cancelaste
  tu plan. Acceso hasta por N dia(s)." (RN 168 = web 46); "Periodo de prueba - N dia(s) restantes." (RN 187) — web usa
  "Periodo de prueba · N…" (web 68, separador `·`); "Con N alumnos: Plan {label} hasta {max}." (RN 172/191) vs web
  "Con N alumnos: **Plan {label}** (hasta {max}) · Activar {label}" (web 49/71).
- **Tonos (P0 R5.1)**: RN `MobileBanner` (CDS.tsx:310) hardcodea `danger=#F43F5E`, `warn=#F59E0B`, `info=theme.primary`;
  borde `hexToRgba(tone,0.32)`, fondo `hexToRgba(tone,0.1)`. Web usa tokens: `danger` → `border-danger-500/30
  bg-danger-100 text-danger-700`; `warn` → `warning-*`; `info` → `sport-*` (web 96-100). **Divergencia PX**: RN
  `#F43F5E` ≈ rose-500, NO es `--danger-500` (#F4365A) ni el fondo `danger-100`. El CTA "Revisar plan" pill (RN
  317-322, icono CreditCard) es RN-extra (web no tiene pill CTA; usa `<Link underline>` "Reactivar/Renovar/Activar
  plan"). Ver §7.
- **Interacción**: tap banner → `openCoachWebPath('/coach/subscription')` (link-out money-safety). Web: link a
  `/coach/subscription` o `/coach/reactivate?tier=X`. RN NO enruta a `/coach/reactivate` (siempre subscription).
- **Estados**: retorna `null` si no aplica ningún caso (RN 198 = web 83).

### 4.2 `MobileTierUsageBanners` (CDS.tsx:205)
- `MobileFreeTierBanner` (215): barra de uso `used/max` (max=`TIER_CONFIG.free.maxClients`), `pct`, fill `#10B981`
  (o `#F59E0B` si `full`). Copy "N/M alumnos - Plan gratuito" (237); CTA "Ver planes"/"Expandir limite" (252). Tap →
  `/coach/subscription`. Espejo de `FreeTierBanner` del shell (`DashboardShell.tsx:99`).
- `MobileTeamsBridgeBanner` (261): umbral `elite && totalClients>=80` (RN 210 = `DashboardShell.tsx:101`). Copy
  "N/M alumnos - X% de tu plan Elite" (285) + "¿Más de 100 alumnos o trabajas con otros profesionales? Conoce EVA
  Teams. Te contactamos a la brevedad." (287). CTA "Conocer Teams" → `mailto:contacto@eva-app.cl?subject=Quiero
  conocer EVA Teams` (270). Tono verde fijo `rgba(16,185,129,*)`.
- **Gate del shell**: `home.tsx:91-93` `showTierBanners = free || (elite && totalClients>=80)` — coherente con el
  umbral interno 80 (comentario `home.tsx:90` lo aclara).

### 4.3 `MobilePublicCodeRequiredModal` (CDS.tsx:356) — RN-nativo
- Modal `NativeDialog` no-cerrable (`showClose={false}`, `onClose={()=>{}}`, 403). Título "Tu link de alumnos cambio".
  Icono `LockKeyhole`. Muestra `studentPath=/c/{inviteCode}/login`. Botones: Copiar (Clipboard, "Copiado"), Compartir
  (Share), "Entendido" → POST `confirm_public_code` → `onConfirmed()` (refresh). Error: "No se pudo confirmar el codigo.
  Intenta de nuevo." (383). Sin espejo web directo (flujo específico de migración de slug móvil).

### 4.4 `MobileFreeWelcomeModal` (CDS.tsx:448) ← `FreeWelcomeModal.tsx`
- **Trigger diverge**: web abre con `?welcome=free` en query + `localStorage['eva_free_welcome_seen']` (web 17-22);
  RN abre por AsyncStorage `eva_free_welcome_seen` cuando `enabled` (subscriptionTier==='free'), sin query (452-461).
- **Hero**: icono Sparkles en cuadro `rgba(16,185,129,*)`; título "Bienvenido a EVA" (RN 476) vs web "¡Bienvenido a
  EVA!" (web 44, con signos). Sub "Tu plan gratuito esta activo. Puedes empezar ahora mismo." (RN 479) vs web voseo
  "Podés empezar ahora mismo." (web 46).
- **Primeros pasos** (3 items): "Agrega tu primer alumno / Hasta 3 alumnos en el plan Free"; "Crea tu primera rutina /
  Constructor de programas sin limites"; "Personaliza tu app con Starter / Tu logo y colores desde el siguiente plan"
  (RN 487-489). **Divergencias copy**: web usa voseo ("Agregá/Creá/Personalizá") y el 3º dice "con **Pro** / desde
  **$29.990/mes**" (web 77-78) vs RN "con **Starter** / desde el siguiente plan". Iconos/colores: Users `#38BDF8`, Zap
  `#8B5CF6`, Palette `#F59E0B` (RN) vs web sport/ember/success tonal.
- **Plan Free incluye** (grid 2col, 6 items): "3 alumnos activos", "Entrenos ilimitados", "App para tus alumnos",
  "Check-ins" (ok=verde CheckCircle2); "Marca personalizada", "Nutricion" (ok=false, XCircle atenuado) — RN 498-503 =
  web 89-94.
- **Acciones**: "Empezar ahora" (dismiss); "Ver todos los planes" (dismiss + `/coach/subscription`). Web además
  "Empezar ahora →" con flecha.

### 4.5 `MobileOnboardingChecklist` (CDS.tsx:625) ← `CoachOnboardingChecklist.tsx` — **dead export (no montado)**
- Port completo del checklist grande (server-state + AsyncStorage merge, autoCompleted por logo/clients/plans/signal30d,
  telemetría `onboarding_event`, `persist_onboarding_guide`). `home.tsx` usa `MobileOnboardingGuideChip` en su lugar.
- Diferencias con web: web dispara `confetti` al 100% (web 266-272) + `toast` sonner (web 308); RN no. Copy neutralizado
  (web voseo "Personalizá/Sumá/Recibí"). Rutas RN: "Ir a Mi Marca" → `/coach/settings/brand` (RN 840, worktree; nota:
  el port viejo iba a `/coach/(tabs)/settings`). Sub-piezas: FreePlan, LoopStrip, TwinPanels, Carousel, StepBlock,
  NutritionTierBlock (884-1055). Como no se monta, su spec es de-consistencia (no bloquea el screen).

### 4.6 `MobileQuickActionsBar` (CDS.tsx:1059) ← `header/QuickActionsBar.tsx` — **dead export**
- 4 chips: "+ Alumno" (modal client), "+ Programa" (`/coach/(tabs)/builder`), "+ Nutricion" (`/coach/(tabs)/nutricion`),
  "+ Pago" (modal payment). Web enruta a `/coach/workout-programs` y `/coach/nutrition-plans/new`. Web abre
  `CreateClientModal`/`QuickAddPaymentModal`; RN usa `QuickCreateClientForm`/`QuickAddPaymentForm` inline en NativeDialog.

### 4.7 `MobileQuickActionsFab` (CDS.tsx:1112) ← `DashboardFab.tsx` — montado (FAB flotante)
- FAB `position:absolute right:18 bottom:insets.bottom+84` (RN 1143-1145), `56×56` círculo `theme.primary` +
  `theme.shadowGlowBlue`. Web: `fixed right-5 bottom:calc(safe+92px) size-14 bg-[var(--cta-fill)] md:hidden`
  (`DashboardFab.tsx:39-43`).
- **Acciones diverge**: RN 4 acciones — "Crear alumno" (modal), "Crear programa" (builder), "Crear nutricion"
  (nutricion), "Registrar pago" (modal) (RN 1127-1132). Web 3 — "Crear alumno", "Importar" (`/coach/clients`),
  "Programa" (`/coach/workout-programs`) (`DashboardFab.tsx:27-31`). RN reemplaza "Importar" por nutrición+pago
  (RN-extra, ola0 L6829 "no eliminar"). Sheet título "Accion rapida" (RN 1159) = web "Acción rápida" (web 61).
- Ítem del sheet: círculo `bg-surface-inverse` + icono `theme.primary` + label `font-sans-bold 15.5px text-strong`
  (RN 1170-1173) = web `bg-[var(--ink-950)] text-sport-400` (web 76-79).
- **Forms** `QuickCreateClientForm` (1393) y `QuickAddPaymentForm` (1535): validaciones cliente (nombre≥2, email con `@`,
  pass≥8, ageConfirmed; monto>0, fecha, concepto, meses≥1). Éxito client → success box + WhatsApp/Share. Pago → POST +
  `onDone`. Checkbox "Alumno 14+ o con consentimiento de tutor legal." (1523).

### 4.8 `MobileOnboardingGuideChip` (CDS.tsx:1209) — RN-específico, montado
- Chip colapsable con 4 pasos auto-completados por señal real (`coach.hasCoachLogo`, `totalClients>0`, `activePlans>0`,
  `hasStudentSignal30d`) (1223-1226). Copy pasos: "Personaliza tu marca", "Suma tu primer alumno", "Crea tu primer
  plan", "Recibe el primer check-in".
- Estados: `allDone` → card verde "Activacion lista / Tu cuenta esta configurada. A entrenar." (1268-1270) cerrable
  (skip). Colapsado/expandido con `ChevronDown` rotado; dots de progreso; contador `doneCount/steps.length` (1309).
  Expandido: lista con checks + upsell "Suma planes de nutricion con **Pro**." → "Mejorar" (`/coach/subscription`) +
  "Saltar guia" (skip → AsyncStorage `eva_coach_guide_chip_hidden:{id}` + telemetría `guide_engagement`).
- Sin espejo web 1:1 exacto (el web monta `CoachOnboardingChecklist` completo); es la variante compacta del jsx original.

### 4.9 `MobileGreetingHeader` (CDS.tsx:1748) ← `header/GreetingHeader.tsx` + `useTimeOfDayGreeting.ts`
- **Saludo por hora** (RN 1769-1770 = web hook 9-13): `<6→"Buenas noches"`, `<13→"Buenos dias"`, `<20→"Buenas
  tardes"`, else `"Buenas noches"`. Título `font-display-black 31px, lineHeight 34, ls -0.93`, `{greeting},
  <sport-500>{firstName}</sport-500>` (RN 1795-1801) = web `text-3xl font-black tracking-[-0.03em] ... text-sport-500`
  (web 22-24).
- **Fecha**: `Intl.DateTimeFormat('es-ES', weekday/day/month)` capitalizada, `font-sans-semibold 12px uppercase
  letterSpacing 2.16` (RN 1771-1776, 1792) = web `text-xs uppercase tracking-[0.18em]` (web 21). (12px × 0.18 = 2.16.)
- **Línea de pendientes**: `pendingCount>0 ? "Tienes N pendiente(s) hoy." : "Todo al día. Buen momento para
  planificar."` (RN 1802-1806 = web 25-29). `home.tsx:118` pasa `pendingCount = topRiskClients + expiringPrograms +
  pendingCheckinsCount`.
- **Cluster de acciones** (1809-1831): [Search] (RN-extra, `testID=coach-global-search`, abre `CoachSearchPalette`) →
  [Insights ✨] (`onInsights`, home lo mapea a `setStatsOpen(true)`) → `<CoachNewsBell>` → Avatar (si `>1 workspace`
  abre `WorkspaceSwitcherSheet`, si no `onAvatar`→`/coach/(tabs)/perfil`). Cada tile 40×40 `theme.radius.md` borde
  `theme.border` fondo `theme.card`. `CoachSearchPalette` y `WorkspaceSwitcherSheet` son READ-ONLY (otras unidades).
- vs web md:hidden header (`DashboardShell.tsx:108-157`): web NO tiene botón Search; tiles `size-10`; avatar/workspace
  con caret `ChevronDown` cuando multi-workspace. RN sigue `GreetingHeader.tsx` (saludo-por-hora), no el header
  hardcodeado del shell — decisión de fuente per brief (§7).

### 4.10 `CoachNewsBell` (CDS.tsx:1985) ← `components/coach/NewsBellButton.tsx`
- **Fetch propio** `getCoachNews()` en `useEffect` de un solo disparo (1991-2005); `unreadCount` badge (`9+`);
  `openSheet` marca leído `markCoachNewsRead()` optimista (unreadCount=0). Feed en `NativeDialog` (bottom sheet
  nativo) título "Novedades". Fila `NewsFeedRow` (1931): icono tonal por tipo (`NEWS_TYPE_META`), eyebrow
  `NEWS_TYPE_LABEL` ("Nueva funcion"/"Mejora"/"Correccion"/"Anuncio"), título, `NewsContent` (markdown ligero: `##`,
  `###`, `-`, `**bold**`, `---`), CTA `cta_url` → Linking, fecha relativa (`newsRelativeDate`: Hoy/Ayer/Hace N dias/
  Hace N sem/dd mmm). Pin rail sport si `is_pinned`.
- **GAP (ola0 L2100-2102 / L7972-7974)**: `NewsFeedRow` **NO** renderiza `item.image_url` (existe en
  `lib/coach-news.ts:14`, `expo-image` importado en `CDS.tsx:5`). Web `NewsBellButton.tsx:151-160` sí lo pinta
  (`mt-1.5 max-h-40 rounded-md object-cover`). Fix: tras `<NewsContent>`, `<Image source={{uri:image_url}}
  style={{marginTop:6,width:'100%',height:160,borderRadius:theme.radius.md}} contentFit="cover">`.
- **GAP (gotcha 6b + ola0 L2134/L8020)**: fetch de un solo disparo (`useEffect`, no `useFocusEffect`) + `markCoachNewsRead`
  optimista **sin rollback** (comentario CDS.tsx:2012: "el badge reaparece en el proximo fetch"). Web usa
  `NewsFeedProvider` con refresh en `visibilitychange→visible` y rollback `setUnreadCount(previousCount)` al fallar.
  Como `CoachNewsBell` vive dentro de un tab que no se desmonta, el badge queda **congelado** hasta re-montar home. Ver §7.

### 4.11 `MobilePulseHero` (CDS.tsx:2117) ← `PulseHero.tsx`
- Card `padding=none` fila de 3 stats tocables, `borderLeft hairline` entre ellos (RN 2172-2187 = web 88-98).
- Stats: Activos (`kpi.totalClients`, delta `pulseDeltaView(1,'up')`, tap→`/coach/(tabs)/clientes`); En riesgo
  (`kpi.riskCount`, `danger` si >0, delta `pulseDeltaView(riskCount>0?-1:0,'down')`, tap→clientes); Adherencia
  (`kpi.avgAdherence%`, delta `pulseDeltaView(3,'up')`, **spark** `adherenceSpark`, tap→`onAdherencePress`→stats sheet).
  Web equivalentes: Activos→`/coach/clients`, En riesgo→`/coach/clients?filter=risk`, Adherencia→`onAdherence` (web 63-84).
- **Delta scheme-aware** (RN 2093-2109): good → `#4FD9A0`(dark)/`#0F7D50`(light); bad → `#FF7C97`/`#BE183C`. Web
  `deltaView` (PulseHero.tsx:27-37) usa `var(--success-600)` / `var(--danger-600)` — RN replica los valores
  resueltos por tema. Correcto. `sub.txt` = `igual`/`+N`/`-N`. Sufijo " sem." en el stat sin spark (RN 2216 = web 134).
- **Número**: `font-display-bold 27px, ls -0.27, tabular-nums, color danger?theme.destructive:theme.foreground`
  (RN 2192-2195). Web `.eva-metric text-[27px]` con `EvaCountUp` (web 104-111).
- **Spark** `PulseSparkline` (2066-2089) = 1:1 con `components/Sparkline.tsx` (ola0 L6616: geometría/gradiente/punto
  idénticos; `theme.primary` ≡ `--sport-500` = `#2680FF`).
- **GAPs** (ola0):
  - **danger-500 vs danger-600** (L6752): número "En riesgo" usa `theme.destructive` = `DS.danger500` `#F4365A`
    (`lib/theme.ts:175,110`) en ambos modos; web usa `--danger-600` (#BE183C light / #FF7C97 dark). PX.
  - **sin count-up** (L6745): web `EvaCountUp` easeOutCubic 820ms + prefers-reduced-motion; RN pinta el número estático.
  - Recorte del punto final del spark por falta de `overflow:visible` (L6616).

### 4.12 `MobileKpiStrip` / `MobileKpiTile` (CDS.tsx:2226/2274) ← `kpi/KpiStrip.tsx` + `KpiTile.tsx` — **dead export**
- Grid de 4 `StatCard`: "Ingresos del mes" (`formatCurrency(mrrCurrentMonth)`, accent sport, `deltaPct`, `onMrrPress`);
  "Alumnos activos" (accent neutral, →clientes); "En riesgo" (accent ember, `onAdherencePress`); "Adherencia"
  (`avgAdherence%`, accent sport, `onAdherencePress`). Web `KpiStrip.tsx:19-48`: grid `grid-cols-2 lg:grid-cols-4`,
  hints ("Mes anterior…", "Nutricion: N%"), href `#focus-list`/`/coach/clients`. Es la tira del bento desktop (no
  móvil) → no montado.

### 4.13 `MobileFocusList` (CDS.tsx:2340) ← `PriorityCard.tsx` (`showNextStep`)
- Card `variant=inverse` (siempre oscura). Eyebrow `font-sans-extra uppercase 11px tracking-0.88 text-sport-400`
  "Prioridad de hoy" (2378) = web `text-sport-400 uppercase tracking-[0.08em]` (PriorityCard.tsx:160). Badge de conteo
  pill `#F4365A` (hasRisk) / `#1FB877` texto `#0B0E13` (2382-2387) = web `--danger-500`/`--success-500` texto
  `--ink-950` (web 163-172).
- **Vacío** (`!hasRisk`): círculo `rgba(31,184,119,0.16)` CheckCircle2 `#4FD9A0` + "Ningun alumno en riesgo" / "Todo al
  dia. Buen trabajo." (2400-2401) = web 184-189. (Nota: `focus/FocusList.tsx:99-101` EmptyState usa emoji ✨ + copy
  distinto — ese es el bento, no la fuente móvil.)
- **Con riesgo**: headline `font-display-black 20px` "N alumno(s) necesita(n) tu atencion" (2406-2411 = web 194-198).
  Filas por alumno (tap→`/coach/cliente/{clientId}`): Avatar `size=sm`, nombre `font-sans-bold 14px text-on-dark`,
  subtítulo `FOCUS_FLAG_LABEL[flags[0]] ?? label` (2415), banda de riesgo (dot+label por `focusRiskBand`: ≥80 "Riesgo
  alto" `#FF7C97`, ≥50 "Riesgo medio" `#FFC861`, else "Seguimiento" `#939DAB`, 2319-2323 = web `riskBand`
  `_lib/dashboard-design.ts:30-34`), score `font-mono-bold` `{score}/100`, `ChevronRight #5A6573`. Divisores
  `rgba(255,255,255,0.10)`.
- **NextStepInset embebido** (2455-2492): reconstruido 1:1 con `PriorityCard.tsx:90-125`: círculo `rgba(255,255,255,0.08)`
  con icono por id (CalendarX/OctagonAlert/Activity/TrendingDown/CalendarClock/CheckCircle2), eyebrow
  `font-sans-extra 10px uppercase` color por tono ("Tu proximo paso"), título `nba.title`, CTA `nba.ctaLabel` + `ArrowRight`,
  `borderRadius 10`, tono `acc` = warn `#FFC861` / positive `#4FD9A0` / info `#7FB0FF` (2458 = web `NEXT_STEP_ACC`
  83-87). Regla `resolveMobileNextBestAction` (2516-2585) = 6 reglas (vencidos → riesgo≥3 → adherencia<60 → mrr≤-10 →
  agenda>0 → todo ok). **Nota**: la regla web embebida `resolveNextStep` (PriorityCard.tsx:36-81) tiene solo **5**
  reglas (SIN mrr) y `agenda-hoy`→`/coach/clients` (ola0 L6767). RN incluye la regla mrr extra (viene de
  `nextBestAction.rules.ts` que sí la tiene). Handler `handleNba` (2359-2373) enruta por id.
- CTA final "Ver todos en Alumnos" + ArrowRight → `/coach/(tabs)/clientes` (2494-2501) = web `Ver todos en Alumnos`
  → `/coach/clients?filter=risk` (web 246-251).

### 4.14 `MobileNextBestAction` (CDS.tsx:2587) ← `cs/NextBestAction.tsx` — **dead export**
- Card con gradiente por tono, eyebrow "PROXIMA ACCION", título/descr/CTA sport → handler por id. Es la card standalone
  del bento; en móvil va embebida dentro de FocusList (§4.13). No montado.

### 4.15 `MobileTodayAgenda` (CDS.tsx:2659) — **CONFLICTO de fuente (ver §7)**
- Estado actual RN: header `CalendarClock 16` + "Agenda de hoy" `font-display-black 18px` + "N pendientes" (2666-2670).
  Vacío: EmptyPanel CheckCircle2 `#10B981` "Todo cerrado / Sin pendientes en el dia." (2674). Filas: `ListRow` con
  leading = **emoji** en círculo `theme.muted` (`⏳`/`📷`/`💪` por `kind`, 2689-2691), title `clientName`, subtitle
  `label`, `showChevron`, tap→`/coach/cliente/{clientId}`.
- **Coincide con `today/TodayAgenda.tsx`** (emoji `KIND_ICON` ⏳/📷/💪, "N pendientes", `Card id=agenda`). **NO** coincide
  con `AgendaCard.tsx` (LA fuente móvil per `DashboardShell.tsx:174`), que tiene: `SectionTitle action="{done} de
  {total} hechas"` (AgendaCard.tsx:35), columna de **hora** `w-[42px] font-mono tabular-nums` `slotTime(i)` 09:00/10:30…
  (:55-57, placeholder), iconos **lucide** CalendarClock/ClipboardCheck/Dumbbell en círculo `size-8 bg-surface-sunken
  text-ink-700` (:9-13,58-60), `ChevronRight size-[18px] text-ink-300` (:69). Ola0 L6703-6707 marca esto como
  "variante equivocada". Ver §7 (decisión de fuente).

### 4.16 `MobileExpiringPrograms` (CDS.tsx:2707) ← `expiring/ExpiringPrograms.tsx` — **dead export**
- Header `Clock #F59E0B` + "Programas por vencer". Vacío "Sin programas vencidos ni por vencer." Filas `ListRow`:
  title `clientName`, subtitle `name`, Badge `danger`(Vencido)/`warning`(`{daysLeft}d`), tap → cliente o builder.
  = web `ExpiringPrograms.tsx` (círculo danger-100/warning-100 CalendarClock, badge). Es del bento; en móvil su
  contenido va dentro de Novedades. No montado.

### 4.17 `MobileActivityFeed` (CDS.tsx:2768) ← `activity/ActivityFeed.tsx` — **dead export**
- Header `Activity` + "Actividad reciente". Filas `ListRow`: leading = foto (si check-in+photoUrl) o círculo
  `activityTone` con icono por tipo (`ActivityTypeIcon`: UserPlus/CheckCircle2/Dumbbell), title/subtitle, trailing
  `timeAgo`. Sin filtro segmentado ni badge por-revisar (esos viven en Novedades). Es del bento. No montado.

### 4.18 `MobileNovedades` (CDS.tsx:2841) ← `NewsFeed.tsx` — montado
- Header "Novedades" `font-display-bold 17px` + Badge ember "N por revisar" (`9+`) si `pendingCheckins>0`
  (2882-2887 = web 90-102). `pendingCheckins` = prop server-side (`data.pendingCheckinsCount`, home.tsx:145) o
  fallback derivado de `activities` (2856-2857).
- **Filtro segmentado** `SegmentedTabs size=sm` (Todos / Por revisar / Revisados) SOLO si `hasCheckins`
  (2890-2901 = web `role=tablist` 106-139). Client-side, acota a check-ins por estado `reviewed` (2860-2864).
  Vacío por filtro: "Todo al dia. Sin check-ins por revisar." / "Aun no marcas check-ins como revisados." / "Sin
  novedades por ahora." (2866-2871 = web 79-84).
- **Filas programa** (solo en "todos"): círculo tonal scheme-aware (`urgent` danger / `warning`, 2916-2923; espejo
  `ProgramRow` web 171-179 `danger-100`/`warning-100` + `danger-600`/`warning-600`), copy "Plan de **{clientName}**
  {vencio|vence pronto}" + `name` + Badge "Vencido"/"{daysLeft} dias" (2944-2954 = web 180-187). Tap → cliente o builder.
- **Filas actividad**: `ListRow` leading foto o círculo `activityTone` (2962), title (single-line, sin subtitle, como
  web `ActivityRow` que solo pinta title con clientName en negrita), trailing = [señal check-in: `CheckCircle2
  theme.success` si `reviewed`, o dot ember `bg-ember-500` si pendiente] + `timeAgo` (2988-2998 = web 227-242).
- **Tonos de actividad INVERTIDOS — RESUELTO**: `activityTone` (2761-2766) ahora da: nuevo alumno → azul
  (`#7FB0FF`/`#1462DC`), check-in → verde (`#4FD9A0`/`#0F7D50`), workout → ember (`#FFB79E`/`#C23E14`), scheme-aware.
  Espejo 1:1 del `ACT_TONE` web (`NewsFeed.tsx:18-22`: sport / success / ember). (El brief R5 §1.5 describía el estado
  ANTERIOR invertido; el worktree ya lo corrige.)

### 4.19 `MobileDashboardCharts` (CDS.tsx:3012) — **dead export**
- `MobileSessionsChart` (Area+Line `#3B82F6`, "SESIONES 30 DIAS") + `MobileGrowthChart` (Bar `#22D3EE`, "CRECIMIENTO DE
  ALUMNOS"), `victory-native` + Skia tooltip táctil. Sin espejo en el screen móvil web (los charts viven en el bento).

### 4.20 `MobileRevenueSheet` (CDS.tsx:3161) ← `sheets/RevenueSheet.tsx` — **dead export (no montado)**
- `NativeDialog` "Panel de ingresos": monto `formatCurrency(mrrCurrentMonth)` + delta icon/color (up `#10B981` /
  down `theme.destructive` / `Minus`) + `{deltaPct}%` + "Mes anterior: {mrrPreviousMonth}". Lista de
  `clientPaymentSummary`: nombre + ArrowUpRight, "Ultimo pago: {fecha} · {monto}" / "Sin pagos registrados" +
  "Renovacion: {fecha}", `PaymentStatusBadge` (Sin pago / Al dia / Vencido). Tap fila → cliente. Web ordena por
  `hasRecentPayment` (impagos primero, web 31-34); RN NO ordena (usa el orden entrante). No montado (no hay MRR tile
  que lo abra en móvil; el `onMrrPress` de `MobileKpiStrip` tampoco se monta).

### 4.21 `MobileClientStatsSheet` (CDS.tsx:3269) ← `sheets/ClientStatsSheet.tsx` — montado (`statsOpen`)
- `NativeDialog` "Detalle por alumno" + "Ordenado de menor a mayor cumplimiento." Tabs Adherencia/Nutricion
  (`StatsTabButton`, pill primary/muted). Filas ordenadas asc por pct: nombre + `{pct}%`, barra de progreso
  `theme.primary`, hint. **Extras RN** (ola0 L6829 "no eliminar"): `MiniSparkline` (adherenceHistory4w), badge delta de
  peso 7d (ArrowUp/Down + kg), racha (Zap + "Nd racha"), energía ("⚡ N/10"), "Semana X/Y · Nd restantes", delta 1RM
  ("+N% fuerza 7d"). Web (`ClientStatsSheet.tsx`) usa `Sheet` side right(desktop)/bottom(móvil), color de barra por
  cumplimiento `barColor` (sport≥75/warning≥50/danger), promedio `avg%` en header, hint `sets · plan` / `kcal`. Tap
  fila → cliente + cierra.
- **Divergencias**: web colorea barra/pct por umbral (`barColor`, ClientStatsSheet.tsx:33-34); RN usa `theme.primary`
  fijo. Web muestra `avg%` en header; RN no. RN añade los 6 extras de telemetría (aditivos).

---

## 5. Hallazgos Ola 0 (`docs/rn-port/ola0-hallazgos.json`)

- **NewsFeedRow sin image_url** (L2100-2102, L7972-7974): `CDS.tsx:1931-1982` no pinta `item.image_url` pese a existir
  (`lib/coach-news.ts:14`) y `expo-image` importado. Fix propuesto: Image `marginTop:6 width:100% height:160
  borderRadius:radius.md contentFit:cover`. **Vigente en worktree.**
- **Agenda variante equivocada** (L6703-6707): `MobileTodayAgenda` (CDS.tsx:2659-2705) replica `today/TodayAgenda.tsx`
  (emoji) en vez de `AgendaCard.tsx` (fuente móvil real per `DashboardShell.tsx:174`: SectionTitle "{done} de {total}
  hechas" + columna de hora `slotTime` + iconos lucide + ChevronRight ink-300). Ver §7.
- **PulseHero deltas/números** (L6738-6739, L6745-6746, L6752-6753): stat "En riesgo" web delta siempre "igual"
  (`deltaView(0,'down')`) — RN usa `pulseDeltaView(riskCount>0?-1:0,...)` (muestra `-1` cuando hay riesgo, divergencia
  menor); falta count-up `EvaCountUp` 820ms; número riesgo `danger-500` (RN theme.destructive) vs `danger-600` (web).
- **PulseSparkline 1:1** (L6616): geometría/gradiente/color en paridad con `components/Sparkline.tsx`; única brecha =
  recorte del punto final por falta de `overflow:visible`.
- **NewsBell provider** (L2134, L8020): web refresca badge en `visibilitychange` + rollback optimista; RN single-shot
  sin rollback → congelamiento (gotcha 6b).
- **AmbientBrandGlow ausente** (L7866): montar `<AmbientBrandGlow/>` como primer hijo del root de `home.tsx` (espejo
  `DashboardShell.tsx:86-87`). Es archivo de otra unidad → cambiosShell.
- **Resumen de paridad** (L6829): confirma paridades (PulseSparkline, tipografía hero, colores on-dark de
  PriorityCard/FocusList, riskBand 80/50, orden de secciones, resolvers de billing, CoachNewsBell 1:1); lista los
  extras móviles NO-eliminar (search global, subtítulo de pendientes, FAB nutrición/pago, extras del stats sheet) y los
  exports muertos (KpiStrip, OnboardingChecklist, QuickActionsBar, NextBestAction standalone, DashboardCharts,
  ExpiringPrograms). `ListRow` mobile 1:1 con `list-row.tsx` (L10004).

---

## 6. Hallazgos R5 (`docs/audits/rn-parity-qa/r5-audit-coach-core.md §1`, vía brief)

Prioridad EST→PX. **La mayoría YA está corregida en el worktree** (esta rama está por delante del estado que R5 auditó):

1. **§1.1 GreetingHeader (EST)** — RESUELTO: saludo-por-hora, `firstName` `text-sport-500`, línea "Tienes N
   pendiente(s) hoy." presentes (`CDS.tsx:1770,1800,1804`). Tamaño 31px, fecha uppercase+tracking 2.16.
2. **§1.3 FocusList/PriorityCard NextStepInset (EST)** — RESUELTO: icono por tono en círculo `rgba(255,255,255,0.08)` +
   eyebrow "Tu proximo paso" + CTA+flecha + radius 10 (`CDS.tsx:2455-2492`). Ya no usa Sparkles pelado/ring inexistente.
3. **§1.5 Novedades tonos (EST)** — RESUELTO: `activityTone` (2761-2766) da azul/verde/ember correctos; check-in usa
   señal `CheckCircle2`/dot; layout de fila 1-línea. (El brief describía el estado invertido previo.)
4. **§1.4 TodayAgenda (EST)** — PARCIAL: RN usa emoji (⏳/📷/💪) en círculo neutro `theme.muted` (2689-2691),
   coincide con `today/TodayAgenda.tsx`. PERO la fuente móvil real es `AgendaCard.tsx` (lucide+hora+"X de Y hechas").
   El brief §1.4 y Ola0 L6704 se contradicen → §7 (PENDIENTE-DECISION).
5. **§1.2 PulseHero (PX)** — PARCIAL: número `font-display-bold` (no display-black); delta colors scheme-aware
   correctos; falta count-up; riesgo usa danger-500 (§4.11).
6. **§1.6 BillingBanners (PX)** — VIGENTE: `MobileBanner` usa `#F43F5E`/`#F59E0B` hardcode, no los tokens
   danger/warning del banner web (`bg-danger-100 text-danger-700`). Ver §4.1.

---

## 7. Estado RN actual — divergencias con la fuente (citas)

1. **[EST] Agenda: `AgendaCard.tsx` vs `today/TodayAgenda.tsx`** — `DashboardShell.tsx:174` renderiza `<AgendaCard>` en
   móvil (fuente de verdad). RN `MobileTodayAgenda` (CDS.tsx:2659-2705) porta la variante emoji de `today/TodayAgenda.tsx`.
   Diferencia visible: falta columna de **hora** (`slotTime`), falta contador "**{done} de {total} hechas**", usa emoji
   en vez de iconos lucide (CalendarClock/ClipboardCheck/Dumbbell). Cambiar de emoji→lucide+hora **altera lo que el
   usuario ve** → **PENDIENTE-DECISION-CEO** (además el brief §1.4 pide emoji, contradiciendo `AgendaCard.tsx`).
2. **[PX] BillingBanner tono** — `#F43F5E`/`#F59E0B` hardcode + pill CTA "Revisar plan" (CDS.tsx:310,317) vs tokens
   `danger-100/700`/`warning-*` + link underline (BillingBanners.tsx:96-100). Alinear a tokens.
3. **[PX] PulseHero número "En riesgo"** — `theme.destructive`=`#F4365A` (danger-500, lib/theme.ts:175) vs web
   `--danger-600` (#BE183C/#FF7C97) (PulseHero.tsx:106-108).
4. **[EST/anim] PulseHero sin count-up** — falta `EvaCountUp` (820ms easeOutCubic + reduced-motion) (EvaCountUp.tsx:16-41).
5. **[EST] CoachNewsBell sin image_url** — GAP §4.10 (ola0 L7972).
6. **[func/gotcha 6b] CoachNewsBell congela + sin rollback** — fetch `useEffect` single-shot (CDS.tsx:1991) sin
   `useFocusEffect`; `markCoachNewsRead` sin rollback (CDS.tsx:2011-2013). Web: refresh en visibilitychange + rollback
   (NewsBellButton via NewsFeedProvider). Recomendación: `useFocusEffect` para re-fetch al enfocar home + rollback del
   badge al fallar el mark.
7. **[data/gotcha 6d] Saludo por hora usa hora del device** — `new Date().getHours()` (CDS.tsx:1769) = igual que web
   (`useTimeOfDayGreeting.ts:9`), pero el brief 6d pide hora **Santiago** consistente. Cambio sutil (solo cerca de
   límites tz); recomendación no-bloqueante: derivar la hora vía helper Santiago.
8. **[fuente] Header sigue `GreetingHeader.tsx`, no el header del shell** — `DashboardShell.tsx:108-157` (md:hidden)
   hardcodea "Hola, {firstName}" 28px sin saludo/pendientes/search. RN implementa `GreetingHeader.tsx` (nombrado por el
   brief). Coherente con el brief; documentado para el lente de cableado.
9. **[func] Botón Search del header** — RN-extra (CDS.tsx:1810-1818, `CoachSearchPalette`); web móvil no lo tiene. Ola0
   L6829 lo marca "no eliminar".
10. **[copy] Neutralizaciones de voseo** — RN neutraliza voseo del web (FreeWelcomeModal: "Puedes empezar" vs "Podés
    empezar"; "con Starter/desde el siguiente plan" vs web "con Pro/desde $29.990/mes"). Correcto per regla 5, pero es
    un delta de **contenido** (Starter vs Pro; sin precio) que conviene confirmar con negocio.
11. **[func] RevenueSheet no ordena por impago** — web ordena impagos primero (RevenueSheet.tsx:31-34); RN no. (Export
    muerto, bajo impacto.)
12. **[PX] ClientStatsSheet barra color fijo** — RN `theme.primary`; web `barColor` por umbral + `avg%` en header
    (ClientStatsSheet.tsx:33,96). RN añade 6 extras de telemetría (aditivos, no eliminar).

**cambiosShell** (archivos de otras unidades — NO tocar en esta unidad, solo anotar): montar `<AmbientBrandGlow/>` en
`app/coach/(tabs)/home.tsx` root (ola0 L7866). `CoachSearchPalette`/`WorkspaceSwitcherSheet`/home.tsx = read-only.

---

## 8. Mapa de interacciones (todos los tocables → efecto)

| # | Widget (RN L) | Elemento | Efecto |
|---|---|---|---|
| 1 | BillingBanner (312) | banner completo | `openCoachWebPath('/coach/subscription')` (link-out) |
| 2 | FreeTierBanner (223) | banner | `/coach/subscription` |
| 3 | TeamsBridgeBanner (267) | banner | `mailto:contacto@eva-app.cl?subject=Quiero conocer EVA Teams` |
| 4 | PublicCodeModal (410/422/426/439) | Copiar / Compartir / Entendido | Clipboard / Share / POST confirm_public_code→onConfirmed |
| 5 | FreeWelcomeModal (518/519) | Empezar ahora / Ver planes | dismiss / dismiss+`/coach/subscription` |
| 6 | GuideChip (1272/1283) | cerrar(allDone) / toggle | skip(AsyncStorage+telemetría) / expand |
| 7 | GuideChip (1349/1354) | Mejorar / Saltar guia | `/coach/subscription` / skip |
| 8 | GreetingHeader (1810) | Search tile | abre `CoachSearchPalette` (read-only) |
| 9 | GreetingHeader (1819) | Insights ✨ | `onInsights` → home `setStatsOpen(true)` (ClientStatsSheet) |
| 10 | GreetingHeader→NewsBell (2021) | campana | `openSheet` (marca leído + abre feed Novedades del bell) |
| 11 | NewsBell CTA (1963) | cta_url de un ítem | `Linking.openURL(cta_url)` + cierra sheet |
| 12 | GreetingHeader (1823) | Avatar | multi-workspace→`WorkspaceSwitcherSheet` (read-only) / else `onAvatar`→`/coach/(tabs)/perfil` |
| 13 | PulseHero (2176) Activos | stat | `onActivosPress` → `/coach/(tabs)/clientes` |
| 14 | PulseHero Riesgo | stat | `onRiesgoPress` → `/coach/(tabs)/clientes` |
| 15 | PulseHero Adherencia | stat | `onAdherencePress` → `setStatsOpen(true)` |
| 16 | FocusList fila (2417) | alumno en riesgo | `/coach/cliente/{clientId}` |
| 17 | FocusList NextStepInset (2467) | "Tu proximo paso" | `handleNba` (por id: builder / cliente / stats sheet / clientes) |
| 18 | FocusList (2494) | "Ver todos en Alumnos" | `/coach/(tabs)/clientes` |
| 19 | TodayAgenda fila (2683) | pendiente | `/coach/cliente/{clientId}` |
| 20 | Novedades tabs (2891) | Todos/Por revisar/Revisados | `setFilter` (client-side) |
| 21 | Novedades programa (2927) | fila programa | `/coach/cliente/{clientId}` o `/coach/(tabs)/builder` |
| 22 | Novedades actividad (3000) | fila actividad | `/coach/cliente/{clientId}` (si clientId) |
| 23 | ClientStatsSheet tabs (3294) | Adherencia/Nutricion | `setTab` |
| 24 | ClientStatsSheet fila (3310) | alumno | cierra + `/coach/cliente/{clientId}` |
| 25 | FAB (1136) | botón + | abre sheet "Accion rapida" |
| 26 | FAB acciones (1164) | Crear alumno/programa/nutricion/pago | modal client / builder / nutricion / modal payment |
| 27 | FAB forms | Crear alumno / Confirmar pago | POST `/api/mobile/coach/clients` \| `/payments` → `onClientCreated`/`onPaymentCreated`→refresh |
| 28 | Client success (1483/1484) | Cerrar / WhatsApp\|Compartir | onDone / Linking wa.me o Share |
| — | RevenueSheet (3203) *(dead)* | fila cliente | cierra + `/coach/cliente/{clientId}` |
| — | KpiStrip/QuickActionsBar/NextBestAction/ExpiringPrograms/ActivityFeed *(dead)* | — | espejos de bento, no montados |

---

## 9. Gotchas de clase (evaluación)

- **6a (@gorhom/bottom-sheet −999)**: NO aplica. `MobileRevenueSheet` y `MobileClientStatsSheet` usan `NativeDialog`
  (`components/NativeDialog.tsx:20` = `<Modal transparent animationType="fade">`, patrón nativo). Sin `@gorhom` ni
  `snapPoints`. `ClientStatsSheet` (crítico, abierto por `statsOpen`) es seguro.
- **6b (congelamiento por fetch propio)**: aplica a `CoachNewsBell` (fetch `useEffect` single-shot, §7.6) → recomendar
  `useFocusEffect`. `MobileNovedades` recibe todo por props (sin fetch propio) = OK.
- **6c (Fabric 45798)**: `FormInput` (CDS.tsx:1679) no aplica estilos condicionales por focus en el wrapper del
  TextInput = OK.
- **6d (claves de día Santiago)**: ningún día-clave; único uso horario = saludo device-local (§7.7, recomendación).
- **6e (notificaciones locales)**: no hay `scheduleNotification` en esta unidad = N/A.

---

## 10. Resumen de acción para el fixer (orden EST→PX)

1. Agenda: resolver `AgendaCard.tsx` vs emoji (PENDIENTE-DECISION-CEO) — si AgendaCard: añadir hora `slotTime` +
   "{done} de {total} hechas" + iconos lucide.
2. CoachNewsBell: renderizar `image_url` + `useFocusEffect` + rollback del badge.
3. BillingBanner: tonos a tokens danger/warning.
4. PulseHero: number `danger-600`, evaluar count-up.
5. cambiosShell: montar `AmbientBrandGlow` en home.tsx root.
6. Confirmar copy Starter vs Pro / precio en FreeWelcomeModal con negocio.

**GATE**: `npx tsc --noEmit` en `apps/mobile` limpio (spec no toca código).
