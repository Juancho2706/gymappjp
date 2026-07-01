# Auditoría de fidelidad visual — Módulos (Cardio · Movimiento · Composición corporal)

**Fecha:** 2026-07-01 · **Rama:** feat/redesign-eva-design-system
**Kit (fuente de verdad):** `docs/design-source/ui_kits/eva-app/screens/coach-modules.jsx` + `coach-modules-hub.jsx` (mobile <760) · `docs/design-source/ui_kits/eva-desktop/{desktop-coach.jsx,index.html}` (≥760)
**App:** `apps/web/src/app/coach/cardio/**` · `apps/web/src/app/coach/movement/**` · `apps/web/src/app/coach/clients/[clientId]/bodycomp/**`

---

## [P0] Falta el Hub/Launcher de módulos "Herramientas" (ModulesHub) — y en móvil las herramientas de módulo quedan sin puerta de entrada

- **Kit:** `coach-modules-hub.jsx` completo — `ModulesHub` (L81-186), `ModuleHubCard` (L25-77), `ModulePickStudent` (L189-239). Header del kit: *"Vive bajo el tab Alumnos (NO es un 6º tab). Comprar ≠ usar"*. Es una galería de tarjetas por módulo con: estado (`Activo` dot / `De pago` / `Mantenimiento`), etiqueta de ALCANCE ("Se usa con un alumno" / "Se configura en el plan"), CTA según estado (Usar / Desbloquear · $/mes / Pídelo al owner), **empty-state que VENDE** (Card inverse "Potenciá tu evaluación" + catálogo bloqueado debajo, L104-125), y **picker single de alumno** con elegibilidad para Composición ("Sin peso registrado → No elegible", L217-232). En desktop se entra desde el header del roster de Alumnos (icono `layout-grid` "Herramientas", `desktop-coach.jsx:49`; `index.html:1142,1164,1266`) y se renderiza como pantalla verbatim en la columna de 740px.
- **App:** el hub NO existe. Los módulos activos son entradas del **sidebar desktop** (grupo secundario bajo divisor "MÁS": `coach-nav.ts:72-73`, `CoachSidebar.tsx:133`) y los bloqueados simplemente desaparecen del nav (`getVisibleNavItems` filtra entitlement OFF, `coach-nav.ts:130`) — cero descubrimiento/upsell en la superficie de uso. En **móvil (<760)** la cápsula flotante solo renderiza `MOBILE_TAB_KEYS` (dashboard/clients/programs/nutrition/options — `CoachSidebar.tsx:84,136-140`): **no hay NINGUNA entrada a `/coach/cardio` ni `/coach/movement`** (las calculadoras de zonas/pace/plantillas y el hub de screening quedan inaccesibles salvo deep-link o los atajos por-alumno de la ficha). Composición no tiene launcher con picker (solo vía ficha → Progreso). Evidencia extra: el copy de venta promete la ruta del kit — `subscription/page.tsx:780` *"usalo desde Alumnos › Herramientas"* — que no existe.
- **Fix propuesto:** construir `/coach/tools` (ModulesHub verbatim del kit: cards con estado+alcance, sección "Descubre más" con locked→catálogo, picker single para composición) y colgarlo de un botón `layout-grid` en el header de Alumnos (roster desktop `CoachRosterMasterDetail.tsx:170` y directorio móvil), reutilizando los entitlements ya resueltos en el layout.
- **Verdict:** CONFIRMED — verificado adversarialmente: (a) no existe ruta hub (`ls app/coach/` sin tools/modules-hub); (b) los `LayoutGrid` del roster son toggles de vista tabla/grid (`CoachRosterMasterDetail.tsx:173` "Vista tabla", `DirectoryActionBar.tsx:322` "Vista cuadrícula"), NO "Herramientas"; (c) la cápsula móvil renderiza solo `MOBILE_TAB_KEYS` sin cardio/movement ni menú "Más" (`CoachSidebar.tsx:84,137-140`); (d) el catálogo `/coach/settings/modules` (`ModulesForm`) no tiene ningún link "Usar" a las herramientas; (e) NO es decisión intencional: `specs/redesign-eva-ds/feature-matrix.md` §Reubicaciones #3 declara el hub como movimiento deliberado DEL DISEÑO aún viviendo como "rutas top-level dispersas", y el §Reubicaciones #1 pide "Más" móvil que agrupe módulos (tampoco existe); (f) el grupo "Más" del sidebar de la app NO es espejo del kit — el `dt-nav2` del kit solo contiene Soporte (`index.html:1241-1243`), los módulos entran vía hub (`index.html:1164,1266`). El copy `subscription/page.tsx:780` verificado verbatim. Matiz menor: las herramientas SÍ son alcanzables en móvil por ruta circular (ficha → atajo por-alumno → back "Cardio"/"Movimiento"), ya reconocido en el finding.

