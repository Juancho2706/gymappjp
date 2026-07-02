# Auditoría de paridad RN mobile ↔ web (PWA) — 2026-06-21

> Objetivo: plan para que `apps/mobile` (Expo RN) sea un port 1:1 visual+funcional de `apps/web` (Next.js PWA, fuente de verdad).
> Método: 11 agentes (workflow `rn-web-parity-audit`) leyeron web+mobile screen-by-screen. Resultado crudo: job `wam7ybno8`.

## TL;DR — veredicto

Mobile **NO está abandonado**: el core loop es un port fiel y hasta supera a web en varios puntos. Pero **no es 1:1** — toda la ola de features web posterior a ~2026-06-05 no llegó a mobile. Evidencia git: **~143 commits coach en web vs ~13 en mobile** desde el 05-jun; ramas enteras (movida-areas, cardio, movement, body-comp, nutrition exchanges/recap/allergens, discount-codes, card-change) tienen **cero** commit espejo en mobile.

**3 clusters dominan el gap:**
1. **Módulos de pago** (cardio, movement assessment, body composition, nutrition_exchanges/Pro) — **0% en mobile**, incluido el sistema de entitlements que los gobierna.
2. **Nutrition overhaul** (alumno: swaps, exchanges, micros, plato, off-plan, notas, recetas, lista compras, recap semanal; coach: alérgenos, medidas caseras) — ausente.
3. **Workout execution polimórfico** (cardio/mobility/roller + timers interval/hold/stopwatch + zonas HR + áreas) — mobile solo loguea fuerza.

Más: settings hub (Áreas/Funciones/Módulos/Equipo) salvo Mi Marca = ausente. Subscription = solo lectura mínima.

---

## Lo que YA está 1:1 (no tocar — anti-drift sano)

| Área | Estado | Por qué aguanta |
|---|---|---|
| Coach Dashboard (KPIs/charts/NBA/agenda/actividad) | **high** | KPIs + attention score vienen del motor server compartido (`dashboard.service.ts`) vía `/api/mobile/coach/dashboard` → no pueden divergir |
| Clients list + detalle (Overview/Análisis/Plan/Pagos) | **high** | reusa selectores puros `lib/profile-analytics` + mismos RPCs Postgres |
| Builder workout — camino fuerza | **high** | `lib/plan-builder/reducer.ts` = reducer web **verbatim** |
| Nutrición coach — modo gramos (builder/foods/templates/board) | **high** | fórmula macro canónica + swap_options serialize/parse espejados 1:1 |
| Brand editor (Mi Marca) | **high** (lo supera: HSL picker, QR, share nativo) | mapeo de columnas DB verificado 1:1 |
| Theming white-label + custom loader | **full** | mismo `@eva/brand-kit resolveBrandTheme`; `vars()` ≈ `--theme-primary` |
| Tokens diseño / motion / glass / fuentes / safe-area | **high/full** | `tailwind.config` espeja `globals.css`; motion tokens `@eva/brand-kit` compartidos |
| Check-in alumno, history, push, perfil | **high/full** (los supera: cámara nativa, biometría, keep-awake) | RPCs + `lib/nutrition-utils` compartidos |

---

## Gaps grandes — ordenados por prioridad

Efforts: **S** ~1-2d · **M** ~3-5d · **L** ~1-2sem · **XL** ~3+sem.

### P0 — Estructurales / correctness (bloquean "1:1" de verdad)

| Gap | Web tiene | Mobile | Effort |
|---|---|---|---|
| **Capa de entitlements/módulos** | `entitlements.service` `hasModule`/`assertModule`, `MODULE_KEYS`, kill-switch `EVA_DISABLED_MODULES`, `ModuleOffNotice` | **0 referencias** — ni lee `enabled_modules`/`coach_addons` | **M** (prerequisito de todo módulo pago) |
| **Workout execution polimórfico (alumno)** | tipos strength/cardio/mobility/roller, timers interval/hold/stopwatch, zonas HR personalizadas, agrupación por áreas, técnica video inline | solo fuerza (kg/reps/RPE); 1 rest timer; video por `Linking` externo | **XL** |
| **Builder coach: áreas + tipos polimórficos** | `section_template_id` (áreas dinámicas, drag-to-area, `SET_BLOCK_AREA`) + bloques typed (duration/distance/pace/HR/interval/side_mode/load) | `BuilderBlock` solo campos fuerza; `BlockEditSheet` web 1009 líneas vs mobile 272 | **XL** |
| **Feature-prefs / Funciones** | `@eva/feature-prefs` preset basico/intermedio/pro + master toggle + visibilidad por sección | **no importa el package** → toggles puestos en web ni se editan ni se respetan en mobile | **L** |
| **Alérgenos (seguridad)** | coach marca alergia/intolerancia/disgusto; builder bloquea/avisa comidas en conflicto | ausente — gap de **correctness**, no cosmético | **M** |

