# 4B-02 — Buscador de alimentos RN: scope de workspace/org (P1 enterprise)

Archivos RN: `apps/mobile/lib/nutrition-builder.ts` (+ helper puro extraíble y test).
Disjunto de las demás unidades de la wave.
Referencia web: `nutrition-coach.queries.ts:350-357` (`resolveCoachScope` +
`foodWorkspaceFilter`).

## Hallazgo

`searchFoods`/`listCoachFoods` RN (`nutrition-builder.ts:344-346`) filtran sin considerar
`org_id`: en un workspace enterprise mezclan el catálogo propio del coach con el de la org (y
viceversa), mientras la web resuelve el scope del workspace activo y filtra. Standalone no se ve
afectado. Consumidores vivos RN: `FoodSearchSheet` (quick-edit y meal-groups) y el builder V2.

## Cierre

1. Espejar la semántica web de `foodWorkspaceFilter` en las queries RN (mismo criterio de
   `coach_id`/`org_id` según workspace activo). Investigar primero cómo obtiene RN el workspace
   activo (sesión/entitlements ya plumbeados); si RN no tiene ese contexto disponible, REPORTAR
   en la spec y no inventar plumbing nuevo sin decisión.
2. Si la lógica de filtro es pura, extraerla a helper testeable con test de los 3 casos
   (standalone, enterprise-org, enterprise-personal).
3. Sin cambios de UI: solo capa de datos. La UI nunca autoriza; RLS sigue siendo la barrera.

## Comprobación objetiva

Con un coach enterprise: la búsqueda RN devuelve el mismo conjunto que la web para el mismo
término en el mismo workspace; con coach standalone, cero cambio observable.

## Cierre (2026-07-21)

Aplicado:

- **RN sí tiene plumbing del workspace activo.** `getCoachOrgContext` (`lib/org.ts`) resuelve
  `org_id` desde `session.user.app_metadata.org_id`, y `saveClientPlan`/`duplicatePlanToClient`
  ya lo usan para estampar `org_id`. No hubo que inventar plumbing.
- Helper puro nuevo `apps/mobile/lib/foods-scope.ts` → `foodWorkspaceFilter(coachId, orgId)`,
  espejo 1:1 del web (`nutrition-coach.queries.ts`). Test `tests/mobile-foods-scope.test.ts`
  cubre los 3 casos: enterprise-org (sistema + org), standalone (sistema + propios) y
  fail-closed sin coach/org (solo sistema).
- `searchFoods` (`nutrition-builder.ts`), scope `'all'`: reemplazado el filtro
  `coach_id.is.null,coach_id.eq.<coach>` (ignoraba `org_id`) por `foodWorkspaceFilter`. En
  enterprise ahora devuelve sistema + alimentos de la org (antes faltaban) y deja fuera el
  catálogo personal del coach (igual que la web). El `org_id` se resuelve con un helper local
  liviano `activeOrgId()` (solo `getSession`, sin la query de nombre de org de
  `getCoachOrgContext`) porque `searchFoods` se llama en cada tecla del buscador. Solo se
  resuelve en la rama `'all'`; `'mine'`/`'system'` sin cambios.
- Consumidores cubiertos sin tocar UI: `FoodSearchSheet` (quick-edit + meal-groups) y el
  builder V2 (`(tabs)/nutricion.tsx`), ambos usan `searchFoods` con scope `'all'` por defecto.

No modificado (por diseño, ya espejaban la web):

- `listCoachFoods` = pantalla "Mis alimentos" (editable). La web resuelve esta vista con
  `getFoodLibrary({ mine: true })` = `coach_id.eq.<coach>` puro, SIN filtro de org. RN ya hacía
  `.eq('coach_id', coachId)`, así que coincide 1:1; tocarlo habría divergido de la web. Igual
  para el scope `'mine'` de `searchFoods`.
- Scope `'system'` (`coach_id.is.null`): sin contraparte directa en la web; se dejó como estaba
  para no cambiar comportamiento existente (el spec pide no debilitar filtros).
