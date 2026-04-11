# SEC-001 — Auditoría RLS (24 tablas públicas)

**Alcance:** políticas de Row Level Security alineadas con el modelo de negocio (coach multi-tenant, alumno scoped, catálogos compartidos donde aplica).  
**Fuente de verdad en código:** tipos en `src/lib/database.types.ts` (schema `public`).  
**SQL de referencia en repo:** `supabase/migrations_backup/` (p. ej. `20260410000000_nutrition_rls_phase1.sql`, `20260410120000_nutrition_rls_phase2_saved_meals.sql`, `20260411120000_subscription_core_sprint2.sql`, otras migraciones de dominio). La carpeta activa `supabase/migrations/` debe mantenerse sincronizada con el proyecto remoto (`supabase db pull` / `db push`).

## Inventario: 24 tablas

| # | Tabla | Notas de aislamiento esperado |
|---|--------|-------------------------------|
| 1 | `check_ins` | Alumno: propio `client_id`. Coach: lectura de alumnos bajo su `coach_id`. |
| 2 | `client_payments` | Coach dueño + contexto de suscripción; sin cruces entre coaches. |
| 3 | `client_intake` | Datos de intake ligados al alumno y coach asignado. |
| 4 | `clients` | Filas visibles solo para el coach propietario o el propio alumno (`id`). |
| 5 | `coaches` | Coach ve/edita su fila; alumnos lectura mínima de branding vía relaciones. |
| 6 | `subscription_events` | Auditoría de pagos/suscripción scoped al coach. |
| 7 | `daily_nutrition_logs` | Alumno día/plan; coach lectura de sus alumnos. |
| 8 | `exercises` | Catálogo global o lectura controlada; escritura solo roles admin/coach según política. |
| 9 | `food_items` | Items ligados a comidas/planes; acceso vía cadena nutrition → client/coach. |
| 10 | `foods` | Mix de catálogo global + foods por coach; políticas `foods_*` en migraciones nutrition. |
| 11 | `nutrition_meal_logs` | Igual cadena que daily logs / meals. |
| 12 | `nutrition_meals` | Plan del alumno o templates coach. |
| 13 | `nutrition_plans` | Asignación alumno-coach. |
| 14 | `nutrition_plan_templates` | Coach propietario. |
| 15 | `template_meals` | Ligadas a templates de coach. |
| 16 | `template_meal_groups` | Idem. |
| 17 | `recipe_ingredients` | Recetas visibles según ownership de recipe. |
| 18 | `recipes` | Coach/alumno según asignación. |
| 19 | `saved_meal_items` | Usuario/alumno o coach según política fase 2. |
| 20 | `saved_meals` | Idem. |
| 21 | `workout_blocks` | A través de `workout_plans` del alumno. |
| 22 | `workout_logs` | Sets registrados del alumno autenticado. |
| 23 | `workout_plans` | Planes asignados al alumno o gestionados por su coach. |
| 24 | `workout_programs` | Programa activo del alumno bajo su coach. |

**No incluida en las 24:** `search_foods` (vista), tablas de auth de Supabase.

## Procedimiento de verificación en Supabase Studio

1. Authentication → comprobar que no hay políticas peligrosas en tablas de auth (gestión Supabase).  
2. Database → Policies: por cada tabla, listar `SELECT/INSERT/UPDATE/DELETE` y comprobar uso de `auth.uid()`, `coach_id`, `client_id`.  
3. Comparar con la matriz en `docs/QA-RLS-MATRIX.md`.  
4. Cualquier FAIL documentar como issue con enlace a política concreta y migración propuesta.

## Service role

El `service_role` **debe** usarse solo en servidor (server actions, webhooks, jobs). No exponer en cliente. Los tests `tests/rls/rls-client-modes.test.ts` documentan la diferencia frente a anon.

## Seguimiento

- **Gap encontrado:** abrir issue + migración SQL en `supabase/migrations/` con nombre fechado.  
- **Re-auditoría:** tras cada cambio de schema en tablas listadas arriba.
