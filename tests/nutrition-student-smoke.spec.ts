import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

function requireE2ECreds() {
  test.skip(!slug || !email || !password, 'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD')
}

async function loginClient(page: Page) {
  await page.goto(`/c/${slug}/login`)
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Contraseña').fill(password!)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForTimeout(1500)
}

/**
 * Navega a la entrada legacy `/c/{slug}/nutrition` y resuelve QUÉ superficie quedó montada.
 *
 * Con el canary de Nutrición V2 ON para este alumno, la página V1 hace `redirect()` a
 * `/c/{slug}/nutrition-v2` (y la V2 hace el redirect inverso cuando está OFF). Antes este smoke
 * afirmaba SIEMPRE el heading V1 "Plan Nutricional", así que con V2 encendido fallaba justo en
 * el escenario que se quiere certificar (SEC-9, claim 1). Ahora sigue el redirect y afirma la
 * superficie que corresponda:
 *   · V1  → heading "Plan Nutricional".
 *   · V2  → heading "Nutrición" (shell de `NutritionPageShell`; el estado "Nutrición no
 *           disponible" del dominio apagado usa el mismo h1, y también es una carga sana).
 */
async function gotoNutritionSurface(page: Page): Promise<'v1' | 'v2'> {
  await page.goto(`/c/${slug}/nutrition`)
  // El redirect es server-side: al resolver el goto la URL ya es la definitiva. Se espera igual por
  // si el canary resuelve tarde. El predicado NO matchea /login, así que una sesión caída revienta
  // acá con la URL real en el mensaje en vez de fallar más abajo por un heading ausente.
  await page.waitForURL((url) => url.pathname.endsWith('/nutrition') || url.pathname.endsWith('/nutrition-v2'), {
    timeout: 25_000,
  })
  return new URL(page.url()).pathname.endsWith('/nutrition-v2') ? 'v2' : 'v1'
}

async function expectNutritionHeading(page: Page, surface: 'v1' | 'v2') {
  const name = surface === 'v2' ? 'Nutrición' : 'Plan Nutricional'
  await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 20_000 })
}

test.describe('Student nutrition smoke', () => {
  test('login -> nutricion carga sin error', async ({ page }) => {
    test.setTimeout(90_000)
    requireE2ECreds()

    await loginClient(page)
    const surface = await gotoNutritionSurface(page)
    await expectNutritionHeading(page, surface)
    await expect(page.locator('body')).toContainText(
      surface === 'v2'
        ? /Nutrición|Sin plan vigente|Todavía no|Hoy/i
        : /Plan Nutricional|Sin plan asignado|Copia local/i,
    )
  })

  test('nutricion mantiene experiencia offline basica', async ({ page, context }) => {
    test.setTimeout(90_000)
    requireE2ECreds()

    await loginClient(page)
    const surface = await gotoNutritionSurface(page)
    await expectNutritionHeading(page, surface)

    try {
      await context.setOffline(true)
      // Sin conexión la página ya renderizada debe seguir en pie (V1 tiene copia local/cola PWA;
      // V2 mantiene el shell servido). No se afirma cola offline en V2: no la replica (SEC-8).
      await expect(page.locator('body')).toContainText(
        surface === 'v2'
          ? /Nutrición|Sin conexion|Sin conexión/i
          : /Sin conexion|Plan Nutricional|Copia local|Sin conexión/i,
      )
    } finally {
      await context.setOffline(false)
    }
  })
})
