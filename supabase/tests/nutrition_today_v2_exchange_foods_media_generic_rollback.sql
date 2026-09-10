-- Smoke del parche por texto del RPC. Verifica sobre la DEFINICION, no sobre una
-- invocacion: get_nutrition_today_v2 es VOLATILE y materializa snapshots del dia
-- (regla citada en apps/web/src/app/coach/clients/[clientId]/nutritionTabV2.logic.ts:206-207),
-- asi que NO se la llama en un test.
--
-- Casos (TASKS W5.2): A) las 4 llaves nuevas · B) generico antes que marca y, entre
-- dos genericos, el que tiene portion_label primero · B1) los genericos curados de
-- PCT sobreviven al cap de 60 · C) la fila del coach gana por owner_rank = 0 ·
-- D) un alimento privado de otro coach sigue sin aparecer.
-- B, C y D corren sobre una CONSULTA EQUIVALENTE al bloque (misma forma que el
-- `select ... into v_exchange_foods` que deja 20260909130000) con un seed sintetico
-- de prefijo f5000000; todo dentro de begin ... rollback, no persiste nada.
--
-- Comando: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_today_v2_exchange_foods_media_generic_rollback.sql
begin;

-- ===== A) La definicion emite las 4 llaves nuevas y conserva los canarios =====
do $$
declare v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  if position('''isGeneric''' in v_def) = 0 then raise exception 'falta isGeneric'; end if;
  if position('''imagePath''' in v_def) = 0 then raise exception 'falta imagePath'; end if;
  if position('''imageVersion''' in v_def) = 0 then raise exception 'falta imageVersion (R-02: sin el no hay cache-busting)'; end if;
  if position('''imageLicense''' in v_def) = 0 then raise exception 'falta imageLicense (S-08: el pie de atribucion es condicional)'; end if;
  if position('public.food_media fm' in v_def) = 0 then raise exception 'falta el lateral de food_media'; end if;
  if position('ranked.is_generic desc' in v_def) = 0 then raise exception 'falta el orden genericos-primero'; end if;
  if position('ranked.portion_label_present desc' in v_def) = 0 then raise exception 'falta el desempate por medida casera'; end if;
  if position('cand.is_generic desc' in v_def) = 0
     or position('cand.portion_label_present desc' in v_def) = 0 then
    raise exception 'el criterio genericos-primero no entro al row_number(): el cap rn <= 60 vuelve a cortar alfabeticamente';
  end if;
  if position('public.exchange_group_foods egf' in v_def) = 0 then raise exception 'canario 20260804091000 roto'; end if;
  if position('media' in v_def) = 0 or position('category' in v_def) = 0 then raise exception 'canario 20260720120000 roto'; end if;
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', '')))
     / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'canario B1 roto: falta el filtro de tenant en alguna rama';
  end if;
  raise notice 'RPC OK: 4 llaves nuevas (isGeneric, imagePath, imageVersion, imageLicense), orden nuevo, 4 canarios vivos';
end $$;

-- El orden que va a ver el alumno, simulado sobre el mismo criterio del RPC.
select f.brand is null as is_generic, egf.portion_label is not null as tiene_medida, f.name
from public.exchange_group_foods egf
join public.foods f on f.id = egf.food_id
where egf.exchange_group_id = '0000e8c1-0000-0000-0000-000000000010'
  and egf.coach_id is null and egf.org_id is null and not egf.is_excluded
order by is_generic desc, tiene_medida desc, f.name
limit 20;
-- Esperado: arriba los genericos con medida casera («Arroz cocido · ¾ taza»),
-- despues los genericos sin medida, y las marcas al final.

-- ===== B1) el caso que mata al bug, sobre PCT REAL =====
-- (~730 candidatos globales, muy por encima del cap de 60). Reproduce el
-- `row_number()` del RPC tal como queda despues del parche y exige que los
-- genericos con medida casera SOBREVIVAN al corte. Con el orden viejo
-- (`owner_rank, name, id`) este assert es rojo.
do $$
declare
  v_group uuid := '0000e8c1-0000-0000-0000-000000000010';  -- PCT
  v_cand int;
  v_gen_en_60 int;
  v_faltan text;
