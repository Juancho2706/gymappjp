-- Audit DB 2026-06-16: auth_rls_initplan (118 políticas en 48 tablas).
-- Envuelve auth.uid()/auth.role() PELADOS en (select ...) para que el planner los evalúe UNA vez
-- (InitPlan) en vez de por-fila. Result-identical (verificado pre-apply: 0 logic_mismatches al
-- normalizar ambos lados; post-apply: 0 políticas con auth.* pelado, 242 políticas intactas,
-- auth_rls_initplan 118 -> 0 en advisors). Protege las ya-envueltas (placeholder @@U@@/@@R@@) para
-- no doble-envolver. Idempotente: re-correr no encuentra nada pelado -> loop vacío. Forward-only.
-- NO toca roles/cmd ni los EXISTS / helpers DEFINER (is_org_*, current_user_pool_*) — solo envuelve
-- el token escalar auth.uid()/auth.role().
DO $mig$
DECLARE r record; nq text; nwc text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND ( replace(replace(coalesce(qual,''),'( SELECT auth.uid() AS uid)',''),'( SELECT auth.role() AS role)','') ~ 'auth\.(uid|role)\(\)'
         OR replace(replace(coalesce(with_check,''),'( SELECT auth.uid() AS uid)',''),'( SELECT auth.role() AS role)','') ~ 'auth\.(uid|role)\(\)' )
  LOOP
    nq := r.qual; nwc := r.with_check;
    IF nq IS NOT NULL THEN
      nq := replace(replace(replace(replace(replace(replace(nq,
        '( SELECT auth.uid() AS uid)','@@U@@'),'( SELECT auth.role() AS role)','@@R@@'),
        'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),
        '@@U@@','( SELECT auth.uid() AS uid)'),'@@R@@','( SELECT auth.role() AS role)');
    END IF;
    IF nwc IS NOT NULL THEN
      nwc := replace(replace(replace(replace(replace(replace(nwc,
        '( SELECT auth.uid() AS uid)','@@U@@'),'( SELECT auth.role() AS role)','@@R@@'),
        'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),
        '@@U@@','( SELECT auth.uid() AS uid)'),'@@R@@','( SELECT auth.role() AS role)');
    END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s',
      r.policyname, r.tablename,
      CASE WHEN nq  IS NOT NULL THEN ' USING ('||nq||')' ELSE '' END,
      CASE WHEN nwc IS NOT NULL THEN ' WITH CHECK ('||nwc||')' ELSE '' END);
  END LOOP;
END $mig$;
