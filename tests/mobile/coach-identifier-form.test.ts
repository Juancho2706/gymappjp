// Contrato del form de identificador de coach (sheet del morph + ruta `/alumno/codigo`). Los dos
// modulos bajo test son RN-free a proposito, asi que corren con el runner de la raiz.
import { describe, expect, it } from 'vitest'
import { parseCoachIdentifier } from '@eva/schemas'
import {
  COACH_IDENTIFIER_HELPER,
  canSubmitCoachIdentifier,
  coachIdentifierErrorCopy,
  resolveClipboardIdentifier,
} from '../../apps/mobile/lib/coach-identifier-form'
import { studentJoinUrl } from '../../apps/mobile/lib/student-links'

/** El clip exacto que deja Share Entreno al compartir una tarjeta (`?ref&src&k`). */
const CLIP_TARJETA =
  'https://www.eva-app.cl/join/CRDZ9?ref=ba265b0b-1111-4111-8111-111111111111&src=share_card&k=placa'

describe('resolveClipboardIdentifier', () => {
  it.each(['', '   ', '\n\t '])('trata el portapapeles vacío (%j) como `empty`', clip => {
    expect(resolveClipboardIdentifier(clip)).toEqual({ ok: false, reason: 'empty' })
  })

  it('un texto cualquiera no se manda a resolver', () => {
    expect(resolveClipboardIdentifier('hola cómo estás')).toEqual({ ok: false, reason: 'unparsable' })
  })

  it('extrae el código del enlace de la tarjeta compartida (el caso reportado)', () => {
    expect(resolveClipboardIdentifier(CLIP_TARJETA)).toEqual({ ok: true, value: 'CRDZ9' })
  })

  it('devuelve el valor normalizado, no lo que estaba en el portapapeles', () => {
    expect(resolveClipboardIdentifier(' crdz9 ')).toEqual({ ok: true, value: 'CRDZ9' })
    expect(resolveClipboardIdentifier('https://www.eva-app.cl/c/coach-jp/login'))
      .toEqual({ ok: true, value: 'coach-jp' })
  })

  it('el valor devuelto es lo que se pinta en el campo: nunca la URL entera', () => {
    const resolved = resolveClipboardIdentifier(CLIP_TARJETA)
    expect(resolved.ok && resolved.value).toBe('CRDZ9')
    expect(resolved.ok && resolved.value.includes('http')).toBe(false)
  })
})

// Cierra el loop emisor -> parser: si alguien cambia `studentJoinUrl` sin tocar el parser, el
// alumno vuelve a comerse «Revisa el dato…» al pegar el enlace de su coach.
describe('contrato emisor ↔ parser', () => {
  it('el enlace que emite la app se puede pegar de vuelta en el form', () => {
    const emitido = `${studentJoinUrl('CRDZ9')}?ref=ba265b0b-1111-4111-8111-111111111111&src=share_card&k=placa`
    expect(emitido).toBe(CLIP_TARJETA)
    expect(parseCoachIdentifier(emitido)).toEqual({ type: 'code', value: 'CRDZ9' })
    expect(resolveClipboardIdentifier(emitido)).toEqual({ ok: true, value: 'CRDZ9' })
  })

  it('el enlace pelado, sin query de atribución, también entra', () => {
    expect(resolveClipboardIdentifier(studentJoinUrl('CRDZ9'))).toEqual({ ok: true, value: 'CRDZ9' })
  })
})

describe('coachIdentifierErrorCopy', () => {
  it('`clipboard` tiene copy propio y no repite el de `format`', () => {
    const clipboard = coachIdentifierErrorCopy('clipboard')
    expect(clipboard).toBeTruthy()
    expect(clipboard).not.toBe(coachIdentifierErrorCopy('format'))
    // El fallo del portapapeles no puede hablar de «5 caracteres»: no es lo que pasó.
    expect(clipboard).not.toMatch(/5 caracteres/)
  })

  it('sin error no hay mensaje y el helper en reposo no cambió', () => {
    expect(coachIdentifierErrorCopy(null)).toBeNull()
    expect(COACH_IDENTIFIER_HELPER).toBe('Letras y números, sin espacios.')
  })
})

describe('canSubmitCoachIdentifier', () => {
  it('mantiene su contrato: algo escrito y sin resolución en curso', () => {
    expect(canSubmitCoachIdentifier('CRDZ9', false)).toBe(true)
    expect(canSubmitCoachIdentifier('   ', false)).toBe(false)
    expect(canSubmitCoachIdentifier('CRDZ9', true)).toBe(false)
  })
})