## [P1] ModuleOffNotice sin re-skin EVA DS (tokens legacy shadcn)

- **Kit:** el lenguaje de bloqueo es `ModuleHubCard` locked (Card DS, icono en `surface-sunken`, Badge "De pago", botón secondary `Desbloquear`) — `coach-modules-hub.jsx:25-77`.
- **App:** `components/coach/ModuleOffNotice.tsx:59-75` usa `bg-muted text-muted-foreground`, `text-foreground`, `bg-primary text-primary-foreground`, `rounded-xl` y CTA `uppercase tracking-widest` — paleta/typo shadcn pre-rediseño, sin `font-display`, sin `rounded-control`, sin `cta-fill`, sin Badge DS. Es la pantalla que ve todo coach que llega a un módulo apagado.
- **Fix:** re-skin con primitivas DS (Card padding lg, icono 48px `rounded-[14px] bg-surface-sunken`, `font-display` para el título, CTA `bg-[var(--cta-fill)] rounded-control` sin uppercase).
- **Verdict:** DOWNGRADED→P2 — el gap existe pero la severidad y el claim "paleta shadcn pre-rediseño" están inflados: los tokens compat están REMAPEADOS a EVA DS en `globals.css:209-226` (`--muted:var(--surface-sunken)`, `--muted-foreground:var(--text-muted)`, `--foreground:var(--text-body)`), así que el círculo del icono y los textos YA renderizan en colores DS (el icono sobre `surface-sunken` es exactamente lo que pide el kit). Gap residual real y visible: título sin `font-display` (y en `text-body` vs `text-strong`), CTA `uppercase tracking-widest` + `rounded-xl` (12px vs `rounded-control` 14px) + `bg-primary` que resuelve a `--theme-primary` (color de marca del coach, inyectado en `coach/layout.tsx:166` — no `--cta-fill`), y sin Card/Badge DS. Además: (1) superficie de bajo tráfico — con el módulo OFF la entrada desaparece del nav (P0), así que solo se llega por deep-link/bookmark (el propio componente lo documenta: "SOLO aparece si el coach llegó por una URL directa"); (2) la ausencia de precio/Badge "De pago·$" es regla documentada anti-hostigamiento (plan 05 F5.7 §2.6), no drift.

## [P1] Wizard movimiento: Dolor/descarte no fuerza el "puntaje 0" del kit

- **Kit:** `coach-modules.jsx:815-822` — con `pain` o `clearing` ON el score row se OCULTA y aparece el aviso danger *"El patrón se registra con puntaje 0."* (danger-100 + alert-circle); el patrón cuenta como completo (`isComplete` L765).
- **App:** `movement/_components/MovementWizard.tsx:66-68` — `isComplete` exige puntajes I/D (o único) SIEMPRE, incluso con Dolor ON; el aviso de puntaje forzado no existe y los botones 0-3 permanecen activos. Visual y flujo del paso difieren del kit en el caso clínico más importante.
- **Fix:** cuando `pain || clearing_positive` → ocultar `ScoreSegmented`, mostrar el aviso danger del kit y tratar el ítem como completo (el motor `finalItemScore` ya fuerza 0).
- **Verdict:** CONFIRMED — kit verificado (`coach-modules.jsx:765` `isComplete = pain || clearing || scores`; L817-822 score row oculto + aviso danger-100 "El patrón se registra con puntaje 0."); app verificada (`MovementWizard.tsx:66-68` `isComplete` exige SOLO puntajes — pain/clearing no completan; `ScoreSegmented` se renderiza incondicional L330-349; el botón Siguiente queda `disabled` L560 hasta puntuar, forzando input sin sentido clínico que el motor pisará a 0; el aviso danger no existe en el paso). Divergencia visual+flujo real en el caso clínico central. No hay decisión documentada que lo justifique.