begin
  select count(*) into v_cand
  from public.exchange_group_foods egf
  where egf.exchange_group_id = v_group
    and egf.coach_id is null and egf.org_id is null and not egf.is_excluded;

  with ranked as (
    select f.name,
           (f.brand is null) as is_generic,
           (egf.portion_label is not null) as portion_label_present,
           row_number() over (
             order by 2 /* owner_rank global = 2 */,
                      (f.brand is null) desc,
                      (egf.portion_label is not null) desc,
                      f.name, f.id
           ) as rn
    from public.exchange_group_foods egf
    join public.foods f on f.id = egf.food_id
    where egf.exchange_group_id = v_group
      and egf.coach_id is null and egf.org_id is null and not egf.is_excluded
  )
  select count(*) filter (where is_generic and portion_label_present and rn <= 60),
         string_agg(name, ', ') filter (
           where rn > 60 and is_generic and portion_label_present
             and name ~* '(marraqueta|hallulla|molde|papa|quinoa|arroz)')
    into v_gen_en_60, v_faltan
  from ranked;

  -- N = cuantos genericos con medida casera cargo el script en PCT (§4.6 bloque 1).
  -- El piso es la lista minima obligatoria del OUTLINE §5.3: 5 filas.
  if v_cand > 60 and v_gen_en_60 < 5 then
    raise exception 'B1: solo % genericos con medida casera entraron a los 60 de PCT (candidatos: %)', v_gen_en_60, v_cand;
  end if;
  if v_faltan is not null then
    raise exception 'B1: quedaron fuera del cap genericos curados de PCT: %', v_faltan;
  end if;
  raise notice 'B1 OK: % genericos con medida casera dentro de los 60 de PCT (% candidatos)', v_gen_en_60, v_cand;
end $$;