### P1 — Módulos de pago (superficie de producto entera ausente)

| Módulo | Web (coach + alumno) | Effort |
|---|---|---|
| **Movement assessment** | hub lista+risk band · wizard 7 patrones tablet-first (autosave/resume/consentimiento) · reporte+evolución+print · vista alumno read-only. Lógica en `@eva/calc` (**compartible**) | hub **M** · wizard **L** · reporte **L** · vista alumno **M** |
| **Body composition** | BIA (~14 métricas) + ISAK 4 pasos (~22 medidas antropométricas) + paneles tendencia · vista alumno. Schemas `@eva/schemas/bodycomp` (**compartible**) | coach **XL** · alumno **M** |
| **Cardio** | calculadora zonas (Tanaka/Karvonen) + pace + plantillas intervalos + editor perfil por-cliente. Lógica en `apps/web/src/domain/cardio` (**NO en packages/** → extraer antes) | hub **M** · editor perfil **S** |
| **Nutrición Pro (nutrition_exchanges)** | exchange targets por comida, variantes de día, toggle gramos↔intercambios, PDF equivalencias branded | **XL** |

### P2 — Nutrition overhaul (alumno + coach)

Ausente en mobile: food **swaps** (lee filas, no aplica), exchange chips/equivalencias, **micros panel**, **plato visual**, **off-plan logger**, **hilo de notas** comida coach↔alumno, **recetas** (`RecipeIdeas`), **lista de compras**, **recap semanal**, **PDF del día**, gating por sección/dominio-off, **medidas caseras** ("120 g (1 taza)"). Mobile cubre solo el core (day nav, anillos macro, completar comida, satisfacción, porción, hábitos, adherencia, racha, cola offline). → **XL** agregado.
Coach side: **Recetas** library (**L**), **Meal-groups** library (**L**).

### P3 — Settings hub + Team + chrome

| Gap | Mobile | Effort |
|---|---|---|
| **Mi Equipo (team)** — brand studio, miembros, asientos, invite, módulos | ausente. `team` es **feature viva permanente**; coach team-managed no gestiona NADA en mobile | **XL** |
| **Áreas del builder** (CRUD) | ausente — el builder mobile **consume** áreas pero no las administra | **M** |
| **Módulos catalog** (ver activos + CTA add-on) | ausente | **M** |
| **Nav registry compartido** | mobile hardcodea `NAV_META`, no importa `coach-nav.ts` → sin tabs gated cardio/movement, sigue con tabs "Mi Marca"+"Suscripción" separados (web ya consolidó en hub "Opciones"), sin colapso "Reactivar" cuando sub bloqueada | **L** |
| Workspace switcher / News bell | ausentes | **M** c/u |

### P4 — Display parity (acciones quedan web-only por money-safety, OK)

| Gap | Nota | Effort |
|---|---|---|
| **Subscription display** | mobile no consume el payload rico `/api/payments/subscription-status` → falta precio/total compuesto, **add-ons activos (incl. "Cortesía EVA")**, tarjeta en archivo (brand+last4), historial de pagos. Acciones (upgrade/card/cancel/reactivate) = web-only **intencional** | **M** |
| **Clients import** | parser `parseClientsCsv` portado 1:1 pero **sin pantalla wireada**; web = wizard 4 pasos Excel + mapeo columnas + tier-gate. Mobile = CSV inline columnas fijas, sin tier-gate | **L** |
| **Exercises coach** | mobile no crea/edita (gated a web) + sin trim de video / filtros "Con video"/"Personalizados" | **L** |
| **Auth alumno branded login** | mobile aplica **color** pero **no** logo + brand_name + welcome_message (header genérico). `welcome_message` ni se trae en el payload `CoachBranding` | **L** |
| **Google OAuth** (login+register coach) | ausente en mobile | **M** |
| **iOS universal links** | `app.json` ios sin `associatedDomains` → deep links solo Android hoy (removido por capability del provisioning, ver CODEX_HANDOFF) | **M** |
| **Macro palette** | mobile usa la paleta VIEJA (naranja/azul/amarillo); web migró a canónica calma (`--color-macro-protein #5E9FD6 / carbs #FFB74D / fats #81C784`) | **M** |

---

## Riesgos sistémicos (causa raíz del drift)

1. **Mobile NO importa `@eva/feature-prefs` ni `@eva/nutrition-engine`** — las dos costuras más propensas a divergir. Funciones y cálculo de adherencia se recomputan ad-hoc → pueden discrepar de web (memoria ya nota que `dashboard.service` calcula macros mal en web también).
2. **`lib/db-compat.ts` shim manual + PostgREST directo** — cada columna/RPC/GRANT nueva en web puede tirar **400 / 42501** en mobile si no se espeja. Aplica el gotcha de CLAUDE.md (column-level GRANT compra-only).
3. **Nav hardcodeado** (`NAV_META`) en vez de `coach-nav.ts` compartido → labels/iconos/gating ya divergen.
4. **`domain/cardio` y `domain/bodycomp` viven en `apps/web/src/domain`, NO en `packages/`** → si mobile los reimplementa, drift garantizado. **Extraer a packages/ ANTES de portar.** (En contraste, `@eva/calc` y `@eva/schemas/bodycomp` SÍ son packages → reusables directo, gran ventaja.)
5. **Lógica duplicada** que ya es 2 fuentes de verdad: filtros/sort/stats de clients-directory, reglas de NBA, `macro-calculator` (Mifflin), `buildMuscleBalance`. Candidatas a promover a `packages/`.

---

## Plan recomendado (secuencia)

**Fase 0 — Costuras compartidas (habilitador, hacer primero):**
- Extraer `domain/cardio` (zones/pace) + `domain/bodycomp` a `packages/`.
- Portar capa entitlements como package compartido (`hasModule` + `MODULE_KEYS` + kill-switch).
- Mobile empieza a consumir `@eva/feature-prefs` + `@eva/nutrition-engine` (mata 2 drifts).
- Promover `coach-nav.ts` a package y manejar tabs Expo + sheet "Más" desde ahí.

**Fase 1 — Correctness/estructura (P0):** workout execution polimórfico (reusa `@eva/calc`/areas/interval/cardio-pace) + builder áreas+typed + Funciones panel + alérgenos.

**Fase 2 — Módulos pagos (P1):** cardio (perfil S → hub M) · movement (hub M → wizard L → reporte L) · body-comp (alumno M → coach XL) · nutrition Pro (XL). Gateados por la capa de entitlements de Fase 0.

**Fase 3 — Nutrition overhaul alumno + recetas/meal-groups (P2).**

**Fase 4 — Team + Áreas/Módulos settings + nav chrome (P3).**

**Fase 5 — Display/cosmético (P4):** subscription read-only rico, import wizard, exercises trim/filtros, branded login alumno, Google OAuth, iOS universal links, paleta macro.

---

## Correcciones a supuestos / memoria

- **Discount codes (cupones):** la UI coach-redeem **NO está en master** (HEAD `099fe4d6` solo trae el motor de precio `computeDiscountedClp` + migración). El `CouponRedeemCard` + ruta `/api/payments/redeem-coupon` están en ramas **sin mergear** (`f75cf70d`/`2964098e`). La memoria `project_coupon_deal_email_list_pending` dice "live PR #33" = intención, no master actual. → paridad mobile de cupones es prematura.
- **Mobile NO está globalmente stale:** trabajado hasta 2026-06-19 (nutrition overhaul Fase 0, tiers plan 04, consolidación menús). El `CODEX_HANDOFF.md` (fechas 06-02/04) sí es doc viejo. El gap es por **feature-waves específicas**, no por abandono.
- **Límites nativos reales (intencionales, documentar):** ícono de app + splash = EVA-only (un solo binario compartido, no per-coach); pagos/checkout/tarjeta = web+MercadoPago only por money-safety.
