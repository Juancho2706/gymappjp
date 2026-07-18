# G09 — Gaps Coach: hub Opciones + Suscripción + Team + Módulos/Funciones/Áreas + nav/switcher/news

Dominio: hub de opciones, Mi Marca/brand studio, Funciones (@eva/feature-prefs), Áreas CRUD, catálogo
Módulos + CTA add-on, Mi Equipo/team, suscripción display rica, workspace switcher, news bell, nav registry.

Fuente de verdad = comportamiento **móvil de la web EVA DS**. Referencias web en `05-web-coach-resto.md`
(secciones C/D/E/F/G), seams en `07-shared-seams.md`, DS en `02-design-system.md`, delta en `01-web-delta.md`.

> **Hallazgo estructural que reencuadra todo el dominio:** en mobile el tab "Opciones"
> (`CoachMobileChrome.tsx:41`, name `settings`) **NO abre un hub** — abre **directamente el editor
> de Mi Marca** (`apps/mobile/app/coach/(tabs)/settings.tsx` es literalmente la pantalla brand studio,
> con título "Mi Marca"). La web (Movida 1) colapsó Mi Marca + Suscripción + Módulos + Funciones + Áreas
> en UN hub `/coach/settings` (`05-web-coach-resto.md` §C0). En mobile ese hub **no existe**: Suscripción
> es un tab de overflow aparte, y Módulos/Funciones/Áreas/Equipo/workspace-switcher/news-bell **no existen
> en absoluto** (verificado: `ls app/coach/` no tiene team/modules/funciones/areas; grep `team` en
> `app/coach` = 0; grep `enabled_modules|feature-prefs|module_catalog` en mobile = 0).

---

## 1. Gaps visuales (pantalla por pantalla)

### 1.1 Hub de Opciones — NO EXISTE en mobile
- **Web (ref `05-web-coach-resto.md` §C0):** móvil (`md:hidden`) es un hub aplanado de `HubCard`
  (tile icono + título + descripción + chevron), agrupado por `Eyebrow`:
  Identidad (`IdentityHero` card inverse con avatar + nombre marca + badge de plan), Apariencia
  (`ThemeToggleCard`), Personalización (Mi Marca, badge "Pro" si sin branding), Plan (Suscripción,
  Módulos con badge "N módulos"), Configuración (Funciones de nutrición, Áreas del builder), Cuenta
  (Soporte, Cerrar sesión, DangerZone), footer wordmark "EVA · v2.4".
- **Mobile:** no hay hub. El tab "Opciones" salta al editor de marca. No hay `IdentityHero`, no hay
  agrupadores `Eyebrow`, no hay `HubCard`, no hay badge de plan, no hay entradas a Módulos/Funciones/Áreas.
- **Gap visual:** falta la pantalla-índice completa con lenguaje DS. Hay que construirla desde cero.

### 1.2 Mi Marca / Brand Studio — EXISTE y es rico, pero en patrón visual VIEJO + incompleto
- **Mobile (`settings.tsx`, 554 L):** patrón B legacy (objeto `theme` + `StyleSheet` + subcomponentes
  locales `SectionCard`/`Field`/`Segmented`/`Toggle` hechos a mano, fuentes literales `Archivo_*`
  hardcodeadas, `#F59E0B` literal, `theme.primary + '1A'` para tints). NO consume las primitivas DS
  (`Card`, `Input`, `Badge`, `SegmentedTabs`) salvo `Button`/`ScreenHeader`/`Section`/`InfoRow`.
  El `Toggle` es un switch dibujado a mano (no `Switch` DS). Requiere re-skin completo a patrón A.
- **Lo que mobile YA tiene (y supera a web en partes — confirmado):** brand score con barra, live
  preview (logo/inicial + swatch + loader wordmark), subida de logo (ImagePicker + `uploadCoachLogo`
  direct-to-Storage), presets de color + **paleta de matices HSL 12×3 tap** (web usa `ThemeGallery`
  curada en vez de esto), input hex, **checker de contraste WCAG en vivo** (web no lo expone así),
  toggle "aplicar colores a app alumno" (`use_brand_colors`), loader composer (texto/ícono eva-coach-none/
  gradiente-sólido), mensaje de bienvenida (240) + welcome modal (texto/video), **QR del acceso del
  alumno** (web no tiene QR), share link, y tarjeta "Cuenta" (baja por correo, no borra in-app).
