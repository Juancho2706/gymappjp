import type { ReactNode } from 'react'

export function AuroraDesktopShell({
  url,
  mode,
  sidebar,
  children,
}: {
  url: string
  mode: 'light' | 'dark'
  sidebar: ReactNode
  children: ReactNode
}) {
  return (
    <div className="aurora-desktop-wrap">
      <div className="aurora-desktop-chrome" role="presentation">
        <div className="aurora-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="aurora-desktop-url">{url}</div>
      </div>
      <div className={`aurora-desktop-body ${mode === 'light' ? 'light' : 'dark'}`}>
        <aside className="aurora-desktop-sidebar">{sidebar}</aside>
        <main className="aurora-desktop-main">{children}</main>
      </div>
    </div>
  )
}
