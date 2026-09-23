'use client'

import { useId, type ReactNode } from 'react'
import Image from 'next/image'
import { Check, Star } from 'lucide-react'

export type PaymentGatewayChoice = 'flow' | 'mercadopago'

/**
 * Tarjetas que acepta Webpay (Flow) para el cargo automático. Es el dato que faltaba en pantalla:
 * los 6 coaches que pagan por Flow usan Redcompra o prepago, y 4 de ellos probaron primero Mercado
 * Pago y volvieron sin pagar (caso Cristóbal, 23-09). Por eso Webpay va primero y preseleccionado.
 */
const WEBPAY_CARDS = ['Redcompra', 'Visa', 'Mastercard', 'Prepago'] as const

/**
 * «¿Cómo quieres pagar?» — selector de medio para el ALTA paga (free → plan pago y registro).
 * Radios nativos dentro de labels: teclado (flechas), lector de pantalla y foco salen gratis.
 * Controlado: el padre decide qué hacer con la elección (un solo botón de continuar).
 */
export function PaymentMethodPicker({
    value,
    onChange,
    disabled = false,
    compact = false,
}: {
    value: PaymentGatewayChoice
    onChange: (value: PaymentGatewayChoice) => void
    disabled?: boolean
    /** Cards angostas (alta paga): el texto no se sangra bajo el radio. */
    compact?: boolean
}) {
    const name = useId()
    const indent = compact ? '' : 'pl-[34px]'

    return (
        <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2.5 px-0.5 font-display text-[15px] font-extrabold tracking-tight text-strong">
                ¿Cómo quieres pagar?
            </legend>
            <div className="flex flex-col gap-2.5">
                <MethodOption
                    name={name}
                    value="flow"
                    checked={value === 'flow'}
                    onSelect={onChange}
                    header={
                        <>
                            <LogoChip>
                                <Image
                                    src="/payments/webpay-light.svg"
                                    alt="Webpay"
                                    width={69}
                                    height={17}
                                    className="h-[17px] w-auto dark:hidden"
                                />
                                <Image
                                    src="/payments/webpay-dark.svg"
                                    alt="Webpay"
                                    width={69}
                                    height={17}
                                    className="hidden h-[17px] w-auto dark:block"
                                />
                            </LogoChip>
                            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                                Más usado
                            </span>
                        </>
                    }
                >
                    <span className={`flex flex-col gap-0.5 ${indent}`}>
                        <span className="text-[15px] font-bold text-strong">Débito, crédito o prepago</span>
                        <span className="text-[12.5px] leading-snug text-muted">
                            Pagas con Webpay a través de Flow, sin crear cuentas nuevas.
                        </span>
                    </span>
                    <span className={`flex flex-wrap gap-1.5 ${indent}`}>
                        {WEBPAY_CARDS.map((card) => (
                            <span
                                key={card}
                                className="inline-flex h-6 items-center rounded-full border border-subtle bg-surface-card px-2 text-[11px] font-semibold text-strong"
                            >
                                {card}
                            </span>
                        ))}
                    </span>
                </MethodOption>

                <MethodOption
                    name={name}
                    value="mercadopago"
                    checked={value === 'mercadopago'}
                    onSelect={onChange}
                    header={
                        <LogoChip className="gap-1.5 pl-1.5">
                            <Image src="/payments/mercadopago.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
                            <span className="text-[13px] font-extrabold tracking-tight text-strong">Mercado Pago</span>
                        </LogoChip>
                    }
                >
                    <span className={`flex flex-col gap-0.5 ${indent}`}>
                        <span className="text-[15px] font-bold text-strong">Tu cuenta Mercado Pago</span>
                        <span className="text-[12.5px] leading-snug text-muted">
                            Se abre Mercado Pago para autorizar el cobro automático.
                        </span>
                    </span>
                </MethodOption>
            </div>
        </fieldset>
    )
}

function MethodOption({
    name,
    value,
    checked,
    onSelect,
    header,
    children,
}: {
    name: string
    value: PaymentGatewayChoice
    checked: boolean
    onSelect: (value: PaymentGatewayChoice) => void
    header: ReactNode
    children: ReactNode
}) {
    return (
        <label
            className={`flex cursor-pointer flex-col gap-2.5 rounded-[18px] border-2 p-3.5 transition-[border-color,background-color,box-shadow] duration-150 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                checked
                    ? 'border-sport-500 bg-sport-100/40 shadow-[0_0_0_4px_color-mix(in_srgb,var(--sport-500)_14%,transparent)]'
                    : 'border-subtle bg-surface-card hover:border-default'
            }`}
        >
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => onSelect(value)}
                className="sr-only"
            />
            <span className="flex w-full items-center gap-3">
                <span
                    aria-hidden="true"
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        checked ? 'border-sport-500 bg-sport-500 text-white' : 'border-default bg-surface-card'
                    }`}
                >
                    {checked ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
                </span>
                {header}
            </span>
            {children}
        </label>
    )
}

/** Placa del logo: blanca en claro (los logos son de fondo claro), hundida en oscuro. */
function LogoChip({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={`flex h-[30px] shrink-0 items-center rounded-[9px] border border-subtle bg-white px-2.5 dark:bg-surface-sunken ${className}`}
        >
            {children}
        </span>
    )
}
