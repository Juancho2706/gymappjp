// Copy del acceso por WhatsApp/compartir en mobile (auditoría onboarding v2, 22-08). El módulo
// bajo test no importa react-native, así que corre con el runner del repo aunque viva en apps/mobile.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@eva/schemas'
import { clientInviteMessage, DEFAULT_INVITE_PERSONA } from '../../apps/mobile/lib/client-invite-copy'

const LINK = 'https://www.eva-app.cl/c/QAEMB/login'
const CORREO = 'ana@correo.com'
const CLAVE = 'Eva123456!'

describe('clientInviteMessage', () => {
  it('usa la plantilla de la persona del coach con nombre y link', () => {
    const msg = clientInviteMessage({ persona: 'nutrition', clientName: 'Iván García', loginUrl: LINK })
    expect(msg).toContain('Hola Iván García')
    expect(msg).toContain(LINK)
    expect(msg).toContain('pauta')
  })

  it('sin persona cae a la plantilla neutra (`other`), no a un texto propio', () => {
    const fallback = clientInviteMessage({ persona: null, clientName: 'Ana', loginUrl: LINK })
    const other = clientInviteMessage({ persona: DEFAULT_INVITE_PERSONA, clientName: 'Ana', loginUrl: LINK })
    expect(fallback).toBe(other)
    expect(clientInviteMessage({ persona: undefined, clientName: 'Ana', loginUrl: LINK })).toBe(other)
  })

  it('ninguna persona menciona a EVA: el mensaje es white-label por construcción', () => {
    for (const persona of PERSONAS) {
      const msg = clientInviteMessage({ persona, clientName: 'Ana', loginUrl: LINK })
      expect(msg).not.toMatch(/\bEVA\b/)
      expect(msg).toContain('mi app')
    }
  })

  it('el nombre vacío no deja un «Hola ,» colgando', () => {
    const msg = clientInviteMessage({ persona: 'strength', clientName: '   ', loginUrl: LINK })
    expect(msg.startsWith('Hola hola')).toBe(true)
  })
})

/**
 * FCN W2.4 — el mensaje deja de mandar al alumno a una pantalla que no puede cruzar: el `{link}` es
 * `/c/{código}/login`, que pide correo Y contraseña (callejón 4 del SPEC). Copy literal de
 * `docs/specs/flujo-coach-nuevo/SPEC.md §6`, carácter por carácter.
 */
describe('clientInviteMessage · credencial adentro del mensaje', () => {
  it('con correo y clave sale la variante CON credencial, literal de SPEC §6', () => {
    const msg = clientInviteMessage({
      persona: 'strength',
      clientName: 'Ana',
      loginUrl: LINK,
      email: CORREO,
      tempPassword: CLAVE,
    })
    expect(msg).toBe(
      'Hola Ana, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.\n' +
        `Entra acá: ${LINK}\n` +
        `Tu usuario: ${CORREO}\n` +
        `Tu clave temporal: ${CLAVE} — la cambias apenas entres.`,
    )
  })

  it('las cinco personas suman el bloque de acceso: link, correo y clave', () => {
    for (const persona of PERSONAS) {
      const msg = clientInviteMessage({
        persona,
        clientName: 'Ana',
        loginUrl: LINK,
        email: CORREO,
        tempPassword: CLAVE,
      })
      expect(msg).toContain(LINK)
      expect(msg).toContain(CORREO)
      expect(msg).toContain(CLAVE)
    }
  })

  it('sin la clave sale la variante SIN credencial, literal de SPEC §6', () => {
    const msg = clientInviteMessage({ persona: 'strength', clientName: 'Ana', loginUrl: LINK, email: CORREO })
    expect(msg).toBe(
      'Hola Ana, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.\n' +
        `Entra acá: ${LINK} — te mandé tu clave al correo.`,
    )
  })

  it('media credencial no existe: falte cual falte, va el link y NUNCA la clave', () => {
    // Los dos o ninguno. Un «Tu usuario:» huérfano —o peor, un «Tu clave temporal: undefined»— es
    // un mensaje que el alumno no puede usar y que igual expone parte del acceso.
    const casos = [
      { email: CORREO, tempPassword: null },
      { email: null, tempPassword: CLAVE },
      { email: '   ', tempPassword: CLAVE },
      { email: CORREO, tempPassword: '   ' },
      {},
    ]
    for (const credencial of casos) {
      const msg = clientInviteMessage({ persona: 'strength', clientName: 'Ana', loginUrl: LINK, ...credencial })
      expect(msg).toContain(LINK)
      expect(msg).not.toContain(CLAVE)
      expect(msg).not.toContain('Tu usuario')
      expect(msg).not.toContain('undefined')
      expect(msg).toContain('te mandé tu clave al correo')
    }
  })
})

/**
 * W4.7 («Ciclo real y por lado») — Play sigue en **closed testing** (0 tokens Android en toda la
 * instancia contra 32 de iOS), así que «Tu alumno baja EVA…» mandaba al alumno a una tienda donde no
 * está la app. El copy canónico del SPEC lo manda al navegador o a iOS.
 *
 * Este guard lee el fuente como texto porque el copy vive inline en el JSX y el componente importa
 * `react-native` (no se puede montar acá). Si algún día se extrae a constante, este `describe` se
 * reemplaza por un assert sobre esa constante. `process.cwd()` = raíz del monorepo (mismo recurso
 * que `tests/coach-invite-code-url.test.ts`).
 */
describe('copy del acceso del alumno · superficies del coach en RN', () => {
  const COACH_ACCESS_COPY =
    'Tu alumno entra desde el navegador con tu link o desde la app en iOS. No necesita instalar nada.'
  const PROHIBIDO = /baja EVA|descarga EVA|bajar la app|descargar EVA/i

  function coachSourceFiles(): string[] {
    const roots = [
      resolve(process.cwd(), 'apps/mobile/components/coach'),
      resolve(process.cwd(), 'apps/mobile/app/coach'),
    ]
    const out: string[] = []
    for (const root of roots) {
      if (!existsSync(root)) continue
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue
        out.push(join(entry.parentPath ?? root, entry.name))
      }
    }
    return out
  }

  it('la hoja «Invitar alumno» dice el copy canónico, carácter por carácter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/mobile/components/coach/InviteStudent.tsx'),
      'utf8',
    )
    expect(source).toContain(COACH_ACCESS_COPY)
  })

  it('ninguna superficie del coach manda al alumno a bajar la app', () => {
    const files = coachSourceFiles()
    expect(files.length, 'no se encontró ningún fuente del coach: revisa las rutas del guard').toBeGreaterThan(20)

    const culpables = files.filter((file) => PROHIBIDO.test(readFileSync(file, 'utf8')))
    expect(culpables, `superficies del coach que todavía mandan a instalar la app:\n${culpables.join('\n')}`).toEqual([])
  })
})
