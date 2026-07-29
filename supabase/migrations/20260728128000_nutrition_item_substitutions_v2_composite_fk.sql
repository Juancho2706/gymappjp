-- ============================================================================
-- EVA Nutricion V2 — NUT-032: FK compuesta (prescription_item_id, version_id)
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G6): `public.nutrition_item_substitutions_v2`
-- (20260721150000:24-53) declara `version_id uuid not null` SIN ninguna FK — ni simple a
-- `nutrition_plan_versions_v2` ni compuesta con el item — y `prescription_item_id` solo
-- tiene FK a `items(id)`. Sus cuatro policies (:82-105) autorizan EXCLUSIVAMENTE por
-- `version_id`, el campo no validado, y `prescription_item_id` no se valida nunca. O sea:
-- se puede colgar una sustitucion de un item de OTRA version (incluso de otro tenant) bajo
-- una version draft propia.
--
-- Explotabilidad real: BAJA (P2). El SELECT del read model es plano
-- (`packages/nutrition-v2/read-models.ts:136-137`, sin joins a foods ni a items) y todos
-- los consumidores filtran por `version_id` y agrupan por `prescription_item_id`, asi que
-- una fila con item ajeno queda INERTE (no matchea, no se renderiza) y solo devuelve los
-- snapshots que el propio atacante escribio. No hay fuga cross-tenant ni escalada: es
-- integridad referencial / defensa en profundidad.
--
-- El propio dominio ya usa este patron en todos los demas niveles:
--   20260714190000:108-111 (slots -> variants), :140-143 (items -> slots) y
--   20260718140000:57-60 (`nstet_slot_version_fkey`, con el comentario :28-29 —
--   "la FK compuesta impide colar un slot de otra version bajo un version_id editable").
--
-- BLOQUEO PREVIO RESUELTO AQUI: una FK compuesta necesita un UNIQUE en el destino.
-- `nutrition_day_variants_v2` (20260714190000:87) y `nutrition_meal_slots_v2` (:113) ya
-- tienen `unique (id, version_id)`; `nutrition_prescription_items_v2` (:116-150) NO, porque
-- era la hoja del arbol y nunca fue padre de nada hasta F-02. Esta migracion lo agrega.
--
-- CHEQUEO PREVIO (consultivo — read-only, correr en LIVE antes de aplicar; ambos deben dar 0):
--   select count(*) from public.nutrition_item_substitutions_v2 s
--   join public.nutrition_prescription_items_v2 i on i.id = s.prescription_item_id
--   where i.version_id is distinct from s.version_id;
--
--   select count(*) from public.nutrition_item_substitutions_v2 s
--   left join public.nutrition_plan_versions_v2 v on v.id = s.version_id
--   where v.id is null;
-- Si alguno devuelve > 0 la migracion FALLA sola en el `validate constraint` (por eso el
-- chequeo es consultivo y no un guard): en ese caso NO sanear a ciegas, escalar al owner.
--
-- ADITIVA: solo AGREGA un unique y una FK. La FK simple existente
-- (`nutrition_item_substitutions_v2_prescription_item_id_fkey`) se CONSERVA a proposito
-- (el brief sugeria darla de baja; es redundante pero inofensiva, y dejarla evita DDL
-- destructiva sobre una constraint cuyo nombre real solo se puede confirmar en LIVE).
--
-- NOTA DE LOCK: se usa `create unique index` NO concurrente porque `concurrently` no puede
-- correr dentro del bloque transaccional de una migracion. `nutrition_prescription_items_v2`
-- es una tabla del dominio V2 (lanzado en jul-2026): verificar el conteo de filas antes de
-- aplicar; si fuera grande, sacar el indice a una pasada `concurrently` fuera de migracion.
--
-- Indices: `nis_prescription_item_id_idx (prescription_item_id, order_index)`
-- (20260721150000:57-58) ya cubre la leading column de la FK nueva y `nis_version_id_idx`
-- (:59-60) se conserva. No hace falta indice adicional (mismo criterio de portions :63-65).
--
-- ROLLBACK (una pasada):
--   alter table public.nutrition_item_substitutions_v2 drop constraint if exists nis_item_version_fkey;
--   alter table public.nutrition_prescription_items_v2 drop constraint if exists nutrition_prescription_items_v2_id_version_key;
-- ============================================================================

-- ── 1) Unique habilitante en los items (id, version_id) ──────────────────────
do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.nutrition_prescription_items_v2'::regclass
      and conname = 'nutrition_prescription_items_v2_id_version_key'
  ) then
    create unique index if not exists nutrition_prescription_items_v2_id_version_uniq
      on public.nutrition_prescription_items_v2 (id, version_id);

    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_id_version_key
      unique using index nutrition_prescription_items_v2_id_version_uniq;
  end if;
end;
$do$;

comment on constraint nutrition_prescription_items_v2_id_version_key
  on public.nutrition_prescription_items_v2 is
  'Habilita la FK compuesta de nutrition_item_substitutions_v2 (id es PK; version_id se '
  'agrega para poder referenciar el par). NUT-032.';

-- ── 2) FK compuesta en las sustituciones ─────────────────────────────────────
--    NOT VALID + VALIDATE: evita el lock largo del escaneo inicial. El VALIDATE es el que
--    falla ruidosamente si hay filas inconsistentes (ver chequeo previo arriba).
do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.nutrition_item_substitutions_v2'::regclass
      and conname = 'nis_item_version_fkey'
  ) then
    alter table public.nutrition_item_substitutions_v2
      add constraint nis_item_version_fkey
      foreign key (prescription_item_id, version_id)
      references public.nutrition_prescription_items_v2 (id, version_id)
      on delete cascade
      not valid;
  end if;
end;
$do$;

alter table public.nutrition_item_substitutions_v2
  validate constraint nis_item_version_fkey;

comment on constraint nis_item_version_fkey
  on public.nutrition_item_substitutions_v2 is
  'La sustitucion pertenece al MISMO par (item, version) — impide colgar un item de otra '
  'version (o de otro tenant) bajo un version_id editable, que es justo el campo por el que '
  'autorizan las policies. Cubre transitivamente la validez de version_id. NUT-032.';
