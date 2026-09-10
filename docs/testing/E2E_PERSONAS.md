---
status: active
owner: quality-engineering
last_verified: "2026-09-10"
canonical: true
---

# Personas E2E de separación de flujos

Inventario operativo de los fixtures permanentes para `coach_standalone`, `enterprise_coach` y `coach_team`.

Fuentes ejecutables:

- `scripts/seed-e2e-personas.mjs`: crea/reconcilia las 9 personas, su data y el plan canónico del hold. **Es el único puntero vivo**: los alias, rutas y marcas viven en sus constantes (`EMAILS`, `SOLO_BRAND`, `ORG`, `TEAM`, `MODULES_BRAND`);
- `tests/exec-hold-superset.spec.ts`: el único spec que hoy corre contra estas personas (alumno standalone, plan del hold).

**Suite de separación retirada (2026-08-05, commit `b50c48dd`).** El owner ordenó borrar las cuentas de prueba de producción y, sin ellas, `tests/separation/` completo —incluidos `personas.ts` y `auth.setup.ts`— y los projects `setup`/`separation` de `playwright.config.ts` se eliminaron. El seed quedó por si las cuentas se recrean. Cualquier referencia a `tests/separation/personas.ts` en documentos viejos apunta a un archivo que **ya no existe**.

Los correos, UUIDs, contraseñas e invite codes se omiten deliberadamente de este documento. Consultar los alias en el seed y entregar secretos solo mediante variables de entorno o el secret store de CI.

## Matriz vigente

| # | Alias | Rol/scope | Entrada | Propósito |
|---:|---|---|---|---|
| 1 | `soloCoach` | coach standalone | `/login` | workspace único y marca propia |
| 2 | `soloAlumno` | alumno standalone | `/c/e2e-aurora-strength/login` | shell `/c`, datos completos |
| 3 | `orgOwner` | owner enterprise sin fila `coaches` | `/org/login` | panel administrativo de la organización |
| 4 | `orgCoach` | coach `org_managed` | `/login` | workspace enterprise y alumno asignado |
| 5 | `orgAlumno` | alumno enterprise | `/e/e2e-performance-lab/login` | shell `/e`, contenido estampado con `org_id` |
| 6 | `teamOwner` | owner `team_managed`, `can_manage=true` | `/login` | gestión del pool |
| 7 | `teamCoach` | miembro `team_managed`, `can_manage=false` | `/login` | acceso full-pool según RLS |
| 8 | `poolAlumno` | alumno scope `team` | `/t/e2e-pool-vortex/login` | shell `/t`, consentimientos ya otorgados |
| 9 | `modulesCoach` | coach standalone con módulos habilitados | `/login` | matriz de navegación/entitlements; fuera de la matriz base de separación |

Los alumnos 2, 5 y 8 reciben intake, programa base, historial de entrenamientos, plan/logs de nutrición, check-ins y hábitos. El alumno de pool también recibe un programa creado por el coach miembro. La persona 9 conserva los cuatro módulos opcionales habilitados. El alumno 2 recibe además el plan canónico del hold (sección siguiente); ningún otro lo recibe.

El fixture multi-contexto usado para probar el selector de workspace es independiente de estas 9 personas y lo crea `scripts/e2e/seed-pool-fixture.mjs`. Sus overrides viven en `E2E_POOL_COACH_*`.

## Credenciales y sesiones

- `E2E_PERSONAS_PASSWORD` es la contraseña compartida; nunca se versiona.
- `JOSEFIT_ALUMNO_PASSWORD` puede sobrescribir la clave del demo Josefit; si falta, ese seed usa `E2E_PERSONAS_PASSWORD`.
- Sin `E2E_PERSONAS_PASSWORD`, los setups/specs de separación se omiten en vez de fallar por ausencia de secretos.
- `playwright/.auth/` contiene sesiones generadas y está ignorado por Git.
- Los emails estables viven en la constante `EMAILS` de `scripts/seed-e2e-personas.mjs`; los UUIDs los imprime el propio seed en su inventario. No duplicarlos en documentación.
- No usar estas cuentas para revisión de stores, demos públicas ni operaciones manuales fuera de E2E.

## Re-seed remoto

El seed usa `SUPABASE_SERVICE_ROLE_KEY` y muta el proyecto indicado por `NEXT_PUBLIC_SUPABASE_URL`. Debe tratarse como una operación sobre producción aunque el target configurado sea otro.

Efectos importantes:

