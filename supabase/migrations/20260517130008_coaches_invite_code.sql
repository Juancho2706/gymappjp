-- Trigger: genera invite_code automáticamente en INSERT
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TRIGGER AS $$
DECLARE
  code  text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin O/0/I/1 para evitar confusión
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      NEW.invite_code := code;
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- colisión (1 en 33M aprox) → reintentar
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS invite_code text;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS active_org_id uuid REFERENCES organizations(id);

-- Backfill invite_code para coaches existentes (atómico, maneja colisiones)
DO $$
DECLARE
  rec   RECORD;
  code  text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR rec IN SELECT id FROM coaches WHERE invite_code IS NULL LOOP
    LOOP
      code := '';
      FOR i IN 1..5 LOOP
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      BEGIN
        UPDATE coaches SET invite_code = code WHERE id = rec.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE coaches ADD CONSTRAINT coaches_invite_code_unique UNIQUE (invite_code);
ALTER TABLE coaches ALTER COLUMN invite_code SET NOT NULL;

CREATE TRIGGER coaches_invite_code_trigger
  BEFORE INSERT ON coaches
  FOR EACH ROW
  WHEN (NEW.invite_code IS NULL)
  EXECUTE FUNCTION generate_invite_code();

-- org_managed: coach dentro de org, no tiene plan standalone activo
ALTER TABLE coaches
  DROP CONSTRAINT IF EXISTS coaches_subscription_status_check;

ALTER TABLE coaches
  ADD CONSTRAINT coaches_subscription_status_check
  CHECK (subscription_status IN (
    'active','inactive','trial','cancelled','past_due','paused',
    'org_managed' -- nuevo: coach gestionado por una org enterprise
  ));
