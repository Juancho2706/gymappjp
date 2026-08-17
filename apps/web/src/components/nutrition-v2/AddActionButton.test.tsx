import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ADD_ACTION_DARK_INK,
  ADD_ACTION_DEFAULT_BRAND,
  AddActionButton,
  addActionInk,
} from './index'

/** jsdom normaliza los colores inline a `rgb(...)`; los hex se comparan por su forma normalizada. */
const DARK_INK_RGB = 'rgb(16, 20, 24)'
const WHITE_RGB = 'rgb(255, 255, 255)'

describe('AddActionButton — variantes', () => {
  it('renderiza un <button> real con el label como nombre accesible', () => {
    render(<AddActionButton icon="franja" label="Agregar franja" />)

    const button = screen.getByRole('button', { name: 'Agregar franja' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
    // El «+» es decorativo: no puede aparecer en el nombre accesible.
    expect(button.getAttribute('aria-label')).toBeNull()
  })

  it('marca la variante en el DOM (neutral por defecto, primary y dashed explícitas)', () => {
    const { unmount } = render(<AddActionButton icon="franja" label="Neutral" />)
    expect(screen.getByRole('button', { name: 'Neutral' })).toHaveAttribute('data-variant', 'neutral')
    unmount()

    const primary = render(<AddActionButton icon="dia" label="Primary" variant="primary" />)
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveAttribute('data-variant', 'primary')
    primary.unmount()

    render(<AddActionButton icon="libre" label="Dashed" variant="dashed" />)
    const dashed = screen.getByRole('button', { name: 'Dashed' })
    expect(dashed).toHaveAttribute('data-variant', 'dashed')
    expect(dashed.className).toContain('border-dashed')
  })

  it('primary no lleva borde y neutral/dashed sí', () => {
    const { unmount } = render(<AddActionButton icon="dia" label="Primary" variant="primary" />)
    expect(screen.getByRole('button', { name: 'Primary' }).className).toContain('border-0')
    unmount()

    render(<AddActionButton icon="dia" label="Neutral" />)
    expect(screen.getByRole('button', { name: 'Neutral' }).className).toContain('border-border-subtle')
  })
})

describe('AddActionButton — icon vs stack', () => {
  it('con `icon` monta un solo ícono de 24 px desde /action-icons', () => {
    render(<AddActionButton icon="porciones" label="Agregar porciones" />)

    const images = screen.getByRole('button', { name: 'Agregar porciones' }).querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute('src')).toContain('action-icons/porciones.webp')
    // Medidas explícitas = hueco reservado antes de que cargue el webp (cero layout shift).
    expect(images[0].getAttribute('width')).toBe('24')
    expect(images[0].getAttribute('height')).toBe('24')
    expect(images[0]).toHaveAttribute('alt', '')
  })

  it('con `stack` monta una moneda por URL y ningún ícono de acción', () => {
    render(
      <AddActionButton
        stack={['/food-icons/proteina.webp', '/food-icons/fruta.webp', '/food-icons/grasa.webp']}
        label="Agregar alimento"
      />,
    )

    const images = screen.getByRole('button', { name: 'Agregar alimento' }).querySelectorAll('img')
    expect(images).toHaveLength(3)
    expect(images[0].getAttribute('src')).toContain('food-icons/proteina.webp')
    expect(images[2].getAttribute('src')).toContain('food-icons/grasa.webp')
    // Ninguna de las tres es un ícono de la familia: el stack REEMPLAZA al `icon`.
    for (const image of images) expect(image.getAttribute('src')).not.toContain('action-icons/')
  })

  it('recorta el stack en 3 monedas', () => {
    render(
      <AddActionButton
        stack={['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp']}
        label="Agregar alimento"
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Agregar alimento' }).querySelectorAll('img'),
    ).toHaveLength(3)
  })
})

describe('addActionInk — contraste dinámico', () => {
  it('marca CLARA en primary ⇒ tinta oscura (no negro puro)', () => {
    const ink = addActionInk('#F5D90A', 'primary')
    expect(ink.text).toBe(ADD_ACTION_DARK_INK)
    expect(ink.plus).toBe(ADD_ACTION_DARK_INK)
    expect(ink.text).not.toBe('#000000')
  })

  it('marca OSCURA en primary ⇒ tinta blanca', () => {
    const ink = addActionInk('#1D4ED8', 'primary')
    expect(ink.text).toBe('#ffffff')
    expect(ink.plus).toBe('#ffffff')
  })

  it('sin brandColor cae al primary de EVA (#2563EB) ⇒ tinta blanca', () => {
    expect(ADD_ACTION_DEFAULT_BRAND).toBe('#2563EB')
    expect(addActionInk(undefined, 'primary').text).toBe('#ffffff')
    expect(addActionInk(null, 'primary').text).toBe('#ffffff')
  })

  it('en neutral/dashed el texto va por token y el «+» en el acento de marca', () => {
    const neutral = addActionInk('#F5D90A', 'neutral')
    expect(neutral.text).toBe('var(--color-text-strong)')
    expect(neutral.plus).toBe('#f5d90a')

    const dashed = addActionInk(undefined, 'dashed')
    expect(dashed.plus).toBe(ADD_ACTION_DEFAULT_BRAND)
  })

  it('un hex inválido nunca produce tinta indefinida', () => {
    expect(addActionInk('no-es-un-hex', 'primary').text).toBe('#ffffff')
    expect(addActionInk('#0af', 'neutral').plus).toBe('#00aaff')
  })
})

describe('AddActionButton — contraste aplicado al DOM', () => {
  it('primary con marca clara pinta el fondo de marca y la tinta oscura', () => {
    render(
      <AddActionButton icon="dia" label="Agregar día" variant="primary" brandColor="#F5D90A" />,
    )

    const button = screen.getByRole('button', { name: 'Agregar día' })
    expect(button.style.backgroundColor).toBe('rgb(245, 217, 10)')
    expect(button.style.color).toBe(DARK_INK_RGB)
  })

  it('primary con marca oscura usa tinta blanca', () => {
    render(
      <AddActionButton icon="dia" label="Agregar día" variant="primary" brandColor="#1D4ED8" />,
    )

    const button = screen.getByRole('button', { name: 'Agregar día' })
    expect(button.style.backgroundColor).toBe('rgb(29, 78, 216)')
    expect(button.style.color).toBe(WHITE_RGB)
  })

  it('primary sin brandColor usa el primary de EVA con tinta blanca', () => {
    render(<AddActionButton icon="dia" label="Agregar día" variant="primary" />)

    const button = screen.getByRole('button', { name: 'Agregar día' })
    expect(button.style.backgroundColor).toBe('rgb(37, 99, 235)')
    expect(button.style.color).toBe(WHITE_RGB)
  })

  it('neutral no pinta fondo inline (queda el token del DS) y el «+» toma el acento', () => {
    render(<AddActionButton icon="franja" label="Agregar franja" brandColor="#1D4ED8" />)

    const button = screen.getByRole('button', { name: 'Agregar franja' })
    expect(button.style.backgroundColor).toBe('')

    const plus = Array.from(button.querySelectorAll('span')).find((el) => el.textContent === '+')
    expect(plus).toBeDefined()
    expect(plus?.style.color).toBe('rgb(29, 78, 216)')
  })
})
