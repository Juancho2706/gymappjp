import { test, expect } from '@playwright/test'

/**
 * F5 — Enterprise archive: verificaciones de estado post-limpieza de textos y rutas.
 *
 * Project: chromium (sin auth — paginas publicas y endpoints de infraestructura).
 * NO requiere storageState ni setup de personas.
 *
 * Cobertura:
 *   1. /legal             — sin referencias enterprise; con referencias planes empresariales + contacto
 *   2. /privacidad        — §11 reescrita (sin oferta "plan Enterprise"; conserva responsable/encargado)
 *   3. /legal/contrato-enterprise — pagina dormida (200), sin precio $49.990
 *   4. /enterprise        — 200 con noindex; sin precio $89.990
 *   5. (skip F6) redirect 308 /enterprise → /pricing — habilitar cuando Plan 02 lo active
 *   6. (F7) GET /api/cron/* sin Authorization → 401
 */

test.describe('F5 — /legal: textos enterprise archivados', () => {
  test('GET /legal responde 200', async ({ page }) => {
    const response = await page.goto('/legal')
    expect(response?.status()).toBe(200)
  })

  test('/legal NO contiene "Plan Enterprise" ni "$49.990"', async ({ page }) => {
    await page.goto('/legal')
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('Plan Enterprise')
    expect(body).not.toContain('$49.990')
  })

  test('/legal SI contiene "planes empresariales" y "contacto@eva-app.cl"', async ({ page }) => {
    await page.goto('/legal')
    const body = await page.locator('body').textContent()
    expect(body?.toLowerCase()).toContain('planes empresariales')
    expect(body).toContain('contacto@eva-app.cl')
  })

  test('/legal: el footer NO enlaza a /legal/contrato-enterprise', async ({ page }) => {
    await page.goto('/legal')
    const footer = page.locator('footer')
    const enterpriseContractLink = footer.locator('a[href*="/legal/contrato-enterprise"]')
    await expect(enterpriseContractLink).toHaveCount(0)
  })
})

test.describe('F5 — /privacidad: §11 reescrita', () => {
  test('GET /privacidad responde 200', async ({ page }) => {
    const response = await page.goto('/privacidad')
    expect(response?.status()).toBe(200)
  })

  test('/privacidad §11: NO contiene oferta "plan Enterprise"', async ({ page }) => {
    await page.goto('/privacidad')
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('plan Enterprise')
  })

  test('/privacidad §11: conserva "responsables del tratamiento" y "encargado"', async ({ page }) => {
    await page.goto('/privacidad')
    const body = await page.locator('body').textContent()
    expect(body?.toLowerCase()).toContain('responsables del tratamiento')
    expect(body?.toLowerCase()).toContain('encargado')
  })
})

test.describe('F5 — /legal/contrato-enterprise: pagina dormida', () => {
  test('GET /legal/contrato-enterprise responde 200 (dormida, no rota)', async ({ page }) => {
    const response = await page.goto('/legal/contrato-enterprise')
    expect(response?.status()).toBe(200)
  })

  test('/legal/contrato-enterprise contiene aviso historico', async ({ page }) => {
    await page.goto('/legal/contrato-enterprise')
    const body = await page.locator('body').textContent()
    // La pagina archivada debe señalar que ya no esta activa / es historica.
    // El aviso puede contener "archivado", "historico", "vigente" negado, o similar.
    // Ajustar el texto exacto cuando se implemente el aviso en Plan 02 F5.
    expect(body?.toLowerCase()).toMatch(/archiv|hist[oó]r|no comercializa|ya no (esta|está)|dej(o|ó) de estar vigente/i)
  })

  test('/legal/contrato-enterprise NO contiene "$49.990"', async ({ page }) => {
    await page.goto('/legal/contrato-enterprise')
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('$49.990')
  })
})

test.describe('F5 — /enterprise: noindex y sin precio $89.990', () => {
  test('GET /enterprise responde 200', async ({ page }) => {
    const response = await page.goto('/enterprise')
    expect(response?.status()).toBe(200)
  })

  test('/enterprise: <head> tiene meta robots con noindex', async ({ page }) => {
    await page.goto('/enterprise')
    const robotsMeta = page.locator('meta[name="robots"]')
    await expect(robotsMeta).toHaveCount(1)
    const content = await robotsMeta.getAttribute('content')
    expect(content?.toLowerCase()).toContain('noindex')
  })

  test('/enterprise: meta description NO contiene "$89.990"', async ({ page }) => {
    await page.goto('/enterprise')
    const descriptionMeta = page.locator('meta[name="description"]')
    const content = await descriptionMeta.getAttribute('content')
    // Si no existe meta description, el assertion pasa (null no contiene el precio).
    expect(content ?? '').not.toContain('$89.990')
  })
})

/**
 * F6 — Redirect 308 /enterprise → /pricing.
 *
 * SKIP hasta que Plan 02 active el redirect permanente.
 * Para habilitar: quitar test.skip y ajustar si el Location usa URL absoluta o relativa.
 */
test.describe('F6 — redirect /enterprise → /pricing (pendiente Plan 02)', () => {
  test.skip(
    true,
    'Habilitar cuando el redirect 308 /enterprise → /pricing este activo (Plan 02 F6)',
  )

  test('GET /enterprise sin seguir redirects → 308 con Location /pricing', async ({ request }) => {
    const response = await request.get('/enterprise', { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    const location = response.headers()['location']
    expect(location).toMatch(/\/pricing$/)
  })
})

/**
 * F7 — Guards fail-closed en endpoints de cron.
 *
 * Los endpoints /api/cron/* deben rechazar con 401 cualquier
 * request que no lleve el header Authorization correcto.
 */
test.describe('F7 — /api/cron/* fail-closed sin Authorization', () => {
  test('GET /api/cron/purge-data sin Authorization → 401', async ({ request }) => {
    const response = await request.get('/api/cron/purge-data')
    expect(response.status()).toBe(401)
  })

  test('GET /api/cron/org-health-alert sin Authorization → 401', async ({ request }) => {
    const response = await request.get('/api/cron/org-health-alert')
    expect(response.status()).toBe(401)
  })
})
