import { expect, test, type Page } from '@playwright/test'
import { assertE2eAccounts } from '../e2e-accounts'

/**
 * Helpers compartidos de la suite Nutrición V2. Este archivo NO termina en `.spec.ts`
 * (testMatch del project exige `.spec.ts`), así que Playwright no lo colecta como tests.
 *
 * Credenciales SIEMPRE por env — nunca hardcodeadas. Sin las envs, cada spec se marca skip
 * con un mensaje claro (no rompe CI ni la corrida default local).
 *
 * REGLA DURA (incidente 2026-07: los tests archivaron "Plancito 4" de una alumna real del
 * workspace de demos del CEO): esta suite SOLO toca cuentas de prueba propias. Los defaults
 * apuntan a la persona E2E standalone (Aurora Strength + su alumno E2E Solo Alumno) y el guard
 * `assertE2eAccounts` revienta EN SECO si alguien setea un email/slug fuera de tests/e2e-accounts.ts.
 */

// ── Env ──────────────────────────────────────────────────────────────────────
export const PREVIEW_BASE = process.env.PLAYWRIGHT_BASE_URL ?? ''
export const COACH_EMAIL = process.env.E2E_COACH_EMAIL ?? ''
export const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD ?? ''
export const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? ''
export const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? ''
/** Slug del coach para la shell del alumno (/c/[slug]/…). Default: fixture E2E standalone. */
export const COACH_SLUG = process.env.E2E_COACH_SLUG ?? 'e2e-aurora-strength'
/** Nombre del alumno E2E tal como aparece en el roster del coach (para ubicar su fila). */
export const STUDENT_NAME = process.env.E2E_STUDENT_NAME ?? 'E2E Solo Alumno'
/**
 * clientId (UUID) del alumno E2E. Default: E2E Solo Alumno (cuenta de prueba permanente). Hace
 * deterministas builder/ficha SIN roster-search — este roster-search por nombre fue el mecanismo
 * exacto del incidente (resolvió una alumna real del workspace del CEO). Overrideable por env
 * para otras personas E2E, pero el guard exige que sea un clientId de la lista permitida.
 */
export const STUDENT_CLIENT_ID =
  process.env.E2E_STUDENT_CLIENT_ID ?? '01c36cde-a95d-42a7-b165-ba08a8599d22'
/**
 * Etiqueta del workspace standalone del coach E2E (multi-contexto). El roster V2 respeta el
 * workspace activo; el alumno E2E vive en el standalone. Default: la marca del fixture standalone.
 */
export const COACH_WORKSPACE_LABEL = process.env.E2E_COACH_WORKSPACE ?? 'Aurora Strength'
/** Término de búsqueda del catálogo local para el paso de construcción del builder. */
export const FOOD_QUERY = process.env.E2E_FOOD_QUERY ?? 'pollo'

export const hasPreview = PREVIEW_BASE.length > 0
export const hasCoachCreds = COACH_EMAIL.length > 0 && COACH_PASSWORD.length > 0
export const hasStudentCreds =
  STUDENT_EMAIL.length > 0 && STUDENT_PASSWORD.length > 0 && COACH_SLUG.length > 0

const NO_PREVIEW_MSG =
  'Falta PLAYWRIGHT_BASE_URL: estos specs corren contra el Preview de Vercel con el canary de Nutrición V2 (escriben en Supabase de producción). Sin esa env se omiten para no correr contra local.'

// ── Guard estructural de cuentas (falla en seco ante cualquier fuga a josefit) ──
/**
 * Valida TODO lo configurable por env contra tests/e2e-accounts.ts antes de tocar la red.
 * Si algún email/slug/clientId cae fuera del allowlist (p.ej. apunta a josefit), lanza y el
 * spec revienta con un mensaje claro — no hay forma de que un spec nuevo termine mutando el
 * workspace del CEO por accidente. Se corre en cada guard de skip (coach y alumno).
 */
function assertOwnE2eAccounts() {
  assertE2eAccounts(
    {
      coachEmail: COACH_EMAIL,
      studentEmail: STUDENT_EMAIL,
      coachSlug: COACH_SLUG,
      clientId: STUDENT_CLIENT_ID,
    },
    'nutrition-v2',
  )
}

// ── Guards de skip ────────────────────────────────────────────────────────────
/** Specs 1-4 (lado coach): exigen Preview (Edge Config canary) + credenciales del coach. */
export function requireCanaryCoach() {
  assertOwnE2eAccounts()
  test.skip(!hasPreview, NO_PREVIEW_MSG)
  test.skip(!hasCoachCreds, 'Falta E2E_COACH_EMAIL / E2E_COACH_PASSWORD.')
}

