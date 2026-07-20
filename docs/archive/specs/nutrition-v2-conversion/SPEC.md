# SPEC — Conversión automática de planes de nutrición V1 → V2 (conversión dark)

> Decisiones del CEO (2026-07-17): conversión **automática** ejecutada por el equipo
> (service-role), **cero fricción para coaches** (nada que ejecutar, sin wizard);
> planes convertidos quedan **publicados en dark** (invisibles tras el flag fail-closed)
> + banner informativo descartable al coach; **grandfathering**: el contenido convertido
> preserva lo que el alumno YA ve en V1, los gates Pro aplican a ediciones nuevas, no
> al contenido convertido. Reemplaza al "asistente de conversión coach-driven" del
> roadmap (ESTADO_Y_PENDIENTES.md §Antes de merge).

## Por qué

Deprecar la nutrición V1 del alumno (decisión CEO ③) exige que ningún alumno pierda su
plan al flip. Hoy: 67 planes V1 activos, 62 alumnos, 8 coaches (solo ~5 reales). Sin
conversión, cada coach tendría que recrear sus planes a mano en V2. La conversión es
determinista (los `food_items` V1 ya referencian el MISMO catálogo `foods` que V2), así
que se automatiza con dry-run + reporte de fidelidad revisado por el CEO antes de escribir.

## User stories

- Como **alumno**, el día que mi coach pase a V2 quiero ver mi plan de siempre (mismas
  comidas, mismos alimentos, mismos targets) sin que nadie tenga que rehacerlo.
- Como **coach**, no quiero hacer NADA para migrar: si edito mi plan V1 antes del flip,
  la conversión absorbe mi edición; después del flip veo un aviso de que mi plan fue
  convertido y puedo revisarlo cuando quiera.
- Como **operador (CEO/CLI)**, quiero un dry-run que me muestre plan por plan qué se
  convierte, con qué fidelidad y qué queda para revisión manual, ANTES de escribir nada.

## Criterios de aceptación

1. **Dry-run primero**: `--dry-run` (default) no escribe NADA en V2; produce reporte
   (Markdown + JSON) por coach → plan → fidelidad. `--apply` exige flag explícito.
2. **Fidelidad verificable**: para cada plan convertido, Σ macros derivadas V1
   (`food_items × foods`) == Σ `snapshot_*` de los items V2 (misma fuente, mismo
   redondeo que `plan-persistence.ts` produce hoy). Targets del plan copiados verbatim.
   Conteos: comidas V1 == slots V2 (por variante correspondiente), items V1 == items V2.
3. **Idempotencia y re-sync**: re-ejecutar sin cambios en V1 = no-op (misma
   `publish_idempotency_key`). Si `nutrition_plans.updated_at` avanzó desde la última
   conversión, se genera NUEVA versión V2 que supersede a la anterior (vía RPC canónico).
   Nunca se borra nada.
4. **Cero invención de datos**: ningún macro, alimento, target ni texto que no exista en
   V1. Lo no mapeable queda en el reporte como `no_acarreado` o `manual_required`.
5. **Cero visibilidad prematura**: nada de lo escrito es visible para alumnos/coaches
   fuera del canary (flag fail-closed manda; verificado: autorización DEFINER/RLS es
   independiente del flag, sin leak cross-tenant).
6. **Trazabilidad**: tabla puente `nutrition_v2_conversion_links` (v1↔v2) con estado y
   reporte de fidelidad por plan. Rollback = archivar los planes V2 creados + borrar
   links; V1 nunca se toca (solo lectura).
7. **Publish canónico**: la publicación pasa por `publish_nutrition_plan_v2` (RPC
   vigente), impersonando al coach dueño vía claims en la transacción (patrón de los
   tests RLS del proyecto). CERO lógica de publish duplicada.
8. **Banner coach**: en la ficha V2 del alumno (web coach), si el plan vigente proviene
   de conversión, banner informativo "Plan convertido del sistema anterior el {fecha} —
   revísalo cuando quieras", descartable, sin acciones bloqueantes. Fase 1: solo
   informativo (sin botón regenerar).
