-- ============================================================================
-- PENDIENTE DE AUDITORIA EN LIVE — NO SE APLICA AUTOMATICAMENTE
-- (archivo sin timestamp: el CLI de Supabase lo ignora, mismo patron que los
--  archivos _POST_DEPLOY_ / _PENDING_AUDIT_ de esta carpeta).
--
-- EVA Nutricion V2 — NUT-003 (capa 3): defensa server-side del doble "Lo comi"
-- ----------------------------------------------------------------------------
-- Contexto (auditoria 2026-07-28, verificacion G2): cada toque de "Lo comi"
-- generaba operationId/idempotencyKey nuevos, la cola RN deduplica solo por
-- (userId, key) y la DB solo exige unique (client_id, idempotency_key), asi que
-- dos toques = dos entradas activas. Las capas 1 (clave determinista por
-- intencion: clientId+localDate+prescriptionItemId, apps/mobile/lib/
-- nutrition-v2-intake.ts) y 2 (overlay de encolados + boton bloqueado hasta
-- refetch) ya van en este PR y cierran el sintoma para clientes actualizados.
-- ESTA capa es la red final contra clientes viejos y escrituras directas.
--
-- DECISION DE PRODUCTO PREVIA (owner): si repetir el MISMO item prescrito el
-- mismo dia es una intencion legitima (repetir plato), este indice NO va y hay
-- que quedarse con capas 1+2 (o usar la alternativa por ventana, abajo).
--
-- ############################################################################
-- ## PASO 1 — AUDITORIA (read-only, en LIVE, con OK del owner)              ##
-- ############################################################################
--
--   -- Duplicados existentes de intencion prescrita (deben ser 0 para crear el indice):
--   select client_id, log_date, prescription_item_id, count(*) as filas,
--          array_agg(id order by created_at) as entry_ids
--   from public.nutrition_intake_entries
--   where prescription_item_id is not null
--     and entry_status = 'active'
--     and intake_source_v2 = 'prescription'
--   group by client_id, log_date, prescription_item_id
--   having count(*) > 1;
--
-- ############################################################################
-- ## PASO 2 — SANEO (solo si el paso 1 devolvio filas; politica: consolidar) ##
-- ############################################################################
--
-- NO borrar: marcar los sobrantes como 'corrected' conservando el mas antiguo,
-- con motivo de auditoria. Redactar el UPDATE caso a caso sobre los entry_ids
-- del paso 1, en transaccion, con snapshot previo (protocolo AGENTS.md).
--
-- ############################################################################
-- ## PASO 3 — INDICE (solo con paso 1 en 0)                                 ##
-- ############################################################################

create unique index concurrently if not exists
  nutrition_intake_entries_v2_prescribed_once_idx
  on public.nutrition_intake_entries (client_id, log_date, prescription_item_id)
  where prescription_item_id is not null
    and entry_status = 'active'
    and intake_source_v2 = 'prescription';

-- Nota: `create index concurrently` NO puede correr dentro de una transaccion.
--
-- ALTERNATIVA MENOS INVASIVA (si el owner decide que repetir plato es valido):
-- en vez del indice, dedup por ventana dentro de record_nutrition_intake_v2 —
-- si existe una entry active para (client_id, log_date, prescription_item_id)
-- creada hace menos de N segundos (p.ej. 90), devolver ese id en vez de
-- insertar. Cubre el doble toque accidental sin prohibir la repeticion
-- deliberada horas despues. Requiere create-or-replace del RPC (migracion
-- normal, misma firma).
