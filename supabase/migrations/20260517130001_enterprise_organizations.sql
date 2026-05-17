CREATE TABLE organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text UNIQUE NOT NULL,
  name               text NOT NULL,
  logo_url           text,
  primary_color      text,
  owner_user_id      uuid NOT NULL REFERENCES auth.users(id),
  plan               text NOT NULL DEFAULT 'enterprise',
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','cancelled','trial')),
  trial_ends_at      timestamptz,
  seats_included     int NOT NULL DEFAULT 3,
  billing_start_date date,
  billing_cycle      text DEFAULT 'monthly'
                     CHECK (billing_cycle IN ('monthly','annual')),
  purge_scheduled_at timestamptz,
  onboarding_step    int DEFAULT 0,
  currency           text NOT NULL DEFAULT 'CLP',
  deleted_at         timestamptz,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
