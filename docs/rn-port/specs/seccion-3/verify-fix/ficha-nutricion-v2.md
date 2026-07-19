# VERIFY/FIX — `ficha-nutricion-v2` (NutricionTab de la ficha del coach, rehecho contra Nutrición V2 con porciones)

Fecha: 2026-07-18 · Branch: `feat/rn-parity-s4` · Reemplaza a la spec obsoleta
`ficha-nutricion-facturacion.md` (esa spec describía el tab V1 pre-V2; la web actual de la
ficha es Nutrición V2 con porciones).

## 0. Decisión de mapeo (leer primero)

La web tiene DOS superficies distintas para "nutrición del alumno del coach":

1. **Tab embebido en la ficha principal** — `apps/web/src/app/coach/clients/[clientId]/NutritionTabV2.tsx`
   (+ view model puro `nutritionTabV2.logic.ts`). Se monta cuando el server resolvió el canary V2
   (`resolveNutritionTabV2`, `clients/[clientId]/page.tsx:240-289`); con `null` la ficha renderiza
   `NutritionTabB5` (V1) — `ClientProfileDashboard.tsx:487-527`.
2. **Ficha nutricional completa** — `apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx`
   (+ `PortionDayCoverageCard.tsx`, `_quick-edit/*`), a la que el tab enlaza con
   "Abrir ficha nutrición completa" (`NutritionTabV2.tsx:81-88`).

El `NutricionTab` RN vive en la ficha del coach (`apps/mobile/app/coach/cliente/[clientId].tsx:636`),
así que su contraparte web **es el tab (1)**, no la página completa. Rehacer el tab como copia de la
página completa habría duplicado la pantalla RN `app/coach/nutrition-v2/[clientId].tsx` (contraparte
de (2)) y roto la paridad con lo que el coach ve en la ficha web. Por eso:

- El tab RN se rehizo 1:1 contra `NutritionTabV2.tsx` (web tab ↔ RN tab).
- Los bloques de porciones/resumen del día que el pedido lista y que en web viven en la página
  completa (`PortionDayCoverageCard`, card "Hoy") se cerraron **en la pantalla RN de la ficha
  completa**, donde la web los pinta. La "nota privada" ("Nota profesional", web página completa
  `page.tsx:162-173`) ya existía en la pantalla RN completa (`[clientId].tsx:396-405`) — sin cambio.

## 1. Inventario web del tab (variante móvil 360–430 px) y mapeo → RN

Fuente: `apps/web/src/app/coach/clients/[clientId]/NutritionTabV2.tsx` (+ `nutritionTabV2.logic.ts`).
RN: `apps/mobile/components/coach/clientDetail/nutrition/NutritionV2Summary.tsx` (rehecho) +
`apps/mobile/lib/coach-nutrition-v2-tab-logic.ts` (rehecho, espejo del view model web).

