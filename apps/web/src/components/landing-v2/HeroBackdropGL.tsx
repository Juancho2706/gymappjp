'use client'

/**
 * Landing v2 "Prism" — HeroBackdropGL (§3, JS initWebGL 980-1046).
 *
 * Full-screen quad con ShaderMaterial de ruido fBm teñido por el color de marca.
 * Se carga vía `dynamic(ssr:false)` desde HeroBackdrop → Three sólo entra al
 * bundle del cliente y sólo cuando hay WebGL + no reduced-motion.
 *
 * Lee `curRef` del brand provider cada frame (sin re-render de React) para el
 * uniform `uColor`. Render on-demand: pausa fuera de viewport (IntersectionObserver).
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useLandingBrand } from './_brand-provider'

const FRAGMENT_SHADER = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform float uTime; uniform vec2 uRes; uniform vec3 uColor; uniform vec3 uNavy;',
  'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
  '  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x), u.y); }',
  'float fbm(vec2 p){ float v=0.0, a=0.5; for(int k=0;k<5;k++){ v+=a*vnoise(p); p*=2.02; a*=0.5; } return v; }',
  'void main(){',
  '  vec2 uv = vUv; uv.x *= uRes.x / uRes.y;',
  '  float t = uTime * 0.04;',
  '  vec2 q = vec2(fbm(uv*1.6 + t), fbm(uv*1.6 + vec2(5.2,1.3) - t));',
  '  float n = fbm(uv*1.6 + q*1.4 + t*0.5);',
  '  vec3 bright = clamp(uColor*1.25 + 0.05, 0.0, 1.0);',
  '  vec3 col = mix(uNavy, uColor, smoothstep(0.12, 0.85, n));',
  '  col = mix(col, bright, smoothstep(0.55, 0.96, q.x));',
  '  col *= 0.62;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n')

const VERTEX_SHADER = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }'

export default function HeroBackdropGL() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { curRef } = useLandingBrand()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1 : 2))

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uColor: { value: new THREE.Vector3(0, 0.478, 1) },
        uNavy: { value: new THREE.Vector3(0.02, 0.05, 0.13) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geometry, mat)
    scene.add(quad)

    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const w = canvas.clientWidth || 1
      const hh = canvas.clientHeight || 1
      renderer.setSize(w, hh, false)
      mat.uniforms.uRes.value.set(w, hh)
    }
    resize()
    renderer.render(scene, camera) // un frame inmediato antes de que arranque el rAF

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)

    let visible = true
    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          visible = e.isIntersecting
        })
      })
      io.observe(canvas)
    }

    let raf = 0
    const loop = (now: number) => {
      if (visible) {
        const c = curRef.current
        mat.uniforms.uColor.value.set(c[0] / 255, c[1] / 255, c[2] / 255)
        mat.uniforms.uTime.value = reduce ? 0 : now / 1000
        renderer.render(scene, camera)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (io) io.disconnect()
      window.removeEventListener('resize', resize)
      geometry.dispose()
      mat.dispose()
      renderer.dispose()
    }
  }, [curRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.55,
        WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 28%, black 20%, transparent 88%)',
        maskImage: 'radial-gradient(ellipse 90% 70% at 50% 28%, black 20%, transparent 88%)',
      }}
    />
  )
}
