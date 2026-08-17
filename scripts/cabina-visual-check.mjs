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
 *   5. V2.6 (fix F1 del QA visual): NADA dentro de la cinta se superpone a 768, 950 ni 1024 —
 *      el assert cruza los rectángulos reales, que es lo único que atrapaba el derrame de un
 *      track colapsado (el overflow-x del body no lo ve).
 *   6. V2.7 (los 3 hallazgos del owner sobre el editor maximizado):
 *      a) a 1536 y 1920 el LIENZO está centrado en la pantalla y la barra de totales comparte su
 *         mismo eje (los dos costados pesaban distinto: rail 190 vs paleta 288);
 *      b) en la fila de alimento, cantidad y unidad miden lo mismo y comparten centro vertical, y
 *         la columna no se corre entre filas (kcal de 2 o 4 dígitos movían el renglón entero);
 *      c) contraer/expandir una franja sigue siendo funcional con la altura animada: aria-expanded,
 *         cuerpo fuera de alcance al contraer y CERO pérdida de estado al volver.
 *   7. «Familia N» (AddActionButton, swap de las superficies): las stories existen, el CONTRASTE de
 *      la variante `primary` se mide en el DOM (color y fondo computados del mismo botón, razón
 *      WCAG ≥ 4.5:1 — el bug del owner era tinta blanca sobre una marca clara), y en el editor los
 *      botones nuevos DISPARAN: «Agregar franja» abre su sheet, «Alimento libre» agrega la fila y
 *      «Agregar día» sigue abriendo su popover.
 *   8. Sello EVA v2 (`docs/specs/eva-seal-background/`, gate S2.2): con `?seal=1` el harness
 *      monta `AppSeal b` publicando el par `--seal-*` como los layouts de producción. Se afirma
 *      (a) el COLOR real de los blobs — hue del par derivado (primario y primario+38°) y alphas
 *      D5 por tema — para 2 marcas (EVA azul default y verde vía `?sealBrand`); (b) que el
 *      contraste WCAG de 3 textos clave del editor NO cambia con el sello prendido (mismos
 *      colores computados y misma razón de luminancia que sin sello); (c) que reduced-motion
 *      emulado congela la deriva SIN apagar los blobs — y el grano jamás anima; y (d) que las
 *      rutas pre-auth (fetch del HTML de /login) no traen rastro del marcador `data-eva-seal`
 *      que sí existe en el harness. Capturas dark/light × 2 marcas a 1280.
 *   9. Guía Viva (`docs/specs/nutrition-onboarding-tour/`, G2.3 — LOS DOS INVARIANTES BLOQUEANTES
 *      del dueño): D2, el «?» real del editor (`?mode=edit`, esquina/PublishBar según ancho) mide
 *      CERO intersecciones contra todo `button/a/input/select` visible en los 5 anchos del harness;
 *      D3, el recorrido COMPLETO de los dos guiones (editor y hub, vía `?tour=editor|hub`) deja la
 *      tarjeta ⊆ viewport en CADA paso de los 5 anchos, con halo visible cuando el paso tiene target
 *      en pantalla; y D4, «Saltar» cierra y marca el flag — que entonces evita el re-auto-arranque
 *      tras un reload (y limpiarlo con «Reiniciar guía» lo vuelve a habilitar).
 *
 * Sale con codigo != 0 si cualquier asercion falla. Corre desde la RAIZ del repo:
 *   node scripts/cabina-visual-check.mjs
 *
 * BASE_URL=http://localhost:3000 node scripts/cabina-visual-check.mjs   # server ya corriendo
 */

import { chromium } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
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

/* ---------------------------------------------------------------------------
 * Guía Viva: memoria del tour sembrada, por la MISMA razón que el consentimiento.
 *
 * El editor auto-arranca su guía la primera vez que un coach entra sin flag (D4 de
 * `docs/specs/nutrition-onboarding-tour/SPEC.md`), y cada contexto de Playwright es un navegador
 * recién estrenado: sin esto, TODAS las capturas saldrían bajo el velo del tour y todos los smokes
 * clickearían contra sus paños (que son `pointer-events-auto` a propósito, para dejar inerte la UI
 * de abajo). El harness monta `FoodPickerPrefsProvider` con `viewerCoachId=null`, así que la clave
 * cae en el cajón anónimo.
 *
 * Los asserts del tour (G2.3) NO deben usar este `storageState`: para ver el auto-arranque hay que
 * abrir un contexto SIN la semilla, y para probar que el flag lo evita, uno con ella.
 * -------------------------------------------------------------------------- */
const TOUR_FLAG_KEYS = ['eva.tour.editor.v1.anon', 'eva.tour.hub.v1.anon']

const STORAGE_STATE = {
  cookies: [],
  origins: [
    {
      origin: new URL(BASE_URL).origin,
      localStorage: [
        { name: CONSENT_STORAGE_KEY, value: 'rejected' },
        ...TOUR_FLAG_KEYS.map((name) => ({ name, value: '1' })),
      ],
    },
  ],
}

/** @param {import('@playwright/test').Browser} browser @param {Record<string, unknown>} options */
function newCheckContext(browser, options = {}) {
  return browser.newContext({ ...options, storageState: STORAGE_STATE })
}

/**
 * Contexto SIN la semilla del tour (solo cookies) — la mitad «sin flag» del invariante D4 que el
 * comentario de `tour-stories.tsx` pide: acá el auto-arranque tiene que dispararse solo. La otra
 * mitad («con flag sembrada no arranca») no necesita un contexto aparte: la prueban `smokeTourWalkthrough`
 * marcando el flag de verdad (con «Saltar») y recargando la MISMA página.
 */
const FRESH_TOUR_STORAGE_STATE = {
  cookies: [],
  origins: [
    {
      origin: new URL(BASE_URL).origin,
      localStorage: [{ name: CONSENT_STORAGE_KEY, value: 'rejected' }],
    },
  ],
}

/** @param {import('@playwright/test').Browser} browser @param {Record<string, unknown>} options */
function newTourContext(browser, options = {}) {
  return browser.newContext({ ...options, storageState: FRESH_TOUR_STORAGE_STATE })
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
// 3.55. NO-SOLAPE en la cinta (fix F1 del QA visual del owner).
//
// El bug que motivó este assert: en 768–1023 la cinta compacta metía identidad + badge + anillo +
// micro-barras + 3 CTA en un ancho que no daba. Como el track del centro era `minmax(0,1fr)`, se
// achicaba por debajo de su contenido y el `justify-center` derramaba el anillo/barras HACIA AFUERA
// del track — la `StrategyBadge` quedaba pintada encima del anillo y las barras P/C/G debajo de
// «Metas del día». Ningún gate lo veía: `document.body.scrollWidth` no crece cuando el contenido se
// superpone en vez de empujar.
//
// Por qué la comparación NO es entre los 3 hijos directos de la barra: justamente porque el derrame
// deja las CAJAS de los tracks intactas (no se intersectan) mientras el contenido sí se monta. Se
// aplana un nivel más — las "celdas" son los hijos visibles de cada hijo directo (✕ · nombre ·
// badge | anillo+kcal · barras | Metas · Descartar · Publicar+contador) — y se cruzan TODAS contra
// TODAS, sin importar de qué grupo vengan. Verificado en rojo contra el código previo al fix:
// acusaba «Estructurado» × anillo (24×28 px) y barras × «Metas del día» (24×22 px) a 768.
// ---------------------------------------------------------------------------
const RIBBON_OVERLAP_TOLERANCE_PX = 2

/** @param {import('@playwright/test').Page} page */
function ribbonOverlaps(page) {
  return page.evaluate((tolerance) => {
    const ribbon = document.querySelector('[data-testid="editor-ribbon"]')
    if (!ribbon) return { error: 'no hay [data-testid="editor-ribbon"] en el DOM' }
    const bar = ribbon.firstElementChild
    if (!bar) return { error: 'la cinta no tiene barra interna' }

    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
    }
    const describe = (el) => {
      const label = el.getAttribute('aria-label') ?? ''
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)
      return `${el.tagName.toLowerCase()}${label ? `[${label}]` : ''}${text ? ` «${text}»` : ''}`
    }

    /** @type {Element[]} */
    const cells = []
    for (const group of [...bar.children].filter(isVisible)) {
      const kids = [...group.children].filter(isVisible)
      if (kids.length === 0) cells.push(group)
      else cells.push(...kids)
    }

    const collisions = []
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i].getBoundingClientRect()
        const b = cells[j].getBoundingClientRect()
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX > tolerance && overlapY > tolerance) {
          collisions.push(
            `${describe(cells[i])} × ${describe(cells[j])} (${Math.round(overlapX)}×${Math.round(overlapY)}px)`,
          )
        }
      }
    }
    return { cellCount: cells.length, collisions }
  }, RIBBON_OVERLAP_TOLERANCE_PX)
}

