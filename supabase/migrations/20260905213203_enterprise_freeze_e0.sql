-- ============================================================================
-- Enterprise E0 — congelamiento reversible (SDD docs/specs/retiro-starter-y-enterprise, fase E0, D5=A).
-- Gate de la fase (verificaciones V1–V5, informe E4 §7, corridas el 2026-09-05 21:3xZ):
--   V1 = 0 filas de negocio con org_id en las 23 tablas/columnas de tenant verificadas; la única fila
--        de tenant viva es 1 workspace_preferences tipo enterprise_staff (la borra E2.pre).
--   V2 = 0 coaches org_managed.
--   V3 = ACL previa: assign_org_client_to_coach {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--                    bulk_reassign_clients       {postgres=X/postgres,service_role=X/postgres}
--        Trigger coaches_org_managed_guard: tgenabled 'O'.
--   V4 = 0 llamadas a estas RPC en edge_logs (ventana de 24 h) y cero llamadores en código desplegado
--        (assign_org_client_to_coach: solo apps/enterprise, nunca publicada; bulk_reassign_clients: solo el
--        script huérfano apps/web/scripts/enterprise-isolation-test.mjs, borrado en E0).
--   V5 = 76 policies con «org» fotografiadas (md5 f62b9d7b029e89530200289d63c2461a): línea base de E4.
-- Nada del hot path del proxy se toca acá: get_org_branding e is_coach_active_org_member corren en /c/*
-- (proxy.ts:99,1252,1303,1306,1324,1358) y se revocan en E3-bis; get_enterprise_alumno_context corre en
-- /e/* y se revoca en E2-bis, DESPUÉS del deploy de E2 (lección 20260805182248:6-8).
-- Los 6 índices sobre org_id NO se tocan: son cobertura de FK creada por la auditoría 20260617031230 y el
-- advisor unindexed_foreign_keys los volvería a pedir; mueren en E4 con las columnas.
-- bulk_reassign_clients_with_audit y bulk_assign_selected_clients NO se revocan acá: tienen llamador
-- desplegado con service role (app/org/[slug]/_actions/org.actions.ts:814, :861) ⇒ E2-bis.
-- Ensayo tx-rollback (DO … RAISE EXCEPTION) corrido antes de aplicar.
--
-- ROLLBACK:
--   grant execute on function public.assign_org_client_to_coach(uuid, uuid) to authenticated, service_role;
--   grant execute on function public.bulk_reassign_clients(uuid, uuid, uuid) to service_role;
--   alter table public.coaches enable trigger coaches_org_managed_guard;
-- ============================================================================

-- 1. Revoke EXECUTE de las 2 RPC solo-org SIN llamador desplegado.
--    Firmas verificadas contra las migraciones que las crearon:
--      assign_org_client_to_coach → 20260612135000:100-101 · bulk_reassign_clients → 20260521110000:29-30
revoke execute on function public.assign_org_client_to_coach(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.bulk_reassign_clients(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.assign_org_client_to_coach(uuid, uuid) is
  'Enterprise E0 (2026-09-05): sin EXECUTE. Su único llamador era apps/enterprise/lib/org-admin.ts:175, borrado en E1.';
comment on function public.bulk_reassign_clients(uuid, uuid, uuid) is
  'Enterprise E0 (2026-09-05): sin EXECUTE. Sin llamador de producción: su única mención viva era apps/web/scripts/enterprise-isolation-test.mjs:88, borrado en E0.';

-- 2. Apagar el trigger solo-org que corre en CADA alta/edición de coach.
--    Su propio rollback está escrito en 20260608190000:7-9.
alter table public.coaches disable trigger coaches_org_managed_guard;
