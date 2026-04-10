'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ClampedIntInputProps
    extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> {
    value: number
    onValueChange: (n: number) => void
    min: number
    max: number
}

/**
 * Entero acotado: permite vaciar y reescribir mientras editas; en blur fuerza [min, max].
 * Evita `parseInt(...) || min` en controlled inputs, que en móvil impide borrar con backspace.
 */
export function ClampedIntInput({
    value,
    onValueChange,
    min,
    max,
    className,
    onBlur,
    ...props
}: ClampedIntInputProps) {
    const [str, setStr] = React.useState(() => (value < min ? '' : String(value)))

    React.useEffect(() => {
        setStr(value < min ? '' : String(value))
    }, [value, min])

    const commitBlur = React.useCallback(() => {
        const n = parseInt(str, 10)
        if (Number.isNaN(n) || n < min) {
            onValueChange(min)
            setStr(String(min))
        } else {
            const clamped = Math.min(max, n)
            onValueChange(clamped)
            setStr(String(clamped))
        }
    }, [str, min, max, onValueChange])

    return (
        <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={str}
            onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '')
                setStr(raw)
                if (raw === '') return
                const n = parseInt(raw, 10)
                if (Number.isNaN(n)) return
                onValueChange(Math.min(max, Math.max(min, n)))
            }}
            onBlur={(e) => {
                commitBlur()
                onBlur?.(e)
            }}
            className={cn(className)}
            {...props}
        />
    )
}

export interface OptionalClampedIntInputProps
    extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> {
    value: number | null
    onValueChange: (n: number | null) => void
    min: number
    max: number
}

/** Como ClampedIntInput pero permite vacío → `null` (metas opcionales, días totales, etc.). */
export function OptionalClampedIntInput({
    value,
    onValueChange,
    min,
    max,
    className,
    onBlur,
    ...props
}: OptionalClampedIntInputProps) {
    const [str, setStr] = React.useState(() => (value == null ? '' : String(value)))

    React.useEffect(() => {
        setStr(value == null ? '' : String(value))
    }, [value])

    return (
        <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={str}
            onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '')
                setStr(raw)
                if (raw === '') {
                    onValueChange(null)
                    return
                }
                const n = parseInt(raw, 10)
                if (Number.isNaN(n)) return
                onValueChange(Math.min(max, Math.max(min, n)))
            }}
            onBlur={(e) => {
                if (str === '') {
                    onValueChange(null)
                } else {
                    const n = parseInt(str, 10)
                    if (Number.isNaN(n) || n < min) {
                        onValueChange(null)
                        setStr('')
                    } else {
                        const clamped = Math.min(max, n)
                        onValueChange(clamped)
                        setStr(String(clamped))
                    }
                }
                onBlur?.(e)
            }}
            className={cn(className)}
            {...props}
        />
    )
}
