# Inventario web coach (POST-rediseño EVA DS) — RESTO

Rutas base bajo `apps/web/src/app/coach`. Alumno read-only bajo `apps/web/src/app/c/[coach_slug]`.
Nav compartida bajo `apps/web/src/components/coach` y `apps/web/src/components/workspace`.

Convenciones visuales recurrentes del DS (aparecen en casi todas las pantallas):
- Tokens de color: `--sport-*` (marca/primario efectivo), `--ember-*`, `--aqua-*`, `--success/warning/danger-*`, `--surface-card`, `--surface-sunken`, `--surface-inverse`, `--surface-app`, `--border-subtle/default/strong/inverse`, `--text-strong/body/muted/subtle`, `--text-on-dark(-muted)`, `--text-on-sport`, `--cta-fill`, `--glow-sport`, `--theme-primary` (color de marca del coach).
- Tipografía: `font-display` (títulos black/extrabold, tracking negativo), `eva-mono`/`font-mono` tabular para métricas, `eva-metric` para cifras grandes.
- Radios: `rounded-card`, `rounded-control`, `rounded-pill`, `rounded-t-sheet`.
- Utilidades EVA: `eva-press` (feedback táctil), `animate-fade-in`, safe-areas `pt-safe/pb-safe`, `min-h-dvh`.
- Patrón "Filtros y orden" (móvil): input de búsqueda + botón cuadrado 44px con dot activo + bottom-sheet con pills + chips removibles + result-bar. Reutilizado en Alumnos/Plantillas/Alimentos.
- Badge "Módulo": `rounded-pill bg-sport-100 text-sport-700` en cabeceras de módulos de pago.

---

## A. NUTRICIÓN COACH

### A1. Hub de Nutrición — `/coach/nutrition-plans`
- **Archivos:** `nutrition-plans/page.tsx` (RSC, 222 líneas), `_components/NutritionHub.tsx` (212), `_data/nutrition-page.queries.ts`, `_data/nutrition-coach.queries.ts`, `_data/recipes.queries.ts`.
- **Gating (server):** `getTierCapabilities(tier).canUseNutrition`. Sin capacidad → pantalla de UPSELL completa (líneas 40-161): TopBar "Nutrición · Módulo Pro", hero inverse con icono `Utensils`, mockup visual de plan (comidas + barras de macros P/C/G), tiles de features, 2 cards de precio Mensual/Anual (con badge -20%), CTA "Mejorar a Pro" → `/coach/subscription?upgrade=pro`. Con capacidad: además `resolveNutritionDomainEnabled` (master switch de dominio, fail-OPEN); si OFF → `redirect('/coach/dashboard')`.
- **Estructura visual (NutritionHub):** TopBar móvil (título "Nutrición" + subtítulo "Planes, alimentos y recetas" + acciones) vs desktop (título integrado en la fila sticky de tabs). `Tabs` (shadcn) con 4 pestañas mostrando conteos: `templates` (Plantillas/Planes), `clients` (Alumnos, activo por defecto), `foods` (Alimentos), `recipes` (Recetas). Strip de tabs sticky con `top-[var(--coach-mobile-content-top-offset)] md:top-0`, backdrop-blur.
- **Acciones (header):** botón icono → `/coach/meal-groups` (solo desktop), `CoachNutritionGuideDialog` (guía), y botón "+ Plantilla" → `/coach/nutrition-plans/new` (solo en tabs clients/templates).
- **Deep-link:** `?tab=` desde la búsqueda global del topbar (p.ej. una receta abre `?tab=recipes`).
- **Datos/origen:** `getCoachTemplates`, `getActivePlansBoardData`, `getCoachClients`, `getFoodLibrary` (page 0, size 120), `getCoachOrgNutritionTemplates` (si org), `getCoachRecipes` — todos en `Promise.all`, scopeados por workspace activo (orgId / activeTeamId vía `getPreferredWorkspaceForRender`).
- **Org templates:** si hay templates de org → `OrgTemplatesSection` arriba del hub.
- **Responsive:** tab `clients` renderiza `ActivePlansBoard` en móvil (`md:hidden`) y `NutritionRosterMasterDetail` en desktop (`hidden md:block`).

#### Tab Plantillas — `TemplateLibrary.tsx` (520)
- Grid de cards (1/2/3 cols). Cada card: badge objetivo (Déficit/Volumen/Mantenimiento derivado de `goal_type`), nombre, descripción, kcal grande, barra de split de macros P/C/G (ember/sport/aqua), chips de macros con %, chips de comidas (máx 8 + "+N"), footer con "N comidas", badge "N activos", y cluster de acciones: Editar (→ `/coach/nutrition-plans/{id}/edit`), Duplicar, Eliminar (AlertDialog), Asignar (abre `AssignModal`).
- Búsqueda + filtros (objetivo, orden: recientes/nombre/kcal↓↑) vía bottom-sheet CD. Empty state con icono `CalendarHeart`.
- Si `templates.length === 0` → se muestra además `NutritionOnboarding`.

#### Tab Alumnos — `ActivePlansBoard.tsx` (446, móvil) + `NutritionRosterMasterDetail.tsx` (508, desktop)
- **ActivePlansBoard:** buscador + filtros (orden: alumno/plan/actualizado) sheet. Dos columnas: "Sincronizados" (sport, siguen plantilla) y "Personalizados" (ember, editados a mano). Cada `PlanCard`: avatar inicial, nombre + nombre de plan, badge SYNCED/CUSTOM, sparkline de adherencia 7d, kcal hoy/objetivo, botón "Gestionar plan" (→ `/coach/nutrition-plans/client/{id}`) + botón eliminar (AlertDialog desasignar, no borra historial). Sección "Sin plan activo (N)": grid de cards con botón "Asignar" (`AssignButton` → `createEmptyClientNutritionPlan` → navega al editor). Empty state global con icono `Users`.
- Acciones server: `unassignNutritionPlan`, `createEmptyClientNutritionPlan`.

