'use client'

import { ThemeProvider } from 'next-themes'

export function AdminDarkWrapper({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
            <style>{`
                .admin-shell {
                    --admin-bg-base:     #080a0d;
                    --admin-bg-surface:  #0f1117;
                    --admin-bg-elevated: #161b24;
                    --admin-border:      #1e2533;
                    --admin-accent:      #2e7cf6;
                    --admin-accent-dim:  #1a4a99;
                    --admin-green:       #22c55e;
                    --admin-amber:       #f59e0b;
                    --admin-red:         #ef4444;
                    --admin-purple:      #a78bfa;
                    --admin-blue:        #60a5fa;
                    --admin-text-1:      #f1f5f9;
                    --admin-text-2:      #94a3b8;
                    --admin-text-3:      #475569;
                }
            `}</style>
            {children}
        </ThemeProvider>
    )
}
