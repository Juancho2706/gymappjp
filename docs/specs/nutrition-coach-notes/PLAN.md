# PLAN — Notas del coach (franja + grupo)

Referencia: [SPEC](SPEC.md) + artifact `ea0d7728`. Workers Opus, jefe juzga.

1. **N-A (reducer/gramática):** acciones `SET_SLOT_INSTRUCTIONS` / `SET_GROUP_NOTES` en
   `packages/nutrition-v2/editor-state.ts` (si no existen como patch genérico — revisar:
   `UPDATE_SLOT` con patch quizá ya cubre `instructions`); publish payload ya los acarrea.
2. **N-B (editor web):** 📝 en `EditableSlotCard` header + fila de grupo en
   `EditablePortionsCard`; sheet con textarea; tinte con-nota vía `useBrandPrimaryHex`.
3. **N-C (editor RN):** espejo en `QuickEditMode`/`EditableSlotCard` RN.
4. **N-D (alumno):** render en el Hoy web (`c/[coach_slug]/nutrition`) y RN alumno;
   verificar RPC (`get_nutrition_today_v2` — gotcha conocido: no devuelve entries
   retiradas; revisar si expone instructions/notes) y sumar campos si faltan (SELECT
   aditivo).
5. **Gate:** tests reducer + asserts visual (📝 sin solapes, banda visible) + gates.

Ejecución: N-A → N-B ∥ N-C ∥ N-D → juicio. Puede correr en paralelo con el retiro del
par viejo (archivos distintos, salvo `EditableSlotCard` web que NO participa del retiro).
