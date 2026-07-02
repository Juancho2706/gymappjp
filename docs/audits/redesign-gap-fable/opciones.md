# Auditoría de fidelidad visual — Área: Opciones (coach settings) — 2026-07-01

Fuentes: kit desktop `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` (`DesktopOpciones` L457-562) + CSS `.dt-set-*` en `index.html` L649-693; kit mobile `docs/design-source/ui_kits/eva-app/screens/coach-settings.jsx` (`Opciones` L6-149, `MiMarcaUpsell` L153-245, `AreasBuilder` L250-339, `Soporte` L350-393, `MiMarca` L422-667, `ModulosManage` L1049-1119, `Funciones` L1123-1180) y `extras.jsx` (`ThemeToggleCard` L342+, `WebBillingNotice` L9-63).
App: `apps/web/src/app/coach/settings/**`.

---

## [P0] Coaches `team_managed` no tienen la SettingsShell desktop — quedan con el hub móvil a todo ancho

- Kit: `DesktopOpciones` es role-aware (`role = 'coach' | 'teams'`, desktop-coach.jsx L457, L480 `<Modulos role={role}>`, L530 brandprev "Iron Pack") — el patrón 2-paneles ES el layout desktop de Opciones también para teams.
- App: `apps/web/src/app/coach/settings/page.tsx` L159-219 — la variante `team_managed` hace early-return con el hub móvil (`max-w-3xl` centrado) a TODO viewport; nunca llega al bloque que arma `sections` + `<CoachSettingsDesktop>` (L344-511).
- Diferencia visual: un coach de pool en desktop ≥760 ve una columna angosta de cards apiladas en vez del rail 260px + pane embebido del kit.
- Fix: mover el early-return de team a las mismas dos ramas (`md:hidden` hub / `hidden md:block` shell), armando `sections` de team (módulos/funciones/áreas/apariencia/eliminar + link Mi Equipo) y filtrando marca/suscripción del rail (CoachSettingsDesktop ya filtra por `sections[id] != null`).
- **Verdict:** REFUTED — la premisa "el patrón 2-paneles ES el layout desktop de Opciones también para teams" es falsa según el propio shell del kit: `index.html` L1290 monta `DesktopOpciones` SOLO con `role === 'coach'` (`else if (isDesktop && !top && role === 'coach' && tab === 'opciones')`), y `teamTabs` (L1214-1220) ni siquiera incluye tab "opciones" (tiene "equipo"). Un teams que llega a Opciones vía el botón de cuenta del topbar cae al fallback NO-wide: la pantalla móvil `Opciones team` en el phone-stage (columna angosta centrada) — exactamente lo que hace la app (`max-w-3xl` centrado). El `role='teams'` dentro de `DesktopOpciones` (L457/L480/L530 "Iron Pack") es código latente que el shell del kit nunca ejercita; DESKTOP-OPT-PLAN.md solo reclama SettingsShell para "Opciones (coach) y Más (alumno)". La app espeja el estado final del kit; a lo sumo sería un P2 de mejora futura, no un gap de fidelidad.

## [P1] Free tier: el hub Opciones desaparece — la página entera es el upsell de Mi Marca

- Kit: `Opciones` (coach-settings.jsx L79-83) mantiene el hub completo para Free — la card "Mi Marca" lleva badge `Pro` y rutea a `miMarcaUpsell`; Apariencia, Plan, Configuración, Soporte y Zona de peligro siguen visibles.
- App: `page.tsx` L224-339 — si `!capabilities.canUseBranding` toda la ruta `/coach/settings` se reemplaza por el upsell (hero + antes/después + pricing) + DangerZone. Sin ThemeToggleCard, sin cards de Módulos/Funciones/Áreas/Soporte, y sin SettingsShell desktop.
- Diferencia visual: para Free la jerarquía de la página es otra pantalla distinta a la del kit; las secciones existen como rutas directas pero no hay puerta visible.
- Fix: renderizar el hub (y la shell desktop) también en Free, con la card Mi Marca badge "Pro" apuntando al upsell (que ya está construido 1:1) como sub-ruta/pane.
- **Verdict:** CONFIRMED — verificado en `page.tsx` L224-339: `!capabilities.canUseBranding` hace early-return de la página entera (upsell + DangerZone) ANTES de la rama desktop, en todos los viewports. El kit (coach-settings.jsx L79-83) mantiene el hub para Free con la card Mi Marca badge `Pro` → `miMarcaUpsell`, y el shell del kit monta `DesktopOpciones` sin gate de tier. Agrava: desde white-label v2 (branding = Pro+), esto afecta también a coaches STARTER que pagan — pierden acceso visible a Apariencia/Módulos/Funciones/Áreas/Soporte desde /coach/settings. No hay decisión documentada (docs/audits/opciones-coach-md/o1-hub.md solo describe el comportamiento; UpgradeGateTracker es analítica, no diseño).

