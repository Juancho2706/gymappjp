#!/usr/bin/env node
/**
 * guia-visual-check.mjs — gate visual local de «Tus primeros pasos» (`/coach/guia`) y de la
 * píldora flotante (W4.6 de `docs/specs/coach-onboarding-v2/`).
 *
 * Por qué existe: desde el 22-08 la guía es la PRIMERA pantalla que ve todo coach nuevo, y el QA
 * del owner la encontró rota justo en los anchos que nadie abre en el navegador de escritorio
 * (390/430) — una barra tapada por dos FABs, una banda de tres piezas exprimida en 110 px. Este
 * script mide el DOM real en 5 anchos × 2 temas y falla si algo se derrama, se recorta o se
 * superpone. Mismo patrón que `scripts/cabina-visual-check.mjs` (dev server + Playwright
 * headless), del que copia el arranque del server y el `report()`.
 *
 * Qué afirma, todo BLOQUEANTE:
 *   A) `document.scrollWidth <= innerWidth` — cero scroll horizontal en el documento.
 *   B) Ningún texto de la guía recortado SIN elipsis: si un elemento con texto tiene
 *      `scrollWidth > clientWidth` y su `text-overflow` no es `ellipsis`, está perdiendo
 *      caracteres de verdad (el `truncate` deliberado sí pasa: eso es diseño, no bug).
 *   C) La píldora EXPANDIDA cabe entera en el viewport (los 4 bordes).
 *   D) La píldora no intersecta la cápsula flotante del nav móvil — se cruzan los rectángulos
 *      reales, que es lo único que atrapa el solape (el overflow del body no lo ve).
 *   E) Tap targets ≥ 44 px de alto en todo lo interactivo y visible de la guía y de la píldora.
 *   F) La banda del alumno de ejemplo apila en móvil (chip, texto y botón en tres renglones) y
 *      vuelve a ser una sola línea desde `md`; su botón ocupa el ancho completo en móvil.
 *
 * Capturas: C:/Users/juanm/.claude/jobs/543abb77/tmp/guia-visual/
 *
 * Corre desde la RAÍZ del repo:
 *   node scripts/guia-visual-check.mjs
 *   BASE_URL=http://localhost:3000 node scripts/guia-visual-check.mjs   # server ya corriendo
 *
 * El harness (`/dev-harness/guia`) solo existe bajo `next dev` (`NODE_ENV === 'development'`),
 * igual que el resto de `dev-harness`: este gate NO corre contra un build de producción.
 */

import { chromium } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3124
const EXTERNAL_BASE_URL = process.env.BASE_URL ?? null
const BASE_URL = EXTERNAL_BASE_URL ?? `http://localhost:${PORT}`
const HARNESS_PATH = '/dev-harness/guia'
const SHOTS_DIR = 'C:/Users/juanm/.claude/jobs/543abb77/tmp/guia-visual'

/** Los 5 anchos del pedido: dos móviles reales, tablet, laptop chico y escritorio. */
const VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 430, height: 932, label: '430' },
  { width: 768, height: 1024, label: '768' },
  { width: 1024, height: 768, label: '1024' },
  { width: 1440, height: 900, label: '1440' },
]
const THEMES = /** @type {const} */ (['light', 'dark'])
/** Dos personas: la que trae tarjeta de nutrición y la que trae la de rehabilitación. */
const VISTAS = [
  { search: '?persona=nutrition', label: 'nutrition' },
  { search: '?persona=rehab', label: 'rehab' },
]

/* El banner de cookies (layout raíz) queda `fixed` al pie y taparía tanto las capturas como la
   píldora: se siembra el consentimiento en el origen ANTES de cargar, igual que en cabina. */
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

let failures = 0
let shotCount = 0
let assertions = 0

