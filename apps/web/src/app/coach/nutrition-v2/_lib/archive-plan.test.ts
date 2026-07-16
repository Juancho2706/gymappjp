import { describe, expect, it } from 'vitest'
import { ArchivePlanInputSchema, classifyArchiveWrite } from './archive-plan'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const PLAN = '22222222-2222-4222-8222-222222222222'

describe('ArchivePlanInputSchema', () => {
  it('acepta clientId y planId uuid validos', () => {
    const parsed = ArchivePlanInputSchema.safeParse({ clientId: CLIENT, planId: PLAN })
    expect(parsed.success).toBe(true)
  })

  it('rechaza un clientId que no es uuid', () => {
    const parsed = ArchivePlanInputSchema.safeParse({ clientId: 'not-a-uuid', planId: PLAN })
    expect(parsed.success).toBe(false)
  })

  it('rechaza un planId que no es uuid', () => {
    const parsed = ArchivePlanInputSchema.safeParse({ clientId: CLIENT, planId: '123' })
    expect(parsed.success).toBe(false)
  })

  it('rechaza payload sin planId', () => {
    const parsed = ArchivePlanInputSchema.safeParse({ clientId: CLIENT })
    expect(parsed.success).toBe(false)
  })

  it('rechaza un payload que no es objeto', () => {
    expect(ArchivePlanInputSchema.safeParse(null).success).toBe(false)
    expect(ArchivePlanInputSchema.safeParse('x').success).toBe(false)
  })
})

describe('classifyArchiveWrite', () => {
  it('mapea 42501 a SCOPE_DENIED', () => {
    const outcome = classifyArchiveWrite({ errorCode: '42501', rowsAffected: 0 })
    expect(outcome.code).toBe('SCOPE_DENIED')
  })

  it('mapea cualquier otro error de DB a WRITE_FAILED', () => {
    const outcome = classifyArchiveWrite({ errorCode: 'XX000', rowsAffected: 0 })
    expect(outcome.code).toBe('WRITE_FAILED')
  })

  it('mapea 0 filas afectadas (sin error) a PLAN_NOT_FOUND', () => {
    const outcome = classifyArchiveWrite({ errorCode: null, rowsAffected: 0 })
    expect(outcome.code).toBe('PLAN_NOT_FOUND')
  })

  it('trata undefined errorCode con 0 filas como PLAN_NOT_FOUND (idempotencia: 2do archivado)', () => {
    const outcome = classifyArchiveWrite({ errorCode: undefined, rowsAffected: 0 })
    expect(outcome.code).toBe('PLAN_NOT_FOUND')
  })

  it('devuelve OK cuando se archivo al menos una fila', () => {
    const outcome = classifyArchiveWrite({ errorCode: null, rowsAffected: 1 })
    expect(outcome).toEqual({ code: 'OK' })
  })

  it('prioriza el error de DB por sobre el conteo de filas', () => {
    const outcome = classifyArchiveWrite({ errorCode: '42501', rowsAffected: 1 })
    expect(outcome.code).toBe('SCOPE_DENIED')
  })
})