## [P1] Rail desktop: "Importar alumnos" y "Soporte" navegan fuera de la shell en vez de embeberse

- Kit: desktop-coach.jsx L476-484 — `importar` → `<ImportCSV />` y `soporte` → `<Sop />` se embeben en el pane ("Reused mobile screens, embedded WITHOUT onBack"); DESKTOP-OPT-PLAN.md: "submenús embebidos sin doble back".
- App: `_components/CoachSettingsDesktop.tsx` L57-59, L100-115 — ambos ítems son `<Link href>` que sacan al coach de `/coach/settings` hacia `/coach/clients/import` y `/coach/support` (páginas con su propio back → doble back al volver, rail nunca marca activo).
- Fix: embeber el contenido real de import CSV y soporte como `sections['importar']` / `sections['soporte']` (mismo patrón PaneBody), dejando las rutas directas vivas.
- **Verdict:** CONFIRMED — verificado: CoachSettingsDesktop.tsx L57/L59 definen `href` y L100-115 renderizan `<Link>` con `data-active="0"` fijo (el comentario L98-99 lo admite: "saca al coach de la SettingsShell"); el kit L476-483 embebe ambos ("Reused mobile screens, embedded WITHOUT onBack") y DESKTOP-OPT-PLAN.md lo fija como patrón ("submenús embebidos sin doble back"). El commit 25c77d62 confirma que fue quick-win ("rutas ya existian, solo linkeadas"), no decisión de diseño. Mantiene P1: a diferencia del pane Suscripción (P2, se queda en la shell), estos dos ítems rompen el master-detail por completo y Soporte es trivialmente embebible.

## [P1] Catálogo de Módulos: cards sin el re-skin del kit (icon tile, chips de superficies, banner "Comprar ≠ usar")

- Kit: `ModulosManage` (coach-settings.jsx L1062-1115) — banner info sport-100 "Activá un módulo acá; usalo desde **Alumnos › Herramientas**"; cada card con tile de ícono 46px (sport-100 si activo / sunken si no), superficies como chips pill + chip de alcance ("Se usa con un alumno" / "Se configura en el plan"), precio `eva-metric` + "/mes" apilado, nota al pie "El cobro se prorratea al período…".
- App: `modules/_components/ModulesForm.tsx` L55-136 — card = solo label + badge; sin ícono por módulo; superficies como bullets de texto; sin banner ni nota de prorrateo.
- Diferencia visual: el catálogo se ve notoriamente más plano/textual que el kit.
- Fix: agregar tile de ícono por módulo (el catálogo `@eva/module-catalog` puede portar `icon`), render de superficies como chips pill + chip de scope, y el banner sport-100 arriba + nota al pie.
- **Verdict:** CONFIRMED — verificado lado a lado: kit ModulosManage L1062-1065 (banner info sport-100), L1075 (tile 46px radius 13 sport-100/sunken), L1086-1091 (chip de scope + superficies como pills con borde), L1104-1107 (precio `eva-metric` con "/mes" apilado), L1115 (nota de prorrateo); ModulesForm.tsx L55-136 no tiene ninguno de esos elementos (label+badge, superficies como bullets L77-87, precio inline L120-123, sin banner ni nota). Ambos son read-only (sin switch) — no hay conflicto compra-only. Gap de skin real y notorio en toda la pantalla del catálogo; P1 correcto.

## [P1] Mi Marca mobile (<760): la vista previa en vivo está al fondo, no arriba como en el kit

