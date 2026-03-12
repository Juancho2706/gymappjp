'use client'

import { useEffect } from 'react'

export function PwaRegister() {
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