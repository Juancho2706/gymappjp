#!/usr/bin/env node
/**
 * cabina-visual-check.mjs — gate local Playwright de T3.v Cabina (V0.4, TASKS.md).
 *
 * Regla del owner: verificar LOCAL (harness + Playwright headless) ANTES de cualquier
 * preview. Este script:
 *
 *   1. Levanta el dev server de `apps/web` en el puerto 3123 (o usa BASE_URL si ya viene en
 *      el entorno — no lo vuelve a levantar).
 *   2. Captura screenshots del harness `dev-harness/nutrition-editor` en `?mode=edit` (el
 *      editor completo con el draft semilla enriquecido) y `?stories=1` (la vista aislada de
 *      MacroSpark/MacroSparkPopover) en 5 anchos × 2 temas, a D:\tmp\cabina-shots\.
 *   3. Corre el humo del contrato D3 (SPEC): hover abre, tap abre/cierra, Esc cierra, un solo
 *      popover a la vez, cero overflow-x, y el toggle de tema funciona.
 *   4. V2.5 (pasada responsive): la cinta (compacta 768–1023, completa desde 1024) existe donde
 *      debe, el rail y la paleta son exclusivos de ≥1024 (a 768–1023 manda la cápsula sin
 *      paleta), la cinta no rompe a 2 líneas, y los botones nuevos de cinta/rail miden ≥44px de
 *      alto con puntero grueso.
 *
 * Sale con codigo != 0 si cualquier asercion falla. Corre desde la RAIZ del repo:
 *   node scripts/cabina-visual-check.mjs
 *
 * BASE_URL=http://localhost:3000 node scripts/cabina-visual-check.mjs   # server ya corriendo
 */

import { chromium } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3123
const EXTERNAL_BASE_URL = process.env.BASE_URL ?? null
const BASE_URL = EXTERNAL_BASE_URL ?? `http://localhost:${PORT}`
const HARNESS_PATH = '/dev-harness/nutrition-editor'
const SHOTS_DIR = 'D:/tmp/cabina-shots'

const VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 768, height: 1024, label: '768' },
  { width: 1024, height: 768, label: '1024' },
  { width: 1280, height: 800, label: '1280' },
  { width: 1536, height: 960, label: '1536' },
]
const THEMES = /** @type {const} */ (['light', 'dark'])
const VISTAS = [
  { search: '?mode=edit', label: 'edit' },
  { search: '?stories=1', label: 'stories' },
]

/* ---------------------------------------------------------------------------
 * Banner de cookies: se siembra el consentimiento ANTES de cargar la página.
 *
 * `CookieConsent` (layout raíz) se monta cuando `localStorage['eva-cookie-consent-v1']` está vacío
 * y queda `fixed` abajo, tapando la franja inferior de TODAS las capturas. Sembrar la clave con
 * `storageState` es el camino estable: el valor ya está en el origen cuando corre el `useEffect`
 * del banner, así que nunca llega a renderizar (nada de carreras ni de esperar a que se desmonte).
 * `ensureNoCookieBanner` queda como red de seguridad por si el mecanismo del banner cambia.
 * -------------------------------------------------------------------------- */
const CONSENT_STORAGE_KEY = 'eva-cookie-consent-v1'
const COOKIE_BANNER = '[role="dialog"][aria-label="Consentimiento de cookies"]'
const STORAGE_STATE = {
  cookies: [],
  origins: [
    {
      origin: new URL(BASE_URL).origin,
      localStorage: [{ name: CONSENT_STORAGE_KEY, value: 'rejected' }],
    },
  ],
}

/** @param {import('@playwright/test').Browser} browser @param {Record<string, unknown>} options */
function newCheckContext(browser, options = {}) {
  return browser.newContext({ ...options, storageState: STORAGE_STATE })
}

