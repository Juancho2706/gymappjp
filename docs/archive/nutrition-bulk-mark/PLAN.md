# PLAN — bulk-mark de franja

## Arquitectura
Cero cambios de DB. Se reusa `record_nutrition_intake_v2` (idempotente) y el camino de void
(corrección contribución-cero). La lógica de "qué es elegible" vive en un helper PURO compartido
(`packages/nutrition-v2`) para garantizar paridad exacta web/RN.

## Capas
1. **Contrato/lógica pura** (`packages/nutrition-v2/bulk-mark.ts`):
   - `consumedPrescriptionItemIds(today): Set<string>` — ids de items prescritos con registro activo.
   - `bulkMarkSlotState(today, slot): BulkMarkSlotState` — `{ status, eligible, requiredTotal,
     requiredConsumed, remaining, eligibleKcal }`. `status ∈ 'all-open'|'partial'|'complete'|'none-required'`.
   - Excluye opcionales de "requerido"/"elegible". Testeable sin React ni red.
2. **Web backend** (`_actions/intake.actions.ts`):
   - `recordSlotIntakeBatchAction({ payloads, revalidatePath })` → 1 auth + loop RPC → `{ ok, ids, failed }`.
   - `voidSlotIntakeBatchAction({ payloads, revalidatePath })` → simétrico (undo).
   - `_components/nutrition-today.logic.ts`: `buildBulkPrescribedPayloads(ctx, slot, items)` (reusa
     `buildPrescribedIntakePayload` por item, key fresca por item) y `buildBulkUndoPayloads(ctx, entries)`.
3. **Web UI** (`_components/TodayExperience.tsx` → `PrescribedSection`):
   - Header de cada franja: medidor de progreso (requeridos consumidos / total + kcal restante).
   - Control bulk al pie de los items (thumb-zone), estados del helper, undo por toast (sonner).
   - UNA celebración (sonner success + micro-animación del medidor al completar).
4. **Mobile** (`apps/mobile`): botón en `TodaySlotCard` consumiendo el MISMO helper puro; itera
   `submitRecordIntake` y el runner de void existentes, con 1 celebración, snackbar undo y camino
   offline. No se creó un gateway batch: online conserva N requests por decisión de integración.

## Riesgos y mitigaciones
- Doble-submit → botón `pending`/deshabilitado + refresh + filtro por `consumed` del helper.
- Fallo parcial → informar "quedaron N"; reintento idempotente solo de faltantes.
- Rate-limit mobile (30/min) → N cargos online, acotados por los items de la franja; el estado
  parcial y las keys estables permiten reintentar solo faltantes. Un batch server-side queda como
  optimización futura si la telemetría demuestra que hace falta.
- Doble conteo porciones → el bulk toca SOLO items fijos; nunca `exchangeTargets`.
- Snapshot inmutable → reusar `buildPrescribedIntakePayload` (congela igual que el single).

## Gates
`pnpm --filter @eva/web exec tsc --noEmit`, vitest del helper + logic, eslint de archivos tocados,
`pnpm --filter @eva/mobile exec tsc --noEmit` y export Android/iOS. E2E `alumno-hoy` y QA device
siguen siendo gates de release, no del merge estático.
