import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { BRANDS, PERSONAS, SLUGS, type Persona } from './personas'

/**
 * Suite C — Branding y theming por contexto (separación de 3 flujos).
 *
 * Verifica que cada shell (panel coach y app alumno) renderiza la marca CORRECTA de su
 * contexto (standalone / enterprise / team) y que no hay fuga de marcas entre contextos.
 *
 * Personas Wave 2 (seed E2E, ver tests/separation/personas.ts):
 *   - solo:  coach "Aurora Strength" #F59E0B  (slug e2e-aurora-strength)
 *   - org:   "E2E Performance Lab"   #8B5CF6  (slug e2e-performance-lab)
 *   - team:  "E2E Pool Vortex"       #EC4899  (slug e2e-pool-vortex)
 *
 * Sesiones via storageState pregenerado (setup de auth de esta suite); los specs de login
 * publico corren sin estado. Cada bloque se salta si falta su storage state.
 *
 * NOTA theming: el panel coach inyecta --theme-primary con el hex CRUDO de la marca
 * (generateBrandPalette(primaryColor).primary), asi que ahi se compara EXACTO. El shell de
 * alumno (/c y sus rewrites /t y /e) pasa la marca por brand-kit clampAccent() que puede
 * OSCURECER el accent para cumplir AA en light mode (p.ej. ambar #F59E0B no pasa AA sobre
 * blanco) — ahi se acepta hex exacto O mismo matiz (Δhue <= 18°), que igual discrimina
 * ambar(38°) / violeta(258°) / rosa(330°) / defaults EVA (#007AFF=211°, #10B981=160°).
 *
 * Ejecutar: npx playwright test tests/separation/branding.spec.ts --workers=1
 */

const SOLO = BRANDS.standalone // { name: 'Aurora Strength', color: '#F59E0B' }
const ORG = BRANDS.enterprise // { name: 'E2E Performance Lab', color: '#8B5CF6' }
const TEAM = BRANDS.team // { name: 'E2E Pool Vortex', color: '#EC4899' }

const SOLO_COACH_SLUG = SLUGS.coach
const ORG_SLUG = SLUGS.org
const TEAM_SLUG = SLUGS.team

// Storage states pregenerados por tests/separation/auth.setup.ts (rutas en PERSONAS.*.storageState).
const hasState = (persona: Persona) => fs.existsSync(persona.storageState)

const NO_SESSION: { cookies: never[]; origins: never[] } = { cookies: [], origins: [] }

/**
 * Overlay de error de Next dev (no el portal: <nextjs-portal> siempre existe en dev 16 como host
 * del boton DevTools). El dialogo vive en shadow DOM; los locators CSS lo atraviesan.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

// ---------------------------------------------------------------------------
// Helpers de color: normalizacion hex (case-insensitive, rgb() -> hex) + matiz
// ---------------------------------------------------------------------------

/** Normaliza un color CSS a hex lowercase de 6 digitos. Soporta #abc, #AABBCC y rgb()/rgba(). */
function normalizeColor(raw: string): string {
    const v = raw.trim().toLowerCase()
    const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
    if (rgb) {
        const h = (n: string) => Number(n).toString(16).padStart(2, '0')
        return `#${h(rgb[1])}${h(rgb[2])}${h(rgb[3])}`
    }
    const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    return v
}

/** Matiz HSL (0-360) de un hex #rrggbb. */
function hueOf(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    if (d === 0) return 0
    let h: number
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return (h * 60 + 360) % 360
}

/** Distancia circular entre dos matices (0-180). */
function hueDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
}

/** Lee --theme-primary: primero :root (los layouts inyectan <style> ahi), si no el contenedor coach. */
async function readThemePrimary(page: Page): Promise<string> {
    return page.evaluate(() => {
        const fromRoot = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim()
        if (fromRoot) return fromRoot
        const container = document.querySelector<HTMLElement>('.coach-layout-container')
        return container ? getComputedStyle(container).getPropertyValue('--theme-primary').trim() : ''
    })
}

/**
 * Asserta que --theme-primary corresponde a la marca esperada.
 * exact=true → igualdad de hex (panel coach: hex crudo).
 * exact=false → hex igual O mismo matiz con Δ <= 18° (shell alumno: clampAccent AA puede oscurecer).
 */
