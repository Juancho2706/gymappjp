import { describe, expect, it } from 'vitest'
import {
  builderTourSeenKey,
  LEGACY_BUILDER_TOUR_SEEN_KEY,
  shouldAutoStartBuilderTour,
} from '../../apps/mobile/lib/builder-tour-seen'

describe('tour corto del builder RN por coach (W8.2.1)', () => {
  it('la clave es por coach y distinta entre coaches', () => {
    expect(builderTourSeenKey('a')).toBe(`${LEGACY_BUILDER_TOUR_SEEN_KEY}:a`)
    expect(builderTourSeenKey('a')).not.toBe(builderTourSeenKey('b'))
  })

  it('arranca solo si este coach no lo vio y no hay marca vieja', () => {
    expect(shouldAutoStartBuilderTour({ coachSeen: null, legacySeen: null, guideActive: false })).toBe(true)
    expect(shouldAutoStartBuilderTour({ coachSeen: '1', legacySeen: null, guideActive: false })).toBe(false)
    expect(shouldAutoStartBuilderTour({ coachSeen: null, legacySeen: '1', guideActive: false })).toBe(false)
  })

  it('con la guía de inicio activa no arranca', () => {
    expect(shouldAutoStartBuilderTour({ coachSeen: null, legacySeen: null, guideActive: true })).toBe(false)
  })
})
