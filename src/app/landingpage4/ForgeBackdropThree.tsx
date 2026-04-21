'use client'

import type { MutableRefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'
import type { ForgeChapterRef } from './ForgeScrollChapterBridge'

type ForgeThreeTheme = 'light' | 'dark'

const PALETTE = {
    light: {
        fog: 0xfafafa,
        fogDensity: 0.032,
        particles: [0xa1a1aa, 0x52525b, 0xff3b1f, 0xe4e4e7] as const,
        opacity: 0.32,
        size: 0.01,
    },
    dark: {
        fog: 0x09090b,
        fogDensity: 0.038,
        particles: [0x71717a, 0xd4d4d8, 0xff4d32, 0x3f3f46] as const,
        opacity: 0.42,
        size: 0.011,
    },
} as const

/** Multiplicadores por capítulo de scroll (0 hero … 5 planes/faq/cta). */
const CHAPTER_MULT: { opacity: number; rot: number; yAmp: number; fog: number }[] = [
    { opacity: 1.12, rot: 1.18, yAmp: 1.05, fog: 0.94 },
    { opacity: 1.0, rot: 1.0, yAmp: 1.0, fog: 1.0 },
    { opacity: 0.96, rot: 0.96, yAmp: 1.0, fog: 1.05 },
    { opacity: 1.08, rot: 1.08, yAmp: 1.0, fog: 1.0 },
    { opacity: 1.02, rot: 1.0, yAmp: 1.38, fog: 1.0 },
    { opacity: 0.9, rot: 0.9, yAmp: 0.92, fog: 1.06 },
]

export function ForgeBackdropThree({
    theme,
    chapterRef,
    className,
}: {
    theme: ForgeThreeTheme
    chapterRef: MutableRefObject<ForgeChapterRef>
    className?: string
}) {
    const mountRef = useRef<HTMLDivElement>(null)
    const [useStatic, setUseStatic] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setUseStatic(true)
            return
        }

        const el = mountRef.current
        if (!el) return

        THREE.ColorManagement.enabled = true
        const cfg = PALETTE[theme]

        let rafId = 0
        let scrollY = 0
        const onScroll = () => {
            scrollY = window.scrollY
        }
        window.addEventListener('scroll', onScroll, { passive: true })

        const scene = new THREE.Scene()
        const baseFogDensity = cfg.fogDensity
        scene.fog = new THREE.FogExp2(cfg.fog, baseFogDensity)

        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 24)
        camera.position.set(0, 0, 3.6)

        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = theme === 'dark' ? 0.92 : 0.88
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.display = 'block'
        el.appendChild(renderer.domElement)

        const n = 2400
        const pos = new Float32Array(n * 3)
        const col = new Float32Array(n * 3)
        const palette = cfg.particles.map((h) => new THREE.Color(h))
        const tmp = new THREE.Color()
        for (let i = 0; i < n; i++) {
            const u = Math.random()
            const v = Math.random()
            const theta = 2 * Math.PI * u
            const phi = Math.acos(2 * v - 1)
            const r = 1.35 + Math.random() * 2.85
            const j = i * 3
            pos[j] = r * Math.sin(phi) * Math.cos(theta) * 0.95
            pos[j + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.75
            pos[j + 2] = r * Math.cos(phi) * 0.55
            tmp.copy(palette[i % palette.length])
            tmp.multiplyScalar(0.35 + Math.random() * 0.4)
            col[j] = tmp.r
            col[j + 1] = tmp.g
            col[j + 2] = tmp.b
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))

        const soft = document.createElement('canvas')
        soft.width = 48
        soft.height = 48
        const sctx = soft.getContext('2d')
        if (sctx) {
            const g = sctx.createRadialGradient(24, 24, 0, 24, 24, 24)
            g.addColorStop(0, 'rgba(255,255,255,1)')
            g.addColorStop(0.35, 'rgba(255,255,255,0.2)')
            g.addColorStop(1, 'rgba(255,255,255,0)')
            sctx.fillStyle = g
            sctx.fillRect(0, 0, 48, 48)
        }
        const tex = new THREE.CanvasTexture(soft)
        tex.colorSpace = THREE.SRGBColorSpace

        const mat = new THREE.PointsMaterial({
            size: cfg.size,
            map: tex,
            transparent: true,
            opacity: cfg.opacity,
            vertexColors: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
        })
        const field = new THREE.Points(geo, mat)
        scene.add(field)

        let running = !document.hidden
        const onVis = () => {
            running = !document.hidden
        }
        document.addEventListener('visibilitychange', onVis)

        const resize = () => {
            const w = window.innerWidth
            const h = window.innerHeight
            if (w < 2 || h < 2) return
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h, false)
        }
        window.addEventListener('resize', resize)
        resize()

        const clock = new THREE.Clock()
        const animate = () => {
            rafId = requestAnimationFrame(animate)
            if (!running) return

            chapterRef.current.smooth += (chapterRef.current.target - chapterRef.current.smooth) * 0.075
            const ch = Math.min(5, Math.max(0, Math.round(chapterRef.current.smooth)))
            const mult = CHAPTER_MULT[ch] ?? CHAPTER_MULT[0]

            const t = clock.getElapsedTime()
            const scrollEase = scrollY * 0.0001
            const rot = mult.rot * (t * 0.01 + scrollEase)
            field.rotation.y = rot
            field.rotation.x = Math.sin(t * 0.04) * 0.024 * mult.rot + scrollEase * 0.28
            field.position.y = Math.sin(t * 0.32) * 0.035 * mult.yAmp
            mat.opacity = cfg.opacity * mult.opacity
            if (scene.fog instanceof THREE.FogExp2) {
                scene.fog.density = baseFogDensity * mult.fog
            }

            renderer.render(scene, camera)
        }
        animate()

        return () => {
            cancelAnimationFrame(rafId)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', resize)
            document.removeEventListener('visibilitychange', onVis)
            if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement)
            renderer.dispose()
            geo.dispose()
            mat.dispose()
            tex.dispose()
        }
    }, [theme, chapterRef])

    if (useStatic) {
        return (
            <div
                className={cn(
                    'pointer-events-none fixed inset-0 z-0',
                    theme === 'dark'
                        ? 'bg-[var(--forge-bg)] [background:radial-gradient(100%_70%_at_50%_0%,rgba(255,77,50,0.08),transparent_55%),var(--forge-bg)]'
                        : 'bg-[var(--forge-bg)] [background:radial-gradient(100%_70%_at_50%_0%,rgba(255,59,31,0.06),transparent_50%),var(--forge-bg)]',
                    className
                )}
                aria-hidden
            />
        )
    }

    return (
        <div
            ref={mountRef}
            className={cn(
                'pointer-events-none fixed inset-0 z-0 h-[100dvh] w-full opacity-40 dark:opacity-50',
                className
            )}
            aria-hidden
        />
    )
}
