'use client'

// RN equivalent: fixed View with SafeAreaView at bottom — acts as persistent CTA bar

import { useEffect, useState } from 'react'
import { ExternalLink, LogIn } from 'lucide-react'
import { CALENDLY_URL, ENTERPRISE_LOGIN_PATH } from '../../_data/enterprise-content'
import { cn } from '@/lib/utils'

export function EnterpriseMobileBottomBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.5)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={cn(
        // Only show on mobile — md+ has nav CTAs
        'fixed bottom-0 inset-x-0 z-40 md:hidden',
        'border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md pb-safe',
        'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <a
          href={ENTERPRISE_LOGIN_PATH}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          tabIndex={visible ? 0 : -1}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Iniciar sesión
        </a>
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 flex-2 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-sm font-bold text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.3)] hover:from-amber-400 hover:to-amber-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          tabIndex={visible ? 0 : -1}
        >
          Agendar demo
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  )
}