- **Gaps visuales vs web EVA DS (`05-web-coach-resto.md` §C2):**
  1. Re-skin a DS (matar `StyleSheet` + objeto `theme`; usar `Card`/`Input`/`Badge`/`SegmentedTabs`).
  2. **Logo oscuro:** web tiene 2 slots (claro + oscuro `LogoSlot`); mobile solo 1 slot.
  3. **`ThemeGallery`** (presets de tema curados) — ausente; mobile usa color libre + paleta HSL.
  4. **`LoginLayoutPicker`** (4 variantes de layout de login del alumno) — ausente.
  5. **`BrandAdvancedSection` (Pro, acordeón):** color secundario, fuente (`brand_font_key`), acentos
     light/dark, neutral tint, splash — todo ausente en mobile (mobile solo tiene loader básico).
  6. **Toggle "usar mi marca también en mi panel"** (`use_brand_colors_coach`, distinto del de alumno)
     — ausente; mobile solo tiene el de la app del alumno.
  7. **`BrandThemePreview`** (teléfono con tabs home/otros + toggle dark) — mobile tiene un preview
     más pobre + botón a `/coach/brand-preview` (pantalla aparte).
  8. Delta post-jun (`01-web-delta.md` §1.3): presets curados + GlowBorderCard/borde de marca +
     precedencia elección>tema del loader (`brand-composer.ts`) — mobile atrasado.
- **Gate:** mobile ya implementa el tier-gate (`canUseBranding(tier)` → upsell) y el lock `orgManaged`.
  **Falta** la variante `team_managed` (web: la marca la gestiona el equipo; mobile no distingue team).

### 1.3 Suscripción — display POBRE vs web rica
- **Mobile (`subscription.tsx`, 138 L):** patrón B legacy. 3 cards: Plan actual (tier + badge estado),
  Alumnos (uso `count/max` + `ProgressBar`), Renovación (fecha con etiqueta según estado), lock
  `orgManaged`, botón "Gestionar plan en la web" (`Linking.openURL` a `/coach/subscription`).
- **Web (`05-web-coach-resto.md` §E1, `SubscriptionContent` 1416 L):** MUCHÍSIMO más rica (ver §2.3
  para el detalle funcional). Visualmente mobile carece de: card inverse "Plan actual" con **total
  compuesto grande + desglose (base + módulos + cupón)**, card de **tarjeta (brand+last4)**, lista de
  **módulos add-on con badges de estado**, `CouponRedeemCard`, selector de ciclo + cards de tier con
  precios, **historial de pagos**, panel de cancelación.
- **Gap visual:** re-skin a DS + construir todas las secciones de display (las acciones de cobro siguen
  web-only, ver §2.3). También falta la variante `team_managed`.

### 1.4 Mi Equipo / Team — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §D):** hero inverse (logo/iniciales con contraste luma, badge de rol
  Owner/Co-gestor/Miembro, "Pool compartido", `TeamShareLink`, stats: anillo de cupos, alumnos del pool,
  módulos activos), `TeamBrandStudio` (marca del equipo, solo-lectura si no-gestor), `TeamMembersManager`
  (lista + AddCoach/EditRole/remover), footer "EVA Teams".
- **Mobile:** cero. No hay pantalla, no hay `TeamShareLink`, no hay concepto de team en el nav.
- **Gap visual:** construir la pantalla móvil completa desde cero.

### 1.5 Catálogo de Módulos — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §C5, `ModulesForm`):** catálogo read-only (compra-only) de 4 módulos
  con icono tonal, badge Activo/De pago, pitch, chips de alcance/superficies, precio `/mes`, CTA por
  contexto (`ModuleCta`). Copy desde `@eva/module-catalog`.
