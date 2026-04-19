import Image from 'next/image'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

type Props = {
  size?: number
  opacity?: number
  className?: string
}

/**
 * Concept A — Kinetic Obsidian
 * Watermark gigante animado de la silueta EVA con halo pulsante.
 * Usado en canvas vacíos, dashboards y hero de landing.
 */
export function KineticHalo({ size = 720, opacity = 0.06, className = '' }: Props) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden ${className}`}
    >
      <div
        className="relative animate-halo-drift"
        style={{ width: size, height: size, opacity }}
      >
        {/* Halo detrás del logo — usa --theme-primary del coach */}
        <div
          className="absolute inset-[20%] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(var(--theme-primary-rgb), 0.35) 0%, transparent 70%)',
            filter: 'blur(48px) saturate(1.6)',
          }}
        />
        <Image
          src={BRAND_APP_ICON}
          alt=""
          width={size}
          height={size}
          priority={false}
          className="relative"
          style={{ filter: 'drop-shadow(0 0 24px rgba(255,255,255,0.15))' }}
        />
      </div>
    </div>
  )
}

/** Versión inline (no absolute) para hero secciones que quieran controlar el contenedor */
export function KineticHaloInline({ size = 420, opacity = 0.08 }: Props) {
  return (
    <div
      className="relative mx-auto animate-halo-drift"
      style={{ width: size, height: size, opacity }}
    >
      <div
        className="absolute inset-[20%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(var(--theme-primary-rgb), 0.4) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      <Image
        src={BRAND_APP_ICON}
        alt=""
        width={size}
        height={size}
        className="relative"
      />
    </div>
  )
}