async function smokeRibbonNoOverlap(browser) {
  for (const width of [768, 950, 1024]) {
    const context = await newCheckContext(browser, {
      viewport: { width, height: 900 },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const result = await ribbonOverlaps(page)
    if (result.error) {
      report(`cinta sin solapes — ${width}px`, false, result.error)
    } else {
      report(
        `cinta sin solapes — ${width}px`,
        result.collisions.length === 0,
        result.collisions.length === 0
          ? `${result.cellCount} celdas, 0 pares superpuestos`
          : result.collisions.join(' | '),
      )
    }

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

// ---------------------------------------------------------------------------
// 3.7. V2.7 (a) — CENTRADO del editor maximizado (hallazgo 1 del owner).
//
// El layout de 3 zonas tenía costados de peso distinto (rail 190 · paleta 288), así que el track del
// centro —y con él el lienzo— quedaba ~49 px a la izquierda del centro de la pantalla, mientras la
// barra de totales, que es `fixed` a la VENTANA, se centraba en el eje real: dos ejes distintos en la
// misma pantalla. Ningún assert previo lo veía (no hay overflow ni solape: el layout está "sano",
// solo descentrado). Desde 1536 los dos tracks laterales miden 18rem y el lienzo se centra solo.
//
// Tolerancias: 12 px para el lienzo contra el centro de la ventana (deja margen para el ancho de
// barra de scroll del entorno) y 8 px entre la barra de totales y el lienzo, que tienen que leerse
// como un mismo eje vertical.
// ---------------------------------------------------------------------------
const CANVAS_CENTER_TOLERANCE_PX = 12
const BAR_VS_CANVAS_TOLERANCE_PX = 8

async function smokeCanvasCenteredOnWide(browser) {
  for (const width of [1536, 1920]) {
    const context = await newCheckContext(browser, {
      viewport: { width, height: 960 },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const geo = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="editor-canvas"]')
      const bar = document.querySelector('[data-testid="qe-publish-bar"]')
      if (!canvas) return { error: 'no hay [data-testid="editor-canvas"] en el DOM' }
      if (!bar) return { error: 'no hay [data-testid="qe-publish-bar"] en el DOM' }
      const center = (el) => {
        const rect = el.getBoundingClientRect()
        return (rect.left + rect.right) / 2
      }
      return {
        canvasCenter: center(canvas),
        barCenter: center(bar),
        canvasWidth: canvas.getBoundingClientRect().width,
        viewportCenter: window.innerWidth / 2,
      }
    })

    if (geo.error) {
      report(`lienzo centrado — ${width}px`, false, geo.error)
      await context.close()
      continue
    }

    const canvasOffset = Math.abs(geo.canvasCenter - geo.viewportCenter)
    report(
      `lienzo centrado en la pantalla — ${width}px`,
      canvasOffset <= CANVAS_CENTER_TOLERANCE_PX,
      `|centroLienzo-centroVentana|=${canvasOffset.toFixed(1)}px (tope ${CANVAS_CENTER_TOLERANCE_PX}) ancho=${geo.canvasWidth.toFixed(0)}`,
    )
    const barOffset = Math.abs(geo.barCenter - geo.canvasCenter)
    report(
      `barra de totales en el eje del lienzo — ${width}px`,
      barOffset <= BAR_VS_CANVAS_TOLERANCE_PX,
      `|centroBarra-centroLienzo|=${barOffset.toFixed(1)}px (tope ${BAR_VS_CANVAS_TOLERANCE_PX})`,
    )

    await context.close()
  }
}

// ---------------------------------------------------------------------------
// 3.8. V2.7 (b) — CANTIDAD y UNIDAD de la fila de alimento (hallazgo 2 del owner).
//
// Dos cosas distintas, las dos "desalineado" para quien mira la pantalla:
//   · el par cantidad/unidad tiene que compartir alto y centro vertical (se leen como un control
//     partido en dos);
//   · y la columna tiene que quedar QUIETA entre filas. Cada fila es su propia grilla, así que una
//     fila con menos dígitos de kcal encogía su columna del spark y corría la cantidad y la unidad
//     unos píxeles respecto de la fila de arriba — la escalera que el owner vio en «100 | ml».
//     Se afirma desde 1280 (`xl:`), que es donde el piso de ancho del spark entra en juego; entre
//     1024 y 1279 esos píxeles son del NOMBRE a propósito.
// ---------------------------------------------------------------------------
const QTY_UNIT_CENTER_TOLERANCE_PX = 1.5
const QTY_COLUMN_TOLERANCE_PX = 1

/** @param {import('@playwright/test').Page} page */
function quantityRowGeometry(page) {
  return page.evaluate(() => {
    const rows = []
    for (const field of document.querySelectorAll('input[aria-label^="Cantidad de"]')) {
      const row = field.closest('div.grid')
      if (!row) continue
      // La unidad es el `select` (item con alimento de catálogo en mano) o la caja de solo lectura
      // que lo reemplaza en los items hidratados. Las dos tienen que dar el mismo resultado.
      const unit =
        row.querySelector('select[aria-label="Unidad"]') ??
        row.querySelector('span[title^="Reemplaza"]')
      if (!unit) continue
      const a = field.getBoundingClientRect()
      const b = unit.getBoundingClientRect()
      rows.push({
        label: field.getAttribute('aria-label') ?? '',
        kind: unit.tagName.toLowerCase(),
        heightDelta: Math.abs(a.height - b.height),
        centerDelta: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
        quantityLeft: a.left,
        unitLeft: b.left,
      })
    }
    return rows
  })
}

async function smokeQuantityUnitAligned(browser) {
  for (const width of [768, 1280, 1536]) {
    const context = await newCheckContext(browser, {
      viewport: { width, height: 960 },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const rows = await quantityRowGeometry(page)
    if (rows.length === 0) {
      report(`cantidad y unidad alineadas — ${width}px`, false, 'no se encontró ninguna fila de alimento')
      await context.close()
      continue
    }

    const worst = rows.reduce((acc, row) => (row.centerDelta > acc.centerDelta ? row : acc), rows[0])
    const worstHeight = rows.reduce((acc, row) => (row.heightDelta > acc.heightDelta ? row : acc), rows[0])
    report(
      `cantidad y unidad comparten centro vertical — ${width}px`,
      worst.centerDelta <= QTY_UNIT_CENTER_TOLERANCE_PX && worstHeight.heightDelta <= QTY_UNIT_CENTER_TOLERANCE_PX,
      `${rows.length} filas · peorΔcentro=${worst.centerDelta.toFixed(2)}px («${worst.label}», ${worst.kind}) · peorΔalto=${worstHeight.heightDelta.toFixed(2)}px`,
    )

    if (width >= 1280) {
      const quantitySpread =
        Math.max(...rows.map((row) => row.quantityLeft)) - Math.min(...rows.map((row) => row.quantityLeft))
      const unitSpread = Math.max(...rows.map((row) => row.unitLeft)) - Math.min(...rows.map((row) => row.unitLeft))
      report(
        `la columna cantidad/unidad no se corre entre filas — ${width}px`,
        quantitySpread <= QTY_COLUMN_TOLERANCE_PX && unitSpread <= QTY_COLUMN_TOLERANCE_PX,
        `dispersiónCantidad=${quantitySpread.toFixed(1)}px dispersiónUnidad=${unitSpread.toFixed(1)}px (tope ${QTY_COLUMN_TOLERANCE_PX})`,
      )
    }

    await context.close()
  }
}

// ---------------------------------------------------------------------------
// 3.9. V2.7 (c) — CONTRAER/EXPANDIR una franja con la altura animada (hallazgo 3 del owner).
//
// El cuerpo dejó de apagarse con `hidden` y pasó al patrón `grid-template-rows: 0fr→1fr` con
// transición. Eso es exactamente el tipo de cambio que puede romper sin que se note: que el cuerpo
// quede "invisible" pero tabulable, que `aria-expanded` deje de decir la verdad, o que la card se
// remonte y se lleve puesto lo que el coach venía escribiendo. Se afirma el ciclo completo con una
// edición REAL de por medio (el nombre de la franja) y esperando a que la transición termine.
// ---------------------------------------------------------------------------
const SLOT_NAME_PROBE = 'Desayuno QA colapso'

async function smokeSlotCollapseStillWorks(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 960 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?mode=edit')
  await page.waitForTimeout(250)

  const nameInput = page.locator('input[id^="qe-slot-name-"]').first()
  await nameInput.fill(SLOT_NAME_PROBE)
  const toggle = page.getByRole('button', { name: /Contraer|Expandir/ }).first()
  const bodyId = await toggle.getAttribute('aria-controls')
  const body = page.locator(`#${bodyId ?? 'qe-slot-body'}`)

  const itemsBefore = await body.locator('input[aria-label^="Cantidad de"]').count()
  const expandedHeight = (await body.boundingBox())?.height ?? 0
  const expandedFirst = await toggle.getAttribute('aria-expanded')

  await toggle.click()
  await page.waitForTimeout(500) // 200ms de transición + margen
  const collapsed = await page.evaluate((id) => {
    const el = document.getElementById(id)
    if (!el) return null
    return { height: el.getBoundingClientRect().height, inert: el.hasAttribute('inert') }
  }, bodyId)
  const collapsedAria = await toggle.getAttribute('aria-expanded')
  report(
    '(g.1) contraer deja el cuerpo en altura 0 y fuera de alcance',
    expandedFirst === 'true' &&
      collapsedAria === 'false' &&
      collapsed != null &&
      collapsed.height <= 1 &&
      collapsed.inert,
    `aria=${expandedFirst}→${collapsedAria} altura=${collapsed?.height.toFixed(1)} inert=${collapsed?.inert}`,
  )

  await toggle.click()
  await page.waitForTimeout(500)
  const reopenedHeight = (await body.boundingBox())?.height ?? 0
  const stillInert = await body.evaluate((el) => el.hasAttribute('inert'))
  const itemsAfter = await body.locator('input[aria-label^="Cantidad de"]').count()
  const nameAfter = await nameInput.inputValue()
  report(
    '(g.2) expandir devuelve el cuerpo entero SIN perder estado',
    (await toggle.getAttribute('aria-expanded')) === 'true' &&
      Math.abs(reopenedHeight - expandedHeight) <= 1 &&
      !stillInert &&
      itemsAfter === itemsBefore &&
      itemsBefore > 0 &&
      nameAfter === SLOT_NAME_PROBE,
    `altura=${expandedHeight.toFixed(1)}→${reopenedHeight.toFixed(1)} inert=${stillInert} items=${itemsBefore}→${itemsAfter} nombre="${nameAfter}"`,
  )

  // El chevron gira media vuelta: en Tailwind v4 `rotate-180` escribe la propiedad `rotate`, así que
  // se mira esa (y el `transform` como respaldo, por si alguna vez vuelve a la utilidad vieja).
  const chevron = toggle.locator('svg').first()
  const rotationExpanded = await chevron.evaluate((el) => {
    const style = getComputedStyle(el)
    return { rotate: style.rotate, transform: style.transform, transition: style.transitionProperty }
  })
  await toggle.click()
  await page.waitForTimeout(500)
  const rotationCollapsed = await chevron.evaluate((el) => {
    const style = getComputedStyle(el)
    return { rotate: style.rotate, transform: style.transform }
  })
  const flips =
    rotationExpanded.rotate !== rotationCollapsed.rotate || rotationExpanded.transform !== rotationCollapsed.transform
  report(
    '(g.3) el chevron gira al contraer/expandir y la rotación va con transición',
    flips && /rotate|transform/.test(rotationExpanded.transition),
    `expandido=${rotationExpanded.rotate}/${rotationExpanded.transform} contraído=${rotationCollapsed.rotate}/${rotationCollapsed.transform} transition="${rotationExpanded.transition}"`,
  )

  await context.close()
}

// ---------------------------------------------------------------------------
// 3.95. «Familia N» (AddActionButton) — stories + swap de las superficies del editor.
//
// (a) Stories (`?stories=1`): las 8 muestras existen y se ven, y el CONTRASTE de la variante
//     `primary` se mide en el DOM, no a ojo. El bug que este assert existe para atrapar es el que
//     pidió el owner: fondo pintado con la marca del coach (que puede ser un amarillo) y tinta
//     decidida contra OTRO color ⇒ texto blanco sobre amarillo, ilegible. Por eso no alcanza con
//     "el botón está": se lee el `color` y el `background-color` COMPUTADOS del mismo elemento y
//     se calcula la razón de contraste WCAG entre los dos.
//
// (b) Editor (`?mode=edit`): los botones nuevos existen en el lienzo y DISPARAN — «Agregar franja»
//     abre su sheet (nombre + hora) y «Alimento libre» agrega una fila de verdad. Un swap visual
//     que se lleve puesto el handler pasaría cualquier captura sin que nadie lo note.
// ---------------------------------------------------------------------------
const ADD_ACTION_STORIES = [
  'story-add-action-neutral',
  'story-add-action-dashed',
  'story-add-action-primary',
  'story-add-action-primary-light',
  'story-add-action-primary-dark',
  'story-add-action-stack',
  'story-add-action-stack-primary',
  'story-add-action-disabled',
]

/** Mínimo WCAG AA para texto normal. La familia usa 13px semibold: no califica como "large". */
const ADD_ACTION_MIN_CONTRAST = 4.5

/** `rgb(245, 217, 10)` / `rgba(...)` → `{r,g,b}`; null si el navegador devolvió otra cosa. */
function parseRgb(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? '')
  if (!match) return null
  const parts = match[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null
  return { r: parts[0], g: parts[1], b: parts[2] }
}

function relativeLuminance({ r, g, b }) {
  const channel = (raw) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

const isNearWhite = (rgb) => rgb.r >= 240 && rgb.g >= 240 && rgb.b >= 240

async function smokeAddActionStories(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1')
  await page.waitForTimeout(200)

  for (const testId of ADD_ACTION_STORIES) {
    const button = page.locator(`[data-testid="${testId}"] button`)
    const count = await button.count()
    const visible = count > 0 && (await button.first().isVisible())
    report(`familia N: ${testId} visible`, count === 1 && visible, `count=${count} visible=${visible}`)
  }

  // El stack tiene que pintar las 3 monedas (si el `slice`/`map` se rompe, el botón sigue
  // "visible" pero pierde justo la silueta que lo hace reconocible).
  const stackCoins = await page.locator('[data-testid="story-add-action-stack"] button img').count()
  report('familia N: el stack pinta 3 monedas de categoría', stackCoins === 3, `imgs=${stackCoins}`)

  const inks = await page.evaluate(() => {
    const read = (testId) => {
      const button = document.querySelector(`[data-testid="${testId}"] button`)
      if (!button) return null
      const style = getComputedStyle(button)
      const label = button.querySelector('span:last-child > span:last-child')
      return {
        color: style.color,
        background: style.backgroundColor,
        labelColor: label ? getComputedStyle(label).color : null,
      }
    }
    return {
      light: read('story-add-action-primary-light'),
      dark: read('story-add-action-primary-dark'),
    }
  })

  for (const [key, expectWhite, brand] of [
    ['light', false, '#F5D90A'],
    ['dark', true, '#1D4ED8'],
  ]) {
    const ink = inks[key]
    if (!ink) {
      report(`familia N: contraste real de primary-${key}`, false, 'no se encontró el botón de la story')
      continue
    }
    const text = parseRgb(ink.color)
    const background = parseRgb(ink.background)
    const label = parseRgb(ink.labelColor)
    if (!text || !background) {
      report(
        `familia N: contraste real de primary-${key}`,
        false,
        `color="${ink.color}" background="${ink.background}"`,
      )
      continue
    }
    const ratio = contrastRatio(text, background)
    const whiteOk = isNearWhite(text) === expectWhite
    // El label hereda la tinta del botón: si alguien le mete un `text-white` de utilidad, el
    // contraste calculado sobre el botón mentiría. Se compara el color REAL del texto pintado.
    const labelMatches = label != null && label.r === text.r && label.g === text.g && label.b === text.b
    report(
      `familia N: marca ${brand} (${expectWhite ? 'oscura ⇒ tinta blanca' : 'clara ⇒ tinta NO blanca'})`,
      whiteOk && labelMatches,
      `color=${ink.color} label=${ink.labelColor} background=${ink.background}`,
    )
    report(
      `familia N: contraste real ≥${ADD_ACTION_MIN_CONTRAST}:1 en primary-${key}`,
      ratio >= ADD_ACTION_MIN_CONTRAST,
      `ratio=${ratio.toFixed(2)}:1 (${ink.color} sobre ${ink.background})`,
    )
  }

  await context.close()
}

async function smokeAddActionsInEditor(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 960 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?mode=edit')
  await page.waitForTimeout(250)

  const addSlot = page.locator('[data-testid="qe-add-slot"]')
  const addFood = page.locator('[data-testid="qe-add-food"]')
  const addFree = page.locator('[data-testid="qe-add-free-food"]')
  const slotCount = await addSlot.count()
  const foodCount = await addFood.count()
  const freeCount = await addFree.count()
  report(
    'familia N en el editor: existen «Agregar franja», «Agregar alimento» y «Alimento libre»',
    slotCount >= 1 && foodCount >= 1 && freeCount === foodCount,
    `franja=${slotCount} alimento=${foodCount} libre=${freeCount}`,
  )
  // La variante importa: el pie de la franja es neutral + punteado, no dos pastillas iguales.
  const foodVariant = foodCount > 0 ? await addFood.first().getAttribute('data-variant') : null
  const freeVariant = freeCount > 0 ? await addFree.first().getAttribute('data-variant') : null
  report(
    'familia N en el editor: alimento=neutral y libre=dashed',
    foodVariant === 'neutral' && freeVariant === 'dashed',
    `alimento=${foodVariant} libre=${freeVariant}`,
  )

  // (b) DISPARAN. «Agregar franja» abre el sheet con el campo de nombre.
  const slotNameField = page.locator('#qe-new-slot-name')
  const openBefore = await slotNameField.count()
  await addSlot.first().click()
  await page.waitForTimeout(350)
  const sheetOpen = (await slotNameField.count()) > 0 && (await slotNameField.first().isVisible())
  report(
    'familia N: «Agregar franja» abre su sheet (nombre + hora)',
    openBefore === 0 && sheetOpen,
    `antes=${openBefore} visibleDespués=${sheetOpen}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // «Alimento libre» despacha el alta de verdad: una fila más en la franja.
  const quantityFields = page.locator('input[aria-label^="Cantidad de"]')
  const rowsBefore = await quantityFields.count()
  await addFree.first().click()
  await page.waitForTimeout(300)
  const rowsAfter = await quantityFields.count()
  report(
    'familia N: «Alimento libre» agrega una fila (handler vivo)',
    rowsBefore > 0 && rowsAfter === rowsBefore + 1,
    `filas=${rowsBefore}→${rowsAfter}`,
  )

  await context.close()
}

/**
 * El trigger de «Agregar día» del rail pasó a ser un `AddActionButton` renderizado por el `render`
 * de Base UI. Es el cambio más frágil de la tanda: si el trigger deja de recibir sus props, el
 * botón se ve perfecto y no abre nada. En el harness el coach es FREE, así que lo que abre es el
 * panel de upsell — da igual: lo que se afirma es que el popover ABRE.
 */
async function smokeAddDayTriggerStillOpens(browser) {
  const context = await newCheckContext(browser, { viewport: { width: 1280, height: 960 }, colorScheme: 'light' })
  const page = await context.newPage()
  await gotoHarness(page, '?mode=edit')
  await page.waitForTimeout(250)

  const trigger = page.locator('nav[aria-labelledby="qe-day-rail-title"] [data-testid="qe-add-day"]')
  const count = await trigger.count()
  const variant = count > 0 ? await trigger.first().getAttribute('data-variant') : null
  report(
    'familia N: el rail usa la pastilla punteada para «Agregar día»',
    count === 1 && variant === 'dashed',
    `count=${count} variant=${variant}`,
  )
  if (count === 1) {
    await trigger.first().click()
    await page.waitForTimeout(300)
    const openPanels = await page.locator('[data-slot="popover-content"][data-open]').count()
    report('familia N: «Agregar día» sigue abriendo su popover', openPanels === 1, `abiertos=${openPanels}`)
    await page.keyboard.press('Escape')
  }

  await context.close()
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
// 3.97. Sello EVA v2 (SPEC `docs/specs/eva-seal-background/`, gate S2.2 — PLAN §4).
//
// El harness gana `?seal=1`: monta `AppSeal b` sobre la maqueta activa publicando el par
// `--seal-p-rgb`/`--seal-s-rgb` EXACTAMENTE como los layouts de producción (misma
// `buildSealCssVars`: par `sealPair` derivado — el harness no tiene preset — y pintado claro
// del blob 2). `?sealBrand=RRGGBB` cambia la marca de prueba, así que la segunda marca entra
// por el MISMO camino que en producción (page → buildSealCssVars → sealPair), no por un var
// forzado a mano que el blob podría ignorar.
//
// Qué se afirma y por qué:
//   (a) COLOR REAL de los blobs, no solo presencia: el gradiente computado resuelve las vars,
//       así que se le parsea el rgba() y se compara HUE contra el par derivado esperado
//       (blob 1 = hue del primario; blob 2 = hue+38° — la fórmula D3.2 rota el hue y solo
//       mueve S/L, y el pintado claro del blob 2 tampoco toca el hue, así que el hue es el
//       invariante estable frente al redondeo hsl→hex). Los ALPHAS son los tokens D5 por tema
//       (claro .15/.13, dark .16/.14): un token pisado o un `.dark` que no aplica cae acá.
//   (b) CONTRASTE INTACTO (invariante de la SPEC: «el contraste WCAG de los textos de las
//       superficies clave no cambia con el sello activo»): 3 textos clave del editor medidos
//       con getComputedStyle + la misma matemática de luminancia de la «familia N», CON y SIN
//       sello — colores idénticos y razón idéntica. Atraparía a quien "integre" el sello
//       volviendo translúcida una superficie de contenido.
//   (c) REDUCED-MOTION (D4): `page.emulateMedia({reducedMotion:'reduce'})` ⇒ getAnimations()
//       de los blobs queda vacío o pausado, y los blobs SIGUEN visibles (estáticos, no
//       desaparecen). Control positivo antes de emular: con motion normal las 2 derivas
//       corren — sin esto, el «0 animaciones» podría estar verde porque el CSS de la deriva
//       nunca cargó. El grano no anima JAMÁS, ni siquiera con motion normal.
//   (d) PRE-AUTH LIMPIO (D2): fetch del HTML de /login del dev server ⇒ cero apariciones del
//       marcador `data-eva-seal="` (la forma de MARKUP del atributo que `AppSeal` expone —
//       con `="` para no confundirse con el selector de globals.css si algún día viajara
//       inline). El mismo marcador se confirma PRESENTE en el harness con `?seal=1` y AUSENTE
//       sin él: el positivo evita un verde vacío y el negativo prueba que sin `?seal` el
//       árbol del harness queda como siempre.
//
// Capturas: dark/light × 2 marcas a 1280 (misma infraestructura de SHOTS_DIR/shotCount),
// con la raíz opaca de la maqueta vuelta transparente SOLO para la foto (la oclusión no
// existe en los shells de producción) y un assert de que las 2 marcas difieren en píxeles —
// una captura donde el sello no se VE no le sirve al QA visual del dueño.
// ---------------------------------------------------------------------------
const SEAL_BRANDS = [
  // `hex` = lo que la page resuelve: sin `?sealBrand` cae a BRAND_PRIMARY_COLOR (#1462DC).
  { label: 'eva', hex: '#1462DC', query: '' },
  // Verde de las marcas de prueba de la SPEC (criterios de aceptación).
  { label: 'verde', hex: '#16A34A', query: '&sealBrand=16A34A' },
]
/** Rotación de hue de la fórmula derivada D3.2 (espejo de SEAL_HUE_SHIFT en brand-kit/seal.ts). */
const SEAL_HUE_SHIFT_DEG = 38
/** El redondeo hsl→hex de 8 bits puede correr el hue ~1-2° en colores oscuros/saturados. */
const SEAL_HUE_TOLERANCE_DEG = 3
const SEAL_ALPHA_TOLERANCE = 0.005
/** Tokens D5 (`--seal-blob*-alpha` de globals.css, espejo SEAL_TOKENS de theme.ts). */
const SEAL_BLOB_ALPHAS = {
  light: { blob1: 0.15, blob2: 0.13 },
  dark: { blob1: 0.16, blob2: 0.14 },
}
const SEAL_MARKER = 'data-eva-seal="'

/** `rgba(20, 98, 220, 0.15)` / `rgb(...)` → `{r,g,b,a}` (a=1 si falta); null si no parsea. */
function parseRgba(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? '')
  if (!match) return null
  const parts = match[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 }
}

/** `#RRGGBB` → `{r,g,b}`. */
function hexToRgbTriple(hex) {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

/** Hue HSL en grados [0, 360). Gris (delta 0) ⇒ 0, mismo criterio fail-safe del helper RN/web. */
function rgbToHue({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  if (delta === 0) return 0
  let hue
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  return (hue * 60 + 360) % 360
}

/** Distancia angular mínima entre dos hues (el círculo: 359° y 1° distan 2°, no 358°). */
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/**
 * Lee las DOS capas de blob del sello montado: visibilidad real + primer color del gradiente
 * computado (las custom properties ya vienen resueltas en el valor computado).
 * @param {import('@playwright/test').Page} page
 */
function sealBlobSnapshot(page) {
  return page.evaluate(() => {
    const seal = document.querySelector('[data-eva-seal="b"]')
    if (!seal) return { error: 'no hay [data-eva-seal="b"] en el DOM' }
    const read = (selector) => {
      const el = seal.querySelector(selector)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const match = /rgba?\(([^)]+)\)/.exec(style.backgroundImage)
      return {
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.opacity !== '0',
        color: match ? match[0] : null,
        backgroundImage: style.backgroundImage.slice(0, 90),
      }
    }
    return {
      isDark: document.documentElement.classList.contains('dark'),
      blob1: read('.eva-seal-blob1'),
      blob2: read('.eva-seal-blob2'),
    }
  })
}

/** @param {import('@playwright/test').Browser} browser */
async function smokeSealBlobsDerivedColors(browser) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  for (const brand of SEAL_BRANDS) {
    const brandHue = rgbToHue(hexToRgbTriple(brand.hex))
    const expectedHues = {
      blob1: brandHue,
      blob2: (brandHue + SEAL_HUE_SHIFT_DEG) % 360,
    }
    for (const theme of THEMES) {
      const context = await newCheckContext(browser, {
        viewport: { width: 1280, height: 800 },
        colorScheme: theme,
      })
      const page = await context.newPage()
      await gotoHarness(page, `?stories=1&seal=1${brand.query}`)
      await page.waitForTimeout(150)

      // SOLO para la CAPTURA: la raíz de las stories pinta `bg-surface-app` OPACO encima del
      // sello (`-z-10`), así que la foto saldría sin un solo píxel de blob (y dos marcas
      // darían PNGs byte-idénticos — verificado). En producción los shells dejan el lienzo
      // de contenido transparente sobre el sello (SPEC D2); esta regla reproduce ESA
      // condición solo en la raíz directa de la maqueta bajo SealStage. Los asserts de color
      // de arriba no dependen de esto (computed style no ve oclusión).
      await page.addStyleTag({
        content: "div:has(> [data-eva-seal='b']) > .bg-surface-app { background-color: transparent !important; }",
      })
      await page.waitForTimeout(50)

      const snap = await sealBlobSnapshot(page)
      if (snap.error) {
        report(`Sello (a): blobs presentes — ${brand.label} ${theme}`, false, snap.error)
        await context.close()
        continue
      }
      report(
        `Sello (a): tema aplicado — ${brand.label} ${theme}`,
        snap.isDark === (theme === 'dark'),
        `html.dark=${snap.isDark}`,
      )
      for (const key of ['blob1', 'blob2']) {
        const blob = snap[key]
        const label = `Sello (a): ${key} ${brand.label} (${brand.hex}) ${theme}`
        if (!blob || !blob.visible) {
          report(`${label} — visible`, false, `blob=${JSON.stringify(blob)}`)
          continue
        }
        const rgba = parseRgba(blob.color)
        if (!rgba) {
          report(`${label} — color del gradiente parseable`, false, `backgroundImage="${blob.backgroundImage}"`)
          continue
        }
        const hue = rgbToHue(rgba)
        const hueDelta = hueDistance(hue, expectedHues[key])
        report(
          `${label} — hue del par derivado`,
          hueDelta <= SEAL_HUE_TOLERANCE_DEG,
          `hue=${hue.toFixed(1)}° esperado=${expectedHues[key].toFixed(1)}° Δ=${hueDelta.toFixed(1)}° (${blob.color})`,
        )
        const expectedAlpha = SEAL_BLOB_ALPHAS[theme][key]
        report(
          `${label} — alpha D5`,
          Math.abs(rgba.a - expectedAlpha) <= SEAL_ALPHA_TOLERANCE,
          `alpha=${rgba.a} esperado=${expectedAlpha}`,
        )
      }

      const filePath = join(SHOTS_DIR, `seal-1280-${theme}-${brand.label}.png`)
      await page.screenshot({ path: filePath, fullPage: true })
      shotCount += 1
      console.log(`      captura: ${filePath}`)

      await context.close()
    }
  }

  // Las capturas tienen que MOSTRAR el sello: con los blobs tapados por algo opaco, las 2
  // marcas producen PNGs byte-idénticos (exactamente así se descubrió la oclusión de la
  // maqueta de stories). Los asserts de color de arriba NO atrapan eso — computed style no
  // ve oclusión — así que se compara el pixel real.
  for (const theme of THEMES) {
    const pathA = join(SHOTS_DIR, `seal-1280-${theme}-${SEAL_BRANDS[0].label}.png`)
    const pathB = join(SHOTS_DIR, `seal-1280-${theme}-${SEAL_BRANDS[1].label}.png`)
    try {
      const bufferA = readFileSync(pathA)
      const bufferB = readFileSync(pathB)
      report(
        `Sello (a): las capturas de las 2 marcas difieren en píxeles (el sello se VE) — ${theme}`,
        !bufferA.equals(bufferB),
        bufferA.equals(bufferB)
          ? 'PNGs byte-idénticos: los blobs están tapados'
          : `bytes ${SEAL_BRANDS[0].label}=${bufferA.length} ${SEAL_BRANDS[1].label}=${bufferB.length}`,
      )
    } catch (err) {
      report(
        `Sello (a): capturas de las 2 marcas — ${theme}`,
        false,
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}

/**
 * (b) Los 3 textos clave del editor cuyos colores computados NO pueden moverse con el sello.
 * Superficies distintas a propósito: CTA sólido de la cinta, input de la card de franja y la
 * pastilla punteada de «Alimento libre».
 */
const SEAL_CONTRAST_TEXTS = [
  { label: 'CTA de la cinta', selector: '[data-testid="editor-ribbon"] button' },
  { label: 'nombre de franja (input)', selector: 'input[id^="qe-slot-name-"]' },
  { label: 'botón «Alimento libre»', selector: '[data-testid="qe-add-free-food"]' },
]
const SEAL_CONTRAST_RATIO_TOLERANCE = 0.01

/**
 * Color de tinta + fondo EFECTIVO (el primer background-color con alpha ≥ .99 subiendo por los
 * ancestros — los textos clave viven sobre cards sólidas, ese es justamente el invariante).
 * @param {import('@playwright/test').Page} page
 */
function sealTextColorSnapshot(page) {
  return page.evaluate((texts) => {
    const effectiveBackground = (el) => {
      let node = el
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor
        const match = /rgba?\(([^)]+)\)/.exec(bg)
        if (match) {
          const parts = match[1]
            .split(/[,\s/]+/)
            .filter(Boolean)
            .map(Number)
          const alpha = parts.length >= 4 ? parts[3] : 1
          if (alpha >= 0.99) return bg
        }
        node = node.parentElement
      }
      return getComputedStyle(document.body).backgroundColor
    }
    return texts.map(({ label, selector }) => {
      const el = document.querySelector(selector)
      if (!el) return { label, error: `no existe ${selector}` }
      return { label, color: getComputedStyle(el).color, background: effectiveBackground(el) }
    })
  }, SEAL_CONTRAST_TEXTS)
}

async function smokeSealContrastUnchanged(browser) {
  for (const theme of THEMES) {
    const context = await newCheckContext(browser, {
      viewport: { width: 1280, height: 960 },
      colorScheme: theme,
    })
    const page = await context.newPage()

    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)
    const withoutSeal = await sealTextColorSnapshot(page)

    await gotoHarness(page, '?mode=edit&seal=1')
    await page.waitForTimeout(250)
    const withSeal = await sealTextColorSnapshot(page)

    for (let i = 0; i < SEAL_CONTRAST_TEXTS.length; i++) {
      const off = withoutSeal[i]
      const on = withSeal[i]
      const label = `Sello (b): contraste intacto «${SEAL_CONTRAST_TEXTS[i].label}» — ${theme}`
      if (off.error || on.error) {
        report(label, false, off.error ?? on.error)
        continue
      }
      const offInk = parseRgb(off.color)
      const offBg = parseRgb(off.background)
      const onInk = parseRgb(on.color)
      const onBg = parseRgb(on.background)
      if (!offInk || !offBg || !onInk || !onBg) {
        report(label, false, `sin parsear: off=${off.color}/${off.background} on=${on.color}/${on.background}`)
        continue
      }
      const ratioOff = contrastRatio(offInk, offBg)
      const ratioOn = contrastRatio(onInk, onBg)
      report(
        label,
        off.color === on.color &&
          off.background === on.background &&
          Math.abs(ratioOff - ratioOn) <= SEAL_CONTRAST_RATIO_TOLERANCE,
        `off=${ratioOff.toFixed(2)}:1 on=${ratioOn.toFixed(2)}:1 tinta=${on.color} fondo=${on.background}`,
      )
    }

    await context.close()
  }
}

async function smokeSealReducedMotionFreezes(browser) {
  const context = await newCheckContext(browser, {
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  })
  const page = await context.newPage()
  await gotoHarness(page, '?stories=1&seal=1')
  await page.waitForTimeout(150)

  // Control positivo (motion normal): las 2 derivas corren y el grano no anima NUNCA.
  const before = await page.evaluate(() => {
    const blobs = [...document.querySelectorAll('[data-eva-seal="b"] .eva-seal-blob')]
    const grain = document.querySelector('[data-eva-seal="b"] .eva-seal-grain')
    return {
      blobCount: blobs.length,
      states: blobs.flatMap((el) => el.getAnimations().map((a) => a.playState)),
      grainAnimations: grain ? grain.getAnimations().length : -1,
    }
  })
  report(
    'Sello (c): control positivo — con motion normal las 2 derivas corren',
    before.blobCount === 2 && before.states.length === 2 && before.states.every((s) => s === 'running'),
    `blobs=${before.blobCount} estados=[${before.states.join(', ')}]`,
  )
  report(
    'Sello (c): el grano JAMÁS anima (ni con motion normal)',
    before.grainAnimations === 0,
    `animaciones=${before.grainAnimations}`,
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => {
    const blobs = [...document.querySelectorAll('[data-eva-seal="b"] .eva-seal-blob')]
    return {
      blobCount: blobs.length,
      running: blobs.flatMap((el) => el.getAnimations().filter((a) => a.playState === 'running')).length,
      visible: blobs.every((el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.opacity !== '0'
      }),
    }
  })
  report(
    'Sello (c): reduced-motion emulado congela la deriva (0 animaciones corriendo)',
    after.blobCount === 2 && after.running === 0,
    `blobs=${after.blobCount} corriendo=${after.running}`,
  )
  report('Sello (c): los blobs quedan ESTÁTICOS, no desaparecen', after.visible, `visibles=${after.visible}`)

  await context.close()
}

async function smokeSealPreAuthClean() {
  const cases = [
    {
      label: 'el marcador existe en el harness con ?seal=1 (positivo anti-verde-vacío)',
      url: `${BASE_URL}${HARNESS_PATH}?stories=1&seal=1`,
      expectMarker: true,
    },
    {
      label: 'sin ?seal el harness NO monta el sello (árbol como siempre)',
      url: `${BASE_URL}${HARNESS_PATH}?stories=1`,
      expectMarker: false,
    },
    { label: '/login (pre-auth) sin rastro del sello', url: `${BASE_URL}/login`, expectMarker: false },
  ]
  for (const c of cases) {
    try {
      // Timeout AMPLIO: la primera visita a una ruta bajo `next dev` la COMPILA — la /login
      // fría pasaba de 30s y el abort del fetch se disfrazaba de rojo del assert.
      const res = await fetch(c.url, { signal: AbortSignal.timeout(120_000) })
      const html = await res.text()
      const hasMarker = html.includes(SEAL_MARKER)
      report(
        `Sello (d): ${c.label}`,
        res.ok && hasMarker === c.expectMarker,
        `status=${res.status} marcador=${hasMarker}`,
      )
    } catch (err) {
      report(`Sello (d): ${c.label}`, false, err instanceof Error ? err.message : String(err))
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Guía Viva (SPEC `nutrition-onboarding-tour`, G2.3) — D2 «?» sin solapes + D3 recorrido
//    completo con tarjeta ⊆ viewport + D4 flag evita re-auto-arranque. Los DOS invariantes con
//    "gate geométrico" del dueño (D2 y D3) son BLOQUEANTES: en rojo, la tanda no cierra.
// ---------------------------------------------------------------------------

/**
 * 4.1 — D2: el «?» real del editor (`?mode=edit`) NUNCA intersecta ningún control interactivo.
 *
 * El editor monta DOS instancias de `TourHelpButton` a la vez (`corner` ≥1024 fijo a la esquina del
 * lienzo, `docked` <1024 dentro de la `PublishBar`) y usan CSS —no JS— para turnarse (SPEC D2, y el
 * comentario de `EditorTourHelpButton` en `QuickEditPlanView.tsx`): por eso el assert primero filtra
 * a la VISIBLE (rect > 0, no `display:none`) y falla también si hay más de una visible a la vez —
 * eso significaría que las dos clases responsive se solaparon y el invariante de "una sola por
 * breakpoint" ya se rompió antes de medir nada.
 *
 * Tolerancia 0 literal (SPEC D2): cualquier píxel de intersección real cuenta. Bordes que se TOCAN
 * (overlap = 0 exacto) no son intersección — mismo criterio que `rectsIntersect` de `tour-geometry.ts`.
 */
const TOUR_HELP_OVERLAP_TOLERANCE_PX = 0

/** @param {import('@playwright/test').Page} page @param {number} tolerance */
function helpButtonOverlaps(page, tolerance) {
  return page.evaluate((tol) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
    }
    const describe = (el) => {
      const label = el.getAttribute('aria-label') ?? ''
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)
      return `${el.tagName.toLowerCase()}${label ? `[${label}]` : ''}${text ? ` «${text}»` : ''}`
    }

    const helpCandidates = [...document.querySelectorAll('[data-tour="help"]')].filter(isVisible)
    if (helpCandidates.length === 0) return { error: 'no hay [data-tour="help"] visible en el DOM' }
    if (helpCandidates.length > 1) {
      return {
        error: `${helpCandidates.length} instancias de [data-tour="help"] visibles a la vez (debería turnarse una sola por breakpoint)`,
      }
    }
    const help = helpCandidates[0]
    const helpRect = help.getBoundingClientRect()

    const interactive = [...document.querySelectorAll('button, a, input, select')].filter(
      (el) => el !== help && isVisible(el),
    )

    const collisions = []
    for (const el of interactive) {
      const rect = el.getBoundingClientRect()
      const overlapX = Math.min(helpRect.right, rect.right) - Math.max(helpRect.left, rect.left)
      const overlapY = Math.min(helpRect.bottom, rect.bottom) - Math.max(helpRect.top, rect.top)
      if (overlapX > tol && overlapY > tol) {
        collisions.push(`${describe(el)} (${Math.round(overlapX)}×${Math.round(overlapY)}px)`)
      }
    }
    return {
      helpRect: {
        top: Math.round(helpRect.top),
        left: Math.round(helpRect.left),
        width: Math.round(helpRect.width),
        height: Math.round(helpRect.height),
      },
      interactiveCount: interactive.length,
      collisions,
    }
  }, tolerance)
}

async function smokeTourHelpNoOverlap(browser) {
  for (const viewport of VIEWPORTS) {
    const context = await newCheckContext(browser, {
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, '?mode=edit')
    await page.waitForTimeout(250)

    const result = await helpButtonOverlaps(page, TOUR_HELP_OVERLAP_TOLERANCE_PX)
    if (result.error) {
      report(`Guía Viva D2: «?» sin solapes — ${viewport.label}px`, false, result.error)
    } else {
      report(
        `Guía Viva D2: «?» sin solapes — ${viewport.label}px`,
        result.collisions.length === 0,
        result.collisions.length === 0
          ? `rect=${JSON.stringify(result.helpRect)} · ${result.interactiveCount} interactivos · 0 solapes`
          : result.collisions.join(' | '),
      )
    }

    await context.close()
  }
}

/**
 * 4.2 — D3/D4: recorrido COMPLETO de un guion (`?tour=editor|hub`, ver `tour-stories.tsx`) por
 * ancho. Por cada paso: la tarjeta (`[data-tour-card]`) tiene que caber ENTERA en el viewport
 * (tolerancia 0, SPEC D3) y, cuando el paso SÍ encuentra su target en ese ancho, el halo tiene que
 * estar visible (SPEC D5 — el halo es lo que tapa el hueco y deja la UI de abajo inerte).
 *
 * "Cuando el paso encuentra su target" no es una salvedad del gate: es el contrato documentado del
 * propio motor (`tour-geometry.ts`, `computeSpotlight`): si el `data-tour` de un paso vive detrás de
 * un breakpoint que lo oculta (la maqueta del editor esconde `rail`/`paleta` bajo `lg`/`xl`, IGUAL
 * que las superficies reales), el recorte degrada a 0×0 y la tarjeta se centra sola — sin halo,
 * porque no hay nada que iluminar. Pedirle halo a un paso sin target sería un falso rojo permanente
 * a los anchos angostos, no un bug real.
 */
const TOUR_SEL = {
  overlay: '[data-tour-overlay]',
  card: '[data-tour-card]',
  halo: '[data-tour-halo]',
  next: '[data-tour-action="next"]',
  skip: '[data-tour-action="skip"]',
  flag: '[data-testid="tour-story-flag"]',
  reset: '[data-testid="tour-story-reset"]',
}

/** Pausa que cubre la transición de geometría (D5: 220-280ms) + margen de re-medición. */
const TOUR_STEP_SETTLE_MS = 320

/**
 * El widget de Next.js Dev Tools (`<nextjs-portal>`, SOLO existe bajo `next dev`) vive fijo cerca de
 * la esquina inferior izquierda con un z-index por encima de todo — justo donde cae «Saltar» en la
 * variante `dock` (<768, SPEC D3: "tarjeta anclada abajo a lo ancho"). Un click de Playwright hace
 * hit-testing como un mouse real: el widget se queda con el evento y `page.click()` cuelga 30s
 * reintentando (`<nextjs-portal>… subtree intercepts pointer events`). Este disparo va directo al
 * listener del DOM — el mismo evento `click` que dispara un mouse real, sin el hit-testing del
 * navegador — y NO tapa un bug de producto: el widget no existe fuera de `next dev`.
 * @param {import('@playwright/test').Page} page @param {string} selector
 */
async function clickTourControl(page, selector) {
  await page.locator(selector).waitFor({ state: 'visible' })
  await page.locator(selector).evaluate((el) => el.click())
}

/** @param {import('@playwright/test').Page} page */
function tourStepGeometry(page) {
  return page.evaluate((sel) => {
    const overlay = document.querySelector(sel.overlay)
    const card = document.querySelector(sel.card)
    if (!overlay || !card) {
      return { cardInViewport: false, hasTarget: false, haloVisible: false, detail: 'sin overlay/tarjeta en el DOM' }
    }
    const cardRect = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cardInViewport =
      cardRect.left >= 0 && cardRect.top >= 0 && cardRect.right <= vw && cardRect.bottom <= vh

    const targetName = overlay.getAttribute('data-tour-target')
    const value = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(targetName ?? '') : targetName
    const targetEl = targetName ? document.querySelector(`[data-tour="${value}"]`) : null
    const hasTarget = Boolean(targetEl && targetEl.getClientRects().length > 0)

    const halo = document.querySelector(sel.halo)
    const haloVisible = Boolean(halo) && halo.getBoundingClientRect().width > 0 && halo.getBoundingClientRect().height > 0

    return {
      cardInViewport,
      hasTarget,
      haloVisible,
      detail:
        `card=[${Math.round(cardRect.left)},${Math.round(cardRect.top)},${Math.round(cardRect.right)},${Math.round(cardRect.bottom)}]` +
        ` viewport=${vw}x${vh} target="${targetName}" hasTarget=${hasTarget} halo=${haloVisible}`,
    }
  }, TOUR_SEL)
}

/** @param {import('@playwright/test').Browser} browser @param {'editor' | 'hub'} tourId */
async function smokeTourWalkthrough(browser, tourId) {
  for (const viewport of VIEWPORTS) {
    const label = `${tourId} @ ${viewport.label}px`
    const context = await newTourContext(browser, {
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    await gotoHarness(page, `?tour=${tourId}`)

    // D4, mitad 1: SIN flag sembrado, el guion auto-arranca solo (invariante de la SPEC).
    await page.waitForSelector(TOUR_SEL.overlay, { timeout: 5_000 }).catch(() => {})
    const autoOpened = (await page.locator(TOUR_SEL.overlay).count()) > 0
    report(`Guía Viva D4: auto-arranca sin flag — ${label}`, autoOpened)
    if (!autoOpened) {
      await context.close()
      continue
    }

    const totalRaw = await page.getAttribute(TOUR_SEL.overlay, 'data-tour-total')
    const total = Number(totalRaw) || 0
    report(`Guía Viva: el guion "${tourId}" tiene pasos — ${label}`, total > 0, `total=${totalRaw}`)

    await page.waitForTimeout(TOUR_STEP_SETTLE_MS) // asienta el paso 1 (auto-arranque + 1ra medición)

    for (let step = 1; step <= total; step++) {
      const geo = await tourStepGeometry(page)
      report(`Guía Viva D3: tarjeta ⊆ viewport — paso ${step}/${total} — ${label}`, geo.cardInViewport, geo.detail)
      if (geo.hasTarget) {
        report(`Guía Viva D5: halo visible (target en pantalla) — paso ${step}/${total} — ${label}`, geo.haloVisible, geo.detail)
      }
      if (step < total) {
        await clickTourControl(page, TOUR_SEL.next)
        await page.waitForTimeout(TOUR_STEP_SETTLE_MS)
      }
    }

    // «Saltar» SIEMPRE visible (SPEC D5) y cierra el tour desde cualquier paso — se prueba en el
    // último, que es donde «Saltar» convive con «Listo» en vez de con la flecha «→».
    await clickTourControl(page, TOUR_SEL.skip)
    await page.waitForTimeout(200)
    const closedAfterSkip = (await page.locator(TOUR_SEL.card).count()) === 0
    report(`Guía Viva: «Saltar» cierra el tour — ${label}`, closedAfterSkip)

    // D4, mitad 2: «Saltar» marca el flag igual que «Listo» — no se insiste.
    const flagAfterSkip = (await page.locator(TOUR_SEL.flag).textContent())?.trim()
    report(`Guía Viva D4: «Saltar» marca el flag — ${label}`, flagAfterSkip === 'marcado', `flag="${flagAfterSkip}"`)

    // El flag sobrevive un reload real (no es solo estado de React) y evita el re-auto-arranque.
    await page.reload({ waitUntil: 'networkidle' })
    await ensureNoCookieBanner(page)
    await page.waitForTimeout(300)
    const overlayCountAfterReload = await page.locator(TOUR_SEL.overlay).count()
    report(
      `Guía Viva D4: el flag evita re-auto-arranque tras reload — ${label}`,
      overlayCountAfterReload === 0,
      `overlayCount=${overlayCountAfterReload}`,
    )

    // Cierra el círculo con la OTRA mitad del invariante (comentario de `tour-stories.tsx`: "el gate
    // de G2.3 puede verificar las DOS mitades"): limpiar el flag con «Reiniciar guía» + reload vuelve
    // a auto-arrancar. Si esto fallara, «evita re-auto-arranque» de arriba podría estar en verde por
    // una razón equivocada (p.ej. el guion roto y `TourStories` sin montar nada nunca).
    await clickTourControl(page, TOUR_SEL.reset)
    await page.reload({ waitUntil: 'networkidle' })
    await ensureNoCookieBanner(page)
    await page.waitForTimeout(300)
    const overlayCountAfterReset = await page.locator(TOUR_SEL.overlay).count()
    report(
      `Guía Viva D4: «Reiniciar guía» + reload vuelve a auto-arrancar — ${label}`,
      overlayCountAfterReset > 0,
      `overlayCount=${overlayCountAfterReset}`,
    )

    await context.close()
  }
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

    console.log('\nPaso 5/7 — contrato responsive V2.5 (cinta/rail/paleta en 768 y 1024)…')
    await smokeRibbonRailPaletteByBreakpoint(browser)
    await smokeRibbonNoOverlap(browser)
    await smokeTouchTargetsCoarse(browser)

    console.log('\nPaso 6/7 — geometría V2.7 (centrado 1536/1920 · cantidad+unidad · colapso)…')
    await smokeCanvasCenteredOnWide(browser)
    await smokeQuantityUnitAligned(browser)
    await smokeSlotCollapseStillWorks(browser)

    console.log('\nPaso 7/8 — «Familia N» (stories con contraste real + swap del editor)…')
    await smokeAddActionStories(browser)
    await smokeAddActionsInEditor(browser)
    await smokeAddDayTriggerStillOpens(browser)

    console.log('\nPaso 8/10 — toggle de tema…')
    await smokeThemeToggleWorks(browser)

    console.log('\nPaso 9/10 — Sello EVA v2 (colores del par · contraste intacto · reduced-motion · pre-auth)…')
    await smokeSealBlobsDerivedColors(browser)
    await smokeSealContrastUnchanged(browser)
    await smokeSealReducedMotionFreezes(browser)
    await smokeSealPreAuthClean()

    console.log('\nPaso 10/10 — Guía Viva (D2 «?» sin solapes · D3 recorrido completo · D4 flag)…')
    await smokeTourHelpNoOverlap(browser)
    await smokeTourWalkthrough(browser, 'editor')
    await smokeTourWalkthrough(browser, 'hub')
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
