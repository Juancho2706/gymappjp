-- Reversion de 20260805040810_archive_gate_set_based_rls.sql (fase 2 del runbook RLS).
-- Restaura las 25 policies directas al gate escalar y despues las 3 de clients explicitas.
-- NO borra las funciones private.student_self_client_id / student_readable_client_ids:
-- son inofensivas sin policies que las usen (la fase 3 de nutricion tambien las referencia;
-- revertir esa primero con nutrition_v2_set_based_rollback.sql si se quiere borrar todo).
-- Correr en una sola transaccion, horario valle, con lock_timeout.
BEGIN;
SET LOCAL lock_timeout = '2s';

DO $$
DECLARE r record; col text;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, p.polname,
           coalesce(pg_get_expr(p.polqual, p.polrelid),
                    pg_get_expr(p.polwithcheck, p.polrelid)) AS expr
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE (coalesce(pg_get_expr(p.polqual,p.polrelid),'')
            || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
           ~ 'student_readable_client_ids'
       AND c.relname <> 'clients'
       AND c.relname NOT LIKE 'nutrition%v2'          -- las de nutricion v2 tienen su propio rollback
  LOOP
    col := (regexp_match(r.expr, '\((\w+) IS NULL'))[1];
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.student_data_read_gate(%I))'
                   ' WITH CHECK (private.student_data_read_gate(%I))',
                   r.polname, r.tbl, col, col);
  END LOOP;
END $$;

-- las tres de clients, explicitas (la rev.1 del runbook no las daba)
ALTER POLICY archive_gate_clients_select ON public.clients
  USING (private.student_data_read_gate(id)
         OR id = (SELECT auth.uid())
         OR coach_id = (SELECT auth.uid()));
ALTER POLICY archive_gate_clients_update ON public.clients
  USING (private.student_data_read_gate(id))
  WITH CHECK (private.student_data_read_gate(id));
ALTER POLICY archive_gate_clients_delete ON public.clients
  USING (private.student_data_read_gate(id));

COMMIT;
