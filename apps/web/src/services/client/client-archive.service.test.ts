import { describe, expect, it } from 'vitest'
import { hasClientUnarchiveCapacity, isDedicatedStudentAuthIdentity } from './client-archive.service'

describe('isDedicatedStudentAuthIdentity', () => {
  it('banea solo una identidad dedicada exclusivamente al alumno archivado', () => {
    expect(isDedicatedStudentAuthIdentity({
      hasCoachProfile: false,
      hasActiveOrganizationRole: false,
      hasOtherActiveStudentMembership: false,
      checksAvailable: true,
    })).toBe(true)
  })

  it.each([
    { hasCoachProfile: true, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: false, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: true, hasOtherActiveStudentMembership: false, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: true, checksAvailable: true },
    { hasCoachProfile: false, hasActiveOrganizationRole: false, hasOtherActiveStudentMembership: false, checksAvailable: false },
  ])('no banea una identidad compartida o con verificación incompleta: %o', (facts) => {
    expect(isDedicatedStudentAuthIdentity(facts)).toBe(false)
  })
})

describe('hasClientUnarchiveCapacity', () => {
  it('permite el pool Team sin cuota de alumnos, aunque tenga seat_limit de coaches', () => {
    expect(hasClientUnarchiveCapacity({ ok: true, limit: null, used: null, label: 'tu equipo' })).toBe(true)
  })

  it('aplica la cuota numérica de standalone/enterprise', () => {
    expect(hasClientUnarchiveCapacity({ ok: true, limit: 3, used: 2, label: 'tu plan actual' })).toBe(true)
    expect(hasClientUnarchiveCapacity({ ok: true, limit: 3, used: 3, label: 'tu plan actual' })).toBe(false)
  })
})
