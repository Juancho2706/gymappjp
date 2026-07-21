# PLAN — Reemplazos autorizados por el coach (F-02)

## Fases
1. **Backend (hecho)**: migración `20260721150000` (tabla + RLS + grants, aditiva, en prod
   validada). Contrato: `NutritionItemSubstitutionSchema` + `substitutions?` en el item (Zod).
   Persistencia web: id explícito por item + freeze + insert (`buildItemSubstitutionInsertRow`,
   `collectSubstitutionFoodIds`). Read type: `NutritionItemSubstitutionReadSchema` +
   `mapNutritionItemSubstitutionRow` + `NUTRITION_ITEM_SUBSTITUTION_SELECT` (lectura RLS directa).
2. **Fetch + carry-over (server)**: helper que lee los reemplazos de una versión (RLS) y los
   inyecta en el draft al abrir builder/quick-edit → republicar los conserva. Y para el display.
3. **UI coach**: editor de reemplazos por item en el builder (web + RN), reusando el buscador.
4. **UI alumno**: render de reemplazos por item (Today + plan, web + RN), fallback al `notes`
   legado.

## Riesgos
- **Carry-over (data-loss)**: si el quick-edit no inyecta los reemplazos de la versión base,
  republicar los borra. Mitigación: fetch+inject en la hidratación de edición + test.
- **Grant 42501**: mitigado con grants a nivel tabla (verificado: 18 cols SELECT, tabla-level
  INSERT/UPDATE/DELETE).
- **Gate structured/hybrid**: natural (flexible no tiene items) + UI oculta la afordancia.
- **Payload**: cap 8/item + índice `(prescription_item_id, order_index)`.

## Gates
`tsc` web+mobile, vitest (contrato + freeze + carry-over), eslint. QA device (build nativa).
