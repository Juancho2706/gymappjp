/**
 * Allowlist estructural de cuentas E2E propias — guard barato contra fugas al workspace del CEO.
 *
 * CONTEXTO (incidente real): la suite E2E llegó a apuntar al workspace de demos del CEO
 * (josefit / josefit-designqa) y archivó el plan "Plancito 4" de una alumna real (Catalina
 * Rojas). Regla dura: los tests SOLO tocan cuentas de prueba propias.
 *
 * Este módulo es PURO (no importa Playwright ni Vitest): una constante + asserts, importable
 * desde cualquier spec / helper / setup. El assert falla EN SECO (throw) si un spec configura
 * un slug/email/clientId fuera de la lista, para que el próximo spec nuevo no vuelva a apuntar
 * a josefit por accidente.
 *
 * Cuentas fuente: tests/separation/personas.ts (las 9 personas @evatest.cl + shells) y los
 * alumnos de prueba permanentes (STUDENT_IDS). Ver también memoria del repo:
 * "Cuentas de prueba permanentes" y "Cuentas prueba excluidas de finanzas".
 */

/** Slugs de shells E2E permitidos (coach standalone, org enterprise y team pool). */
export const ALLOWED_E2E_SLUGS = new Set<string>([
  'e2e-aurora-strength', // persona 1 — coach standalone (shell /c)
  'e2e-performance-lab', // persona 3/4 — org enterprise (shell /e + panel /org)
  'e2e-pool-vortex', //     persona 6/7 — team pool (shell /t)
  'e2e-flux-conditioning', // persona 9 — coach standalone con módulos (shell /c)
])

/** Dominio de correo de TODAS las cuentas de prueba propias. */
export const ALLOWED_E2E_EMAIL_DOMAIN = '@evatest.cl'

/** Correos E2E nominales (las 9 personas seeded + billing). El dominio ya cubre el resto. */
export const ALLOWED_E2E_EMAILS = new Set<string>([
  'e2e-solo-coach@evatest.cl',
  'e2e-solo-alumno@evatest.cl',
  'e2e-org-owner@evatest.cl',
  'e2e-org-coach@evatest.cl',
  'e2e-org-alumno@evatest.cl',
  'e2e-team-owner@evatest.cl',
  'e2e-team-coach@evatest.cl',
  'e2e-pool-alumno@evatest.cl',
  'e2e-modules-coach@evatest.cl',
  'addon-test-coach@evatest.cl',
])

/** clientIds (UUID) de los alumnos de prueba permanentes (STUDENT_IDS de personas.ts). */
export const ALLOWED_E2E_CLIENT_IDS = new Set<string>([
  '01c36cde-a95d-42a7-b165-ba08a8599d22', // E2E Solo Alumno (standalone)
  '103dc9a3-e79e-40f3-bd50-82480bb88d80', // E2E Org Alumno (enterprise)
  'f646ac2a-2884-40bf-a615-9e2d06a29e7c', // E2E Pool Alumno (team)
])

/**
 * Substrings PROHIBIDOS: cualquier identificador del workspace del CEO. Belt-and-suspenders
 * sobre el allowlist — atrapa josefit aunque alguien agregara un slug/email nuevo a mano.
 */
export const FORBIDDEN_E2E_SUBSTRINGS = ['josefit', 'designqa', 'cat-rojas'] as const

function forbiddenHit(value: string): string | null {
  const lower = value.toLowerCase()
  return FORBIDDEN_E2E_SUBSTRINGS.find((s) => lower.includes(s)) ?? null
}

/**
 * Un email vacío significa "credencial no seteada" → el spec hará skip por su cuenta; no es una
 * fuga, así que no lanzamos. Solo validamos valores NO vacíos.
 */
export function assertAllowedE2eEmail(email: string, ctx = 'E2E'): void {
  const value = email.trim()
  if (!value) return
  const bad = forbiddenHit(value)
  if (bad) {
    throw new Error(
      `[${ctx}] Correo E2E PROHIBIDO ("${value}" contiene "${bad}"). Los tests JAMÁS tocan el ` +
        `workspace del CEO (josefit). Usa una cuenta @evatest.cl (ver tests/e2e-accounts.ts).`,
    )
  }
  const lower = value.toLowerCase()
  if (lower.endsWith(ALLOWED_E2E_EMAIL_DOMAIN) || ALLOWED_E2E_EMAILS.has(lower)) return
  throw new Error(
    `[${ctx}] Correo E2E no permitido ("${value}"). Debe ser una cuenta de prueba propia ` +
      `(${ALLOWED_E2E_EMAIL_DOMAIN}). Ver tests/e2e-accounts.ts.`,
  )
}

export function assertAllowedE2eSlug(slug: string, ctx = 'E2E'): void {
  const value = slug.trim()
  if (!value) return
  const bad = forbiddenHit(value)
  if (bad) {
    throw new Error(
      `[${ctx}] Slug E2E PROHIBIDO ("${value}" contiene "${bad}"). Los tests JAMÁS apuntan al ` +
        `workspace del CEO. Usa un slug de tests/e2e-accounts.ts.`,
    )
  }
  if (ALLOWED_E2E_SLUGS.has(value)) return
  throw new Error(
    `[${ctx}] Slug E2E no permitido ("${value}"). Debe ser uno de: ` +
      `${[...ALLOWED_E2E_SLUGS].join(', ')}. Ver tests/e2e-accounts.ts.`,
  )
}

export function assertAllowedE2eClientId(clientId: string, ctx = 'E2E'): void {
  const value = clientId.trim()
  if (!value) return
  const bad = forbiddenHit(value)
  if (bad) {
    throw new Error(`[${ctx}] clientId E2E PROHIBIDO ("${value}"). Ver tests/e2e-accounts.ts.`)
  }
  if (ALLOWED_E2E_CLIENT_IDS.has(value)) return
  throw new Error(
    `[${ctx}] clientId E2E no permitido ("${value}"). Debe ser un alumno de prueba permanente ` +
      `(ver ALLOWED_E2E_CLIENT_IDS en tests/e2e-accounts.ts).`,
  )
}

/**
 * Valida de un tiro todo lo que un spec puede configurar por env antes de tocar la red.
 * Llamar en el guard/beforeEach de cualquier suite que loguee o mute datos.
 */
export function assertE2eAccounts(
  cfg: { coachEmail?: string; studentEmail?: string; coachSlug?: string; clientId?: string },
  ctx = 'E2E',
): void {
  if (cfg.coachEmail) assertAllowedE2eEmail(cfg.coachEmail, `${ctx} · coachEmail`)
  if (cfg.studentEmail) assertAllowedE2eEmail(cfg.studentEmail, `${ctx} · studentEmail`)
  if (cfg.coachSlug) assertAllowedE2eSlug(cfg.coachSlug, `${ctx} · coachSlug`)
  if (cfg.clientId) assertAllowedE2eClientId(cfg.clientId, `${ctx} · clientId`)
}