#### Tab Alimentos — `FoodLibrary.tsx` (637)
- Entry-card "Grupos de comidas" → `/coach/meal-groups`. Buscador con debounce (350ms) + `searchCoachFoodLibrary` (server action). Pills de categoría scrollable (Proteína/Carbo/Grasa/Lácteo/Fruta/Verdura/Legumbre/Bebida/Snack/Otro). Filtros sheet (scope catálogo/mis alimentos, orden nombre/kcal/proteína). Infinite scroll (IntersectionObserver, page size 80). Lista vía `FoodListCompact` (`components/coach/FoodListCompact`).
- Crear alimento custom: Dialog con `CustomFoodForm` (nombre, kcal/P/C/G por 100g, preview de %calorías con barra, categoría, unidad g/ml/un, gramos-por-unidad si `un`). `useActionState(saveCustomFood)`. Delete con undo optimista (toast 5s).

#### Tab Recetas — `_components/recipes/RecipeLibrary.tsx` (208)
- Banner "Base" (`TierBadge tier="base"`): recetas = inspiración, no afectan macros/adherencia. Buscador. Grid de cards (imagen 16:9 o placeholder `ChefHat`, nombre, ingredientes line-clamp-3, botones Compartir → `AssignRecipeModal`, Editar → `CreateRecipeDialog`, Eliminar). Empty state.
- Componentes hermanos: `CreateRecipeDialog.tsx`, `AssignRecipeModal.tsx`. Fotos vía `recipe-photo.actions.ts`.

### A2. Builder de plan — `PlanBuilder.tsx` (897, `_components/PlanBuilder/`)
- **Modos:** `template` (plantilla, coach-scoped) y `client-plan` (por alumno). Un solo componente parametrizado.
- **Rutas que lo montan:**
  - `/coach/nutrition-plans/new` (`new/page.tsx`, 106) — mode template. Puede pre-llenar desde `?org_template=`.
  - `/coach/nutrition-plans/[templateId]/edit` (`[templateId]/edit/page.tsx`) — mode template.
  - `/coach/nutrition-plans/client/[clientId]` (`client/[clientId]/page.tsx`, 168) — mode client-plan.
- **Layout:** columna sidebar (`PlanBuilderSidebar`: nombre, objetivos kcal/P/C/G, auto-sync toggle, instrucciones, botón Guardar, hint de perfil del alumno, panel Pro "objetivos por composición corporal" gated por `goals_bodycomp`) + columna canvas (`MealCanvas`: comidas drag-and-drop @dnd-kit, cada comida con nombre/día/notas, alimentos con qty/unidad, swap options, "guardar como grupo").
- **FoodSearchDrawer** (dynamic import): buscar y añadir alimentos/grupos/swaps; marca favoritos/alergias/intolerancias/disgustos del alumno.
- **Módulo `nutrition_exchanges` (Porciones):** solo mode client-plan + módulo ON + sección `micros_advanced` visible. `ExchangeModePanel` (toggle modo gramos↔porciones, variantes de día, totales por variante, descarga PDF compacto/equivalencias) + `ExchangeTargetsEditor` por comida (grupos de intercambio, porciones, notas, autosave debounce 700ms).
- **PDF:** `downloadNutritionExchangePdf` (dynamic), logo resuelto server-side.
- **Interacciones:** addMeal, reorder (drag), updateMealName/day/notes, add/remove/reorder foodItems, swap options add/update/remove, guardar (valida nombre + ≥1 comida + comidas no vacías salvo modo porciones), "guardar comida como grupo" (Dialog → `saveMealGroup`).
- **Client plan page extras:** `AdherenceStrip` (aside 30 días), `EditedByBadge` (si último editor fue otro coach en pool team), link "Ver perfil →". Gating: `resolveNutritionDomainEnabled`, `resolveFeaturePrefs` (sectionFlags), `getHasExchangesModule`.

### A3. Grupos de comidas — `/coach/meal-groups`
- **Archivos:** `meal-groups/page.tsx` (45), `MealGroupLibraryClient.tsx` (176), `MealGroupModal.tsx`, `_actions/meal-groups.actions.ts`, `_data/meal-groups.queries.ts`.
- TopBar back → `/coach/nutrition-plans`, título "Grupos de comidas", info-strip. Buscador + botón "+ Grupo" (color `--theme-primary`). Grid de cards: nombre, "N ingredientes · ~kcal · Ng P", chips de alimentos (máx 3 + "+N"), editar/eliminar (`confirm()` nativo — NO usa AlertDialog del DS aquí). Modal crear/editar (`MealGroupModal`). Empty state con `Layers`.
- Scope: orgId del workspace activo.

### A4. Alimentos (standalone) — `/coach/foods`  ⚠ DISEÑO LEGACY
- **Archivos:** `foods/page.tsx` (51), `_components/FoodBrowser.tsx` (164), `_components/AddFoodSheet.tsx`, `FoodSearch.tsx`, `_data/foods.queries.ts`.
- Ruta secundaria (la principal es el tab Alimentos del hub). Usa lenguaje visual VIEJO: header con `ArrowLeft` en botón `rounded-xl border`, título `uppercase tracking-tight` con icono `Apple text-primary`. `FoodBrowser` es cliente separado de `FoodLibrary`. **Candidato a no portar o a re-skin** — la fuente de verdad es el tab del hub.