## [P1] BIA: falta la card "Última medición" con grilla de tiles métricos + deltas

- **Kit:** `coach-modules.jsx:660-679` — card "ÚLTIMA MEDICIÓN · dispositivo · fecha" con grilla 3×2 de tiles `surface-sunken` (% Grasa / Músculo / M. grasa / Visceral / Basal / Áng. fase), cada uno con delta coloreado bueno/malo (↓grasa verde, ↑músculo verde).
- **App:** `bodycomp/_components/BiaTrendPanel.tsx` — solo chart + un delta de la serie activa junto a los pills + lista de historial. La foto-resumen de la última medición BIA (la pieza más informativa del panel del kit) no está. (ISAK sí la tiene vía `IsakResultCard`.)
- **Fix:** agregar sobre el chart una card resumen con los tiles del kit leyendo `readBiaMetrics(rows[0])` + `deltaVsPrev` por métrica.
- **Verdict:** CONFIRMED — `BiaTrendPanel.tsx` verificado completo: solo pills de serie + un delta de la serie activa (L99-113) + LineChart + lista historial; ninguna card "Última medición" con grilla de tiles. Cacé el bias "componente hermano": la card del kit SÍ existe en el repo como `components/bodycomp/StudentBiaSummary.tsx` (grilla de tiles `surface-sunken` + `DeltaBadge` verde/rojo con `higherIsBetter` — espejo del kit) pero se usa ÚNICAMENTE en la app del alumno (`/c/[coach_slug]/bodycomp` vía `StudentBodyCompositionView`), nunca en el panel coach. Eso REFUERZA el finding (no es decisión intencional — la pieza se construyó y no se cableó al coach) y abarata el fix a un reuse.

## [P1] Wizard desktop: footer fijo cruza todo el viewport y tapa el sidebar

- **Kit:** en desktop las pantallas de módulo viven confinadas al `dt-stage` (columna 740px con `transform: translateZ(0)` que ancla los fixed al stage — `index.html:134-138`); nada se dibuja sobre el rail de navegación.
- **App:** `MovementWizard.tsx:535` — `<footer className="fixed inset-x-0 bottom-0 z-40 …">` abarca el viewport completo; el sidebar es `md:sticky md:z-[6]` (`CoachSidebar.tsx:196`), así que en ≥760 la barra de total parcial + Siguiente se superpone al pie del sidebar y rompe la geometría del shell.
- **Fix:** en `md:` dar al footer `left` = ancho del sidebar (o volverlo `sticky bottom-0` dentro del main / limitarlo a `max-w-2xl` centrado en la región de contenido).
- **Verdict:** CONFIRMED — `MovementWizard.tsx:535` verificado: `fixed inset-x-0 bottom-0 z-40` sin ningún override `md:`; el wizard se monta en `/coach/movement/[clientId]/new` bajo el layout estándar (sidebar visible — `isBuilder` solo cubre rutas builder), y el sidebar es `md:sticky md:top-0 md:z-[6]` (`CoachSidebar.tsx:196`) → en ≥760px la barra (fondo color-mix 92% + blur, casi opaca) cubre el pie del sidebar (avatar coach + "Colapsar menú"). Kit verificado: `index.html:134-138` — `dt-stage` con `transform: translateZ(0)` como containing block que confina explícitamente "screens' fixed modals/sheets/FABs/sticky CTAs" a la columna de 740px. Geometría del shell rota vs kit; real y visible.

## [P2] ISAK: falta la barra apilada Kerr 5C con leyenda viz-1..5

- **Kit:** `coach-modules.jsx:687-698` — stacked bar horizontal (pill 16px) con los 5 componentes en `var(--viz-1..5)` + leyenda con cuadraditos y %.
- **App:** `IsakResultCard.tsx:47-62` muestra los 5 componentes como tiles (kg + %) — info completa pero la firma visual característica del kit (barra apilada) no está.
- **Fix:** añadir la stacked bar + leyenda sobre la grilla de tiles usando `--viz-*`.

## [P2] Tendencia bodycomp: line chart genérico de recharts vs bar-chart del kit

