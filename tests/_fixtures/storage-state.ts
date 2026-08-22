import path from 'node:path'

/**
 * Sesión reutilizable del coach QA para el modo suave.
 *
 * UN solo login por tanda: el proyecto `setup` (tests/smoke/auth.setup.ts) se autentica una vez
 * y deja las cookies acá; los specs de `tests/smoke/**` arrancan ya logueados. Cada login extra
 * es un round-trip a Supabase Auth + la carga completa del panel, así que evitarlos es la mayor
 * economía de la tanda.
 *
 * El archivo tiene cookies de una sesión REAL de producción: `.auth/` está en `.gitignore`.
 */
export const QA_AUTH_DIR = path.resolve(__dirname, '../../.auth')

/** storageState del coach QA. Lo escribe `setup`, lo lee el proyecto `prod-suave`. */
export const QA_COACH_STORAGE_STATE = path.join(QA_AUTH_DIR, 'qa-coach.json')
