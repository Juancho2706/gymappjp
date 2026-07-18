# E2E Nutrición V2 (canary)

Suite Playwright para los flujos de Nutrición V2. Vive en su propio project de Playwright
(`nutrition-v2` en `playwright.config.ts`), serial, y **no** corre en la suite `chromium` por
defecto. Cada spec se auto-omite (skip) si le faltan sus variables de entorno, así que en una
corrida local normal (`npx playwright test`) toda la carpeta queda inerte.

> Estos tests los ejecuta el orquestador **con autorización del CEO**. 4 de los 5 specs corren
> contra el **Preview de Vercel**, que escribe en **Supabase de producción**. Por eso las
> mutaciones son mínimas, auto-contenidas y acotadas al alumno de prueba **E2E propio**
> (E2E Solo Alumno del coach Aurora Strength).
>
> ⚠️ **Regla dura (incidente 2026-07):** la suite E2E SOLO toca cuentas de prueba propias —
> **jamás** el workspace de demos del CEO (josefit). Una corrida antigua archivó el plan real
> "Plancito 4" de una alumna del CEO por hacer roster-search por nombre. Hoy los defaults apuntan
> al fixture E2E y el guard `assertE2eAccounts` (ver `tests/e2e-accounts.ts`) revienta en seco si
> algún email/slug/clientId cae fuera del allowlist.

## Los 5 specs

| Spec | Entorno | Muta prod | Qué hace |
|------|---------|-----------|----------|
| `coach-hub.spec.ts` | Preview (canary) | No | Coach entra a `/coach/nutrition-v2`; el roster carga con el canary ON (no redirige a V1). |
| `builder-publish.spec.ts` | Preview (canary) | **Sí** (1 plan) | Publica un plan de 4 pasos con catálogo sobre E2E Solo Alumno, nombre `E2E-<timestamp>`. |
| `ficha-coach.spec.ts` | Preview (canary) | No | La ficha de E2E Solo Alumno muestra el plan vigente (sección "Plan vigente" + badge de versión). |
| `alumno-hoy.spec.ts` | Preview (canary) | **Sí** (1 registro, auto-revertido) | E2E Solo Alumno ve "Hoy", marca "Lo comí" y **retira** el registro desde la UI. |
| `fail-closed.spec.ts` | **Dev local** (sin `EDGE_CONFIG`) | No | Coach/alumna sin canary redirigen a la nutrición V1 intacta. |

## Variables de entorno

Credenciales **siempre** por env — nunca hardcodeadas. Sin ellas, el spec hace skip.

| Variable | Specs | Notas |
|----------|-------|-------|
| `PLAYWRIGHT_BASE_URL` | 1-4 | URL del Preview de Vercel del branch. **Requerida** para los specs de canary; su ausencia también apaga el dev-server local del config. |
| `E2E_COACH_EMAIL` / `E2E_COACH_PASSWORD` | 1-3, 5 | Coach de prueba E2E en Preview (p.ej. `e2e-solo-coach@evatest.cl`); una persona coach del stack **local** para `fail-closed`. **Debe** ser una cuenta `@evatest.cl` — el guard rechaza cualquier otra. |
| `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD` | 4, 5 | Alumno E2E `@evatest.cl` (Preview) / persona alumna local (`fail-closed`). |
| `E2E_COACH_SLUG` | 4, 5 | Slug del coach para la shell del alumno (`/c/[slug]/…`). Default `e2e-aurora-strength`; solo se aceptan slugs de `tests/e2e-accounts.ts`. |
| `E2E_STUDENT_CLIENT_ID` | 2, 3 | `clientId` (UUID) del alumno E2E. Default: E2E Solo Alumno (`01c36cde-…`). Hace deterministas builder/ficha SIN roster-search (el roster-search por nombre fue el mecanismo del incidente). Solo se aceptan clientIds de la lista permitida. |
| `E2E_STUDENT_NAME` | 2, 3 | Nombre del alumno E2E en el roster (default `E2E Solo Alumno`). |
| `E2E_COACH_WORKSPACE` | 1-3 | Etiqueta del workspace standalone del coach E2E (default `Aurora Strength`). |
| `E2E_FOOD_QUERY` | 2 | Término de catálogo para el builder (default `pollo`). Ajustar si el catálogo no lo tiene. |

## Cómo correr

Specs de canary (contra Preview, con autorización):

```bash
PLAYWRIGHT_BASE_URL="https://gymappjp-git-rnmobiledenuevo-juancho2706s-projects.vercel.app" \
E2E_COACH_EMAIL=... E2E_COACH_PASSWORD=... \
E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... \
E2E_COACH_SLUG=... E2E_STUDENT_CLIENT_ID=... \
npx playwright test --project=nutrition-v2 --workers=1
```

Recomendado correr `builder-publish` primero: crea el plan que `ficha-coach` y `alumno-hoy`
leen (ambos hacen **skip** con mensaje claro si el alumno E2E no tiene plan vigente).

Solo el fail-closed (dev local, **sin** `PLAYWRIGHT_BASE_URL`, sin `EDGE_CONFIG`):

```bash
E2E_COACH_EMAIL=... E2E_COACH_PASSWORD=... \
E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... E2E_COACH_SLUG=... \
npx playwright test --project=nutrition-v2 --workers=1 fail-closed
```

(El dev-server local arranca solo; `fail-closed` se auto-omite si `PLAYWRIGHT_BASE_URL` está seteado.)

## Mutaciones en producción y cómo limpiarlas

- **`builder-publish`**: deja UN plan vigente `E2E-<timestamp>` sobre E2E Solo Alumno (precondición
  de los otros specs). Cada corrida crea una nueva **versión** que supersede la anterior, así que no
  se acumulan planes activos (solo versiones). **Limpieza:** en `/coach/nutrition-v2/<clientId>` →
  botón **"Archivar plan"** → confirmar. La ficha pasa a "Sin plan vigente"; el historial se conserva.
- **`alumno-hoy`**: crea UN registro de consumo y lo **retira en el mismo spec** ("Retirar registro").
  Neto: adherencia neutralizada via correccion (el registro original + la correccion persisten por diseno). Si el spec falla a mitad, retirar el registro sobrante desde
  "Hoy" → "Consumido hoy" → ícono de basura, o corregirlo desde la ficha del coach.
- Ningún spec toca a otros alumnos, coaches ni datos fuera del alumno de prueba E2E.

## data-testid usados (web V2)

Estables, agregados solo donde los selectores por rol/texto no bastaban:

- `nutrition-v2-hub-roster` — contenedor del roster del Centro (coach).
- `nutrition-v2-builder-stepper` — stepper del builder de planes.
- `nutrition-v2-plan-vigente` / `nutrition-v2-plan-empty` — estado de la ficha del coach.
- `nutrition-v2-lo-comi` — botón "Lo comí" de la prescripción del día (alumno).
