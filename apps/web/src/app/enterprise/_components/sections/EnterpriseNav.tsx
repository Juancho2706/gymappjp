'use client'

// RN equivalent: <Stack.Screen options={{ header: () => <CustomHeader /> }} /> + Drawer.Navigator

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Menu, X, ExternalLink } from 'lucide-react'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { CALENDLY_URL, ENTERPRISE_LOGIN_PATH } from '../../_data/enterprise-content'
import { GoldBadge } from '../atoms/GoldBadge'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Producto', href: '#producto' },
  { label: 'Casos de uso', href: '#casos' },
  { label: 'Seguridad', href: '#seguridad' },
  { label: 'Precios', href: '#precios' },
  { label: 'FAQ', href: '#faq' },
]

export function EnterpriseNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close drawer on escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300 pt-safe',
          scrolled
            ? 'border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md'
            : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg" aria-label="EVA Enterprise inicio">
            <Image src={BRAND_APP_ICON} alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-sm font-bold text-zinc-100">EVA</span>
            <GoldBadge variant="default" className="text-[9px] py-0.5 px-2">Enterprise</GoldBadge>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={ENTERPRISE_LOGIN_PATH}
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg px-2 py-1"
            >
              Iniciar sesión
            </a>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-sm font-bold text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.35)] hover:from-amber-400 hover:to-amber-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Agendar demo
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(v => !v)}
            className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
          className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-72 bg-zinc-950 border-l border-zinc-800 pt-safe pb-safe flex flex-col md:hidden',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Image src={BRAND_APP_ICON} alt="" width={28} height={28} className="rounded-lg" />
            <GoldBadge>Enterprise</GoldBadge>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
              className="flex items-center h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Drawer footer CTAs */}
        <div className="border-t border-zinc-800 p-4 space-y-3">
          <a
            href={ENTERPRISE_LOGIN_PATH}
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Iniciar sesión
          </a>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-sm font-bold text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.3)] hover:from-amber-400 hover:to-amber-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Agendar demo
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </>
  )
}
