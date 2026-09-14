import { describe, expect, it } from 'vitest'
import {
  ASSIGN_CLIENT_SEARCH_MIN_CLIENTS,
  assignTemplateButtonLabel,
  filterAssignClients,
  normalizeSearchText,
  showsAssignClientSearch,
} from '../../apps/mobile/components/coach/programs/program-model'

/**
 * «Asignar plantilla» (biblioteca RN) — buscador de alumnos con paridad web.
 *
 * Origen: video de una coach (2026-09-14) que tomó el campo «Duración» por un buscador y cerró
 * sin marcar alumna. Se pinnea:
 *  - umbral web: buscador solo con MÁS de 5 alumnos;
 *  - filtro sin acentos ni mayúsculas, consulta vacía ⇒ lista intacta y en el mismo orden;
 *  - copy del CTA: «Selecciona alumnos» con 0, «Asignar a N» con marcados, «Asignando...» ocupado.
 */

const clients = [
  { id: 'a', full_name: 'Alan' },
  { id: 'b', full_name: 'Angélica' },
  { id: 'c', full_name: 'Daniela' },
  { id: 'd', full_name: 'Danielis' },
  { id: 'e', full_name: 'Francesca' },
  { id: 'f', full_name: 'Jean Pierre' },
]

describe('normalizeSearchText', () => {
  it('quita acentos, espacios sobrantes y mayúsculas', () => {
    expect(normalizeSearchText('  Ángela  ')).toBe('angela')
    expect(normalizeSearchText('JOSÉ')).toBe('jose')
    expect(normalizeSearchText('')).toBe('')
  })
})

describe('showsAssignClientSearch', () => {
  it('regla web: solo con más de 5 alumnos', () => {
    expect(ASSIGN_CLIENT_SEARCH_MIN_CLIENTS).toBe(5)
    expect(showsAssignClientSearch(0)).toBe(false)
    expect(showsAssignClientSearch(5)).toBe(false)
    expect(showsAssignClientSearch(6)).toBe(true)
  })
})

describe('filterAssignClients', () => {
  it('consulta vacía o solo espacios devuelve la lista intacta', () => {
    expect(filterAssignClients(clients, '')).toBe(clients)
    expect(filterAssignClients(clients, '   ')).toBe(clients)
  })

  it('filtra por subcadena ignorando acentos y mayúsculas, conservando el orden', () => {
    expect(filterAssignClients(clients, 'dan').map((c) => c.id)).toEqual(['c', 'd'])
    expect(filterAssignClients(clients, 'angelica').map((c) => c.id)).toEqual(['b'])
    expect(filterAssignClients(clients, 'ANGÉ').map((c) => c.id)).toEqual(['b'])
    expect(filterAssignClients(clients, 'pierre').map((c) => c.id)).toEqual(['f'])
  })

  it('sin coincidencias devuelve vacío y tolera nombres nulos', () => {
    expect(filterAssignClients(clients, 'zzz')).toEqual([])
    expect(filterAssignClients([{ full_name: null as unknown as string }], 'a')).toEqual([])
  })
})

describe('assignTemplateButtonLabel', () => {
  it('dice qué falta con 0 marcados y cuenta marcados (no visibles) con N', () => {
    expect(assignTemplateButtonLabel(0, false)).toBe('Selecciona alumnos')
    expect(assignTemplateButtonLabel(1, false)).toBe('Asignar a 1')
    expect(assignTemplateButtonLabel(3, false)).toBe('Asignar a 3')
    expect(assignTemplateButtonLabel(3, true)).toBe('Asignando...')
  })
})
