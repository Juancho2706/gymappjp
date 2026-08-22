---
status: active
owner: engineering
last_verified: "2026-08-22"
canonical: true
---

# QA con Playwright contra producción — modo suave

Reglas y procedimiento para correr QA automatizado contra `https://www.eva-app.cl` sin degradar el
servicio. No es backlog ni historial: si algo de acá deja de ser cierto, se corrige acá.

Playwright se queda. Lo que cambia es cómo se lo usa contra producción.

## Por qué existe este documento

El **2026-08-22** una tanda de QA abrió **seis navegadores en paralelo** contra producción. Cada uno
cargaba el panel del coach entero: dashboard, directorio, guía, cada pantalla con sus consultas, sus
imágenes de Supabase Storage y su telemetría. Multiplicado por seis y sin pausas, **la base de datos
se cayó**.

Ninguna de las tres piezas era el problema por sí sola. El problema fue la suma: paralelismo, cero
ritmo y ningún mecanismo que se diera cuenta de que la base estaba sufriendo y frenara. El modo
suave ataca las tres.

## Las reglas

Son reglas operativas, no sugerencias. La configuración hace cumplir las que puede; el resto
dependen de quien lanza la tanda.

| Regla | Detalle | Quién la hace cumplir |
|---|---|---|
| **Un solo navegador** | `workers: 1`, `fullyParallel: false` | el proyecto `prod-suave` + un guard en tiempo de ejecución que aborta si detecta un segundo worker |
| **Un solo proceso a la vez** | nunca dos `playwright test` simultáneos, ni Playwright mientras corre un seed, un script de catálogo o una migración | quien lanza |
| **Tandas de ≤ 15 min** | si una tanda no cierra en 15 minutos, se corta y se parte en dos | quien lanza |
| **Una especialidad por tanda** | una tanda mira el embudo, o la nutrición, o el onboarding. Nunca las tres | quien lanza |
| **Techo de tráfico** | menos de **1.000 requests cada 10 minutos** contra el sitio, contando todo lo que la tanda dispare | la dieta de red + el ritmo lo dejan holgado; medir en el reporte HTML si se agregan specs |
| **Horario** | fuera del pico de uso de los coaches: **antes de las 09:00 o después de las 22:00 (hora de Chile)**. Nunca durante una campaña activa de Meta Ads ni mientras haya un release en revisión | quien lanza |
| **Cero mutaciones por defecto** | los smokes leen. Un flujo con escritura necesita cuenta QA dedicada e idempotencia (ver abajo) | revisión del diff |
| **Sin `networkidle`** | prohibido `waitForLoadState('networkidle')` y `waitUntil: 'networkidle'` | `pnpm qa:lint` |

### Cuentas QA

- **Dominio obligatorio `@evatest.cl`.** [`tests/e2e-accounts.ts`](../../tests/e2e-accounts.ts) lanza
  en seco si la tanda apunta a otro correo. Existe por un incidente real: una suite E2E llegó al
  workspace de demos del CEO y archivó el plan de una alumna de verdad.
- **Código de coach de 5 caracteres**, en mayúsculas, reconocible como QA (`QAEMB`, `QAFV3`). Sirve
  para encontrar y purgar la cuenta después.
- **Credenciales solo por env**: `E2E_QA_COACH_EMAIL` y `E2E_QA_COACH_PASSWORD`. Nunca en el repo,
  nunca en este documento. Sin esas variables la tanda entera queda *skipped* — que es el resultado
  correcto, no un fallo a arreglar.
- **Purga por lista, no por barrido.** Al cerrar una campaña de QA se borran las cuentas **anotadas
  por id o por correo exacto**. Un `DELETE ... WHERE email LIKE '%evatest%'` contra la base de
  producción es exactamente el tipo de operación que no corremos.

## Cómo correr una tanda

```bash
# 1. Credenciales de la cuenta QA en el entorno (o en .env.local, que ya está ignorado por git).
export E2E_QA_COACH_EMAIL="qa-...@evatest.cl"
export E2E_QA_COACH_PASSWORD="..."

# 2. La tanda. Un solo navegador, headless.
pnpm qa:prod:suave

# 3. Misma tanda, viendo el navegador (para QA visual del dueño).
pnpm qa:prod:suave:headed

# 4. El reporte, con los adjuntos del guardián y de la consola.
npx playwright show-report
```

Para apuntar a un Preview de Vercel en vez de producción, `PLAYWRIGHT_BASE_URL` manda:

```bash
PLAYWRIGHT_BASE_URL="https://mi-preview.vercel.app" pnpm qa:prod:suave
```

El lint de los tests es aparte y no toca la red:

```bash
pnpm qa:lint
```

### Qué hace el modo suave por vos

Configurado en [`playwright.config.ts`](../../playwright.config.ts) (proyectos `setup` y
`prod-suave`) y en [`tests/_fixtures/suave.ts`](../../tests/_fixtures/suave.ts):

- **Un solo login por tanda.** El proyecto `setup` se autentica una vez y guarda la sesión en
  `.auth/qa-coach.json` (ignorado por git). Los specs arrancan logueados: cada `/login` que no
  ocurre es un round-trip menos a Supabase Auth y una carga de panel menos.
