# SPEC — Unidad `chrome-tabbar-layout`

**Chrome de navegacion del COACH en mobile:** tab bar inferior (`CoachMobileTabBar`) + layout del grupo `(tabs)` + sheet de overflow "Mas".

Web = fuente de verdad. La contraparte web NO es un componente unico: es la **capsula flotante movil** dentro de `CoachSidebar.tsx` (`className="flex md:hidden"`, L332-429) — el sidebar/topbar desktop se colapsa a esta capsula bajo `md`. `CoachTopBar.tsx` es `hidden md:flex` (L205) → NO existe en viewport movil web; sus funciones (busqueda, campana, tema, logout, avatar/switcher) viven en RN dentro de OTRAS unidades (headers por pantalla), no en esta.

rnFiles PROPIOS de esta unidad (los unicos editables):
- `apps/mobile/components/coach/CoachMobileChrome.tsx` (409 L)
- `apps/mobile/app/coach/(tabs)/_layout.tsx` (61 L)

Todo lo demas (`CoachSearchPalette`, `WorkspaceSwitcherSheet`, `CoachDashboardSections`/`CoachNewsBell`, `CoachMainWrapper` RN) es READ-ONLY de otras unidades.

---

## 1. Fuente de datos compartida (`@eva/coach-nav`) — NO reimplementar

`getVisibleNavItems(ctx)` es la funcion PURA unica que decide QUE items ve el coach (`packages/coach-nav/nav.ts:153-174`). Reglas exactas:
1. `subscriptionStatus ∈ {pending_payment, expired, past_due, paused}` (`SUBSCRIPTION_BLOCKED_STATUSES`, nav.ts:37) ⇒ retorna SOLO `[REACTIVATE_NAV_ITEM]` (nav.ts:104-111, key `reactivate`, href `/coach/reactivate`, icon `LayoutDashboard`).
2. `activeWorkspaceType` colapsa a `coach_standalone` salvo `enterprise_coach`/`coach_team` (nav.ts:159-162).
3. `isManaged` = status `org_managed`|`team_managed` ⇒ oculta `options` (nav.ts:164,169).
4. Item con `entitlement` cuyo `enabledModules[entitlement] !== true` ⇒ oculto (nav.ts:170).
5. Item con `featureDomain ∈ disabledDomains` ⇒ oculto (nav.ts:171).

Registro `NAV_MODULES` (nav.ts:84-102), orden y contexts:
| key | href | label registro | icon (string) | contexts | entitlement/featureDomain |
|---|---|---|---|---|---|
| dashboard | /coach/dashboard | Dashboard | LayoutDashboard | ALL | — |
| clients | /coach/clients | Alumnos | Users | ALL | — |
| team | /coach/team | Equipo | UsersRound | coach_team | — |
| programs | /coach/workout-programs | Programas | ClipboardList | ALL | — |
| nutrition | /coach/nutrition-plans | Nutrición | Apple | ALL | featureDomain `nutrition` |
| options | /coach/settings | Opciones | Settings | coach_standalone | — |
| settings_team | /coach/settings | Opciones | Settings | coach_team | — |
| support | /coach/support | Soporte | LifeBuoy | ALL | — |
| cardio | /coach/cardio | Cardio | HeartPulse | standalone+team | entitlement `cardio` |
| movement | /coach/movement | Movimiento | PersonStanding | standalone+team | entitlement `movement_assessment` |

`splitForSidebar(items)` (nav.ts:196-204): `secondary` = items con `key==='support'` O `entitlement != null`; `primary` = el resto. Preserva orden.

`coachWorkspaceTypeFromKind(kind)` (nav.ts:133-143): `team_owner|team_member → coach_team`, `enterprise → enterprise_coach`, resto → `coach_standalone`.

**El icono se resuelve POR LADO** (nav.ts:9,54-57): web mapea `icon` string → lucide-react (`ICON_OVERRIDE`/`ICON_BY_NAME`, CoachSidebar.tsx:79-107); RN override por key → lucide-react-native (`NAV_ROUTE`, CoachMobileChrome.tsx:57-70).

