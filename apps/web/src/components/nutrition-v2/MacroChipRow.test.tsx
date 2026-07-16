import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MacroChipRow } from './index'

describe('MacroChipRow', () => {
  it('renders calories, the three macro pills and the per suffix', () => {
    const { container } = render(
      <MacroChipRow calories={560} proteinG={24} carbsG={30} fatsG={8} per="por 100 g" />,
    )

    expect(screen.getByText('kcal')).toBeInTheDocument()
    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(screen.getByText('por 100 g')).toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text).toContain('560')
    expect(text).toContain('24')
    expect(text).toContain('30')
    expect(text).toContain('8')
  })

  it('hides a pill whose macro is null or undefined', () => {
    render(<MacroChipRow calories={100} proteinG={20} carbsG={null} fatsG={undefined} />)

    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.queryByText('C')).toBeNull()
    expect(screen.queryByText('G')).toBeNull()
  })

  it('hides the calories block when calories is null', () => {
    render(<MacroChipRow proteinG={10} />)

    expect(screen.queryByText('kcal')).toBeNull()
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('keeps integers clean and shows a single decimal otherwise', () => {
    const { container } = render(<MacroChipRow proteinG={3.5} carbsG={4} />)
    const text = container.textContent ?? ''
    expect(text).toContain('3.5')
    expect(text).toContain('4')
    expect(text).not.toContain('4.0')
  })
})
