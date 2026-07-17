import { describe, expect, it } from 'vitest'
import {
  canProceedToPublishAfterArchive,
  effectiveDateConflicts,
  nextDayIso,
} from './publish-conflict'

describe('effectiveDateConflicts (gate del modal de publicacion)', () => {
  it('hay conflicto cuando la fecha elegida es la misma que la vigente', () => {
    // Repro del CEO: plan vigente desde hoy + publicar con la misma fecha => modal, no RPC.
    expect(effectiveDateConflicts('2026-07-16', '2026-07-16')).toBe(true)
  })

  it('hay conflicto cuando la fecha elegida es anterior a la vigente', () => {
    expect(effectiveDateConflicts('2026-07-10', '2026-07-16')).toBe(true)
  })

  it('NO hay conflicto cuando la fecha elegida es posterior a la vigente', () => {
    expect(effectiveDateConflicts('2026-07-17', '2026-07-16')).toBe(false)
  })

  it('NO bloquea cuando falta la fecha vigente (plan nuevo) o la elegida', () => {
    expect(effectiveDateConflicts('2026-07-16', null)).toBe(false)
    expect(effectiveDateConflicts('', '2026-07-16')).toBe(false)
    expect(effectiveDateConflicts(null, null)).toBe(false)
  })
})

describe('nextDayIso ("Empezar manana")', () => {
  it('avanza un dia dentro del mes', () => {
    expect(nextDayIso('2026-07-16')).toBe('2026-07-17')
  })

  it('cruza fin de mes', () => {
    expect(nextDayIso('2026-07-31')).toBe('2026-08-01')
  })

  it('cruza fin de anio', () => {
    expect(nextDayIso('2026-12-31')).toBe('2027-01-01')
  })

  it('respeta anios bisiestos', () => {
    expect(nextDayIso('2028-02-28')).toBe('2028-02-29')
    expect(nextDayIso('2028-02-29')).toBe('2028-03-01')
  })

  it('no corrige fechas invalidas (las delega al servidor)', () => {
    expect(nextDayIso('no-es-fecha')).toBe('no-es-fecha')
  })
})

describe('canProceedToPublishAfterArchive ("Archivar y reemplazar" — orden seguro)', () => {
  it('avanza a publicar cuando el archivado fue exitoso', () => {
    expect(canProceedToPublishAfterArchive({ ok: true })).toBe(true)
  })

  it('avanza a publicar cuando el plan ya no estaba activo (PLAN_NOT_FOUND, archivado idempotente)', () => {
    // Otra pestana/RN o un reintento ya lo archivo: el objetivo (plan viejo fuera de vigencia)
    // ya se cumplio, asi que se puede publicar el nuevo.
    expect(canProceedToPublishAfterArchive({ ok: false, code: 'PLAN_NOT_FOUND' })).toBe(true)
  })

  it('bloquea cuando el archivado fallo por permisos u otro motivo (no dejar al alumno a medias)', () => {
    expect(canProceedToPublishAfterArchive({ ok: false, code: 'SCOPE_DENIED' })).toBe(false)
    expect(canProceedToPublishAfterArchive({ ok: false, code: 'WRITE_FAILED' })).toBe(false)
    expect(canProceedToPublishAfterArchive({ ok: false })).toBe(false)
  })
})