/** @param {string} step @param {boolean} ok @param {string} [detail] */
function report(step, ok, detail = '') {
  assertions += 1
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

/** @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function startDevServer() {
  if (EXTERNAL_BASE_URL) {
    console.log(`BASE_URL=${EXTERNAL_BASE_URL} en el entorno: no se levanta dev server propio.`)
    return null
  }
  console.log(`Levantando dev server de @eva/web en el puerto ${PORT}…`)
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

async function waitForServer(url, timeoutMs = 180_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (res.status < 500) return true
    } catch {
      /* todavía compilando */
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
      console.error(`taskkill falló: ${err instanceof Error ? err.message : err}`)
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

/** @param {import('@playwright/test').Page} page */
async function ensureNoCookieBanner(page) {
  const banner = page.locator(COOKIE_BANNER)
  if ((await banner.count()) === 0) return
  await page.getByRole('button', { name: 'Rechazar' }).first().click()
  await banner.waitFor({ state: 'detached', timeout: 5_000 })
}

/** @param {import('@playwright/test').Page} page @param {string} search */
async function gotoHarness(page, search) {
  await page.goto(`${BASE_URL}${HARNESS_PATH}${search}`, {
    waitUntil: 'networkidle',
    // La PRIMERA visita bajo `next dev` compila la ruta entera (guía + píldora + marca).
    timeout: 120_000,
  })
  await page.waitForSelector('[data-harness-ready]', { state: 'attached', timeout: 60_000 })
  // La guía monta su lista recién cuando el hook hidrata (antes hay esqueleto).
  await page.waitForSelector('[data-harness-block="guide"] ol li', { timeout: 30_000 })
  await ensureNoCookieBanner(page)
  await page.waitForTimeout(300)
}

// ---------------------------------------------------------------------------
// Sondas que corren DENTRO de la página.
// ---------------------------------------------------------------------------

/** A) scroll horizontal del documento. */
function probeDocumentOverflow() {
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }
}

/**
 * B) textos recortados sin elipsis. Solo elementos hoja con texto propio: un contenedor con
 * hijos puede tener `scrollWidth` grande por un descendiente y eso ya lo cubre (A) o su propio
 * assert.
 */
function probeClippedText() {
  const roots = document.querySelectorAll('[data-harness-block="guide"], [data-harness-block="demo-banner"]')
  /** @type {{tag:string,text:string,scrollWidth:number,clientWidth:number}[]} */
  const clipped = []
  for (const root of roots) {
    for (const el of root.querySelectorAll('h1,h2,h3,h4,p,span,a,button,li,dt,dd,label,div')) {
      if (el.children.length > 0) continue
      const text = (el.textContent ?? '').trim()
      if (text.length === 0) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      const style = getComputedStyle(el)
      // `truncate` de Tailwind = overflow hidden + text-overflow ellipsis: recorte DELIBERADO
      // con affordance visible. Cualquier otro recorte se está comiendo caracteres a ciegas.
      if (style.textOverflow === 'ellipsis') continue
      clipped.push({
        tag: el.tagName.toLowerCase(),
        text: text.slice(0, 48),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      })
    }
  }
  return clipped
}

/** C + D) geometría de la píldora contra el viewport y contra la cápsula del nav. */
function probePillGeometry() {
  const toggle = document.querySelector('button[aria-expanded][aria-label^="Guía de inicio"]')
  if (!toggle) return { found: false }
  // La píldora entera = el contenedor `fixed` que envuelve al círculo y al panel.
  const pill = toggle.closest('div.fixed')
  if (!pill) return { found: false }
  const rect = pill.getBoundingClientRect()
  const nav = document.querySelector('[data-harness-nav="mobile"]')
  const navRect = nav ? nav.getBoundingClientRect() : null
  const navVisible = navRect != null && navRect.width > 0 && navRect.height > 0
  return {
    found: true,
    expanded: toggle.getAttribute('aria-expanded') === 'true',
    rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    nav: navVisible ? { left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom } : null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }
}

/** E) tap targets de todo lo interactivo visible de la guía y de la píldora. */
function probeTapTargets() {
  const scopes = [
    ...document.querySelectorAll('[data-harness-block="guide"], [data-harness-block="demo-banner"]'),
  ]
  const pillToggle = document.querySelector('button[aria-expanded][aria-label^="Guía de inicio"]')
  const pill = pillToggle ? pillToggle.closest('div.fixed') : null
  if (pill) scopes.push(pill)

  /** @type {{label:string,height:number}[]} */
  const small = []
  for (const scope of scopes) {
    for (const el of scope.querySelectorAll('a[href],button,input:not([type="file"]),[role="radio"]')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      // El panel minimizado de la píldora queda `inert`: no es alcanzable, no cuenta.
      if (el.closest('[inert]')) continue
      if (rect.height >= 43.5) continue
      small.push({
        label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
        height: Math.round(rect.height * 10) / 10,
      })
    }
  }
  return small
}

/** F) forma de la banda del alumno de ejemplo (apilada en móvil, en línea desde md). */
function probeDemoBanner() {
  const banner = document.querySelector('[data-harness-block="demo-banner"] > div')
  if (!banner) return { found: false }
  const chip = banner.querySelector('span.rounded-pill')
  const text = banner.querySelector('p')
  const trigger = banner.querySelector('[data-slot="alert-dialog-trigger"]')
  if (!chip || !text || !trigger) return { found: false }
  const r = (el) => {
    const b = el.getBoundingClientRect()
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width }
  }
  return {
    found: true,
    chip: r(chip),
    text: r(text),
    trigger: r(trigger),
    bannerWidth: banner.getBoundingClientRect().width,
    innerWidth: window.innerWidth,
  }
}

