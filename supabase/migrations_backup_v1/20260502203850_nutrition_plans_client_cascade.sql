-- Add ON DELETE CASCADE to nutrition_plans.client_id so that deleting a client
-- properly cleans up their nutrition plans and all dependent rows.
ALTER TABLE nutrition_plans
DROP CONSTRAINT IF EXISTS nutrition_plans_client_id_fkey;

ALTER TABLE nutrition_plans
ADD CONSTRAINT nutrition_plans_client_id_fkey
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