- **Kit:** `TrendChart` (`coach-modules.jsx:524-539`) — barras simples con el valor mono encima, última barra en acento (sport para BIA, success para ISAK), resto `ink-100`; sin ejes, sin grid, sin tooltip.
- **App:** `BiaTrendPanel.tsx:116-141` / `IsakTrendPanel.tsx:136-161` — recharts `LineChart` con `CartesianGrid` punteado, ejes X/Y y tooltip; colores de línea correctos (sport/success) pero la lectura es "dashboard genérico", no el minimal del kit.
- **Fix:** (opcional) reemplazar por barras del kit o al menos quitar grid/ejes y mostrar valores mono sobre puntos.

## [P2] Perfil cardio: sin preview en vivo de FC máx y 5K en segundos crudos

- **Kit:** `CardioProfileEdit` (`coach-modules.jsx:162-207`) — bottom-sheet con 4 campos, fila `surface-sunken` de preview en vivo "FC máx estimada · Tanaka (208 − 0,7·edad)" y campo **"Tiempo 5K" en mm:ss** con fuente mono; guarda con toast inline.
- **App:** `CardioProfileForm.tsx:107-123` — página aparte (`/coach/cardio/[clientId]`), sin preview reactivo (las "Zonas resultantes" son server-render post-guardado) y la referencia 5K se pide en **segundos** (placeholder "Ej. 1500 (= 25:00)").
- **Fix:** input mm:ss con parse a segundos + fila de preview client-side reutilizando `maxHrTanaka`.

## [P2] Wizard: paso del patrón sin Card contenedora, orden invertido y sin animación

- **Kit:** `coach-modules.jsx:796-825` — todo el paso vive en `Card padding="lg"` con eyebrow sport "Patrón N · bilateral" + nombre 23px; orden flags → score; cada paso entra con `evaOnbIn 320ms`. Consentimiento = card tappable con borde/fondo sport al marcar (L863-866).
- **App:** `MovementWizard.tsx:319-385` — contenido plano sobre el fondo (sin Card), eyebrow "Paso N" sin "· bilateral", orden score → flags → comentario, sin animación de entrada; consentimiento con checkbox nativo `accent-[var(--brand)]` (L490-500).
- **Fix:** envolver el paso en Card lg, invertir orden, añadir `animate-*` de entrada y el check-card del kit.

## [P2] Stepper ISAK: pills numeradas en vez de segmentos de progreso

- **Kit:** `coach-modules.jsx:589-593` — 4 segmentos finos (5px, `success-500` los completados) clickeables, título "Nueva ISAK · {paso}".
- **App:** `IsakCaptureForm.tsx:180-196` — pills `rounded-pill` "1. Datos base + pliegues…" (activo `ink-950`). El título sí espeja el kit. Además las labels de campos usan el `Label` shadcn (`text-sm font-medium`) vs 11px bold muted del kit (`inStyle` L742).
- **Fix:** cambiar pills por la barra de segmentos del kit; pasar labels a `text-[11px] font-bold text-muted`.

## [P2] Identidad de color de Cardio: aqua en la app, sport en el kit

- **Kit:** el módulo Cardio se identifica en sport (heart-pulse `sport-400` sobre sport translúcido en el hero read-only `coach-modules.jsx:27`; card del hub `sport-100/sport-600`).
- **App:** `cardio/page.tsx:28` y `cardio/[clientId]/page.tsx:46` usan `bg-aqua-100 text-aqua-700` para el icono del header (aqua = color de Z1 en la escala de zonas, no del módulo).
- **Fix:** icono del header a `sport-100/sport-600`.

## [P2] Desktop: back interno duplicado con el breadcrumb del topbar

- **Kit:** `index.html:586-588` oculta el "Atrás/Volver" interno de las pantallas reusadas en desktop (el DesktopTopBar ya da back+breadcrumb).
- **App:** `CoachTopBar.tsx:44-45` genera breadcrumb "Cardio · Detalle"/"Movimiento · Detalle", pero `cardio/[clientId]/page.tsx:37-43`, `ClientMovementReport.tsx:42-48` y `BodyCompositionTabB6b.tsx:39-45` mantienen su back propio en ≥760 → doble affordance.
- **Fix:** `md:hidden` en los back internos de las 3 superficies (patrón ya usado en otras pantallas del rediseño).

---

## Verificado 1:1 (sin gap)

