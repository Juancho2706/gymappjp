import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * «Vive tu app» — el botón que decide CÓMO entra el coach a su app de alumno
 * (docs/specs/vive-tu-app-directo §1).
 *
 * Lo que este test pinnea, que es exactamente lo que se rompió el 23-08:
 *  - en MÓVIL un toque navega en el mismo gesto; nunca aparece un QR para escanear con el celular
 *    que el coach tiene en la mano (4 de 6 coaches se quedaron ahí);
 *  - en ESCRITORIO la hoja con QR sigue siendo lo correcto (el teléfono no tiene la sesión);
 *  - `autoOpen` no navega solo en móvil: navegar sin gesto le saca la pantalla de las manos;
 *  - UN solo `generate()` por gesto (cada uno emite un magic link y un `vive_tu_app_opened`);
 *  - sin alumno de ejemplo el botón EXPLICA y ofrece salida, en vez de un toast sin retorno (D8=A).
 *
 * `matchMedia` se redefine antes de cada render: `vitest.setup.ts:18-33` lo fuerza a `matches:
 * false` para todo el repo y sin esto el caso «escritorio» probaría el camino móvil.
 */

const { openViveTuAppMock, reseedMock, refreshMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
    openViveTuAppMock: vi.fn(),
    reseedMock: vi.fn(),
    refreshMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { error: toastErrorMock, success: toastSuccessMock }),
}))
vi.mock('../_actions/vive-tu-app.actions', () => ({ openViveTuAppAction: openViveTuAppMock }))
vi.mock('../../settings/funciones/_actions/mi-panel.actions', () => ({
    reseedDemoStudentAction: reseedMock,
}))

import { ViveTuAppButton } from './ViveTuAppButton'

const URL_DEMO = 'https://www.eva-app.cl/vive-tu-app?t=HASH&c=EVA123'
const OK = { ok: true as const, url: URL_DEMO, demoName: 'Matías Soto' }

function setViewport(desktop: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: desktop,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

const assignMock = vi.fn()
const realLocation = window.location

beforeEach(() => {
    vi.clearAllMocks()
    openViveTuAppMock.mockResolvedValue(OK)
    Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: { ...realLocation, href: realLocation.href, assign: assignMock },
    })
})

afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, configurable: true, value: realLocation })
})

const QR_TEXT = /Escanéalo con tu celular/

describe('ViveTuAppButton — móvil entra directo', () => {
    it('un toque genera el link UNA vez y navega en el mismo gesto, sin hoja', async () => {
        setViewport(false)
        const onOpened = vi.fn()
        render(<ViveTuAppButton label="Ver mi app" onOpened={onOpened} />)

        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))

        await waitFor(() => expect(assignMock).toHaveBeenCalledWith(URL_DEMO))
        expect(openViveTuAppMock).toHaveBeenCalledTimes(1)
        expect(screen.queryByText(QR_TEXT)).toBeNull()
        // El paso 2 lo tilda el SERVIDOR cuando el coach entró: acá no se avisa nada.
        expect(onOpened).not.toHaveBeenCalled()
    })

    it('`autoOpen` en móvil NO navega solo: pinta el CTA y espera el toque', async () => {
        setViewport(false)
        render(<ViveTuAppButton label="Ver como Matías" onOpened={vi.fn()} autoOpen />)

        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(assignMock).not.toHaveBeenCalled()
        expect(openViveTuAppMock).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /Ver como Matías/ })).toBeTruthy()
    })
})