| # | Elemento web (archivo:líneas) | Detalle web | RN |
|---|---|---|---|
| 1 | Contenedor `NutritionTabV2.tsx:70` | `section min-w-0 space-y-6` | `View min-w-0 gap-6` ✓ |
| 2 | Header `:71-79` | `flex-col gap-3` en móvil (`sm:flex-row` no aplica); eyebrow `text-[10px] font-black uppercase tracking-widest text-muted` "Nutrición · V2"; h2 `mt-1 font-display text-xl font-bold text-strong` "Ficha nutricional" | ✓ copy verbatim; eyebrow `font-sans-extra text-[10px] uppercase tracking-[1px] text-text-muted` (adaptación §3.1) |
| 3 | Acción "Abrir ficha nutrición completa" `:81-88` | `min-h-11 gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong hover:bg-surface-sunken` + `ArrowUpRight h-4 w-4`; `PendingNavLink` con spinner "Abriendo ficha…" | ✓ Pressable; pressed ⇒ `bg-surface-sunken` (hover→press); navega a `/coach/nutrition-v2/[clientId]` RN; sin estado pending (adaptación §3.2) |
| 4 | CTA builder `:89-96` + label `nutritionTabV2.logic.ts:158` | `min-h-11 gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white hover:bg-ember-600` + `Plus h-4 w-4`; label `hasPlan ? 'Nueva versión' : 'Crear plan'` (`hasPlan = detail.plan.plan !== null`, logic:120) | ✓ `EmberCta`: pressed ⇒ `bg-ember-600`; misma regla de label en el mapper espejo; navega a `/coach/nutrition-v2/builder/[clientId]` (ruta expo-router real, §3.3) |
| 5 | Empty state `:100-115` | `NutritionStatePanel` título "Sin plan V2 vigente", descripción "Este alumno todavía no tiene una versión publicada de su plan de nutrición. Crea la primera para ver metas, franjas y adherencia.", icon `empty`, acción "Crear plan" ember. Gobernado por `hasActivePlan = today.plan !== null` (logic:121-122) | ✓ copy verbatim; misma señal `hasActivePlan`; `illustration="sin-plan"` es web-only (adaptación de kit ya establecida: el panel RN no tiene ilustraciones) |
| 6 | Badges `:118-127` | `flex flex-wrap items-center gap-2`: `StrategyBadge(plan.strategy)` + `PlanVersionBadge(version, status, effectiveLabel='desde {effectiveFromLabel}')`; `effectiveFromLabel` es-CL "15 jul 2026" (`formatLocalDateEsCl`, logic:100-109) | ✓ mismos kits RN; `formatLocalDateEsCl` copiado 1:1 al mapper RN |
| 7 | `MacroBudget` `:129-132` | kcal consumidas/target + barras P (ember-500) / C (sport-500) / G (aqua-500) — kit compartido | ✓ kit RN (`NutritionV2Kit.tsx:190-270`, mismas rampas) |
| 8 | Card "Plan vigente" `:135-148` | `Utensils h-4 w-4 text-ember-600 dark:text-ember-300`; h3 `font-display text-base font-semibold text-strong`; nombre `mt-2 text-sm font-medium text-strong` (fallback "Plan de nutrición"); notas `mt-2 text-sm leading-6 text-body` (fallback "Sin indicaciones visibles para el alumno.") | ✓ 1:1, `Utensils size={16} className="text-ember-600 dark:text-ember-300"` |
| 9 | Card "Hoy" `:149-161` | "N registro(s) · N franja(s)" `text-sm text-muted`; "**X kcal** restantes según el snapshot del día." (kcal `font-semibold text-strong`, `Math.round(remainingCalories)`; remaining del read model con fallback target−consumed, logic:130-133) | ✓ 1:1 con pluralización idéntica |
| 10 | Grid de cards `:134` | `grid gap-4 lg:grid-cols-2` ⇒ una columna en móvil | ✓ `View gap-4` |
| 11 | "Últimos días" `:164-196` | h3 `mb-3 font-display text-lg font-semibold`; sin addon Pro ⇒ chip-link `border-border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted` con `LockKeyhole h-3.5 w-3.5 text-ember-600 dark:text-ember-300` "Histórico completo con Nutrición Pro" → `/coach/subscription` (logic:80); vacío ⇒ `NutritionCard tone="neutral"` "Aún no hay días registrados en la ventana visible."; cards por día: label es-CL `font-semibold text-strong` + "N kcal · N registro(s)" `mt-1 text-sm text-muted` (`Math.round`) | ✓ 1:1; grid `sm:grid-cols-2` colapsa a columna `gap-3` en móvil; push interno a `/coach/subscription` (patrón `settings.tsx:305`) |
| 12 | Recorte historial sin Pro (`clients/[clientId]/page.tsx:268-275`) | server aplica `filterHistoryDaysToBaseWindow` (~30 d) y `showHistoryUpgradeCta=!nutritionProEnabled` | ✓ misma función (`lib/nutrition-v2-pro.ts:38`) client-side + `useEntitlements().hasModule('nutrition_exchanges')` (§3.4) |
| 13 | Gating V1/V2 (`page.tsx:240-289`, `ClientProfileDashboard.tsx:487-527`) | canary/flag + lectura scoped OK ⇒ tab V2; cualquier fallo ⇒ `NutritionTabB5` V1 intacto | ✓ `NutricionTab.tsx:796-809`: `useCoachNutritionV2Detail` (flag OR canary por alumno, scope fail-closed, cache scoped, fail-open a V1) — sin cambios de gating |

