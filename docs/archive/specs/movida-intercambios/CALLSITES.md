# CALLSITES — movida-intercambios (T0.3)

Mapa de puntos tocados / consumidores (espejo de `specs/movida-areas/CALLSITES.md`).
Fecha: 2026-06-11.

## Consumidores de `downloadNutritionDayPdf` (fix transversal de marca T5.1)

| Call site | Cambio |
|---|---|
| `apps/web/src/app/c/[coach_slug]/nutrition/_components/NutritionShell.tsx` (`handleDownloadDayPdf`) | ÚNICO consumidor. Ahora pasa `brand: pdfBrand` (resuelto server-side en `page.tsx` vía `pdfBrandFromProxyHeaders`). Omitido ⇒ rama EVA byte-identical. |

`lib/nutrition-day-pdf.ts`: firma extendida con `brand?: PdfBrand` (opcional, default EVA exacto).
Paleta `headerBg`/`accent` ahora derivada de `derivePdfPalette` (`lib/nutrition-pdf-brand.ts`,
unit-tested: rama `poweredByEva` reproduce emerald-500 + slate-900 + footer "Generado con EVA Fitness").

## Puntos de inserción en `PlanBuilder/*` (builder del coach)

| Archivo | Inserción |
|---|---|
| `PlanBuilder/types.ts` | + `ExchangeTargetDraft`, `ExchangeBuilderData` (prop tipada del módulo) |
| `PlanBuilder/PlanBuilder.tsx` | + prop `exchange?`, estado `planMode`/`exchangeTargets`/`dayVariants`/`variantByMealId`, debounce de `saveMealExchangeTargetsAction`, skip de validación "comida vacía" en modo exchanges, `plan_mode` en payload de save, totales derivados al sidebar, `ExchangeModePanel` + `renderMealExtra` |
| `PlanBuilder/MealBlock.tsx` | + props `exchangeMode` (oculta UI de gramos) y `extraContent` (editor de porciones) |
| `PlanBuilder/MealCanvas.tsx` | + pass-through `exchangeMode` / `renderMealExtra` |
| `PlanBuilder/ExchangeTargetsEditor.tsx` | NUEVO — steppers por grupo, chips de color, totales por comida, selector de variante |
| `PlanBuilder/ExchangeModePanel.tsx` | NUEVO — toggle de modo, totales por variante vs objetivo, gestor de variantes, PDF branded |
| `_data/plan-builder-mappers.ts` | SIN cambios (los ids de comida del draft = ids de DB para comidas existentes; `meal-*` para nuevas) |
| `_actions/nutrition-coach.actions.ts` | `upsertClientNutritionPlanJson`: payload acepta `plan_mode` informativo; si el plan YA está en exchanges (verificado en DB), valida con `ExchangesClientPlanSchema` (comidas sin alimentos OK). NO escribe `plan_mode`. |

## Queries del alumno que traen targets

| Archivo | Rol |
|---|---|
| `app/c/[coach_slug]/nutrition/_data/nutrition.queries.ts` | `getActiveNutritionPlan`: + columna `plan_mode` (edición mínima) |
| `app/c/[coach_slug]/nutrition/_data/nutrition-exchanges.queries.ts` | NUEVO — `getStudentExchangeData` → `services/nutrition-exchanges` → repo. Targets/variantes con cliente del alumno (RLS `met_client_select`/`npdv_client_select`); grupos vía `createServiceRoleClient()` acotado a ids del plan + filtro de tenant (patrón F5 áreas) |
| `app/c/[coach_slug]/nutrition/page.tsx` | + bundle exchanges + `pdfBrandFromProxyHeaders(headers())` → props a `NutritionShell` |
| `_components/NutritionShell.tsx` | + chips/sheet/PDF pauta (props opcionales, módulo OFF ⇒ byte-identical) |
| `_components/MealCard.tsx` | + props opcionales `macroOverride` / `exchangeContent` |
| `_components/ExchangeMealChips.tsx` / `ExchangeEquivalencesSheet.tsx` | NUEVOS |

## Dónde se resuelve la marca (server-side SIEMPRE)

| Contexto | Resolución |
|---|---|
| Alumno (`/c`, `/t`, `/e`) | Headers del proxy (`x-coach-brand-name`/`x-coach-primary-color`/`x-coach-logo-url`/`x-coach-subscription-tier`) → `pdfBrandFromProxyHeaders` en el RSC `nutrition/page.tsx`. Free ⇒ EVA. |
| Coach (builder) | `_data/exchange.queries.ts#getCoachPdfBrand` por workspace activo: team ⇒ `teams(name, primary_color, logo_url)`; org ⇒ `organizations(...)`; standalone ⇒ `coaches(brand_name, primary_color, logo_url, subscription_tier)` (free ⇒ EVA). |
| Logo → dataURL | Client-side `loadBrandLogoDataUrl` (fetch→FileReader, fallback inicial+color). |

## Frontera `food_swap_groups`

NO se toca. swap_group = equivalencia visual del modo gramos (`food_items.swap_options`);
exchange_group = unidad de porción con macros de referencia. Comentario en
`infrastructure/db/exchanges.repository.ts` header.