### A5. Recetas standalone — `/coach/recipes` → REDIRECT a `/coach/foods` (`recipes/page.tsx`, 5 líneas). Los componentes `recipes/RecipeLibraryClient.tsx`, `RecipeModal.tsx`, `RecipeSearch.tsx`, `[recipeId]/page.tsx` existen pero la ruta index redirige — probable código legacy parcialmente vivo (detalle `[recipeId]` puede seguir alcanzable). No confirmado su uso real.

### A6. Nutrición Pro / intercambios — `/coach/nutrition-plans/exchanges` (39)
- Ruta puramente de gating: si módulo OFF → `ModuleOffNotice moduleKey="nutrition_exchanges"` (aviso amable al catálogo). Si ON → `redirect('/coach/nutrition-plans')` (el modo intercambios se activa por alumno dentro del builder). Enterprise → notice.

### A7. Rutas legacy (redirects)
- `/coach/nutrition-builder/[clientId]` → redirect a `/coach/nutrition-plans/client/[clientId]` (`nutrition-builder/[clientId]/page.tsx`, 11).

### Notas nutrición (no encontrado / no existe como pantalla propia)
- **Alérgenos y medidas caseras:** NO hay ruta/pantalla dedicada. Los alérgenos/restricciones del alumno se leen dentro del builder (`getClientFoodRestrictions`: allergy/intolerance/dislike) y afectan el `FoodSearchDrawer`. Las "medidas caseras" (unidad `un` + gramos por unidad) se capturan en `CustomFoodForm` de `FoodLibrary`, no en pantalla aparte.
- **Board de nutrición:** es el tab "Alumnos" del hub (`ActivePlansBoard`), no una ruta separada.

---

## B. CHECK-INS COACH

- **No hay ruta `/coach/check-ins`.** El coach revisa los check-ins DENTRO de la ficha del alumno (`/coach/clients/[clientId]`, cubierto por el doc de clientes) y en su pestaña de Progreso.
- **`ProfileCheckInSnapshot.tsx`** (`clients/[clientId]/`, 276) — ÚNICO componente de check-in vivo (importado por `ProfileOverviewB3.tsx`). Card "Último check-in": fecha relativa (date-fns/es), foto (front/side/back) ampliable (Dialog en desktop / bottom-sheet en móvil vía `useSyncExternalStore` matchMedia 768px), métricas peso/energía (estrellas)/notas, y **toggle "Marcar como revisado"** optimista (`markCheckInReviewed`/`unmarkCheckInReviewed`, guarda `reviewed_at/by` — cola del coach + response-time enterprise). Botón "Ver historial en Progreso".
- **`NutritionCheckinContextCard.tsx`** (70) — card de contexto que cruza último check-in con nutrición (en la pestaña de nutrición de la ficha).
- **`components/coach/CheckInCard.tsx` (88) y `components/coach/VisualEvolution.tsx` (152): CÓDIGO MUERTO / LEGACY.** No están importados en ninguna parte (grep confirma). `VisualEvolution` además usa lenguaje VIEJO pre-DS (`GlassCard`, `GlassButton`, `uppercase tracking-[0.4em]`, raw `<img>`, `PhotoComparisonSlider`). **NO portar como referencia visual.**
- El historial completo de check-ins con fotos y la comparativa vive en la pestaña "Progreso" de la ficha del alumno (fuera de este scope; ver doc de clientes).

---

## C. HUB DE OPCIONES / AJUSTES — `/coach/settings`

### C0. Hub — `settings/page.tsx` (416)
- **Gating:** `org_managed` → redirect dashboard. `team_managed` → variante REDUCIDA del hub (marca y suscripción las gestiona el equipo/EVA; sólo módulos del pool + cuenta). Standalone/otros → hub completo.
- **Móvil (`md:hidden`):** hub aplanado de cards (`HubCard`: tile icono + título + descripción + chevron). Secciones agrupadas por `Eyebrow`:
  - Identidad: `IdentityHero` (card inverse, avatar inicial, nombre marca/coach, badge Plan Free/Starter/Pro/Elite).
  - Apariencia: `ThemeToggleCard`.
  - Personalización: "Mi Marca" → `/coach/settings/brand` (badge "Pro" si sin branding).
  - Plan: "Suscripción" → `/coach/subscription`, "Módulos" → `/coach/settings/modules` (badge "N módulos").
  - Configuración: "Funciones de nutrición" → `/coach/settings/funciones`, "Áreas del builder" → `/coach/settings/areas`.
  - Cuenta: "Soporte" → `/coach/support`, `CoachSignOutCard`, `DangerZone`.
  - Footer wordmark "EVA · v2.4".
- **Desktop (`hidden md:block`):** `CoachSettingsDesktop` (SettingsShell de 2 paneles). La page arma los slots `sections[id]` con los MISMOS componentes reales embebidos (BrandSettingsForm, SubscriptionContent embedded, ThemeToggleCard, SupportPane, DangerZone, ModulesForm, FeaturePrefsPanel, AreasManager) vía `PaneBody` (usa clases DS `dt-set-panesub`, `dt-set-embed`). Data de módulos/funciones/áreas fetch en paralelo.

### C1. Desktop shell — `_components/CoachSettingsDesktop.tsx` (157)
- Rail izquierdo (`dt-set-rail`) con grupos: Cuenta (Mi Marca, Suscripción), Entrenamiento (Módulos, Funciones, Áreas del builder, Importar alumnos), Preferencias (Apariencia), Ayuda (Soporte, Eliminar cuenta), Sesión (Cerrar sesión). Panel derecho renderiza la sección activa (`key={sel}` re-mount con fade). "Importar alumnos" es pane local (`ImportPane`, no viene de `sections`). Cerrar sesión vía `useCoachSignOut`.