function rectsIntersect(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

// ---------------------------------------------------------------------------
// Pasada principal: 5 anchos × 2 temas × 2 personas.
// ---------------------------------------------------------------------------
async function runMatrix(browser) {
  mkdirSync(SHOTS_DIR, { recursive: true })

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        storageState: STORAGE_STATE,
      })
      const page = await context.newPage()

      for (const vista of VISTAS) {
        const tag = `${viewport.label}px ${theme} ${vista.label}`
        try {
          await gotoHarness(page, vista.search)

          // A) cero scroll horizontal
          const overflow = await page.evaluate(probeDocumentOverflow)
          report(
            `sin scroll horizontal — ${tag}`,
            overflow.scrollWidth <= overflow.innerWidth &&
              overflow.bodyScrollWidth <= overflow.bodyClientWidth,
            `doc=${overflow.scrollWidth}/${overflow.innerWidth} body=${overflow.bodyScrollWidth}/${overflow.bodyClientWidth}`,
          )

          // B) textos sin recorte ciego
          const clipped = await page.evaluate(probeClippedText)
          report(
            `textos sin recorte ciego — ${tag}`,
            clipped.length === 0,
            clipped.length === 0
              ? ''
              : clipped.map((c) => `${c.tag} «${c.text}» ${c.scrollWidth}>${c.clientWidth}`).join(' | '),
          )

          // C + D) píldora
          const pill = await page.evaluate(probePillGeometry)
          report(`píldora presente — ${tag}`, pill.found === true)
          if (pill.found) {
            const inside =
              pill.rect.left >= -0.5 &&
              pill.rect.top >= -0.5 &&
              pill.rect.right <= pill.innerWidth + 0.5 &&
              pill.rect.bottom <= pill.innerHeight + 0.5
            report(
              `píldora expandida dentro del viewport — ${tag}`,
              pill.expanded === true && inside,
              `expanded=${pill.expanded} rect=[${Math.round(pill.rect.left)},${Math.round(pill.rect.top)},${Math.round(pill.rect.right)},${Math.round(pill.rect.bottom)}] vp=${pill.innerWidth}×${pill.innerHeight}`,
            )
            if (pill.nav) {
              report(
                `píldora no tapa la cápsula del nav — ${tag}`,
                !rectsIntersect(pill.rect, pill.nav),
                `pill.bottom=${Math.round(pill.rect.bottom)} nav.top=${Math.round(pill.nav.top)}`,
              )
            }
          }

          // E) tap targets
          const small = await page.evaluate(probeTapTargets)
          report(
            `tap targets ≥ 44 px — ${tag}`,
            small.length === 0,
            small.length === 0 ? '' : small.map((s) => `«${s.label}» ${s.height}px`).join(' | '),
          )

          // F) banda del demo
          const banner = await page.evaluate(probeDemoBanner)
          report(`banda del demo medible — ${tag}`, banner.found === true)
          if (banner.found) {
            if (viewport.width < 768) {
              const stacked =
                banner.text.top >= banner.chip.bottom - 1 && banner.trigger.top >= banner.text.bottom - 1
              const fullWidthButton = banner.trigger.width >= banner.bannerWidth * 0.7
              report(
                `banda del demo apilada en móvil — ${tag}`,
                stacked && fullWidthButton,
                `chip.bottom=${Math.round(banner.chip.bottom)} text.top=${Math.round(banner.text.top)} btn.top=${Math.round(banner.trigger.top)} btn.w=${Math.round(banner.trigger.width)}/${Math.round(banner.bannerWidth)}`,
              )
            } else {
              const inline = banner.text.top < banner.chip.bottom && banner.trigger.top < banner.text.bottom
              report(
                `banda del demo en una línea desde md — ${tag}`,
                inline,
                `chip=[${Math.round(banner.chip.top)},${Math.round(banner.chip.bottom)}] text.top=${Math.round(banner.text.top)}`,
              )
            }
          }

          const filePath = join(SHOTS_DIR, `${viewport.label}-${theme}-${vista.label}.png`)
          await page.screenshot({ path: filePath, fullPage: true })
          shotCount += 1
        } catch (err) {
          report(`pasada ${tag}`, false, err instanceof Error ? err.message : String(err))
        }
      }

      await context.close()
    }
  }
}

