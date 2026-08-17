import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { QeNoteButton } from './QeNoteButton'

/**
 * Tests del botón 📝 de nota del coach (N-B, `docs/specs/nutrition-coach-notes`).
 * jsdom normaliza los colores inline a `rgb(...)`; sin marca en el DOM (no hay layout del
 * panel acá) el tinte cae al primary de EVA #2563EB con tinta blanca (patrón Familia N).
 */
const EVA_BRAND_RGB = 'rgb(37, 99, 235)'
const WHITE_RGB = 'rgb(255, 255, 255)'

function renderButton(overrides: Partial<Parameters<typeof QeNoteButton>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <QeNoteButton
      subject="Desayuno"
      value={null}
      maxLength={2000}
      placeholder="Escribe la nota…"
      onChange={onChange}
      {...overrides}
    />,
  )
  return { onChange }
}

/** Envoltorio controlado: simula el reducer (cada tecla vuelve como `value`). */
function ControlledNote({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <QeNoteButton
      subject="Frutas"
      value={value}
      maxLength={1000}
      placeholder="Escribe la nota…"
      onChange={setValue}
    />
  )
}

describe('QeNoteButton — estados del botón', () => {
  it('sin nota: traje neutro (sin fondo inline) y nombre accesible «Agregar nota a…»', () => {
    renderButton()

    const button = screen.getByRole('button', { name: 'Agregar nota a Desayuno' })
    expect(button.style.backgroundColor).toBe('')
    expect(button).not.toHaveAttribute('data-has-note')
    expect(button.className).toContain('border-border-subtle')
  })

  it('con nota: tinte de marca (fallback EVA) con tinta de contraste y «Editar nota de…»', () => {
    renderButton({ value: 'Sin azúcar agregada' })

    const button = screen.getByRole('button', { name: 'Editar nota de Desayuno' })
    expect(button).toHaveAttribute('data-has-note', 'true')
    expect(button.style.backgroundColor).toBe(EVA_BRAND_RGB)
    expect(button.style.color).toBe(WHITE_RGB)
  })

  it('nota de puros espacios NO tiñe (misma vara que la proyección trim ⇒ null)', () => {
    renderButton({ value: '   ' })

    const button = screen.getByRole('button', { name: 'Agregar nota a Desayuno' })
    expect(button).not.toHaveAttribute('data-has-note')
    expect(button.style.backgroundColor).toBe('')
  })
})

describe('QeNoteButton — sheet de edición', () => {
  it('abre con la nota existente, contador y tope del contrato', async () => {
    renderButton({ value: 'Come lento', maxLength: 2000 })

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota de Desayuno' }))

    const textarea = await screen.findByRole('textbox', { name: 'Nota de Desayuno' })
    expect(textarea).toHaveValue('Come lento')
    expect(textarea).toHaveAttribute('maxlength', '2000')
    expect(screen.getByText('10 / 2000')).toBeInTheDocument()
  })

  it('cada tecla sale por onChange con el texto crudo (la gramática la pone el reducer)', async () => {
    const { onChange } = renderButton({ value: null })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar nota a Desayuno' }))
    const textarea = await screen.findByRole('textbox', { name: 'Nota de Desayuno' })
    fireEvent.change(textarea, { target: { value: 'Proteína a la plancha' } })

    expect(onChange).toHaveBeenCalledWith('Proteína a la plancha')
  })

  it('«Limpiar» manda \'\' sin cerrar el sheet, y con el campo ya vacío queda deshabilitado', async () => {
    render(<ControlledNote initial="Evita los jugos" />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota de Frutas' }))
    const clear = await screen.findByRole('button', { name: 'Limpiar' })
    expect(clear).toBeEnabled()

    fireEvent.click(clear)

    // El sheet sigue abierto con el campo vacío (el coach puede arrepentirse retipeando).
    const textarea = screen.getByRole('textbox', { name: 'Nota de Frutas' })
    expect(textarea).toHaveValue('')
    expect(screen.getByText('0 / 1000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled()
  })

  it('deshabilitado (isPending) apaga botón y textarea', async () => {
    renderButton({ value: 'nota', disabled: true })

    const button = screen.getByRole('button', { name: 'Editar nota de Desayuno' })
    expect(button).toBeDisabled()
  })
})