---

## 2. Contraparte web — capsula flotante movil (`CoachSidebar.tsx:329-429`)

### 2.1 Vista general
Renderiza `<nav className="flex md:hidden">` (L335) SOLO si `!isBuilder` (L332). `isBuilder` = `pathname.startsWith('/coach/builder')` O `.../workout-programs/builder` (L168). El header lo pinta cada pantalla; esta capsula es la unica nav movil.

### 2.2 Que tabs muestra (verbatim)
- `MOBILE_TAB_KEYS = ['dashboard','clients','programs','nutrition','options','settings_team','team','reactivate']` (L109-110).
- `mobileTabs` = mapea cada key contra `visibleNavItems`, filtra nulos, **`.slice(0,5)`** (L176-179). Comentario L175: "hasta 5 tabs full-label, **sin 'Más'**".
- Caso standalone tipico: Inicio / Alumnos / Programas / Nutrición / Opciones (5 tabs, sin overflow).
- `mobileActiveIndex` = `findIndex(pathname === i.href || pathname.startsWith(i.href+'/'))` (L180-182).
- `mobileN = mobileTabs.length || 1` (L183).

### 2.3 Contenedor de la capsula (estilos inline, L333-354)
- `position: fixed`, `left/right: tabbarMinimized ? 72 : 14` (L338-339), `bottom: calc(env(safe-area-inset-bottom,0px) + 16px)` (L340), `zIndex: 50`.
- `padding: 8`, `borderRadius: 30`, `alignItems: 'stretch'` (L341-344).
- `background: color-mix(in srgb, var(--surface-card) 74%, transparent)` (L345).
- `backdropFilter/WebkitBackdropFilter: saturate(180%) blur(26px)` (L346-347).
- `border: 1px solid color-mix(in srgb, var(--text-strong) 9%, transparent)` (L348).
- `boxShadow: 0 1px 0 rgba(255,255,255,0.45) inset, 0 14px 36px rgba(13,18,28,0.24), 0 4px 12px rgba(13,18,28,0.12)` (L349-350).
- `transition: left/right var(--dur-slow) var(--ease-spring)` (L351-352).

### 2.4 Indicador deslizante sport (L356-372)
- `<span aria-hidden>` absoluto, `top:8 bottom:8`.
- `left: calc(8px + {mobileActiveIndex<0?0:index} * ((100% - 16px) / mobileN))` (L362).
- `width: calc((100% - 16px) / mobileN)` (L363), `borderRadius: 22` (L364).
- `background: color-mix(var(--sport-500) 15%, transparent)`, `border: 1px color-mix(var(--sport-500) 24%, transparent)` (L365-366).
- `transition: left var(--dur-slow) var(--ease-spring)`, `opacity: mobileActiveIndex<0 ? 0 : 1` (L367,370).

### 2.5 Cada tab (`<Link>`, L373-427)
- `flex:1`, columna, `alignItems:center`, `gap: tabbarMinimized?0:3`, `padding: tabbarMinimized?'5px 0':'6px 0'` (L388-392).
- `color: active ? 'var(--sport-600)' : 'var(--ink-400)'` (L395).
- Icono en `<span h-6 w-6>`, activo aplica `[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]` (L403-406), `transform: active ? 'translateY(-1px)' : 'none'` (L407). `<Icon size={24} />` (L409), strokeWidth default lucide = 2.
- Label: `fontSize:10`, `fontWeight: active?800:600`, `letterSpacing:'0.01em'`, `maxHeight: tabbarMinimized?0:14`, `opacity: tabbarMinimized?0:1` (L411-421).

### 2.6 Minimizado on-scroll (`tabbarMinimized`, L119-160)
Listener `window.scroll` passive (L158): si `|dy|>6`, `setTabbarMinimized(dy>0 && y>80)` (L150-153). Colapsa a pill icon-only (insets 14→72, labels fade). RN NO lo tiene (ver Estado RN §5).

---