- Kit: `MiMarca` (coach-settings.jsx L472-527) — orden: Brand Score → **Vista previa en vivo** (con toggle claro/oscuro, header + CTA + tab bar) → Logo → Identidad → Color → Avanzado → Compartir → FAB.
- App: `BrandSettingsForm.tsx` L189, L727-740 — el preview (`BrandThemePreview`) vive en la columna derecha del grid `lg:`; en mobile ese bloque cae DESPUÉS de Identidad/Color/Avanzado/Loader/Compartir. El feedback en vivo mientras editás solo se recupera con el botón "Expandir vista" del FAB.
- Fix: en <lg renderizar `BrandThemePreview` inmediatamente después del Brand Score (mismo componente, `lg:hidden` + instancia sticky en lg).
- **Verdict:** CONFIRMED — verificado: BrandSettingsForm.tsx tiene solo DOS instancias de `BrandThemePreview` (L729 columna derecha del grid `lg:grid-cols-[1fr_300px]` L189, y L795 dentro del modal `previewExpanded`); no existe instancia mobile-first. En <lg (lg NO está overrideado; solo `--breakpoint-md: 760px`) el bloque preview cae en orden DOM después de Identidad/Color/Avanzado/Compartir. El kit (coach-settings.jsx L489-527) pone "Vista previa en vivo" inmediatamente tras el Brand Score, antes de Logo. El botón "Expandir vista" del FAB es un recuperador, no paridad de jerarquía. Nota: entre 760-1023px (incl. el pane desktop de la shell) también queda al fondo.

## [P1] Funciones (`FeaturePrefsPanel`): skin legacy shadcn, preset activo sin el fill sólido del kit

- Kit: `Funciones` (coach-settings.jsx L1141-1176) — botones de preset con activo = fill sólido `sport-500` texto blanco; lista de secciones en card `padding:none` con divisores y switches sport.
- App: `components/coach/FeaturePrefsPanel.tsx` L250-336 — `rounded-2xl`, `border-border`/`bg-background`/`text-foreground`/`text-muted-foreground` (remapeados a EVA en `@theme`, pero radius y jerarquía no son los del DS), preset activo = tint `bg-primary/10 border-primary` en vez de sólido. Paridad funcional OK (presets Básico/Intermedio/Profesional + toggles + Guardar), el gap es de skin.
- Fix: re-skin a tokens EVA directos (`rounded-card`, `border-subtle`, `bg-surface-card`) y preset activo sólido `sport-500`/`text-on-sport`.
- **Verdict:** DOWNGRADED→P2 — el gap existe pero está inflado. Verificado: (1) todos los tokens shadcn citados resuelven a EVA vía el remap `@theme` (globals.css: `--border→--border-subtle`, `--background→--surface-app`, `--primary→--theme-primary/--brand`, `--muted-foreground→--text-muted`) — los COLORES del panel son los del DS en ambos temas, incluidos switches y focos; (2) la lista de secciones SÍ es el patrón del kit (L350 `divide-y` + filas `px-4 py-3` + `Switch` sport), no nested cards; (3) la paridad funcional la concede el propio finding. El delta visible real se reduce a: preset activo tint `bg-primary/10` vs fill sólido sport-500 (un solo estado de control) + radii `rounded-2xl`/`xl` (16/12px) vs escala DS (14/20px, imperceptible) + master-switch/expander que es riqueza multi-dominio de la app (permitida). Magnitud equivalente a los P2 del mismo informe (p.ej. Áreas: patrón distinto con tokens correctos).

## [P2] Pane "Suscripción" desktop: teaser de una card + link, en vez de contenido embebido

- Kit: desktop-coach.jsx L479 embebe la pantalla completa (`WebBillingNotice`, que en el kit muestra Plan actual + qué se puede hacer). App: `page.tsx` L359-380 — una sola card "Plan X" + botón "Abrir suscripción" → doble click y pane casi vacío. Adaptación defendible (la página real de suscripción es enorme y con flujos MP), pero el pane quedaría mejor con el resumen real (plan + desglose + próximo cobro) embebido.

## [P2] Pane "Apariencia" desktop: falta "Densidad compacta"

- Kit: desktop-coach.jsx L544-545 — dos toggle-cards: Modo oscuro + Densidad compacta (con CSS real de densidad, index.html "Ola 4"). App: solo `ThemeToggleCard` (segmentado claro/oscuro, réplica 1:1 del kit mobile). La densidad no existe como feature en la app — gap de feature, discutible.

## [P2] Áreas del builder: patrón de edición distinto al kit mobile

- Kit: `AreasBuilder` (coach-settings.jsx L278-335) — banner info sport-100 arriba ("sus ejercicios vuelven a Principal"), reorden con chevrons ↑↓, alta con botón dashed "Nueva área" que expande input.
- App: `areas/_components/AreasManager.tsx` — la nota vive como texto al pie (L249-253), el orden se edita con input numérico en modo edición (L123-130), y el alta es input + botón "Crear" siempre visibles (L221-247). Tokens EVA correctos; difiere el patrón de interacción/orden visual.

