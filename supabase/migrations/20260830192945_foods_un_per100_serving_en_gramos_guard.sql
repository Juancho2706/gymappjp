-- ============================================================================
-- Saneo catálogo 30-08 (paso 2/3): candado contra el bug «empanada 4 kcal».
-- Con serving_unit='un' + macros_basis='per_100', el factor de consumo es
-- cantidad*serving_size/100 (private.nutrition_v2_entry_factor y su espejo TS
-- intakeEntryFactor): per_100 + 'un' SOLO es coherente si serving_size son los
-- GRAMOS de la unidad (huevo 58, pan pita 60…). serving_size < 5 con esa
-- combinación produce el 1% de los macros reales (incidente Empanada de Pino,
-- reetiquetada mal por la auditoría 20260807230000 — cota kcal>9*serving_size
-- válida solo para g/ml). Las 4 filas afectadas ya se corrigieron a
-- per_serving (data-fix 30-08, sin migración: solo etiqueta macros_basis).
-- NOT VALID + VALIDATE: el ALTER no escanea la tabla; el VALIDATE toma un lock
-- suave y con 4.659 filas es milisegundos. Pre-check ejecutado: 0 filas violan.
-- APLICADA EN LIVE el 30-08-2026 vía MCP apply_migration (version 20260830192945);
-- este archivo es el espejo en el repo.
-- ROLLBACK: alter table public.foods drop constraint foods_un_per100_serving_en_gramos;
-- ============================================================================
alter table public.foods
  add constraint foods_un_per100_serving_en_gramos
  check (not (serving_unit = 'un' and macros_basis = 'per_100' and serving_size < 5))
  not valid;

alter table public.foods validate constraint foods_un_per100_serving_en_gramos;