## 3. Estados de gating (subscripcion / workspace / modulos)

### 3.1 Estado bloqueado (web)
`reactivate` es item normal de `MOBILE_TAB_KEYS` (L110). Cuando `getVisibleNavItems` retorna solo `[reactivate]`, se renderiza como **un tab estandar** de la capsula (label "Reactivar", icono `LayoutDashboard` via fallback `ICON_BY_NAME`, CoachSidebar.tsx:95,107; nav.ts:104-111).

### 3.2 Layout web desktop (referencia, sin contraparte RN de tab bar)
Sidebar desktop `CoachSidebar.tsx:233-327`: brand EVA (L242-265), link "Panel empresa" org-admin (L269-285), `primaryNavItems` (L286), bloque COACH/{nombre} + logo (L290-310), toggle "Colapsar menú" (L311-325). Compact/wide mediante `matchMedia(min-width:1080px)` (L129-135). **Idiomatico**: un app de telefono no tiene sidebar; sin contraparte RN (Ola 0 lo declara no-hallazgo).

### 3.3 Topbar web desktop (`CoachTopBar.tsx`, `hidden md:flex`)
- Breadcrumb + back solo en drill-down (L206-236, `resolveCrumb` L63-79).
- `CoachGlobalSearch` centrada + atajo "/" (L172-189, L243).
- `RosterViewToggle` Tabla/Ficha solo en `/coach/clients` (L86-123, L247-249).
- Acciones: `ThemeToggleButton` (L135-151) + `TopBarLogoutButton` (L154-168) + `NewsBellButton` (L255-257) + avatar → `/coach/settings` o `/workspace/select` si `workspaces.length>1`, con `ChevronsUpDown` (L200-202,258-287).
- Cada funcion vive en RN en otra unidad (ver §6 Mapa, columna "RN host").

---

## 4. Hallazgos Ola 0 (grep `CoachSidebar` 1 hit / `CoachTopBar` 1 hit)

