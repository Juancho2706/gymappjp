# Auditoría de fidelidad visual — SHELL (sidebar + topbar + tab bar móvil)

Área: shell · Fecha: 2026-07-01 · Auditor: gap-audit (kit Claude Design vs implementación Next.js)

Fuentes kit: `docs/design-source/ui_kits/eva-desktop/desktop-shell.jsx` + CSS `.dt-*` en `eva-desktop/index.html`; móvil `docs/design-source/components/navigation/TabBar.jsx` + shell de `eva-app/index.html`.
App: `apps/web/src/components/coach/CoachSidebar.tsx`, `CoachTopBar.tsx`, `CoachMainWrapper.tsx`, `RosterViewContext.tsx`, `apps/web/src/app/coach/layout.tsx`, `apps/web/src/components/ui/tab-bar.tsx`.

---

## [P1] Sidebar no auto-colapsa a rail en anchos "compact" (760–1080px)

- **Kit:** `eva-desktop/index.html:989` `mode = vw >= 1080 ? 'wide' : vw >= 760 ? 'compact' : 'mobile'` y `:1230` `collapsed = mode === 'compact' || (mode === 'wide' && !!tw.sidebarCollapsed)` — entre 760 y 1080 el sidebar SIEMPRE es el rail de 76px (`.dt-side[data-collapsed="1"]`, index.html:83); el toggle manual solo existe en wide.
- **App:** `CoachSidebar.tsx:88-97,122-126` — `isCollapsed` es SOLO manual (localStorage `sidebar-collapsed`), default expandido. En una ventana de 800–1000px (tablet horizontal, split-view) el sidebar de 248px se come ~1/4 del ancho y el contenido queda más apretado que el kit.
- **Diferencia visual:** en el rango tablet el kit muestra rail icon-only + contenido ancho; la app muestra sidebar completo + contenido angosto.
- **Fix:** derivar `collapsed = manual || viewportWidth < 1080` (matchMedia `(min-width:1080px)`) manteniendo el override manual solo en wide, espejo exacto del kit.
- **Verdict:** CONFIRMED — verificado adversarialmente: `CoachSidebar.tsx:88-97` solo lee localStorage (sin matchMedia/lg: en todo `components/coach`, grep sin matches); el único ancho CSS es `isCollapsed ? md:w-[76px] : md:w-[248px]` sin variante por viewport. Con `--breakpoint-md: 760px` (globals.css:26) el sidebar expandido de 248px aparece EXACTAMENTE en el rango 760–1080 donde el kit fuerza el rail (`index.html:989` + `:1230` verificados verbatim). Visible en iPad landscape (1024px), device class real.

## [P1] Topbar desktop no es persistente — scrollea fuera de vista

- **Kit:** `.eva-desktop { position: fixed; inset: 0; overflow: hidden }` (index.html:65-66) + `.dt-topbar` como chrome fijo (index.html:145); el scroll vive DENTRO de `.dt-body > .scroll` → breadcrumb, búsqueda, campana y cuenta siempre visibles.
- **App:** `coach/layout.tsx:218` el contenedor es `min-h-[100dvh] md:min-h-screen` (crece con el contenido → scrollea la ventana; solo el builder se constriñe vía `has-[.coach-builder-shell]:h-dvh`). `CoachTopBar.tsx:146` el `<header>` no tiene `sticky`/`fixed` (el sidebar SÍ es `md:sticky md:top-0`, CoachSidebar.tsx:196). Resultado: en cualquier página más alta que el viewport (dashboard, roster, settings) el topbar desaparece al scrollear.
- **Fix:** `sticky top-0` en el header (ya tiene `z-[4]` + `bg-[var(--surface-card)]`), o constreñir el layout a `h-dvh` con scroll interno en `<main>` como el kit.
- **Verdict:** CONFIRMED — el `<main>` de CoachMainWrapper SÍ tiene `overflow-y-auto` (posible refutación), pero su alto no está constreñido: el container es `min-h-screen` (crece con contenido) y la columna intermedia no tiene `h`/`min-h-0` → el scroll real es de window (el propio comentario de CoachSidebar.tsx:100-101 lo confirma: "el body crece y scrollea"). El header (CoachTopBar.tsx:146) no tiene sticky/fixed; el sidebar sí es `md:sticky md:top-0` — asimetría que delata que el topbar se pierde al scrollear en cualquier página más alta que el viewport. Kit `.eva-desktop { position: fixed; inset: 0; overflow: hidden }` verificado en index.html:65-66.

