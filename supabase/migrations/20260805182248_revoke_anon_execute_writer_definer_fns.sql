-- F (2026-08-05): advisor anon_security_definer_function_executable — las 4 funciones de
-- ESCRITURA quedan fuera del alcance de anon. Ningun flujo pre-auth las llama: los logins
-- anon solo leen branding; los callers reales son sesiones authenticated (web/RN) o triggers
-- (coaches_invite_code_set_once y sync_coach_enabled_modules son trigger functions: el firing
-- de un trigger no chequea EXECUTE del invocador, asi que esto no afecta su operacion).
-- Las 7 funciones DEFINER de LECTURA ejecutables por anon quedan intactas a proposito:
-- get_org_branding / is_coach_active_org_member y familia corren en el hot path anon del
-- proxy /c y /e (leccion del outage del anon grant del login alumno).
revoke execute on function public.apply_nutrition_template_to_client(p_op jsonb, p_coach uuid) from anon;
revoke execute on function public.assign_org_client_to_coach(p_client_id uuid, p_coach_id uuid) from anon;
revoke execute on function public.coaches_invite_code_set_once() from anon;
revoke execute on function public.sync_coach_enabled_modules() from anon;
