/**
 * Chip de estado del alumno en el directorio RN — copia ESPEJO de la web
 * (`apps/web/src/app/coach/clients/_lib/client-status.ts`, mismo set de casos).
 *
 * Se pinnea el CONTRATO de producto que el componente no puede decidir solo: qué se puede afirmar
 * sobre un alumno según `first_login_at`, y qué NO se puede afirmar sobre una fila anterior al corte.
 *
 * GOTCHA de resolución (primo del de `onboarding-mode.test.tsx`): `directory-shared.ts` importa
 * `lucide-react-native` para los íconos de severidad, y ese paquete resuelve DISTINTO desde `tests/`
 * (copia hoisteada en la raíz) que desde `apps/mobile/` (enlace al store de pnpm) ⇒ un
 * `vi.mock('lucide-react-native')` escrito acá no intercepta nada y el módulo revienta al cargar su
 * ESM. Se mockea por PATH ABSOLUTO —el que ve el importador real— con `vi.doMock` + `import()`
 * dinámico. La lógica bajo prueba es pura y no toca el ícono.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const lucideDir = fs.realpathSync(
  path.resolve(__dirname, '..', '..', 'apps', 'mobile', 'node_modules', 'lucide-react-native')
)
const lucideStub = () => ({
  AlertOctagon: () => null,
  AlertTriangle: () => null,
  Check: () => null,
})
// Las dos condiciones que puede elegir el resolver (import/browser → .mjs, require → .js).
vi.doMock(path.join(lucideDir, 'dist', 'esm', 'lucide-react-native.mjs'), lucideStub)
vi.doMock(path.join(lucideDir, 'dist', 'cjs', 'lucide-react-native.js'), lucideStub)

type Shared = typeof import('../../apps/mobile/components/coach/directory/directory-shared')
let statusMeta: Shared['statusMeta']
let FIRST_LOGIN_SIGNAL_CUTOVER: Shared['FIRST_LOGIN_SIGNAL_CUTOVER']

beforeAll(async () => {
  const mod = await import('../../apps/mobile/components/coach/directory/directory-shared')
  statusMeta = mod.statusMeta
  FIRST_LOGIN_SIGNAL_CUTOVER = mod.FIRST_LOGIN_SIGNAL_CUTOVER
})

const base = {
  isArchived: false,
  isActive: true,
  firstLoginAt: null as string | null,
  createdAt: null as string | null,
  forcePasswordChange: false,
}

// Reloj fijo. Fechas SIN sufijo `Z` a propósito: el runtime las lee como hora local y el test da
// lo mismo en cualquier TZ.
const NOW = new Date('2026-08-26T12:00:00')
const CUTOVER_PASADO = '2026-08-20T00:00:00'

describe('statusMeta · precedencia', () => {
  it('archivado gana sobre cualquier otro estado', () => {
    const meta = statusMeta({
      ...base,
      isArchived: true,
      isActive: false,
      firstLoginAt: '2026-08-26T11:00:00',
      forcePasswordChange: true,
    })
    expect(meta.key).toBe('archived')
    expect(meta.label).toBe('Archivado')
    expect(meta.tone).toBe('neutral')
  })

  it('pausado gana sobre el login y sobre el pendiente de clave', () => {
    const meta = statusMeta({
      ...base,
      isActive: false,
      firstLoginAt: '2026-08-26T11:00:00',
      forcePasswordChange: true,
    })
    expect(meta.key).toBe('paused')
    expect(meta.label).toBe('Pausado')
  })

  it('el login gana sobre el pendiente de clave (entró y abandonó esa pantalla)', () => {
    const meta = statusMeta(
      { ...base, firstLoginAt: '2026-08-26T11:57:00', forcePasswordChange: true },
      NOW,
      CUTOVER_PASADO
    )
    expect(meta.key).toBe('entered')
    expect(meta.label).toBe('Entró hace 3 min')
  })
})

describe('statusMeta · con first_login_at', () => {
  it('menos de 1 h: minutos enteros', () => {
    const meta = statusMeta({ ...base, firstLoginAt: '2026-08-26T11:17:00' }, NOW)
    expect(meta.key).toBe('entered')
    expect(meta.label).toBe('Entró hace 43 min')
  })

  it('recién entrado nunca dice «0 min» (mínimo 1)', () => {
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-26T12:00:00' }, NOW).label).toBe('Entró hace 1 min')
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-26T11:59:30' }, NOW).label).toBe('Entró hace 1 min')
  })

  it('más de 1 h pero el MISMO día calendario: «Entró hoy»', () => {
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-26T08:00:00' }, NOW).label).toBe('Entró hoy')
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-26T00:05:00' }, NOW).label).toBe('Entró hoy')
  })

  it('ayer es 1 d aunque hayan pasado menos de 24 h (día calendario, no ventana)', () => {
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-25T23:00:00' }, NOW).label).toBe('Entró hace 1 d')
  })

  it('varios días: «Entró hace N d»', () => {
    expect(statusMeta({ ...base, firstLoginAt: '2026-08-24T10:00:00' }, NOW).label).toBe('Entró hace 2 d')
    expect(statusMeta({ ...base, firstLoginAt: '2026-07-27T10:00:00' }, NOW).label).toBe('Entró hace 30 d')
  })

  it('el chip «entró» tiene tono de éxito y key propia (se muestra: el gate solo oculta «active»)', () => {
    const meta = statusMeta({ ...base, firstLoginAt: '2026-08-26T08:00:00' }, NOW)
    expect(meta.key).toBe('entered')
    expect(meta.key).not.toBe('active')
    expect(meta.tone).toBe('success')
  })

  it('un timestamp basura no inventa un login: cae al fallback honesto', () => {
    const meta = statusMeta(
      { ...base, firstLoginAt: 'no-es-una-fecha', forcePasswordChange: true },
      NOW,
      CUTOVER_PASADO
    )
    expect(meta.key).toBe('pending')
    expect(meta.label).not.toMatch(/^Entró/)
  })
})

describe('statusMeta · sin first_login_at (el corte decide qué se puede afirmar)', () => {
  it('fila NUEVA (creada después del corte) y sin login: «Todavía no entró»', () => {
    const meta = statusMeta(
      { ...base, createdAt: '2026-08-26T09:00:00', forcePasswordChange: true },
      NOW,
      CUTOVER_PASADO
    )
    expect(meta.label).toBe('Todavía no entró')
    // La key NO se renombra: `pendingSyncCount` y los filtros de clients-directory.ts la espejan.
    expect(meta.key).toBe('pending')
    expect(meta.tone).toBe('info')
  })

  it('esa MISMA fila, con el corte todavía en el futuro, degrada al fallback W0 (no es un bug)', () => {
    const meta = statusMeta({
      ...base,
      createdAt: '2026-08-26T09:00:00',
      forcePasswordChange: true,
    })
    expect(meta.label).toBe('Todavía no cambió su clave')
    expect(meta.key).toBe('pending')
  })

  it('fila VIEJA (anterior al corte) con force=true sigue diciendo «Todavía no cambió su clave»', () => {
    const meta = statusMeta(
      { ...base, createdAt: '2026-01-15T10:00:00', forcePasswordChange: true },
      NOW,
      CUTOVER_PASADO
    )
    expect(meta.label).toBe('Todavía no cambió su clave')
    // Pudo entrar sin dejar timestamp: jamás le afirmamos que no entró.
    expect(meta.label).not.toBe('Todavía no entró')
  })

  it('fila VIEJA con force=false es «Activo»', () => {
    const meta = statusMeta({ ...base, createdAt: '2026-01-15T10:00:00' }, NOW, CUTOVER_PASADO)
    expect(meta.key).toBe('active')
    expect(meta.label).toBe('Activo')
  })

  it('sin createdAt tampoco se afirma la ausencia de login', () => {
    const meta = statusMeta({ ...base, createdAt: null, forcePasswordChange: true }, NOW, CUTOVER_PASADO)
    expect(meta.label).toBe('Todavía no cambió su clave')
  })

  it('ningún fallback usa la abreviatura vieja «sync»', () => {
    expect(statusMeta({ ...base, forcePasswordChange: true }, NOW).label).not.toMatch(/sync/i)
  })
})

describe('FIRST_LOGIN_SIGNAL_CUTOVER (RN)', () => {
  it('es un ISO parseable (el jefe de la ola la fija al ISO del deploy web)', () => {
    expect(Number.isNaN(new Date(FIRST_LOGIN_SIGNAL_CUTOVER).getTime())).toBe(false)
  })
})