### C2. Mi Marca / Brand Studio — `/coach/settings/brand`
- **Archivos:** `settings/brand/page.tsx` (82), `settings/BrandSettingsForm.tsx` (897), `BrandAdvancedSection.tsx` (564), `_components/BrandThemePreview.tsx`, `LoginLayoutPicker.tsx`, `ThemeGallery.tsx`, `LoaderComposer.tsx`, `BrandUpsell.tsx`, `BrandSettingsTourClient.tsx`.
- **Gating:** `org_managed`→dashboard, `team_managed`→settings (marca la gestiona el equipo). Sin `canUseBranding` (Free) → la ruta ES el upsell (`BrandUpsell`).
- **BrandSettingsForm (formulario único con guardado unificado FAB):**
  - Brand Score (% completado) + indicador "Sin guardar" (dirty).
  - Container-query (`@container/brandform`): en pane angosto (desktop embebido) preview arriba; en ancho, preview sticky a la derecha (`BrandThemePreview` = teléfono con tabs home/otros, toggle dark).
  - **Logo:** 2 slots (claro + oscuro), `LogoSlot` con drag/drop, optimización client-side, staged hasta guardar. Copy: "512×512, máx 2 MB, PNG/JPG". También es el ícono de instalación de la app.
  - **Identidad:** nombre de marca (público), URL legacy slug (read-only), nombre completo (privado, facturación).
  - **Mensajes de bienvenida:** mensaje en login (textarea 240 chars) + modal del dashboard (toggle enabled, tipo texto/video, contenido/URL YouTube-Vimeo).
  - **Tema de marca:** `ThemeGallery` (presets curados; reemplaza rueda de color libre; preserva color legacy en hidden input).
  - **Login del alumno:** `LoginLayoutPicker` (4 variantes de layout).
  - Toggle "Usar mi marca también en mi panel" (`use_brand_colors_coach`).
  - **Avanzado (Pro):** `BrandAdvancedSection` (acordeón): color secundario, fuente (`brand_font_key`), acentos light/dark, neutral tint, loader personalizado (`LoaderComposer`: variant, texto, color, icon mode eva/coach/none), splash.
  - FAB de guardar sticky, `beforeunload` guard si dirty. Tour de onboarding (`BrandSettingsTourClient`).
