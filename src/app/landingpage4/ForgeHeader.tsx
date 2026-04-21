'use client'

import Link from 'next/link'
import React from 'react'
import { createPortal } from 'react-dom'
import { MenuToggleIcon } from '@/components/menu-toggle-icon'
import { useScroll } from '@/components/use-scroll'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ForgeThemeToggle } from './ForgeThemeToggle'
import { ForgeWordmark } from './ForgeWordmark'

export function ForgeHeader() {
    const [open, setOpen] = React.useState(false)
    const scrolled = useScroll(12)

    const links = [
        { label: 'Producto', href: '#rutinas' },
        { label: 'Planes', href: '#planes' },
        { label: 'FAQ', href: '#faq' },
    ] as const

    React.useEffect(() => {
        if (open) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

    return (
        <header
            className={cn(
                'sticky top-0 z-[100] w-full border-b transition-colors duration-300',
                scrolled
                    ? 'border-[var(--forge-border)] bg-[var(--forge-surface)]/95 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--forge-surface)]/88'
                    : 'border-transparent bg-[var(--forge-surface)]/70 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--forge-surface)]/55'
            )}
        >
            <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
                <a
                    href="#top"
                    className="flex min-h-11 min-w-0 items-center rounded-lg py-2 pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forge-accent)]/50"
                >
                    <ForgeWordmark size="header" />
                </a>

                <div className="hidden items-center gap-1 md:flex">
                    {links.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={buttonVariants({
                                variant: 'ghost',
                                className:
                                    'forge-font-mono text-[11px] uppercase tracking-wider text-[var(--forge-muted)] hover:bg-[var(--forge-accent)]/10 hover:text-[var(--forge-ink)]',
                            })}
                        >
                            {link.label}
                        </a>
                    ))}
                    <Link
                        href="/landingpage4/pruebavistacoach"
                        className={buttonVariants({
                            variant: 'ghost',
                            className:
                                'forge-font-mono text-[11px] uppercase tracking-wider text-[var(--forge-muted)] hover:text-[var(--forge-ink)]',
                        })}
                    >
                        Demo coach
                    </Link>
                    <Link
                        href="/landingpage4/pruebavistaalumno"
                        className={buttonVariants({
                            variant: 'ghost',
                            className:
                                'forge-font-mono text-[11px] uppercase tracking-wider text-[var(--forge-muted)] hover:text-[var(--forge-ink)]',
                        })}
                    >
                        Demo alumno
                    </Link>
                    <Link
                        href="/"
                        className={buttonVariants({
                            variant: 'ghost',
                            className:
                                'forge-font-mono text-[11px] uppercase tracking-wider text-[var(--forge-accent)] hover:text-[var(--forge-accent-dark)]',
                        })}
                    >
                        Sitio EVA
                    </Link>
                    <ForgeThemeToggle />
                    <Link
                        href="/login"
                        className={buttonVariants({
                            variant: 'outline',
                            className:
                                'forge-font-mono border-[var(--forge-border)] bg-transparent text-[11px] uppercase text-[var(--forge-ink)]',
                        })}
                    >
                        Entrar
                    </Link>
                    <Link
                        href="/register?tier=pro&cycle=monthly"
                        className={cn(
                            buttonVariants({ size: 'default' }),
                            'forge-font-mono rounded-full bg-[var(--forge-accent)] text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[var(--forge-accent-dark)]'
                        )}
                    >
                        Registrar
                    </Link>
                </div>

                <div className="flex items-center gap-2 md:hidden">
                    <ForgeThemeToggle />
                    <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setOpen(!open)}
                        className="border-[var(--forge-border)] bg-[var(--forge-surface)]"
                        aria-expanded={open}
                        aria-controls="forge-mobile-menu"
                        aria-label="Abrir menú"
                    >
                        <MenuToggleIcon open={open} className="size-5" duration={280} />
                    </Button>
                </div>
            </nav>

            <ForgeMobileMenu open={open} onClose={() => setOpen(false)} />
        </header>
    )
}

function ForgeMobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open || typeof window === 'undefined') return null

    return createPortal(
        <div
            id="forge-mobile-menu"
            className="fixed inset-0 z-[200] flex flex-col bg-[var(--forge-bg)]/98 backdrop-blur-xl md:hidden"
            style={{ paddingTop: '3.5rem' }}
        >
            <button
                type="button"
                className="forge-font-mono absolute top-3 right-3 rounded-lg border border-[var(--forge-border)] px-3 py-2 text-xs uppercase text-[var(--forge-muted)]"
                onClick={onClose}
            >
                Cerrar
            </button>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {(
                    [
                        ['#top', 'Inicio'],
                        ['#rutinas', 'Producto'],
                        ['#planes', 'Planes'],
                        ['#faq', 'FAQ'],
                    ] as const
                ).map(([href, label]) => (
                    <a
                        key={href}
                        href={href}
                        onClick={onClose}
                        className={buttonVariants({
                            variant: 'ghost',
                            className: 'forge-font-mono justify-start rounded-xl py-4 text-sm uppercase tracking-wider',
                        })}
                    >
                        {label}
                    </a>
                ))}
                <Link
                    href="/landingpage4/pruebavistacoach"
                    onClick={onClose}
                    className={buttonVariants({
                        variant: 'ghost',
                        className: 'forge-font-mono justify-start rounded-xl py-4 text-sm uppercase tracking-wider',
                    })}
                >
                    Demo coach
                </Link>
                <Link
                    href="/landingpage4/pruebavistaalumno"
                    onClick={onClose}
                    className={buttonVariants({
                        variant: 'ghost',
                        className: 'forge-font-mono justify-start rounded-xl py-4 text-sm uppercase tracking-wider',
                    })}
                >
                    Demo alumno
                </Link>
                <div className="mt-4 space-y-2 border-t border-[var(--forge-border)] pt-4">
                    <Link
                        href="/"
                        onClick={onClose}
                        className={cn(
                            buttonVariants({ variant: 'outline' }),
                            'w-full justify-center border-[var(--forge-accent)]/40 bg-[var(--forge-accent-bg)] font-semibold text-[var(--forge-accent)]'
                        )}
                    >
                        Sitio principal
                    </Link>
                    <Link href="/login" onClick={onClose} className={buttonVariants({ variant: 'ghost', className: 'w-full justify-center' })}>
                        Ya tengo cuenta
                    </Link>
                    <Link
                        href="/register?tier=pro&cycle=monthly"
                        onClick={onClose}
                        className={cn(
                            buttonVariants({ size: 'lg' }),
                            'flex w-full items-center justify-center rounded-xl bg-[var(--forge-accent)] font-bold text-white hover:bg-[var(--forge-accent-dark)]'
                        )}
                    >
                        Crear cuenta
                    </Link>
                </div>
            </div>
        </div>,
        document.body
    )
}
