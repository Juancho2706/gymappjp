-- kg-lb-ejecutor W5 · conversión de datos en bloques `load_unit = 'lb'` (D4 = b, owner 30-09).
--
-- Antes del tren, en un bloque en libras la app guardaba en `weight_kg` el número TECLEADO (libras) y el
-- builder guardaba en `target_weight_kg` el objetivo en libras. Con el tren, `weight_kg` es SIEMPRE kilos
-- y la unidad vive en `workout_logs.weight_unit`; sin convertir, esos bloques mostrarían 190 lb como 418,9 lb.
--
-- NO es una migración: se corre a mano en LIVE (SQL editor / MCP), dentro de una transacción.
--   Parte A (series): idempotente. Respalda y convierte toda serie de un bloque en libras con peso y SIN
--     unidad. Los clientes nuevos (web W3 / RN W4) escriben siempre `weight_unit`, así que tras el deploy
--     una serie sin unidad en un bloque en libras = cliente viejo que tecleó libras ⇒ volver a correr
--     esta parte sirve de barrido post-OTA.
--   Parte B (objetivos del coach): UNA sola vez (si ya hay respaldo de bloques no hace nada): tras el
--     deploy el builder nuevo guarda kilos y no hay forma de distinguirlos.
-- Respaldo: `_bak_kg_lb_20260930_logs` / `_bak_kg_lb_20260930_blocks` (RLS on, sin grants a anon ni
--   authenticated). Reversa: `_POST_DEPLOY_20260930150000_kg_lb_convert_lb_blocks_rollback.sql`.
-- Factor: 1 lb = 0,45359237 kg; se guarda a centésimas (igual que el motor, `weightToKg`).

begin;
set local lock_timeout = '5s';

create table if not exists public._bak_kg_lb_20260930_logs (
  id uuid primary key,
  block_id uuid,
  weight_kg numeric,
  weight_unit text,
  backed_up_at timestamptz not null default now(),
  converted_at timestamptz
);
alter table public._bak_kg_lb_20260930_logs enable row level security;
revoke all on public._bak_kg_lb_20260930_logs from public, anon, authenticated;

create table if not exists public._bak_kg_lb_20260930_blocks (
  id uuid primary key,
  target_weight_kg numeric,
  load_unit text,
  backed_up_at timestamptz not null default now(),
  converted_at timestamptz
);
alter table public._bak_kg_lb_20260930_blocks enable row level security;
revoke all on public._bak_kg_lb_20260930_blocks from public, anon, authenticated;

-- ── Parte A · series (idempotente = barrido post-OTA) ────────────────────────────────────────────────
-- Una fila sin unidad hoy está sin convertir (nunca convertida o devuelta por la reversa): su respaldo
-- se (re)escribe con el valor actual.
insert into public._bak_kg_lb_20260930_logs as k (id, block_id, weight_kg, weight_unit)
select l.id, l.block_id, l.weight_kg, l.weight_unit
from public.workout_logs l
join public.workout_blocks b on b.id = l.block_id
where b.load_unit = 'lb'
  and l.weight_unit is null
  and l.weight_kg is not null
on conflict (id) do update
  set block_id = excluded.block_id,
      weight_kg = excluded.weight_kg,
      weight_unit = excluded.weight_unit,
      backed_up_at = now(),
      converted_at = null;

with conv as (
  update public.workout_logs l
  set weight_kg = round(k.weight_kg * 0.45359237, 2),
      weight_unit = 'lb'
  from public._bak_kg_lb_20260930_logs k
  where k.id = l.id
    and k.converted_at is null
    and l.weight_unit is null
    and l.weight_kg = k.weight_kg
  returning l.id
)
update public._bak_kg_lb_20260930_logs k
set converted_at = now()
from conv
where conv.id = k.id;

-- ── Parte B · objetivos del coach (una sola vez) ──────────────────────────────────────────────────────
insert into public._bak_kg_lb_20260930_blocks (id, target_weight_kg, load_unit)
select b.id, b.target_weight_kg, b.load_unit
from public.workout_blocks b
where b.load_unit = 'lb'
  and b.target_weight_kg is not null
  and not exists (select 1 from public._bak_kg_lb_20260930_blocks)
on conflict (id) do nothing;

with conv as (
  update public.workout_blocks b
  set target_weight_kg = round(k.target_weight_kg * 0.45359237, 2)
  from public._bak_kg_lb_20260930_blocks k
  where k.id = b.id
    and k.converted_at is null
    and b.load_unit = 'lb'
    and b.target_weight_kg = k.target_weight_kg
  returning b.id
)
update public._bak_kg_lb_20260930_blocks k
set converted_at = now()
from conv
where conv.id = k.id;

commit;