## [P1] Panel de la campana sin re-skin EVA DS (skin shadcn legacy)

- **Kit:** `desktop-shell.jsx:307-336` + CSS `.dt-notif*` (index.html:606-647): badge numérico `--ember-500` con ring de surface-card (`.dt-tb-badge`:608), panel 400px `radius-lg shadow-xl` con header font-display 800 15px + acción "Marcar todas" en sport-600, filas agrupadas (eyebrow uppercase) con icono tonal redondo 34px, rail sport de no-leída (`data-unread`), timestamp a la derecha, footer "Ver todas →" sport.
- **App:** `NewsBellButton.tsx:167-179` badge `bg-destructive` (rojo, no ember) y `:239-249` popover shadcn `w-80` con tokens legacy (`text-muted-foreground`, `border-border bg-card`, `text-foreground`, `text-primary`) y `NewsFeedList` (`:112-165`) con cards `rounded-xl` e iconos EMOJI (🟢🔧🐛📢) — nada del vocabulario visual `.dt-notif` (sin grupos, sin iconos tonales, sin rail unread, sin footer).
- **Diferencia visual:** el dropdown más visible del topbar se ve a "shadcn viejo", no a EVA DS.
- **Fix:** re-skin del popover con la estructura/tokens `.dt-notif` (header display-font + filas icono-tonal + footer); reemplazar emojis por iconos lucide en círculo tonal (`--sport-100/600`, `--ember-100/700`…). El contenido "Novedades" (news) como data es válido (regla #6).
- **Verdict:** CONFIRMED — verificado línea a línea: `NewsBellButton.tsx:173` badge `bg-destructive` (rojo, kit `.dt-tb-badge` = `--ember-500`, index.html:608), `:243` popover shadcn `w-80` (kit 400px), `:20-25` iconos EMOJI (🟢🔧🐛📢) y tokens legacy `text-muted-foreground`/`border-border bg-card` en NewsFeedList. La decisión intencional (regla #6) cubre el CONTENIDO news, no el skin; el propio "Verificado 1:1" solo dice "campana (reusada)" sin re-skin. Diferencia visible en el dropdown más usado del topbar.

## [P1] Falta el badge "en riesgo" del nav (.dt-nav-badge en Alumnos)

- **Kit:** `desktop-shell.jsx:131` renderiza `badges[it.value]` como pill `--danger-500` (CSS index.html:195-197; colapsado → dot 16px arriba-derecha del icono) y el shell lo alimenta con `enRiesgo` (index.html:1240,1244 `navBadges = { alumnos: enRiesgo }`).
- **App:** `CoachSidebar.tsx:149-186` `renderNavLink` no tiene slot de badge; `coach-nav.ts` no modela badges. El dato existe (war-room / alumnos en riesgo del dashboard).
- **Diferencia visual:** el kit señala carga de trabajo pendiente directamente en el nav; la app no.
- **Fix:** prop `badges?: Record<string,number>` en CoachSidebar (server-side count de alumnos en riesgo desde el layout) + span espejo de `.dt-nav-badge` con variante colapsada.
- **Verdict:** CONFIRMED — `renderNavLink` (CoachSidebar.tsx:149-186, leído completo) no tiene slot de badge y `coach-nav.ts` no modela badges (grep `badge` sin matches). Kit verificado: `desktop-shell.jsx:131` + `navBadges = { alumnos: enRiesgo }` (index.html:1240,1244) + CSS `.dt-nav-badge` (:195-197) con variante colapsada. NO es mock-only: el estado "en riesgo" existe como data real en la app (war-room / roster), así que no aplica la excusa mocks-vs-data. Elemento visible del chrome persistente cuando hay alumnos en riesgo (caso común).

## [P1] Avatares del shell no usan el Avatar DS (círculo sport-500 + inicial blanca)

- **Kit:** pie del sidebar y cuenta del topbar usan `Avatar` del DS (`desktop-shell.jsx:156,340`; `_ds_bundle.js` Avatar: fondo `--surface-inverse` (ink oscuro), iniciales (hasta 2) en `--sport-400`, font-display 800, sm=32px).
- **App:** `CoachSidebar.tsx:271-275` y `CoachTopBar.tsx:235-237` — círculo relleno `bg-[var(--sport-500)]` con UNA inicial en blanco (34px). La app YA tiene el componente fiel: `components/ui/avatar.tsx:133` (`bg-[var(--surface-inverse)] text-sport-400 font-display font-extrabold`).
- **Diferencia visual:** con marca activa el pie/cuenta se ve como un botón brand sólido, no como el avatar ink+sport del DS que usan el resto de las superficies (roster, ficha).
- **Fix:** reemplazar ambos spans por `<Avatar name={coachName} size="sm" />` de `components/ui/avatar.tsx`.
- **Verdict:** CONFIRMED — kit Avatar verificado en `_ds_bundle.js:59-67` (fondo `var(--surface-inverse)`, iniciales hasta 2 en `var(--sport-400)`, font-display 800); app shell usa círculo `bg-[var(--sport-500)]` + 1 inicial blanca en AMBOS puntos (CoachSidebar.tsx:271-275, CoachTopBar.tsx:235-237). El comentario intencional del código ("el panel es la cara de EVA") cubre QUIÉN aparece (coach, no marca), no el estilo del relleno. La app ya tiene el componente fiel (`components/ui/avatar.tsx:133`) — la diferencia ink-oscuro vs brand-sólido es claramente visible en chrome persistente y se agrava con marca activa.

## [P2] Breadcrumb: labels de detalle genéricos y cobertura parcial de rutas

- **Kit:** `desktop-shell.jsx:9-19` `DT_SCREEN_LABELS` da label específico por pantalla pusheada (Constructor, Catálogo, Suscripción, Mi marca, Módulos…) y CUALQUIER drill-down muestra back + "Sección › Detalle" (`:244-255`).
- **App:** `CoachTopBar.tsx:36-67` un solo `detail` fijo por sección ('Detalle', 'Ajustes', 'Perfil del alumno') → p.ej. `/coach/settings/subscription` diría "Opciones › Ajustes"; y rutas fuera de `SECTIONS` (`/coach/subscription`, `/coach/exercises`) caen al fallback sin drill-down → NO muestran back ni crumb.
- **Fix:** tabla de labels por sub-ruta (espejo de DT_SCREEN_LABELS) + entradas para las secciones no listadas.

## [P2] Falta la página "Ver todas" de notificaciones (DesktopNotifications)

- **Kit:** `desktop-shell.jsx:392-447` — bandeja desktop-nativa (`--dt-read-text` 680px, filtros Todas/No leídas, marcar-leída por fila, grupos) alcanzable desde el footer del panel de la campana.
- **App:** no existe ruta equivalente; el popover de Novedades es terminal. Depende de tener feed real (hoy solo news) → ligado a data/backend, por eso P2.
- **Fix (cuando exista feed):** ruta `/coach/notifications` con el patrón `.dt-notif-page`.

## [P2] Nav item queda activo durante drill-down (kit lo des-resalta)

- **Kit:** `desktop-shell.jsx:125` `data-active={!activeRoute && value === it.value}` — con una ruta pusheada (ficha, builder, catálogo) NINGÚN item primario queda activo; el contexto lo da el breadcrumb.
- **App:** `CoachSidebar.tsx:146` prefix-match (`pathname.startsWith(href + '/')`) → "Alumnos" sigue resaltado dentro de `/coach/clients/[id]`.
- **Nota:** patrón común y defendible, pero el ground truth des-resalta. Nit.

## [P2] Cápsula móvil en contexto TEAM: muestra "Opciones" y pierde "Equipo"

- **Kit:** `eva-app/index.html:412-418` `teamTabs` = Inicio · Alumnos · Programas · Nutrición · **Equipo** (sin Opciones como tab).
- **App:** `CoachSidebar.tsx:84` `MOBILE_TAB_KEYS` ordena `settings_team` antes que `team` → para team workspace el slice(0,5) da Inicio·Alumnos·Programas·Nutrición·Opciones y "Equipo" queda fuera de la cápsula.
- **Fix:** para `coach_team`, priorizar `team` sobre `settings_team` en el orden móvil.

## [P2] Canvas del panel `bg-white` / `dark:bg-black` en vez de `--surface-app`

- **Kit:** canvas = `--surface-app` (#FBFCFD claro / #0A0D12 oscuro; tokens/colors.css:71, theme-dark.css:12). Los tokens ya existen idénticos en `globals.css:392,585`.
- **App:** `coach/layout.tsx:218` fija `bg-white … dark:bg-black`. En claro es imperceptible; en oscuro el negro puro (#000) contra cards #161B22 se ve más duro que el ink-tinted del kit.
- **Fix:** `bg-[var(--surface-app)]` (una clase).

## [P2] Marca del sidebar: icono+texto "EVA" en vez del wordmark; asset tenue en dark

- **Kit:** expandido = logo wordmark `eva-logo-ink/white` a 27px (`desktop-shell.jsx:116-117`, CSS `.dt-brand-logo`:86); colapsado = appicon 40px radius 12 (`.dt-brand-mark`:87).
- **App:** `CoachSidebar.tsx:213-224` `EvaBrandIcon` 36px + texto "EVA" font-display black. Intención equivalente (identidad EVA = decisión #2 ✓), pero además en dark el asset `BRAND_APP_ICON` (eva-icon.png) es el outline tenue casi invisible (gotcha conocido, DIFERIDO en memoria SEO).
- **Fix:** usar el asset sólido (icon-512 / eva-logo-white) para la variante dark; opcional adoptar el wordmark 27px.

## [P2] Falta el skip-link "Saltar al contenido"

- **Kit:** `index.html:1304` + CSS `.dt-skip` (:801-802) — link sport-600 que aparece con foco de teclado.
- **App:** sin skip-link en el layout coach (grep sin matches en apps/web/src).
- **Fix:** `<a href="#main">` con el estilo `.dt-skip` antes del sidebar.

---

## Verificado 1:1 (matchea el kit)

- **Sidebar `.dt-side`:** anchos 248/76px, padding 18/14/14 (colapsado px 12), transición 240ms cubic-bezier(.22,1,.36,1), border-r + surface-card, z-6 (CoachSidebar.tsx:194-201).
- **Nav items `.dt-nav-item`:** h 46 (secundarios 42), gap 13, px 12, radius-md, 14.5px/600 tracking -0.01em; activo = sport-100 + sport-600 + weight 750; hover sunken; accent bar 3px sport-500 h-22 left -14 (-12 colapsado); colapsado 48×48 centrado (CoachSidebar.tsx:149-186).
- **Grupo "Más" `.dt-nav2`:** divisor + eyebrow 10px/800 uppercase, Soporte + módulos comprados (splitForSidebar espejo del kit).
- **Pie `.dt-side-foot`:** COACH eyebrow 10px + nombre 13px/700 + botón "Colapsar menú" 38px con chevrons ✓ (salvo avatar, ver P1).
- **Topbar `.dt-topbar`:** h 60, px 22, gap 16, surface-card + border-b, z-4; breadcrumb SOLO en drill-down con back 34px sunken + sep chevron ink-300 + current truncado 240px; búsqueda centrada max-w 460, input 40px sunken con placeholder verbatim "Buscar alumno o programa…  (/)", atajo "/", Escape, botón ×, focus ring `--ring-focus` (definido en globals.css:565). Dropdown de resultados = stub intencional (decisión #4).
- **Toggle Tabla/Ficha `.dt-viewtoggle`:** en el slot correcto (entre búsqueda y acciones), solo en /coach/clients, pill segmentada sunken + activo surface-card/sport-600/shadow-xs (CoachTopBar.tsx:74-111 + RosterViewContext).
- **Cápsula móvil:** transcripción verbatim del TabBar floating (insets 14→72 minimized, radius 30, glass color-mix 74% + blur 26, indicador deslizante sport 15%/24%, glyph fill 0.18, labels 10px que colapsan, spring vars); `.eva-tabbar-press` presente en globals.css:167; hide-on-scroll down / reveal up; 5 tabs coach = kit coachTabs exactos (standalone); safe-area bottom en la posición y `--mobile-content-bottom-offset` (safe + 88px ≈ nav-pad 96 del kit) reservado en main.
- **Tokens shell:** `--dt-read-wide/mid/narrow/text` + `--dt-page-x` idénticos al kit (globals.css:570-574); CoachMainWrapper aplica columna de lectura 1240 + px 32 desktop / 16 móvil, y full-bleed para /coach/clients (espejo de `.dt-md`/`.dt-tbl-root` absolute inset 0).
- **Builder full-screen sin chrome global** y **multi-día**: decisión CEO (#1) — no auditado como gap.
- **Logo EVA (no marca del coach) en el panel** ✓ decisión #2; branding vía rebind `--sport-*` en el layout = mecanismo D2 del kit (brandRamps + dark overrides espejados en coach/layout.tsx:164-216).
