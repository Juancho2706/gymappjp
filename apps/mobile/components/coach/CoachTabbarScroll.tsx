import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

type CoachTabbarScrollValue = {
  minimized: boolean
  reportScrollY: (y: number) => void
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  reset: () => void
}

const CoachTabbarScrollContext = createContext<CoachTabbarScrollValue | null>(null)

export function CoachTabbarScrollProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState(false)
  const lastY = useRef(0)

  const reportScrollY = useCallback((rawY: number) => {
    const y = Math.max(0, rawY)
    if (y <= 0) {
      lastY.current = 0
      setMinimized(false)
      return
    }

    const dy = y - lastY.current
    if (Math.abs(dy) > 6) {
      setMinimized(dy > 0 && y > 80)
      lastY.current = y
    }
  }, [])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    reportScrollY(event.nativeEvent.contentOffset.y)
  }, [reportScrollY])

  const reset = useCallback(() => {
    lastY.current = 0
    setMinimized(false)
  }, [])

  const value = useMemo(() => ({ minimized, reportScrollY, onScroll, reset }), [minimized, onScroll, reportScrollY, reset])
  return <CoachTabbarScrollContext.Provider value={value}>{children}</CoachTabbarScrollContext.Provider>
}

export function useCoachTabbarScroll(): CoachTabbarScrollValue {
  const value = useContext(CoachTabbarScrollContext)
  if (!value) throw new Error('useCoachTabbarScroll debe usarse dentro de CoachTabbarScrollProvider')
  return value
}
