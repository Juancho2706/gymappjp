-- Reversa de `_POST_DEPLOY_20260930150000_kg_lb_convert_lb_blocks.sql` (kg-lb-ejecutor W5).
-- Devuelve cada fila convertida a su valor respaldado y limpia la marca `converted_at` (volver a correr
-- la conversión la reaplica). OJO: pisa cualquier edición posterior de esas filas (peso de la serie u
-- objetivo del bloque) con el valor previo a la conversión.
-- Los respaldos NO se borran acá; se sueltan aparte cuando el tren quede cerrado.

begin;
set local lock_timeout = '5s';

with r as (
  update public.workout_logs l
  set weight_kg = k.weight_kg,
      weight_unit = k.weight_unit
  from public._bak_kg_lb_20260930_logs k
  where k.id = l.id
    and k.converted_at is not null
  returning l.id
)
update public._bak_kg_lb_20260930_logs k
set converted_at = null
from r
where r.id = k.id;

with r as (
  update public.workout_blocks b
  set target_weight_kg = k.target_weight_kg
  from public._bak_kg_lb_20260930_blocks k
  where k.id = b.id
    and k.converted_at is not null
  returning b.id
)
update public._bak_kg_lb_20260930_blocks k
set converted_at = null
from r
where r.id = k.id;

commit;
