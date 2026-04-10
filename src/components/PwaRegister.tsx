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

export function PwaRegister() {
  useEffect(() => {
    if (isStandaloneDisplay()) {
      applyStandaloneViewport()
    }
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => {
      if (isStandaloneDisplay()) applyStandaloneViewport()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    // Si el navegador soporta Service Workers
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(
          function(registration) {
            console.log('ServiceWorker registrado con alcance: ', registration.scope)
          },
          function(err) {
            console.error('ServiceWorker falló en registrarse: ', err)
          }
        )
      })
    }
  }, [])

  return null
}