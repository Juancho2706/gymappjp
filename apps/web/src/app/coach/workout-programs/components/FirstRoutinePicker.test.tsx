import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// `vi.mock` se iza al tope del archivo: los dobles se crean con `vi.hoisted` para que existan
// antes que las factories (si no, «Cannot access … before initialization»).
const { push, applyTemplateAction, toastWarning } = vi.hoisted(() => ({
    push: vi.fn(),
    applyTemplateAction: vi.fn(),
    toastWarning: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { warning: toastWarning, error: vi.fn(), success: vi.fn() }),
}))
vi.mock('../../_actions/templates.actions', () => ({ applyTemplateAction }))

import { FirstRoutinePicker } from './FirstRoutinePicker'

const TEMPLATES = [
    { id: 'full-body-3', label: 'Full body 3 días', blurb: 'Cuerpo completo, para arrancar o volver.' },
] as const

const CLIENTS = [{ id: 'demo-1', name: 'Matías', isDemo: true }] as const

function renderPicker(clients: readonly { id: string; name: string; isDemo?: boolean }[] = CLIENTS) {
    return render(
        <FirstRoutinePicker
            templates={TEMPLATES}
            clients={clients}
            defaultClientId={clients[0]?.id ?? null}
            demoLabel="Alumno de ejemplo"
            noun="alumno"
        />,
    )
}

async function clickTemplate() {
    fireEvent.click(screen.getByRole('button', { name: /Full body 3 días/ }))
    // El `useTransition` resuelve la action en un microtask.
    await vi.waitFor(() => expect(applyTemplateAction).toHaveBeenCalled())
    await vi.waitFor(() => expect(push).toHaveBeenCalled())
}

describe('FirstRoutinePicker — entrada de «Primera rutina» (F4.2)', () => {
    beforeEach(() => {
        push.mockClear()
        applyTemplateAction.mockReset()
        toastWarning.mockClear()
    })

    it('plantilla aplicada ⇒ abre el builder del alumno sobre el programa creado, en modo primera', async () => {
        applyTemplateAction.mockResolvedValue({ ok: true, programId: 'prog-9' })
        renderPicker()
        await clickTemplate()

        expect(applyTemplateAction).toHaveBeenCalledWith({ templateId: 'full-body-3', clientId: 'demo-1' })
        expect(push).toHaveBeenCalledWith('/coach/builder/demo-1?programId=prog-9&primera=1')
    })

    it('la plantilla falla ⇒ lo dice amable y abre el lienzo IGUAL, vacío', async () => {
        applyTemplateAction.mockResolvedValue({ ok: false, reason: 'error', error: 'boom' })
        renderPicker()
        await clickTemplate()

        expect(toastWarning).toHaveBeenCalled()
        expect(push).toHaveBeenCalledWith('/coach/builder/demo-1?primera=1')
    })

    it('plantilla todavía sin contenido ⇒ mismo trato: aviso + lienzo abierto', async () => {
        applyTemplateAction.mockResolvedValue({ ok: false, reason: 'not_implemented', error: 'en preparación' })
        renderPicker()
        await clickTemplate()

        expect(push).toHaveBeenCalledWith('/coach/builder/demo-1?primera=1')
    })

    it('sin alumnos NO llama a la action ni navega: manda a invitar al primero', () => {
        renderPicker([])
        fireEvent.click(screen.getByRole('button', { name: /Full body 3 días/ }))

        expect(applyTemplateAction).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
        expect(screen.getByRole('status')).toHaveTextContent(/invita a tu primer alumno/i)
    })

    it('el alumno de ejemplo va rotulado en el selector', () => {
        renderPicker()
        expect(screen.getByRole('option', { name: 'Matías · Alumno de ejemplo' })).toBeInTheDocument()
    })
})