/** @param {import('@playwright/test').Page} page */
async function ensureNoCookieBanner(page) {
  const banner = page.locator(COOKIE_BANNER)
  if ((await banner.count()) === 0) return
  console.log('      banner de cookies presente pese al storageState: se rechaza…')
  await page.getByRole('button', { name: 'Rechazar' }).first().click()
  await banner.waitFor({ state: 'detached', timeout: 5_000 })
}

/** @param {import('@playwright/test').Page} page @param {string} search */
async function gotoHarness(page, search) {
  await page.goto(`${BASE_URL}${HARNESS_PATH}${search}`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  })
  await ensureNoCookieBanner(page)
}

let failures = 0
let shotCount = 0

/** @param {string} step @param {boolean} ok @param {string} [detail] */
function report(step, ok, detail = '') {
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// 0. chromium instalado (best-effort; solo chromium, per instrucción).
// ---------------------------------------------------------------------------
async function ensureChromiumInstalled() {
  try {
    const browser = await chromium.launch({ headless: true })
    await browser.close()
    return
  } catch (err) {
    console.log(`chromium no disponible (${err instanceof Error ? err.message : err}); instalando…`)
    execSync('npx playwright install chromium', { cwd: ROOT, stdio: 'inherit' })
  }
}

// ---------------------------------------------------------------------------
// 1. Dev server (spawn solo si no vino BASE_URL por env).
// ---------------------------------------------------------------------------
/** @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function startDevServer() {
  if (EXTERNAL_BASE_URL) {
    console.log(`BASE_URL=${EXTERNAL_BASE_URL} en el entorno: no se levanta dev server propio.`)
    return null
  }
  console.log(`Levantando dev server de @eva/web en el puerto ${PORT}…`)
  // `next dev` lee `PORT` del entorno cuando no se le pasa `-p` explícito — más simple y
  // portable que reenviar flags a través de `pnpm --filter ... -- ...` (en Windows, con
  // `shell:true`, pnpm 11 no siempre despoja el separador `--` antes de forwardearlo).
  const child = spawn('pnpm', ['--filter', '@eva/web', 'dev'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString()
    if (/error/i.test(text)) process.stdout.write(`[dev] ${text}`)
  })
  child.stderr?.on('data', (chunk) => process.stderr.write(`[dev:err] ${chunk.toString()}`))
  return child
}

async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.status < 500) return true
    } catch {
      // servidor aun no responde — reintentar
    }
    await sleep(1000)
  }
  return false
}

function killDevServer(child) {
  if (!child || child.pid == null) return
  console.log(`Deteniendo dev server (pid ${child.pid})…`)
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
    } catch (err) {
      console.error(`taskkill fallo: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ya estaba muerto */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Screenshots (5 anchos × 2 temas × 2 vistas) + gate (e) overflow-x.
// ---------------------------------------------------------------------------
async function captureAll(browser) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await newCheckContext(browser, {
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      })
      const page = await context.newPage()
      for (const vista of VISTAS) {
        try {
          await gotoHarness(page, vista.search)
          await page.waitForTimeout(150)

          const overflow = await page.evaluate(() => ({
            scrollWidth: document.body.scrollWidth,
            clientWidth: document.body.clientWidth,
          }))
          report(
            `sin overflow-x — ${viewport.label}px ${theme} ${vista.label}`,
            overflow.scrollWidth <= overflow.clientWidth,
            `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
          )

          const filePath = join(SHOTS_DIR, `${viewport.label}-${theme}-${vista.label}.png`)
          await page.screenshot({ path: filePath, fullPage: true })
          shotCount += 1
          console.log(`      captura: ${filePath}`)
        } catch (err) {
          report(
            `captura ${viewport.label}px ${theme} ${vista.label}`,
            false,
            err instanceof Error ? err.message : String(err),
          )
        }
      }
      await context.close()
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Humo del contrato D3 (hover, tap, Esc, uno-a-la-vez) + toggle de tema.
// ---------------------------------------------------------------------------
const SEL = {
  normalTrigger: '[data-testid="story-popover-normal"] [data-slot="popover-trigger"]',
  fiberTrigger: '[data-testid="story-popover-fiber"] [data-slot="popover-trigger"]',
  openContent: '[data-slot="popover-content"][data-open]',
  anyContent: '[data-slot="popover-content"]',
}

/**
 * El panel vive en un PORTAL (document.body), NO dentro del `data-testid` de la story, así que
 * «¿de quién es el panel abierto?» no se puede preguntar por contención en el DOM. El vínculo real
 * es `aria-controls` del trigger → `id` del panel; se compara eso y, de paso, se devuelve el texto
 * del panel para seguir afirmando los gramos.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} triggerSelector
 */
function openPanelOwnership(page, triggerSelector) {
  return page.evaluate((selector) => {
    const trigger = document.querySelector(selector)
    const panels = [...document.querySelectorAll('[data-slot="popover-content"][data-open]')]
    const controls = trigger?.getAttribute('aria-controls') ?? null
    return {
      totalOpen: panels.length,
      ownsOpenPanel: Boolean(controls) && panels.some((panel) => panel.id === controls),
      triggerExpanded: trigger?.getAttribute('aria-expanded') === 'true',
      text: panels[0]?.textContent?.trim() ?? '',
    }
  }, triggerSelector)
}

async function smokeHoverOpensAndShowsGrams(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')

  await page.hover(SEL.normalTrigger)
  await page.waitForTimeout(250) // delay 120ms del popover + margen
  const openAfterHover = await page.locator(SEL.openContent).count()
  const text = openAfterHover > 0 ? await page.locator(SEL.openContent).first().textContent() : ''
  report(
    '(a) hover sobre spark de stories abre el popover y muestra "P "',
    openAfterHover === 1 && Boolean(text?.includes('P ')),
    `openCount=${openAfterHover} text="${text?.trim()}"`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)

  await context.close()
}

async function smokeEscCloses(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')

  await page.click(SEL.normalTrigger)
  await page.waitForTimeout(150)
  const openBeforeEsc = await page.locator(SEL.openContent).count()

  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const openAfterEsc = await page.locator(SEL.openContent).count()
  // Margen extra: el bug del open-por-foco reabría a los ~60 ms del cierre, así que un solo
  // muestreo inmediato lo dejaba pasar. Se vuelve a mirar bien después del rebote.
  await page.waitForTimeout(400)
  const openAfterSettle = await page.locator(SEL.openContent).count()

  report(
    '(c) Esc cierra el popover abierto (y NO reabre)',
    openBeforeEsc === 1 && openAfterEsc === 0 && openAfterSettle === 0,
    `openBeforeEsc=${openBeforeEsc} openAfterEsc=${openAfterEsc} openAfterSettle=${openAfterSettle}`,
  )

  await context.close()
}

async function smokeOnlyOneOpenAtATime(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')

  await page.click(SEL.normalTrigger)
  await page.waitForTimeout(150)
  await page.click(SEL.fiberTrigger)
  await page.waitForTimeout(150)
  const immediate = await openPanelOwnership(page, SEL.fiberTrigger)
  // Mismo motivo que en (c): el primero reabría a los ~60 ms y se quedaba con el turno.
  await page.waitForTimeout(400)
  const settled = await openPanelOwnership(page, SEL.fiberTrigger)

  report(
    '(d) abrir un segundo spark cierra el primero (un solo [data-open], y es el segundo)',
    immediate.totalOpen === 1 &&
      settled.totalOpen === 1 &&
      settled.ownsOpenPanel &&
      settled.triggerExpanded &&
      settled.text.includes('C 45 g'),
    `totalOpen=${settled.totalOpen} esDelSegundo=${settled.ownsOpenPanel} aria-expanded=${settled.triggerExpanded} text="${settled.text}"`,
  )

  await page.keyboard.press('Escape')
  await context.close()
}

async function smokeTouchTapOpensAndTapOutsideCloses(browser) {
  const context = await newCheckContext(browser, {
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')

  await page.tap(SEL.normalTrigger)
  await page.waitForTimeout(150)
  const openAfterTap = await page.locator(SEL.openContent).count()
  report('(b.1) tap (touch emulado) abre el popover', openAfterTap === 1, `openCount=${openAfterTap}`)

  // Tap lejos de cualquier trigger — cierra por outside-press.
  await page.touchscreen.tap(5, 5)
  await page.waitForTimeout(150)
  const openAfterOutsideTap = await page.locator(SEL.openContent).count()
  report('(b.2) tap fuera cierra el popover', openAfterOutsideTap === 0, `openCount=${openAfterOutsideTap}`)

  await context.close()
}

// ---------------------------------------------------------------------------
// 3.5. Contrato responsive V2.5: la cinta existe compacta en 768–1023 y completa desde 1024;
//      el rail y la paleta son EXCLUSIVOS de ≥1024 (a 768–1023 manda la cápsula horizontal, sin
//      paleta — SPEC "768–1023 | SIN paleta ... cinta compacta"). Corre sobre `?mode=edit` (el
//      editor real con el draft de 2 días) porque `?stories=1` no monta `QuickEditPlanView`.
// ---------------------------------------------------------------------------
const RIBBON_MAX_HEIGHT_PX = 96 // margen sobre la altura real (~56-64px): un wrap a 2 líneas la duplica

async function smokeRibbonRailPaletteByBreakpoint(browser) {
  const cases = [
    { width: 768, height: 1000, expectRibbon: true, expectRail: false, expectPalette: false },
    { width: 1024, height: 800, expectRibbon: true, expectRail: true, expectPalette: true },
  ]
  for (const c of cases) {
    const context = await newCheckContext(browser, {
      viewport: { width: c.width, height: c.height },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const ribbon = page.locator('[data-testid="editor-ribbon"]')
    const ribbonVisible = (await ribbon.count()) > 0 && (await ribbon.isVisible())
    report(
      `cinta visible — ${c.width}px`,
      ribbonVisible === c.expectRibbon,
      `esperado=${c.expectRibbon} real=${ribbonVisible}`,
    )
    if (ribbonVisible) {
      const box = await ribbon.boundingBox()
      report(
        `cinta de 1 línea (sin wrap) — ${c.width}px`,
        box !== null && box.height <= RIBBON_MAX_HEIGHT_PX,
        `height=${box?.height}`,
      )
    }

    const rail = page.getByRole('navigation', { name: 'Días del plan' })
    const railVisible = (await rail.count()) > 0 && (await rail.isVisible())
    report(
      `rail de días visible — ${c.width}px`,
      railVisible === c.expectRail,
      `esperado=${c.expectRail} real=${railVisible}`,
    )

    const palette = page.getByRole('heading', { name: 'Agregar alimentos' })
    const paletteVisible = (await palette.count()) > 0 && (await palette.isVisible())
    report(
      `paleta lateral visible — ${c.width}px`,
      paletteVisible === c.expectPalette,
      `esperado=${c.expectPalette} real=${paletteVisible}`,
    )

    // A 768–1023 (sin rail) la cápsula horizontal de días sigue siendo el camino de siempre.
    if (!c.expectRail) {
      const capsule = page.getByRole('navigation', { name: 'Día del plan en edición' })
      const capsuleVisible = (await capsule.count()) > 0 && (await capsule.isVisible())
      report(`cápsula de días visible sin rail — ${c.width}px`, capsuleVisible, `real=${capsuleVisible}`)
    }

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    }))
    report(
      `sin overflow-x con cinta+rail — ${c.width}px`,
      overflow.scrollWidth <= overflow.clientWidth,
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    )

    await context.close()
  }
}

// ---------------------------------------------------------------------------
// 3.6. Touch targets ≥44 px en puntero grueso, en los controles NUEVOS de la cinta y el rail
//      (SPEC: "Touch targets ≥44 px en puntero grueso en TODOS los controles nuevos"). Los sparks
//      tienen su propio contrato de hit-area 44×28 (D3) y ya se cubren en el humo táctil de arriba.
// ---------------------------------------------------------------------------
async function minButtonHeight(locator) {
  const count = await locator.count()
  let min = Infinity
  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox()
    if (box && box.width > 0 && box.height > 0) min = Math.min(min, box.height)
  }
  return { count, min }
}

async function smokeTouchTargetsCoarse(browser) {
  for (const width of [768, 1024]) {
    const context = await newCheckContext(browser, {
      viewport: { width, height: 900 },
      colorScheme: 'light',
      hasTouch: true,
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const ribbonButtons = await minButtonHeight(page.locator('[data-testid="editor-ribbon"] button'))
    report(
      `botones de la cinta ≥44px alto en puntero grueso — ${width}px`,
      ribbonButtons.count === 0 || ribbonButtons.min >= 44,
      `count=${ribbonButtons.count} minHeight=${ribbonButtons.min}`,
    )

    if (width >= 1024) {
      const railButtons = await minButtonHeight(
        page.locator('nav[aria-labelledby="qe-day-rail-title"] button'),
      )
      report(
        `botones del rail ≥44px alto en puntero grueso — ${width}px`,
        railButtons.count === 0 || railButtons.min >= 44,
        `count=${railButtons.count} minHeight=${railButtons.min}`,
      )
    }

    await context.close()
  }
}

async function smokeThemeToggleWorks(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')

  const before = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: /Tema:/ }).click()
  await page.waitForTimeout(150)
  const after = await page.evaluate(() => document.documentElement.classList.contains('dark'))

  report('(f) el toggle de tema alterna la clase dark en <html>', before !== after, `before=${before} after=${after}`)

  await context.close()
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== cabina-visual-check — T3.v Cabina V0.4 ===\n')

  console.log('Paso 0/5 — chromium…')
  await ensureChromiumInstalled()

  console.log('Paso 1/5 — dev server…')
  const devServer = await startDevServer()
  const ready = await waitForServer(`${BASE_URL}${HARNESS_PATH}?mode=edit`)
  report('dev server responde en el harness', ready, BASE_URL)
  if (!ready) {
    killDevServer(devServer)
    console.log(`\n${failures} aserción(es) fallida(s). Saliendo sin capturar.`)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    console.log('\nPaso 2/5 — capturas (5 anchos × 2 temas × 2 vistas)…')
    await captureAll(browser)

    console.log('\nPaso 3/5 — humo del popover (hover / Esc / uno-a-la-vez)…')
    await smokeHoverOpensAndShowsGrams(browser)
    await smokeEscCloses(browser)
    await smokeOnlyOneOpenAtATime(browser)

    console.log('\nPaso 4/6 — humo táctil (tap abre / tap fuera cierra)…')
    await smokeTouchTapOpensAndTapOutsideCloses(browser)

    console.log('\nPaso 5/6 — contrato responsive V2.5 (cinta/rail/paleta en 768 y 1024)…')
    await smokeRibbonRailPaletteByBreakpoint(browser)
    await smokeTouchTargetsCoarse(browser)

    console.log('\nPaso 6/6 — toggle de tema…')
    await smokeThemeToggleWorks(browser)
  } finally {
    await browser.close()
    killDevServer(devServer)
  }

  console.log(`\n${shotCount} capturas guardadas en ${SHOTS_DIR}`)
  if (failures > 0) {
    console.log(`\n${failures} aserción(es) fallida(s).`)
    process.exit(1)
  }
  console.log('\nTodo verde.')
  process.exit(0)
}

main().catch((err) => {
  console.error('cabina-visual-check crasheó:', err)
  process.exit(1)
})
