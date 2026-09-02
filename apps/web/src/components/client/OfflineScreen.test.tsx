import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'

import { NetworkProvider } from './OfflineScreen'

/**
 * B2 (QA del owner 02-09): al cortarse la red, `NetworkProvider` DESMONTABA el árbol del alumno
 * (hacía `return <OfflineScreen/>` en lugar de `{children}`). El check-in a medio llenar perdía
 * peso, notas, energía y las fotos, y al volver la red remontaba en el paso 1 vacío.
 *
 * Contrato nuevo: `{children}` se renderiza SIEMPRE; el overlay se SUPERPONE y el fondo queda
 * `aria-hidden` + `inert` (sin foco ni clicks detrás) pero montado, con su estado intacto.
 */

const BRAND = { brandName: 'Studio Fuerza', primaryColor: '#1462DC' }

/** Cuenta montajes para probar que un corte de red no remonta nada. */
let mounts = 0

function CampoConEstado() {
    const [value, setValue] = useState('')
    useEffect(() => {
        mounts += 1
    }, [])
    return <input aria-label="campo" value={value} onChange={(e) => setValue(e.target.value)} />
}

function setNavigatorOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function fireNetwork(event: 'online' | 'offline') {
    act(() => {
        setNavigatorOnline(event === 'online')
        window.dispatchEvent(new Event(event))
    })
}

function renderProvider() {
    mounts = 0
    setNavigatorOnline(true)
    return render(
        <NetworkProvider {...BRAND}>
            <CampoConEstado />
        </NetworkProvider>,
    )
}

function backdrop(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>('[data-offline-backdrop]')
    if (!el) throw new Error('no hay backdrop marcado como offline')
    return el
}

afterEach(() => {
    setNavigatorOnline(true)
})

describe('NetworkProvider — el corte de red ya no desmonta la app del alumno', () => {
    it('con red: pinta los children y ningún overlay', () => {
        const { container } = renderProvider()

        expect(screen.getByLabelText('campo')).toBeInTheDocument()
        expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
        expect(container.querySelector('[data-offline-backdrop]')).toBeNull()
    })

    it('sin red: superpone el overlay SIN desmontar los children ni perder su estado', () => {
        renderProvider()
        fireEvent.change(screen.getByLabelText('campo'), { target: { value: 'notas a medio escribir' } })

        fireNetwork('offline')

        expect(screen.getByText('Sin conexión')).toBeInTheDocument()
        // Lo que importa: el hijo sigue montado (1 solo montaje) y conserva lo tipeado.
        expect(screen.getByLabelText('campo')).toHaveValue('notas a medio escribir')
        expect(mounts).toBe(1)
    })

    it('sin red: el fondo queda aria-hidden + inert (no se interactúa ni se enfoca detrás)', () => {
        const { container } = renderProvider()

        fireNetwork('offline')

        const fondo = backdrop(container)
        expect(fondo).toHaveAttribute('aria-hidden', 'true')
        expect(fondo).toHaveAttribute('inert')
        // El overlay NO puede quedar dentro del subárbol inerte, o sería inalcanzable él también.
        expect(fondo.contains(screen.getByText('Sin conexión'))).toBe(false)
    })

    it('al volver la red: se saca el overlay y el fondo vuelve a ser interactivo, sin remontar', () => {
        const { container } = renderProvider()
        fireEvent.change(screen.getByLabelText('campo'), { target: { value: '81,5' } })

        fireNetwork('offline')
        fireNetwork('online')

        expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
        expect(container.querySelector('[data-offline-backdrop]')).toBeNull()
        expect(container.querySelector('[inert]')).toBeNull()
        expect(screen.getByLabelText('campo')).toHaveValue('81,5')
        expect(mounts).toBe(1)
    })

    it('arranca sin red (navigator.onLine=false en el montaje): overlay arriba, children montados', () => {
        mounts = 0
        setNavigatorOnline(false)
        render(
            <NetworkProvider {...BRAND}>
                <CampoConEstado />
            </NetworkProvider>,
        )

        expect(screen.getByText('Sin conexión')).toBeInTheDocument()
        expect(screen.getByLabelText('campo')).toBeInTheDocument()
        expect(mounts).toBe(1)
    })
})
