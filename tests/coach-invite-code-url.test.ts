// Contrato de los links que el coach le pasa al alumno (pastilla del código en el dashboard,
// hoja "Invitar alumno", QR y bloque de Ajustes → Mi Marca). Todos salen del MISMO helper para
// que no vuelva a haber dos URLs distintas para lo mismo.
//
// La regresión que este archivo existe para impedir: emitir el APEX (`https://eva-app.cl/...`).
// Los correos y el canónico de SEO viven en `www`, así que el apex dejaba al coach compartiendo
// un link distinto al que manda EVA.
//
// El helper lee `process.env` en cada llamada, así que se puede stubear por test. Ojo: en local
// Vitest carga `.env.local`, donde NEXT_PUBLIC_SITE_URL SÍ está seteada — por eso el caso "sin
// variable" la borra explícitamente en vez de asumir que no existe.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  INVITE_CODE_PATTERN,
  buildStudentAppUrl,
  buildStudentLoginUrl,
  studentAppOrigin,
} from '@/lib/coach/invite-code'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('studentAppOrigin', () => {
  it('sin NEXT_PUBLIC_SITE_URL cae al origen público con www', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    expect(studentAppOrigin()).toBe('https://www.eva-app.cl')
  })

  it('respeta NEXT_PUBLIC_SITE_URL cuando existe', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.eva-app.cl')
    expect(studentAppOrigin()).toBe('https://staging.eva-app.cl')
  })

  it('le saca la barra final para no emitir dobles slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl/')
    expect(studentAppOrigin()).toBe('https://www.eva-app.cl')
    expect(buildStudentLoginUrl('CRDZ9')).toBe('https://www.eva-app.cl/c/CRDZ9/login')
  })

  // EL CASO QUE DE VERDAD IMPORTA: `.env.local` (raíz y apps/web) trae hoy el APEX. Un helper que
  // devolviera la variable tal cual emitía justo la URL prohibida, y el guard de más abajo pasaba
  // igual porque borraba la variable antes de mirar. Acá se ejercita el escenario real.
  it('reescribe el APEX a www aunque venga de la env var', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://eva-app.cl')
    expect(studentAppOrigin()).toBe('https://www.eva-app.cl')
    expect(buildStudentLoginUrl('CRDZ9')).toBe('https://www.eva-app.cl/c/CRDZ9/login')
    expect(buildStudentAppUrl('CRDZ9')).toBe('https://www.eva-app.cl/c/CRDZ9')
  })

  it('reescribe el apex también con barra final', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://eva-app.cl/')
    expect(studentAppOrigin()).toBe('https://www.eva-app.cl')
  })

  it('deja pasar localhost intacto para que dev resuelva contra su propio origen', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(studentAppOrigin()).toBe('http://localhost:3000')
  })

  it('deja pasar los hosts de preview de Vercel', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://gymappjp-git-rama.vercel.app')
    expect(studentAppOrigin()).toBe('https://gymappjp-git-rama.vercel.app')
  })

  it('con un valor corrupto cae al origen público en vez de emitir un link roto', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'no-es-una-url')
    expect(studentAppOrigin()).toBe('https://www.eva-app.cl')
  })
})

describe('buildStudentLoginUrl', () => {
  it('arma /c/{codigo}/login sobre el host www', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const url = buildStudentLoginUrl('CRDZ9')
    expect(url.endsWith('/c/CRDZ9/login')).toBe(true)
    expect(new URL(url).host).toBe('www.eva-app.cl')
  })

  // Guard de la regresión, corrido sobre las DOS configuraciones que existen en el repo: sin la
  // variable y con la variable en el apex (que es lo que hay en `.env.local` hoy). Si alguna vez
  // vuelve a salir `https://eva-app.cl/...`, este test se cae.
  it.each([undefined, 'https://eva-app.cl', 'https://eva-app.cl/'])(
    'NUNCA emite el apex desnudo · NEXT_PUBLIC_SITE_URL=%s',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', value)
      for (const url of [buildStudentLoginUrl('CRDZ9'), buildStudentAppUrl('CRDZ9')]) {
        expect(url.startsWith('https://eva-app.cl/')).toBe(false)
        expect(new URL(url).host).not.toBe('eva-app.cl')
      }
    },
  )

  it('sirve igual para el slug legacy (mismo origen, no solo para códigos de 5)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    expect(buildStudentLoginUrl('josefit')).toBe('https://www.eva-app.cl/c/josefit/login')
  })
})

describe('buildStudentAppUrl', () => {
  it('apunta a la raíz de la app del coach, sin /login', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const url = buildStudentAppUrl('CRDZ9')
    expect(url).toBe('https://www.eva-app.cl/c/CRDZ9')
    expect(url).not.toContain('/login')
  })

  it('comparte origen con el link de login (un solo host para todo)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
    expect(new URL(buildStudentAppUrl('CRDZ9')).origin).toBe(new URL(buildStudentLoginUrl('CRDZ9')).origin)
  })
})

// ── Contrato cruzado web ↔ React Native ────────────────────────────────────────────────────────
//
// La regla del código vive DOS veces: acá y en `apps/mobile/lib/student-links.ts`. Mudarla a
// `packages/*` (que es lo que manda la regla del repo) exige una arista de dependencia nueva y por
// lo tanto tocar el lockfile, así que por ahora se blinda con este guard — mismo recurso que usa
// `check:tokens` para los tokens web↔mobile.
//
// Sin esto, el día que el código pase de 5 a 6 caracteres la web sigue andando y la app deja de
// pintar la pastilla del dashboard: sin error, sin log y sin nada que lo detecte.
describe('paridad de la regla del código con React Native', () => {
  // `process.cwd()` y no `import.meta.url`: vitest transforma el módulo y ahí `import.meta.url`
  // no es una URL `file:` (falla con "The URL must be of scheme file"). El root de vitest es la
  // raíz del monorepo, que es desde donde corre `pnpm test`.
  const mobileSource = readFileSync(resolve(process.cwd(), 'apps/mobile/lib/student-links.ts'), 'utf8')

  it('el patrón de la app es literalmente el mismo que el de la web', () => {
    const match = mobileSource.match(/export const INVITE_CODE_PATTERN = (\/.+\/)$/m)
    expect(match, 'no se encontró INVITE_CODE_PATTERN en apps/mobile/lib/student-links.ts').not.toBeNull()
    expect(match![1].trim()).toBe(INVITE_CODE_PATTERN.toString())
  })

  it('la app emite el mismo origen público que la web', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const match = mobileSource.match(/export const STUDENT_APP_ORIGIN = '([^']+)'/)
    expect(match, 'no se encontró STUDENT_APP_ORIGIN en apps/mobile/lib/student-links.ts').not.toBeNull()
    expect(match![1]).toBe(studentAppOrigin())
  })
})