/** Spec 4 (lado alumna): exige Preview + credenciales de la alumna + slug del coach. */
export function requireCanaryStudent() {
  assertOwnE2eAccounts()
  test.skip(!hasPreview, NO_PREVIEW_MSG)
  test.skip(!hasStudentCreds, 'Falta E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD / E2E_COACH_SLUG.')
}

// ── Guard del overlay de error de Next dev (los locators CSS atraviesan shadow roots) ──
export async function expectNoRuntimeError(page: Page) {
  await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

// ── Login de coach + fijar workspace standalone ───────────────────────────────
export /** Cierra el banner de consentimiento de cookies si está presente (bloquea clicks en móvil/limpio). */
async function dismissCookieConsent(page: import('@playwright/test').Page): Promise<void> {
  const reject = page.getByRole('dialog', { name: /consentimiento/i }).getByRole('button', { name: /rechazar|cerrar/i }).first()
  try {
    await reject.click({ timeout: 2500 })
  } catch {
    // sin banner: seguir
  }
}

export async function loginCoach(page: Page) {
  await page.goto('/login')
  await dismissCookieConsent(page)
  await page.getByRole('textbox', { name: /email/i }).fill(COACH_EMAIL)
  await page.getByRole('textbox', { name: /contraseña/i }).fill(COACH_PASSWORD)
  await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click()
  // Multi-contexto puede caer en /workspace/select o en el último workspace usado. El patrón
  // EXCLUYE /login (un glob amplio matchearía la propia página de login → wait vacío).
  await page.waitForURL(/\/(workspace\/select|coach\/dashboard|coach\/|org\/|c\/)/, {
    timeout: 30_000,
  })
}

/**
 * El coach canary es multi-contexto (standalone + pool). Fija el workspace standalone vía
 * /workspace/select (mismo patrón que tests/separation/switcher.spec.ts). Para un coach
 * single-contexto /workspace/select redirige solo y no hay entrada que clickear (no-op).
 */
export async function ensureCoachWorkspace(page: Page) {
  await page.goto('/workspace/select')
  const entry = page.getByText(new RegExp(COACH_WORKSPACE_LABEL, 'i')).first()
  const visible = await entry.isVisible({ timeout: 5_000 }).catch(() => false)
  if (visible) {
    await entry.click()
    await page.waitForURL(/\/coach\//, { timeout: 25_000 })
  }
}

export async function loginCoachStandalone(page: Page) {
  await loginCoach(page)
  await ensureCoachWorkspace(page)
}

// ── Login de alumna (shell /c/[slug]) ─────────────────────────────────────────
export async function loginStudent(page: Page) {
  await page.goto(`/c/${COACH_SLUG}/login`)
  await dismissCookieConsent(page)
  await page.getByRole('textbox', { name: /email/i }).fill(STUDENT_EMAIL)
  await page.getByRole('textbox', { name: /contraseña/i }).fill(STUDENT_PASSWORD)
  await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click()
  await page.waitForURL(new RegExp(`/c/${COACH_SLUG}/(dashboard|nutrition)`), { timeout: 30_000 })
}

const UUID_RE = /\/coach\/nutrition-v2\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/**
 * Resuelve el clientId (UUID) de la alumna QA. Prefiere E2E_STUDENT_CLIENT_ID (determinista);
 * si no está, lo busca en la página 1 del roster por nombre y lo extrae del href de su ficha.
 * Devuelve null si no lo encuentra (el spec hace skip con un mensaje claro).
 */
export async function resolveStudentClientId(page: Page): Promise<string | null> {
  if (STUDENT_CLIENT_ID) return STUDENT_CLIENT_ID
  await page.goto('/coach/nutrition-v2')
  const roster = page.getByTestId('nutrition-v2-hub-roster')
  await expect(roster).toBeVisible({ timeout: 25_000 })
  // Desktop (>=lg) renderiza la tabla; cada fila expone links a la ficha del alumno.
  const row = page.getByRole('row', { name: new RegExp(STUDENT_NAME, 'i') }).first()
  const found = await row.isVisible({ timeout: 15_000 }).catch(() => false)
  if (!found) return null
  const href = await row.locator('a[href*="/coach/nutrition-v2/"]').first().getAttribute('href')
  return href?.match(UUID_RE)?.[1] ?? null
}
