import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotesThread, type NotesThreadComment } from './NotesThread'

/**
 * Regresión EVA-NEXTJS-18 (O7.6a): `created_at` es un `timestamptz` y el hilo se pinta en el SSR de
 * la pantalla de nutrición. Con `toLocaleTimeString`/`toLocaleDateString` sin `timeZone` la MISMA
 * nota salía «07:00 a. m.» en el HTML de Vercel (UTC) y «11:00 a. m.» tras hidratar en el celular
 * del alumno (Chile) ⇒ mismatch de texto en cada burbuja, y una nota nocturna chilena además caía
 * en el día siguiente del lado del servidor.
 *
 * Las aserciones son ABSOLUTAS a propósito: valen igual con `process.env.TZ` en UTC, en
 * America/Santiago o en America/New_York, que es exactamente la propiedad que se quiere fijar
 * (el texto depende SOLO del instante, nunca de la zona del runtime).
 */
// `AM`/`PM` llevan ` `: el CLDR es-CL usa espacio duro dentro del marcador de
// mediodía, y ese byte es parte del texto que no debe cambiar entre runtimes.
const AM = 'a. m.'
const PM = 'p. m.'

function note(partial: Partial<NotesThreadComment> = {}): NotesThreadComment {
  return {
    id: 'n1',
    author_role: 'coach' as const,
    body: 'Subí la proteína del almuerzo',
    created_at: '2026-09-02T15:00:00Z',
    ...partial,
  }
}

/**
 * Devuelve el texto EXACTO del `<time>` de la burbuja (sin normalizar espacios: el ` ` del
 * marcador es parte de lo que se está fijando, y `getByText` lo colapsaría a un espacio normal).
 */
function sello(created_at: string): string {
  const { container } = render(
    <NotesThread comments={[note({ created_at })]} onSubmit={async () => {}} currentRole="client" />
  )
  return container.querySelector('time')?.textContent ?? ''
}

describe('NotesThread — sello de tiempo de cada nota (Santiago, determinista)', () => {
  it('11:00 en Chile se pinta «11:00 a. m.», no la hora UTC del runtime', () => {
    // 2026-09-02T15:00:00Z = 02-sept 11:00 en Santiago (invierno, UTC-4).
    expect(sello('2026-09-02T15:00:00Z')).toBe(`02-sept, 11:00 ${AM}`)
  })

  it('una nota de las 19:30 chilenas NO se corre al día siguiente', () => {
    // 2026-09-04T23:30:00Z = 04-sept 19:30 en Santiago; en UTC ya sería el 04 a las 23:30 y en
    // cualquier runtime al este de Greenwich, el 05.
    expect(sello('2026-09-04T23:30:00Z')).toBe(`04-sept, 07:30 ${PM}`)
  })

  it('cruzada la medianoche chilena sí avanza el día', () => {
    // 2026-09-05T04:30:00Z = 05-sept 00:30 en Santiago (medianoche = 12 en 12 h).
    expect(sello('2026-09-05T04:30:00Z')).toBe(`05-sept, 12:30 ${AM}`)
  })

  it('el mismo instante escrito con otro offset produce el mismo texto', () => {
    expect(sello('2026-09-02T15:00:00Z')).toBe(sello('2026-09-02T11:00:00-04:00'))
  })

  it('instante inválido → sello vacío, nunca «Invalid Date»', () => {
    expect(sello('basura')).toBe('')
  })
})