- **Mobile:** cero pantalla; `@eva/module-catalog` no está en `tsconfig` paths ni importado.
- **Gap visual:** construir catálogo móvil con `Card`/`Badge` DS + adoptar `@eva/module-catalog`.

### 1.6 Funciones (feature-prefs) — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §C3, `FeaturePrefsPanel`):** por dominio (hoy Nutrición): selector de
  preset (Básico/Intermedio/Profesional), master switch de dominio, expander de toggles por sección con
  badge Base/Pro + lock Pro. Borrador local + guardar. Modelo `visible = ENTITLED AND ENABLED`.
- **Mobile:** cero. `@eva/feature-prefs` no importado.
- **Gap visual:** construir panel con `Switch` DS + `SegmentedTabs` para presets.

### 1.7 Áreas del builder — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §C4, `AreasManager`):** lista de áreas (badge color + nombre + orden +
  "Área del sistema"), editar inline, eliminar (confirmación 2 pasos), crear. Banner `Lock` si no-gestor.
- **Mobile:** cero pantalla.
- **Gap visual:** construir CRUD móvil DS.

### 1.8 Workspace switcher — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §G4, `WorkspaceSwitcher`):** dropdown con lista de workspaces (icono por
  tipo, badge "Actual"), en dashboard shell móvil + topbar avatar. `null` si ≤1 workspace.
- **Mobile:** cero. Mobile solo detecta `orgManaged` (`lib/org.ts getCoachOrgContext`) — NO tiene
  concepto de workspace activo, ni team, ni switch.
- **Gap visual + funcional:** construir switcher (bottom-sheet) alimentado por los workspaces del coach.

### 1.9 News bell (Novedades) — NO EXISTE en mobile
- **Web (`05-web-coach-resto.md` §G3, `NewsBellButton` + `NewsFeedProvider`):** campana con badge de no
  leídos; móvil = Sheet bottom con lista de ítems (icono por tipo, markdown ligero, imagen, CTA, fecha).
- **Mobile:** el dashboard tiene `MobileNovedades` (sección dentro del home, ver `06-mobile-inventory.md`),
  pero NO hay campana en un topbar ni el patrón bell+sheet. Verificar si `MobileNovedades` cubre el feed
  o es solo un chip. Gap: no hay bell global con unreadCount.

---

## 2. Gaps funcionales

### 2.1 Contexto team/workspace ausente (BLOQUEANTE de casi todo el dominio)
- Mobile `lib/org.ts` solo resuelve org (`isOrgManaged`/`orgName`). NO resuelve `coach_team` ni el
  workspace activo (`getPreferredWorkspaceForRender` de web). Sin esto no hay: pantalla Team, variante
  `team_managed` de settings/suscripción/marca, scoping por `activeTeamId`, ni switcher.
- La web bifurca copy y datos por workspace en casi todas estas pantallas (`05-web-coach-resto.md` §C0,
  C2, C3, C4, C5, D). Mobile necesita un equivalente de contexto de workspace.

### 2.2 Hub context-aware (standalone vs team_managed vs org_managed)
- Web: `org_managed`→redirect dashboard; `team_managed`→hub REDUCIDO (solo módulos del pool + cuenta,
  sin marca ni suscripción personal); standalone→hub completo (`05-web-coach-resto.md` §C0).
- Mobile: no hay hub ni esta lógica. Debe replicarse al construir el hub.

### 2.3 Suscripción — display rico (acciones = web-only, confirmado)
- **Mobile `lib/coach-subscription.ts` (`getCoachSubscriptionOverview`):** hoy solo trae `profile`
  (tier/status/maxClients/currentPeriodEnd/trialEndsAt), `orgManaged`, `orgName`, `clientCount`
  (query directa a `clients`). NO llama a `/api/payments/subscription-status`.
- **Web (`05-web-coach-resto.md` §E1):** la UI nunca calcula precios; todo viene de
  `/api/payments/subscription-status` (coach, **addons**, **billing breakdown** base+módulos+cupón,
  **events**/historial, activeClientCount) + `getCompositeAmountClp`/`computeDiscountedClp` para previews.
