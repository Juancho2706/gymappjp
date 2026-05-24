'use client'
import { useEffect } from 'react'

export function ThemeScriptSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const orig = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return
      orig(...args)
    }
    return () => { console.error = orig }
  }, [])
  return null
}
