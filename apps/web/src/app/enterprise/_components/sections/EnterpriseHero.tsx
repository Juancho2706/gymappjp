'use client'

import { useEffect, useRef } from 'react'
import { ShieldCheck, Zap } from 'lucide-react'
import { CALENDLY_URL, ENTERPRISE_LOGIN_PATH, HERO } from '../../_data/enterprise-content'
import { LottiePlayer } from '../atoms/LottiePlayer'
import { Reveal, RevealStagger, RevealItem } from '@/components/motion/Reveal'

const PARTICLE_COUNT = 30

export function EnterpriseHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let animId: number

    type P = { x: number; y: number; size: number; speed: number; opacity: number }
    const particles: P[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = canvas.parentElement?.clientHeight ?? 900
    }

    const newParticle = (): P => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 100,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: 1,
    })

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.y -= p.speed
        if (p.y < 300) p.opacity = p.y / 300
        if (p.y < -10 || p.opacity <= 0) Object.assign(p, newParticle())
        ctx.fillStyle = `rgba(255,255,255,${p.opacity * 0.4})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      animId = requestAnimationFrame(animate)
    }

    resize()
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = newParticle()
      p.y = Math.random() * canvas.height
      particles.push(p)
    }
    animate()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <section
      id="hero"
      className="relative min-h-dvh flex items-center pt-24 pb-16 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000000 0%, #0040DD 60%, #ffffff 100%)' }}
      aria-labelledby="hero-heading"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none motion-reduce:hidden"
        aria-hidden
      />

      <div className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 items-center w-full">
        {/* Left content */}
        <RevealStagger className="space-y-8">
          <RevealItem>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-[11px] font-semibold uppercase tracking-[0.15em] font-mono"
              style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              {'// Gestión Multi-Coach de Próxima Generación'}
            </div>
          </RevealItem>

          <RevealItem>
            <h1
              id="hero-heading"
              className="font-display font-black text-white leading-[1.05] tracking-[-0.03em] text-5xl md:text-7xl"
            >
              {HERO.headline.split('\n').map((line, i) => (
                <span key={i}>
                  {i === 0 ? line : (
                    <>
                      <br />
                      <span
                        style={{
                          background: 'linear-gradient(90deg, #00E5FF 0%, #7CC1FF 60%, #ffffff 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        {line}
                      </span>
                    </>
                  )}
                </span>
              ))}
            </h1>
          </RevealItem>

          <RevealItem>
            <p className="text-lg md:text-xl text-white/80 max-w-xl leading-relaxed">
              {HERO.sub}
            </p>
          </RevealItem>

          <RevealItem>
            <div className="flex flex-wrap gap-4 pt-2">
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="hero-cta-primary"
                className="eva-pulse-cta flex h-14 items-center justify-center gap-3 rounded-full bg-[#007AFF] text-white px-8 text-lg font-bold hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2"
              >
                {HERO.ctaPrimary}
                <Zap className="h-5 w-5" aria-hidden />
              </a>
              <a
                href={ENTERPRISE_LOGIN_PATH}
                data-testid="hero-cta-secondary"
                className="flex h-14 items-center justify-center gap-3 rounded-full border border-white/30 text-white px-8 text-lg font-bold hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.10)' }}
              >
                Ver Demo
              </a>
            </div>
          </RevealItem>

        </RevealStagger>

        {/* Right: Lottie team collaboration visual */}
        <Reveal variant="scale" delay={0.15} className="hidden lg:flex justify-center items-center">
          <div className="relative w-full max-w-[560px]">
            {/* Backdrop glow */}
            <div
              className="absolute -inset-8 rounded-[2.5rem] blur-3xl opacity-60"
              style={{
                background:
                  'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(0,229,255,0.25), transparent 70%)',
              }}
              aria-hidden
            />
            <div
              className="relative w-full rounded-3xl p-4 sm:p-6"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 20px 60px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <div className="aspect-[1/0.9] w-full">
                <LottiePlayer
                  src="/lottie/team-collab.json"
                  ariaLabel="Animación de equipo colaborando en plataforma"
                />
              </div>
            </div>

            <div
              className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full blur-[100px] motion-reduce:hidden"
              style={{ background: 'rgba(0,229,255,0.2)' }}
              aria-hidden
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
