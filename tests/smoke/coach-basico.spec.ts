import { test, expect } from '../_fixtures/suave'

/**
 * SMOKE SUAVE DEL COACH - tres pantallas, cero mutaciones.
 *
 * Plantilla de referencia para toda tanda de QA contra produccion. Lo que hace que sea "suave"
 * no esta aca sino en `tests/_fixtures/suave.ts` (ritmo, dieta de red, guardian de salud) y en
 * el proyecto `prod-suave` de `playwright.config.ts` (1 worker, sin paralelismo, sin reintentos).
 * Este archivo solo tiene que respetar dos reglas:
 *
 *  1. SOLO LECTURA. Ningun test escribe en la base de un coach real. Ver el comentario del final
 *     para el unico patron aceptable de test con mutacion.
 *  2. Pocas pantallas por tanda. Tres recorridos son ~3 cargas de panel; una tanda de veinte
 *     specs deja de ser un smoke y vuelve a ser carga.
 *
 * Las aserciones son deliberadamente baratas: titulo, URL y el landmark de navegacion. Un smoke
 * responde "la pantalla carga logueada y no explota", no "el dashboard calcula bien el total".
 * Eso ultimo se prueba con Vitest, sin tocar produccion.
 */

test.describe('@smoke coach - solo lectura', () => {
    test('el dashboard carga con sesion', async ({ page }) => {
        await page.goto('/coach/dashboard')

        // `/coach/dashboard` redirige a `/coach/guia` en la PRIMERA entrada del coach (el redirect
        // vive en `coach/dashboard/page.tsx`). Las dos rutas son un aterrizaje valido; lo que no
        // puede pasar es terminar en `/login`.
        await expect(page).toHaveURL(/\/coach\/(dashboard|guia)/)
        await expect(page.locator('nav[aria-label="Navegación principal"]').first()).toBeVisible()
        await expect(page).toHaveTitle(/EVA/)
    })

    test('el directorio de alumnos carga', async ({ page }) => {
        await page.goto('/coach/clients')

        await expect(page).toHaveURL(/\/coach\/clients/)
        await expect(page).toHaveTitle(/Alumnos/)
        await expect(page.locator('nav[aria-label="Navegación principal"]').first()).toBeVisible()
    })

    test('la guia de primeros pasos carga', async ({ page }) => {
        await page.goto('/coach/guia')

        await expect(page).toHaveURL(/\/coach\/guia/)
        await expect(page.getByRole('heading', { name: /Tus primeros pasos/i })).toBeVisible()
    })
})

/**
 * COMO SE ESCRIBIRIA UN FLUJO CON MUTACION (y por que no hay ninguno aca).
 *
 * Un test que escribe en produccion solo es aceptable con las cuatro condiciones juntas:
 *
 *  1. CUENTA QA DEDICADA. La mutacion pasa sobre una cuenta `@evatest.cl` creada para la tanda,
 *     nunca sobre un coach o un alumno real. `assertAllowedE2eEmail` (tests/e2e-accounts.ts) ya
 *     corta en seco cualquier correo fuera de ese dominio: existe porque una suite E2E llego a
 *     archivar el plan de una alumna real del workspace del CEO.
 *
 *  2. IDEMPOTENTE. El test deja la cuenta como la encontro, y correrlo dos veces seguidas da el
 *     mismo resultado. En la practica: nombres con sufijo unico (`qa-${Date.now()}`), y la
 *     limpieza en un `afterEach` que corre aunque el test falle, no al final del `test()`.
 *
 *  3. UNA MUTACION POR TANDA. El costo de escribir no es el INSERT: son los revalidate, los
 *     triggers y las lecturas que se disparan detras. Un solo flujo de escritura por tanda.
 *
 *  4. LIMPIEZA POR LISTA, NO POR BARRIDO. Lo creado se anota y se borra por id. Un `DELETE ...
 *     WHERE email LIKE '%evatest%'` es exactamente el tipo de barrido que no queremos correr
 *     contra la base de produccion.
 *
 * Esqueleto:
 *
 *   test('crea y archiva un alumno QA', async ({ page }) => {
 *       const nombre = `QA Suave ${Date.now()}`
 *       let creadoId: string | null = null
 *
 *       try {
 *           await page.goto('/coach/clients')
 *           // ... alta del alumno, guardando `creadoId` de la URL o del DOM
 *       } finally {
 *           if (creadoId) {
 *               // ... archivar/borrar ESE id, por la misma UI que lo creo
 *           }
 *       }
 *   })
 *
 * Si el flujo no se puede dejar idempotente, no va en produccion: va contra un Preview de Vercel
 * con Supabase local, que es para lo que existe el proyecto `chromium` de la config.
 */
