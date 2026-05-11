'use client'

import { useEffect } from 'react'

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)')
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return mq.matches || nav.standalone === true
}

function applyStandaloneViewport() {
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    document.head.appendChild(meta)
  }
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
  )
}

// iOS PWA bug: env(safe-area-inset-bottom) reports wrong value on first render in standalone
// mode. Measure the real pixel value via DOM after layout settles, set as CSS var.
// Nav spacers use var(--pwa-sab, env(...)) so this only activates on PWA.
function measureSafeAreaBottom(): number {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;'
  document.documentElement.appendChild(el)
  const h = el.getBoundingClientRect().height
  el.remove()
  return h
}

function applySafeAreaVar() {
  const h = measureSafeAreaBottom()
  document.documentElement.style.setProperty('--pwa-sab', `${h}px`)
}

export function PwaRegister() {
  useEffect(() => {
    if (isStandaloneDisplay()) {
      applyStandaloneViewport()
      // Two rAF frames let the viewport meta settle before measuring
      requestAnimationFrame(() => {
        requestAnimationFrame(applySafeAreaVar)
      })
    }
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => {
      if (isStandaloneDisplay()) {
        applyStandaloneViewport()
        requestAnimationFrame(() => {
          requestAnimationFrame(applySafeAreaVar)
        })
      }
    }
    mq.addEventListener('change', onChange)

    // Re-measure on orientation change and resize (e.g. keyboard dismiss)
    const onResize = () => {
      if (isStandaloneDisplay()) applySafeAreaVar()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  useEffect(() => {
    // Si el navegador soporta Service Workers
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(
          function(_registration) {
            // ServiceWorker registered silently
          },
          function(_err) {
            // Registration failed silently
          }
        )
      })
    }
  }, [])

  return null
}