9. **Guard endurecido antes de escritura masiva**: el hueco P1#1 del guard anti-forja
   (`VALIDATION_RISKS §0`) — UPDATE que transiciona `idempotency_key` null→not-null
   fuera del allowlist — YA quedó cerrado por la migración T11
   `20260716210000_nutrition_v2_t11_hardening.sql` (su rama UPDATE rechaza con 42501
   `nutrition_v2_intake_requires_rpc` cualquier UPDATE que deje `new.idempotency_key`
   no nulo fuera del allowlist, lo que cubre la promoción null→not-null). No se agrega
   migración de fix duplicada; esta conversión asume el guard ya endurecido.
10. Gates verdes: `pnpm lint && pnpm typecheck && npx vitest run &&
    pnpm check:nutrition-v2-boundaries` + `pnpm --filter @eva/mobile exec tsc --noEmit`.

## Reglas de mapeo (cerradas)

### Selección de planes (fase 1)
- IN: `nutrition_plans` con `is_active = true` y `plan_mode = 'grams'`.
- OUT → reporte `manual_required`: `plan_mode = 'exchanges'` (6 planes, solo cuentas de
  socios y e2e; V2 no tiene modelo de porciones-por-grupo equivalente — convertirlos
  inventaría estructura).
- OUT → reporte `skipped_v2_exists`: alumnos que YA tienen plan V2 activo (canary
  josefit) — V2 ya es fuente de verdad ahí.
- Duplicados (5 alumnos con 2+ planes `is_active`): gana `max(updated_at)`; el resto se
  reporta `skipped_duplicate` (V1 no tiene UNIQUE de activo; bug latente conocido).
- Plantillas (`nutrition_plan_templates`) y recetas/asignaciones: FUERA de fase 1.

### Plan → plan/versión V2
- `strategy = 'structured'` (espejo del V1 grams: franjas + items prescritos, sin
  registro libre — igual que el comportamiento V1 del alumno).
- Targets `daily_calories/protein_g/carbs_g/fats_g` → columnas de targets de
  `nutrition_plan_versions_v2` (nombres exactos: leer migración
  `20260714190000_nutrition_v2_domain.sql`; copiar verbatim, NULL se preserva como NULL).
- `instructions` (38 planes) → campo de notas/instrucciones generales de la versión V2
  si existe; si no existe equivalente, `no_acarreado` en el reporte (NO inventar campo).
- Targets secundarios V1 (`hydration_target_ml`, `steps_target`, `sleep_target_hours`,
  `fasting_target_hours`, `supplement_guidance`, `protocol_notes`): mapear SOLO si la
  versión V2 tiene columna equivalente (investigar en la migración); si no,
  `no_acarreado` por campo en el reporte. `protocol_notes` es Pro en V2: si el plan V1
  lo trae con contenido, acarrear igual (grandfathering).
- `name` del plan → nombre del plan V2.
- `effective_from` al publicar: fecha local Santiago del día de la corrida.
- `publish_idempotency_key = 'v1conv:' || v1_plan_id || ':' || extract(epoch from v1.updated_at)::bigint`.

### Comidas → variantes + slots
Semántica V1 (verificar contra la query del alumno V1 e implementar EXACTO): el alumno
en un día X ve las comidas con `day_of_week IS NULL` MÁS las de `day_of_week = X`.
V2 elige UNA variante por fecha: `day_of_week = extract(dow from date)` con fallback a
`is_default` (helper `nutrition_v2_rederive_day_snapshot`, migración `20260716230000`).

- Plan SIN comidas por día (todas NULL): 1 variante default ("Todos los días",
  `is_default = true`, `day_of_week = null`) con todas las comidas como slots.
- Plan CON comidas por día: variante default = comidas NULL solamente; además una
  variante por cada día que tenga comidas específicas, conteniendo (comidas NULL +
  comidas de ese día), ordenadas por `order_index`. Así cada fecha resuelve exactamente
  lo que V1 mostraba.
- **Mapeo de día — GOTCHA CRÍTICO**: V1 `day_of_week` = 1=Lun…7=Dom; Postgres
  `extract(dow)` = 0=Dom…6=Sáb. Conversión: `v2_dow = v1_dow % 7` (7→0, resto igual).
  Test unitario obligatorio.
- Grandfathering: >1 variante es Pro en V2; los planes convertidos las llevan igual
  (el gate Pro vive en el server action del builder, no en el RPC de publish; documentar).
- Slot: `name` = nombre comida V1; `slot_code` único por variante (derivar estable, ej.
  slugify + índice); `order_index` preservado; `description` V1 no vacía → campo de
  notas del slot (verificar nombre exacto de columna).
