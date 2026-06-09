-- Hardening de gobernanza del team (post review adversarial A.bis3). Aditivo/idempotente.
-- (1) seat_guard tambien en UPDATE: la reactivacion (revoked->active) ocupaba cupo sin pasar el
--     guard duro (era BEFORE INSERT only). Ahora cuenta excluyendo la propia fila y solo cuando
--     la fila ENTRA al estado activo (INSERT, o UPDATE desde no-activo).
CREATE OR REPLACE FUNCTION public.team_members_seat_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_limit int;
BEGIN
  -- UPDATE que NO es una transicion hacia activo (ya estaba activo) -> no ocupa cupo nuevo.
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT seat_limit INTO v_limit FROM teams WHERE id = NEW.team_id;
  SELECT count(*) INTO v_count FROM team_members
    WHERE team_id = NEW.team_id AND status = 'active' AND deleted_at IS NULL AND id <> NEW.id;
  IF v_limit IS NOT NULL AND v_count >= v_limit THEN
    RAISE EXCEPTION 'team seat_limit (%) alcanzado', v_limit;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS team_members_seat_guard ON public.team_members;
CREATE TRIGGER team_members_seat_guard BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW
  WHEN (NEW.status = 'active' AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.team_members_seat_guard();

-- (2) Resolucion directa de coach por email (evita listUsers paginado que falla >1000 usuarios).
--     SECURITY DEFINER para leer auth.users. Solo service_role (se llama via admin client server-side).
CREATE OR REPLACE FUNCTION public.get_coach_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT c.id
  FROM auth.users u
  JOIN public.coaches c ON c.id = u.id
  WHERE lower(trim(u.email)) = lower(trim(p_email))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_coach_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_id_by_email(text) TO service_role;

-- (3) Transferencia de propiedad ATOMICA (antes eran 3 writes sueltos sin tx ni chequeo de error).
--     SECURITY DEFINER bypasea los triggers de gobernanza, pero la funcion AUTO-VERIFICA que el
--     llamante (auth.uid()) sea el owner actual y que el nuevo owner sea miembro activo. Una sola tx.
CREATE OR REPLACE FUNCTION public.transfer_team_ownership(p_team_id uuid, p_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old_owner uuid;
BEGIN
  SELECT owner_coach_id INTO v_old_owner FROM teams WHERE id = p_team_id AND deleted_at IS NULL;
  IF v_old_owner IS NULL THEN RAISE EXCEPTION 'team not found'; END IF;
  IF v_old_owner <> auth.uid() THEN RAISE EXCEPTION 'solo el owner puede transferir la propiedad'; END IF;
  IF p_new_owner = v_old_owner THEN RAISE EXCEPTION 'ese coach ya es el owner'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND coach_id = p_new_owner AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'el nuevo owner debe ser un miembro activo del equipo';
  END IF;
  UPDATE team_members SET can_manage = true
    WHERE team_id = p_team_id AND coach_id IN (p_new_owner, v_old_owner);
  UPDATE teams SET owner_coach_id = p_new_owner WHERE id = p_team_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_team_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_team_ownership(uuid, uuid) TO authenticated;
