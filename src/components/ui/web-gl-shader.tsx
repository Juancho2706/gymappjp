'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

type SceneRefs = {
    scene: THREE.Scene | null
    camera: THREE.OrthographicCamera | null
    renderer: THREE.WebGLRenderer | null
    mesh: THREE.Mesh | null
    uniforms: {
        resolution: { value: [number, number] }
        time: { value: number }
        xScale: { value: number }
        yScale: { value: number }
        distortion: { value: number }
        lightMode: { value: number }
    } | null
    animationId: number | null
}

const VERT = `
attribute vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`

/** Same wave math everywhere; dark: rainbow on black, light: same rainbow mixed over white. */
const FRAG = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float xScale;
uniform float yScale;
uniform float distortion;
uniform float lightMode;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
  float d = length(p) * distortion;
  float rx = p.x * (1.0 + d);
  float gx = p.x;
  float bx = p.x * (1.0 - d);
  float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
  float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
  float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);
  vec3 rainbow = vec3(r, g, b);
  if (lightMode < 0.5) {
    gl_FragColor = vec4(rainbow, 1.0);
  } else {
    float m = max(r, max(g, b));
    float w = smoothstep(0.02, 0.5, m);
    gl_FragColor = vec4(mix(vec3(1.0), rainbow, w * 0.88), 1.0);
  }
}
`

export type WebGLShaderProps = {
    className?: string
    /** dark: rainbow on black. light: same rainbow hues over white. */
    variant?: 'light' | 'dark'
}

export function WebGLShader({ className, variant = 'dark' }: WebGLShaderProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const sceneRef = useRef<SceneRefs>({
        scene: null,
        camera: null,
        renderer: null,
        mesh: null,
        uniforms: null,
        animationId: null,
    })
    const [reduceMotion, setReduceMotion] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    })

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        const sync = () => setReduceMotion(mq.matches)
        mq.addEventListener('change', sync)
        return () => mq.removeEventListener('change', sync)
    }, [])

    useEffect(() => {
        if (reduceMotion) return
        const canvas = canvasRef.current
        if (!canvas) return
        const parent = canvas.parentElement
        if (!parent) return

        const { current: refs } = sceneRef

        const vertexShader = VERT
        const fragmentShader = FRAG

        let paused = document.visibilityState === 'hidden'
        const isLight = variant === 'light'

        const initScene = () => {
            refs.scene = new THREE.Scene()
            refs.renderer = new THREE.WebGLRenderer({
                canvas,
                alpha: false,
                antialias: false,
                powerPreference: 'high-performance',
            })
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            refs.renderer.setPixelRatio(dpr)
            refs.renderer.setClearColor(
                isLight ? new THREE.Color(0xffffff) : new THREE.Color(0x000000)
            )

            refs.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

            refs.uniforms = {
                resolution: { value: [parent.clientWidth, parent.clientHeight] },
                time: { value: 0.0 },
                xScale: { value: 1.0 },
                yScale: { value: 0.5 },
                distortion: { value: 0.05 },
                lightMode: { value: isLight ? 1.0 : 0.0 },
            }

            const position = new Float32Array([
                -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0, 0.0,
            ])

            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))

            const material = new THREE.RawShaderMaterial({
                vertexShader,
                fragmentShader,
                uniforms: refs.uniforms,
                side: THREE.DoubleSide,
            })

            refs.mesh = new THREE.Mesh(geometry, material)
            refs.scene.add(refs.mesh)

            handleResize()
        }

        const animate = () => {
            if (!refs.renderer || !refs.scene || !refs.camera) return
            if (!paused && refs.uniforms) {
                refs.uniforms.time.value += 0.01
                refs.renderer.render(refs.scene, refs.camera)
            }
            refs.animationId = requestAnimationFrame(animate)
        }

        const handleResize = () => {
            if (!refs.renderer || !refs.uniforms) return
            const w = Math.max(1, parent.clientWidth)
            const h = Math.max(1, parent.clientHeight)
            refs.renderer.setSize(w, h, false)
            refs.uniforms.resolution.value = [w, h]
        }

        const onVis = () => {
            paused = document.visibilityState === 'hidden'
        }

        initScene()
        refs.animationId = requestAnimationFrame(animate)
        const ro = new ResizeObserver(handleResize)
        ro.observe(parent)
        window.addEventListener('resize', handleResize)
        document.addEventListener('visibilitychange', onVis)

        return () => {
            if (refs.animationId != null) cancelAnimationFrame(refs.animationId)
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('resize', handleResize)
            ro.disconnect()
            if (refs.mesh) {
                refs.scene?.remove(refs.mesh)
                refs.mesh.geometry.dispose()
                const mat = refs.mesh.material
                if (mat instanceof THREE.Material) mat.dispose()
            }
            refs.renderer?.dispose()
            refs.scene = null
            refs.camera = null
            refs.renderer = null
            refs.mesh = null
            refs.uniforms = null
            refs.animationId = null
        }
    }, [reduceMotion, variant])

    if (reduceMotion) {
        return null
    }

    return (
        <canvas
            ref={canvasRef}
            className={cn('pointer-events-none absolute inset-0 block h-full w-full', className)}
            aria-hidden
        />
    )
}