Eliminado del RN (no existe en web): el CTA "Editar / asignar plan" que abría el builder **V1**
(`/coach/nutrition-builder`) desde el resumen V2 — las acciones del tab web son exactamente las
dos del header (#3 y #4). `onEditNutrition` sigue vivo solo en el branch V1.

## 2. Bloques de la ficha completa cerrados en esta unidad

Pantalla RN: `apps/mobile/app/coach/nutrition-v2/[clientId].tsx`.

### 2.1 `PortionDayCoverageCard` (nuevo, porciones read-only)

Web: `coach/nutrition-v2/[clientId]/PortionDayCoverageCard.tsx` montado bajo los macros del día
(`page.tsx:260-263`). RN nuevo: `apps/mobile/components/nutrition-v2/PortionDayCoverageCard.tsx`,
montado en la misma posición (tras `MacroBudget`, antes de las cards).

- Fuente de datos idéntica: `detail.today.dayCoverage` del read model
  (`packages/nutrition-v2/read-models.ts:188-196,245`), cero cálculo nuevo en el coach.
- Filtra `prescribed > 0`; sin filas ⇒ no renderiza nada (web :27-28, Q1 del SPEC).
- Título `PORTIONS_COPY.coach.dayCoverage` ("Porciones") y nota
  `PORTIONS_COPY.coach.derivedNote` — copy canónico compartido
  (`apps/mobile/lib/nutrition-portions-copy.ts:77-81`, espejo del web).
- Chip por grupo (web :41-76): `rounded-pill border px-2.5 py-1.5`; dot de identidad 20 px con
  `exchangeGroupColor({color, sortOrder})` de `@eva/nutrition-engine` (mismo engine que web :56);
  contador `n/N` `text-xs font-semibold` tabular-nums con coma es-CL
  (`formatPortionsCl` = redondeo a 1 decimal + coma, igual que `formatPortionsEs` web :8-10 sobre
  `Math.round(x*10)/10`); check 14 px al completar sin exceso; badge `+n` por exceso.
- **Tokens**: web usa paleta cruda Tailwind `emerald-*`/`amber-*`. El DS móvil no expone esas
  rampas; se mapean a las rampas fijas del contrato — completo ⇒ `success`
  (`border-success-500/30 bg-success-500/10 text-success-700`, check `text-success-600`), exceso ⇒
  `warning` (`border-warning-500/40 bg-warning-500/10 text-warning-700`). Es el MISMO mapeo ya
  establecido en el lado alumno (`PortionChip.tsx:172-182`, `PortionDayCoverageRow.tsx:64-70`) y en
  la pill "Historial anterior" de esta misma pantalla (`[clientId].tsx:434-435`). Cero literales
  nuevos.

### 2.2 Card "Hoy" (faltaba en la pantalla RN completa)

Web `page.tsx:273-281`: "N registro(s) · N franjas" + "X kcal restantes segun el snapshot del dia."
Agregada tras la card "Plan vigente" (mismo orden del grid web :265-282). Copy verbatim del web,
**incluida la ortografía "segun/dia" sin tilde del original** (regla: web manda aunque parezca
typo; el tab de la ficha sí escribe "según el snapshot del día" con tildes y así se portó en #9).

### 2.3 Ya presente (verificado, sin cambio)

- "Nota profesional" (web `page.tsx:162-173` aside) → `[clientId].tsx:396-405` (candado +
  "El alumno no recibe este contenido.").
- Aviso de lag del plan de hoy, badges, MacroBudget, "Estructura prescrita", "Últimos días" con
  legacy y banner Pro, quick-edit in-place y CTA "Rehacer con el asistente".

## 3. Adaptaciones nativas (justificación escrita)

1. **Eyebrow `font-black`/`tracking-widest`** — web pinta el eyebrow con la sans a peso 900 y
   tracking 0.1em. El catálogo de caras cargadas en RN llega a Hanken 800
   (`font-sans-extra`, `tailwind.config.js:178`) y `tracking-widest` a 10 px = 1 px ⇒
   `tracking-[1px]` (precedente documentado en `IntervalTimer.tsx:302-309`).
2. **`PendingNavLink` no se replica** — el spinner "Abriendo ficha…/Abriendo builder…"
   (`NutritionTabV2.tsx:33-66`) es un fix de latencia RSC (QA CEO 2026-07-17). En expo-router la
   transición es inmediata y el destino pinta su propio skeleton (`NutritionSkeleton`), así que el
   estado intermedio no existe que cubrir. `hover:*` ⇒ estado `pressed` de `Pressable`.
3. **Rutas** — `builderHref` RN es `/coach/nutrition-v2/builder/[clientId]` (segmento real del
   árbol móvil, `app/coach/nutrition-v2/builder/[clientId].tsx:109-110` lee el path param), en vez
   del Next `/coach/nutrition-v2/[clientId]/builder`. `historyUpgradeHref` `/coach/subscription`
   resuelve a la tab nativa `(tabs)/subscription` (patrón `settings.tsx:305`).
4. **Recorte Pro client-side** — web lo hace en RSC; RN aplica la MISMA
   `filterHistoryDaysToBaseWindow` + `hasModule('nutrition_exchanges')` en el componente (patrón
   idéntico al de la pantalla completa `[clientId].tsx:165-170`).
5. **Aviso offline "Mostrando la última copia disponible."** — solo RN: el detail puede venir de
   cache stale (`readNutritionV2Cache allowStale`), estado que la web (RSC, sin cache local) no
   tiene. Se conserva del baseline.
6. **`illustration="sin-plan"`** del `NutritionStatePanel` web: el panel del kit RN no implementa
   ilustraciones (adaptación de kit preexistente en todas las superficies V2 móviles); icon
   `empty` sí es 1:1.

## 4. Verificación

- `pnpm exec tsc --noEmit` en `apps/mobile`: **verde** (2026-07-18).
- Lectura comparativa elemento por elemento web↔RN: tabla §1 (tab) y §2 (página completa).
- Copy verbatim revisado contra `NutritionTabV2.tsx` / `page.tsx` / `nutrition-portions-copy.ts`.
- Light/dark: todos los estilos usan tokens NativeWind theme-aware (`ember-600` flipea vía
  `global.css` dark scope :177; `dark:text-ember-300` replica el `dark:` explícito del web).
- White-label: nutrición usa `ember` exactamente donde el web lo usa (CTAs e iconos del tab,
  `NutritionTabV2.tsx:91,109,137,173`); `StrategyBadge`/`MacroBudget` conservan los tokens del kit
  compartido (`primary`/`ember`/`sport`/`aqua`, espejo del kit web). Cero valores crudos nuevos.

## 5. Fuera de esta unidad (hallazgos anotados para la unidad de la ficha completa / hub)

- `nutritionV2BuilderHref` (`apps/mobile/lib/nutrition-v2-hub.ts:84-86`) genera
  `/coach/nutrition-v2/builder?clientId=…`, que en el árbol actual matchea el segmento dinámico
  `[clientId]` con el literal "builder" (la helper es anterior a que existiera
  `builder/[clientId].tsx`). La usan el hub (`index.tsx:332`) y la ficha completa
  (`[clientId].tsx:222`). El tab NO la usa (navega al segmento real). Revisar en la unidad del hub.
- Banner Pro de la ficha completa RN navega a `/coach/modules` (`[clientId].tsx:413`); web usa
  `NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'` (`_lib/nutrition-pro.ts:38`). No se tocó por
  ser decisión de la unidad de esa pantalla.
- Pendientes de paridad de la ficha completa RN vs `page.tsx` (no del tab): banner
  `?published=1` (web :175-180), `ConvertedPlanBanner` (:206-208), "Asignar a otros alumnos"
  (:219-229), zona "Archivar plan" (:388-401), y fondo del slot de estructura
  (`bg-surface-card` web :301 vs `bg-surface-app` RN :366).

## 6. Archivos tocados

- `apps/mobile/lib/coach-nutrition-v2-tab-logic.ts` — reescrito: espejo 1:1 de
  `nutritionTabV2.logic.ts` (view model, `formatLocalDateEsCl`, labels y fallbacks).
- `apps/mobile/components/coach/clientDetail/nutrition/NutritionV2Summary.tsx` — tab rehecho
  contra `NutritionTabV2.tsx` (hook de datos sin cambios).
- `apps/mobile/components/coach/clientDetail/NutricionTab.tsx` — branch V2 sin `onEditNutrition`;
  comentario del swap actualizado a la evidencia web real.
- `apps/mobile/components/nutrition-v2/PortionDayCoverageCard.tsx` — nuevo (espejo web).
- `apps/mobile/components/nutrition-v2/index.ts` — export del card.
- `apps/mobile/app/coach/nutrition-v2/[clientId].tsx` — + `PortionDayCoverageCard` bajo
  `MacroBudget` y + card "Hoy" (orden del grid web).
