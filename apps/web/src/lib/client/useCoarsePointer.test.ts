import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoarsePointer } from './useCoarsePointer'

type Handler = (e: MediaQueryListEvent) => void

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<Handler>()
  const mql = {
    get matches() {
      return matches
    },
    media: '(pointer: coarse)',
    addEventListener: (_: string, cb: Handler) => listeners.add(cb),
    removeEventListener: (_: string, cb: Handler) => listeners.delete(cb),
    // legacy no-ops (no se usan cuando addEventListener existe)
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    onchange: null,
  }
  const emit = (next: boolean) => {
    matches = next
    listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return { emit }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCoarsePointer', () => {
  it('resolves to true when pointer is coarse (post-mount)', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useCoarsePointer())
    expect(result.current).toBe(true)
  })

  it('resolves to false when pointer is fine (desktop)', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useCoarsePointer())
    expect(result.current).toBe(false)
  })

  it('reacts to media-query changes', () => {
    const { emit } = mockMatchMedia(false)
    const { result } = renderHook(() => useCoarsePointer())
    expect(result.current).toBe(false)
    act(() => emit(true))
    expect(result.current).toBe(true)
  })
})
