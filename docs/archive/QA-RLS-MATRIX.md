# QA-026 — Matriz RLS (24 tablas × rol × operación)

Leyenda: **Y** = debe estar permitido para el rol en condiciones normales de negocio. **N** = debe denegarse (0 filas o error según política). **S** = solo servidor / `service_role`.  
Los valores marcan **expectativa**; la evidencia en Studio y los tests de integración confirman el estado real.

| Tabla | anon | client JWT (alumno) | coach JWT | service_role |
|-------|------|---------------------|-----------|----------------|
| check_ins | N | Y propio | Y sus alumnos | S |
| client_payments | N | N | Y propio negocio | S |
| client_intake | N | Y propio | Y sus alumnos | S |
| clients | N | Y self | Y sus alumnos | S |
| coaches | N parcial branding | N lectura mínima vía app | Y self | S |
| subscription_events | N | N | Y self | S |
| daily_nutrition_logs | N | Y propio plan | Y sus alumnos | S |
| exercises | Y lectura catálogo | Y | Y | S |
| food_items | N | Y vía plan | Y vía alumnos | S |
| foods | Y/N según política catálogo | Y según coach/plan | Y coach foods | S |
| nutrition_meal_logs | N | Y propio | Y sus alumnos | S |
| nutrition_meals | N | Y vía plan | Y gestión | S |
| nutrition_plans | N | Y asignados | Y sus alumnos | S |
| nutrition_plan_templates | N | N | Y propios | S |
| template_meals | N | N | Y propios | S |
| template_meal_groups | N | N | Y propios | S |
| recipe_ingredients | N | Y vía recetas permitidas | Y | S |
| recipes | N | Y asignadas | Y | S |
| saved_meal_items | N | Y propios | Y según política | S |
| saved_meals | N | Y propios | Y según política | S |
| workout_blocks | N | Y vía plan asignado | Y vía alumnos | S |
| workout_logs | N | Y propios | Y sus alumnos | S |
| workout_plans | N | Y asignados | Y sus alumnos | S |
| workout_programs | N | Y propios activos | Y sus alumnos | S |

## Trazabilidad tests automáticos

| ID maestro | Cobertura |
|------------|-----------|
| QA-021 | `tests/rls/rls-tenant-isolation.test.ts` (`RLS_TEST_PEER_CLIENT_ID`) |
| QA-022 | mismo archivo, caso `RLS_TEST_OTHER_COACH_CLIENT_ID` |
| QA-023–QA-025 | ampliar con JWT coach + IDs de prueba (misma carpeta o scripts SQL). |
| QA-027 | `tests/rls/rls-client-modes.test.ts` (anon vs service_role) |

Activación: `SUPABASE_RLS_INTEGRATION=1` y variables documentadas en `README.md`.