## [P2] Hub team mobile: falta la card "Soporte" del grupo Cuenta

- Kit: variante team (coach-settings.jsx L73-75) incluye `Group "Cuenta"` con HubCard Soporte. App: rama team (`page.tsx` L159-219) no tiene card de Soporte (sí existe en la rama standalone L490-498).

## [P2] Nits menores

- Footer del hub: kit usa el logo img `eva-logo-ink.png` (L114); app usa wordmark de texto "EVA" (`SettingsFooter`, page.tsx L104-111).
- Icono del rail "Módulos": kit `layout-grid` (desktop-coach.jsx L462); app usa `Package` (CoachSettingsDesktop.tsx L54).
- FAB guardar de Mi Marca: kit se deshabilita y muta a "Guardado" cuando no hay cambios (coach-settings.jsx L659-663); app siempre activo con "Guardar cambios" (BrandSettingsForm.tsx L29-46) — sí tiene chip "Sin guardar" espejo del kit.

---

## Verificado 1:1 (sin gap)

- **SettingsShell desktop** para standalone-con-branding: CSS `.dt-set-*` transcrito VERBATIM del kit en `globals.css` L1285-1313 (rail 260px, railitem active sport-100, panehd Archivo 900 26px, caja de lectura `--dt-read-narrow`); el host en caja bordeada es adaptación documentada (espejo del master-detail de Alumnos).
- **Rail**: grupos y orden espejo del kit (Cuenta → Entrenamiento → Preferencias → Ayuda), ítem "Eliminar cuenta" en danger; "Áreas del builder" extra = riqueza permitida. Panes embebidos (marca/suscripción/módulos/funciones/áreas/apariencia/eliminar) sin doble back, `key={sel}` con fade como el mock.
- **Hub mobile <760 standalone**: verbatim — IdentityHero inversa con avatar/badge de plan, eyebrows uppercase, HubCards (tile 46px + título + desc + chevron) con badges, orden de grupos idéntico, footer versión.
- **DangerZone**: card con tile danger 46px + "Eliminar…" + sheet de confirmación con lista de consecuencias, retención legal 6 años e input "ELIMINAR" — espejo del kit (incl. bottom-sheet con handle en mobile).
- **Mi Marca (BrandStudio)**: Brand Score con los pesos del spec, presets + color custom + badge de contraste WCAG con ratio + reset, compartir con QR + código + link con copy, loader texto/ícono (eva/coach/none), welcome modal texto/video, "usar mi color en el panel", Branding avanzado Pro (color2/fuente/dark/loader) con preview y guardia de contraste, preview vivo con toggle claro/oscuro y tab bar simulada, FAB guardar — más rico que el kit en desktop (permitido).
- **ThemeToggleCard**: réplica 1:1 del segmentado del kit `extras.jsx` (46px, sunken track, active card+shadow).
- **Módulos**: catálogo READ-ONLY sin switches (compra-only) — badges Activo/De pago, pitch + superficies desde `@eva/module-catalog`, precio CLP es-CL, CTA por contexto (standalone/gestor team/miembro), cross-link a Funciones. Estructura correcta; solo skin (P1 arriba).
- **Funciones**: paridad funcional con el kit (presets + secciones toggleables + guardar explícito + candados Pro).
- **Upsell Free de Mi Marca**: espejo fiel de `MiMarcaUpsell` (hero sport-100, antes/después con mini-mockups, features 4, pricing inversa con −20% anual, CTA) — el gap es dónde se monta, no su contenido.
- **Tokens**: los alias shadcn (`--primary`, `--border`, `--card`, `--destructive`, `--background`) están remapeados a tokens EVA en `@theme` (globals.css L208-235), así que las clases legacy en Brand* resuelven a colores del DS.

---

## Fix log wave 2 (2026-07-01)

