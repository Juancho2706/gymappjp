# TASKS — bulk-mark de franja

- [x] T1. Helper puro `packages/nutrition-v2/bulk-mark.ts` + `bulk-mark.test.ts` + export en `index.ts`.
- [x] T2. Web logic: `buildBulkPrescribedPayloads` + `buildBulkUndoPayloads` en `nutrition-today.logic.ts`.
- [x] T3. Web actions: `recordSlotIntakeBatchAction` + `voidSlotIntakeBatchAction` en `intake.actions.ts`.
- [x] T4. Web UI: medidor de progreso + control bulk + estados + undo toast + celebración en `TodayExperience.tsx`.
- [x] T5. Web gates: tsc + vitest (helper/logic) + eslint.
- [x] T6. Mobile: aceptar/documentar la divergencia que reusa `submitRecordIntake` y void por item; no se añadió gateway batch.
- [x] T7. Mobile UI: botón + estados + snackbar undo + 1 celebración + offline en `TodaySlotCard` (`apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx`), consumiendo el helper puro.
- [x] T8. Mobile gates: tsc + export Android/iOS.
- [x] T9. PR #157 integrado en `master`; estado canónico reconciliado al sincronizar RN.
