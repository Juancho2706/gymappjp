import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'

// La ruta decide si el overlay tapa o no (el ejecutor es la excepción), así que se mockea mutable.
const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: '/c/jose/dashboard' as string | null } }))

vi.mock('next/navigation', () => ({ usePathname: () => pathnameRef.current }))

import { NetworkProvider } from './OfflineScreen'

/**
 * B2 (QA del owner 02-09): al cortarse la red, `NetworkProvider` DESMONTABA el árbol del alumno
 * (hacía `return <OfflineScreen/>` en lugar de `{children}`). El check-in a medio llenar perdía
 * peso, notas, energía y las fotos, y al volver la red remontaba en el paso 1 vacío.
 *
 * Contrato nuevo: `{children}` se renderiza SIEMPRE; el overlay se SUPERPONE y el fondo queda
 * `aria-hidden` + `inert` (sin foco ni clicks detrás) pero montado, con su estado intacto.
 */

const BRAND = { brandName: 'Studio Fuerza', primaryColor: '#1462DC', basePath: '/c/jose' }

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

function renderProvider(pathname: string | null = '/c/jose/dashboard') {
    mounts = 0
    pathnameRef.current = pathname
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
    pathnameRef.current = '/c/jose/dashboard'
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

/**
 * El ejecutor de entrenamiento entrena SIN red: la cola offline escribe en localStorage antes de
 * tocar la red y el propio ejecutor pinta su chip «Sin señal — guardando en tu teléfono»
 * (WorkoutExecutionClient.tsx:2795). El overlay lo tapaba y le prohibía al alumno algo que la app
 * soporta — en RN el mismo alumno sigue registrando series.
 */
describe('NetworkProvider — el overlay no tapa el ejecutor de entrenamiento', () => {
    it('sin red FUERA del ejecutor: overlay arriba y fondo inerte (comportamiento de siempre)', () => {
        const { container } = renderProvider('/c/jose/dashboard')

        fireNetwork('offline')

        expect(screen.getByText('Sin conexión')).toBeInTheDocument()
        expect(backdrop(container)).toHaveAttribute('inert')
    })

    it('sin red DENTRO del ejecutor: ni overlay ni `inert` (verse sin poder tocar sería peor)', () => {
        const { container } = renderProvider('/c/jose/workout/abc-123')

        fireNetwork('offline')

        expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
        // Chequeo aparte: con `inert={!isOnline}` el ejecutor se vería pero no recibiría taps.
        expect(container.querySelector('[inert]')).toBeNull()
        expect(container.querySelector('[data-offline-backdrop]')).toBeNull()
        expect(screen.getByLabelText('campo')).toBeInTheDocument()
    })

    it('sin red en el ejecutor bajo el prefijo del proxy (/e/[org_slug]): tampoco tapa', () => {
        pathnameRef.current = '/e/gym-prueba/workout/abc-123'
        setNavigatorOnline(true)
        const { container } = render(
            <NetworkProvider {...BRAND} basePath="/e/gym-prueba">
                <CampoConEstado />
            </NetworkProvider>,
        )

        fireNetwork('offline')

        expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
        expect(container.querySelector('[inert]')).toBeNull()
    })

    it('con red en el ejecutor: sin overlay (control)', () => {
        const { container } = renderProvider('/c/jose/workout/abc-123')

        expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument()
        expect(container.querySelector('[data-offline-backdrop]')).toBeNull()
    })

    it('sin ruta (usePathname null): no se asume ejecutor, el overlay sigue protegiendo', () => {
        const { container } = renderProvider(null)

        fireNetwork('offline')

        expect(screen.getByText('Sin conexión')).toBeInTheDocument()
        expect(backdrop(container)).toHaveAttribute('inert')
    })
})