- **Gaps funcionales de DISPLAY que mobile debe portar (read-only):**
  1. **Precio compuesto + desglose** (base + add-ons + cupón).
  2. **Add-ons activos** con estado (Activo/cortesía `Gift`/baja programada "se desactiva el {fecha}"/
     requiere Pro+ `Lock`).
  3. **Cortesía** (source `admin_grant`, price 0) diferenciada.
  4. **Tarjeta** (brand + last4) display.
  5. **Historial de pagos** (fecha, provider_status, provider·checkout_id, monto).
  6. **Cupón activo** (display del descuento).
- **Acciones WEB-ONLY (confirmado, `05-web-coach-resto.md` §E2/E3 + memoria money-safety):** cambiar
  tarjeta (`/coach/subscription/update-card`, comentario explícito "misma URL que abrirá RN en navegador
  externo"), cambiar plan, agregar/quitar add-on, cancelar, checkout. Mobile ya abre la web con
  `Linking.openURL` — mantener, pero enriquecer el display previo.
- **Falta `team_managed`:** mobile solo maneja `orgManaged`; el status `team_managed` existe en
  `STATUS_LABELS` pero no hay rama de UI.

### 2.4 Módulos / entitlements — gap total (ver `07-shared-seams.md` C.4)
- Mobile no lee `enabled_modules` de `coaches`/`teams`, no tiene `MODULE_KEYS`, no aplica kill-switch de
  operador. El catálogo de Módulos display necesita: (a) adoptar `@eva/module-catalog` (copy) y el mirror
  `ModuleKey` de `@eva/feature-prefs`, (b) fetch de `enabled_modules` vía PostgREST directo, (c) el CTA
  por contexto (mailto / abrir `/coach/subscription#addons` en web). La COMPRA es web-only.
- Endpoints backend ya existen sin cablear (`06-mobile-inventory.md` §C, `01-web-delta.md` §6):
  `/api/mobile/config` (kill-switch + prefs flag + support), `/api/mobile/team/add-coach`, y los
  `assertModule` de escrituras de módulos pagos.

### 2.5 Funciones (feature-prefs) — gap total
- Modelo `visible = ENTITLED AND ENABLED` (`@eva/feature-prefs`, `07-shared-seams.md` A.3). Mobile no lo
  tiene. Impacto cruzado: sin la capa ENABLED, el nav mobile no puede ocultar dominios apagados
  (`featureDomain` en `coach-nav.ts`), ni la nutrición mobile respeta las secciones que el coach apagó.

### 2.6 Áreas del builder — gap total
- CRUD server (create/update/delete) + scope team/standalone. Mobile no lo tiene; el builder mobile
  (`program-builder.tsx`) usa áreas pero no hay pantalla de gestión.

### 2.7 Nav registry compartido — divergencia (ver `07-shared-seams.md` C.5)
- **Web:** `coach-nav.ts` = `NAV_MODULES` (registro único, fuente de verdad) + `getVisibleNavItems`
  (pura, filtra por `contexts`/`entitlement`/`featureDomain`/status bloqueado) + `splitNavItems`/
  `splitForSidebar`. Módulos comprados (cardio/movement) aparecen como tabs gated.
- **Mobile:** `CoachMobileChrome.tsx` **hardcodea** `TABS` (home/clientes/builder/nutricion/settings) +
  overflow "Mas" en el layout; `AlumnoMobileChrome.tsx` hardcodea `NAV_META`. No consume `coach-nav.ts`,
  no filtra por entitlement, no oculta por status bloqueado (no hay tab "Reactivar"), no muestra
  cardio/movement aunque estén ON, no oculta dominios apagados.
- **Seam:** el *dato* (`NAV_MODULES`: key/href/contexts/entitlement/featureDomain + icono/label neutro)
  es portable; el *reducer* `getVisibleNavItems` es pura y reutilizable. La UI de tabs es específica RN.
  `coach-nav.ts` hoy importa `lucide-react` (web) → extraer el dato a un módulo neutro (candidato:
  extender `@eva/module-catalog` con `contexts` + id de ícono) y compartir `getVisibleNavItems`.

### 2.8 Delta post-jun-21 relevante (`01-web-delta.md`)
- §3.1/§3.7: consolidación en hub "Opciones" + nav registry — gap L, sigue.
- §3.9: Equipo maestro-detalle (Ola 5) — ausente en mobile.
- §1.3: Mi Marca nueva era (presets curados, GlowBorderCard, precedencia loader) — mobile atrasado.
- §3.3: campanita de noticias viva — ausente como bell.
- §3.2: búsqueda global topbar (fuera de este dominio pero toca el chrome coach).

---

## 3. Costuras (packages / API) — citando `07-shared-seams.md`

1. **`@eva/module-catalog`** (07 A.4, C.5): copy comercial de los 4 módulos (`label`/`pitch`/`surfaces`/
   `priceClp`). Puro, pensado para RN. Mobile NO lo importa. **Adoptar** para el catálogo de Módulos +
   los CTA de add-on de suscripción. Candidato a extenderlo con `contexts` + ícono neutro para alimentar
   el nav.
2. **`@eva/feature-prefs`** (07 A.3, C.4): `ModuleKey`, `Preset`, `PRESETS`, `NutritionSectionKey`,
   resolver `visible = ENTITLED AND ENABLED`. Puro, explícitamente para web+mobile. Mobile NO lo usa.
   **Adoptar** para Funciones y para el mirror de `ModuleKey` (nav entitlement).
3. **`entitlements` / `enabled_modules`** (07 C.4): el gate real (`assertModule`) es server-side y NO se
   extrae; lo puro extraíble es `MODULE_KEYS`/`isModuleKilledByOperator`/`applyOperatorKillSwitch` (ya
   espejados en `@eva/feature-prefs`). El **fetch** de `enabled_modules` desde `coaches`/`teams` se
   reimplementa en mobile vía PostgREST directo (patrón `lib/*.queries.ts`). **Riesgo de seguridad:** si
   mobile construye pantallas de módulos sin el gate server-side en cada mutación, se abre agujero — para
   este dominio el catálogo es read-only (display), así que el riesgo aplica más a las olas de cardio/
   movement/bodycomp (otro dominio), pero el **CTA de compra debe seguir web-only**.
4. **`coach-nav.ts` / `NAV_MODULES` + `getVisibleNavItems`** (07 C.5): compartir el DATO y la función pura
   de visibilidad; mobile construye su propia UI de tabs sobre ese resultado. Hoy `coach-nav.ts` importa
   `lucide-react` → separar dato de íconos antes de compartir.
5. **`@eva/tiers`** (07 A.7): YA compartido y consumido por mobile (`lib/coach-subscription.ts`,
   `coach-tiers.ts`, `coach.ts`) — es el modelo a seguir. `TIER_LABELS`/`getTierCapabilities`/
   `canUseBranding` ya vienen de aquí. Mantener.
6. **`@eva/brand-kit`** (07 A.1, 02 §C): motor white-label compartido, ya usado por mobile
   (`lib/theme.ts`, `coach-brand.ts`). Para Mi Marca avanzada, extender el consumo (presets, acentos,
   fuente) en vez de reimplementar.
7. **`@eva/schemas`** (07 A.6): `team.ts`, `brand.ts`, `coach.ts` para validación de los forms de team/
   marca. Mobile hoy solo consume la porción auth. `team.ts` está marcado "SERVER-ONLY" — revisar si es
   estructuralmente puro para reusar el schema en el form de team.
8. **API subscription-status:** para el display rico de suscripción, mobile debe consumir el payload de
   `/api/payments/subscription-status` (o un `/api/mobile/*` equivalente) en vez de la query pobre actual
   de `lib/coach-subscription.ts`. Verificar si existe endpoint mobile; si no, crearlo (bridge, read-only).

---

## 4. Tareas propuestas (ordenadas, atómicas)

### Ola RE-SKIN VISUAL (re-skinear lo que ya existe a DS; sin features nuevas)
- **T1 [VISUAL] S — Re-skin Suscripción display.** `subscription.tsx` de patrón B → primitivas DS
  (`Card`/`Badge`/`ProgressBar`/`Button` ya importados; matar `StyleSheet` + objeto `theme` inline).
  Sin cambiar datos. Dep: primitivas DS (ya existen).
- **T2 [VISUAL] M — Re-skin Mi Marca (brand studio).** `settings.tsx` (554 L) patrón B → patrón A:
  reemplazar `SectionCard`/`Field`/`Segmented`/`Toggle` locales por `Card`/`Input`/`SegmentedTabs`/
  `Switch` DS; fuentes literales → clases; tints `+ '1A'` → tokens sport. Preservar features actuales
  (score, preview, QR, contraste, loader, welcome). Dep: `Switch` DS (P0 de `02-design-system.md` §E;
  si no existe, T2 lo incluye). **Esta pantalla se moverá bajo el hub en T3.**

### Ola FUNCIONAL — estructura y contexto (habilita el resto)
- **T3 [FUNCIONAL] M — Hub de Opciones.** Nueva pantalla-índice `/coach/settings` (mover el brand
  studio actual a una ruta hija tipo `/coach/settings/brand`). `IdentityHero` + `Eyebrow` groups +
  `HubCard` (Mi Marca, Suscripción, Módulos, Funciones, Áreas, Apariencia/ThemeToggle, Soporte,
  Cerrar sesión, baja de cuenta). Context-aware (standalone/team_managed/org_managed). Reordena la
  navegación: "Opciones" abre el hub, no la marca directa. Dep: T7 (contexto workspace) para las
  variantes; puede entrar con solo standalone primero.
- **T7 [SEAM/FUNCIONAL] M — Contexto de workspace en mobile.** Extender `lib/org.ts` a un
  `getPreferredWorkspace`/`getWorkspaceContext` que resuelva standalone/coach_team/enterprise_coach +
  workspace activo (espejo de `getPreferredWorkspaceForRender`). Bloqueante de Team, switcher, variantes
  team_managed. Dep: ninguna dura; investigar cómo web deriva el workspace.
- **T8 [SEAM] S — Adoptar `@eva/module-catalog` + `@eva/feature-prefs` + fetch `enabled_modules`.**
  Añadir paths en `tsconfig`, crear `lib/entitlements.queries.ts` (PostgREST directo a
  `coaches`/`teams`.`enabled_modules`), aplicar kill-switch puro. Dep: ninguna. Bloqueante de T9/T10.

### Ola FUNCIONAL — pantallas nuevas
- **T4 [FUNCIONAL] L — Suscripción display rico.** Consumir `/api/payments/subscription-status` (o crear
  bridge `/api/mobile/*` read-only): desglose compuesto, add-ons con estados, cortesía, tarjeta, historial,
  cupón. Acciones (cambiar tarjeta/plan, add/quitar add-on, cancelar) = abrir web (`Linking`, ya existe).
  Variante `team_managed`. Dep: T7, T8. Verificar existencia de endpoint mobile.
- **T9 [FUNCIONAL] M — Catálogo de Módulos (display).** Pantalla `/coach/settings/modules`: 4 módulos
  read-only con badge estado + CTA por contexto (mailto / abrir web). Copy de `@eva/module-catalog`.
  Dep: T8, T3.
- **T10 [FUNCIONAL] M — Funciones (feature-prefs).** Panel de presets + master switch + toggles de
  sección con lock Pro; borrador local + guardar (`/api/mobile/*` o PostgREST). Modelo
  `visible = ENTITLED AND ENABLED`. Dep: T8, T3.
- **T11 [FUNCIONAL] S — Áreas del builder (CRUD).** Lista + crear/editar/eliminar (confirmación 2 pasos)
  + scope team/standalone + lock no-gestor. Dep: T3, T7 (scope).
- **T12 [FUNCIONAL] L — Mi Equipo/Team.** Pantalla completa: hero inverse + rol + stats (anillo cupos,
  pool, módulos) + `TeamShareLink` + `TeamBrandStudio` (solo-lectura si no-gestor) + `TeamMembersManager`
  (add/editRole/remover vía `/api/mobile/team/add-coach` y afines). Dep: T7 (contexto team), T8.
- **T13 [FUNCIONAL] M — Workspace switcher.** Bottom-sheet con workspaces + `selectWorkspaceAction`
  equivalente; montar en hub/dashboard. `null` si ≤1. Dep: T7.
- **T14 [FUNCIONAL] M — News bell.** Bell global con unreadCount + bottom-sheet de feed (markdown ligero,
  icono por tipo, CTA). Verificar si reutiliza `MobileNovedades` del dashboard o es nuevo provider.
  Dep: ninguna dura.

### Ola SEAM — nav registry (transversal, coordinar con dominio de navegación)
- **T15 [SEAM] M — Nav registry compartido.** Separar el DATO de `coach-nav.ts` (`NAV_MODULES` +
  `getVisibleNavItems` puro) de los íconos `lucide-react`; consumir en `CoachMobileChrome` para filtrar
  tabs por `contexts`/`entitlement`/`featureDomain`/status bloqueado (tab "Reactivar"; tabs cardio/
  movement gated). Reemplaza el `TABS` hardcodeado. Dep: T7, T8. (Coordinar: `AlumnoMobileChrome`
  NAV_META es de otro dominio.)

### Ola VISUAL avanzada (Mi Marca nueva era)
- **T16 [VISUAL/FUNCIONAL] M — Mi Marca avanzada.** Logo oscuro (2º slot), `ThemeGallery` presets
  curados, `LoginLayoutPicker`, `BrandAdvancedSection` (color2/fuente/acentos/neutral/splash), toggle
  `use_brand_colors_coach`, GlowBorderCard, precedencia loader (`brand-composer.ts`). Dep: T2, T3.

---

## 5. Riesgos

- **Técnicos:**
  - **Contexto team ausente (T7) es cuello de botella:** Team, switcher, y las variantes `team_managed`
    de hub/suscripción/marca dependen de resolver el workspace activo, que hoy no existe en mobile.
    Riesgo de subestimar: puede requerir tocar JWT claims / RLS scoping.
  - **Suscripción display (T4):** si no hay endpoint `/api/mobile/*` que exponga el payload rico, hay que
    crearlo (bridge server) — cruza a apps/web. El payload de `/api/payments/subscription-status` puede
    asumir sesión de cookie, no Bearer.
  - **Seguridad de módulos:** el catálogo es read-only (bajo riesgo), pero la costura T8 abre la puerta a
    olas de módulos con mutaciones — el gate server-side (`assertModule`) NO debe saltarse; mobile habla
    PostgREST directo.
  - **`Switch` DS ausente** (`02-design-system.md` §E P0): el re-skin de Mi Marca/Funciones depende de un
    wrapper de `Switch` con colores de marca; hoy hay switches dibujados a mano.
- **Drift:**
  - **Nav doblemente hardcodeado** (`CoachMobileChrome` TABS + layout overflow) diverge de `coach-nav.ts`
    cada vez que web añade/reordena un módulo. T15 lo cierra; sin él, cada módulo nuevo se olvida en mobile.
  - **`@eva/module-catalog`/`@eva/feature-prefs` sin importar:** copy/pricing/entitlements de módulos y el
    modelo ENTITLED-AND-ENABLED viven solo en web; cualquier cambio no se propaga a mobile hasta adoptarlos.
  - **Mi Marca reimplementa** subcomponentes y lógica de contraste/loader a mano en vez de consumir
    `@eva/brand-kit` a fondo → drift con la "nueva era" de presets/precedencia de web (`01-web-delta.md`
    §1.3).
  - **Suscripción `lib/coach-subscription.ts`** calcula uso con query propia; si web cambia la fuente de
    verdad del uso/precio, mobile diverge.
