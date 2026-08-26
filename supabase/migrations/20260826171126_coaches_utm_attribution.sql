-- FCN W3.9: atribucion del alta. Hoy 24 de 25 personas tienen $initial_utm_source = none en
-- PostHog porque la identidad anonima se recrea por sesion; la fila del coach guarda la fuente
-- que trajo el alta, escrita SOLO por el servidor en el momento del registro.
-- Aplicada en LIVE el 2026-08-26 vía MCP (advisors sin hallazgos sobre lo tocado).
ALTER TABLE public.coaches ADD COLUMN utm_source text;
ALTER TABLE public.coaches ADD COLUMN utm_campaign text;

COMMENT ON COLUMN public.coaches.utm_source IS
  'Fuente de adquisicion capturada en el alta (server-side). Dato personal bajo Ley 21.719: retencion = vida de la cuenta, se borra con la fila. Sin GRANT a authenticated/anon (default-deny por columna): solo service_role escribe.';
COMMENT ON COLUMN public.coaches.utm_campaign IS
  'Campana de adquisicion capturada en el alta (server-side). Misma retencion y mismo default-deny que utm_source.';
