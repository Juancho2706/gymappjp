-- Audit DB 2026-06-17: últimas 3 políticas RLS duplicado-EXACTO (mismo qual+with_check byte a byte
-- que su gemela en el mismo (tabla,cmd,rol)). Borrar la redundante es provablemente seguro: queda la
-- gemela idéntica => acceso sin cambios. El resto de multiple_permissive (510 lints) son scopes
-- DISTINTOS intencionales (self/coach/org/team) que conviven legítimamente — NO se tocan (fusionarlos
-- rompería auditabilidad y arriesgaría el aislamiento de tenants). Idempotente (IF EXISTS), forward-only.
-- Verificado post-apply: las 3 gemelas survivors siguen, total_policies 225->222.
DROP POLICY IF EXISTS "Public read access to coaches" ON public.coaches;       -- queda public_read_coach_branding (idéntica)
DROP POLICY IF EXISTS nutrition_plans_client_select ON public.nutrition_plans;  -- queda nutrition_plans_client (idéntica)
DROP POLICY IF EXISTS saved_meal_items_access ON public.saved_meal_items;       -- queda saved_meal_items_coach_all (idéntica)
