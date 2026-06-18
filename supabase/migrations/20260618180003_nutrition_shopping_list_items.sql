-- F1 · shopping_list_items: lista de compras (feature B). La lista se DERIVA del plan en
-- read-time (servicio puro buildShoppingList); esta tabla SOLO persiste el check-state y
-- los items manuales del alumno. Tabla nueva, aislada. RLS: client own + coach read + team.

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id    uuid REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
  label      text NOT NULL,
  category   text,
  is_checked boolean NOT NULL DEFAULT false,
  is_manual  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_list_items_client_idx ON public.shopping_list_items(client_id);
CREATE INDEX IF NOT EXISTS shopping_list_items_plan_idx   ON public.shopping_list_items(plan_id);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;

DROP POLICY IF EXISTS shopping_list_client_all ON public.shopping_list_items;
CREATE POLICY shopping_list_client_all ON public.shopping_list_items FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = client_id)
  WITH CHECK ((SELECT auth.uid()) = client_id);

DROP POLICY IF EXISTS shopping_list_coach_select ON public.shopping_list_items;
CREATE POLICY shopping_list_coach_select ON public.shopping_list_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = shopping_list_items.client_id AND c.coach_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS shopping_list_team_all ON public.shopping_list_items;
CREATE POLICY shopping_list_team_all ON public.shopping_list_items FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));