- **Cardio · Zonas** (`CardioToolsClient.tsx`): segmented Zonas/Pace/Plantillas, selector de alumno con resumen de perfil en `surface-sunken`, grid manual Edad/FC reposo, card resultado con FC máx metric + método Tanaka/Karvonen/FC medida, filas Z1-Z5 con cuadrado de color exacto del kit (aqua→danger), empty-states de edad inválida y perfil incompleto con CTA — espejo fiel de `CardioZones`.
- **Cardio · Pace**: inputs mono pace/distancia + grid 2×2 de result-cards (Tiempo total/Velocidad/Pace milla/Pace km) con label uppercase + eva-metric — 1:1 con `CardioPace`.
- **Cardio · Plantillas**: cards nombre+Badge zona (tonos success/warning/danger correctos) + desc + meta mono "~mm:ss cronometrables"/"por distancia" — 1:1 (con motor real de intervalos, riqueza permitida).
- **Movimiento · Hub** (`MovementHubList.tsx`): info-strip `surface-sunken` con clipboard-check, Card padding-none con filas avatar `ink-900`/inicial `sport-400`, semáforo dot + `n/21` mono + fecha, badge Borrador, chevron `ink-300`, disclaimer — fiel a `MovementHub` (CTA "Evaluar" por fila = add razonable).
- **Movimiento · Reporte** (`AssessmentReportCard.tsx`): hero inverse con pill de banda + 46px composite `/21` + badges Dolor/Asimetría solid, tabla 7 patrones con columnas I/D/Ú (8.5px label + mono 15px, lado débil en danger), cuadrado de puntaje final (danger-100/warning-100/sunken), notas, disclaimer — 1:1.
- **Movimiento · Evolución** (`EvolutionCharts.tsx`): barras del compuesto (h = composite/21*64+8, última opaca, resto 0.4) + comparativa por patrón primera→última con flechas success/danger — transcripción exacta del kit.
- **Movimiento · Historial**: filas dot de banda + label + `n/21 · fecha` mono + eliminar; botonera Imprimir (secondary) + Nueva evaluación (sport fullWidth) — igual al kit.
- **Wizard**: barra de progreso por patrón (sport-500/sport-300/ink-200), score buttons 0-3 con colores danger/warning/sport/success del kit, toggles switch pill, review list con navegación por paso y cuadrado de score, hero preview inverse, total parcial `/21` en el footer, disclaimer — estructura y tokens correctos (gaps puntuales arriba).
- **Composición · Shell** (`BodyCompositionTabB6b.tsx`): header título+"Módulo · captura"+Badge, `SegmentedControl` Bioimpedancia/Antropometría, toggle Nueva medición/Cancelar (sport↔secondary fullWidth) — espejo del `ComposicionModule` coach.
- **Composición · Captura**: headers "Nueva medición · BIA"+Badge Entrenador / "Nueva ISAK · paso"+Badge Nutri (tonos neutral/success como el kit), grids 2-col, selector de ecuación Durnin/Yuhasz/Faulkner, preview "Vista previa"+Preliminar, Σ masas vs peso con umbral ±3 kg verde/warning — fiel (con muchos más campos reales = riqueza permitida).
- **Print branded** (`MovementPrintReport.tsx`): más rico que el kit (que solo tenía `ModuleStub` "Reporte PDF") — logo + color de marca del contexto, tabla I/D/dolor/final, disclaimer. No es gap.
- **Semáforos**: cortes ≥17 baja / ≥14 media / <14 alta y copy "prioridad" idénticos al kit (`PriorityBadge`, `bandColor`).
- **DS base**: `SegmentedControl`, `Card`, `Badge`, `Button`, `Input` de `components/ui` están re-skineados a EVA DS (sunken track + card pill activa, radius-control 14px, cta-fill/glow) — los módulos los consumen correctamente.

---

## Fix log (2026-07-01)