/**
 * Píldora MINIMIZADA: el círculo de 48 px sigue entero en pantalla y sigue sin tocar la cápsula.
 * Se prueba aparte porque el estado vive en `localStorage` por coach.
 */
async function smokeCollapsedPill(browser) {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: STORAGE_STATE,
    })
    const page = await context.newPage()
    try {
      await gotoHarness(page, '?persona=nutrition')
      await page.getByRole('button', { name: 'Minimizar la guía' }).click()
      await page.waitForTimeout(350)
      const pill = await page.evaluate(probePillGeometry)
      report(
        `píldora minimizada entera en pantalla — ${viewport.label}px`,
        pill.found === true &&
          pill.expanded === false &&
          pill.rect.left >= -0.5 &&
          pill.rect.right <= pill.innerWidth + 0.5 &&
          pill.rect.bottom <= pill.innerHeight + 0.5,
        pill.found ? `rect=[${Math.round(pill.rect.left)},${Math.round(pill.rect.right)}]` : 'no encontrada',
      )
      if (pill.found && pill.nav) {
        report(
          `píldora minimizada no tapa el nav — ${viewport.label}px`,
          !rectsIntersect(pill.rect, pill.nav),
          `pill.bottom=${Math.round(pill.rect.bottom)} nav.top=${Math.round(pill.nav.top)}`,
        )
      }
      await page.screenshot({ path: join(SHOTS_DIR, `${viewport.label}-light-pill-collapsed.png`) })
      shotCount += 1
    } catch (err) {
      report(`píldora minimizada ${viewport.label}px`, false, err instanceof Error ? err.message : String(err))
    }
    await context.close()
  }
}

/**
 * El riel del alumno de ejemplo va DEBAJO en móvil/tablet y al costado recién en escritorio
 * ancho: es la decisión que le devolvió el ancho a la tarjeta de marca.
 */
async function smokeDemoRailPosition(browser) {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[4]]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: STORAGE_STATE,
    })
    const page = await context.newPage()
    try {
      await gotoHarness(page, '?persona=nutrition')
      const layout = await page.evaluate(() => {
        const list = document.querySelector('[data-harness-block="guide"] ol')
        const aside = document.querySelector('[data-harness-block="guide"] aside')
        if (!list || !aside) return null
        const l = list.getBoundingClientRect()
        const a = aside.getBoundingClientRect()
        return { listRight: l.right, asideLeft: a.left, asideTop: a.top, listTop: l.top, listWidth: l.width }
      })
      report(`riel del demo medible — ${viewport.label}px`, layout != null)
      if (layout) {
        const sideBySide = layout.asideLeft >= layout.listRight - 1
        report(
          viewport.width >= 1280
            ? `riel del demo al costado — ${viewport.label}px`
            : `riel del demo debajo — ${viewport.label}px`,
          viewport.width >= 1280 ? sideBySide : !sideBySide,
          `list.right=${Math.round(layout.listRight)} aside.left=${Math.round(layout.asideLeft)}`,
        )
      }
    } catch (err) {
      report(`riel del demo ${viewport.label}px`, false, err instanceof Error ? err.message : String(err))
    }
    await context.close()
  }
}

async function main() {
  console.log('=== guia-visual-check — onboarding v2 W4.6 ===\n')

  console.log('Paso 0/4 — chromium…')
  await ensureChromiumInstalled()

  console.log('Paso 1/4 — dev server…')
  const devServer = await startDevServer()
  const ready = await waitForServer(`${BASE_URL}${HARNESS_PATH}?persona=nutrition`)
  report('dev server responde en el harness', ready, BASE_URL)
  if (!ready) {
    killDevServer(devServer)
    console.log(`\n${failures} aserción(es) fallida(s) de ${assertions}. Saliendo sin capturar.`)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    console.log('\nPaso 2/4 — matriz 5 anchos × 2 temas × 2 personas…')
    await runMatrix(browser)

    console.log('\nPaso 3/4 — píldora minimizada…')
    await smokeCollapsedPill(browser)

    console.log('\nPaso 4/4 — posición del riel del alumno de ejemplo…')
    await smokeDemoRailPosition(browser)
  } finally {
    await browser.close()
    killDevServer(devServer)
  }

  console.log(`\n${shotCount} capturas guardadas en ${SHOTS_DIR}`)
  console.log(`${assertions} aserciones corridas, ${failures} fallidas.`)
  if (failures > 0) process.exit(1)
  console.log('\nTodo verde.')
  process.exit(0)
}

main().catch((err) => {
  console.error('guia-visual-check crasheó:', err)
  process.exit(1)
})