- **Ritmo humano** (`pace`): ~400 ms de reposo después de cada navegación y ~1,2 s entre tests.
- **Dieta de red** (`diet`): se abortan imágenes, fuentes y videos de Supabase Storage, las
  peticiones al optimizador de imágenes de Next —que proxea Storage y consume la cuota de Image
  Transformations— y todo lo de los terceros de telemetría (PostHog, Sentry, Cloudflare Insights,
  Google, Meta). **Nunca** se aborta `/rest/`, `/auth/`, `/api/` ni los chunks JS/CSS: abortarlos
  convertiría el smoke en un test de la dieta. La decisión vive en
  [`tests/_fixtures/route-diet.ts`](../../tests/_fixtures/route-diet.ts) y está cubierta por Vitest.
- **Sin reintentos** (`retries: 0`). Un test rojo porque la base está caída no se reintenta: el
  reintento es más carga sobre lo mismo que ya falló.
- **Errores de consola y 5xx** quedan adjuntos al reporte como evidencia, sin poner el test rojo.

## El guardián de salud

Antes de **cada** test, el fixture `healthGuard` hace un `GET /api/health` con timeout de 5 s. Es un
solo intento: preguntarle dos veces a una base caída es golpearla dos veces.

`/api/health` ([código](../../apps/web/src/app/api/health/route.ts)) hace un `count` sobre `coaches`
y responde `{ status, db, latencyMs }`. El guardián corta la tanda si:

| Señal | Qué significa |
|---|---|
| no responde en 5 s | `unreachable` — el sitio no contesta |
| HTTP ≠ 200 | `http-status` — el health route ya devuelve 503 cuando la DB falla |
| round-trip > 2000 ms | `client-slow` — el sitio contesta, pero lento |
| `latencyMs` > 2000 ms | `db-slow` — **la señal que buscamos**: Vercel responde rápido pero la consulta a Supabase se arrastra |
| `db` ≠ `"ok"` | `db-not-ok` — la consulta de salud falló |
| `status` ≠ `"ok"` | `status-not-ok` — degradado por otro motivo |

Cuando corta, **marca la tanda entera**: ese test y **todos los siguientes** quedan *skipped* con el
mismo motivo, sin volver a preguntar. La lógica es pura y está en
[`tests/_fixtures/health-decision.ts`](../../tests/_fixtures/health-decision.ts), con tests de Vitest
que cubren latencia, status y shape — se puede tocar el umbral sin abrir un navegador.

### Cómo leer el resultado

- **Todo verde** → la tanda corrió y la base estuvo sana de punta a punta.
- **Todo *skipped* con `GUARDIÁN: tanda detenida (...)`** → la base estaba sufriendo. **No es un
  bug de los tests y no se vuelve a lanzar de inmediato.** Se lee el motivo en el adjunto
  `health.txt`, se espera a que se recupere y recién ahí se relanza.
- **Los primeros verdes y el resto *skipped*** → la base se degradó **durante** la tanda. Vale la
  pena mirar si la degradación arrancó justo con el primer test: puede ser que una pantalla del
  smoke sea, ella misma, cara.
- **Todo *skipped* sin mención del guardián** → faltan `E2E_QA_COACH_EMAIL` /
  `E2E_QA_COACH_PASSWORD`; el proyecto `setup` se saltó y no hay sesión.
- **Rojo con `parallelIndex`** → alguien forzó más de un worker. Ver la primera regla.

## Escribir un spec nuevo

Los specs viven en `tests/smoke/**` y usan el fixture suave, no `@playwright/test` directo:

```ts
import { test, expect } from '../_fixtures/suave'

test('la pantalla X carga', async ({ page }) => {
    await page.goto('/coach/x')
    await expect(page.getByRole('heading', { name: /X/i })).toBeVisible()
})
```

[`tests/smoke/coach-basico.spec.ts`](../../tests/smoke/coach-basico.spec.ts) es la plantilla:
tres recorridos de solo lectura y, al final, el patrón completo para un flujo con mutación (cuenta
QA dedicada, idempotencia, una escritura por tanda, limpieza por lista).

Aserciones baratas. Un smoke responde «la pantalla carga logueada y no explota»; que el dashboard
calcule bien un total se prueba con Vitest, sin tocar producción.

## Qué NO va en modo suave

- Suites que mutan estado compartido → proyecto `nutrition-v2`, contra un Preview.
- La suite general (`tests/*.spec.ts`) → proyecto `chromium`, contra el dev server local con
  Supabase local. `tests/smoke/**` está explícitamente excluido de ese proyecto para que no se cuele
  en un fan-out paralelo.
- Cualquier cosa contra `apps/enterprise`, congelada desde el 2026-08-06.

## Relacionados

- [Runbook de incidentes](RUNBOOK.md) — qué hacer si la base se cae de verdad.
- [Personas E2E](../testing/E2E_PERSONAS.md) — cuentas de prueba permanentes.
- [Estado de los tests](../testing/TEST_STATUS.md).
