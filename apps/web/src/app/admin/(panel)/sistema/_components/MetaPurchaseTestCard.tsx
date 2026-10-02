'use client'

import { useState, useTransition } from 'react'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { sendMetaPurchaseTestAction } from '../_actions/meta-purchase-test.actions'

/**
 * Plan C: prueba manual del píxel de compra. El admin pega el código de «Eventos de prueba» de
 * Events Manager y manda una compra de prueba; Meta la muestra ahí y no la cuenta como real.
 */
export function MetaPurchaseTestCard() {
    const [code, setCode] = useState('')
    const [pending, startTransition] = useTransition()

    const submit = () => {
        startTransition(async () => {
            const result = await sendMetaPurchaseTestAction(code)
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            toast.success('Compra de prueba enviada. Mírala en Events Manager → Eventos de prueba.')
        })
    }

    return (
        <div className="rounded-xl border border-subtle bg-surface-card">
            <div className="border-b border-subtle px-4 py-3">
                <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Píxel de compra · prueba
                </h3>
            </div>
            <div className="space-y-3 px-4 py-3">
                <p className="text-xs text-muted">
                    Las compras reales se mandan solas con el primer cobro de cada coach. Para probar sin esperar un
                    pago: en Events Manager abre «Eventos de prueba», copia el código (empieza con TEST) y pégalo acá.
                    Esa compra no cuenta como real.
                </p>
                <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                        e.preventDefault()
                        submit()
                    }}
                >
                    <label htmlFor="meta-test-code" className="sr-only">
                        Código de eventos de prueba
                    </label>
                    <input
                        id="meta-test-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="TEST12345"
                        autoComplete="off"
                        spellCheck={false}
                        className="min-h-10 flex-1 rounded-lg border border-subtle bg-transparent px-3 font-mono text-sm text-strong placeholder:text-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    />
                    <button
                        type="submit"
                        disabled={pending || code.trim().length === 0}
                        className="min-h-10 rounded-lg border border-subtle px-4 text-sm font-medium text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {pending ? 'Enviando…' : 'Enviar compra de prueba'}
                    </button>
                </form>
            </div>
        </div>
    )
}