- **[P0] Hub "Herramientas"** → FIXED — ruta nueva `apps/web/src/app/coach/tools/` (`page.tsx` + `loading.tsx` + `_data/tools.queries.ts` + `_components/ToolsHub.tsx`). Loader REUSA el mismo gate que las páginas de módulo (`resolvePreferredWorkspace` + `getTeam/getCoachEnabledModules` + `applyOperatorKillSwitch` — espejo de `coach/layout.tsx`; enterprise ⇒ todo locked/managed) y `listCardioClients` (scoped) para el picker. UI verbatim del kit `coach-modules-hub.jsx`: ModuleHubCard (icono 48px sport-100/sunken, chip de alcance, Badge Activo dot/De pago, CTA Usar sport / Desbloquear · $9.990/mes vía `ADDON_CONFIG` / fila "Pídelo al owner" en team), info-strip, sección "En el plan de nutrición", "Descubre más", empty-state Card inverse "Potenciá tu evaluación" + catálogo bloqueado. Picker single de alumno para Composición replicando el patrón Asignar de Programas (Sheet bottom <760 / Dialog ≥760) → `/coach/clients/[id]/bodycomp`. **Requiere wiring externo:** los links de entrada (header del roster Alumnos desktop `layout-grid`, directorio móvil / cápsula) los cablea otro agente — ruta final: **`/coach/tools`**. Nota: la elegibilidad "Sin peso registrado → No elegible" del kit NO se implementó — `clients` no tiene columna de peso y la captura bodycomp registra su propio `weight_kg` (bloquear sería inventar una restricción que el server no tiene).
- **[P1→P2] ModuleOffNotice re-skin** → FIXED — `components/coach/ModuleOffNotice.tsx`: icono a tile 48px `rounded-[14px] bg-surface-sunken text-subtle`, título `font-display font-extrabold tracking-[-0.02em] text-strong`, descripción `text-muted`, CTA `rounded-control bg-[var(--cta-fill)] text-[var(--text-on-sport)]` sin uppercase/tracking (48px, ≥44px táctil). Sin precio (regla anti-hostigamiento intacta), testid intacto.
- **[P1] Wizard Dolor/descarte → puntaje 0** → FIXED — `MovementWizard.tsx`: helper `isForcedZero`; con dolor/descarte ON el `ScoreSegmented` se oculta y aparece el aviso danger del kit ("El patrón se registra con puntaje 0.", danger-100 + alert-circle); el ítem cuenta como completo. Verificado el path de guardado: `MovementItemInputSchema` (Zod) EXIGE los puntajes crudos aun con pain ⇒ al guardar/calcular se coalescen los null a **0** (acepta 0 sin validación extra; `finalItemScore` fuerza el final a 0 igual y el server recalcula siempre). Copy hardcodeado es (como el resto de superficies del módulo bodycomp) para no tocar `lib/i18n` compartido.
- **[P1] BIA card "Última medición"** → FIXED — `BiaTrendPanel.tsx`: reuse de `components/bodycomp/StudentBiaSummary` (la pieza ya era espejo del kit: grilla de tiles surface-sunken + DeltaBadge con `higherIsBetter`) renderizada sobre el chart. Import-only, cero cambios al componente compartido.
- **[P1] Footer del wizard sobre el sidebar (desktop)** → FIXED — `MovementWizard.tsx:` footer `fixed inset-x-0 bottom-0` ahora `md:static md:inset-x-auto` (en ≥760 fluye al pie de la columna de contenido — equivalente al confinamiento del `dt-stage`; `sticky` no aplica: el `main` del shell es scroll-container `overflow-y-auto` que no scrollea → sticky sería no-op) + `main pb-32 md:pb-8`.
- **[P2] Identidad de color Cardio** → FIXED — `cardio/page.tsx` y `cardio/[clientId]/page.tsx`: icono del header `bg-aqua-100 text-aqua-700` → `bg-sport-100 text-sport-600` (kit).
- **[P2] Back interno duplicado en desktop** → FIXED — `md:hidden` en los back de `cardio/[clientId]/page.tsx`, `ClientMovementReport.tsx` y `BodyCompositionTabB6b.tsx` (el breadcrumb del CoachTopBar ya da back en ≥760).
- **[P2] ISAK stacked bar Kerr 5C** → SKIPPED — estructural (viz nueva con leyenda), no es swap de clases.
- **[P2] Trend bar-chart del kit vs recharts** → SKIPPED — estructural y marcado "(opcional)" en el finding.
- **[P2] Cardio perfil: preview en vivo + mm:ss** → SKIPPED — estructural (input con parse + preview client-side reactivo).
- **[P2] Wizard: Card contenedora + orden flags→score + animación** → SKIPPED — estructural (reordenar el paso + check-card + keyframes).
- **[P2] Stepper ISAK segmentos + labels 11px** → SKIPPED — estructural (reemplazo del patrón de pills del stepper).