### 4.1 Bloque CoachSidebar ↔ CoachMobileChrome (ola0-hallazgos.json:1677-1750) — 10 discrepancias
1. **P1** — Minimizado on-scroll AUSENTE en RN (json:1680-1684). Web L119-160/338-339/391-392/416-417; RN `styles.capsule` fija left/right 14, labels siempre visibles, sin listener de scroll.
2. **P1** — 5º slot: web muestra 5 primarios sin "Más"; RN muestra 4 + boton "Más" con Opciones al sheet (json:1687-1691). Web L109-110/175-179; RN `MAX_BAR_SLOTS=5`, `barSlots = MAX_BAR_SLOTS-1` (CoachMobileChrome.tsx:92,151). **Decision de producto** — anotado como parity debt en `_layout.tsx:50-52`.
3. **P2** — Color tab activo: web `--sport-600` (#1462DC light / #7FB0FF dark); RN usa `theme.primary` = sport500 #2680FF ambos esquemas (json:1694-1698; CoachMobileChrome.tsx:220,237).
4. **P2** — Color tab inactivo: web `--ink-400` #818C9A ambos modos; RN `theme.mutedForeground` #5A6573 light / #8A95A3 dark (json:1701-1705; CoachMobileChrome.tsx:220,257,259).
5. **P2** — Fondo capsula dark + hex hardcodeado: web `--surface-card` 74% (#161B22 dark); RN `hexToRgba('#0E1117'/'#FFFFFF', 0.62/0.74)` literal fuera del theme (json:1708-1712; CoachMobileChrome.tsx:194,313).
6. **P2** — Offset inferior: web `+16`; RN `insets.bottom + 8` (json:1715-1719; CoachMobileChrome.tsx:193,312).
7. **P2** — Icono size/stroke: web size 24 stroke 2; RN size 23 stroke 2.4/2.1 (json:1722-1726; CoachMobileChrome.tsx:234-236,257).
8. **P2** — Icono "Movimiento": web `PersonStanding`; RN `Activity` (json:1729-1733; CoachMobileChrome.tsx:68).
9. **P2** — Estado "Reactivar": web tab normal; RN `ReactivateBar` CTA full-width relleno con `CreditCard` + "Reactivar suscripción" (json:1736-1740; CoachMobileChrome.tsx:132-145,291-331).
10. **P2** — Sheet "Más" RN expone entradas que la capsula web no ofrece (Suscripción/Check-ins/Mi cuenta/Soporte/Equipo/Cardio/Movimiento) (json:1743-1747). Regla dura: NO eliminar accesos; parity debt documentado.

Paridades OK verificadas Ola 0 (NO reportadas, json:1750): borde 9%, radio 30, padding 8, indicador deslizante (radius 22, sport 15%/24%, spring), labels 10px 600/800 ls≈0.1, translateY(-1) activo, fill 0.18, labels/iconos por key. Idiomaticas no reportadas: BlurView intensity 30/50 dimezis vs backdrop-filter; shadow RN sin inset highlight blanco; activeOpacity vs `.eva-tabbar-press`; deteccion de activo por route name vs `pathname.startsWith`.

### 4.2 Bloque CoachTopBar ↔ CoachMobileChrome (ola0-hallazgos.json:1752-1762) — 1 discrepancia
- **P2** — Chevron multi-workspace en avatar (json:1755-1759). Web `ChevronsUpDown` (CoachTopBar.tsx:281-286); RN vive en `CoachDashboardSections.tsx:1823-1830` (fuera de esta unidad) sin chevron. **NO es archivo de esta unidad** — CoachMobileChrome NO monta avatar (json:1757). Se anota como contexto; el fix pertenece a `dashboard-sections`.
- El resto del topbar (breadcrumb, busqueda, roster toggle, tema, logout, campana, return-null-builder) tiene cobertura RN en otras unidades — no reportado como discrepancia (json:1762, puntos 1-8).

---

## 5. Estado RN actual (divergencias con cita RN)

Archivo `CoachMobileChrome.tsx`:
- **Derivacion**: `getVisibleNavItems` con `activeWorkspaceType = coachWorkspaceTypeFromKind(kind)`, `subscriptionStatus = subscriptionState`, `enabledModules {cardio, movement_assessment}` via `hasModule`, `disabledDomains = nutritionEnabled ? undefined : Set(['nutrition'])` (L122-130). Mismo resolver que web. Datos de `useWorkspace()` (L112) y `useEntitlements()` (L113).
- **blocked** = `visible.length===1 && visible[0].key==='reactivate'` (L132) ⇒ retorna `<ReactivateBar>` con `router.replace(NAV_ROUTE.reactivate.path)` (L136-145). **DIVERGE de web** (web = tab normal; ver hallazgo 4.1.9).
- **Reparto bar/sheet** (L147-158): `splitForSidebar(visible)` → `barCapable` = primary con `NAV_ROUTE[key].tab`; `primaryNonTab` (ej. Equipo); `barItems = barCapable.slice(0, MAX_BAR_SLOTS-1)` = 4 slots; `overflow` = resto de barCapable + primaryNonTab + secondary + `LEGACY_OVERFLOW`. **DIVERGE de web** (5 sin "Más" → 4 + "Más"; hallazgo 4.1.2).
- **`LEGACY_OVERFLOW`** (L77-81): Suscripción `/coach/subscription`, Check-ins `/coach/check-ins`, Mi cuenta `/coach/perfil` — solo-RN, no en registro web (hallazgo 4.1.10).
- **Capsula BlurView** (L184-263): `intensity 30/50`, `tint dark/light`, `experimentalBlurMethod="dimezisBlurView"` (L186-188 — gotcha 6b institucional: sin este prop Android da velo sin blur). `backgroundColor hexToRgba('#0E1117'/'#FFFFFF', 0.62/0.74)` (L194 — hex hardcodeado, hallazgo 4.1.5). `borderColor hexToRgba(theme.foreground, 0.09)` (L196). `bottom: insets.bottom + 8` (L193, hallazgo 4.1.6). `onLayout` mide `barWidth` (L189) para calcular `slot`/`indicatorLeft` (L164-166).
- **Indicador MotiView** (L199-214): `animate={{left: indicatorLeft}}` spring damping 18 stiffness 200; `backgroundColor hexToRgba(theme.primary, 0.15)`, border 0.24 (paridad OK).
- **Tab** (L216-245): `Icon size=23 strokeWidth focused?2.4:2.1 fill focused?0.18:transparent` (L234-237, hallazgo 4.1.7). `color = focused ? theme.primary : theme.mutedForeground` (L220, hallazgos 4.1.3/4.1.4). Label `fontSize 10 lineHeight 13 letterSpacing 0.1` (styles.tabLabel L365-370). `testID coach-tab-${key}` (L228). `accessibilityRole/State/Label` presentes (L225-227).
- **Slot "Más"** (L248-262): `MoreHorizontal size=23`, `testID coach-tab-mas`, `accessibilityLabel "Más opciones"`, abre `setMasOpen(true)`.
- **Sheet "Más"** (L266-286): `<Sheet open={masOpen} title="Más" snapPoints={['55%']}>` — **P0 gotcha 6a** (ver §7). Cada fila `overflowRow`: icono `theme.primary` sobre fondo `theme.primary@0.1`, label `theme.foreground`, `testID coach-mas-${key}`, `onPress=goOverflow(entry)` → `setMasOpen(false)` + `router.push(entry.path)` (L177-180).
- **Icono Movimiento**: `Activity` en NAV_ROUTE.movement (L68) en vez de `PersonStanding` (hallazgo 4.1.8).

Archivo `_layout.tsx`:
- **Gate suscripcion** (L18-30): `getCoachProfile()` → si `resolveReactivateRequired(subscriptionStatus, currentPeriodEnd)` ⇒ `router.replace('/coach/reactivate')`. `resolveReactivateRequired` (`lib/workspace-core.ts:148-156`): `false` si managed o sin estado; respeta gracia hasta `current_period_end`. Espejo del middleware web `resolveCoachSubscriptionRedirect`. **Funcionalidad RN critica — NO eliminar (brief P0)**.
- **`<Tabs>`** (L38-58): `tabBar={CoachMobileTabBar}`, `screenOptions {headerShown:false, sceneStyle:{backgroundColor: theme.background}}`. Screens fijos: home, clientes, builder, **ejercicios**, nutricion, settings, support, subscription, check-ins, perfil.
  - **Divergencia menor**: existe `<Tabs.Screen name="ejercicios">` (L48) sin ninguna entrada `NAV_ROUTE` que la apunte como `tab` → tab montada pero inalcanzable desde la barra (Movida 2: 'exercises' dejo de ser top-level, nav.ts:89-90). Coherente con web (Programas absorbe ejercicios); la screen sigue viva para deep-links. Anotar, no es regresion.
- **Sin barra superior global** (L33-37): cada screen pinta su header; `MobileGreetingHeader` en el dashboard.

Sin claves de dia en esta unidad (brief §Notas de datos). `getVisibleNavItems` no usa `getSantiagoIsoYmdForUtcInstant` — gotcha 6d N/A. No hay notificaciones locales — gotcha 6e N/A. No hay `TextInput` en estos archivos — gotcha 6c N/A.

---

## 6. Mapa de interacciones (TODOS los tocables — el lente de cableado verifica contra esta lista)

### 6.1 Tocables de ESTA unidad (rnFiles propios)
| # | Tocable | Archivo:linea | Efecto exacto |
|---|---|---|---|
| 1 | Tab primario (por cada `barItems`) | CoachMobileChrome.tsx:222-245 | `onPress=goTab(item)` (L168-175): emite `tabPress`; si no está activo y no prevenido, `navigation.navigate(NAV_ROUTE[key].tab)`. Navega a home/clientes/builder/nutricion/settings segun key. |
| 2 | Slot "Más" | CoachMobileChrome.tsx:248-262 | `onPress=setMasOpen(true)` → abre Sheet overflow. `testID coach-tab-mas`. |
| 3 | Fila del sheet "Más" (cada `overflow`) | CoachMobileChrome.tsx:270-284 | `onPress=goOverflow(entry)` (L177-180): `setMasOpen(false)` + `router.push(entry.path)`. Rutas segun key: Equipo `/coach/settings/team`, Cardio `/coach/cardio`, Movimiento `/coach/movement`, Soporte `/coach/support`, Suscripción `/coach/subscription`, Check-ins `/coach/check-ins`, Mi cuenta `/coach/perfil`. |
| 4 | Boton "Reactivar suscripción" (estado bloqueado) | CoachMobileChrome.tsx:318-328 | `onPress` → `router.replace(NAV_ROUTE.reactivate.path)` = `/coach/reactivate` (L142). `testID coach-tab-reactivate`. |
| 5 | Backdrop / swipe / boton X del sheet | Sheet.tsx (`onClose`) | `onClose=setMasOpen(false)` (L266). Cierra overflow sin navegar. |
| 6 | Gate de layout (no tocable — efecto de montaje) | _layout.tsx:18-29 | Al montar `(tabs)`: si `resolveReactivateRequired` ⇒ `router.replace('/coach/reactivate')`. |

### 6.2 Tocables de la contraparte web (referencia; host RN en OTRA unidad si aplica)
| Tocable web | Archivo:linea | Efecto web | RN host (read-only) |
|---|---|---|---|
| Tab de capsula | CoachSidebar.tsx:378-425 | `<Link href={item.href}>` navega | Esta unidad (tabs) |
| Sidebar nav-link desktop | CoachSidebar.tsx:188-224 | Navega a `item.href` | Sin contraparte (desktop) |
| Toggle colapsar sidebar | CoachSidebar.tsx:311-325 | `toggleSidebar` + localStorage | Sin contraparte (desktop) |
| Link "Panel empresa" | CoachSidebar.tsx:269-285 | `/org/{slug}` | Sin contraparte (desktop) |
| Back + breadcrumb | CoachTopBar.tsx:210-233 | `/{sectionHref}` | Header de stack RN |
| Busqueda global | CoachTopBar.tsx:243 | Abre dropdown resultados | `CoachSearchPalette` (chrome-global-search) |
| Roster toggle Tabla/Ficha | CoachTopBar.tsx:95-120 | `setRosterMode` | Desktop-only (no RN) |
| ThemeToggleButton | CoachTopBar.tsx:141-149 | `setTheme` | `settings.tsx` (otra unidad) |
| Logout | CoachTopBar.tsx:157-166 | `signOut` → /login | `perfil.tsx` (otra unidad) |
| Campana | CoachTopBar.tsx:255-257 | Abre news | `CoachNewsBell` (dashboard-sections) |
| Avatar cuenta / switcher | CoachTopBar.tsx:258-287 | `/coach/settings` o `/workspace/select` | `CoachDashboardSections`+`WorkspaceSwitcherSheet` |

---

## 7. P0 / gotchas de clase

### 7.1 Gotcha 6a — Sheet "Más" con snapPoint fijo `'55%'` (P0 a verificar en device)
`CoachMobileChrome.tsx:266`: `<Sheet ... snapPoints={['55%']}>` — usa el `<Sheet>` de `components/Sheet.tsx` en su **camino por defecto `@gorhom/bottom-sheet`** (`nativeModal` NO seteado, default false, Sheet.tsx:171). El sheet "Más" es **CRITICO para el flujo**: unica via a Suscripción / Check-ins / Mi cuenta / Soporte / Equipo / Cardio / Movimiento en mobile.

Riesgo documentado (Sheet.tsx:117-144): bajo el stack actual (gorhom 5.2.14 escrito para reanimated 3 + reanimated 4.1.7 + RN 0.81.5 + Fabric), el PRIMER `present()` puede resolver snap points contra `containerLayoutState.height = -999` → sheet fuera de pantalla en el primer tap desde Home ("Más no abre al primer tap, sí tras visitar otra tab"). Como `'55%'` es un snap FIJO (no depende de medir contenido — `dynamicSizing` no se usa aquí), el segundo modo de fallo (`enableDynamicSizing` mide 0) NO aplica. Pero el modo de fallo #1 (containerHeight -999 en cold-start) SIGUE siendo posible porque es del hosting-container, independiente del snap.

**Accion (brief P0):** verificar el PRIMER present del sheet en device recien montado (Home → tap "Más" sin visitar otra tab). Si aparece off-screen ⇒ migrar a `nativeModal` (Sheet.tsx:145, camino `<Modal>` RN que no depende del hosting-container; API identica, solo se agrega `nativeModal` al `<Sheet>` L266). Si abre bien ⇒ anotar el riesgo residual pero puede quedar con snap fijo.

### 7.2 Parity debt anotada (regla 2 — divergencia documentada, conservar)
El orden/contenido del overflow "Más" NO es 1:1 con web: web pliega Suscripción dentro del hub Opciones; RN la deja como screen legacy al final (`_layout.tsx:50-55`, `LEGACY_OVERFLOW` CoachMobileChrome.tsx:77-81). Cerrar la deuda = plegar Suscripción/Check-ins/Mi cuenta dentro de Opciones RN (liberaria el 5º slot). Es decision de producto, NO auto-sancionable — se conserva.

### 7.3 Gesto/flujo divergente → PENDIENTE-DECISION-CEO (regla 8)
- **5 tabs sin "Más" (web) vs 4 tabs + sheet "Más" (RN)**: cambia el GESTO de acceso a Opciones (tap directo en barra vs tap "Más" → tap fila del sheet). No auto-sancionar.
- **Estado bloqueado**: web = tab "Reactivar" en la barra; RN = CTA relleno full-width `ReactivateBar` + `router.replace`. Dos UIs para el mismo estado — PENDIENTE-DECISION-CEO (cual es fuente de verdad).

### 7.4 Gate de suscripcion (brief P0) — NO eliminar
`_layout.tsx:18-30` es funcionalidad RN critica (espejo del middleware web + guard alumno→suspended). Respeta gracia hasta `current_period_end` y NUNCA gatea managed (org/team). Cualquier edicion de esta unidad debe preservarlo intacto.

---

## 8. Hallazgos ronda 5
El brief NO cita tablas r5 para esta unidad (brief §"Componentes a grepear" solo referencia Ola 0). Sin seccion r5 aplicable. Los gotchas de clase pertinentes provienen de RONDA 6 (MEMORY: sheets snapPoints fijos = altura 0 → dynamicSizing; expo-blur Android sin `experimentalBlurMethod` = velo sin blur), ambos institucionalizados como 6a/6b (§7 y §5) y presentes en el codigo (Sheet L266; BlurView `experimentalBlurMethod` L188).

---

## 9. Reglas duras aplicables al ejecutor
- NO tocar arbol alumno/ejecutor (Secciones 1-2). Esta unidad solo edita `CoachMobileChrome.tsx` + `(tabs)/_layout.tsx`.
- Tokens del theme; cero hex crudo NUEVO. Los hex existentes (#0E1117/#FFFFFF/#0D121C, hexToRgba fallback rgba(0,122,255)) son PREEXISTENTES (Ola 0 4.1.5) — tokenizarlos es mejora, no introducir nuevos. NO tocar global.css/tailwind.config.js.
- Copy verbatim: "Más", "Más opciones", "Reactivar suscripción", labels de `NAV_ROUTE` (Inicio/Alumnos/Programas/Nutrición/Opciones/Soporte/Equipo/Cardio/Movimiento) + `LEGACY_OVERFLOW` (Suscripción/Check-ins/Mi cuenta).
- NO eliminar accesos del sheet "Más" (regla 2) ni el gate de suscripcion (`_layout.tsx:18-30`).
- GATE: `npx tsc --noEmit` limpio en `apps/mobile`.
