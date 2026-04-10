# Crónica — Rework Workout execution + Check-in (plan maestro)

**Fecha y hora (America/Santiago):** 2026-04-10 13:15 (aprox., sesión de implementación)

## Alcance ejecutado (plan `claudeplans/PLAN-workout-execution-checkin-rework.md`)

### Pasos 1–2
- **Paso 1:** `revalidatePath(\`/coach/clients/${user.id}\`)` añadido en `src/app/c/[coach_slug]/workout/[planId]/actions.ts` tras log de set exitoso.
- **Paso 2:** Migración `supabase/migrations/20260410200000_add_back_photo_url_to_check_ins.sql`; aplicada vía MCP `apply_migration`; tipos `check_ins` actualizados en `src/lib/database.types.ts` (`back_photo_url`).

### Pasos 3–6 (workout)
- **Paso 3:** `page.tsx` — `resolveActiveWeekVariantForDisplay`, query `exerciseMaxes` con `block_id` + exclusión de bloques del plan actual; props a `WorkoutExecutionClient`.
- **Paso 4:** `WorkoutSummaryOverlay.tsx` reescrito (desglose, PRs, volumen por grupo, confetti, `useReducedMotion`, `epleyOneRM`, animaciones).
- **Paso 5:** `WorkoutExecutionClient.tsx` — barra de progreso, badge Semana A/B, headers de sección, bloques completados con check, scroll al siguiente bloque, fechas relativas en historial, overlay con `exerciseMaxes` y `blocks`.
- **Paso 6:** `LogSetForm.tsx` — `motion` en fila y botón, slider RPE opcional post-log, vibración existente conservada.

### Pasos 7–10 (check-in)
- **Paso 7:** `check-in/actions.ts` — schema `back_photo`, upload a bucket `checkins` con path `-back-`, insert `back_photo_url`; `revalidatePath` coach con path concreto.
- **Paso 8:** `check-in/page.tsx` — título/metadata mensual, query directa `lastCheckIn`, header sticky + `pt-safe`.
- **Paso 9:** `check-in/loading.tsx` nuevo.
- **Paso 10:** `CheckInForm.tsx` — wizard 3 pasos, indicadores, compresión dual, animaciones direction-aware, `formatRelativeDate` en banner.

## Verificación automática
- **`npm run build`:** OK (Next.js 16.1.6 / Turbopack).

## Verificación manual (pendiente en dispositivo real)
- Flujo workout: bloque completo, overlay PRs/confetti, tab Training coach actualizado tras log.
- Check-in: 3 pasos, dos fotos, éxito; safe-area iOS; `prefers-reduced-motion` en animaciones relevantes.
