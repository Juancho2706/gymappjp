import { describe, expect, it, vi } from 'vitest'
import { commitResolvedBranding } from '../../apps/mobile/lib/branding-transition'

describe('commitResolvedBranding', () => {
  it('actualiza la memoria antes de persistir', async () => {
    const events: string[] = []
    const branding = { coachId: 'coach-1' }

    await commitResolvedBranding(
      branding,
      value => events.push(`memory:${value.coachId}`),
      async value => {
        events.push(`cache:${value.coachId}`)
      },
    )

    expect(events).toEqual(['memory:coach-1', 'cache:coach-1'])
  })

  it('mantiene el branding vivo si AsyncStorage falla', async () => {
    const setBranding = vi.fn()
    const persist = vi.fn().mockRejectedValue(new Error('storage unavailable'))
    const branding = { coachId: 'coach-2' }

    await expect(commitResolvedBranding(branding, setBranding, persist)).resolves.toBeUndefined()
    expect(setBranding).toHaveBeenCalledWith(branding)
    expect(persist).toHaveBeenCalledWith(branding)
  })
})
