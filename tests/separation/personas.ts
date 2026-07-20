import path from 'path'

/**
 * Personas E2E (Wave 2) para la suite de separación de flujos
 * coach_standalone / enterprise_coach / coach_team.
 *
 * Todas las cuentas @evatest.cl comparten UNA password: env E2E_PERSONAS_PASSWORD.
 * El pool coach multi-contexto es el fixture PROPIO e2e-pool-owner@evatest.cl (seed
 * scripts/e2e/seed-pool-fixture.mjs) — reemplaza al workspace del CEO (Jose Fit/josefit).
 * Overrideable por env E2E_POOL_COACH_*; el password cae al de personas.
 * Sin credenciales -> los setups/specs se saltan (no rompen CI sin secretos).
 */

const AUTH_DIR = path.join(__dirname, '..', '..', 'playwright', '.auth')

export const authFile = (name: string) => path.join(AUTH_DIR, `${name}.json`)

export const PERSONAS_PASSWORD = process.env.E2E_PERSONAS_PASSWORD ?? ''
export const hasPersonasPassword = !!PERSONAS_PASSWORD

// ── Slugs de cada shell ──────────────────────────────────────────────────────
export const SLUGS = {
    /** Coach standalone — shell alumno /c/[coach_slug] */
    coach: 'e2e-aurora-strength',
    /** Org enterprise — panel /org/[slug] + shell alumno /e/[org_slug] */
    org: 'e2e-performance-lab',
    /** Team (pool) — shell alumno /t/[team_slug] */
    team: 'e2e-pool-vortex',
    /** Coach standalone "con módulos" (persona 9) — shell alumno /c/[coach_slug] */
    modulesCoach: 'e2e-flux-conditioning',
} as const

// ── Marcas por contexto (nombre visible en sidebar + --theme-primary) ────────
export const BRANDS = {
    standalone: { name: 'Aurora Strength', color: '#F59E0B' },
    enterprise: { name: 'E2E Performance Lab', color: '#8B5CF6' },
    team: { name: 'E2E Pool Vortex', color: '#EC4899' },
} as const

// ── Matriz de módulos del sidebar coach por contexto ─────────────────────────
// Movida 1/2 (declutter): "Ejercicios" ya no es entrada top-level (botón dentro de Programas);
// standalone colapsa "Mi Marca" + "Suscripción" en una sola entrada "Opciones".
export const MODULES = {
    /** Visibles en TODOS los contextos de coach */
    common: ['Dashboard', 'Alumnos', 'Programas', 'Nutrición', 'Soporte'],
    /** SOLO contexto coach_team */
    teamOnly: ['Equipo', 'Opciones'],
    /** SOLO contexto coach_standalone (hub "Opciones" = marca + suscripción) */
    standaloneOnly: ['Opciones'],
} as const

// ── Rutas de login por shell de alumno ───────────────────────────────────────
export const STUDENT_LOGIN = {
    standalone: `/c/${SLUGS.coach}/login`,
    enterprise: `/e/${SLUGS.org}/login`,
    team: `/t/${SLUGS.team}/login`,
} as const

export interface Persona {
    email: string
    password: string
    /** Ruta absoluta al storageState generado por tests/separation/auth.setup.ts */
    storageState: string
}

/** Las 9 personas seeded (password compartida via E2E_PERSONAS_PASSWORD). */
export const PERSONAS = {
    /** 1 — coach standalone "Aurora Strength" (tier elite, active) */
    soloCoach: { email: 'e2e-solo-coach@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('solo-coach') },
    /** 2 — alumno standalone del coach 1 (scope standalone) */
    soloAlumno: { email: 'e2e-solo-alumno@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('solo-alumno') },
    /** 3 — org_owner de "E2E Performance Lab" (SIN fila coaches; login /org/login) */
    orgOwner: { email: 'e2e-org-owner@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('org-owner') },
    /** 4 — coach enterprise (org_managed / scale / active_org_id=org) */
    orgCoach: { email: 'e2e-org-coach@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('org-coach') },
    /** 5 — alumno enterprise asignado al coach 4 (scope enterprise) */
    orgAlumno: { email: 'e2e-org-alumno@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('org-alumno') },
    /** 6 — owner del team "E2E Pool Vortex" (team_managed / elite; can_manage=true) */
    teamOwner: { email: 'e2e-team-owner@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('team-owner') },
    /** 7 — coach del pool (team_managed / elite; can_manage=false, rol 'Nutrición') */
    teamCoach: { email: 'e2e-team-coach@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('team-coach') },
    /** 8 — alumno del pool (scope team; consent ya otorgado por el seed) */
    poolAlumno: { email: 'e2e-pool-alumno@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('pool-alumno') },
    /** 9 — coach standalone "con módulos" (elite/active, los 4 módulos ON vía seed service-role).
     *  9na cuenta PERMANENTE (D7/F4): nunca purgar (memoria de cuentas de prueba permanentes).
     *  FUERA de la matriz de separación — sus listas esperadas son propias (incluyen el grupo MÓDULOS). */
    modulesCoach: { email: 'e2e-modules-coach@evatest.cl', password: PERSONAS_PASSWORD, storageState: authFile('modules-coach') },
} as const satisfies Record<string, Persona>

/**
 * Coach multi-contexto del fixture PROPIO (e2e-pool-owner: standalone activo + owner del team
 * e2e-pool-movida => 2 workspaces). Cambia de contexto via /workspace/select (click en el texto
 * del workspace), NUNCA via storageState distinto — la sesión es la misma.
 * Defaults al fixture; overrideable por env. Password cae al de personas (cuentas @evatest.cl).
 */
export const POOL_COACH: Persona = {
    email: process.env.E2E_POOL_COACH_EMAIL ?? 'e2e-pool-owner@evatest.cl',
    password: process.env.E2E_POOL_COACH_PASSWORD ?? PERSONAS_PASSWORD,
    storageState: authFile('pool-coach'),
}

export const hasPoolCoachCreds = !!(POOL_COACH.email && POOL_COACH.password)

/** full_name de los alumnos seed (coinciden con scripts/seed-e2e-personas.mjs). */
export const STUDENT_NAMES = {
    solo: 'E2E Solo Alumno',
    org: 'E2E Org Alumno',
    pool: 'E2E Pool Alumno',
} as const

/** UUIDs estables de los alumnos seed en prod (cuentas permanentes; ver docs/testing/E2E_PERSONAS.md).
 *  Overrideables por env para otros entornos. */
export const STUDENT_IDS = {
    solo: process.env.E2E_SOLO_ALUMNO_ID ?? '01c36cde-a95d-42a7-b165-ba08a8599d22',
    org: process.env.E2E_ORG_ALUMNO_ID ?? '103dc9a3-e79e-40f3-bd50-82480bb88d80',
    pool: process.env.E2E_POOL_ALUMNO_ID ?? 'f646ac2a-2884-40bf-a615-9e2d06a29e7c',
} as const
