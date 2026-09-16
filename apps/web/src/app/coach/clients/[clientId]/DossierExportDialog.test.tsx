import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DossierExportDialog } from './DossierExportDialog'

/**
 * RTL del diálogo de exportación (R19). Lo que se prueba es la MÁQUINA DE ESTADOS de la pantalla,
 * no el PDF: las actions y el generador están mockeados.
 *
 * El caso que motivó este archivo: el efecto que pedía los bounds tenía `loadingBounds` en sus
 * deps y se cancelaba a sí mismo en el cleanup ⇒ «Cargando meses…» quedaba colgado para siempre y
 * los chips no aparecían nunca. El primer test es exactamente esa regresión.
 */

const actions = vi.hoisted(() => ({
    getClientReportBounds: vi.fn(),
    getClientMonthDossiers: vi.fn(),
    getClientDossier: vi.fn(),
}))
const downloadClientDossierPdf = vi.hoisted(() => vi.fn())

vi.mock('./_actions/client-detail.actions', () => actions)
vi.mock('@/lib/pdf/client-dossier-pdf', () => ({ downloadClientDossierPdf }))

const CLIENT_ID = 'client-1'

function renderDialog() {
    const onOpenChange = vi.fn()
    render(<DossierExportDialog open onOpenChange={onOpenChange} clientId={CLIENT_ID} />)
    return { onOpenChange }
}

/** El diálogo vive en un portal: se busca por rol en todo el documento. */
function dialog() {
    return within(screen.getByRole('dialog'))
}

async function switchToMonths() {
    const months = await screen.findByRole('radio', { name: 'Por meses' })
    // Mientras los bounds cargan el segmento está deshabilitado (R19/DM-02b).
    await waitFor(() => expect(months).toBeEnabled())
    fireEvent.click(months)
}

beforeEach(() => {
    vi.clearAllMocks()
    actions.getClientReportBounds.mockResolvedValue({
        firstMonthKey: '2026-06',
        currentMonthKey: '2026-09',
    })
    actions.getClientMonthDossiers.mockResolvedValue([{ generatedAtIso: 'x' }])
    actions.getClientDossier.mockResolvedValue({ generatedAtIso: 'x' })
    downloadClientDossierPdf.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('DossierExportDialog', () => {
    it('abre en «Estado actual» con el CTA de descarga directa', async () => {
        renderDialog()
        expect(dialog().getByText('Exportar informe')).toBeInTheDocument()
        expect(dialog().getByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
        // Los bounds se piden al ABRIR, una sola vez.
        await waitFor(() => expect(actions.getClientReportBounds).toHaveBeenCalledTimes(1))
        expect(actions.getClientReportBounds).toHaveBeenCalledWith(CLIENT_ID)
    })

    it('REGRESIÓN: al pasar a «Por meses» aparecen los chips y el CTA queda habilitado', async () => {
        renderDialog()
        await switchToMonths()

        const group = await screen.findByRole('group', { name: 'Meses del informe' })
        const chips = within(group).getAllByRole('button')
        // jun → sep 2026, del más reciente al más viejo.
        expect(chips).toHaveLength(4)
        expect(chips[0]).toHaveTextContent('sep 2026 · hasta hoy')
        expect(chips[3]).toHaveTextContent('jun 2026')
        // El mes en curso viene preseleccionado ⇒ 1 informe.
        expect(chips[0]).toHaveAttribute('aria-pressed', 'true')

        expect(screen.queryByText('Cargando meses…')).toBeNull()
        expect(dialog().getByRole('button', { name: 'Descargar 1 PDF' })).toBeEnabled()
    })

    it('sin meses elegidos el CTA se apaga y aparece el recordatorio', async () => {
        renderDialog()
        await switchToMonths()
        const group = await screen.findByRole('group', { name: 'Meses del informe' })

        fireEvent.click(within(group).getAllByRole('button')[0]!)

        expect(dialog().getByText('Elegí al menos un mes.')).toBeInTheDocument()
        expect(dialog().getByRole('button', { name: 'Descargar 1 PDF' })).toBeDisabled()
    })

    it('«Últimos 3» selecciona 3 meses y el interruptor de zip cambia el CTA', async () => {
        renderDialog()
        await switchToMonths()
        await screen.findByRole('group', { name: 'Meses del informe' })

        fireEvent.click(dialog().getByRole('button', { name: 'Últimos 3' }))
        expect(dialog().getByRole('button', { name: 'Descargar 1 PDF' })).toBeEnabled()

        fireEvent.click(dialog().getByRole('switch', { name: 'Un solo PDF' }))
        expect(dialog().getByRole('button', { name: 'Descargar 3 PDF (zip)' })).toBeEnabled()
    })

    it('no deja pasar de 24 meses y lo avisa en línea', async () => {
        // 30 meses disponibles ⇒ el chip 25 tiene que rebotar.
        actions.getClientReportBounds.mockResolvedValue({
            firstMonthKey: '2024-04',
            currentMonthKey: '2026-09',
        })
        renderDialog()
        await switchToMonths()
        const group = await screen.findByRole('group', { name: 'Meses del informe' })
        const chips = within(group).getAllByRole('button')
        expect(chips).toHaveLength(30)

        // 24 chips prendidos (el primero ya venía marcado).
        for (const chip of chips.slice(1, 24)) fireEvent.click(chip)
        expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(24)

        fireEvent.click(chips[24]!)
        expect(chips[24]).toHaveAttribute('aria-pressed', 'false')
        expect(dialog().getByText('Podés exportar hasta 24 meses por vez.')).toBeInTheDocument()
    })

    it('descarga los meses elegidos y cierra', async () => {
        const { onOpenChange } = renderDialog()
        await switchToMonths()
        await screen.findByRole('group', { name: 'Meses del informe' })

        fireEvent.click(dialog().getByRole('button', { name: 'Descargar 1 PDF' }))

        await waitFor(() =>
            expect(actions.getClientMonthDossiers).toHaveBeenCalledWith(CLIENT_ID, ['2026-09'], {
                includePhotos: true,
            })
        )
        await waitFor(() =>
            expect(downloadClientDossierPdf).toHaveBeenCalledWith([{ generatedAtIso: 'x' }], {
                separate: false,
            })
        )
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('un error del service se muestra inline y el diálogo NO se cierra', async () => {
        actions.getClientMonthDossiers.mockRejectedValue(new Error('No tenés acceso a este alumno'))
        const { onOpenChange } = renderDialog()
        await switchToMonths()
        await screen.findByRole('group', { name: 'Meses del informe' })

        fireEvent.click(dialog().getByRole('button', { name: 'Descargar 1 PDF' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a este alumno')
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })

    it('si los bounds fallan, avisa y deja «Por meses» accesible para reintentar', async () => {
        actions.getClientReportBounds.mockRejectedValue(new Error('boom'))
        renderDialog()

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'No se pudieron cargar los meses disponibles.'
        )
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'Por meses' })).toBeEnabled()
        )
        expect(screen.queryByText('Cargando meses…')).toBeNull()
    })
})
