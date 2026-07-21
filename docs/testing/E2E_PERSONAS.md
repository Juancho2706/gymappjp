---
status: active
owner: quality-engineering
last_verified: "2026-07-21 @ f5301858"
canonical: true
---

# Personas E2E de separación de flujos

Inventario operativo de los fixtures permanentes para `coach_standalone`, `enterprise_coach` y `coach_team`.

Fuentes ejecutables:

- `scripts/seed-e2e-personas.mjs`: crea/reconcilia las 9 personas y su data;
- `tests/separation/personas.ts`: aliases, rutas, marcas y variables usadas por Playwright;
- `tests/separation/auth.setup.ts`: login y generación de `playwright/.auth/`.

Los correos, UUIDs, contraseñas e invite codes se omiten deliberadamente de este documento. Consultar los aliases en código y entregar secretos solo mediante variables de entorno o el secret store de CI.

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

Los alumnos 2, 5 y 8 reciben intake, programa base, historial de entrenamientos, plan/logs de nutrición, check-ins y hábitos. El alumno de pool también recibe un programa creado por el coach miembro. La persona 9 conserva los cuatro módulos opcionales habilitados.

El fixture multi-contexto usado para probar el selector de workspace es independiente de estas 9 personas y lo crea `scripts/e2e/seed-pool-fixture.mjs`. Sus overrides viven en `E2E_POOL_COACH_*`.

## Credenciales y sesiones

- `E2E_PERSONAS_PASSWORD` es la contraseña compartida; nunca se versiona.
- `JOSEFIT_ALUMNO_PASSWORD` puede sobrescribir la clave del demo Josefit; si falta, ese seed usa `E2E_PERSONAS_PASSWORD`.
- Sin `E2E_PERSONAS_PASSWORD`, los setups/specs de separación se omiten en vez de fallar por ausencia de secretos.
- `playwright/.auth/` contiene sesiones generadas y está ignorado por Git.
- Los emails y UUIDs estables viven en `tests/separation/personas.ts`; no duplicarlos en documentación.
- No usar estas cuentas para revisión de stores, demos públicas ni operaciones manuales fuera de E2E.

## Re-seed remoto

El seed usa `SUPABASE_SERVICE_ROLE_KEY` y muta el proyecto indicado por `NEXT_PUBLIC_SUPABASE_URL`. Debe tratarse como una operación sobre producción aunque el target configurado sea otro.

Efectos importantes:

- crea lo que falta sin borrar fixtures;
- sincroniza la contraseña de usuarios de prueba ya existentes;
- reconcilia los módulos de `modulesCoach`;
- imprime el target, espera 3 segundos y luego escribe;
- termina mostrando un inventario con IDs y conteos: tratar esa salida como sensible y no pegarla en issues o PRs públicos.

Requisitos: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_PERSONAS_PASSWORD`, flag `--allow-remote` y confirmación exacta `E2E_SEED_CONFIRM=yes`.

```powershell
$env:E2E_SEED_CONFIRM='yes'
$env:E2E_PERSONAS_PASSWORD='<desde-secret-store>'
pnpm seed:e2e-personas
```

Antes de que termine la cuenta regresiva, comprobar el target impreso. Abortarlo con `Ctrl+C` si no es el proyecto esperado.

## Ejecutar la suite

1. Configurar `E2E_PERSONAS_PASSWORD` y el entorno web objetivo; usar `PLAYWRIGHT_BASE_URL` para un preview remoto.
2. No regenerar el seed si los fixtures ya existen y el cambio no exige nueva data.
3. Ejecutar en serie:

```bash
pnpm exec playwright test --project=separation --workers=1
```

El proyecto `separation` depende de `setup`, que genera/reutiliza storage states. Las expectativas detalladas de sidebar, marcas, rutas y módulos viven en `tests/separation/personas.ts`; actualizarlas junto al código cuando cambie la navegación.
