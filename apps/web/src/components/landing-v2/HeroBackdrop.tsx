'use client'

/**
 * Landing v2 "Prism" — HeroBackdrop (§B, líneas 105-113 + §3).
 *
 * Contenedor absoluto (z-0) del campo de color del hero. Renderiza SIEMPRE los
 * blobs + grid + fade en DOM (fallback que igual reacciona al color vía
 * `var(--brand-rgb)`), y monta el canvas WebGL ENCIMA sólo cuando hay soporte
 * WebGL y no hay `prefers-reduced-motion` — en cuyo caso se importa `three` de
 * forma perezosa (`dynamic`, `ssr:false`) para no inflar el bundle de la landing.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const HeroBackdropGL = dynamic(() => import('./HeroBackdropGL'), { ssr: false })

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

function BlobsFallback() {
  return (
    <>
      {/* fallback glow blobs (también enriquecen bajo el WebGL) */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          left: -140,
          width: 680,
          height: 680,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgb(var(--brand-rgb) / 0.22) 0%, transparent 64%)',
          filter: 'blur(100px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 260,
          right: -180,
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgb(var(--brand-rgb) / 0.14) 0%, transparent 66%)',
          filter: 'blur(120px)',
        }}
      />
      {/* grid con mask radial */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(140,140,150,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(140,140,150,0.07) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
          backgroundPosition: '-1px -1px',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 24%, black 30%, transparent 92%)',
          maskImage: 'radial-gradient(ellipse 80% 55% at 50% 24%, black 30%, transparent 92%)',
        }}
      />
      {/* fade inferior al fondo de página */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 55%, #08080a 96%)',
        }}
      />
    </>
  )
}

export function HeroBackdrop() {
  const [useGL, setUseGL] = useState(false)

  useEffect(() => {
    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    if (!supportsWebGL()) return
    setUseGL(true)
  }, [])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1180,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {/* canvas (detrás de los blobs, como en el diseño) */}
      {useGL && <HeroBackdropGL />}
      <BlobsFallback />
    </div>
  )
}
