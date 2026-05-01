'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { postGuideEngagement } from '../../_lib/onboarding-telemetry.client'

/**
 * V6: pieza Three acotada (icosaedro wireframe suave). Solo montar desde `OnboardingThreeSlot`
 * cuando `md+` y sin `prefers-reduced-motion: reduce`.
 */
export function OnboardingThreeRibbonInner() {
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const telemetrySent = useRef(false)

    useEffect(() => {
        const wrap = wrapRef.current
        const canvas = canvasRef.current
        if (!wrap || !canvas) return

        if (!telemetrySent.current) {
            telemetrySent.current = true
            void postGuideEngagement('profile_branding', {
                widget: 'three_ribbon',
                variant: 'webgl',
            })
        }

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50)
        camera.position.z = 3.2

        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'low-power',
        })

        const themeStr = getComputedStyle(wrap).getPropertyValue('--theme-primary').trim()
        const col = new THREE.Color()
        try {
            if (themeStr) col.setStyle(themeStr)
            else col.setHex(0x007aff)
        } catch {
            col.setHex(0x007aff)
        }

        const geo = new THREE.IcosahedronGeometry(1.05, 1)
        const mat = new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.22,
            wireframe: true,
            transparent: true,
            opacity: 0.55,
            metalness: 0.2,
            roughness: 0.45,
        })
        const mesh = new THREE.Mesh(geo, mat)
        scene.add(mesh)
        scene.add(new THREE.AmbientLight(0xffffff, 0.95))

        let raf = 0
        const resize = () => {
            const w = Math.max(1, wrap.clientWidth)
            const h = Math.max(1, wrap.clientHeight)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
            renderer.setSize(w, h, false)
        }

        const ro = new ResizeObserver(() => resize())
        ro.observe(wrap)
        resize()

        const tick = () => {
            mesh.rotation.y += 0.0045
            mesh.rotation.x += 0.0018
            renderer.render(scene, camera)
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            renderer.dispose()
            geo.dispose()
            mat.dispose()
        }
    }, [])

    return (
        <div
            ref={wrapRef}
            className="relative h-24 w-full overflow-hidden rounded-xl border border-[color:var(--theme-primary)]/20 bg-gradient-to-b from-muted/20 to-transparent md:h-28"
            aria-hidden
        >
            <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
    )
}
