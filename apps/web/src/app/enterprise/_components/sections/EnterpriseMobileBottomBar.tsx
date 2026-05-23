'use client'

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
        'fixed bottom-0 inset-x-0 z-40 md:hidden',
        'border-t border-gray-200/80 bg-white/95 backdrop-blur-md pb-safe',
        'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <a
          href={ENTERPRISE_LOGIN_PATH}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          tabIndex={visible ? 0 : -1}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Iniciar sesión
        </a>
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#007AFF] text-sm font-bold text-white hover:bg-[#0068E0] active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          style={{ boxShadow: '0 4px 16px -4px rgba(0,122,255,0.45)' }}
          tabIndex={visible ? 0 : -1}
        >
          Agendar demo
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  )
}