- Nota: subida de logos = direct-to-Storage (bypass WAF Cloudflare, PR #111).

### C3. Funciones (feature-prefs) — `/coach/settings/funciones`
- **Archivos:** `settings/funciones/page.tsx` (58), `_data/funciones.queries.ts`, `components/coach/FeaturePrefsPanel.tsx` (478), `_actions/feature-prefs.actions.ts`.
- **Gating:** `org_managed`→dashboard; sin ctx (miembro team sin gestión)→`/coach/team`. Scope `team` (solo gestor/owner) vs `standalone`.
- **FeaturePrefsPanel:** un grupo `DomainFuncionesGroup` por dominio (hoy solo Nutrición; extensible). Cada área: (1) selector de PRESET (Básico/Intermedio/Profesional, radiogroup, doble como onboarding), (2) master switch del dominio "Mostrar Nutrición" (`Switch` DS, key `_enabled`), (3) expander "Ajustar secciones" → toggles por sección con badge Base/Pro + `InfoTooltip`; secciones Pro sin entitlement van LOCKED con CTA "Desbloquear con {módulo}" → `/coach/subscription#addons`. Borrador local + botón "Guardar configuración" (una sola escritura) + "Descartar". Explainer Módulos-vs-Funciones al pie. `framer-motion` con `useReducedMotion`, targets ≥44px.
- Modelo: `visible = ENTITLED (billing) AND ENABLED (preferencia)`. La preferencia solo achica.

### C4. Áreas del builder — `/coach/settings/areas`
- **Archivos:** `settings/areas/page.tsx` (42), `_components/AreasManager.tsx` (256), `_actions/areas.actions.ts`, `_data/areas.queries.ts`.
- **AreasManager:** lista de áreas (badge corto con color del área vía `buildAreaVMs`, nombre, orden, "Área del sistema (solo lectura)"). Editar inline (nombre + orden numérico, check/cancel), eliminar (confirmación inline de 2 pasos: Confirmar/cancelar; los ejercicios vuelven a "Principal"). Input + botón "Crear" (mín 2 chars, Enter). Banner `Lock` si `!canEdit` (team no-gestor: "puedes usarlas en el builder"). Server actions: create/update/delete. Scope team/standalone.

### C5. Catálogo de Módulos + CTA add-ons — `/coach/settings/modules`
- **Archivos:** `settings/modules/page.tsx` (49), `_components/ModulesForm.tsx` (262), `_data/modules.queries.ts`. Catálogo de copy: `@eva/module-catalog`.
- **ModulesForm = CATÁLOGO READ-ONLY (compra-only, sin switches).** Banner info "Comprar ≠ usar". Lista de 4 módulos (`MODULE_CATALOG_KEYS`): cardio (`HeartPulse`), movement_assessment (`PersonStanding`), body_composition (`Scale`), nutrition_exchanges (`Utensils`). Cada card: icono tonal (lit si activo), label, badge Activo (`success`)/De pago (`Lock`), pitch, chips de alcance ("Se usa con un alumno" vs "Se configura en el plan" para nutrition_exchanges) + superficies. Si activo: "Incluido en tu cuenta", aviso mantenimiento si `killedByOperator`, cross-link a Funciones para nutrition_exchanges (visible/oculto). Si inactivo: precio `/mes` (solo standalone) + **CTA por contexto** (`ModuleCta`):
  - team no-gestor: "Pídelo al owner".
  - team gestor: mailto conversacional `contacto@eva-app.cl`.
  - standalone + `SELF_SERVICE_ADDONS_ENABLED`: "Desbloquear" → `/coach/subscription#addons`.
  - standalone + flag OFF: mailto interino "Desbloquear — escríbenos".
  - Cada click captura `module_interest_cta_clicked` (PostHog).

### C6. Otros panes de settings (no detallados, existen):
- `ThemeToggleCard` (tema claro/oscuro), `SupportPane`/`HelpCenter` (soporte), `DangerZone` (eliminar cuenta), `ImportPane` (importar alumnos), `CoachSignOut`/`CoachSignOutCard` (logout), `settings/preview/page.tsx` (preview de marca).

---

## D. MI EQUIPO — `/coach/team`

- **Archivos:** `team/page.tsx` (200), `_components/CoachTeamDesktop.tsx`, `TeamBrandStudio.tsx`, `TeamMembersManager.tsx`, `TeamShareLink.tsx`, `_actions/team.actions.ts`, `_data/team.queries.ts`.
- **Gating:** solo contexto `coach_team` (fuera de él → redirect dashboard). Empty state si sin equipos.
- **Móvil (`md:hidden`):** por cada team:
  - **Hero inverse:** logo/iniciales (color de marca del team con contraste luma calculado), nombre, badge de rol (Owner/Crown, Co-gestor/Shield, Miembro/User). Texto "Pool compartido". `TeamShareLink`. Fila de stats: anillo SVG de cupos (`activeMemberCount/seat_limit`), alumnos del pool, módulos activos (→ `/coach/settings/modules`).
  - **Brand Studio** (`TeamBrandStudio`): título "Brand Studio" (gestor) o "Marca del equipo" + badge "Solo lectura" (no-gestor). Marca del team (color primario, logos claro/oscuro, acentos, splash, loader) editable si `canEdit`; upload logo direct-to-Storage (`compressLogo`, `putToSignedUrl`).
  - **Miembros** (`TeamMembersManager`): header "Miembros (N)" + botón "Agregar" (deshabilitado si `seatsFull`). Lista de miembros con avatar iniciales, rol. Acciones (gestor): `AddCoachDialog` (crear coach nuevo / agregar existente), `EditRoleDialog` (co-gestor on/off), remover (AlertDialog con `AlertDialogMedia`). Aviso si cupos llenos. Desktop → Dialog centrado, móvil → bottom-sheet (matchMedia 760px). Server actions: create/add/remove/updateRole.
  - Footer "EVA Teams · {nombre}".
- **Desktop (`hidden md:block`):** `CoachTeamDesktop` (maestro-detalle 1:1 con DesktopTeamEquipo).
- **TeamShareLink:** 2 filas (login `/t/{slug}/login` con copiar+abrir; código de invitación `/join/{code}` con copiar). Sobre fondo oscuro del hero.

---

## E. SUSCRIPCIÓN — `/coach/subscription` (display; acciones de cobro = web-only)

### E1. Cuerpo — `subscription/page.tsx` (15) + `_components/SubscriptionContent.tsx` (1416)
- Reutilizado también embebido en el pane "Suscripción" de Opciones desktop (`embedded` prop). `Suspense` por `useSearchParams`.
- **La UI NUNCA calcula precios** — todo viene de `/api/payments/subscription-status` (coach, addons, billing breakdown, events, activeClientCount) y `getCompositeAmountClp`/`computeDiscountedClp` para previews.
- **Estructura (render principal, líneas 571+):**
  1. TopBar (título "Suscripción · Standalone" + badge de estado, o back-link si no embebido).
  2. Banners de feedback error/success (con cierre). Maneja retornos de checkout `?addon=` / `?upgrade=` (success/pending/failure).
  3. **Plan actual** (card inverse): "Plan actual", tier label grande, próximo cobro/acceso hasta + fecha, total compuesto grande. **Desglose** (base + módulos + cupón) solo si activo. **Cambiar tarjeta** (card interna con brand+last4, botón "Cambiar" → `/coach/subscription/update-card`) si flag ON y estado active/trialing/paused/past_due.
  4. **Cupón** — `CouponRedeemCard` (194, self-gated: se oculta sin plan pago / flag OFF).
  5. **Módulos add-on** (`id="addons"`, superficie de venta #2): lista de 4 módulos con icono, label, badge de estado (Activo sin costo/cortesía `Gift`, Activo `Check`, "Se desactiva el {fecha}", Baja programada, Requiere plan Pro+ `Lock`, o precio `/mes`), botón Agregar/Quitar (abre modal). Gating por `hasActivePaidPlan`, `SELF_SERVICE_ADDONS_ENABLED`, `requiresNutritionTier` (nutrition_exchanges exige Pro+). Avisos si sin plan pago / flag OFF (mailto).
  6. **Cambiar plan:** selector de ciclo (pills mensual/anual con -%), cards de tier (Starter/Pro/Elite) con precio, features, badge "Actual", bloqueos (downgrade sin cupo `OVER_CAPACITY`, o con add-on de nutrición vivo). Combo plan+add-ons (solo flag ON). Modal "Confirmar cambio de plan".
  7. **Historial de pagos:** lista de eventos (fecha, provider_status, provider · checkout_id, monto). Empty state. Nota MP.
  8. **Cancelar suscripción:** ghost danger que revela panel con fecha de acceso + textarea de motivo.
- **Modales:** confirmar cambio de plan, agregar add-on (con términos), quitar add-on (con fecha efectiva + confirmación de baja registrada).

### E2. Cambiar tarjeta — `/coach/subscription/update-card` (WEB-ONLY)
- **Archivos:** `update-card/page.tsx` (43), `_components/CardChangeForm.tsx` (282).
- **Gate:** `CHANGE_CARD_ENABLED` OFF → `notFound()`. `dynamic = 'force-dynamic'`. Tokenización 100% client-side (MP Secure Fields, PAN nunca toca server, PCI SAQ-A).
- **Comentario clave del código:** *"Es la MISMA URL que abrirá la futura app RN en el navegador externo (pago fuera de la app)."* → confirma decisión: cambio de tarjeta = web-only, abierto en navegador externo desde RN.
- Card layout `max-w-md`, header "Cambiar tarjeta", `CardChangeForm` (public key MP, disclosure de términos versionado).

### E3. Páginas de procesamiento (retornos de checkout MP, WEB-ONLY)
- `subscription/processing/page.tsx` (476), `addon-processing/page.tsx` (154), `upgrade-processing/page.tsx` (156). Todas `'use client'`, hacen polling de `/api/payments/subscription-status` (timeout 5min) tras volver de MercadoPago, extraen `preapproval_id`, y redirigen a `/coach/subscription?...=success|pending|failure`. Puramente transaccionales — no portar a RN nativo.

---

## F. MÓDULOS DE PAGO

### F1. CARDIO — `/coach/cardio`
- **Archivos:** `cardio/page.tsx` (51), `_components/CardioToolsClient.tsx` (369), `_components/CardioProfileForm.tsx` (135), `cardio/[clientId]/page.tsx` (109), `_actions/cardio.actions.ts`, `_data/cardio.queries.ts`.
- **Gating (server, `getCardioPageData`):** `module_off` → `ModuleOffNotice moduleKey="cardio"`; `unauthenticated` → login. `assertModule` por workspace activo.
- **Hub (`page.tsx`):** header con icono `HeartPulse` en tile sport + badge "Módulo" + subtítulo "Herramientas". `CardioToolsClient` con `SegmentedControl` de 3 herramientas:
  - **Zonas:** selector de alumno (o "Cálculo manual"), inputs edad/FC reposo (manual) o resumen del perfil (edad/FC reposo/FC máx/Ref 5K). Resultado: FC máx grande (Tanaka u override) + zonas Z1-Z5 (`ZoneRow` con cuadro de color Z + nombre + rango bpm mono). Método Karvonen o %FCmax. Link "Editar perfil cardio" → `/coach/cardio/{id}`. Dominio: `@/domain/cardio/zones` (`hrZonesFromMax`, `hrZonesKarvonen`, `maxHrTanaka`, `resolveClientZones`).
  - **Pace:** inputs pace (min/km, mono) + distancia; resultados en grid (tiempo total, velocidad km/h, pace/milla, pace/km). Dominio: `@/domain/cardio/pace`.
  - **Plantillas:** `INTERVAL_TEMPLATES` (motor de intervalos del builder), cada card con nombre, badge de zona sugerida (Z1-Z5 con tono), descripción, duración cronometrable.
- **Perfil cardio del alumno (`[clientId]/page.tsx`):** header back → `/coach/cardio` (móvil), icono + "Perfil cardio" + nombre. `CardioProfileForm` (fecha nac, FC reposo, FCmax medida opcional, referencia 5K seg; `useActionState` + Zod cliente/server; inputs `h-12 rounded-control`). Sección "Zonas resultantes" (mismas Z1-Z5 + explicación de lo que ve el alumno). Datos de salud visibles solo por scope de clients.
- **Vista alumno read-only:** NO hay ruta `/c/.../cardio`. El alumno ve la zona prescrita dentro de los bloques cardio del ejecutor de rutina (`workout/[planId]`, ej. "Z4 · 150-165 bpm") — fuera de este doc.

### F2. MOVEMENT ASSESSMENT (Screening de Movimiento) — `/coach/movement`
- **Archivos:** `movement/page.tsx` (24), `_components/MovementHubList.tsx` (104), `MovementWizard.tsx` (602), `ClientMovementReport.tsx` (144), `MovementPrintReport.tsx` (156), `DeleteAssessmentButton.tsx`, `[clientId]/page.tsx` (26), `[clientId]/new/page.tsx` (35), `[clientId]/print/page.tsx` (33). Servicio: `@/services/assessment/movement-assessment.service`. Componentes compartidos: `components/movement/` (`AssessmentReportCard`, `EvolutionCharts`, `PriorityBadge`, `MovementDisclaimer`, `StudentMovementView`). Cálculo: `@eva/calc` (`MOVEMENT_PATTERNS_V1`, 7 patrones).
- **Gating (server):** `module_off` → `ModuleOffNotice`; en client-scope el service valida scope 3-vías + assertModule (contexto del alumno) + registra `view` en bitácora team.
- **Hub (`MovementHubList`):** título i18n (`useTranslation`), badge "Módulo". Lista de alumnos del workspace activo: avatar inicial (fondo `ink-900` texto sport-400), nombre, último semáforo (`PriorityBadge` banda + score `/21` + fecha) o "sin evaluación", badge "borrador pendiente". CTA por fila: ver reporte (→ `/coach/movement/{id}`) + botón sport "Evaluar"/"Retomar" (→ `/coach/movement/{id}/new`). `MovementDisclaimer` al pie. Usa i18n (`assessment.*`).
- **Wizard de captura (`MovementWizard`, `[clientId]/new`):** tablet-first (`min-h-dvh`, targets ≥44px, safe-areas). Header sticky con back + "Paso N de 7" + barra de progreso segmentada. Por patrón: título i18n, `ScoreSegmented` (botones 0-3 con color semáforo danger→success), por lado (izq/der) o single, `ToggleRow` de dolor y clearing (fuerzan score 0), textarea comentario. Autosave por paso (`useTransition` → `upsertDraftItemAction`, retoma borrador cross-device). Aviso "editado por otro" en pool team. **Paso Revisión:** lista de patrones con score + editar, preview de banda/composite (card inverse, recalculado server siempre), form finalizar (`useActionState` → `finalizeAssessmentAction`) con notas + consentimiento (team: badge OK/faltante; standalone: checkbox de atestación). Footer fijo con total parcial `/21` + navegación atrás/siguiente. `MovementDisclaimer`.
- **Reporte del alumno (`ClientMovementReport`, `[clientId]`):** header back + nombre + badge Módulo. Último `AssessmentReportCard`, `EvolutionCharts` (si ≥2 finales) o aviso "necesitas 2", historial (filas con dot de banda + score + fecha + `DeleteAssessmentButton`), acciones Imprimir (→ `/print?assessment=id`) + Evaluar/Retomar. Empty state.
- **Print (`[clientId]/print`, `MovementPrintReport`):** vista imprimible del assessment.

### F3. BODY COMPOSITION — `/coach/clients/[clientId]/bodycomp`
- **Archivos:** `clients/[clientId]/bodycomp/page.tsx` (31), `_components/BodyCompositionTabB6b.tsx` (108), `BiaCaptureForm.tsx` (192), `IsakCaptureForm.tsx` (299), `BiaTrendPanel.tsx` (187), `IsakTrendPanel.tsx` (211), `IsakResultCard.tsx` (103), `_actions/body-composition.actions.ts`, `_data/body-composition.queries.ts`. Dominio: `@/domain/bodycomp` (`computeIsak`), `@eva/schemas/bodycomp`. Repo: `@/infrastructure/db/body-composition.repository`.
- **Gating (server, `getClientBodyComposition`):** `module_off` → `ModuleOffNotice moduleKey="body_composition"`; `not_found` → notFound (kill-switch + module + write-access). Es ruta propia dentro de la ficha del alumno (NO la pestaña de progreso existente).
- **Shell (`BodyCompositionTabB6b`):** header back → ficha + "Composición corporal · Módulo · captura" + badge Módulo. `SegmentedControl` de método: Bioimpedancia (BIA, rol Entrenador) / Antropometría (ISAK, rol Nutri). Los datos NUNCA se mezclan (series filtradas por método). Toggle "Nueva medición"/"Cancelar" (sport/secondary fullWidth). Debajo, el trend panel del método activo.
- **BIA captura (`BiaCaptureForm`):** react-hook-form + Zod (`BodyCompositionCreateSchema`). Sin cálculo (persiste tal cual). Campos: marca/modelo equipo, peso, estatura, y 11 métricas (masa muscular esquelética, masa grasa, %grasa, agua total/intra/extra, ECW/TBW, grasa visceral área cm²/nivel, metabolismo basal, ángulo de fase), notas. Badge "Entrenador".
- **ISAK captura (`IsakCaptureForm`):** wizard 4 pasos (Datos base + pliegues → Perímetros → Diámetros → Revisión). Stepper con pills. Paso 0: sexo, edad, estatura, peso, talla sentado + 8 pliegues. Paso 1: 8 perímetros. Paso 2: 6 diámetros. Paso 3: selector de ecuación de %grasa (Durnin-Womersley/Yuhasz/Faulkner) + preview en vivo (`IsakResultCard`, mismas funciones puras que el server). Badge "Nutri".
- **IsakResultCard:** 5 componentes Kerr (muscular/adiposo/óseo/residual/piel, kg + %), validez interna (Σ masas vs peso, Δ), somatotipo (endo-meso-ecto), %grasa (badge "Preliminar" si no validado).
- **Trend panels (`BiaTrendPanel`/`IsakTrendPanel`):** `StudentBiaSummary`/`StudentIsakSummary` (tiles con deltas, misma card que el alumno) + gráfico `recharts` LineChart (series seleccionables con pills, Δ vs anterior con color) + lista de mediciones con etiqueta dispositivo/fecha + eliminar (`deleteBodyCompositionAction`). Empty state por método.

### F4. Vistas ALUMNO read-only de los módulos de pago
- **Body composition alumno — `/c/[coach_slug]/bodycomp`** (`c/[coach_slug]/bodycomp/page.tsx`, `components/bodycomp/StudentBodyCompositionView.tsx`, 176): gate por módulo con contexto del propio alumno (OFF → notFound). Header sticky back-to-dashboard + título i18n + badge Módulo. Switcher de método (solo si ambos tienen data). Por método: `StudentBiaSummary`/`StudentIsakSummary` + `StudentBiaTrend`/`StudentIsakTrend` (≥2) o "necesitas 2". `framer-motion` (fadeSlideLeft, RevealStagger, count-up, gated por reduced-motion). Disclaimer. Sirve también vía `/t/[team_slug]/bodycomp`. RLS self-select.
- **Movement alumno — `/c/[coach_slug]/movimiento`** (`c/[coach_slug]/movimiento/page.tsx`, `components/movement/StudentMovementView.tsx`): solo evaluaciones FINALES, gate por módulo (OFF → notFound). Comparte `AssessmentReportCard`/`EvolutionCharts`/`PriorityBadge`. Sirve vía `/t/[team_slug]/movimiento`.
- **Cardio alumno:** sin pantalla dedicada (zonas embebidas en el ejecutor de rutina).
- Componentes bodycomp compartidos coach/alumno: `components/bodycomp/` (`CountUpValue`, `StudentBiaSummary`, `StudentBiaTrend`, `StudentIsakSummary`, `StudentIsakTrend`, `StudentBodyCompositionView`).

---

## G. NAVEGACIÓN COMPARTIDA (coach)

### G1. Topbar desktop — `components/coach/CoachTopBar.tsx` (292)
- Solo desktop (`hidden md:flex`, h-60px). `null` en el builder. Izquierda: back + breadcrumb "Sección › Detalle" (solo drill-down, mapa `SECTIONS` por prefijo). Centro: `CoachGlobalSearch`. Toggle Tabla/Ficha (solo en `/coach/clients`, vía `RosterViewContext`). Derecha: toggle tema (next-themes), logout, `NewsBellButton`, avatar de cuenta (logo o iniciales) → `/coach/settings` o `/workspace/select` (con chevron ↕ si multi-workspace).

### G2. Búsqueda global — `components/coach/CoachGlobalSearch.tsx` (354)
- **Desktop-only** (montada en el topbar `hidden md:flex`). Combobox APG accesible. Debounce 250ms + AbortController → `GET /api/coach/search`. Dropdown de resultados AGRUPADOS: Alumnos (`Users`, avatar), Programas (`ClipboardList`), Ejercicios (`Dumbbell`, thumb), Recetas (`ChefHat`, thumb), cap 5/grupo. Navegación teclado ↓/↑/Enter/Escape, atajo "/" (enfoca desde el topbar). Highlight del match. Empty state. `role=combobox/listbox/option`.
- **En móvil NO hay búsqueda global** en el topbar (cada pantalla tiene su propio buscador local, p.ej. NutritionHub/ActivePlansBoard). Existe también búsqueda local en `ClientsDirectoryClient`, `ExerciseCatalogClient`, `NutritionHub`.

### G3. News bell (Novedades) — `components/coach/NewsBellButton.tsx` (289) + `NewsFeedProvider.tsx`
- Contexto `useNewsFeed` (items + unreadCount + markAllAsRead). Icono `Bell` con badge de no leídos (ember, "9+"). **Móvil:** Sheet bottom (`max-h-80dvh`). **Desktop:** Popover (400px, align end). `markAllAsRead` al abrir. `NewsFeedList`: ítems con icono tonal por tipo (feature/Sparkles, improvement/Wrench, fix/Bug, announcement/Megaphone), rail sport si fijado, título, contenido markdown ligero (renderer propio: `##`/`###`/`-`/`**bold**`/`---`), imagen, CTA, fecha relativa. Empty "No hay novedades". El feed lo publica admin (`/admin/.../novedades`).

### G4. Workspace switcher — `components/workspace/WorkspaceSwitcher.tsx` (127)
- Devuelve `null` si ≤1 workspace. Botón chevron + label del workspace actual; panel dropdown (up/down) con lista de workspaces (icono por tipo: enterprise_staff/UserCog, enterprise_coach/Building2, coach_standalone/Dumbbell, coach_team/UsersRound, alumno/GraduationCap), label + tipo, badge "Actual". `selectWorkspaceAction` (server) + `useTransition`. Variantes `dark`/`brand`. Usado en `DashboardShell` (móvil, dashboard) y `OrgEnterpriseNav`. En el topbar desktop el switch es el avatar → `/workspace/select` (página dedicada, no dropdown).
- Sidebar coach: `components/coach/CoachSidebar.tsx` (cápsula flotante de navegación en móvil + sidebar desktop). `CoachTopBar` comenta que <md el chrome lo pone cada pantalla + la cápsula de `CoachSidebar`.

---

## Resumen de gotchas para el plan RN

1. **Rutas legacy / código muerto (NO portar como referencia):** `/coach/foods` (diseño pre-DS), `/coach/recipes` (redirect), `nutrition-builder/[clientId]` (redirect), `components/coach/VisualEvolution.tsx` + `CheckInCard.tsx` (sin uso).
2. **Web-only intencional (money-safety / IAP):** `/coach/subscription/update-card` (comentario explícito: RN abre esta URL en navegador externo), páginas `processing`/`addon-processing`/`upgrade-processing` (retornos MP), y todos los flujos de checkout/compra de add-ons y cambio de plan. El display de suscripción (plan, desglose, historial, estado de add-ons) SÍ debería portarse read-only.
3. **Gating de módulos de pago:** siempre server-side (`assertModule` + kill-switch + scope 3-vías). Módulo OFF → `ModuleOffNotice` (aviso amable al catálogo). RN debe replicar el gate y el aviso.
4. **Módulos = read-only catálogo** (compra-only). Ningún toggle de auto-activación; CTA a mailto o `/coach/subscription#addons`.
5. **Funciones ≠ Módulos:** `visible = ENTITLED AND ENABLED`. FeaturePrefsPanel escribe solo la capa ENABLED (preferencia, solo achica). Master switch de dominio + presets + toggles de sección con lock Pro.
6. **Workspace-scoped:** casi todo lee `getPreferredWorkspaceForRender` (standalone / coach_team / enterprise_coach) y bifurca copy y datos. `team_managed`/`org_managed` cambian radicalmente settings (marca/suscripción las gestiona equipo/EVA).
7. **i18n:** movement usa `useTranslation` (`assessment.*`); el resto de nutrición/cardio/bodycomp usa copy en español hardcodeado.
8. **Desktop vs móvil divergentes:** varias pantallas montan componentes distintos por breakpoint (nutrición board, settings hub, team). RN (móvil) debe transcribir la variante MÓVIL.
