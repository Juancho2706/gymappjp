-- Bucket PRIVADO de documentos de salud del pool (ISAK, labs, evaluaciones, informes).
-- Patron checkins-private: bucket privado SIN policies para authenticated/anon -> el acceso se
-- media 100% server-side con service-role (signed URLs) DESPUES de pasar el check de team
-- (assertCoachClientReadAccess) + se registra en team_access_logs. Defensa en profundidad:
-- sin URL publica posible, y la capa de app es el gatekeeper. Aditivo/idempotente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-health-docs',
  'team-health-docs',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
