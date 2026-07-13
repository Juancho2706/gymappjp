import { describe, expect, it } from 'vitest'
import { resolveProfileAnalyticsLoadMode } from '../apps/mobile/lib/profile-analytics-load-policy'

describe('mobile profile analytics load policy', () => {
  it('standalone/team propagan error critico en vez de fabricar ceros', () => {
    expect(resolveProfileAnalyticsLoadMode('standalone', true, [0, 0])).toBe('error')
    expect(resolveProfileAnalyticsLoadMode('team_member', true, [4, 0])).toBe('error')
  })

  it('enterprise usa fallback ante guard vacio o error critico', () => {
    expect(resolveProfileAnalyticsLoadMode('enterprise', false, [0, 0, 0])).toBe('fallback')
    expect(resolveProfileAnalyticsLoadMode('enterprise', true, [4, 2, 0])).toBe('fallback')
  })

  it('con RPC sanas conserva el fast path', () => {
    expect(resolveProfileAnalyticsLoadMode('standalone', false, [0, 0])).toBe('rpc')
    expect(resolveProfileAnalyticsLoadMode('team_owner', false, [2, 0])).toBe('rpc')
    expect(resolveProfileAnalyticsLoadMode('enterprise', false, [2, 0])).toBe('rpc')
  })
})
