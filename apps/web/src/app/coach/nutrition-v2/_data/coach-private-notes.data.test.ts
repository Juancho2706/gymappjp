import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// El data-loader es server-only: mockeamos el cliente Supabase y controlamos la respuesta.
const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

import { fetchCoachPrivateNotes } from './coach-private-notes.data'

function dbReturning(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self,
    eq: self,
    order: self,
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return { from: () => chain }
}

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    coach_id: '11111111-1111-4111-8111-111111111111',
    client_id: '22222222-2222-4222-8222-222222222222',
    body: 'Baja adherencia los fines de semana.\nRevisar cena.',
    created_at: '2026-07-20T13:30:00.000Z',
    updated_at: '2026-07-28T13:30:00.000Z',
    ...overrides,
  }
}

// `fetchCoachPrivateNotes` esta envuelto en React `cache` (dedupe por request): cada caso usa
// un clientId distinto para que un test no lea el resultado memoizado del anterior.
describe('fetchCoachPrivateNotes', () => {
  beforeEach(() => {
    createClient.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin notas => ok:true con lista vacia', async () => {
    createClient.mockResolvedValue(dbReturning({ data: [], error: null }))
    const res = await fetchCoachPrivateNotes('client-sin-notas')
    expect(res).toEqual({ ok: true, notes: [] })
  })

  it('mapea la nota y formatea la fecha en America/Santiago (dd-mm-yyyy)', async () => {
    createClient.mockResolvedValue(dbReturning({ data: [noteRow()], error: null }))
    const res = await fetchCoachPrivateNotes('client-con-nota')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.notes).toHaveLength(1)
    expect(res.notes[0].body).toContain('Baja adherencia')
    expect(res.notes[0].updatedAtLabel).toBe('28-07-2026')
  })

  it('sin updated_at cae a created_at para la etiqueta', async () => {
    createClient.mockResolvedValue(
      dbReturning({ data: [noteRow({ updated_at: null })], error: null }),
    )
    const res = await fetchCoachPrivateNotes('client-solo-created')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.notes[0].updatedAtLabel).toBe('20-07-2026')
  })

  it('error de la base => ok:false (NUNCA [] : guardar pisaria la nota vigente)', async () => {
    createClient.mockResolvedValue(
      dbReturning({ data: null, error: { message: 'permission denied' } }),
    )
    const res = await fetchCoachPrivateNotes('client-rls-denegado')
    expect(res).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
  })

  it('excepcion (red) => ok:false y loguea', async () => {
    createClient.mockRejectedValue(new Error('network down'))
    const res = await fetchCoachPrivateNotes('client-red-caida')
    expect(res).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
  })
})
