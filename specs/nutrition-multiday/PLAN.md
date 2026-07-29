# PLAN — Multi-dia Nutricion V2

Secuencia (sobre `fix/nutriv2-audit-fixes`, despues de las olas 1-3 de fixes):

1. **FD1 — Web estado + UI** (bloquea al resto): `draft-builder.ts` (`BuilderState.variants[]`, acciones `ADD_VARIANTS/REMOVE_VARIANT/SET_VARIANT_DAY/SET_VARIANT_LABEL/DUPLICATE_VARIANT/SET_VARIANT_TARGETS`, todas las acciones de slot/item con `variantKey`, `assembleDraft` N variantes, autosave v2 con migrador), `portions-state.ts` (claves `variantKey:slotKey`), `builder/page.tsx` (rehidratacion completa), `PlanBuilderClient.tsx` (barra de chips, popover, menu, banner herencia, Revisar por dia, upsell BASE).
2. **FD4 — RN espejo**: `nutrition-v2-builder.ts` + `builder/[clientId].tsx` (chips + sheet).
3. **FD5 — Quick-edit web+RN**: `quick-edit-state.ts` + `QuickEditPlanView.tsx` + `QuickEditMode.tsx` (+ espejo RN de estado si aplica).
4. **FD3 — Alumno + ficha** (independiente, puede ir en paralelo con FD1): badge Hoy + tira Lu-Do (web `page.tsx` alumno + `PlanVariantCard`; RN `index.tsx` alumno; ficha coach web/RN).
5. **Tests** (con cada bloque): assemble N variantes, invariante default unica, dow unico, rehidratacion sin perdida, migrador de draft, porciones con slots homonimos, gate BASE.

Riesgos: refactor de `PlanBuilderClient` (~1.5k LOC) — estado y UI en pasos separados con tests entre medio; autosave versionado obligatorio; no tocar la semantica de publish (RPC/gates ya vigentes).