-- ============ Seed sintetico para B, C y D (como postgres, bypass RLS) ============
-- A1 = el coach del alumno F1. B1 = un coach ajeno. Prefijo f5000000.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
  ('f5000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w5_a1@e.test','x',now(),now(),now(),'{}','{}'),
  ('f5000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w5_b1@e.test','x',now(),now(),now(),'{}','{}'),
  ('f5000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w5_f1@e.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;
insert into public.coaches (id, slug, full_name, brand_name, invite_code) values
  ('f5000000-0000-0000-0000-0000000000a1','w5-a1','W5 A1','W5A1','W5-A1'),
  ('f5000000-0000-0000-0000-0000000000b1','w5-b1','W5 B1','W5B1','W5-B1')
on conflict (id) do nothing;
insert into public.clients (id, coach_id, org_id, team_id, full_name, email) values
  ('f5000000-0000-0000-0000-0000000000f1','f5000000-0000-0000-0000-0000000000a1',null,null,'F1 de A1','w5_f1@e.test')
on conflict (id) do nothing;
insert into public.exchange_groups (id, slug, code, name, coach_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g) values
  ('f5000000-0000-0000-0000-00000000e001','w5-media-grp','ZW5','Grupo W5 media',null,true,70,2,15,0)
on conflict (id) do nothing;
-- d1 marca · d2 generico SIN medida · d3 generico CON medida · d4 la fila del coach ·
-- d5 alimento privado de B1 · d6 alimento global colgado por B1.
-- Los nombres estan elegidos para que el orden ALFABETICO sea el CONTRARIO del
-- esperado: alfabeticamente d1 < d2 < d3, y el orden correcto es d3, d2, d1.
insert into public.foods (id, name, brand, serving_size, calories, protein_g, carbs_g, fats_g, coach_id, org_id) values
  ('f5000000-0000-0000-0000-0000000000d1','W5 AAA con marca','MarcaW5',100,130,3,28,0,null,null),
  ('f5000000-0000-0000-0000-0000000000d2','W5 YYY generico sin medida',null,100,130,3,28,0,null,null),
  ('f5000000-0000-0000-0000-0000000000d3','W5 ZZZ generico con medida',null,100,130,3,28,0,null,null),
  ('f5000000-0000-0000-0000-0000000000d4','W5 000 del coach','MarcaW5',100,130,3,28,0,null,null),
  ('f5000000-0000-0000-0000-0000000000d5','W5 privado de B1',null,100,130,3,28,0,'f5000000-0000-0000-0000-0000000000b1',null),
  ('f5000000-0000-0000-0000-0000000000d6','W5 global colgado por B1',null,100,130,3,28,0,null,null)
on conflict (id) do nothing;
insert into public.exchange_group_foods (exchange_group_id, food_id, coach_id, org_id, portion_label, portion_grams, source) values
  -- B: tres filas globales del catalogo.
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d1',null,null,'1 taza',40,'catalog'),
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d2',null,null,null,40,'catalog'),
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d3',null,null,'¾ taza',40,'catalog'),
  -- C: la global (40 g, sin medida) y ENCIMA la del coach A1 (30 g, con medida).
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d4',null,null,null,40,'catalog'),
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d4','f5000000-0000-0000-0000-0000000000a1',null,'1 pan',30,'coach'),
  -- D: alimento privado de B1 colgado globalmente, y alimento global colgado por B1.
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d5',null,null,'1 taza',40,'catalog'),
  ('f5000000-0000-0000-0000-00000000e001','f5000000-0000-0000-0000-0000000000d6','f5000000-0000-0000-0000-0000000000b1',null,'1 taza',40,'coach');

-- La consulta EQUIVALENTE al bloque que deja 20260909130000, con p_client_id fijo
-- en F1 y v_group_ids en el grupo del seed. NO se invoca el RPC (es VOLATILE).
create temporary view w5_block_rows as
select ranked.exchange_group_id,
       ranked.id as food_id,
       ranked.name,
       ranked.brand,
       ranked.exchange_portion_label,
       ranked.exchange_portion_grams,
       ranked.is_generic,
       ranked.portion_label_present,
       ranked.rn,
       img.object_path as image_path,
       img.version as image_version,
       img.license as image_license
from (
  select cand.id, cand.name, cand.brand, cand.exchange_group_id,
         cand.exchange_portion_label, cand.exchange_portion_grams,
         cand.is_generic, cand.portion_label_present,
         row_number() over (
           partition by cand.exchange_group_id
           order by cand.owner_rank,
                    cand.is_generic desc,
                    cand.portion_label_present desc,
                    cand.name, cand.id
         ) as rn
  from (
    -- Una fila por (grupo, alimento): gana el dueno mas cercano al alumno.
    select distinct on (src.exchange_group_id, src.id)
           src.id, src.name, src.brand, src.exchange_group_id,
           src.exchange_portion_label, src.exchange_portion_grams,
           src.owner_rank, src.is_excluded,
           src.is_generic, src.portion_label_present
    from (
      -- Rama 1: la lista con dueno (exchange_group_foods).
      select f.id, f.name, f.brand,
             egf.exchange_group_id,
             egf.portion_label as exchange_portion_label,
             egf.portion_grams as exchange_portion_grams,
             case
               when egf.coach_id is not null then 0
               when egf.org_id is not null then 1
               else 2
             end as owner_rank,
             egf.is_excluded,
             (f.brand is null) as is_generic,
             (egf.portion_label is not null) as portion_label_present
      from public.exchange_group_foods egf
      join public.foods f on f.id = egf.food_id
      where egf.exchange_group_id = any(array['f5000000-0000-0000-0000-00000000e001'::uuid])
        and (
          (egf.coach_id is null and egf.org_id is null)
          or egf.coach_id = (select cl.coach_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1')
          or (egf.org_id is not null
              and egf.org_id = (select cl.org_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1'))
        )
        and (
          (f.coach_id is null and f.org_id is null)
          or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1')
          or (f.org_id is not null
              and f.org_id = (select cl.org_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1'))
        )
      union all
      -- Rama 2 (LEGACY, sale en F5): las columnas exchange_* del alimento.
      select f.id, f.name, f.brand,
             f.exchange_group_id,
             f.exchange_portion_label, f.exchange_portion_grams,
             3 as owner_rank,
             false as is_excluded,
             (f.brand is null) as is_generic,
             (f.exchange_portion_label is not null) as portion_label_present
      from public.foods f
      where f.exchange_group_id = any(array['f5000000-0000-0000-0000-00000000e001'::uuid])
        and f.exchange_portion_grams is not null
        and (
          (f.coach_id is null and f.org_id is null)
          or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1')
          or (f.org_id is not null
              and f.org_id = (select cl.org_id from public.clients cl where cl.id = 'f5000000-0000-0000-0000-0000000000f1'))
        )
    ) src
    order by src.exchange_group_id, src.id, src.owner_rank
  ) cand
  where not cand.is_excluded
) ranked
join public.exchange_groups eg on eg.id = ranked.exchange_group_id
-- La foto: UNA por alimento, precedencia product_photo > eva_illustration.
left join lateral (
  select fm.object_path, fm.version, fm.license
  from public.food_media fm
  where fm.food_id = ranked.id
  order by fm.is_primary desc,
           case fm.kind
             when 'product_photo' then 0
             when 'eva_illustration' then 1
             else 2
           end,
           fm.updated_at desc
  limit 1
) img on true
where ranked.rn <= 60;

-- ===== B) generico antes que marca; entre genericos, primero el que trae medida =====
do $$
declare v_d1 int; v_d2 int; v_d3 int;
begin
  select rn into v_d1 from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d1';
  select rn into v_d2 from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d2';
  select rn into v_d3 from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d3';
  if v_d1 is null or v_d2 is null or v_d3 is null then
    raise exception 'B FAIL: alguna fila del seed no llego al bloque (d1=%, d2=%, d3=%)', v_d1, v_d2, v_d3;
  end if;
  if not (v_d3 < v_d2) then
    raise exception 'B FAIL: el generico CON medida casera (rn %) no va antes del generico sin medida (rn %)', v_d3, v_d2;
  end if;
  if not (v_d2 < v_d1) then
    raise exception 'B FAIL: el generico (rn %) no va antes de la marca (rn %) — el orden volvio a ser alfabetico', v_d2, v_d1;
  end if;
  raise notice 'B OK: generico+medida (%) < generico (%) < marca (%)', v_d3, v_d2, v_d1;
end $$;

-- ===== C) la fila del coach gana por owner_rank = 0 =====
do $$
declare v_filas int; v_gramos numeric; v_label text; v_rn int;
begin
  select count(*) into v_filas from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d4';
  if v_filas <> 1 then
    raise exception 'C FAIL: el alimento del caso C aparece % veces (el distinct on deberia dejar una)', v_filas;
  end if;
  select exchange_portion_grams, exchange_portion_label, rn
    into v_gramos, v_label, v_rn
  from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d4';
  if v_gramos <> 30 or v_label is distinct from '1 pan' then
    raise exception 'C FAIL: gano la fila global (% g / %) en vez de la del coach (30 g / 1 pan)', v_gramos, v_label;
  end if;
  -- owner_rank es el PRIMER criterio del row_number(): la fila del coach manda
  -- aunque sea una marca y aunque el grupo traiga genericos con medida casera.
  if v_rn <> 1 then
    raise exception 'C FAIL: la fila del coach quedo en rn % — genericos-primero no puede pisar owner_rank = 0', v_rn;
  end if;
  raise notice 'C OK: la fila del coach (30 g / 1 pan) gana y queda en rn 1';
end $$;

-- ===== D) un alimento privado de otro coach sigue sin aparecer (B1) =====
do $$
declare v_privado int; v_colgado int;
begin
  select count(*) into v_privado from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d5';
  if v_privado <> 0 then
    raise exception 'D FAIL: el alumno de A1 ve un alimento privado de B1 (FUGA CROSS-TENANT)';
  end if;
  select count(*) into v_colgado from w5_block_rows where food_id = 'f5000000-0000-0000-0000-0000000000d6';
  if v_colgado <> 0 then
    raise exception 'D FAIL: el alumno de A1 ve una fila de lista colgada por B1 (FUGA CROSS-TENANT)';
  end if;
  -- Y el lateral de la foto no puede reintroducirlos: cuelga de `ranked`, que ya
  -- paso por el filtro de tenant de las dos ramas del union all.
  raise notice 'D OK: ni el alimento privado de B1 ni su fila de lista llegan al alumno de A1';
end $$;

select 'W5.2 ALL PASSED (A, B, B1, C, D)' as resultado;

rollback;
