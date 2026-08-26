-- Advisor unindexed_foreign_keys (auditoria 25-08): FKs sin indice en tablas
-- nuevas del embudo. coach_leads tiene 0 filas hoy; los indices son baratos y
-- evitan seq scans al borrar en clients/teams/organizations.
CREATE INDEX IF NOT EXISTS coach_leads_converted_client_id_idx ON public.coach_leads (converted_client_id);
CREATE INDEX IF NOT EXISTS coach_leads_org_id_idx ON public.coach_leads (org_id);
CREATE INDEX IF NOT EXISTS coach_leads_referred_by_client_id_idx ON public.coach_leads (referred_by_client_id);
CREATE INDEX IF NOT EXISTS coach_leads_team_id_idx ON public.coach_leads (team_id);
CREATE INDEX IF NOT EXISTS coach_food_overrides_created_by_idx ON public.coach_food_overrides (created_by);
