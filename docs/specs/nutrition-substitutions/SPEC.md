# SPEC — Reemplazos autorizados por el coach (F-02) · Nutrición V2

## Problema
El coach no puede definir reemplazos por alimento en V2. El "Alternativas: …" que ve el alumno hoy
es texto congelado en `notes`, relicto de la conversión V1 (69 planes, no editable, solo web).
`substitution_group_id` está muerto.

## Objetivo
El coach elige, por alimento prescrito, alimentos de **reemplazo autorizados**; el alumno los ve
como opciones. **Solo structured/hybrid** (en flexible el alumno ya elige libremente → no aplica;
además flexible no tiene items).

## Decisiones (CEO 2026-07-21)
- **Macros congeladas** al publicar (snapshot, como items/exchange-targets).
- Migración **aditiva** (tabla nueva; cero cambios a funciones/tablas existentes).

## Modelo de datos
Tabla `nutrition_item_substitutions_v2` (espejo de `nutrition_slot_exchange_targets_v2`):
- `version_id` (RLS), `prescription_item_id` (FK cascade), `food_id`/`recipe_id`/`custom_name`
  (≥1), `quantity`/`unit` (null = misma porción), `order_index`, `snapshot_name/brand/macros`.
- RLS: `select` por `can_read_version` (coach del pool O el propio alumno en published/superseded);
  `insert/update/delete` por `can_edit_version` (coach, draft). Grants a **nivel tabla**.
- Cap 8 por item (contrato Zod).

## Lectura (sin tocar hot-path)
El cliente lee directo la tabla RLS-scoped (`.eq('version_id', v)`), mapea con
`mapNutritionItemSubstitutionRow`, y mergea por `prescriptionItemId`. Se usa en:
- **Display alumno Today**: una lista "Puedes reemplazar por: …" por item, en web y RN.
- **Carry-over coach**: al abrir el plan para EDITAR (builder + quick-edit), se fetchean los
  reemplazos de la versión base y se inyectan en el draft, para que republicar NO los pierda
  (misma clase del bug private_notes — carry-over obligatorio).

## Escritura
`persistAndPublishDraft` (web) y el persist del builder RN: tras insertar items (con id explícito),
resuelven server-side los foods de reemplazo, **congelan** el snapshot y hacen insert en la tabla.
`publish_nutrition_plan_v2` y los read-models base quedan intactos; la capa adicional se lee por RLS
y se mergea en los consumidores.

## UI
- **Coach web**: por cada item, afordancia "Reemplazos autorizados" que reusa el buscador de
  alimentos (chips add/remove, máx 8). Visible solo en structured/hybrid.
- **Coach RN**: persistencia, fetch y carry-over están conectados; el editor visual de reemplazos
  sigue diferido y no debe declararse disponible.
- **Alumno Today (web + RN)**: bajo cada item con reemplazos, "Puedes reemplazar por: X, Y"
  (nombre + kcal de referencia). Reemplaza el render del `notes` legado (fallback si no hay
  estructura).
- **Alumno Plan (web + RN)**: integración pendiente; no debe declararse disponible todavía.

## No-objetivos
- No recrear `get_nutrition_today_v2` / `get_nutrition_plan_read_v2` (riesgo hot-path).
- No migrar los 69 textos legados (se conservan como fallback de solo-lectura).
- Sin registro interactivo del swap por el alumno (el enum `substitution` existe; fast-follow).
- El editor coach RN queda como follow-up explícito; no bloquea la lectura alumno ni la
  preservación de reemplazos existentes al republicar desde mobile.
