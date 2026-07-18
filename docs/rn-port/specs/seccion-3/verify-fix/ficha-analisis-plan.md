# VERIFY/FIX — `ficha-analisis-plan`

Fecha: 2026-07-12

## Estado

Unidad cerrada a nivel código/spec. `Análisis`, `Programa` y sus flujos de
detalle/builder fueron recorridos contra las fuentes web citadas en la spec.
La auditoría final terminó sin P0/P1/P2 de paridad RN accionables.

## Análisis

- Replica PR semanal, fuerza Epley con filtros, radar muscular, desequilibrio,
  tonelaje de siete días e historial de sesiones.
- El radar usa la misma geometría responsive, escala, labels y trazos del web.
- El calendario permite cualquier fecha; el detalle conserva sustituciones,
  prescripción, progresión, RPE/RIR, peso corporal y notas.
- Entreno y Nutrición tienen fecha, loading, error y retry independientes. Las
  claves de día siempre se calculan en Santiago y nunca se pinta un día stale.
- Los RPC analíticos ya no convierten errores en ceros. Standalone/team fallan
  de forma recuperable; enterprise usa fallback RLS y solo falla si también
  falla esa segunda fuente.

## Programa y builder

- Replica card inversa, vigencia, fases, estructura A/B, microciclo, descansos,
  superseries y detalle de ejercicio en `Sheet nativeModal`.
- Builder valida el workspace explícito para cliente, programa, plantilla,
  catálogo de ejercicios y asignación masiva. Standalone/team/enterprise no
  mezclan recursos; respuestas async antiguas se descartan.
- Drafts están aislados por cuenta, workspace y programa concreto. Autosave
  ocurre solo después de una edición real, conserva `durationDays` y se cancela
  al guardar, desmontar o navegar a otro recurso.
- La edición de programas de alumno reconcilia planes/bloques en sitio con el
  mismo helper puro de web, preservando IDs e historial. El control optimista
  por `updated_at` evita pisar cambios de otro coach.
- Reducir un ciclo o volver a semanal conserva los bloques huérfanos en el
  último día, igual que web. Longitud canónica: 1–14 días.
- Plantillas y asignación usan `nativeModal`, scope exacto, búsqueda paginada y
  retry parcial sin duplicar alumnos ya asignados.
- Cada programa asignado con éxito dispara el mismo correo transaccional
  white-label del web mediante un endpoint Bearer server-side. El endpoint
  revalida workspace/programa/alumno y usa `Idempotency-Key` estable por
  programa; un fallo del proveedor no revierte la asignación ya persistida.

## Contratos y DB

- `@eva/workout-engine` es la fuente compartida del reconcile de guardado.
- Zod limita `day_of_week`/`cycle_length` a 14, weekly a 1–7 y cycle a
  `day <= cycle_length`, preservando variantes A/B.
- Migración local `20260712233000_expand_workout_cycle_days_to_14.sql` alinea
  los CHECK de `workout_plans.day_of_week` y
  `workout_programs.cycle_length`. No cambia tipos generados.
- La migración NO se aplicó a producción: debe pasar
  `create_branch → apply_migration → tests/advisors → merge → delete_branch`.

## Seguridad y límites

- RLS sigue siendo el techo; además hay filtros/postfiltros explícitos y
  validación UUID antes de construir filtros PostgREST.
- El bridge de correo no confía en IDs del dispositivo: valida sesión revocada,
  workspace explícito, programa activo reciente, `source_template_id`, alumno
  y asignación enterprise antes de producir el side effect.
- Las limitaciones conocidas del reconcile posicional/multi-call son las mismas
  del web compartido; no constituyen una divergencia RN de esta unidad.
- No se tocó `apps/mobile/app/alumno` ni `components/alumno`.

## Gates

- `pnpm exec tsc --noEmit` mobile — PASS.
- `pnpm exec tsc --noEmit` web — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- Vitest focalizado final — PASS, 15 archivos / 115 tests.
- `git diff --check` y scans de colores/31/árbol alumno — PASS.
- `pnpm exec expo export --platform android` — PASS.
- Smoke device light/dark × EVA/custom — pendiente de build/device.
