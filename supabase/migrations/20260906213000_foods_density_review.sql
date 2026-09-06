-- ============================================================================
-- EVA Nutricion V2 — W4.3 «Cantidades honestas»: guard de catalogo por DENSIDAD.
-- SPEC: docs/specs/nutrition-cantidades-honestas/SPEC.md §7.3
-- ----------------------------------------------------------------------------
-- Por que existe. En el plan ACTIVO de un alumno hay un «Mix de Vegetales»
-- importado de Open Food Facts con ~500 kcal por 100 g. Fisicamente no existe:
-- una verdura ronda 15-80 kcal/100 g y ni la palta pasa de ~170. Ese dato inflado
-- es una de las fuentes del caso «5.637 kcal en un dia» (SPEC §1): el coach lo
-- elige, se congela en el snapshot del item prescrito y el numero viaja al Hoy del
-- alumno como si fuera verdad. Hasta hoy el catalogo no emitia NINGUNA senal.
--
-- Que hace. Una columna `review_reason` en `public.foods` y un trigger BEFORE que
-- la escribe cuando la fila entra o se edita con densidad implausible. Es un
-- AVISO, no un candado:
--   · NO bloquea el INSERT/UPDATE (quien sabe lo que hace igual guarda);
--   · NO toca las filas existentes — sin backfill y sin default, el ALTER solo
--     agrega metadata al catalogo (columna nullable sin default = sin reescritura
--     de tabla) y el «Mix de Vegetales» queda EXACTAMENTE como esta. Es a
--     proposito: la correccion del catalogo es manual (override del coach o
--     curacion), nunca automatica. La consulta de candidatos vive en
--     docs/operations/RUNBOOK.md, seccion «Catalogo: revision por densidad».
--
-- Regla, hoy una sola:
--   category in ('verdura','fruta') + base per_100 + calories > 150
--     => review_reason = 'density_veg_fruit_gt_150'
--   y si deja de cumplirse Y la razon vigente era esa, se limpia. La razon de otro
--   origen (futuras reglas) NO se pisa: la columna es multi-motivo por contrato.
--
-- Falsos positivos conocidos y aceptados (por eso avisa y no bloquea): fruta
-- deshidratada (pasas ~300, datiles ~280, higos ~250 kcal/100 g), coco seco y
-- productos «de fruta» con azucar agregada. El umbral 150 se eligio por encima de
-- la fruta fresca mas densa (palta ~160 queda justo al borde y se marca: correcto,
-- amerita mirarla) y muy por debajo del ruido de importacion (>400).
--
-- Notas de implementacion:
--   · `coalesce(new.macros_basis, 'per_100')` y `coalesce(new.calories, 0)` son
--     defensivos: hoy ambas columnas son NOT NULL (macros_basis con default
--     'per_100', 20260728120000:51), pero la regla queda escrita como la declara
--     la SPEC y sobrevive a que alguna se relaje.
--   · `category` SI es nullable: `null in (...)` da NULL => no marca. Correcto.
--   · GRANTS: `public.foods` tiene GRANT ALL a nivel de TABLA para anon /
--     authenticated / service_role (baseline:3544-3546), no allowlist por columna.
--     La columna nueva hereda ese UPDATE, asi que NO se agrega
--     `grant update(review_reason)` — no hay nada que agregar y agregarlo seria
--     ampliar superficie. Quien puede escribirla ya esta acotado por la RLS
--     existente (`foods_coach_update` / `foods_write_own`: coach_id = auth.uid();
--     las filas globales con coach_id null no son editables por clientes).
--   · Limitacion declarada: el trigger es `update OF calories, category,
--     macros_basis` (asi lo fija la SPEC), asi que un UPDATE que toque SOLO
--     `review_reason` no lo vuelve a evaluar — un coach podria borrar el aviso de
--     un alimento propio sin corregir el dato. Es un flag consultivo para curacion,
--     no un control de integridad; si algun dia hace falta cerrarlo, alcanza con
--     sumar `review_reason` a la lista de columnas del trigger.
--
-- ROLLBACK (una pasada, en este orden):
--   drop trigger if exists foods_flag_density_review on public.foods;
--   drop function if exists private.foods_flag_density_review();
--   alter table public.foods drop column if exists review_reason;
--   -- (el DROP COLUMN solo cuando ninguna superficie lea la columna; no hay datos
--   --  que perder mas alla de los avisos escritos despues de esta migracion)
-- ============================================================================

-- ── 1) La columna: metadata de curacion, nullable, sin default, sin backfill ──
alter table public.foods
  add column if not exists review_reason text;

comment on column public.foods.review_reason is
  'Motivo por el que esta fila del catalogo amerita revision manual. Lo escribe el '
  'trigger foods_flag_density_review; hoy el unico valor posible es '
  '''density_veg_fruit_gt_150'' (verdura/fruta per_100 con mas de 150 kcal, densidad '
  'implausible: caso «Mix de Vegetales» 500 kcal/100 g de Open Food Facts). NO bloquea '
  'nada y NO se backfilleo: las filas viejas quedan en NULL hasta que alguien las edite. '
  'Consulta de candidatos y criterio de correccion (manual, nunca automatica) en '
  'docs/operations/RUNBOOK.md. SPEC nutrition-cantidades-honestas §7.3 (W4.3).';

-- ── 2) El trigger: avisa, no bloquea ─────────────────────────────────────────
create or replace function private.foods_flag_density_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Densidad implausible para vegetal/fruta expresada por 100 g/ml.
  if new.category in ('verdura', 'fruta')
     and coalesce(new.macros_basis, 'per_100') = 'per_100'
     and coalesce(new.calories, 0) > 150 then
    new.review_reason := 'density_veg_fruit_gt_150';
  elsif new.review_reason = 'density_veg_fruit_gt_150' then
    -- Ya no aplica (bajaron las kcal, cambio la categoria o paso a per_serving):
    -- se limpia SOLO esta razon. Cualquier otro motivo escrito a mano sobrevive.
    new.review_reason := null;
  end if;

  return new;
end;
$fn$;

revoke all on function private.foods_flag_density_review() from public, anon, authenticated;

comment on function private.foods_flag_density_review() is
  'Marca public.foods.review_reason = ''density_veg_fruit_gt_150'' cuando una fila de '
  'categoria verdura/fruta con base per_100 declara mas de 150 kcal, y limpia esa misma '
  'razon cuando deja de aplicar. Consultivo: no rechaza escrituras ni corrige datos. '
  'W4.3, SPEC nutrition-cantidades-honestas §7.3.';

drop trigger if exists foods_flag_density_review on public.foods;
create trigger foods_flag_density_review
before insert or update of calories, category, macros_basis on public.foods
for each row execute function private.foods_flag_density_review();
