'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X, ExternalLink } from 'lucide-react'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { CALENDLY_URL, ENTERPRISE_LOGIN_PATH } from '../../_data/enterprise-content'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Features', href: '#producto' },
  { label: 'Cases', href: '#casos' },
  { label: 'Pricing', href: '#precios' },
  { label: 'Security', href: '#seguridad' },
  { label: 'FAQ', href: '#faq' },
]

export function EnterpriseNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-500 pt-safe py-4',
          scrolled
            ? 'bg-white/70 backdrop-blur-xl shadow-sm border-b border-gray-200/50 py-3'
            : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex h-auto max-w-[1280px] items-center justify-between px-10">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] rounded-lg"
            aria-label="EVA Enterprise inicio"
          >
            <Image
              src={scrolled ? '/LOGOS/LOGO NEGRO SIN LETRAS SIN BG BORDE BLANCO.png' : BRAND_APP_ICON}
              alt=""
              width={40}
              height={40}
              className="rounded-lg transition-opacity duration-300"
            />
            <span
              className="text-2xl font-black tracking-tighter font-display"
              style={{
                background: 'linear-gradient(90deg, #0A1B3F 0%, #007AFF 55%, #00E5FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              EVA
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Navegación principal">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-[0.15em] font-mono transition-colors',
                  scrolled ? 'text-gray-700 hover:text-[#007AFF]' : 'text-white hover:text-[#00E5FF]',
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={ENTERPRISE_LOGIN_PATH}
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.15em] font-mono transition-colors px-2 py-1 rounded-lg',
                scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white',
              )}
            >
              Iniciar sesión
            </a>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#007AFF] px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] font-mono text-white transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
              style={{ boxShadow: '0 0 15px -3px rgba(0,122,255,0.4)' }}
            >
              Agendar Demo
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(v => !v)}
            className={cn(
              'md:hidden flex h-11 w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]',
              scrolled
                ? 'border-gray-200 text-gray-700 hover:border-gray-300'
                : 'border-white/30 text-white hover:border-white/60',
            )}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l border-gray-100 pt-safe pb-safe flex flex-col md:hidden',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Image src={BRAND_APP_ICON} alt="" width={28} height={28} className="rounded-lg" />
            <span className="text-sm font-bold text-gray-900">EVA Enterprise</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer links */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center h-11 rounded-xl px-4 text-sm font-medium text-gray-700 hover:text-[#007AFF] hover:bg-[#007AFF]/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Drawer footer CTAs */}
        <div className="border-t border-gray-100 p-4 space-y-3">
          <a
            href={ENTERPRISE_LOGIN_PATH}
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            Iniciar sesión
          </a>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] text-sm font-bold text-white transition-all hover:bg-[#0068E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            Agendar demo
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </>
  )
}
