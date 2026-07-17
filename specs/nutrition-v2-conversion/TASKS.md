# TASKS — Conversión automática V1 → V2

## T1 — Migración `nutrition_v2_conversion_links` (Opus)
- [ ] Tabla + FKs + UNIQUE(v1_plan_id) + CHECK status + RLS (SELECT coach propio) +
      revoke escritura a authenticated/anon + índices (v2_plan_id, client_id).
- [ ] Patrón de las migraciones V2 existentes (idempotente, aditiva, comentarios).
- DoD: sintaxis validada contra el estilo de `20260716*`; sin DROP; sin cambios a tablas existentes.

## T2 — Guard P1#1: YA CERRADO por T11 (sin migración nueva)
- [x] El hueco P1#1 (`nutrition_v2_guard_intake_mutation` promoviendo una fila V1 a
      "V2" forjada vía UPDATE null→not-null) ya lo cierra la migración T11
      `20260716210000_nutrition_v2_t11_hardening.sql` (corre antes; su rama UPDATE
      rechaza con 42501 `nutrition_v2_intake_requires_rpc` todo UPDATE que deje
      `new.idempotency_key` no nulo fuera del allowlist). NO se agrega migración
      duplicada — sería un CREATE OR REPLACE redundante con distinto id de error.

## T3 — Mapeo puro `packages/nutrition-v2/conversion.ts` (Opus)
- [ ] Tipos de entrada V1 (plan/meals/items/foods) + `ConversionPlanResult`.
- [ ] Reglas SPEC: structured, targets verbatim, variantes por day_of_week (dow 7→0),
      fan-out NULL, slots con slot_code estable, items con snapshot macros (paridad
      de redondeo con `plan-persistence.ts` — leerlo y espejar), swaps (mapeo real o
      notas), texto puro, skips tipados (exchanges/duplicado/v2_exists/sin comidas).
- [ ] Export en `packages/nutrition-v2/index.ts`.
- DoD: vitest cubriendo cada regla + el gotcha dow; cero I/O; cero deps de app.

## T4 — Driver `scripts/nutrition-v2-conversion/convert-v1-plans.ts` (Opus)
- [ ] CLI dry-run default / --apply / --coach / --out; service-role por env (patrón
      seeds existentes); NUNCA loguear secrets.
- [ ] Lectura árbol V1 + planes V2 activos existentes (para skip) + links previos
      (para re-sync por updated_at).
- [ ] Apply: tx por plan → inserts orden persistAndPublishDraft → claims de coach →
      RPC publish → upsert link. Idempotency key `v1conv:<id>:<epoch>`.
- [ ] Reporte MD (por coach → plan → fidelity/skip) + JSON gemelo.
- DoD: dry-run sin ninguna escritura (verificable); apply re-ejecutable sin duplicar.

## T5 — Banner coach ficha V2 (Sonnet)
- [ ] Query del link del plan vigente (RLS coach) en la ficha V2 web.
- [ ] Banner descartable (localStorage), copy: "Plan convertido del sistema anterior
      el {fecha} — revísalo cuando quieras". Light/dark. Sin jerga técnica.
- DoD: no rompe boundaries V1/V2; sin fetch extra si no hay link (embebido en query existente si es viable).

## T6 — Verificación adversarial (Opus x3, tras T1-T5)
- [ ] Lente SQL: migraciones vs schema real (columnas exactas de 20260714190000),
      RLS/grants, guard completo.
- [ ] Lente semántica: mapeo vs vista del alumno V1 real (query V1 del alumno leída,
      no asumida) + gotcha dow + fan-out.
- [ ] Lente seguridad/dinero: cero writes en dry-run, impersonación acotada a la tx,
      cero exposición fuera de flag, idempotencia.
- Hallazgos → vuelven al worker de la tarea con feedback concreto.

## T7 — Gates + cierre (orquestador)
- [ ] `pnpm lint && pnpm typecheck && npx vitest run && pnpm check:nutrition-v2-boundaries`
      + `pnpm --filter @eva/mobile exec tsc --noEmit`.
- [ ] Commit + push + PR draft a `rnmobiledenuevo`. Docs: ESTADO_Y_PENDIENTES.md
      actualizado (asistente coach-driven → conversión dark).