async function expectThemePrimary(page: Page, expectedHex: string, opts: { exact?: boolean } = {}) {
    const expected = normalizeColor(expectedHex)
    // Espera a que la var exista y resuelva a un hex (SSR la inyecta, pero damos margen a hidratacion).
    await expect
        .poll(async () => normalizeColor(await readThemePrimary(page)), {
            timeout: 15_000,
            message: `--theme-primary debe resolverse a un hex (marca esperada ${expected})`,
        })
        .toMatch(/^#[0-9a-f]{6}$/)

    const actual = normalizeColor(await readThemePrimary(page))
    if (opts.exact) {
        expect(actual, `--theme-primary exacto de la marca`).toBe(expected)
        return
    }
    if (actual === expected) return
    const delta = hueDistance(hueOf(actual), hueOf(expected))
    expect(
        delta,
        `--theme-primary ${actual} no corresponde a la marca ${expected} (Δhue=${delta.toFixed(1)}°; clampAccent solo ajusta luminosidad, no matiz)`,
    ).toBeLessThanOrEqual(18)
}

// ---------------------------------------------------------------------------
// C1 — Alumno standalone: shell /c con la marca personal del coach
// ---------------------------------------------------------------------------

test.describe('C1 alumno standalone — /c/[coach_slug]', () => {
    test.skip(!hasState(PERSONAS.soloAlumno), 'falta storage state solo-alumno (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.soloAlumno.storageState })

    test('shell /c muestra "Aurora Strength" y --theme-primary ambar', async ({ page }) => {
        await page.goto(`/c/${SOLO_COACH_SLUG}/dashboard`)
        // El patron EXCLUYE /login: si la sesion no sirve, el redirect a login hace fallar el wait.
        await page.waitForURL(`**/c/${SOLO_COACH_SLUG}/dashboard**`, { timeout: 25_000 })
        expect(page.url()).not.toContain('/login')

        // El layout del shell alumno marca el contenedor con data-brand-name (fuente canonica).
        await expect(page.locator('[data-brand-name]').first()).toHaveAttribute(
            'data-brand-name',
            SOLO.name,
            { timeout: 15_000 },
        )
        await expect(page.getByText(SOLO.name).first()).toBeVisible({ timeout: 15_000 })

        // Shell alumno: clampAccent puede oscurecer #F59E0B (no pasa AA sobre blanco) → matiz, no exacto.
        await expectThemePrimary(page, SOLO.color)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C2 — Alumno de pool: /t mantiene URL, marca del TEAM y cero fuga de otras marcas
// ---------------------------------------------------------------------------

test.describe('C2 alumno de pool — /t/[team_slug]', () => {
    test.skip(!hasState(PERSONAS.poolAlumno), 'falta storage state pool-alumno (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.poolAlumno.storageState })

    test('dashboard /t: marca del team, theme rosa, URL en /t y sin marcas ajenas', async ({ page }) => {
        await page.goto(`/t/${TEAM_SLUG}/dashboard`)
        await page.waitForURL(`**/t/${TEAM_SLUG}/dashboard**`, { timeout: 25_000 })

        // Rewrite, no redirect: la URL nunca se escapa a /c ni cae en consent (seed ya consintio).
        expect(page.url()).toContain(`/t/${TEAM_SLUG}/dashboard`)
        expect(page.url()).not.toContain('/c/')
        expect(page.url()).not.toContain('/consent')
        expect(page.url()).not.toContain('/login')

        // data-brand-name === nombre del TEAM ⇒ no es la marca personal del owner ni la de otro coach.
        await expect(page.locator('[data-brand-name]').first()).toHaveAttribute(
            'data-brand-name',
            TEAM.name,
            { timeout: 15_000 },
        )
        await expect(page.getByText(TEAM.name).first()).toBeVisible({ timeout: 15_000 })
        await expectThemePrimary(page, TEAM.color)

        // Aislamiento bidireccional de marca: nada de la marca standalone ni de la org.
        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(ORG.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C3 — Alumno enterprise: shell /e con la marca de la ORG
// ---------------------------------------------------------------------------

test.describe('C3 alumno enterprise — /e/[org_slug]', () => {
    test.skip(!hasState(PERSONAS.orgAlumno), 'falta storage state org-alumno (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.orgAlumno.storageState })

    test('shell /e muestra "E2E Performance Lab" y theme violeta', async ({ page }) => {
        await page.goto(`/e/${ORG_SLUG}/dashboard`)
        await page.waitForURL(`**/e/${ORG_SLUG}/dashboard**`, { timeout: 25_000 })
        expect(page.url()).not.toContain('/login')
        expect(page.url()).not.toContain('/c/')

        await expect(page.locator('[data-brand-name]').first()).toHaveAttribute(
            'data-brand-name',
            ORG.name,
            { timeout: 15_000 },
        )
        await expect(page.getByText(ORG.name).first()).toBeVisible({ timeout: 15_000 })
        await expectThemePrimary(page, ORG.color)

        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(TEAM.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C4 — Coach standalone: panel con marca propia y hex EXACTO
// ---------------------------------------------------------------------------

test.describe('C4 coach standalone — panel /coach', () => {
    test.skip(!hasState(PERSONAS.soloCoach), 'falta storage state solo-coach (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.soloCoach.storageState })

    test('sidebar muestra "Aurora Strength" y --theme-primary #F59E0B exacto', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        expect(page.url()).not.toContain('/login')

        // filter visible: el sidebar renderiza la marca 2 veces (variante colapsada 0x0 + <p> visible).
        await expect(page.getByText(SOLO.name).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
        // Panel coach inyecta el hex crudo de la marca → comparacion exacta.
        await expectThemePrimary(page, SOLO.color, { exact: true })
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C5 — Coach enterprise: panel con marca de la ORG (no la personal)
// ---------------------------------------------------------------------------

test.describe('C5 coach enterprise — panel /coach', () => {
    test.skip(!hasState(PERSONAS.orgCoach), 'falta storage state org-coach (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.orgCoach.storageState })

    test('sidebar muestra "E2E Performance Lab" y --theme-primary #8B5CF6 exacto', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        expect(page.url()).not.toContain('/login')

        await expect(page.getByText(ORG.name).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
        await expectThemePrimary(page, ORG.color, { exact: true })

        // Sin fuga de otras marcas en el panel enterprise.
        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(TEAM.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C6 — Team owner: panel coach con branding del TEAM
// ---------------------------------------------------------------------------

test.describe('C6 team owner — panel /coach con marca del team', () => {
    test.skip(!hasState(PERSONAS.teamOwner), 'falta storage state team-owner (correr auth.setup.ts)')
    test.use({ storageState: PERSONAS.teamOwner.storageState })

    test('sidebar muestra "E2E Pool Vortex" y --theme-primary #EC4899 exacto', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        expect(page.url()).not.toContain('/login')

        await expect(page.getByText(TEAM.name).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
        await expectThemePrimary(page, TEAM.color, { exact: true })

        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(ORG.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// C7 + C8 — Logins publicos: marca del TEAM / ORG, sin marca de ningun coach
// ---------------------------------------------------------------------------

test.describe('C7-C8 logins publicos /t y /e — branding sin sesion', () => {
    // Paginas publicas: contexto limpio explicito (sin storage state heredado del proyecto).
    test.use({ storageState: NO_SESSION })

    test('/t/[team_slug]/login muestra el nombre del TEAM, no el de un coach', async ({ page }) => {
        await page.goto(`/t/${TEAM_SLUG}/login`)
        await expect(page.getByRole('heading', { name: TEAM.name })).toBeVisible({ timeout: 15_000 })

        // La pagina de login del team no expone marcas personales ni de otros contextos.
        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(ORG.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('/e/[org_slug]/login muestra el nombre de la ORG', async ({ page }) => {
        await page.goto(`/e/${ORG_SLUG}/login`)
        await expect(page.getByRole('heading', { name: ORG.name })).toBeVisible({ timeout: 15_000 })

        await expect(page.getByText(SOLO.name)).toHaveCount(0)
        await expect(page.getByText(TEAM.name)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})