- crea lo que falta sin borrar fixtures;
- sincroniza la contraseña de usuarios de prueba ya existentes;
- reconcilia los módulos de `modulesCoach`;
- imprime el target, espera 3 segundos y luego escribe;
- termina mostrando un inventario con IDs y conteos: tratar esa salida como sensible y no pegarla en issues o PRs públicos;
- cierra con una línea suelta `E2E_HOLD_PLAN_ID=<uuid>`, lista para copiar al entorno del spec del hold.

Requisitos: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_PERSONAS_PASSWORD`, flag `--allow-remote` y confirmación exacta `E2E_SEED_CONFIRM=yes`.

```powershell
$env:E2E_SEED_CONFIRM='yes'
$env:E2E_PERSONAS_PASSWORD='<desde-secret-store>'
pnpm seed:e2e-personas
```

Antes de que termine la cuenta regresiva, comprobar el target impreso. Abortarlo con `Ctrl+C` si no es el proyecto esperado.

## Ejecutar specs contra estas personas

1. Configurar `E2E_PERSONAS_PASSWORD` y el entorno web objetivo; usar `PLAYWRIGHT_BASE_URL` para un preview remoto.
2. No regenerar el seed si los fixtures ya existen y el cambio no exige nueva data.
3. Ejecutar siempre en serie (`--workers=1`): estas cuentas son compartidas y los specs mutan estado.

Con `tests/separation/` retirado, el único spec vivo sobre estas personas es el del plan canónico del hold, que se corre por archivo (no por project) dentro de `chromium`.

## Plan canónico del hold (E2E-SEED Dia B)

Fixture del tren «cuenta atrás en pantalla»: el escenario de seis pasos de `docs/specs/cuenta-atras-en-pantalla/DATA-TESTING.md` §6.5 necesita una superserie mixta con movilidad **por lado** y un bloque de **fuerza por tiempo**, y ninguna persona los tenía. Lo siembra `seedHoldCanonicalPlan` dentro de `scripts/seed-e2e-personas.mjs`, **solo** para el alumno standalone (persona 2), con datos sintéticos: jamás se copia el plan de un coach real.

Plan suelto (sin programa) titulado `E2E-SEED Dia B (hold)`, tres bloques contiguos en `main` —la superserie exige `superset_group` igual y `order_index` consecutivo—:

| # | Rol | Prescripción | Campos que importan |
|---:|---|---|---|
| 0 | Superserie B, miembro 1 | movilidad por lado, 3 × 5 s/lado, sin descanso propio | `exercise_type_override='mobility'`, `side_mode='per_side'`, `duration_sec=5`, `reps='5s/lado'`, `rest_time=''` |
| 1 | Superserie B, miembro 2 | fuerza por lado, 3 × 8-12, descanso de grupo | `exercise_type_override='strength'`, `side_mode='per_side'`, `reps='8-12'`, `rest_time='90'` |
| 2 | Bloque suelto | fuerza **por tiempo**, 3 × 5 s con 10 kg | `reps_unit='sec'`, `duration_sec=5`, `reps='5s'`, `target_weight_kg=10`, `rest_time='90'` |

Los 5 s son el mínimo del rango duro 5–600 del schema: con esa duración el spec espera el reloj **real** llegar a cero, sin reloj falso. El plan nace **sin logs** para que el alumno pueda registrar; el descanso del grupo (90 s) sale del máximo de los `rest_time` de los miembros, por eso el de movilidad va vacío.

Idempotencia: por título de plan. Si ya existe, el seed lo reencuentra, no toca nada y devuelve igual su id.

### Variables y ejecución

| Variable | Obligatoria | Para qué |
|---|---|---|
| `E2E_COACH_SLUG`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` | sí | login del alumno E2E (mismas del resto de los specs de alumno) |
| `E2E_HOLD_PLAN_ID` | sí | id del plan sembrado; sin ella el spec se omite entero |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` | opcionales | habilitan el paso 6, un assert de DB **de solo lectura**; sin ellas ese test se omite y los cinco pasos de UI corren igual |

El assert de DB se hace con la **anon key** y el login del propio alumno: RLS (`workout_logs_client`, `clients_read_blocks`) le deja leer sus series y los bloques de sus planes. Nunca `service_role`, nunca una clave en el repo.

```bash
pnpm exec playwright test tests/exec-hold-superset.spec.ts --workers=1
```

El spec **no borra nada**: las series que deja son del alumno E2E sobre un plan sintético y el seed no las toca al volver a correr.
