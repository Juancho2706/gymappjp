-- Prueba de equivalencia de los conjuntos de nutricion v2 (fase 3 del runbook RLS, 2026-08-05).
-- Compara, para cada usuario real x cada version_id (+ NULL):
--   nutrition_v2_can_read_version  vs  version_id = ANY(nutrition_v2_readable_version_ids())
--   nutrition_v2_can_edit_version  vs  version_id = ANY(nutrition_v2_editable_version_ids())
-- Incluye un fixture tx-local que pasa una version a draft, porque en produccion puede haber
-- 0 drafts y el lado edit saldria vacuo (todo-false pasa aunque el conjunto este roto).
--
-- CRITERIO DE PASO: difs_read = 0, difs_edit = 0, pos_read > 100, pos_edit >= 1.
-- Referencia (2026-08-05): 11.139 comparaciones/lado, 0+0 difs, 152 pos_read, 1 pos_edit.
-- Las funciones escalares originales (can_read_version / can_edit_version) NO se borran:
-- son la referencia de esta prueba.
BEGIN;
SET LOCAL statement_timeout = '300s';

-- fixture: un draft dentro de la tx (elegir cualquier version publicada; se revierte)
UPDATE public.nutrition_plan_versions_v2 SET status='draft'
 WHERE id = (SELECT id FROM public.nutrition_plan_versions_v2 ORDER BY created_at DESC LIMIT 1);

CREATE TEMP TABLE _vids(version_id uuid) ON COMMIT DROP;
INSERT INTO _vids SELECT id FROM public.nutrition_plan_versions_v2 UNION SELECT NULL::uuid;

CREATE TEMP TABLE _d(uid uuid, dr bigint, tr bigint, de bigint, te bigint) ON COMMIT DROP;
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN (SELECT id FROM auth.users) LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u::text, 'role','authenticated')::text, true);
    INSERT INTO _d
    SELECT u,
           count(*) FILTER (WHERE vr IS DISTINCT FROM nr), count(*) FILTER (WHERE vr),
           count(*) FILTER (WHERE ve IS DISTINCT FROM ne), count(*) FILTER (WHERE ve)
    FROM (
      SELECT coalesce(private.nutrition_v2_can_read_version(t.version_id), false) AS vr,
             COALESCE(t.version_id = ANY(ARRAY(SELECT private.nutrition_v2_readable_version_ids())), false) AS nr,
             coalesce(private.nutrition_v2_can_edit_version(t.version_id), false) AS ve,
             COALESCE(t.version_id = ANY(ARRAY(SELECT private.nutrition_v2_editable_version_ids())), false) AS ne
        FROM _vids t
    ) x;
  END LOOP;
END $do$;

SELECT sum(dr) AS difs_read, sum(tr) AS pos_read,
       sum(de) AS difs_edit, sum(te) AS pos_edit,
       count(*) * (SELECT count(*) FROM _vids) AS comparaciones_por_lado
  FROM _d;

ROLLBACK;
