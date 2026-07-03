'use client'

/**
 * Landing v2 "Prism" — HeroBackdropGL (§3, JS initWebGL 980-1046).
 *
 * Full-screen quad con un shader de ruido fBm teñido por el color de marca.
 * Se carga vía `dynamic(ssr:false)` desde HeroBackdrop → sólo entra al bundle del
 * cliente y sólo cuando hay WebGL + no reduced-motion.
 *
 * WebGL CRUDO (sin `three`): `canvas.getContext('webgl')` + shaders compilados a mano.
 * El diseño original usaba three.js sólo como cascarón del mismo shader; este componente
 * reproduce el fragment shader fBm VERBATIM (líneas 1004-1023 del HTML fuente) sobre un
 * quad clip-space, evitando la dependencia `three` (que no está instalada).
 *
 * Lee `curRef` del brand provider cada frame (sin re-render de React) para el uniform
 * `uColor` → la marca del rail muta el color en vivo. Render on-demand: pausa fuera de
 * viewport (IntersectionObserver) y con la pestaña oculta (`document.hidden`).
 */

import { useEffect, useRef } from 'react'
import { useLandingBrand } from './_brand-provider'

// Fragment shader VERBATIM del diseño (`LandingPrism v2.dc.html`, líneas 1004-1023).
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

// Vertex passthrough. En three el `position`/`uv` los inyectaba el motor; en WebGL crudo
// se declaran como attributes explícitos (mismo resultado: quad clip-space con uv 0..1).
const VERTEX_SHADER = [
  'attribute vec2 position;',
  'attribute vec2 uv;',
  'varying vec2 vUv;',
  'void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }',
].join('\n')

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export default function HeroBackdropGL() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { curRef } = useLandingBrand()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = (canvas.getContext('webgl', { antialias: true, alpha: true }) ||
      canvas.getContext('experimental-webgl', {
        antialias: true,
        alpha: true,
      })) as WebGLRenderingContext | null
    if (!gl) return // sin WebGL → el fallback de blobs (siempre en DOM) cubre el hero

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }
    gl.useProgram(program)

    // Quad full-screen (triangle strip): [posX, posY, u, v] × 4.
    const verts = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1,
    ])
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

    const STRIDE = 4 * Float32Array.BYTES_PER_ELEMENT
    const posLoc = gl.getAttribLocation(program, 'position')
    const uvLoc = gl.getAttribLocation(program, 'uv')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE, 0)
    gl.enableVertexAttribArray(uvLoc)
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, STRIDE, 2 * Float32Array.BYTES_PER_ELEMENT)

    const uTimeLoc = gl.getUniformLocation(program, 'uTime')
    const uResLoc = gl.getUniformLocation(program, 'uRes')
    const uColorLoc = gl.getUniformLocation(program, 'uColor')
    const uNavyLoc = gl.getUniformLocation(program, 'uNavy')

    gl.uniform3f(uNavyLoc, 0.02, 0.05, 0.13)
    gl.uniform3f(uColorLoc, 0, 0.478, 1)

    // devicePixelRatio fijado una vez (cap 2; 1 en < 700px) — igual que setPixelRatio del diseño.
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1 : 2)

    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const w = canvas.clientWidth || 1
      const hh = canvas.clientHeight || 1
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(hh * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      // uRes en px CSS: sólo importa el ratio (uv.x *= uRes.x/uRes.y) → idéntico al diseño.
      gl.uniform2f(uResLoc, w, hh)
    }

    const draw = (timeSec: number) => {
      const c = curRef.current
      gl.uniform3f(uColorLoc, c[0] / 255, c[1] / 255, c[2] / 255)
      gl.uniform1f(uTimeLoc, reduce ? 0 : timeSec)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    resize()
    draw(0) // un frame inmediato antes de que arranque el rAF

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
      // Pausa el render fuera de viewport o con la pestaña oculta (ahorra GPU).
      if (visible && !document.hidden) {
        draw(now / 1000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (io) io.disconnect()
      window.removeEventListener('resize', resize)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
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