describe('ViveTuAppButton — escritorio conserva la hoja', () => {
    it('un toque abre la hoja con el QR y no navega', async () => {
        setViewport(true)
        const onOpened = vi.fn()
        render(<ViveTuAppButton label="Ver mi app" onOpened={onOpened} />)

        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))

        await waitFor(() => expect(screen.getByText(QR_TEXT)).toBeTruthy())
        expect(assignMock).not.toHaveBeenCalled()
        expect(onOpened).toHaveBeenCalledTimes(1)
        expect(refreshMock).toHaveBeenCalled()
    })

    it('«Abrir en este navegador» REUSA el link del QR: un solo `generate()` por gesto', async () => {
        setViewport(true)
        const tab = { location: { href: '' }, close: vi.fn() }
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
        render(<ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))
        await waitFor(() => expect(screen.getByText(QR_TEXT)).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /Abrir en este navegador/ }))
        await waitFor(() => expect(tab.location.href).toBe(URL_DEMO))
        // Antes eran DOS: el funnel contaba dos «pidió el link» por una sola intención.
        expect(openViveTuAppMock).toHaveBeenCalledTimes(1)
        openSpy.mockRestore()
    })

    it('el aviso ya no amenaza con perder la sesión del panel', async () => {
        setViewport(true)
        render(<ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))

        await waitFor(() => expect(screen.getByText(QR_TEXT)).toBeTruthy())
        expect(
            screen.getByText(/Se abre en otra pestaña. Cuando termines, vuelves a tu panel con un toque./)
        ).toBeTruthy()
        expect(screen.queryByText(/te pedirá iniciar sesión de nuevo/)).toBeNull()
    })

    it('`autoOpen` en escritorio sigue abriendo la hoja sola', async () => {
        setViewport(true)
        render(<ViveTuAppButton label="Ver como Matías" onOpened={vi.fn()} autoOpen />)
        await waitFor(() => expect(screen.getByText(QR_TEXT)).toBeTruthy())
    })
})

describe('ViveTuAppButton — sin alumno de ejemplo (D8 = A)', () => {
    it('con especialidad que admite demo ofrece «Volver a sembrar», sin pedir el link', async () => {
        setViewport(false)
        render(
            <ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} demoClientId={null} persona="nutrition" />
        )

        expect(screen.getByRole('button', { name: /Volver a sembrar/ })).toBeTruthy()
        expect(screen.getByText('Todavía no tienes tu paciente de ejemplo.')).toBeTruthy()
        expect(openViveTuAppMock).not.toHaveBeenCalled()
        expect(toastErrorMock).not.toHaveBeenCalled()
    })

    it('«Volver a sembrar» usa la acción de Mi panel y vuelve a mostrar el botón normal', async () => {
        setViewport(false)
        reseedMock.mockResolvedValue({ ok: true, message: 'Ana Riquelme volvió a tu lista de alumnos.' })
        render(
            <ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} demoClientId={null} persona="nutrition" />
        )

        fireEvent.click(screen.getByRole('button', { name: /Volver a sembrar/ }))

        await waitFor(() => expect(screen.getByRole('button', { name: /Ver mi app/ })).toBeTruthy())
        expect(reseedMock).toHaveBeenCalledTimes(1)
        expect(refreshMock).toHaveBeenCalled()
    })

    it('`other` no tiene mundo que sembrar: botón deshabilitado con su propia explicación', () => {
        setViewport(false)
        render(<ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} demoClientId={null} persona="other" />)

        const button = screen.getByRole('button', { name: /Ver mi app/ }) as HTMLButtonElement
        expect(button.disabled).toBe(true)
        expect(screen.getByText('Tu especialidad no tiene alumno de ejemplo todavía.')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Volver a sembrar/ })).toBeNull()
    })

    it('si el demo desapareció entre medio, el botón explica en vez de tirar un toast', async () => {
        setViewport(false)
        openViveTuAppMock.mockResolvedValue({ ok: false, reason: 'sin_demo' })
        render(<ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} persona="strength" />)

        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))

        await waitFor(() => expect(screen.getByRole('button', { name: /Volver a sembrar/ })).toBeTruthy())
        expect(screen.getByText('Todavía no tienes tu alumno de ejemplo.')).toBeTruthy()
        expect(toastErrorMock).not.toHaveBeenCalled()
        expect(assignMock).not.toHaveBeenCalled()
    })

    it('un error real sí avisa con su detalle (el rate limit, por ejemplo)', async () => {
        setViewport(false)
        openViveTuAppMock.mockResolvedValue({ ok: false, reason: 'error', detail: 'Espera un momento.' })
        render(<ViveTuAppButton label="Ver mi app" onOpened={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: /Ver mi app/ }))

        await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Espera un momento.'))
        expect(assignMock).not.toHaveBeenCalled()
    })
})
