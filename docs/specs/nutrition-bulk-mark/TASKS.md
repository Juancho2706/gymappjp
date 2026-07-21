# TASKS — bulk-mark de franja

- [ ] T1. Helper puro `packages/nutrition-v2/bulk-mark.ts` + `bulk-mark.test.ts` + export en `index.ts`.
- [ ] T2. Web logic: `buildBulkPrescribedPayloads` + `buildBulkVoidPayloads` en `nutrition-today.logic.ts`.
- [ ] T3. Web actions: `recordSlotIntakeBatchAction` + `voidSlotIntakeBatchAction` en `intake.actions.ts`.
- [ ] T4. Web UI: medidor de progreso + control bulk + estados + undo toast + celebración en `TodayExperience.tsx`.
- [ ] T5. Web gates: tsc + vitest (helper/logic) + eslint.
- [ ] T6. Mobile gateway: `record-batch` / `void-batch` en `api/mobile/nutrition-v2/intake/route.ts`.
- [ ] T7. Mobile UI: botón + estados + snackbar undo + 1 celebración + offline en `TodaySlotCard` (`apps/mobile/.../alumno/nutrition-v2/index.tsx`), consumiendo el helper puro.
- [ ] T8. Mobile gates: tsc + expo export (o build worker).
- [ ] T9. PR a master + doc canónica si aplica (MOBILE_PARITY).
