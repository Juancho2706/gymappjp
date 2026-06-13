# Personas E2E (Wave 2) — separacion de 3 flujos

Cuentas sinteticas para los tests E2E de la separacion total de flujos
`coach_standalone` / `enterprise_coach` / `coach_team`. Viven en la Supabase
remota (prod) y se crean con `scripts/seed-e2e-personas.mjs`.

> **Password:** todas las cuentas comparten el password del env
> `E2E_PERSONAS_PASSWORD`. **Nunca se commitea** — vive solo en `.env.local`
> (y en el secret store de CI si aplica).
>
> **NUNCA BORRAR** estas cuentas ni su data. Los specs E2E dependen de ellas.
> El seed es idempotente: re-ejecutarlo crea solo lo que falta y jamas borra.

## Como re-seedear

```powershell
# PowerShell (Windows)
$env:E2E_SEED_CONFIRM='yes'; $env:E2E_PERSONAS_PASSWORD='<password>'; node scripts/seed-e2e-personas.mjs --allow-remote
```

```bash
# bash
E2E_SEED_CONFIRM=yes E2E_PERSONAS_PASSWORD='<password>' node scripts/seed-e2e-personas.mjs --allow-remote
```

Doble gate deliberado (flag `--allow-remote` + env `E2E_SEED_CONFIRM=yes`)
porque el script escribe en prod. Imprime la URL objetivo y espera 3 segundos
antes de tocar nada.

## Las 8 personas

| # | Email | Rol | Contexto | Marca / color | Entrada (URL) | Data que tiene |
|---|-------|-----|----------|---------------|----------------|----------------|
| 1 | `e2e-solo-coach@evatest.cl` | Coach standalone | `coach_standalone` (sin org, sin team; workspace switcher oculto) | Aurora Strength `#F59E0B`, slug `e2e-aurora-strength`, tier elite, status active, `payment_provider=admin`, `current_period_end` +1 año | `/login` → `/coach` | 1 alumno (persona 2) con data completa; invite_code propio (ver inventario del seed) |
| 2 | `e2e-solo-alumno@evatest.cl` | Alumno standalone | `clients.coach_id` = persona 1; `org_id` y `team_id` NULL; membership scope `standalone` | Hereda marca Aurora Strength | `/c/e2e-aurora-strength/login` | Intake, programa "E2E-SEED Programa Base" (3 plans L/M/V, 4 blocks c/u), 7 sesiones de workout_logs (14 dias, dia por medio), plan nutricional 2200 kcal (4 meals, 2 food_items c/u), 7 daily_nutrition_logs con 2-3 meal logs, 3 check-ins (70/69.5/69 kg), 7 daily_habits |
| 3 | `e2e-org-owner@evatest.cl` | Org owner (admin puro) | `organization_members.role=org_owner` de "E2E Performance Lab"; **sin** fila en `coaches` | E2E Performance Lab `#8B5CF6`, slug `e2e-performance-lab` | `/org/e2e-performance-lab` (login enterprise) | Solo membresia org (panel admin); ninguna data de entrenamiento propia |
| 4 | `e2e-org-coach@evatest.cl` | Coach enterprise | `coaches.subscription_status=org_managed`, tier scale, `active_org_id`=org; `organization_members.role=coach`; single-context | Marca de la org `#8B5CF6`, slug `e2e-org-coach` | `/login` → `/coach` (contexto enterprise) | 1 alumno asignado (persona 5, via `coach_client_assignments`) |
| 5 | `e2e-org-alumno@evatest.cl` | Alumno enterprise | `clients.coach_id` = persona 4, `org_id` = org; membership scope `enterprise` | Hereda marca org | `/e/e2e-performance-lab/login` | Misma data completa que persona 2; `workout_programs.org_id` y `nutrition_plans.org_id` estampados con la org |
| 6 | `e2e-team-owner@evatest.cl` | Owner del team (pool) | `coaches.subscription_status=team_managed`, tier elite; `teams.owner_coach_id`; `team_members.can_manage=true`, display_role "Owner"; single-context | E2E Pool Vortex `#EC4899`, slug team `e2e-pool-vortex`, slug coach `e2e-team-owner`, `seat_limit=10`, `enabled_modules={}` | `/login` → `/coach` (contexto team; modulo "Equipo" visible) | Alumno de pool (persona 8) con programa base bajo su autoria |
| 7 | `e2e-team-coach@evatest.cl` | Coach miembro del pool | `team_managed`/elite; `team_members.can_manage=false`, display_role "Nutrición"; single-context | Marca del team `#EC4899`, slug coach `e2e-team-coach` | `/login` → `/coach` (contexto team) | Autor del programa "E2E-SEED Programa Member" del alumno de pool (acceso full-pool via RLS team) |
| 8 | `e2e-pool-alumno@evatest.cl` | Alumno de pool (team) | `clients.team_id` = team, `org_id` NULL, `coach_id` = persona 6; membership scope `team`; consents `pool_multidisciplinary_access` + `health_data_processing` (v1, `granted_via=team_onboarding`) ya otorgados ⇒ **sin consent gate** (`/t/.../consent` redirige al dashboard) | Hereda marca del team | `/t/e2e-pool-vortex/login` | Misma data completa que persona 2 (contenido con `org_id` NULL) + segundo programa "E2E-SEED Programa Member" autoria persona 7 |

## Notas para los specs

- Personas 1, 4, 6 y 7 son single-context: el workspace switcher esta oculto
  (<=1 workspaces).
- Matriz de modulos del sidebar: todos los contextos muestran Dashboard,
  Alumnos, Programas, Ejercicios, Nutrición, Soporte; solo `coach_team` agrega
  "Equipo"; solo `coach_standalone` agrega "Mi Marca" y "Suscripción".
- Asserts de marca: variable CSS `--theme-primary` en `.coach-layout-container`
  o `:root`; el sidebar muestra el nombre del team (team), de la org
  (enterprise) o la marca del coach (standalone).
- Los nombres de contenido seed llevan el prefijo `E2E-SEED` — usarlo como
  marcador determinista en asserts y checks de idempotencia. No renombrar.
- El inventario JSON (ids, invite_code del coach standalone, ids de org/team y
  conteos por tabla) se imprime al final de cada corrida del seed.