- Comidas de texto puro (32, sin `food_items`): slot con la descripción como notas y 0
  items. Verificar que publish lo permite (exige ≥1 franja por versión, no ≥1 item por
  franja); reportar `text_only` por slot.

### Items → items de prescripción V2
- `food_id` → `food_id` (MISMO catálogo; el dedup del 2026-07-17 ya re-apuntó FKs).
  Si el food referenciado no existe (FK rota imposible, pero verificar), `manual_required`.
- `quantity` (INTEGER V1) + `unit` (default 'g') → columnas equivalentes del item V2.
- `snapshot_calories/protein_g/carbs_g/fats_g` derivadas de `foods` con la MISMA
  aritmética/redondeo que usa `plan-persistence.ts` hoy (paridad verificada por test).
- `swap_options` jsonb (57 items en 17 planes): investigar si el modelo de sustitución
  V2 (`substitution_group_id`) permite mapeo semántico limpio; si sí, usarlo; si no,
  preservar como texto en las notas del item ("Alternativas: X, Y, Z") y reportar
  `swaps_as_notes`. NUNCA descartar en silencio.

### Trazabilidad — tabla nueva `nutrition_v2_conversion_links`
Migración aditiva. Columnas: `id uuid pk`, `v1_plan_id uuid UNIQUE NOT NULL`
(FK → nutrition_plans), `v2_plan_id uuid NOT NULL` (FK → nutrition_plans_v2),
`v2_version_id uuid NOT NULL`, `coach_id uuid NOT NULL`, `client_id uuid NOT NULL`,
`converted_at timestamptz NOT NULL default now()`, `last_synced_v1_updated_at
timestamptz NOT NULL`, `status text NOT NULL CHECK (status in
('converted','resynced'))`, `fidelity jsonb NOT NULL default '{}'`.
RLS: SELECT para el coach dueño (`coach_id = auth.uid()`) — alimenta el banner;
INSERT/UPDATE/DELETE solo service-role (revoke a authenticated/anon como el resto de V2).
Los planes saltados NO generan link (viven solo en el reporte del dry-run).

### Ejecución
- Driver: `scripts/nutrition-v2-conversion/convert-v1-plans.ts` (tsx, service-role por
  env; mismo patrón de scripts/seeds existentes). Flags: `--dry-run` (default),
  `--apply`, `--coach <slug>` (filtrar), `--out <dir>` (reporte).
- Mapeo puro en `packages/nutrition-v2/conversion.ts` (sin I/O, testeado con vitest):
  `mapV1PlanToV2Conversion(tree, opts) → ConversionPlanResult` (draft de versión +
  variantes + slots + items + fidelity + skips tipados).
- Publish: dentro de una transacción por plan, impersonar al coach (set de claims JWT
  locales para que `auth.uid()` = coach) y llamar `publish_nutrition_plan_v2` con la
  idempotency key determinista. Inserts previos (plan/versión draft/variantes/slots/
  items) con service-role, espejando el orden de `persistAndPublishDraft`.
- Re-sync: mismo script; para cada link existente con `v1.updated_at >
  last_synced_v1_updated_at`, generar nueva versión draft + publish (supersede
  automático del RPC) + update del link (`status='resynced'`).

## Fuera de alcance (fase 1)
- Plantillas V1, recetas, ciclos, lista de compras (derivable), comentarios, hábitos.
- Historial del alumno: NO SE TOCA (ya expuesto read-only vía `get_nutrition_history_page_v2`).
- Botón "regenerar" en UI del coach (el re-sync es por CLI en fase 1).
- RN: sin cambios (lee V2 por API; el banner es web coach).
- Aplicar migraciones a PROD: fuera de este build — se validan BEGIN/ROLLBACK y se
  aplican con GO explícito del CEO (protocolo aditivo-en-LIVE).

## Riesgos y mitigaciones
- **Drift V1 durante transición** → re-sync idempotente por `updated_at` + corrida final
  el día del flip.
- **Guard UPDATE promotion (P1#1)** → ya cerrado por T11 (`20260716210000`); sin migración de fix duplicada.
- **Doble plan activo V1** → regla max(updated_at) + reporte.
- **Rollback** → `lifecycle_status='archived'` de los V2 creados (por links) + delete
  links; nunca tocar V1.
