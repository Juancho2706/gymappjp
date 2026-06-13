import { test, expect, devices } from '@playwright/test'

/**
 * Landing "EVA Teams" — guard de la migracion teams-first (plan 02 / F4.1).
 *
 * No existia spec dedicado de landing; este sigue el estilo de
 * `tests/navigation-perf-smoke.spec.ts` (rutas publicas, sin auth).
 *
 * REGLA DURA (memoria project-movida-commercial): CERO numeros de precio en la
 * seccion Teams ni en el JSON-LD OfferCatalog Teams hasta que cierre la
 * negociacion Movida (12-jun). El guard anti-precio de abajo revienta si alguien
 * cuela un "$X" / "CLP X" / "X UF" / miles con punto chileno.
 *
 * Ejecucion: SOLO en el GATE autorizado (regla 2026-06-10). No se corre por tanda.
 */

// Cubre "$X", "$ X", "CLP X", "X UF" y miles con punto chileno (89.990) — un
// guard solo-`$` dejaria pasar "89.990 CLP".
const PRICE_RE = /\$\s?\d|CLP\s?\d|\bUF\b|\d{1,3}\.\d{3}/i

test.describe('landing EVA Teams (teams-first)', () => {
    test('nav: sin "Para Gyms", con "Teams" (desktop)', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('body')).toBeVisible()

        const nav = page.locator('nav').first()
        await expect(nav).toBeVisible()
        // El nav desktop expone el item Teams como ancla a #teams.
        await expect(nav.locator('a[href="#teams"]')).toContainText('Teams')
        // "Para Gyms" (enterprise) no debe existir en ninguna superficie del nav.
        await expect(nav.getByText('Para Gyms', { exact: false })).toHaveCount(0)
    })

    test('nav: item "Teams" presente en el sheet mobile', async ({ browser }) => {
        // Viewport movil para que el menu colapse al sheet (md:hidden).
        const context = await browser.newContext({ ...devices['Pixel 5'] })
        const page = await context.newPage()
        await page.goto('/')

        // Abrir el sheet. El trigger hamburguesa no tiene nombre accesible
        // (solo el icono lucide Menu), asi que lo tomamos como el unico <button>
        // del nav en viewport movil (los toggles viven dentro del sheet/desktop).
        await page.locator('nav button').first().click()

        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        await expect(sheet.locator('a[href="#teams"]')).toContainText('Teams')
        await expect(sheet.getByText('Para Gyms', { exact: false })).toHaveCount(0)

        await context.close()
    })

    test('seccion #teams existe y muestra el heading "EVA Teams"', async ({ page }) => {
        await page.goto('/')

        const section = page.locator('section#teams')
        await expect(section).toHaveCount(1)

        // El heading se ve al scrollear (whileInView).
        const heading = page.getByRole('heading', { name: /EVA Teams/i })
        await heading.scrollIntoViewIfNeeded()
        await expect(heading).toBeVisible()
    })

    test('guard anti-precio: cero numeros de precio en section#teams', async ({ page }) => {
        await page.goto('/')

        const section = page.locator('section#teams')
        await section.scrollIntoViewIfNeeded()
        const text = (await section.innerText()).trim()
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toMatch(PRICE_RE)
    })

    test('guard anti-precio: JSON-LD OfferCatalog Teams sin price/priceCurrency', async ({ page }) => {
        await page.goto('/')

        // El bloque JSON-LD de Teams se renderiza con id="teams-json-ld".
        const jsonLd = await page.locator('script#teams-json-ld').textContent()
        expect(jsonLd, 'JSON-LD de Teams debe existir').toBeTruthy()

        const parsed = JSON.parse(jsonLd!)
        expect(parsed.name).toBe('EVA Teams')
        // La regla dura anti-precio aplica tambien al markup.
        expect(jsonLd!).not.toContain('"price"')
        expect(jsonLd!).not.toContain('"priceCurrency"')
    })

    test('CTA de la seccion Teams: href al embudo medido + correo visible', async ({ page }) => {
        await page.goto('/')

        const section = page.locator('section#teams')
        await section.scrollIntoViewIfNeeded()

        const cta = section.locator('a[href^="/api/contact-teams?src="]')
        await expect(cta.first()).toBeVisible()
        const href = await cta.first().getAttribute('href')
        expect(href).toMatch(/^\/api\/contact-teams\?src=/)

        // El correo aparece como texto visible/copiable junto al CTA.
        await expect(section.getByText('contacto@eva-app.cl', { exact: false })).toBeVisible()
    })

    test('footnote del FinalCTA: href al embudo medido + correo visible', async ({ page }) => {
        await page.goto('/')

        const cta = page.locator('a[href^="/api/contact-teams?src="]')
        // Al menos uno de los CTAs (footnote del FinalCTA) apunta al embudo.
        const count = await cta.count()
        expect(count).toBeGreaterThanOrEqual(1)

        // El footnote del FinalCTA usa src=final-cta.
        const finalCta = page.locator('a[href="/api/contact-teams?src=final-cta"]')
        await finalCta.scrollIntoViewIfNeeded()
        await expect(finalCta).toBeVisible()
        await expect(finalCta).toContainText('contacto@eva-app.cl')
    })

    test('endpoint /api/contact-teams responde 302 a mailto: de ventas', async ({ request }) => {
        const res = await request.get('/api/contact-teams?src=teams-section', {
            maxRedirects: 0,
        })
        expect(res.status()).toBe(302)
        const location = res.headers()['location']
        expect(location).toBeTruthy()
        expect(location.startsWith('mailto:contacto@eva-app.cl')).toBe(true)
    })

    test('callout del pricing preview ancla a #teams', async ({ page }) => {
        await page.goto('/')

        // El callout esta ARRIBA de la seccion Teams → ancla hacia abajo (#teams).
        const anchor = page.locator('a[href="#teams"]')
        // Hay al menos 2 superficies que anclan #teams: nav + callout del pricing.
        expect(await anchor.count()).toBeGreaterThanOrEqual(2)
    })

    test('superficie publica: el body visible NO contiene "enterprise"', async ({ page }) => {
        await page.goto('/')
        // innerText = texto visible renderizado (excluye <script> JSON-LD).
        const bodyText = await page.locator('body').innerText()
        expect(bodyText).not.toMatch(/enterprise/i)
    })
})
