-- Migration 1 — TEAM FOUNDATION (aditiva, idempotente, forward-only)
-- Modelo "team": pool plano full-access, AISLADO de enterprise (tablas propias).
-- Aplicada a prod 2026-06-09 via MCP apply_migration. Spec: specs/movida-team/.
-- Validada: 13/13 tests RLS+triggers (ver tests/team/), get_advisors sin ERRORs.
--
-- DEUDA documentada: la policy existente clients_standalone_coach_manage
-- (org_id IS NULL AND coach_id=auth.uid()) deja al coach CREADOR de un cliente de
-- pool verlo aunque deje de ser miembro del team. Se endurece en la migracion de
-- policies siguiente; mientras, al mover un cliente a un team setear coach_id=NULL
-- o aceptar el solapamiento benigno. Baja de alumno de pool = soft delete.

-- (1) teams
CREATE TABLE IF NOT EXISTS public.teams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    slug            text NOT NULL,
    owner_coach_id  uuid NOT NULL REFERENCES public.coaches(id) ON DELETE RESTRICT,
    logo_url        text,
    primary_color   text,
    seat_limit      integer NOT NULL DEFAULT 5,
    enabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_uidx ON public.teams (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS teams_owner_coach_idx ON public.teams (owner_coach_id) WHERE deleted_at IS NULL;

-- (2) team_members
CREATE TABLE IF NOT EXISTS public.team_members (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    coach_id     uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    display_role text,
    can_manage   boolean NOT NULL DEFAULT false,
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
    joined_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    CONSTRAINT team_members_team_coach_uniq UNIQUE (team_id, coach_id)
);
CREATE INDEX IF NOT EXISTS team_members_team_idx ON public.team_members (team_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS team_members_coach_idx ON public.team_members (coach_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS team_members_active_lookup_idx ON public.team_members (team_id, coach_id) WHERE deleted_at IS NULL AND status = 'active';

-- (3) clients.team_id
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS team_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_team_id_fkey') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS clients_team_id_idx ON public.clients (team_id) WHERE team_id IS NOT NULL;

-- (4) client_memberships: team_id + ensanchar checks (scope 'team')
ALTER TABLE public.client_memberships ADD COLUMN IF NOT EXISTS team_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_memberships_team_id_fkey') THEN
    ALTER TABLE public.client_memberships ADD CONSTRAINT client_memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.client_memberships
    WHERE NOT (
      (scope = 'standalone' AND org_id IS NULL     AND team_id IS NULL)
      OR (scope = 'enterprise' AND org_id IS NOT NULL AND team_id IS NULL)
      OR (scope = 'team'       AND team_id IS NOT NULL AND org_id IS NULL)
    )
  ) THEN
    RAISE EXCEPTION 'client_memberships tiene filas incompatibles con el nuevo composite check; limpiar antes de migrar (abortando expand)';
  END IF;
END $$;
ALTER TABLE public.client_memberships DROP CONSTRAINT IF EXISTS client_memberships_scope_check;
ALTER TABLE public.client_memberships ADD CONSTRAINT client_memberships_scope_check CHECK (scope IN ('standalone','enterprise','team'));
ALTER TABLE public.client_memberships DROP CONSTRAINT IF EXISTS client_memberships_check;
ALTER TABLE public.client_memberships ADD CONSTRAINT client_memberships_check CHECK (
  (scope = 'standalone' AND org_id IS NULL     AND team_id IS NULL)
  OR (scope = 'enterprise' AND org_id IS NOT NULL AND team_id IS NULL)
  OR (scope = 'team'       AND team_id IS NOT NULL AND org_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS client_memberships_team_uidx ON public.client_memberships (account_id, team_id) WHERE deleted_at IS NULL AND team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_memberships_team_idx ON public.client_memberships (team_id) WHERE deleted_at IS NULL AND team_id IS NOT NULL;

-- (5) helpers SECURITY DEFINER (anti-recursion)
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
    WHERE tm.team_id = p_team_id AND tm.coach_id = auth.uid()
      AND tm.status = 'active' AND tm.deleted_at IS NULL AND t.deleted_at IS NULL
  );
$$;
CREATE OR REPLACE FUNCTION public.is_team_manager(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = p_team_id AND t.deleted_at IS NULL
      AND (
        t.owner_coach_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = t.id AND tm.coach_id = auth.uid()
            AND tm.can_manage = true AND tm.status = 'active' AND tm.deleted_at IS NULL
        )
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_manager(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_team_member(uuid)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_team_manager(uuid) TO authenticated, service_role;

-- (5b) triggers de integridad (owner-only fields, owner-row protection, escalation, seat_limit)
CREATE OR REPLACE FUNCTION public.teams_guard_owner_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.owner_coach_id IS DISTINCT FROM OLD.owner_coach_id OR NEW.seat_limit IS DISTINCT FROM OLD.seat_limit)
     AND auth.uid() <> OLD.owner_coach_id THEN
    RAISE EXCEPTION 'solo el owner del team puede cambiar owner_coach_id o seat_limit';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS teams_guard_owner_fields ON public.teams;
CREATE TRIGGER teams_guard_owner_fields BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.teams_guard_owner_fields();

CREATE OR REPLACE FUNCTION public.team_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT owner_coach_id INTO v_owner FROM teams WHERE id = OLD.team_id;
    IF OLD.coach_id = v_owner AND auth.uid() <> v_owner THEN
      RAISE EXCEPTION 'no se puede eliminar la membresia del owner del team';
    END IF;
    RETURN OLD;
  END IF;
  SELECT owner_coach_id INTO v_owner FROM teams WHERE id = NEW.team_id;
  IF TG_OP = 'UPDATE' AND OLD.coach_id = v_owner AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'no se puede modificar la membresia del owner del team';
  END IF;
  IF NEW.can_manage = true AND (TG_OP = 'INSERT' OR OLD.can_manage IS DISTINCT FROM true) AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'solo el owner del team puede otorgar can_manage';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS team_members_guard ON public.team_members;
CREATE TRIGGER team_members_guard BEFORE INSERT OR UPDATE OR DELETE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.team_members_guard();

CREATE OR REPLACE FUNCTION public.team_members_seat_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_limit int;
BEGIN
  SELECT seat_limit INTO v_limit FROM teams WHERE id = NEW.team_id;
  SELECT count(*) INTO v_count FROM team_members WHERE team_id = NEW.team_id AND status = 'active' AND deleted_at IS NULL;
  IF v_limit IS NOT NULL AND v_count >= v_limit THEN
    RAISE EXCEPTION 'team seat_limit (%) alcanzado', v_limit;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS team_members_seat_guard ON public.team_members;
CREATE TRIGGER team_members_seat_guard BEFORE INSERT ON public.team_members FOR EACH ROW WHEN (NEW.status = 'active' AND NEW.deleted_at IS NULL) EXECUTE FUNCTION public.team_members_seat_guard();

-- (7) team_audit_logs
CREATE TABLE IF NOT EXISTS public.team_audit_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    actor_coach_id  uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
    action          text NOT NULL,
    target_type     text,
    target_id       uuid,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_audit_logs_team_idx ON public.team_audit_logs (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_audit_logs_actor_coach_idx ON public.team_audit_logs (actor_coach_id) WHERE actor_coach_id IS NOT NULL;

-- (6) grants de tabla (sin esto las policies RLS no se evaluan para authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_audit_logs TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;
GRANT ALL ON public.team_audit_logs TO service_role;

-- (8) RLS teams / team_members / team_audit_logs
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_teams_member_select ON public.teams;
CREATE POLICY team_teams_member_select ON public.teams FOR SELECT USING (public.is_team_member(id));
DROP POLICY IF EXISTS team_teams_manager_update ON public.teams;
CREATE POLICY team_teams_manager_update ON public.teams FOR UPDATE USING (public.is_team_manager(id)) WITH CHECK (public.is_team_manager(id));
DROP POLICY IF EXISTS team_teams_service ON public.teams;
CREATE POLICY team_teams_service ON public.teams FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
DROP POLICY IF EXISTS team_members_peer_select ON public.team_members;
CREATE POLICY team_members_peer_select ON public.team_members FOR SELECT USING (public.is_team_member(team_id));
DROP POLICY IF EXISTS team_members_manager_write ON public.team_members;
CREATE POLICY team_members_manager_write ON public.team_members FOR ALL USING (public.is_team_manager(team_id)) WITH CHECK (public.is_team_manager(team_id));
DROP POLICY IF EXISTS team_members_service ON public.team_members;
CREATE POLICY team_members_service ON public.team_members FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
DROP POLICY IF EXISTS team_audit_logs_member_select ON public.team_audit_logs;
CREATE POLICY team_audit_logs_member_select ON public.team_audit_logs FOR SELECT USING (public.is_team_member(team_id));
DROP POLICY IF EXISTS team_audit_logs_member_insert ON public.team_audit_logs;
CREATE POLICY team_audit_logs_member_insert ON public.team_audit_logs FOR INSERT WITH CHECK (public.is_team_member(team_id) AND actor_coach_id = (select auth.uid()));
DROP POLICY IF EXISTS team_audit_logs_service ON public.team_audit_logs;
CREATE POLICY team_audit_logs_service ON public.team_audit_logs FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- (9) RLS team_* ADITIVAS sobre clients y tablas hijas (full-access miembro activo)
DROP POLICY IF EXISTS team_clients_member_all ON public.clients;
CREATE POLICY team_clients_member_all ON public.clients FOR ALL
  USING (team_id IS NOT NULL AND public.is_team_member(team_id))
  WITH CHECK (team_id IS NOT NULL AND public.is_team_member(team_id));

DROP POLICY IF EXISTS team_check_ins_member_all ON public.check_ins;
CREATE POLICY team_check_ins_member_all ON public.check_ins FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = check_ins.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = check_ins.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_client_intake_member_all ON public.client_intake;
CREATE POLICY team_client_intake_member_all ON public.client_intake FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_intake.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_intake.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_workout_logs_member_all ON public.workout_logs;
CREATE POLICY team_workout_logs_member_all ON public.workout_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_logs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_logs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_daily_habits_member_all ON public.daily_habits;
CREATE POLICY team_daily_habits_member_all ON public.daily_habits FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = daily_habits.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = daily_habits.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_client_food_prefs_member_all ON public.client_food_preferences;
CREATE POLICY team_client_food_prefs_member_all ON public.client_food_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_food_preferences.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_food_preferences.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_client_payments_member_all ON public.client_payments;
CREATE POLICY team_client_payments_member_all ON public.client_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_payments.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_payments.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_daily_nutrition_logs_member_all ON public.daily_nutrition_logs;
CREATE POLICY team_daily_nutrition_logs_member_all ON public.daily_nutrition_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = daily_nutrition_logs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = daily_nutrition_logs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_nutrition_meal_logs_member_all ON public.nutrition_meal_logs;
CREATE POLICY team_nutrition_meal_logs_member_all ON public.nutrition_meal_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.daily_nutrition_logs d JOIN public.clients c ON c.id = d.client_id WHERE d.id = nutrition_meal_logs.daily_log_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_nutrition_logs d JOIN public.clients c ON c.id = d.client_id WHERE d.id = nutrition_meal_logs.daily_log_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_nutrition_plans_member_all ON public.nutrition_plans;
CREATE POLICY team_nutrition_plans_member_all ON public.nutrition_plans FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = nutrition_plans.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = nutrition_plans.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_nutrition_meals_member_all ON public.nutrition_meals;
CREATE POLICY team_nutrition_meals_member_all ON public.nutrition_meals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.nutrition_plans p JOIN public.clients c ON c.id = p.client_id WHERE p.id = nutrition_meals.plan_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nutrition_plans p JOIN public.clients c ON c.id = p.client_id WHERE p.id = nutrition_meals.plan_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

DROP POLICY IF EXISTS team_food_items_member_all ON public.food_items;
CREATE POLICY team_food_items_member_all ON public.food_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.nutrition_meals m JOIN public.nutrition_plans p ON p.id = m.plan_id JOIN public.clients c ON c.id = p.client_id WHERE m.id = food_items.meal_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nutrition_meals m JOIN public.nutrition_plans p ON p.id = m.plan_id JOIN public.clients c ON c.id = p.client_id WHERE m.id = food_items.meal_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)));

-- workout_plans / _blocks / _programs / nutrition_plan_templates:
-- ASIGNADOS por client_id->clients.team_id; TEMPLATES (client_id NULL) compartidos
-- en el pool por coach autor, ACOTADOS al mismo team (is_team_member sobre membresia del autor).
DROP POLICY IF EXISTS team_workout_plans_member_all ON public.workout_plans;
CREATE POLICY team_workout_plans_member_all ON public.workout_plans FOR ALL
  USING (
    (workout_plans.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_plans.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
    OR (workout_plans.client_id IS NULL AND workout_plans.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = workout_plans.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
  )
  WITH CHECK (
    (workout_plans.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_plans.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
    OR (workout_plans.client_id IS NULL AND workout_plans.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = workout_plans.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
  );

DROP POLICY IF EXISTS team_workout_blocks_member_all ON public.workout_blocks;
CREATE POLICY team_workout_blocks_member_all ON public.workout_blocks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.workout_plans wp WHERE wp.id = workout_blocks.plan_id AND (
      (wp.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = wp.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
      OR (wp.client_id IS NULL AND wp.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = wp.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
    )))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plans wp WHERE wp.id = workout_blocks.plan_id AND (
      (wp.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = wp.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
      OR (wp.client_id IS NULL AND wp.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = wp.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
    )));

DROP POLICY IF EXISTS team_workout_programs_member_all ON public.workout_programs;
CREATE POLICY team_workout_programs_member_all ON public.workout_programs FOR ALL
  USING (
    (workout_programs.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_programs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
    OR (workout_programs.client_id IS NULL AND workout_programs.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = workout_programs.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
  )
  WITH CHECK (
    (workout_programs.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_programs.client_id AND c.team_id IS NOT NULL AND public.is_team_member(c.team_id)))
    OR (workout_programs.client_id IS NULL AND workout_programs.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = workout_programs.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
  );

DROP POLICY IF EXISTS team_nutrition_plan_templates_member_all ON public.nutrition_plan_templates;
CREATE POLICY team_nutrition_plan_templates_member_all ON public.nutrition_plan_templates FOR ALL
  USING (nutrition_plan_templates.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = nutrition_plan_templates.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)))
  WITH CHECK (nutrition_plan_templates.coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm_author WHERE tm_author.coach_id = nutrition_plan_templates.coach_id AND tm_author.status = 'active' AND tm_author.deleted_at IS NULL AND public.is_team_member(tm_author.team_id)));
