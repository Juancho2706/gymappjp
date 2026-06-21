# OVERNIGHT — Progreso (append-only)

> Una entrada por turno. Memoria durable a través de compactaciones de contexto.
> Formato por entrada:
> ## <timestamp> — <Txx nombre>
> - estado: done | blocked | partial
> - archivos: ...
> - validación: tsc exit=<n> / expo exit=<n>
> - commit: <hash o "—">
> - próxima: <Txx>
> - learnings/gotchas: ...

---

## 2026-06-21 01:33 — T1 Paleta macro canónica
- estado: done
- archivos: lib/theme.ts (interface +macro scheme-aware, light/dark, export MACRO_COLORS central), components/MacroRingSummary.tsx (re-export MACRO_COLORS desde theme, rings usan theme.macro.*, over/goal via theme.macro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T2 filtros ejercicios
- learnings/gotchas: solo 2 consumidores de MACRO_COLORS (MacroRingSummary + FoodSearchSheet); FoodSearchSheet sigue importando desde '../MacroRingSummary' (re-export mantiene compat). NO toqué tailwind.config/global.css: ningún componente mobile usa clases macro-*; el hogar correcto de estos colores (StyleSheet) es theme.ts. Valores canónicos: protein #5E9FD6/#7FB3E0, carbs #FFB74D/#FFC97A, fats #81C784/#A0D6A3, over #EF4444, goal #10B981.

---

## 2026-06-21 ~01:40 — T2 Filtros ejercicios "Con video"
- estado: done
- archivos: lib/exercises.ts (+exerciseHasVideo), app/coach/(tabs)/ejercicios.tsx (state videoOnly + chip "Con video" + filtro + key), app/alumno/(tabs)/exercises.tsx (import + state + toggle row + filtro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T3 subscription display
- learnings/gotchas: "Personalizados" en coach YA existe como tab "Míos" (source==='own') → no dupliqué chip; agregué solo "Con video" en coach. Alumno no tiene ownership (ve coach+system) → solo "Con video". exerciseHasVideo = youtube(video_url) || gif_url || video_url .mp4/.webm/.mov/.gif. AC plural "toggles" cubierto por la combinación tab-origen + chip-video en coach; alumno = chip-video.

## 2026-06-21 ~01:55 — T3 Subscription display parity
- estado: done
- archivos: lib/coach-subscription.ts (tipos AddonLive/PaymentEvent/BillingBreakdown/CardInfo + MODULE_LABELS inline + extractEventAmountClp + getCoachSubscriptionOverview ahora lee card/addons/events/snapshot directos), app/coach/(tabs)/subscription.tsx (cards Facturacion, Modulos activos con badge Cortesia EVA, Tarjeta, Historial de pagos; helper formatClp + BreakdownRow)
- validación: tsc exit=0 (2º intento) / expo exit=0
- commit: (siguiente)
- próxima: T4 login alumno brandeado
- learnings/gotchas: GOTCHA importante — el endpoint web /api/payments/subscription-status usa createClient() (sesion por COOKIE) → NO acepta el Bearer de mobile (devolveria 401). Solucion: leer DIRECTO por PostgREST bajo la sesion del coach (RLS SELECT-own) las tablas coaches(card_*)/coach_addons/subscription_events/billing_snapshots; el total compuesto sale del ultimo billing_snapshot (congelado) → NO recomputo precios (no duplico la logica de @/lib/constants ni services/billing, que no estan en packages). MODULE_LABELS inline (4 keys estables) en vez de @eva/module-catalog (no importado en mobile, evitar fallo de resolucion). GOTCHA tsc: el builder de supabase es PromiseLike (sin .catch) → usar IIFE async + try/catch, no .then().catch(). Todas las lecturas guarded → pantalla degrada elegante. Render gated por presencia (vacio = no se muestra la card). Verificacion runtime = en device.

## 2026-06-21 ~02:05 — T4 Login alumno brandeado
- estado: done
- archivos: lib/branding.ts (+welcomeMessage en CoachBranding + welcome_message en BRANDING_COLS_RICH + mapping), app/(auth)/login.tsx (import Image, branding del context, heading brandeado para alumno = logo 80x80 + displayName + welcomeMessage, footer "Impulsado por EVA")
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: — (fin scope Medio)
- learnings/gotchas: welcome_message va en BRANDING_COLS_RICH; si anon no tiene grant de columna, el query RICH falla y cae a BRANDING_COLS_MIN (sin welcome) → degrada solo, sin romper. El path coach del login queda INTACTO (branch solo para !isCoach && branding). branding llega via useTheme().branding (ThemeContext ya lo hidrata desde AsyncStorage + +native-intent lo cachea al abrir /c/slug). Verificacion runtime (logo real + welcome) = en device con un coach que tenga logo_url + welcome_message.

## RESUMEN FINAL
Corrida overnight 2026-06-21 (~01:33–02:05), scope Medio (T1-T4), rama feat/rn-parity-overnight, worktree D:/tmp/gymappjp-rn-overnight.

DONE (4/4, todas tsc exit=0 + expo exit=0 + commit):
- T1 paleta macro canonica — commit 01b80000
- T2 filtro "Con video" en ejercicios — commit 5bdc2e53
- T3 subscription display parity (solo lectura) — commit aa392ab9
- T4 login alumno brandeado — commit (este)
BLOCKED: ninguna.

REVISAR EN LA MANANA (todo verificable solo en device — el bundle/tsc no lo cubre):
1. T1: abrir nutricion (alumno + coach) → anillos macro deben verse en paleta calma (azul/durazno/verde), no naranja/azul/amarillo. Modo claro y oscuro.
2. T2: pantalla Ejercicios (coach) chip "Con video" filtra; alumno "Aprender Tecnica" idem. Combinar con musculo/busqueda.
3. T3: suscripcion de un coach con add-on activo y/o billing_snapshot → deben aparecer cards Facturacion/Modulos(badge Cortesia EVA)/Tarjeta/Historial. Coach sin esos datos → cards ocultas (degrada). Verificar que coaches.card_* y subscription_events sean legibles por la sesion del coach (RLS/grants); si una lectura no tiene permiso, queda vacia (no rompe).
4. T4: login de alumno via /c/<slug> o codigo de un coach con logo_url + welcome_message → debe verse logo + nombre de marca + mensaje. Coach login sin cambios. Confirmar que anon puede leer welcome_message (si no, cae a fallback sin welcome).

RETOMAR / MERGEAR:
- Diffs: git -C D:/tmp/gymappjp-rn-overnight diff master..feat/rn-parity-overnight -- apps/mobile
- Gate: cd D:/tmp/gymappjp-rn-overnight/apps/mobile && npx tsc --noEmit && npx expo export --platform android
- Mergear a master por flujo normal de PR (rama feat/rn-parity-overnight). Build EAS para device.
- Limpiar worktree al terminar: git worktree remove D:/tmp/gymappjp-rn-overnight
PROXIMO scope sugerido (no hecho): T5 Areas settings, o pasar a P0/P1 del informe (workout polimorfico, modulos pagos) que requieren packages/DB y NO son aptos unattended.

---

## 2026-06-21 10:37 — CARDIO modulo completo (supervisado, extra post-Medio)
- estado: done (tsc exit=0 / expo exit=0)
- CORRECCION clave: los modulos pagos NO necesitan migracion — la DB ya tiene todas las tablas/columnas (verificado en database.types: movement_assessments, body_composition_measurements, exchange_groups/meal_exchange_targets, clients.resting_hr/max_hr_override/ref_5k_time_sec/birth_date, enabled_modules). Mobile lee/escribe por PostgREST como el resto.
- archivos nuevos: lib/cardio.ts (dominio puro Tanaka/Karvonen/%FCmax + pace + INTERVAL_TEMPLATES, espejo de apps/web/src/domain/cardio + lib/workout-interval), lib/entitlements.ts (hasModule lee coaches.enabled_modules objeto {key:bool}), lib/cardio-data.ts (listCardioClients/getCardioClient/saveCardioProfile valida con @eva/schemas CardioProfileUpdateSchema), app/coach/cardio/index.tsx (hub: calc zonas alumno/manual + pace + plantillas, gated), app/coach/cardio/[clientId].tsx (editor 4 campos + preview de zonas en vivo + save). modificado: app/coach/(tabs)/perfil.tsx (link gated "Zonas de cardio").
- GRANTS (de-risk hecho leyendo el codigo): updateCardioProfileAction web usa createClient() = sesion del COACH (no service-role) → las columnas cardio de clients YA tienen GRANT UPDATE para authenticated. Mobile escribe las mismas bajo RLS coach → sin migracion, sin endpoint. (Confirmar en device que el PATCH no tira 42501.)
- gating: enabled_modules es OBJETO {cardio:true}, no array. Kill-switch operador (EVA_DISABLED_MODULES) es server-only → mobile espeja entitlement, el gate real de datos sigue server-side.
- scope: NO hay vista alumno standalone de cardio en web (zonas viven en el workout cardio = execution polimorfico XL). Cardio mobile = coach hub + editor.
- commit: (siguiente)
- VERIFICAR EN DEVICE: (1) coach con modulo cardio ON ve el link "Zonas de cardio" en perfil + hub funciona; coach sin modulo → link oculto + hub muestra "Modulo no habilitado". (2) calc zonas con alumno (Tanaka/Karvonen segun reposo) y manual. (3) pace calc. (4) editar perfil de un alumno → guardar → que NO tire 42501 (confirma grants) y que el preview de zonas actualice en vivo. (5) birth_date es TextInput AAAA-MM-DD (no date picker nativo — mejora futura).

---

## 2026-06-21 — OLA A (workflow 5 agentes, integracion central)
- estado: done (tsc exit=0 [1 fix: meal-groups unit 'ml' inalcanzable] / expo exit=0)
- 5 modulos coach portados (archivos nuevos, agentes en paralelo, cero deps, cero migraciones):
  - Areas builder: app/coach/settings/areas.tsx + lib/areas.ts (CRUD workout_section_templates, valida @eva/schemas, RLS coach)
  - Funciones: app/coach/settings/funciones.tsx + lib/feature-prefs.ts (preset + master toggle + secciones, coach_feature_prefs upsert; @eva/feature-prefs espejado inline)
  - Modulos: app/coach/settings/modules.tsx + lib/modules-catalog.ts (catalogo read-only de enabled_modules; @eva/module-catalog espejado inline)
  - Recetas: app/coach/recipes.tsx + lib/recipes.ts (CRUD nutrition_recipes + assign + foto bucket recipe-media)
  - Meal-groups: app/coach/meal-groups.tsx + lib/meal-groups.ts (saved_meals/items, macros via lib/nutrition-utils canonico)
- wiring (yo, archivos compartidos): perfil.tsx seccion "Configuracion" → areas/funciones/modulos; nutricion.tsx tab Alimentos → cards Recetas + Grupos.
- GOTCHAS/drift anotados por agentes: @eva/feature-prefs y @eva/module-catalog NO estan en deps de mobile → espejados inline (riesgo drift). recipe-media upload usa sesion coach (no service-role) → confirmar policy de storage en device (si falla, guarda sin imagen). meal-groups persiste unit 'un' vs 'u' web (numericamente igual). Todo standalone coach v1 (no team-scope).
- commit: (siguiente)
- VERIFICAR DEVICE: cada pantalla abre desde su entry; CRUD escribe (areas/funciones/recetas/meal-groups → que no tiren 42501); modulos read-only; recetas foto-upload.

---

## 2026-06-21 — OLA B (workflow 3 agentes, modulos pagos)
- estado: done (tsc exit=0 [2 fix: import @eva/schemas/bodycomp subpath → barrel @eva/schemas] / expo exit=0)
- Movement coach (completo): lib/movement.ts (@eva/calc portado INLINE verbatim — no resuelve desde mobile), app/coach/movement/index.tsx (hub gated + risk band + drafts), [clientId]/index.tsx (reporte + evolucion + historial+delete), [clientId]/new.tsx (wizard 7 patrones, autosave, consentimiento, finalize recomputa). @eva/schemas para Zod.
- Body comp coach (completo): lib/bodycomp.ts (computeIsak Kerr 5C + Heath-Carter + %grasa portado INLINE; @eva/schemas para Zod), app/coach/bodycomp/[clientId].tsx (SegmentedTabs BIA [11 metricas] / ISAK [wizard 4 pasos + preview] + TrendPanels, gated).
- Vistas alumno read-only: lib/movement-data.ts, lib/bodycomp-data.ts, app/alumno/movimiento.tsx (report card + evolucion), app/alumno/bodycomp.tsx (BIA+ISAK summary + tendencia). LEEN columnas persistidas (no recalculan) → cero drift.
- wiring (yo): perfil coach link "Screening de movimiento" gated; detalle alumno fila de botones gated (movement/bodycomp/perfil cardio); perfil alumno seccion "Mi evaluacion" (movimiento+bodycomp).
- GOTCHAS: @eva/calc NO resuelve desde mobile → movement calc portado inline (anti-drift). @eva/schemas/bodycomp subpath NO resuelve, SI el barrel @eva/schemas (export * from './bodycomp'). Standalone coach v1 (sin team consent/audit). Movement evolution = tabla first-vs-last en vez de radar (no hay radar RN primitive). bodycomp requiere weight del alumno.
- commit: (siguiente)
- VERIFICAR DEVICE: coach con modulo → entradas visibles; wizard movement guarda+finaliza (CHECK final_complete: composite/band/consent NOT NULL); bodycomp BIA+ISAK guardan (que no tiren 42501); preview ISAK calcula; vistas alumno muestran data propia o EmptyState.

---

## 2026-06-21 — OLA C (workflow 3 agentes XL, modifican pantallas existentes)
- estado: done (tsc exit=0 PRIMER intento, 0 errores / expo exit=0). Sin wiring (mismas rutas).
- Workout execution polimorfico (alumno): EXTENDIO app/alumno/workout/[planId].tsx preservando offline/optimistic/PR/keep-awake. +lib/workout-exec.ts (logica pura verbatim) +lib/workout-exec-data.ts +components/workout/{HoldTimer,IntervalTimer,Stopwatch}.tsx. Tipos strength/cardio/mobility/roller (effectiveExerciseType), TypedTargetGrid + inputs actual_* por tipo, zonas HR con bpm del perfil (reusa lib/cardio.ts), agrupacion por AREA + superseries. Strength = sin cambios (anti-regresion).
- Nutrition overhaul (alumno): EXTENDIO app/alumno/(tabs)/nutricion.tsx + ~12 libs (sections/micros/exchanges/shopping/intake/notes/recipes-client/recap/swaps) + ~12 componentes (PlatePanel/MicrosPanel/ExchangeMealChips/ExchangeEquivalencesSheet/WeeklyRecapCard/NotesThread/RecipeIdeasSection/OffPlanLogger/ShoppingListView/FoodSwapSheet/NutrientRangeBar/ProportionPlate). Reusa lib/nutrition-utils (macros). Preserva core+offline.
- Builder polimorfico (coach): MODIFICO lib/plan-builder/types.ts (BuilderBlock espeja domain/workout/types), components/coach/BlockEditorSheet.tsx (forms por tipo + interval builder + chips area), app/coach/program-builder.tsx (persist columnas typed + section_template_id, carga areas/tipos/zonas). +lib/workout-exercise-type.ts. Reducer compartido NO tocado.
- GOTCHAS: @eva/calc y domain/* no resuelven desde mobile → portados inline (anti-drift anotado). exchange_groups RLS: web usa service-role; mobile lee bajo sesion alumno → si RLS no expone grupos, degrada fail-closed a vista gramos (verificar policy en device). FEATURE_PREFS flag vive en Edge Config (no accesible mobile) → fail-OPEN (muestra entitled, respeta master _enabled). Timers: beep web → haptics (iOS). Builder: drag-to-area board completo no portado (chip+sheet si); drag por seccion legacy preservado.
- commit: (siguiente)
- VERIFICAR DEVICE (critico, son screens core): (1) workout fuerza NO regresiono; cardio/mobility/roller renderizan grid+inputs+timers correctos; zonas HR con bpm si el alumno tiene perfil cardio. (2) nutricion core intacto; swaps/exchanges/micros/plato/off-plan/notas/recetas/shopping/recap aparecen segun data del coach (exchange chips dependen de RLS exchange_groups). (3) builder: guardar programa con bloque cardio/mobility (columnas typed persisten, no 42501); strength sin cambios.

---

## 2026-06-21 — OLA D (workflow 3 agentes)
- estado: done (tsc exit=0 [2 fix: FoodRow household_* → opcional (rompia meal-groups Ola A); estilos off* faltantes en clients-import] / expo exit=0)
- Nutrition Pro coach: MODIFICO app/coach/nutrition-builder.tsx + lib/nutrition-builder.ts + componentes ExchangeModePanel/ExchangeTargetsEditor/BodyCompGoalsSheet. Modo intercambios (targets por comida + variantes de dia + toggle plan_mode), alergenos (warning al agregar alimento marcado), body-comp goals (Katch/Cunningham), medidas caseras. Reusa lib/nutrition-exchanges. Gramos preservado. PDF equivalencias = follow-up.
- Mi Equipo: app/coach/team.tsx + lib/team.ts (hero+rol, share slug/invite, asientos ring, miembros [roles/transfer/remove], Brand Studio nombre/color/loader; logos avanzados → web). seat_limit read-only.
- Clients import: app/coach/clients-import.tsx + lib/import-clients.ts (wizard 4 pasos CSV + mapeo columnas + preview + tier-gate/max_clients). xlsx = follow-up (dep).
- wiring (yo): perfil "Mi equipo" (gated por pertenencia via getMyTeamOverview); FAB import en clientes → /coach/clients-import.
- commit: (siguiente)
- VERIFICAR DEVICE: nutrition-builder toggle intercambios (plan guardado), alergeno warning, body-comp goals; team (rol/miembros/brand — RLS triggers backstop); import wizard (CSV+mapeo+tier-gate, crea de a uno).

---

## ESTADO GLOBAL (post Ola D)
Cubierto ~todo el screen-level del informe docs/audits/rn-web-parity-2026-06-21.md. Commits en feat/rn-parity-overnight: T1-T4 + Cardio + Ola A (areas/funciones/modulos/recetas/meal-groups) + Ola B (movement/bodycomp/vistas alumno) + Ola C (workout polimorfico/nutrition overhaul/builder polimorfico) + Ola D (nutrition Pro coach/team/import).
PENDIENTE (config/polish, NO screen-gaps): nav registry compartido + Opciones hub + tabs gated + workspace switcher + news bell (chrome polish — nav actual funciona, todo reachable por perfil); Google OAuth (necesita OAuth client config en cloud); iOS universal links (re-agregar associatedDomains rompe build iOS por capability del App ID — accion en Apple Developer); PDF equivalencias nutricion; xlsx import; subscription add-on purchase/reactivate (pagos = web-only). TODO el codigo: tsc 0 + bundle OK por ola; FALTA verificacion en DEVICE + merge a master por PR.