- **[P0] team_managed SettingsShell** → NO TOCADO (REFUTED).
- **[P1] Free tier pierde el hub Opciones** → FIXED. `page.tsx`: eliminado el early-return del upsell; el hub (mobile) y la SettingsShell (desktop) se renderizan para TODOS los tiers standalone; la card Mi Marca en Free lleva badge `Pro` + desc del kit y rutea a `/coach/settings/brand`. Upsell extraído VERBATIM a `_components/BrandUpsell.tsx` (con `UpgradeGateTracker` adentro, misma analítica); `brand/page.tsx` ya no redirige en Free — renderiza el upsell como sub-pantalla con back "Opciones" (espejo de `miMarcaUpsell` del kit); en desktop el pane `marca` monta `BrandUpsell` embebido. Archivos: `page.tsx`, `brand/page.tsx`, `_components/BrandUpsell.tsx` (nuevo).
- **[P1] Rail desktop: Importar/Soporte navegan fuera** → PARCIAL. Soporte FIXED: nuevo `_components/SupportPane.tsx` (hero inversa + canales + `SupportForm` reusado de `../../support/SupportForm`) embebido como `sections.soporte`; `CoachSettingsDesktop` ahora trata `soporte` como pane (botón activo en rail, sin doble back); la ruta `/coach/support` sigue viva para el hub mobile (el contenido queda duplicado en el pane — unificar exigiría editar `coach/support/page.tsx`, fuera de área → requiere wiring externo). Importar SKIPPED: embeber `ImportWizard` exige duplicar su gating (getCoachOrgContext + canImportClients/UpsellGate + count de alumnos) en la page de settings — costo estructural real + lógica de datos, queda como `<Link>`; requiere wiring externo (extraer un pane autocontenido de `clients/import`).
- **[P1] Catálogo Módulos sin re-skin del kit** → FIXED. `modules/_components/ModulesForm.tsx`: banner info sport-100 "Activá un módulo acá; usalo desde **Alumnos › Herramientas**…" (texto kit), tile de ícono 46px radius 13 (sport-100 activo / sunken inactivo) con mapa local de íconos kit (heart-pulse/person-standing/scale/utensils — `@eva/module-catalog` no porta `icon`, agregarlo = paquete fuera de área), chip de alcance ("Se configura en el plan" / "Se usa con un alumno") + superficies como pills con borde, "Incluido en tu cuenta" en activos, precio `eva-metric` con "/ mes" apilado a la derecha del CTA, nota al pie de prorrateo (solo standalone; en team el copy de bajas por Suscripción no aplica). Badges Activo/De pago, CTAs y cross-link a Funciones intactos.
- **[P1] Mi Marca mobile: preview al fondo** → FIXED. `BrandSettingsForm.tsx`: instancia `lg:hidden` de `BrandThemePreview` (mismo componente, con su toggle claro/oscuro) inmediatamente después del Brand Score; la columna derecha pasó a `hidden lg:block lg:sticky` (antes caía al fondo en <lg, incl. el pane 760-1023 de la shell). Nota: `LogoUploadForm` sigue montándose ANTES del form (orden kit exacto Score→Preview→Logo exigiría mover el logo dentro del form — fuera del alcance del finding).
- **[P1→P2] FeaturePrefsPanel preset activo** → FIXED (severidad final P2, swap barato). `components/coach/FeaturePrefsPanel.tsx`: preset activo ahora fill sólido `bg-[var(--sport-500)]` + `text-[var(--text-on-sport)]` + borde transparente (kit L1147); resto del panel intacto (tokens ya remapeados a EVA).
- **[P2] Pane Suscripción teaser** → SKIPPED (estructural; adaptación defendida en el propio informe — embeber el resumen real exige data de billing).
- **[P2] Apariencia sin Densidad compacta** → SKIPPED (gap de feature, no de skin; la densidad no existe en la app).
- **[P2] Áreas patrón de edición** → SKIPPED (estructural: chevrons de reorden + alta expandible = rework de interacción; tokens ya correctos).
- **[P2] Hub team sin card Soporte** → FIXED. `page.tsx` rama team: grupo "Cuenta" con HubCard Soporte → `/coach/support` (copy espejo de la rama standalone).
- **[P2 nit] Icono rail Módulos** → FIXED. `CoachSettingsDesktop.tsx`: `Package` → `LayoutGrid` (kit `layout-grid`).
- **[P2 nit] Footer logo img** → SKIPPED (el asset del kit `eva-logo-ink.png` no existe en `apps/web/public`; el candidato `eva-wordmark-outline.png` es el outline tenue conocido — copiar el asset del kit = wiring externo/asset nuevo).
- **[P2 nit] FAB Guardar muta a "Guardado"** → SKIPPED tras intentarlo: `isDirty` NO trackea los inputs no-controlados `full_name`/`brand_name` (usan `defaultValue`) — deshabilitar el botón con `!isDirty` rompería guardar un cambio de solo-nombre. Exige controlar esos inputs primero (cambio de comportamiento del form, no un swap).
