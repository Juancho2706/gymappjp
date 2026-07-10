# E8 · Barrido paridad RN — Coach: builder + nutrición + check-ins

Revisor: E8-01. Solo lectura. Referencia = rama móvil web (`md:hidden`) en
`research/04-web-coach-core.md` (builder/programas/ejercicios) y `05-web-coach-resto.md`
(nutrición/check-ins). Veredicto por pantalla: **OK** / **GAP-menor** (cosmético) /
**GAP-mayor** (estructura o funcionalidad ausente).

| Pantalla | Archivo RN | Veredicto | Detalle |
|---|---|---|---|
| Builder de programas (áreas + polimórfico + sheets) | `app/coach/program-builder.tsx` | **OK** | Paridad muy alta. Áreas dinámicas (`buildMobileAreaVMs`, `effectiveAreaKey`, orden por `sort_order`, `setBlockArea`→`section_template_id`), grupos de área con header dot+nombre+conteo+añadir (L639-664), superseries con conector link/unlink + validación misma área (L590-635), A/B (2 instancias `usePlanBuilder`, `switchVariant`/`toggleAb` L508-520), config (estructura/duración weeks·async·calendar_days/fases via `ProgramConfigSheet`+`ProgramPhasesBar`), completitud POR TIPO (`blockIncomplete` L62-75, espejo web), autosave draft + restaurar (L462-472), undo/redo, tour onboarding short/full (L682-711), Modo Simple/Normal, editor polimórfico (`BlockEditorSheet`), plantillas/asignar/balance/preview/print (sheets), swipe de día nativo. Gate cardio por `hasModule('cardio')` L334-335. Persist P-F2 (un plan activo)/P-F3 (org_id)/P-F14 (insert-antes-de-delete). |
| Biblioteca de programas (lista) | `app/coach/(tabs)/builder.tsx` | **GAP-menor** | Hero+stats, search, SegmentedTabs (Todos/Plantillas/En curso), filter pills (Activos/Inactivos/Semanal/Ciclo/Con fases), toggle compacta/cómoda, `ProgramCard`, preview/assign/duplicate/sync/delete, FAB. Falta el **link a "Áreas" (`/coach/settings/areas`)** que la nav móvil web ofrece junto a Ejercicios (hero solo tiene `onExercises`, L266-267). Falta el **orden Recientes/Nombre** (popover) de la web (solo hay filtros, no sort explícito). Ambos cosméticos. |
| Ejercicios + preview/form sheets | `app/coach/(tabs)/ejercicios.tsx` | **OK** | Tabs-stats origen (Todos/Sistema EVA/Míos con conteos), search, chips de músculo ordenados anatómicamente, toggle "Con video" (= YouTube ID válido, 1:1 web L85-87), lista agrupada por músculo (header dot+conteo), `ExercisePreviewSheet` (edit/clone), `ExerciseFormSheet`, gating `canCreate` con `Lock` + alert (L111-118, L163-167). Empty/refresh/loading OK. |
| Hub de Nutrición | `app/coach/(tabs)/nutricion.tsx` | **OK** | 4 tabs (Plantillas/Alumnos/Alimentos/Recetas) con conteos (L183-260), header con link Grupos de comidas + guía + "+Plantilla" (solo clients/templates, L189/218), **upsell "Módulo Pro"→"Mejorar a Pro"** cuando `!canUseNutrition` (L234, `UpsellCard` L1083-1097), board Sincronizados/Personalizados/Sin plan activo (L529-536), asignar plantilla con warning de reemplazo + seleccionar todos (L291-320), deep-link `?tab=` (L97-99), guía synced/custom. |
| Builder de plan de nutrición | `app/coach/nutrition-builder.tsx` | **OK** | Modos template/client-plan (`isTemplate`), objetivos diarios auto/manual (kcal/P/C/G, `macrosManual` L191-195/450-460), objetivos por composición corporal Pro gated `body_composition` (L142/468-479, `BodyCompGoalsSheet`), instrucciones, canvas de comidas, cálculo Mifflin→TDEE→macros (L106-107). Guardado valida ≥1 comida (L399). Minor: no hay toggle "auto-sync desde plantilla" explícito (el estado synced/custom se resuelve por edición, como en web). |
| Nutrición Pro · Intercambios (porciones) | `app/coach/nutrition-builder.tsx` | **OK** | Gate `hasModule('nutrition_exchanges')` + solo plan de alumno (`showExchanges` L148-149, money-safety). `ExchangeModePanel` (toggle gramos↔porciones, variantes, totales) L502-517, `ExchangeTargetsEditor` por comida L624-625, PDF compacto/equivalencias L364-377. 1:1 web A2. |
| Alternativas (swaps) + alérgenos/restricciones | `app/coach/nutrition-builder.tsx` | **OK** | `FoodSwapSheet` + add/update/remove swap (L226-259/672), favoritos del alumno resaltados (L177-180), **restricciones alergia/intolerancia/disgusto** (`getClientFoodRestrictions` L134-186) inyectadas a `FoodSearchSheet` (L667-669). Igual que web, no hay pantalla dedicada de alérgenos: se leen dentro del builder. |
| Recetas | `app/coach/(tabs)/nutricion.tsx` (`RecipesTab`) | **OK** | Banner **"Base"** (badge aqua) + copy "No afectan macros ni adherencia" (L859-862), crear/editar/borrar/compartir como inspiración (`assignRecipeToClients`, L1034-1040), imagen 16:9/placeholder. 1:1 web A1 tab Recetas. |
| Grupos de comidas | `app/coach/meal-groups.tsx` | **GAP-menor** | Editor inline (no Modal, para no chocar portal del `FoodSearchSheet`), lista con nombre/N ingredientes·kcal/MacroPills/chips, crear/editar/borrar (Alert), unidades g·ml·un + qty. Cosmético: chips muestran **4** alimentos +N (L335) vs **3** en web; web usa `confirm()` nativo, RN usa `Alert` (equivalente móvil). |
| Alimentos standalone `/coach/foods` | `app/coach/foods.tsx` | **OK** | Redirect correcto a `/coach/nutricion?tab=foods` (web `/coach/foods` es legacy pre-DS, no se porta; la verdad es el tab del hub). |
| Check-ins (coach) | `app/coach/(tabs)/check-ins.tsx` | **OK (additivo)** | Web NO tiene ruta `/coach/check-ins` (el coach revisa en la ficha). RN añade un **tab agregado** de check-ins recientes de todos los alumnos — mejora móvil, no gap. Contenido espeja `ProfileCheckInSnapshot`: foto(s) con lightbox, peso, energía en estrellas (mapeo 0-10→0-5 L41), notas, **toggle "Marcar como revisado" optimista** (`markCoachCheckInReviewed`/unmark, L189-222). Firma de fotos best-effort, degradación por columnas ausentes (side_photo/reviewed_at). Sin filtro Todos/Por revisar/Revisados (existe en dashboard, no crítico aquí). |

## Resumen

Dominio con paridad **muy alta**. Sin GAP-mayor. Las pantallas centrales pesadas
(program-builder, nutrition-builder con intercambios/swaps/restricciones, ejercicios,
hub de nutrición) están transcritas 1:1 con la rama móvil web, incluyendo gating
(`hasModule` cardio/nutrition_exchanges/body_composition, `canUseNutrition`+upsell),
estados loading/empty/error y tokens DS (sport/ember/warning/success, sin legacy).

Dos GAP-menores cosméticos:
1. **builder.tsx**: falta link a Áreas del builder y orden Recientes/Nombre.
2. **meal-groups.tsx**: chips 4 vs 3 alimentos (trivial).

Nota: check-ins es un tab **additivo** RN (no existe en web); no es gap sino mejora.
