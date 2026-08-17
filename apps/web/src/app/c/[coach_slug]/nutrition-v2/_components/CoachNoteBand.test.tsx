import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoachNoteBand } from './CoachNoteBand'

describe('CoachNoteBand', () => {
  it('con nota: pinta la banda con el icono y el texto plano', () => {
    const { container } = render(<CoachNoteBand note="Desayuno alto en proteína, sin azúcar" />)

    expect(screen.getByText('Desayuno alto en proteína, sin azúcar')).toBeInTheDocument()
    expect(container.textContent).toContain('💬')
    // Prefijo accesible para lectores de pantalla (el emoji va aria-hidden).
    expect(container.textContent).toContain('Nota del coach:')
  })

  it('sin nota: cero render (N3 — "sin nota, cero ruido")', () => {
    const { container } = render(<CoachNoteBand note={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('nota solo-whitespace: cero render (dato histórico sin normalizar)', () => {
    const { container } = render(<CoachNoteBand note={'   \n\t '} />)
    expect(container.firstChild).toBeNull()
  })

  it('recorta bordes y conserva los saltos de línea internos', () => {
    render(<CoachNoteBand note={'  Línea 1\nLínea 2  '} />)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.includes('Línea 1\nLínea 2') === true)).toBeInTheDocument()
  })
})
