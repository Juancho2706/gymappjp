-- Reversion de 20260805041843_nutrition_v2_set_based_rls_and_or_order.sql (fase 3 runbook RLS).
-- Restaura las permissive a las funciones escalares, la restrictive al wrapper, y el OR original.
-- Correr en una sola transaccion, horario valle, con lock_timeout.
BEGIN;
SET LOCAL lock_timeout = '2s';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nutrition_prescription_items_v2','nutrition_meal_slots_v2','nutrition_day_variants_v2','nutrition_item_substitutions_v2','nutrition_slot_exchange_targets_v2'] LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.nutrition_v2_can_read_version(version_id))', t || '_select', t);
    EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (private.nutrition_v2_can_edit_version(version_id))', t || '_insert', t);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.nutrition_v2_can_edit_version(version_id)) WITH CHECK (private.nutrition_v2_can_edit_version(version_id))', t || '_update', t);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.nutrition_v2_can_edit_version(version_id))', t || '_delete', t);
  END LOOP;
END $$;

ALTER POLICY archive_gate_nutrition_v2_items ON public.nutrition_prescription_items_v2
  USING (private.student_data_read_gate_for_nutrition_v2_version(version_id))
  WITH CHECK (private.student_data_read_gate_for_nutrition_v2_version(version_id));
ALTER POLICY archive_gate_nutrition_v2_slots ON public.nutrition_meal_slots_v2
  USING (private.student_data_read_gate_for_nutrition_v2_version(version_id))
  WITH CHECK (private.student_data_read_gate_for_nutrition_v2_version(version_id));
ALTER POLICY archive_gate_nutrition_v2_variants ON public.nutrition_day_variants_v2
  USING (private.student_data_read_gate_for_nutrition_v2_version(version_id))
  WITH CHECK (private.student_data_read_gate_for_nutrition_v2_version(version_id));
ALTER POLICY archive_gate_nutrition_v2_subs ON public.nutrition_item_substitutions_v2
  USING (private.student_data_read_gate_for_nutrition_v2_version(version_id))
  WITH CHECK (private.student_data_read_gate_for_nutrition_v2_version(version_id));

ALTER POLICY nutrition_plans_v2_select ON public.nutrition_plans_v2
  USING (private.nutrition_v2_can_manage_client(client_id)
         OR ((auth.uid() = client_id) AND (current_published_version_id IS NOT NULL)));

-- opcional, tras revertir tambien la fase 2:
-- DROP FUNCTION private.student_readable_nutrition_v2_version_ids();
-- DROP FUNCTION private.nutrition_v2_readable_version_ids();
-- DROP FUNCTION private.nutrition_v2_editable_version_ids();
-- DROP FUNCTION private.nutrition_v2_manageable_client_ids();

COMMIT;
